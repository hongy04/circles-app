-- Circles Phase 3A — shared-event context and post-event connections
--
-- Confirmed attendance may make two app users discoverable to one another,
-- but it never grants full profile access or creates an automatic connection.
-- Both people must have explicit attendance evidence from a reviewed event.

-- ---------------------------------------------------------------------------
-- Remote control
-- ---------------------------------------------------------------------------

alter table public.app_feature_flags
  drop constraint if exists app_feature_flags_key_check;

alter table public.app_feature_flags
  add constraint app_feature_flags_key_check check (
    flag_key in (
      'launch_invitations',
      'mutual_preview_posts',
      'preconnection_profile_shell',
      'launch_analytics',
      'circle_events',
      'event_availability_polls',
      'multi_circle_events',
      'event_outside_guests',
      'event_guest_web_rsvp',
      'event_photo_gallery',
      'event_history',
      'shared_event_connections'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'shared_event_connections',
  true,
  'Allows confirmed attendees to view shared-event context and send ordinary connection requests after reviewed events.'
)
on conflict (flag_key) do nothing;

-- ---------------------------------------------------------------------------
-- Analytics allowlist
-- ---------------------------------------------------------------------------

alter table public.app_analytics_events
  drop constraint if exists app_analytics_event_name_check;

alter table public.app_analytics_events
  add constraint app_analytics_event_name_check check (
    event_name in (
      'invite_created',
      'invite_share_opened',
      'invite_previewed',
      'invite_redeemed',
      'mutuals_opened',
      'mutual_preview_updated',
      'preconnection_profile_opened',
      'connection_request_sent',
      'connection_request_responded',
      'circle_member_invites_sent',
      'event_created',
      'event_opened',
      'event_rsvp_updated',
      'event_poll_created',
      'event_poll_opened',
      'event_poll_response_updated',
      'event_poll_finalized',
      'event_guest_added',
      'event_guest_response_updated',
      'event_guest_removed',
      'event_guest_settings_updated',
      'event_guest_invite_created',
      'event_guest_invite_opened',
      'event_guest_web_rsvp_updated',
      'event_photo_uploaded',
      'event_photo_removed',
      'event_photo_gallery_opened',
      'event_guest_photo_gallery_opened',
      'event_attendance_review_opened',
      'event_attendance_review_saved',
      'event_connections_opened',
      'event_connection_request_sent'
    )
  );

create or replace function public.record_shared_event_connection_analytics(
  p_event_name text,
  p_action text,
  p_candidate_count integer default null,
  p_shared_event_count integer default null,
  p_viewer_attended boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
begin
  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'launch_analytics';

  if not coalesce(v_enabled, true) then
    return;
  end if;

  if p_event_name not in (
    'event_connections_opened',
    'event_connection_request_sent'
  ) then
    return;
  end if;

  if p_action not in ('open', 'send') then
    return;
  end if;

  begin
    insert into public.app_analytics_events (
      event_name,
      actor_id,
      properties
    )
    values (
      p_event_name,
      auth.uid(),
      jsonb_strip_nulls(jsonb_build_object(
        'surface', 'event_history',
        'action', p_action,
        'candidate_count', case
          when p_candidate_count is null then null
          else greatest(0, least(p_candidate_count, 500))
        end,
        'shared_event_count', case
          when p_shared_event_count is null then null
          else greatest(0, least(p_shared_event_count, 500))
        end,
        'viewer_attended', p_viewer_attended
      ))
    );
  exception
    when others then
      -- Analytics must never block relationship behavior.
      null;
  end;
end;
$$;

revoke all on function public.record_shared_event_connection_analytics(text, text, integer, integer, boolean) from public;

-- ---------------------------------------------------------------------------
-- Private provenance for requests that began from a reviewed event.
-- ---------------------------------------------------------------------------

alter table public.connection_requests
  add column if not exists source_event_id uuid references public.events(id) on delete set null;

create index if not exists connection_requests_source_event_index
  on public.connection_requests (source_event_id, created_at desc)
  where source_event_id is not null;

-- ---------------------------------------------------------------------------
-- Reusable shared-attendance predicate.
-- ---------------------------------------------------------------------------

create or replace function public.users_share_confirmed_event(
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_a is not null
    and p_user_b is not null
    and p_user_a <> p_user_b
    and exists (
      select 1
      from public.event_attendance attendance_a
      join public.event_attendance attendance_b
        on attendance_b.event_id = attendance_a.event_id
       and attendance_b.user_id = p_user_b
       and attendance_b.attended
      join public.events event_row
        on event_row.id = attendance_a.event_id
      where attendance_a.user_id = p_user_a
        and attendance_a.attended
        and event_row.attendance_reviewed_at is not null
        and event_row.status <> 'cancelled'
    );
$$;

revoke all on function public.users_share_confirmed_event(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- Profile visibility now accepts confirmed shared-event context.
-- ---------------------------------------------------------------------------

create or replace function public.get_profile_overview(profile_user_id uuid)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text,
  post_count bigint,
  connection_count bigint,
  relationship_status text,
  request_id uuid,
  can_view_posts boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  pending_request public.connection_requests%rowtype;
  relationship text;
  permitted boolean := false;
  may_view_posts boolean := false;
begin
  if viewer_id is null or profile_user_id is null then
    return;
  end if;

  if viewer_id = profile_user_id then
    relationship := 'self';
    permitted := true;
    may_view_posts := true;
  elsif exists (
    select 1
    from public.connections c
    where c.user_id = viewer_id
      and c.other_user_id = profile_user_id
  ) then
    relationship := 'connected';
    permitted := true;
    may_view_posts := true;
  else
    select r.*
      into pending_request
    from public.connection_requests r
    where r.status = 'pending'
      and (
        (r.from_user = viewer_id and r.to_user = profile_user_id)
        or
        (r.from_user = profile_user_id and r.to_user = viewer_id)
      )
    order by r.created_at desc
    limit 1;

    if found then
      relationship := case
        when pending_request.from_user = viewer_id then 'outgoing'
        else 'incoming'
      end;
      permitted := true;
    elsif exists (
      select 1
      from public.contact_edges e
      where e.from_user = viewer_id
        and e.to_user = profile_user_id
    ) or exists (
      select 1
      from public.connections mine
      join public.connections theirs
        on theirs.user_id = profile_user_id
       and theirs.other_user_id = mine.other_user_id
      where mine.user_id = viewer_id
        and mine.other_user_id <> viewer_id
        and mine.other_user_id <> profile_user_id
    ) or exists (
      select 1
      from public.conversation_members mine_membership
      join public.conversation_members their_membership
        on their_membership.conversation_id = mine_membership.conversation_id
       and their_membership.user_id = profile_user_id
      join public.conversations conversation
        on conversation.id = mine_membership.conversation_id
      where mine_membership.user_id = viewer_id
        and (conversation.kind = 'group' or conversation.circle_enabled)
    ) or public.users_share_confirmed_event(viewer_id, profile_user_id) then
      relationship := 'mutual';
      permitted := true;
    else
      relationship := 'none';
    end if;
  end if;

  if not permitted then
    return;
  end if;

  return query
  select
    u.id,
    u.display_name,
    u.username,
    u.avatar_url,
    u.bio,
    case
      when may_view_posts then (
        select count(*)
        from public.posts p
        where p.user_id = u.id
      )
      else 0
    end as post_count,
    case
      when may_view_posts then (
        select count(*)
        from public.connections c
        where c.user_id = u.id
      )
      else 0
    end as connection_count,
    relationship,
    case when pending_request.id is not null then pending_request.id else null end,
    may_view_posts
  from public.users u
  where u.id = profile_user_id;
end;
$$;

revoke all on function public.get_profile_overview(uuid) from public;
grant execute on function public.get_profile_overview(uuid) to authenticated;

-- Return type gains shared-event context, so recreate the function.
drop function if exists public.get_preconnection_profile_shell(uuid);

create function public.get_preconnection_profile_shell(
  profile_user_id uuid
)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text,
  relationship_status text,
  request_id uuid,
  has_contact_context boolean,
  mutual_connection_count bigint,
  shared_circle_count bigint,
  shared_event_count bigint,
  latest_shared_event_title text,
  latest_shared_event_at timestamptz,
  preview_post_id uuid,
  preview_caption text,
  preview_url text,
  preview_media_type text,
  preview_created_at timestamptz,
  preview_media_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  pending_request public.connection_requests%rowtype;
  relationship text;
  permitted boolean := false;
begin
  if viewer_id is null or profile_user_id is null then
    return;
  end if;

  if viewer_id = profile_user_id or exists (
    select 1
    from public.connections c
    where c.user_id = viewer_id
      and c.other_user_id = profile_user_id
  ) then
    return;
  end if;

  select r.*
    into pending_request
  from public.connection_requests r
  where r.status = 'pending'
    and (
      (r.from_user = viewer_id and r.to_user = profile_user_id)
      or
      (r.from_user = profile_user_id and r.to_user = viewer_id)
    )
  order by r.created_at desc
  limit 1;

  if found then
    relationship := case
      when pending_request.from_user = viewer_id then 'outgoing'
      else 'incoming'
    end;
    permitted := true;
  elsif exists (
    select 1
    from public.contact_edges e
    where e.from_user = viewer_id
      and e.to_user = profile_user_id
  ) or exists (
    select 1
    from public.connections mine
    join public.connections theirs
      on theirs.user_id = profile_user_id
     and theirs.other_user_id = mine.other_user_id
    where mine.user_id = viewer_id
      and mine.other_user_id <> viewer_id
      and mine.other_user_id <> profile_user_id
  ) or exists (
    select 1
    from public.conversation_members mine_membership
    join public.conversation_members their_membership
      on their_membership.conversation_id = mine_membership.conversation_id
     and their_membership.user_id = profile_user_id
    join public.conversations conversation
      on conversation.id = mine_membership.conversation_id
    where mine_membership.user_id = viewer_id
      and (conversation.kind = 'group' or conversation.circle_enabled)
  ) or public.users_share_confirmed_event(viewer_id, profile_user_id) then
    relationship := 'mutual';
    permitted := true;
  end if;

  if not permitted then
    return;
  end if;

  return query
  select
    u.id,
    u.display_name,
    u.username,
    u.avatar_url,
    u.bio,
    relationship,
    case when pending_request.id is not null then pending_request.id else null end,
    exists (
      select 1
      from public.contact_edges e
      where e.from_user = viewer_id
        and e.to_user = profile_user_id
    ) as has_contact_context,
    (
      select count(distinct mine.other_user_id)
      from public.connections mine
      join public.connections theirs
        on theirs.user_id = profile_user_id
       and theirs.other_user_id = mine.other_user_id
      where mine.user_id = viewer_id
        and mine.other_user_id <> viewer_id
        and mine.other_user_id <> profile_user_id
    ) as mutual_connection_count,
    (
      select count(distinct mine_membership.conversation_id)
      from public.conversation_members mine_membership
      join public.conversation_members their_membership
        on their_membership.conversation_id = mine_membership.conversation_id
       and their_membership.user_id = profile_user_id
      join public.conversations conversation
        on conversation.id = mine_membership.conversation_id
      where mine_membership.user_id = viewer_id
        and (conversation.kind = 'group' or conversation.circle_enabled)
    ) as shared_circle_count,
    coalesce(shared_events.shared_event_count, 0)::bigint,
    shared_events.latest_event_title,
    shared_events.latest_event_at,
    p.id as preview_post_id,
    p.caption as preview_caption,
    coalesce(first_media.url, p.image_url) as preview_url,
    case
      when p.id is null then null
      else coalesce(
        first_media.media_type,
        case
          when p.image_url ~* '\.(mp4|mov|m4v)(\?|$)' then 'video'
          else 'image'
        end
      )
    end as preview_media_type,
    p.created_at as preview_created_at,
    case
      when p.id is null then 0
      when coalesce(media_totals.media_count, 0) > 0
        then media_totals.media_count
      when p.image_url is not null then 1
      else 0
    end::integer as preview_media_count
  from public.users u
  left join public.posts p
    on p.id = u.mutual_preview_post_id
   and p.user_id = u.id
  left join lateral (
    select
      media.url,
      media.media_type
    from public.post_media media
    where media.post_id = p.id
    order by media.created_at asc, media.id asc
    limit 1
  ) first_media on true
  left join lateral (
    select count(*)::integer as media_count
    from public.post_media media
    where media.post_id = p.id
  ) media_totals on true
  left join lateral (
    select
      count(distinct attendance_mine.event_id)::bigint as shared_event_count,
      (
        select event_latest.title
        from public.event_attendance latest_mine
        join public.event_attendance latest_theirs
          on latest_theirs.event_id = latest_mine.event_id
         and latest_theirs.user_id = profile_user_id
         and latest_theirs.attended
        join public.events event_latest on event_latest.id = latest_mine.event_id
        where latest_mine.user_id = viewer_id
          and latest_mine.attended
          and event_latest.attendance_reviewed_at is not null
          and event_latest.status <> 'cancelled'
        order by event_latest.starts_at desc, event_latest.id desc
        limit 1
      ) as latest_event_title,
      (
        select event_latest.starts_at
        from public.event_attendance latest_mine
        join public.event_attendance latest_theirs
          on latest_theirs.event_id = latest_mine.event_id
         and latest_theirs.user_id = profile_user_id
         and latest_theirs.attended
        join public.events event_latest on event_latest.id = latest_mine.event_id
        where latest_mine.user_id = viewer_id
          and latest_mine.attended
          and event_latest.attendance_reviewed_at is not null
          and event_latest.status <> 'cancelled'
        order by event_latest.starts_at desc, event_latest.id desc
        limit 1
      ) as latest_event_at
    from public.event_attendance attendance_mine
    join public.event_attendance attendance_theirs
      on attendance_theirs.event_id = attendance_mine.event_id
     and attendance_theirs.user_id = profile_user_id
     and attendance_theirs.attended
    join public.events shared_event
      on shared_event.id = attendance_mine.event_id
     and shared_event.attendance_reviewed_at is not null
     and shared_event.status <> 'cancelled'
    where attendance_mine.user_id = viewer_id
      and attendance_mine.attended
  ) shared_events on true
  where u.id = profile_user_id;
end;
$$;

revoke all on function public.get_preconnection_profile_shell(uuid) from public;
grant execute on function public.get_preconnection_profile_shell(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Post-event attendee list for app users.
-- ---------------------------------------------------------------------------

create or replace function public.get_event_connection_candidates(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_event public.events%rowtype;
  v_viewer_attended boolean := false;
  v_candidates jsonb := '[]'::jsonb;
  v_candidate_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'shared_event_connections';

  if not coalesce(v_enabled, true) then
    raise exception 'Shared-event connections are temporarily unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found or not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.attendance_reviewed_at is null then
    raise exception 'Attendance has not been reviewed for this event';
  end if;

  select exists (
    select 1
    from public.event_attendance attendance_row
    where attendance_row.event_id = p_event_id
      and attendance_row.user_id = auth.uid()
      and attendance_row.attended
  ) into v_viewer_attended;

  with confirmed_members as (
    select distinct attendance_row.user_id
    from public.event_attendance attendance_row
    where attendance_row.event_id = p_event_id
      and attendance_row.user_id is not null
      and attendance_row.user_id <> auth.uid()
      and attendance_row.attended
  ),
  candidate_rows as (
    select
      confirmed.user_id,
      coalesce(user_row.display_name, 'Circle member') as display_name,
      user_row.avatar_url,
      confirmed.user_id = v_event.host_id as is_host,
      case
        when exists (
          select 1
          from public.connections connection_row
          where connection_row.user_id = auth.uid()
            and connection_row.other_user_id = confirmed.user_id
        ) then 'connected'
        when pending_request.from_user = auth.uid() then 'outgoing'
        when pending_request.to_user = auth.uid() then 'incoming'
        when v_viewer_attended then 'available'
        else 'unavailable'
      end as relationship_status,
      pending_request.id as request_id,
      (
        select count(distinct attendance_mine.event_id)::integer
        from public.event_attendance attendance_mine
        join public.event_attendance attendance_theirs
          on attendance_theirs.event_id = attendance_mine.event_id
         and attendance_theirs.user_id = confirmed.user_id
         and attendance_theirs.attended
        join public.events shared_event
          on shared_event.id = attendance_mine.event_id
         and shared_event.attendance_reviewed_at is not null
         and shared_event.status <> 'cancelled'
        where attendance_mine.user_id = auth.uid()
          and attendance_mine.attended
      ) as shared_event_count
    from confirmed_members confirmed
    join public.users user_row on user_row.id = confirmed.user_id
    left join lateral (
      select request_row.*
      from public.connection_requests request_row
      where request_row.status = 'pending'
        and (
          (request_row.from_user = auth.uid() and request_row.to_user = confirmed.user_id)
          or
          (request_row.from_user = confirmed.user_id and request_row.to_user = auth.uid())
        )
      order by request_row.created_at desc
      limit 1
    ) pending_request on true
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', candidate.user_id,
          'display_name', candidate.display_name,
          'avatar_url', candidate.avatar_url,
          'is_host', candidate.is_host,
          'relationship_status', candidate.relationship_status,
          'request_id', candidate.request_id,
          'shared_event_count', candidate.shared_event_count,
          'can_open_profile', (
            v_viewer_attended
            or candidate.relationship_status in ('connected', 'outgoing', 'incoming')
          )
        )
        order by candidate.is_host desc, lower(candidate.display_name), candidate.user_id
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_candidates, v_candidate_count
  from candidate_rows candidate;

  perform public.record_shared_event_connection_analytics(
    'event_connections_opened',
    'open',
    v_candidate_count,
    null,
    v_viewer_attended
  );

  return jsonb_build_object(
    'event', jsonb_build_object(
      'title', v_event.title,
      'starts_at', v_event.starts_at,
      'attendance_reviewed_at', v_event.attendance_reviewed_at
    ),
    'viewer_attended', v_viewer_attended,
    'candidates', v_candidates
  );
end;
$$;

revoke all on function public.get_event_connection_candidates(uuid) from public;
grant execute on function public.get_event_connection_candidates(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- A shared event creates request eligibility, never automatic access.
-- ---------------------------------------------------------------------------

create or replace function public.send_shared_event_connection_request(
  p_event_id uuid,
  p_to_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_request public.connection_requests%rowtype;
  v_shared_event_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_event_id is null or p_to_user_id is null or p_to_user_id = auth.uid() then
    raise exception 'Connection request is invalid';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'shared_event_connections';

  if not coalesce(v_enabled, true) then
    raise exception 'Shared-event connections are temporarily unavailable';
  end if;

  if not exists (
    select 1
    from public.events event_row
    where event_row.id = p_event_id
      and event_row.attendance_reviewed_at is not null
      and event_row.status <> 'cancelled'
  ) then
    raise exception 'This event is not eligible for post-event connections';
  end if;

  if not exists (
    select 1
    from public.event_attendance attendance_row
    where attendance_row.event_id = p_event_id
      and attendance_row.user_id = auth.uid()
      and attendance_row.attended
  ) or not exists (
    select 1
    from public.event_attendance attendance_row
    where attendance_row.event_id = p_event_id
      and attendance_row.user_id = p_to_user_id
      and attendance_row.attended
  ) then
    raise exception 'Both people must be confirmed attendees of this event';
  end if;

  if exists (
    select 1
    from public.connections connection_row
    where connection_row.user_id = auth.uid()
      and connection_row.other_user_id = p_to_user_id
  ) then
    return jsonb_build_object('outcome', 'already_connected');
  end if;

  select request_row.*
  into v_request
  from public.connection_requests request_row
  where request_row.status = 'pending'
    and (
      (request_row.from_user = auth.uid() and request_row.to_user = p_to_user_id)
      or
      (request_row.from_user = p_to_user_id and request_row.to_user = auth.uid())
    )
  order by request_row.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'outcome', 'request_exists',
      'request_id', v_request.id,
      'direction', case
        when v_request.from_user = auth.uid() then 'outgoing'
        else 'incoming'
      end
    );
  end if;

  insert into public.connection_requests (
    from_user,
    to_user,
    status,
    note,
    source_event_id,
    created_at
  )
  values (
    auth.uid(),
    p_to_user_id,
    'pending',
    null,
    p_event_id,
    now()
  )
  returning * into v_request;

  select count(distinct attendance_mine.event_id)::integer
  into v_shared_event_count
  from public.event_attendance attendance_mine
  join public.event_attendance attendance_theirs
    on attendance_theirs.event_id = attendance_mine.event_id
   and attendance_theirs.user_id = p_to_user_id
   and attendance_theirs.attended
  join public.events shared_event
    on shared_event.id = attendance_mine.event_id
   and shared_event.attendance_reviewed_at is not null
   and shared_event.status <> 'cancelled'
  where attendance_mine.user_id = auth.uid()
    and attendance_mine.attended;

  perform public.record_shared_event_connection_analytics(
    'event_connection_request_sent',
    'send',
    null,
    v_shared_event_count,
    true
  );

  return jsonb_build_object(
    'outcome', 'request_created',
    'request_id', v_request.id,
    'direction', 'outgoing'
  );
end;
$$;

revoke all on function public.send_shared_event_connection_request(uuid, uuid) from public;
grant execute on function public.send_shared_event_connection_request(uuid, uuid) to authenticated;

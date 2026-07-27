-- Circles Phase 2G — completed event history and optional host attendance review
--
-- Past events remain visible as shared Circle history. After an event starts,
-- the host may review who actually attended. RSVP data remains separate from
-- attendance evidence: Going is only the default suggestion until the host
-- explicitly saves the review.

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
      'event_history'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'event_history',
  true,
  'Shows completed event history and allows optional host attendance review.'
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
      'event_attendance_review_saved'
    )
  );

create or replace function public.record_event_history_analytics(
  p_event_name text,
  p_action text,
  p_attended_count integer default null,
  p_member_count integer default null,
  p_guest_count integer default null
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
    'event_attendance_review_opened',
    'event_attendance_review_saved'
  ) then
    return;
  end if;

  if p_action not in ('open', 'save') then
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
        'surface', 'event_attendance_review',
        'action', p_action,
        'attended_count', case
          when p_attended_count is null then null
          else greatest(0, least(p_attended_count, 500))
        end,
        'member_count', case
          when p_member_count is null then null
          else greatest(0, least(p_member_count, 500))
        end,
        'guest_count', case
          when p_guest_count is null then null
          else greatest(0, least(p_guest_count, 500))
        end
      ))
    );
  exception
    when others then
      -- Analytics must never block event history behavior.
      null;
  end;
end;
$$;

revoke all on function public.record_event_history_analytics(text, text, integer, integer, integer) from public;

-- ---------------------------------------------------------------------------
-- Attendance evidence
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists completed_at timestamptz;

alter table public.events
  add column if not exists attendance_reviewed_at timestamptz;

create table if not exists public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  guest_id uuid references public.event_guests(id) on delete cascade,
  attended boolean not null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  constraint event_attendance_identity_check check (
    (user_id is not null and guest_id is null)
    or (user_id is null and guest_id is not null)
  )
);

create unique index if not exists event_attendance_member_unique
  on public.event_attendance (event_id, user_id)
  where user_id is not null;

create unique index if not exists event_attendance_guest_unique
  on public.event_attendance (event_id, guest_id)
  where guest_id is not null;

create index if not exists event_attendance_event_index
  on public.event_attendance (event_id, attended, reviewed_at desc);

alter table public.event_attendance enable row level security;

-- No direct policies are exposed. Event membership and host authority are
-- enforced by the RPCs below.

-- ---------------------------------------------------------------------------
-- Event list now exposes completed-history metadata.
-- ---------------------------------------------------------------------------

drop function if exists public.list_circle_events(uuid);

create function public.list_circle_events(p_conversation_id uuid)
returns table (
  event_id uuid,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  location_name text,
  event_status text,
  host_id uuid,
  host_name text,
  host_avatar text,
  viewer_rsvp_status text,
  attendee_count integer,
  going_count integer,
  maybe_count integer,
  not_going_count integer,
  pending_count integer,
  circle_count integer,
  attendance_reviewed_at timestamptz,
  completed_at timestamptz,
  attended_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.conversations conversation_row
    join public.conversation_members member_row
      on member_row.conversation_id = conversation_row.id
     and member_row.user_id = auth.uid()
    where conversation_row.id = p_conversation_id
      and conversation_row.kind = 'group'
  ) then
    raise exception 'Circle not found or unavailable';
  end if;

  return query
  with linked_events as (
    select distinct event_circle.event_id
    from public.event_circles event_circle
    where event_circle.conversation_id = p_conversation_id
  ),
  eligible_members as (
    select distinct
      event_circle.event_id,
      member_row.user_id
    from public.event_circles event_circle
    join public.conversation_members member_row
      on member_row.conversation_id = event_circle.conversation_id
    join linked_events linked on linked.event_id = event_circle.event_id
  ),
  response_counts as (
    select
      eligible.event_id,
      count(*)::integer as attendee_count,
      count(*) filter (where rsvp.status = 'going')::integer as going_count,
      count(*) filter (where rsvp.status = 'maybe')::integer as maybe_count,
      count(*) filter (where rsvp.status = 'not_going')::integer as not_going_count,
      count(*) filter (where rsvp.status is null)::integer as pending_count
    from eligible_members eligible
    left join public.event_rsvps rsvp
      on rsvp.event_id = eligible.event_id
     and rsvp.user_id = eligible.user_id
    group by eligible.event_id
  ),
  circle_counts as (
    select
      event_circle.event_id,
      count(*)::integer as circle_count
    from public.event_circles event_circle
    join linked_events linked on linked.event_id = event_circle.event_id
    group by event_circle.event_id
  ),
  attendance_counts as (
    select
      attendance_row.event_id,
      count(*) filter (where attendance_row.attended)::integer as attended_count
    from public.event_attendance attendance_row
    join linked_events linked on linked.event_id = attendance_row.event_id
    group by attendance_row.event_id
  )
  select
    event_row.id,
    event_row.title,
    event_row.description,
    event_row.starts_at,
    event_row.ends_at,
    event_row.location_name,
    event_row.status,
    host_user.id,
    coalesce(host_user.display_name, 'Circle member'),
    host_user.avatar_url,
    coalesce(viewer_rsvp.status, 'pending'),
    coalesce(counts.attendee_count, 0),
    coalesce(counts.going_count, 0),
    coalesce(counts.maybe_count, 0),
    coalesce(counts.not_going_count, 0),
    coalesce(counts.pending_count, 0),
    coalesce(circle_totals.circle_count, 1),
    event_row.attendance_reviewed_at,
    event_row.completed_at,
    coalesce(attendance_totals.attended_count, 0)
  from linked_events linked
  join public.events event_row on event_row.id = linked.event_id
  left join public.users host_user on host_user.id = event_row.host_id
  left join public.event_rsvps viewer_rsvp
    on viewer_rsvp.event_id = event_row.id
   and viewer_rsvp.user_id = auth.uid()
  left join response_counts counts on counts.event_id = event_row.id
  left join circle_counts circle_totals on circle_totals.event_id = event_row.id
  left join attendance_counts attendance_totals on attendance_totals.event_id = event_row.id
  order by
    case
      when event_row.status <> 'completed' and event_row.starts_at >= now() then 0
      else 1
    end,
    case
      when event_row.status <> 'completed' and event_row.starts_at >= now()
        then event_row.starts_at
    end asc,
    case
      when event_row.status = 'completed' or event_row.starts_at < now()
        then event_row.starts_at
    end desc;
end;
$$;

revoke all on function public.list_circle_events(uuid) from public;
grant execute on function public.list_circle_events(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Read-only attendance summary for invited Circle members.
-- ---------------------------------------------------------------------------

create or replace function public.get_event_attendance_summary(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_attended_count integer := 0;
  v_member_attendance jsonb := '[]'::jsonb;
  v_guest_attendance jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found then
    raise exception 'Event not found or unavailable';
  end if;

  select count(*) filter (where attendance_row.attended)::integer
  into v_attended_count
  from public.event_attendance attendance_row
  where attendance_row.event_id = p_event_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', attendance_row.user_id,
        'attended', attendance_row.attended
      )
      order by attendance_row.user_id
    ),
    '[]'::jsonb
  )
  into v_member_attendance
  from public.event_attendance attendance_row
  where attendance_row.event_id = p_event_id
    and attendance_row.user_id is not null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'guest_id', attendance_row.guest_id,
        'attended', attendance_row.attended
      )
      order by attendance_row.guest_id
    ),
    '[]'::jsonb
  )
  into v_guest_attendance
  from public.event_attendance attendance_row
  where attendance_row.event_id = p_event_id
    and attendance_row.guest_id is not null;

  return jsonb_build_object(
    'status', v_event.status,
    'starts_at', v_event.starts_at,
    'is_past', v_event.starts_at <= now(),
    'attendance_reviewed_at', v_event.attendance_reviewed_at,
    'completed_at', v_event.completed_at,
    'attended_count', coalesce(v_attended_count, 0),
    'member_attendance', v_member_attendance,
    'guest_attendance', v_guest_attendance
  );
end;
$$;

revoke all on function public.get_event_attendance_summary(uuid) from public;
grant execute on function public.get_event_attendance_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Host review screen data. Going is only the initial suggestion.
-- ---------------------------------------------------------------------------

create or replace function public.get_event_attendance_review(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_event public.events%rowtype;
  v_members jsonb := '[]'::jsonb;
  v_guests jsonb := '[]'::jsonb;
  v_member_count integer := 0;
  v_guest_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'event_history';

  if not coalesce(v_enabled, true) then
    raise exception 'Event history is temporarily unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found or not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.host_id <> auth.uid() then
    raise exception 'Only the event host can review attendance';
  end if;

  if v_event.status = 'cancelled' then
    raise exception 'Cancelled events cannot be reviewed';
  end if;

  if v_event.starts_at > now() then
    raise exception 'Attendance can be reviewed after the event starts';
  end if;

  with eligible_users as (
    select distinct member_row.user_id
    from public.event_circles event_circle
    join public.conversation_members member_row
      on member_row.conversation_id = event_circle.conversation_id
    where event_circle.event_id = p_event_id
  ),
  member_rows as (
    select
      eligible.user_id,
      coalesce(user_row.display_name, 'Circle member') as display_name,
      user_row.avatar_url,
      coalesce(rsvp.status, 'pending') as rsvp_status,
      eligible.user_id = v_event.host_id as is_host,
      coalesce(attendance_row.attended, rsvp.status = 'going', false) as attended,
      attendance_row.id is not null as was_reviewed
    from eligible_users eligible
    join public.users user_row on user_row.id = eligible.user_id
    left join public.event_rsvps rsvp
      on rsvp.event_id = p_event_id
     and rsvp.user_id = eligible.user_id
    left join public.event_attendance attendance_row
      on attendance_row.event_id = p_event_id
     and attendance_row.user_id = eligible.user_id
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', member_row.user_id,
          'display_name', member_row.display_name,
          'avatar_url', member_row.avatar_url,
          'rsvp_status', member_row.rsvp_status,
          'is_host', member_row.is_host,
          'attended', member_row.attended,
          'was_reviewed', member_row.was_reviewed
        )
        order by member_row.is_host desc, lower(member_row.display_name), member_row.user_id
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_members, v_member_count
  from member_rows member_row;

  with guest_rows as (
    select
      guest_row.id,
      guest_row.display_name,
      guest_row.guest_type,
      guest_row.status,
      coalesce(inviter.display_name, 'Circle member') as invited_by_name,
      coalesce(attendance_row.attended, guest_row.status = 'going', false) as attended,
      attendance_row.id is not null as was_reviewed
    from public.event_guests guest_row
    left join public.users inviter on inviter.id = guest_row.invited_by_user_id
    left join public.event_attendance attendance_row
      on attendance_row.event_id = p_event_id
     and attendance_row.guest_id = guest_row.id
    where guest_row.event_id = p_event_id
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'guest_id', guest_row.id,
          'display_name', guest_row.display_name,
          'guest_type', guest_row.guest_type,
          'status', guest_row.status,
          'invited_by_name', guest_row.invited_by_name,
          'attended', guest_row.attended,
          'was_reviewed', guest_row.was_reviewed
        )
        order by lower(guest_row.display_name), guest_row.id
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_guests, v_guest_count
  from guest_rows guest_row;

  perform public.record_event_history_analytics(
    'event_attendance_review_opened',
    'open',
    null,
    v_member_count,
    v_guest_count
  );

  return jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_event.id,
      'title', v_event.title,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at,
      'status', v_event.status,
      'attendance_reviewed_at', v_event.attendance_reviewed_at,
      'completed_at', v_event.completed_at
    ),
    'members', v_members,
    'guests', v_guests
  );
end;
$$;

revoke all on function public.get_event_attendance_review(uuid) from public;
grant execute on function public.get_event_attendance_review(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Saving creates explicit attendance evidence and marks the event completed.
-- The host may reopen and correct the review later.
-- ---------------------------------------------------------------------------

create or replace function public.save_event_attendance_review(
  p_event_id uuid,
  p_attended_user_ids uuid[] default '{}'::uuid[],
  p_attended_guest_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_event public.events%rowtype;
  v_member_ids uuid[] := coalesce(p_attended_user_ids, '{}'::uuid[]);
  v_guest_ids uuid[] := coalesce(p_attended_guest_ids, '{}'::uuid[]);
  v_member_count integer := 0;
  v_guest_count integer := 0;
  v_attended_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'event_history';

  if not coalesce(v_enabled, true) then
    raise exception 'Event history is temporarily unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id
  for update;

  if not found or not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.host_id <> auth.uid() then
    raise exception 'Only the event host can review attendance';
  end if;

  if v_event.status = 'cancelled' then
    raise exception 'Cancelled events cannot be reviewed';
  end if;

  if v_event.starts_at > now() then
    raise exception 'Attendance can be reviewed after the event starts';
  end if;

  if exists (
    select 1
    from unnest(v_member_ids) as selected(user_id)
    where not exists (
      select 1
      from public.event_circles event_circle
      join public.conversation_members member_row
        on member_row.conversation_id = event_circle.conversation_id
       and member_row.user_id = selected.user_id
      where event_circle.event_id = p_event_id
    )
  ) then
    raise exception 'One or more selected Circle members are not part of this event';
  end if;

  if exists (
    select 1
    from unnest(v_guest_ids) as selected(guest_id)
    where not exists (
      select 1
      from public.event_guests guest_row
      where guest_row.event_id = p_event_id
        and guest_row.id = selected.guest_id
    )
  ) then
    raise exception 'One or more selected guests are not part of this event';
  end if;

  delete from public.event_attendance
  where event_id = p_event_id;

  with eligible_users as (
    select distinct member_row.user_id
    from public.event_circles event_circle
    join public.conversation_members member_row
      on member_row.conversation_id = event_circle.conversation_id
    where event_circle.event_id = p_event_id
  )
  insert into public.event_attendance (
    event_id,
    user_id,
    attended,
    reviewed_by,
    reviewed_at
  )
  select
    p_event_id,
    eligible.user_id,
    eligible.user_id = any(v_member_ids),
    auth.uid(),
    now()
  from eligible_users eligible;

  insert into public.event_attendance (
    event_id,
    guest_id,
    attended,
    reviewed_by,
    reviewed_at
  )
  select
    p_event_id,
    guest_row.id,
    guest_row.id = any(v_guest_ids),
    auth.uid(),
    now()
  from public.event_guests guest_row
  where guest_row.event_id = p_event_id;

  update public.events
  set
    status = 'completed',
    completed_at = coalesce(completed_at, now()),
    attendance_reviewed_at = now(),
    updated_at = now()
  where id = p_event_id;

  select
    count(*) filter (where attendance_row.user_id is not null)::integer,
    count(*) filter (where attendance_row.guest_id is not null)::integer,
    count(*) filter (where attendance_row.attended)::integer
  into v_member_count, v_guest_count, v_attended_count
  from public.event_attendance attendance_row
  where attendance_row.event_id = p_event_id;

  perform public.record_event_history_analytics(
    'event_attendance_review_saved',
    'save',
    v_attended_count,
    v_member_count,
    v_guest_count
  );

  return jsonb_build_object(
    'status', 'completed',
    'attendance_reviewed_at', now(),
    'attended_count', v_attended_count,
    'member_count', v_member_count,
    'guest_count', v_guest_count
  );
end;
$$;

revoke all on function public.save_event_attendance_review(uuid, uuid[], uuid[]) from public;
grant execute on function public.save_event_attendance_review(uuid, uuid[], uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Confirmed attendance also permits post-event photo contribution.
-- ---------------------------------------------------------------------------

create or replace function public.prepare_event_photo_upload(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_enabled boolean := true;
  v_event public.events%rowtype;
  v_photo_id uuid := gen_random_uuid();
  v_object_id uuid := gen_random_uuid();
  v_storage_path text;
  v_photo_count integer := 0;
  v_can_upload boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'event_photo_gallery';

  if not coalesce(v_enabled, true) then
    raise exception 'Event photos are temporarily unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found or not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.status = 'cancelled' then
    raise exception 'Photos cannot be added to a cancelled event';
  end if;

  v_can_upload := v_event.host_id = auth.uid()
    or exists (
      select 1
      from public.event_rsvps rsvp_row
      where rsvp_row.event_id = p_event_id
        and rsvp_row.user_id = auth.uid()
        and rsvp_row.status = 'going'
    )
    or exists (
      select 1
      from public.event_attendance attendance_row
      where attendance_row.event_id = p_event_id
        and attendance_row.user_id = auth.uid()
        and attendance_row.attended
    );

  if not v_can_upload then
    raise exception 'Only the host, someone marked Going, or a confirmed attendee can add event photos';
  end if;

  delete from public.event_photos photo_row
  where photo_row.status = 'pending'
    and photo_row.created_at < now() - interval '24 hours';

  select count(*)::integer
  into v_photo_count
  from public.event_photos photo_row
  where photo_row.event_id = p_event_id;

  if v_photo_count >= 500 then
    raise exception 'This event has reached the photo limit';
  end if;

  v_storage_path := 'gallery/' || v_object_id::text || '.jpg';

  insert into public.event_photos (
    id,
    event_id,
    uploaded_by,
    storage_path,
    status
  )
  values (
    v_photo_id,
    p_event_id,
    auth.uid(),
    v_storage_path,
    'pending'
  );

  return jsonb_build_object(
    'photo_id', v_photo_id,
    'storage_path', v_storage_path
  );
end;
$$;

revoke all on function public.prepare_event_photo_upload(uuid) from public;
grant execute on function public.prepare_event_photo_upload(uuid) to authenticated;

create or replace function public.list_event_photos(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_can_upload boolean := false;
  v_photos jsonb := '[]'::jsonb;
  v_photo_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.app_feature_flags flag_row
    where flag_row.flag_key = 'event_photo_gallery'
      and flag_row.enabled
  ) then
    raise exception 'Event photos are temporarily unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found or not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  v_can_upload := v_event.status <> 'cancelled' and (
    v_event.host_id = auth.uid()
    or exists (
      select 1
      from public.event_rsvps rsvp_row
      where rsvp_row.event_id = p_event_id
        and rsvp_row.user_id = auth.uid()
        and rsvp_row.status = 'going'
    )
    or exists (
      select 1
      from public.event_attendance attendance_row
      where attendance_row.event_id = p_event_id
        and attendance_row.user_id = auth.uid()
        and attendance_row.attended
    )
  );

  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'photo_id', photo_row.id,
          'storage_path', photo_row.storage_path,
          'width', photo_row.width,
          'height', photo_row.height,
          'created_at', photo_row.ready_at,
          'uploader_name', coalesce(uploader_row.display_name, 'Circle member'),
          'uploader_avatar', uploader_row.avatar_url,
          'can_delete', (
            photo_row.uploaded_by = auth.uid()
            or v_event.host_id = auth.uid()
          )
        )
        order by photo_row.ready_at desc, photo_row.id desc
      ),
      '[]'::jsonb
    )
  into v_photo_count, v_photos
  from public.event_photos photo_row
  left join public.users uploader_row on uploader_row.id = photo_row.uploaded_by
  where photo_row.event_id = p_event_id
    and photo_row.status = 'ready';

  perform public.record_event_photo_analytics(
    'event_photo_gallery_opened',
    'event_photo_gallery',
    'open',
    v_photo_count
  );

  return jsonb_build_object(
    'can_upload', v_can_upload,
    'photo_count', coalesce(v_photo_count, 0),
    'photos', v_photos
  );
end;
$$;

revoke all on function public.list_event_photos(uuid) from public;
grant execute on function public.list_event_photos(uuid) to authenticated;

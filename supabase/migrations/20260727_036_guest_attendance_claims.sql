-- Circles Phase 3B — guest attendance claims after joining
--
-- Lets a former outside guest link one reviewed guest-attendance record to a
-- Circles account using the same private invitation token. Claiming preserves
-- the original guest/inviter history, grants only shared-event context, and
-- never creates a connection or Circle membership automatically.

-- ---------------------------------------------------------------------------
-- Remote control and privacy-safe analytics
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
      'shared_event_connections',
      'guest_attendance_claims'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'guest_attendance_claims',
  true,
  'Allows a former outside guest to link reviewed attendance to one Circles account using their private event invitation.'
)
on conflict (flag_key) do nothing;

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
      'event_connection_request_sent',
      'event_guest_account_claimed'
    )
  );

create or replace function public.record_guest_attendance_claim_analytics(
  p_action text,
  p_was_already_claimed boolean default false
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

  if p_action not in ('claim', 'open') then
    return;
  end if;

  begin
    insert into public.app_analytics_events (
      event_name,
      actor_id,
      properties
    )
    values (
      'event_guest_account_claimed',
      auth.uid(),
      jsonb_build_object(
        'surface', 'event_guest_invitation',
        'action', p_action,
        'already_claimed', coalesce(p_was_already_claimed, false)
      )
    );
  exception
    when others then
      -- Analytics must never block account claiming.
      null;
  end;
end;
$$;

revoke all on function public.record_guest_attendance_claim_analytics(text, boolean) from public;

-- ---------------------------------------------------------------------------
-- One guest identity may be linked to one account per event.
-- ---------------------------------------------------------------------------

alter table public.event_guests
  add column if not exists claimed_user_id uuid references public.users(id) on delete set null,
  add column if not exists claimed_account_at timestamptz;

create unique index if not exists event_guests_event_claimed_user_unique
  on public.event_guests (event_id, claimed_user_id)
  where claimed_user_id is not null;

create index if not exists event_guests_claimed_user_index
  on public.event_guests (claimed_user_id, claimed_account_at desc)
  where claimed_user_id is not null;

-- Canonical app-user attendance. A reviewed member row is already app-linked;
-- a reviewed guest row becomes app-linked only after that guest claims it.
create or replace view public.confirmed_event_users as
select distinct source.event_id, source.user_id
from (
  select attendance_row.event_id, attendance_row.user_id
  from public.event_attendance attendance_row
  where attendance_row.attended
    and attendance_row.user_id is not null

  union

  select attendance_row.event_id, guest_row.claimed_user_id
  from public.event_attendance attendance_row
  join public.event_guests guest_row
    on guest_row.id = attendance_row.guest_id
   and guest_row.event_id = attendance_row.event_id
  where attendance_row.attended
    and attendance_row.guest_id is not null
    and guest_row.claimed_user_id is not null
) source
where source.user_id is not null;

revoke all on public.confirmed_event_users from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Resolve current claimable and legacy guest links without exposing IDs.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_event_guest_token(p_token text)
returns table (
  event_id uuid,
  guest_id uuid,
  guest_type text,
  invited_by_user_id uuid,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_clean_token text := lower(btrim(coalesce(p_token, '')));
  v_token_hash text;
begin
  if v_clean_token !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  v_token_hash := encode(digest(v_clean_token, 'sha256'), 'hex');

  return query
  select
    invitation_row.event_id,
    invitation_row.claimed_guest_id,
    invitation_row.guest_type,
    invitation_row.invited_by_user_id,
    invitation_row.expires_at
  from public.event_guest_invitations invitation_row
  where invitation_row.token_hash = v_token_hash
    and invitation_row.revoked_at is null
    and invitation_row.expires_at > now()
  limit 1;

  if found then
    return;
  end if;

  return query
  select
    guest_row.event_id,
    guest_row.id,
    guest_row.guest_type,
    guest_row.invited_by_user_id,
    guest_row.invite_expires_at
  from public.event_guests guest_row
  where guest_row.invite_token_hash = v_token_hash
    and guest_row.invite_revoked_at is null
    and guest_row.invite_expires_at is not null
    and guest_row.invite_expires_at > now()
  limit 1;
end;
$$;

revoke all on function public.resolve_event_guest_token(text) from public;

-- Public, display-safe status used by the invitation page. No event, guest,
-- user, Circle, or invitation IDs are returned.
create or replace function public.preview_event_guest_account_claim(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_resolved record;
  v_event public.events%rowtype;
  v_guest public.event_guests%rowtype;
  v_host_name text;
  v_host_avatar text;
  v_inviter_name text;
  v_claim_state text := 'rsvp_required';
  v_guest_attended boolean := false;
begin
  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'guest_attendance_claims';

  if not coalesce(v_enabled, true) then
    return jsonb_build_object('valid', false, 'reason', 'disabled');
  end if;

  select *
  into v_resolved
  from public.resolve_event_guest_token(p_token)
  limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = v_resolved.event_id;

  if not found or v_event.status = 'cancelled' then
    return jsonb_build_object('valid', false, 'reason', 'event_unavailable');
  end if;

  if v_resolved.guest_id is not null then
    select guest_row.*
    into v_guest
    from public.event_guests guest_row
    where guest_row.id = v_resolved.guest_id
      and guest_row.event_id = v_resolved.event_id;
  end if;

  if v_guest.id is null then
    v_claim_state := 'rsvp_required';
  elsif v_guest.claimed_user_id is not null then
    v_claim_state := 'already_claimed';
  elsif v_event.attendance_reviewed_at is null then
    v_claim_state := 'attendance_pending';
  else
    select coalesce(attendance_row.attended, false)
    into v_guest_attended
    from public.event_attendance attendance_row
    where attendance_row.event_id = v_event.id
      and attendance_row.guest_id = v_guest.id;

    if coalesce(v_guest_attended, false) then
      v_claim_state := 'available';
    else
      v_claim_state := 'not_attended';
    end if;
  end if;

  select
    coalesce(user_row.display_name, 'Event host'),
    user_row.avatar_url
  into v_host_name, v_host_avatar
  from public.users user_row
  where user_row.id = v_event.host_id;

  select coalesce(user_row.display_name, 'A Circle member')
  into v_inviter_name
  from public.users user_row
  where user_row.id = v_resolved.invited_by_user_id;

  return jsonb_build_object(
    'valid', true,
    'event', jsonb_build_object(
      'title', v_event.title,
      'description', v_event.description,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at,
      'location_name', v_event.location_name,
      'host_name', coalesce(v_host_name, 'Event host'),
      'host_avatar', v_host_avatar,
      'status', v_event.status,
      'attendance_reviewed', v_event.attendance_reviewed_at is not null
    ),
    'guest', jsonb_build_object(
      'display_name', coalesce(v_guest.display_name, ''),
      'guest_type', coalesce(v_guest.guest_type, v_resolved.guest_type, 'guest'),
      'status', coalesce(v_guest.status, 'invited'),
      'claimed', v_guest.id is not null,
      'account_claimed', v_guest.claimed_user_id is not null
    ),
    'invitation', jsonb_build_object(
      'invited_by_name', coalesce(v_inviter_name, 'A Circle member'),
      'expires_at', v_resolved.expires_at,
      'claim_required', v_guest.id is null
    ),
    'account_claim', jsonb_build_object(
      'state', v_claim_state,
      'available', v_claim_state = 'available'
    ),
    'rsvp_locked', v_event.status = 'completed'
  );
end;
$$;

revoke all on function public.preview_event_guest_account_claim(text) from public;
grant execute on function public.preview_event_guest_account_claim(text) to anon, authenticated;

create or replace function public.claim_event_guest_attendance(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_resolved record;
  v_event public.events%rowtype;
  v_guest public.event_guests%rowtype;
  v_attended boolean := false;
  v_already_claimed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'guest_attendance_claims';

  if not coalesce(v_enabled, true) then
    raise exception 'Guest attendance claiming is temporarily unavailable';
  end if;

  select *
  into v_resolved
  from public.resolve_event_guest_token(p_token)
  limit 1;

  if not found then
    raise exception 'Invitation not found or unavailable';
  end if;

  if v_resolved.guest_id is null then
    raise exception 'Submit your name and RSVP before joining Circles';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = v_resolved.event_id;

  if not found or v_event.status = 'cancelled' then
    raise exception 'This event is unavailable';
  end if;

  if v_event.attendance_reviewed_at is null then
    raise exception 'The host has not reviewed attendance yet';
  end if;

  select guest_row.*
  into v_guest
  from public.event_guests guest_row
  where guest_row.id = v_resolved.guest_id
    and guest_row.event_id = v_resolved.event_id
  for update;

  if not found then
    raise exception 'Guest attendance could not be found';
  end if;

  select coalesce(attendance_row.attended, false)
  into v_attended
  from public.event_attendance attendance_row
  where attendance_row.event_id = v_event.id
    and attendance_row.guest_id = v_guest.id;

  if not coalesce(v_attended, false) then
    raise exception 'Only a guest confirmed as attended can claim this event';
  end if;

  if v_guest.claimed_user_id is not null then
    if v_guest.claimed_user_id <> auth.uid() then
      raise exception 'This guest attendance is already linked to another account';
    end if;
    v_already_claimed := true;
  else
    if exists (
      select 1
      from public.event_attendance member_attendance
      where member_attendance.event_id = v_event.id
        and member_attendance.user_id = auth.uid()
    ) then
      raise exception 'This account already has member attendance for this event';
    end if;

    if exists (
      select 1
      from public.event_guests other_guest
      where other_guest.event_id = v_event.id
        and other_guest.claimed_user_id = auth.uid()
        and other_guest.id <> v_guest.id
    ) then
      raise exception 'This account already claimed another guest identity for this event';
    end if;

    update public.event_guests
    set
      claimed_user_id = auth.uid(),
      claimed_account_at = now(),
      updated_at = now()
    where id = v_guest.id;
  end if;

  perform public.record_guest_attendance_claim_analytics(
    'claim',
    v_already_claimed
  );

  return jsonb_build_object(
    'outcome', case when v_already_claimed then 'already_claimed' else 'claimed' end,
    'event_id', v_event.id,
    'event_title', v_event.title,
    'starts_at', v_event.starts_at,
    'attendance_reviewed_at', v_event.attendance_reviewed_at
  );
end;
$$;

revoke all on function public.claim_event_guest_attendance(text) from public;
grant execute on function public.claim_event_guest_attendance(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Guest links remain useful after completion. Before review they show Going;
-- afterward they show the host-confirmed attendance list.
-- ---------------------------------------------------------------------------

create or replace function public.list_event_guest_attendees(
  p_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_resolved record;
  v_event public.events%rowtype;
  v_count integer := 0;
  v_attendees jsonb := '[]'::jsonb;
begin
  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'event_guest_web_rsvp';

  if not coalesce(v_enabled, true) then
    return jsonb_build_object(
      'valid', false,
      'reason', 'disabled',
      'visible', false,
      'going_count', 0,
      'attendees', '[]'::jsonb
    );
  end if;

  select *
  into v_resolved
  from public.resolve_event_guest_token(p_token)
  limit 1;

  if not found then
    return jsonb_build_object(
      'valid', false,
      'reason', 'not_found',
      'visible', false,
      'going_count', 0,
      'attendees', '[]'::jsonb
    );
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = v_resolved.event_id;

  if not found or v_event.status = 'cancelled' then
    return jsonb_build_object(
      'valid', false,
      'reason', 'event_unavailable',
      'visible', false,
      'going_count', 0,
      'attendees', '[]'::jsonb
    );
  end if;

  if v_event.attendance_reviewed_at is not null then
    select count(*)::integer
    into v_count
    from public.event_attendance attendance_row
    where attendance_row.event_id = v_event.id
      and attendance_row.attended;

    if coalesce(v_event.show_attendee_list_to_guests, true) then
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'display_name', attendee_row.display_name,
            'avatar_url', attendee_row.avatar_url,
            'attendee_type', attendee_row.attendee_type,
            'guest_type', attendee_row.guest_type,
            'is_host', attendee_row.is_host,
            'invited_by_name', attendee_row.invited_by_name
          )
          order by attendee_row.is_host desc, attendee_row.sort_group, lower(attendee_row.display_name)
        ),
        '[]'::jsonb
      )
      into v_attendees
      from (
        select
          coalesce(user_row.display_name, 'Circle member') as display_name,
          user_row.avatar_url,
          'member'::text as attendee_type,
          null::text as guest_type,
          attendance_row.user_id = v_event.host_id as is_host,
          null::text as invited_by_name,
          0 as sort_group
        from public.event_attendance attendance_row
        join public.users user_row on user_row.id = attendance_row.user_id
        where attendance_row.event_id = v_event.id
          and attendance_row.user_id is not null
          and attendance_row.attended

        union all

        select
          coalesce(claimed_user.display_name, guest_row.display_name) as display_name,
          claimed_user.avatar_url,
          'guest'::text as attendee_type,
          guest_row.guest_type,
          false as is_host,
          coalesce(inviter_row.display_name, 'A Circle member') as invited_by_name,
          1 as sort_group
        from public.event_attendance attendance_row
        join public.event_guests guest_row on guest_row.id = attendance_row.guest_id
        left join public.users inviter_row on inviter_row.id = guest_row.invited_by_user_id
        left join public.users claimed_user on claimed_user.id = guest_row.claimed_user_id
        where attendance_row.event_id = v_event.id
          and attendance_row.guest_id is not null
          and attendance_row.attended
      ) attendee_row;
    end if;
  else
    select (
      (select count(*) from public.event_rsvps rsvp_row
        where rsvp_row.event_id = v_event.id
          and rsvp_row.status = 'going')
      +
      (select count(*) from public.event_guests guest_row
        where guest_row.event_id = v_event.id
          and guest_row.status = 'going')
    )::integer
    into v_count;

    if coalesce(v_event.show_attendee_list_to_guests, true) then
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'display_name', attendee_row.display_name,
            'avatar_url', attendee_row.avatar_url,
            'attendee_type', attendee_row.attendee_type,
            'guest_type', attendee_row.guest_type,
            'is_host', attendee_row.is_host,
            'invited_by_name', attendee_row.invited_by_name
          )
          order by attendee_row.is_host desc, attendee_row.sort_group, lower(attendee_row.display_name)
        ),
        '[]'::jsonb
      )
      into v_attendees
      from (
        select
          coalesce(user_row.display_name, 'Circle member') as display_name,
          user_row.avatar_url,
          'member'::text as attendee_type,
          null::text as guest_type,
          rsvp_row.user_id = v_event.host_id as is_host,
          null::text as invited_by_name,
          0 as sort_group
        from public.event_rsvps rsvp_row
        join public.users user_row on user_row.id = rsvp_row.user_id
        where rsvp_row.event_id = v_event.id
          and rsvp_row.status = 'going'

        union all

        select
          coalesce(claimed_user.display_name, guest_row.display_name) as display_name,
          claimed_user.avatar_url,
          'guest'::text as attendee_type,
          guest_row.guest_type,
          false as is_host,
          coalesce(inviter_row.display_name, 'A Circle member') as invited_by_name,
          1 as sort_group
        from public.event_guests guest_row
        left join public.users inviter_row on inviter_row.id = guest_row.invited_by_user_id
        left join public.users claimed_user on claimed_user.id = guest_row.claimed_user_id
        where guest_row.event_id = v_event.id
          and guest_row.status = 'going'
      ) attendee_row;
    end if;
  end if;

  return jsonb_build_object(
    'valid', true,
    'visible', coalesce(v_event.show_attendee_list_to_guests, true),
    'going_count', coalesce(v_count, 0),
    'completed', v_event.attendance_reviewed_at is not null,
    'attendees', case
      when coalesce(v_event.show_attendee_list_to_guests, true) then v_attendees
      else '[]'::jsonb
    end
  );
end;
$$;

revoke all on function public.list_event_guest_attendees(text) from public;
grant execute on function public.list_event_guest_attendees(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shared-event predicates include claimed former guests.
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
      from public.confirmed_event_users attendee_a
      join public.confirmed_event_users attendee_b
        on attendee_b.event_id = attendee_a.event_id
       and attendee_b.user_id = p_user_b
      join public.events event_row on event_row.id = attendee_a.event_id
      where attendee_a.user_id = p_user_a
        and event_row.attendance_reviewed_at is not null
        and event_row.status <> 'cancelled'
    );
$$;

revoke all on function public.users_share_confirmed_event(uuid, uuid) from public;

-- Shared-event counts and latest-event context now use canonical app-user
-- attendance so claimed former guests receive the same limited profile shell.
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
      when coalesce(media_totals.media_count, 0) > 0 then media_totals.media_count
      when p.image_url is not null then 1
      else 0
    end::integer as preview_media_count
  from public.users u
  left join public.posts p
    on p.id = u.mutual_preview_post_id
   and p.user_id = u.id
  left join lateral (
    select media.url, media.media_type
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
      count(distinct mine.event_id)::bigint as shared_event_count,
      (
        select event_latest.title
        from public.confirmed_event_users latest_mine
        join public.confirmed_event_users latest_theirs
          on latest_theirs.event_id = latest_mine.event_id
         and latest_theirs.user_id = profile_user_id
        join public.events event_latest on event_latest.id = latest_mine.event_id
        where latest_mine.user_id = viewer_id
          and event_latest.attendance_reviewed_at is not null
          and event_latest.status <> 'cancelled'
        order by event_latest.starts_at desc, event_latest.id desc
        limit 1
      ) as latest_event_title,
      (
        select event_latest.starts_at
        from public.confirmed_event_users latest_mine
        join public.confirmed_event_users latest_theirs
          on latest_theirs.event_id = latest_mine.event_id
         and latest_theirs.user_id = profile_user_id
        join public.events event_latest on event_latest.id = latest_mine.event_id
        where latest_mine.user_id = viewer_id
          and event_latest.attendance_reviewed_at is not null
          and event_latest.status <> 'cancelled'
        order by event_latest.starts_at desc, event_latest.id desc
        limit 1
      ) as latest_event_at
    from public.confirmed_event_users mine
    join public.confirmed_event_users theirs
      on theirs.event_id = mine.event_id
     and theirs.user_id = profile_user_id
    join public.events shared_event
      on shared_event.id = mine.event_id
     and shared_event.attendance_reviewed_at is not null
     and shared_event.status <> 'cancelled'
    where mine.user_id = viewer_id
  ) shared_events on true
  where u.id = profile_user_id;
end;
$$;

revoke all on function public.get_preconnection_profile_shell(uuid) from public;
grant execute on function public.get_preconnection_profile_shell(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Claimed former guests can open the same limited post-event people surface.
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

  if not found then
    raise exception 'Event not found or unavailable';
  end if;

  select exists (
    select 1
    from public.confirmed_event_users confirmed
    where confirmed.event_id = p_event_id
      and confirmed.user_id = auth.uid()
  ) into v_viewer_attended;

  if not public.event_viewer_can_access(p_event_id, auth.uid())
     and not v_viewer_attended then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.attendance_reviewed_at is null then
    raise exception 'Attendance has not been reviewed for this event';
  end if;

  with confirmed_members as (
    select confirmed.user_id
    from public.confirmed_event_users confirmed
    where confirmed.event_id = p_event_id
      and confirmed.user_id <> auth.uid()
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
        select count(distinct mine.event_id)::integer
        from public.confirmed_event_users mine
        join public.confirmed_event_users theirs
          on theirs.event_id = mine.event_id
         and theirs.user_id = confirmed.user_id
        join public.events shared_event
          on shared_event.id = mine.event_id
         and shared_event.attendance_reviewed_at is not null
         and shared_event.status <> 'cancelled'
        where mine.user_id = auth.uid()
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
    from public.confirmed_event_users confirmed
    where confirmed.event_id = p_event_id
      and confirmed.user_id = auth.uid()
  ) or not exists (
    select 1
    from public.confirmed_event_users confirmed
    where confirmed.event_id = p_event_id
      and confirmed.user_id = p_to_user_id
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

  select count(distinct mine.event_id)::integer
  into v_shared_event_count
  from public.confirmed_event_users mine
  join public.confirmed_event_users theirs
    on theirs.event_id = mine.event_id
   and theirs.user_id = p_to_user_id
  join public.events shared_event
    on shared_event.id = mine.event_id
   and shared_event.attendance_reviewed_at is not null
   and shared_event.status <> 'cancelled'
  where mine.user_id = auth.uid();

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

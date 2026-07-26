-- Circles Phase 2E — guest invitation links and web RSVP
--
-- Gives each named outside guest a private, revocable bearer link that can be
-- opened without a Circles account. The public RPCs expose only the event
-- details needed to RSVP; they never expose Circle names, private profiles,
-- posts, messages, connection data, or member identifiers.

create extension if not exists pgcrypto;

alter table public.event_guests
  add column if not exists invite_token_hash text,
  add column if not exists invite_created_at timestamptz,
  add column if not exists invite_expires_at timestamptz,
  add column if not exists invite_revoked_at timestamptz;

alter table public.event_guests
  drop constraint if exists event_guests_invite_token_hash_check;

alter table public.event_guests
  add constraint event_guests_invite_token_hash_check check (
    invite_token_hash is null or invite_token_hash ~ '^[0-9a-f]{64}$'
  );

create unique index if not exists event_guests_invite_token_hash_unique
  on public.event_guests (invite_token_hash)
  where invite_token_hash is not null;

create index if not exists event_guests_invite_expiry_index
  on public.event_guests (invite_expires_at)
  where invite_token_hash is not null;

-- Remote control for public guest invitation links and web RSVP.
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
      'event_guest_web_rsvp'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'event_guest_web_rsvp',
  true,
  'Allows private outside-guest invitation links and account-free RSVP.'
)
on conflict (flag_key) do nothing;

-- Extend the analytics event-name constraint before any new event is recorded.
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
      'event_guest_web_rsvp_updated'
    )
  );

-- Best-effort server-side analytics for the guest flow. Only controlled values
-- are accepted by the call sites below; no token, guest name, event title,
-- location, user ID, event ID, or Circle ID is written.
create or replace function public.record_event_guest_analytics(
  p_event_name text,
  p_properties jsonb default '{}'::jsonb
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
    'event_guest_added',
    'event_guest_response_updated',
    'event_guest_removed',
    'event_guest_settings_updated',
    'event_guest_invite_created',
    'event_guest_invite_opened',
    'event_guest_web_rsvp_updated'
  ) then
    return;
  end if;

  insert into public.app_analytics_events (event_name, actor_id, properties)
  values (
    p_event_name,
    auth.uid(),
    jsonb_strip_nulls(coalesce(p_properties, '{}'::jsonb))
  );
exception
  when others then
    -- Analytics must never block invitation creation or RSVP.
    return;
end;
$$;

revoke all on function public.record_event_guest_analytics(text, jsonb) from public;

create or replace function public.create_event_guest_invite(p_guest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest public.event_guests%rowtype;
  v_event public.events%rowtype;
  v_enabled boolean := true;
  v_token text;
  v_token_hash text;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'event_guest_web_rsvp';

  if not coalesce(v_enabled, true) then
    raise exception 'Guest invitation links are temporarily unavailable';
  end if;

  select guest_row.*
  into v_guest
  from public.event_guests guest_row
  where guest_row.id = p_guest_id;

  if not found or not public.event_viewer_can_access(v_guest.event_id, auth.uid()) then
    raise exception 'Guest not found or unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = v_guest.event_id;

  if not found or v_event.status <> 'scheduled' then
    raise exception 'This event is no longer accepting guest RSVPs';
  end if;

  if v_event.host_id <> auth.uid() and v_guest.invited_by_user_id <> auth.uid() then
    raise exception 'Only the host or the person who added this guest can share their link';
  end if;

  -- A fresh share rotates the bearer token so a previously shared link stops
  -- working. Only the SHA-256 hash is stored in the database.
  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires_at := greatest(
    now() + interval '7 days',
    coalesce(v_event.ends_at, v_event.starts_at) + interval '90 days'
  );

  update public.event_guests
  set
    invite_token_hash = v_token_hash,
    invite_created_at = now(),
    invite_expires_at = v_expires_at,
    invite_revoked_at = null,
    updated_at = now()
  where id = p_guest_id;

  perform public.record_event_guest_analytics(
    'event_guest_invite_created',
    jsonb_build_object(
      'surface', 'event_detail',
      'guest_type', v_guest.guest_type
    )
  );

  return jsonb_build_object(
    'token', v_token,
    'expires_at', v_expires_at,
    'guest_type', v_guest.guest_type,
    'guest_status', v_guest.status
  );
end;
$$;

revoke all on function public.create_event_guest_invite(uuid) from public;
grant execute on function public.create_event_guest_invite(uuid) to authenticated;

create or replace function public.preview_event_guest_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_clean_token text := lower(btrim(coalesce(p_token, '')));
  v_token_hash text;
  v_guest public.event_guests%rowtype;
  v_event public.events%rowtype;
  v_host_name text;
  v_host_avatar text;
  v_inviter_name text;
begin
  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'event_guest_web_rsvp';

  if not coalesce(v_enabled, true) then
    return jsonb_build_object('valid', false, 'reason', 'disabled');
  end if;

  if v_clean_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  v_token_hash := encode(digest(v_clean_token, 'sha256'), 'hex');

  select guest_row.*
  into v_guest
  from public.event_guests guest_row
  where guest_row.invite_token_hash = v_token_hash;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  if v_guest.invite_revoked_at is not null then
    return jsonb_build_object('valid', false, 'reason', 'revoked');
  end if;

  if v_guest.invite_expires_at is null or v_guest.invite_expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = v_guest.event_id;

  if not found or v_event.status <> 'scheduled' then
    return jsonb_build_object('valid', false, 'reason', 'event_unavailable');
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
  where user_row.id = v_guest.invited_by_user_id;

  perform public.record_event_guest_analytics(
    'event_guest_invite_opened',
    jsonb_build_object(
      'surface', 'event_guest_invitation',
      'guest_type', v_guest.guest_type,
      'has_location', length(btrim(coalesce(v_event.location_name, ''))) > 0,
      'has_description', length(btrim(coalesce(v_event.description, ''))) > 0
    )
  );

  return jsonb_build_object(
    'valid', true,
    'guest', jsonb_build_object(
      'display_name', v_guest.display_name,
      'guest_type', v_guest.guest_type,
      'status', v_guest.status
    ),
    'event', jsonb_build_object(
      'title', v_event.title,
      'description', v_event.description,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at,
      'location_name', v_event.location_name,
      'host_name', coalesce(v_host_name, 'Event host'),
      'host_avatar', v_host_avatar
    ),
    'invitation', jsonb_build_object(
      'invited_by_name', coalesce(v_inviter_name, 'A Circle member'),
      'expires_at', v_guest.invite_expires_at
    )
  );
end;
$$;

revoke all on function public.preview_event_guest_invite(text) from public;
grant execute on function public.preview_event_guest_invite(text) to anon, authenticated;

create or replace function public.respond_to_event_guest_invite(
  p_token text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_clean_token text := lower(btrim(coalesce(p_token, '')));
  v_token_hash text;
  v_guest public.event_guests%rowtype;
  v_event_status text;
begin
  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'event_guest_web_rsvp';

  if not coalesce(v_enabled, true) then
    raise exception 'Guest RSVP is temporarily unavailable';
  end if;

  if p_status not in ('going', 'maybe', 'not_going') then
    raise exception 'Choose Going, Maybe, or Can’t go';
  end if;

  if v_clean_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invitation not found or unavailable';
  end if;

  v_token_hash := encode(digest(v_clean_token, 'sha256'), 'hex');

  select guest_row.*
  into v_guest
  from public.event_guests guest_row
  where guest_row.invite_token_hash = v_token_hash;

  if not found
     or v_guest.invite_revoked_at is not null
     or v_guest.invite_expires_at is null
     or v_guest.invite_expires_at <= now() then
    raise exception 'Invitation not found or unavailable';
  end if;

  select event_row.status
  into v_event_status
  from public.events event_row
  where event_row.id = v_guest.event_id;

  if not found or v_event_status <> 'scheduled' then
    raise exception 'This event is no longer accepting guest RSVPs';
  end if;

  update public.event_guests
  set
    status = p_status,
    responded_at = now(),
    updated_at = now()
  where id = v_guest.id;

  perform public.record_event_guest_analytics(
    'event_guest_web_rsvp_updated',
    jsonb_build_object(
      'surface', 'event_guest_invitation',
      'guest_type', v_guest.guest_type,
      'guest_status', p_status
    )
  );

  return jsonb_build_object('status', p_status);
end;
$$;

revoke all on function public.respond_to_event_guest_invite(text, text) from public;
grant execute on function public.respond_to_event_guest_invite(text, text) to anon, authenticated;

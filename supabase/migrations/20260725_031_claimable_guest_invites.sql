-- Circles Phase 2E refinement — claimable guest invitation slots
--
-- Replaces the primary "add a named guest, then share" experience with:
-- inviter creates one reserved invitation slot -> recipient opens the private
-- link -> recipient enters their own name and RSVP -> a real guest row is
-- created. Manual guest entry remains available as a fallback.

create extension if not exists pgcrypto;

create table if not exists public.event_guest_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  invited_by_user_id uuid references public.users(id) on delete set null,
  guest_type text not null default 'guest' check (
    guest_type in ('guest', 'plus_one')
  ),
  token_hash text not null,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_guest_id uuid references public.event_guests(id) on delete cascade,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_guest_invitations_token_hash_check check (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint event_guest_invitations_claim_state_check check (
    (claimed_at is null and claimed_guest_id is null)
    or (claimed_at is not null and claimed_guest_id is not null)
  )
);

create unique index if not exists event_guest_invitations_token_hash_unique
  on public.event_guest_invitations (token_hash);

create index if not exists event_guest_invitations_event_pending_index
  on public.event_guest_invitations (event_id, created_at, id)
  where claimed_guest_id is null and revoked_at is null;

create index if not exists event_guest_invitations_expiry_index
  on public.event_guest_invitations (expires_at)
  where claimed_guest_id is null and revoked_at is null;

alter table public.event_guest_invitations enable row level security;

-- No direct table policies are exposed. All reads and writes stay behind the
-- RPCs below so event membership, inviter permissions, plus-one rules, guest
-- caps, and bearer-token privacy are evaluated together.

create or replace function public.list_event_guest_invitations(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_host_id uuid;
  v_result jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  select event_row.host_id
  into v_host_id
  from public.events event_row
  where event_row.id = p_event_id;

  if not found then
    raise exception 'Event not found or unavailable';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', invitation_row.id,
        'guest_type', invitation_row.guest_type,
        'invited_by_name', coalesce(inviter.display_name, 'Circle member'),
        'expires_at', invitation_row.expires_at,
        'can_manage', (
          v_host_id = auth.uid()
          or invitation_row.invited_by_user_id = auth.uid()
        )
      )
      order by invitation_row.created_at, invitation_row.id
    ),
    '[]'::jsonb
  )
  into v_result
  from public.event_guest_invitations invitation_row
  left join public.users inviter on inviter.id = invitation_row.invited_by_user_id
  where invitation_row.event_id = p_event_id
    and invitation_row.claimed_guest_id is null
    and invitation_row.revoked_at is null
    and invitation_row.expires_at > now();

  return v_result;
end;
$$;

revoke all on function public.list_event_guest_invitations(uuid) from public;
grant execute on function public.list_event_guest_invitations(uuid) to authenticated;

create or replace function public.create_event_guest_invitation(
  p_event_id uuid,
  p_guest_type text default 'guest'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_event public.events%rowtype;
  v_enabled boolean := true;
  v_guest_count integer := 0;
  v_pending_count integer := 0;
  v_invitation_id uuid;
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

  if not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id
  for update;

  if not found or v_event.status <> 'scheduled' then
    raise exception 'This event is no longer accepting guest invitations';
  end if;

  if v_event.host_id <> auth.uid() and not v_event.members_can_invite_guests then
    raise exception 'Only the host can invite outside guests to this event';
  end if;

  if v_event.outside_guest_cap < 1 then
    raise exception 'Outside guests are not enabled for this event';
  end if;

  if p_guest_type not in ('guest', 'plus_one') then
    raise exception 'Choose guest or plus-one';
  end if;

  if p_guest_type = 'plus_one' and not v_event.allow_plus_ones then
    raise exception 'Plus-ones are not enabled for this event';
  end if;

  select count(*)::integer
  into v_guest_count
  from public.event_guests guest_row
  where guest_row.event_id = p_event_id;

  select count(*)::integer
  into v_pending_count
  from public.event_guest_invitations invitation_row
  where invitation_row.event_id = p_event_id
    and invitation_row.claimed_guest_id is null
    and invitation_row.revoked_at is null
    and invitation_row.expires_at > now();

  if v_guest_count + v_pending_count >= v_event.outside_guest_cap then
    raise exception 'This event has reached its outside guest limit';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires_at := greatest(
    now() + interval '7 days',
    coalesce(v_event.ends_at, v_event.starts_at) + interval '90 days'
  );

  insert into public.event_guest_invitations (
    event_id,
    invited_by_user_id,
    guest_type,
    token_hash,
    expires_at
  )
  values (
    p_event_id,
    auth.uid(),
    p_guest_type,
    v_token_hash,
    v_expires_at
  )
  returning id into v_invitation_id;

  perform public.record_event_guest_analytics(
    'event_guest_invite_created',
    jsonb_build_object(
      'surface', 'invite_guest',
      'guest_type', p_guest_type,
      'action', 'create'
    )
  );

  return jsonb_build_object(
    'invitation_id', v_invitation_id,
    'token', v_token,
    'expires_at', v_expires_at,
    'guest_type', p_guest_type
  );
end;
$$;

revoke all on function public.create_event_guest_invitation(uuid, text) from public;
grant execute on function public.create_event_guest_invitation(uuid, text) to authenticated;

create or replace function public.rotate_event_guest_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invitation public.event_guest_invitations%rowtype;
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

  select invitation_row.*
  into v_invitation
  from public.event_guest_invitations invitation_row
  where invitation_row.id = p_invitation_id
  for update;

  if not found
     or v_invitation.claimed_guest_id is not null
     or v_invitation.revoked_at is not null
     or not public.event_viewer_can_access(v_invitation.event_id, auth.uid()) then
    raise exception 'Guest invitation not found or unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = v_invitation.event_id;

  if not found or v_event.status <> 'scheduled' then
    raise exception 'This event is no longer accepting guest invitations';
  end if;

  if v_event.host_id <> auth.uid()
     and v_invitation.invited_by_user_id <> auth.uid() then
    raise exception 'Only the host or original inviter can share this link';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires_at := greatest(
    now() + interval '7 days',
    coalesce(v_event.ends_at, v_event.starts_at) + interval '90 days'
  );

  update public.event_guest_invitations
  set
    token_hash = v_token_hash,
    expires_at = v_expires_at,
    updated_at = now()
  where id = p_invitation_id;

  perform public.record_event_guest_analytics(
    'event_guest_invite_created',
    jsonb_build_object(
      'surface', 'event_detail',
      'guest_type', v_invitation.guest_type,
      'action', 'rotate'
    )
  );

  return jsonb_build_object(
    'invitation_id', p_invitation_id,
    'token', v_token,
    'expires_at', v_expires_at,
    'guest_type', v_invitation.guest_type
  );
end;
$$;

revoke all on function public.rotate_event_guest_invitation(uuid) from public;
grant execute on function public.rotate_event_guest_invitation(uuid) to authenticated;

create or replace function public.revoke_event_guest_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.event_guest_invitations%rowtype;
  v_host_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select invitation_row.*
  into v_invitation
  from public.event_guest_invitations invitation_row
  where invitation_row.id = p_invitation_id
  for update;

  if not found
     or v_invitation.claimed_guest_id is not null
     or v_invitation.revoked_at is not null
     or not public.event_viewer_can_access(v_invitation.event_id, auth.uid()) then
    raise exception 'Guest invitation not found or unavailable';
  end if;

  select event_row.host_id
  into v_host_id
  from public.events event_row
  where event_row.id = v_invitation.event_id;

  if v_host_id <> auth.uid()
     and v_invitation.invited_by_user_id <> auth.uid() then
    raise exception 'Only the host or original inviter can revoke this invitation';
  end if;

  update public.event_guest_invitations
  set
    revoked_at = now(),
    updated_at = now()
  where id = p_invitation_id;

  return true;
end;
$$;

revoke all on function public.revoke_event_guest_invitation(uuid) from public;
grant execute on function public.revoke_event_guest_invitation(uuid) to authenticated;

-- Public preview supports both the new claimable invitation slots and legacy
-- named-guest links that may already have been shared.
create or replace function public.preview_event_guest_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_enabled boolean := true;
  v_clean_token text := lower(btrim(coalesce(p_token, '')));
  v_token_hash text;
  v_invitation public.event_guest_invitations%rowtype;
  v_guest public.event_guests%rowtype;
  v_event public.events%rowtype;
  v_host_name text;
  v_host_avatar text;
  v_inviter_name text;
  v_claimed boolean := false;
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

  select invitation_row.*
  into v_invitation
  from public.event_guest_invitations invitation_row
  where invitation_row.token_hash = v_token_hash;

  if found then
    if v_invitation.revoked_at is not null then
      return jsonb_build_object('valid', false, 'reason', 'revoked');
    end if;

    if v_invitation.expires_at <= now() then
      return jsonb_build_object('valid', false, 'reason', 'expired');
    end if;

    select event_row.*
    into v_event
    from public.events event_row
    where event_row.id = v_invitation.event_id;

    if not found or v_event.status <> 'scheduled' then
      return jsonb_build_object('valid', false, 'reason', 'event_unavailable');
    end if;

    v_claimed := v_invitation.claimed_guest_id is not null;

    if v_claimed then
      select guest_row.*
      into v_guest
      from public.event_guests guest_row
      where guest_row.id = v_invitation.claimed_guest_id;

      if not found then
        return jsonb_build_object('valid', false, 'reason', 'not_found');
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
    where user_row.id = v_invitation.invited_by_user_id;

    perform public.record_event_guest_analytics(
      'event_guest_invite_opened',
      jsonb_build_object(
        'surface', 'event_guest_invitation',
        'guest_type', v_invitation.guest_type,
        'has_location', length(btrim(coalesce(v_event.location_name, ''))) > 0,
        'has_description', length(btrim(coalesce(v_event.description, ''))) > 0
      )
    );

    return jsonb_build_object(
      'valid', true,
      'guest', jsonb_build_object(
        'display_name', case when v_claimed then v_guest.display_name else '' end,
        'guest_type', v_invitation.guest_type,
        'status', case when v_claimed then v_guest.status else 'invited' end,
        'claimed', v_claimed
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
        'expires_at', v_invitation.expires_at,
        'claim_required', not v_claimed
      )
    );
  end if;

  -- Legacy fallback: links attached directly to an already-created guest row.
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
      'status', v_guest.status,
      'claimed', true
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
      'expires_at', v_guest.invite_expires_at,
      'claim_required', false
    )
  );
end;
$$;

revoke all on function public.preview_event_guest_invite(text) from public;
grant execute on function public.preview_event_guest_invite(text) to anon, authenticated;

create or replace function public.respond_to_event_guest_invite(
  p_token text,
  p_display_name text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_enabled boolean := true;
  v_clean_token text := lower(btrim(coalesce(p_token, '')));
  v_token_hash text;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_invitation public.event_guest_invitations%rowtype;
  v_guest public.event_guests%rowtype;
  v_event public.events%rowtype;
  v_guest_id uuid;
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

  if length(v_name) < 1 or length(v_name) > 80 then
    raise exception 'Enter a name between 1 and 80 characters';
  end if;

  if v_clean_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invitation not found or unavailable';
  end if;

  v_token_hash := encode(digest(v_clean_token, 'sha256'), 'hex');

  select invitation_row.*
  into v_invitation
  from public.event_guest_invitations invitation_row
  where invitation_row.token_hash = v_token_hash
  for update;

  if found then
    if v_invitation.revoked_at is not null
       or v_invitation.expires_at <= now() then
      raise exception 'Invitation not found or unavailable';
    end if;

    select event_row.*
    into v_event
    from public.events event_row
    where event_row.id = v_invitation.event_id
    for update;

    if not found or v_event.status <> 'scheduled' then
      raise exception 'This event is no longer accepting guest RSVPs';
    end if;

    if v_invitation.claimed_guest_id is null then
      insert into public.event_guests (
        event_id,
        invited_by_user_id,
        display_name,
        guest_type,
        status,
        responded_at
      )
      values (
        v_invitation.event_id,
        v_invitation.invited_by_user_id,
        v_name,
        v_invitation.guest_type,
        p_status,
        now()
      )
      returning id into v_guest_id;

      update public.event_guest_invitations
      set
        claimed_guest_id = v_guest_id,
        claimed_at = now(),
        updated_at = now()
      where id = v_invitation.id;
    else
      v_guest_id := v_invitation.claimed_guest_id;

      update public.event_guests
      set
        display_name = v_name,
        status = p_status,
        responded_at = now(),
        updated_at = now()
      where id = v_guest_id;

      if not found then
        raise exception 'Invitation not found or unavailable';
      end if;
    end if;

    perform public.record_event_guest_analytics(
      'event_guest_web_rsvp_updated',
      jsonb_build_object(
        'surface', 'event_guest_invitation',
        'guest_type', v_invitation.guest_type,
        'guest_status', p_status,
        'action', case when v_invitation.claimed_guest_id is null then 'claim' else 'update' end
      )
    );

    return jsonb_build_object(
      'status', p_status,
      'display_name', v_name,
      'claimed', true
    );
  end if;

  -- Legacy fallback for previously shared named-guest links.
  select guest_row.*
  into v_guest
  from public.event_guests guest_row
  where guest_row.invite_token_hash = v_token_hash
  for update;

  if not found
     or v_guest.invite_revoked_at is not null
     or v_guest.invite_expires_at is null
     or v_guest.invite_expires_at <= now() then
    raise exception 'Invitation not found or unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = v_guest.event_id;

  if not found or v_event.status <> 'scheduled' then
    raise exception 'This event is no longer accepting guest RSVPs';
  end if;

  update public.event_guests
  set
    display_name = v_name,
    status = p_status,
    responded_at = now(),
    updated_at = now()
  where id = v_guest.id;

  perform public.record_event_guest_analytics(
    'event_guest_web_rsvp_updated',
    jsonb_build_object(
      'surface', 'event_guest_invitation',
      'guest_type', v_guest.guest_type,
      'guest_status', p_status,
      'action', 'update'
    )
  );

  return jsonb_build_object(
    'status', p_status,
    'display_name', v_name,
    'claimed', true
  );
end;
$$;

revoke all on function public.respond_to_event_guest_invite(text, text, text) from public;
grant execute on function public.respond_to_event_guest_invite(text, text, text) to anon, authenticated;

-- Manual entry remains a fallback, but pending claimable invitations reserve
-- spots and therefore count against the event's guest cap.
create or replace function public.add_event_guest(
  p_event_id uuid,
  p_display_name text,
  p_guest_type text default 'guest',
  p_status text default 'invited'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_guest_id uuid;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_guest_count integer := 0;
  v_pending_count integer := 0;
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
  where event_row.id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.host_id <> auth.uid() and not v_event.members_can_invite_guests then
    raise exception 'Only the host can add outside guests to this event';
  end if;

  if v_event.outside_guest_cap < 1 then
    raise exception 'Outside guests are not enabled for this event';
  end if;

  select count(*)::integer
  into v_guest_count
  from public.event_guests guest_row
  where guest_row.event_id = p_event_id;

  select count(*)::integer
  into v_pending_count
  from public.event_guest_invitations invitation_row
  where invitation_row.event_id = p_event_id
    and invitation_row.claimed_guest_id is null
    and invitation_row.revoked_at is null
    and invitation_row.expires_at > now();

  if v_guest_count + v_pending_count >= v_event.outside_guest_cap then
    raise exception 'This event has reached its outside guest limit';
  end if;

  if length(v_name) < 1 or length(v_name) > 80 then
    raise exception 'Guest name must be between 1 and 80 characters';
  end if;

  if p_guest_type not in ('guest', 'plus_one') then
    raise exception 'Choose guest or plus-one';
  end if;

  if p_guest_type = 'plus_one' and not v_event.allow_plus_ones then
    raise exception 'Plus-ones are not enabled for this event';
  end if;

  if p_status not in ('invited', 'going', 'maybe', 'not_going') then
    raise exception 'Guest response is invalid';
  end if;

  insert into public.event_guests (
    event_id,
    invited_by_user_id,
    display_name,
    guest_type,
    status,
    responded_at
  )
  values (
    p_event_id,
    auth.uid(),
    v_name,
    p_guest_type,
    p_status,
    case when p_status = 'invited' then null else now() end
  )
  returning id into v_guest_id;

  perform public.record_event_guest_analytics(
    'event_guest_added',
    jsonb_build_object(
      'surface', 'add_event_guest_manual',
      'guest_type', p_guest_type,
      'guest_status', p_status
    )
  );

  return jsonb_build_object(
    'guest_id', v_guest_id,
    'guest_type', p_guest_type,
    'status', p_status
  );
end;
$$;

revoke all on function public.add_event_guest(uuid, text, text, text) from public;
grant execute on function public.add_event_guest(uuid, text, text, text) to authenticated;

create or replace function public.update_event_guest_settings(
  p_event_id uuid,
  p_outside_guest_cap integer,
  p_members_can_invite_guests boolean,
  p_allow_plus_ones boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_guest_count integer := 0;
  v_pending_count integer := 0;
  v_plus_one_count integer := 0;
  v_pending_plus_one_count integer := 0;
  v_reserved_count integer := 0;
  v_guest_cap integer := coalesce(p_outside_guest_cap, 0);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
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
    raise exception 'Only the host can change outside guest settings';
  end if;

  if v_guest_cap < 0 or v_guest_cap > 50 then
    raise exception 'Outside guest limit must be between 0 and 50';
  end if;

  select
    count(*)::integer,
    count(*) filter (where guest_type = 'plus_one')::integer
  into v_guest_count, v_plus_one_count
  from public.event_guests
  where event_id = p_event_id;

  select
    count(*)::integer,
    count(*) filter (where guest_type = 'plus_one')::integer
  into v_pending_count, v_pending_plus_one_count
  from public.event_guest_invitations
  where event_id = p_event_id
    and claimed_guest_id is null
    and revoked_at is null
    and expires_at > now();

  v_reserved_count := v_guest_count + v_pending_count;

  if v_guest_cap < v_reserved_count then
    raise exception 'Remove guests or pending invitations before lowering the limit';
  end if;

  if not coalesce(p_allow_plus_ones, false)
     and v_plus_one_count + v_pending_plus_one_count > 0 then
    raise exception 'Remove existing plus-ones and pending plus-one invitations first';
  end if;

  if v_guest_cap = 0 then
    p_members_can_invite_guests := false;
    p_allow_plus_ones := false;
  end if;

  update public.events
  set
    outside_guest_cap = v_guest_cap,
    members_can_invite_guests = coalesce(p_members_can_invite_guests, false),
    allow_plus_ones = coalesce(p_allow_plus_ones, false),
    updated_at = now()
  where id = p_event_id;

  perform public.record_event_guest_analytics(
    'event_guest_settings_updated',
    jsonb_build_object(
      'surface', 'event_guest_settings',
      'action', 'update',
      'guest_cap', v_guest_cap,
      'invite_mode', case
        when coalesce(p_members_can_invite_guests, false) then 'members'
        else 'host_only'
      end,
      'allow_plus_ones', coalesce(p_allow_plus_ones, false)
    )
  );

  return jsonb_build_object(
    'outside_guest_cap', v_guest_cap,
    'members_can_invite_guests', coalesce(p_members_can_invite_guests, false),
    'allow_plus_ones', coalesce(p_allow_plus_ones, false)
  );
end;
$$;

revoke all on function public.update_event_guest_settings(uuid, integer, boolean, boolean) from public;
grant execute on function public.update_event_guest_settings(uuid, integer, boolean, boolean) to authenticated;

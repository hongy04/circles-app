-- Phase 2D hotfix: record outside-guest analytics inside the successful
-- database RPCs instead of relying on a fire-and-forget client request.
-- Analytics remain best-effort and can never roll back a guest action.

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
    'event_guest_settings_updated'
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
    -- Analytics must never block or undo the user's guest action.
    return;
end;
$$;

revoke all on function public.record_event_guest_analytics(text, jsonb) from public;

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
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  select event_row.* into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.host_id <> auth.uid() and not v_event.members_can_invite_guests then
    raise exception 'Only the host can add outside guests to this event';
  end if;

  if v_event.outside_guest_cap < 1 then
    raise exception 'Outside guests are not enabled for this event';
  end if;

  select count(*)::integer into v_guest_count
  from public.event_guests guest_row
  where guest_row.event_id = p_event_id;

  if v_guest_count >= v_event.outside_guest_cap then
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
      'surface', 'add_event_guest',
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

create or replace function public.update_event_guest_response(
  p_guest_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest public.event_guests%rowtype;
  v_host_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_status not in ('invited', 'going', 'maybe', 'not_going') then
    raise exception 'Guest response is invalid';
  end if;

  select guest_row.*
  into v_guest
  from public.event_guests guest_row
  where guest_row.id = p_guest_id;

  if not found or not public.event_viewer_can_access(v_guest.event_id, auth.uid()) then
    raise exception 'Guest not found or unavailable';
  end if;

  select event_row.host_id
  into v_host_id
  from public.events event_row
  where event_row.id = v_guest.event_id;

  if v_host_id <> auth.uid() and v_guest.invited_by_user_id <> auth.uid() then
    raise exception 'Only the host or the person who added this guest can update them';
  end if;

  update public.event_guests
  set
    status = p_status,
    responded_at = case when p_status = 'invited' then null else now() end,
    updated_at = now()
  where id = p_guest_id;

  perform public.record_event_guest_analytics(
    'event_guest_response_updated',
    jsonb_build_object(
      'surface', 'event_detail',
      'guest_status', p_status
    )
  );

  return jsonb_build_object('status', p_status);
end;
$$;

revoke all on function public.update_event_guest_response(uuid, text) from public;
grant execute on function public.update_event_guest_response(uuid, text) to authenticated;

create or replace function public.remove_event_guest(p_guest_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest public.event_guests%rowtype;
  v_host_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select guest_row.*
  into v_guest
  from public.event_guests guest_row
  where guest_row.id = p_guest_id;

  if not found or not public.event_viewer_can_access(v_guest.event_id, auth.uid()) then
    raise exception 'Guest not found or unavailable';
  end if;

  select event_row.host_id
  into v_host_id
  from public.events event_row
  where event_row.id = v_guest.event_id;

  if v_host_id <> auth.uid() and v_guest.invited_by_user_id <> auth.uid() then
    raise exception 'Only the host or the person who added this guest can remove them';
  end if;

  delete from public.event_guests where id = p_guest_id;

  perform public.record_event_guest_analytics(
    'event_guest_removed',
    jsonb_build_object(
      'surface', 'event_detail',
      'guest_type', v_guest.guest_type
    )
  );

  return true;
end;
$$;

revoke all on function public.remove_event_guest(uuid) from public;
grant execute on function public.remove_event_guest(uuid) to authenticated;

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
  v_plus_one_count integer := 0;
  v_guest_cap integer := coalesce(p_outside_guest_cap, 0);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select event_row.* into v_event
  from public.events event_row
  where event_row.id = p_event_id;

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

  if v_guest_cap < v_guest_count then
    raise exception 'Remove guests before lowering the limit below the current guest count';
  end if;

  if not coalesce(p_allow_plus_ones, false) and v_plus_one_count > 0 then
    raise exception 'Remove existing plus-ones before turning plus-ones off';
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

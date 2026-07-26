-- Circles Phase 2E refinement — privacy-safe guest attendee visibility
--
-- Lets hosts decide whether people holding a valid guest invitation may see
-- the names/photos of attendees marked Going. Public responses expose only
-- display-safe attendee context: no user IDs, usernames, Circle names,
-- profile links, posts, messages, or connection data.

alter table public.events
  add column if not exists show_attendee_list_to_guests boolean not null default true;

create or replace function public.get_event_guest_attendee_visibility(
  p_event_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_visible boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  select event_row.show_attendee_list_to_guests
  into v_visible
  from public.events event_row
  where event_row.id = p_event_id;

  if not found then
    raise exception 'Event not found or unavailable';
  end if;

  return coalesce(v_visible, true);
end;
$$;

revoke all on function public.get_event_guest_attendee_visibility(uuid) from public;
grant execute on function public.get_event_guest_attendee_visibility(uuid) to authenticated;

create or replace function public.update_event_guest_settings_v2(
  p_event_id uuid,
  p_outside_guest_cap integer,
  p_members_can_invite_guests boolean,
  p_allow_plus_ones boolean,
  p_show_attendee_list_to_guests boolean
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
  v_show_attendees boolean := coalesce(p_show_attendee_list_to_guests, true);
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
    show_attendee_list_to_guests = v_show_attendees,
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
      'allow_plus_ones', coalesce(p_allow_plus_ones, false),
      'show_attendee_list', v_show_attendees
    )
  );

  return jsonb_build_object(
    'outside_guest_cap', v_guest_cap,
    'members_can_invite_guests', coalesce(p_members_can_invite_guests, false),
    'allow_plus_ones', coalesce(p_allow_plus_ones, false),
    'show_attendee_list_to_guests', v_show_attendees
  );
end;
$$;

revoke all on function public.update_event_guest_settings_v2(
  uuid, integer, boolean, boolean, boolean
) from public;
grant execute on function public.update_event_guest_settings_v2(
  uuid, integer, boolean, boolean, boolean
) to authenticated;

create or replace function public.list_event_guest_attendees(
  p_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_enabled boolean := true;
  v_clean_token text := lower(btrim(coalesce(p_token, '')));
  v_token_hash text;
  v_event_id uuid;
  v_event public.events%rowtype;
  v_going_count integer := 0;
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

  if v_clean_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object(
      'valid', false,
      'reason', 'not_found',
      'visible', false,
      'going_count', 0,
      'attendees', '[]'::jsonb
    );
  end if;

  v_token_hash := encode(digest(v_clean_token, 'sha256'), 'hex');

  select invitation_row.event_id
  into v_event_id
  from public.event_guest_invitations invitation_row
  where invitation_row.token_hash = v_token_hash
    and invitation_row.revoked_at is null
    and invitation_row.expires_at > now();

  if not found then
    select guest_row.event_id
    into v_event_id
    from public.event_guests guest_row
    where guest_row.invite_token_hash = v_token_hash
      and guest_row.invite_revoked_at is null
      and guest_row.invite_expires_at is not null
      and guest_row.invite_expires_at > now();
  end if;

  if v_event_id is null then
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
  where event_row.id = v_event_id;

  if not found or v_event.status <> 'scheduled' then
    return jsonb_build_object(
      'valid', false,
      'reason', 'event_unavailable',
      'visible', false,
      'going_count', 0,
      'attendees', '[]'::jsonb
    );
  end if;

  select (
    (select count(*) from public.event_rsvps rsvp_row
      where rsvp_row.event_id = v_event_id
        and rsvp_row.status = 'going')
    +
    (select count(*) from public.event_guests guest_row
      where guest_row.event_id = v_event_id
        and guest_row.status = 'going')
  )::integer
  into v_going_count;

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
        order by
          attendee_row.is_host desc,
          attendee_row.sort_group,
          lower(attendee_row.display_name)
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
        (rsvp_row.user_id = v_event.host_id) as is_host,
        null::text as invited_by_name,
        0 as sort_group
      from public.event_rsvps rsvp_row
      join public.users user_row
        on user_row.id = rsvp_row.user_id
      where rsvp_row.event_id = v_event_id
        and rsvp_row.status = 'going'

      union all

      select
        guest_row.display_name,
        null::text as avatar_url,
        'guest'::text as attendee_type,
        guest_row.guest_type,
        false as is_host,
        coalesce(inviter_row.display_name, 'A Circle member') as invited_by_name,
        1 as sort_group
      from public.event_guests guest_row
      left join public.users inviter_row
        on inviter_row.id = guest_row.invited_by_user_id
      where guest_row.event_id = v_event_id
        and guest_row.status = 'going'
    ) attendee_row;
  end if;

  return jsonb_build_object(
    'valid', true,
    'visible', coalesce(v_event.show_attendee_list_to_guests, true),
    'going_count', coalesce(v_going_count, 0),
    'attendees', case
      when coalesce(v_event.show_attendee_list_to_guests, true) then v_attendees
      else '[]'::jsonb
    end
  );
end;
$$;

revoke all on function public.list_event_guest_attendees(text) from public;
grant execute on function public.list_event_guest_attendees(text) to anon, authenticated;

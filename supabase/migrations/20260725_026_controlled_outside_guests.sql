-- Circles Phase 2D — controlled outside guests
--
-- Adds host-controlled guest limits, one-layer named outside-guest entries,
-- optional member guest invitations, and optional plus-ones. Outside guests do
-- not receive private profile access and cannot invite additional people.
-- Public web RSVP links remain intentionally deferred to the next phase.

alter table public.events
  add column if not exists outside_guest_cap integer not null default 0,
  add column if not exists members_can_invite_guests boolean not null default false,
  add column if not exists allow_plus_ones boolean not null default false;

alter table public.events
  drop constraint if exists events_outside_guest_cap_check;

alter table public.events
  add constraint events_outside_guest_cap_check check (
    outside_guest_cap between 0 and 50
  );

create table if not exists public.event_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  invited_by_user_id uuid references public.users(id) on delete set null,
  display_name text not null,
  guest_type text not null default 'guest' check (
    guest_type in ('guest', 'plus_one')
  ),
  status text not null default 'invited' check (
    status in ('invited', 'going', 'maybe', 'not_going')
  ),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_guests_display_name_length_check check (
    length(btrim(display_name)) between 1 and 80
  )
);

create index if not exists event_guests_event_index
  on public.event_guests (event_id, created_at, id);

create index if not exists event_guests_inviter_index
  on public.event_guests (invited_by_user_id, created_at desc);

alter table public.event_guests enable row level security;

-- No direct table policies are exposed. All access stays behind the RPCs below
-- so Circle membership, host controls, and the guest cap are checked together.

drop function if exists public.create_multi_circle_event(
  uuid[], text, text, timestamptz, timestamptz, text
);
drop function if exists public.create_multi_circle_event(
  uuid[], text, text, timestamptz, timestamptz, text, integer, boolean, boolean
);

create function public.create_multi_circle_event(
  p_conversation_ids uuid[],
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_location_name text default '',
  p_outside_guest_cap integer default 0,
  p_members_can_invite_guests boolean default false,
  p_allow_plus_ones boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_event_id uuid;
  v_circle_ids uuid[];
  v_circle_count integer := 0;
  v_authorized_count integer := 0;
  v_guest_cap integer := coalesce(p_outside_guest_cap, 0);
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_location text := btrim(coalesce(p_location_name, ''));
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select array_agg(circle_id order by circle_id)
  into v_circle_ids
  from (
    select distinct input_circle_id as circle_id
    from unnest(coalesce(p_conversation_ids, '{}'::uuid[])) input_circle_id
    where input_circle_id is not null
  ) selected_circles;

  v_circle_count := coalesce(cardinality(v_circle_ids), 0);

  if v_circle_count < 1 then
    raise exception 'Choose at least one Circle';
  end if;

  if v_circle_count > 20 then
    raise exception 'An event can include at most 20 Circles';
  end if;

  select count(distinct conversation_row.id)::integer
  into v_authorized_count
  from public.conversations conversation_row
  join public.conversation_members member_row
    on member_row.conversation_id = conversation_row.id
   and member_row.user_id = v_viewer_id
  where conversation_row.id = any(v_circle_ids)
    and conversation_row.kind = 'group';

  if v_authorized_count <> v_circle_count then
    raise exception 'You must be a current member of every selected Circle';
  end if;

  if length(v_title) < 1 or length(v_title) > 120 then
    raise exception 'Event title must be between 1 and 120 characters';
  end if;

  if length(v_description) > 2000 then
    raise exception 'Event description is too long';
  end if;

  if length(v_location) > 240 then
    raise exception 'Event location is too long';
  end if;

  if p_starts_at is null then
    raise exception 'Event start time is required';
  end if;

  if p_starts_at < now() - interval '15 minutes' then
    raise exception 'Event start time must be in the future';
  end if;

  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'Event end time must be after the start time';
  end if;

  if v_guest_cap < 0 or v_guest_cap > 50 then
    raise exception 'Outside guest limit must be between 0 and 50';
  end if;

  if v_guest_cap = 0 then
    p_members_can_invite_guests := false;
    p_allow_plus_ones := false;
  end if;

  insert into public.events (
    host_id,
    title,
    description,
    starts_at,
    ends_at,
    location_name,
    outside_guest_cap,
    members_can_invite_guests,
    allow_plus_ones
  )
  values (
    v_viewer_id,
    v_title,
    v_description,
    p_starts_at,
    p_ends_at,
    v_location,
    v_guest_cap,
    coalesce(p_members_can_invite_guests, false),
    coalesce(p_allow_plus_ones, false)
  )
  returning id into v_event_id;

  insert into public.event_circles (
    event_id,
    conversation_id,
    added_by
  )
  select
    v_event_id,
    selected_circle_id,
    v_viewer_id
  from unnest(v_circle_ids) selected_circle_id;

  insert into public.event_rsvps (
    event_id,
    user_id,
    status
  )
  values (
    v_event_id,
    v_viewer_id,
    'going'
  );

  return jsonb_build_object(
    'event_id', v_event_id,
    'circle_count', v_circle_count,
    'outside_guest_cap', v_guest_cap
  );
end;
$$;

revoke all on function public.create_multi_circle_event(
  uuid[], text, text, timestamptz, timestamptz, text, integer, boolean, boolean
) from public;
grant execute on function public.create_multi_circle_event(
  uuid[], text, text, timestamptz, timestamptz, text, integer, boolean, boolean
) to authenticated;

drop function if exists public.create_circle_event(
  uuid, text, text, timestamptz, timestamptz, text
);
drop function if exists public.create_circle_event(
  uuid, text, text, timestamptz, timestamptz, text, integer, boolean, boolean
);

create function public.create_circle_event(
  p_conversation_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_location_name text default '',
  p_outside_guest_cap integer default 0,
  p_members_can_invite_guests boolean default false,
  p_allow_plus_ones boolean default false
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.create_multi_circle_event(
    array[p_conversation_id],
    p_title,
    p_description,
    p_starts_at,
    p_ends_at,
    p_location_name,
    p_outside_guest_cap,
    p_members_can_invite_guests,
    p_allow_plus_ones
  );
$$;

revoke all on function public.create_circle_event(
  uuid, text, text, timestamptz, timestamptz, text, integer, boolean, boolean
) from public;
grant execute on function public.create_circle_event(
  uuid, text, text, timestamptz, timestamptz, text, integer, boolean, boolean
) to authenticated;

create or replace function public.get_event_details(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_circle_id uuid;
  v_circle_name text;
  v_circles jsonb := '[]'::jsonb;
  v_circle_count integer := 0;
  v_host_name text;
  v_host_avatar text;
  v_guest_count integer := 0;
  v_guest_going integer := 0;
  v_guest_maybe integer := 0;
  v_guest_invited integer := 0;
  v_guest_not_going integer := 0;
  v_guests jsonb := '[]'::jsonb;
  v_result jsonb;
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

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'conversation_id', conversation_row.id,
          'name', coalesce(nullif(btrim(conversation_row.title), ''), 'Circle')
        )
        order by event_circle.created_at, conversation_row.id
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_circles, v_circle_count
  from public.event_circles event_circle
  join public.conversations conversation_row
    on conversation_row.id = event_circle.conversation_id
  where event_circle.event_id = p_event_id;

  if v_circle_count > 0 then
    v_circle_id := (v_circles->0->>'conversation_id')::uuid;
    v_circle_name := v_circles->0->>'name';
  end if;

  select
    coalesce(user_row.display_name, 'Circle member'),
    user_row.avatar_url
  into v_host_name, v_host_avatar
  from public.users user_row
  where user_row.id = v_event.host_id;

  select
    count(*)::integer,
    count(*) filter (where guest_row.status = 'going')::integer,
    count(*) filter (where guest_row.status = 'maybe')::integer,
    count(*) filter (where guest_row.status = 'invited')::integer,
    count(*) filter (where guest_row.status = 'not_going')::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', guest_row.id,
          'display_name', guest_row.display_name,
          'guest_type', guest_row.guest_type,
          'status', guest_row.status,
          'responded_at', guest_row.responded_at,
          'invited_by_name', coalesce(inviter.display_name, 'Circle member'),
          'can_manage', (
            v_event.host_id = auth.uid()
            or guest_row.invited_by_user_id = auth.uid()
          )
        )
        order by
          case guest_row.status
            when 'going' then 0
            when 'maybe' then 1
            when 'invited' then 2
            else 3
          end,
          lower(guest_row.display_name),
          guest_row.id
      ),
      '[]'::jsonb
    )
  into
    v_guest_count,
    v_guest_going,
    v_guest_maybe,
    v_guest_invited,
    v_guest_not_going,
    v_guests
  from public.event_guests guest_row
  left join public.users inviter on inviter.id = guest_row.invited_by_user_id
  where guest_row.event_id = p_event_id;

  with eligible_users as (
    select distinct member_row.user_id
    from public.event_circles event_circle
    join public.conversation_members member_row
      on member_row.conversation_id = event_circle.conversation_id
    where event_circle.event_id = p_event_id
  ),
  attendee_rows as (
    select
      eligible.user_id,
      coalesce(user_row.display_name, 'Circle member') as display_name,
      user_row.avatar_url,
      coalesce(rsvp.status, 'pending') as rsvp_status,
      rsvp.responded_at,
      eligible.user_id = v_event.host_id as is_host,
      eligible.user_id = auth.uid() as is_me,
      case coalesce(rsvp.status, 'pending')
        when 'going' then 0
        when 'maybe' then 1
        when 'pending' then 2
        else 3
      end as status_order
    from eligible_users eligible
    join public.users user_row on user_row.id = eligible.user_id
    left join public.event_rsvps rsvp
      on rsvp.event_id = p_event_id
     and rsvp.user_id = eligible.user_id
  )
  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_event.id,
      'title', v_event.title,
      'description', v_event.description,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at,
      'location_name', v_event.location_name,
      'status', v_event.status,
      'host_id', v_event.host_id,
      'host_name', v_host_name,
      'host_avatar', v_host_avatar,
      'circle_id', v_circle_id,
      'circle_name', coalesce(v_circle_name, 'Circle'),
      'circle_count', greatest(v_circle_count, 1),
      'circles', v_circles,
      'viewer_rsvp_status', coalesce(
        (select row_data.rsvp_status from attendee_rows row_data where row_data.is_me limit 1),
        'pending'
      ),
      'can_manage', v_event.host_id = auth.uid(),
      'outside_guest_cap', v_event.outside_guest_cap,
      'members_can_invite_guests', v_event.members_can_invite_guests,
      'allow_plus_ones', v_event.allow_plus_ones,
      'guest_count', v_guest_count,
      'remaining_guest_slots', greatest(v_event.outside_guest_cap - v_guest_count, 0),
      'can_add_guests', (
        v_event.outside_guest_cap > v_guest_count
        and (
          v_event.host_id = auth.uid()
          or v_event.members_can_invite_guests
        )
      ),
      'created_at', v_event.created_at
    ),
    'counts', jsonb_build_object(
      'attendee_count', count(*)::integer,
      'going', count(*) filter (where attendee_rows.rsvp_status = 'going')::integer,
      'maybe', count(*) filter (where attendee_rows.rsvp_status = 'maybe')::integer,
      'not_going', count(*) filter (where attendee_rows.rsvp_status = 'not_going')::integer,
      'pending', count(*) filter (where attendee_rows.rsvp_status = 'pending')::integer,
      'guest_count', v_guest_count,
      'guest_going', v_guest_going,
      'guest_maybe', v_guest_maybe,
      'guest_invited', v_guest_invited,
      'guest_not_going', v_guest_not_going
    ),
    'attendees', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', attendee_rows.user_id,
          'display_name', attendee_rows.display_name,
          'avatar_url', attendee_rows.avatar_url,
          'rsvp_status', attendee_rows.rsvp_status,
          'responded_at', attendee_rows.responded_at,
          'is_host', attendee_rows.is_host,
          'is_me', attendee_rows.is_me
        )
        order by attendee_rows.status_order, attendee_rows.display_name, attendee_rows.user_id
      ),
      '[]'::jsonb
    ),
    'guests', v_guests
  )
  into v_result
  from attendee_rows;

  return v_result;
end;
$$;

revoke all on function public.get_event_details(uuid) from public;
grant execute on function public.get_event_details(uuid) to authenticated;

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

  return jsonb_build_object(
    'outside_guest_cap', v_guest_cap,
    'members_can_invite_guests', coalesce(p_members_can_invite_guests, false),
    'allow_plus_ones', coalesce(p_allow_plus_ones, false)
  );
end;
$$;

revoke all on function public.update_event_guest_settings(uuid, integer, boolean, boolean) from public;
grant execute on function public.update_event_guest_settings(uuid, integer, boolean, boolean) to authenticated;

-- Remote control for the named outside-guest slice.
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
      'event_outside_guests'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'event_outside_guests',
  true,
  'Allows controlled named outside guests and plus-ones within host-set limits.'
)
on conflict (flag_key) do nothing;

-- Extend the privacy-safe analytics allowlist. Guest names, user IDs, event IDs,
-- Circle IDs, and invitation details are never accepted as properties.
create or replace function public.track_app_event(
  p_event_name text,
  p_properties jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_name text := nullif(btrim(p_event_name), '');
  v_input jsonb := case
    when jsonb_typeof(coalesce(p_properties, '{}'::jsonb)) = 'object'
      then coalesce(p_properties, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_clean jsonb;
  v_analytics_enabled boolean := true;
  v_candidate_count integer;
  v_request_count integer;
  v_connection_count integer;
  v_mutual_connection_count integer;
  v_shared_circle_count integer;
  v_invitation_count integer;
  v_option_count integer;
  v_selected_count integer;
  v_circle_count integer;
  v_guest_cap integer;
begin
  select coalesce(flag_row.enabled, true)
  into v_analytics_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'launch_analytics';

  if not coalesce(v_analytics_enabled, true) then
    return false;
  end if;

  if v_event_name is null or v_event_name not in (
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
    'event_guest_settings_updated'
  ) then
    return false;
  end if;

  if coalesce(v_input->>'candidate_count', '') ~ '^[0-9]{1,6}$' then
    v_candidate_count := least((v_input->>'candidate_count')::integer, 10000);
  end if;
  if coalesce(v_input->>'request_count', '') ~ '^[0-9]{1,6}$' then
    v_request_count := least((v_input->>'request_count')::integer, 10000);
  end if;
  if coalesce(v_input->>'connection_count', '') ~ '^[0-9]{1,6}$' then
    v_connection_count := least((v_input->>'connection_count')::integer, 10000);
  end if;
  if coalesce(v_input->>'mutual_connection_count', '') ~ '^[0-9]{1,6}$' then
    v_mutual_connection_count := least((v_input->>'mutual_connection_count')::integer, 10000);
  end if;
  if coalesce(v_input->>'shared_circle_count', '') ~ '^[0-9]{1,6}$' then
    v_shared_circle_count := least((v_input->>'shared_circle_count')::integer, 10000);
  end if;
  if coalesce(v_input->>'invitation_count', '') ~ '^[0-9]{1,6}$' then
    v_invitation_count := least((v_input->>'invitation_count')::integer, 100);
  end if;
  if coalesce(v_input->>'option_count', '') ~ '^[0-9]{1,2}$' then
    v_option_count := least((v_input->>'option_count')::integer, 20);
  end if;
  if coalesce(v_input->>'selected_count', '') ~ '^[0-9]{1,2}$' then
    v_selected_count := least((v_input->>'selected_count')::integer, 20);
  end if;
  if coalesce(v_input->>'circle_count', '') ~ '^[0-9]{1,2}$' then
    v_circle_count := least((v_input->>'circle_count')::integer, 20);
  end if;
  if coalesce(v_input->>'guest_cap', '') ~ '^[0-9]{1,2}$' then
    v_guest_cap := least((v_input->>'guest_cap')::integer, 50);
  end if;

  v_clean := jsonb_strip_nulls(jsonb_build_object(
    'invite_kind', case when v_input->>'invite_kind' in ('personal', 'circle') then v_input->>'invite_kind' else null end,
    'surface', case when v_input->>'surface' in (
      'invite_people', 'circle_people', 'invitation_landing', 'mutuals',
      'preconnection_profile', 'profile', 'circle_events', 'create_event',
      'event_detail', 'create_event_poll', 'event_poll_detail',
      'add_event_guest', 'event_guest_settings'
    ) then v_input->>'surface' else null end,
    'delivery', case when v_input->>'delivery' in ('share_sheet', 'sms', 'share_fallback') then v_input->>'delivery' else null end,
    'outcome', case when v_input->>'outcome' in (
      'request_created', 'request_exists', 'already_connected',
      'circle_invitation_created', 'circle_invitation_exists', 'already_member',
      'sent', 'cancelled', 'unknown'
    ) then v_input->>'outcome' else null end,
    'reason', case when v_input->>'reason' in (
      'not_found', 'expired', 'revoked', 'used_up', 'circle_unavailable',
      'inviter_no_longer_can_invite'
    ) then v_input->>'reason' else null end,
    'action', case when v_input->>'action' in (
      'set', 'clear', 'accept', 'decline', 'add', 'remove', 'update'
    ) then v_input->>'action' else null end,
    'request_state', case when v_input->>'request_state' in ('none', 'incoming', 'outgoing') then v_input->>'request_state' else null end,
    'rsvp_status', case when v_input->>'rsvp_status' in ('pending', 'going', 'maybe', 'not_going') then v_input->>'rsvp_status' else null end,
    'guest_status', case when v_input->>'guest_status' in ('invited', 'going', 'maybe', 'not_going') then v_input->>'guest_status' else null end,
    'guest_type', case when v_input->>'guest_type' in ('guest', 'plus_one') then v_input->>'guest_type' else null end,
    'invite_mode', case when v_input->>'invite_mode' in ('host_only', 'members') then v_input->>'invite_mode' else null end,
    'poll_status', case when v_input->>'poll_status' in ('open', 'finalized', 'cancelled') then v_input->>'poll_status' else null end,
    'platform', case when v_input->>'platform' in ('ios', 'android', 'web', 'windows', 'macos') then v_input->>'platform' else null end,
    'app_mode', case when v_input->>'app_mode' in ('development', 'production') then v_input->>'app_mode' else null end,
    'valid', case when lower(coalesce(v_input->>'valid', '')) in ('true', 'false') then (v_input->>'valid')::boolean else null end,
    'has_preview', case when lower(coalesce(v_input->>'has_preview', '')) in ('true', 'false') then (v_input->>'has_preview')::boolean else null end,
    'has_mutual_contact', case when lower(coalesce(v_input->>'has_mutual_contact', '')) in ('true', 'false') then (v_input->>'has_mutual_contact')::boolean else null end,
    'has_location', case when lower(coalesce(v_input->>'has_location', '')) in ('true', 'false') then (v_input->>'has_location')::boolean else null end,
    'has_description', case when lower(coalesce(v_input->>'has_description', '')) in ('true', 'false') then (v_input->>'has_description')::boolean else null end,
    'none_available', case when lower(coalesce(v_input->>'none_available', '')) in ('true', 'false') then (v_input->>'none_available')::boolean else null end,
    'allow_plus_ones', case when lower(coalesce(v_input->>'allow_plus_ones', '')) in ('true', 'false') then (v_input->>'allow_plus_ones')::boolean else null end,
    'candidate_count', v_candidate_count,
    'request_count', v_request_count,
    'connection_count', v_connection_count,
    'mutual_connection_count', v_mutual_connection_count,
    'shared_circle_count', v_shared_circle_count,
    'invitation_count', v_invitation_count,
    'option_count', v_option_count,
    'selected_count', v_selected_count,
    'circle_count', v_circle_count,
    'guest_cap', v_guest_cap
  ));

  insert into public.app_analytics_events (event_name, actor_id, properties)
  values (v_event_name, auth.uid(), v_clean);

  return true;
end;
$$;

revoke all on function public.track_app_event(text, jsonb) from public;
grant execute on function public.track_app_event(text, jsonb) to anon, authenticated;

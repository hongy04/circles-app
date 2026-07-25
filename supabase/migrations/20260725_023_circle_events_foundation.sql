-- Circles Phase 2A — private Circle event foundation
--
-- Adds events that are attached to one or more private Circles, app-user RSVP
-- states, privacy-enforcing RPCs, a remote feature control, and narrow event
-- analytics. This first client slice creates an event from one Circle, while
-- the schema is intentionally ready for multi-Circle events later.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references public.users(id) on delete set null,
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location_name text not null default '',
  status text not null default 'scheduled' check (
    status in ('scheduled', 'cancelled', 'completed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_length_check check (
    length(btrim(title)) between 1 and 120
  ),
  constraint events_description_length_check check (
    length(description) <= 2000
  ),
  constraint events_location_length_check check (
    length(location_name) <= 240
  ),
  constraint events_time_order_check check (
    ends_at is null or ends_at > starts_at
  )
);

create index if not exists events_starts_at_index
  on public.events (starts_at, id);

create index if not exists events_host_created_index
  on public.events (host_id, created_at desc);

create table if not exists public.event_circles (
  event_id uuid not null references public.events(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  added_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, conversation_id)
);

create index if not exists event_circles_conversation_index
  on public.event_circles (conversation_id, event_id);

create table if not exists public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null check (status in ('going', 'maybe', 'not_going')),
  responded_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_rsvps_user_index
  on public.event_rsvps (user_id, responded_at desc);

alter table public.events enable row level security;
alter table public.event_circles enable row level security;
alter table public.event_rsvps enable row level security;

-- No direct table policies are exposed. Event access is mediated through the
-- security-definer functions below so shared Circle membership is checked in
-- one place and can expand safely when multi-Circle events arrive.

create or replace function public.event_viewer_can_access(
  p_event_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.event_circles event_circle
      join public.conversation_members member_row
        on member_row.conversation_id = event_circle.conversation_id
       and member_row.user_id = p_user_id
      where event_circle.event_id = p_event_id
    );
$$;

revoke all on function public.event_viewer_can_access(uuid, uuid) from public;
grant execute on function public.event_viewer_can_access(uuid, uuid) to authenticated;

create or replace function public.create_circle_event(
  p_conversation_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_location_name text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_event_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_location text := btrim(coalesce(p_location_name, ''));
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.conversations conversation_row
    join public.conversation_members member_row
      on member_row.conversation_id = conversation_row.id
     and member_row.user_id = v_viewer_id
    where conversation_row.id = p_conversation_id
      and conversation_row.kind = 'group'
  ) then
    raise exception 'Only current Circle members can create an event';
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

  insert into public.events (
    host_id,
    title,
    description,
    starts_at,
    ends_at,
    location_name
  )
  values (
    v_viewer_id,
    v_title,
    v_description,
    p_starts_at,
    p_ends_at,
    v_location
  )
  returning id into v_event_id;

  insert into public.event_circles (
    event_id,
    conversation_id,
    added_by
  )
  values (
    v_event_id,
    p_conversation_id,
    v_viewer_id
  );

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

  return jsonb_build_object('event_id', v_event_id);
end;
$$;

revoke all on function public.create_circle_event(uuid, text, text, timestamptz, timestamptz, text) from public;
grant execute on function public.create_circle_event(uuid, text, text, timestamptz, timestamptz, text) to authenticated;

create or replace function public.list_circle_events(p_conversation_id uuid)
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
  pending_count integer
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
    coalesce(counts.pending_count, 0)
  from linked_events linked
  join public.events event_row on event_row.id = linked.event_id
  left join public.users host_user on host_user.id = event_row.host_id
  left join public.event_rsvps viewer_rsvp
    on viewer_rsvp.event_id = event_row.id
   and viewer_rsvp.user_id = auth.uid()
  left join response_counts counts on counts.event_id = event_row.id
  order by
    case when event_row.starts_at >= now() then 0 else 1 end,
    case when event_row.starts_at >= now() then event_row.starts_at end asc,
    case when event_row.starts_at < now() then event_row.starts_at end desc;
end;
$$;

revoke all on function public.list_circle_events(uuid) from public;
grant execute on function public.list_circle_events(uuid) to authenticated;

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
  v_host_name text;
  v_host_avatar text;
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
    conversation_row.id,
    coalesce(nullif(btrim(conversation_row.title), ''), 'Circle')
  into v_circle_id, v_circle_name
  from public.event_circles event_circle
  join public.conversations conversation_row
    on conversation_row.id = event_circle.conversation_id
  where event_circle.event_id = p_event_id
  order by event_circle.created_at, conversation_row.id
  limit 1;

  select
    coalesce(user_row.display_name, 'Circle member'),
    user_row.avatar_url
  into v_host_name, v_host_avatar
  from public.users user_row
  where user_row.id = v_event.host_id;

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
      'circle_name', v_circle_name,
      'viewer_rsvp_status', coalesce(
        (select row_data.rsvp_status from attendee_rows row_data where row_data.is_me limit 1),
        'pending'
      ),
      'can_manage', v_event.host_id = auth.uid(),
      'created_at', v_event.created_at
    ),
    'counts', jsonb_build_object(
      'attendee_count', count(*)::integer,
      'going', count(*) filter (where attendee_rows.rsvp_status = 'going')::integer,
      'maybe', count(*) filter (where attendee_rows.rsvp_status = 'maybe')::integer,
      'not_going', count(*) filter (where attendee_rows.rsvp_status = 'not_going')::integer,
      'pending', count(*) filter (where attendee_rows.rsvp_status = 'pending')::integer
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
    )
  )
  into v_result
  from attendee_rows;

  return v_result;
end;
$$;

revoke all on function public.get_event_details(uuid) from public;
grant execute on function public.get_event_details(uuid) to authenticated;

create or replace function public.respond_to_event(
  p_event_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_status not in ('going', 'maybe', 'not_going') then
    raise exception 'RSVP must be Going, Maybe, or Not Going';
  end if;

  if not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  if exists (
    select 1
    from public.events event_row
    where event_row.id = p_event_id
      and event_row.status = 'cancelled'
  ) then
    raise exception 'This event has been cancelled';
  end if;

  insert into public.event_rsvps (
    event_id,
    user_id,
    status,
    responded_at
  )
  values (
    p_event_id,
    auth.uid(),
    p_status,
    now()
  )
  on conflict (event_id, user_id)
  do update set
    status = excluded.status,
    responded_at = excluded.responded_at;

  return jsonb_build_object('status', p_status);
end;
$$;

revoke all on function public.respond_to_event(uuid, text) from public;
grant execute on function public.respond_to_event(uuid, text) to authenticated;

-- Remote control for the first event slice.
alter table public.app_feature_flags
  drop constraint if exists app_feature_flags_key_check;

alter table public.app_feature_flags
  add constraint app_feature_flags_key_check check (
    flag_key in (
      'launch_invitations',
      'mutual_preview_posts',
      'preconnection_profile_shell',
      'launch_analytics',
      'circle_events'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'circle_events',
  true,
  'Allows private Circle members to create events and RSVP.'
)
on conflict (flag_key) do nothing;

-- Extend the privacy-safe analytics allowlist with aggregate event actions.
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
      'event_rsvp_updated'
    )
  );

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
    'event_rsvp_updated'
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
    v_mutual_connection_count := least(
      (v_input->>'mutual_connection_count')::integer,
      10000
    );
  end if;

  if coalesce(v_input->>'shared_circle_count', '') ~ '^[0-9]{1,6}$' then
    v_shared_circle_count := least(
      (v_input->>'shared_circle_count')::integer,
      10000
    );
  end if;

  if coalesce(v_input->>'invitation_count', '') ~ '^[0-9]{1,6}$' then
    v_invitation_count := least((v_input->>'invitation_count')::integer, 100);
  end if;

  v_clean := jsonb_strip_nulls(jsonb_build_object(
    'invite_kind', case
      when v_input->>'invite_kind' in ('personal', 'circle')
        then v_input->>'invite_kind'
      else null
    end,
    'surface', case
      when v_input->>'surface' in (
        'invite_people',
        'circle_people',
        'invitation_landing',
        'mutuals',
        'preconnection_profile',
        'profile',
        'circle_events',
        'create_event',
        'event_detail'
      ) then v_input->>'surface'
      else null
    end,
    'delivery', case
      when v_input->>'delivery' in ('share_sheet', 'sms', 'share_fallback')
        then v_input->>'delivery'
      else null
    end,
    'outcome', case
      when v_input->>'outcome' in (
        'request_created',
        'request_exists',
        'already_connected',
        'circle_invitation_created',
        'circle_invitation_exists',
        'already_member',
        'sent',
        'cancelled',
        'unknown'
      ) then v_input->>'outcome'
      else null
    end,
    'reason', case
      when v_input->>'reason' in (
        'not_found',
        'expired',
        'revoked',
        'used_up',
        'circle_unavailable',
        'inviter_no_longer_can_invite'
      ) then v_input->>'reason'
      else null
    end,
    'action', case
      when v_input->>'action' in ('set', 'clear', 'accept', 'decline')
        then v_input->>'action'
      else null
    end,
    'request_state', case
      when v_input->>'request_state' in ('none', 'incoming', 'outgoing')
        then v_input->>'request_state'
      else null
    end,
    'rsvp_status', case
      when v_input->>'rsvp_status' in ('pending', 'going', 'maybe', 'not_going')
        then v_input->>'rsvp_status'
      else null
    end,
    'platform', case
      when v_input->>'platform' in ('ios', 'android', 'web', 'windows', 'macos')
        then v_input->>'platform'
      else null
    end,
    'app_mode', case
      when v_input->>'app_mode' in ('development', 'production')
        then v_input->>'app_mode'
      else null
    end,
    'valid', case
      when lower(coalesce(v_input->>'valid', '')) in ('true', 'false')
        then (v_input->>'valid')::boolean
      else null
    end,
    'has_preview', case
      when lower(coalesce(v_input->>'has_preview', '')) in ('true', 'false')
        then (v_input->>'has_preview')::boolean
      else null
    end,
    'has_mutual_contact', case
      when lower(coalesce(v_input->>'has_mutual_contact', '')) in ('true', 'false')
        then (v_input->>'has_mutual_contact')::boolean
      else null
    end,
    'has_location', case
      when lower(coalesce(v_input->>'has_location', '')) in ('true', 'false')
        then (v_input->>'has_location')::boolean
      else null
    end,
    'has_description', case
      when lower(coalesce(v_input->>'has_description', '')) in ('true', 'false')
        then (v_input->>'has_description')::boolean
      else null
    end,
    'candidate_count', v_candidate_count,
    'request_count', v_request_count,
    'connection_count', v_connection_count,
    'mutual_connection_count', v_mutual_connection_count,
    'shared_circle_count', v_shared_circle_count,
    'invitation_count', v_invitation_count
  ));

  insert into public.app_analytics_events (
    event_name,
    actor_id,
    properties
  )
  values (
    v_event_name,
    auth.uid(),
    v_clean
  );

  return true;
end;
$$;

revoke all on function public.track_app_event(text, jsonb) from public;
grant execute on function public.track_app_event(text, jsonb) to anon, authenticated;

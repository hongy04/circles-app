-- Circles Phase 2C — multi-Circle events
--
-- Lets one private event be attached to multiple existing group Circles. The
-- creator must be a current member of every selected Circle. Event access and
-- RSVP eligibility are the deduplicated union of those Circle memberships.

create or replace function public.create_multi_circle_event(
  p_conversation_ids uuid[],
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
  v_circle_ids uuid[];
  v_circle_count integer := 0;
  v_authorized_count integer := 0;
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
    'circle_count', v_circle_count
  );
end;
$$;

revoke all on function public.create_multi_circle_event(uuid[], text, text, timestamptz, timestamptz, text) from public;
grant execute on function public.create_multi_circle_event(uuid[], text, text, timestamptz, timestamptz, text) to authenticated;

-- Keep the original one-Circle RPC as a stable wrapper for older clients and
-- availability-poll finalization.
create or replace function public.create_circle_event(
  p_conversation_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_location_name text default ''
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
    p_location_name
  );
$$;

revoke all on function public.create_circle_event(uuid, text, text, timestamptz, timestamptz, text) from public;
grant execute on function public.create_circle_event(uuid, text, text, timestamptz, timestamptz, text) to authenticated;

-- The event summary now reports how many Circles share the event.
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
  circle_count integer
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
    coalesce(circle_totals.circle_count, 1)
  from linked_events linked
  join public.events event_row on event_row.id = linked.event_id
  left join public.users host_user on host_user.id = event_row.host_id
  left join public.event_rsvps viewer_rsvp
    on viewer_rsvp.event_id = event_row.id
   and viewer_rsvp.user_id = auth.uid()
  left join response_counts counts on counts.event_id = event_row.id
  left join circle_counts circle_totals on circle_totals.event_id = event_row.id
  order by
    case when event_row.starts_at >= now() then 0 else 1 end,
    case when event_row.starts_at >= now() then event_row.starts_at end asc,
    case when event_row.starts_at < now() then event_row.starts_at end desc;
end;
$$;

revoke all on function public.list_circle_events(uuid) from public;
grant execute on function public.list_circle_events(uuid) to authenticated;

-- Event details expose only the names of Circles explicitly linked to this
-- event. This gives invitees necessary event context without profile access.
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

-- Independent remote control for combining existing Circles in one event.
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
      'multi_circle_events'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'multi_circle_events',
  true,
  'Allows one private event to include multiple existing group Circles.'
)
on conflict (flag_key) do nothing;

-- Add an aggregate Circle count to the existing privacy-safe analytics RPC.
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
    'event_poll_finalized'
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

  if coalesce(v_input->>'option_count', '') ~ '^[0-9]{1,2}$' then
    v_option_count := least((v_input->>'option_count')::integer, 20);
  end if;

  if coalesce(v_input->>'selected_count', '') ~ '^[0-9]{1,2}$' then
    v_selected_count := least((v_input->>'selected_count')::integer, 20);
  end if;

  if coalesce(v_input->>'circle_count', '') ~ '^[0-9]{1,2}$' then
    v_circle_count := least((v_input->>'circle_count')::integer, 20);
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
        'event_detail',
        'create_event_poll',
        'event_poll_detail'
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
    'poll_status', case
      when v_input->>'poll_status' in ('open', 'finalized', 'cancelled')
        then v_input->>'poll_status'
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
    'none_available', case
      when lower(coalesce(v_input->>'none_available', '')) in ('true', 'false')
        then (v_input->>'none_available')::boolean
      else null
    end,
    'candidate_count', v_candidate_count,
    'request_count', v_request_count,
    'connection_count', v_connection_count,
    'mutual_connection_count', v_mutual_connection_count,
    'shared_circle_count', v_shared_circle_count,
    'invitation_count', v_invitation_count,
    'option_count', v_option_count,
    'selected_count', v_selected_count,
    'circle_count', v_circle_count
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

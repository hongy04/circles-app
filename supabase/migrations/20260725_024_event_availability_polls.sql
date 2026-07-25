-- Circles Phase 2B — private event availability polls
--
-- Lets a current Circle member propose 2–6 possible times, lets each current
-- member privately mark every option that works, and lets the poll host
-- finalize exactly one option into a normal private Circle event. Availability
-- is not treated as an RSVP: after finalization, only the host is automatically
-- Going and every other member still answers the event for themselves.

create table if not exists public.event_availability_polls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  host_id uuid references public.users(id) on delete set null,
  title text not null,
  description text not null default '',
  location_name text not null default '',
  status text not null default 'open' check (
    status in ('open', 'finalized', 'cancelled')
  ),
  finalized_option_id uuid,
  finalized_event_id uuid references public.events(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_availability_polls_title_length_check check (
    length(btrim(title)) between 1 and 120
  ),
  constraint event_availability_polls_description_length_check check (
    length(description) <= 2000
  ),
  constraint event_availability_polls_location_length_check check (
    length(location_name) <= 240
  )
);

create index if not exists event_availability_polls_circle_index
  on public.event_availability_polls (conversation_id, created_at desc);

create index if not exists event_availability_polls_status_index
  on public.event_availability_polls (status, created_at desc);

create table if not exists public.event_availability_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.event_availability_polls(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  constraint event_availability_options_time_order_check check (
    ends_at is null or ends_at > starts_at
  ),
  constraint event_availability_options_sort_order_check check (
    sort_order between 0 and 20
  ),
  constraint event_availability_options_poll_start_unique unique (poll_id, starts_at),
  constraint event_availability_options_poll_id_id_unique unique (poll_id, id)
);

create index if not exists event_availability_options_poll_index
  on public.event_availability_options (poll_id, sort_order, starts_at);

alter table public.event_availability_polls
  drop constraint if exists event_availability_polls_finalized_option_fkey;

alter table public.event_availability_polls
  add constraint event_availability_polls_finalized_option_fkey
  foreign key (finalized_option_id)
  references public.event_availability_options(id)
  on delete set null;

create table if not exists public.event_availability_responses (
  poll_id uuid not null references public.event_availability_polls(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  responded_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create index if not exists event_availability_responses_user_index
  on public.event_availability_responses (user_id, responded_at desc);

create table if not exists public.event_availability_votes (
  poll_id uuid not null,
  option_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, option_id, user_id),
  constraint event_availability_votes_option_fkey
    foreign key (poll_id, option_id)
    references public.event_availability_options(poll_id, id)
    on delete cascade,
  constraint event_availability_votes_response_fkey
    foreign key (poll_id, user_id)
    references public.event_availability_responses(poll_id, user_id)
    on delete cascade
);

create index if not exists event_availability_votes_user_index
  on public.event_availability_votes (user_id, poll_id);

alter table public.event_availability_polls enable row level security;
alter table public.event_availability_options enable row level security;
alter table public.event_availability_responses enable row level security;
alter table public.event_availability_votes enable row level security;

-- No direct policies are exposed. Every read and write below independently
-- verifies current membership in the poll's private Circle.

create or replace function public.event_poll_viewer_can_access(
  p_poll_id uuid,
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
      from public.event_availability_polls poll_row
      join public.conversation_members member_row
        on member_row.conversation_id = poll_row.conversation_id
       and member_row.user_id = p_user_id
      where poll_row.id = p_poll_id
    );
$$;

revoke all on function public.event_poll_viewer_can_access(uuid, uuid) from public;
grant execute on function public.event_poll_viewer_can_access(uuid, uuid) to authenticated;

create or replace function public.create_event_availability_poll(
  p_conversation_id uuid,
  p_title text,
  p_description text,
  p_location_name text,
  p_options jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_poll_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_location text := btrim(coalesce(p_location_name, ''));
  v_option_count integer;
  v_option jsonb;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_sort_order integer := 0;
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
    raise exception 'Only current Circle members can create an availability poll';
  end if;

  if length(v_title) < 1 or length(v_title) > 120 then
    raise exception 'Poll title must be between 1 and 120 characters';
  end if;

  if length(v_description) > 2000 then
    raise exception 'Poll description is too long';
  end if;

  if length(v_location) > 240 then
    raise exception 'Poll location is too long';
  end if;

  if jsonb_typeof(coalesce(p_options, 'null'::jsonb)) <> 'array' then
    raise exception 'Availability options are required';
  end if;

  v_option_count := jsonb_array_length(p_options);
  if v_option_count < 2 or v_option_count > 6 then
    raise exception 'Choose between 2 and 6 possible times';
  end if;

  -- Validate every option before creating any records.
  for v_option in select value from jsonb_array_elements(p_options)
  loop
    begin
      v_starts_at := nullif(v_option->>'starts_at', '')::timestamptz;
      v_ends_at := nullif(v_option->>'ends_at', '')::timestamptz;
    exception when others then
      raise exception 'One of the proposed times is invalid';
    end;

    if v_starts_at is null then
      raise exception 'Every option needs a start time';
    end if;

    if v_starts_at < now() - interval '15 minutes' then
      raise exception 'Every proposed time must be in the future';
    end if;

    if v_ends_at is not null and v_ends_at <= v_starts_at then
      raise exception 'Each option end time must be after its start time';
    end if;
  end loop;

  insert into public.event_availability_polls (
    conversation_id,
    host_id,
    title,
    description,
    location_name
  )
  values (
    p_conversation_id,
    v_viewer_id,
    v_title,
    v_description,
    v_location
  )
  returning id into v_poll_id;

  for v_option in select value from jsonb_array_elements(p_options)
  loop
    v_starts_at := nullif(v_option->>'starts_at', '')::timestamptz;
    v_ends_at := nullif(v_option->>'ends_at', '')::timestamptz;

    insert into public.event_availability_options (
      poll_id,
      starts_at,
      ends_at,
      sort_order
    )
    values (
      v_poll_id,
      v_starts_at,
      v_ends_at,
      v_sort_order
    );

    v_sort_order := v_sort_order + 1;
  end loop;

  return jsonb_build_object(
    'poll_id', v_poll_id,
    'option_count', v_option_count
  );
exception
  when unique_violation then
    raise exception 'Each proposed start time must be different';
end;
$$;

revoke all on function public.create_event_availability_poll(uuid, text, text, text, jsonb) from public;
grant execute on function public.create_event_availability_poll(uuid, text, text, text, jsonb) to authenticated;

create or replace function public.list_circle_event_polls(p_conversation_id uuid)
returns table (
  poll_id uuid,
  title text,
  description text,
  location_name text,
  poll_status text,
  host_id uuid,
  host_name text,
  host_avatar text,
  option_count integer,
  response_count integer,
  member_count integer,
  viewer_responded boolean,
  first_option_starts_at timestamptz,
  finalized_event_id uuid,
  created_at timestamptz
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
  select
    poll_row.id,
    poll_row.title,
    poll_row.description,
    poll_row.location_name,
    poll_row.status,
    host_user.id,
    coalesce(host_user.display_name, 'Circle member'),
    host_user.avatar_url,
    (select count(*)::integer
       from public.event_availability_options option_row
      where option_row.poll_id = poll_row.id),
    (select count(*)::integer
       from public.event_availability_responses response_row
      where response_row.poll_id = poll_row.id),
    (select count(*)::integer
       from public.conversation_members member_count_row
      where member_count_row.conversation_id = poll_row.conversation_id),
    exists (
      select 1
      from public.event_availability_responses viewer_response
      where viewer_response.poll_id = poll_row.id
        and viewer_response.user_id = auth.uid()
    ),
    (select min(option_row.starts_at)
       from public.event_availability_options option_row
      where option_row.poll_id = poll_row.id),
    poll_row.finalized_event_id,
    poll_row.created_at
  from public.event_availability_polls poll_row
  left join public.users host_user on host_user.id = poll_row.host_id
  where poll_row.conversation_id = p_conversation_id
    and poll_row.status <> 'cancelled'
  order by
    case poll_row.status when 'open' then 0 else 1 end,
    poll_row.created_at desc;
end;
$$;

revoke all on function public.list_circle_event_polls(uuid) from public;
grant execute on function public.list_circle_event_polls(uuid) to authenticated;

create or replace function public.get_event_availability_poll(p_poll_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_poll public.event_availability_polls%rowtype;
  v_circle_name text;
  v_host_name text;
  v_host_avatar text;
  v_member_count integer;
  v_response_count integer;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.event_poll_viewer_can_access(p_poll_id, auth.uid()) then
    raise exception 'Availability poll not found or unavailable';
  end if;

  select poll_row.*
  into v_poll
  from public.event_availability_polls poll_row
  where poll_row.id = p_poll_id;

  if not found then
    raise exception 'Availability poll not found or unavailable';
  end if;

  select coalesce(nullif(btrim(conversation_row.title), ''), 'Circle')
  into v_circle_name
  from public.conversations conversation_row
  where conversation_row.id = v_poll.conversation_id;

  select
    coalesce(user_row.display_name, 'Circle member'),
    user_row.avatar_url
  into v_host_name, v_host_avatar
  from public.users user_row
  where user_row.id = v_poll.host_id;

  select count(*)::integer
  into v_member_count
  from public.conversation_members member_row
  where member_row.conversation_id = v_poll.conversation_id;

  select count(*)::integer
  into v_response_count
  from public.event_availability_responses response_row
  where response_row.poll_id = p_poll_id;

  with option_rows as (
    select
      option_row.id,
      option_row.starts_at,
      option_row.ends_at,
      option_row.sort_order,
      count(vote_row.user_id)::integer as available_count,
      bool_or(vote_row.user_id = auth.uid()) as selected_by_viewer,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'user_id', available_user.id,
            'display_name', coalesce(available_user.display_name, 'Circle member'),
            'avatar_url', available_user.avatar_url,
            'is_me', available_user.id = auth.uid()
          )
          order by coalesce(available_user.display_name, ''), available_user.id
        ) filter (where available_user.id is not null),
        '[]'::jsonb
      ) as available_people
    from public.event_availability_options option_row
    left join public.event_availability_votes vote_row
      on vote_row.poll_id = option_row.poll_id
     and vote_row.option_id = option_row.id
    left join public.users available_user on available_user.id = vote_row.user_id
    where option_row.poll_id = p_poll_id
    group by option_row.id
  ),
  member_rows as (
    select
      member_row.user_id,
      coalesce(user_row.display_name, 'Circle member') as display_name,
      user_row.avatar_url,
      response_row.responded_at,
      count(vote_row.option_id)::integer as selected_count,
      member_row.user_id = v_poll.host_id as is_host,
      member_row.user_id = auth.uid() as is_me
    from public.conversation_members member_row
    join public.users user_row on user_row.id = member_row.user_id
    left join public.event_availability_responses response_row
      on response_row.poll_id = p_poll_id
     and response_row.user_id = member_row.user_id
    left join public.event_availability_votes vote_row
      on vote_row.poll_id = p_poll_id
     and vote_row.user_id = member_row.user_id
    where member_row.conversation_id = v_poll.conversation_id
    group by
      member_row.user_id,
      user_row.display_name,
      user_row.avatar_url,
      response_row.responded_at
  )
  select jsonb_build_object(
    'poll', jsonb_build_object(
      'id', v_poll.id,
      'title', v_poll.title,
      'description', v_poll.description,
      'location_name', v_poll.location_name,
      'status', v_poll.status,
      'circle_id', v_poll.conversation_id,
      'circle_name', v_circle_name,
      'host_id', v_poll.host_id,
      'host_name', v_host_name,
      'host_avatar', v_host_avatar,
      'can_manage', v_poll.host_id = auth.uid(),
      'viewer_responded', exists (
        select 1
        from public.event_availability_responses viewer_response
        where viewer_response.poll_id = p_poll_id
          and viewer_response.user_id = auth.uid()
      ),
      'finalized_option_id', v_poll.finalized_option_id,
      'finalized_event_id', v_poll.finalized_event_id,
      'finalized_at', v_poll.finalized_at,
      'created_at', v_poll.created_at
    ),
    'counts', jsonb_build_object(
      'member_count', v_member_count,
      'response_count', v_response_count,
      'waiting_count', greatest(v_member_count - v_response_count, 0)
    ),
    'options', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'id', option_data.id,
          'starts_at', option_data.starts_at,
          'ends_at', option_data.ends_at,
          'sort_order', option_data.sort_order,
          'available_count', option_data.available_count,
          'selected_by_viewer', coalesce(option_data.selected_by_viewer, false),
          'available_people', option_data.available_people,
          'is_finalized', option_data.id = v_poll.finalized_option_id
        )
        order by option_data.sort_order, option_data.starts_at
      ) from option_rows option_data),
      '[]'::jsonb
    ),
    'members', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'user_id', member_data.user_id,
          'display_name', member_data.display_name,
          'avatar_url', member_data.avatar_url,
          'responded_at', member_data.responded_at,
          'selected_count', member_data.selected_count,
          'is_host', member_data.is_host,
          'is_me', member_data.is_me
        )
        order by
          case when member_data.responded_at is not null then 0 else 1 end,
          member_data.display_name,
          member_data.user_id
      ) from member_rows member_data),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_event_availability_poll(uuid) from public;
grant execute on function public.get_event_availability_poll(uuid) to authenticated;

create or replace function public.respond_to_event_availability_poll(
  p_poll_id uuid,
  p_option_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_option_ids uuid[];
  v_selected_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.event_poll_viewer_can_access(p_poll_id, auth.uid()) then
    raise exception 'Availability poll not found or unavailable';
  end if;

  if not exists (
    select 1
    from public.event_availability_polls poll_row
    where poll_row.id = p_poll_id
      and poll_row.status = 'open'
  ) then
    raise exception 'This availability poll is no longer open';
  end if;

  select coalesce(array_agg(distinct option_id), '{}'::uuid[])
  into v_option_ids
  from unnest(coalesce(p_option_ids, '{}'::uuid[])) as option_input(option_id);

  v_selected_count := coalesce(cardinality(v_option_ids), 0);
  if v_selected_count > 6 then
    raise exception 'Too many availability options selected';
  end if;

  if exists (
    select 1
    from unnest(v_option_ids) as selected(option_id)
    where not exists (
      select 1
      from public.event_availability_options option_row
      where option_row.poll_id = p_poll_id
        and option_row.id = selected.option_id
    )
  ) then
    raise exception 'One of the selected options is unavailable';
  end if;

  insert into public.event_availability_responses (
    poll_id,
    user_id,
    responded_at
  )
  values (
    p_poll_id,
    auth.uid(),
    now()
  )
  on conflict (poll_id, user_id)
  do update set responded_at = excluded.responded_at;

  delete from public.event_availability_votes vote_row
  where vote_row.poll_id = p_poll_id
    and vote_row.user_id = auth.uid();

  insert into public.event_availability_votes (
    poll_id,
    option_id,
    user_id
  )
  select p_poll_id, selected.option_id, auth.uid()
  from unnest(v_option_ids) as selected(option_id);

  return jsonb_build_object(
    'selected_count', v_selected_count,
    'none_available', v_selected_count = 0
  );
end;
$$;

revoke all on function public.respond_to_event_availability_poll(uuid, uuid[]) from public;
grant execute on function public.respond_to_event_availability_poll(uuid, uuid[]) to authenticated;

create or replace function public.finalize_event_availability_poll(
  p_poll_id uuid,
  p_option_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.event_availability_polls%rowtype;
  v_option public.event_availability_options%rowtype;
  v_event_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select poll_row.*
  into v_poll
  from public.event_availability_polls poll_row
  where poll_row.id = p_poll_id
  for update;

  if not found or not public.event_poll_viewer_can_access(p_poll_id, auth.uid()) then
    raise exception 'Availability poll not found or unavailable';
  end if;

  if v_poll.host_id <> auth.uid() then
    raise exception 'Only the poll host can finalize a date';
  end if;

  if v_poll.status = 'finalized' and v_poll.finalized_event_id is not null then
    return jsonb_build_object(
      'event_id', v_poll.finalized_event_id,
      'already_finalized', true
    );
  end if;

  if v_poll.status <> 'open' then
    raise exception 'This availability poll is no longer open';
  end if;

  select option_row.*
  into v_option
  from public.event_availability_options option_row
  where option_row.poll_id = p_poll_id
    and option_row.id = p_option_id;

  if not found then
    raise exception 'Choose one of this poll’s proposed times';
  end if;

  if v_option.starts_at < now() - interval '15 minutes' then
    raise exception 'That proposed time has already passed';
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
    auth.uid(),
    v_poll.title,
    v_poll.description,
    v_option.starts_at,
    v_option.ends_at,
    v_poll.location_name
  )
  returning id into v_event_id;

  insert into public.event_circles (
    event_id,
    conversation_id,
    added_by
  )
  values (
    v_event_id,
    v_poll.conversation_id,
    auth.uid()
  );

  insert into public.event_rsvps (
    event_id,
    user_id,
    status
  )
  values (
    v_event_id,
    auth.uid(),
    'going'
  );

  update public.event_availability_polls
  set
    status = 'finalized',
    finalized_option_id = p_option_id,
    finalized_event_id = v_event_id,
    finalized_at = now(),
    updated_at = now()
  where id = p_poll_id;

  return jsonb_build_object(
    'event_id', v_event_id,
    'already_finalized', false
  );
end;
$$;

revoke all on function public.finalize_event_availability_poll(uuid, uuid) from public;
grant execute on function public.finalize_event_availability_poll(uuid, uuid) to authenticated;

-- Remote control for availability polling, independent from normal event RSVP.
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
      'event_availability_polls'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'event_availability_polls',
  true,
  'Allows private Circle members to propose times and finalize one into an event.'
)
on conflict (flag_key) do nothing;

-- Extend the privacy-safe analytics allowlist with aggregate poll actions.
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
      'event_poll_finalized'
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
  v_option_count integer;
  v_selected_count integer;
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
    'selected_count', v_selected_count
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

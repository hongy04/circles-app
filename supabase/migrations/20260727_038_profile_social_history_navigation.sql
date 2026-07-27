-- Circles Phase 3C — personal social history and profile navigation
--
-- Adds privacy-aware profile stat surfaces, a private personal event directory,
-- an owner-only full connections directory, connected-user shared-event and
-- mutual-connection directories, and reviewed-event access for claimed guests.
-- A connected user never receives another person's total event or connection
-- count, and pre-connection visibility remains limited to existing context.

-- Reviewed attendance is used only inside the profile-directory RPCs below.
-- Existing event_viewer_can_access rules remain unchanged, so claiming an
-- event does not grant Circle-member event-detail access.

-- ---------------------------------------------------------------------------
-- Do not return another user's total connection count from profile overview.
-- The connected-profile UI uses the mutual-only count below instead.
-- ---------------------------------------------------------------------------

create or replace function public.get_profile_overview(profile_user_id uuid)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text,
  post_count bigint,
  connection_count bigint,
  relationship_status text,
  request_id uuid,
  can_view_posts boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  pending_request public.connection_requests%rowtype;
  relationship text;
  permitted boolean := false;
  may_view_posts boolean := false;
begin
  if viewer_id is null or profile_user_id is null then
    return;
  end if;

  if viewer_id = profile_user_id then
    relationship := 'self';
    permitted := true;
    may_view_posts := true;
  elsif exists (
    select 1
    from public.connections connection_row
    where connection_row.user_id = viewer_id
      and connection_row.other_user_id = profile_user_id
  ) then
    relationship := 'connected';
    permitted := true;
    may_view_posts := true;
  else
    select request_row.*
    into pending_request
    from public.connection_requests request_row
    where request_row.status = 'pending'
      and (
        (request_row.from_user = viewer_id and request_row.to_user = profile_user_id)
        or
        (request_row.from_user = profile_user_id and request_row.to_user = viewer_id)
      )
    order by request_row.created_at desc
    limit 1;

    if found then
      relationship := case
        when pending_request.from_user = viewer_id then 'outgoing'
        else 'incoming'
      end;
      permitted := true;
    elsif exists (
      select 1
      from public.contact_edges edge_row
      where edge_row.from_user = viewer_id
        and edge_row.to_user = profile_user_id
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
      join public.conversations conversation_row
        on conversation_row.id = mine_membership.conversation_id
      where mine_membership.user_id = viewer_id
        and (conversation_row.kind = 'group' or conversation_row.circle_enabled)
    ) or public.users_share_confirmed_event(viewer_id, profile_user_id) then
      relationship := 'mutual';
      permitted := true;
    else
      relationship := 'none';
    end if;
  end if;

  if not permitted then
    return;
  end if;

  return query
  select
    user_row.id,
    user_row.display_name,
    user_row.username,
    user_row.avatar_url,
    user_row.bio,
    case
      when may_view_posts then (
        select count(*)
        from public.posts post_row
        where post_row.user_id = user_row.id
      )
      else 0
    end,
    case
      when viewer_id = profile_user_id then (
        select count(*)
        from public.connections connection_row
        where connection_row.user_id = user_row.id
      )
      else 0
    end,
    relationship,
    case when pending_request.id is not null then pending_request.id else null end,
    may_view_posts
  from public.users user_row
  where user_row.id = profile_user_id;
end;
$$;

revoke all on function public.get_profile_overview(uuid) from public;
grant execute on function public.get_profile_overview(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Viewer-specific profile stats.
-- Self: Posts / attended Events / all Connections.
-- Connected profile: Posts / Shared events / Mutual connections.
-- ---------------------------------------------------------------------------

create or replace function public.get_profile_social_stats(
  p_profile_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_mode text;
  v_posts integer := 0;
  v_events integer := 0;
  v_connections integer := 0;
begin
  if v_viewer_id is null or p_profile_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_viewer_id = p_profile_user_id then
    v_mode := 'self';
  elsif exists (
    select 1
    from public.connections connection_row
    where connection_row.user_id = v_viewer_id
      and connection_row.other_user_id = p_profile_user_id
  ) then
    v_mode := 'connected';
  else
    raise exception 'Profile stats are private until connection';
  end if;

  select count(*)::integer
  into v_posts
  from public.posts post_row
  where post_row.user_id = p_profile_user_id;

  if v_mode = 'self' then
    select count(distinct confirmed.event_id)::integer
    into v_events
    from public.confirmed_event_users confirmed
    join public.events event_row on event_row.id = confirmed.event_id
    where confirmed.user_id = v_viewer_id
      and event_row.attendance_reviewed_at is not null
      and event_row.status <> 'cancelled';

    select count(*)::integer
    into v_connections
    from public.connections connection_row
    where connection_row.user_id = v_viewer_id;
  else
    select count(distinct mine.event_id)::integer
    into v_events
    from public.confirmed_event_users mine
    join public.confirmed_event_users theirs
      on theirs.event_id = mine.event_id
     and theirs.user_id = p_profile_user_id
    join public.events event_row on event_row.id = mine.event_id
    where mine.user_id = v_viewer_id
      and event_row.attendance_reviewed_at is not null
      and event_row.status <> 'cancelled';

    select count(distinct mine.other_user_id)::integer
    into v_connections
    from public.connections mine
    join public.connections theirs
      on theirs.user_id = p_profile_user_id
     and theirs.other_user_id = mine.other_user_id
    where mine.user_id = v_viewer_id
      and mine.other_user_id <> v_viewer_id
      and mine.other_user_id <> p_profile_user_id;
  end if;

  return jsonb_build_object(
    'mode', v_mode,
    'post_count', coalesce(v_posts, 0),
    'event_count', coalesce(v_events, 0),
    'connection_count', coalesce(v_connections, 0)
  );
end;
$$;

revoke all on function public.get_profile_social_stats(uuid) from public;
grant execute on function public.get_profile_social_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Event directory.
-- Self receives upcoming accessible events and private reviewed attendance.
-- A connected viewer receives only events both people were confirmed at.
-- ---------------------------------------------------------------------------

create or replace function public.get_profile_event_directory(
  p_profile_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_mode text;
  v_upcoming jsonb := '[]'::jsonb;
  v_attended jsonb := '[]'::jsonb;
begin
  if v_viewer_id is null or p_profile_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_viewer_id = p_profile_user_id then
    v_mode := 'self';
  elsif exists (
    select 1
    from public.connections connection_row
    where connection_row.user_id = v_viewer_id
      and connection_row.other_user_id = p_profile_user_id
  ) then
    v_mode := 'shared';
  else
    raise exception 'Event history is private until connection';
  end if;

  if v_mode = 'self' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', event_row.id,
          'title', event_row.title,
          'starts_at', event_row.starts_at,
          'ends_at', event_row.ends_at,
          'location_name', event_row.location_name,
          'host_name', coalesce(host_row.display_name, 'Host'),
          'rsvp_status', rsvp_row.status,
          'circle_names', coalesce(circle_rows.names, '[]'::jsonb),
          'photo_count', coalesce(photo_rows.photo_count, 0),
          'completed', event_row.attendance_reviewed_at is not null,
          'access_mode', 'full'
        )
        order by event_row.starts_at asc, event_row.id
      ),
      '[]'::jsonb
    )
    into v_upcoming
    from public.events event_row
    left join public.users host_row on host_row.id = event_row.host_id
    left join public.event_rsvps rsvp_row
      on rsvp_row.event_id = event_row.id
     and rsvp_row.user_id = v_viewer_id
    left join lateral (
      select jsonb_agg(circle_name order by circle_name) as names
      from (
        select distinct coalesce(nullif(btrim(conversation_row.title), ''), 'Circle') as circle_name
        from public.event_circles event_circle
        join public.conversations conversation_row
          on conversation_row.id = event_circle.conversation_id
        where event_circle.event_id = event_row.id
      ) names_source
    ) circle_rows on true
    left join lateral (
      select count(*)::integer as photo_count
      from public.event_photos photo_row
      where photo_row.event_id = event_row.id
    ) photo_rows on true
    where event_row.status = 'scheduled'
      and coalesce(event_row.ends_at, event_row.starts_at) >= now()
      and public.event_viewer_can_access(event_row.id, v_viewer_id);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', event_row.id,
        'title', event_row.title,
        'starts_at', event_row.starts_at,
        'ends_at', event_row.ends_at,
        'location_name', event_row.location_name,
        'host_name', coalesce(host_row.display_name, 'Host'),
        'circle_names', case
          when public.event_viewer_can_access(event_row.id, v_viewer_id)
            then coalesce(circle_rows.names, '[]'::jsonb)
          else '[]'::jsonb
        end,
        'photo_count', coalesce(photo_rows.photo_count, 0),
        'completed', true,
        'access_mode', case
          when public.event_viewer_can_access(event_row.id, v_viewer_id)
            then 'full'
          else 'shared_history'
        end
      )
      order by event_row.starts_at desc, event_row.id desc
    ),
    '[]'::jsonb
  )
  into v_attended
  from public.confirmed_event_users mine
  join public.events event_row
    on event_row.id = mine.event_id
   and event_row.attendance_reviewed_at is not null
   and event_row.status <> 'cancelled'
  left join public.users host_row on host_row.id = event_row.host_id
  left join lateral (
    select jsonb_agg(circle_name order by circle_name) as names
    from (
      select distinct coalesce(nullif(btrim(conversation_row.title), ''), 'Circle') as circle_name
      from public.event_circles event_circle
      join public.conversations conversation_row
        on conversation_row.id = event_circle.conversation_id
      where event_circle.event_id = event_row.id
    ) names_source
  ) circle_rows on true
  left join lateral (
    select count(*)::integer as photo_count
    from public.event_photos photo_row
    where photo_row.event_id = event_row.id
  ) photo_rows on true
  where mine.user_id = v_viewer_id
    and (
      v_mode = 'self'
      or exists (
        select 1
        from public.confirmed_event_users theirs
        where theirs.event_id = mine.event_id
          and theirs.user_id = p_profile_user_id
      )
    );

  return jsonb_build_object(
    'mode', v_mode,
    'upcoming', case when v_mode = 'self' then v_upcoming else '[]'::jsonb end,
    'attended', v_attended
  );
end;
$$;

revoke all on function public.get_profile_event_directory(uuid) from public;
grant execute on function public.get_profile_event_directory(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Connection directory.
-- Self receives all accepted connections. A connected viewer receives only
-- people whom both users have already accepted.
-- ---------------------------------------------------------------------------

create or replace function public.get_profile_connection_directory(
  p_profile_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_mode text;
  v_people jsonb := '[]'::jsonb;
begin
  if v_viewer_id is null or p_profile_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_viewer_id = p_profile_user_id then
    v_mode := 'connections';

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', user_row.id,
          'display_name', coalesce(user_row.display_name, 'Connection'),
          'username', user_row.username,
          'avatar_url', user_row.avatar_url
        )
        order by lower(coalesce(user_row.display_name, '')), user_row.id
      ),
      '[]'::jsonb
    )
    into v_people
    from public.connections connection_row
    join public.users user_row on user_row.id = connection_row.other_user_id
    where connection_row.user_id = v_viewer_id;
  elsif exists (
    select 1
    from public.connections connection_row
    where connection_row.user_id = v_viewer_id
      and connection_row.other_user_id = p_profile_user_id
  ) then
    v_mode := 'mutual_connections';

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', user_row.id,
          'display_name', coalesce(user_row.display_name, 'Connection'),
          'username', user_row.username,
          'avatar_url', user_row.avatar_url
        )
        order by lower(coalesce(user_row.display_name, '')), user_row.id
      ),
      '[]'::jsonb
    )
    into v_people
    from public.connections mine
    join public.connections theirs
      on theirs.user_id = p_profile_user_id
     and theirs.other_user_id = mine.other_user_id
    join public.users user_row on user_row.id = mine.other_user_id
    where mine.user_id = v_viewer_id
      and mine.other_user_id <> v_viewer_id
      and mine.other_user_id <> p_profile_user_id;
  else
    raise exception 'Connections are private until connection';
  end if;

  return jsonb_build_object(
    'mode', v_mode,
    'count', jsonb_array_length(v_people),
    'people', v_people
  );
end;
$$;

revoke all on function public.get_profile_connection_directory(uuid) from public;
grant execute on function public.get_profile_connection_directory(uuid) to authenticated;

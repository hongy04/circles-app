-- Phase 8A hotfix: restore the named shared-event columns returned by the
-- pre-connection profile shell after the blocking/reporting rewrite.
--
-- Migration 051 accidentally omitted aliases on two scalar expressions inside
-- the shared_events lateral subquery. PostgreSQL therefore exposed anonymous
-- columns, while the outer SELECT referenced latest_event_title and
-- latest_event_at. This only surfaced after an unblock returned the pair to the
-- pre-connection shell.

create or replace function public.get_preconnection_profile_shell(
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

  if viewer_id = profile_user_id
     or public.user_pair_is_blocked(viewer_id, profile_user_id)
     or exists (
       select 1
       from public.connections connection_row
       where connection_row.user_id = viewer_id
         and connection_row.other_user_id = profile_user_id
     ) then
    return;
  end if;

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
    relationship,
    case when pending_request.id is not null then pending_request.id else null end,
    exists (
      select 1
      from public.contact_edges edge_row
      where edge_row.from_user = viewer_id
        and edge_row.to_user = profile_user_id
    ),
    (
      select count(distinct mine.other_user_id)
      from public.connections mine
      join public.connections theirs
        on theirs.user_id = profile_user_id
       and theirs.other_user_id = mine.other_user_id
      where mine.user_id = viewer_id
        and mine.other_user_id <> viewer_id
        and mine.other_user_id <> profile_user_id
        and not public.user_pair_is_blocked(viewer_id, mine.other_user_id)
    ),
    (
      select count(distinct mine_membership.conversation_id)
      from public.conversation_members mine_membership
      join public.conversation_members their_membership
        on their_membership.conversation_id = mine_membership.conversation_id
       and their_membership.user_id = profile_user_id
      join public.conversations conversation_row
        on conversation_row.id = mine_membership.conversation_id
      where mine_membership.user_id = viewer_id
        and (conversation_row.kind = 'group' or conversation_row.circle_enabled)
    ),
    coalesce(shared_events.shared_event_count, 0)::bigint,
    shared_events.latest_event_title,
    shared_events.latest_event_at,
    post_row.id,
    post_row.caption,
    coalesce(first_media.url, post_row.image_url),
    case
      when post_row.id is null then null
      else coalesce(
        first_media.media_type,
        case
          when post_row.image_url ~* '\.(mp4|mov|m4v)(\?|$)' then 'video'
          else 'image'
        end
      )
    end,
    post_row.created_at,
    case
      when post_row.id is null then 0
      when coalesce(media_totals.media_count, 0) > 0 then media_totals.media_count
      when post_row.image_url is not null then 1
      else 0
    end::integer
  from public.users user_row
  left join public.posts post_row
    on post_row.id = user_row.mutual_preview_post_id
   and post_row.user_id = user_row.id
  left join lateral (
    select media_row.url, media_row.media_type
    from public.post_media media_row
    where media_row.post_id = post_row.id
    order by media_row.created_at asc, media_row.id asc
    limit 1
  ) first_media on true
  left join lateral (
    select count(*)::integer as media_count
    from public.post_media media_row
    where media_row.post_id = post_row.id
  ) media_totals on true
  left join lateral (
    select
      count(distinct mine_attendance.event_id)::bigint as shared_event_count,
      (
        select latest_event.title
        from public.confirmed_event_users latest_mine
        join public.confirmed_event_users latest_theirs
          on latest_theirs.event_id = latest_mine.event_id
         and latest_theirs.user_id = profile_user_id
        join public.events latest_event on latest_event.id = latest_mine.event_id
        where latest_mine.user_id = viewer_id
          and latest_event.attendance_reviewed_at is not null
          and latest_event.status <> 'cancelled'
        order by latest_event.starts_at desc, latest_event.id desc
        limit 1
      ) as latest_event_title,
      (
        select latest_event.starts_at
        from public.confirmed_event_users latest_mine
        join public.confirmed_event_users latest_theirs
          on latest_theirs.event_id = latest_mine.event_id
         and latest_theirs.user_id = profile_user_id
        join public.events latest_event on latest_event.id = latest_mine.event_id
        where latest_mine.user_id = viewer_id
          and latest_event.attendance_reviewed_at is not null
          and latest_event.status <> 'cancelled'
        order by latest_event.starts_at desc, latest_event.id desc
        limit 1
      ) as latest_event_at
    from public.confirmed_event_users mine_attendance
    join public.confirmed_event_users their_attendance
      on their_attendance.event_id = mine_attendance.event_id
     and their_attendance.user_id = profile_user_id
    join public.events shared_event
      on shared_event.id = mine_attendance.event_id
     and shared_event.attendance_reviewed_at is not null
     and shared_event.status <> 'cancelled'
    where mine_attendance.user_id = viewer_id
  ) shared_events on true
  where user_row.id = profile_user_id;
end;
$$;

revoke all on function public.get_preconnection_profile_shell(uuid) from public;
grant execute on function public.get_preconnection_profile_shell(uuid) to authenticated;

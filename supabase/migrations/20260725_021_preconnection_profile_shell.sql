-- Circles Phase 1C — privacy-safe pre-connection profile shell
--
-- A Mutuals card should open a real profile surface without turning that
-- surface into a public profile. This migration:
--   * stops exposing connection totals before acceptance;
--   * returns only legitimate trusted context for a pending/mutual pair; and
--   * exposes the one deliberately selected Mutuals preview post without
--     granting access to the person's private post history.

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
    from public.connections c
    where c.user_id = viewer_id
      and c.other_user_id = profile_user_id
  ) then
    relationship := 'connected';
    permitted := true;
    may_view_posts := true;
  else
    select r.*
      into pending_request
    from public.connection_requests r
    where r.status = 'pending'
      and (
        (r.from_user = viewer_id and r.to_user = profile_user_id)
        or
        (r.from_user = profile_user_id and r.to_user = viewer_id)
      )
    order by r.created_at desc
    limit 1;

    if found then
      relationship := case
        when pending_request.from_user = viewer_id then 'outgoing'
        else 'incoming'
      end;
      permitted := true;
    elsif exists (
      select 1
      from public.contact_edges e
      where e.from_user = viewer_id
        and e.to_user = profile_user_id
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
      join public.conversations conversation
        on conversation.id = mine_membership.conversation_id
      where mine_membership.user_id = viewer_id
        and (conversation.kind = 'group' or conversation.circle_enabled)
    ) then
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
    u.id,
    u.display_name,
    u.username,
    u.avatar_url,
    u.bio,
    case
      when may_view_posts then (
        select count(*)
        from public.posts p
        where p.user_id = u.id
      )
      else 0
    end as post_count,
    case
      when may_view_posts then (
        select count(*)
        from public.connections c
        where c.user_id = u.id
      )
      else 0
    end as connection_count,
    relationship,
    case when pending_request.id is not null then pending_request.id else null end,
    may_view_posts
  from public.users u
  where u.id = profile_user_id;
end;
$$;

revoke all on function public.get_profile_overview(uuid) from public;
grant execute on function public.get_profile_overview(uuid) to authenticated;

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

  -- Self and accepted connections use the normal full profile path. This RPC
  -- exists only for the deliberately limited state before acceptance.
  if viewer_id = profile_user_id or exists (
    select 1
    from public.connections c
    where c.user_id = viewer_id
      and c.other_user_id = profile_user_id
  ) then
    return;
  end if;

  select r.*
    into pending_request
  from public.connection_requests r
  where r.status = 'pending'
    and (
      (r.from_user = viewer_id and r.to_user = profile_user_id)
      or
      (r.from_user = profile_user_id and r.to_user = viewer_id)
    )
  order by r.created_at desc
  limit 1;

  if found then
    relationship := case
      when pending_request.from_user = viewer_id then 'outgoing'
      else 'incoming'
    end;
    permitted := true;
  elsif exists (
    select 1
    from public.contact_edges e
    where e.from_user = viewer_id
      and e.to_user = profile_user_id
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
    join public.conversations conversation
      on conversation.id = mine_membership.conversation_id
    where mine_membership.user_id = viewer_id
      and (conversation.kind = 'group' or conversation.circle_enabled)
  ) then
    relationship := 'mutual';
    permitted := true;
  end if;

  if not permitted then
    return;
  end if;

  return query
  select
    u.id,
    u.display_name,
    u.username,
    u.avatar_url,
    u.bio,
    relationship,
    case when pending_request.id is not null then pending_request.id else null end,
    exists (
      select 1
      from public.contact_edges e
      where e.from_user = viewer_id
        and e.to_user = profile_user_id
    ) as has_contact_context,
    (
      select count(distinct mine.other_user_id)
      from public.connections mine
      join public.connections theirs
        on theirs.user_id = profile_user_id
       and theirs.other_user_id = mine.other_user_id
      where mine.user_id = viewer_id
        and mine.other_user_id <> viewer_id
        and mine.other_user_id <> profile_user_id
    ) as mutual_connection_count,
    (
      select count(distinct mine_membership.conversation_id)
      from public.conversation_members mine_membership
      join public.conversation_members their_membership
        on their_membership.conversation_id = mine_membership.conversation_id
       and their_membership.user_id = profile_user_id
      join public.conversations conversation
        on conversation.id = mine_membership.conversation_id
      where mine_membership.user_id = viewer_id
        and (conversation.kind = 'group' or conversation.circle_enabled)
    ) as shared_circle_count,
    p.id as preview_post_id,
    p.caption as preview_caption,
    coalesce(first_media.url, p.image_url) as preview_url,
    case
      when p.id is null then null
      else coalesce(
        first_media.media_type,
        case
          when p.image_url ~* '\.(mp4|mov|m4v)(\?|$)' then 'video'
          else 'image'
        end
      )
    end as preview_media_type,
    p.created_at as preview_created_at,
    case
      when p.id is null then 0
      when coalesce(media_totals.media_count, 0) > 0
        then media_totals.media_count
      when p.image_url is not null then 1
      else 0
    end::integer as preview_media_count
  from public.users u
  left join public.posts p
    on p.id = u.mutual_preview_post_id
   and p.user_id = u.id
  left join lateral (
    select
      media.url,
      media.media_type
    from public.post_media media
    where media.post_id = p.id
    order by media.created_at asc, media.id asc
    limit 1
  ) first_media on true
  left join lateral (
    select count(*)::integer as media_count
    from public.post_media media
    where media.post_id = p.id
  ) media_totals on true
  where u.id = profile_user_id;
end;
$$;

revoke all on function public.get_preconnection_profile_shell(uuid) from public;
grant execute on function public.get_preconnection_profile_shell(uuid) to authenticated;

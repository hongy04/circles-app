-- Circles profile/account foundation
-- Adds optional unique usernames and privacy-aware profile RPCs.

alter table public.users
  add column if not exists username text;


-- A mutual contact is only a candidate. Content access begins after the
-- connection request is accepted and the symmetric connections rows exist.
create or replace function public.is_connected(a uuid, b uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    a = b
    or exists (
      select 1
      from public.connections c
      where c.user_id = a
        and c.other_user_id = b
    )
    or exists (
      select 1
      from public.connection_requests r
      where r.status = 'accepted'
        and (
          (r.from_user = a and r.to_user = b)
          or
          (r.from_user = b and r.to_user = a)
        )
    );
$$;

-- These RPCs are security definer functions, so they must explicitly enforce
-- Circles privacy instead of relying on table RLS underneath them.
create or replace function public.get_active_stories()
returns table (
  id uuid,
  user_id uuid,
  url text,
  media_type text,
  created_at timestamptz,
  display_name text,
  avatar_url text
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.user_id,
    s.url,
    s.media_type,
    s.created_at,
    u.display_name,
    u.avatar_url
  from public.stories s
  join public.users u on u.id = s.user_id
  where s.expire_at > now()
    and (
      s.user_id = auth.uid()
      or public.is_connected(auth.uid(), s.user_id)
    )
  order by s.created_at desc;
$$;

create or replace function public.get_feed(
  limit_count integer default 10,
  before timestamptz default now()
)
returns table (
  id uuid,
  author_name text,
  author_avatar text,
  image_url text,
  caption text,
  created_at timestamptz,
  likes_count integer,
  liked_by_me boolean
)
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      p.id,
      p.user_id,
      p.caption,
      p.created_at,
      coalesce(
        (
          select m.url
          from public.post_media m
          where m.post_id = p.id
          order by m.created_at asc
          limit 1
        ),
        p.image_url
      ) as image_url
    from public.posts p
    where p.created_at < coalesce(before, now())
      and (
        p.user_id = auth.uid()
        or public.is_connected(auth.uid(), p.user_id)
      )
    order by p.created_at desc
    limit greatest(limit_count, 1)
  ),
  likes as (
    select pl.post_id, count(*)::integer as cnt
    from public.post_likes pl
    where pl.post_id in (select b.id from base b)
    group by pl.post_id
  ),
  me_like as (
    select pl.post_id
    from public.post_likes pl
    where pl.user_id = auth.uid()
  )
  select
    b.id,
    u.display_name as author_name,
    u.avatar_url as author_avatar,
    b.image_url,
    b.caption,
    b.created_at,
    coalesce(l.cnt, 0) as likes_count,
    exists (
      select 1
      from me_like ml
      where ml.post_id = b.id
    ) as liked_by_me
  from base b
  left join public.users u on u.id = b.user_id
  left join likes l on l.post_id = b.id
  order by b.created_at desc;
$$;

create unique index if not exists users_username_lower_unique
  on public.users (lower(username))
  where username is not null;

alter table public.users
  drop constraint if exists users_username_format_check;

alter table public.users
  add constraint users_username_format_check
  check (
    username is null
    or username ~ '^[a-z0-9][a-z0-9._]{1,22}[a-z0-9]$'
  );

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
    (
      select count(*)
      from public.connections c
      where c.user_id = u.id
    ) as connection_count,
    relationship,
    case when pending_request.id is not null then pending_request.id else null end,
    may_view_posts
  from public.users u
  where u.id = profile_user_id;
end;
$$;

revoke all on function public.get_profile_overview(uuid) from public;
grant execute on function public.get_profile_overview(uuid) to authenticated;

create or replace function public.update_my_profile(
  p_display_name text,
  p_username text,
  p_bio text,
  p_avatar_url text
)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  clean_name text := nullif(btrim(p_display_name), '');
  clean_username text := lower(nullif(regexp_replace(btrim(coalesce(p_username, '')), '^@', ''), ''));
  clean_bio text := nullif(btrim(p_bio), '');
begin
  if viewer_id is null then
    raise exception 'Please sign in first';
  end if;

  if clean_name is null then
    raise exception 'Display name is required';
  end if;

  if char_length(clean_name) > 40 then
    raise exception 'Display name must be 40 characters or fewer';
  end if;

  if clean_username is not null then
    if char_length(clean_username) < 3 or char_length(clean_username) > 24 then
      raise exception 'Username must be between 3 and 24 characters';
    end if;

    if clean_username !~ '^[a-z0-9][a-z0-9._]{1,22}[a-z0-9]$' then
      raise exception 'Username can use lowercase letters, numbers, periods, and underscores';
    end if;
  end if;

  if clean_bio is not null and char_length(clean_bio) > 160 then
    raise exception 'Bio must be 160 characters or fewer';
  end if;

  update public.users u
  set
    display_name = clean_name,
    username = clean_username,
    bio = clean_bio,
    avatar_url = nullif(btrim(p_avatar_url), '')
  where u.id = viewer_id;

  if not found then
    raise exception 'Profile record not found';
  end if;

  return query
  select u.id, u.display_name, u.username, u.avatar_url, u.bio
  from public.users u
  where u.id = viewer_id;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'That username is already taken';
end;
$$;

revoke all on function public.update_my_profile(text, text, text, text) from public;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;

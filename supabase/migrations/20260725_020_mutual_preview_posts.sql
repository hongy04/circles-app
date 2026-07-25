-- Circles Phase 1B — Mutuals preview posts
--
-- A user may deliberately choose one personal post to represent them in the
-- Mutuals discovery list before a connection is accepted. The selected post
-- does not make the rest of the profile public, cannot expose Circle posts,
-- and is returned only to authenticated users who already have mutual-contact
-- context with that person.

alter table public.users
  add column if not exists mutual_preview_post_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_mutual_preview_post_id_fkey'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_mutual_preview_post_id_fkey
      foreign key (mutual_preview_post_id)
      references public.posts(id)
      on delete set null;
  end if;
end
$$;

create index if not exists users_mutual_preview_post_id_idx
  on public.users (mutual_preview_post_id)
  where mutual_preview_post_id is not null;

create or replace function public.get_my_mutual_preview_post_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.mutual_preview_post_id
  from public.users u
  where u.id = auth.uid();
$$;

revoke all on function public.get_my_mutual_preview_post_id() from public;
grant execute on function public.get_my_mutual_preview_post_id() to authenticated;

create or replace function public.set_my_mutual_preview_post(
  p_post_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  selected_post_id uuid := p_post_id;
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if selected_post_id is not null and not exists (
    select 1
    from public.posts p
    where p.id = selected_post_id
      and p.user_id = viewer_id
  ) then
    raise exception 'Choose one of your own personal posts';
  end if;

  update public.users u
  set mutual_preview_post_id = selected_post_id
  where u.id = viewer_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  return selected_post_id;
end;
$$;

revoke all on function public.set_my_mutual_preview_post(uuid) from public;
grant execute on function public.set_my_mutual_preview_post(uuid) to authenticated;

-- The return shape changes in Phase 1B, so PostgreSQL requires the existing
-- function to be dropped before it can be recreated with preview columns.
drop function if exists public.mutual_candidates(integer, integer);

create function public.mutual_candidates(
  limit_count integer default 50,
  offset_count integer default 0
)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  since timestamptz,
  preview_post_id uuid,
  preview_caption text,
  preview_url text,
  preview_media_type text,
  preview_created_at timestamptz,
  preview_media_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    u.display_name,
    u.avatar_url,
    e.created_at as since,
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
  from public.contact_edges e
  join public.users u
    on u.id = e.to_user
  left join public.posts p
    on p.id = u.mutual_preview_post_id
   and p.user_id = u.id
  left join lateral (
    select
      m.url,
      m.media_type
    from public.post_media m
    where m.post_id = p.id
    order by m.created_at asc, m.id asc
    limit 1
  ) first_media on true
  left join lateral (
    select count(*)::integer as media_count
    from public.post_media m
    where m.post_id = p.id
  ) media_totals on true
  where e.from_user = auth.uid()
    and not exists (
      select 1
      from public.connections c
      where c.user_id = auth.uid()
        and c.other_user_id = u.id
    )
    and not exists (
      select 1
      from public.connections c
      where c.user_id = u.id
        and c.other_user_id = auth.uid()
    )
    and not exists (
      select 1
      from public.connection_requests r
      where (
        (r.from_user = auth.uid() and r.to_user = u.id)
        or (r.from_user = u.id and r.to_user = auth.uid())
      )
        and r.status = 'pending'
    )
  order by e.created_at desc
  limit greatest(coalesce(limit_count, 50), 1)
  offset greatest(coalesce(offset_count, 0), 0);
$$;

revoke all on function public.mutual_candidates(integer, integer) from public;
grant execute on function public.mutual_candidates(integer, integer) to authenticated;

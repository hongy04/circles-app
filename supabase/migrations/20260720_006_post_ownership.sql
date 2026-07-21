-- Circles Step 7 — Post ownership, caption editing, and deletion
-- Removes permissive restored development policies and adds owner-only
-- management functions plus Storage cleanup permissions.

alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_likes enable row level security;

-- Keep captions within the same limit enforced by the client.
alter table public.posts
  drop constraint if exists posts_caption_length_check;

alter table public.posts
  add constraint posts_caption_length_check
  check (caption is null or char_length(caption) <= 2200);

-- Remove permissive development policies restored from the old project.
drop policy if exists dev_posts_all_delete on public.posts;
drop policy if exists dev_posts_all_insert on public.posts;
drop policy if exists dev_posts_all_select on public.posts;
drop policy if exists dev_posts_all_update on public.posts;

drop policy if exists dev_post_media_all_delete on public.post_media;
drop policy if exists dev_post_media_all_insert on public.post_media;
drop policy if exists dev_post_media_all_select on public.post_media;
drop policy if exists dev_post_media_all_update on public.post_media;

-- Likes and comments already have relationship-aware policies in the schema;
-- remove only the old permissive development overrides.
drop policy if exists dev_comments_all_delete on public.post_comments;
drop policy if exists dev_comments_all_insert on public.post_comments;
drop policy if exists dev_comments_all_select on public.post_comments;
drop policy if exists dev_comments_all_update on public.post_comments;

drop policy if exists dev_likes_all_delete on public.post_likes;
drop policy if exists dev_likes_all_insert on public.post_likes;
drop policy if exists dev_likes_all_select on public.post_likes;
drop policy if exists dev_likes_all_update on public.post_likes;

-- Recreate comments and likes policies explicitly so removing the development
-- overrides cannot leave those features inaccessible.
drop policy if exists comments_delete on public.post_comments;
drop policy if exists comments_insert on public.post_comments;
drop policy if exists comments_select on public.post_comments;
drop policy if exists "Circles delete own comments" on public.post_comments;
drop policy if exists "Circles add comments to visible posts" on public.post_comments;
drop policy if exists "Circles view comments on visible posts" on public.post_comments;

create policy "Circles delete own comments"
on public.post_comments
for delete
to authenticated
using (user_id = auth.uid());

create policy "Circles add comments to visible posts"
on public.post_comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.posts p
    where p.id = post_comments.post_id
      and (
        p.user_id = auth.uid()
        or public.is_connected(auth.uid(), p.user_id)
      )
  )
);

create policy "Circles view comments on visible posts"
on public.post_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.posts p
    where p.id = post_comments.post_id
      and (
        p.user_id = auth.uid()
        or public.is_connected(auth.uid(), p.user_id)
      )
  )
);

drop policy if exists likes_delete on public.post_likes;
drop policy if exists likes_insert on public.post_likes;
drop policy if exists likes_select on public.post_likes;
drop policy if exists "Circles delete own likes" on public.post_likes;
drop policy if exists "Circles like visible posts" on public.post_likes;
drop policy if exists "Circles view likes on visible posts" on public.post_likes;

create policy "Circles delete own likes"
on public.post_likes
for delete
to authenticated
using (user_id = auth.uid());

create policy "Circles like visible posts"
on public.post_likes
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.posts p
    where p.id = post_likes.post_id
      and (
        p.user_id = auth.uid()
        or public.is_connected(auth.uid(), p.user_id)
      )
  )
);

create policy "Circles view likes on visible posts"
on public.post_likes
for select
to authenticated
using (
  exists (
    select 1
    from public.posts p
    where p.id = post_likes.post_id
      and (
        p.user_id = auth.uid()
        or public.is_connected(auth.uid(), p.user_id)
      )
  )
);

-- Replace older post policies with explicit Circles ownership/privacy rules.
drop policy if exists posts_insert on public.posts;
drop policy if exists posts_select on public.posts;
drop policy if exists posts_update on public.posts;
drop policy if exists posts_delete on public.posts;
drop policy if exists "Circles insert own posts" on public.posts;
drop policy if exists "Circles view connected posts" on public.posts;
drop policy if exists "Circles update own posts" on public.posts;
drop policy if exists "Circles delete own posts" on public.posts;

create policy "Circles insert own posts"
on public.posts
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Circles view connected posts"
on public.posts
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_connected(auth.uid(), user_id)
);

create policy "Circles update own posts"
on public.posts
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Circles delete own posts"
on public.posts
for delete
to authenticated
using (user_id = auth.uid());

-- Media inherits access from its parent post.
drop policy if exists post_media_insert_author on public.post_media;
drop policy if exists post_media_select_all on public.post_media;
drop policy if exists "Circles insert own post media" on public.post_media;
drop policy if exists "Circles view connected post media" on public.post_media;
drop policy if exists "Circles delete own post media" on public.post_media;

create policy "Circles insert own post media"
on public.post_media
for insert
to authenticated
with check (
  exists (
    select 1
    from public.posts p
    where p.id = post_media.post_id
      and p.user_id = auth.uid()
  )
);

create policy "Circles view connected post media"
on public.post_media
for select
to authenticated
using (
  exists (
    select 1
    from public.posts p
    where p.id = post_media.post_id
      and (
        p.user_id = auth.uid()
        or public.is_connected(auth.uid(), p.user_id)
      )
  )
);

create policy "Circles delete own post media"
on public.post_media
for delete
to authenticated
using (
  exists (
    select 1
    from public.posts p
    where p.id = post_media.post_id
      and p.user_id = auth.uid()
  )
);

-- The restored helper RPCs are security-definer functions, so enforce the
-- same post-visibility rule inside them instead of relying on table RLS.
create or replace function public.add_comment(
  p_post_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  clean_body text := btrim(coalesce(p_body, ''));
  comment_id uuid;
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if clean_body = '' then
    raise exception 'Comment cannot be empty';
  end if;

  if char_length(clean_body) > 1000 then
    raise exception 'Comment must be 1000 characters or fewer';
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and (
        p.user_id = viewer_id
        or public.is_connected(viewer_id, p.user_id)
      )
  ) then
    raise exception 'Post not found or unavailable';
  end if;

  insert into public.post_comments (post_id, user_id, body)
  values (p_post_id, viewer_id, clean_body)
  returning id into comment_id;

  return comment_id;
end;
$$;

create or replace function public.toggle_like(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and (
        p.user_id = viewer_id
        or public.is_connected(viewer_id, p.user_id)
      )
  ) then
    raise exception 'Post not found or unavailable';
  end if;

  if exists (
    select 1
    from public.post_likes l
    where l.post_id = p_post_id
      and l.user_id = viewer_id
  ) then
    delete from public.post_likes l
    where l.post_id = p_post_id
      and l.user_id = viewer_id;
  else
    insert into public.post_likes (post_id, user_id)
    values (p_post_id, viewer_id);
  end if;
end;
$$;

revoke all on function public.add_comment(uuid, text) from public;
grant execute on function public.add_comment(uuid, text) to authenticated;

revoke all on function public.toggle_like(uuid) from public;
grant execute on function public.toggle_like(uuid) to authenticated;

-- Caption editing is exposed through a narrow owner-only RPC.
create or replace function public.update_own_post_caption(
  p_post_id uuid,
  p_caption text
)
returns table (
  id uuid,
  caption text,
  updated boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  clean_caption text := nullif(btrim(coalesce(p_caption, '')), '');
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_post_id is null then
    raise exception 'Post is required';
  end if;

  if clean_caption is not null and char_length(clean_caption) > 2200 then
    raise exception 'Caption must be 2200 characters or fewer';
  end if;

  return query
  update public.posts p
  set caption = clean_caption
  where p.id = p_post_id
    and p.user_id = viewer_id
  returning p.id, p.caption, true;

  if not found then
    raise exception 'Post not found or you do not own it';
  end if;
end;
$$;

-- The app removes Storage objects first, then calls this RPC. Foreign keys
-- cascade the delete to post_media, likes, and comments.
create or replace function public.delete_own_post(p_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  deleted_id uuid;
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.posts p
  where p.id = p_post_id
    and p.user_id = viewer_id
  returning p.id into deleted_id;

  if deleted_id is null then
    raise exception 'Post not found or you do not own it';
  end if;

  return deleted_id;
end;
$$;

revoke all on function public.update_own_post_caption(uuid, text) from public;
grant execute on function public.update_own_post_caption(uuid, text) to authenticated;

revoke all on function public.delete_own_post(uuid) from public;
grant execute on function public.delete_own_post(uuid) to authenticated;

-- Supabase Storage tracks the authenticated uploader as the object owner.
-- This covers both legacy root-level files and new user-folder files.
drop policy if exists "Circles delete own post uploads"
on storage.objects;

create policy "Circles delete own post uploads"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'posts'
  and (
    owner_id = auth.uid()::text
    or owner = auth.uid()
  )
);

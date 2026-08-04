-- Step 16: remove the extra conversation_posts lookup that every Circle post
-- feed/detail read needed after per-media presentation metadata was added.
-- The RPC now returns that metadata directly with the post row.

drop function if exists public.get_circle_posts(uuid, integer, timestamptz);

create function public.get_circle_posts(
  p_conversation_id uuid,
  p_limit_count integer default 60,
  p_before timestamptz default now()
)
returns table (
  post_id uuid,
  conversation_id uuid,
  author_id uuid,
  author_name text,
  author_avatar text,
  caption text,
  media jsonb,
  comment_count bigint,
  like_count bigint,
  liked_by_me boolean,
  can_edit boolean,
  created_at timestamptz,
  edited_at timestamptz,
  display_aspect_ratio numeric,
  media_crop_points jsonb,
  media_presentations jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    post_row.id as post_id,
    post_row.conversation_id,
    post_row.author_id,
    author.display_name as author_name,
    author.avatar_url as author_avatar,
    post_row.caption,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', media_row.id,
          'storage_path', media_row.storage_path,
          'media_type', media_row.media_type,
          'width', media_row.width,
          'height', media_row.height,
          'duration_ms', media_row.duration_ms,
          'sort_order', media_row.sort_order,
          'created_at', media_row.created_at
        )
        order by media_row.sort_order
      )
      from public.conversation_post_media media_row
      where media_row.post_id = post_row.id
    ), '[]'::jsonb) as media,
    (
      select count(*)
      from public.conversation_post_comments comment_row
      where comment_row.post_id = post_row.id
    ) as comment_count,
    (
      select count(*)
      from public.conversation_post_likes like_row
      where like_row.post_id = post_row.id
    ) as like_count,
    exists (
      select 1
      from public.conversation_post_likes like_row
      where like_row.post_id = post_row.id
        and like_row.user_id = auth.uid()
    ) as liked_by_me,
    post_row.author_id = auth.uid() as can_edit,
    post_row.created_at,
    post_row.edited_at,
    post_row.display_aspect_ratio,
    coalesce(post_row.media_crop_points, '[]'::jsonb) as media_crop_points,
    coalesce(post_row.media_presentations, '[]'::jsonb) as media_presentations
  from public.conversation_posts post_row
  join public.users author on author.id = post_row.author_id
  where post_row.conversation_id = p_conversation_id
    and post_row.created_at < coalesce(p_before, now())
    and public.circle_posts_are_enabled(p_conversation_id, auth.uid())
  order by post_row.created_at desc
  limit greatest(1, least(coalesce(p_limit_count, 60), 120));
$$;

revoke all on function public.get_circle_posts(uuid, integer, timestamptz) from public;
grant execute on function public.get_circle_posts(uuid, integer, timestamptz) to authenticated;

drop function if exists public.get_circle_post(uuid);

create function public.get_circle_post(p_post_id uuid)
returns table (
  post_id uuid,
  conversation_id uuid,
  author_id uuid,
  author_name text,
  author_avatar text,
  caption text,
  media jsonb,
  comment_count bigint,
  like_count bigint,
  liked_by_me boolean,
  can_edit boolean,
  created_at timestamptz,
  edited_at timestamptz,
  display_aspect_ratio numeric,
  media_crop_points jsonb,
  media_presentations jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    post_row.id as post_id,
    post_row.conversation_id,
    post_row.author_id,
    author.display_name as author_name,
    author.avatar_url as author_avatar,
    post_row.caption,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', media_row.id,
          'storage_path', media_row.storage_path,
          'media_type', media_row.media_type,
          'width', media_row.width,
          'height', media_row.height,
          'duration_ms', media_row.duration_ms,
          'sort_order', media_row.sort_order,
          'created_at', media_row.created_at
        )
        order by media_row.sort_order
      )
      from public.conversation_post_media media_row
      where media_row.post_id = post_row.id
    ), '[]'::jsonb) as media,
    (
      select count(*)
      from public.conversation_post_comments comment_row
      where comment_row.post_id = post_row.id
    ) as comment_count,
    (
      select count(*)
      from public.conversation_post_likes like_row
      where like_row.post_id = post_row.id
    ) as like_count,
    exists (
      select 1
      from public.conversation_post_likes like_row
      where like_row.post_id = post_row.id
        and like_row.user_id = auth.uid()
    ) as liked_by_me,
    post_row.author_id = auth.uid() as can_edit,
    post_row.created_at,
    post_row.edited_at,
    post_row.display_aspect_ratio,
    coalesce(post_row.media_crop_points, '[]'::jsonb) as media_crop_points,
    coalesce(post_row.media_presentations, '[]'::jsonb) as media_presentations
  from public.conversation_posts post_row
  join public.users author on author.id = post_row.author_id
  where post_row.id = p_post_id
    and public.circle_posts_are_enabled(
      post_row.conversation_id,
      auth.uid()
    );
$$;

revoke all on function public.get_circle_post(uuid) from public;
grant execute on function public.get_circle_post(uuid) to authenticated;

-- Step 33 — Circle posts in the chronological Feed
--
-- Feed remains strictly chronological. This read model simply broadens the
-- eligible set from personal posts by the viewer/their accepted connections to
-- also include posts from private Circles the viewer currently belongs to.
-- There is no recommendation score, popularity ranking, paid boost, or
-- cross-Circle leakage.

create index if not exists conversation_posts_created_at_desc_index
  on public.conversation_posts (created_at desc);

drop function if exists public.get_feed_v3(integer, timestamptz);
create function public.get_feed_v3(
  limit_count integer default 10,
  before timestamptz default now()
)
returns table (
  source_type text,
  id uuid,
  user_id uuid,
  author_name text,
  author_avatar text,
  circle_id uuid,
  circle_name text,
  circle_avatar text,
  image_url text,
  caption text,
  created_at timestamptz,
  likes_count bigint,
  liked_by_me boolean,
  comment_count bigint,
  media jsonb,
  display_aspect_ratio numeric,
  media_crop_points jsonb,
  media_presentations jsonb,
  can_edit boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select
      'personal'::text as source_type,
      post.id,
      post.user_id,
      null::uuid as circle_id,
      null::text as circle_name,
      null::text as circle_avatar,
      post.image_url,
      post.caption,
      post.created_at,
      post.display_aspect_ratio,
      coalesce(post.media_crop_points, '[]'::jsonb) as media_crop_points,
      coalesce(post.media_presentations, '[]'::jsonb) as media_presentations
    from public.posts post
    where post.created_at < coalesce(before, now())
      and (
        post.user_id = auth.uid()
        or public.is_connected(auth.uid(), post.user_id)
      )

    union all

    select
      'circle'::text as source_type,
      circle_post.id,
      circle_post.author_id as user_id,
      conversation.id as circle_id,
      coalesce(nullif(trim(conversation.title), ''), 'Circle') as circle_name,
      conversation.avatar_url as circle_avatar,
      null::text as image_url,
      circle_post.caption,
      circle_post.created_at,
      circle_post.display_aspect_ratio,
      coalesce(circle_post.media_crop_points, '[]'::jsonb) as media_crop_points,
      coalesce(circle_post.media_presentations, '[]'::jsonb) as media_presentations
    from public.conversation_posts circle_post
    join public.conversations conversation
      on conversation.id = circle_post.conversation_id
    join public.conversation_members membership
      on membership.conversation_id = circle_post.conversation_id
     and membership.user_id = auth.uid()
    where circle_post.created_at < coalesce(before, now())
      and (conversation.kind = 'group' or conversation.circle_enabled)
  ),
  base as (
    select *
    from candidates
    order by created_at desc, id desc
    limit greatest(1, least(coalesce(limit_count, 10), 50))
  )
  select
    base.source_type,
    base.id,
    base.user_id,
    author.display_name as author_name,
    author.avatar_url as author_avatar,
    base.circle_id,
    base.circle_name,
    base.circle_avatar,
    base.image_url,
    base.caption,
    base.created_at,
    case
      when base.source_type = 'circle' then (
        select count(*)
        from public.conversation_post_likes circle_like
        where circle_like.post_id = base.id
      )
      else (
        select count(*)
        from public.post_likes personal_like
        where personal_like.post_id = base.id
      )
    end as likes_count,
    case
      when base.source_type = 'circle' then exists (
        select 1
        from public.conversation_post_likes circle_like
        where circle_like.post_id = base.id
          and circle_like.user_id = auth.uid()
      )
      else exists (
        select 1
        from public.post_likes personal_like
        where personal_like.post_id = base.id
          and personal_like.user_id = auth.uid()
      )
    end as liked_by_me,
    case
      when base.source_type = 'circle' then (
        select count(*)
        from public.conversation_post_comments circle_comment
        where circle_comment.post_id = base.id
      )
      else (
        select count(*)
        from public.post_comments personal_comment
        where personal_comment.post_id = base.id
      )
    end as comment_count,
    case
      when base.source_type = 'circle' then coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', media_row.id,
            'post_id', media_row.post_id,
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
        where media_row.post_id = base.id
      ), '[]'::jsonb)
      else coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', media_row.id,
            'post_id', media_row.post_id,
            'url', media_row.url,
            'media_type', media_row.media_type,
            'created_at', media_row.created_at
          )
          order by media_row.created_at asc
        )
        from public.post_media media_row
        where media_row.post_id = base.id
      ), '[]'::jsonb)
    end as media,
    base.display_aspect_ratio,
    base.media_crop_points,
    base.media_presentations,
    base.user_id = auth.uid() as can_edit
  from base
  join public.users author on author.id = base.user_id
  order by base.created_at desc, base.id desc;
$$;

revoke all on function public.get_feed_v3(integer, timestamptz) from public;
grant execute on function public.get_feed_v3(integer, timestamptz) to authenticated;

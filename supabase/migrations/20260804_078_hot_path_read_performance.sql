-- Circles Step 17 — hot-path read performance
--
-- Consolidates the two busiest social reads so the client no longer has to
-- assemble one visible page through multiple round trips. The legacy RPCs stay
-- available as compatibility fallbacks for clients deployed before this
-- migration reaches production.

create index if not exists posts_created_at_desc_index
  on public.posts (created_at desc);

create index if not exists post_comments_post_id_index
  on public.post_comments (post_id);

create index if not exists post_likes_post_user_index
  on public.post_likes (post_id, user_id);

create index if not exists conversation_message_reads_message_user_index
  on public.conversation_message_reads (message_id, user_id);

create index if not exists conversation_members_conversation_joined_index
  on public.conversation_members (conversation_id, joined_at, user_id);

-- One RPC now returns the complete first-pass Feed card model: author,
-- engagement counts, media, and framing metadata.
drop function if exists public.get_feed_v2(integer, timestamptz);
create function public.get_feed_v2(
  limit_count integer default 10,
  before timestamptz default now()
)
returns table (
  id uuid,
  user_id uuid,
  author_name text,
  author_avatar text,
  image_url text,
  caption text,
  created_at timestamptz,
  likes_count bigint,
  liked_by_me boolean,
  comment_count bigint,
  media jsonb,
  display_aspect_ratio numeric,
  media_crop_points jsonb,
  media_presentations jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      post.id,
      post.user_id,
      post.image_url,
      post.caption,
      post.created_at,
      post.display_aspect_ratio,
      post.media_crop_points,
      post.media_presentations
    from public.posts post
    where post.created_at < coalesce(before, now())
      and (
        post.user_id = auth.uid()
        or public.is_connected(auth.uid(), post.user_id)
      )
    order by post.created_at desc
    limit greatest(1, least(coalesce(limit_count, 10), 50))
  )
  select
    base.id,
    base.user_id,
    author.display_name,
    author.avatar_url,
    base.image_url,
    base.caption,
    base.created_at,
    (
      select count(*)
      from public.post_likes post_like
      where post_like.post_id = base.id
    ) as likes_count,
    exists (
      select 1
      from public.post_likes post_like
      where post_like.post_id = base.id
        and post_like.user_id = auth.uid()
    ) as liked_by_me,
    (
      select count(*)
      from public.post_comments comment
      where comment.post_id = base.id
    ) as comment_count,
    coalesce((
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
    ), '[]'::jsonb) as media,
    base.display_aspect_ratio,
    coalesce(base.media_crop_points, '[]'::jsonb),
    coalesce(base.media_presentations, '[]'::jsonb)
  from base
  join public.users author on author.id = base.user_id
  order by base.created_at desc;
$$;

revoke all on function public.get_feed_v2(integer, timestamptz) from public;
grant execute on function public.get_feed_v2(integer, timestamptz) to authenticated;

-- Message rows and their read state are now returned together. This removes a
-- second full-conversation RPC from every chat refresh.
drop function if exists public.get_conversation_messages_v2(uuid, integer, timestamptz);
create function public.get_conversation_messages_v2(
  p_conversation_id uuid,
  p_limit_count integer default 100,
  p_before timestamptz default now()
)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  sender_name text,
  sender_avatar text,
  body text,
  media jsonb,
  created_at timestamptz,
  read_count bigint,
  recipient_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      message.id,
      message.conversation_id,
      message.sender_id,
      message.body,
      message.created_at
    from public.messages message
    where message.conversation_id = p_conversation_id
      and message.created_at < coalesce(p_before, now())
      and public.conversation_is_member(p_conversation_id, auth.uid())
    order by message.created_at desc
    limit greatest(1, least(coalesce(p_limit_count, 100), 200))
  )
  select
    base.id,
    base.conversation_id,
    base.sender_id,
    sender.display_name,
    sender.avatar_url,
    base.body,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', media_row.id,
          'storage_path', media_row.storage_path,
          'media_type', media_row.media_type,
          'width', media_row.width,
          'height', media_row.height,
          'duration_ms', media_row.duration_ms,
          'sort_order', media_row.sort_order
        )
        order by media_row.sort_order
      )
      from public.message_media media_row
      where media_row.message_id = base.id
    ), '[]'::jsonb) as media,
    base.created_at,
    (
      select count(*)
      from public.conversation_message_reads receipt
      where receipt.message_id = base.id
        and receipt.user_id <> base.sender_id
    ) as read_count,
    (
      select count(*)
      from public.conversation_members recipient
      where recipient.conversation_id = base.conversation_id
        and recipient.user_id <> base.sender_id
        and recipient.joined_at <= base.created_at
    ) as recipient_count
  from base
  join public.users sender on sender.id = base.sender_id
  order by base.created_at desc;
$$;

revoke all on function public.get_conversation_messages_v2(uuid, integer, timestamptz) from public;
grant execute on function public.get_conversation_messages_v2(uuid, integer, timestamptz) to authenticated;

-- The full-screen profile post feed previously fetched every post detail
-- independently after loading the profile page. Return the complete feed-card
-- model for one profile in a single RPC instead.
drop function if exists public.get_profile_posts_v2(uuid);
create function public.get_profile_posts_v2(
  profile_user_id uuid
)
returns table (
  id uuid,
  user_id uuid,
  author_name text,
  author_avatar text,
  image_url text,
  caption text,
  created_at timestamptz,
  likes_count bigint,
  liked_by_me boolean,
  comment_count bigint,
  media jsonb,
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
    post.id,
    post.user_id,
    author.display_name,
    author.avatar_url,
    post.image_url,
    post.caption,
    post.created_at,
    (
      select count(*)
      from public.post_likes post_like
      where post_like.post_id = post.id
    ) as likes_count,
    exists (
      select 1
      from public.post_likes post_like
      where post_like.post_id = post.id
        and post_like.user_id = auth.uid()
    ) as liked_by_me,
    (
      select count(*)
      from public.post_comments comment
      where comment.post_id = post.id
    ) as comment_count,
    coalesce((
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
      where media_row.post_id = post.id
    ), '[]'::jsonb) as media,
    post.display_aspect_ratio,
    coalesce(post.media_crop_points, '[]'::jsonb),
    coalesce(post.media_presentations, '[]'::jsonb)
  from public.posts post
  join public.users author on author.id = post.user_id
  where post.user_id = profile_user_id
    and auth.uid() is not null
    and (
      auth.uid() = profile_user_id
      or public.is_connected(auth.uid(), profile_user_id)
    )
  order by post.created_at desc;
$$;

revoke all on function public.get_profile_posts_v2(uuid) from public;
grant execute on function public.get_profile_posts_v2(uuid) to authenticated;

-- Circles Phase 10B — intentional post framing
--
-- Stores a shared display frame per post plus one focal point per media item.
-- Original uploads remain untouched. Scrollable post surfaces use the saved
-- frame, while full post/media detail can continue showing the original file.

alter table public.posts
  add column if not exists display_aspect_ratio numeric,
  add column if not exists media_crop_points jsonb not null default '[]'::jsonb;

alter table public.conversation_posts
  add column if not exists display_aspect_ratio numeric,
  add column if not exists media_crop_points jsonb not null default '[]'::jsonb;

alter table public.posts
  drop constraint if exists posts_display_aspect_ratio_check,
  add constraint posts_display_aspect_ratio_check
  check (
    display_aspect_ratio is null
    or display_aspect_ratio between 0.8 and 1.91
  );

alter table public.posts
  drop constraint if exists posts_media_crop_points_check,
  add constraint posts_media_crop_points_check
  check (jsonb_typeof(media_crop_points) = 'array');

alter table public.conversation_posts
  drop constraint if exists conversation_posts_display_aspect_ratio_check,
  add constraint conversation_posts_display_aspect_ratio_check
  check (
    display_aspect_ratio is null
    or display_aspect_ratio between 0.8 and 1.91
  );

alter table public.conversation_posts
  drop constraint if exists conversation_posts_media_crop_points_check,
  add constraint conversation_posts_media_crop_points_check
  check (jsonb_typeof(media_crop_points) = 'array');

create or replace function public.validate_post_crop_points(p_points jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(coalesce(p_points, '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(p_points, '[]'::jsonb)) <= 10
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) as point
      where jsonb_typeof(point) <> 'object'
        or coalesce((point ->> 'x')::numeric, -1) < 0
        or coalesce((point ->> 'x')::numeric, 2) > 1
        or coalesce((point ->> 'y')::numeric, -1) < 0
        or coalesce((point ->> 'y')::numeric, 2) > 1
        or (point ? 'width' and point ->> 'width' is not null and coalesce((point ->> 'width')::numeric, 0) <= 0)
        or (point ? 'height' and point ->> 'height' is not null and coalesce((point ->> 'height')::numeric, 0) <= 0)
    );
$$;

revoke all on function public.validate_post_crop_points(jsonb) from public;

drop function if exists public.set_own_post_presentation(uuid, numeric, jsonb);
create function public.set_own_post_presentation(
  p_post_id uuid,
  p_aspect_ratio numeric,
  p_crop_points jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_aspect_ratio is null or p_aspect_ratio < 0.8 or p_aspect_ratio > 1.91 then
    raise exception 'Post aspect ratio must be between 0.8 and 1.91';
  end if;

  if not public.validate_post_crop_points(p_crop_points) then
    raise exception 'Post crop data is invalid';
  end if;

  update public.posts
  set
    display_aspect_ratio = p_aspect_ratio,
    media_crop_points = coalesce(p_crop_points, '[]'::jsonb)
  where id = p_post_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Post is unavailable or is not yours';
  end if;
end;
$$;

revoke all on function public.set_own_post_presentation(uuid, numeric, jsonb) from public;
grant execute on function public.set_own_post_presentation(uuid, numeric, jsonb) to authenticated;

drop function if exists public.set_own_circle_post_presentation(uuid, numeric, jsonb);
create function public.set_own_circle_post_presentation(
  p_post_id uuid,
  p_aspect_ratio numeric,
  p_crop_points jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_aspect_ratio is null or p_aspect_ratio < 0.8 or p_aspect_ratio > 1.91 then
    raise exception 'Post aspect ratio must be between 0.8 and 1.91';
  end if;

  if not public.validate_post_crop_points(p_crop_points) then
    raise exception 'Post crop data is invalid';
  end if;

  update public.conversation_posts
  set
    display_aspect_ratio = p_aspect_ratio,
    media_crop_points = coalesce(p_crop_points, '[]'::jsonb)
  where id = p_post_id
    and author_id = auth.uid();

  if not found then
    raise exception 'Circle post is unavailable or is not yours';
  end if;
end;
$$;

revoke all on function public.set_own_circle_post_presentation(uuid, numeric, jsonb) from public;
grant execute on function public.set_own_circle_post_presentation(uuid, numeric, jsonb) to authenticated;

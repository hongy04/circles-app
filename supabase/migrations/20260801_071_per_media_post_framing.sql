-- Circles Phase 10B follow-up — per-media post framing
--
-- Every photo/video in a post owns its own display frame. A carousel may mix
-- portrait, square, landscape, and full-original presentations. Original media
-- files remain untouched.

alter table public.posts
  add column if not exists display_aspect_ratio numeric,
  add column if not exists media_crop_points jsonb not null default '[]'::jsonb,
  add column if not exists media_presentations jsonb not null default '[]'::jsonb;

alter table public.conversation_posts
  add column if not exists display_aspect_ratio numeric,
  add column if not exists media_crop_points jsonb not null default '[]'::jsonb,
  add column if not exists media_presentations jsonb not null default '[]'::jsonb;

create or replace function public.validate_media_presentations(p_items jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(coalesce(p_items, '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(p_items, '[]'::jsonb)) <= 10
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
      where jsonb_typeof(item) <> 'object'
        or coalesce((item ->> 'aspectRatio')::numeric, 0) < 0.45
        or coalesce((item ->> 'aspectRatio')::numeric, 99) > 2.5
        or coalesce(item ->> 'fit', '') not in ('full', 'crop')
        or coalesce((item ->> 'x')::numeric, -1) < 0
        or coalesce((item ->> 'x')::numeric, 2) > 1
        or coalesce((item ->> 'y')::numeric, -1) < 0
        or coalesce((item ->> 'y')::numeric, 2) > 1
        or (item ? 'width' and item ->> 'width' is not null and coalesce((item ->> 'width')::numeric, 0) <= 0)
        or (item ? 'height' and item ->> 'height' is not null and coalesce((item ->> 'height')::numeric, 0) <= 0)
    );
$$;

revoke all on function public.validate_media_presentations(jsonb) from public;

create or replace function public.set_own_post_media_presentations(
  p_post_id uuid,
  p_media_presentations jsonb
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

  if not public.validate_media_presentations(p_media_presentations) then
    raise exception 'Post media framing data is invalid';
  end if;

  update public.posts
  set media_presentations = coalesce(p_media_presentations, '[]'::jsonb)
  where id = p_post_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Post is unavailable or is not yours';
  end if;
end;
$$;

revoke all on function public.set_own_post_media_presentations(uuid, jsonb) from public;
grant execute on function public.set_own_post_media_presentations(uuid, jsonb) to authenticated;

create or replace function public.set_own_circle_post_media_presentations(
  p_post_id uuid,
  p_media_presentations jsonb
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

  if not public.validate_media_presentations(p_media_presentations) then
    raise exception 'Circle post media framing data is invalid';
  end if;

  update public.conversation_posts
  set media_presentations = coalesce(p_media_presentations, '[]'::jsonb)
  where id = p_post_id
    and author_id = auth.uid();

  if not found then
    raise exception 'Circle post is unavailable or is not yours';
  end if;
end;
$$;

revoke all on function public.set_own_circle_post_media_presentations(uuid, jsonb) from public;
grant execute on function public.set_own_circle_post_media_presentations(uuid, jsonb) to authenticated;

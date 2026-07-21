-- Circles Step 5.1
-- Returns profile post previews through a privacy-aware security-definer RPC.
-- This avoids direct table reads being filtered to zero rows by posts/post_media RLS.

create or replace function public.get_profile_posts(profile_user_id uuid)
returns table (
  id uuid,
  user_id uuid,
  image_url text,
  caption text,
  created_at timestamptz,
  preview_url text,
  media_type text,
  media_count integer
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.user_id,
    p.image_url,
    p.caption,
    p.created_at,
    coalesce(first_media.url, p.image_url) as preview_url,
    coalesce(
      first_media.media_type,
      case
        when p.image_url ~* '\.(mp4|mov|m4v)(\?|$)' then 'video'
        else 'image'
      end
    ) as media_type,
    case
      when coalesce(media_totals.media_count, 0) > 0
        then media_totals.media_count
      when p.image_url is not null
        then 1
      else 0
    end::integer as media_count
  from public.posts p
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
  where p.user_id = profile_user_id
    and auth.uid() is not null
    and public.is_connected(auth.uid(), profile_user_id)
  order by p.created_at desc;
$$;

revoke all on function public.get_profile_posts(uuid) from public;
grant execute on function public.get_profile_posts(uuid) to authenticated;

-- Circles Step 26: Shared Album Scrapbook Covers
-- Adds an optional user-selected cover photo while keeping an automatic
-- three-photo collage as the default read model for shared album memories.

alter table public.two_person_circle_albums
  add column if not exists cover_photo_id uuid
    references public.two_person_circle_album_photos(id)
    on delete set null;

create index if not exists two_person_circle_albums_cover_photo_idx
  on public.two_person_circle_albums (cover_photo_id)
  where cover_photo_id is not null;

create or replace function public.two_person_album_json(
  p_album_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'album_id', album_row.id,
    'conversation_id', album_row.conversation_id,
    'created_by', album_row.created_by,
    'created_by_name', creator_user.display_name,
    'title', album_row.title,
    'note', album_row.note,
    'occurred_on', album_row.occurred_on,
    'photo_count', (
      select count(*)::integer
      from public.two_person_circle_album_photos photo_row
      where photo_row.album_id = album_row.id
        and photo_row.status = 'ready'
    ),
    'cover_photo_id', album_row.cover_photo_id,
    'cover_storage_path', (
      select photo_row.storage_path
      from public.two_person_circle_album_photos photo_row
      where photo_row.id = album_row.cover_photo_id
        and photo_row.album_id = album_row.id
        and photo_row.status = 'ready'
      limit 1
    ),
    'preview_storage_paths', coalesce(
      (
        select jsonb_agg(preview_row.storage_path order by preview_row.ready_at asc nulls last, preview_row.id asc)
        from (
          select
            photo_row.id,
            photo_row.storage_path,
            photo_row.ready_at
          from public.two_person_circle_album_photos photo_row
          where photo_row.album_id = album_row.id
            and photo_row.status = 'ready'
          order by photo_row.ready_at asc nulls last, photo_row.id asc
          limit 3
        ) preview_row
      ),
      '[]'::jsonb
    ),
    'created_at', album_row.created_at,
    'updated_at', album_row.updated_at
  )
  from public.two_person_circle_albums album_row
  join public.users creator_user on creator_user.id = album_row.created_by
  where album_row.id = p_album_id;
$$;

revoke all on function public.two_person_album_json(uuid)
  from public;

create or replace function public.set_two_person_circle_album_cover(
  p_album_id uuid,
  p_photo_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_album public.two_person_circle_albums%rowtype;
  v_photo public.two_person_circle_album_photos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.two_person_albums_feature_enabled() then
    raise exception 'Shared albums are temporarily unavailable.';
  end if;

  select *
  into v_album
  from public.two_person_circle_albums album_row
  where album_row.id = p_album_id
  for update;

  if v_album.id is null
     or not public.two_person_circle_is_unlocked(
       v_album.conversation_id,
       auth.uid()
     ) then
    raise exception 'This shared album is unavailable.';
  end if;

  if p_photo_id is not null then
    select *
    into v_photo
    from public.two_person_circle_album_photos photo_row
    where photo_row.id = p_photo_id
      and photo_row.album_id = p_album_id
      and photo_row.status = 'ready';

    if v_photo.id is null then
      raise exception 'Choose a photo from this album.';
    end if;
  end if;

  update public.two_person_circle_albums album_row
  set
    cover_photo_id = p_photo_id,
    updated_at = now()
  where album_row.id = p_album_id;

  return public.two_person_album_json(p_album_id);
end;
$$;

revoke all on function public.set_two_person_circle_album_cover(uuid, uuid)
  from public;
grant execute on function public.set_two_person_circle_album_cover(uuid, uuid)
  to authenticated;

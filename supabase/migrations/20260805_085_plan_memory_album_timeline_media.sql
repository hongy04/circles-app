-- Circles Step 31: Linked album media inside plan memories
-- Extends the shared-album read model with a bounded six-photo Timeline set.
-- Plans keep only the album id; Timeline joins the already-authorized album
-- summaries in memory, avoiding one album request per completed plan.

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
    'timeline_storage_paths', coalesce(
      (
        select jsonb_agg(timeline_row.storage_path order by timeline_row.ready_at asc nulls last, timeline_row.id asc)
        from (
          select
            photo_row.id,
            photo_row.storage_path,
            photo_row.ready_at
          from public.two_person_circle_album_photos photo_row
          where photo_row.album_id = album_row.id
            and photo_row.status = 'ready'
          order by photo_row.ready_at asc nulls last, photo_row.id asc
          limit 6
        ) timeline_row
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

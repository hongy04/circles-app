-- Circles Step 23 — private custom event cover photos
--
-- Adds one host-controlled cover image per event. Covers live in the existing
-- private event-media bucket, use short-lived signed URLs for authenticated
-- viewers, and are exposed to outside guests only after a valid private event
-- invitation token is verified by the trusted event-photo-access Edge Function.

alter table public.events
  add column if not exists cover_storage_path text,
  add column if not exists cover_pending_storage_path text,
  add column if not exists cover_width integer,
  add column if not exists cover_height integer,
  add column if not exists cover_updated_at timestamptz;

alter table public.events
  drop constraint if exists events_cover_storage_path_check;

alter table public.events
  add constraint events_cover_storage_path_check check (
    cover_storage_path is null
    or cover_storage_path ~* '^covers/[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$'
  );

alter table public.events
  drop constraint if exists events_cover_pending_storage_path_check;

alter table public.events
  add constraint events_cover_pending_storage_path_check check (
    cover_pending_storage_path is null
    or cover_pending_storage_path ~* '^covers/[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$'
  );

alter table public.events
  drop constraint if exists events_cover_width_check;

alter table public.events
  add constraint events_cover_width_check check (
    cover_width is null or cover_width between 1 and 20000
  );

alter table public.events
  drop constraint if exists events_cover_height_check;

alter table public.events
  add constraint events_cover_height_check check (
    cover_height is null or cover_height between 1 and 20000
  );

-- Storage authorization is based on the event id encoded in the prepared path.
-- This means a host can replace/remove an old cover even after the event row has
-- already been updated to point at the new one.
create or replace function public.event_cover_path_event_id(
  p_storage_path text
)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  v_path text := btrim(coalesce(p_storage_path, ''));
begin
  if v_path !~* '^covers/[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$' then
    return null;
  end if;

  begin
    return split_part(v_path, '/', 2)::uuid;
  exception
    when others then
      return null;
  end;
end;
$$;

revoke all on function public.event_cover_path_event_id(text) from public;
grant execute on function public.event_cover_path_event_id(text) to authenticated, service_role;

create or replace function public.event_cover_upload_is_allowed(
  p_storage_path text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.events event_row
      where event_row.id = public.event_cover_path_event_id(p_storage_path)
        and event_row.host_id = p_user_id
        and event_row.cover_pending_storage_path = p_storage_path
    );
$$;

revoke all on function public.event_cover_upload_is_allowed(text, uuid) from public;
grant execute on function public.event_cover_upload_is_allowed(text, uuid) to authenticated;

create or replace function public.event_cover_delete_is_allowed(
  p_storage_path text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.events event_row
      where event_row.id = public.event_cover_path_event_id(p_storage_path)
        and event_row.host_id = p_user_id
    );
$$;

revoke all on function public.event_cover_delete_is_allowed(text, uuid) from public;
grant execute on function public.event_cover_delete_is_allowed(text, uuid) to authenticated;

create or replace function public.event_cover_read_is_allowed(
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.events event_row
      where event_row.cover_storage_path = p_storage_path
        and public.event_viewer_can_access(event_row.id, auth.uid())
    );
$$;

revoke all on function public.event_cover_read_is_allowed(text) from public;
grant execute on function public.event_cover_read_is_allowed(text) to authenticated;

-- Multiple Storage policies are OR'd, so these extend the existing event-photo
-- rules without weakening attendee gallery authorization.
drop policy if exists "Event hosts can upload private event covers" on storage.objects;
create policy "Event hosts can upload private event covers"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-media'
  and public.event_cover_upload_is_allowed(name, auth.uid())
);

drop policy if exists "Event hosts can remove private event covers" on storage.objects;
create policy "Event hosts can remove private event covers"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-media'
  and public.event_cover_delete_is_allowed(name, auth.uid())
);

drop policy if exists "Event viewers can read private event covers" on storage.objects;
create policy "Event viewers can read private event covers"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'event-media'
  and public.event_cover_read_is_allowed(name)
);

create or replace function public.prepare_event_cover_upload(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_event public.events%rowtype;
  v_object_id uuid := gen_random_uuid();
  v_storage_path text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found or not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.host_id <> auth.uid() then
    raise exception 'Only the event host can change the event photo';
  end if;

  if v_event.status = 'cancelled' then
    raise exception 'A cancelled event cannot change its event photo';
  end if;

  v_storage_path := 'covers/' || p_event_id::text || '/' || v_object_id::text || '.jpg';

  update public.events
  set cover_pending_storage_path = v_storage_path,
      updated_at = now()
  where id = p_event_id;

  return jsonb_build_object(
    'storage_path', v_storage_path,
    'previous_storage_path', v_event.cover_storage_path
  );
end;
$$;

revoke all on function public.prepare_event_cover_upload(uuid) from public;
grant execute on function public.prepare_event_cover_upload(uuid) to authenticated;

create or replace function public.cancel_event_cover_upload(
  p_event_id uuid,
  p_storage_path text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.events event_row
  set cover_pending_storage_path = null,
      updated_at = now()
  where event_row.id = p_event_id
    and event_row.host_id = auth.uid()
    and event_row.cover_pending_storage_path = btrim(coalesce(p_storage_path, ''));

  return found;
end;
$$;

revoke all on function public.cancel_event_cover_upload(uuid, text) from public;
grant execute on function public.cancel_event_cover_upload(uuid, text) to authenticated;

create or replace function public.finalize_event_cover_upload(
  p_event_id uuid,
  p_storage_path text,
  p_width integer default null,
  p_height integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_width integer := case when p_width between 1 and 20000 then p_width else null end;
  v_height integer := case when p_height between 1 and 20000 then p_height else null end;
  v_previous_path text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id
  for update;

  if not found or not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.host_id <> auth.uid() then
    raise exception 'Only the event host can change the event photo';
  end if;

  if v_event.status = 'cancelled' then
    raise exception 'A cancelled event cannot change its event photo';
  end if;

  if public.event_cover_path_event_id(v_path) is distinct from p_event_id
     or v_event.cover_pending_storage_path is distinct from v_path then
    raise exception 'Event photo upload path is invalid or expired';
  end if;

  if not exists (
    select 1
    from storage.objects object_row
    where object_row.bucket_id = 'event-media'
      and object_row.name = v_path
  ) then
    raise exception 'Event photo upload was not found in Storage';
  end if;

  v_previous_path := v_event.cover_storage_path;

  update public.events
  set
    cover_storage_path = v_path,
    cover_pending_storage_path = null,
    cover_width = v_width,
    cover_height = v_height,
    cover_updated_at = now(),
    updated_at = now()
  where id = p_event_id;

  return jsonb_build_object(
    'storage_path', v_path,
    'previous_storage_path', v_previous_path,
    'width', v_width,
    'height', v_height,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.finalize_event_cover_upload(uuid, text, integer, integer) from public;
grant execute on function public.finalize_event_cover_upload(uuid, text, integer, integer) to authenticated;

create or replace function public.remove_event_cover_photo(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_previous_path text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id
  for update;

  if not found or not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.host_id <> auth.uid() then
    raise exception 'Only the event host can change the event photo';
  end if;

  v_previous_path := v_event.cover_storage_path;

  update public.events
  set
    cover_storage_path = null,
    cover_pending_storage_path = null,
    cover_width = null,
    cover_height = null,
    cover_updated_at = now(),
    updated_at = now()
  where id = p_event_id;

  return jsonb_build_object('previous_storage_path', v_previous_path);
end;
$$;

revoke all on function public.remove_event_cover_photo(uuid) from public;
grant execute on function public.remove_event_cover_photo(uuid) to authenticated;

-- A tiny visual-identity RPC avoids expanding the already-large event-detail
-- result. It runs in parallel with the existing detail/attendance reads.
create or replace function public.get_event_visual_identity(
  p_event_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found then
    raise exception 'Event not found or unavailable';
  end if;

  return jsonb_build_object(
    'appearance_key', coalesce(v_event.appearance_key, 'circle'),
    'cover_storage_path', v_event.cover_storage_path,
    'cover_width', v_event.cover_width,
    'cover_height', v_event.cover_height,
    'cover_updated_at', v_event.cover_updated_at
  );
end;
$$;

revoke all on function public.get_event_visual_identity(uuid) from public;
grant execute on function public.get_event_visual_identity(uuid) to authenticated;

-- Guest photo metadata remains service-role-only. The cover path is returned to
-- the trusted Edge Function alongside gallery paths so the raw private Storage
-- path is never exposed to the guest client.
create or replace function public.list_event_guest_photos(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_links_enabled boolean := true;
  v_photos_enabled boolean := true;
  v_event_id uuid;
  v_event_status text;
  v_appearance_key text := 'circle';
  v_cover_storage_path text;
  v_photo_count integer := 0;
  v_photos jsonb := '[]'::jsonb;
begin
  select coalesce(flag_row.enabled, true)
  into v_guest_links_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'event_guest_web_rsvp';

  select coalesce(flag_row.enabled, true)
  into v_photos_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'event_photo_gallery';

  if not coalesce(v_guest_links_enabled, true) then
    return jsonb_build_object(
      'valid', false,
      'reason', 'disabled',
      'gallery_enabled', false,
      'photo_count', 0,
      'photos', '[]'::jsonb
    );
  end if;

  v_event_id := public.event_id_for_valid_guest_token(p_token);

  if v_event_id is null then
    return jsonb_build_object(
      'valid', false,
      'reason', 'not_found',
      'gallery_enabled', coalesce(v_photos_enabled, true),
      'photo_count', 0,
      'photos', '[]'::jsonb
    );
  end if;

  select
    event_row.status,
    coalesce(event_row.appearance_key, 'circle'),
    event_row.cover_storage_path
  into v_event_status, v_appearance_key, v_cover_storage_path
  from public.events event_row
  where event_row.id = v_event_id;

  if not found or v_event_status = 'cancelled' then
    return jsonb_build_object(
      'valid', false,
      'reason', 'event_unavailable',
      'gallery_enabled', coalesce(v_photos_enabled, true),
      'photo_count', 0,
      'photos', '[]'::jsonb
    );
  end if;

  if coalesce(v_photos_enabled, true) then
    select
      count(*)::integer,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'storage_path', photo_row.storage_path,
            'width', photo_row.width,
            'height', photo_row.height,
            'created_at', photo_row.ready_at
          )
          order by photo_row.ready_at desc, photo_row.id desc
        ),
        '[]'::jsonb
      )
    into v_photo_count, v_photos
    from public.event_photos photo_row
    where photo_row.event_id = v_event_id
      and photo_row.status = 'ready';

    perform public.record_event_photo_analytics(
      'event_guest_photo_gallery_opened',
      'guest_event_invitation',
      'open',
      v_photo_count
    );
  end if;

  return jsonb_build_object(
    'valid', true,
    'gallery_enabled', coalesce(v_photos_enabled, true),
    'appearance_key', coalesce(v_appearance_key, 'circle'),
    'cover_storage_path', v_cover_storage_path,
    'photo_count', coalesce(v_photo_count, 0),
    'photos', v_photos
  );
end;
$$;

revoke all on function public.list_event_guest_photos(text) from public;
revoke execute on function public.list_event_guest_photos(text) from anon, authenticated;
grant execute on function public.list_event_guest_photos(text) to service_role;

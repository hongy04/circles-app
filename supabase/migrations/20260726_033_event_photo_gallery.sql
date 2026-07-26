-- Circles Phase 2F — event photo gallery and guest web viewing
--
-- Adds a shared image-only gallery to private events. Authenticated attendees
-- marked Going may upload photos; invited Circle members may view them; the
-- uploader or event host may remove them. People holding a valid guest link
-- may view the same gallery without gaining access to profiles, Circle names,
-- posts, messages, connections, or internal identifiers.
--
-- MVP delivery note: event images use a public Storage bucket with random,
-- unlisted object paths because the account-free web page cannot mint private
-- Storage signed URLs without a server/Edge Function. The database reveals
-- paths only through membership-protected or valid-token RPCs. A copied image
-- URL may continue to work until the photo is removed; a future Edge Function
-- can replace this with expiring signed delivery without changing event rows.

-- ---------------------------------------------------------------------------
-- Remote control
-- ---------------------------------------------------------------------------

alter table public.app_feature_flags
  drop constraint if exists app_feature_flags_key_check;

alter table public.app_feature_flags
  add constraint app_feature_flags_key_check check (
    flag_key in (
      'launch_invitations',
      'mutual_preview_posts',
      'preconnection_profile_shell',
      'launch_analytics',
      'circle_events',
      'event_availability_polls',
      'multi_circle_events',
      'event_outside_guests',
      'event_guest_web_rsvp',
      'event_photo_gallery'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'event_photo_gallery',
  true,
  'Allows private event photo uploads and valid guest-link gallery viewing.'
)
on conflict (flag_key) do nothing;

-- ---------------------------------------------------------------------------
-- Analytics allowlist
-- ---------------------------------------------------------------------------

alter table public.app_analytics_events
  drop constraint if exists app_analytics_event_name_check;

alter table public.app_analytics_events
  add constraint app_analytics_event_name_check check (
    event_name in (
      'invite_created',
      'invite_share_opened',
      'invite_previewed',
      'invite_redeemed',
      'mutuals_opened',
      'mutual_preview_updated',
      'preconnection_profile_opened',
      'connection_request_sent',
      'connection_request_responded',
      'circle_member_invites_sent',
      'event_created',
      'event_opened',
      'event_rsvp_updated',
      'event_poll_created',
      'event_poll_opened',
      'event_poll_response_updated',
      'event_poll_finalized',
      'event_guest_added',
      'event_guest_response_updated',
      'event_guest_removed',
      'event_guest_settings_updated',
      'event_guest_invite_created',
      'event_guest_invite_opened',
      'event_guest_web_rsvp_updated',
      'event_photo_uploaded',
      'event_photo_removed',
      'event_photo_gallery_opened',
      'event_guest_photo_gallery_opened'
    )
  );

create or replace function public.record_event_photo_analytics(
  p_event_name text,
  p_surface text,
  p_action text,
  p_photo_count integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_clean_count integer;
begin
  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'launch_analytics';

  if not coalesce(v_enabled, true) then
    return;
  end if;

  if p_event_name not in (
    'event_photo_uploaded',
    'event_photo_removed',
    'event_photo_gallery_opened',
    'event_guest_photo_gallery_opened'
  ) then
    return;
  end if;

  if p_surface not in ('event_photo_gallery', 'guest_event_invitation') then
    return;
  end if;

  if p_action not in ('upload', 'remove', 'open') then
    return;
  end if;

  if p_photo_count is not null then
    v_clean_count := greatest(0, least(p_photo_count, 500));
  end if;

  begin
    insert into public.app_analytics_events (
      event_name,
      actor_id,
      properties
    )
    values (
      p_event_name,
      auth.uid(),
      jsonb_strip_nulls(jsonb_build_object(
        'surface', p_surface,
        'action', p_action,
        'photo_count', v_clean_count,
        'viewer_type', case
          when p_surface = 'guest_event_invitation' then 'guest'
          else 'member'
        end
      ))
    );
  exception
    when others then
      -- Analytics must never block event photo behavior.
      null;
  end;
end;
$$;

revoke all on function public.record_event_photo_analytics(text, text, text, integer) from public;

-- ---------------------------------------------------------------------------
-- Event photo records and upload lifecycle
-- ---------------------------------------------------------------------------

create table if not exists public.event_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  uploaded_by uuid references public.users(id) on delete set null,
  storage_path text not null unique,
  status text not null default 'pending' check (
    status in ('pending', 'ready')
  ),
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  constraint event_photos_width_check check (
    width is null or width between 1 and 20000
  ),
  constraint event_photos_height_check check (
    height is null or height between 1 and 20000
  ),
  constraint event_photos_storage_path_check check (
    storage_path ~* '^gallery/[0-9a-f-]{36}[.]jpg$'
  )
);

create index if not exists event_photos_event_ready_index
  on public.event_photos (event_id, ready_at desc, id desc)
  where status = 'ready';

create index if not exists event_photos_uploader_index
  on public.event_photos (uploaded_by, created_at desc);

alter table public.event_photos enable row level security;

-- No direct table policies are exposed. Membership, uploader rights, guest
-- tokens, and display-safe output are enforced through the RPCs below.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'event-media',
  'event-media',
  true,
  15728640,
  array['image/jpeg']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.event_photo_upload_is_allowed(
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
      from public.event_photos photo_row
      where photo_row.storage_path = p_storage_path
        and photo_row.uploaded_by = p_user_id
        and photo_row.status = 'pending'
        and public.event_viewer_can_access(photo_row.event_id, p_user_id)
    );
$$;

revoke all on function public.event_photo_upload_is_allowed(text, uuid) from public;
grant execute on function public.event_photo_upload_is_allowed(text, uuid) to authenticated;

create or replace function public.event_photo_delete_is_allowed(
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
      from public.event_photos photo_row
      join public.events event_row on event_row.id = photo_row.event_id
      where photo_row.storage_path = p_storage_path
        and (
          photo_row.uploaded_by = p_user_id
          or event_row.host_id = p_user_id
        )
    );
$$;

revoke all on function public.event_photo_delete_is_allowed(text, uuid) from public;
grant execute on function public.event_photo_delete_is_allowed(text, uuid) to authenticated;

drop policy if exists "Event attendees can upload prepared photos" on storage.objects;
create policy "Event attendees can upload prepared photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-media'
  and public.event_photo_upload_is_allowed(name, auth.uid())
);

drop policy if exists "Event photo owners or hosts can remove photos" on storage.objects;
create policy "Event photo owners or hosts can remove photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-media'
  and public.event_photo_delete_is_allowed(name, auth.uid())
);

create or replace function public.prepare_event_photo_upload(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_enabled boolean := true;
  v_event public.events%rowtype;
  v_photo_id uuid := gen_random_uuid();
  v_object_id uuid := gen_random_uuid();
  v_storage_path text;
  v_photo_count integer := 0;
  v_can_upload boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'event_photo_gallery';

  if not coalesce(v_enabled, true) then
    raise exception 'Event photos are temporarily unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found or not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.status = 'cancelled' then
    raise exception 'Photos cannot be added to a cancelled event';
  end if;

  v_can_upload := v_event.host_id = auth.uid() or exists (
    select 1
    from public.event_rsvps rsvp_row
    where rsvp_row.event_id = p_event_id
      and rsvp_row.user_id = auth.uid()
      and rsvp_row.status = 'going'
  );

  if not v_can_upload then
    raise exception 'RSVP Going before adding event photos';
  end if;

  delete from public.event_photos photo_row
  where photo_row.status = 'pending'
    and photo_row.created_at < now() - interval '24 hours';

  select count(*)::integer
  into v_photo_count
  from public.event_photos photo_row
  where photo_row.event_id = p_event_id;

  if v_photo_count >= 500 then
    raise exception 'This event has reached the photo limit';
  end if;

  v_storage_path := 'gallery/' || v_object_id::text || '.jpg';

  insert into public.event_photos (
    id,
    event_id,
    uploaded_by,
    storage_path,
    status
  )
  values (
    v_photo_id,
    p_event_id,
    auth.uid(),
    v_storage_path,
    'pending'
  );

  return jsonb_build_object(
    'photo_id', v_photo_id,
    'storage_path', v_storage_path
  );
end;
$$;

revoke all on function public.prepare_event_photo_upload(uuid) from public;
grant execute on function public.prepare_event_photo_upload(uuid) to authenticated;

create or replace function public.cancel_event_photo_upload(
  p_photo_id uuid
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

  delete from public.event_photos photo_row
  where photo_row.id = p_photo_id
    and photo_row.uploaded_by = auth.uid()
    and photo_row.status = 'pending';

  return found;
end;
$$;

revoke all on function public.cancel_event_photo_upload(uuid) from public;
grant execute on function public.cancel_event_photo_upload(uuid) to authenticated;

create or replace function public.finalize_event_photo_upload(
  p_photo_id uuid,
  p_width integer default null,
  p_height integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo public.event_photos%rowtype;
  v_width integer;
  v_height integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select photo_row.*
  into v_photo
  from public.event_photos photo_row
  where photo_row.id = p_photo_id
  for update;

  if not found
     or v_photo.uploaded_by <> auth.uid()
     or v_photo.status <> 'pending'
     or not public.event_viewer_can_access(v_photo.event_id, auth.uid()) then
    raise exception 'Photo upload is unavailable';
  end if;

  if not exists (
    select 1
    from storage.objects object_row
    where object_row.bucket_id = 'event-media'
      and object_row.name = v_photo.storage_path
  ) then
    raise exception 'Photo upload was not found in Storage';
  end if;

  if p_width is not null then
    v_width := greatest(1, least(p_width, 20000));
  end if;

  if p_height is not null then
    v_height := greatest(1, least(p_height, 20000));
  end if;

  update public.event_photos
  set
    status = 'ready',
    width = v_width,
    height = v_height,
    ready_at = now()
  where id = p_photo_id;

  perform public.record_event_photo_analytics(
    'event_photo_uploaded',
    'event_photo_gallery',
    'upload',
    1
  );

  return jsonb_build_object(
    'photo_id', v_photo.id,
    'storage_path', v_photo.storage_path
  );
end;
$$;

revoke all on function public.finalize_event_photo_upload(uuid, integer, integer) from public;
grant execute on function public.finalize_event_photo_upload(uuid, integer, integer) to authenticated;

create or replace function public.list_event_photos(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_can_upload boolean := false;
  v_photos jsonb := '[]'::jsonb;
  v_photo_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.app_feature_flags flag_row
    where flag_row.flag_key = 'event_photo_gallery'
      and flag_row.enabled
  ) then
    raise exception 'Event photos are temporarily unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found or not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  v_can_upload := v_event.status <> 'cancelled' and (
    v_event.host_id = auth.uid()
    or exists (
      select 1
      from public.event_rsvps rsvp_row
      where rsvp_row.event_id = p_event_id
        and rsvp_row.user_id = auth.uid()
        and rsvp_row.status = 'going'
    )
  );

  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'photo_id', photo_row.id,
          'storage_path', photo_row.storage_path,
          'width', photo_row.width,
          'height', photo_row.height,
          'created_at', photo_row.ready_at,
          'uploader_name', coalesce(uploader_row.display_name, 'Circle member'),
          'uploader_avatar', uploader_row.avatar_url,
          'can_delete', (
            photo_row.uploaded_by = auth.uid()
            or v_event.host_id = auth.uid()
          )
        )
        order by photo_row.ready_at desc, photo_row.id desc
      ),
      '[]'::jsonb
    )
  into v_photo_count, v_photos
  from public.event_photos photo_row
  left join public.users uploader_row on uploader_row.id = photo_row.uploaded_by
  where photo_row.event_id = p_event_id
    and photo_row.status = 'ready';

  perform public.record_event_photo_analytics(
    'event_photo_gallery_opened',
    'event_photo_gallery',
    'open',
    v_photo_count
  );

  return jsonb_build_object(
    'can_upload', v_can_upload,
    'photo_count', coalesce(v_photo_count, 0),
    'photos', v_photos
  );
end;
$$;

revoke all on function public.list_event_photos(uuid) from public;
grant execute on function public.list_event_photos(uuid) to authenticated;

create or replace function public.delete_event_photo(
  p_photo_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo public.event_photos%rowtype;
  v_host_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select photo_row.*
  into v_photo
  from public.event_photos photo_row
  where photo_row.id = p_photo_id;

  if not found then
    return false;
  end if;

  select event_row.host_id
  into v_host_id
  from public.events event_row
  where event_row.id = v_photo.event_id;

  if v_photo.uploaded_by <> auth.uid() and v_host_id <> auth.uid() then
    raise exception 'Only the uploader or event host can remove this photo';
  end if;

  delete from public.event_photos
  where id = p_photo_id;

  perform public.record_event_photo_analytics(
    'event_photo_removed',
    'event_photo_gallery',
    'remove',
    1
  );

  return true;
end;
$$;

revoke all on function public.delete_event_photo(uuid) from public;
grant execute on function public.delete_event_photo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privacy-safe guest-token gallery
-- ---------------------------------------------------------------------------

create or replace function public.event_id_for_valid_guest_token(
  p_token text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_clean_token text := lower(btrim(coalesce(p_token, '')));
  v_token_hash text;
  v_event_id uuid;
begin
  if v_clean_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  v_token_hash := encode(digest(v_clean_token, 'sha256'), 'hex');

  select invitation_row.event_id
  into v_event_id
  from public.event_guest_invitations invitation_row
  where invitation_row.token_hash = v_token_hash
    and invitation_row.revoked_at is null
    and invitation_row.expires_at > now();

  if v_event_id is null then
    select guest_row.event_id
    into v_event_id
    from public.event_guests guest_row
    where guest_row.invite_token_hash = v_token_hash
      and guest_row.invite_revoked_at is null
      and guest_row.invite_expires_at is not null
      and guest_row.invite_expires_at > now();
  end if;

  return v_event_id;
end;
$$;

revoke all on function public.event_id_for_valid_guest_token(text) from public;

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

  if not coalesce(v_guest_links_enabled, true)
     or not coalesce(v_photos_enabled, true) then
    return jsonb_build_object(
      'valid', false,
      'reason', 'disabled',
      'photo_count', 0,
      'photos', '[]'::jsonb
    );
  end if;

  v_event_id := public.event_id_for_valid_guest_token(p_token);

  if v_event_id is null then
    return jsonb_build_object(
      'valid', false,
      'reason', 'not_found',
      'photo_count', 0,
      'photos', '[]'::jsonb
    );
  end if;

  select event_row.status
  into v_event_status
  from public.events event_row
  where event_row.id = v_event_id;

  if not found or v_event_status = 'cancelled' then
    return jsonb_build_object(
      'valid', false,
      'reason', 'event_unavailable',
      'photo_count', 0,
      'photos', '[]'::jsonb
    );
  end if;

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

  return jsonb_build_object(
    'valid', true,
    'photo_count', coalesce(v_photo_count, 0),
    'photos', v_photos
  );
end;
$$;

revoke all on function public.list_event_guest_photos(text) from public;
grant execute on function public.list_event_guest_photos(text) to anon, authenticated;

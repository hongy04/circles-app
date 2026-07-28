-- Circles Phase 7C — Shared Occasion Albums
--
-- Adds deliberate photo collections for trips, dates, celebrations, and other
-- meaningful experiences inside an unlocked two-person Circle. Albums are not
-- a general public gallery and do not automatically publish into Timeline.

-- ---------------------------------------------------------------------------
-- Feature control and privacy-safe analytics allowlists
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
      'event_photo_gallery',
      'event_history',
      'shared_event_connections',
      'guest_attendance_claims',
      'trusted_mutuals_ranking',
      'event_repeat_signals',
      'romantic_channel_beta',
      'romantic_interest_beta',
      'romantic_focus_beta',
      'two_person_circle_proposals',
      'two_person_circle_plans',
      'two_person_circle_important_dates',
      'two_person_circle_thoughts',
      'two_person_circle_albums'
    )
  );

insert into public.app_feature_flags (
  flag_key,
  enabled,
  description
)
values (
  'two_person_circle_albums',
  true,
  'Enables deliberate shared photo albums inside an unlocked two-person Circle.'
)
on conflict (flag_key) do update
set
  description = excluded.description,
  updated_at = now();

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
      'event_guest_photo_gallery_opened',
      'event_attendance_review_opened',
      'event_attendance_review_saved',
      'event_connections_opened',
      'event_connection_request_sent',
      'event_guest_account_claimed',
      'event_repeat_signal_updated',
      'event_repeat_plan_started',
      'romantic_settings_updated',
      'romantic_visibility_updated',
      'romantic_interest_updated',
      'romantic_interest_mutual_activated',
      'romantic_interest_revealed',
      'romantic_focus_updated',
      'romantic_focus_mutual_activated',
      'romantic_focus_revealed',
      'romantic_discovery_resumed',
      'two_person_circle_proposal_updated',
      'two_person_circle_activated',
      'two_person_plan_created',
      'two_person_plan_updated',
      'two_person_plan_response_updated',
      'two_person_plan_completed',
      'two_person_important_date_created',
      'two_person_important_date_updated',
      'two_person_important_date_removed',
      'two_person_thought_draft_created',
      'two_person_thought_draft_updated',
      'two_person_thought_shared',
      'two_person_thought_removed',
      'two_person_album_created',
      'two_person_album_updated',
      'two_person_album_removed',
      'two_person_album_photo_uploaded',
      'two_person_album_photo_removed'
    )
  );

create or replace function public.record_two_person_album_analytics(
  p_event_name text,
  p_action text,
  p_has_date boolean default null,
  p_has_note boolean default null,
  p_photo_count integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_photo_count integer;
begin
  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'launch_analytics';

  if not coalesce(v_enabled, true) then
    return;
  end if;

  if p_event_name not in (
    'two_person_album_created',
    'two_person_album_updated',
    'two_person_album_removed',
    'two_person_album_photo_uploaded',
    'two_person_album_photo_removed'
  ) then
    return;
  end if;

  if p_action not in ('create', 'update', 'remove', 'upload', 'remove_photo') then
    return;
  end if;

  if p_photo_count is not null then
    v_photo_count := greatest(0, least(p_photo_count, 500));
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
        'surface', 'two_person_circle_albums',
        'action', p_action,
        'has_date', p_has_date,
        'has_note', p_has_note,
        'photo_count', v_photo_count
      ))
    );
  exception
    when others then
      null;
  end;
end;
$$;

revoke all on function public.record_two_person_album_analytics(
  text,
  text,
  boolean,
  boolean,
  integer
) from public;

-- ---------------------------------------------------------------------------
-- Album records and private photo storage
-- ---------------------------------------------------------------------------

create table if not exists public.two_person_circle_albums (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  title text not null,
  note text not null default '',
  occurred_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint two_person_album_title_length check (
    length(trim(title)) between 1 and 80
  ),
  constraint two_person_album_note_length check (
    length(note) <= 500
  )
);

create table if not exists public.two_person_circle_album_photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.two_person_circle_albums(id) on delete cascade,
  uploaded_by uuid references public.users(id) on delete set null,
  storage_path text not null unique,
  status text not null default 'pending' check (
    status in ('pending', 'ready')
  ),
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  constraint two_person_album_photo_width_check check (
    width is null or width between 1 and 20000
  ),
  constraint two_person_album_photo_height_check check (
    height is null or height between 1 and 20000
  ),
  constraint two_person_album_photo_path_check check (
    storage_path ~* '^album/[0-9a-f-]{36}[.]jpg$'
  )
);

create index if not exists two_person_circle_albums_conversation_idx
  on public.two_person_circle_albums (
    conversation_id,
    occurred_on desc nulls last,
    created_at desc
  );

create index if not exists two_person_circle_album_photos_album_idx
  on public.two_person_circle_album_photos (
    album_id,
    ready_at asc,
    id asc
  )
  where status = 'ready';

alter table public.two_person_circle_albums enable row level security;
alter table public.two_person_circle_album_photos enable row level security;

revoke insert, update, delete
  on table public.two_person_circle_albums
  from anon, authenticated;

revoke insert, update, delete
  on table public.two_person_circle_album_photos
  from anon, authenticated;

-- Albums remain invisible whenever the shared Circle is locked.
drop policy if exists two_person_circle_albums_select
  on public.two_person_circle_albums;

create policy two_person_circle_albums_select
on public.two_person_circle_albums
for select
to authenticated
using (
  public.two_person_circle_is_unlocked(conversation_id, auth.uid())
);

drop policy if exists two_person_circle_album_photos_select
  on public.two_person_circle_album_photos;

create policy two_person_circle_album_photos_select
on public.two_person_circle_album_photos
for select
to authenticated
using (
  exists (
    select 1
    from public.two_person_circle_albums album_row
    where album_row.id = album_id
      and (
        status = 'ready'
        or uploaded_by = auth.uid()
      )
      and public.two_person_circle_is_unlocked(
        album_row.conversation_id,
        auth.uid()
      )
  )
);

do $$
begin
  alter publication supabase_realtime
    add table public.two_person_circle_albums;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime
    add table public.two_person_circle_album_photos;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'two-person-album-media',
  'two-person-album-media',
  false,
  15728640,
  array['image/jpeg']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.two_person_albums_feature_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select flag_row.enabled
      from public.app_feature_flags flag_row
      where flag_row.flag_key = 'two_person_circle_albums'
    ),
    true
  );
$$;

revoke all on function public.two_person_albums_feature_enabled()
  from public;

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
    'cover_storage_path', (
      select photo_row.storage_path
      from public.two_person_circle_album_photos photo_row
      where photo_row.album_id = album_row.id
        and photo_row.status = 'ready'
      order by photo_row.ready_at asc nulls last, photo_row.id asc
      limit 1
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

create or replace function public.two_person_album_photo_json(
  p_photo_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'photo_id', photo_row.id,
    'album_id', photo_row.album_id,
    'storage_path', photo_row.storage_path,
    'width', photo_row.width,
    'height', photo_row.height,
    'uploader_name', coalesce(uploader_user.display_name, 'Circle member'),
    'uploader_avatar', uploader_user.avatar_url,
    'can_delete', public.two_person_circle_is_unlocked(
      album_row.conversation_id,
      auth.uid()
    ),
    'created_at', coalesce(photo_row.ready_at, photo_row.created_at)
  )
  from public.two_person_circle_album_photos photo_row
  join public.two_person_circle_albums album_row on album_row.id = photo_row.album_id
  left join public.users uploader_user on uploader_user.id = photo_row.uploaded_by
  where photo_row.id = p_photo_id
    and photo_row.status = 'ready';
$$;

revoke all on function public.two_person_album_photo_json(uuid)
  from public;

-- Storage policy helpers. Signed URLs can be minted only while the Circle is
-- unlocked; already-issued URLs expire after the client-selected short TTL.
create or replace function public.two_person_album_object_is_allowed(
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
      from public.two_person_circle_album_photos photo_row
      join public.two_person_circle_albums album_row on album_row.id = photo_row.album_id
      where photo_row.storage_path = p_storage_path
        and (
          photo_row.status = 'ready'
          or photo_row.uploaded_by = p_user_id
        )
        and public.two_person_circle_is_unlocked(
          album_row.conversation_id,
          p_user_id
        )
    );
$$;

revoke all on function public.two_person_album_object_is_allowed(text, uuid)
  from public;
grant execute on function public.two_person_album_object_is_allowed(text, uuid)
  to authenticated;

create or replace function public.two_person_album_upload_is_allowed(
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
      from public.two_person_circle_album_photos photo_row
      join public.two_person_circle_albums album_row on album_row.id = photo_row.album_id
      where photo_row.storage_path = p_storage_path
        and photo_row.uploaded_by = p_user_id
        and photo_row.status = 'pending'
        and public.two_person_circle_is_unlocked(
          album_row.conversation_id,
          p_user_id
        )
    );
$$;

revoke all on function public.two_person_album_upload_is_allowed(text, uuid)
  from public;
grant execute on function public.two_person_album_upload_is_allowed(text, uuid)
  to authenticated;

drop policy if exists "Two-person album members can read photos" on storage.objects;
create policy "Two-person album members can read photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'two-person-album-media'
  and public.two_person_album_object_is_allowed(name, auth.uid())
);

drop policy if exists "Two-person album members can upload prepared photos" on storage.objects;
create policy "Two-person album members can upload prepared photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'two-person-album-media'
  and public.two_person_album_upload_is_allowed(name, auth.uid())
);

drop policy if exists "Two-person album members can remove photos" on storage.objects;
create policy "Two-person album members can remove photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'two-person-album-media'
  and public.two_person_album_object_is_allowed(name, auth.uid())
);

-- ---------------------------------------------------------------------------
-- Album read and metadata RPCs
-- ---------------------------------------------------------------------------

create or replace function public.list_two_person_circle_albums(
  p_conversation_id uuid
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.two_person_albums_feature_enabled() then
    raise exception 'Shared albums are temporarily unavailable.';
  end if;

  if not public.two_person_circle_is_unlocked(
    p_conversation_id,
    auth.uid()
  ) then
    raise exception 'Our Circle is closed or unavailable.';
  end if;

  return query
  select public.two_person_album_json(album_row.id)
  from public.two_person_circle_albums album_row
  where album_row.conversation_id = p_conversation_id
  order by
    coalesce(album_row.occurred_on, album_row.created_at::date) desc,
    album_row.created_at desc;
end;
$$;

revoke all on function public.list_two_person_circle_albums(uuid)
  from public;
grant execute on function public.list_two_person_circle_albums(uuid)
  to authenticated;

create or replace function public.get_two_person_circle_album(
  p_album_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_album public.two_person_circle_albums%rowtype;
  v_result jsonb;
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
  where album_row.id = p_album_id;

  if v_album.id is null
     or not public.two_person_circle_is_unlocked(
       v_album.conversation_id,
       auth.uid()
     ) then
    raise exception 'This shared album is unavailable.';
  end if;

  v_result := public.two_person_album_json(p_album_id);

  return v_result || jsonb_build_object(
    'photos', coalesce(
      (
        select jsonb_agg(
          public.two_person_album_photo_json(photo_row.id)
          order by photo_row.ready_at asc nulls last, photo_row.id asc
        )
        from public.two_person_circle_album_photos photo_row
        where photo_row.album_id = p_album_id
          and photo_row.status = 'ready'
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_two_person_circle_album(uuid)
  from public;
grant execute on function public.get_two_person_circle_album(uuid)
  to authenticated;

create or replace function public.create_two_person_circle_album(
  p_conversation_id uuid,
  p_title text,
  p_note text default '',
  p_occurred_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_title text := trim(coalesce(p_title, ''));
  v_note text := trim(coalesce(p_note, ''));
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.two_person_albums_feature_enabled() then
    raise exception 'Shared albums are temporarily unavailable.';
  end if;

  if not public.two_person_circle_is_unlocked(
    p_conversation_id,
    auth.uid()
  ) then
    raise exception 'Our Circle is closed or unavailable.';
  end if;

  if length(v_title) < 1 or length(v_title) > 80 then
    raise exception 'Give the album a title under 80 characters.';
  end if;

  if length(v_note) > 500 then
    raise exception 'Keep the album note under 500 characters.';
  end if;

  insert into public.two_person_circle_albums (
    conversation_id,
    created_by,
    title,
    note,
    occurred_on
  )
  values (
    p_conversation_id,
    auth.uid(),
    v_title,
    v_note,
    p_occurred_on
  )
  returning id into v_id;

  perform public.record_two_person_album_analytics(
    'two_person_album_created',
    'create',
    p_occurred_on is not null,
    length(v_note) > 0,
    0
  );

  return v_id;
end;
$$;

revoke all on function public.create_two_person_circle_album(
  uuid,
  text,
  text,
  date
) from public;
grant execute on function public.create_two_person_circle_album(
  uuid,
  text,
  text,
  date
) to authenticated;

create or replace function public.update_two_person_circle_album(
  p_album_id uuid,
  p_title text,
  p_note text default '',
  p_occurred_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_album public.two_person_circle_albums%rowtype;
  v_title text := trim(coalesce(p_title, ''));
  v_note text := trim(coalesce(p_note, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
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

  if length(v_title) < 1 or length(v_title) > 80
     or length(v_note) > 500 then
    raise exception 'Check the album title and note length.';
  end if;

  update public.two_person_circle_albums album_row
  set
    title = v_title,
    note = v_note,
    occurred_on = p_occurred_on,
    updated_at = now()
  where album_row.id = p_album_id;

  perform public.record_two_person_album_analytics(
    'two_person_album_updated',
    'update',
    p_occurred_on is not null,
    length(v_note) > 0,
    null
  );

  return public.two_person_album_json(p_album_id);
end;
$$;

revoke all on function public.update_two_person_circle_album(
  uuid,
  text,
  text,
  date
) from public;
grant execute on function public.update_two_person_circle_album(
  uuid,
  text,
  text,
  date
) to authenticated;

create or replace function public.delete_two_person_circle_album(
  p_album_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_album public.two_person_circle_albums%rowtype;
  v_photo_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
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

  select count(*)::integer
  into v_photo_count
  from public.two_person_circle_album_photos photo_row
  where photo_row.album_id = p_album_id
    and photo_row.status = 'ready';

  delete from public.two_person_circle_albums album_row
  where album_row.id = p_album_id;

  perform public.record_two_person_album_analytics(
    'two_person_album_removed',
    'remove',
    null,
    null,
    v_photo_count
  );

  return true;
end;
$$;

revoke all on function public.delete_two_person_circle_album(uuid)
  from public;
grant execute on function public.delete_two_person_circle_album(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Photo upload lifecycle RPCs
-- ---------------------------------------------------------------------------

create or replace function public.prepare_two_person_album_photo_upload(
  p_album_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_album public.two_person_circle_albums%rowtype;
  v_photo_id uuid := gen_random_uuid();
  v_object_id uuid := gen_random_uuid();
  v_storage_path text;
  v_photo_count integer := 0;
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
  where album_row.id = p_album_id;

  if v_album.id is null
     or not public.two_person_circle_is_unlocked(
       v_album.conversation_id,
       auth.uid()
     ) then
    raise exception 'This shared album is unavailable.';
  end if;

  select count(*)::integer
  into v_photo_count
  from public.two_person_circle_album_photos photo_row
  where photo_row.album_id = p_album_id;

  if v_photo_count >= 500 then
    raise exception 'This album has reached the photo limit.';
  end if;

  v_storage_path := 'album/' || v_object_id::text || '.jpg';

  insert into public.two_person_circle_album_photos (
    id,
    album_id,
    uploaded_by,
    storage_path,
    status
  )
  values (
    v_photo_id,
    p_album_id,
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

revoke all on function public.prepare_two_person_album_photo_upload(uuid)
  from public;
grant execute on function public.prepare_two_person_album_photo_upload(uuid)
  to authenticated;

create or replace function public.finalize_two_person_album_photo_upload(
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
  v_photo public.two_person_circle_album_photos%rowtype;
  v_album public.two_person_circle_albums%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_photo
  from public.two_person_circle_album_photos photo_row
  where photo_row.id = p_photo_id
  for update;

  if v_photo.id is null
     or v_photo.uploaded_by <> auth.uid()
     or v_photo.status <> 'pending' then
    raise exception 'This upload cannot be completed.';
  end if;

  select *
  into v_album
  from public.two_person_circle_albums album_row
  where album_row.id = v_photo.album_id;

  if v_album.id is null
     or not public.two_person_circle_is_unlocked(
       v_album.conversation_id,
       auth.uid()
     ) then
    raise exception 'Our Circle is closed or unavailable.';
  end if;

  update public.two_person_circle_album_photos photo_row
  set
    status = 'ready',
    width = p_width,
    height = p_height,
    ready_at = now()
  where photo_row.id = p_photo_id;

  update public.two_person_circle_albums album_row
  set updated_at = now()
  where album_row.id = v_photo.album_id;

  perform public.record_two_person_album_analytics(
    'two_person_album_photo_uploaded',
    'upload',
    null,
    null,
    1
  );

  return jsonb_build_object(
    'photo_id', p_photo_id,
    'storage_path', v_photo.storage_path
  );
end;
$$;

revoke all on function public.finalize_two_person_album_photo_upload(
  uuid,
  integer,
  integer
) from public;
grant execute on function public.finalize_two_person_album_photo_upload(
  uuid,
  integer,
  integer
) to authenticated;

create or replace function public.cancel_two_person_album_photo_upload(
  p_photo_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  delete from public.two_person_circle_album_photos photo_row
  where photo_row.id = p_photo_id
    and photo_row.uploaded_by = auth.uid()
    and photo_row.status = 'pending';

  return found;
end;
$$;

revoke all on function public.cancel_two_person_album_photo_upload(uuid)
  from public;
grant execute on function public.cancel_two_person_album_photo_upload(uuid)
  to authenticated;

create or replace function public.delete_two_person_album_photo(
  p_photo_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo public.two_person_circle_album_photos%rowtype;
  v_album public.two_person_circle_albums%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_photo
  from public.two_person_circle_album_photos photo_row
  where photo_row.id = p_photo_id
  for update;

  if v_photo.id is null then
    raise exception 'This photo is unavailable.';
  end if;

  select *
  into v_album
  from public.two_person_circle_albums album_row
  where album_row.id = v_photo.album_id;

  if v_album.id is null
     or not public.two_person_circle_is_unlocked(
       v_album.conversation_id,
       auth.uid()
     ) then
    raise exception 'This photo is unavailable.';
  end if;

  delete from public.two_person_circle_album_photos photo_row
  where photo_row.id = p_photo_id;

  update public.two_person_circle_albums album_row
  set updated_at = now()
  where album_row.id = v_photo.album_id;

  perform public.record_two_person_album_analytics(
    'two_person_album_photo_removed',
    'remove_photo',
    null,
    null,
    1
  );

  return true;
end;
$$;

revoke all on function public.delete_two_person_album_photo(uuid)
  from public;
grant execute on function public.delete_two_person_album_photo(uuid)
  to authenticated;

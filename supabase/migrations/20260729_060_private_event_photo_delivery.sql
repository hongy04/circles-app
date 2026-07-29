-- Circles Phase 9A — private event-photo delivery
--
-- Phase 2F intentionally used a public Storage bucket with random, unlisted
-- object names so account-free guest pages could display photos without a
-- server component. This migration closes that MVP privacy gap:
--   * event-media becomes private;
--   * authenticated viewers may mint short-lived signed URLs only when their
--     current event access still permits the photo; and
--   * guest photo metadata is available only to the trusted Edge Function,
--     which validates the invitation token before minting signed URLs.
--
-- Existing event_photos rows and Storage objects are preserved.

-- ---------------------------------------------------------------------------
-- Private bucket
-- ---------------------------------------------------------------------------

update storage.buckets
set
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = array['image/jpeg']
where id = 'event-media';

-- ---------------------------------------------------------------------------
-- Authenticated signed-URL authorization
-- ---------------------------------------------------------------------------

create or replace function public.event_photo_read_is_allowed(
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
      from public.event_photos photo_row
      where photo_row.storage_path = p_storage_path
        and photo_row.status = 'ready'
        and public.event_viewer_can_access(photo_row.event_id, auth.uid())
    );
$$;

revoke all on function public.event_photo_read_is_allowed(text) from public;
grant execute on function public.event_photo_read_is_allowed(text) to authenticated;

drop policy if exists "Event viewers can read private event photos" on storage.objects;
create policy "Event viewers can read private event photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'event-media'
  and public.event_photo_read_is_allowed(name)
);

-- The guest-facing client no longer receives raw Storage paths from PostgREST.
-- Only the service-role Edge Function may call this RPC and mint expiring URLs.
revoke all on function public.list_event_guest_photos(text) from public;
revoke execute on function public.list_event_guest_photos(text) from anon, authenticated;
grant execute on function public.list_event_guest_photos(text) to service_role;

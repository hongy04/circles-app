drop policy if exists "Circles authenticated uploads"
on storage.objects;

create policy "Circles authenticated uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('avatars', 'posts', 'stories', 'media')
);
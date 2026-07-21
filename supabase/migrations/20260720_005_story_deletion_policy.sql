-- Circles Step 6 — Story privacy and deletion permissions
-- Removes permissive development policies, preserves normal story access,
-- and lets authenticated users remove only their own story media.

alter table public.stories enable row level security;

-- Remove permissive development policies restored from the old project.
drop policy if exists dev_stories_all_delete on public.stories;
drop policy if exists dev_stories_all_insert on public.stories;
drop policy if exists dev_stories_all_select on public.stories;
drop policy if exists dev_stories_all_update on public.stories;

-- Replace older story policies with explicit Circles policies.
drop policy if exists stories_insert on public.stories;
drop policy if exists stories_select on public.stories;
drop policy if exists stories_delete on public.stories;
drop policy if exists "Circles insert own stories" on public.stories;
drop policy if exists "Circles view connected stories" on public.stories;
drop policy if exists "Circles delete own stories" on public.stories;

create policy "Circles insert own stories"
on public.stories
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Circles view connected stories"
on public.stories
for select
to authenticated
using (
  expire_at > now()
  and (
    user_id = auth.uid()
    or public.is_connected(auth.uid(), user_id)
  )
);

create policy "Circles delete own stories"
on public.stories
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "Circles delete own story uploads"
on storage.objects;

create policy "Circles delete own story uploads"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'stories'
  and (
    owner_id = auth.uid()::text
    or owner = auth.uid()
  )
);

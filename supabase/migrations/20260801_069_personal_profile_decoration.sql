-- Circles Personal Profile Decoration v1
-- Header/background metadata lives outside public.users so private decoration
-- paths cannot be exposed by existing profile-table reads.

create table if not exists public.profile_decorations (
  user_id uuid primary key references public.users(id) on delete cascade,
  profile_header_path text,
  profile_background_path text,
  profile_background_color text,
  updated_at timestamptz not null default now(),
  constraint profile_decorations_background_color_check check (
    profile_background_color is null
    or profile_background_color ~ '^#[0-9A-Fa-f]{6}$'
  )
);

alter table public.profile_decorations enable row level security;
revoke all on table public.profile_decorations from public, anon, authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-decor',
  'profile-decor',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Owners may upload only inside their own UUID prefix. Account enforcement
-- continues to block mutation while restricted/suspended.
drop policy if exists "Profile decor owner uploads" on storage.objects;
create policy "Profile decor owner uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-decor'
  and split_part(name, '/', 1) = auth.uid()::text
  and not public.account_has_active_enforcement(auth.uid())
);

-- Signed URL creation requires SELECT. Raw objects remain private and only the
-- owner or an accepted connection can receive access.
drop policy if exists "Profile decor connected reads" on storage.objects;
create policy "Profile decor connected reads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-decor'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or exists (
      select 1
      from public.connections connection_row
      where connection_row.user_id = auth.uid()
        and connection_row.other_user_id::text = split_part(storage.objects.name, '/', 1)
    )
  )
);

drop policy if exists "Profile decor owner deletes" on storage.objects;
create policy "Profile decor owner deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-decor'
  and split_part(name, '/', 1) = auth.uid()::text
  and not public.account_has_active_enforcement(auth.uid())
);

-- Decoration metadata is deliberately separate from get_profile_overview.
-- Pending requests, mutual candidates, and pre-connection profile shells do
-- not receive these fields.
create or replace function public.get_profile_decoration(profile_user_id uuid)
returns table (
  profile_header_path text,
  profile_background_path text,
  profile_background_color text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
begin
  if viewer_id is null or profile_user_id is null then
    return;
  end if;

  if viewer_id <> profile_user_id
     and public.user_pair_is_blocked(viewer_id, profile_user_id) then
    return;
  end if;

  if viewer_id <> profile_user_id
     and not exists (
       select 1
       from public.connections connection_row
       where connection_row.user_id = viewer_id
         and connection_row.other_user_id = profile_user_id
     ) then
    return;
  end if;

  return query
  select
    decoration_row.profile_header_path,
    decoration_row.profile_background_path,
    decoration_row.profile_background_color
  from (select 1) allowed
  left join public.profile_decorations decoration_row
    on decoration_row.user_id = profile_user_id;
end;
$$;

revoke all on function public.get_profile_decoration(uuid) from public;
grant execute on function public.get_profile_decoration(uuid) to authenticated;

create or replace function public.update_my_profile_decoration(
  p_profile_header_path text,
  p_profile_background_path text,
  p_profile_background_color text
)
returns table (
  profile_header_path text,
  profile_background_path text,
  profile_background_color text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  clean_header_path text := nullif(btrim(p_profile_header_path), '');
  clean_background_path text := nullif(btrim(p_profile_background_path), '');
  clean_background_color text := upper(nullif(btrim(p_profile_background_color), ''));
begin
  if viewer_id is null then
    raise exception 'Please sign in first';
  end if;

  if public.account_has_active_enforcement(viewer_id) then
    raise exception 'This account cannot update profile decorations right now.';
  end if;

  if clean_header_path is not null
     and split_part(clean_header_path, '/', 1) <> viewer_id::text then
    raise exception 'Invalid profile header path';
  end if;

  if clean_background_path is not null
     and split_part(clean_background_path, '/', 1) <> viewer_id::text then
    raise exception 'Invalid profile background path';
  end if;

  if clean_background_color is not null
     and clean_background_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Invalid profile background color';
  end if;

  if clean_header_path is null
     and clean_background_path is null
     and clean_background_color is null then
    delete from public.profile_decorations decoration_row
    where decoration_row.user_id = viewer_id;
  else
    insert into public.profile_decorations (
      user_id,
      profile_header_path,
      profile_background_path,
      profile_background_color,
      updated_at
    )
    values (
      viewer_id,
      clean_header_path,
      clean_background_path,
      case when clean_background_path is not null then null else clean_background_color end,
      now()
    )
    on conflict (user_id) do update
    set
      profile_header_path = excluded.profile_header_path,
      profile_background_path = excluded.profile_background_path,
      profile_background_color = excluded.profile_background_color,
      updated_at = now();
  end if;

  return query
  select
    decoration_row.profile_header_path,
    decoration_row.profile_background_path,
    decoration_row.profile_background_color
  from (select 1) allowed
  left join public.profile_decorations decoration_row
    on decoration_row.user_id = viewer_id;
end;
$$;

revoke all on function public.update_my_profile_decoration(text, text, text) from public;
grant execute on function public.update_my_profile_decoration(text, text, text) to authenticated;

-- Deletion preserves a user tombstone, so explicitly drop decoration metadata
-- when the account is marked deleted. Storage objects are removed by the
-- account-deletion Edge Function's UUID-prefix sweep.
create or replace function public.clear_profile_decoration_on_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.profile_decorations decoration_row
    where decoration_row.user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_profile_decoration_on_account_deletion() from public;

drop trigger if exists zz_clear_profile_decoration_on_account_deletion on public.users;
create trigger zz_clear_profile_decoration_on_account_deletion
after update of deleted_at on public.users
for each row
execute function public.clear_profile_decoration_on_account_deletion();

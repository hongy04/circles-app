-- Circles shared Circle / Our Circle Decoration v1
-- Shared decoration metadata belongs to the conversation itself. Group Circle
-- owners/admins may change it; either member of an open two-person Circle may
-- change it. All current Circle members may view the private decoration files.

create table if not exists public.circle_decorations (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  circle_header_path text,
  circle_background_path text,
  circle_background_color text,
  updated_at timestamptz not null default now(),
  constraint circle_decorations_background_color_check check (
    circle_background_color is null
    or circle_background_color ~ '^#[0-9A-Fa-f]{6}$'
  )
);

alter table public.circle_decorations enable row level security;
revoke all on table public.circle_decorations from public, anon, authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'circle-decor',
  'circle-decor',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Any current member can request a signed URL for the decoration of a Circle
-- they belong to. Closed two-person Circles stay inaccessible while locked.
drop policy if exists "Circle decor member reads" on storage.objects;
create policy "Circle decor member reads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'circle-decor'
  and exists (
    select 1
    from public.conversations conversation_row
    join public.conversation_members member_row
      on member_row.conversation_id = conversation_row.id
    where conversation_row.id::text = split_part(storage.objects.name, '/', 1)
      and member_row.user_id = auth.uid()
      and (
        conversation_row.kind = 'group'
        or (
          conversation_row.kind = 'direct'
          and coalesce(conversation_row.circle_enabled, false)
          and conversation_row.circle_locked_at is null
        )
      )
  )
);

-- Upload/delete rights mirror shared Circle theme rights.
drop policy if exists "Circle decor customizer uploads" on storage.objects;
create policy "Circle decor customizer uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'circle-decor'
  and not public.account_has_active_enforcement(auth.uid())
  and exists (
    select 1
    from public.conversations conversation_row
    join public.conversation_members member_row
      on member_row.conversation_id = conversation_row.id
    where conversation_row.id::text = split_part(storage.objects.name, '/', 1)
      and member_row.user_id = auth.uid()
      and (
        (
          conversation_row.kind = 'group'
          and member_row.role in ('owner', 'admin')
        )
        or (
          conversation_row.kind = 'direct'
          and coalesce(conversation_row.circle_enabled, false)
          and conversation_row.circle_locked_at is null
        )
      )
  )
);

drop policy if exists "Circle decor customizer deletes" on storage.objects;
create policy "Circle decor customizer deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'circle-decor'
  and not public.account_has_active_enforcement(auth.uid())
  and exists (
    select 1
    from public.conversations conversation_row
    join public.conversation_members member_row
      on member_row.conversation_id = conversation_row.id
    where conversation_row.id::text = split_part(storage.objects.name, '/', 1)
      and member_row.user_id = auth.uid()
      and (
        (
          conversation_row.kind = 'group'
          and member_row.role in ('owner', 'admin')
        )
        or (
          conversation_row.kind = 'direct'
          and coalesce(conversation_row.circle_enabled, false)
          and conversation_row.circle_locked_at is null
        )
      )
  )
);

create or replace function public.get_circle_decoration(
  p_conversation_id uuid
)
returns table (
  circle_header_path text,
  circle_background_path text,
  circle_background_color text,
  can_customize boolean,
  is_two_person boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  conversation_row public.conversations%rowtype;
  viewer_role text;
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select c.*
  into conversation_row
  from public.conversations c
  where c.id = p_conversation_id;

  if not found then
    raise exception 'Circle not found';
  end if;

  select m.role
  into viewer_role
  from public.conversation_members m
  where m.conversation_id = p_conversation_id
    and m.user_id = viewer_id;

  if not found then
    raise exception 'You are not a member of this private Circle';
  end if;

  if conversation_row.kind = 'direct' then
    if not coalesce(conversation_row.circle_enabled, false)
       or conversation_row.circle_locked_at is not null then
      raise exception 'Our Circle is currently closed';
    end if;
  elsif conversation_row.kind <> 'group' then
    raise exception 'This conversation has no Circle profile';
  end if;

  return query
  select
    decoration_row.circle_header_path,
    decoration_row.circle_background_path,
    decoration_row.circle_background_color,
    case
      when conversation_row.kind = 'direct' then true
      else viewer_role in ('owner', 'admin')
    end,
    conversation_row.kind = 'direct'
  from (select 1) allowed
  left join public.circle_decorations decoration_row
    on decoration_row.conversation_id = p_conversation_id;
end;
$$;

revoke all on function public.get_circle_decoration(uuid) from public;
grant execute on function public.get_circle_decoration(uuid) to authenticated;

create or replace function public.update_circle_decoration(
  p_conversation_id uuid,
  p_circle_header_path text,
  p_circle_background_path text,
  p_circle_background_color text
)
returns table (
  circle_header_path text,
  circle_background_path text,
  circle_background_color text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  conversation_row public.conversations%rowtype;
  viewer_role text;
  clean_header_path text := nullif(btrim(p_circle_header_path), '');
  clean_background_path text := nullif(btrim(p_circle_background_path), '');
  clean_background_color text := upper(nullif(btrim(p_circle_background_color), ''));
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if public.account_has_active_enforcement(viewer_id) then
    raise exception 'This account cannot update Circle decorations right now.';
  end if;

  select c.*
  into conversation_row
  from public.conversations c
  where c.id = p_conversation_id
  for update;

  if not found then
    raise exception 'Circle not found';
  end if;

  select m.role
  into viewer_role
  from public.conversation_members m
  where m.conversation_id = p_conversation_id
    and m.user_id = viewer_id;

  if not found then
    raise exception 'You are not a member of this private Circle';
  end if;

  if conversation_row.kind = 'direct' then
    if not coalesce(conversation_row.circle_enabled, false)
       or conversation_row.circle_locked_at is not null then
      raise exception 'Our Circle must be open before its decorations can change';
    end if;
  elsif conversation_row.kind = 'group' then
    if viewer_role not in ('owner', 'admin') then
      raise exception 'Only Circle owners and admins can change shared decorations';
    end if;
  else
    raise exception 'This conversation has no Circle profile';
  end if;

  if clean_header_path is not null
     and split_part(clean_header_path, '/', 1) <> p_conversation_id::text then
    raise exception 'Invalid Circle header path';
  end if;

  if clean_background_path is not null
     and split_part(clean_background_path, '/', 1) <> p_conversation_id::text then
    raise exception 'Invalid Circle background path';
  end if;

  if clean_background_color is not null
     and clean_background_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Invalid Circle background color';
  end if;

  if clean_header_path is null
     and clean_background_path is null
     and clean_background_color is null then
    delete from public.circle_decorations d
    where d.conversation_id = p_conversation_id;
  else
    insert into public.circle_decorations (
      conversation_id,
      circle_header_path,
      circle_background_path,
      circle_background_color,
      updated_at
    )
    values (
      p_conversation_id,
      clean_header_path,
      clean_background_path,
      case when clean_background_path is not null then null else clean_background_color end,
      now()
    )
    on conflict (conversation_id) do update
    set
      circle_header_path = excluded.circle_header_path,
      circle_background_path = excluded.circle_background_path,
      circle_background_color = excluded.circle_background_color,
      updated_at = now();
  end if;

  return query
  select
    d.circle_header_path,
    d.circle_background_path,
    d.circle_background_color
  from (select 1) allowed
  left join public.circle_decorations d
    on d.conversation_id = p_conversation_id;
end;
$$;

revoke all on function public.update_circle_decoration(uuid, text, text, text) from public;
grant execute on function public.update_circle_decoration(uuid, text, text, text) to authenticated;

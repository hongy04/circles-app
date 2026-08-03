-- Circles Decoration v2.1: private user-uploaded sticker assets + live sticker state.
-- Custom sticker files reuse the existing private profile-decor / circle-decor
-- buckets. Only opaque asset metadata and normalized layout coordinates live in
-- Postgres; raw files remain private and are delivered with signed URLs.

alter table public.profile_decorations
  add column if not exists profile_custom_stickers jsonb not null default '[]'::jsonb;

alter table public.circle_decorations
  add column if not exists circle_custom_stickers jsonb not null default '[]'::jsonb;

create or replace function public.custom_sticker_assets_are_valid(
  p_assets jsonb,
  p_owner_prefix text
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  asset_row jsonb;
  seen_ids text[] := array[]::text[];
  asset_id text;
  asset_path text;
  asset_mime text;
begin
  if p_assets is null or jsonb_typeof(p_assets) <> 'array' then
    return false;
  end if;

  if jsonb_array_length(p_assets) > 24 then
    return false;
  end if;

  for asset_row in select value from jsonb_array_elements(p_assets)
  loop
    if jsonb_typeof(asset_row) <> 'object' then
      return false;
    end if;

    asset_id := nullif(btrim(asset_row->>'id'), '');
    asset_path := nullif(btrim(asset_row->>'path'), '');
    asset_mime := lower(coalesce(nullif(btrim(asset_row->>'mime_type'), ''), 'image/png'));

    if asset_id is null or length(asset_id) > 80 or asset_id = any(seen_ids) then
      return false;
    end if;
    seen_ids := array_append(seen_ids, asset_id);

    if asset_path is null or length(asset_path) > 500 then
      return false;
    end if;

    if split_part(asset_path, '/', 1) <> p_owner_prefix
       or split_part(asset_path, '/', 2) <> 'stickers' then
      return false;
    end if;

    if asset_mime not in ('image/jpeg', 'image/png', 'image/webp') then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.custom_sticker_assets_are_valid(jsonb, text) from public;

create or replace function public.decoration_sticker_state_is_valid(
  p_stickers jsonb,
  p_assets jsonb
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  sticker_row jsonb;
  asset_row jsonb;
  asset_ids text[] := array[]::text[];
  seen_ids text[] := array[]::text[];
  sticker_id text;
  sticker_kind text;
  asset_id text;
begin
  if p_stickers is null or jsonb_typeof(p_stickers) <> 'array' then
    return false;
  end if;
  if p_assets is null or jsonb_typeof(p_assets) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p_stickers) > 18 then
    return false;
  end if;

  for asset_row in select value from jsonb_array_elements(p_assets)
  loop
    asset_ids := array_append(asset_ids, asset_row->>'id');
  end loop;

  for sticker_row in select value from jsonb_array_elements(p_stickers)
  loop
    if jsonb_typeof(sticker_row) <> 'object' then
      return false;
    end if;

    sticker_id := nullif(btrim(sticker_row->>'id'), '');
    if sticker_id is null or length(sticker_id) > 80 or sticker_id = any(seen_ids) then
      return false;
    end if;
    seen_ids := array_append(seen_ids, sticker_id);

    sticker_kind := sticker_row->>'sticker';
    if sticker_kind = 'custom' then
      asset_id := nullif(btrim(sticker_row->>'asset_id'), '');
      if asset_id is null or not (asset_id = any(asset_ids)) then
        return false;
      end if;
    elsif sticker_kind not in (
      'aero-bubbles',
      'aero-flower',
      'aero-sun',
      'aero-cloud',
      'nature-leaf',
      'nature-drop',
      'nature-star',
      'night-moon',
      'cozy-heart',
      'cozy-music',
      'cozy-smile',
      'cozy-planet'
    ) then
      return false;
    end if;

    if jsonb_typeof(sticker_row->'x') <> 'number'
       or (sticker_row->>'x')::numeric not between 0.04 and 0.96 then
      return false;
    end if;
    if jsonb_typeof(sticker_row->'y') <> 'number'
       or (sticker_row->>'y')::numeric not between 0.04 and 0.96 then
      return false;
    end if;
    if jsonb_typeof(sticker_row->'scale') <> 'number'
       or (sticker_row->>'scale')::numeric not between 0.55 and 2.20 then
      return false;
    end if;
    if jsonb_typeof(sticker_row->'rotation') <> 'number'
       or (sticker_row->>'rotation')::numeric not between -180 and 180 then
      return false;
    end if;
    if jsonb_typeof(sticker_row->'z') <> 'number'
       or (sticker_row->>'z')::numeric not between 0 and 50 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.decoration_sticker_state_is_valid(jsonb, jsonb) from public;

alter table public.profile_decorations
  drop constraint if exists profile_decorations_stickers_check;
alter table public.profile_decorations
  drop constraint if exists profile_decorations_custom_stickers_check;
alter table public.profile_decorations
  add constraint profile_decorations_custom_stickers_check
  check (
    public.custom_sticker_assets_are_valid(profile_custom_stickers, user_id::text)
    and public.decoration_sticker_state_is_valid(profile_stickers, profile_custom_stickers)
  );

alter table public.circle_decorations
  drop constraint if exists circle_decorations_stickers_check;
alter table public.circle_decorations
  drop constraint if exists circle_decorations_custom_stickers_check;
alter table public.circle_decorations
  add constraint circle_decorations_custom_stickers_check
  check (
    public.custom_sticker_assets_are_valid(circle_custom_stickers, conversation_id::text)
    and public.decoration_sticker_state_is_valid(circle_stickers, circle_custom_stickers)
  );

create or replace function public.get_profile_decoration_v3(profile_user_id uuid)
returns table (
  profile_header_path text,
  profile_background_path text,
  profile_background_color text,
  profile_stickers jsonb,
  profile_custom_stickers jsonb
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
    decoration_row.profile_background_color,
    coalesce(decoration_row.profile_stickers, '[]'::jsonb),
    coalesce(decoration_row.profile_custom_stickers, '[]'::jsonb)
  from (select 1) allowed
  left join public.profile_decorations decoration_row
    on decoration_row.user_id = profile_user_id;
end;
$$;

revoke all on function public.get_profile_decoration_v3(uuid) from public;
grant execute on function public.get_profile_decoration_v3(uuid) to authenticated;

create or replace function public.update_my_profile_sticker_state(
  p_profile_stickers jsonb,
  p_custom_stickers jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  clean_stickers jsonb := coalesce(p_profile_stickers, '[]'::jsonb);
  clean_assets jsonb := coalesce(p_custom_stickers, '[]'::jsonb);
begin
  if viewer_id is null then
    raise exception 'Please sign in first';
  end if;
  if public.account_has_active_enforcement(viewer_id) then
    raise exception 'This account cannot update profile decorations right now.';
  end if;
  if not public.custom_sticker_assets_are_valid(clean_assets, viewer_id::text)
     or not public.decoration_sticker_state_is_valid(clean_stickers, clean_assets) then
    raise exception 'Invalid profile sticker state';
  end if;

  if jsonb_array_length(clean_stickers) = 0
     and jsonb_array_length(clean_assets) = 0
     and not exists (
       select 1
       from public.profile_decorations d
       where d.user_id = viewer_id
         and (
           d.profile_header_path is not null
           or d.profile_background_path is not null
           or d.profile_background_color is not null
         )
     ) then
    delete from public.profile_decorations where user_id = viewer_id;
  else
    insert into public.profile_decorations (
      user_id,
      profile_stickers,
      profile_custom_stickers,
      updated_at
    ) values (
      viewer_id,
      clean_stickers,
      clean_assets,
      now()
    )
    on conflict (user_id) do update
    set profile_stickers = excluded.profile_stickers,
        profile_custom_stickers = excluded.profile_custom_stickers,
        updated_at = now();
  end if;
end;
$$;

revoke all on function public.update_my_profile_sticker_state(jsonb, jsonb) from public;
grant execute on function public.update_my_profile_sticker_state(jsonb, jsonb) to authenticated;

create or replace function public.get_circle_decoration_v3(p_conversation_id uuid)
returns table (
  circle_header_path text,
  circle_background_path text,
  circle_background_color text,
  circle_stickers jsonb,
  circle_custom_stickers jsonb,
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

  select c.* into conversation_row
  from public.conversations c
  where c.id = p_conversation_id;
  if not found then
    raise exception 'Circle not found';
  end if;

  select m.role into viewer_role
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
    d.circle_header_path,
    d.circle_background_path,
    d.circle_background_color,
    coalesce(d.circle_stickers, '[]'::jsonb),
    coalesce(d.circle_custom_stickers, '[]'::jsonb),
    case when conversation_row.kind = 'direct' then true else viewer_role in ('owner', 'admin') end,
    conversation_row.kind = 'direct'
  from (select 1) allowed
  left join public.circle_decorations d
    on d.conversation_id = p_conversation_id;
end;
$$;

revoke all on function public.get_circle_decoration_v3(uuid) from public;
grant execute on function public.get_circle_decoration_v3(uuid) to authenticated;

create or replace function public.update_circle_sticker_state(
  p_conversation_id uuid,
  p_circle_stickers jsonb,
  p_custom_stickers jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  conversation_row public.conversations%rowtype;
  viewer_role text;
  clean_stickers jsonb := coalesce(p_circle_stickers, '[]'::jsonb);
  clean_assets jsonb := coalesce(p_custom_stickers, '[]'::jsonb);
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;
  if public.account_has_active_enforcement(viewer_id) then
    raise exception 'This account cannot update Circle decorations right now.';
  end if;

  select c.* into conversation_row
  from public.conversations c
  where c.id = p_conversation_id
  for update;
  if not found then
    raise exception 'Circle not found';
  end if;

  select m.role into viewer_role
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

  if not public.custom_sticker_assets_are_valid(clean_assets, p_conversation_id::text)
     or not public.decoration_sticker_state_is_valid(clean_stickers, clean_assets) then
    raise exception 'Invalid Circle sticker state';
  end if;

  if jsonb_array_length(clean_stickers) = 0
     and jsonb_array_length(clean_assets) = 0
     and not exists (
       select 1
       from public.circle_decorations d
       where d.conversation_id = p_conversation_id
         and (
           d.circle_header_path is not null
           or d.circle_background_path is not null
           or d.circle_background_color is not null
         )
     ) then
    delete from public.circle_decorations where conversation_id = p_conversation_id;
  else
    insert into public.circle_decorations (
      conversation_id,
      circle_stickers,
      circle_custom_stickers,
      updated_at
    ) values (
      p_conversation_id,
      clean_stickers,
      clean_assets,
      now()
    )
    on conflict (conversation_id) do update
    set circle_stickers = excluded.circle_stickers,
        circle_custom_stickers = excluded.circle_custom_stickers,
        updated_at = now();
  end if;
end;
$$;

revoke all on function public.update_circle_sticker_state(uuid, jsonb, jsonb) from public;
grant execute on function public.update_circle_sticker_state(uuid, jsonb, jsonb) to authenticated;

-- Preserve sticker rows when header/background is reset to theme/default.
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
  if viewer_id is null then raise exception 'Please sign in first'; end if;
  if public.account_has_active_enforcement(viewer_id) then
    raise exception 'This account cannot update profile decorations right now.';
  end if;
  if clean_header_path is not null and split_part(clean_header_path, '/', 1) <> viewer_id::text then
    raise exception 'Invalid profile header path';
  end if;
  if clean_background_path is not null and split_part(clean_background_path, '/', 1) <> viewer_id::text then
    raise exception 'Invalid profile background path';
  end if;
  if clean_background_color is not null and clean_background_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Invalid profile background color';
  end if;

  if clean_header_path is null and clean_background_path is null and clean_background_color is null
     and not exists (
       select 1 from public.profile_decorations d
       where d.user_id = viewer_id
         and (jsonb_array_length(d.profile_stickers) > 0 or jsonb_array_length(d.profile_custom_stickers) > 0)
     ) then
    delete from public.profile_decorations where user_id = viewer_id;
  else
    insert into public.profile_decorations (
      user_id, profile_header_path, profile_background_path, profile_background_color, updated_at
    ) values (
      viewer_id, clean_header_path, clean_background_path,
      case when clean_background_path is not null then null else clean_background_color end,
      now()
    )
    on conflict (user_id) do update
    set profile_header_path = excluded.profile_header_path,
        profile_background_path = excluded.profile_background_path,
        profile_background_color = excluded.profile_background_color,
        updated_at = now();
  end if;

  return query
  select d.profile_header_path, d.profile_background_path, d.profile_background_color
  from (select 1) allowed
  left join public.profile_decorations d on d.user_id = viewer_id;
end;
$$;

revoke all on function public.update_my_profile_decoration(text, text, text) from public;
grant execute on function public.update_my_profile_decoration(text, text, text) to authenticated;

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
  if viewer_id is null then raise exception 'Not authenticated'; end if;
  if public.account_has_active_enforcement(viewer_id) then
    raise exception 'This account cannot update Circle decorations right now.';
  end if;

  select c.* into conversation_row from public.conversations c where c.id = p_conversation_id for update;
  if not found then raise exception 'Circle not found'; end if;
  select m.role into viewer_role from public.conversation_members m
  where m.conversation_id = p_conversation_id and m.user_id = viewer_id;
  if not found then raise exception 'You are not a member of this private Circle'; end if;

  if conversation_row.kind = 'direct' then
    if not coalesce(conversation_row.circle_enabled, false) or conversation_row.circle_locked_at is not null then
      raise exception 'Our Circle must be open before its decorations can change';
    end if;
  elsif conversation_row.kind = 'group' then
    if viewer_role not in ('owner', 'admin') then
      raise exception 'Only Circle owners and admins can change shared decorations';
    end if;
  else
    raise exception 'This conversation has no Circle profile';
  end if;

  if clean_header_path is not null and split_part(clean_header_path, '/', 1) <> p_conversation_id::text then
    raise exception 'Invalid Circle header path';
  end if;
  if clean_background_path is not null and split_part(clean_background_path, '/', 1) <> p_conversation_id::text then
    raise exception 'Invalid Circle background path';
  end if;
  if clean_background_color is not null and clean_background_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Invalid Circle background color';
  end if;

  if clean_header_path is null and clean_background_path is null and clean_background_color is null
     and not exists (
       select 1 from public.circle_decorations d
       where d.conversation_id = p_conversation_id
         and (jsonb_array_length(d.circle_stickers) > 0 or jsonb_array_length(d.circle_custom_stickers) > 0)
     ) then
    delete from public.circle_decorations where conversation_id = p_conversation_id;
  else
    insert into public.circle_decorations (
      conversation_id, circle_header_path, circle_background_path, circle_background_color, updated_at
    ) values (
      p_conversation_id, clean_header_path, clean_background_path,
      case when clean_background_path is not null then null else clean_background_color end,
      now()
    )
    on conflict (conversation_id) do update
    set circle_header_path = excluded.circle_header_path,
        circle_background_path = excluded.circle_background_path,
        circle_background_color = excluded.circle_background_color,
        updated_at = now();
  end if;

  return query
  select d.circle_header_path, d.circle_background_path, d.circle_background_color
  from (select 1) allowed
  left join public.circle_decorations d on d.conversation_id = p_conversation_id;
end;
$$;

revoke all on function public.update_circle_decoration(uuid, text, text, text) from public;
grant execute on function public.update_circle_decoration(uuid, text, text, text) to authenticated;

-- Circles Decoration v2: built-in stickers / decals
-- Stickers are presentation metadata only. No user-uploaded sticker assets are
-- introduced in this phase. Personal layouts remain visible only to self and
-- accepted connections; Circle layouts remain visible only to Circle members.

create or replace function public.decoration_stickers_are_valid(p_stickers jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  sticker_row jsonb;
begin
  if p_stickers is null or jsonb_typeof(p_stickers) <> 'array' then
    return false;
  end if;

  if jsonb_array_length(p_stickers) > 18 then
    return false;
  end if;

  for sticker_row in select value from jsonb_array_elements(p_stickers)
  loop
    if jsonb_typeof(sticker_row) <> 'object' then
      return false;
    end if;

    if nullif(btrim(sticker_row->>'id'), '') is null
       or length(sticker_row->>'id') > 80 then
      return false;
    end if;

    if sticker_row->>'sticker' not in (
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

    if jsonb_typeof(sticker_row->'x') <> 'number' then
      return false;
    end if;
    if (sticker_row->>'x')::numeric not between 0.04 and 0.96 then
      return false;
    end if;

    if jsonb_typeof(sticker_row->'y') <> 'number' then
      return false;
    end if;
    if (sticker_row->>'y')::numeric not between 0.04 and 0.96 then
      return false;
    end if;

    if jsonb_typeof(sticker_row->'scale') <> 'number' then
      return false;
    end if;
    if (sticker_row->>'scale')::numeric not between 0.55 and 2.20 then
      return false;
    end if;

    if jsonb_typeof(sticker_row->'rotation') <> 'number' then
      return false;
    end if;
    if (sticker_row->>'rotation')::numeric not between -180 and 180 then
      return false;
    end if;

    if jsonb_typeof(sticker_row->'z') <> 'number' then
      return false;
    end if;
    if (sticker_row->>'z')::numeric not between 0 and 50 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.decoration_stickers_are_valid(jsonb) from public;

alter table public.profile_decorations
  add column if not exists profile_stickers jsonb not null default '[]'::jsonb;

alter table public.circle_decorations
  add column if not exists circle_stickers jsonb not null default '[]'::jsonb;

alter table public.profile_decorations
  drop constraint if exists profile_decorations_stickers_check;
alter table public.profile_decorations
  add constraint profile_decorations_stickers_check
  check (public.decoration_stickers_are_valid(profile_stickers));

alter table public.circle_decorations
  drop constraint if exists circle_decorations_stickers_check;
alter table public.circle_decorations
  add constraint circle_decorations_stickers_check
  check (public.decoration_stickers_are_valid(circle_stickers));

-- V2 getter keeps decoration metadata outside public.users and preserves the
-- same connection privacy boundary as the v1 getter.
create or replace function public.get_profile_decoration_v2(profile_user_id uuid)
returns table (
  profile_header_path text,
  profile_background_path text,
  profile_background_color text,
  profile_stickers jsonb
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
    coalesce(decoration_row.profile_stickers, '[]'::jsonb)
  from (select 1) allowed
  left join public.profile_decorations decoration_row
    on decoration_row.user_id = profile_user_id;
end;
$$;

revoke all on function public.get_profile_decoration_v2(uuid) from public;
grant execute on function public.get_profile_decoration_v2(uuid) to authenticated;

create or replace function public.update_my_profile_stickers(
  p_profile_stickers jsonb
)
returns table (
  profile_stickers jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  clean_stickers jsonb := coalesce(p_profile_stickers, '[]'::jsonb);
begin
  if viewer_id is null then
    raise exception 'Please sign in first';
  end if;

  if public.account_has_active_enforcement(viewer_id) then
    raise exception 'This account cannot update profile decorations right now.';
  end if;

  if not public.decoration_stickers_are_valid(clean_stickers) then
    raise exception 'Invalid profile sticker layout';
  end if;

  if jsonb_array_length(clean_stickers) = 0
     and not exists (
       select 1
       from public.profile_decorations decoration_row
       where decoration_row.user_id = viewer_id
         and (
           decoration_row.profile_header_path is not null
           or decoration_row.profile_background_path is not null
           or decoration_row.profile_background_color is not null
         )
     ) then
    delete from public.profile_decorations decoration_row
    where decoration_row.user_id = viewer_id;
  else
    insert into public.profile_decorations (
      user_id,
      profile_stickers,
      updated_at
    )
    values (
      viewer_id,
      clean_stickers,
      now()
    )
    on conflict (user_id) do update
    set
      profile_stickers = excluded.profile_stickers,
      updated_at = now();
  end if;

  return query
  select coalesce(decoration_row.profile_stickers, '[]'::jsonb)
  from (select 1) allowed
  left join public.profile_decorations decoration_row
    on decoration_row.user_id = viewer_id;
end;
$$;

revoke all on function public.update_my_profile_stickers(jsonb) from public;
grant execute on function public.update_my_profile_stickers(jsonb) to authenticated;

-- Circle V2 getter mirrors the exact membership/customization checks already
-- established by the shared header/background phase.
create or replace function public.get_circle_decoration_v2(
  p_conversation_id uuid
)
returns table (
  circle_header_path text,
  circle_background_path text,
  circle_background_color text,
  circle_stickers jsonb,
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
    coalesce(decoration_row.circle_stickers, '[]'::jsonb),
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

revoke all on function public.get_circle_decoration_v2(uuid) from public;
grant execute on function public.get_circle_decoration_v2(uuid) to authenticated;

create or replace function public.update_circle_stickers(
  p_conversation_id uuid,
  p_circle_stickers jsonb
)
returns table (
  circle_stickers jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  conversation_row public.conversations%rowtype;
  viewer_role text;
  clean_stickers jsonb := coalesce(p_circle_stickers, '[]'::jsonb);
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

  if not public.decoration_stickers_are_valid(clean_stickers) then
    raise exception 'Invalid Circle sticker layout';
  end if;

  if jsonb_array_length(clean_stickers) = 0
     and not exists (
       select 1
       from public.circle_decorations decoration_row
       where decoration_row.conversation_id = p_conversation_id
         and (
           decoration_row.circle_header_path is not null
           or decoration_row.circle_background_path is not null
           or decoration_row.circle_background_color is not null
         )
     ) then
    delete from public.circle_decorations decoration_row
    where decoration_row.conversation_id = p_conversation_id;
  else
    insert into public.circle_decorations (
      conversation_id,
      circle_stickers,
      updated_at
    )
    values (
      p_conversation_id,
      clean_stickers,
      now()
    )
    on conflict (conversation_id) do update
    set
      circle_stickers = excluded.circle_stickers,
      updated_at = now();
  end if;

  return query
  select coalesce(decoration_row.circle_stickers, '[]'::jsonb)
  from (select 1) allowed
  left join public.circle_decorations decoration_row
    on decoration_row.conversation_id = p_conversation_id;
end;
$$;

revoke all on function public.update_circle_stickers(uuid, jsonb) from public;
grant execute on function public.update_circle_stickers(uuid, jsonb) to authenticated;

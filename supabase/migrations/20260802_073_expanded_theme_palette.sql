-- Circles — expanded curated theme palette
--
-- Adds Sunset Coral and Midnight Harbor to both personal app themes and
-- shared Circle themes. Existing theme selections and inheritance semantics
-- remain unchanged.

alter table public.users
  drop constraint if exists users_theme_id_check;

alter table public.users
  add constraint users_theme_id_check
  check (
    theme_id is null
    or theme_id in (
      'default',
      'aqua-daylight',
      'citrus-garden',
      'bubblegum-sky',
      'after-rain',
      'sunset-coral',
      'midnight-harbor'
    )
  );

alter table public.conversations
  drop constraint if exists conversations_theme_id_check;

alter table public.conversations
  add constraint conversations_theme_id_check
  check (
    theme_id is null
    or theme_id in (
      'default',
      'aqua-daylight',
      'citrus-garden',
      'bubblegum-sky',
      'after-rain',
      'sunset-coral',
      'midnight-harbor'
    )
  );

create or replace function public.set_my_theme_preference(
  p_theme_id text
)
returns table (
  theme_id text,
  theme_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_theme_id text := lower(nullif(btrim(coalesce(p_theme_id, '')), ''));
begin
  if v_user_id is null then
    raise exception 'Please sign in first';
  end if;

  if v_theme_id is null or v_theme_id not in (
    'default',
    'aqua-daylight',
    'citrus-garden',
    'bubblegum-sky',
    'after-rain',
    'sunset-coral',
    'midnight-harbor'
  ) then
    raise exception 'Unknown Circles theme';
  end if;

  update public.users user_row
  set
    theme_id = v_theme_id,
    theme_updated_at = now()
  where user_row.id = v_user_id
    and user_row.deleted_at is null;

  if not found then
    raise exception 'Profile record not found';
  end if;

  return query
  select
    user_row.theme_id,
    user_row.theme_updated_at
  from public.users user_row
  where user_row.id = v_user_id;
end;
$$;

revoke all on function public.set_my_theme_preference(text) from public;
grant execute on function public.set_my_theme_preference(text) to authenticated;

create or replace function public.set_circle_theme(
  p_conversation_id uuid,
  p_theme_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_conversation public.conversations%rowtype;
  v_role text;
  v_theme_id text := lower(nullif(btrim(coalesce(p_theme_id, '')), ''));
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_theme_id in ('inherit', 'global', 'use-global') then
    v_theme_id := null;
  end if;

  if v_theme_id is not null and v_theme_id not in (
    'default',
    'aqua-daylight',
    'citrus-garden',
    'bubblegum-sky',
    'after-rain',
    'sunset-coral',
    'midnight-harbor'
  ) then
    raise exception 'Unknown Circle theme';
  end if;

  select conversation_row.*
  into v_conversation
  from public.conversations conversation_row
  where conversation_row.id = p_conversation_id
  for update;

  if not found then
    raise exception 'Circle not found';
  end if;

  select member_row.role
  into v_role
  from public.conversation_members member_row
  where member_row.conversation_id = p_conversation_id
    and member_row.user_id = v_viewer_id;

  if not found then
    raise exception 'You are not a member of this private Circle';
  end if;

  if v_conversation.kind = 'direct' then
    if not coalesce(v_conversation.circle_enabled, false)
       or v_conversation.circle_locked_at is not null then
      raise exception 'Our Circle must be open before its theme can change';
    end if;
  elsif v_conversation.kind = 'group' then
    if v_role not in ('owner', 'admin') then
      raise exception 'Only Circle owners and admins can change the shared theme';
    end if;
  else
    raise exception 'This conversation has no Circle theme';
  end if;

  update public.conversations conversation_row
  set
    theme_id = v_theme_id,
    updated_at = now()
  where conversation_row.id = p_conversation_id;

  return jsonb_build_object(
    'conversation_id', p_conversation_id,
    'theme_id', v_theme_id,
    'inherits_global_theme', v_theme_id is null,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.set_circle_theme(uuid, text) from public;
grant execute on function public.set_circle_theme(uuid, text) to authenticated;

-- Circles Phase 10B — shared Circle theme personalization
--
-- A null conversations.theme_id means "use each viewer's global app theme".
-- A concrete theme id gives the shared Circle one curated visual identity for
-- every member. Group Circle theme changes are owner/admin controlled; both
-- members of an open two-person Circle have equal control.

alter table public.conversations
  add column if not exists theme_id text;

alter table public.conversations
  drop constraint if exists conversations_theme_id_check;

alter table public.conversations
  add constraint conversations_theme_id_check
  check (
    theme_id is null
    or theme_id in (
      'aqua-daylight',
      'citrus-garden',
      'bubblegum-sky',
      'after-rain'
    )
  );

comment on column public.conversations.theme_id is
  'Optional shared curated theme. Null means each viewer inherits their own global app theme.';

create or replace function public.get_circle_theme_settings(
  p_conversation_id uuid
)
returns table (
  theme_id text,
  can_customize boolean,
  is_two_person boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_conversation public.conversations%rowtype;
  v_role text;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select conversation_row.*
  into v_conversation
  from public.conversations conversation_row
  where conversation_row.id = p_conversation_id;

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

  if v_conversation.kind = 'direct'
     and (
       not coalesce(v_conversation.circle_enabled, false)
       or v_conversation.circle_locked_at is not null
     ) then
    raise exception 'Our Circle is currently closed';
  end if;

  if v_conversation.kind not in ('group', 'direct') then
    raise exception 'This conversation has no Circle theme';
  end if;

  return query
  select
    v_conversation.theme_id,
    case
      when v_conversation.kind = 'direct' then true
      else v_role in ('owner', 'admin')
    end,
    v_conversation.kind = 'direct';
end;
$$;

revoke all on function public.get_circle_theme_settings(uuid) from public;
grant execute on function public.get_circle_theme_settings(uuid) to authenticated;

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

  if v_theme_id in ('default', 'inherit', 'global') then
    v_theme_id := null;
  end if;

  if v_theme_id is not null and v_theme_id not in (
    'aqua-daylight',
    'citrus-garden',
    'bubblegum-sky',
    'after-rain'
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

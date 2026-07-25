-- Circles Phase 1A.1 — invitation token generation hotfix
--
-- Supabase commonly installs pgcrypto in the `extensions` schema. The Phase
-- 1A function restricted its search_path to `public`, so gen_random_bytes()
-- could not be resolved at runtime. This replaces only the invite-creation
-- function and includes the extensions schema in its controlled search path.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_app_invite(
  p_kind text,
  p_conversation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_invite public.app_invites%rowtype;
  v_inviter public.users%rowtype;
  v_circle public.conversations%rowtype;
  v_role text;
  v_member_count integer := 0;
  v_token text;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_kind not in ('personal', 'circle') then
    raise exception 'Invite kind must be personal or circle';
  end if;

  if p_kind = 'personal' and p_conversation_id is not null then
    raise exception 'Personal invitations cannot target a Circle';
  end if;

  if p_kind = 'circle' then
    if p_conversation_id is null then
      raise exception 'A Circle invitation requires a Circle';
    end if;

    select conversation_row.*
    into v_circle
    from public.conversations conversation_row
    where conversation_row.id = p_conversation_id
      and conversation_row.kind = 'group';

    if not found then
      raise exception 'Circle not found';
    end if;

    v_role := public.circle_group_member_role(
      p_conversation_id,
      v_viewer_id
    );

    if v_role is null or v_role not in ('owner', 'admin') then
      raise exception 'Only the owner or an admin can share a Circle invitation';
    end if;
  end if;

  select invite_row.*
  into v_invite
  from public.app_invites invite_row
  where invite_row.inviter_id = v_viewer_id
    and invite_row.kind = p_kind
    and invite_row.conversation_id is not distinct from p_conversation_id
    and invite_row.revoked_at is null
    and invite_row.expires_at > now()
    and invite_row.use_count < invite_row.max_uses
  order by invite_row.created_at desc
  limit 1;

  if not found then
    loop
      v_token := encode(gen_random_bytes(18), 'hex');
      begin
        insert into public.app_invites (
          token,
          inviter_id,
          kind,
          conversation_id,
          expires_at,
          max_uses
        )
        values (
          v_token,
          v_viewer_id,
          p_kind,
          p_conversation_id,
          now() + interval '30 days',
          case when p_kind = 'circle' then 20 else 100 end
        )
        returning * into v_invite;
        exit;
      exception
        when unique_violation then
          -- Retry the effectively impossible token collision.
      end;
    end loop;
  end if;

  select user_row.*
  into v_inviter
  from public.users user_row
  where user_row.id = v_viewer_id;

  if p_kind = 'circle' then
    select count(*)
    into v_member_count
    from public.conversation_members member_row
    where member_row.conversation_id = p_conversation_id;
  end if;

  return jsonb_build_object(
    'token', v_invite.token,
    'kind', v_invite.kind,
    'expires_at', v_invite.expires_at,
    'inviter_name', coalesce(v_inviter.display_name, 'A friend'),
    'inviter_avatar', v_inviter.avatar_url,
    'conversation_id', v_invite.conversation_id,
    'circle_name', case
      when p_kind = 'circle' then coalesce(nullif(btrim(v_circle.title), ''), 'Circle')
      else null
    end,
    'member_count', v_member_count
  );
end;
$$;

revoke all on function public.create_app_invite(text, uuid) from public;
grant execute on function public.create_app_invite(text, uuid) to authenticated;

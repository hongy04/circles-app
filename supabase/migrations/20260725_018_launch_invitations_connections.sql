-- Circles Phase 1A — launch invitations and Connections foundation
--
-- Adds reusable invitation links for personal connections and group Circles,
-- invitation redemption with explicit acceptance still required, and a private
-- RPC for listing accepted Connections.

create extension if not exists pgcrypto;

create table if not exists public.app_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  inviter_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('personal', 'circle')),
  conversation_id uuid references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  max_uses integer not null default 50 check (max_uses between 1 and 500),
  use_count integer not null default 0 check (use_count >= 0),
  constraint app_invites_kind_shape_check check (
    (kind = 'personal' and conversation_id is null)
    or
    (kind = 'circle' and conversation_id is not null)
  )
);

create index if not exists app_invites_active_lookup_index
  on public.app_invites (inviter_id, kind, conversation_id, expires_at desc);

create table if not exists public.app_invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.app_invites(id) on delete cascade,
  redeemer_id uuid not null references public.users(id) on delete cascade,
  outcome text not null,
  created_at timestamptz not null default now(),
  unique (invite_id, redeemer_id)
);

create index if not exists app_invite_redemptions_user_index
  on public.app_invite_redemptions (redeemer_id, created_at desc);

alter table public.app_invites enable row level security;
alter table public.app_invite_redemptions enable row level security;

-- No direct table policies are added. Invitation access is intentionally
-- mediated through the security-definer functions below.

create or replace function public.get_my_connections()
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  connected_since timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    connected_user.id as user_id,
    connected_user.display_name,
    connected_user.username,
    connected_user.avatar_url,
    connection_row.created_at as connected_since
  from public.connections connection_row
  join public.users connected_user
    on connected_user.id = connection_row.other_user_id
  where connection_row.user_id = auth.uid()
    and connection_row.other_user_id <> auth.uid()
  order by connected_user.display_name nulls last, connected_user.id;
$$;

revoke all on function public.get_my_connections() from public;
grant execute on function public.get_my_connections() to authenticated;

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
          -- Cryptographic collisions are extraordinarily unlikely, but retry
          -- rather than surfacing a failure if one ever occurs.
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

create or replace function public.preview_app_invite(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_invite public.app_invites%rowtype;
  v_inviter public.users%rowtype;
  v_circle public.conversations%rowtype;
  v_member_count integer := 0;
  v_available boolean := false;
  v_reason text := 'not_found';
  v_role text;
begin
  select invite_row.*
  into v_invite
  from public.app_invites invite_row
  where invite_row.token = nullif(btrim(p_token), '')
  limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'reason', v_reason);
  end if;

  if v_invite.revoked_at is not null then
    v_reason := 'revoked';
  elsif v_invite.expires_at <= now() then
    v_reason := 'expired';
  elsif v_invite.use_count >= v_invite.max_uses then
    v_reason := 'used_up';
  else
    v_available := true;
    v_reason := null;
  end if;

  select user_row.*
  into v_inviter
  from public.users user_row
  where user_row.id = v_invite.inviter_id;

  if v_invite.kind = 'circle' then
    select conversation_row.*
    into v_circle
    from public.conversations conversation_row
    where conversation_row.id = v_invite.conversation_id
      and conversation_row.kind = 'group';

    if not found then
      v_available := false;
      v_reason := 'circle_unavailable';
    else
      v_role := public.circle_group_member_role(
        v_invite.conversation_id,
        v_invite.inviter_id
      );

      if v_role is null or v_role not in ('owner', 'admin') then
        v_available := false;
        v_reason := 'inviter_no_longer_can_invite';
      end if;

      select count(*)
      into v_member_count
      from public.conversation_members member_row
      where member_row.conversation_id = v_invite.conversation_id;
    end if;
  end if;

  return jsonb_build_object(
    'valid', v_available,
    'reason', v_reason,
    'kind', v_invite.kind,
    'expires_at', v_invite.expires_at,
    'inviter_name', coalesce(v_inviter.display_name, 'A friend'),
    'inviter_avatar', v_inviter.avatar_url,
    'conversation_id', v_invite.conversation_id,
    'circle_name', case
      when v_invite.kind = 'circle' then coalesce(nullif(btrim(v_circle.title), ''), 'Circle')
      else null
    end,
    'member_count', v_member_count
  );
end;
$$;

revoke all on function public.preview_app_invite(text) from public;
grant execute on function public.preview_app_invite(text) to anon, authenticated;

create or replace function public.redeem_app_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_invite public.app_invites%rowtype;
  v_existing_redemption public.app_invite_redemptions%rowtype;
  v_inviter public.users%rowtype;
  v_circle public.conversations%rowtype;
  v_role text;
  v_outcome text;
  v_member_count integer := 0;
  v_pending_count integer := 0;
begin
  if v_viewer_id is null then
    raise exception 'Please sign in to use this invitation';
  end if;

  select invite_row.*
  into v_invite
  from public.app_invites invite_row
  where invite_row.token = nullif(btrim(p_token), '')
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if v_invite.inviter_id = v_viewer_id then
    raise exception 'You cannot redeem your own invitation';
  end if;

  if v_invite.revoked_at is not null then
    raise exception 'This invitation is no longer available';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'This invitation has expired';
  end if;

  select user_row.*
  into v_inviter
  from public.users user_row
  where user_row.id = v_invite.inviter_id;

  select redemption_row.*
  into v_existing_redemption
  from public.app_invite_redemptions redemption_row
  where redemption_row.invite_id = v_invite.id
    and redemption_row.redeemer_id = v_viewer_id;

  if found then
    if v_invite.kind = 'circle' then
      select conversation_row.*
      into v_circle
      from public.conversations conversation_row
      where conversation_row.id = v_invite.conversation_id;
    end if;

    return jsonb_build_object(
      'kind', v_invite.kind,
      'outcome', v_existing_redemption.outcome,
      'inviter_name', coalesce(v_inviter.display_name, 'A friend'),
      'conversation_id', v_invite.conversation_id,
      'circle_name', case
        when v_invite.kind = 'circle' then coalesce(nullif(btrim(v_circle.title), ''), 'Circle')
        else null
      end
    );
  end if;

  if v_invite.use_count >= v_invite.max_uses then
    raise exception 'This invitation has reached its limit';
  end if;

  if v_invite.kind = 'personal' then
    if exists (
      select 1
      from public.connections connection_row
      where connection_row.user_id = v_viewer_id
        and connection_row.other_user_id = v_invite.inviter_id
    ) or exists (
      select 1
      from public.connections connection_row
      where connection_row.user_id = v_invite.inviter_id
        and connection_row.other_user_id = v_viewer_id
    ) then
      v_outcome := 'already_connected';
    elsif exists (
      select 1
      from public.connection_requests request_row
      where request_row.status = 'pending'
        and (
          (request_row.from_user = v_invite.inviter_id and request_row.to_user = v_viewer_id)
          or
          (request_row.from_user = v_viewer_id and request_row.to_user = v_invite.inviter_id)
        )
    ) then
      v_outcome := 'request_exists';
    else
      insert into public.connection_requests (
        from_user,
        to_user,
        status,
        note,
        created_at
      )
      values (
        v_invite.inviter_id,
        v_viewer_id,
        'pending',
        'Invited through Circles',
        now()
      );
      v_outcome := 'request_created';
    end if;
  else
    select conversation_row.*
    into v_circle
    from public.conversations conversation_row
    where conversation_row.id = v_invite.conversation_id
      and conversation_row.kind = 'group';

    if not found then
      raise exception 'This Circle is no longer available';
    end if;

    v_role := public.circle_group_member_role(
      v_invite.conversation_id,
      v_invite.inviter_id
    );

    if v_role is null or v_role not in ('owner', 'admin') then
      raise exception 'The inviter can no longer add people to this Circle';
    end if;

    if exists (
      select 1
      from public.conversation_members member_row
      where member_row.conversation_id = v_invite.conversation_id
        and member_row.user_id = v_viewer_id
    ) then
      v_outcome := 'already_member';
    elsif exists (
      select 1
      from public.conversation_invitations invitation_row
      where invitation_row.conversation_id = v_invite.conversation_id
        and invitation_row.invited_user_id = v_viewer_id
        and invitation_row.status = 'pending'
    ) then
      v_outcome := 'circle_invitation_exists';
    else
      select count(*)
      into v_member_count
      from public.conversation_members member_row
      where member_row.conversation_id = v_invite.conversation_id;

      select count(*)
      into v_pending_count
      from public.conversation_invitations invitation_row
      where invitation_row.conversation_id = v_invite.conversation_id
        and invitation_row.status = 'pending';

      if v_member_count + v_pending_count >= 21 then
        raise exception 'This Circle is currently full';
      end if;

      insert into public.conversation_invitations (
        conversation_id,
        invited_user_id,
        invited_by,
        status,
        created_at,
        responded_at
      )
      values (
        v_invite.conversation_id,
        v_viewer_id,
        v_invite.inviter_id,
        'pending',
        now(),
        null
      )
      on conflict (conversation_id, invited_user_id)
      do update set
        invited_by = excluded.invited_by,
        status = 'pending',
        created_at = excluded.created_at,
        responded_at = null;

      v_outcome := 'circle_invitation_created';
    end if;
  end if;

  insert into public.app_invite_redemptions (
    invite_id,
    redeemer_id,
    outcome
  )
  values (
    v_invite.id,
    v_viewer_id,
    v_outcome
  );

  update public.app_invites invite_row
  set use_count = invite_row.use_count + 1
  where invite_row.id = v_invite.id;

  return jsonb_build_object(
    'kind', v_invite.kind,
    'outcome', v_outcome,
    'inviter_name', coalesce(v_inviter.display_name, 'A friend'),
    'conversation_id', v_invite.conversation_id,
    'circle_name', case
      when v_invite.kind = 'circle' then coalesce(nullif(btrim(v_circle.title), ''), 'Circle')
      else null
    end
  );
end;
$$;

revoke all on function public.redeem_app_invite(text) from public;
grant execute on function public.redeem_app_invite(text) to authenticated;

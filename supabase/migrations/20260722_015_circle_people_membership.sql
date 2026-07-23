-- Circles Step 9D — Circle People, invitations, roles, and membership
--
-- Product rules enforced by the database:
--   * Only accepted Circle members can view the People page.
--   * Owners and admins may invite their own accepted connections.
--   * Pending invitees receive no Circle access until they accept.
--   * Only the owner may promote/demote admins or transfer ownership.
--   * Admins may remove regular members; owners may remove admins or members.
--   * The owner must transfer ownership before leaving.
--   * Leaving/removal revokes access but preserves prior authored history.

create or replace function public.circle_group_member_role(
  p_conversation_id uuid,
  p_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select member_row.role
  from public.conversation_members member_row
  join public.conversations conversation
    on conversation.id = member_row.conversation_id
   and conversation.kind = 'group'
  where member_row.conversation_id = p_conversation_id
    and member_row.user_id = p_user_id;
$$;

revoke all on function public.circle_group_member_role(uuid, uuid) from public;

create or replace function public.get_circle_people(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_viewer_role text;
  v_result jsonb;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  v_viewer_role := public.circle_group_member_role(
    p_conversation_id,
    v_viewer_id
  );

  if v_viewer_role is null then
    raise exception 'You are not a member of this private Circle';
  end if;

  select jsonb_build_object(
    'conversation', jsonb_build_object(
      'id', conversation.id,
      'title', coalesce(nullif(trim(conversation.title), ''), 'Private Circle'),
      'avatar_url', conversation.avatar_url,
      'avatar_path', conversation.avatar_path,
      'member_count', (
        select count(*)
        from public.conversation_members member_count_row
        where member_count_row.conversation_id = conversation.id
      ),
      'pending_count', (
        select count(*)
        from public.conversation_invitations pending_count_row
        where pending_count_row.conversation_id = conversation.id
          and pending_count_row.status = 'pending'
      )
    ),
    'viewer_role', v_viewer_role,
    'permissions', jsonb_build_object(
      'can_invite', v_viewer_role in ('owner', 'admin'),
      'can_cancel_invitations', v_viewer_role in ('owner', 'admin'),
      'can_manage_roles', v_viewer_role = 'owner',
      'can_remove_members', v_viewer_role in ('owner', 'admin'),
      'can_leave', v_viewer_role <> 'owner'
    ),
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', member_user.id,
          'display_name', member_user.display_name,
          'avatar_url', member_user.avatar_url,
          'role', member_row.role,
          'joined_at', member_row.joined_at,
          'is_me', member_user.id = v_viewer_id
        )
        order by
          case member_row.role
            when 'owner' then 0
            when 'admin' then 1
            else 2
          end,
          member_user.display_name nulls last,
          member_row.joined_at
      )
      from public.conversation_members member_row
      join public.users member_user
        on member_user.id = member_row.user_id
      where member_row.conversation_id = conversation.id
    ), '[]'::jsonb),
    'pending_invitations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'invitation_id', invitation.id,
          'user_id', invited_user.id,
          'display_name', invited_user.display_name,
          'avatar_url', invited_user.avatar_url,
          'invited_by', invitation.invited_by,
          'invited_by_name', inviter.display_name,
          'created_at', invitation.created_at
        )
        order by invitation.created_at desc
      )
      from public.conversation_invitations invitation
      join public.users invited_user
        on invited_user.id = invitation.invited_user_id
      left join public.users inviter
        on inviter.id = invitation.invited_by
      where invitation.conversation_id = conversation.id
        and invitation.status = 'pending'
    ), '[]'::jsonb)
  )
  into v_result
  from public.conversations conversation
  where conversation.id = p_conversation_id
    and conversation.kind = 'group';

  if v_result is null then
    raise exception 'This conversation is not a group Circle';
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_circle_people(uuid) from public;
grant execute on function public.get_circle_people(uuid) to authenticated;

create or replace function public.get_circle_invite_candidates(
  p_conversation_id uuid
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_viewer_role text;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  v_viewer_role := public.circle_group_member_role(
    p_conversation_id,
    v_viewer_id
  );

  if v_viewer_role is null or v_viewer_role not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can invite people';
  end if;

  return query
  select distinct
    connected_user.id as user_id,
    connected_user.display_name,
    connected_user.avatar_url
  from public.connections connection_row
  join public.users connected_user
    on connected_user.id = connection_row.other_user_id
  where connection_row.user_id = v_viewer_id
    and connection_row.other_user_id <> v_viewer_id
    and not exists (
      select 1
      from public.conversation_members existing_member
      where existing_member.conversation_id = p_conversation_id
        and existing_member.user_id = connected_user.id
    )
    and not exists (
      select 1
      from public.conversation_invitations pending_invitation
      where pending_invitation.conversation_id = p_conversation_id
        and pending_invitation.invited_user_id = connected_user.id
        and pending_invitation.status = 'pending'
    )
  order by connected_user.display_name nulls last, connected_user.id;
end;
$$;

revoke all on function public.get_circle_invite_candidates(uuid) from public;
grant execute on function public.get_circle_invite_candidates(uuid) to authenticated;

create or replace function public.invite_people_to_circle(
  p_conversation_id uuid,
  p_user_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_viewer_role text;
  v_user_ids uuid[];
  v_user_id uuid;
  v_member_count integer;
  v_pending_count integer;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  v_viewer_role := public.circle_group_member_role(
    p_conversation_id,
    v_viewer_id
  );

  if v_viewer_role is null or v_viewer_role not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can invite people';
  end if;

  select coalesce(
    array_agg(distinct candidate.user_id),
    array[]::uuid[]
  )
  into v_user_ids
  from unnest(coalesce(p_user_ids, array[]::uuid[])) as candidate(user_id)
  where candidate.user_id is not null
    and candidate.user_id <> v_viewer_id;

  if cardinality(v_user_ids) < 1 then
    raise exception 'Choose at least one person to invite';
  end if;

  foreach v_user_id in array v_user_ids loop
    if not exists (
      select 1
      from public.connections connection_row
      where connection_row.user_id = v_viewer_id
        and connection_row.other_user_id = v_user_id
    ) then
      raise exception 'Every invited person must be your accepted connection';
    end if;

    if exists (
      select 1
      from public.conversation_members existing_member
      where existing_member.conversation_id = p_conversation_id
        and existing_member.user_id = v_user_id
    ) then
      raise exception 'One of the selected people is already a Circle member';
    end if;

    if exists (
      select 1
      from public.conversation_invitations pending_invitation
      where pending_invitation.conversation_id = p_conversation_id
        and pending_invitation.invited_user_id = v_user_id
        and pending_invitation.status = 'pending'
    ) then
      raise exception 'One of the selected people already has a pending invitation';
    end if;
  end loop;

  select count(*)
  into v_member_count
  from public.conversation_members member_row
  where member_row.conversation_id = p_conversation_id;

  select count(*)
  into v_pending_count
  from public.conversation_invitations invitation_row
  where invitation_row.conversation_id = p_conversation_id
    and invitation_row.status = 'pending';

  if v_member_count + v_pending_count + cardinality(v_user_ids) > 21 then
    raise exception 'Circles are currently limited to 21 people including pending invitations';
  end if;

  foreach v_user_id in array v_user_ids loop
    insert into public.conversation_invitations (
      conversation_id,
      invited_user_id,
      invited_by,
      status,
      created_at,
      responded_at
    )
    values (
      p_conversation_id,
      v_user_id,
      v_viewer_id,
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
  end loop;

  update public.conversations conversation
  set updated_at = now()
  where conversation.id = p_conversation_id;

  return cardinality(v_user_ids);
end;
$$;

revoke all on function public.invite_people_to_circle(uuid, uuid[]) from public;
grant execute on function public.invite_people_to_circle(uuid, uuid[]) to authenticated;

create or replace function public.cancel_circle_invitation(
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_invitation public.conversation_invitations%rowtype;
  v_viewer_role text;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select invitation.*
  into v_invitation
  from public.conversation_invitations invitation
  where invitation.id = p_invitation_id
    and invitation.status = 'pending'
  for update;

  if not found then
    raise exception 'This invitation is no longer pending';
  end if;

  v_viewer_role := public.circle_group_member_role(
    v_invitation.conversation_id,
    v_viewer_id
  );

  if v_viewer_role is null or v_viewer_role not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can cancel invitations';
  end if;

  update public.conversation_invitations invitation
  set
    status = 'cancelled',
    responded_at = now()
  where invitation.id = v_invitation.id;

  update public.conversations conversation
  set updated_at = now()
  where conversation.id = v_invitation.conversation_id;
end;
$$;

revoke all on function public.cancel_circle_invitation(uuid) from public;
grant execute on function public.cancel_circle_invitation(uuid) to authenticated;

create or replace function public.update_circle_member_role(
  p_conversation_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_viewer_role text;
  v_target_role text;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'Role must be admin or member';
  end if;

  v_viewer_role := public.circle_group_member_role(
    p_conversation_id,
    v_viewer_id
  );

  if v_viewer_role is distinct from 'owner' then
    raise exception 'Only the Circle owner can change admin roles';
  end if;

  select member_row.role
  into v_target_role
  from public.conversation_members member_row
  where member_row.conversation_id = p_conversation_id
    and member_row.user_id = p_user_id
  for update;

  if not found then
    raise exception 'This person is no longer a Circle member';
  end if;

  if v_target_role = 'owner' then
    raise exception 'Transfer ownership instead of changing the owner role';
  end if;

  update public.conversation_members member_row
  set role = p_role
  where member_row.conversation_id = p_conversation_id
    and member_row.user_id = p_user_id;

  update public.conversations conversation
  set updated_at = now()
  where conversation.id = p_conversation_id;
end;
$$;

revoke all on function public.update_circle_member_role(uuid, uuid, text) from public;
grant execute on function public.update_circle_member_role(uuid, uuid, text) to authenticated;

create or replace function public.transfer_circle_ownership(
  p_conversation_id uuid,
  p_new_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_viewer_role text;
  v_target_role text;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_new_owner_id is null or p_new_owner_id = v_viewer_id then
    raise exception 'Choose another Circle member as the new owner';
  end if;

  v_viewer_role := public.circle_group_member_role(
    p_conversation_id,
    v_viewer_id
  );

  if v_viewer_role is distinct from 'owner' then
    raise exception 'Only the current owner can transfer ownership';
  end if;

  perform 1
  from public.conversation_members member_row
  where member_row.conversation_id = p_conversation_id
    and member_row.user_id in (v_viewer_id, p_new_owner_id)
  for update;

  select member_row.role
  into v_target_role
  from public.conversation_members member_row
  where member_row.conversation_id = p_conversation_id
    and member_row.user_id = p_new_owner_id;

  if v_target_role is null then
    raise exception 'The new owner must already be a Circle member';
  end if;

  update public.conversation_members member_row
  set role = case
    when member_row.user_id = v_viewer_id then 'admin'
    when member_row.user_id = p_new_owner_id then 'owner'
    else member_row.role
  end
  where member_row.conversation_id = p_conversation_id
    and member_row.user_id in (v_viewer_id, p_new_owner_id);

  update public.conversations conversation
  set updated_at = now()
  where conversation.id = p_conversation_id;
end;
$$;

revoke all on function public.transfer_circle_ownership(uuid, uuid) from public;
grant execute on function public.transfer_circle_ownership(uuid, uuid) to authenticated;

create or replace function public.remove_circle_member(
  p_conversation_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_viewer_role text;
  v_target_role text;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_user_id = v_viewer_id then
    raise exception 'Use Leave Circle to remove yourself';
  end if;

  v_viewer_role := public.circle_group_member_role(
    p_conversation_id,
    v_viewer_id
  );

  if v_viewer_role is null or v_viewer_role not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can remove members';
  end if;

  select member_row.role
  into v_target_role
  from public.conversation_members member_row
  where member_row.conversation_id = p_conversation_id
    and member_row.user_id = p_user_id
  for update;

  if not found then
    raise exception 'This person is no longer a Circle member';
  end if;

  if v_target_role = 'owner' then
    raise exception 'The Circle owner cannot be removed';
  end if;

  if v_viewer_role = 'admin' and v_target_role <> 'member' then
    raise exception 'Admins can remove regular members, but not other admins';
  end if;

  delete from public.conversation_members member_row
  where member_row.conversation_id = p_conversation_id
    and member_row.user_id = p_user_id;

  update public.conversation_invitations invitation
  set
    status = 'cancelled',
    responded_at = now()
  where invitation.conversation_id = p_conversation_id
    and invitation.invited_user_id = p_user_id
    and invitation.status in ('pending', 'accepted');

  update public.conversations conversation
  set updated_at = now()
  where conversation.id = p_conversation_id;
end;
$$;

revoke all on function public.remove_circle_member(uuid, uuid) from public;
grant execute on function public.remove_circle_member(uuid, uuid) to authenticated;

create or replace function public.leave_circle(
  p_conversation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_viewer_role text;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  v_viewer_role := public.circle_group_member_role(
    p_conversation_id,
    v_viewer_id
  );

  if v_viewer_role is null then
    raise exception 'You are no longer a member of this Circle';
  end if;

  if v_viewer_role = 'owner' then
    raise exception 'Transfer ownership before leaving the Circle';
  end if;

  delete from public.conversation_members member_row
  where member_row.conversation_id = p_conversation_id
    and member_row.user_id = v_viewer_id;

  update public.conversation_invitations invitation
  set
    status = 'cancelled',
    responded_at = now()
  where invitation.conversation_id = p_conversation_id
    and invitation.invited_user_id = v_viewer_id
    and invitation.status in ('pending', 'accepted');

  update public.conversations conversation
  set updated_at = now()
  where conversation.id = p_conversation_id;
end;
$$;

revoke all on function public.leave_circle(uuid) from public;
grant execute on function public.leave_circle(uuid) to authenticated;

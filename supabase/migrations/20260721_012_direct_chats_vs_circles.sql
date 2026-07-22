-- Circles Step 9B.3 — distinguish ordinary direct chats from Circles
--
-- Product rule:
--   * People have profiles.
--   * Groups are Circles.
--   * A direct chat is not a Circle unless both people later opt in.
--
-- This migration adds the future-compatible circle_enabled flag, keeps every
-- group as a Circle, and exposes enough identity information for direct-chat
-- headers to open the other person's normal profile.

alter table public.conversations
  add column if not exists circle_enabled boolean not null default false;

alter table public.conversations
  add column if not exists circle_activated_at timestamptz;

update public.conversations
set
  circle_enabled = true,
  circle_activated_at = coalesce(circle_activated_at, created_at)
where kind = 'group'
  and (circle_enabled is distinct from true or circle_activated_at is null);

create or replace function public.enforce_group_circle_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind = 'group' then
    new.circle_enabled := true;
    new.circle_activated_at := coalesce(new.circle_activated_at, now());
  elsif new.circle_enabled is not true then
    new.circle_activated_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists conversations_enforce_group_circle_identity
  on public.conversations;
create trigger conversations_enforce_group_circle_identity
before insert or update of kind, circle_enabled, circle_activated_at
on public.conversations
for each row
execute function public.enforce_group_circle_identity();

-- Add is_circle to inbox rows. DROP is required because PostgreSQL cannot
-- change a function's returned table shape with CREATE OR REPLACE alone.
drop function if exists public.get_my_conversations();

create function public.get_my_conversations()
returns table (
  conversation_id uuid,
  kind text,
  is_circle boolean,
  display_title text,
  display_avatar text,
  display_avatar_path text,
  other_user_id uuid,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint,
  is_pinned boolean,
  member_count bigint,
  pending_invitation_count bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select
      conversation.id,
      conversation.kind,
      conversation.circle_enabled,
      conversation.title,
      conversation.avatar_url,
      conversation.avatar_path,
      conversation.created_at,
      conversation.updated_at,
      membership.last_read_at,
      membership.is_pinned
    from public.conversations conversation
    join public.conversation_members membership
      on membership.conversation_id = conversation.id
     and membership.user_id = auth.uid()
  )
  select
    mine.id as conversation_id,
    mine.kind,
    (mine.kind = 'group' or mine.circle_enabled) as is_circle,
    case
      when mine.kind = 'direct' and not mine.circle_enabled
        then coalesce(other_user.display_name, 'Connection')
      else coalesce(
        nullif(trim(mine.title), ''),
        case when mine.kind = 'direct' then 'Private Circle' else 'Private group' end
      )
    end as display_title,
    case
      when mine.kind = 'direct' and not mine.circle_enabled
        then other_user.avatar_url
      else mine.avatar_url
    end as display_avatar,
    case
      when mine.kind = 'group' or mine.circle_enabled then mine.avatar_path
      else null
    end as display_avatar_path,
    case when mine.kind = 'direct' then other_user.id else null end,
    coalesce(
      nullif(last_message.body, ''),
      case
        when last_message.media_count = 1 and last_message.first_media_type = 'image'
          then 'Photo'
        when last_message.media_count = 1 and last_message.first_media_type = 'video'
          then 'Video'
        when last_message.media_count > 1
          then last_message.media_count::text || ' attachments'
        else null
      end
    ) as last_message,
    last_message.created_at,
    (
      select count(*)
      from public.messages unread
      where unread.conversation_id = mine.id
        and unread.sender_id <> auth.uid()
        and unread.created_at > mine.last_read_at
    ),
    mine.is_pinned,
    (
      select count(*)
      from public.conversation_members member_rows
      where member_rows.conversation_id = mine.id
    ),
    (
      select count(*)
      from public.conversation_invitations invite_rows
      where invite_rows.conversation_id = mine.id
        and invite_rows.status = 'pending'
    ),
    mine.created_at
  from mine
  left join lateral (
    select user_row.id, user_row.display_name, user_row.avatar_url
    from public.conversation_members other_member
    join public.users user_row on user_row.id = other_member.user_id
    where other_member.conversation_id = mine.id
      and other_member.user_id <> auth.uid()
    order by other_member.joined_at asc
    limit 1
  ) other_user on true
  left join lateral (
    select
      message.body,
      message.created_at,
      count(media.id) as media_count,
      min(media.media_type) filter (where media.sort_order = 0) as first_media_type
    from public.messages message
    left join public.message_media media on media.message_id = message.id
    where message.conversation_id = mine.id
    group by message.id
    order by message.created_at desc
    limit 1
  ) last_message on true
  order by
    mine.is_pinned desc,
    coalesce(last_message.created_at, mine.updated_at, mine.created_at) desc;
$$;

revoke all on function public.get_my_conversations() from public;
grant execute on function public.get_my_conversations() to authenticated;

create or replace function public.get_conversation_details(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_result jsonb;
begin
  if not public.conversation_is_member(p_conversation_id, v_viewer_id) then
    raise exception 'You are not a member of this private conversation';
  end if;

  select jsonb_build_object(
    'conversation', jsonb_build_object(
      'id', conversation.id,
      'kind', conversation.kind,
      'is_circle', (conversation.kind = 'group' or conversation.circle_enabled),
      'circle_enabled', conversation.circle_enabled,
      'circle_activated_at', conversation.circle_activated_at,
      'other_user_id', case
        when conversation.kind = 'direct' then other_user.id
        else null
      end,
      'title', case
        when conversation.kind = 'direct' and not conversation.circle_enabled
          then coalesce(other_user.display_name, 'Connection')
        else coalesce(
          nullif(trim(conversation.title), ''),
          case when conversation.kind = 'direct' then 'Private Circle' else 'Private group' end
        )
      end,
      'avatar_url', case
        when conversation.kind = 'direct' and not conversation.circle_enabled
          then other_user.avatar_url
        else conversation.avatar_url
      end,
      'avatar_path', case
        when conversation.kind = 'group' or conversation.circle_enabled
          then conversation.avatar_path
        else null
      end,
      'bio', case
        when conversation.kind = 'direct' and not conversation.circle_enabled
          then null
        else conversation.bio
      end,
      'created_at', conversation.created_at,
      'created_by', conversation.created_by,
      'can_edit', conversation.kind = 'group',
      'timeline_count', (
        select count(*)
        from public.message_media timeline_media
        join public.messages timeline_message
          on timeline_message.id = timeline_media.message_id
        where timeline_message.conversation_id = conversation.id
      ),
      'post_count', 0
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
          case member_row.role when 'owner' then 0 when 'admin' then 1 else 2 end,
          member_row.joined_at
      )
      from public.conversation_members member_row
      join public.users member_user on member_user.id = member_row.user_id
      where member_row.conversation_id = conversation.id
    ), '[]'::jsonb),
    'pending_invitations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'invitation_id', invitation.id,
          'user_id', invited_user.id,
          'display_name', invited_user.display_name,
          'avatar_url', invited_user.avatar_url,
          'status', invitation.status,
          'created_at', invitation.created_at
        )
        order by invitation.created_at
      )
      from public.conversation_invitations invitation
      join public.users invited_user on invited_user.id = invitation.invited_user_id
      where invitation.conversation_id = conversation.id
        and invitation.status = 'pending'
    ), '[]'::jsonb)
  )
  into v_result
  from public.conversations conversation
  left join lateral (
    select user_row.id, user_row.display_name, user_row.avatar_url
    from public.conversation_members other_member
    join public.users user_row on user_row.id = other_member.user_id
    where other_member.conversation_id = conversation.id
      and other_member.user_id <> v_viewer_id
    order by other_member.joined_at
    limit 1
  ) other_user on true
  where conversation.id = p_conversation_id;

  return v_result;
end;
$$;

revoke all on function public.get_conversation_details(uuid) from public;
grant execute on function public.get_conversation_details(uuid) to authenticated;

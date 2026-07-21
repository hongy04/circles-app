-- Circles Step 9A — real conversations and invitation-gated groups
--
-- This migration replaces the active free-form group_id message prototype with
-- membership-protected conversations. Existing prototype messages are archived
-- as public.legacy_messages_step9 and are no longer used by the app.

create extension if not exists pgcrypto;

-- Archive the old prototype table only when it still has the free-form group_id
-- shape. No rows are deleted.
do $$
begin
  if to_regclass('public.messages') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'messages'
         and column_name = 'group_id'
     )
     and not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'messages'
         and column_name = 'conversation_id'
     ) then
    if to_regclass('public.legacy_messages_step9') is null then
      alter table public.messages rename to legacy_messages_step9;
    else
      raise exception 'public.legacy_messages_step9 already exists; inspect the legacy messaging tables before rerunning Step 9A';
    end if;
  end if;
end;
$$;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  title text,
  avatar_url text,
  created_by uuid references public.users(id) on delete set null,
  direct_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_kind_shape_check check (
    (kind = 'direct' and direct_key is not null)
    or
    (kind = 'group' and direct_key is null)
  )
);

create unique index if not exists conversations_direct_key_unique
  on public.conversations (direct_key)
  where direct_key is not null;

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  is_pinned boolean not null default false,
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_index
  on public.conversation_members (user_id, conversation_id);

create table if not exists public.conversation_invitations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  invited_user_id uuid not null references public.users(id) on delete cascade,
  invited_by uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (conversation_id, invited_user_id)
);

create index if not exists conversation_invitations_user_status_index
  on public.conversation_invitations (invited_user_id, status, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists messages_conversation_created_index
  on public.messages (conversation_id, created_at desc);

create or replace function public.conversation_direct_key(p_user_a uuid, p_user_b uuid)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select case
    when p_user_a::text < p_user_b::text
      then p_user_a::text || ':' || p_user_b::text
    else p_user_b::text || ':' || p_user_a::text
  end;
$$;

create or replace function public.conversation_is_member(
  p_conversation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = p_conversation_id
        and cm.user_id = p_user_id
    );
$$;

revoke all on function public.conversation_is_member(uuid, uuid) from public;
grant execute on function public.conversation_is_member(uuid, uuid) to authenticated;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.conversation_invitations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Conversation members can view conversations" on public.conversations;
create policy "Conversation members can view conversations"
on public.conversations
for select
to authenticated
using (public.conversation_is_member(id, auth.uid()));

drop policy if exists "Conversation members can view membership" on public.conversation_members;
create policy "Conversation members can view membership"
on public.conversation_members
for select
to authenticated
using (public.conversation_is_member(conversation_id, auth.uid()));

drop policy if exists "Conversation invite participants can view invitations" on public.conversation_invitations;
create policy "Conversation invite participants can view invitations"
on public.conversation_invitations
for select
to authenticated
using (
  invited_user_id = auth.uid()
  or invited_by = auth.uid()
  or public.conversation_is_member(conversation_id, auth.uid())
);

drop policy if exists "Conversation members can read messages" on public.messages;
create policy "Conversation members can read messages"
on public.messages
for select
to authenticated
using (public.conversation_is_member(conversation_id, auth.uid()));

drop policy if exists "Conversation members can send their own messages" on public.messages;
create policy "Conversation members can send their own messages"
on public.messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and public.conversation_is_member(conversation_id, auth.uid())
);

create or replace function public.ensure_direct_conversation(
  p_user_a uuid,
  p_user_b uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_conversation_id uuid;
begin
  if p_user_a is null or p_user_b is null or p_user_a = p_user_b then
    raise exception 'Two different users are required';
  end if;

  if not exists (
    select 1
    from public.connections c
    where c.user_id = p_user_a
      and c.other_user_id = p_user_b
  ) and not exists (
    select 1
    from public.connections c
    where c.user_id = p_user_b
      and c.other_user_id = p_user_a
  ) then
    raise exception 'A direct conversation requires an accepted connection';
  end if;

  v_key := public.conversation_direct_key(p_user_a, p_user_b);

  insert into public.conversations (
    kind,
    created_by,
    direct_key
  )
  values (
    'direct',
    p_user_a,
    v_key
  )
  on conflict (direct_key) where direct_key is not null
  do update set direct_key = excluded.direct_key
  returning id into v_conversation_id;

  insert into public.conversation_members (
    conversation_id,
    user_id,
    role
  )
  values
    (v_conversation_id, p_user_a, 'member'),
    (v_conversation_id, p_user_b, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

revoke all on function public.ensure_direct_conversation(uuid, uuid) from public;

create or replace function public.sync_direct_conversation_after_connection_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_direct_conversation(new.user_id, new.other_user_id);
  return new;
end;
$$;

drop trigger if exists connections_create_direct_conversation on public.connections;
create trigger connections_create_direct_conversation
after insert on public.connections
for each row
execute function public.sync_direct_conversation_after_connection_insert();

create or replace function public.cleanup_direct_conversation_after_connection_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if exists (
    select 1
    from public.connections c
    where (c.user_id = old.user_id and c.other_user_id = old.other_user_id)
       or (c.user_id = old.other_user_id and c.other_user_id = old.user_id)
  ) then
    return old;
  end if;

  v_key := public.conversation_direct_key(old.user_id, old.other_user_id);

  delete from public.conversations c
  where c.kind = 'direct'
    and c.direct_key = v_key;

  return old;
end;
$$;

drop trigger if exists connections_remove_direct_conversation on public.connections;
create trigger connections_remove_direct_conversation
after delete on public.connections
for each row
execute function public.cleanup_direct_conversation_after_connection_delete();

-- Backfill direct conversations for accepted relationships that already exist.
do $$
declare
  v_pair record;
begin
  for v_pair in
    select distinct
      least(c.user_id::text, c.other_user_id::text)::uuid as user_a,
      greatest(c.user_id::text, c.other_user_id::text)::uuid as user_b
    from public.connections c
    where c.user_id <> c.other_user_id
  loop
    perform public.ensure_direct_conversation(v_pair.user_a, v_pair.user_b);
  end loop;
end;
$$;

create or replace function public.get_my_conversations()
returns table (
  conversation_id uuid,
  kind text,
  display_title text,
  display_avatar text,
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
      c.id,
      c.kind,
      c.title,
      c.avatar_url,
      c.created_at,
      c.updated_at,
      cm.last_read_at,
      cm.is_pinned
    from public.conversations c
    join public.conversation_members cm
      on cm.conversation_id = c.id
     and cm.user_id = auth.uid()
  )
  select
    m.id as conversation_id,
    m.kind,
    case
      when m.kind = 'direct' then coalesce(other_user.display_name, 'Connection')
      else coalesce(nullif(trim(m.title), ''), 'Private group')
    end as display_title,
    case
      when m.kind = 'direct' then other_user.avatar_url
      else m.avatar_url
    end as display_avatar,
    case when m.kind = 'direct' then other_user.id else null end as other_user_id,
    last_message.body as last_message,
    last_message.created_at as last_message_at,
    (
      select count(*)
      from public.messages unread
      where unread.conversation_id = m.id
        and unread.sender_id <> auth.uid()
        and unread.created_at > m.last_read_at
    ) as unread_count,
    m.is_pinned,
    (
      select count(*)
      from public.conversation_members member_rows
      where member_rows.conversation_id = m.id
    ) as member_count,
    (
      select count(*)
      from public.conversation_invitations invite_rows
      where invite_rows.conversation_id = m.id
        and invite_rows.status = 'pending'
    ) as pending_invitation_count,
    m.created_at
  from mine m
  left join lateral (
    select u.id, u.display_name, u.avatar_url
    from public.conversation_members other_member
    join public.users u on u.id = other_member.user_id
    where other_member.conversation_id = m.id
      and other_member.user_id <> auth.uid()
    order by other_member.joined_at asc
    limit 1
  ) other_user on true
  left join lateral (
    select msg.body, msg.created_at
    from public.messages msg
    where msg.conversation_id = m.id
    order by msg.created_at desc
    limit 1
  ) last_message on true
  order by
    m.is_pinned desc,
    coalesce(last_message.created_at, m.updated_at, m.created_at) desc;
$$;

revoke all on function public.get_my_conversations() from public;
grant execute on function public.get_my_conversations() to authenticated;

create or replace function public.get_my_conversation_invitations()
returns table (
  invitation_id uuid,
  conversation_id uuid,
  title text,
  inviter_id uuid,
  inviter_name text,
  inviter_avatar text,
  invited_member_count bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    invitation.id as invitation_id,
    conversation.id as conversation_id,
    coalesce(nullif(trim(conversation.title), ''), 'Private group') as title,
    invitation.invited_by as inviter_id,
    inviter.display_name as inviter_name,
    inviter.avatar_url as inviter_avatar,
    (
      select count(*) + 1
      from public.conversation_invitations all_invites
      where all_invites.conversation_id = conversation.id
        and all_invites.status in ('pending', 'accepted')
    ) as invited_member_count,
    invitation.created_at
  from public.conversation_invitations invitation
  join public.conversations conversation
    on conversation.id = invitation.conversation_id
   and conversation.kind = 'group'
  join public.users inviter
    on inviter.id = invitation.invited_by
  where invitation.invited_user_id = auth.uid()
    and invitation.status = 'pending'
  order by invitation.created_at desc;
$$;

revoke all on function public.get_my_conversation_invitations() from public;
grant execute on function public.get_my_conversation_invitations() to authenticated;

create or replace function public.get_connected_people_for_group()
returns table (
  user_id uuid,
  display_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    u.id as user_id,
    u.display_name,
    u.avatar_url
  from public.connections c
  join public.users u on u.id = c.other_user_id
  where c.user_id = auth.uid()
    and c.other_user_id <> auth.uid()
  order by u.display_name nulls last, u.id;
$$;

revoke all on function public.get_connected_people_for_group() from public;
grant execute on function public.get_connected_people_for_group() to authenticated;

create or replace function public.create_group_conversation(
  p_title text,
  p_invitee_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_invitee_ids uuid[];
  v_invitee_id uuid;
  v_title text;
  v_conversation_id uuid;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(array_agg(distinct invitee_id), array[]::uuid[])
    into v_invitee_ids
  from unnest(coalesce(p_invitee_ids, array[]::uuid[])) as invitee_id
  where invitee_id is not null
    and invitee_id <> v_viewer_id;

  if cardinality(v_invitee_ids) < 2 then
    raise exception 'Choose at least two connected people for a group';
  end if;

  if cardinality(v_invitee_ids) > 20 then
    raise exception 'Groups are currently limited to 21 people including you';
  end if;

  foreach v_invitee_id in array v_invitee_ids loop
    if not exists (
      select 1
      from public.connections c
      where c.user_id = v_viewer_id
        and c.other_user_id = v_invitee_id
    ) then
      raise exception 'Every invited person must already be an accepted connection';
    end if;
  end loop;

  v_title := nullif(trim(p_title), '');

  if v_title is null then
    select string_agg(coalesce(u.display_name, 'Connection'), ', ' order by u.display_name)
      into v_title
    from public.users u
    where u.id = any(v_invitee_ids);
  end if;

  if length(v_title) > 60 then
    raise exception 'Group name must be 60 characters or fewer';
  end if;

  insert into public.conversations (
    kind,
    title,
    created_by
  )
  values (
    'group',
    coalesce(v_title, 'Private group'),
    v_viewer_id
  )
  returning id into v_conversation_id;

  insert into public.conversation_members (
    conversation_id,
    user_id,
    role
  )
  values (
    v_conversation_id,
    v_viewer_id,
    'owner'
  );

  insert into public.conversation_invitations (
    conversation_id,
    invited_user_id,
    invited_by
  )
  select
    v_conversation_id,
    invitee_id,
    v_viewer_id
  from unnest(v_invitee_ids) as invitee_id;

  return v_conversation_id;
end;
$$;

revoke all on function public.create_group_conversation(text, uuid[]) from public;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;

create or replace function public.respond_conversation_invitation(
  p_invitation_id uuid,
  p_action text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_invitation public.conversation_invitations%rowtype;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_action not in ('accept', 'decline') then
    raise exception 'Action must be accept or decline';
  end if;

  select invitation.*
    into v_invitation
  from public.conversation_invitations invitation
  where invitation.id = p_invitation_id
    and invitation.invited_user_id = v_viewer_id
    and invitation.status = 'pending'
  for update;

  if not found then
    raise exception 'This invitation is no longer available';
  end if;

  update public.conversation_invitations invitation
  set
    status = case when p_action = 'accept' then 'accepted' else 'declined' end,
    responded_at = now()
  where invitation.id = v_invitation.id;

  if p_action = 'accept' then
    insert into public.conversation_members (
      conversation_id,
      user_id,
      role
    )
    values (
      v_invitation.conversation_id,
      v_viewer_id,
      'member'
    )
    on conflict (conversation_id, user_id) do nothing;
  end if;

  return v_invitation.conversation_id;
end;
$$;

revoke all on function public.respond_conversation_invitation(uuid, text) from public;
grant execute on function public.respond_conversation_invitation(uuid, text) to authenticated;

create or replace function public.get_conversation_messages(
  p_conversation_id uuid,
  p_limit_count integer default 100,
  p_before timestamptz default now()
)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  sender_name text,
  sender_avatar text,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    message.id as message_id,
    message.conversation_id,
    message.sender_id,
    sender.display_name as sender_name,
    sender.avatar_url as sender_avatar,
    message.body,
    message.created_at
  from public.messages message
  join public.users sender on sender.id = message.sender_id
  where message.conversation_id = p_conversation_id
    and message.created_at < coalesce(p_before, now())
    and public.conversation_is_member(p_conversation_id, auth.uid())
  order by message.created_at desc
  limit greatest(1, least(coalesce(p_limit_count, 100), 200));
$$;

revoke all on function public.get_conversation_messages(uuid, integer, timestamptz) from public;
grant execute on function public.get_conversation_messages(uuid, integer, timestamptz) to authenticated;

create or replace function public.send_conversation_message(
  p_conversation_id uuid,
  p_body text
)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  sender_name text,
  sender_avatar text,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_clean_body text := trim(coalesce(p_body, ''));
  v_message public.messages%rowtype;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.conversation_is_member(p_conversation_id, v_viewer_id) then
    raise exception 'You are not a member of this private conversation';
  end if;

  if length(v_clean_body) < 1 then
    raise exception 'Message cannot be empty';
  end if;

  if length(v_clean_body) > 4000 then
    raise exception 'Message is too long';
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    body
  )
  values (
    p_conversation_id,
    v_viewer_id,
    v_clean_body
  )
  returning * into v_message;

  update public.conversations conversation
  set updated_at = v_message.created_at
  where conversation.id = p_conversation_id;

  return query
  select
    v_message.id,
    v_message.conversation_id,
    v_message.sender_id,
    sender.display_name,
    sender.avatar_url,
    v_message.body,
    v_message.created_at
  from public.users sender
  where sender.id = v_viewer_id;
end;
$$;

revoke all on function public.send_conversation_message(uuid, text) from public;
grant execute on function public.send_conversation_message(uuid, text) to authenticated;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversation_members member_row
  set last_read_at = now()
  where member_row.conversation_id = p_conversation_id
    and member_row.user_id = auth.uid();

  if not found then
    raise exception 'You are not a member of this private conversation';
  end if;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.toggle_conversation_pin(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pinned boolean;
begin
  update public.conversation_members member_row
  set is_pinned = not member_row.is_pinned
  where member_row.conversation_id = p_conversation_id
    and member_row.user_id = auth.uid()
  returning member_row.is_pinned into v_pinned;

  if not found then
    raise exception 'You are not a member of this private conversation';
  end if;

  return v_pinned;
end;
$$;

revoke all on function public.toggle_conversation_pin(uuid) from public;
grant execute on function public.toggle_conversation_pin(uuid) to authenticated;

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
      'title', case
        when conversation.kind = 'direct' then coalesce(other_user.display_name, 'Connection')
        else coalesce(nullif(trim(conversation.title), ''), 'Private group')
      end,
      'avatar_url', case
        when conversation.kind = 'direct' then other_user.avatar_url
        else conversation.avatar_url
      end,
      'created_at', conversation.created_at,
      'created_by', conversation.created_by
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
    select u.display_name, u.avatar_url
    from public.conversation_members other_member
    join public.users u on u.id = other_member.user_id
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

-- Add the real messaging tables to Realtime when the publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'conversation_members'
    ) then
      alter publication supabase_realtime add table public.conversation_members;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'conversation_invitations'
    ) then
      alter publication supabase_realtime add table public.conversation_invitations;
    end if;
  end if;
end;
$$;

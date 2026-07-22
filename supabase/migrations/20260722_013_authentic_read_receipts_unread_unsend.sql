-- Circles Step 9B.5 — automatic read receipts and unread-only unsend
--
-- Read state is recorded per message rather than inferred only from a
-- conversation timestamp. A sender may unsend a message only while no other
-- eligible member has a read receipt for it. The rule is enforced in Postgres,
-- so an older client cannot bypass it.

create table if not exists public.conversation_message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists conversation_message_reads_user_index
  on public.conversation_message_reads (user_id, read_at desc);

alter table public.conversation_message_reads enable row level security;

drop policy if exists "Conversation members can view message reads"
  on public.conversation_message_reads;
create policy "Conversation members can view message reads"
on public.conversation_message_reads
for select
to authenticated
using (
  exists (
    select 1
    from public.messages message
    where message.id = conversation_message_reads.message_id
      and public.conversation_is_member(message.conversation_id, auth.uid())
  )
);

drop policy if exists "Members can record their own message reads"
  on public.conversation_message_reads;
create policy "Members can record their own message reads"
on public.conversation_message_reads
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.messages message
    where message.id = conversation_message_reads.message_id
      and message.sender_id <> auth.uid()
      and public.conversation_is_member(message.conversation_id, auth.uid())
  )
);

-- Conservatively preserve the read knowledge that existed before exact receipt
-- rows were introduced. This can disable unsend for a message that the old
-- conversation timestamp indicates was already opened, which is safer than
-- allowing a previously read message to disappear.
insert into public.conversation_message_reads (message_id, user_id, read_at)
select
  message.id,
  member.user_id,
  member.last_read_at
from public.messages message
join public.conversation_members member
  on member.conversation_id = message.conversation_id
 and member.user_id <> message.sender_id
 and member.joined_at <= message.created_at
where member.last_read_at >= message.created_at
on conflict (message_id, user_id) do nothing;

create or replace function public.mark_conversation_read(
  p_conversation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_previous_read_at timestamptz;
  v_latest_incoming_at timestamptz;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select member.last_read_at
    into v_previous_read_at
  from public.conversation_members member
  where member.conversation_id = p_conversation_id
    and member.user_id = v_viewer_id
  for update;

  if not found then
    raise exception 'You are not a member of this private conversation';
  end if;

  select max(message.created_at)
    into v_latest_incoming_at
  from public.messages message
  where message.conversation_id = p_conversation_id
    and message.sender_id <> v_viewer_id
    and message.created_at > v_previous_read_at;

  if v_latest_incoming_at is null then
    return;
  end if;

  insert into public.conversation_message_reads (
    message_id,
    user_id,
    read_at
  )
  select
    message.id,
    v_viewer_id,
    now()
  from public.messages message
  where message.conversation_id = p_conversation_id
    and message.sender_id <> v_viewer_id
    and message.created_at > v_previous_read_at
  on conflict (message_id, user_id) do nothing;

  update public.conversation_members member
  set last_read_at = greatest(now(), v_latest_incoming_at)
  where member.conversation_id = p_conversation_id
    and member.user_id = v_viewer_id;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.get_conversation_message_read_states(
  p_conversation_id uuid
)
returns table (
  message_id uuid,
  read_count bigint,
  recipient_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    message.id as message_id,
    (
      select count(*)
      from public.conversation_message_reads receipt
      where receipt.message_id = message.id
        and receipt.user_id <> message.sender_id
    ) as read_count,
    (
      select count(*)
      from public.conversation_members recipient
      where recipient.conversation_id = message.conversation_id
        and recipient.user_id <> message.sender_id
        and recipient.joined_at <= message.created_at
    ) as recipient_count
  from public.messages message
  where message.conversation_id = p_conversation_id
    and public.conversation_is_member(p_conversation_id, auth.uid())
  order by message.created_at desc;
$$;

revoke all on function public.get_conversation_message_read_states(uuid)
  from public;
grant execute on function public.get_conversation_message_read_states(uuid)
  to authenticated;

-- Keep the existing RPC name so every client receives the stricter rule.
create or replace function public.delete_own_conversation_message(
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_paths text[];
  v_conversation_id uuid;
  v_created_at timestamptz;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  -- FOR UPDATE serializes deletion against a concurrent receipt insert that
  -- must validate its foreign key against this message row.
  select
    message.conversation_id,
    message.created_at
  into
    v_conversation_id,
    v_created_at
  from public.messages message
  where message.id = p_message_id
    and message.sender_id = v_viewer_id
  for update;

  if not found then
    raise exception 'Message not found or not owned by you';
  end if;

  if exists (
    select 1
    from public.conversation_message_reads receipt
    where receipt.message_id = p_message_id
      and receipt.user_id <> v_viewer_id
  ) then
    raise exception 'This message has already been read and can no longer be unsent';
  end if;

  select coalesce(
    array_agg(media.storage_path)
      filter (where media.storage_path is not null),
    array[]::text[]
  )
  into v_paths
  from public.message_media media
  where media.message_id = p_message_id;

  delete from public.messages message
  where message.id = p_message_id
    and message.sender_id = v_viewer_id;

  update public.conversations conversation
  set updated_at = now()
  where conversation.id = v_conversation_id;

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'storage_paths', to_jsonb(v_paths),
    'created_at', v_created_at
  );
end;
$$;

revoke all on function public.delete_own_conversation_message(uuid)
  from public;
grant execute on function public.delete_own_conversation_message(uuid)
  to authenticated;

-- Realtime receipt inserts refresh the sender's visible status automatically.
do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_message_reads'
  ) then
    alter publication supabase_realtime
      add table public.conversation_message_reads;
  end if;
end;
$$;

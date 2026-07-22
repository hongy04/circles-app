-- Circles Step 9B — Circle profiles, private chat media, and automatic Timeline
--
-- This migration keeps one private Storage object per sent photo/video. The
-- Timeline is a membership-protected view over message_media; it does not copy
-- uploads into a second archive.

create extension if not exists pgcrypto;

alter table public.conversations
  add column if not exists bio text,
  add column if not exists avatar_path text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_bio_length_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_bio_length_check
      check (bio is null or length(bio) <= 160);
  end if;
end;
$$;

-- Media-only messages are valid. Text, when present, still has the same limits.
alter table public.messages
  alter column body drop not null;

alter table public.messages
  drop constraint if exists messages_body_check;

alter table public.messages
  drop constraint if exists messages_body_length_check;

alter table public.messages
  add constraint messages_body_length_check
  check (
    body is null
    or length(trim(body)) between 1 and 4000
  );

create table if not exists public.message_media (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  storage_path text not null,
  media_type text not null check (media_type in ('image', 'video')),
  width integer,
  height integer,
  duration_ms integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (message_id, sort_order)
);

create index if not exists message_media_message_order_index
  on public.message_media (message_id, sort_order);

create index if not exists message_media_created_index
  on public.message_media (created_at desc);

alter table public.message_media enable row level security;

drop policy if exists "Conversation members can view message media" on public.message_media;
create policy "Conversation members can view message media"
on public.message_media
for select
to authenticated
using (
  exists (
    select 1
    from public.messages message
    where message.id = message_media.message_id
      and public.conversation_is_member(message.conversation_id, auth.uid())
  )
);

drop policy if exists "Senders can insert their message media" on public.message_media;
create policy "Senders can insert their message media"
on public.message_media
for insert
to authenticated
with check (
  exists (
    select 1
    from public.messages message
    where message.id = message_media.message_id
      and message.sender_id = auth.uid()
      and public.conversation_is_member(message.conversation_id, auth.uid())
  )
);

drop policy if exists "Senders can delete their message media" on public.message_media;
create policy "Senders can delete their message media"
on public.message_media
for delete
to authenticated
using (
  exists (
    select 1
    from public.messages message
    where message.id = message_media.message_id
      and message.sender_id = auth.uid()
  )
);

-- Private bucket shared only through conversation membership.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'conversation-media',
  'conversation-media',
  false,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.conversation_id_from_storage_name(p_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when split_part(coalesce(p_name, ''), '/', 1)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
    else null
  end;
$$;

revoke all on function public.conversation_id_from_storage_name(text) from public;
grant execute on function public.conversation_id_from_storage_name(text) to authenticated;

drop policy if exists "Conversation members can read private media" on storage.objects;
create policy "Conversation members can read private media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'conversation-media'
  and public.conversation_is_member(
    public.conversation_id_from_storage_name(name),
    auth.uid()
  )
);

drop policy if exists "Conversation members can upload private media" on storage.objects;
create policy "Conversation members can upload private media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'conversation-media'
  and public.conversation_is_member(
    public.conversation_id_from_storage_name(name),
    auth.uid()
  )
  and (storage.foldername(name))[3] = auth.uid()::text
);

drop policy if exists "Uploaders can update private conversation media" on storage.objects;
create policy "Uploaders can update private conversation media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'conversation-media'
  and public.conversation_is_member(
    public.conversation_id_from_storage_name(name),
    auth.uid()
  )
  and (storage.foldername(name))[3] = auth.uid()::text
)
with check (
  bucket_id = 'conversation-media'
  and public.conversation_is_member(
    public.conversation_id_from_storage_name(name),
    auth.uid()
  )
  and (storage.foldername(name))[3] = auth.uid()::text
);

drop policy if exists "Uploaders can delete private conversation media" on storage.objects;
create policy "Uploaders can delete private conversation media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'conversation-media'
  and public.conversation_is_member(
    public.conversation_id_from_storage_name(name),
    auth.uid()
  )
  and (storage.foldername(name))[3] = auth.uid()::text
);

-- get_my_conversations gains the private group avatar path and media-aware
-- last-message labels.
drop function if exists public.get_my_conversations();

create function public.get_my_conversations()
returns table (
  conversation_id uuid,
  kind text,
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
    case
      when mine.kind = 'direct'
        then coalesce(other_user.display_name, 'Connection')
      else coalesce(nullif(trim(mine.title), ''), 'Private group')
    end as display_title,
    case
      when mine.kind = 'direct' then other_user.avatar_url
      else mine.avatar_url
    end as display_avatar,
    case
      when mine.kind = 'group' then mine.avatar_path
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

drop function if exists public.get_conversation_messages(uuid, integer, timestamptz);

create function public.get_conversation_messages(
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
  media jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    message.id,
    message.conversation_id,
    message.sender_id,
    sender.display_name,
    sender.avatar_url,
    message.body,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', media_row.id,
          'storage_path', media_row.storage_path,
          'media_type', media_row.media_type,
          'width', media_row.width,
          'height', media_row.height,
          'duration_ms', media_row.duration_ms,
          'sort_order', media_row.sort_order
        )
        order by media_row.sort_order
      )
      from public.message_media media_row
      where media_row.message_id = message.id
    ), '[]'::jsonb),
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

create or replace function public.send_conversation_message_with_media(
  p_conversation_id uuid,
  p_body text default null,
  p_media jsonb default '[]'::jsonb
)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  sender_name text,
  sender_avatar text,
  body text,
  media jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_clean_body text := nullif(trim(coalesce(p_body, '')), '');
  v_media jsonb := coalesce(p_media, '[]'::jsonb);
  v_message public.messages%rowtype;
  v_item jsonb;
  v_index integer := 0;
  v_path text;
  v_type text;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.conversation_is_member(p_conversation_id, v_viewer_id) then
    raise exception 'You are not a member of this private conversation';
  end if;

  if jsonb_typeof(v_media) <> 'array' then
    raise exception 'Message media must be an array';
  end if;

  if jsonb_array_length(v_media) > 6 then
    raise exception 'A message can contain at most six attachments';
  end if;

  if v_clean_body is null and jsonb_array_length(v_media) = 0 then
    raise exception 'Message cannot be empty';
  end if;

  if v_clean_body is not null and length(v_clean_body) > 4000 then
    raise exception 'Message is too long';
  end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (p_conversation_id, v_viewer_id, v_clean_body)
  returning * into v_message;

  for v_item in select value from jsonb_array_elements(v_media)
  loop
    v_path := nullif(trim(v_item ->> 'storage_path'), '');
    v_type := lower(nullif(trim(v_item ->> 'media_type'), ''));

    if v_path is null
      or v_path not like p_conversation_id::text
        || '/messages/' || v_viewer_id::text || '/%' then
      raise exception 'Attachment path does not belong to this conversation and sender';
    end if;

    if v_type not in ('image', 'video') then
      raise exception 'Attachment type must be image or video';
    end if;

    insert into public.message_media (
      message_id,
      storage_path,
      media_type,
      width,
      height,
      duration_ms,
      sort_order
    )
    values (
      v_message.id,
      v_path,
      v_type,
      nullif(v_item ->> 'width', '')::integer,
      nullif(v_item ->> 'height', '')::integer,
      nullif(v_item ->> 'duration_ms', '')::integer,
      v_index
    );

    v_index := v_index + 1;
  end loop;

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
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', media_row.id,
          'storage_path', media_row.storage_path,
          'media_type', media_row.media_type,
          'width', media_row.width,
          'height', media_row.height,
          'duration_ms', media_row.duration_ms,
          'sort_order', media_row.sort_order
        )
        order by media_row.sort_order
      )
      from public.message_media media_row
      where media_row.message_id = v_message.id
    ), '[]'::jsonb),
    v_message.created_at
  from public.users sender
  where sender.id = v_viewer_id;
end;
$$;

revoke all on function public.send_conversation_message_with_media(uuid, text, jsonb) from public;
grant execute on function public.send_conversation_message_with_media(uuid, text, jsonb) to authenticated;

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
begin
  select
    message.conversation_id,
    coalesce(array_agg(media.storage_path) filter (where media.storage_path is not null), array[]::text[])
  into v_conversation_id, v_paths
  from public.messages message
  left join public.message_media media on media.message_id = message.id
  where message.id = p_message_id
    and message.sender_id = v_viewer_id
  group by message.id;

  if v_conversation_id is null then
    raise exception 'Message not found or not owned by you';
  end if;

  delete from public.messages message
  where message.id = p_message_id
    and message.sender_id = v_viewer_id;

  update public.conversations conversation
  set updated_at = now()
  where conversation.id = v_conversation_id;

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'storage_paths', to_jsonb(v_paths)
  );
end;
$$;

revoke all on function public.delete_own_conversation_message(uuid) from public;
grant execute on function public.delete_own_conversation_message(uuid) to authenticated;

create or replace function public.get_conversation_timeline(
  p_conversation_id uuid,
  p_limit_count integer default 120,
  p_before timestamptz default now()
)
returns table (
  media_id uuid,
  message_id uuid,
  storage_path text,
  media_type text,
  width integer,
  height integer,
  duration_ms integer,
  sort_order integer,
  sender_id uuid,
  sender_name text,
  sender_avatar text,
  message_body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    media.id,
    message.id,
    media.storage_path,
    media.media_type,
    media.width,
    media.height,
    media.duration_ms,
    media.sort_order,
    message.sender_id,
    sender.display_name,
    sender.avatar_url,
    message.body,
    message.created_at
  from public.message_media media
  join public.messages message on message.id = media.message_id
  join public.users sender on sender.id = message.sender_id
  where message.conversation_id = p_conversation_id
    and message.created_at < coalesce(p_before, now())
    and public.conversation_is_member(p_conversation_id, auth.uid())
  order by message.created_at desc, media.sort_order
  limit greatest(1, least(coalesce(p_limit_count, 120), 300));
$$;

revoke all on function public.get_conversation_timeline(uuid, integer, timestamptz) from public;
grant execute on function public.get_conversation_timeline(uuid, integer, timestamptz) to authenticated;

create or replace function public.update_group_circle_profile(
  p_conversation_id uuid,
  p_title text,
  p_bio text default null,
  p_avatar_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_bio text := nullif(trim(coalesce(p_bio, '')), '');
  v_conversation public.conversations%rowtype;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.conversation_is_member(p_conversation_id, v_viewer_id) then
    raise exception 'Only accepted members can edit this Circle';
  end if;

  if v_title is null then
    raise exception 'Circle name is required';
  end if;

  if length(v_title) > 60 then
    raise exception 'Circle name must be 60 characters or fewer';
  end if;

  if v_bio is not null and length(v_bio) > 160 then
    raise exception 'Circle bio must be 160 characters or fewer';
  end if;

  if p_avatar_path is not null
    and p_avatar_path not like p_conversation_id::text
      || '/avatars/' || v_viewer_id::text || '/%' then
    raise exception 'Circle avatar path does not belong to this member';
  end if;

  update public.conversations conversation
  set
    title = v_title,
    bio = v_bio,
    avatar_path = coalesce(p_avatar_path, conversation.avatar_path),
    updated_at = now()
  where conversation.id = p_conversation_id
    and conversation.kind = 'group'
  returning * into v_conversation;

  if not found then
    raise exception 'Only group Circles have shared editable identity';
  end if;

  return jsonb_build_object(
    'id', v_conversation.id,
    'title', v_conversation.title,
    'bio', v_conversation.bio,
    'avatar_path', v_conversation.avatar_path,
    'updated_at', v_conversation.updated_at
  );
end;
$$;

revoke all on function public.update_group_circle_profile(uuid, text, text, text) from public;
grant execute on function public.update_group_circle_profile(uuid, text, text, text) to authenticated;

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
        when conversation.kind = 'direct'
          then coalesce(other_user.display_name, 'Connection')
        else coalesce(nullif(trim(conversation.title), ''), 'Private group')
      end,
      'avatar_url', case
        when conversation.kind = 'direct' then other_user.avatar_url
        else conversation.avatar_url
      end,
      'avatar_path', case
        when conversation.kind = 'group' then conversation.avatar_path
        else null
      end,
      'bio', case
        when conversation.kind = 'direct'
          then 'A private Circle shared by two connected people.'
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
    select user_row.display_name, user_row.avatar_url
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

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'message_media'
     ) then
    alter publication supabase_realtime add table public.message_media;
  end if;
end;
$$;

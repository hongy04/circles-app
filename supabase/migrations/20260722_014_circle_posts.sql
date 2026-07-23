-- Circles Step 9C — intentional private Circle posts
--
-- Timeline media remains an automatic view over chat attachments. Circle posts
-- are deliberate, separately uploaded publications that belong to a Circle.
-- Ordinary direct chats cannot create or view Circle posts unless that direct
-- conversation is explicitly promoted to a two-person Circle in the future.

create extension if not exists pgcrypto;

create table if not exists public.conversation_posts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  caption text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint conversation_posts_caption_length_check check (
    caption is null or length(caption) <= 2200
  )
);

create index if not exists conversation_posts_conversation_created_index
  on public.conversation_posts (conversation_id, created_at desc);

create index if not exists conversation_posts_author_index
  on public.conversation_posts (author_id, created_at desc);

create table if not exists public.conversation_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.conversation_posts(id) on delete cascade,
  storage_path text not null,
  media_type text not null check (media_type in ('image', 'video')),
  width integer,
  height integer,
  duration_ms integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (post_id, sort_order)
);

create index if not exists conversation_post_media_post_order_index
  on public.conversation_post_media (post_id, sort_order);

create table if not exists public.conversation_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.conversation_posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint conversation_post_comments_body_check check (
    length(trim(body)) between 1 and 1000
  )
);

create index if not exists conversation_post_comments_post_created_index
  on public.conversation_post_comments (post_id, created_at asc);

create or replace function public.circle_posts_are_enabled(
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
      from public.conversations conversation
      where conversation.id = p_conversation_id
        and (conversation.kind = 'group' or conversation.circle_enabled)
        and public.conversation_is_member(conversation.id, p_user_id)
    );
$$;

revoke all on function public.circle_posts_are_enabled(uuid, uuid) from public;
grant execute on function public.circle_posts_are_enabled(uuid, uuid) to authenticated;

alter table public.conversation_posts enable row level security;
alter table public.conversation_post_media enable row level security;
alter table public.conversation_post_comments enable row level security;

drop policy if exists "Circle members can view Circle posts"
  on public.conversation_posts;
create policy "Circle members can view Circle posts"
on public.conversation_posts
for select
to authenticated
using (
  public.circle_posts_are_enabled(conversation_id, auth.uid())
);

drop policy if exists "Circle members can create their own Circle posts"
  on public.conversation_posts;
create policy "Circle members can create their own Circle posts"
on public.conversation_posts
for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.circle_posts_are_enabled(conversation_id, auth.uid())
);

drop policy if exists "Authors can edit their Circle posts"
  on public.conversation_posts;
create policy "Authors can edit their Circle posts"
on public.conversation_posts
for update
to authenticated
using (author_id = auth.uid())
with check (
  author_id = auth.uid()
  and public.circle_posts_are_enabled(conversation_id, auth.uid())
);

drop policy if exists "Authors can delete their Circle posts"
  on public.conversation_posts;
create policy "Authors can delete their Circle posts"
on public.conversation_posts
for delete
to authenticated
using (author_id = auth.uid());

drop policy if exists "Circle members can view Circle post media"
  on public.conversation_post_media;
create policy "Circle members can view Circle post media"
on public.conversation_post_media
for select
to authenticated
using (
  exists (
    select 1
    from public.conversation_posts post_row
    where post_row.id = conversation_post_media.post_id
      and public.circle_posts_are_enabled(post_row.conversation_id, auth.uid())
  )
);

drop policy if exists "Authors can attach media to their Circle posts"
  on public.conversation_post_media;
create policy "Authors can attach media to their Circle posts"
on public.conversation_post_media
for insert
to authenticated
with check (
  exists (
    select 1
    from public.conversation_posts post_row
    where post_row.id = conversation_post_media.post_id
      and post_row.author_id = auth.uid()
      and public.circle_posts_are_enabled(post_row.conversation_id, auth.uid())
  )
);

drop policy if exists "Authors can delete their Circle post media"
  on public.conversation_post_media;
create policy "Authors can delete their Circle post media"
on public.conversation_post_media
for delete
to authenticated
using (
  exists (
    select 1
    from public.conversation_posts post_row
    where post_row.id = conversation_post_media.post_id
      and post_row.author_id = auth.uid()
  )
);

drop policy if exists "Circle members can view Circle post comments"
  on public.conversation_post_comments;
create policy "Circle members can view Circle post comments"
on public.conversation_post_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.conversation_posts post_row
    where post_row.id = conversation_post_comments.post_id
      and public.circle_posts_are_enabled(post_row.conversation_id, auth.uid())
  )
);

drop policy if exists "Circle members can comment on Circle posts"
  on public.conversation_post_comments;
create policy "Circle members can comment on Circle posts"
on public.conversation_post_comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.conversation_posts post_row
    where post_row.id = conversation_post_comments.post_id
      and public.circle_posts_are_enabled(post_row.conversation_id, auth.uid())
  )
);

drop policy if exists "Comment authors can edit their Circle comments"
  on public.conversation_post_comments;
create policy "Comment authors can edit their Circle comments"
on public.conversation_post_comments
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Comment authors can delete their Circle comments"
  on public.conversation_post_comments;
create policy "Comment authors can delete their Circle comments"
on public.conversation_post_comments
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.create_circle_post(
  p_conversation_id uuid,
  p_caption text default null,
  p_media jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_post_id uuid;
  v_caption text := nullif(trim(coalesce(p_caption, '')), '');
  v_media_count integer;
  v_expected_prefix text;
  v_invalid_media boolean;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.circle_posts_are_enabled(p_conversation_id, v_viewer_id) then
    raise exception 'Circle posts are available only to accepted Circle members';
  end if;

  if v_caption is not null and length(v_caption) > 2200 then
    raise exception 'Circle post captions must be 2200 characters or fewer';
  end if;

  if p_media is null or jsonb_typeof(p_media) <> 'array' then
    raise exception 'Circle post media must be an array';
  end if;

  v_media_count := jsonb_array_length(p_media);
  if v_media_count < 1 or v_media_count > 10 then
    raise exception 'Circle posts require between 1 and 10 photos or videos';
  end if;

  v_expected_prefix := p_conversation_id::text || '/posts/' || v_viewer_id::text || '/';

  select exists (
    select 1
    from jsonb_array_elements(p_media) as media_item(value)
    where jsonb_typeof(media_item.value) <> 'object'
      or coalesce(media_item.value->>'storage_path', '') = ''
      or position(v_expected_prefix in (media_item.value->>'storage_path')) <> 1
      or coalesce(media_item.value->>'media_type', '') not in ('image', 'video')
  )
  into v_invalid_media;

  if v_invalid_media then
    raise exception 'One or more Circle post attachments are invalid';
  end if;

  insert into public.conversation_posts (
    conversation_id,
    author_id,
    caption
  )
  values (
    p_conversation_id,
    v_viewer_id,
    v_caption
  )
  returning id into v_post_id;

  insert into public.conversation_post_media (
    post_id,
    storage_path,
    media_type,
    width,
    height,
    duration_ms,
    sort_order
  )
  select
    v_post_id,
    media_item->>'storage_path',
    media_item->>'media_type',
    nullif(media_item->>'width', '')::integer,
    nullif(media_item->>'height', '')::integer,
    nullif(media_item->>'duration_ms', '')::integer,
    (ordinality - 1)::integer
  from jsonb_array_elements(p_media) with ordinality
    as attachment(media_item, ordinality);

  update public.conversations conversation
  set updated_at = now()
  where conversation.id = p_conversation_id;

  return v_post_id;
end;
$$;

revoke all on function public.create_circle_post(uuid, text, jsonb) from public;
grant execute on function public.create_circle_post(uuid, text, jsonb) to authenticated;

create or replace function public.get_circle_posts(
  p_conversation_id uuid,
  p_limit_count integer default 60,
  p_before timestamptz default now()
)
returns table (
  post_id uuid,
  conversation_id uuid,
  author_id uuid,
  author_name text,
  author_avatar text,
  caption text,
  media jsonb,
  comment_count bigint,
  can_edit boolean,
  created_at timestamptz,
  edited_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    post_row.id as post_id,
    post_row.conversation_id,
    post_row.author_id,
    author.display_name as author_name,
    author.avatar_url as author_avatar,
    post_row.caption,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', media_row.id,
          'storage_path', media_row.storage_path,
          'media_type', media_row.media_type,
          'width', media_row.width,
          'height', media_row.height,
          'duration_ms', media_row.duration_ms,
          'sort_order', media_row.sort_order,
          'created_at', media_row.created_at
        )
        order by media_row.sort_order
      )
      from public.conversation_post_media media_row
      where media_row.post_id = post_row.id
    ), '[]'::jsonb) as media,
    (
      select count(*)
      from public.conversation_post_comments comment_row
      where comment_row.post_id = post_row.id
    ) as comment_count,
    post_row.author_id = auth.uid() as can_edit,
    post_row.created_at,
    post_row.edited_at
  from public.conversation_posts post_row
  join public.users author on author.id = post_row.author_id
  where post_row.conversation_id = p_conversation_id
    and post_row.created_at < coalesce(p_before, now())
    and public.circle_posts_are_enabled(p_conversation_id, auth.uid())
  order by post_row.created_at desc
  limit greatest(1, least(coalesce(p_limit_count, 60), 120));
$$;

revoke all on function public.get_circle_posts(uuid, integer, timestamptz) from public;
grant execute on function public.get_circle_posts(uuid, integer, timestamptz) to authenticated;

create or replace function public.get_circle_post(p_post_id uuid)
returns table (
  post_id uuid,
  conversation_id uuid,
  author_id uuid,
  author_name text,
  author_avatar text,
  caption text,
  media jsonb,
  comment_count bigint,
  can_edit boolean,
  created_at timestamptz,
  edited_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    post_row.id as post_id,
    post_row.conversation_id,
    post_row.author_id,
    author.display_name as author_name,
    author.avatar_url as author_avatar,
    post_row.caption,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', media_row.id,
          'storage_path', media_row.storage_path,
          'media_type', media_row.media_type,
          'width', media_row.width,
          'height', media_row.height,
          'duration_ms', media_row.duration_ms,
          'sort_order', media_row.sort_order,
          'created_at', media_row.created_at
        )
        order by media_row.sort_order
      )
      from public.conversation_post_media media_row
      where media_row.post_id = post_row.id
    ), '[]'::jsonb) as media,
    (
      select count(*)
      from public.conversation_post_comments comment_row
      where comment_row.post_id = post_row.id
    ) as comment_count,
    post_row.author_id = auth.uid() as can_edit,
    post_row.created_at,
    post_row.edited_at
  from public.conversation_posts post_row
  join public.users author on author.id = post_row.author_id
  where post_row.id = p_post_id
    and public.circle_posts_are_enabled(post_row.conversation_id, auth.uid());
$$;

revoke all on function public.get_circle_post(uuid) from public;
grant execute on function public.get_circle_post(uuid) to authenticated;

create or replace function public.get_circle_post_comments(
  p_post_id uuid,
  p_limit_count integer default 100,
  p_before timestamptz default now()
)
returns table (
  comment_id uuid,
  post_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  body text,
  created_at timestamptz,
  edited_at timestamptz,
  can_delete boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    comment_row.id as comment_id,
    comment_row.post_id,
    comment_row.user_id,
    comment_user.display_name,
    comment_user.avatar_url,
    comment_row.body,
    comment_row.created_at,
    comment_row.edited_at,
    comment_row.user_id = auth.uid() as can_delete
  from public.conversation_post_comments comment_row
  join public.conversation_posts post_row on post_row.id = comment_row.post_id
  join public.users comment_user on comment_user.id = comment_row.user_id
  where comment_row.post_id = p_post_id
    and comment_row.created_at < coalesce(p_before, now())
    and public.circle_posts_are_enabled(post_row.conversation_id, auth.uid())
  order by comment_row.created_at asc
  limit greatest(1, least(coalesce(p_limit_count, 100), 300));
$$;

revoke all on function public.get_circle_post_comments(uuid, integer, timestamptz) from public;
grant execute on function public.get_circle_post_comments(uuid, integer, timestamptz) to authenticated;

create or replace function public.add_circle_post_comment(
  p_post_id uuid,
  p_body text
)
returns table (
  comment_id uuid,
  post_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  body text,
  created_at timestamptz,
  edited_at timestamptz,
  can_delete boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_conversation_id uuid;
  v_comment_id uuid;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if length(v_body) < 1 or length(v_body) > 1000 then
    raise exception 'Comments must be between 1 and 1000 characters';
  end if;

  select post_row.conversation_id
  into v_conversation_id
  from public.conversation_posts post_row
  where post_row.id = p_post_id;

  if v_conversation_id is null
     or not public.circle_posts_are_enabled(v_conversation_id, v_viewer_id) then
    raise exception 'Circle post not found or unavailable';
  end if;

  insert into public.conversation_post_comments (post_id, user_id, body)
  values (p_post_id, v_viewer_id, v_body)
  returning id into v_comment_id;

  return query
  select
    comment_row.id,
    comment_row.post_id,
    comment_row.user_id,
    comment_user.display_name,
    comment_user.avatar_url,
    comment_row.body,
    comment_row.created_at,
    comment_row.edited_at,
    true
  from public.conversation_post_comments comment_row
  join public.users comment_user on comment_user.id = comment_row.user_id
  where comment_row.id = v_comment_id;
end;
$$;

revoke all on function public.add_circle_post_comment(uuid, text) from public;
grant execute on function public.add_circle_post_comment(uuid, text) to authenticated;

create or replace function public.delete_own_circle_post_comment(
  p_comment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.conversation_post_comments comment_row
  where comment_row.id = p_comment_id
    and comment_row.user_id = auth.uid();

  if not found then
    raise exception 'Comment not found or not owned by you';
  end if;
end;
$$;

revoke all on function public.delete_own_circle_post_comment(uuid) from public;
grant execute on function public.delete_own_circle_post_comment(uuid) to authenticated;

create or replace function public.update_own_circle_post_caption(
  p_post_id uuid,
  p_caption text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caption text := nullif(trim(coalesce(p_caption, '')), '');
  v_conversation_id uuid;
begin
  if v_caption is not null and length(v_caption) > 2200 then
    raise exception 'Circle post captions must be 2200 characters or fewer';
  end if;

  update public.conversation_posts post_row
  set
    caption = v_caption,
    updated_at = now(),
    edited_at = now()
  where post_row.id = p_post_id
    and post_row.author_id = auth.uid()
  returning post_row.conversation_id into v_conversation_id;

  if not found then
    raise exception 'Circle post not found or not owned by you';
  end if;

  update public.conversations conversation
  set updated_at = now()
  where conversation.id = v_conversation_id;
end;
$$;

revoke all on function public.update_own_circle_post_caption(uuid, text) from public;
grant execute on function public.update_own_circle_post_caption(uuid, text) to authenticated;

create or replace function public.delete_own_circle_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_conversation_id uuid;
  v_paths text[];
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select
    post_row.conversation_id,
    coalesce(
      array_agg(media_row.storage_path)
        filter (where media_row.storage_path is not null),
      array[]::text[]
    )
  into v_conversation_id, v_paths
  from public.conversation_posts post_row
  left join public.conversation_post_media media_row
    on media_row.post_id = post_row.id
  where post_row.id = p_post_id
    and post_row.author_id = v_viewer_id
  group by post_row.id;

  if v_conversation_id is null then
    raise exception 'Circle post not found or not owned by you';
  end if;

  delete from public.conversation_posts post_row
  where post_row.id = p_post_id
    and post_row.author_id = v_viewer_id;

  update public.conversations conversation
  set updated_at = now()
  where conversation.id = v_conversation_id;

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'storage_paths', to_jsonb(v_paths)
  );
end;
$$;

revoke all on function public.delete_own_circle_post(uuid) from public;
grant execute on function public.delete_own_circle_post(uuid) to authenticated;

-- Replace the details payload so the profile's Posts count is authoritative.
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
      'post_count', (
        select count(*)
        from public.conversation_posts post_row
        where post_row.conversation_id = conversation.id
      )
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

-- Post and comment changes update private Circle profiles in Realtime.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'conversation_posts'
    ) then
      alter publication supabase_realtime add table public.conversation_posts;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'conversation_post_media'
    ) then
      alter publication supabase_realtime add table public.conversation_post_media;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'conversation_post_comments'
    ) then
      alter publication supabase_realtime add table public.conversation_post_comments;
    end if;
  end if;
end;
$$;

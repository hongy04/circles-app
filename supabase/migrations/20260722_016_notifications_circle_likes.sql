-- Circles Step 9E — in-app notifications, member-specific preferences,
-- per-conversation mute controls, and private likes on Circle posts.
--
-- Important product rule:
-- Muting quiets alert badges and future activity alerts. It does not hide or
-- erase unread messages, posts, comments, likes, invitations, or shared history.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Member-specific conversation notification preferences
-- ---------------------------------------------------------------------------

alter table public.conversation_members
  add column if not exists notifications_muted boolean not null default false;

alter table public.conversation_members
  add column if not exists notifications_muted_until timestamptz;

alter table public.conversation_members
  add column if not exists notify_messages boolean not null default true;

alter table public.conversation_members
  add column if not exists notify_circle_posts boolean not null default true;

alter table public.conversation_members
  add column if not exists notify_circle_interactions boolean not null default true;

create or replace function public.conversation_alerts_are_muted(
  p_conversation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      member_row.notifications_muted
      and (
        member_row.notifications_muted_until is null
        or member_row.notifications_muted_until > now()
      )
    from public.conversation_members member_row
    where member_row.conversation_id = p_conversation_id
      and member_row.user_id = p_user_id
  ), false);
$$;

revoke all on function public.conversation_alerts_are_muted(uuid, uuid) from public;
grant execute on function public.conversation_alerts_are_muted(uuid, uuid) to authenticated;

create or replace function public.get_conversation_notification_settings(
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
  v_result jsonb;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select jsonb_build_object(
    'conversation_id', conversation.id,
    'kind', conversation.kind,
    'is_circle', (conversation.kind = 'group' or conversation.circle_enabled),
    'title', case
      when conversation.kind = 'direct' and not conversation.circle_enabled
        then coalesce(other_user.display_name, 'Connection')
      else coalesce(nullif(trim(conversation.title), ''), 'Private Circle')
    end,
    'is_muted', (
      membership.notifications_muted
      and (
        membership.notifications_muted_until is null
        or membership.notifications_muted_until > now()
      )
    ),
    'muted_until', case
      when membership.notifications_muted
       and membership.notifications_muted_until > now()
        then membership.notifications_muted_until
      else null
    end,
    'muted_forever', (
      membership.notifications_muted
      and membership.notifications_muted_until is null
    ),
    'notify_messages', membership.notify_messages,
    'notify_circle_posts', membership.notify_circle_posts,
    'notify_circle_interactions', membership.notify_circle_interactions
  )
  into v_result
  from public.conversations conversation
  join public.conversation_members membership
    on membership.conversation_id = conversation.id
   and membership.user_id = v_viewer_id
  left join lateral (
    select user_row.display_name
    from public.conversation_members other_member
    join public.users user_row on user_row.id = other_member.user_id
    where other_member.conversation_id = conversation.id
      and other_member.user_id <> v_viewer_id
    order by other_member.joined_at
    limit 1
  ) other_user on true
  where conversation.id = p_conversation_id;

  if v_result is null then
    raise exception 'You are not a member of this private conversation';
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_conversation_notification_settings(uuid) from public;
grant execute on function public.get_conversation_notification_settings(uuid) to authenticated;

create or replace function public.set_conversation_mute(
  p_conversation_id uuid,
  p_duration text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_duration text := lower(trim(coalesce(p_duration, '')));
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_duration not in ('off', '1_hour', '8_hours', '1_week', 'forever') then
    raise exception 'Unsupported mute duration';
  end if;

  update public.conversation_members member_row
  set
    notifications_muted = v_duration <> 'off',
    notifications_muted_until = case v_duration
      when 'off' then null
      when '1_hour' then now() + interval '1 hour'
      when '8_hours' then now() + interval '8 hours'
      when '1_week' then now() + interval '7 days'
      when 'forever' then null
    end
  where member_row.conversation_id = p_conversation_id
    and member_row.user_id = v_viewer_id;

  if not found then
    raise exception 'You are not a member of this private conversation';
  end if;

  return public.get_conversation_notification_settings(p_conversation_id);
end;
$$;

revoke all on function public.set_conversation_mute(uuid, text) from public;
grant execute on function public.set_conversation_mute(uuid, text) to authenticated;

create or replace function public.update_conversation_notification_preferences(
  p_conversation_id uuid,
  p_notify_messages boolean,
  p_notify_circle_posts boolean,
  p_notify_circle_interactions boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.conversation_members member_row
  set
    notify_messages = coalesce(p_notify_messages, member_row.notify_messages),
    notify_circle_posts = coalesce(
      p_notify_circle_posts,
      member_row.notify_circle_posts
    ),
    notify_circle_interactions = coalesce(
      p_notify_circle_interactions,
      member_row.notify_circle_interactions
    )
  where member_row.conversation_id = p_conversation_id
    and member_row.user_id = v_viewer_id;

  if not found then
    raise exception 'You are not a member of this private conversation';
  end if;

  return public.get_conversation_notification_settings(p_conversation_id);
end;
$$;

revoke all on function public.update_conversation_notification_preferences(uuid, boolean, boolean, boolean) from public;
grant execute on function public.update_conversation_notification_preferences(uuid, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Private Circle post likes
-- ---------------------------------------------------------------------------

create table if not exists public.conversation_post_likes (
  post_id uuid not null references public.conversation_posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists conversation_post_likes_user_index
  on public.conversation_post_likes (user_id, created_at desc);

alter table public.conversation_post_likes enable row level security;

drop policy if exists "Circle members can view Circle post likes"
  on public.conversation_post_likes;
create policy "Circle members can view Circle post likes"
on public.conversation_post_likes
for select
to authenticated
using (
  exists (
    select 1
    from public.conversation_posts post_row
    where post_row.id = conversation_post_likes.post_id
      and public.circle_posts_are_enabled(
        post_row.conversation_id,
        auth.uid()
      )
  )
);

drop policy if exists "Circle members can like Circle posts"
  on public.conversation_post_likes;
create policy "Circle members can like Circle posts"
on public.conversation_post_likes
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.conversation_posts post_row
    where post_row.id = conversation_post_likes.post_id
      and public.circle_posts_are_enabled(
        post_row.conversation_id,
        auth.uid()
      )
  )
);

drop policy if exists "Members can remove their own Circle post likes"
  on public.conversation_post_likes;
create policy "Members can remove their own Circle post likes"
on public.conversation_post_likes
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.toggle_circle_post_like(p_post_id uuid)
returns table (
  liked boolean,
  like_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_conversation_id uuid;
  v_rows integer;
  v_liked boolean;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select post_row.conversation_id
  into v_conversation_id
  from public.conversation_posts post_row
  where post_row.id = p_post_id;

  if v_conversation_id is null
     or not public.circle_posts_are_enabled(v_conversation_id, v_viewer_id) then
    raise exception 'Circle post not found or unavailable';
  end if;

  insert into public.conversation_post_likes (post_id, user_id)
  values (p_post_id, v_viewer_id)
  on conflict (post_id, user_id) do nothing;

  get diagnostics v_rows = row_count;

  if v_rows = 1 then
    v_liked := true;
  else
    delete from public.conversation_post_likes like_row
    where like_row.post_id = p_post_id
      and like_row.user_id = v_viewer_id;
    v_liked := false;
  end if;

  return query
  select
    v_liked,
    count(*)
  from public.conversation_post_likes like_row
  where like_row.post_id = p_post_id;
end;
$$;

revoke all on function public.toggle_circle_post_like(uuid) from public;
grant execute on function public.toggle_circle_post_like(uuid) to authenticated;

-- Add authoritative like state to Circle post reads. A return-table shape change
-- requires DROP + CREATE rather than CREATE OR REPLACE.
drop function if exists public.get_circle_posts(uuid, integer, timestamptz);

create function public.get_circle_posts(
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
  like_count bigint,
  liked_by_me boolean,
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
    (
      select count(*)
      from public.conversation_post_likes like_row
      where like_row.post_id = post_row.id
    ) as like_count,
    exists (
      select 1
      from public.conversation_post_likes like_row
      where like_row.post_id = post_row.id
        and like_row.user_id = auth.uid()
    ) as liked_by_me,
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

drop function if exists public.get_circle_post(uuid);

create function public.get_circle_post(p_post_id uuid)
returns table (
  post_id uuid,
  conversation_id uuid,
  author_id uuid,
  author_name text,
  author_avatar text,
  caption text,
  media jsonb,
  comment_count bigint,
  like_count bigint,
  liked_by_me boolean,
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
    (
      select count(*)
      from public.conversation_post_likes like_row
      where like_row.post_id = post_row.id
    ) as like_count,
    exists (
      select 1
      from public.conversation_post_likes like_row
      where like_row.post_id = post_row.id
        and like_row.user_id = auth.uid()
    ) as liked_by_me,
    post_row.author_id = auth.uid() as can_edit,
    post_row.created_at,
    post_row.edited_at
  from public.conversation_posts post_row
  join public.users author on author.id = post_row.author_id
  where post_row.id = p_post_id
    and public.circle_posts_are_enabled(
      post_row.conversation_id,
      auth.uid()
    );
$$;

revoke all on function public.get_circle_post(uuid) from public;
grant execute on function public.get_circle_post(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Private in-app notification center
-- ---------------------------------------------------------------------------

create table if not exists public.circle_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  notification_type text not null check (
    notification_type in (
      'conversation_invitation',
      'circle_post',
      'circle_comment',
      'circle_like'
    )
  ),
  post_id uuid references public.conversation_posts(id) on delete cascade,
  comment_id uuid references public.conversation_post_comments(id) on delete cascade,
  invitation_id uuid references public.conversation_invitations(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists circle_notifications_user_created_index
  on public.circle_notifications (user_id, created_at desc);

create index if not exists circle_notifications_user_unread_index
  on public.circle_notifications (user_id, created_at desc)
  where read_at is null;

create unique index if not exists circle_notifications_post_unique
  on public.circle_notifications (user_id, notification_type, post_id)
  where notification_type = 'circle_post';

create unique index if not exists circle_notifications_comment_unique
  on public.circle_notifications (user_id, notification_type, comment_id)
  where notification_type = 'circle_comment';

create unique index if not exists circle_notifications_like_unique
  on public.circle_notifications (
    user_id,
    notification_type,
    post_id,
    actor_id
  )
  where notification_type = 'circle_like';

create unique index if not exists circle_notifications_invitation_unique
  on public.circle_notifications (
    user_id,
    notification_type,
    invitation_id
  )
  where notification_type = 'conversation_invitation';

alter table public.circle_notifications enable row level security;

drop policy if exists "Users can view their own Circle notifications"
  on public.circle_notifications;
create policy "Users can view their own Circle notifications"
on public.circle_notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can update their own Circle notifications"
  on public.circle_notifications;
create policy "Users can update their own Circle notifications"
on public.circle_notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete their own Circle notifications"
  on public.circle_notifications;
create policy "Users can delete their own Circle notifications"
on public.circle_notifications
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.notify_circle_post_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.circle_notifications (
    user_id,
    conversation_id,
    actor_id,
    notification_type,
    post_id,
    created_at
  )
  select
    member_row.user_id,
    new.conversation_id,
    new.author_id,
    'circle_post',
    new.id,
    new.created_at
  from public.conversation_members member_row
  where member_row.conversation_id = new.conversation_id
    and member_row.user_id <> new.author_id
    and member_row.notify_circle_posts
    and not public.conversation_alerts_are_muted(
      new.conversation_id,
      member_row.user_id
    )
  on conflict do nothing;

  return new;
end;
$$;

create or replace function public.notify_circle_comment_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.conversation_posts%rowtype;
  v_notify boolean;
begin
  select post_row.*
  into v_post
  from public.conversation_posts post_row
  where post_row.id = new.post_id;

  if v_post.id is null or v_post.author_id = new.user_id then
    return new;
  end if;

  select member_row.notify_circle_interactions
  into v_notify
  from public.conversation_members member_row
  where member_row.conversation_id = v_post.conversation_id
    and member_row.user_id = v_post.author_id;

  if coalesce(v_notify, false)
     and not public.conversation_alerts_are_muted(
       v_post.conversation_id,
       v_post.author_id
     ) then
    insert into public.circle_notifications (
      user_id,
      conversation_id,
      actor_id,
      notification_type,
      post_id,
      comment_id,
      created_at
    )
    values (
      v_post.author_id,
      v_post.conversation_id,
      new.user_id,
      'circle_comment',
      new.post_id,
      new.id,
      new.created_at
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.notify_circle_like_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.conversation_posts%rowtype;
  v_notify boolean;
  v_like public.conversation_post_likes%rowtype;
begin
  if tg_op = 'DELETE' then
    v_like := old;
  else
    v_like := new;
  end if;

  select post_row.*
  into v_post
  from public.conversation_posts post_row
  where post_row.id = v_like.post_id;

  if v_post.id is null or v_post.author_id = v_like.user_id then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    delete from public.circle_notifications notification_row
    where notification_row.user_id = v_post.author_id
      and notification_row.notification_type = 'circle_like'
      and notification_row.post_id = v_like.post_id
      and notification_row.actor_id = v_like.user_id;
    return old;
  end if;

  select member_row.notify_circle_interactions
  into v_notify
  from public.conversation_members member_row
  where member_row.conversation_id = v_post.conversation_id
    and member_row.user_id = v_post.author_id;

  if coalesce(v_notify, false)
     and not public.conversation_alerts_are_muted(
       v_post.conversation_id,
       v_post.author_id
     ) then
    insert into public.circle_notifications (
      user_id,
      conversation_id,
      actor_id,
      notification_type,
      post_id,
      created_at
    )
    values (
      v_post.author_id,
      v_post.conversation_id,
      v_like.user_id,
      'circle_like',
      v_like.post_id,
      v_like.created_at
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.notify_conversation_invitation_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    insert into public.circle_notifications (
      user_id,
      conversation_id,
      actor_id,
      notification_type,
      invitation_id,
      created_at
    )
    values (
      new.invited_user_id,
      new.conversation_id,
      new.invited_by,
      'conversation_invitation',
      new.id,
      new.created_at
    )
    on conflict do nothing;
  else
    update public.circle_notifications notification_row
    set read_at = coalesce(notification_row.read_at, now())
    where notification_row.invitation_id = new.id
      and notification_row.user_id = new.invited_user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists circle_posts_create_notification
  on public.conversation_posts;
create trigger circle_posts_create_notification
after insert on public.conversation_posts
for each row
execute function public.notify_circle_post_created();

drop trigger if exists circle_comments_create_notification
  on public.conversation_post_comments;
create trigger circle_comments_create_notification
after insert on public.conversation_post_comments
for each row
execute function public.notify_circle_comment_created();

drop trigger if exists circle_likes_create_notification
  on public.conversation_post_likes;
create trigger circle_likes_create_notification
after insert or delete on public.conversation_post_likes
for each row
execute function public.notify_circle_like_changed();

drop trigger if exists conversation_invitations_create_notification
  on public.conversation_invitations;
create trigger conversation_invitations_create_notification
after insert or update of status on public.conversation_invitations
for each row
execute function public.notify_conversation_invitation_changed();

-- Existing pending invitations become visible in the new notification center.
insert into public.circle_notifications (
  user_id,
  conversation_id,
  actor_id,
  notification_type,
  invitation_id,
  created_at
)
select
  invitation.invited_user_id,
  invitation.conversation_id,
  invitation.invited_by,
  'conversation_invitation',
  invitation.id,
  invitation.created_at
from public.conversation_invitations invitation
where invitation.status = 'pending'
on conflict do nothing;

create or replace function public.get_my_circle_notifications(
  p_limit_count integer default 100,
  p_before timestamptz default now()
)
returns table (
  notification_id uuid,
  notification_type text,
  conversation_id uuid,
  conversation_title text,
  actor_id uuid,
  actor_name text,
  actor_avatar text,
  post_id uuid,
  comment_id uuid,
  invitation_id uuid,
  created_at timestamptz,
  read_at timestamptz,
  is_read boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    notification.id as notification_id,
    notification.notification_type,
    notification.conversation_id,
    coalesce(
      nullif(trim(conversation.title), ''),
      case
        when conversation.kind = 'direct' then 'Private conversation'
        else 'Private Circle'
      end
    ) as conversation_title,
    notification.actor_id,
    coalesce(actor.display_name, 'A Circle member') as actor_name,
    actor.avatar_url as actor_avatar,
    notification.post_id,
    notification.comment_id,
    notification.invitation_id,
    notification.created_at,
    notification.read_at,
    notification.read_at is not null as is_read
  from public.circle_notifications notification
  left join public.conversations conversation
    on conversation.id = notification.conversation_id
  left join public.users actor
    on actor.id = notification.actor_id
  where notification.user_id = auth.uid()
    and notification.created_at < coalesce(p_before, now())
  order by notification.created_at desc
  limit greatest(1, least(coalesce(p_limit_count, 100), 300));
$$;

revoke all on function public.get_my_circle_notifications(integer, timestamptz) from public;
grant execute on function public.get_my_circle_notifications(integer, timestamptz) to authenticated;

create or replace function public.get_my_circle_notification_unread_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.circle_notifications notification_row
  where notification_row.user_id = auth.uid()
    and notification_row.read_at is null;
$$;

revoke all on function public.get_my_circle_notification_unread_count() from public;
grant execute on function public.get_my_circle_notification_unread_count() to authenticated;

create or replace function public.mark_circle_notification_read(
  p_notification_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.circle_notifications notification_row
  set read_at = coalesce(notification_row.read_at, now())
  where notification_row.id = p_notification_id
    and notification_row.user_id = auth.uid();

  if not found then
    raise exception 'Notification not found';
  end if;
end;
$$;

revoke all on function public.mark_circle_notification_read(uuid) from public;
grant execute on function public.mark_circle_notification_read(uuid) to authenticated;

create or replace function public.mark_all_circle_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.circle_notifications notification_row
  set read_at = now()
  where notification_row.user_id = auth.uid()
    and notification_row.read_at is null;
$$;

revoke all on function public.mark_all_circle_notifications_read() from public;
grant execute on function public.mark_all_circle_notifications_read() to authenticated;

create or replace function public.get_my_notification_badge_count()
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_unread_messages bigint := 0;
  v_pending_invitations bigint := 0;
  v_unread_activity bigint := 0;
begin
  if v_viewer_id is null then
    return 0;
  end if;

  select count(*)
  into v_unread_messages
  from public.messages message_row
  join public.conversation_members membership
    on membership.conversation_id = message_row.conversation_id
   and membership.user_id = v_viewer_id
  where message_row.sender_id <> v_viewer_id
    and message_row.created_at > membership.last_read_at
    and membership.notify_messages
    and not (
      membership.notifications_muted
      and (
        membership.notifications_muted_until is null
        or membership.notifications_muted_until > now()
      )
    );

  select count(*)
  into v_pending_invitations
  from public.conversation_invitations invitation
  where invitation.invited_user_id = v_viewer_id
    and invitation.status = 'pending';

  select count(*)
  into v_unread_activity
  from public.circle_notifications notification
  left join public.conversation_members membership
    on membership.conversation_id = notification.conversation_id
   and membership.user_id = v_viewer_id
  where notification.user_id = v_viewer_id
    and notification.read_at is null
    and notification.notification_type <> 'conversation_invitation'
    and not coalesce(
      membership.notifications_muted
      and (
        membership.notifications_muted_until is null
        or membership.notifications_muted_until > now()
      ),
      false
    );

  return coalesce(v_unread_messages, 0)
    + coalesce(v_pending_invitations, 0)
    + coalesce(v_unread_activity, 0);
end;
$$;

revoke all on function public.get_my_notification_badge_count() from public;
grant execute on function public.get_my_notification_badge_count() to authenticated;

-- Add mute state to inbox rows. The function return shape changes, so DROP is
-- required before recreating it.
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
  notifications_muted boolean,
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
      membership.is_pinned,
      membership.notifications_muted,
      membership.notifications_muted_until
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
      mine.notifications_muted
      and (
        mine.notifications_muted_until is null
        or mine.notifications_muted_until > now()
      )
    ) as notifications_muted,
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

-- Make new activity visible to clients through authenticated Realtime RLS.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'conversation_post_likes'
    ) then
      alter publication supabase_realtime add table public.conversation_post_likes;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'circle_notifications'
    ) then
      alter publication supabase_realtime add table public.circle_notifications;
    end if;
  end if;
end;
$$;

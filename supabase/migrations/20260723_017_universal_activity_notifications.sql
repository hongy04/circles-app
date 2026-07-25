-- Circles Step 9E.1
-- Universal in-app activity notifications for both personal posts and
-- private Circle posts.
--
-- This migration intentionally keeps the existing circle_notifications table
-- name so Step 9E clients and existing notification history remain intact.
-- The table becomes the app's universal private activity stream.

begin;

-- ---------------------------------------------------------------------------
-- Extend the existing private notification record for personal-post targets.
-- ---------------------------------------------------------------------------

alter table public.circle_notifications
  add column if not exists personal_post_id uuid
    references public.posts(id) on delete cascade;

alter table public.circle_notifications
  add column if not exists personal_comment_id uuid
    references public.post_comments(id) on delete cascade;

-- The original Step 9E check accepted only Circle activity. Drop whichever
-- notification_type check is currently installed, then recreate one that also
-- accepts personal post likes and comments.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select constraint_info.conname
    from pg_constraint constraint_info
    where constraint_info.conrelid = 'public.circle_notifications'::regclass
      and constraint_info.contype = 'c'
      and pg_get_constraintdef(constraint_info.oid) ilike '%notification_type%'
  loop
    execute format(
      'alter table public.circle_notifications drop constraint %I',
      constraint_row.conname
    );
  end loop;
end;
$$;

alter table public.circle_notifications
  add constraint circle_notifications_notification_type_check
  check (
    notification_type in (
      'conversation_invitation',
      'circle_post',
      'circle_comment',
      'circle_like',
      'personal_comment',
      'personal_like'
    )
  );

create index if not exists circle_notifications_personal_post_index
  on public.circle_notifications (personal_post_id, created_at desc)
  where personal_post_id is not null;

create unique index if not exists circle_notifications_personal_comment_unique
  on public.circle_notifications (
    user_id,
    notification_type,
    personal_comment_id
  )
  where notification_type = 'personal_comment';

create unique index if not exists circle_notifications_personal_like_unique
  on public.circle_notifications (
    user_id,
    notification_type,
    personal_post_id,
    actor_id
  )
  where notification_type = 'personal_like';

-- ---------------------------------------------------------------------------
-- Personal post interaction triggers.
-- ---------------------------------------------------------------------------

create or replace function public.notify_personal_comment_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_owner_id uuid;
begin
  select post_row.user_id
  into post_owner_id
  from public.posts post_row
  where post_row.id = new.post_id;

  -- The author's own comment is part of the post, not an alert to themselves.
  if post_owner_id is null or post_owner_id = new.user_id then
    return new;
  end if;

  insert into public.circle_notifications (
    user_id,
    actor_id,
    notification_type,
    personal_post_id,
    personal_comment_id,
    created_at
  )
  values (
    post_owner_id,
    new.user_id,
    'personal_comment',
    new.post_id,
    new.id,
    coalesce(new.created_at, now())
  )
  on conflict do nothing;

  return new;
end;
$$;

create or replace function public.notify_personal_like_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  like_row public.post_likes%rowtype;
  post_owner_id uuid;
begin
  if tg_op = 'DELETE' then
    like_row := old;
  else
    like_row := new;
  end if;

  select post_row.user_id
  into post_owner_id
  from public.posts post_row
  where post_row.id = like_row.post_id;

  if post_owner_id is null or post_owner_id = like_row.user_id then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- Authentic state: an unlike removes the corresponding unread/read activity
  -- record rather than preserving an event that is no longer true.
  if tg_op = 'DELETE' then
    delete from public.circle_notifications notification_row
    where notification_row.user_id = post_owner_id
      and notification_row.notification_type = 'personal_like'
      and notification_row.personal_post_id = like_row.post_id
      and notification_row.actor_id = like_row.user_id;

    return old;
  end if;

  insert into public.circle_notifications (
    user_id,
    actor_id,
    notification_type,
    personal_post_id,
    created_at
  )
  values (
    post_owner_id,
    like_row.user_id,
    'personal_like',
    like_row.post_id,
    now()
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists personal_comments_create_notification
  on public.post_comments;
create trigger personal_comments_create_notification
after insert on public.post_comments
for each row
execute function public.notify_personal_comment_created();

drop trigger if exists personal_likes_create_notification
  on public.post_likes;
create trigger personal_likes_create_notification
after insert or delete on public.post_likes
for each row
execute function public.notify_personal_like_changed();

-- ---------------------------------------------------------------------------
-- Generic notification-center RPCs.
-- Existing Step 9E Circle-named RPCs remain available for older clients.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_notifications(
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
  circle_post_id uuid,
  circle_comment_id uuid,
  personal_post_id uuid,
  personal_comment_id uuid,
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
    case
      when notification.conversation_id is null then null
      else coalesce(
        nullif(trim(conversation.title), ''),
        case
          when conversation.kind = 'direct' then 'Private conversation'
          else 'Private Circle'
        end
      )
    end as conversation_title,
    notification.actor_id,
    coalesce(actor.display_name, 'Someone') as actor_name,
    actor.avatar_url as actor_avatar,
    notification.post_id as circle_post_id,
    notification.comment_id as circle_comment_id,
    notification.personal_post_id,
    notification.personal_comment_id,
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

revoke all on function public.get_my_notifications(integer, timestamptz)
  from public;
grant execute on function public.get_my_notifications(integer, timestamptz)
  to authenticated;

create or replace function public.get_my_notification_unread_count()
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

revoke all on function public.get_my_notification_unread_count()
  from public;
grant execute on function public.get_my_notification_unread_count()
  to authenticated;

create or replace function public.mark_notification_read(
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

revoke all on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid)
  to authenticated;

create or replace function public.mark_all_notifications_read()
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

revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read()
  to authenticated;

-- get_my_notification_badge_count() from Step 9E already counts every unread
-- activity row. Personal notifications have no conversation_id, so they are
-- included without being affected by a Circle-specific mute setting.

commit;

-- Circles Phase 9B — account deletion and anonymized shared-history preservation
--
-- The Auth identity is removed by the account-deletion Edge Function. This
-- migration performs the transactional database cleanup first, removes private
-- and user-authored content, closes direct/two-person spaces, and leaves only a
-- non-login "Deleted account" tombstone where shared factual or safety history
-- still needs a stable foreign key.

create extension if not exists pgcrypto;

create table if not exists public.account_deletion_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'processing' check (
    status in ('processing', 'database_complete', 'complete', 'failed')
  ),
  storage_manifest jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 1,
  started_at timestamptz not null default now(),
  database_completed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create unique index if not exists account_deletion_receipts_user_unique
  on public.account_deletion_receipts (user_id);

alter table public.account_deletion_receipts enable row level security;
revoke all on table public.account_deletion_receipts from public, anon, authenticated;
grant select, insert, update on table public.account_deletion_receipts to service_role;

alter table public.users
  add column if not exists deleted_at timestamptz;

alter table public.users
  add column if not exists deletion_receipt_id uuid;

-- A deleted Auth identity must not cascade-delete the anonymized public
-- tombstone or the shared rows that still reference it. Remove only foreign
-- keys from public.users to auth.users; all other user constraints remain.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select constraint_record.conname
    from pg_constraint constraint_record
    where constraint_record.contype = 'f'
      and constraint_record.conrelid = 'public.users'::regclass
      and constraint_record.confrelid = 'auth.users'::regclass
  loop
    execute format(
      'alter table public.users drop constraint %I',
      constraint_row.conname
    );
  end loop;
end;
$$;

create or replace function public.enforce_live_user_auth_identity()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.deleted_at is null
    and not exists (
      select 1 from auth.users auth_user where auth_user.id = new.id
    ) then
    raise exception 'A live Circles profile requires an Auth identity';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_live_user_auth_identity() from public;

drop trigger if exists users_require_live_auth_identity on public.users;
create trigger users_require_live_auth_identity
before insert or update of deleted_at on public.users
for each row execute function public.enforce_live_user_auth_identity();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_deletion_receipt_fk'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_deletion_receipt_fk
      foreign key (deletion_receipt_id)
      references public.account_deletion_receipts(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists users_deleted_at_index
  on public.users (deleted_at)
  where deleted_at is not null;

alter table public.conversations
  add column if not exists closed_at timestamptz;

alter table public.conversations
  add column if not exists closed_reason text;

alter table public.conversations
  drop constraint if exists conversations_closed_reason_check;

alter table public.conversations
  add constraint conversations_closed_reason_check check (
    closed_reason is null or closed_reason in ('account_deleted')
  );

create or replace function public.account_is_deleted(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is null
    or exists (
      select 1
      from public.users user_row
      where user_row.id = p_user_id
        and user_row.deleted_at is not null
    );
$$;

revoke all on function public.account_is_deleted(uuid) from public;
grant execute on function public.account_is_deleted(uuid) to authenticated, service_role;

-- Deleted identities must not regain conversation access even if an Auth retry
-- leaves the session alive briefly. Remaining members keep read access.
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
    and not public.account_is_deleted(p_user_id)
    and exists (
      select 1
      from public.conversation_members member_row
      where member_row.conversation_id = p_conversation_id
        and member_row.user_id = p_user_id
    );
$$;

revoke all on function public.conversation_is_member(uuid, uuid) from public;
grant execute on function public.conversation_is_member(uuid, uuid) to authenticated;

-- Prevent new relationship rows from targeting a deleted tombstone.
create or replace function public.reject_deleted_relationship_target()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'connection_requests' then
    if public.account_is_deleted(new.from_user)
      or public.account_is_deleted(new.to_user) then
      raise exception 'This account is unavailable';
    end if;
  elsif tg_table_name = 'connections' then
    if public.account_is_deleted(new.user_id)
      or public.account_is_deleted(new.other_user_id) then
      raise exception 'This account is unavailable';
    end if;
  elsif tg_table_name = 'conversation_invitations' then
    if public.account_is_deleted(new.invited_user_id)
      or public.account_is_deleted(new.invited_by) then
      raise exception 'This account is unavailable';
    end if;
  elsif tg_table_name = 'account_enforcements' then
    if public.account_is_deleted(new.user_id) then
      raise exception 'This account is unavailable';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.reject_deleted_relationship_target() from public;

drop trigger if exists connection_requests_reject_deleted
  on public.connection_requests;
create trigger connection_requests_reject_deleted
before insert or update on public.connection_requests
for each row execute function public.reject_deleted_relationship_target();

drop trigger if exists connections_reject_deleted
  on public.connections;
create trigger connections_reject_deleted
before insert or update on public.connections
for each row execute function public.reject_deleted_relationship_target();

drop trigger if exists conversation_invitations_reject_deleted
  on public.conversation_invitations;
create trigger conversation_invitations_reject_deleted
before insert or update on public.conversation_invitations
for each row execute function public.reject_deleted_relationship_target();

drop trigger if exists account_enforcements_reject_deleted
  on public.account_enforcements;
create trigger account_enforcements_reject_deleted
before insert or update of user_id on public.account_enforcements
for each row execute function public.reject_deleted_relationship_target();

create or replace function public.prepare_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  user_row public.users%rowtype;
  receipt_row public.account_deletion_receipts%rowtype;
  v_storage_manifest jsonb;
  group_row record;
  replacement_owner uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select *
  into user_row
  from public.users
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Account profile not found';
  end if;

  insert into public.account_deletion_receipts (
    user_id,
    status,
    attempt_count,
    last_error,
    updated_at
  )
  values (p_user_id, 'processing', 1, null, now())
  on conflict (user_id) do update
  set
    status = case
      when account_deletion_receipts.status = 'complete'
        then 'complete'
      else 'processing'
    end,
    attempt_count = account_deletion_receipts.attempt_count + 1,
    last_error = null,
    updated_at = now()
  returning * into receipt_row;

  if receipt_row.status = 'complete' then
    return jsonb_build_object(
      'receipt_id', receipt_row.id,
      'status', receipt_row.status,
      'storage_manifest', receipt_row.storage_manifest
    );
  end if;

  if user_row.deleted_at is not null then
    return jsonb_build_object(
      'receipt_id', receipt_row.id,
      'status', receipt_row.status,
      'storage_manifest', receipt_row.storage_manifest
    );
  end if;

  v_storage_manifest := jsonb_build_object(
    'folder_prefixes', jsonb_build_array(
      jsonb_build_object('bucket', 'avatars', 'prefix', p_user_id::text),
      jsonb_build_object('bucket', 'posts', 'prefix', p_user_id::text),
      jsonb_build_object('bucket', 'stories', 'prefix', p_user_id::text)
    ),
    'objects', jsonb_build_array(
      jsonb_build_object(
        'bucket', 'conversation-media',
        'paths', coalesce((
          select jsonb_agg(distinct path_value)
          from (
            select media_row.storage_path as path_value
            from public.message_media media_row
            join public.messages message_row on message_row.id = media_row.message_id
            where message_row.sender_id = p_user_id
            union
            select media_row.storage_path
            from public.conversation_post_media media_row
            join public.conversation_posts post_row on post_row.id = media_row.post_id
            where post_row.author_id = p_user_id
            union
            select conversation_row.avatar_path
            from public.conversations conversation_row
            where conversation_row.avatar_path like '%/avatars/' || p_user_id::text || '/%'
          ) paths
          where path_value is not null
        ), '[]'::jsonb)
      ),
      jsonb_build_object(
        'bucket', 'event-media',
        'paths', coalesce((
          select jsonb_agg(photo_row.storage_path)
          from public.event_photos photo_row
          where photo_row.uploaded_by = p_user_id
        ), '[]'::jsonb)
      ),
      jsonb_build_object(
        'bucket', 'two-person-album-media',
        'paths', coalesce((
          select jsonb_agg(photo_row.storage_path)
          from public.two_person_circle_album_photos photo_row
          where photo_row.uploaded_by = p_user_id
        ), '[]'::jsonb)
      )
    )
  );

  update public.account_deletion_receipts
  set storage_manifest = v_storage_manifest,
      updated_at = now()
  where id = receipt_row.id;

  -- Transfer ownership of ordinary group Circles before removing membership.
  for group_row in
    select member_row.conversation_id
    from public.conversation_members member_row
    join public.conversations conversation_row
      on conversation_row.id = member_row.conversation_id
    where member_row.user_id = p_user_id
      and member_row.role = 'owner'
      and conversation_row.kind = 'group'
  loop
    select member_row.user_id
    into replacement_owner
    from public.conversation_members member_row
    where member_row.conversation_id = group_row.conversation_id
      and member_row.user_id <> p_user_id
      and not public.account_is_deleted(member_row.user_id)
    order by
      case member_row.role when 'admin' then 0 else 1 end,
      member_row.joined_at asc
    limit 1;

    if replacement_owner is not null then
      update public.conversation_members
      set role = 'owner'
      where conversation_id = group_row.conversation_id
        and user_id = replacement_owner;
    end if;
  end loop;

  -- Direct chats and two-person Circles become preserved, read-only history.
  update public.conversations conversation_row
  set
    closed_at = coalesce(conversation_row.closed_at, now()),
    closed_reason = 'account_deleted',
    circle_locked_at = case
      when conversation_row.circle_enabled
        then coalesce(conversation_row.circle_locked_at, now())
      else conversation_row.circle_locked_at
    end,
    updated_at = now()
  where conversation_row.kind = 'direct'
    and exists (
      select 1
      from public.conversation_members member_row
      where member_row.conversation_id = conversation_row.id
        and member_row.user_id = p_user_id
    );

  update public.two_person_circle_access_periods period_row
  set closed_at = coalesce(period_row.closed_at, now())
  where period_row.closed_at is null
    and exists (
      select 1
      from public.conversation_members member_row
      where member_row.conversation_id = period_row.conversation_id
        and member_row.user_id = p_user_id
    );

  update public.two_person_circle_proposal_states proposal_row
  set
    status = case when proposal_row.conversation_id is not null then 'locked' else 'not_yet' end,
    next_proposer_id = null,
    responded_at = coalesce(proposal_row.responded_at, now()),
    updated_at = now()
  where proposal_row.user_low_id = p_user_id
     or proposal_row.user_high_id = p_user_id;

  -- Remove user-authored/private content. Shared event and plan facts remain,
  -- but author/uploader identity becomes the anonymized tombstone or NULL.
  delete from public.post_likes where user_id = p_user_id;
  delete from public.post_comments where user_id = p_user_id;
  delete from public.posts where user_id = p_user_id;
  delete from public.stories where user_id = p_user_id;

  delete from public.conversation_post_likes where user_id = p_user_id;
  delete from public.conversation_post_comments where user_id = p_user_id;
  delete from public.conversation_posts where author_id = p_user_id;
  delete from public.messages where sender_id = p_user_id;
  delete from public.two_person_circle_silent_messages where author_id = p_user_id;
  delete from public.two_person_circle_thoughts where author_id = p_user_id;
  delete from public.event_photos where uploaded_by = p_user_id;
  delete from public.two_person_circle_album_photos where uploaded_by = p_user_id;

  -- Remove active graph, discovery, invitation, RSVP, notification, and private
  -- relationship state associated with the deleted account.
  delete from public.connections
    where user_id = p_user_id or other_user_id = p_user_id;
  delete from public.connection_requests
    where from_user = p_user_id or to_user = p_user_id;
  delete from public.contact_edges
    where from_user = p_user_id or to_user = p_user_id;
  delete from public.contact_hashes where user_id = p_user_id;
  delete from public.user_blocks
    where blocker_id = p_user_id or blocked_id = p_user_id;

  delete from public.app_invite_redemptions where redeemer_id = p_user_id;
  delete from public.app_invites where inviter_id = p_user_id;
  delete from public.conversation_invitations
    where invited_user_id = p_user_id or invited_by = p_user_id;

  delete from public.romantic_visibility_overrides
    where owner_id = p_user_id or target_user_id = p_user_id;
  delete from public.romantic_interests
    where selector_id = p_user_id or target_user_id = p_user_id;
  delete from public.romantic_mutual_states
    where user_low_id = p_user_id or user_high_id = p_user_id;
  delete from public.romantic_focus_selections
    where selector_id = p_user_id or target_user_id = p_user_id;
  delete from public.romantic_focus_states
    where user_low_id = p_user_id or user_high_id = p_user_id;
  delete from public.romantic_focus_pauses where user_id = p_user_id;
  delete from public.romantic_preferences where user_id = p_user_id;

  delete from public.event_rsvps where user_id = p_user_id;
  delete from public.event_attendance where user_id = p_user_id;
  delete from public.event_repeat_signals where user_id = p_user_id;
  delete from public.event_availability_responses where user_id = p_user_id;
  delete from public.event_availability_votes where user_id = p_user_id;

  update public.event_guests
  set claimed_user_id = null
  where claimed_user_id = p_user_id;
  update public.events set host_id = null where host_id = p_user_id;
  update public.event_availability_polls set host_id = null where host_id = p_user_id;
  update public.event_circles set added_by = null where added_by = p_user_id;
  update public.event_guest_invitations
  set invited_by_user_id = null
  where invited_by_user_id = p_user_id;

  delete from public.circle_notifications where user_id = p_user_id;
  update public.circle_notifications set actor_id = null where actor_id = p_user_id;
  update public.app_analytics_events set actor_id = null where actor_id = p_user_id;

  delete from public.user_age_eligibility where user_id = p_user_id;
  delete from public.age_eligibility_correction_requests where user_id = p_user_id;
  delete from public.account_enforcement_appeals where user_id = p_user_id;
  delete from public.account_enforcements where user_id = p_user_id;
  delete from public.account_enforcement_history where user_id = p_user_id;
  delete from public.moderation_staff where user_id = p_user_id;

  update public.conversations
  set
    created_by = null,
    avatar_path = case
      when avatar_path like '%/avatars/' || p_user_id::text || '/%' then null
      else avatar_path
    end,
    avatar_url = case
      when avatar_path like '%/avatars/' || p_user_id::text || '/%' then null
      else avatar_url
    end
  where created_by = p_user_id
     or avatar_path like '%/avatars/' || p_user_id::text || '/%';

  delete from public.conversation_members where user_id = p_user_id;

  update public.users
  set
    display_name = 'Deleted account',
    username = null,
    avatar_url = null,
    bio = null,
    phone_hash = encode(digest('deleted:' || p_user_id::text, 'sha256'), 'hex'),
    mutual_preview_post_id = null,
    deleted_at = now(),
    deletion_receipt_id = receipt_row.id
  where id = p_user_id;

  update public.account_deletion_receipts
  set
    status = 'database_complete',
    database_completed_at = now(),
    updated_at = now()
  where id = receipt_row.id;

  return jsonb_build_object(
    'receipt_id', receipt_row.id,
    'status', 'database_complete',
    'storage_manifest', v_storage_manifest
  );
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

create or replace function public.finalize_account_deletion(
  p_receipt_id uuid,
  p_succeeded boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  update public.account_deletion_receipts
  set
    status = case when p_succeeded then 'complete' else 'failed' end,
    completed_at = case when p_succeeded then now() else completed_at end,
    last_error = case
      when p_succeeded then null
      else left(coalesce(p_error, 'Account deletion failed'), 500)
    end,
    updated_at = now()
  where id = p_receipt_id;
end;
$$;

revoke all on function public.finalize_account_deletion(uuid, boolean, text) from public;
grant execute on function public.finalize_account_deletion(uuid, boolean, text) to service_role;

-- Remaining members may read a closed direct history, but nobody can append.
create or replace function public.conversation_accepts_new_content(
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations conversation_row
    where conversation_row.id = p_conversation_id
      and conversation_row.closed_at is null
  );
$$;

revoke all on function public.conversation_accepts_new_content(uuid) from public;
grant execute on function public.conversation_accepts_new_content(uuid) to authenticated;

-- Guard direct table inserts as a final boundary for old clients. Existing RPC
-- membership checks remain in place; these triggers add the closed-space rule.
create or replace function public.reject_closed_conversation_content()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_conversation_id uuid;
begin
  if tg_table_name = 'messages' then
    target_conversation_id := new.conversation_id;
  elsif tg_table_name = 'conversation_posts' then
    target_conversation_id := new.conversation_id;
  else
    return new;
  end if;

  if not public.conversation_accepts_new_content(target_conversation_id) then
    raise exception 'This private space is closed';
  end if;

  return new;
end;
$$;

revoke all on function public.reject_closed_conversation_content() from public;

drop trigger if exists messages_reject_closed_conversation on public.messages;
create trigger messages_reject_closed_conversation
before insert on public.messages
for each row execute function public.reject_closed_conversation_content();

drop trigger if exists conversation_posts_reject_closed_conversation
  on public.conversation_posts;
create trigger conversation_posts_reject_closed_conversation
before insert on public.conversation_posts
for each row execute function public.reject_closed_conversation_content();

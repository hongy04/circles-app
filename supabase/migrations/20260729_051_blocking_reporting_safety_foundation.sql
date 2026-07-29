-- Circles Phase 8A — blocking and reporting safety foundation
--
-- Adds private user blocking, private abuse reports, server-enforced interaction
-- shutdown, and privacy-safe safety analytics. Blocking removes direct access
-- without erasing factual shared Circle/event history.

-- ---------------------------------------------------------------------------
-- Feature control and privacy-safe analytics allowlists
-- ---------------------------------------------------------------------------

alter table public.app_feature_flags
  drop constraint if exists app_feature_flags_key_check;

alter table public.app_feature_flags
  add constraint app_feature_flags_key_check check (
    flag_key in (
      'launch_invitations',
      'mutual_preview_posts',
      'preconnection_profile_shell',
      'launch_analytics',
      'circle_events',
      'event_availability_polls',
      'multi_circle_events',
      'event_outside_guests',
      'event_guest_web_rsvp',
      'event_photo_gallery',
      'event_history',
      'shared_event_connections',
      'guest_attendance_claims',
      'trusted_mutuals_ranking',
      'event_repeat_signals',
      'romantic_channel_beta',
      'romantic_interest_beta',
      'romantic_focus_beta',
      'two_person_circle_proposals',
      'two_person_circle_plans',
      'two_person_circle_important_dates',
      'two_person_circle_thoughts',
      'two_person_circle_albums',
      'two_person_plan_memory_links',
      'safety_blocking_reporting'
    )
  );

insert into public.app_feature_flags (
  flag_key,
  enabled,
  description
)
values (
  'safety_blocking_reporting',
  true,
  'Enables private blocking, blocked-account management, and private user reports.'
)
on conflict (flag_key) do update
set
  description = excluded.description,
  updated_at = now();

alter table public.app_analytics_events
  drop constraint if exists app_analytics_event_name_check;

alter table public.app_analytics_events
  add constraint app_analytics_event_name_check check (
    event_name in (
      'invite_created',
      'invite_share_opened',
      'invite_previewed',
      'invite_redeemed',
      'mutuals_opened',
      'mutual_preview_updated',
      'preconnection_profile_opened',
      'connection_request_sent',
      'connection_request_responded',
      'circle_member_invites_sent',
      'event_created',
      'event_opened',
      'event_rsvp_updated',
      'event_poll_created',
      'event_poll_opened',
      'event_poll_response_updated',
      'event_poll_finalized',
      'event_guest_added',
      'event_guest_response_updated',
      'event_guest_removed',
      'event_guest_settings_updated',
      'event_guest_invite_created',
      'event_guest_invite_opened',
      'event_guest_web_rsvp_updated',
      'event_photo_uploaded',
      'event_photo_removed',
      'event_photo_gallery_opened',
      'event_guest_photo_gallery_opened',
      'event_attendance_review_opened',
      'event_attendance_review_saved',
      'event_connections_opened',
      'event_connection_request_sent',
      'event_guest_account_claimed',
      'event_repeat_signal_updated',
      'event_repeat_plan_started',
      'romantic_settings_updated',
      'romantic_visibility_updated',
      'romantic_interest_updated',
      'romantic_interest_mutual_activated',
      'romantic_interest_revealed',
      'romantic_focus_updated',
      'romantic_focus_mutual_activated',
      'romantic_focus_revealed',
      'romantic_discovery_resumed',
      'two_person_circle_proposal_updated',
      'two_person_circle_activated',
      'two_person_plan_created',
      'two_person_plan_updated',
      'two_person_plan_response_updated',
      'two_person_plan_completed',
      'two_person_important_date_created',
      'two_person_important_date_updated',
      'two_person_important_date_removed',
      'two_person_thought_draft_created',
      'two_person_thought_draft_updated',
      'two_person_thought_shared',
      'two_person_thought_removed',
      'two_person_album_created',
      'two_person_album_updated',
      'two_person_album_removed',
      'two_person_album_photo_uploaded',
      'two_person_album_photo_removed',
      'two_person_plan_memory_album_updated',
      'two_person_plan_memory_post_updated',
      'safety_user_blocked',
      'safety_user_unblocked',
      'safety_user_reported'
    )
  );

-- ---------------------------------------------------------------------------
-- Private safety records
-- ---------------------------------------------------------------------------

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_different_people_check check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_index
  on public.user_blocks (blocked_id, created_at desc);

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  reported_user_id uuid not null references public.users(id) on delete cascade,
  reason text not null check (
    reason in (
      'harassment_or_bullying',
      'unwanted_romantic_contact',
      'impersonation',
      'spam_or_scam',
      'safety_concern',
      'other'
    )
  ),
  details text,
  source_context text not null default 'profile' check (
    source_context in ('profile', 'conversation', 'circle', 'event', 'other')
  ),
  status text not null default 'submitted' check (
    status in ('submitted', 'reviewing', 'resolved', 'dismissed')
  ),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  resolution_note text,
  constraint user_reports_different_people_check check (
    reporter_id <> reported_user_id
  ),
  constraint user_reports_details_length_check check (
    details is null or length(details) <= 2000
  )
);

create index if not exists user_reports_reporter_created_index
  on public.user_reports (reporter_id, created_at desc);

create index if not exists user_reports_target_status_index
  on public.user_reports (reported_user_id, status, created_at desc);

alter table public.user_blocks enable row level security;
alter table public.user_reports enable row level security;

-- Direct writes are intentionally unavailable. Security-definer RPCs mediate
-- all user actions, while moderation tooling may use the service role.

drop policy if exists "Users can view their own blocked accounts"
  on public.user_blocks;
create policy "Users can view their own blocked accounts"
on public.user_blocks
for select
to authenticated
using (blocker_id = auth.uid());

-- Reports are deliberately not queryable by the reported person. The reporter
-- receives a receipt from the submit RPC, not a public moderation queue.

-- ---------------------------------------------------------------------------
-- Shared server-side safety helpers
-- ---------------------------------------------------------------------------

create or replace function public.user_pair_is_blocked(
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_a is not null
    and p_user_b is not null
    and exists (
      select 1
      from public.user_blocks block_row
      where (block_row.blocker_id = p_user_a and block_row.blocked_id = p_user_b)
         or (block_row.blocker_id = p_user_b and block_row.blocked_id = p_user_a)
    );
$$;

revoke all on function public.user_pair_is_blocked(uuid, uuid) from public;

create or replace function public.record_safety_analytics(
  p_event_name text,
  p_action text,
  p_surface text default 'profile'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
begin
  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'launch_analytics';

  if not coalesce(v_enabled, true) then
    return;
  end if;

  if p_event_name not in (
    'safety_user_blocked',
    'safety_user_unblocked',
    'safety_user_reported'
  ) or p_action not in ('block', 'unblock', 'report') then
    return;
  end if;

  begin
    insert into public.app_analytics_events (
      event_name,
      actor_id,
      properties
    )
    values (
      p_event_name,
      auth.uid(),
      jsonb_build_object(
        'surface', case
          when p_surface in ('profile', 'conversation', 'circle', 'event', 'settings')
            then p_surface
          else 'other'
        end,
        'action', p_action
      )
    );
  exception
    when others then
      null;
  end;
end;
$$;

revoke all on function public.record_safety_analytics(text, text, text)
  from public;

-- ---------------------------------------------------------------------------
-- User-facing safety RPCs
-- ---------------------------------------------------------------------------

create or replace function public.block_user(
  p_target_user_id uuid,
  p_surface text default 'profile'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_enabled boolean := true;
  v_already_blocked boolean := false;
  v_conversation public.conversations%rowtype;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_target_user_id is null or p_target_user_id = v_viewer_id then
    raise exception 'Choose another person to block';
  end if;

  if not exists (
    select 1 from public.users user_row where user_row.id = p_target_user_id
  ) then
    raise exception 'Account not found';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'safety_blocking_reporting';

  if not coalesce(v_enabled, true) then
    raise exception 'Safety controls are temporarily unavailable';
  end if;

  select exists (
    select 1
    from public.user_blocks block_row
    where block_row.blocker_id = v_viewer_id
      and block_row.blocked_id = p_target_user_id
  ) into v_already_blocked;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_viewer_id, p_target_user_id)
  on conflict (blocker_id, blocked_id) do nothing;

  -- Clear pending one-to-one actions in both directions.
  delete from public.connection_requests request_row
  where (request_row.from_user = v_viewer_id
         and request_row.to_user = p_target_user_id)
     or (request_row.from_user = p_target_user_id
         and request_row.to_user = v_viewer_id);

  delete from public.conversation_invitations invitation_row
  where invitation_row.status = 'pending'
    and (
      (invitation_row.invited_by = v_viewer_id
       and invitation_row.invited_user_id = p_target_user_id)
      or
      (invitation_row.invited_by = p_target_user_id
       and invitation_row.invited_user_id = v_viewer_id)
    );

  delete from public.circle_notifications notification_row
  where (notification_row.user_id = v_viewer_id
         and notification_row.actor_id = p_target_user_id)
     or (notification_row.user_id = p_target_user_id
         and notification_row.actor_id = v_viewer_id);

  -- This clears private interest, Focus, proposals, and locks an active Our
  -- Circle before ordinary connection cleanup removes direct access.
  perform public.clear_romantic_pair_state(v_viewer_id, p_target_user_id);

  delete from public.connections connection_row
  where (connection_row.user_id = v_viewer_id
         and connection_row.other_user_id = p_target_user_id)
     or (connection_row.user_id = p_target_user_id
         and connection_row.other_user_id = v_viewer_id);

  -- Defense in depth for an old or partially migrated direct conversation.
  select conversation_row.*
  into v_conversation
  from public.conversations conversation_row
  where conversation_row.kind = 'direct'
    and conversation_row.direct_key = public.conversation_direct_key(
      v_viewer_id,
      p_target_user_id
    )
  limit 1;

  if found then
    if coalesce(v_conversation.circle_enabled, false) then
      perform public.lock_two_person_circle_conversation(v_conversation.id);
      delete from public.conversation_members member_row
      where member_row.conversation_id = v_conversation.id;
    else
      delete from public.conversations conversation_row
      where conversation_row.id = v_conversation.id;
    end if;
  end if;

  if not v_already_blocked then
    perform public.record_safety_analytics(
      'safety_user_blocked',
      'block',
      p_surface
    );
  end if;

  return jsonb_build_object(
    'blocked', true,
    'already_blocked', v_already_blocked,
    'connection_removed', true,
    'shared_circle_locked', coalesce(v_conversation.circle_enabled, false)
  );
end;
$$;

revoke all on function public.block_user(uuid, text) from public;
grant execute on function public.block_user(uuid, text) to authenticated;

create or replace function public.unblock_user(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_removed integer := 0;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.user_blocks block_row
  where block_row.blocker_id = v_viewer_id
    and block_row.blocked_id = p_target_user_id;

  get diagnostics v_removed = row_count;

  if v_removed > 0 then
    perform public.record_safety_analytics(
      'safety_user_unblocked',
      'unblock',
      'settings'
    );
  end if;

  return jsonb_build_object(
    'unblocked', v_removed > 0,
    'connection_restored', false
  );
end;
$$;

revoke all on function public.unblock_user(uuid) from public;
grant execute on function public.unblock_user(uuid) to authenticated;

create or replace function public.get_my_blocked_accounts()
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  blocked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    user_row.id,
    coalesce(user_row.display_name, 'Blocked account'),
    user_row.username,
    user_row.avatar_url,
    block_row.created_at
  from public.user_blocks block_row
  join public.users user_row on user_row.id = block_row.blocked_id
  where block_row.blocker_id = auth.uid()
  order by block_row.created_at desc, user_row.id;
$$;

revoke all on function public.get_my_blocked_accounts() from public;
grant execute on function public.get_my_blocked_accounts() to authenticated;

create or replace function public.submit_user_report(
  p_reported_user_id uuid,
  p_reason text,
  p_details text default null,
  p_source_context text default 'profile'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_enabled boolean := true;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_details text := nullif(trim(coalesce(p_details, '')), '');
  v_context text := lower(nullif(trim(coalesce(p_source_context, '')), ''));
  v_report_id uuid;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_reported_user_id is null or p_reported_user_id = v_viewer_id then
    raise exception 'Choose another account to report';
  end if;

  if not exists (
    select 1 from public.users user_row where user_row.id = p_reported_user_id
  ) then
    raise exception 'Account not found';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'safety_blocking_reporting';

  if not coalesce(v_enabled, true) then
    raise exception 'Safety controls are temporarily unavailable';
  end if;

  if v_reason not in (
    'harassment_or_bullying',
    'unwanted_romantic_contact',
    'impersonation',
    'spam_or_scam',
    'safety_concern',
    'other'
  ) then
    raise exception 'Choose a report reason';
  end if;

  if v_details is not null and length(v_details) > 2000 then
    raise exception 'Report details must be 2000 characters or fewer';
  end if;

  if v_context not in ('profile', 'conversation', 'circle', 'event', 'other') then
    v_context := 'other';
  end if;

  insert into public.user_reports (
    reporter_id,
    reported_user_id,
    reason,
    details,
    source_context
  )
  values (
    v_viewer_id,
    p_reported_user_id,
    v_reason,
    v_details,
    v_context
  )
  returning id into v_report_id;

  perform public.record_safety_analytics(
    'safety_user_reported',
    'report',
    v_context
  );

  return jsonb_build_object(
    'submitted', true,
    'report_id', v_report_id,
    'status', 'submitted'
  );
end;
$$;

revoke all on function public.submit_user_report(uuid, text, text, text)
  from public;
grant execute on function public.submit_user_report(uuid, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Database-level prevention of new direct interactions across a block
-- ---------------------------------------------------------------------------

create or replace function public.reject_blocked_connection_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.user_pair_is_blocked(new.from_user, new.to_user)
     and coalesce(new.status, 'pending') not in ('declined', 'cancelled') then
    raise exception 'Interaction unavailable';
  end if;
  return new;
end;
$$;

drop trigger if exists connection_requests_reject_blocked_pair
  on public.connection_requests;
create trigger connection_requests_reject_blocked_pair
before insert or update on public.connection_requests
for each row
execute function public.reject_blocked_connection_request();

create or replace function public.reject_blocked_connection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.user_pair_is_blocked(new.user_id, new.other_user_id) then
    raise exception 'Interaction unavailable';
  end if;
  return new;
end;
$$;

drop trigger if exists connections_reject_blocked_pair on public.connections;
create trigger connections_reject_blocked_pair
before insert or update on public.connections
for each row
execute function public.reject_blocked_connection();

create or replace function public.reject_blocked_conversation_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending'
     and public.user_pair_is_blocked(new.invited_by, new.invited_user_id) then
    raise exception 'Interaction unavailable';
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_invitations_reject_blocked_pair
  on public.conversation_invitations;
create trigger conversation_invitations_reject_blocked_pair
before insert or update on public.conversation_invitations
for each row
execute function public.reject_blocked_conversation_invitation();

create or replace function public.reject_blocked_direct_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_user_id uuid;
  v_kind text;
begin
  select conversation_row.kind
  into v_kind
  from public.conversations conversation_row
  where conversation_row.id = new.conversation_id;

  if v_kind <> 'direct' then
    return new;
  end if;

  select member_row.user_id
  into v_other_user_id
  from public.conversation_members member_row
  where member_row.conversation_id = new.conversation_id
    and member_row.user_id <> new.sender_id
  limit 1;

  if v_other_user_id is not null
     and public.user_pair_is_blocked(new.sender_id, v_other_user_id) then
    raise exception 'Interaction unavailable';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_reject_blocked_direct_pair on public.messages;
create trigger messages_reject_blocked_direct_pair
before insert on public.messages
for each row
execute function public.reject_blocked_direct_message();

-- ---------------------------------------------------------------------------
-- Block-aware notifications inside shared group Circles
-- ---------------------------------------------------------------------------

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
    and not public.user_pair_is_blocked(member_row.user_id, new.author_id)
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

  if v_post.id is null
     or v_post.author_id = new.user_id
     or public.user_pair_is_blocked(v_post.author_id, new.user_id) then
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
    if tg_op = 'DELETE' then return old; end if;
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

  if public.user_pair_is_blocked(v_post.author_id, v_like.user_id) then
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
    if public.user_pair_is_blocked(new.invited_user_id, new.invited_by) then
      return new;
    end if;

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

-- ---------------------------------------------------------------------------
-- Block-aware profile and discovery boundaries
-- ---------------------------------------------------------------------------

create or replace function public.get_profile_overview(profile_user_id uuid)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text,
  post_count bigint,
  connection_count bigint,
  relationship_status text,
  request_id uuid,
  can_view_posts boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  pending_request public.connection_requests%rowtype;
  relationship text;
  permitted boolean := false;
  may_view_posts boolean := false;
begin
  if viewer_id is null or profile_user_id is null then
    return;
  end if;

  if viewer_id <> profile_user_id
     and public.user_pair_is_blocked(viewer_id, profile_user_id) then
    return;
  end if;

  if viewer_id = profile_user_id then
    relationship := 'self';
    permitted := true;
    may_view_posts := true;
  elsif exists (
    select 1
    from public.connections connection_row
    where connection_row.user_id = viewer_id
      and connection_row.other_user_id = profile_user_id
  ) then
    relationship := 'connected';
    permitted := true;
    may_view_posts := true;
  else
    select request_row.*
    into pending_request
    from public.connection_requests request_row
    where request_row.status = 'pending'
      and (
        (request_row.from_user = viewer_id and request_row.to_user = profile_user_id)
        or
        (request_row.from_user = profile_user_id and request_row.to_user = viewer_id)
      )
    order by request_row.created_at desc
    limit 1;

    if found then
      relationship := case
        when pending_request.from_user = viewer_id then 'outgoing'
        else 'incoming'
      end;
      permitted := true;
    elsif exists (
      select 1
      from public.contact_edges edge_row
      where edge_row.from_user = viewer_id
        and edge_row.to_user = profile_user_id
    ) or exists (
      select 1
      from public.connections mine
      join public.connections theirs
        on theirs.user_id = profile_user_id
       and theirs.other_user_id = mine.other_user_id
      where mine.user_id = viewer_id
        and mine.other_user_id <> viewer_id
        and mine.other_user_id <> profile_user_id
    ) or exists (
      select 1
      from public.conversation_members mine_membership
      join public.conversation_members their_membership
        on their_membership.conversation_id = mine_membership.conversation_id
       and their_membership.user_id = profile_user_id
      join public.conversations conversation_row
        on conversation_row.id = mine_membership.conversation_id
      where mine_membership.user_id = viewer_id
        and (conversation_row.kind = 'group' or conversation_row.circle_enabled)
    ) or public.users_share_confirmed_event(viewer_id, profile_user_id) then
      relationship := 'mutual';
      permitted := true;
    else
      relationship := 'none';
    end if;
  end if;

  if not permitted then
    return;
  end if;

  return query
  select
    user_row.id,
    user_row.display_name,
    user_row.username,
    user_row.avatar_url,
    user_row.bio,
    case
      when may_view_posts then (
        select count(*) from public.posts post_row where post_row.user_id = user_row.id
      ) else 0
    end,
    case
      when viewer_id = profile_user_id then (
        select count(*)
        from public.connections connection_row
        where connection_row.user_id = user_row.id
      ) else 0
    end,
    relationship,
    case when pending_request.id is not null then pending_request.id else null end,
    may_view_posts
  from public.users user_row
  where user_row.id = profile_user_id;
end;
$$;

revoke all on function public.get_profile_overview(uuid) from public;
grant execute on function public.get_profile_overview(uuid) to authenticated;

-- Return type already includes shared-event context; only the block boundary is
-- added here.
create or replace function public.get_preconnection_profile_shell(
  profile_user_id uuid
)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text,
  relationship_status text,
  request_id uuid,
  has_contact_context boolean,
  mutual_connection_count bigint,
  shared_circle_count bigint,
  shared_event_count bigint,
  latest_shared_event_title text,
  latest_shared_event_at timestamptz,
  preview_post_id uuid,
  preview_caption text,
  preview_url text,
  preview_media_type text,
  preview_created_at timestamptz,
  preview_media_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  pending_request public.connection_requests%rowtype;
  relationship text;
  permitted boolean := false;
begin
  if viewer_id is null or profile_user_id is null then
    return;
  end if;

  if viewer_id = profile_user_id
     or public.user_pair_is_blocked(viewer_id, profile_user_id)
     or exists (
       select 1
       from public.connections connection_row
       where connection_row.user_id = viewer_id
         and connection_row.other_user_id = profile_user_id
     ) then
    return;
  end if;

  select request_row.*
  into pending_request
  from public.connection_requests request_row
  where request_row.status = 'pending'
    and (
      (request_row.from_user = viewer_id and request_row.to_user = profile_user_id)
      or
      (request_row.from_user = profile_user_id and request_row.to_user = viewer_id)
    )
  order by request_row.created_at desc
  limit 1;

  if found then
    relationship := case
      when pending_request.from_user = viewer_id then 'outgoing'
      else 'incoming'
    end;
    permitted := true;
  elsif exists (
    select 1
    from public.contact_edges edge_row
    where edge_row.from_user = viewer_id
      and edge_row.to_user = profile_user_id
  ) or exists (
    select 1
    from public.connections mine
    join public.connections theirs
      on theirs.user_id = profile_user_id
     and theirs.other_user_id = mine.other_user_id
    where mine.user_id = viewer_id
      and mine.other_user_id <> viewer_id
      and mine.other_user_id <> profile_user_id
  ) or exists (
    select 1
    from public.conversation_members mine_membership
    join public.conversation_members their_membership
      on their_membership.conversation_id = mine_membership.conversation_id
     and their_membership.user_id = profile_user_id
    join public.conversations conversation_row
      on conversation_row.id = mine_membership.conversation_id
    where mine_membership.user_id = viewer_id
      and (conversation_row.kind = 'group' or conversation_row.circle_enabled)
  ) or public.users_share_confirmed_event(viewer_id, profile_user_id) then
    relationship := 'mutual';
    permitted := true;
  end if;

  if not permitted then
    return;
  end if;

  return query
  select
    user_row.id,
    user_row.display_name,
    user_row.username,
    user_row.avatar_url,
    user_row.bio,
    relationship,
    case when pending_request.id is not null then pending_request.id else null end,
    exists (
      select 1
      from public.contact_edges edge_row
      where edge_row.from_user = viewer_id
        and edge_row.to_user = profile_user_id
    ),
    (
      select count(distinct mine.other_user_id)
      from public.connections mine
      join public.connections theirs
        on theirs.user_id = profile_user_id
       and theirs.other_user_id = mine.other_user_id
      where mine.user_id = viewer_id
        and mine.other_user_id <> viewer_id
        and mine.other_user_id <> profile_user_id
        and not public.user_pair_is_blocked(viewer_id, mine.other_user_id)
    ),
    (
      select count(distinct mine_membership.conversation_id)
      from public.conversation_members mine_membership
      join public.conversation_members their_membership
        on their_membership.conversation_id = mine_membership.conversation_id
       and their_membership.user_id = profile_user_id
      join public.conversations conversation_row
        on conversation_row.id = mine_membership.conversation_id
      where mine_membership.user_id = viewer_id
        and (conversation_row.kind = 'group' or conversation_row.circle_enabled)
    ),
    coalesce(shared_events.shared_event_count, 0)::bigint,
    shared_events.latest_event_title,
    shared_events.latest_event_at,
    post_row.id,
    post_row.caption,
    coalesce(first_media.url, post_row.image_url),
    case
      when post_row.id is null then null
      else coalesce(
        first_media.media_type,
        case
          when post_row.image_url ~* '\.(mp4|mov|m4v)(\?|$)' then 'video'
          else 'image'
        end
      )
    end,
    post_row.created_at,
    case
      when post_row.id is null then 0
      when coalesce(media_totals.media_count, 0) > 0 then media_totals.media_count
      when post_row.image_url is not null then 1
      else 0
    end::integer
  from public.users user_row
  left join public.posts post_row
    on post_row.id = user_row.mutual_preview_post_id
   and post_row.user_id = user_row.id
  left join lateral (
    select media_row.url, media_row.media_type
    from public.post_media media_row
    where media_row.post_id = post_row.id
    order by media_row.created_at asc, media_row.id asc
    limit 1
  ) first_media on true
  left join lateral (
    select count(*)::integer as media_count
    from public.post_media media_row
    where media_row.post_id = post_row.id
  ) media_totals on true
  left join lateral (
    select
      count(distinct mine_attendance.event_id)::bigint as shared_event_count,
      (
        select latest_event.title
        from public.confirmed_event_users latest_mine
        join public.confirmed_event_users latest_theirs
          on latest_theirs.event_id = latest_mine.event_id
         and latest_theirs.user_id = profile_user_id
        join public.events latest_event on latest_event.id = latest_mine.event_id
        where latest_mine.user_id = viewer_id
          and latest_event.attendance_reviewed_at is not null
          and latest_event.status <> 'cancelled'
        order by latest_event.starts_at desc, latest_event.id desc
        limit 1
      ),
      (
        select latest_event.starts_at
        from public.confirmed_event_users latest_mine
        join public.confirmed_event_users latest_theirs
          on latest_theirs.event_id = latest_mine.event_id
         and latest_theirs.user_id = profile_user_id
        join public.events latest_event on latest_event.id = latest_mine.event_id
        where latest_mine.user_id = viewer_id
          and latest_event.attendance_reviewed_at is not null
          and latest_event.status <> 'cancelled'
        order by latest_event.starts_at desc, latest_event.id desc
        limit 1
      )
    from public.confirmed_event_users mine_attendance
    join public.confirmed_event_users their_attendance
      on their_attendance.event_id = mine_attendance.event_id
     and their_attendance.user_id = profile_user_id
    join public.events shared_event
      on shared_event.id = mine_attendance.event_id
     and shared_event.attendance_reviewed_at is not null
     and shared_event.status <> 'cancelled'
    where mine_attendance.user_id = viewer_id
  ) shared_events on true
  where user_row.id = profile_user_id;
end;
$$;

revoke all on function public.get_preconnection_profile_shell(uuid) from public;
grant execute on function public.get_preconnection_profile_shell(uuid) to authenticated;

-- Add a block filter to the trusted candidate query while preserving the
-- existing social-proximity ranking.
create or replace function public.trusted_mutual_candidates(
  limit_count integer default 50,
  offset_count integer default 0
)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  since timestamptz,
  preview_post_id uuid,
  preview_caption text,
  preview_url text,
  preview_media_type text,
  preview_created_at timestamptz,
  preview_media_count integer,
  has_mutual_contact boolean,
  mutual_connection_count integer,
  shared_circle_count integer,
  shared_event_count integer,
  latest_shared_event_title text,
  latest_shared_event_at timestamptz,
  primary_context text
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as id
  ),
  contact_context as (
    select edge_row.to_user as candidate_id,
      true as has_mutual_contact,
      max(edge_row.created_at) as latest_contact_at
    from public.contact_edges edge_row
    join viewer on edge_row.from_user = viewer.id
    group by edge_row.to_user
  ),
  mutual_connection_context as (
    select candidate_connection.user_id as candidate_id,
      count(distinct my_connection.other_user_id)::integer as mutual_connection_count
    from public.connections my_connection
    join viewer on my_connection.user_id = viewer.id
    join public.connections candidate_connection
      on candidate_connection.other_user_id = my_connection.other_user_id
     and candidate_connection.user_id <> viewer.id
    where my_connection.other_user_id <> candidate_connection.user_id
      and not public.user_pair_is_blocked(viewer.id, my_connection.other_user_id)
    group by candidate_connection.user_id
  ),
  shared_circle_context as (
    select other_membership.user_id as candidate_id,
      count(distinct my_membership.conversation_id)::integer as shared_circle_count,
      max(conversation_row.updated_at) as latest_circle_at
    from public.conversation_members my_membership
    join viewer on my_membership.user_id = viewer.id
    join public.conversation_members other_membership
      on other_membership.conversation_id = my_membership.conversation_id
     and other_membership.user_id <> viewer.id
    join public.conversations conversation_row
      on conversation_row.id = my_membership.conversation_id
    where conversation_row.kind = 'group' or conversation_row.circle_enabled
    group by other_membership.user_id
  ),
  shared_event_context as (
    select their_attendance.user_id as candidate_id,
      count(distinct my_attendance.event_id)::integer as shared_event_count,
      max(event_row.starts_at) as latest_shared_event_at,
      (array_agg(event_row.title order by event_row.starts_at desc, event_row.id desc))[1]
        as latest_shared_event_title
    from public.confirmed_event_users my_attendance
    join viewer on my_attendance.user_id = viewer.id
    join public.confirmed_event_users their_attendance
      on their_attendance.event_id = my_attendance.event_id
     and their_attendance.user_id <> viewer.id
    join public.events event_row
      on event_row.id = my_attendance.event_id
     and event_row.attendance_reviewed_at is not null
     and event_row.status <> 'cancelled'
    group by their_attendance.user_id
  ),
  candidate_ids as (
    select candidate_id from contact_context
    union select candidate_id from mutual_connection_context
    union select candidate_id from shared_circle_context
    union select candidate_id from shared_event_context
  ),
  candidate_context as (
    select
      candidate_ids.candidate_id,
      coalesce(contact_context.has_mutual_contact, false) as has_mutual_contact,
      coalesce(mutual_connection_context.mutual_connection_count, 0) as mutual_connection_count,
      coalesce(shared_circle_context.shared_circle_count, 0) as shared_circle_count,
      coalesce(shared_event_context.shared_event_count, 0) as shared_event_count,
      shared_event_context.latest_shared_event_title,
      shared_event_context.latest_shared_event_at,
      case
        when shared_event_context.shared_event_count > 0 then 'shared_event'
        when shared_circle_context.shared_circle_count > 0 then 'shared_circle'
        when mutual_connection_context.mutual_connection_count > 0 then 'mutual_connection'
        else 'mutual_contact'
      end as primary_context,
      nullif(greatest(
        coalesce(shared_event_context.latest_shared_event_at, '-infinity'::timestamptz),
        coalesce(shared_circle_context.latest_circle_at, '-infinity'::timestamptz),
        coalesce(contact_context.latest_contact_at, '-infinity'::timestamptz)
      ), '-infinity'::timestamptz) as latest_context_at
    from candidate_ids
    left join contact_context on contact_context.candidate_id = candidate_ids.candidate_id
    left join mutual_connection_context
      on mutual_connection_context.candidate_id = candidate_ids.candidate_id
    left join shared_circle_context
      on shared_circle_context.candidate_id = candidate_ids.candidate_id
    left join shared_event_context
      on shared_event_context.candidate_id = candidate_ids.candidate_id
  )
  select
    user_row.id,
    user_row.display_name,
    user_row.avatar_url,
    candidate_context.latest_context_at,
    preview_post.id,
    preview_post.caption,
    coalesce(first_media.url, preview_post.image_url),
    case
      when preview_post.id is null then null
      else coalesce(first_media.media_type,
        case when preview_post.image_url ~* '\.(mp4|mov|m4v)(\?|$)'
          then 'video' else 'image' end)
    end,
    preview_post.created_at,
    case
      when preview_post.id is null then 0
      when coalesce(media_totals.media_count, 0) > 0 then media_totals.media_count
      when preview_post.image_url is not null then 1
      else 0
    end::integer,
    candidate_context.has_mutual_contact,
    candidate_context.mutual_connection_count,
    candidate_context.shared_circle_count,
    candidate_context.shared_event_count,
    candidate_context.latest_shared_event_title,
    candidate_context.latest_shared_event_at,
    candidate_context.primary_context
  from candidate_context
  join viewer on true
  join public.users user_row on user_row.id = candidate_context.candidate_id
  left join public.posts preview_post
    on preview_post.id = user_row.mutual_preview_post_id
   and preview_post.user_id = user_row.id
  left join lateral (
    select media_row.url, media_row.media_type
    from public.post_media media_row
    where media_row.post_id = preview_post.id
    order by media_row.created_at asc, media_row.id asc
    limit 1
  ) first_media on true
  left join lateral (
    select count(*)::integer as media_count
    from public.post_media media_row
    where media_row.post_id = preview_post.id
  ) media_totals on true
  where viewer.id is not null
    and user_row.id <> viewer.id
    and not public.user_pair_is_blocked(viewer.id, user_row.id)
    and not exists (
      select 1 from public.connections connection_row
      where connection_row.user_id = viewer.id
        and connection_row.other_user_id = user_row.id
    )
    and not exists (
      select 1 from public.connections connection_row
      where connection_row.user_id = user_row.id
        and connection_row.other_user_id = viewer.id
    )
    and not exists (
      select 1 from public.connection_requests request_row
      where request_row.status = 'pending'
        and (
          (request_row.from_user = viewer.id and request_row.to_user = user_row.id)
          or (request_row.from_user = user_row.id and request_row.to_user = viewer.id)
        )
    )
  order by
    (candidate_context.shared_event_count > 0) desc,
    candidate_context.shared_event_count desc,
    candidate_context.latest_shared_event_at desc nulls last,
    (candidate_context.shared_circle_count > 0) desc,
    candidate_context.shared_circle_count desc,
    candidate_context.mutual_connection_count desc,
    candidate_context.has_mutual_contact desc,
    candidate_context.latest_context_at desc nulls last,
    lower(coalesce(user_row.display_name, '')) asc,
    user_row.id asc
  limit greatest(1, least(coalesce(limit_count, 50), 100))
  offset greatest(coalesce(offset_count, 0), 0);
$$;

revoke all on function public.trusted_mutual_candidates(integer, integer)
  from public;
grant execute on function public.trusted_mutual_candidates(integer, integer)
  to authenticated;

-- Filter blocked people out of the post-event social graph. Factual event
-- attendance remains stored and may still be shown in non-interactive history.
create or replace function public.get_event_connection_candidates(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_event public.events%rowtype;
  v_viewer_attended boolean := false;
  v_candidates jsonb := '[]'::jsonb;
  v_candidate_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'shared_event_connections';

  if not coalesce(v_enabled, true) then
    raise exception 'Shared-event connections are temporarily unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found then
    raise exception 'Event not found or unavailable';
  end if;

  select exists (
    select 1
    from public.confirmed_event_users confirmed
    where confirmed.event_id = p_event_id
      and confirmed.user_id = auth.uid()
  ) into v_viewer_attended;

  if not public.event_viewer_can_access(p_event_id, auth.uid())
     and not v_viewer_attended then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.attendance_reviewed_at is null then
    raise exception 'Attendance has not been reviewed for this event';
  end if;

  with confirmed_members as (
    select confirmed.user_id
    from public.confirmed_event_users confirmed
    where confirmed.event_id = p_event_id
      and confirmed.user_id <> auth.uid()
      and not public.user_pair_is_blocked(auth.uid(), confirmed.user_id)
  ),
  candidate_rows as (
    select
      confirmed.user_id,
      coalesce(user_row.display_name, 'Circle member') as display_name,
      user_row.avatar_url,
      confirmed.user_id = v_event.host_id as is_host,
      case
        when exists (
          select 1
          from public.connections connection_row
          where connection_row.user_id = auth.uid()
            and connection_row.other_user_id = confirmed.user_id
        ) then 'connected'
        when pending_request.from_user = auth.uid() then 'outgoing'
        when pending_request.to_user = auth.uid() then 'incoming'
        when v_viewer_attended then 'available'
        else 'unavailable'
      end as relationship_status,
      pending_request.id as request_id,
      (
        select count(distinct mine.event_id)::integer
        from public.confirmed_event_users mine
        join public.confirmed_event_users theirs
          on theirs.event_id = mine.event_id
         and theirs.user_id = confirmed.user_id
        join public.events shared_event
          on shared_event.id = mine.event_id
         and shared_event.attendance_reviewed_at is not null
         and shared_event.status <> 'cancelled'
        where mine.user_id = auth.uid()
      ) as shared_event_count
    from confirmed_members confirmed
    join public.users user_row on user_row.id = confirmed.user_id
    left join lateral (
      select request_row.*
      from public.connection_requests request_row
      where request_row.status = 'pending'
        and (
          (request_row.from_user = auth.uid() and request_row.to_user = confirmed.user_id)
          or
          (request_row.from_user = confirmed.user_id and request_row.to_user = auth.uid())
        )
      order by request_row.created_at desc
      limit 1
    ) pending_request on true
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', candidate.user_id,
          'display_name', candidate.display_name,
          'avatar_url', candidate.avatar_url,
          'is_host', candidate.is_host,
          'relationship_status', candidate.relationship_status,
          'request_id', candidate.request_id,
          'shared_event_count', candidate.shared_event_count,
          'can_open_profile', (
            v_viewer_attended
            or candidate.relationship_status in ('connected', 'outgoing', 'incoming')
          )
        )
        order by candidate.is_host desc, lower(candidate.display_name), candidate.user_id
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_candidates, v_candidate_count
  from candidate_rows candidate;

  perform public.record_shared_event_connection_analytics(
    'event_connections_opened',
    'open',
    v_candidate_count,
    null,
    v_viewer_attended
  );

  return jsonb_build_object(
    'event', jsonb_build_object(
      'title', v_event.title,
      'starts_at', v_event.starts_at,
      'attendance_reviewed_at', v_event.attendance_reviewed_at
    ),
    'viewer_attended', v_viewer_attended,
    'candidates', v_candidates
  );
end;
$$;

revoke all on function public.get_event_connection_candidates(uuid)
  from public;
grant execute on function public.get_event_connection_candidates(uuid)
  to authenticated;

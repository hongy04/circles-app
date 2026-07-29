-- Phase 8D — Account restrictions and suspension enforcement
-- Makes senior/admin moderation decisions effective inside Circles while
-- preserving a transparent owner-only account-status surface.

-- ---------------------------------------------------------------------------
-- Feature flag
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
      'safety_blocking_reporting',
      'safety_moderation_console',
      'safety_account_enforcement'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'safety_account_enforcement',
  true,
  'Enables role-gated account restrictions, suspensions, owner status, and server-side mutation enforcement.'
)
on conflict (flag_key) do update
set
  description = excluded.description,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Current enforcement and append-only history
-- ---------------------------------------------------------------------------

create table if not exists public.account_enforcements (
  user_id uuid primary key references public.users(id) on delete cascade,
  state text not null check (state in ('restricted', 'suspended')),
  reason_code text not null check (
    reason_code in (
      'harassment',
      'unwanted_contact',
      'impersonation',
      'spam_or_scam',
      'age_policy',
      'safety_review',
      'other'
    )
  ),
  public_message text,
  source_report_id uuid references public.user_reports(id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid not null references public.users(id) on delete restrict,
  updated_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_enforcements_public_message_length check (
    public_message is null or length(public_message) <= 500
  ),
  constraint account_enforcements_time_order check (
    ends_at is null or ends_at > starts_at
  )
);

create table if not exists public.account_enforcement_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  action text not null check (action in ('restrict', 'suspend', 'lift', 'expire')),
  state text check (state is null or state in ('restricted', 'suspended')),
  reason_code text,
  public_message text,
  source_report_id uuid references public.user_reports(id) on delete set null,
  actor_id uuid references public.users(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_enforcement_history_user_index
  on public.account_enforcement_history (user_id, created_at desc);

create index if not exists account_enforcement_history_report_index
  on public.account_enforcement_history (source_report_id, created_at desc);

alter table public.account_enforcements enable row level security;
alter table public.account_enforcement_history enable row level security;

drop policy if exists "Owners can read current account enforcement"
  on public.account_enforcements;

create policy "Owners can read current account enforcement"
on public.account_enforcements
for select
to authenticated
using (user_id = auth.uid());

-- The append-only history has no direct client policy. Moderation access is
-- mediated through security-definer RPCs and the existing audit log.

-- Allow owner-side Realtime status refreshes without exposing other rows.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'account_enforcements'
  ) then
    alter publication supabase_realtime add table public.account_enforcements;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Effective-state helpers
-- ---------------------------------------------------------------------------

create or replace function public.account_has_active_enforcement(
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
      from public.account_enforcements enforcement_row
      where enforcement_row.user_id = p_user_id
        and (
          enforcement_row.ends_at is null
          or enforcement_row.ends_at > now()
        )
    );
$$;

revoke all on function public.account_has_active_enforcement(uuid) from public;
grant execute on function public.account_has_active_enforcement(uuid) to authenticated;

create or replace function public.account_is_suspended(
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
      from public.account_enforcements enforcement_row
      where enforcement_row.user_id = p_user_id
        and enforcement_row.state = 'suspended'
        and (
          enforcement_row.ends_at is null
          or enforcement_row.ends_at > now()
        )
    );
$$;

revoke all on function public.account_is_suspended(uuid) from public;
grant execute on function public.account_is_suspended(uuid) to authenticated;

create or replace function public.clear_expired_account_enforcement(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired public.account_enforcements%rowtype;
begin
  select enforcement_row.*
  into v_expired
  from public.account_enforcements enforcement_row
  where enforcement_row.user_id = p_user_id
    and enforcement_row.ends_at is not null
    and enforcement_row.ends_at <= now()
  for update;

  if not found then
    return false;
  end if;

  delete from public.account_enforcements enforcement_row
  where enforcement_row.user_id = p_user_id;

  insert into public.account_enforcement_history (
    user_id,
    action,
    state,
    reason_code,
    public_message,
    source_report_id,
    actor_id,
    starts_at,
    ends_at,
    metadata
  ) values (
    v_expired.user_id,
    'expire',
    v_expired.state,
    v_expired.reason_code,
    v_expired.public_message,
    v_expired.source_report_id,
    null,
    v_expired.starts_at,
    v_expired.ends_at,
    jsonb_build_object('automatic', true)
  );

  return true;
end;
$$;

revoke all on function public.clear_expired_account_enforcement(uuid) from public;

create or replace function public.get_my_account_enforcement_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_enforcement public.account_enforcements%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.clear_expired_account_enforcement(v_user_id);

  select enforcement_row.*
  into v_enforcement
  from public.account_enforcements enforcement_row
  where enforcement_row.user_id = v_user_id
    and (
      enforcement_row.ends_at is null
      or enforcement_row.ends_at > now()
    );

  if not found then
    return jsonb_build_object(
      'active', false,
      'state', 'active'
    );
  end if;

  return jsonb_build_object(
    'active', true,
    'state', v_enforcement.state,
    'reason_code', v_enforcement.reason_code,
    'public_message', v_enforcement.public_message,
    'starts_at', v_enforcement.starts_at,
    'ends_at', v_enforcement.ends_at,
    'is_permanent', v_enforcement.ends_at is null
  );
end;
$$;

revoke all on function public.get_my_account_enforcement_state() from public;
grant execute on function public.get_my_account_enforcement_state() to authenticated;

-- ---------------------------------------------------------------------------
-- Moderation access and enforcement actions
-- ---------------------------------------------------------------------------

alter table public.moderation_audit_log
  drop constraint if exists moderation_audit_log_action_check;

alter table public.moderation_audit_log
  add constraint moderation_audit_log_action_check check (
    action in (
      'view_report',
      'assign_report',
      'update_status',
      'update_severity',
      'resolve_report',
      'dismiss_report',
      'add_internal_note',
      'view_account_enforcement',
      'apply_account_restriction',
      'apply_account_suspension',
      'lift_account_enforcement'
    )
  );

create or replace function public.get_moderation_account_enforcement(
  p_report_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_report public.user_reports%rowtype;
  v_enforcement public.account_enforcements%rowtype;
  v_has_enforcement boolean := false;
begin
  perform public.require_moderation_role('reviewer');

  select report_row.*
  into v_report
  from public.user_reports report_row
  where report_row.id = p_report_id;

  if not found then
    raise exception 'Report not found';
  end if;

  perform public.clear_expired_account_enforcement(v_report.reported_user_id);

  select enforcement_row.*
  into v_enforcement
  from public.account_enforcements enforcement_row
  where enforcement_row.user_id = v_report.reported_user_id;

  v_has_enforcement := found;

  insert into public.moderation_audit_log (
    actor_id,
    report_id,
    reported_user_id,
    action,
    metadata
  ) values (
    v_actor_id,
    v_report.id,
    v_report.reported_user_id,
    'view_account_enforcement',
    jsonb_build_object('active', v_has_enforcement)
  );

  if not v_has_enforcement then
    return jsonb_build_object('active', false, 'state', 'active');
  end if;

  return jsonb_build_object(
    'active', true,
    'state', v_enforcement.state,
    'reason_code', v_enforcement.reason_code,
    'public_message', v_enforcement.public_message,
    'starts_at', v_enforcement.starts_at,
    'ends_at', v_enforcement.ends_at,
    'is_permanent', v_enforcement.ends_at is null,
    'source_report_id', v_enforcement.source_report_id,
    'updated_at', v_enforcement.updated_at
  );
end;
$$;

revoke all on function public.get_moderation_account_enforcement(uuid) from public;
grant execute on function public.get_moderation_account_enforcement(uuid) to authenticated;

create or replace function public.apply_moderation_account_enforcement(
  p_report_id uuid,
  p_action text,
  p_duration_hours integer default null,
  p_public_message text default null,
  p_internal_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
  v_report public.user_reports%rowtype;
  v_existing public.account_enforcements%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_state text;
  v_reason_code text;
  v_public_message text := nullif(btrim(coalesce(p_public_message, '')), '');
  v_internal_note text := nullif(btrim(coalesce(p_internal_note, '')), '');
  v_ends_at timestamptz;
  v_audit_action text;
  v_resolution_code text;
  v_conversation record;
  v_had_existing boolean := false;
begin
  v_role := public.require_moderation_role('senior');
  perform set_config('circles.account_enforcement_bypass', 'moderation', true);

  if v_action not in ('restrict', 'suspend', 'lift') then
    raise exception 'Choose restrict, suspend, or lift';
  end if;

  if p_duration_hours is not null
     and (p_duration_hours < 1 or p_duration_hours > 87600) then
    raise exception 'Duration must be between 1 hour and 10 years';
  end if;

  if length(coalesce(v_public_message, '')) > 500 then
    raise exception 'Public account-status message is too long';
  end if;

  if length(coalesce(v_internal_note, '')) > 2000 then
    raise exception 'Internal enforcement note is too long';
  end if;

  select report_row.*
  into v_report
  from public.user_reports report_row
  where report_row.id = p_report_id
  for update;

  if not found then
    raise exception 'Report not found';
  end if;

  if v_report.reported_user_id = v_actor_id then
    raise exception 'You cannot enforce your own account';
  end if;

  perform public.clear_expired_account_enforcement(v_report.reported_user_id);

  select enforcement_row.*
  into v_existing
  from public.account_enforcements enforcement_row
  where enforcement_row.user_id = v_report.reported_user_id
  for update;

  v_had_existing := found;

  if v_action = 'lift' then
    if v_had_existing then
      delete from public.account_enforcements enforcement_row
      where enforcement_row.user_id = v_report.reported_user_id;

      insert into public.account_enforcement_history (
        user_id,
        action,
        state,
        reason_code,
        public_message,
        source_report_id,
        actor_id,
        starts_at,
        ends_at,
        metadata
      ) values (
        v_existing.user_id,
        'lift',
        v_existing.state,
        v_existing.reason_code,
        v_existing.public_message,
        v_existing.source_report_id,
        v_actor_id,
        v_existing.starts_at,
        v_existing.ends_at,
        jsonb_strip_nulls(jsonb_build_object(
          'internal_note', v_internal_note
        ))
      );
    end if;

    insert into public.moderation_audit_log (
      actor_id,
      report_id,
      reported_user_id,
      action,
      from_status,
      to_status,
      metadata
    ) values (
      v_actor_id,
      v_report.id,
      v_report.reported_user_id,
      'lift_account_enforcement',
      v_report.status,
      v_report.status,
      jsonb_strip_nulls(jsonb_build_object(
        'previous_state', v_existing.state,
        'internal_note', v_internal_note
      ))
    );

    return jsonb_build_object(
      'active', false,
      'state', 'active',
      'lifted', v_had_existing
    );
  end if;

  v_state := case when v_action = 'restrict' then 'restricted' else 'suspended' end;
  v_ends_at := case
    when p_duration_hours is null then null
    else now() + make_interval(hours => p_duration_hours)
  end;
  v_reason_code := case v_report.reason
    when 'harassment_or_bullying' then 'harassment'
    when 'unwanted_romantic_contact' then 'unwanted_contact'
    when 'impersonation' then 'impersonation'
    when 'spam_or_scam' then 'spam_or_scam'
    when 'safety_concern' then 'safety_review'
    else 'other'
  end;
  v_public_message := coalesce(
    v_public_message,
    case
      when v_state = 'restricted' then
        'Your account is temporarily restricted following a Circles safety review.'
      else
        'Your account is suspended following a Circles safety review.'
    end
  );

  insert into public.account_enforcements (
    user_id,
    state,
    reason_code,
    public_message,
    source_report_id,
    starts_at,
    ends_at,
    created_by,
    updated_by
  ) values (
    v_report.reported_user_id,
    v_state,
    v_reason_code,
    v_public_message,
    v_report.id,
    now(),
    v_ends_at,
    v_actor_id,
    v_actor_id
  )
  on conflict (user_id) do update
  set
    state = excluded.state,
    reason_code = excluded.reason_code,
    public_message = excluded.public_message,
    source_report_id = excluded.source_report_id,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.account_enforcement_history (
    user_id,
    action,
    state,
    reason_code,
    public_message,
    source_report_id,
    actor_id,
    starts_at,
    ends_at,
    metadata
  ) values (
    v_report.reported_user_id,
    v_action,
    v_state,
    v_reason_code,
    v_public_message,
    v_report.id,
    v_actor_id,
    now(),
    v_ends_at,
    jsonb_strip_nulls(jsonb_build_object(
      'duration_hours', p_duration_hours,
      'internal_note', v_internal_note,
      'previous_state', v_existing.state
    ))
  );

  -- Account enforcement immediately closes romantic access and locks any
  -- preserved two-person Circle. Ordinary social history is not deleted.
  update public.romantic_preferences preference_row
  set
    enabled = false,
    updated_at = now()
  where preference_row.user_id = v_report.reported_user_id;

  delete from public.romantic_interests interest_row
  where interest_row.selector_id = v_report.reported_user_id
     or interest_row.target_id = v_report.reported_user_id;

  delete from public.romantic_mutual_states mutual_row
  where mutual_row.user_a_id = v_report.reported_user_id
     or mutual_row.user_b_id = v_report.reported_user_id;

  delete from public.romantic_focus_selections focus_row
  where focus_row.selector_id = v_report.reported_user_id
     or focus_row.target_id = v_report.reported_user_id;

  delete from public.romantic_focus_states focus_state_row
  where focus_state_row.user_a_id = v_report.reported_user_id
     or focus_state_row.user_b_id = v_report.reported_user_id;

  delete from public.two_person_circle_proposal_states proposal_row
  where proposal_row.user_a_id = v_report.reported_user_id
     or proposal_row.user_b_id = v_report.reported_user_id;

  for v_conversation in
    select distinct conversation_row.id
    from public.conversations conversation_row
    join public.conversation_members member_row
      on member_row.conversation_id = conversation_row.id
    where conversation_row.kind = 'direct'
      and conversation_row.circle_enabled
      and member_row.user_id = v_report.reported_user_id
  loop
    perform public.lock_two_person_circle_conversation(v_conversation.id);
  end loop;

  v_resolution_code := case
    when v_state = 'restricted' then 'account_restricted'
    else 'account_suspended'
  end;

  update public.user_reports
  set
    status = 'resolved',
    severity = coalesce(severity, case when v_state = 'suspended' then 'high' else 'medium' end),
    resolution_code = v_resolution_code,
    public_resolution_message = v_public_message,
    resolution_note = case
      when v_internal_note is null then resolution_note
      when resolution_note is null or btrim(resolution_note) = '' then v_internal_note
      else resolution_note || E'\n\nEnforcement: ' || v_internal_note
    end,
    assigned_moderator_id = v_actor_id,
    reviewed_at = coalesce(reviewed_at, now()),
    resolved_at = now(),
    updated_at = now()
  where id = v_report.id;

  v_audit_action := case
    when v_state = 'restricted' then 'apply_account_restriction'
    else 'apply_account_suspension'
  end;

  insert into public.moderation_audit_log (
    actor_id,
    report_id,
    reported_user_id,
    action,
    from_status,
    to_status,
    metadata
  ) values (
    v_actor_id,
    v_report.id,
    v_report.reported_user_id,
    v_audit_action,
    v_report.status,
    'resolved',
    jsonb_strip_nulls(jsonb_build_object(
      'state', v_state,
      'duration_hours', p_duration_hours,
      'ends_at', v_ends_at,
      'previous_state', v_existing.state,
      'internal_note', v_internal_note
    ))
  );

  return jsonb_build_object(
    'active', true,
    'state', v_state,
    'reason_code', v_reason_code,
    'public_message', v_public_message,
    'starts_at', now(),
    'ends_at', v_ends_at,
    'is_permanent', v_ends_at is null,
    'report_status', 'resolved',
    'resolution_code', v_resolution_code
  );
end;
$$;

revoke all on function public.apply_moderation_account_enforcement(uuid, text, integer, text, text) from public;
grant execute on function public.apply_moderation_account_enforcement(uuid, text, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Server-side mutation boundary
-- ---------------------------------------------------------------------------

create or replace function public.enforce_current_account_mutation_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_enforcement public.account_enforcements%rowtype;
begin
  if v_user_id is null
     or current_setting('circles.account_enforcement_bypass', true) in ('safety', 'moderation') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select enforcement_row.*
  into v_enforcement
  from public.account_enforcements enforcement_row
  where enforcement_row.user_id = v_user_id
    and (
      enforcement_row.ends_at is null
      or enforcement_row.ends_at > now()
    );

  if found then
    raise exception using
      errcode = 'P0001',
      message = case
        when v_enforcement.state = 'suspended' then
          'This account is suspended. Open Account status for details.'
        else
          'This account is restricted from creating or interacting. Open Account status for details.'
      end,
      detail = 'ACCOUNT_ENFORCEMENT:' || v_enforcement.state;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.enforce_current_account_mutation_access() from public;

-- Attach a single defense-in-depth trigger to user-authored social tables.
-- Safety reports, blocking, report receipts, age records, analytics, read
-- receipts, and notification read-state updates deliberately remain usable.
do $$
declare
  v_table text;
  v_tables text[] := array[
    'users',
    'contact_hashes',
    'contact_edges',
    'posts',
    'post_media',
    'post_comments',
    'post_likes',
    'stories',
    'connection_requests',
    'connections',
    'conversations',
    'conversation_members',
    'conversation_invitations',
    'messages',
    'message_media',
    'conversation_posts',
    'conversation_post_media',
    'conversation_post_comments',
    'conversation_post_likes',
    'app_invites',
    'app_invite_redemptions',
    'events',
    'event_circles',
    'event_rsvps',
    'event_guests',
    'event_guest_invitations',
    'event_attendance',
    'event_availability_polls',
    'event_availability_options',
    'event_availability_responses',
    'event_availability_votes',
    'event_photos',
    'event_repeat_signals',
    'romantic_preferences',
    'romantic_visibility_overrides',
    'romantic_interests',
    'romantic_mutual_states',
    'romantic_focus_pauses',
    'romantic_focus_selections',
    'romantic_focus_states',
    'two_person_circle_access_periods',
    'two_person_circle_album_photos',
    'two_person_circle_albums',
    'two_person_circle_important_dates',
    'two_person_circle_plans',
    'two_person_circle_proposal_states',
    'two_person_circle_silent_messages',
    'two_person_circle_thoughts'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is not null then
      execute format(
        'drop trigger if exists aa_account_enforcement_guard on public.%I',
        v_table
      );
      execute format(
        'create trigger aa_account_enforcement_guard before insert or update or delete on public.%I for each row execute function public.enforce_current_account_mutation_access()',
        v_table
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Safety-action bypass
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

  -- Blocking must remain available as a safety action even while the actor is
  -- restricted. The bypass lasts only for this transaction.
  perform set_config('circles.account_enforcement_bypass', 'safety', true);

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

-- ---------------------------------------------------------------------------
-- Storage upload boundary
-- ---------------------------------------------------------------------------

-- General avatar/personal-post/story uploads.
drop policy if exists "Circles authenticated uploads" on storage.objects;
create policy "Circles authenticated uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('avatars', 'posts', 'stories', 'media')
  and not public.account_has_active_enforcement(auth.uid())
);

-- Direct and Circle media uploads.
create or replace function public.conversation_media_object_is_writable(
  p_name text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and not public.account_has_active_enforcement(p_user_id)
    and exists (
      select 1
      from public.conversations conversation_row
      where conversation_row.id = public.conversation_id_from_storage_name(p_name)
        and public.conversation_is_member(conversation_row.id, p_user_id)
        and (
          conversation_row.kind = 'group'
          or not conversation_row.circle_enabled
          or conversation_row.circle_locked_at is null
          or split_part(coalesce(p_name, ''), '/', 2) not in ('avatars', 'posts')
        )
    );
$$;

revoke all on function public.conversation_media_object_is_writable(text, uuid) from public;
grant execute on function public.conversation_media_object_is_writable(text, uuid) to authenticated;

-- Event gallery uploads.
create or replace function public.event_photo_upload_is_allowed(
  p_storage_path text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and not public.account_has_active_enforcement(p_user_id)
    and exists (
      select 1
      from public.event_photos photo_row
      where photo_row.storage_path = p_storage_path
        and photo_row.uploaded_by = p_user_id
        and photo_row.status = 'pending'
        and public.event_viewer_can_access(photo_row.event_id, p_user_id)
    );
$$;

revoke all on function public.event_photo_upload_is_allowed(text, uuid) from public;
grant execute on function public.event_photo_upload_is_allowed(text, uuid) to authenticated;

-- Shared-album uploads.
create or replace function public.two_person_album_upload_is_allowed(
  p_storage_path text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and not public.account_has_active_enforcement(p_user_id)
    and exists (
      select 1
      from public.two_person_circle_album_photos photo_row
      join public.two_person_circle_albums album_row on album_row.id = photo_row.album_id
      where photo_row.storage_path = p_storage_path
        and photo_row.uploaded_by = p_user_id
        and photo_row.status = 'pending'
        and public.two_person_circle_is_unlocked(
          album_row.conversation_id,
          p_user_id
        )
    );
$$;

revoke all on function public.two_person_album_upload_is_allowed(text, uuid) from public;
grant execute on function public.two_person_album_upload_is_allowed(text, uuid) to authenticated;

-- Restricted accounts also cannot remove stored media directly while the
-- corresponding app mutation is blocked.
drop policy if exists "Circles delete own post uploads" on storage.objects;
create policy "Circles delete own post uploads"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'posts'
  and not public.account_has_active_enforcement(auth.uid())
  and (
    owner_id = auth.uid()::text
    or owner = auth.uid()
  )
);

drop policy if exists "Circles delete own story uploads" on storage.objects;
create policy "Circles delete own story uploads"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'stories'
  and not public.account_has_active_enforcement(auth.uid())
  and (
    owner_id = auth.uid()::text
    or owner = auth.uid()
  )
);

create or replace function public.event_photo_delete_is_allowed(
  p_storage_path text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and not public.account_has_active_enforcement(p_user_id)
    and exists (
      select 1
      from public.event_photos photo_row
      join public.events event_row on event_row.id = photo_row.event_id
      where photo_row.storage_path = p_storage_path
        and (
          photo_row.uploaded_by = p_user_id
          or event_row.host_id = p_user_id
        )
    );
$$;

revoke all on function public.event_photo_delete_is_allowed(text, uuid) from public;
grant execute on function public.event_photo_delete_is_allowed(text, uuid) to authenticated;

drop policy if exists "Two-person album members can remove photos" on storage.objects;
create policy "Two-person album members can remove photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'two-person-album-media'
  and not public.account_has_active_enforcement(auth.uid())
  and public.two_person_album_object_is_allowed(name, auth.uid())
);

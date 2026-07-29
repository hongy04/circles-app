-- Circles Phase 8E — Account enforcement appeals
--
-- Gives restricted and suspended account owners one private appeal for each
-- active enforcement action. Senior/admin moderators review appeals through
-- role-gated RPCs. Appeals never bypass an active account action while under
-- review, and every sensitive view or decision is written to the immutable
-- moderation audit log.

-- ---------------------------------------------------------------------------
-- Feature control
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
      'safety_account_enforcement',
      'safety_account_appeals'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'safety_account_appeals',
  true,
  'Enables one private appeal per active account enforcement and role-gated appeal review.'
)
on conflict (flag_key) do update
set
  description = excluded.description,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Appeal record
-- ---------------------------------------------------------------------------

create table if not exists public.account_enforcement_appeals (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  enforcement_started_at timestamptz not null,
  enforcement_state text not null check (enforcement_state in ('restricted', 'suspended')),
  source_report_id uuid references public.user_reports(id) on delete set null,
  appeal_text text not null,
  status text not null default 'submitted' check (status in ('submitted', 'reviewing', 'resolved')),
  resolution_code text check (
    resolution_code is null or resolution_code in (
      'upheld',
      'lifted',
      'shortened',
      'changed_to_restriction',
      'no_longer_active'
    )
  ),
  public_resolution_message text,
  internal_note text,
  assigned_moderator_id uuid references public.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint account_enforcement_appeal_once_per_action unique (
    user_id,
    enforcement_started_at
  ),
  constraint account_enforcement_appeal_text_length check (
    length(btrim(appeal_text)) between 20 and 4000
  ),
  constraint account_enforcement_appeal_public_message_length check (
    public_resolution_message is null or length(public_resolution_message) <= 500
  ),
  constraint account_enforcement_appeal_internal_note_length check (
    internal_note is null or length(internal_note) <= 4000
  )
);

create index if not exists account_enforcement_appeals_queue_index
  on public.account_enforcement_appeals (status, submitted_at asc);

create index if not exists account_enforcement_appeals_user_index
  on public.account_enforcement_appeals (user_id, submitted_at desc);

alter table public.account_enforcement_appeals enable row level security;

-- No direct client table policies. Owner and moderator access is mediated by
-- security-definer RPCs below.

-- ---------------------------------------------------------------------------
-- Audit actions
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
      'lift_account_enforcement',
      'submit_account_enforcement_appeal',
      'view_account_enforcement_appeal',
      'resolve_account_enforcement_appeal'
    )
  );

-- ---------------------------------------------------------------------------
-- Owner-side appeal status and submission
-- ---------------------------------------------------------------------------

create or replace function public.get_my_account_enforcement_appeal()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_enforcement public.account_enforcements%rowtype;
  v_appeal public.account_enforcement_appeals%rowtype;
  v_has_enforcement boolean := false;
  v_has_appeal boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.clear_expired_account_enforcement(v_user_id);

  select enforcement_row.*
  into v_enforcement
  from public.account_enforcements enforcement_row
  where enforcement_row.user_id = v_user_id
    and (enforcement_row.ends_at is null or enforcement_row.ends_at > now());

  v_has_enforcement := found;

  if v_has_enforcement then
    select appeal_row.*
    into v_appeal
    from public.account_enforcement_appeals appeal_row
    where appeal_row.user_id = v_user_id
      and appeal_row.enforcement_started_at = v_enforcement.starts_at
    limit 1;

    v_has_appeal := found;
  else
    select appeal_row.*
    into v_appeal
    from public.account_enforcement_appeals appeal_row
    where appeal_row.user_id = v_user_id
    order by appeal_row.submitted_at desc
    limit 1;

    v_has_appeal := found;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'has_active_enforcement', v_has_enforcement,
    'current_enforcement_state', case when v_has_enforcement then v_enforcement.state else null end,
    'current_enforcement_started_at', case when v_has_enforcement then v_enforcement.starts_at else null end,
    'can_submit', v_has_enforcement and not v_has_appeal,
    'has_appeal', v_has_appeal,
    'appeal_id', case when v_has_appeal then v_appeal.id else null end,
    'appeal_text', case when v_has_appeal then v_appeal.appeal_text else null end,
    'status', case when v_has_appeal then v_appeal.status else null end,
    'resolution_code', case when v_has_appeal then v_appeal.resolution_code else null end,
    'public_resolution_message', case when v_has_appeal then v_appeal.public_resolution_message else null end,
    'submitted_at', case when v_has_appeal then v_appeal.submitted_at else null end,
    'updated_at', case when v_has_appeal then v_appeal.updated_at else null end,
    'resolved_at', case when v_has_appeal then v_appeal.resolved_at else null end,
    'matches_current_enforcement', v_has_enforcement and v_has_appeal
  ));
end;
$$;

revoke all on function public.get_my_account_enforcement_appeal() from public;
grant execute on function public.get_my_account_enforcement_appeal() to authenticated;

create or replace function public.submit_account_enforcement_appeal(
  p_appeal_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_text text := btrim(coalesce(p_appeal_text, ''));
  v_enforcement public.account_enforcements%rowtype;
  v_appeal public.account_enforcement_appeals%rowtype;
  v_enabled boolean := true;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'safety_account_appeals';

  if not coalesce(v_enabled, true) then
    raise exception 'Account appeals are temporarily unavailable';
  end if;

  if length(v_text) < 20 then
    raise exception 'Explain the reason for your appeal in at least 20 characters';
  end if;

  if length(v_text) > 4000 then
    raise exception 'Appeal text is too long';
  end if;

  perform public.clear_expired_account_enforcement(v_user_id);

  select enforcement_row.*
  into v_enforcement
  from public.account_enforcements enforcement_row
  where enforcement_row.user_id = v_user_id
    and (enforcement_row.ends_at is null or enforcement_row.ends_at > now())
  for update;

  if not found then
    raise exception 'There is no active account action to appeal';
  end if;

  if exists (
    select 1
    from public.account_enforcement_appeals appeal_row
    where appeal_row.user_id = v_user_id
      and appeal_row.enforcement_started_at = v_enforcement.starts_at
  ) then
    raise exception 'An appeal has already been submitted for this account action';
  end if;

  -- Appeals remain available during restriction or suspension. This bypass is
  -- scoped to the current transaction and does not affect any social action.
  perform set_config('circles.account_enforcement_bypass', 'safety', true);

  insert into public.account_enforcement_appeals (
    user_id,
    enforcement_started_at,
    enforcement_state,
    source_report_id,
    appeal_text
  ) values (
    v_user_id,
    v_enforcement.starts_at,
    v_enforcement.state,
    v_enforcement.source_report_id,
    v_text
  )
  returning * into v_appeal;

  insert into public.moderation_audit_log (
    actor_id,
    report_id,
    reported_user_id,
    action,
    metadata
  ) values (
    v_user_id,
    v_enforcement.source_report_id,
    v_user_id,
    'submit_account_enforcement_appeal',
    jsonb_build_object(
      'appeal_id', v_appeal.id,
      'enforcement_state', v_enforcement.state
    )
  );

  return jsonb_build_object(
    'appeal_id', v_appeal.id,
    'status', v_appeal.status,
    'submitted_at', v_appeal.submitted_at
  );
end;
$$;

revoke all on function public.submit_account_enforcement_appeal(text) from public;
grant execute on function public.submit_account_enforcement_appeal(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Moderator appeal queue and detail
-- ---------------------------------------------------------------------------

create or replace function public.get_moderation_enforcement_appeal_queue(
  p_status text default 'submitted',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  appeal_id uuid,
  status text,
  enforcement_state text,
  submitted_at timestamptz,
  updated_at timestamptz,
  account_display_name text,
  account_username text,
  account_avatar_url text,
  source_report_id uuid,
  assigned_moderator_id uuid,
  enforcement_active boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_moderation_role('senior');

  if p_status is not null and p_status not in ('submitted', 'reviewing', 'resolved') then
    raise exception 'Invalid appeal status';
  end if;

  return query
  select
    appeal_row.id,
    appeal_row.status,
    appeal_row.enforcement_state,
    appeal_row.submitted_at,
    appeal_row.updated_at,
    coalesce(user_row.display_name, 'Account owner')::text,
    user_row.username::text,
    user_row.avatar_url::text,
    appeal_row.source_report_id,
    appeal_row.assigned_moderator_id,
    exists (
      select 1
      from public.account_enforcements enforcement_row
      where enforcement_row.user_id = appeal_row.user_id
        and enforcement_row.starts_at = appeal_row.enforcement_started_at
        and (enforcement_row.ends_at is null or enforcement_row.ends_at > now())
    )
  from public.account_enforcement_appeals appeal_row
  join public.users user_row on user_row.id = appeal_row.user_id
  where p_status is null or appeal_row.status = p_status
  order by
    case appeal_row.status
      when 'submitted' then 1
      when 'reviewing' then 2
      else 3
    end,
    appeal_row.submitted_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.get_moderation_enforcement_appeal_queue(text, integer, integer) from public;
grant execute on function public.get_moderation_enforcement_appeal_queue(text, integer, integer) to authenticated;

create or replace function public.get_moderation_enforcement_appeal_detail(
  p_appeal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_appeal public.account_enforcement_appeals%rowtype;
  v_enforcement public.account_enforcements%rowtype;
  v_has_enforcement boolean := false;
  v_result jsonb;
begin
  perform public.require_moderation_role('senior');

  select appeal_row.*
  into v_appeal
  from public.account_enforcement_appeals appeal_row
  where appeal_row.id = p_appeal_id
  for update;

  if not found then
    raise exception 'Appeal not found';
  end if;

  if v_appeal.status = 'submitted' then
    update public.account_enforcement_appeals
    set
      status = 'reviewing',
      assigned_moderator_id = v_actor_id,
      updated_at = now()
    where id = v_appeal.id
    returning * into v_appeal;
  elsif v_appeal.assigned_moderator_id is null and v_appeal.status <> 'resolved' then
    update public.account_enforcement_appeals
    set
      assigned_moderator_id = v_actor_id,
      updated_at = now()
    where id = v_appeal.id
    returning * into v_appeal;
  end if;

  select enforcement_row.*
  into v_enforcement
  from public.account_enforcements enforcement_row
  where enforcement_row.user_id = v_appeal.user_id
    and enforcement_row.starts_at = v_appeal.enforcement_started_at
    and (enforcement_row.ends_at is null or enforcement_row.ends_at > now());

  v_has_enforcement := found;

  select jsonb_build_object(
    'appeal_id', v_appeal.id,
    'status', v_appeal.status,
    'appeal_text', v_appeal.appeal_text,
    'enforcement_state', v_appeal.enforcement_state,
    'enforcement_started_at', v_appeal.enforcement_started_at,
    'source_report_id', v_appeal.source_report_id,
    'submitted_at', v_appeal.submitted_at,
    'updated_at', v_appeal.updated_at,
    'resolved_at', v_appeal.resolved_at,
    'resolution_code', v_appeal.resolution_code,
    'public_resolution_message', v_appeal.public_resolution_message,
    'internal_note', v_appeal.internal_note,
    'assigned_moderator_id', v_appeal.assigned_moderator_id,
    'account', jsonb_build_object(
      'user_id', user_row.id,
      'display_name', user_row.display_name,
      'username', user_row.username,
      'avatar_url', user_row.avatar_url
    ),
    'current_enforcement', case
      when v_has_enforcement then jsonb_build_object(
        'active', true,
        'state', v_enforcement.state,
        'reason_code', v_enforcement.reason_code,
        'public_message', v_enforcement.public_message,
        'starts_at', v_enforcement.starts_at,
        'ends_at', v_enforcement.ends_at
      )
      else jsonb_build_object('active', false, 'state', 'active')
    end
  ) into v_result
  from public.users user_row
  where user_row.id = v_appeal.user_id;

  insert into public.moderation_audit_log (
    actor_id,
    report_id,
    reported_user_id,
    action,
    metadata
  ) values (
    v_actor_id,
    v_appeal.source_report_id,
    v_appeal.user_id,
    'view_account_enforcement_appeal',
    jsonb_build_object('appeal_id', v_appeal.id)
  );

  return v_result;
end;
$$;

revoke all on function public.get_moderation_enforcement_appeal_detail(uuid) from public;
grant execute on function public.get_moderation_enforcement_appeal_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Moderator appeal resolution
-- ---------------------------------------------------------------------------

create or replace function public.resolve_moderation_enforcement_appeal(
  p_appeal_id uuid,
  p_decision text,
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
  v_appeal public.account_enforcement_appeals%rowtype;
  v_enforcement public.account_enforcements%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_public_message text := nullif(btrim(coalesce(p_public_message, '')), '');
  v_internal_note text := nullif(btrim(coalesce(p_internal_note, '')), '');
  v_has_enforcement boolean := false;
  v_new_end timestamptz;
  v_resolution text;
  v_history_action text;
begin
  perform public.require_moderation_role('senior');
  perform set_config('circles.account_enforcement_bypass', 'moderation', true);

  if v_decision not in (
    'uphold',
    'lift',
    'shorten',
    'change_to_restriction',
    'close_inactive'
  ) then
    raise exception 'Choose a valid appeal decision';
  end if;

  if length(coalesce(v_public_message, '')) > 500 then
    raise exception 'Public appeal message is too long';
  end if;

  if length(coalesce(v_internal_note, '')) > 4000 then
    raise exception 'Private appeal note is too long';
  end if;

  select appeal_row.*
  into v_appeal
  from public.account_enforcement_appeals appeal_row
  where appeal_row.id = p_appeal_id
  for update;

  if not found then
    raise exception 'Appeal not found';
  end if;

  if v_appeal.status = 'resolved' then
    raise exception 'This appeal has already been resolved';
  end if;

  select enforcement_row.*
  into v_enforcement
  from public.account_enforcements enforcement_row
  where enforcement_row.user_id = v_appeal.user_id
    and enforcement_row.starts_at = v_appeal.enforcement_started_at
    and (enforcement_row.ends_at is null or enforcement_row.ends_at > now())
  for update;

  v_has_enforcement := found;

  if not v_has_enforcement and v_decision <> 'close_inactive' then
    raise exception 'This account action is no longer active. Close the appeal as no longer active.';
  end if;

  if v_has_enforcement and v_decision = 'close_inactive' then
    raise exception 'The account action is still active';
  end if;

  if v_decision = 'uphold' then
    v_resolution := 'upheld';
    v_public_message := coalesce(
      v_public_message,
      'Circles reviewed your appeal and the current account action remains in place.'
    );

  elsif v_decision = 'lift' then
    delete from public.account_enforcements enforcement_row
    where enforcement_row.user_id = v_appeal.user_id
      and enforcement_row.starts_at = v_appeal.enforcement_started_at;

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
      v_enforcement.user_id,
      'lift',
      v_enforcement.state,
      v_enforcement.reason_code,
      v_enforcement.public_message,
      v_enforcement.source_report_id,
      v_actor_id,
      v_enforcement.starts_at,
      v_enforcement.ends_at,
      jsonb_strip_nulls(jsonb_build_object(
        'appeal_id', v_appeal.id,
        'appeal_decision', 'lifted',
        'internal_note', v_internal_note
      ))
    );

    v_resolution := 'lifted';
    v_public_message := coalesce(
      v_public_message,
      'Circles reviewed your appeal and lifted the account action. Previous relationship or romantic state was not restored.'
    );

  elsif v_decision = 'shorten' then
    if p_duration_hours is null or p_duration_hours < 1 or p_duration_hours > 720 then
      raise exception 'Choose a remaining duration between 1 hour and 30 days';
    end if;

    v_new_end := now() + make_interval(hours => p_duration_hours);

    if v_enforcement.ends_at is not null and v_new_end >= v_enforcement.ends_at then
      raise exception 'The selected time would not shorten the current action';
    end if;

    update public.account_enforcements
    set
      ends_at = v_new_end,
      public_message = coalesce(v_public_message, public_message),
      updated_by = v_actor_id,
      updated_at = now()
    where user_id = v_appeal.user_id
      and starts_at = v_appeal.enforcement_started_at;

    v_history_action := case
      when v_enforcement.state = 'suspended' then 'suspend'
      else 'restrict'
    end;

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
      v_enforcement.user_id,
      v_history_action,
      v_enforcement.state,
      v_enforcement.reason_code,
      coalesce(v_public_message, v_enforcement.public_message),
      v_enforcement.source_report_id,
      v_actor_id,
      v_enforcement.starts_at,
      v_new_end,
      jsonb_strip_nulls(jsonb_build_object(
        'appeal_id', v_appeal.id,
        'appeal_decision', 'shortened',
        'previous_ends_at', v_enforcement.ends_at,
        'internal_note', v_internal_note
      ))
    );

    v_resolution := 'shortened';
    v_public_message := coalesce(
      v_public_message,
      'Circles reviewed your appeal and shortened the account action.'
    );

  elsif v_decision = 'change_to_restriction' then
    if v_enforcement.state <> 'suspended' then
      raise exception 'Only a suspension can be changed to a restriction';
    end if;

    update public.account_enforcements
    set
      state = 'restricted',
      public_message = coalesce(v_public_message, public_message),
      updated_by = v_actor_id,
      updated_at = now()
    where user_id = v_appeal.user_id
      and starts_at = v_appeal.enforcement_started_at;

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
      v_enforcement.user_id,
      'restrict',
      'restricted',
      v_enforcement.reason_code,
      coalesce(v_public_message, v_enforcement.public_message),
      v_enforcement.source_report_id,
      v_actor_id,
      v_enforcement.starts_at,
      v_enforcement.ends_at,
      jsonb_strip_nulls(jsonb_build_object(
        'appeal_id', v_appeal.id,
        'appeal_decision', 'changed_to_restriction',
        'previous_state', v_enforcement.state,
        'internal_note', v_internal_note
      ))
    );

    v_resolution := 'changed_to_restriction';
    v_public_message := coalesce(
      v_public_message,
      'Circles reviewed your appeal and changed the suspension to a read-only restriction.'
    );

  else
    v_resolution := 'no_longer_active';
    v_public_message := coalesce(
      v_public_message,
      'The account action ended before the appeal review was completed.'
    );
  end if;

  update public.account_enforcement_appeals
  set
    status = 'resolved',
    resolution_code = v_resolution,
    public_resolution_message = v_public_message,
    internal_note = v_internal_note,
    assigned_moderator_id = v_actor_id,
    updated_at = now(),
    resolved_at = now()
  where id = v_appeal.id
  returning * into v_appeal;

  insert into public.moderation_audit_log (
    actor_id,
    report_id,
    reported_user_id,
    action,
    metadata
  ) values (
    v_actor_id,
    v_appeal.source_report_id,
    v_appeal.user_id,
    'resolve_account_enforcement_appeal',
    jsonb_strip_nulls(jsonb_build_object(
      'appeal_id', v_appeal.id,
      'decision', v_resolution,
      'duration_hours', p_duration_hours,
      'internal_note', v_internal_note,
      'public_message_added', v_public_message is not null
    ))
  );

  return jsonb_build_object(
    'appeal_id', v_appeal.id,
    'status', v_appeal.status,
    'resolution_code', v_appeal.resolution_code,
    'resolved_at', v_appeal.resolved_at,
    'enforcement_active', case
      when v_resolution = 'lifted' or v_resolution = 'no_longer_active' then false
      else true
    end
  );
end;
$$;

revoke all on function public.resolve_moderation_enforcement_appeal(uuid, text, integer, text, text) from public;
grant execute on function public.resolve_moderation_enforcement_appeal(uuid, text, integer, text, text) to authenticated;

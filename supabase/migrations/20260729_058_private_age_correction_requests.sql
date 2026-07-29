-- Circles Phase 8F — private birth-date correction requests
--
-- Gives an account owner an authenticated support path for correcting a saved
-- birth date without making that sensitive value visible to profiles,
-- discovery, ordinary moderators, or analytics. Only active admin-level
-- moderation staff may view and resolve correction requests.

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
      'safety_account_appeals',
      'safety_age_correction_requests'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'safety_age_correction_requests',
  true,
  'Enables owner-submitted private birth-date correction requests and admin-only review.'
)
on conflict (flag_key) do update
set
  description = excluded.description,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Correction records
-- ---------------------------------------------------------------------------

alter table public.user_age_eligibility
  add column if not exists last_corrected_at timestamptz;

alter table public.user_age_eligibility
  add column if not exists correction_count integer not null default 0;

create table if not exists public.age_eligibility_correction_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  current_date_of_birth date not null,
  requested_date_of_birth date not null,
  reason text not null,
  status text not null default 'submitted' check (
    status in ('submitted', 'reviewing', 'resolved')
  ),
  resolution_code text check (
    resolution_code is null or resolution_code in ('approved', 'denied')
  ),
  public_resolution_message text,
  internal_note text,
  assigned_moderator_id uuid references public.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint age_correction_reason_length check (
    length(btrim(reason)) between 20 and 2000
  ),
  constraint age_correction_dates_differ check (
    requested_date_of_birth <> current_date_of_birth
  ),
  constraint age_correction_public_message_length check (
    public_resolution_message is null
    or length(public_resolution_message) <= 500
  ),
  constraint age_correction_internal_note_length check (
    internal_note is null or length(internal_note) <= 4000
  )
);

create unique index if not exists age_correction_one_active_per_user
  on public.age_eligibility_correction_requests (user_id)
  where status in ('submitted', 'reviewing');

create index if not exists age_correction_queue_index
  on public.age_eligibility_correction_requests (status, submitted_at asc);

create index if not exists age_correction_user_history_index
  on public.age_eligibility_correction_requests (user_id, submitted_at desc);

alter table public.age_eligibility_correction_requests enable row level security;

-- No direct client policies. Owner and admin access is mediated only by the
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
      'resolve_account_enforcement_appeal',
      'submit_age_correction_request',
      'view_age_correction_request',
      'resolve_age_correction_request'
    )
  );

-- ---------------------------------------------------------------------------
-- Owner-side status and submission
-- ---------------------------------------------------------------------------

create or replace function public.get_my_age_correction_request()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_birth_date date;
  v_request public.age_eligibility_correction_requests%rowtype;
  v_has_request boolean := false;
  v_has_active boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select age_row.date_of_birth
  into v_birth_date
  from public.user_age_eligibility age_row
  where age_row.user_id = v_user_id;

  if not found then
    return jsonb_build_object(
      'birth_date_set', false,
      'can_submit', false,
      'has_request', false
    );
  end if;

  select request_row.*
  into v_request
  from public.age_eligibility_correction_requests request_row
  where request_row.user_id = v_user_id
  order by
    case when request_row.status in ('submitted', 'reviewing') then 0 else 1 end,
    request_row.submitted_at desc
  limit 1;

  v_has_request := found;
  v_has_active := v_has_request and v_request.status in ('submitted', 'reviewing');

  return jsonb_strip_nulls(jsonb_build_object(
    'birth_date_set', true,
    'current_date_of_birth', v_birth_date,
    'can_submit', not v_has_active,
    'has_request', v_has_request,
    'request_id', case when v_has_request then v_request.id else null end,
    'requested_date_of_birth', case when v_has_request then v_request.requested_date_of_birth else null end,
    'reason', case when v_has_request then v_request.reason else null end,
    'status', case when v_has_request then v_request.status else null end,
    'resolution_code', case when v_has_request then v_request.resolution_code else null end,
    'public_resolution_message', case when v_has_request then v_request.public_resolution_message else null end,
    'submitted_at', case when v_has_request then v_request.submitted_at else null end,
    'updated_at', case when v_has_request then v_request.updated_at else null end,
    'resolved_at', case when v_has_request then v_request.resolved_at else null end
  ));
end;
$$;

revoke all on function public.get_my_age_correction_request() from public;
grant execute on function public.get_my_age_correction_request() to authenticated;

create or replace function public.submit_age_correction_request(
  p_requested_date_of_birth date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_date date;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_request public.age_eligibility_correction_requests%rowtype;
  v_enabled boolean := true;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'safety_age_correction_requests';

  if not coalesce(v_enabled, true) then
    raise exception 'Birth-date correction requests are temporarily unavailable';
  end if;

  if p_requested_date_of_birth is null then
    raise exception 'Enter a valid requested birth date';
  end if;

  if p_requested_date_of_birth > current_date then
    raise exception 'Birth date cannot be in the future';
  end if;

  if length(v_reason) < 20 then
    raise exception 'Explain the correction in at least 20 characters';
  end if;

  if length(v_reason) > 2000 then
    raise exception 'Correction explanation is too long';
  end if;

  select age_row.date_of_birth
  into v_current_date
  from public.user_age_eligibility age_row
  where age_row.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Save a birth date before requesting a correction';
  end if;

  if p_requested_date_of_birth = v_current_date then
    raise exception 'The requested date is already saved';
  end if;

  if exists (
    select 1
    from public.age_eligibility_correction_requests request_row
    where request_row.user_id = v_user_id
      and request_row.status in ('submitted', 'reviewing')
  ) then
    raise exception 'A birth-date correction request is already under review';
  end if;

  -- This is a narrow safety/support mutation and remains available to a
  -- restricted account. It does not grant any social write access.
  perform set_config('circles.account_enforcement_bypass', 'safety', true);

  insert into public.age_eligibility_correction_requests (
    user_id,
    current_date_of_birth,
    requested_date_of_birth,
    reason
  ) values (
    v_user_id,
    v_current_date,
    p_requested_date_of_birth,
    v_reason
  )
  returning * into v_request;

  insert into public.moderation_audit_log (
    actor_id,
    reported_user_id,
    action,
    metadata
  ) values (
    v_user_id,
    v_user_id,
    'submit_age_correction_request',
    jsonb_build_object('request_id', v_request.id)
  );

  return jsonb_build_object(
    'request_id', v_request.id,
    'status', v_request.status,
    'submitted_at', v_request.submitted_at
  );
end;
$$;

revoke all on function public.submit_age_correction_request(date, text) from public;
grant execute on function public.submit_age_correction_request(date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin queue and sensitive detail
-- ---------------------------------------------------------------------------

create or replace function public.get_moderation_age_correction_queue(
  p_status text default 'submitted',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  request_id uuid,
  status text,
  submitted_at timestamptz,
  updated_at timestamptz,
  account_display_name text,
  account_username text,
  account_avatar_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_moderation_role('admin');

  if p_status is not null and p_status not in ('submitted', 'reviewing', 'resolved') then
    raise exception 'Invalid correction-request status';
  end if;

  return query
  select
    request_row.id,
    request_row.status,
    request_row.submitted_at,
    request_row.updated_at,
    coalesce(user_row.display_name, 'Account owner')::text,
    user_row.username::text,
    user_row.avatar_url::text
  from public.age_eligibility_correction_requests request_row
  join public.users user_row on user_row.id = request_row.user_id
  where p_status is null or request_row.status = p_status
  order by
    case request_row.status
      when 'submitted' then 1
      when 'reviewing' then 2
      else 3
    end,
    request_row.submitted_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.get_moderation_age_correction_queue(text, integer, integer) from public;
grant execute on function public.get_moderation_age_correction_queue(text, integer, integer) to authenticated;

create or replace function public.get_moderation_age_correction_detail(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.age_eligibility_correction_requests%rowtype;
  v_result jsonb;
begin
  perform public.require_moderation_role('admin');

  select request_row.*
  into v_request
  from public.age_eligibility_correction_requests request_row
  where request_row.id = p_request_id
  for update;

  if not found then
    raise exception 'Birth-date correction request not found';
  end if;

  if v_request.user_id = v_actor_id then
    raise exception 'An administrator cannot review their own birth-date correction request';
  end if;

  if v_request.status = 'submitted' then
    update public.age_eligibility_correction_requests
    set
      status = 'reviewing',
      assigned_moderator_id = v_actor_id,
      updated_at = now()
    where id = v_request.id
    returning * into v_request;
  elsif v_request.assigned_moderator_id is null and v_request.status <> 'resolved' then
    update public.age_eligibility_correction_requests
    set
      assigned_moderator_id = v_actor_id,
      updated_at = now()
    where id = v_request.id
    returning * into v_request;
  end if;

  select jsonb_build_object(
    'request_id', v_request.id,
    'status', v_request.status,
    'current_date_of_birth', v_request.current_date_of_birth,
    'requested_date_of_birth', v_request.requested_date_of_birth,
    'reason', v_request.reason,
    'resolution_code', v_request.resolution_code,
    'public_resolution_message', v_request.public_resolution_message,
    'internal_note', v_request.internal_note,
    'assigned_moderator_id', v_request.assigned_moderator_id,
    'submitted_at', v_request.submitted_at,
    'updated_at', v_request.updated_at,
    'resolved_at', v_request.resolved_at,
    'account', jsonb_build_object(
      'user_id', user_row.id,
      'display_name', user_row.display_name,
      'username', user_row.username,
      'avatar_url', user_row.avatar_url
    )
  ) into v_result
  from public.users user_row
  where user_row.id = v_request.user_id;

  insert into public.moderation_audit_log (
    actor_id,
    reported_user_id,
    action,
    metadata
  ) values (
    v_actor_id,
    v_request.user_id,
    'view_age_correction_request',
    jsonb_build_object('request_id', v_request.id)
  );

  return v_result;
end;
$$;

revoke all on function public.get_moderation_age_correction_detail(uuid) from public;
grant execute on function public.get_moderation_age_correction_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Romantic cleanup helper for a corrected under-18 date
-- ---------------------------------------------------------------------------

create or replace function public.close_romantic_state_for_age_ineligibility(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation record;
begin
  update public.romantic_preferences preference_row
  set
    enabled = false,
    age_confirmed = false,
    updated_at = now()
  where preference_row.user_id = p_user_id;

  delete from public.romantic_interests interest_row
  where interest_row.selector_id = p_user_id
     or interest_row.target_user_id = p_user_id;

  delete from public.romantic_mutual_states mutual_row
  where mutual_row.user_low_id = p_user_id
     or mutual_row.user_high_id = p_user_id;

  delete from public.romantic_focus_selections focus_row
  where focus_row.selector_id = p_user_id
     or focus_row.target_user_id = p_user_id;

  delete from public.romantic_focus_states focus_state_row
  where focus_state_row.user_low_id = p_user_id
     or focus_state_row.user_high_id = p_user_id;

  delete from public.two_person_circle_proposal_states proposal_row
  where proposal_row.user_low_id = p_user_id
     or proposal_row.user_high_id = p_user_id;

  for v_conversation in
    select distinct conversation_row.id
    from public.conversations conversation_row
    join public.conversation_members member_row
      on member_row.conversation_id = conversation_row.id
    where conversation_row.kind = 'direct'
      and conversation_row.circle_enabled
      and member_row.user_id = p_user_id
  loop
    perform public.lock_two_person_circle_conversation(v_conversation.id);
  end loop;
end;
$$;

revoke all on function public.close_romantic_state_for_age_ineligibility(uuid) from public;

-- ---------------------------------------------------------------------------
-- Admin resolution
-- ---------------------------------------------------------------------------

create or replace function public.resolve_moderation_age_correction_request(
  p_request_id uuid,
  p_decision text,
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
  v_request public.age_eligibility_correction_requests%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_public_message text := nullif(btrim(coalesce(p_public_message, '')), '');
  v_internal_note text := nullif(btrim(coalesce(p_internal_note, '')), '');
  v_current_date date;
  v_eligible boolean := false;
  v_resolution text;
begin
  perform public.require_moderation_role('admin');
  perform set_config('circles.account_enforcement_bypass', 'moderation', true);

  if v_decision not in ('approve', 'deny') then
    raise exception 'Choose approve or deny';
  end if;

  if length(coalesce(v_public_message, '')) > 500 then
    raise exception 'Public correction message is too long';
  end if;

  if length(coalesce(v_internal_note, '')) > 4000 then
    raise exception 'Private correction note is too long';
  end if;

  select request_row.*
  into v_request
  from public.age_eligibility_correction_requests request_row
  where request_row.id = p_request_id
  for update;

  if not found then
    raise exception 'Birth-date correction request not found';
  end if;

  if v_request.user_id = v_actor_id then
    raise exception 'An administrator cannot resolve their own birth-date correction request';
  end if;

  if v_request.status = 'resolved' then
    raise exception 'This birth-date correction request is already resolved';
  end if;

  if v_decision = 'approve' then
    select age_row.date_of_birth
    into v_current_date
    from public.user_age_eligibility age_row
    where age_row.user_id = v_request.user_id
    for update;

    if not found then
      raise exception 'The account no longer has a saved birth date';
    end if;

    if v_current_date <> v_request.current_date_of_birth then
      raise exception 'The saved birth date changed after this request was submitted';
    end if;

    update public.user_age_eligibility
    set
      date_of_birth = v_request.requested_date_of_birth,
      last_corrected_at = now(),
      correction_count = correction_count + 1,
      updated_at = now()
    where user_id = v_request.user_id;

    v_eligible := v_request.requested_date_of_birth
      <= (current_date - interval '18 years')::date;

    insert into public.romantic_preferences (
      user_id,
      enabled,
      age_confirmed,
      audience_mode,
      updated_at
    ) values (
      v_request.user_id,
      false,
      v_eligible,
      'all_connections',
      now()
    )
    on conflict (user_id) do update
    set
      age_confirmed = v_eligible,
      enabled = case
        when v_eligible then romantic_preferences.enabled
        else false
      end,
      updated_at = now();

    if not v_eligible then
      perform public.close_romantic_state_for_age_ineligibility(v_request.user_id);
    end if;

    v_resolution := 'approved';
    v_public_message := coalesce(
      v_public_message,
      case
        when v_eligible then
          'Circles approved your private birth-date correction. Romantic features remain off unless you enable them separately.'
        else
          'Circles approved your private birth-date correction. Adult romantic features are unavailable until you are eligible.'
      end
    );
  else
    v_resolution := 'denied';
    v_public_message := coalesce(
      v_public_message,
      'Circles reviewed the correction request and did not change the saved birth date.'
    );
  end if;

  update public.age_eligibility_correction_requests
  set
    status = 'resolved',
    resolution_code = v_resolution,
    public_resolution_message = v_public_message,
    internal_note = v_internal_note,
    assigned_moderator_id = v_actor_id,
    updated_at = now(),
    resolved_at = now()
  where id = v_request.id
  returning * into v_request;

  insert into public.moderation_audit_log (
    actor_id,
    reported_user_id,
    action,
    metadata
  ) values (
    v_actor_id,
    v_request.user_id,
    'resolve_age_correction_request',
    jsonb_strip_nulls(jsonb_build_object(
      'request_id', v_request.id,
      'decision', v_resolution,
      'eligible_for_romance', case when v_resolution = 'approved' then v_eligible else null end,
      'public_message_added', v_public_message is not null,
      'internal_note', v_internal_note
    ))
  );

  return jsonb_build_object(
    'request_id', v_request.id,
    'status', v_request.status,
    'resolution_code', v_request.resolution_code,
    'resolved_at', v_request.resolved_at,
    'eligible_for_romance', case when v_resolution = 'approved' then v_eligible else null end
  );
end;
$$;

revoke all on function public.resolve_moderation_age_correction_request(uuid, text, text, text) from public;
grant execute on function public.resolve_moderation_age_correction_request(uuid, text, text, text) to authenticated;

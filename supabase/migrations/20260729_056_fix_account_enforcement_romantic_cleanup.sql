-- Phase 8D hotfix: align account-enforcement romantic cleanup with the
-- canonical column names created by Migrations 042-044.
--
-- The failed enforcement RPC transaction rolled back completely, so this
-- migration only needs to replace the function definition.

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
     or interest_row.target_user_id = v_report.reported_user_id;

  delete from public.romantic_mutual_states mutual_row
  where mutual_row.user_low_id = v_report.reported_user_id
     or mutual_row.user_high_id = v_report.reported_user_id;

  delete from public.romantic_focus_selections focus_row
  where focus_row.selector_id = v_report.reported_user_id
     or focus_row.target_user_id = v_report.reported_user_id;

  delete from public.romantic_focus_states focus_state_row
  where focus_state_row.user_low_id = v_report.reported_user_id
     or focus_state_row.user_high_id = v_report.reported_user_id;

  delete from public.two_person_circle_proposal_states proposal_row
  where proposal_row.user_low_id = v_report.reported_user_id
     or proposal_row.user_high_id = v_report.reported_user_id;

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

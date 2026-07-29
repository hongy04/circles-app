-- Circles Phase 8B — report receipts and moderation operations
--
-- Adds role-gated report review, immutable moderation audit logging, and a
-- private reporter receipt. This migration does not expose reports to the
-- reported account and does not grant ordinary clients direct table access.

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
      'safety_moderation_console'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'safety_moderation_console',
  true,
  'Enables reporter receipts and role-gated moderation review tooling.'
)
on conflict (flag_key) do update
set
  description = excluded.description,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Moderation records and report metadata
-- ---------------------------------------------------------------------------

alter table public.user_reports
  add column if not exists severity text;

alter table public.user_reports
  add column if not exists assigned_moderator_id uuid references public.users(id) on delete set null;

alter table public.user_reports
  add column if not exists resolution_code text;

alter table public.user_reports
  add column if not exists public_resolution_message text;

alter table public.user_reports
  add column if not exists updated_at timestamptz not null default now();

alter table public.user_reports
  add column if not exists resolved_at timestamptz;

alter table public.user_reports
  drop constraint if exists user_reports_severity_check;

alter table public.user_reports
  add constraint user_reports_severity_check check (
    severity is null or severity in ('low', 'medium', 'high', 'urgent')
  );

alter table public.user_reports
  drop constraint if exists user_reports_resolution_code_check;

alter table public.user_reports
  add constraint user_reports_resolution_code_check check (
    resolution_code is null or resolution_code in (
      'no_action',
      'warning_issued',
      'content_removed',
      'account_restricted',
      'account_suspended',
      'escalated',
      'duplicate'
    )
  );

alter table public.user_reports
  drop constraint if exists user_reports_public_resolution_length_check;

alter table public.user_reports
  add constraint user_reports_public_resolution_length_check check (
    public_resolution_message is null
    or length(public_resolution_message) <= 500
  );

alter table public.user_reports
  drop constraint if exists user_reports_resolution_note_length_check;

alter table public.user_reports
  add constraint user_reports_resolution_note_length_check check (
    resolution_note is null or length(resolution_note) <= 4000
  );

create index if not exists user_reports_queue_index
  on public.user_reports (status, severity, created_at desc);

create table if not exists public.moderation_staff (
  user_id uuid primary key references public.users(id) on delete cascade,
  role text not null check (role in ('reviewer', 'senior', 'admin')),
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.users(id) on delete restrict,
  report_id uuid references public.user_reports(id) on delete set null,
  reported_user_id uuid references public.users(id) on delete set null,
  action text not null check (
    action in (
      'view_report',
      'assign_report',
      'update_status',
      'update_severity',
      'resolve_report',
      'dismiss_report',
      'add_internal_note'
    )
  ),
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists moderation_audit_report_index
  on public.moderation_audit_log (report_id, created_at desc);

create index if not exists moderation_audit_actor_index
  on public.moderation_audit_log (actor_id, created_at desc);

alter table public.moderation_staff enable row level security;
alter table public.moderation_audit_log enable row level security;

-- No direct client policies are created. Security-definer RPCs below mediate
-- reporter and moderator access. Staff membership must be provisioned through
-- the SQL editor or a trusted server-side administration path.

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

create or replace function public.moderation_role_rank(p_role text)
returns integer
language sql
immutable
as $$
  select case p_role
    when 'reviewer' then 1
    when 'senior' then 2
    when 'admin' then 3
    else 0
  end;
$$;

revoke all on function public.moderation_role_rank(text) from public;

create or replace function public.current_moderation_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select staff.role
  from public.moderation_staff staff
  where staff.user_id = auth.uid()
    and staff.active = true
  limit 1;
$$;

revoke all on function public.current_moderation_role() from public;
grant execute on function public.current_moderation_role() to authenticated;

create or replace function public.require_moderation_role(p_minimum_role text default 'reviewer')
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_role := public.current_moderation_role();
  if public.moderation_role_rank(v_role) < public.moderation_role_rank(p_minimum_role) then
    raise exception 'Moderation access required';
  end if;

  return v_role;
end;
$$;

revoke all on function public.require_moderation_role(text) from public;

create or replace function public.get_moderation_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_role := public.current_moderation_role();
  return jsonb_build_object(
    'has_access', v_role is not null,
    'role', v_role
  );
end;
$$;

revoke all on function public.get_moderation_access() from public;
grant execute on function public.get_moderation_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Reporter receipt
-- ---------------------------------------------------------------------------

create or replace function public.get_my_report_receipts()
returns table (
  report_id uuid,
  reason text,
  source_context text,
  status text,
  resolution_code text,
  public_resolution_message text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    report_row.id,
    report_row.reason,
    report_row.source_context,
    report_row.status,
    report_row.resolution_code,
    report_row.public_resolution_message,
    report_row.created_at,
    report_row.updated_at
  from public.user_reports report_row
  where report_row.reporter_id = auth.uid()
  order by report_row.created_at desc;
$$;

revoke all on function public.get_my_report_receipts() from public;
grant execute on function public.get_my_report_receipts() to authenticated;

-- ---------------------------------------------------------------------------
-- Moderator queue and detail
-- ---------------------------------------------------------------------------

create or replace function public.get_moderation_report_queue(
  p_status text default null,
  p_severity text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  report_id uuid,
  status text,
  severity text,
  reason text,
  source_context text,
  created_at timestamptz,
  updated_at timestamptz,
  reporter_display_name text,
  reporter_username text,
  reported_display_name text,
  reported_username text,
  reported_avatar_url text,
  assigned_moderator_id uuid,
  open_reports_against_target bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_moderation_role('reviewer');

  if p_status is not null
     and p_status not in ('submitted', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'Invalid report status';
  end if;

  if p_severity is not null
     and p_severity not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'Invalid severity';
  end if;

  return query
  select
    report_row.id,
    report_row.status,
    report_row.severity,
    report_row.reason,
    report_row.source_context,
    report_row.created_at,
    report_row.updated_at,
    coalesce(reporter.display_name, 'Reporter')::text,
    reporter.username::text,
    coalesce(target.display_name, 'Reported account')::text,
    target.username::text,
    target.avatar_url::text,
    report_row.assigned_moderator_id,
    (
      select count(*)
      from public.user_reports other_report
      where other_report.reported_user_id = report_row.reported_user_id
        and other_report.status in ('submitted', 'reviewing')
    )::bigint
  from public.user_reports report_row
  join public.users reporter on reporter.id = report_row.reporter_id
  join public.users target on target.id = report_row.reported_user_id
  where (p_status is null or report_row.status = p_status)
    and (p_severity is null or report_row.severity = p_severity)
  order by
    case report_row.severity
      when 'urgent' then 1
      when 'high' then 2
      when 'medium' then 3
      when 'low' then 4
      else 5
    end,
    report_row.created_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.get_moderation_report_queue(text, text, integer, integer) from public;
grant execute on function public.get_moderation_report_queue(text, text, integer, integer) to authenticated;

create or replace function public.get_moderation_report_detail(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_report public.user_reports%rowtype;
  v_result jsonb;
begin
  perform public.require_moderation_role('reviewer');

  select * into v_report
  from public.user_reports report_row
  where report_row.id = p_report_id;

  if not found then
    raise exception 'Report not found';
  end if;

  select jsonb_build_object(
    'report_id', v_report.id,
    'status', v_report.status,
    'severity', v_report.severity,
    'reason', v_report.reason,
    'details', v_report.details,
    'source_context', v_report.source_context,
    'created_at', v_report.created_at,
    'updated_at', v_report.updated_at,
    'reviewed_at', v_report.reviewed_at,
    'resolved_at', v_report.resolved_at,
    'resolution_code', v_report.resolution_code,
    'public_resolution_message', v_report.public_resolution_message,
    'internal_note', v_report.resolution_note,
    'assigned_moderator_id', v_report.assigned_moderator_id,
    'reporter', jsonb_build_object(
      'user_id', reporter.id,
      'display_name', reporter.display_name,
      'username', reporter.username,
      'avatar_url', reporter.avatar_url
    ),
    'reported_account', jsonb_build_object(
      'user_id', target.id,
      'display_name', target.display_name,
      'username', target.username,
      'avatar_url', target.avatar_url
    ),
    'open_reports_against_target', (
      select count(*)
      from public.user_reports other_report
      where other_report.reported_user_id = v_report.reported_user_id
        and other_report.status in ('submitted', 'reviewing')
    )
  ) into v_result
  from public.users reporter
  join public.users target on target.id = v_report.reported_user_id
  where reporter.id = v_report.reporter_id;

  insert into public.moderation_audit_log (
    actor_id,
    report_id,
    reported_user_id,
    action
  ) values (
    v_actor_id,
    v_report.id,
    v_report.reported_user_id,
    'view_report'
  );

  return v_result;
end;
$$;

revoke all on function public.get_moderation_report_detail(uuid) from public;
grant execute on function public.get_moderation_report_detail(uuid) to authenticated;

create or replace function public.update_moderation_report(
  p_report_id uuid,
  p_status text,
  p_severity text default null,
  p_resolution_code text default null,
  p_public_resolution_message text default null,
  p_internal_note text default null,
  p_assign_to_self boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_report public.user_reports%rowtype;
  v_old_status text;
  v_action text;
  v_clean_public text := nullif(btrim(coalesce(p_public_resolution_message, '')), '');
  v_clean_internal text := nullif(btrim(coalesce(p_internal_note, '')), '');
begin
  v_actor_role := public.require_moderation_role('reviewer');

  if p_status not in ('submitted', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'Invalid report status';
  end if;

  if p_severity is not null
     and p_severity not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'Invalid severity';
  end if;

  if p_resolution_code is not null
     and p_resolution_code not in (
       'no_action',
       'warning_issued',
       'content_removed',
       'account_restricted',
       'account_suspended',
       'escalated',
       'duplicate'
     ) then
    raise exception 'Invalid resolution';
  end if;

  if length(coalesce(v_clean_public, '')) > 500 then
    raise exception 'Public resolution message is too long';
  end if;

  if length(coalesce(v_clean_internal, '')) > 4000 then
    raise exception 'Internal note is too long';
  end if;

  select * into v_report
  from public.user_reports report_row
  where report_row.id = p_report_id
  for update;

  if not found then
    raise exception 'Report not found';
  end if;

  v_old_status := v_report.status;

  if p_status in ('resolved', 'dismissed') and p_resolution_code is null then
    raise exception 'Choose a resolution before closing the report';
  end if;

  if p_resolution_code in ('account_restricted', 'account_suspended', 'escalated')
     and public.moderation_role_rank(v_actor_role) < public.moderation_role_rank('senior') then
    raise exception 'Senior moderation access is required for this resolution';
  end if;

  update public.user_reports
  set
    status = p_status,
    severity = coalesce(p_severity, severity),
    resolution_code = case
      when p_status in ('resolved', 'dismissed') then p_resolution_code
      else null
    end,
    public_resolution_message = case
      when p_status in ('resolved', 'dismissed') then v_clean_public
      else null
    end,
    resolution_note = coalesce(v_clean_internal, resolution_note),
    assigned_moderator_id = case
      when p_assign_to_self then v_actor_id
      else assigned_moderator_id
    end,
    reviewed_at = case
      when reviewed_at is null and p_status <> 'submitted' then now()
      else reviewed_at
    end,
    resolved_at = case
      when p_status in ('resolved', 'dismissed') then now()
      else null
    end,
    updated_at = now()
  where id = p_report_id
  returning * into v_report;

  v_action := case
    when p_status = 'resolved' then 'resolve_report'
    when p_status = 'dismissed' then 'dismiss_report'
    when v_old_status <> p_status then 'update_status'
    when p_severity is not null then 'update_severity'
    when v_clean_internal is not null then 'add_internal_note'
    else 'assign_report'
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
    v_action,
    v_old_status,
    v_report.status,
    jsonb_strip_nulls(jsonb_build_object(
      'severity', v_report.severity,
      'resolution_code', v_report.resolution_code,
      'internal_note', v_clean_internal,
      'public_message_added', v_clean_public is not null,
      'assigned_to_self', p_assign_to_self
    ))
  );

  return jsonb_build_object(
    'report_id', v_report.id,
    'status', v_report.status,
    'severity', v_report.severity,
    'resolution_code', v_report.resolution_code,
    'updated_at', v_report.updated_at
  );
end;
$$;

revoke all on function public.update_moderation_report(uuid, text, text, text, text, text, boolean) from public;
grant execute on function public.update_moderation_report(uuid, text, text, text, text, text, boolean) to authenticated;

-- Ensure future report submissions expose a meaningful receipt timestamp.
create or replace function public.touch_user_report_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_user_report_updated_at_trigger
  on public.user_reports;
create trigger touch_user_report_updated_at_trigger
before update on public.user_reports
for each row execute function public.touch_user_report_updated_at();

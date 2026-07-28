-- Circles Phase 3E — private “Let’s do this again” signals
--
-- Confirmed attendees may privately tell the original host they would join a
-- similar gathering again. Only the host sees aggregate interest and the names
-- of people who opted in. The signal is not public, does not affect ranking,
-- and never creates an invitation or new event automatically.

-- ---------------------------------------------------------------------------
-- Remote control
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
      'event_repeat_signals'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'event_repeat_signals',
  true,
  'Allows confirmed attendees to privately tell the original host they would join a similar gathering again.'
)
on conflict (flag_key) do nothing;

-- ---------------------------------------------------------------------------
-- Privacy-safe analytics allowlist
-- ---------------------------------------------------------------------------

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
      'event_repeat_plan_started'
    )
  );

create or replace function public.record_event_repeat_analytics(
  p_event_name text,
  p_action text,
  p_interested_count integer default null
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
    'event_repeat_signal_updated',
    'event_repeat_plan_started'
  ) then
    return;
  end if;

  if p_action not in ('set', 'clear', 'start') then
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
      jsonb_strip_nulls(jsonb_build_object(
        'surface', 'completed_event',
        'action', p_action,
        'interested_count', case
          when p_interested_count is null then null
          else greatest(0, least(p_interested_count, 500))
        end
      ))
    );
  exception
    when others then
      -- Analytics must never block an attendee signal or event planning.
      null;
  end;
end;
$$;

revoke all on function public.record_event_repeat_analytics(text, text, integer) from public;

-- ---------------------------------------------------------------------------
-- Private attendee-to-host signals
-- ---------------------------------------------------------------------------

create table if not exists public.event_repeat_signals (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_repeat_signals_event_created_index
  on public.event_repeat_signals (event_id, created_at asc);

alter table public.event_repeat_signals enable row level security;

-- No direct table policies are intentionally created. All reads and writes go
-- through the security-definer RPCs below so only confirmed attendance and the
-- original host can reveal the private signal state.

create or replace function public.get_event_repeat_summary(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_event public.events%rowtype;
  v_can_access boolean := false;
  v_can_signal boolean := false;
  v_is_host boolean := false;
  v_viewer_interested boolean := false;
  v_interested_count integer := 0;
  v_interested_people jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'event_repeat_signals';

  if not coalesce(v_enabled, true) then
    return jsonb_build_object('available', false, 'reason', 'disabled');
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found or v_event.status = 'cancelled' then
    raise exception 'Event not found or unavailable';
  end if;

  v_can_signal := exists (
    select 1
    from public.confirmed_event_users confirmed_row
    where confirmed_row.event_id = p_event_id
      and confirmed_row.user_id = auth.uid()
  );
  v_is_host := v_event.host_id = auth.uid();
  v_can_access := public.event_viewer_can_access(p_event_id, auth.uid())
    or v_can_signal
    or v_is_host;

  if not v_can_access then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.attendance_reviewed_at is null then
    return jsonb_build_object(
      'available', false,
      'reason', 'attendance_pending',
      'can_signal', false,
      'is_host', v_is_host,
      'viewer_interested', false,
      'interested_count', case when v_is_host then 0 else null end,
      'interested_people', '[]'::jsonb
    );
  end if;

  select exists (
    select 1
    from public.event_repeat_signals signal_row
    where signal_row.event_id = p_event_id
      and signal_row.user_id = auth.uid()
  )
  into v_viewer_interested;

  select count(*)::integer
  into v_interested_count
  from public.event_repeat_signals signal_row
  join public.confirmed_event_users confirmed_row
    on confirmed_row.event_id = signal_row.event_id
   and confirmed_row.user_id = signal_row.user_id
  where signal_row.event_id = p_event_id;

  if v_is_host then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'display_name', coalesce(user_row.display_name, 'Circles member'),
          'avatar_url', user_row.avatar_url
        )
        order by signal_row.created_at asc
      ),
      '[]'::jsonb
    )
    into v_interested_people
    from public.event_repeat_signals signal_row
    join public.confirmed_event_users confirmed_row
      on confirmed_row.event_id = signal_row.event_id
     and confirmed_row.user_id = signal_row.user_id
    join public.users user_row
      on user_row.id = signal_row.user_id
    where signal_row.event_id = p_event_id;
  end if;

  return jsonb_build_object(
    'available', true,
    'can_signal', v_can_signal,
    'is_host', v_is_host,
    'viewer_interested', v_viewer_interested,
    'interested_count', case when v_is_host then v_interested_count else null end,
    'interested_people', case when v_is_host then v_interested_people else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.get_event_repeat_summary(uuid) from public;
grant execute on function public.get_event_repeat_summary(uuid) to authenticated;

create or replace function public.set_event_repeat_signal(
  p_event_id uuid,
  p_interested boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_event public.events%rowtype;
  v_interested_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'event_repeat_signals';

  if not coalesce(v_enabled, true) then
    raise exception 'Repeat-event signals are temporarily unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id
  for update;

  if not found or v_event.status = 'cancelled' then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.attendance_reviewed_at is null then
    raise exception 'The host must review attendance first';
  end if;

  if not exists (
    select 1
    from public.confirmed_event_users confirmed_row
    where confirmed_row.event_id = p_event_id
      and confirmed_row.user_id = auth.uid()
  ) then
    raise exception 'Only a confirmed attendee can send this signal';
  end if;

  if coalesce(p_interested, false) then
    insert into public.event_repeat_signals (
      event_id,
      user_id,
      created_at,
      updated_at
    )
    values (
      p_event_id,
      auth.uid(),
      now(),
      now()
    )
    on conflict (event_id, user_id)
    do update set updated_at = excluded.updated_at;
  else
    delete from public.event_repeat_signals
    where event_id = p_event_id
      and user_id = auth.uid();
  end if;

  select count(*)::integer
  into v_interested_count
  from public.event_repeat_signals signal_row
  join public.confirmed_event_users confirmed_row
    on confirmed_row.event_id = signal_row.event_id
   and confirmed_row.user_id = signal_row.user_id
  where signal_row.event_id = p_event_id;

  perform public.record_event_repeat_analytics(
    'event_repeat_signal_updated',
    case when coalesce(p_interested, false) then 'set' else 'clear' end,
    null
  );

  return jsonb_build_object(
    'interested', coalesce(p_interested, false),
    'interested_count', v_interested_count
  );
end;
$$;

revoke all on function public.set_event_repeat_signal(uuid, boolean) from public;
grant execute on function public.set_event_repeat_signal(uuid, boolean) to authenticated;

create or replace function public.record_event_repeat_plan_started(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_event public.events%rowtype;
  v_interested_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'event_repeat_signals';

  if not coalesce(v_enabled, true) then
    raise exception 'Repeat-event planning is temporarily unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found or v_event.status = 'cancelled' then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.host_id <> auth.uid() then
    raise exception 'Only the event host can start another plan';
  end if;

  if v_event.attendance_reviewed_at is null then
    raise exception 'The host must review attendance first';
  end if;

  select count(*)::integer
  into v_interested_count
  from public.event_repeat_signals signal_row
  join public.confirmed_event_users confirmed_row
    on confirmed_row.event_id = signal_row.event_id
   and confirmed_row.user_id = signal_row.user_id
  where signal_row.event_id = p_event_id;

  perform public.record_event_repeat_analytics(
    'event_repeat_plan_started',
    'start',
    v_interested_count
  );

  return jsonb_build_object('interested_count', v_interested_count);
end;
$$;

revoke all on function public.record_event_repeat_plan_started(uuid) from public;
grant execute on function public.record_event_repeat_plan_started(uuid) to authenticated;

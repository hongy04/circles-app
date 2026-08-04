-- Circles Step 21 — cozy event detail + automatic post-event attendance memory
--
-- Adds lightweight event appearance presets and makes attendance lifecycle less
-- host-dependent. Once the gathering is over, RSVPs lock. On the next morning
-- in the event's saved timezone, Going responses are converted into attendance
-- automatically. Hosts can still correct that record later.

alter table public.events
  add column if not exists appearance_key text not null default 'circle',
  add column if not exists timezone_name text,
  add column if not exists attendance_source text,
  add column if not exists attendance_assumed_at timestamptz;

alter table public.events
  drop constraint if exists events_appearance_key_check;

alter table public.events
  add constraint events_appearance_key_check check (
    appearance_key in ('circle', 'sky', 'garden', 'sunset', 'twilight', 'celebrate')
  );

alter table public.events
  drop constraint if exists events_attendance_source_check;

alter table public.events
  add constraint events_attendance_source_check check (
    attendance_source is null
    or attendance_source in ('rsvp_assumed', 'host_reviewed')
  );

-- Save optional presentation/timezone metadata after the core event has been
-- created. Keeping this separate preserves the stable event-creation RPCs.
create or replace function public.configure_event_experience(
  p_event_id uuid,
  p_appearance_key text default 'circle',
  p_timezone_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_appearance text := lower(btrim(coalesce(p_appearance_key, 'circle')));
  v_timezone text := nullif(btrim(coalesce(p_timezone_name, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id
  for update;

  if not found or not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.host_id <> auth.uid() then
    raise exception 'Only the event host can change the event look';
  end if;

  if v_appearance not in ('circle', 'sky', 'garden', 'sunset', 'twilight', 'celebrate') then
    v_appearance := 'circle';
  end if;

  if v_timezone is not null
     and not exists (select 1 from pg_timezone_names zone_row where zone_row.name = v_timezone) then
    v_timezone := null;
  end if;

  update public.events
  set
    appearance_key = v_appearance,
    timezone_name = coalesce(v_timezone, timezone_name),
    updated_at = now()
  where id = p_event_id;

  return jsonb_build_object(
    'appearance_key', v_appearance,
    'timezone_name', coalesce(v_timezone, v_event.timezone_name)
  );
end;
$$;

revoke all on function public.configure_event_experience(uuid, text, text) from public;
grant execute on function public.configure_event_experience(uuid, text, text) to authenticated;

create or replace function public.get_event_experience(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found then
    raise exception 'Event not found or unavailable';
  end if;

  return jsonb_build_object(
    'appearance_key', coalesce(v_event.appearance_key, 'circle'),
    'timezone_name', v_event.timezone_name,
    'attendance_source', v_event.attendance_source,
    'attendance_assumed_at', v_event.attendance_assumed_at
  );
end;
$$;

revoke all on function public.get_event_experience(uuid) from public;
grant execute on function public.get_event_experience(uuid) to authenticated;

-- Calculate the "next morning" in the event's own timezone. Old events that
-- predate timezone capture use a conservative 12-hour fallback.
create or replace function public.event_attendance_due_at(p_event_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_reference timestamptz;
  v_due_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found then
    raise exception 'Event not found or unavailable';
  end if;

  v_reference := coalesce(v_event.ends_at, v_event.starts_at);

  if v_event.timezone_name is not null
     and exists (select 1 from pg_timezone_names zone_row where zone_row.name = v_event.timezone_name) then
    v_due_at := (
      ((v_reference at time zone v_event.timezone_name)::date + 1) + time '08:00'
    ) at time zone v_event.timezone_name;
  else
    v_due_at := v_reference + interval '12 hours';
  end if;

  return v_due_at;
end;
$$;

revoke all on function public.event_attendance_due_at(uuid) from public;
grant execute on function public.event_attendance_due_at(uuid) to authenticated;

-- Lazily finalize attendance when a member next opens the event after the due
-- time. This avoids a required host task and does not depend on a cron job.
create or replace function public.ensure_event_attendance_finalized(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_due_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.status = 'cancelled' or v_event.attendance_reviewed_at is not null then
    return false;
  end if;

  v_due_at := public.event_attendance_due_at(p_event_id);
  if now() < v_due_at then
    return false;
  end if;

  delete from public.event_attendance
  where event_id = p_event_id;

  with eligible_users as (
    select distinct member_row.user_id
    from public.event_circles event_circle
    join public.conversation_members member_row
      on member_row.conversation_id = event_circle.conversation_id
    where event_circle.event_id = p_event_id
  )
  insert into public.event_attendance (
    event_id,
    user_id,
    attended,
    reviewed_by,
    reviewed_at
  )
  select
    p_event_id,
    eligible.user_id,
    coalesce(rsvp_row.status = 'going', false),
    null,
    now()
  from eligible_users eligible
  left join public.event_rsvps rsvp_row
    on rsvp_row.event_id = p_event_id
   and rsvp_row.user_id = eligible.user_id;

  insert into public.event_attendance (
    event_id,
    guest_id,
    attended,
    reviewed_by,
    reviewed_at
  )
  select
    p_event_id,
    guest_row.id,
    guest_row.status = 'going',
    null,
    now()
  from public.event_guests guest_row
  where guest_row.event_id = p_event_id;

  update public.events
  set
    status = 'completed',
    completed_at = coalesce(completed_at, now()),
    attendance_reviewed_at = now(),
    attendance_source = 'rsvp_assumed',
    attendance_assumed_at = now(),
    updated_at = now()
  where id = p_event_id;

  return true;
end;
$$;

revoke all on function public.ensure_event_attendance_finalized(uuid) from public;
grant execute on function public.ensure_event_attendance_finalized(uuid) to authenticated;

-- The summary is already part of Event Detail's normal read path, so this is a
-- zero-extra-round-trip place to finalize due attendance.
create or replace function public.get_event_attendance_summary(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_attended_count integer := 0;
  v_member_attendance jsonb := '[]'::jsonb;
  v_guest_attendance jsonb := '[]'::jsonb;
  v_due_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  perform public.ensure_event_attendance_finalized(p_event_id);

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found then
    raise exception 'Event not found or unavailable';
  end if;

  v_due_at := public.event_attendance_due_at(p_event_id);

  select count(*) filter (where attendance_row.attended)::integer
  into v_attended_count
  from public.event_attendance attendance_row
  where attendance_row.event_id = p_event_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', attendance_row.user_id,
        'attended', attendance_row.attended
      )
      order by attendance_row.user_id
    ),
    '[]'::jsonb
  )
  into v_member_attendance
  from public.event_attendance attendance_row
  where attendance_row.event_id = p_event_id
    and attendance_row.user_id is not null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'guest_id', attendance_row.guest_id,
        'attended', attendance_row.attended
      )
      order by attendance_row.guest_id
    ),
    '[]'::jsonb
  )
  into v_guest_attendance
  from public.event_attendance attendance_row
  where attendance_row.event_id = p_event_id
    and attendance_row.guest_id is not null;

  return jsonb_build_object(
    'status', v_event.status,
    'starts_at', v_event.starts_at,
    'is_past', coalesce(v_event.ends_at, v_event.starts_at) <= now(),
    'attendance_reviewed_at', v_event.attendance_reviewed_at,
    'completed_at', v_event.completed_at,
    'attended_count', coalesce(v_attended_count, 0),
    'member_attendance', v_member_attendance,
    'guest_attendance', v_guest_attendance,
    'appearance_key', coalesce(v_event.appearance_key, 'circle'),
    'timezone_name', v_event.timezone_name,
    'attendance_source', v_event.attendance_source,
    'attendance_assumed_at', v_event.attendance_assumed_at,
    'attendance_due_at', v_due_at
  );
end;
$$;

revoke all on function public.get_event_attendance_summary(uuid) from public;
grant execute on function public.get_event_attendance_summary(uuid) to authenticated;

-- RSVP writes close once the gathering has actually ended (or at start time
-- when no end time was supplied). This applies below the UI as well.
create or replace function public.respond_to_event(
  p_event_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_status not in ('going', 'maybe', 'not_going') then
    raise exception 'RSVP must be Going, Maybe, or Not Going';
  end if;

  if not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id;

  if not found then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.status = 'cancelled' then
    raise exception 'This event has been cancelled';
  end if;

  if v_event.attendance_reviewed_at is not null
     or coalesce(v_event.ends_at, v_event.starts_at) <= now() then
    raise exception 'RSVPs are closed for this past event';
  end if;

  insert into public.event_rsvps (
    event_id,
    user_id,
    status,
    responded_at
  )
  values (
    p_event_id,
    auth.uid(),
    p_status,
    now()
  )
  on conflict (event_id, user_id)
  do update set
    status = excluded.status,
    responded_at = excluded.responded_at;

  return jsonb_build_object('status', p_status);
end;
$$;

revoke all on function public.respond_to_event(uuid, text) from public;
grant execute on function public.respond_to_event(uuid, text) to authenticated;

-- Also protect guest RSVP/status writes, including private guest-link flows,
-- without having to duplicate every historical guest RPC.
create or replace function public.prevent_past_event_response_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_event public.events%rowtype;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  v_event_id := new.event_id;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = v_event_id;

  if found and (
    v_event.status <> 'scheduled'
    or v_event.attendance_reviewed_at is not null
    or coalesce(v_event.ends_at, v_event.starts_at) <= now()
  ) then
    raise exception 'Responses are closed for this past event';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_past_event_response_changes() from public;

-- Existing host creation inserts the host RSVP before the event, so this does
-- not interfere with event creation.
drop trigger if exists prevent_past_event_rsvp_changes on public.event_rsvps;
create trigger prevent_past_event_rsvp_changes
before insert or update on public.event_rsvps
for each row execute function public.prevent_past_event_response_changes();

drop trigger if exists prevent_past_event_guest_response_changes on public.event_guests;
create trigger prevent_past_event_guest_response_changes
before insert or update on public.event_guests
for each row execute function public.prevent_past_event_response_changes();

-- The existing review RPC remains the host's correction tool. This tiny marker
-- lets the UI distinguish a host correction from automatic RSVP assumptions.
create or replace function public.mark_event_attendance_host_reviewed(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = p_event_id
  for update;

  if not found or not public.event_viewer_can_access(p_event_id, auth.uid()) then
    raise exception 'Event not found or unavailable';
  end if;

  if v_event.host_id <> auth.uid() then
    raise exception 'Only the event host can correct attendance';
  end if;

  if v_event.attendance_reviewed_at is null then
    raise exception 'Attendance has not been saved yet';
  end if;

  update public.events
  set
    attendance_source = 'host_reviewed',
    updated_at = now()
  where id = p_event_id;

  return true;
end;
$$;

revoke all on function public.mark_event_attendance_host_reviewed(uuid) from public;
grant execute on function public.mark_event_attendance_host_reviewed(uuid) to authenticated;

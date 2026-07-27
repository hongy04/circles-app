-- Circles Phase 3B hotfix — existing-member account choice
--
-- The guest claim guardrail must continue preventing one account from being
-- represented twice in the same event. Instead of throwing a raw error when
-- the active account already has a member attendance row, return a structured
-- outcome so the app can offer either "Open event" or "Use another account."

create or replace function public.claim_event_guest_attendance(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_resolved record;
  v_event public.events%rowtype;
  v_guest public.event_guests%rowtype;
  v_attended boolean := false;
  v_already_claimed boolean := false;
  v_has_member_attendance boolean := false;
  v_member_attended boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'guest_attendance_claims';

  if not coalesce(v_enabled, true) then
    raise exception 'Guest attendance claiming is temporarily unavailable';
  end if;

  select *
  into v_resolved
  from public.resolve_event_guest_token(p_token)
  limit 1;

  if not found then
    raise exception 'Invitation not found or unavailable';
  end if;

  if v_resolved.guest_id is null then
    raise exception 'Submit your name and RSVP before joining Circles';
  end if;

  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = v_resolved.event_id;

  if not found or v_event.status = 'cancelled' then
    raise exception 'This event is unavailable';
  end if;

  if v_event.attendance_reviewed_at is null then
    raise exception 'The host has not reviewed attendance yet';
  end if;

  select guest_row.*
  into v_guest
  from public.event_guests guest_row
  where guest_row.id = v_resolved.guest_id
    and guest_row.event_id = v_resolved.event_id
  for update;

  if not found then
    raise exception 'Guest attendance could not be found';
  end if;

  select coalesce(attendance_row.attended, false)
  into v_attended
  from public.event_attendance attendance_row
  where attendance_row.event_id = v_event.id
    and attendance_row.guest_id = v_guest.id;

  if not coalesce(v_attended, false) then
    raise exception 'Only a guest confirmed as attended can claim this event';
  end if;

  if v_guest.claimed_user_id is not null then
    if v_guest.claimed_user_id <> auth.uid() then
      raise exception 'This guest attendance is already linked to another account';
    end if;
    v_already_claimed := true;
  else
    select
      count(*) > 0,
      coalesce(bool_or(member_attendance.attended), false)
    into v_has_member_attendance, v_member_attended
    from public.event_attendance member_attendance
    where member_attendance.event_id = v_event.id
      and member_attendance.user_id = auth.uid();

    if v_has_member_attendance then
      return jsonb_build_object(
        'outcome', 'member_attendee',
        'event_id', v_event.id,
        'event_title', v_event.title,
        'starts_at', v_event.starts_at,
        'attendance_reviewed_at', v_event.attendance_reviewed_at,
        'viewer_attended', v_member_attended
      );
    end if;

    if exists (
      select 1
      from public.event_guests other_guest
      where other_guest.event_id = v_event.id
        and other_guest.claimed_user_id = auth.uid()
        and other_guest.id <> v_guest.id
    ) then
      raise exception 'This account already claimed another guest identity for this event';
    end if;

    update public.event_guests
    set
      claimed_user_id = auth.uid(),
      claimed_account_at = now(),
      updated_at = now()
    where id = v_guest.id;
  end if;

  perform public.record_guest_attendance_claim_analytics(
    'claim',
    v_already_claimed
  );

  return jsonb_build_object(
    'outcome', case when v_already_claimed then 'already_claimed' else 'claimed' end,
    'event_id', v_event.id,
    'event_title', v_event.title,
    'starts_at', v_event.starts_at,
    'attendance_reviewed_at', v_event.attendance_reviewed_at
  );
end;
$$;

revoke all on function public.claim_event_guest_attendance(text) from public;
grant execute on function public.claim_event_guest_attendance(text) to authenticated;

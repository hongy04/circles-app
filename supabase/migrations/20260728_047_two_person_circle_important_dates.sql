-- Circles Phase 7A — Important Dates for two-person Circles
--
-- Adds a lightweight shared record of anniversaries, birthdays, trips,
-- traditions, and other dates that matter. This is intentionally not a
-- general productivity calendar and creates no streaks or relationship scores.

-- ---------------------------------------------------------------------------
-- Feature control and privacy-safe analytics allowlist
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
      'two_person_circle_important_dates'
    )
  );

insert into public.app_feature_flags (
  flag_key,
  enabled,
  description
)
values (
  'two_person_circle_important_dates',
  true,
  'Enables lightweight Important Dates inside an unlocked two-person Circle.'
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
      'two_person_important_date_removed'
    )
  );

create or replace function public.record_two_person_important_date_analytics(
  p_event_name text,
  p_action text,
  p_category text,
  p_recurrence text
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
    'two_person_important_date_created',
    'two_person_important_date_updated',
    'two_person_important_date_removed'
  ) then
    return;
  end if;

  if p_action not in ('create', 'update', 'remove') then
    return;
  end if;

  if p_category not in (
    'anniversary',
    'birthday',
    'trip',
    'tradition',
    'meaningful'
  ) then
    return;
  end if;

  if p_recurrence not in ('none', 'yearly') then
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
        'surface', 'two_person_circle_important_dates',
        'action', p_action,
        'category', p_category,
        'recurrence', p_recurrence
      )
    );
  exception
    when others then
      null;
  end;
end;
$$;

revoke all on function public.record_two_person_important_date_analytics(
  text,
  text,
  text,
  text
) from public;

-- ---------------------------------------------------------------------------
-- Important-date storage
-- ---------------------------------------------------------------------------

create table if not exists public.two_person_circle_important_dates (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  title text not null,
  note text not null default '',
  date_value date not null,
  category text not null default 'meaningful',
  recurrence text not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint two_person_important_date_title_length check (
    length(trim(title)) between 1 and 100
  ),
  constraint two_person_important_date_note_length check (
    length(note) <= 800
  ),
  constraint two_person_important_date_category_check check (
    category in (
      'anniversary',
      'birthday',
      'trip',
      'tradition',
      'meaningful'
    )
  ),
  constraint two_person_important_date_recurrence_check check (
    recurrence in ('none', 'yearly')
  )
);

create index if not exists two_person_important_dates_conversation_idx
  on public.two_person_circle_important_dates (
    conversation_id,
    date_value,
    updated_at desc
  );

alter table public.two_person_circle_important_dates enable row level security;

revoke insert, update, delete
  on table public.two_person_circle_important_dates
  from anon, authenticated;

drop policy if exists two_person_important_dates_select
  on public.two_person_circle_important_dates;

create policy two_person_important_dates_select
on public.two_person_circle_important_dates
for select
to authenticated
using (
  public.two_person_circle_is_unlocked(conversation_id, auth.uid())
);

-- Writes remain RPC-only. The narrow SELECT policy supports authorized Realtime
-- updates for both members while the shared Circle is open.

do $$
begin
  alter publication supabase_realtime
    add table public.two_person_circle_important_dates;
exception
  when duplicate_object then
    null;
  when undefined_object then
    null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.two_person_important_dates_feature_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select flag_row.enabled
      from public.app_feature_flags flag_row
      where flag_row.flag_key = 'two_person_circle_important_dates'
    ),
    true
  );
$$;

revoke all on function public.two_person_important_dates_feature_enabled()
  from public;

create or replace function public.two_person_important_date_json(
  p_important_date_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'important_date_id', date_row.id,
    'conversation_id', date_row.conversation_id,
    'title', date_row.title,
    'note', date_row.note,
    'date_value', date_row.date_value,
    'category', date_row.category,
    'recurrence', date_row.recurrence,
    'created_by', date_row.created_by,
    'created_by_name', creator_user.display_name,
    'updated_by', date_row.updated_by,
    'updated_by_name', updater_user.display_name,
    'created_at', date_row.created_at,
    'updated_at', date_row.updated_at
  )
  from public.two_person_circle_important_dates date_row
  left join public.users creator_user on creator_user.id = date_row.created_by
  left join public.users updater_user on updater_user.id = date_row.updated_by
  where date_row.id = p_important_date_id;
$$;

revoke all on function public.two_person_important_date_json(uuid)
  from public;

-- ---------------------------------------------------------------------------
-- Read RPCs
-- ---------------------------------------------------------------------------

create or replace function public.list_two_person_circle_important_dates(
  p_conversation_id uuid
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.two_person_important_dates_feature_enabled() then
    raise exception 'Important dates are temporarily unavailable.';
  end if;

  if not public.two_person_circle_is_unlocked(
    p_conversation_id,
    auth.uid()
  ) then
    raise exception 'Our Circle is closed or unavailable.';
  end if;

  return query
  select public.two_person_important_date_json(date_row.id)
  from public.two_person_circle_important_dates date_row
  where date_row.conversation_id = p_conversation_id
  order by date_row.date_value, date_row.updated_at desc;
end;
$$;

revoke all on function public.list_two_person_circle_important_dates(uuid)
  from public;
grant execute on function public.list_two_person_circle_important_dates(uuid)
  to authenticated;

create or replace function public.get_two_person_circle_important_date(
  p_important_date_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.two_person_important_dates_feature_enabled() then
    raise exception 'Important dates are temporarily unavailable.';
  end if;

  select date_row.conversation_id
  into v_conversation_id
  from public.two_person_circle_important_dates date_row
  where date_row.id = p_important_date_id;

  if v_conversation_id is null
     or not public.two_person_circle_is_unlocked(
       v_conversation_id,
       auth.uid()
     ) then
    raise exception 'This important date is unavailable.';
  end if;

  v_result := public.two_person_important_date_json(p_important_date_id);
  if v_result is null then
    raise exception 'This important date is unavailable.';
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_two_person_circle_important_date(uuid)
  from public;
grant execute on function public.get_two_person_circle_important_date(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Create, update, and remove
-- ---------------------------------------------------------------------------

create or replace function public.create_two_person_circle_important_date(
  p_conversation_id uuid,
  p_title text,
  p_note text,
  p_date_value date,
  p_category text,
  p_recurrence text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_note text := trim(coalesce(p_note, ''));
  v_category text := lower(trim(coalesce(p_category, 'meaningful')));
  v_recurrence text := lower(trim(coalesce(p_recurrence, 'none')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.two_person_important_dates_feature_enabled() then
    raise exception 'Important dates are temporarily unavailable.';
  end if;

  if not public.two_person_circle_is_unlocked(
    p_conversation_id,
    auth.uid()
  ) then
    raise exception 'Our Circle is closed or unavailable.';
  end if;

  if length(v_title) < 1 or length(v_title) > 100 then
    raise exception 'Important-date titles must be between 1 and 100 characters.';
  end if;

  if length(v_note) > 800 then
    raise exception 'The note is too long.';
  end if;

  if p_date_value is null then
    raise exception 'Choose a valid date.';
  end if;

  if v_category not in (
    'anniversary', 'birthday', 'trip', 'tradition', 'meaningful'
  ) then
    raise exception 'Choose a valid date type.';
  end if;

  if v_recurrence not in ('none', 'yearly') then
    raise exception 'Choose a valid recurrence.';
  end if;

  insert into public.two_person_circle_important_dates (
    conversation_id,
    created_by,
    updated_by,
    title,
    note,
    date_value,
    category,
    recurrence
  )
  values (
    p_conversation_id,
    auth.uid(),
    auth.uid(),
    v_title,
    v_note,
    p_date_value,
    v_category,
    v_recurrence
  )
  returning id into v_id;

  perform public.record_two_person_important_date_analytics(
    'two_person_important_date_created',
    'create',
    v_category,
    v_recurrence
  );

  return v_id;
end;
$$;

revoke all on function public.create_two_person_circle_important_date(
  uuid,
  text,
  text,
  date,
  text,
  text
) from public;
grant execute on function public.create_two_person_circle_important_date(
  uuid,
  text,
  text,
  date,
  text,
  text
) to authenticated;

create or replace function public.update_two_person_circle_important_date(
  p_important_date_id uuid,
  p_title text,
  p_note text,
  p_date_value date,
  p_category text,
  p_recurrence text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date public.two_person_circle_important_dates%rowtype;
  v_title text := trim(coalesce(p_title, ''));
  v_note text := trim(coalesce(p_note, ''));
  v_category text := lower(trim(coalesce(p_category, 'meaningful')));
  v_recurrence text := lower(trim(coalesce(p_recurrence, 'none')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_date
  from public.two_person_circle_important_dates date_row
  where date_row.id = p_important_date_id
  for update;

  if v_date.id is null
     or not public.two_person_circle_is_unlocked(
       v_date.conversation_id,
       auth.uid()
     ) then
    raise exception 'This important date is unavailable.';
  end if;

  if length(v_title) < 1 or length(v_title) > 100
     or length(v_note) > 800
     or p_date_value is null then
    raise exception 'Check the title, note, and date.';
  end if;

  if v_category not in (
    'anniversary', 'birthday', 'trip', 'tradition', 'meaningful'
  ) then
    raise exception 'Choose a valid date type.';
  end if;

  if v_recurrence not in ('none', 'yearly') then
    raise exception 'Choose a valid recurrence.';
  end if;

  update public.two_person_circle_important_dates date_row
  set
    title = v_title,
    note = v_note,
    date_value = p_date_value,
    category = v_category,
    recurrence = v_recurrence,
    updated_by = auth.uid(),
    updated_at = now()
  where date_row.id = p_important_date_id;

  perform public.record_two_person_important_date_analytics(
    'two_person_important_date_updated',
    'update',
    v_category,
    v_recurrence
  );

  return public.two_person_important_date_json(p_important_date_id);
end;
$$;

revoke all on function public.update_two_person_circle_important_date(
  uuid,
  text,
  text,
  date,
  text,
  text
) from public;
grant execute on function public.update_two_person_circle_important_date(
  uuid,
  text,
  text,
  date,
  text,
  text
) to authenticated;

create or replace function public.delete_two_person_circle_important_date(
  p_important_date_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date public.two_person_circle_important_dates%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_date
  from public.two_person_circle_important_dates date_row
  where date_row.id = p_important_date_id
  for update;

  if v_date.id is null
     or not public.two_person_circle_is_unlocked(
       v_date.conversation_id,
       auth.uid()
     ) then
    raise exception 'This important date is unavailable.';
  end if;

  delete from public.two_person_circle_important_dates date_row
  where date_row.id = p_important_date_id;

  perform public.record_two_person_important_date_analytics(
    'two_person_important_date_removed',
    'remove',
    v_date.category,
    v_date.recurrence
  );

  return true;
end;
$$;

revoke all on function public.delete_two_person_circle_important_date(uuid)
  from public;
grant execute on function public.delete_two_person_circle_important_date(uuid)
  to authenticated;

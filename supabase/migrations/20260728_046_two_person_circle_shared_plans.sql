-- Circles Phase 6B — shared Plans for two-person Circles
--
-- Adds a lightweight, consent-based planning lifecycle:
-- Idea -> proposed -> scheduled -> completed memory.
-- Plans are available only while the preserved two-person Circle is unlocked.
-- A proposed date is scheduled only after the other person accepts it.

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
      'two_person_circle_plans'
    )
  );

insert into public.app_feature_flags (
  flag_key,
  enabled,
  description
)
values (
  'two_person_circle_plans',
  true,
  'Enables lightweight shared Plans inside an unlocked two-person Circle.'
)
on conflict (flag_key) do nothing;

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
      'two_person_plan_completed'
    )
  );

create or replace function public.record_two_person_plan_analytics(
  p_event_name text,
  p_action text,
  p_status text
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
    'two_person_plan_created',
    'two_person_plan_updated',
    'two_person_plan_response_updated',
    'two_person_plan_completed'
  ) then
    return;
  end if;

  if p_action not in (
    'idea',
    'edit_idea',
    'propose',
    'revise',
    'accept',
    'tentative',
    'complete',
    'remove'
  ) then
    return;
  end if;

  if p_status not in ('idea', 'proposed', 'scheduled', 'completed', 'removed') then
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
        'surface', 'two_person_circle_plans',
        'action', p_action,
        'status', p_status
      )
    );
  exception
    when others then
      null;
  end;
end;
$$;

revoke all on function public.record_two_person_plan_analytics(text, text, text)
  from public;

-- ---------------------------------------------------------------------------
-- Shared plan storage
-- ---------------------------------------------------------------------------

create table if not exists public.two_person_circle_plans (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  title text not null,
  note text not null default '',
  location_name text not null default '',
  status text not null default 'idea',
  starts_at timestamptz,
  proposal_by uuid references public.users(id) on delete set null,
  proposal_version integer not null default 0,
  response_state text not null default 'none',
  tentative_by uuid references public.users(id) on delete set null,
  accepted_by uuid references public.users(id) on delete set null,
  accepted_at timestamptz,
  completed_by uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  memory_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint two_person_circle_plan_title_length check (
    length(trim(title)) between 1 and 120
  ),
  constraint two_person_circle_plan_note_length check (
    length(note) <= 1200
  ),
  constraint two_person_circle_plan_location_length check (
    length(location_name) <= 200
  ),
  constraint two_person_circle_plan_memory_length check (
    length(memory_note) <= 1200
  ),
  constraint two_person_circle_plan_status_check check (
    status in ('idea', 'proposed', 'scheduled', 'completed')
  ),
  constraint two_person_circle_plan_response_check check (
    response_state in ('none', 'pending', 'tentative', 'accepted')
  ),
  constraint two_person_circle_plan_proposal_version check (
    proposal_version >= 0
  ),
  constraint two_person_circle_plan_completion_order check (
    completed_at is null or completed_at >= created_at
  )
);

create index if not exists two_person_circle_plans_conversation_status_index
  on public.two_person_circle_plans (
    conversation_id,
    status,
    starts_at,
    updated_at desc
  );

alter table public.two_person_circle_plans enable row level security;

drop policy if exists two_person_circle_plans_select_open_members
  on public.two_person_circle_plans;

create policy two_person_circle_plans_select_open_members
  on public.two_person_circle_plans
  for select
  to authenticated
  using (
    public.two_person_circle_is_unlocked(conversation_id, auth.uid())
  );

-- Writes remain RPC-only. The narrow SELECT policy supports authorized Realtime
-- updates for the two members while the shared Circle is open.

do $$
begin
  alter publication supabase_realtime
    add table public.two_person_circle_plans;
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

create or replace function public.two_person_plans_feature_enabled()
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
      where flag_row.flag_key = 'two_person_circle_plans'
    ),
    true
  );
$$;

revoke all on function public.two_person_plans_feature_enabled() from public;

create or replace function public.two_person_plan_json(
  p_plan_id uuid,
  p_viewer_id uuid default auth.uid()
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plan_id', plan_row.id,
    'conversation_id', plan_row.conversation_id,
    'title', plan_row.title,
    'note', plan_row.note,
    'location_name', plan_row.location_name,
    'status', plan_row.status,
    'starts_at', plan_row.starts_at,
    'proposal_by', plan_row.proposal_by,
    'proposal_by_name', proposal_user.display_name,
    'response_state', plan_row.response_state,
    'tentative_by', plan_row.tentative_by,
    'tentative_by_name', tentative_user.display_name,
    'accepted_by', plan_row.accepted_by,
    'accepted_by_name', accepted_user.display_name,
    'accepted_at', plan_row.accepted_at,
    'completed_by', plan_row.completed_by,
    'completed_by_name', completed_user.display_name,
    'completed_at', plan_row.completed_at,
    'memory_note', plan_row.memory_note,
    'created_by', plan_row.created_by,
    'created_by_name', creator_user.display_name,
    'created_at', plan_row.created_at,
    'updated_at', plan_row.updated_at,
    'is_proposal_mine', plan_row.proposal_by = p_viewer_id,
    'can_respond', (
      plan_row.status = 'proposed'
      and plan_row.proposal_by is distinct from p_viewer_id
    ),
    'can_edit', plan_row.status in ('idea', 'proposed'),
    'can_complete', plan_row.status = 'scheduled'
  )
  from public.two_person_circle_plans plan_row
  left join public.users proposal_user on proposal_user.id = plan_row.proposal_by
  left join public.users tentative_user on tentative_user.id = plan_row.tentative_by
  left join public.users accepted_user on accepted_user.id = plan_row.accepted_by
  left join public.users completed_user on completed_user.id = plan_row.completed_by
  left join public.users creator_user on creator_user.id = plan_row.created_by
  where plan_row.id = p_plan_id;
$$;

revoke all on function public.two_person_plan_json(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- Read RPCs
-- ---------------------------------------------------------------------------

create or replace function public.list_two_person_circle_plans(
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

  if not public.two_person_plans_feature_enabled() then
    raise exception 'Shared plans are temporarily unavailable.';
  end if;

  if not public.two_person_circle_is_unlocked(
    p_conversation_id,
    auth.uid()
  ) then
    raise exception 'Our Circle is closed or unavailable.';
  end if;

  return query
  select public.two_person_plan_json(plan_row.id, auth.uid())
  from public.two_person_circle_plans plan_row
  where plan_row.conversation_id = p_conversation_id
  order by
    case plan_row.status
      when 'scheduled' then 1
      when 'proposed' then 2
      when 'idea' then 3
      else 4
    end,
    plan_row.starts_at nulls last,
    plan_row.completed_at desc nulls last,
    plan_row.updated_at desc;
end;
$$;

revoke all on function public.list_two_person_circle_plans(uuid) from public;
grant execute on function public.list_two_person_circle_plans(uuid)
  to authenticated;

create or replace function public.get_two_person_circle_plan(
  p_plan_id uuid
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

  if not public.two_person_plans_feature_enabled() then
    raise exception 'Shared plans are temporarily unavailable.';
  end if;

  select plan_row.conversation_id
  into v_conversation_id
  from public.two_person_circle_plans plan_row
  where plan_row.id = p_plan_id;

  if v_conversation_id is null
     or not public.two_person_circle_is_unlocked(v_conversation_id, auth.uid()) then
    raise exception 'This shared plan is unavailable.';
  end if;

  v_result := public.two_person_plan_json(p_plan_id, auth.uid());
  if v_result is null then
    raise exception 'This shared plan is unavailable.';
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_two_person_circle_plan(uuid) from public;
grant execute on function public.get_two_person_circle_plan(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Idea and proposal lifecycle
-- ---------------------------------------------------------------------------

create or replace function public.create_two_person_plan_idea(
  p_conversation_id uuid,
  p_title text,
  p_note text default '',
  p_location_name text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_plan_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_note text := trim(coalesce(p_note, ''));
  v_location text := trim(coalesce(p_location_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.two_person_plans_feature_enabled() then
    raise exception 'Shared plans are temporarily unavailable.';
  end if;

  if not public.two_person_circle_is_unlocked(
    p_conversation_id,
    auth.uid()
  ) then
    raise exception 'Our Circle is closed or unavailable.';
  end if;

  if length(v_title) < 1 or length(v_title) > 120 then
    raise exception 'Plan titles must be between 1 and 120 characters.';
  end if;

  if length(v_note) > 1200 or length(v_location) > 200 then
    raise exception 'Plan details are too long.';
  end if;

  insert into public.two_person_circle_plans (
    conversation_id,
    created_by,
    updated_by,
    title,
    note,
    location_name,
    status,
    response_state
  )
  values (
    p_conversation_id,
    auth.uid(),
    auth.uid(),
    v_title,
    v_note,
    v_location,
    'idea',
    'none'
  )
  returning id into v_plan_id;

  perform public.record_two_person_plan_analytics(
    'two_person_plan_created',
    'idea',
    'idea'
  );

  return v_plan_id;
end;
$$;

revoke all on function public.create_two_person_plan_idea(uuid, text, text, text)
  from public;
grant execute on function public.create_two_person_plan_idea(uuid, text, text, text)
  to authenticated;

create or replace function public.update_two_person_plan_idea(
  p_plan_id uuid,
  p_title text,
  p_note text default '',
  p_location_name text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.two_person_circle_plans%rowtype;
  v_title text := trim(coalesce(p_title, ''));
  v_note text := trim(coalesce(p_note, ''));
  v_location text := trim(coalesce(p_location_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_plan
  from public.two_person_circle_plans plan_row
  where plan_row.id = p_plan_id
  for update;

  if v_plan.id is null
     or not public.two_person_circle_is_unlocked(
       v_plan.conversation_id,
       auth.uid()
     ) then
    raise exception 'This shared plan is unavailable.';
  end if;

  if v_plan.status <> 'idea' then
    raise exception 'Only an unscheduled idea can be edited this way.';
  end if;

  if length(v_title) < 1 or length(v_title) > 120
     or length(v_note) > 1200
     or length(v_location) > 200 then
    raise exception 'Check the plan title and details.';
  end if;

  update public.two_person_circle_plans plan_row
  set
    title = v_title,
    note = v_note,
    location_name = v_location,
    updated_by = auth.uid(),
    updated_at = now()
  where plan_row.id = p_plan_id;

  perform public.record_two_person_plan_analytics(
    'two_person_plan_updated',
    'edit_idea',
    'idea'
  );

  return public.two_person_plan_json(p_plan_id, auth.uid());
end;
$$;

revoke all on function public.update_two_person_plan_idea(uuid, text, text, text)
  from public;
grant execute on function public.update_two_person_plan_idea(uuid, text, text, text)
  to authenticated;

create or replace function public.propose_two_person_plan(
  p_plan_id uuid,
  p_title text,
  p_note text,
  p_location_name text,
  p_starts_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.two_person_circle_plans%rowtype;
  v_title text := trim(coalesce(p_title, ''));
  v_note text := trim(coalesce(p_note, ''));
  v_location text := trim(coalesce(p_location_name, ''));
  v_action text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_plan
  from public.two_person_circle_plans plan_row
  where plan_row.id = p_plan_id
  for update;

  if v_plan.id is null
     or not public.two_person_circle_is_unlocked(
       v_plan.conversation_id,
       auth.uid()
     ) then
    raise exception 'This shared plan is unavailable.';
  end if;

  if v_plan.status not in ('idea', 'proposed') then
    raise exception 'This plan can no longer be proposed.';
  end if;

  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'Choose a future date and time.';
  end if;

  if length(v_title) < 1 or length(v_title) > 120
     or length(v_note) > 1200
     or length(v_location) > 200 then
    raise exception 'Check the plan title and details.';
  end if;

  v_action := case when v_plan.status = 'idea' then 'propose' else 'revise' end;

  update public.two_person_circle_plans plan_row
  set
    title = v_title,
    note = v_note,
    location_name = v_location,
    status = 'proposed',
    starts_at = p_starts_at,
    proposal_by = auth.uid(),
    proposal_version = plan_row.proposal_version + 1,
    response_state = 'pending',
    tentative_by = null,
    accepted_by = null,
    accepted_at = null,
    updated_by = auth.uid(),
    updated_at = now()
  where plan_row.id = p_plan_id;

  perform public.record_two_person_plan_analytics(
    'two_person_plan_updated',
    v_action,
    'proposed'
  );

  return public.two_person_plan_json(p_plan_id, auth.uid());
end;
$$;

revoke all on function public.propose_two_person_plan(uuid, text, text, text, timestamptz)
  from public;
grant execute on function public.propose_two_person_plan(uuid, text, text, text, timestamptz)
  to authenticated;

create or replace function public.respond_two_person_plan(
  p_plan_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.two_person_circle_plans%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if v_action not in ('accept', 'tentative') then
    raise exception 'Choose accept or tentative.';
  end if;

  select *
  into v_plan
  from public.two_person_circle_plans plan_row
  where plan_row.id = p_plan_id
  for update;

  if v_plan.id is null
     or not public.two_person_circle_is_unlocked(
       v_plan.conversation_id,
       auth.uid()
     ) then
    raise exception 'This shared plan is unavailable.';
  end if;

  if v_plan.status <> 'proposed' then
    raise exception 'This proposal is no longer waiting for a response.';
  end if;

  if v_plan.proposal_by = auth.uid() then
    raise exception 'The other person must respond to your proposal.';
  end if;

  if v_action = 'accept' then
    update public.two_person_circle_plans plan_row
    set
      status = 'scheduled',
      response_state = 'accepted',
      tentative_by = null,
      accepted_by = auth.uid(),
      accepted_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
    where plan_row.id = p_plan_id;

    perform public.record_two_person_plan_analytics(
      'two_person_plan_response_updated',
      'accept',
      'scheduled'
    );
  else
    update public.two_person_circle_plans plan_row
    set
      response_state = 'tentative',
      tentative_by = auth.uid(),
      updated_by = auth.uid(),
      updated_at = now()
    where plan_row.id = p_plan_id;

    perform public.record_two_person_plan_analytics(
      'two_person_plan_response_updated',
      'tentative',
      'proposed'
    );
  end if;

  return public.two_person_plan_json(p_plan_id, auth.uid());
end;
$$;

revoke all on function public.respond_two_person_plan(uuid, text) from public;
grant execute on function public.respond_two_person_plan(uuid, text)
  to authenticated;

create or replace function public.complete_two_person_plan(
  p_plan_id uuid,
  p_memory_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.two_person_circle_plans%rowtype;
  v_memory_note text := trim(coalesce(p_memory_note, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_plan
  from public.two_person_circle_plans plan_row
  where plan_row.id = p_plan_id
  for update;

  if v_plan.id is null
     or not public.two_person_circle_is_unlocked(
       v_plan.conversation_id,
       auth.uid()
     ) then
    raise exception 'This shared plan is unavailable.';
  end if;

  if v_plan.status <> 'scheduled' then
    raise exception 'Only a scheduled plan can become a memory.';
  end if;

  if length(v_memory_note) > 1200 then
    raise exception 'The memory note is too long.';
  end if;

  update public.two_person_circle_plans plan_row
  set
    status = 'completed',
    completed_by = auth.uid(),
    completed_at = now(),
    memory_note = v_memory_note,
    updated_by = auth.uid(),
    updated_at = now()
  where plan_row.id = p_plan_id;

  perform public.record_two_person_plan_analytics(
    'two_person_plan_completed',
    'complete',
    'completed'
  );

  return public.two_person_plan_json(p_plan_id, auth.uid());
end;
$$;

revoke all on function public.complete_two_person_plan(uuid, text) from public;
grant execute on function public.complete_two_person_plan(uuid, text)
  to authenticated;

create or replace function public.delete_two_person_plan(
  p_plan_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.two_person_circle_plans%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_plan
  from public.two_person_circle_plans plan_row
  where plan_row.id = p_plan_id
  for update;

  if v_plan.id is null
     or not public.two_person_circle_is_unlocked(
       v_plan.conversation_id,
       auth.uid()
     ) then
    raise exception 'This shared plan is unavailable.';
  end if;

  if v_plan.status not in ('idea', 'proposed') then
    raise exception 'Scheduled plans and memories cannot be removed here.';
  end if;

  delete from public.two_person_circle_plans plan_row
  where plan_row.id = p_plan_id;

  perform public.record_two_person_plan_analytics(
    'two_person_plan_updated',
    'remove',
    'removed'
  );

  return true;
end;
$$;

revoke all on function public.delete_two_person_plan(uuid) from public;
grant execute on function public.delete_two_person_plan(uuid)
  to authenticated;

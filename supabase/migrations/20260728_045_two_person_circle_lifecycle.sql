-- Circles Phase 6A refinement — two-person Circle lifecycle and consent
--
-- Keeps a two-person Circle as preserved shared history while requiring current
-- mutual consent for access. Ending Focus locks the Circle. Fresh Mutual
-- Interest, fresh Mutual Focus, and a fresh proposal are required to reopen it.
-- The existing direct conversation remains separate from the locked Circle
-- history, and activation automatically pins the conversation for both people.

-- ---------------------------------------------------------------------------
-- Persistent lock state and provenance periods
-- ---------------------------------------------------------------------------

alter table public.conversations
  add column if not exists circle_locked_at timestamptz;

alter table public.conversations
  add column if not exists circle_last_unlocked_at timestamptz;

update public.conversations conversation_row
set circle_last_unlocked_at = coalesce(
  conversation_row.circle_last_unlocked_at,
  conversation_row.circle_activated_at,
  conversation_row.updated_at,
  conversation_row.created_at
)
where conversation_row.kind = 'direct'
  and conversation_row.circle_enabled
  and conversation_row.circle_locked_at is null;

create table if not exists public.two_person_circle_access_periods (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint two_person_circle_access_period_order check (
    closed_at is null or closed_at >= opened_at
  )
);

create unique index if not exists two_person_circle_one_open_period_index
  on public.two_person_circle_access_periods (conversation_id)
  where closed_at is null;

create index if not exists two_person_circle_period_lookup_index
  on public.two_person_circle_access_periods (
    conversation_id,
    opened_at,
    closed_at
  );

alter table public.two_person_circle_access_periods enable row level security;

-- Backfill the first active period for Circles created by Migration 044.
insert into public.two_person_circle_access_periods (
  conversation_id,
  opened_at,
  opened_by
)
select
  conversation_row.id,
  coalesce(conversation_row.circle_activated_at, conversation_row.created_at),
  conversation_row.created_by
from public.conversations conversation_row
where conversation_row.kind = 'direct'
  and conversation_row.circle_enabled
  and conversation_row.circle_locked_at is null
  and not exists (
    select 1
    from public.two_person_circle_access_periods period_row
    where period_row.conversation_id = conversation_row.id
  );

-- Each member owns one quiet message. The other member may read it only while
-- the shared Circle is open through the details RPC below.
create table if not exists public.two_person_circle_silent_messages (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, author_id),
  constraint two_person_circle_silent_message_length check (
    length(trim(body)) between 1 and 160
  )
);

alter table public.two_person_circle_silent_messages enable row level security;

-- Accepted proposal rows become locked proposal rows when the shared Circle is
-- closed, allowing a later consent cycle to reuse the same Circle.
alter table public.two_person_circle_proposal_states
  drop constraint if exists two_person_circle_proposal_states_status_check;

alter table public.two_person_circle_proposal_states
  add constraint two_person_circle_proposal_states_status_check check (
    status in ('pending', 'not_yet', 'accepted', 'locked')
  );

-- ---------------------------------------------------------------------------
-- Shared lifecycle helpers
-- ---------------------------------------------------------------------------

create or replace function public.two_person_circle_is_unlocked(
  p_conversation_id uuid,
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
      from public.conversations conversation_row
      where conversation_row.id = p_conversation_id
        and conversation_row.kind = 'direct'
        and conversation_row.circle_enabled
        and conversation_row.circle_locked_at is null
        and public.conversation_is_member(conversation_row.id, p_user_id)
    );
$$;

revoke all on function public.two_person_circle_is_unlocked(uuid, uuid)
  from public;
grant execute on function public.two_person_circle_is_unlocked(uuid, uuid)
  to authenticated;

create or replace function public.lock_two_person_circle_conversation(
  p_conversation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_conversation_id is null then
    return;
  end if;

  update public.two_person_circle_access_periods period_row
  set closed_at = coalesce(period_row.closed_at, now())
  where period_row.conversation_id = p_conversation_id
    and period_row.closed_at is null;

  update public.conversations conversation_row
  set
    circle_locked_at = coalesce(conversation_row.circle_locked_at, now()),
    updated_at = now()
  where conversation_row.id = p_conversation_id
    and conversation_row.kind = 'direct'
    and conversation_row.circle_enabled;

  update public.two_person_circle_proposal_states proposal_row
  set
    status = 'locked',
    responded_at = now(),
    next_proposer_id = null,
    updated_at = now()
  where proposal_row.conversation_id = p_conversation_id
    and proposal_row.status in ('accepted', 'pending', 'not_yet');
end;
$$;

revoke all on function public.lock_two_person_circle_conversation(uuid)
  from public;

create or replace function public.lock_two_person_circle_for_pair(
  p_user_a uuid,
  p_user_b uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if p_user_a is null or p_user_b is null or p_user_a = p_user_b then
    return;
  end if;

  select conversation_row.id
  into v_conversation_id
  from public.conversations conversation_row
  where conversation_row.kind = 'direct'
    and conversation_row.direct_key = public.conversation_direct_key(
      p_user_a,
      p_user_b
    )
    and conversation_row.circle_enabled
  limit 1;

  if v_conversation_id is not null then
    perform public.lock_two_person_circle_conversation(v_conversation_id);
  end if;
end;
$$;

revoke all on function public.lock_two_person_circle_for_pair(uuid, uuid)
  from public;

-- Any boundary that clears the romantic pair state also closes an existing
-- shared Circle. New, never-accepted proposals are removed entirely.
create or replace function public.clear_romantic_pair_state(
  p_user_a uuid,
  p_user_b uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_low uuid;
  v_high uuid;
begin
  if p_user_a is null or p_user_b is null or p_user_a = p_user_b then
    return;
  end if;

  v_low := least(p_user_a::text, p_user_b::text)::uuid;
  v_high := greatest(p_user_a::text, p_user_b::text)::uuid;

  perform public.lock_two_person_circle_for_pair(p_user_a, p_user_b);

  delete from public.two_person_circle_proposal_states proposal_row
  where proposal_row.user_low_id = v_low
    and proposal_row.user_high_id = v_high
    and proposal_row.conversation_id is null;

  delete from public.romantic_focus_selections selection_row
  where (selection_row.selector_id = p_user_a
         and selection_row.target_user_id = p_user_b)
     or (selection_row.selector_id = p_user_b
         and selection_row.target_user_id = p_user_a);

  delete from public.romantic_focus_states state_row
  where state_row.user_low_id = v_low
    and state_row.user_high_id = v_high;

  delete from public.romantic_interests interest_row
  where (interest_row.selector_id = p_user_a
         and interest_row.target_user_id = p_user_b)
     or (interest_row.selector_id = p_user_b
         and interest_row.target_user_id = p_user_a);

  delete from public.romantic_mutual_states state_row
  where state_row.user_low_id = v_low
    and state_row.user_high_id = v_high;
end;
$$;

revoke all on function public.clear_romantic_pair_state(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- Proposal state: create a new Circle or reopen the preserved one
-- ---------------------------------------------------------------------------

create or replace function public.record_two_person_circle_analytics(
  p_event_name text,
  p_action text
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
    'two_person_circle_proposal_updated',
    'two_person_circle_activated'
  ) then
    return;
  end if;

  if p_action not in (
    'propose',
    'not_yet',
    'end_focus',
    'accept',
    'reopen'
  ) then
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
        'surface', 'connected_profile',
        'action', p_action
      )
    );
  exception
    when others then
      null;
  end;
end;
$$;

revoke all on function public.record_two_person_circle_analytics(text, text)
  from public;

create or replace function public.get_two_person_circle_proposal_status(
  p_other_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_feature_enabled boolean := true;
  v_low uuid;
  v_high uuid;
  v_focus_state public.romantic_focus_states%rowtype;
  v_proposal public.two_person_circle_proposal_states%rowtype;
  v_focus_active boolean := false;
  v_focus_revealed boolean := false;
  v_state text := 'unavailable';
  v_can_propose boolean := false;
  v_conversation_id uuid;
  v_existing_circle boolean := false;
  v_circle_locked boolean := false;
  v_circle_access_active boolean := false;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_other_user_id is null or p_other_user_id = v_viewer_id then
    return jsonb_build_object(
      'available', false,
      'state', 'unavailable',
      'can_propose', false,
      'accepted', false,
      'existing_circle', false
    );
  end if;

  select coalesce(flag_row.enabled, true)
  into v_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'two_person_circle_proposals';

  if not coalesce(v_feature_enabled, true) then
    return jsonb_build_object(
      'available', false,
      'state', 'unavailable',
      'can_propose', false,
      'accepted', false,
      'existing_circle', false
    );
  end if;

  if not exists (
    select 1
    from public.connections connection_row
    where connection_row.user_id = v_viewer_id
      and connection_row.other_user_id = p_other_user_id
  ) then
    return jsonb_build_object(
      'available', false,
      'state', 'unavailable',
      'can_propose', false,
      'accepted', false,
      'existing_circle', false
    );
  end if;

  v_low := least(v_viewer_id::text, p_other_user_id::text)::uuid;
  v_high := greatest(v_viewer_id::text, p_other_user_id::text)::uuid;

  select
    conversation_row.id,
    conversation_row.circle_enabled,
    conversation_row.circle_locked_at is not null
  into
    v_conversation_id,
    v_existing_circle,
    v_circle_locked
  from public.conversations conversation_row
  where conversation_row.kind = 'direct'
    and conversation_row.direct_key = public.conversation_direct_key(
      v_viewer_id,
      p_other_user_id
    )
  limit 1;

  v_existing_circle := coalesce(v_existing_circle, false);
  v_circle_locked := v_existing_circle and coalesce(v_circle_locked, false);
  v_circle_access_active := v_existing_circle and not v_circle_locked;

  select proposal_row.*
  into v_proposal
  from public.two_person_circle_proposal_states proposal_row
  where proposal_row.user_low_id = v_low
    and proposal_row.user_high_id = v_high;

  if v_circle_access_active then
    return jsonb_build_object(
      'available', true,
      'state', 'accepted',
      'can_propose', false,
      'accepted', true,
      'existing_circle', true,
      'circle_enabled', true,
      'circle_locked', false,
      'circle_access_active', true,
      'conversation_id', v_conversation_id
    );
  end if;

  select state_row.*
  into v_focus_state
  from public.romantic_focus_states state_row
  where state_row.user_low_id = v_low
    and state_row.user_high_id = v_high;

  if found then
    v_focus_active := true;
    v_focus_revealed := case
      when v_viewer_id = v_low
        then v_focus_state.user_low_revealed_at is not null
      else v_focus_state.user_high_revealed_at is not null
    end;
  end if;

  if not v_focus_active or not v_focus_revealed then
    if v_existing_circle then
      return jsonb_build_object(
        'available', true,
        'state', 'locked',
        'can_propose', false,
        'accepted', false,
        'existing_circle', true,
        'circle_enabled', true,
        'circle_locked', true,
        'circle_access_active', false,
        'focus_active', v_focus_active,
        'conversation_id', v_conversation_id
      );
    end if;

    return jsonb_build_object(
      'available', false,
      'state', 'unavailable',
      'can_propose', false,
      'accepted', false,
      'existing_circle', false,
      'focus_active', v_focus_active
    );
  end if;

  if v_proposal.user_low_id is null
     or v_proposal.status = 'locked'
     or (v_existing_circle and v_proposal.status = 'accepted') then
    v_state := case
      when v_existing_circle then 'reopen_available'
      else 'none'
    end;
    v_can_propose := true;
  elsif v_proposal.status = 'pending' then
    v_state := case
      when v_proposal.proposed_by = v_viewer_id
        then 'pending_outgoing'
      else 'pending_incoming'
    end;
  elsif v_proposal.status = 'not_yet' then
    if v_proposal.next_proposer_id = v_viewer_id then
      v_state := 'not_yet_can_propose';
      v_can_propose := true;
    else
      v_state := 'not_yet_waiting';
    end if;
  end if;

  return jsonb_build_object(
    'available', true,
    'state', v_state,
    'can_propose', v_can_propose,
    'accepted', false,
    'focus_active', true,
    'existing_circle', v_existing_circle,
    'reopening', v_existing_circle,
    'circle_enabled', v_existing_circle,
    'circle_locked', v_existing_circle,
    'circle_access_active', false,
    'conversation_id', v_conversation_id,
    'proposed_at', v_proposal.proposed_at,
    'responded_at', v_proposal.responded_at
  );
end;
$$;

revoke all on function public.get_two_person_circle_proposal_status(uuid)
  from public;
grant execute on function public.get_two_person_circle_proposal_status(uuid)
  to authenticated;

create or replace function public.propose_two_person_circle(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_feature_enabled boolean := true;
  v_low uuid;
  v_high uuid;
  v_focus_state public.romantic_focus_states%rowtype;
  v_proposal public.two_person_circle_proposal_states%rowtype;
  v_conversation_id uuid;
  v_existing_circle boolean := false;
  v_circle_locked boolean := false;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_target_user_id is null or p_target_user_id = v_viewer_id then
    raise exception 'Choose an accepted connection';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'two_person_circle_proposals';

  if not coalesce(v_feature_enabled, true) then
    raise exception 'Two-person Circle proposals are temporarily unavailable';
  end if;

  if not exists (
    select 1
    from public.connections connection_row
    where connection_row.user_id = v_viewer_id
      and connection_row.other_user_id = p_target_user_id
  ) then
    raise exception 'A Circle proposal requires an accepted connection';
  end if;

  v_low := least(v_viewer_id::text, p_target_user_id::text)::uuid;
  v_high := greatest(v_viewer_id::text, p_target_user_id::text)::uuid;

  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended('two-person-circle:' || v_low::text || ':' || v_high::text, 0)
  );

  select focus_row.*
  into v_focus_state
  from public.romantic_focus_states focus_row
  where focus_row.user_low_id = v_low
    and focus_row.user_high_id = v_high
  for update;

  if not found then
    raise exception 'Mutual Focus is required before proposing a Circle';
  end if;

  if (v_viewer_id = v_low and v_focus_state.user_low_revealed_at is null)
     or (v_viewer_id = v_high and v_focus_state.user_high_revealed_at is null) then
    raise exception 'Open your direct conversation before proposing a Circle';
  end if;

  select
    conversation_row.id,
    conversation_row.circle_enabled,
    conversation_row.circle_locked_at is not null
  into
    v_conversation_id,
    v_existing_circle,
    v_circle_locked
  from public.conversations conversation_row
  where conversation_row.kind = 'direct'
    and conversation_row.direct_key = public.conversation_direct_key(
      v_viewer_id,
      p_target_user_id
    )
  limit 1;

  v_existing_circle := coalesce(v_existing_circle, false);
  v_circle_locked := v_existing_circle and coalesce(v_circle_locked, false);

  if v_existing_circle and not v_circle_locked then
    raise exception 'Your Circle is already open';
  end if;

  select proposal_row.*
  into v_proposal
  from public.two_person_circle_proposal_states proposal_row
  where proposal_row.user_low_id = v_low
    and proposal_row.user_high_id = v_high
  for update;

  if found and v_proposal.status = 'pending' then
    raise exception 'A Circle proposal is already waiting for a response';
  end if;

  if found
     and v_proposal.status = 'not_yet'
     and v_proposal.next_proposer_id is distinct from v_viewer_id then
    raise exception 'Only the person who chose Not yet can make the next proposal';
  end if;

  insert into public.two_person_circle_proposal_states (
    user_low_id,
    user_high_id,
    status,
    proposed_by,
    proposed_to,
    proposed_at,
    responded_at,
    next_proposer_id,
    conversation_id,
    updated_at
  )
  values (
    v_low,
    v_high,
    'pending',
    v_viewer_id,
    p_target_user_id,
    now(),
    null,
    null,
    v_conversation_id,
    now()
  )
  on conflict (user_low_id, user_high_id) do update
  set
    status = 'pending',
    proposed_by = excluded.proposed_by,
    proposed_to = excluded.proposed_to,
    proposed_at = excluded.proposed_at,
    responded_at = null,
    next_proposer_id = null,
    conversation_id = coalesce(
      two_person_circle_proposal_states.conversation_id,
      excluded.conversation_id
    ),
    updated_at = now();

  perform public.record_two_person_circle_analytics(
    'two_person_circle_proposal_updated',
    'propose'
  );

  return public.get_two_person_circle_proposal_status(p_target_user_id);
end;
$$;

revoke all on function public.propose_two_person_circle(uuid) from public;
grant execute on function public.propose_two_person_circle(uuid)
  to authenticated;

create or replace function public.respond_two_person_circle_proposal(
  p_other_user_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_feature_enabled boolean := true;
  v_low uuid;
  v_high uuid;
  v_focus_state public.romantic_focus_states%rowtype;
  v_proposal public.two_person_circle_proposal_states%rowtype;
  v_conversation_id uuid;
  v_was_existing_circle boolean := false;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_other_user_id is null or p_other_user_id = v_viewer_id then
    raise exception 'Choose an accepted connection';
  end if;

  if p_action not in ('accept', 'not_yet', 'end_focus') then
    raise exception 'Choose Create our Circle, Not yet, or End Focus';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'two_person_circle_proposals';

  if not coalesce(v_feature_enabled, true) then
    raise exception 'Two-person Circle proposals are temporarily unavailable';
  end if;

  v_low := least(v_viewer_id::text, p_other_user_id::text)::uuid;
  v_high := greatest(v_viewer_id::text, p_other_user_id::text)::uuid;

  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended('two-person-circle:' || v_low::text || ':' || v_high::text, 0)
  );

  select focus_row.*
  into v_focus_state
  from public.romantic_focus_states focus_row
  where focus_row.user_low_id = v_low
    and focus_row.user_high_id = v_high
  for update;

  if not found then
    raise exception 'Mutual Focus is no longer active';
  end if;

  if (v_viewer_id = v_low and v_focus_state.user_low_revealed_at is null)
     or (v_viewer_id = v_high and v_focus_state.user_high_revealed_at is null) then
    raise exception 'Open your direct conversation before responding to a Circle proposal';
  end if;

  select proposal_row.*
  into v_proposal
  from public.two_person_circle_proposal_states proposal_row
  where proposal_row.user_low_id = v_low
    and proposal_row.user_high_id = v_high
  for update;

  if not found
     or v_proposal.status <> 'pending'
     or v_proposal.proposed_to <> v_viewer_id then
    raise exception 'No Circle proposal is waiting for your response';
  end if;

  if p_action = 'not_yet' then
    update public.two_person_circle_proposal_states proposal_row
    set
      status = 'not_yet',
      responded_at = now(),
      next_proposer_id = v_viewer_id,
      updated_at = now()
    where proposal_row.user_low_id = v_low
      and proposal_row.user_high_id = v_high;

    perform public.record_two_person_circle_analytics(
      'two_person_circle_proposal_updated',
      'not_yet'
    );

    return public.get_two_person_circle_proposal_status(p_other_user_id);
  end if;

  if p_action = 'end_focus' then
    perform public.clear_romantic_pair_state(v_viewer_id, p_other_user_id);

    perform public.record_two_person_circle_analytics(
      'two_person_circle_proposal_updated',
      'end_focus'
    );

    return public.get_two_person_circle_proposal_status(p_other_user_id);
  end if;

  v_conversation_id := public.ensure_direct_conversation(
    v_viewer_id,
    p_other_user_id
  );

  select conversation_row.circle_enabled
  into v_was_existing_circle
  from public.conversations conversation_row
  where conversation_row.id = v_conversation_id
  for update;

  update public.conversations conversation_row
  set
    circle_enabled = true,
    circle_activated_at = coalesce(conversation_row.circle_activated_at, now()),
    circle_locked_at = null,
    circle_last_unlocked_at = now(),
    title = coalesce(nullif(trim(conversation_row.title), ''), 'Our Circle'),
    updated_at = now()
  where conversation_row.id = v_conversation_id;

  insert into public.two_person_circle_access_periods (
    conversation_id,
    opened_at,
    opened_by
  )
  select
    v_conversation_id,
    now(),
    v_viewer_id
  where not exists (
    select 1
    from public.two_person_circle_access_periods period_row
    where period_row.conversation_id = v_conversation_id
      and period_row.closed_at is null
  );

  update public.conversation_members member_row
  set is_pinned = true
  where member_row.conversation_id = v_conversation_id
    and member_row.user_id in (v_viewer_id, p_other_user_id);

  update public.two_person_circle_proposal_states proposal_row
  set
    status = 'accepted',
    responded_at = now(),
    next_proposer_id = null,
    accepted_at = coalesce(proposal_row.accepted_at, now()),
    conversation_id = v_conversation_id,
    updated_at = now()
  where proposal_row.user_low_id = v_low
    and proposal_row.user_high_id = v_high;

  perform public.record_two_person_circle_analytics(
    'two_person_circle_activated',
    case when coalesce(v_was_existing_circle, false) then 'reopen' else 'accept' end
  );

  return public.get_two_person_circle_proposal_status(p_other_user_id);
end;
$$;

revoke all on function public.respond_two_person_circle_proposal(uuid, text)
  from public;
grant execute on function public.respond_two_person_circle_proposal(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Inbox and shared-profile reads respect the lock state
-- ---------------------------------------------------------------------------

drop function if exists public.get_my_conversations();

create function public.get_my_conversations()
returns table (
  conversation_id uuid,
  kind text,
  is_circle boolean,
  display_title text,
  display_avatar text,
  display_avatar_path text,
  other_user_id uuid,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint,
  is_pinned boolean,
  notifications_muted boolean,
  member_count bigint,
  pending_invitation_count bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select
      conversation.id,
      conversation.kind,
      conversation.circle_enabled,
      conversation.circle_locked_at,
      conversation.title,
      conversation.avatar_url,
      conversation.avatar_path,
      conversation.created_at,
      conversation.updated_at,
      membership.last_read_at,
      membership.is_pinned,
      membership.notifications_muted,
      membership.notifications_muted_until
    from public.conversations conversation
    join public.conversation_members membership
      on membership.conversation_id = conversation.id
     and membership.user_id = auth.uid()
  )
  select
    mine.id as conversation_id,
    mine.kind,
    (
      mine.kind = 'group'
      or (mine.circle_enabled and mine.circle_locked_at is null)
    ) as is_circle,
    case
      when mine.kind = 'direct'
       and (not mine.circle_enabled or mine.circle_locked_at is not null)
        then coalesce(other_user.display_name, 'Connection')
      else coalesce(
        nullif(trim(mine.title), ''),
        case when mine.kind = 'direct' then 'Our Circle' else 'Private group' end
      )
    end as display_title,
    case
      when mine.kind = 'direct'
       and (not mine.circle_enabled or mine.circle_locked_at is not null)
        then other_user.avatar_url
      else mine.avatar_url
    end as display_avatar,
    case
      when mine.kind = 'group'
        or (mine.circle_enabled and mine.circle_locked_at is null)
        then mine.avatar_path
      else null
    end as display_avatar_path,
    case when mine.kind = 'direct' then other_user.id else null end,
    coalesce(
      nullif(last_message.body, ''),
      case
        when last_message.media_count = 1 and last_message.first_media_type = 'image'
          then 'Photo'
        when last_message.media_count = 1 and last_message.first_media_type = 'video'
          then 'Video'
        when last_message.media_count > 1
          then last_message.media_count::text || ' attachments'
        else null
      end
    ) as last_message,
    last_message.created_at,
    (
      select count(*)
      from public.messages unread
      where unread.conversation_id = mine.id
        and unread.sender_id <> auth.uid()
        and unread.created_at > mine.last_read_at
    ),
    mine.is_pinned,
    (
      mine.notifications_muted
      and (
        mine.notifications_muted_until is null
        or mine.notifications_muted_until > now()
      )
    ) as notifications_muted,
    (
      select count(*)
      from public.conversation_members member_rows
      where member_rows.conversation_id = mine.id
    ),
    (
      select count(*)
      from public.conversation_invitations invite_rows
      where invite_rows.conversation_id = mine.id
        and invite_rows.status = 'pending'
    ),
    mine.created_at
  from mine
  left join lateral (
    select user_row.id, user_row.display_name, user_row.avatar_url
    from public.conversation_members other_member
    join public.users user_row on user_row.id = other_member.user_id
    where other_member.conversation_id = mine.id
      and other_member.user_id <> auth.uid()
    order by other_member.joined_at asc
    limit 1
  ) other_user on true
  left join lateral (
    select
      message.body,
      message.created_at,
      count(media.id) as media_count,
      min(media.media_type) filter (where media.sort_order = 0) as first_media_type
    from public.messages message
    left join public.message_media media on media.message_id = message.id
    where message.conversation_id = mine.id
    group by message.id
    order by message.created_at desc
    limit 1
  ) last_message on true
  order by
    mine.is_pinned desc,
    coalesce(last_message.created_at, mine.updated_at, mine.created_at) desc;
$$;

revoke all on function public.get_my_conversations() from public;
grant execute on function public.get_my_conversations() to authenticated;

create or replace function public.get_conversation_details(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_result jsonb;
begin
  if not public.conversation_is_member(p_conversation_id, v_viewer_id) then
    raise exception 'You are not a member of this private conversation';
  end if;

  select jsonb_build_object(
    'conversation', jsonb_build_object(
      'id', conversation.id,
      'kind', conversation.kind,
      'is_circle', (
        conversation.kind = 'group'
        or (
          conversation.circle_enabled
          and conversation.circle_locked_at is null
        )
      ),
      'circle_enabled', conversation.circle_enabled,
      'circle_locked', (
        conversation.kind = 'direct'
        and conversation.circle_enabled
        and conversation.circle_locked_at is not null
      ),
      'circle_access_active', (
        conversation.kind = 'group'
        or (
          conversation.kind = 'direct'
          and conversation.circle_enabled
          and conversation.circle_locked_at is null
        )
      ),
      'circle_activated_at', conversation.circle_activated_at,
      'circle_locked_at', conversation.circle_locked_at,
      'circle_last_unlocked_at', conversation.circle_last_unlocked_at,
      'other_user_id', case
        when conversation.kind = 'direct' then other_user.id
        else null
      end,
      'title', case
        when conversation.kind = 'direct'
         and (
           not conversation.circle_enabled
           or conversation.circle_locked_at is not null
         )
          then coalesce(other_user.display_name, 'Connection')
        else coalesce(
          nullif(trim(conversation.title), ''),
          case when conversation.kind = 'direct' then 'Our Circle' else 'Private group' end
        )
      end,
      'circle_title', case
        when conversation.circle_enabled then coalesce(
          nullif(trim(conversation.title), ''),
          'Our Circle'
        )
        else null
      end,
      'avatar_url', case
        when conversation.kind = 'direct'
         and (
           not conversation.circle_enabled
           or conversation.circle_locked_at is not null
         )
          then other_user.avatar_url
        else conversation.avatar_url
      end,
      'avatar_path', case
        when conversation.kind = 'group'
          or (
            conversation.circle_enabled
            and conversation.circle_locked_at is null
          )
          then conversation.avatar_path
        else null
      end,
      'bio', case
        when conversation.kind = 'group' then conversation.bio
        else null
      end,
      'silent_message', case
        when conversation.kind = 'direct'
         and conversation.circle_enabled
         and conversation.circle_locked_at is null
          then other_silent.body
        else null
      end,
      'silent_message_author', case
        when conversation.kind = 'direct'
         and conversation.circle_enabled
         and conversation.circle_locked_at is null
          then other_user.display_name
        else null
      end,
      'my_silent_message', case
        when conversation.kind = 'direct'
         and conversation.circle_enabled
         and conversation.circle_locked_at is null
          then my_silent.body
        else null
      end,
      'created_at', conversation.created_at,
      'created_by', conversation.created_by,
      'can_edit', (
        conversation.kind = 'group'
        or (
          conversation.kind = 'direct'
          and conversation.circle_enabled
          and conversation.circle_locked_at is null
        )
      ),
      'timeline_count', case
        when conversation.kind = 'group' then (
          select count(*)
          from public.message_media timeline_media
          join public.messages timeline_message
            on timeline_message.id = timeline_media.message_id
          where timeline_message.conversation_id = conversation.id
        )
        when conversation.kind = 'direct'
         and conversation.circle_enabled
         and conversation.circle_locked_at is null then (
          select count(*)
          from public.message_media timeline_media
          join public.messages timeline_message
            on timeline_message.id = timeline_media.message_id
          where timeline_message.conversation_id = conversation.id
            and exists (
              select 1
              from public.two_person_circle_access_periods period_row
              where period_row.conversation_id = conversation.id
                and timeline_message.created_at >= period_row.opened_at
                and (
                  period_row.closed_at is null
                  or timeline_message.created_at < period_row.closed_at
                )
            )
        )
        else 0
      end,
      'post_count', case
        when conversation.kind = 'group'
          or (
            conversation.kind = 'direct'
            and conversation.circle_enabled
            and conversation.circle_locked_at is null
          ) then (
            select count(*)
            from public.conversation_posts post_row
            where post_row.conversation_id = conversation.id
          )
        else 0
      end
    ),
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', member_user.id,
          'display_name', member_user.display_name,
          'avatar_url', member_user.avatar_url,
          'role', member_row.role,
          'joined_at', member_row.joined_at,
          'is_me', member_user.id = v_viewer_id
        )
        order by
          case member_row.role when 'owner' then 0 when 'admin' then 1 else 2 end,
          member_row.joined_at
      )
      from public.conversation_members member_row
      join public.users member_user on member_user.id = member_row.user_id
      where member_row.conversation_id = conversation.id
    ), '[]'::jsonb),
    'pending_invitations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'invitation_id', invitation.id,
          'user_id', invited_user.id,
          'display_name', invited_user.display_name,
          'avatar_url', invited_user.avatar_url,
          'status', invitation.status,
          'created_at', invitation.created_at
        )
        order by invitation.created_at
      )
      from public.conversation_invitations invitation
      join public.users invited_user on invited_user.id = invitation.invited_user_id
      where invitation.conversation_id = conversation.id
        and invitation.status = 'pending'
    ), '[]'::jsonb)
  )
  into v_result
  from public.conversations conversation
  left join lateral (
    select user_row.id, user_row.display_name, user_row.avatar_url
    from public.conversation_members other_member
    join public.users user_row on user_row.id = other_member.user_id
    where other_member.conversation_id = conversation.id
      and other_member.user_id <> v_viewer_id
    order by other_member.joined_at
    limit 1
  ) other_user on true
  left join public.two_person_circle_silent_messages other_silent
    on other_silent.conversation_id = conversation.id
   and other_silent.author_id = other_user.id
  left join public.two_person_circle_silent_messages my_silent
    on my_silent.conversation_id = conversation.id
   and my_silent.author_id = v_viewer_id
  where conversation.id = p_conversation_id;

  return v_result;
end;
$$;

revoke all on function public.get_conversation_details(uuid) from public;
grant execute on function public.get_conversation_details(uuid) to authenticated;

create or replace function public.get_conversation_timeline(
  p_conversation_id uuid,
  p_limit_count integer default 120,
  p_before timestamptz default now()
)
returns table (
  media_id uuid,
  message_id uuid,
  storage_path text,
  media_type text,
  width integer,
  height integer,
  duration_ms integer,
  sort_order integer,
  sender_id uuid,
  sender_name text,
  sender_avatar text,
  message_body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    media.id,
    message.id,
    media.storage_path,
    media.media_type,
    media.width,
    media.height,
    media.duration_ms,
    media.sort_order,
    message.sender_id,
    sender.display_name,
    sender.avatar_url,
    message.body,
    message.created_at
  from public.message_media media
  join public.messages message on message.id = media.message_id
  join public.users sender on sender.id = message.sender_id
  join public.conversations conversation_row
    on conversation_row.id = message.conversation_id
  where message.conversation_id = p_conversation_id
    and message.created_at < coalesce(p_before, now())
    and public.conversation_is_member(p_conversation_id, auth.uid())
    and (
      conversation_row.kind = 'group'
      or (
        conversation_row.kind = 'direct'
        and not conversation_row.circle_enabled
      )
      or (
        conversation_row.kind = 'direct'
        and conversation_row.circle_enabled
        and conversation_row.circle_locked_at is null
        and exists (
          select 1
          from public.two_person_circle_access_periods period_row
          where period_row.conversation_id = conversation_row.id
            and message.created_at >= period_row.opened_at
            and (
              period_row.closed_at is null
              or message.created_at < period_row.closed_at
            )
        )
      )
      or (
        conversation_row.kind = 'direct'
        and conversation_row.circle_enabled
        and conversation_row.circle_locked_at is not null
        and not exists (
          select 1
          from public.two_person_circle_access_periods period_row
          where period_row.conversation_id = conversation_row.id
            and message.created_at >= period_row.opened_at
            and (
              period_row.closed_at is null
              or message.created_at < period_row.closed_at
            )
        )
      )
    )
  order by message.created_at desc, media.sort_order
  limit greatest(1, least(coalesce(p_limit_count, 120), 300));
$$;

revoke all on function public.get_conversation_timeline(uuid, integer, timestamptz)
  from public;
grant execute on function public.get_conversation_timeline(uuid, integer, timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Equal shared profile editing and one-way quiet messages
-- ---------------------------------------------------------------------------

create or replace function public.update_circle_profile(
  p_conversation_id uuid,
  p_title text,
  p_bio text default null,
  p_avatar_path text default null,
  p_silent_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_bio text := nullif(trim(coalesce(p_bio, '')), '');
  v_silent_message text := nullif(trim(coalesce(p_silent_message, '')), '');
  v_conversation public.conversations%rowtype;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.conversation_is_member(p_conversation_id, v_viewer_id) then
    raise exception 'Only accepted members can edit this Circle';
  end if;

  if v_title is null then
    raise exception 'Circle name is required';
  end if;

  if length(v_title) > 60 then
    raise exception 'Circle name must be 60 characters or fewer';
  end if;

  if v_bio is not null and length(v_bio) > 160 then
    raise exception 'Circle bio must be 160 characters or fewer';
  end if;

  if v_silent_message is not null and length(v_silent_message) > 160 then
    raise exception 'Silent messages must be 160 characters or fewer';
  end if;

  if p_avatar_path is not null
    and p_avatar_path not like p_conversation_id::text
      || '/avatars/' || v_viewer_id::text || '/%' then
    raise exception 'Circle avatar path does not belong to this member';
  end if;

  select conversation_row.*
  into v_conversation
  from public.conversations conversation_row
  where conversation_row.id = p_conversation_id
  for update;

  if not found then
    raise exception 'Circle not found';
  end if;

  if v_conversation.kind = 'direct'
     and (
       not v_conversation.circle_enabled
       or v_conversation.circle_locked_at is not null
     ) then
    raise exception 'Your shared Circle must be open before it can be edited';
  end if;

  if v_conversation.kind not in ('group', 'direct') then
    raise exception 'This conversation has no editable Circle profile';
  end if;

  update public.conversations conversation_row
  set
    title = v_title,
    bio = case
      when v_conversation.kind = 'group' then v_bio
      else conversation_row.bio
    end,
    avatar_path = coalesce(p_avatar_path, conversation_row.avatar_path),
    updated_at = now()
  where conversation_row.id = p_conversation_id
  returning * into v_conversation;

  if v_conversation.kind = 'direct' then
    if v_silent_message is null then
      delete from public.two_person_circle_silent_messages message_row
      where message_row.conversation_id = p_conversation_id
        and message_row.author_id = v_viewer_id;
    else
      insert into public.two_person_circle_silent_messages (
        conversation_id,
        author_id,
        body,
        updated_at
      )
      values (
        p_conversation_id,
        v_viewer_id,
        v_silent_message,
        now()
      )
      on conflict (conversation_id, author_id) do update
      set
        body = excluded.body,
        updated_at = excluded.updated_at;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_conversation.id,
    'title', v_conversation.title,
    'bio', case when v_conversation.kind = 'group' then v_conversation.bio else null end,
    'silent_message', case when v_conversation.kind = 'direct' then v_silent_message else null end,
    'avatar_path', v_conversation.avatar_path,
    'updated_at', v_conversation.updated_at
  );
end;
$$;

revoke all on function public.update_circle_profile(uuid, text, text, text, text)
  from public;
grant execute on function public.update_circle_profile(uuid, text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Locked Circle posts remain preserved but inaccessible
-- ---------------------------------------------------------------------------

create or replace function public.circle_posts_are_enabled(
  p_conversation_id uuid,
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
      from public.conversations conversation_row
      where conversation_row.id = p_conversation_id
        and (
          conversation_row.kind = 'group'
          or (
            conversation_row.kind = 'direct'
            and conversation_row.circle_enabled
            and conversation_row.circle_locked_at is null
          )
        )
        and public.conversation_is_member(conversation_row.id, p_user_id)
    );
$$;

revoke all on function public.circle_posts_are_enabled(uuid, uuid) from public;
grant execute on function public.circle_posts_are_enabled(uuid, uuid) to authenticated;

create or replace function public.delete_own_circle_post_comment(
  p_comment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  select post_row.conversation_id
  into v_conversation_id
  from public.conversation_post_comments comment_row
  join public.conversation_posts post_row on post_row.id = comment_row.post_id
  where comment_row.id = p_comment_id
    and comment_row.user_id = auth.uid();

  if v_conversation_id is null
     or not public.circle_posts_are_enabled(v_conversation_id, auth.uid()) then
    raise exception 'Comment not found or unavailable';
  end if;

  delete from public.conversation_post_comments comment_row
  where comment_row.id = p_comment_id
    and comment_row.user_id = auth.uid();
end;
$$;

revoke all on function public.delete_own_circle_post_comment(uuid) from public;
grant execute on function public.delete_own_circle_post_comment(uuid) to authenticated;

create or replace function public.update_own_circle_post_caption(
  p_post_id uuid,
  p_caption text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caption text := nullif(trim(coalesce(p_caption, '')), '');
  v_conversation_id uuid;
begin
  if v_caption is not null and length(v_caption) > 2200 then
    raise exception 'Circle post captions must be 2200 characters or fewer';
  end if;

  select post_row.conversation_id
  into v_conversation_id
  from public.conversation_posts post_row
  where post_row.id = p_post_id
    and post_row.author_id = auth.uid();

  if v_conversation_id is null
     or not public.circle_posts_are_enabled(v_conversation_id, auth.uid()) then
    raise exception 'Circle post not found or unavailable';
  end if;

  update public.conversation_posts post_row
  set
    caption = v_caption,
    updated_at = now(),
    edited_at = now()
  where post_row.id = p_post_id
    and post_row.author_id = auth.uid();

  update public.conversations conversation_row
  set updated_at = now()
  where conversation_row.id = v_conversation_id;
end;
$$;

revoke all on function public.update_own_circle_post_caption(uuid, text) from public;
grant execute on function public.update_own_circle_post_caption(uuid, text) to authenticated;

create or replace function public.delete_own_circle_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_conversation_id uuid;
  v_paths text[];
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select
    post_row.conversation_id,
    coalesce(
      array_agg(media_row.storage_path)
        filter (where media_row.storage_path is not null),
      array[]::text[]
    )
  into v_conversation_id, v_paths
  from public.conversation_posts post_row
  left join public.conversation_post_media media_row
    on media_row.post_id = post_row.id
  where post_row.id = p_post_id
    and post_row.author_id = v_viewer_id
  group by post_row.id;

  if v_conversation_id is null
     or not public.circle_posts_are_enabled(v_conversation_id, v_viewer_id) then
    raise exception 'Circle post not found or unavailable';
  end if;

  delete from public.conversation_posts post_row
  where post_row.id = p_post_id
    and post_row.author_id = v_viewer_id;

  update public.conversations conversation_row
  set updated_at = now()
  where conversation_row.id = v_conversation_id;

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'storage_paths', to_jsonb(v_paths)
  );
end;
$$;

revoke all on function public.delete_own_circle_post(uuid) from public;
grant execute on function public.delete_own_circle_post(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Explicit disconnection preserves but locks accepted shared history
-- ---------------------------------------------------------------------------

create or replace function public.cleanup_direct_conversation_after_connection_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_conversation_id uuid;
  v_circle_enabled boolean := false;
begin
  if exists (
    select 1
    from public.connections connection_row
    where (connection_row.user_id = old.user_id
           and connection_row.other_user_id = old.other_user_id)
       or (connection_row.user_id = old.other_user_id
           and connection_row.other_user_id = old.user_id)
  ) then
    return old;
  end if;

  v_key := public.conversation_direct_key(old.user_id, old.other_user_id);

  select conversation_row.id, conversation_row.circle_enabled
  into v_conversation_id, v_circle_enabled
  from public.conversations conversation_row
  where conversation_row.kind = 'direct'
    and conversation_row.direct_key = v_key
  limit 1;

  if v_conversation_id is null then
    return old;
  end if;

  if coalesce(v_circle_enabled, false) then
    perform public.lock_two_person_circle_conversation(v_conversation_id);

    -- Removing membership makes the preserved conversation and Circle history
    -- inaccessible. Reconnecting recreates membership on the same direct row.
    delete from public.conversation_members member_row
    where member_row.conversation_id = v_conversation_id;
  else
    delete from public.conversations conversation_row
    where conversation_row.id = v_conversation_id;
  end if;

  return old;
end;
$$;

create or replace function public.remove_profile_connection(
  p_other_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_removed integer := 0;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_other_user_id is null or p_other_user_id = v_viewer_id then
    raise exception 'Choose an accepted connection';
  end if;

  if not exists (
    select 1
    from public.connections connection_row
    where (connection_row.user_id = v_viewer_id
           and connection_row.other_user_id = p_other_user_id)
       or (connection_row.user_id = p_other_user_id
           and connection_row.other_user_id = v_viewer_id)
  ) then
    raise exception 'This connection has already been removed';
  end if;

  delete from public.connection_requests request_row
  where (request_row.from_user = v_viewer_id
         and request_row.to_user = p_other_user_id)
     or (request_row.from_user = p_other_user_id
         and request_row.to_user = v_viewer_id);

  delete from public.connections connection_row
  where (connection_row.user_id = v_viewer_id
         and connection_row.other_user_id = p_other_user_id)
     or (connection_row.user_id = p_other_user_id
         and connection_row.other_user_id = v_viewer_id);

  get diagnostics v_removed = row_count;

  return jsonb_build_object(
    'removed', v_removed > 0,
    'shared_circle_locked', exists (
      select 1
      from public.conversations conversation_row
      where conversation_row.kind = 'direct'
        and conversation_row.direct_key = public.conversation_direct_key(
          v_viewer_id,
          p_other_user_id
        )
        and conversation_row.circle_enabled
        and conversation_row.circle_locked_at is not null
    )
  );
end;
$$;

revoke all on function public.remove_profile_connection(uuid) from public;
grant execute on function public.remove_profile_connection(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage boundary for locked shared media
-- ---------------------------------------------------------------------------

create or replace function public.conversation_media_object_is_readable(
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
    and exists (
      select 1
      from public.conversations conversation_row
      where conversation_row.id = public.conversation_id_from_storage_name(p_name)
        and public.conversation_is_member(conversation_row.id, p_user_id)
        and (
          conversation_row.kind = 'group'
          or not conversation_row.circle_enabled
          or conversation_row.circle_locked_at is null
          or (
            split_part(coalesce(p_name, ''), '/', 2) not in ('avatars', 'posts')
            and not exists (
              select 1
              from public.message_media media_row
              join public.messages message_row
                on message_row.id = media_row.message_id
              where media_row.storage_path = p_name
                and message_row.conversation_id = conversation_row.id
                and exists (
                  select 1
                  from public.two_person_circle_access_periods period_row
                  where period_row.conversation_id = conversation_row.id
                    and message_row.created_at >= period_row.opened_at
                    and (
                      period_row.closed_at is null
                      or message_row.created_at < period_row.closed_at
                    )
                )
            )
          )
        )
    );
$$;

revoke all on function public.conversation_media_object_is_readable(text, uuid)
  from public;
grant execute on function public.conversation_media_object_is_readable(text, uuid)
  to authenticated;

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

revoke all on function public.conversation_media_object_is_writable(text, uuid)
  from public;
grant execute on function public.conversation_media_object_is_writable(text, uuid)
  to authenticated;

drop policy if exists "Conversation members can read private media" on storage.objects;
create policy "Conversation members can read private media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'conversation-media'
  and public.conversation_media_object_is_readable(name, auth.uid())
);

drop policy if exists "Conversation members can upload private media" on storage.objects;
create policy "Conversation members can upload private media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'conversation-media'
  and public.conversation_media_object_is_writable(name, auth.uid())
  and (storage.foldername(name))[3] = auth.uid()::text
);

drop policy if exists "Uploaders can update private conversation media" on storage.objects;
create policy "Uploaders can update private conversation media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'conversation-media'
  and public.conversation_media_object_is_writable(name, auth.uid())
  and (storage.foldername(name))[3] = auth.uid()::text
)
with check (
  bucket_id = 'conversation-media'
  and public.conversation_media_object_is_writable(name, auth.uid())
  and (storage.foldername(name))[3] = auth.uid()::text
);

drop policy if exists "Uploaders can delete private conversation media" on storage.objects;
create policy "Uploaders can delete private conversation media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'conversation-media'
  and public.conversation_media_object_is_writable(name, auth.uid())
  and (storage.foldername(name))[3] = auth.uid()::text
);

-- Bring Circles created before this lifecycle migration into the new boundary.
-- Any existing two-person Circle without current Mutual Focus begins locked.
do $$
declare
  v_circle record;
begin
  for v_circle in
    select
      conversation_row.id as conversation_id,
      min(member_row.user_id::text)::uuid as user_low_id,
      max(member_row.user_id::text)::uuid as user_high_id
    from public.conversations conversation_row
    join public.conversation_members member_row
      on member_row.conversation_id = conversation_row.id
    where conversation_row.kind = 'direct'
      and conversation_row.circle_enabled
      and conversation_row.circle_locked_at is null
    group by conversation_row.id
    having count(*) = 2
  loop
    if not exists (
      select 1
      from public.romantic_focus_states focus_row
      where focus_row.user_low_id = v_circle.user_low_id
        and focus_row.user_high_id = v_circle.user_high_id
    ) then
      perform public.lock_two_person_circle_conversation(
        v_circle.conversation_id
      );
    end if;
  end loop;
end;
$$;

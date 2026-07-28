-- Circles Phase 6A — two-person Circle proposal and consent flow
--
-- Adds the explicit proposal step available only during active Mutual Focus.
-- A proposal can be accepted, answered with Not yet, or used to end Focus.
-- Not yet transfers the next proposal right to the person who declined.
-- Acceptance activates the existing direct conversation as a two-person Circle
-- without copying pre-activation direct-chat media into the Circle Timeline.

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
      'event_repeat_signals',
      'romantic_channel_beta',
      'romantic_interest_beta',
      'romantic_focus_beta',
      'two_person_circle_proposals'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'two_person_circle_proposals',
  true,
  'Enables consent-based two-person Circle proposals during Mutual Focus.'
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
      'two_person_circle_activated'
    )
  );

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
    'accept'
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
      -- Analytics must never affect consent or relationship state.
      null;
  end;
end;
$$;

revoke all on function public.record_two_person_circle_analytics(text, text)
  from public;

-- ---------------------------------------------------------------------------
-- Canonical pair-level proposal state
-- ---------------------------------------------------------------------------

create table if not exists public.two_person_circle_proposal_states (
  user_low_id uuid not null references public.users(id) on delete cascade,
  user_high_id uuid not null references public.users(id) on delete cascade,
  status text not null check (status in ('pending', 'not_yet', 'accepted')),
  proposed_by uuid not null references public.users(id) on delete cascade,
  proposed_to uuid not null references public.users(id) on delete cascade,
  proposed_at timestamptz not null default now(),
  responded_at timestamptz,
  next_proposer_id uuid references public.users(id) on delete cascade,
  accepted_at timestamptz,
  conversation_id uuid references public.conversations(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_low_id, user_high_id),
  constraint two_person_circle_proposal_pair_order check (
    user_low_id::text < user_high_id::text
  ),
  constraint two_person_circle_proposal_distinct_people check (
    proposed_by <> proposed_to
  ),
  constraint two_person_circle_proposal_participants check (
    proposed_by in (user_low_id, user_high_id)
    and proposed_to in (user_low_id, user_high_id)
  ),
  constraint two_person_circle_next_proposer_participant check (
    next_proposer_id is null
    or next_proposer_id in (user_low_id, user_high_id)
  )
);

create index if not exists two_person_circle_proposal_recipient_index
  on public.two_person_circle_proposal_states (proposed_to, status, updated_at desc);

alter table public.two_person_circle_proposal_states enable row level security;

-- No direct policies. Pair state is available only through security-definer
-- functions that reveal information to the two people in the pair.

-- Pending and Not yet proposals end when Focus or the connection boundary ends.
-- Accepted Circles persist independently of later Focus state.
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

  delete from public.two_person_circle_proposal_states proposal_row
  where proposal_row.user_low_id = v_low
    and proposal_row.user_high_id = v_high
    and proposal_row.status <> 'accepted';

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
-- Status: reveals only the pair's shared proposal state
-- ---------------------------------------------------------------------------

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
  v_circle_enabled boolean := false;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_other_user_id is null or p_other_user_id = v_viewer_id then
    return jsonb_build_object(
      'available', false,
      'state', 'unavailable',
      'can_propose', false,
      'accepted', false
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
      'accepted', false
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
      'accepted', false
    );
  end if;

  v_low := least(v_viewer_id::text, p_other_user_id::text)::uuid;
  v_high := greatest(v_viewer_id::text, p_other_user_id::text)::uuid;

  select state_row.*
  into v_proposal
  from public.two_person_circle_proposal_states state_row
  where state_row.user_low_id = v_low
    and state_row.user_high_id = v_high;

  if found and v_proposal.status = 'accepted' then
    v_conversation_id := v_proposal.conversation_id;

    if v_conversation_id is not null then
      select conversation_row.circle_enabled
      into v_circle_enabled
      from public.conversations conversation_row
      where conversation_row.id = v_conversation_id;
    end if;

    return jsonb_build_object(
      'available', true,
      'state', 'accepted',
      'can_propose', false,
      'accepted', true,
      'conversation_id', v_conversation_id,
      'circle_enabled', coalesce(v_circle_enabled, false)
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
    return jsonb_build_object(
      'available', false,
      'state', 'unavailable',
      'can_propose', false,
      'accepted', false,
      'focus_active', v_focus_active
    );
  end if;

  if v_proposal.user_low_id is null then
    v_state := 'none';
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
    'proposed_at', v_proposal.proposed_at,
    'responded_at', v_proposal.responded_at
  );
end;
$$;

revoke all on function public.get_two_person_circle_proposal_status(uuid)
  from public;
grant execute on function public.get_two_person_circle_proposal_status(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Propose: first proposal is open to either person; Not yet transfers the right
-- ---------------------------------------------------------------------------

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
  v_viewer_revealed boolean := false;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_target_user_id is null or p_target_user_id = v_viewer_id then
    raise exception 'Choose your focused connection';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'two_person_circle_proposals';

  if not coalesce(v_feature_enabled, true) then
    raise exception 'Two-person Circle proposals are temporarily unavailable';
  end if;

  v_low := least(v_viewer_id::text, p_target_user_id::text)::uuid;
  v_high := greatest(v_viewer_id::text, p_target_user_id::text)::uuid;

  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'two-person-circle:' || v_low::text || ':' || v_high::text,
      0
    )
  );

  select state_row.*
  into v_focus_state
  from public.romantic_focus_states state_row
  where state_row.user_low_id = v_low
    and state_row.user_high_id = v_high
  for update;

  if not found then
    raise exception 'Mutual Focus is required before creating a Circle';
  end if;

  v_viewer_revealed := case
    when v_viewer_id = v_low
      then v_focus_state.user_low_revealed_at is not null
    else v_focus_state.user_high_revealed_at is not null
  end;

  if not v_viewer_revealed then
    raise exception 'Open your direct conversation before proposing a Circle';
  end if;

  select proposal_row.*
  into v_proposal
  from public.two_person_circle_proposal_states proposal_row
  where proposal_row.user_low_id = v_low
    and proposal_row.user_high_id = v_high
  for update;

  if found then
    if v_proposal.status = 'accepted' then
      raise exception 'Your two-person Circle already exists';
    end if;

    if v_proposal.status = 'pending' then
      raise exception 'A Circle proposal is already waiting for a response';
    end if;

    if v_proposal.status = 'not_yet'
       and v_proposal.next_proposer_id <> v_viewer_id then
      raise exception 'Only the person who chose Not yet can make the next proposal';
    end if;
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
    accepted_at,
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
    null,
    null,
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
    accepted_at = null,
    conversation_id = null,
    updated_at = excluded.updated_at;

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

-- ---------------------------------------------------------------------------
-- Respond: accept, Not yet, or end Focus
-- ---------------------------------------------------------------------------

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
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_other_user_id is null or p_other_user_id = v_viewer_id then
    raise exception 'Choose your focused connection';
  end if;

  if p_action not in ('accept', 'not_yet', 'end_focus') then
    raise exception 'Choose accept, not_yet, or end_focus';
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
    pg_catalog.hashtextextended(
      'two-person-circle:' || v_low::text || ':' || v_high::text,
      0
    )
  );

  select state_row.*
  into v_focus_state
  from public.romantic_focus_states state_row
  where state_row.user_low_id = v_low
    and state_row.user_high_id = v_high
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
    delete from public.two_person_circle_proposal_states proposal_row
    where proposal_row.user_low_id = v_low
      and proposal_row.user_high_id = v_high;

    perform public.clear_romantic_pair_state(v_viewer_id, p_other_user_id);

    perform public.record_two_person_circle_analytics(
      'two_person_circle_proposal_updated',
      'end_focus'
    );

    return jsonb_build_object(
      'available', false,
      'state', 'unavailable',
      'can_propose', false,
      'accepted', false,
      'focus_active', false
    );
  end if;

  v_conversation_id := public.ensure_direct_conversation(
    v_viewer_id,
    p_other_user_id
  );

  update public.conversations conversation_row
  set
    circle_enabled = true,
    circle_activated_at = coalesce(conversation_row.circle_activated_at, now()),
    title = coalesce(nullif(trim(conversation_row.title), ''), 'Our Circle'),
    bio = coalesce(
      nullif(trim(conversation_row.bio), ''),
      'A private shared space for the two of you.'
    ),
    updated_at = now()
  where conversation_row.id = v_conversation_id;

  update public.two_person_circle_proposal_states proposal_row
  set
    status = 'accepted',
    responded_at = now(),
    next_proposer_id = null,
    accepted_at = now(),
    conversation_id = v_conversation_id,
    updated_at = now()
  where proposal_row.user_low_id = v_low
    and proposal_row.user_high_id = v_high;

  perform public.record_two_person_circle_analytics(
    'two_person_circle_activated',
    'accept'
  );

  return public.get_two_person_circle_proposal_status(p_other_user_id);
end;
$$;

revoke all on function public.respond_two_person_circle_proposal(uuid, text)
  from public;
grant execute on function public.respond_two_person_circle_proposal(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Provenance boundary: old direct-chat media does not enter Circle Timeline
-- ---------------------------------------------------------------------------

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
      or conversation_row.circle_enabled is not true
      or conversation_row.circle_activated_at is null
      or message.created_at >= conversation_row.circle_activated_at
    )
  order by message.created_at desc, media.sort_order
  limit greatest(1, least(coalesce(p_limit_count, 120), 300));
$$;

revoke all on function public.get_conversation_timeline(uuid, integer, timestamptz)
  from public;
grant execute on function public.get_conversation_timeline(uuid, integer, timestamptz)
  to authenticated;

-- Keep Timeline count aligned with the same provenance boundary.
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
      'is_circle', (conversation.kind = 'group' or conversation.circle_enabled),
      'circle_enabled', conversation.circle_enabled,
      'circle_activated_at', conversation.circle_activated_at,
      'other_user_id', case
        when conversation.kind = 'direct' then other_user.id
        else null
      end,
      'title', case
        when conversation.kind = 'direct' and not conversation.circle_enabled
          then coalesce(other_user.display_name, 'Connection')
        else coalesce(
          nullif(trim(conversation.title), ''),
          case when conversation.kind = 'direct' then 'Private Circle' else 'Private group' end
        )
      end,
      'avatar_url', case
        when conversation.kind = 'direct' and not conversation.circle_enabled
          then other_user.avatar_url
        else conversation.avatar_url
      end,
      'avatar_path', case
        when conversation.kind = 'group' or conversation.circle_enabled
          then conversation.avatar_path
        else null
      end,
      'bio', case
        when conversation.kind = 'direct' and not conversation.circle_enabled
          then null
        else conversation.bio
      end,
      'created_at', conversation.created_at,
      'created_by', conversation.created_by,
      'can_edit', conversation.kind = 'group',
      'timeline_count', (
        select count(*)
        from public.message_media timeline_media
        join public.messages timeline_message
          on timeline_message.id = timeline_media.message_id
        where timeline_message.conversation_id = conversation.id
          and (
            conversation.kind = 'group'
            or conversation.circle_enabled is not true
            or conversation.circle_activated_at is null
            or timeline_message.created_at >= conversation.circle_activated_at
          )
      ),
      'post_count', (
        select count(*)
        from public.conversation_posts post_row
        where post_row.conversation_id = conversation.id
      )
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
  where conversation.id = p_conversation_id;

  return v_result;
end;
$$;

revoke all on function public.get_conversation_details(uuid) from public;
grant execute on function public.get_conversation_details(uuid) to authenticated;

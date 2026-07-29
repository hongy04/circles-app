-- Circles Phase 7D — Plan-to-Memory Links
--
-- Lets a completed two-person plan deliberately reference one shared album and
-- one shared Circle post. Linking never copies media or publishes content.

-- ---------------------------------------------------------------------------
-- Feature control and privacy-safe analytics allowlists
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
      'two_person_plan_memory_links'
    )
  );

insert into public.app_feature_flags (
  flag_key,
  enabled,
  description
)
values (
  'two_person_plan_memory_links',
  true,
  'Enables deliberate links from completed two-person plans to one shared album and one shared post.'
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
      'two_person_important_date_removed',
      'two_person_thought_draft_created',
      'two_person_thought_draft_updated',
      'two_person_thought_shared',
      'two_person_thought_removed',
      'two_person_album_created',
      'two_person_album_updated',
      'two_person_album_removed',
      'two_person_album_photo_uploaded',
      'two_person_album_photo_removed',
      'two_person_plan_memory_album_updated',
      'two_person_plan_memory_post_updated'
    )
  );

create or replace function public.record_two_person_plan_memory_link_analytics(
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
    'two_person_plan_memory_album_updated',
    'two_person_plan_memory_post_updated'
  ) or p_action not in ('link', 'unlink') then
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
        'surface', 'two_person_plan_memory',
        'action', p_action
      )
    );
  exception
    when others then
      null;
  end;
end;
$$;

revoke all on function public.record_two_person_plan_memory_link_analytics(text, text)
  from public;

-- ---------------------------------------------------------------------------
-- Link storage
-- ---------------------------------------------------------------------------

alter table public.two_person_circle_plans
  add column if not exists memory_album_id uuid
    references public.two_person_circle_albums(id) on delete set null;

alter table public.two_person_circle_plans
  add column if not exists memory_post_id uuid
    references public.conversation_posts(id) on delete set null;

create index if not exists two_person_circle_plans_memory_album_index
  on public.two_person_circle_plans (memory_album_id)
  where memory_album_id is not null;

create index if not exists two_person_circle_plans_memory_post_index
  on public.two_person_circle_plans (memory_post_id)
  where memory_post_id is not null;

create or replace function public.two_person_plan_memory_links_feature_enabled()
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
      where flag_row.flag_key = 'two_person_plan_memory_links'
    ),
    true
  );
$$;

revoke all on function public.two_person_plan_memory_links_feature_enabled()
  from public;

-- Keep the existing plan payload and add only opaque link identifiers. The
-- linked album/post must still pass its own privacy RPC before content loads.
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
    'memory_album_id', plan_row.memory_album_id,
    'memory_post_id', plan_row.memory_post_id,
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
-- Deliberate linking RPCs
-- ---------------------------------------------------------------------------

create or replace function public.update_two_person_plan_memory_album(
  p_plan_id uuid,
  p_album_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.two_person_circle_plans%rowtype;
  v_album_conversation_id uuid;
  v_action text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.two_person_plan_memory_links_feature_enabled() then
    raise exception 'Memory links are temporarily unavailable.';
  end if;

  select *
  into v_plan
  from public.two_person_circle_plans plan_row
  where plan_row.id = p_plan_id
  for update;

  if v_plan.id is null
     or v_plan.status <> 'completed'
     or not public.two_person_circle_is_unlocked(
       v_plan.conversation_id,
       auth.uid()
     ) then
    raise exception 'This completed memory is unavailable.';
  end if;

  if p_album_id is not null then
    select album_row.conversation_id
    into v_album_conversation_id
    from public.two_person_circle_albums album_row
    where album_row.id = p_album_id;

    if v_album_conversation_id is null
       or v_album_conversation_id <> v_plan.conversation_id then
      raise exception 'Choose an album from this same Our Circle.';
    end if;
  end if;

  update public.two_person_circle_plans plan_row
  set
    memory_album_id = p_album_id,
    updated_by = auth.uid(),
    updated_at = now()
  where plan_row.id = p_plan_id;

  v_action := case when p_album_id is null then 'unlink' else 'link' end;
  perform public.record_two_person_plan_memory_link_analytics(
    'two_person_plan_memory_album_updated',
    v_action
  );

  return public.two_person_plan_json(p_plan_id, auth.uid());
end;
$$;

revoke all on function public.update_two_person_plan_memory_album(uuid, uuid)
  from public;
grant execute on function public.update_two_person_plan_memory_album(uuid, uuid)
  to authenticated;

create or replace function public.update_two_person_plan_memory_post(
  p_plan_id uuid,
  p_post_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.two_person_circle_plans%rowtype;
  v_post_conversation_id uuid;
  v_action text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.two_person_plan_memory_links_feature_enabled() then
    raise exception 'Memory links are temporarily unavailable.';
  end if;

  select *
  into v_plan
  from public.two_person_circle_plans plan_row
  where plan_row.id = p_plan_id
  for update;

  if v_plan.id is null
     or v_plan.status <> 'completed'
     or not public.two_person_circle_is_unlocked(
       v_plan.conversation_id,
       auth.uid()
     ) then
    raise exception 'This completed memory is unavailable.';
  end if;

  if p_post_id is not null then
    select post_row.conversation_id
    into v_post_conversation_id
    from public.conversation_posts post_row
    where post_row.id = p_post_id;

    if v_post_conversation_id is null
       or v_post_conversation_id <> v_plan.conversation_id then
      raise exception 'Choose a post from this same Our Circle.';
    end if;
  end if;

  update public.two_person_circle_plans plan_row
  set
    memory_post_id = p_post_id,
    updated_by = auth.uid(),
    updated_at = now()
  where plan_row.id = p_plan_id;

  v_action := case when p_post_id is null then 'unlink' else 'link' end;
  perform public.record_two_person_plan_memory_link_analytics(
    'two_person_plan_memory_post_updated',
    v_action
  );

  return public.two_person_plan_json(p_plan_id, auth.uid());
end;
$$;

revoke all on function public.update_two_person_plan_memory_post(uuid, uuid)
  from public;
grant execute on function public.update_two_person_plan_memory_post(uuid, uuid)
  to authenticated;

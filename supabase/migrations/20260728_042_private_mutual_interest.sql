-- Circles Phase 4B — private interest and Mutual Interest reveal
--
-- Adds the first romantic action only after the reciprocal Phase 4A channel is
-- open. One-sided interest is readable only by the person who selected it.
-- Mutual Interest is revealed to each person only when they next open the
-- existing direct conversation. Closing the channel or removing the connection
-- clears private interest and any active mutual state.

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
      'romantic_interest_beta'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'romantic_interest_beta',
  true,
  'Enables private romantic interest and mutual reveal inside eligible direct connections.'
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
      'romantic_interest_revealed'
    )
  );

create or replace function public.record_romantic_interest_analytics(
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
    'romantic_interest_updated',
    'romantic_interest_mutual_activated',
    'romantic_interest_revealed'
  ) then
    return;
  end if;

  if p_action not in (
    'select',
    'clear',
    'end_mutual',
    'activate',
    'reveal'
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
        'surface', case
          when p_event_name = 'romantic_interest_revealed'
            then 'direct_conversation'
          else 'connected_profile'
        end,
        'action', p_action
      )
    );
  exception
    when others then
      -- Analytics must never change consent or relationship state.
      null;
  end;
end;
$$;

revoke all on function public.record_romantic_interest_analytics(text, text) from public;

-- ---------------------------------------------------------------------------
-- Private selection and pair reveal state
-- ---------------------------------------------------------------------------

create table if not exists public.romantic_interests (
  selector_id uuid not null references public.users(id) on delete cascade,
  target_user_id uuid not null references public.users(id) on delete cascade,
  selected_at timestamptz not null default now(),
  primary key (selector_id, target_user_id),
  constraint romantic_interests_distinct_people check (
    selector_id <> target_user_id
  )
);

create index if not exists romantic_interests_target_index
  on public.romantic_interests (target_user_id, selector_id);

create table if not exists public.romantic_mutual_states (
  user_low_id uuid not null references public.users(id) on delete cascade,
  user_high_id uuid not null references public.users(id) on delete cascade,
  activated_at timestamptz not null default now(),
  user_low_revealed_at timestamptz,
  user_high_revealed_at timestamptz,
  primary key (user_low_id, user_high_id),
  constraint romantic_mutual_state_order check (
    user_low_id::text < user_high_id::text
  )
);

create index if not exists romantic_mutual_states_high_index
  on public.romantic_mutual_states (user_high_id, user_low_id);

alter table public.romantic_interests enable row level security;
alter table public.romantic_mutual_states enable row level security;

-- No direct policies are intentionally created. Pair state is available only
-- through the security-definer functions below. In particular, a user cannot
-- query whether the other person selected them before the state is revealed.

-- ---------------------------------------------------------------------------
-- Internal pair cleanup
-- ---------------------------------------------------------------------------

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

create or replace function public.prune_closed_romantic_state_for_user(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_id uuid;
begin
  if p_user_id is null then
    return;
  end if;

  for v_other_id in
    select distinct pair_rows.other_id
    from (
      select interest_row.target_user_id as other_id
      from public.romantic_interests interest_row
      where interest_row.selector_id = p_user_id

      union

      select interest_row.selector_id as other_id
      from public.romantic_interests interest_row
      where interest_row.target_user_id = p_user_id

      union

      select case
        when state_row.user_low_id = p_user_id then state_row.user_high_id
        else state_row.user_low_id
      end as other_id
      from public.romantic_mutual_states state_row
      where state_row.user_low_id = p_user_id
         or state_row.user_high_id = p_user_id
    ) pair_rows
  loop
    if not public.romantic_channel_is_open(p_user_id, v_other_id) then
      perform public.clear_romantic_pair_state(p_user_id, v_other_id);
    end if;
  end loop;
end;
$$;

revoke all on function public.prune_closed_romantic_state_for_user(uuid) from public;

create or replace function public.prune_romantic_state_after_preference_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.prune_closed_romantic_state_for_user(new.user_id);
  return new;
end;
$$;

drop trigger if exists romantic_preferences_prune_interest on public.romantic_preferences;
create trigger romantic_preferences_prune_interest
after insert or update on public.romantic_preferences
for each row
execute function public.prune_romantic_state_after_preference_change();

create or replace function public.prune_romantic_state_after_visibility_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_target_user_id uuid;
begin
  if tg_op = 'DELETE' then
    v_owner_id := old.owner_id;
    v_target_user_id := old.target_user_id;
  else
    v_owner_id := new.owner_id;
    v_target_user_id := new.target_user_id;
  end if;

  perform public.prune_closed_romantic_state_for_user(v_owner_id);
  perform public.prune_closed_romantic_state_for_user(v_target_user_id);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists romantic_visibility_prune_interest on public.romantic_visibility_overrides;
create trigger romantic_visibility_prune_interest
after insert or update or delete on public.romantic_visibility_overrides
for each row
execute function public.prune_romantic_state_after_visibility_change();

create or replace function public.clear_romantic_state_after_connection_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.clear_romantic_pair_state(old.user_id, old.other_user_id);
  return old;
end;
$$;

drop trigger if exists connections_clear_romantic_state on public.connections;
create trigger connections_clear_romantic_state
after delete on public.connections
for each row
execute function public.clear_romantic_state_after_connection_delete();

-- ---------------------------------------------------------------------------
-- Pair status for the connected profile
-- ---------------------------------------------------------------------------

create or replace function public.get_romantic_interest_status(
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
  v_channel_feature_enabled boolean := true;
  v_interest_feature_enabled boolean := true;
  v_connected boolean := false;
  v_channel_open boolean := false;
  v_selected_by_me boolean := false;
  v_mutual_revealed boolean := false;
  v_low uuid;
  v_high uuid;
  v_state public.romantic_mutual_states%rowtype;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_channel_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'romantic_channel_beta';

  select coalesce(flag_row.enabled, true)
  into v_interest_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'romantic_interest_beta';

  v_connected := p_other_user_id is not null
    and p_other_user_id <> v_viewer_id
    and exists (
      select 1
      from public.connections connection_row
      where connection_row.user_id = v_viewer_id
        and connection_row.other_user_id = p_other_user_id
    );

  if coalesce(v_channel_feature_enabled, true)
     and coalesce(v_interest_feature_enabled, true)
     and v_connected then
    v_channel_open := public.romantic_channel_is_open(
      v_viewer_id,
      p_other_user_id
    );
  end if;

  if v_channel_open then
    v_selected_by_me := exists (
      select 1
      from public.romantic_interests interest_row
      where interest_row.selector_id = v_viewer_id
        and interest_row.target_user_id = p_other_user_id
    );

    v_low := least(v_viewer_id::text, p_other_user_id::text)::uuid;
    v_high := greatest(v_viewer_id::text, p_other_user_id::text)::uuid;

    select state_row.*
    into v_state
    from public.romantic_mutual_states state_row
    where state_row.user_low_id = v_low
      and state_row.user_high_id = v_high;

    if found then
      v_mutual_revealed := case
        when v_viewer_id = v_low then v_state.user_low_revealed_at is not null
        else v_state.user_high_revealed_at is not null
      end;
    end if;
  end if;

  return jsonb_build_object(
    'available', coalesce(v_channel_feature_enabled, true)
      and coalesce(v_interest_feature_enabled, true)
      and v_connected,
    'channel_open', v_channel_open,
    'selected_by_me', v_selected_by_me,
    'mutual_revealed', v_mutual_revealed
  );
end;
$$;

revoke all on function public.get_romantic_interest_status(uuid) from public;
grant execute on function public.get_romantic_interest_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Private interest action
-- ---------------------------------------------------------------------------

create or replace function public.set_my_romantic_interest(
  p_target_user_id uuid,
  p_selected boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_channel_feature_enabled boolean := true;
  v_interest_feature_enabled boolean := true;
  v_pair_key text;
  v_low uuid;
  v_high uuid;
  v_selected_before boolean := false;
  v_reciprocal_selected boolean := false;
  v_mutual_before boolean := false;
  v_mutual_activated boolean := false;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_target_user_id is null or p_target_user_id = v_viewer_id then
    raise exception 'Choose an accepted connection';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_channel_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'romantic_channel_beta';

  select coalesce(flag_row.enabled, true)
  into v_interest_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'romantic_interest_beta';

  if not coalesce(v_channel_feature_enabled, true)
     or not coalesce(v_interest_feature_enabled, true) then
    raise exception 'Romantic interest is temporarily unavailable';
  end if;

  if not public.romantic_channel_is_open(v_viewer_id, p_target_user_id) then
    perform public.clear_romantic_pair_state(v_viewer_id, p_target_user_id);
    raise exception 'Romantic interest is unavailable for this connection';
  end if;

  v_pair_key := public.conversation_direct_key(v_viewer_id, p_target_user_id);
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair_key, 0));

  v_low := least(v_viewer_id::text, p_target_user_id::text)::uuid;
  v_high := greatest(v_viewer_id::text, p_target_user_id::text)::uuid;

  v_selected_before := exists (
    select 1
    from public.romantic_interests interest_row
    where interest_row.selector_id = v_viewer_id
      and interest_row.target_user_id = p_target_user_id
  );

  v_mutual_before := exists (
    select 1
    from public.romantic_mutual_states state_row
    where state_row.user_low_id = v_low
      and state_row.user_high_id = v_high
  );

  if coalesce(p_selected, false) then
    insert into public.romantic_interests (
      selector_id,
      target_user_id,
      selected_at
    )
    values (
      v_viewer_id,
      p_target_user_id,
      now()
    )
    on conflict (selector_id, target_user_id) do nothing;

    v_reciprocal_selected := exists (
      select 1
      from public.romantic_interests interest_row
      where interest_row.selector_id = p_target_user_id
        and interest_row.target_user_id = v_viewer_id
    );

    if v_reciprocal_selected then
      insert into public.romantic_mutual_states (
        user_low_id,
        user_high_id,
        activated_at
      )
      values (
        v_low,
        v_high,
        now()
      )
      on conflict (user_low_id, user_high_id) do nothing;

      v_mutual_activated := not v_mutual_before;
    end if;

    if not v_selected_before then
      perform public.record_romantic_interest_analytics(
        'romantic_interest_updated',
        'select'
      );
    end if;

    if v_mutual_activated then
      perform public.record_romantic_interest_analytics(
        'romantic_interest_mutual_activated',
        'activate'
      );
    end if;
  else
    if v_mutual_before or exists (
      select 1
      from public.romantic_interests interest_row
      where interest_row.selector_id = p_target_user_id
        and interest_row.target_user_id = v_viewer_id
    ) then
      perform public.clear_romantic_pair_state(v_viewer_id, p_target_user_id);

      perform public.record_romantic_interest_analytics(
        'romantic_interest_updated',
        'end_mutual'
      );
    else
      delete from public.romantic_interests interest_row
      where interest_row.selector_id = v_viewer_id
        and interest_row.target_user_id = p_target_user_id;

      if v_selected_before then
        perform public.record_romantic_interest_analytics(
          'romantic_interest_updated',
          'clear'
        );
      end if;
    end if;
  end if;

  return public.get_romantic_interest_status(p_target_user_id);
end;
$$;

revoke all on function public.set_my_romantic_interest(uuid, boolean) from public;
grant execute on function public.set_my_romantic_interest(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Reveal on the next opening of the existing direct conversation
-- ---------------------------------------------------------------------------

create or replace function public.open_romantic_mutual_reveal(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_channel_feature_enabled boolean := true;
  v_interest_feature_enabled boolean := true;
  v_other_user_id uuid;
  v_low uuid;
  v_high uuid;
  v_state public.romantic_mutual_states%rowtype;
  v_should_reveal boolean := false;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_channel_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'romantic_channel_beta';

  select coalesce(flag_row.enabled, true)
  into v_interest_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'romantic_interest_beta';

  if not coalesce(v_channel_feature_enabled, true)
     or not coalesce(v_interest_feature_enabled, true) then
    return jsonb_build_object(
      'mutual_active', false,
      'should_reveal', false
    );
  end if;

  select member_row.user_id
  into v_other_user_id
  from public.conversations conversation_row
  join public.conversation_members viewer_member
    on viewer_member.conversation_id = conversation_row.id
   and viewer_member.user_id = v_viewer_id
  join public.conversation_members member_row
    on member_row.conversation_id = conversation_row.id
   and member_row.user_id <> v_viewer_id
  where conversation_row.id = p_conversation_id
    and conversation_row.kind = 'direct'
  limit 1;

  if not found or v_other_user_id is null then
    return jsonb_build_object(
      'mutual_active', false,
      'should_reveal', false
    );
  end if;

  if not public.romantic_channel_is_open(v_viewer_id, v_other_user_id) then
    perform public.clear_romantic_pair_state(v_viewer_id, v_other_user_id);
    return jsonb_build_object(
      'mutual_active', false,
      'should_reveal', false
    );
  end if;

  v_low := least(v_viewer_id::text, v_other_user_id::text)::uuid;
  v_high := greatest(v_viewer_id::text, v_other_user_id::text)::uuid;

  select state_row.*
  into v_state
  from public.romantic_mutual_states state_row
  where state_row.user_low_id = v_low
    and state_row.user_high_id = v_high
  for update;

  if not found
     or not exists (
       select 1
       from public.romantic_interests interest_row
       where interest_row.selector_id = v_viewer_id
         and interest_row.target_user_id = v_other_user_id
     )
     or not exists (
       select 1
       from public.romantic_interests interest_row
       where interest_row.selector_id = v_other_user_id
         and interest_row.target_user_id = v_viewer_id
     ) then
    return jsonb_build_object(
      'mutual_active', false,
      'should_reveal', false
    );
  end if;

  if v_viewer_id = v_low and v_state.user_low_revealed_at is null then
    update public.romantic_mutual_states state_row
    set user_low_revealed_at = now()
    where state_row.user_low_id = v_low
      and state_row.user_high_id = v_high;
    v_should_reveal := true;
  elsif v_viewer_id = v_high and v_state.user_high_revealed_at is null then
    update public.romantic_mutual_states state_row
    set user_high_revealed_at = now()
    where state_row.user_low_id = v_low
      and state_row.user_high_id = v_high;
    v_should_reveal := true;
  end if;

  if v_should_reveal then
    perform public.record_romantic_interest_analytics(
      'romantic_interest_revealed',
      'reveal'
    );
  end if;

  return jsonb_build_object(
    'mutual_active', true,
    'should_reveal', v_should_reveal,
    'activated_at', v_state.activated_at
  );
end;
$$;

revoke all on function public.open_romantic_mutual_reveal(uuid) from public;
grant execute on function public.open_romantic_mutual_reveal(uuid) to authenticated;

-- Circles Phase 5A — private Focus selection and Mutual Focus
--
-- Adds the deliberate exclusivity step after Mutual Interest. Focus is selected
-- privately. When both people independently select it, outside romantic
-- discovery pauses for both people, unmatched outside interests are cleared,
-- and each person receives a private reveal on the next direct-chat opening.
-- Ending Focus resets the romantic state between the pair while ordinary
-- friendship and messages remain. Outside discovery stays paused until each
-- person deliberately resumes it from Romantic settings.

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
      'romantic_focus_beta'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'romantic_focus_beta',
  true,
  'Enables private Focus selection, mutual activation, and paused outside romantic discovery.'
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
      'romantic_discovery_resumed'
    )
  );

create or replace function public.record_romantic_focus_analytics(
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
    'romantic_focus_updated',
    'romantic_focus_mutual_activated',
    'romantic_focus_revealed',
    'romantic_discovery_resumed'
  ) then
    return;
  end if;

  if p_action not in (
    'select',
    'clear',
    'end_focus',
    'activate',
    'reveal',
    'resume'
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
          when p_event_name = 'romantic_focus_revealed'
            then 'direct_conversation'
          when p_event_name = 'romantic_discovery_resumed'
            then 'romantic_settings'
          else 'connected_profile'
        end,
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

revoke all on function public.record_romantic_focus_analytics(text, text) from public;

-- ---------------------------------------------------------------------------
-- Private Focus state
-- ---------------------------------------------------------------------------

create table if not exists public.romantic_focus_selections (
  selector_id uuid not null references public.users(id) on delete cascade,
  target_user_id uuid not null references public.users(id) on delete cascade,
  selected_at timestamptz not null default now(),
  primary key (selector_id, target_user_id),
  constraint romantic_focus_selections_distinct_people check (
    selector_id <> target_user_id
  )
);

create index if not exists romantic_focus_selections_target_index
  on public.romantic_focus_selections (target_user_id, selector_id);

create table if not exists public.romantic_focus_states (
  user_low_id uuid not null references public.users(id) on delete cascade,
  user_high_id uuid not null references public.users(id) on delete cascade,
  activated_at timestamptz not null default now(),
  user_low_revealed_at timestamptz,
  user_high_revealed_at timestamptz,
  primary key (user_low_id, user_high_id),
  constraint romantic_focus_state_order check (
    user_low_id::text < user_high_id::text
  )
);

create index if not exists romantic_focus_states_high_index
  on public.romantic_focus_states (user_high_id, user_low_id);

create table if not exists public.romantic_focus_pauses (
  user_id uuid primary key references public.users(id) on delete cascade,
  paused_at timestamptz not null default now()
);

alter table public.romantic_focus_selections enable row level security;
alter table public.romantic_focus_states enable row level security;
alter table public.romantic_focus_pauses enable row level security;

-- No direct policies are created. All reads and writes pass through the
-- security-definer functions below, so one-sided Focus choices remain private.

-- ---------------------------------------------------------------------------
-- Internal Focus helpers and pause-aware channel rules
-- ---------------------------------------------------------------------------

create or replace function public.romantic_focus_pair_is_active(
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_user_a is not null
    and p_user_b is not null
    and p_user_a <> p_user_b
    and exists (
      select 1
      from public.romantic_focus_states state_row
      where state_row.user_low_id = least(p_user_a::text, p_user_b::text)::uuid
        and state_row.user_high_id = greatest(p_user_a::text, p_user_b::text)::uuid
    ),
    false
  );
$$;

revoke all on function public.romantic_focus_pair_is_active(uuid, uuid) from public;

create or replace function public.romantic_discovery_is_paused(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1
    from public.romantic_focus_pauses pause_row
    where pause_row.user_id = p_user_id
  ), false);
$$;

revoke all on function public.romantic_discovery_is_paused(uuid) from public;

create or replace function public.romantic_base_visibility_is_open(
  p_owner_id uuid,
  p_target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      preference_row.enabled
      and preference_row.age_confirmed
      and exists (
        select 1
        from public.connections connection_row
        where connection_row.user_id = p_owner_id
          and connection_row.other_user_id = p_target_user_id
      )
      and coalesce(
        (
          select override_row.visible
          from public.romantic_visibility_overrides override_row
          where override_row.owner_id = p_owner_id
            and override_row.target_user_id = p_target_user_id
        ),
        preference_row.audience_mode = 'all_connections'
      )
    from public.romantic_preferences preference_row
    where preference_row.user_id = p_owner_id
  ), false);
$$;

revoke all on function public.romantic_base_visibility_is_open(uuid, uuid) from public;

create or replace function public.romantic_visibility_is_open(
  p_owner_id uuid,
  p_target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.romantic_base_visibility_is_open(p_owner_id, p_target_user_id)
    and (
      public.romantic_focus_pair_is_active(p_owner_id, p_target_user_id)
      or not public.romantic_discovery_is_paused(p_owner_id)
    );
$$;

revoke all on function public.romantic_visibility_is_open(uuid, uuid) from public;

create or replace function public.romantic_channel_is_open(
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_user_a is not null
    and p_user_b is not null
    and p_user_a <> p_user_b
    and public.romantic_visibility_is_open(p_user_a, p_user_b)
    and public.romantic_visibility_is_open(p_user_b, p_user_a);
$$;

revoke all on function public.romantic_channel_is_open(uuid, uuid) from public;

-- Clear all romantic state for a pair. Focus pauses intentionally remain; they
-- are removed only by each person's explicit resume action.
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
-- Owner-only settings now expose only the user's own pause state
-- ---------------------------------------------------------------------------

create or replace function public.get_my_romantic_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_enabled boolean := false;
  v_age_confirmed boolean := false;
  v_audience_mode text := 'all_connections';
  v_connections jsonb := '[]'::jsonb;
  v_visible_count integer := 0;
  v_focus_paused boolean := false;
  v_focus_active boolean := false;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select
    preference_row.enabled,
    preference_row.age_confirmed,
    preference_row.audience_mode
  into
    v_enabled,
    v_age_confirmed,
    v_audience_mode
  from public.romantic_preferences preference_row
  where preference_row.user_id = v_viewer_id;

  if not found then
    v_enabled := false;
    v_age_confirmed := false;
    v_audience_mode := 'all_connections';
  end if;

  v_focus_paused := public.romantic_discovery_is_paused(v_viewer_id);

  v_focus_active := exists (
    select 1
    from public.romantic_focus_states state_row
    where state_row.user_low_id = v_viewer_id
       or state_row.user_high_id = v_viewer_id
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', user_row.id,
        'display_name', coalesce(user_row.display_name, 'Connection'),
        'username', user_row.username,
        'avatar_url', user_row.avatar_url,
        'visible', coalesce(
          override_row.visible,
          v_audience_mode = 'all_connections'
        )
      )
      order by lower(coalesce(user_row.display_name, '')), user_row.id
    ),
    '[]'::jsonb
  )
  into v_connections
  from public.connections connection_row
  join public.users user_row
    on user_row.id = connection_row.other_user_id
  left join public.romantic_visibility_overrides override_row
    on override_row.owner_id = v_viewer_id
   and override_row.target_user_id = connection_row.other_user_id
  where connection_row.user_id = v_viewer_id
    and connection_row.other_user_id <> v_viewer_id;

  select count(*)::integer
  into v_visible_count
  from jsonb_array_elements(v_connections) connection_json
  where coalesce((connection_json ->> 'visible')::boolean, false);

  return jsonb_build_object(
    'enabled', v_enabled,
    'age_confirmed', v_age_confirmed,
    'audience_mode', v_audience_mode,
    'visible_count', coalesce(v_visible_count, 0),
    'focus_paused', v_focus_paused,
    'focus_active', v_focus_active,
    'connections', v_connections
  );
end;
$$;

revoke all on function public.get_my_romantic_settings() from public;
grant execute on function public.get_my_romantic_settings() to authenticated;

create or replace function public.resume_my_romantic_discovery()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_feature_enabled boolean := true;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'romantic_focus_beta';

  if not coalesce(v_feature_enabled, true) then
    raise exception 'Romantic Focus is temporarily unavailable';
  end if;

  if exists (
    select 1
    from public.romantic_focus_states state_row
    where state_row.user_low_id = v_viewer_id
       or state_row.user_high_id = v_viewer_id
  ) then
    raise exception 'End Mutual Focus before resuming outside romantic discovery';
  end if;

  delete from public.romantic_focus_pauses pause_row
  where pause_row.user_id = v_viewer_id;

  perform public.record_romantic_focus_analytics(
    'romantic_discovery_resumed',
    'resume'
  );

  return public.get_my_romantic_settings();
end;
$$;

revoke all on function public.resume_my_romantic_discovery() from public;
grant execute on function public.resume_my_romantic_discovery() to authenticated;

-- ---------------------------------------------------------------------------
-- Pair status extends Phase 4B without exposing the other person's choice
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
  v_focus_feature_enabled boolean := true;
  v_connected boolean := false;
  v_channel_open boolean := false;
  v_selected_by_me boolean := false;
  v_mutual_revealed boolean := false;
  v_focus_available boolean := false;
  v_focus_selected_by_me boolean := false;
  v_focus_mutual_revealed boolean := false;
  v_focus_active_for_viewer boolean := false;
  v_low uuid;
  v_high uuid;
  v_state public.romantic_mutual_states%rowtype;
  v_focus_state public.romantic_focus_states%rowtype;
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

  select coalesce(flag_row.enabled, true)
  into v_focus_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'romantic_focus_beta';

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

    if coalesce(v_focus_feature_enabled, true) and v_mutual_revealed then
      v_focus_selected_by_me := exists (
        select 1
        from public.romantic_focus_selections selection_row
        where selection_row.selector_id = v_viewer_id
          and selection_row.target_user_id = p_other_user_id
      );

      select state_row.*
      into v_focus_state
      from public.romantic_focus_states state_row
      where state_row.user_low_id = v_low
        and state_row.user_high_id = v_high;

      if found then
        v_focus_mutual_revealed := case
          when v_viewer_id = v_low
            then v_focus_state.user_low_revealed_at is not null
          else v_focus_state.user_high_revealed_at is not null
        end;
        v_focus_active_for_viewer := v_focus_mutual_revealed;
      end if;

      v_focus_available := not exists (
        select 1
        from public.romantic_focus_states other_state
        where (other_state.user_low_id = v_viewer_id
               or other_state.user_high_id = v_viewer_id)
          and not (
            other_state.user_low_id = v_low
            and other_state.user_high_id = v_high
          )
      );
    end if;
  end if;

  return jsonb_build_object(
    'available', coalesce(v_channel_feature_enabled, true)
      and coalesce(v_interest_feature_enabled, true)
      and v_connected,
    'channel_open', v_channel_open,
    'selected_by_me', v_selected_by_me,
    'mutual_revealed', v_mutual_revealed,
    'focus_available', v_focus_available,
    'focus_selected_by_me', v_focus_selected_by_me,
    'focus_mutual_revealed', v_focus_mutual_revealed,
    'focus_active', v_focus_active_for_viewer
  );
end;
$$;

revoke all on function public.get_romantic_interest_status(uuid) from public;
grant execute on function public.get_romantic_interest_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Private Focus action
-- ---------------------------------------------------------------------------

create or replace function public.set_my_romantic_focus(
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
  v_focus_feature_enabled boolean := true;
  v_low uuid;
  v_high uuid;
  v_mutual_state public.romantic_mutual_states%rowtype;
  v_selected_before boolean := false;
  v_reciprocal_selected boolean := false;
  v_focus_active_before boolean := false;
  v_focus_activated boolean := false;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_target_user_id is null or p_target_user_id = v_viewer_id then
    raise exception 'Choose an accepted connection';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_focus_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'romantic_focus_beta';

  if not coalesce(v_focus_feature_enabled, true) then
    raise exception 'Romantic Focus is temporarily unavailable';
  end if;

  if not public.romantic_channel_is_open(v_viewer_id, p_target_user_id) then
    raise exception 'Focus is unavailable for this connection';
  end if;

  v_low := least(v_viewer_id::text, p_target_user_id::text)::uuid;
  v_high := greatest(v_viewer_id::text, p_target_user_id::text)::uuid;

  -- Lock both people in deterministic order so neither can activate Focus with
  -- two different connections concurrently.
  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended('romantic-focus-user:' || v_low::text, 0)
  );
  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended('romantic-focus-user:' || v_high::text, 0)
  );

  select state_row.*
  into v_mutual_state
  from public.romantic_mutual_states state_row
  where state_row.user_low_id = v_low
    and state_row.user_high_id = v_high
  for update;

  if not found then
    raise exception 'Mutual Interest is required before Focus';
  end if;

  if (v_viewer_id = v_low and v_mutual_state.user_low_revealed_at is null)
     or (v_viewer_id = v_high and v_mutual_state.user_high_revealed_at is null) then
    raise exception 'Open your direct conversation before choosing Focus';
  end if;

  v_selected_before := exists (
    select 1
    from public.romantic_focus_selections selection_row
    where selection_row.selector_id = v_viewer_id
      and selection_row.target_user_id = p_target_user_id
  );

  v_focus_active_before := exists (
    select 1
    from public.romantic_focus_states state_row
    where state_row.user_low_id = v_low
      and state_row.user_high_id = v_high
  );

  if coalesce(p_selected, false) then
    if exists (
      select 1
      from public.romantic_focus_states state_row
      where state_row.user_low_id in (v_viewer_id, p_target_user_id)
         or state_row.user_high_id in (v_viewer_id, p_target_user_id)
    ) and not v_focus_active_before then
      raise exception 'One of you is already focusing on another connection';
    end if;

    -- A private Focus choice is itself intentional and singular. Choosing a
    -- different connection replaces the viewer's older one-sided choice.
    delete from public.romantic_focus_selections selection_row
    where selection_row.selector_id = v_viewer_id
      and selection_row.target_user_id <> p_target_user_id;

    insert into public.romantic_focus_selections (
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
      from public.romantic_focus_selections selection_row
      where selection_row.selector_id = p_target_user_id
        and selection_row.target_user_id = v_viewer_id
    );

    if v_reciprocal_selected and not v_focus_active_before then
      if exists (
        select 1
        from public.romantic_focus_states state_row
        where state_row.user_low_id in (v_viewer_id, p_target_user_id)
           or state_row.user_high_id in (v_viewer_id, p_target_user_id)
      ) then
        raise exception 'One of you is already focusing on another connection';
      end if;

      insert into public.romantic_focus_states (
        user_low_id,
        user_high_id,
        activated_at
      )
      values (
        v_low,
        v_high,
        now()
      );

      insert into public.romantic_focus_pauses (user_id, paused_at)
      values
        (v_viewer_id, now()),
        (p_target_user_id, now())
      on conflict (user_id) do update
      set paused_at = excluded.paused_at;

      -- Only one Focus selection can remain for either person.
      delete from public.romantic_focus_selections selection_row
      where (selection_row.selector_id in (v_viewer_id, p_target_user_id)
             or selection_row.target_user_id in (v_viewer_id, p_target_user_id))
        and not (
          (selection_row.selector_id = v_viewer_id
           and selection_row.target_user_id = p_target_user_id)
          or
          (selection_row.selector_id = p_target_user_id
           and selection_row.target_user_id = v_viewer_id)
        );

      -- Clear unmatched one-sided romantic interest involving either focused
      -- person. Existing mutual interests with other people remain paused and
      -- private until romantic discovery is deliberately resumed.
      delete from public.romantic_interests interest_row
      where (interest_row.selector_id in (v_viewer_id, p_target_user_id)
             or interest_row.target_user_id in (v_viewer_id, p_target_user_id))
        and not (
          (interest_row.selector_id = v_viewer_id
           and interest_row.target_user_id = p_target_user_id)
          or
          (interest_row.selector_id = p_target_user_id
           and interest_row.target_user_id = v_viewer_id)
        )
        and not exists (
          select 1
          from public.romantic_mutual_states mutual_row
          where mutual_row.user_low_id = least(
                  interest_row.selector_id::text,
                  interest_row.target_user_id::text
                )::uuid
            and mutual_row.user_high_id = greatest(
                  interest_row.selector_id::text,
                  interest_row.target_user_id::text
                )::uuid
        );

      v_focus_activated := true;
    end if;

    if not v_selected_before then
      perform public.record_romantic_focus_analytics(
        'romantic_focus_updated',
        'select'
      );
    end if;

    if v_focus_activated then
      perform public.record_romantic_focus_analytics(
        'romantic_focus_mutual_activated',
        'activate'
      );
    end if;
  else
    if v_focus_active_before then
      perform public.clear_romantic_pair_state(v_viewer_id, p_target_user_id);

      perform public.record_romantic_focus_analytics(
        'romantic_focus_updated',
        'end_focus'
      );
    else
      delete from public.romantic_focus_selections selection_row
      where selection_row.selector_id = v_viewer_id
        and selection_row.target_user_id = p_target_user_id;

      if v_selected_before then
        perform public.record_romantic_focus_analytics(
          'romantic_focus_updated',
          'clear'
        );
      end if;
    end if;
  end if;

  return public.get_romantic_interest_status(p_target_user_id);
end;
$$;

revoke all on function public.set_my_romantic_focus(uuid, boolean) from public;
grant execute on function public.set_my_romantic_focus(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Focus reveal on the next opening of the existing direct conversation
-- ---------------------------------------------------------------------------

create or replace function public.open_romantic_focus_reveal(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_focus_feature_enabled boolean := true;
  v_other_user_id uuid;
  v_low uuid;
  v_high uuid;
  v_state public.romantic_focus_states%rowtype;
  v_should_reveal boolean := false;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_focus_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'romantic_focus_beta';

  if not coalesce(v_focus_feature_enabled, true) then
    return jsonb_build_object(
      'focus_active', false,
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
      'focus_active', false,
      'should_reveal', false
    );
  end if;

  if not public.romantic_channel_is_open(v_viewer_id, v_other_user_id) then
    return jsonb_build_object(
      'focus_active', false,
      'should_reveal', false
    );
  end if;

  v_low := least(v_viewer_id::text, v_other_user_id::text)::uuid;
  v_high := greatest(v_viewer_id::text, v_other_user_id::text)::uuid;

  select state_row.*
  into v_state
  from public.romantic_focus_states state_row
  where state_row.user_low_id = v_low
    and state_row.user_high_id = v_high
  for update;

  if not found
     or not exists (
       select 1
       from public.romantic_focus_selections selection_row
       where selection_row.selector_id = v_viewer_id
         and selection_row.target_user_id = v_other_user_id
     )
     or not exists (
       select 1
       from public.romantic_focus_selections selection_row
       where selection_row.selector_id = v_other_user_id
         and selection_row.target_user_id = v_viewer_id
     ) then
    return jsonb_build_object(
      'focus_active', false,
      'should_reveal', false
    );
  end if;

  if v_viewer_id = v_low and v_state.user_low_revealed_at is null then
    update public.romantic_focus_states state_row
    set user_low_revealed_at = now()
    where state_row.user_low_id = v_low
      and state_row.user_high_id = v_high;
    v_should_reveal := true;
  elsif v_viewer_id = v_high and v_state.user_high_revealed_at is null then
    update public.romantic_focus_states state_row
    set user_high_revealed_at = now()
    where state_row.user_low_id = v_low
      and state_row.user_high_id = v_high;
    v_should_reveal := true;
  end if;

  if v_should_reveal then
    perform public.record_romantic_focus_analytics(
      'romantic_focus_revealed',
      'reveal'
    );
  end if;

  return jsonb_build_object(
    'focus_active', true,
    'should_reveal', v_should_reveal,
    'activated_at', v_state.activated_at
  );
end;
$$;

revoke all on function public.open_romantic_focus_reveal(uuid) from public;
grant execute on function public.open_romantic_focus_reveal(uuid) to authenticated;

-- Preserve mutual-interest state with other people while discovery is paused.
-- A chat opening should not silently erase that state merely because Focus has
-- temporarily closed outside channels.
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
    if public.romantic_discovery_is_paused(v_viewer_id)
       or public.romantic_discovery_is_paused(v_other_user_id) then
      return jsonb_build_object(
        'mutual_active', false,
        'should_reveal', false
      );
    end if;

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

-- Circles Phase 4A — romantic channel privacy foundation
--
-- Establishes the consent boundary before any romantic interest action exists.
-- Romance is off by default, requires an 18+ confirmation, and becomes visible
-- between two accepted connections only when both people independently include
-- one another in their audience. No one-sided audience choice is revealed.

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
      'romantic_channel_beta'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'romantic_channel_beta',
  true,
  'Enables the consent and audience foundation for romantic features between accepted adult connections.'
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
      'romantic_visibility_updated'
    )
  );

create or replace function public.record_romantic_settings_analytics(
  p_event_name text,
  p_action text,
  p_audience_mode text default null,
  p_visible_count integer default null
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
    'romantic_settings_updated',
    'romantic_visibility_updated'
  ) then
    return;
  end if;

  if p_action not in (
    'enable',
    'disable',
    'audience_all',
    'audience_selected',
    'include',
    'exclude'
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
      jsonb_strip_nulls(jsonb_build_object(
        'surface', 'romantic_settings',
        'action', p_action,
        'audience_mode', case
          when p_audience_mode in ('all_connections', 'selected_connections')
            then p_audience_mode
          else null
        end,
        'visible_count', case
          when p_visible_count is null then null
          else greatest(0, least(p_visible_count, 5000))
        end
      ))
    );
  exception
    when others then
      -- Analytics must never block privacy or consent changes.
      null;
  end;
end;
$$;

revoke all on function public.record_romantic_settings_analytics(text, text, text, integer) from public;

-- ---------------------------------------------------------------------------
-- Private preference and per-connection audience state
-- ---------------------------------------------------------------------------

create table if not exists public.romantic_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  enabled boolean not null default false,
  age_confirmed boolean not null default false,
  audience_mode text not null default 'all_connections'
    check (audience_mode in ('all_connections', 'selected_connections')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint romantic_preferences_age_gate check (
    not enabled or age_confirmed
  )
);

create table if not exists public.romantic_visibility_overrides (
  owner_id uuid not null references public.users(id) on delete cascade,
  target_user_id uuid not null references public.users(id) on delete cascade,
  visible boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, target_user_id),
  constraint romantic_visibility_distinct_people check (
    owner_id <> target_user_id
  )
);

create index if not exists romantic_visibility_target_index
  on public.romantic_visibility_overrides (target_user_id, owner_id);

alter table public.romantic_preferences enable row level security;
alter table public.romantic_visibility_overrides enable row level security;

-- No direct policies are intentionally created. All reads and writes pass
-- through the security-definer RPCs below so another person's one-sided
-- settings can never be queried directly.

-- ---------------------------------------------------------------------------
-- Internal consent helpers
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Owner-only settings directory
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
    'connections', v_connections
  );
end;
$$;

revoke all on function public.get_my_romantic_settings() from public;
grant execute on function public.get_my_romantic_settings() to authenticated;

create or replace function public.update_my_romantic_settings(
  p_enabled boolean,
  p_age_confirmed boolean,
  p_audience_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_feature_enabled boolean := true;
  v_previous_mode text := 'all_connections';
  v_mode_changed boolean := false;
  v_visible_count integer := 0;
  v_action text;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'romantic_channel_beta';

  if not coalesce(v_feature_enabled, true) then
    raise exception 'Romantic settings are temporarily unavailable';
  end if;

  if p_audience_mode not in ('all_connections', 'selected_connections') then
    raise exception 'Choose a valid audience option';
  end if;

  if coalesce(p_enabled, false) and not coalesce(p_age_confirmed, false) then
    raise exception 'You must confirm that you are 18 or older';
  end if;

  select preference_row.audience_mode
  into v_previous_mode
  from public.romantic_preferences preference_row
  where preference_row.user_id = v_viewer_id;

  if not found then
    v_previous_mode := 'all_connections';
  end if;

  v_mode_changed := v_previous_mode <> p_audience_mode;

  insert into public.romantic_preferences (
    user_id,
    enabled,
    age_confirmed,
    audience_mode,
    updated_at
  )
  values (
    v_viewer_id,
    coalesce(p_enabled, false),
    coalesce(p_age_confirmed, false),
    p_audience_mode,
    now()
  )
  on conflict (user_id) do update
  set
    enabled = excluded.enabled,
    age_confirmed = excluded.age_confirmed,
    audience_mode = excluded.audience_mode,
    updated_at = now();

  if v_mode_changed then
    -- Choosing a new audience strategy intentionally starts from that strategy's
    -- clean default. The user can then make explicit person-level exceptions.
    delete from public.romantic_visibility_overrides override_row
    where override_row.owner_id = v_viewer_id;
  end if;

  select count(*)::integer
  into v_visible_count
  from public.connections connection_row
  where connection_row.user_id = v_viewer_id
    and connection_row.other_user_id <> v_viewer_id
    and coalesce(
      (
        select override_row.visible
        from public.romantic_visibility_overrides override_row
        where override_row.owner_id = v_viewer_id
          and override_row.target_user_id = connection_row.other_user_id
      ),
      p_audience_mode = 'all_connections'
    );

  v_action := case
    when coalesce(p_enabled, false) then
      case
        when v_mode_changed and p_audience_mode = 'all_connections'
          then 'audience_all'
        when v_mode_changed and p_audience_mode = 'selected_connections'
          then 'audience_selected'
        else 'enable'
      end
    else 'disable'
  end;

  perform public.record_romantic_settings_analytics(
    'romantic_settings_updated',
    v_action,
    p_audience_mode,
    v_visible_count
  );

  return public.get_my_romantic_settings();
end;
$$;

revoke all on function public.update_my_romantic_settings(boolean, boolean, text) from public;
grant execute on function public.update_my_romantic_settings(boolean, boolean, text) to authenticated;

create or replace function public.set_my_romantic_visibility(
  p_target_user_id uuid,
  p_visible boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_feature_enabled boolean := true;
  v_preference public.romantic_preferences%rowtype;
  v_default_visible boolean := false;
  v_visible_count integer := 0;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'romantic_channel_beta';

  if not coalesce(v_feature_enabled, true) then
    raise exception 'Romantic settings are temporarily unavailable';
  end if;

  if p_target_user_id is null or p_target_user_id = v_viewer_id then
    raise exception 'Choose an accepted connection';
  end if;

  if not exists (
    select 1
    from public.connections connection_row
    where connection_row.user_id = v_viewer_id
      and connection_row.other_user_id = p_target_user_id
  ) then
    raise exception 'Romantic visibility is available only for accepted connections';
  end if;

  select preference_row.*
  into v_preference
  from public.romantic_preferences preference_row
  where preference_row.user_id = v_viewer_id;

  if not found or not v_preference.enabled or not v_preference.age_confirmed then
    raise exception 'Turn on romantic connections before choosing an audience';
  end if;

  v_default_visible := v_preference.audience_mode = 'all_connections';

  if coalesce(p_visible, false) = v_default_visible then
    delete from public.romantic_visibility_overrides override_row
    where override_row.owner_id = v_viewer_id
      and override_row.target_user_id = p_target_user_id;
  else
    insert into public.romantic_visibility_overrides (
      owner_id,
      target_user_id,
      visible,
      updated_at
    )
    values (
      v_viewer_id,
      p_target_user_id,
      coalesce(p_visible, false),
      now()
    )
    on conflict (owner_id, target_user_id) do update
    set
      visible = excluded.visible,
      updated_at = now();
  end if;

  select count(*)::integer
  into v_visible_count
  from public.connections connection_row
  where connection_row.user_id = v_viewer_id
    and connection_row.other_user_id <> v_viewer_id
    and coalesce(
      (
        select override_row.visible
        from public.romantic_visibility_overrides override_row
        where override_row.owner_id = v_viewer_id
          and override_row.target_user_id = connection_row.other_user_id
      ),
      v_default_visible
    );

  perform public.record_romantic_settings_analytics(
    'romantic_visibility_updated',
    case when coalesce(p_visible, false) then 'include' else 'exclude' end,
    v_preference.audience_mode,
    v_visible_count
  );

  return public.get_my_romantic_settings();
end;
$$;

revoke all on function public.set_my_romantic_visibility(uuid, boolean) from public;
grant execute on function public.set_my_romantic_visibility(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Pair-level result. This reveals only the combined channel state, never either
-- person's underlying global setting, audience mode, or one-sided choice.
-- ---------------------------------------------------------------------------

create or replace function public.get_romantic_channel_status(
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
  v_connected boolean := false;
  v_channel_open boolean := false;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_feature_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'romantic_channel_beta';

  v_connected := p_other_user_id is not null
    and p_other_user_id <> v_viewer_id
    and exists (
      select 1
      from public.connections connection_row
      where connection_row.user_id = v_viewer_id
        and connection_row.other_user_id = p_other_user_id
    );

  if coalesce(v_feature_enabled, true) and v_connected then
    v_channel_open := public.romantic_channel_is_open(
      v_viewer_id,
      p_other_user_id
    );
  end if;

  return jsonb_build_object(
    'available', coalesce(v_feature_enabled, true) and v_connected,
    'channel_open', v_channel_open
  );
end;
$$;

revoke all on function public.get_romantic_channel_status(uuid) from public;
grant execute on function public.get_romantic_channel_status(uuid) to authenticated;

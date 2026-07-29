-- Phase 8C: private date-of-birth storage and server-enforced adult
-- eligibility for romantic features.
--
-- Birth dates are owner-only and unavailable through ordinary profile queries.
-- The old client-supplied age checkbox is no longer trusted. Romantic access is
-- derived from this private table on every server-side channel check.

create table if not exists public.user_age_eligibility (
  user_id uuid primary key references public.users(id) on delete cascade,
  date_of_birth date not null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_age_eligibility enable row level security;

-- No direct RLS policies are created. An account owner may read or set their
-- own date only through the security-definer RPCs below. Other users, profiles,
-- analytics, and discovery queries cannot access it.

create or replace function public.romantic_age_is_eligible(
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
    from public.user_age_eligibility age_row
    where age_row.user_id = p_user_id
      and age_row.date_of_birth <= (current_date - interval '18 years')::date
  ), false);
$$;

revoke all on function public.romantic_age_is_eligible(uuid) from public;

create or replace function public.get_my_age_eligibility()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_birth_date date;
  v_eligible boolean := false;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select age_row.date_of_birth
  into v_birth_date
  from public.user_age_eligibility age_row
  where age_row.user_id = v_viewer_id;

  if found then
    v_eligible := v_birth_date <= (current_date - interval '18 years')::date;
  end if;

  return jsonb_build_object(
    'date_of_birth_set', v_birth_date is not null,
    'date_of_birth', v_birth_date,
    'eligible_for_romance', v_eligible,
    'eligible_on', case
      when v_birth_date is null then null
      else (v_birth_date + interval '18 years')::date
    end,
    'locked', v_birth_date is not null
  );
end;
$$;

revoke all on function public.get_my_age_eligibility() from public;
grant execute on function public.get_my_age_eligibility() to authenticated;

create or replace function public.set_my_date_of_birth(
  p_date_of_birth date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_eligible boolean := false;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_date_of_birth is null then
    raise exception 'Enter a valid birth date';
  end if;

  if p_date_of_birth > current_date then
    raise exception 'Birth date cannot be in the future';
  end if;

  if exists (
    select 1
    from public.user_age_eligibility age_row
    where age_row.user_id = v_viewer_id
  ) then
    raise exception 'Birth date is already saved and cannot be changed in the app';
  end if;

  insert into public.user_age_eligibility (
    user_id,
    date_of_birth,
    confirmed_at,
    updated_at
  )
  values (
    v_viewer_id,
    p_date_of_birth,
    now(),
    now()
  );

  v_eligible := p_date_of_birth <= (current_date - interval '18 years')::date;

  insert into public.romantic_preferences (
    user_id,
    enabled,
    age_confirmed,
    audience_mode,
    updated_at
  )
  values (
    v_viewer_id,
    false,
    v_eligible,
    'all_connections',
    now()
  )
  on conflict (user_id) do update
  set
    enabled = false,
    age_confirmed = v_eligible,
    updated_at = now();

  return public.get_my_age_eligibility();
end;
$$;

revoke all on function public.set_my_date_of_birth(date) from public;
grant execute on function public.set_my_date_of_birth(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Replace self-attestation with server-derived eligibility.
-- ---------------------------------------------------------------------------

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
      and public.romantic_age_is_eligible(p_owner_id)
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
  v_age_eligible boolean := false;
  v_birth_date date;
  v_audience_mode text := 'all_connections';
  v_connections jsonb := '[]'::jsonb;
  v_visible_count integer := 0;
  v_focus_paused boolean := false;
  v_focus_active boolean := false;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select age_row.date_of_birth
  into v_birth_date
  from public.user_age_eligibility age_row
  where age_row.user_id = v_viewer_id;

  v_age_eligible := public.romantic_age_is_eligible(v_viewer_id);

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

  -- A stale or legacy preference can never surface as enabled without a saved
  -- adult birth date.
  v_enabled := v_enabled and v_age_eligible;
  v_age_confirmed := v_age_eligible;

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
    'date_of_birth_set', v_birth_date is not null,
    'eligible_for_romance', v_age_eligible,
    'eligible_on', case
      when v_birth_date is null then null
      else (v_birth_date + interval '18 years')::date
    end,
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
  v_birth_date_set boolean := false;
  v_age_eligible boolean := false;
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

  v_birth_date_set := exists (
    select 1
    from public.user_age_eligibility age_row
    where age_row.user_id = v_viewer_id
  );
  v_age_eligible := public.romantic_age_is_eligible(v_viewer_id);

  if coalesce(p_enabled, false) and not v_birth_date_set then
    raise exception 'Save your private birth date before enabling romantic features';
  end if;

  if coalesce(p_enabled, false) and not v_age_eligible then
    raise exception 'Romantic features are available only to adults 18 or older';
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
    v_age_eligible,
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

  if not public.romantic_age_is_eligible(v_viewer_id) then
    raise exception 'Romantic features are available only to adults 18 or older';
  end if;

  if not exists (
    select 1
    from public.romantic_preferences preference_row
    where preference_row.user_id = v_viewer_id
      and preference_row.enabled
      and preference_row.age_confirmed
  ) then
    raise exception 'Turn on romantic connections before resuming discovery';
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
-- Existing self-attestations are not migrated into birth dates. Close current
-- romantic state and lock shared spaces until each account saves a private date
-- and deliberately reestablishes consent.
-- ---------------------------------------------------------------------------

do $$
declare
  pair_row record;
begin
  for pair_row in
    select distinct pair_data.user_low_id, pair_data.user_high_id
    from (
      select
        least(interest_row.selector_id::text, interest_row.target_user_id::text)::uuid as user_low_id,
        greatest(interest_row.selector_id::text, interest_row.target_user_id::text)::uuid as user_high_id
      from public.romantic_interests interest_row

      union

      select state_row.user_low_id, state_row.user_high_id
      from public.romantic_mutual_states state_row

      union

      select
        least(selection_row.selector_id::text, selection_row.target_user_id::text)::uuid,
        greatest(selection_row.selector_id::text, selection_row.target_user_id::text)::uuid
      from public.romantic_focus_selections selection_row

      union

      select state_row.user_low_id, state_row.user_high_id
      from public.romantic_focus_states state_row

      union

      select proposal_row.user_low_id, proposal_row.user_high_id
      from public.two_person_circle_proposal_states proposal_row
    ) pair_data
  loop
    perform public.clear_romantic_pair_state(
      pair_row.user_low_id,
      pair_row.user_high_id
    );
  end loop;

  delete from public.romantic_focus_pauses;

  update public.romantic_preferences preference_row
  set
    enabled = false,
    age_confirmed = false,
    updated_at = now()
  where preference_row.enabled
     or preference_row.age_confirmed;
end;
$$;

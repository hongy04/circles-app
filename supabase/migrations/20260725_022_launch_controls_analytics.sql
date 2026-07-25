-- Circles Phase 1D — launch controls and privacy-safe product analytics
--
-- Adds remote kill switches for the new Phase 1 surfaces and a first-party
-- analytics ledger. Analytics are deliberately narrow: no contact data,
-- invitation tokens, message content, captions, profile identifiers, or other
-- user-supplied text can be written through the tracking RPC.

create table if not exists public.app_feature_flags (
  flag_key text primary key,
  enabled boolean not null default true,
  description text not null default '',
  updated_at timestamptz not null default now(),
  constraint app_feature_flags_key_check check (
    flag_key in (
      'launch_invitations',
      'mutual_preview_posts',
      'preconnection_profile_shell',
      'launch_analytics'
    )
  )
);

insert into public.app_feature_flags (flag_key, enabled, description)
values
  (
    'launch_invitations',
    true,
    'Allows users to create new personal and Circle invitation links.'
  ),
  (
    'mutual_preview_posts',
    true,
    'Allows selected personal posts to appear as Mutuals previews.'
  ),
  (
    'preconnection_profile_shell',
    true,
    'Allows privacy-safe profile shells for people with trusted context.'
  ),
  (
    'launch_analytics',
    true,
    'Stores allowlisted first-party events for Phase 1 launch evaluation.'
  )
on conflict (flag_key) do nothing;

alter table public.app_feature_flags enable row level security;

-- Feature flags are read only through this RPC. No direct table policy is
-- intentionally exposed to the mobile client.
create or replace function public.get_app_feature_flags()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(flag_row.flag_key, flag_row.enabled),
    '{}'::jsonb
  )
  from public.app_feature_flags flag_row;
$$;

revoke all on function public.get_app_feature_flags() from public;
grant execute on function public.get_app_feature_flags() to anon, authenticated;

create table if not exists public.app_analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  actor_id uuid references public.users(id) on delete set null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint app_analytics_event_name_check check (
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
      'circle_member_invites_sent'
    )
  ),
  constraint app_analytics_properties_object_check check (
    jsonb_typeof(properties) = 'object'
  )
);

create index if not exists app_analytics_events_name_created_index
  on public.app_analytics_events (event_name, created_at desc);

create index if not exists app_analytics_events_actor_created_index
  on public.app_analytics_events (actor_id, created_at desc)
  where actor_id is not null;

alter table public.app_analytics_events enable row level security;

-- No direct read or write policies are added. Event creation is mediated by
-- the security-definer RPC below, and analysis remains an admin/server task.
create or replace function public.track_app_event(
  p_event_name text,
  p_properties jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_name text := nullif(btrim(p_event_name), '');
  v_input jsonb := case
    when jsonb_typeof(coalesce(p_properties, '{}'::jsonb)) = 'object'
      then coalesce(p_properties, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_clean jsonb;
  v_analytics_enabled boolean := true;
  v_candidate_count integer;
  v_request_count integer;
  v_connection_count integer;
  v_mutual_connection_count integer;
  v_shared_circle_count integer;
  v_invitation_count integer;
begin
  select coalesce(flag_row.enabled, true)
  into v_analytics_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'launch_analytics';

  if not coalesce(v_analytics_enabled, true) then
    return false;
  end if;

  if v_event_name is null or v_event_name not in (
    'invite_created',
    'invite_share_opened',
    'invite_previewed',
    'invite_redeemed',
    'mutuals_opened',
    'mutual_preview_updated',
    'preconnection_profile_opened',
    'connection_request_sent',
    'connection_request_responded',
    'circle_member_invites_sent'
  ) then
    return false;
  end if;

  if coalesce(v_input->>'candidate_count', '') ~ '^[0-9]{1,6}$' then
    v_candidate_count := least((v_input->>'candidate_count')::integer, 10000);
  end if;

  if coalesce(v_input->>'request_count', '') ~ '^[0-9]{1,6}$' then
    v_request_count := least((v_input->>'request_count')::integer, 10000);
  end if;

  if coalesce(v_input->>'connection_count', '') ~ '^[0-9]{1,6}$' then
    v_connection_count := least((v_input->>'connection_count')::integer, 10000);
  end if;

  if coalesce(v_input->>'mutual_connection_count', '') ~ '^[0-9]{1,6}$' then
    v_mutual_connection_count := least(
      (v_input->>'mutual_connection_count')::integer,
      10000
    );
  end if;

  if coalesce(v_input->>'shared_circle_count', '') ~ '^[0-9]{1,6}$' then
    v_shared_circle_count := least(
      (v_input->>'shared_circle_count')::integer,
      10000
    );
  end if;

  if coalesce(v_input->>'invitation_count', '') ~ '^[0-9]{1,6}$' then
    v_invitation_count := least((v_input->>'invitation_count')::integer, 100);
  end if;

  v_clean := jsonb_strip_nulls(jsonb_build_object(
    'invite_kind', case
      when v_input->>'invite_kind' in ('personal', 'circle')
        then v_input->>'invite_kind'
      else null
    end,
    'surface', case
      when v_input->>'surface' in (
        'invite_people',
        'circle_people',
        'invitation_landing',
        'mutuals',
        'preconnection_profile',
        'profile'
      ) then v_input->>'surface'
      else null
    end,
    'delivery', case
      when v_input->>'delivery' in ('share_sheet', 'sms', 'share_fallback')
        then v_input->>'delivery'
      else null
    end,
    'outcome', case
      when v_input->>'outcome' in (
        'request_created',
        'request_exists',
        'already_connected',
        'circle_invitation_created',
        'circle_invitation_exists',
        'already_member',
        'sent',
        'cancelled',
        'unknown'
      ) then v_input->>'outcome'
      else null
    end,
    'reason', case
      when v_input->>'reason' in (
        'not_found',
        'expired',
        'revoked',
        'used_up',
        'circle_unavailable',
        'inviter_no_longer_can_invite'
      ) then v_input->>'reason'
      else null
    end,
    'action', case
      when v_input->>'action' in ('set', 'clear', 'accept', 'decline')
        then v_input->>'action'
      else null
    end,
    'request_state', case
      when v_input->>'request_state' in ('none', 'incoming', 'outgoing')
        then v_input->>'request_state'
      else null
    end,
    'platform', case
      when v_input->>'platform' in ('ios', 'android', 'web', 'windows', 'macos')
        then v_input->>'platform'
      else null
    end,
    'app_mode', case
      when v_input->>'app_mode' in ('development', 'production')
        then v_input->>'app_mode'
      else null
    end,
    'valid', case
      when lower(coalesce(v_input->>'valid', '')) in ('true', 'false')
        then (v_input->>'valid')::boolean
      else null
    end,
    'has_preview', case
      when lower(coalesce(v_input->>'has_preview', '')) in ('true', 'false')
        then (v_input->>'has_preview')::boolean
      else null
    end,
    'has_mutual_contact', case
      when lower(coalesce(v_input->>'has_mutual_contact', '')) in ('true', 'false')
        then (v_input->>'has_mutual_contact')::boolean
      else null
    end,
    'candidate_count', v_candidate_count,
    'request_count', v_request_count,
    'connection_count', v_connection_count,
    'mutual_connection_count', v_mutual_connection_count,
    'shared_circle_count', v_shared_circle_count,
    'invitation_count', v_invitation_count
  ));

  insert into public.app_analytics_events (
    event_name,
    actor_id,
    properties
  )
  values (
    v_event_name,
    auth.uid(),
    v_clean
  );

  return true;
end;
$$;

revoke all on function public.track_app_event(text, jsonb) from public;
grant execute on function public.track_app_event(text, jsonb) to anon, authenticated;

-- Circles Phase 7B — Write Your Thoughts
--
-- Adds a voluntary private-draft workflow inside an unlocked two-person Circle.
-- A thought stays visible only to its author until they deliberately share it.
-- Shared thoughts are read-only to prevent silent revision after delivery.

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
      'two_person_circle_important_dates',
      'two_person_circle_thoughts'
    )
  );

insert into public.app_feature_flags (
  flag_key,
  enabled,
  description
)
values (
  'two_person_circle_thoughts',
  true,
  'Enables private drafts and deliberately shared thoughts inside an unlocked two-person Circle.'
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
      'two_person_thought_removed'
    )
  );

create or replace function public.record_two_person_thought_analytics(
  p_event_name text,
  p_action text,
  p_state text
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
    'two_person_thought_draft_created',
    'two_person_thought_draft_updated',
    'two_person_thought_shared',
    'two_person_thought_removed'
  ) then
    return;
  end if;

  if p_action not in ('create', 'update', 'share', 'remove') then
    return;
  end if;

  if p_state not in ('draft', 'shared') then
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
        'surface', 'two_person_circle_thoughts',
        'action', p_action,
        'state', p_state
      )
    );
  exception
    when others then
      null;
  end;
end;
$$;

revoke all on function public.record_two_person_thought_analytics(
  text,
  text,
  text
) from public;

-- ---------------------------------------------------------------------------
-- Thought storage
-- ---------------------------------------------------------------------------

create table if not exists public.two_person_circle_thoughts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  title text not null default '',
  body text not null,
  status text not null default 'draft',
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint two_person_thought_title_length check (
    length(title) <= 120
  ),
  constraint two_person_thought_body_length check (
    length(trim(body)) between 1 and 6000
  ),
  constraint two_person_thought_status_check check (
    status in ('draft', 'shared')
  ),
  constraint two_person_thought_shared_state_check check (
    (status = 'draft' and shared_at is null)
    or (status = 'shared' and shared_at is not null)
  )
);

create index if not exists two_person_circle_thoughts_conversation_idx
  on public.two_person_circle_thoughts (
    conversation_id,
    status,
    coalesce(shared_at, updated_at) desc
  );

create index if not exists two_person_circle_thoughts_author_idx
  on public.two_person_circle_thoughts (
    author_id,
    status,
    updated_at desc
  );

alter table public.two_person_circle_thoughts enable row level security;

revoke insert, update, delete
  on table public.two_person_circle_thoughts
  from anon, authenticated;

drop policy if exists two_person_circle_thoughts_select
  on public.two_person_circle_thoughts;

create policy two_person_circle_thoughts_select
on public.two_person_circle_thoughts
for select
to authenticated
using (
  public.two_person_circle_is_unlocked(conversation_id, auth.uid())
  and (
    author_id = auth.uid()
    or status = 'shared'
  )
);

-- Writes remain RPC-only. The SELECT policy allows authorized Realtime events
-- while ensuring one person's private draft never becomes readable by the other.

do $$
begin
  alter publication supabase_realtime
    add table public.two_person_circle_thoughts;
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

create or replace function public.two_person_thoughts_feature_enabled()
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
      where flag_row.flag_key = 'two_person_circle_thoughts'
    ),
    true
  );
$$;

revoke all on function public.two_person_thoughts_feature_enabled()
  from public;

create or replace function public.two_person_thought_json(
  p_thought_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'thought_id', thought_row.id,
    'conversation_id', thought_row.conversation_id,
    'author_id', thought_row.author_id,
    'author_name', author_user.display_name,
    'author_avatar_url', author_user.avatar_url,
    'title', thought_row.title,
    'body', thought_row.body,
    'status', thought_row.status,
    'is_author', thought_row.author_id = auth.uid(),
    'shared_at', thought_row.shared_at,
    'created_at', thought_row.created_at,
    'updated_at', thought_row.updated_at
  )
  from public.two_person_circle_thoughts thought_row
  join public.users author_user on author_user.id = thought_row.author_id
  where thought_row.id = p_thought_id;
$$;

revoke all on function public.two_person_thought_json(uuid)
  from public;

-- ---------------------------------------------------------------------------
-- Read RPCs
-- ---------------------------------------------------------------------------

create or replace function public.list_two_person_circle_thoughts(
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

  if not public.two_person_thoughts_feature_enabled() then
    raise exception 'Write Your Thoughts is temporarily unavailable.';
  end if;

  if not public.two_person_circle_is_unlocked(
    p_conversation_id,
    auth.uid()
  ) then
    raise exception 'Our Circle is closed or unavailable.';
  end if;

  return query
  select public.two_person_thought_json(thought_row.id)
  from public.two_person_circle_thoughts thought_row
  where thought_row.conversation_id = p_conversation_id
    and (
      thought_row.status = 'shared'
      or thought_row.author_id = auth.uid()
    )
  order by
    case when thought_row.status = 'draft' then 0 else 1 end,
    coalesce(thought_row.shared_at, thought_row.updated_at) desc;
end;
$$;

revoke all on function public.list_two_person_circle_thoughts(uuid)
  from public;
grant execute on function public.list_two_person_circle_thoughts(uuid)
  to authenticated;

create or replace function public.get_two_person_circle_thought(
  p_thought_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thought public.two_person_circle_thoughts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.two_person_thoughts_feature_enabled() then
    raise exception 'Write Your Thoughts is temporarily unavailable.';
  end if;

  select *
  into v_thought
  from public.two_person_circle_thoughts thought_row
  where thought_row.id = p_thought_id;

  if v_thought.id is null
     or not public.two_person_circle_is_unlocked(
       v_thought.conversation_id,
       auth.uid()
     )
     or (
       v_thought.status = 'draft'
       and v_thought.author_id <> auth.uid()
     ) then
    raise exception 'This thought is unavailable.';
  end if;

  return public.two_person_thought_json(p_thought_id);
end;
$$;

revoke all on function public.get_two_person_circle_thought(uuid)
  from public;
grant execute on function public.get_two_person_circle_thought(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Draft, share, and remove RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_two_person_circle_thought_draft(
  p_conversation_id uuid,
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.two_person_thoughts_feature_enabled() then
    raise exception 'Write Your Thoughts is temporarily unavailable.';
  end if;

  if not public.two_person_circle_is_unlocked(
    p_conversation_id,
    auth.uid()
  ) then
    raise exception 'Our Circle is closed or unavailable.';
  end if;

  if length(v_title) > 120 then
    raise exception 'The title is too long.';
  end if;

  if length(v_body) < 1 or length(v_body) > 6000 then
    raise exception 'Write between 1 and 6000 characters.';
  end if;

  insert into public.two_person_circle_thoughts (
    conversation_id,
    author_id,
    title,
    body,
    status
  )
  values (
    p_conversation_id,
    auth.uid(),
    v_title,
    v_body,
    'draft'
  )
  returning id into v_id;

  perform public.record_two_person_thought_analytics(
    'two_person_thought_draft_created',
    'create',
    'draft'
  );

  return v_id;
end;
$$;

revoke all on function public.create_two_person_circle_thought_draft(
  uuid,
  text,
  text
) from public;
grant execute on function public.create_two_person_circle_thought_draft(
  uuid,
  text,
  text
) to authenticated;

create or replace function public.update_two_person_circle_thought_draft(
  p_thought_id uuid,
  p_title text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thought public.two_person_circle_thoughts%rowtype;
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_thought
  from public.two_person_circle_thoughts thought_row
  where thought_row.id = p_thought_id
  for update;

  if v_thought.id is null
     or v_thought.author_id <> auth.uid()
     or v_thought.status <> 'draft'
     or not public.two_person_circle_is_unlocked(
       v_thought.conversation_id,
       auth.uid()
     ) then
    raise exception 'This private draft is unavailable.';
  end if;

  if length(v_title) > 120
     or length(v_body) < 1
     or length(v_body) > 6000 then
    raise exception 'Check the title and thought length.';
  end if;

  update public.two_person_circle_thoughts thought_row
  set
    title = v_title,
    body = v_body,
    updated_at = now()
  where thought_row.id = p_thought_id;

  perform public.record_two_person_thought_analytics(
    'two_person_thought_draft_updated',
    'update',
    'draft'
  );

  return public.two_person_thought_json(p_thought_id);
end;
$$;

revoke all on function public.update_two_person_circle_thought_draft(
  uuid,
  text,
  text
) from public;
grant execute on function public.update_two_person_circle_thought_draft(
  uuid,
  text,
  text
) to authenticated;

create or replace function public.share_two_person_circle_thought(
  p_thought_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thought public.two_person_circle_thoughts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_thought
  from public.two_person_circle_thoughts thought_row
  where thought_row.id = p_thought_id
  for update;

  if v_thought.id is null
     or v_thought.author_id <> auth.uid()
     or v_thought.status <> 'draft'
     or not public.two_person_circle_is_unlocked(
       v_thought.conversation_id,
       auth.uid()
     ) then
    raise exception 'This private draft cannot be shared.';
  end if;

  update public.two_person_circle_thoughts thought_row
  set
    status = 'shared',
    shared_at = now(),
    updated_at = now()
  where thought_row.id = p_thought_id;

  perform public.record_two_person_thought_analytics(
    'two_person_thought_shared',
    'share',
    'shared'
  );

  return public.two_person_thought_json(p_thought_id);
end;
$$;

revoke all on function public.share_two_person_circle_thought(uuid)
  from public;
grant execute on function public.share_two_person_circle_thought(uuid)
  to authenticated;

create or replace function public.delete_two_person_circle_thought(
  p_thought_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thought public.two_person_circle_thoughts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_thought
  from public.two_person_circle_thoughts thought_row
  where thought_row.id = p_thought_id
  for update;

  if v_thought.id is null
     or v_thought.author_id <> auth.uid()
     or not public.two_person_circle_is_unlocked(
       v_thought.conversation_id,
       auth.uid()
     ) then
    raise exception 'This thought cannot be removed.';
  end if;

  delete from public.two_person_circle_thoughts thought_row
  where thought_row.id = p_thought_id;

  perform public.record_two_person_thought_analytics(
    'two_person_thought_removed',
    'remove',
    v_thought.status
  );

  return true;
end;
$$;

revoke all on function public.delete_two_person_circle_thought(uuid)
  from public;
grant execute on function public.delete_two_person_circle_thought(uuid)
  to authenticated;

-- Circles Step 36A — Whisper foundation
--
-- Whispers are short, private, ephemeral notes between accepted connections.
-- This migration deliberately implements lifecycle/privacy only; profile bubble
-- presentation and send/read UI arrive in later steps.
--
-- Product invariants:
--   * accepted connections only
--   * never anonymous
--   * maximum 140 characters
--   * expires 24 hours after send
--   * recipient-only active read access
--   * sender has no sent-history/read-receipt API
--   * fixed 24-hour sender -> recipient cooldown, even if consumed early,
--     so the sender cannot infer whether the recipient opened the Whisper
--   * blocking/disconnecting consumes any live Whispers for that pair
--   * disabling Whispers consumes incoming live Whispers immediately
--   * reporting snapshots the Whisper into the existing private safety record

alter table public.users
  add column if not exists allow_whispers boolean not null default true;

create table if not exists public.profile_whispers (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.users(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  opened_at timestamptz,
  consumed_at timestamptz,
  constraint profile_whispers_different_people_check check (sender_id <> recipient_id),
  constraint profile_whispers_body_length_check check (
    char_length(trim(body)) between 1 and 140
  ),
  constraint profile_whispers_expiry_check check (expires_at > created_at)
);

create index if not exists profile_whispers_recipient_active_index
  on public.profile_whispers (recipient_id, created_at desc)
  where consumed_at is null;

create index if not exists profile_whispers_sender_pair_recent_index
  on public.profile_whispers (sender_id, recipient_id, created_at desc);

alter table public.profile_whispers enable row level security;

-- No direct client table reads/writes. All access is mediated by the narrow
-- security-definer RPCs below. Service role still retains normal privileged
-- access for safety/moderation/maintenance.
revoke all on table public.profile_whispers from anon, authenticated;

-- Whisper reports use the existing private moderation pipeline while retaining
-- enough context to distinguish this disappearing interaction from profile/chat.
alter table public.user_reports
  drop constraint if exists user_reports_source_context_check;

alter table public.user_reports
  add constraint user_reports_source_context_check check (
    source_context in ('profile', 'conversation', 'circle', 'event', 'whisper', 'other')
  );

-- ---------------------------------------------------------------------------
-- Preferences
-- ---------------------------------------------------------------------------

create or replace function public.get_my_whisper_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_allow boolean := true;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(user_row.allow_whispers, true)
  into v_allow
  from public.users user_row
  where user_row.id = v_user_id;

  return jsonb_build_object('allow_whispers', coalesce(v_allow, true));
end;
$$;

revoke all on function public.get_my_whisper_settings() from public;
grant execute on function public.get_my_whisper_settings() to authenticated;

create or replace function public.update_my_whisper_settings(
  p_allow_whispers boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_allow boolean := coalesce(p_allow_whispers, true);
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.users user_row
  set allow_whispers = v_allow
  where user_row.id = v_user_id;

  -- Turning Whispers off removes anything currently floating for this user.
  if not v_allow then
    update public.profile_whispers whisper_row
    set consumed_at = coalesce(whisper_row.consumed_at, now())
    where whisper_row.recipient_id = v_user_id
      and whisper_row.consumed_at is null;
  end if;

  return jsonb_build_object('allow_whispers', v_allow);
end;
$$;

revoke all on function public.update_my_whisper_settings(boolean) from public;
grant execute on function public.update_my_whisper_settings(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Eligibility + send lifecycle
-- ---------------------------------------------------------------------------

create or replace function public.get_whisper_send_eligibility(
  p_recipient_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_allow boolean := true;
  v_last_sent_at timestamptz;
  v_next_allowed_at timestamptz;
begin
  if v_sender_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_recipient_id is null or p_recipient_id = v_sender_id then
    return jsonb_build_object('can_send', false, 'reason', 'invalid_recipient');
  end if;

  if not public.is_connected(v_sender_id, p_recipient_id) then
    return jsonb_build_object('can_send', false, 'reason', 'not_connected');
  end if;

  if public.user_pair_is_blocked(v_sender_id, p_recipient_id) then
    return jsonb_build_object('can_send', false, 'reason', 'blocked');
  end if;

  select coalesce(user_row.allow_whispers, true)
  into v_allow
  from public.users user_row
  where user_row.id = p_recipient_id;

  if not coalesce(v_allow, true) then
    return jsonb_build_object('can_send', false, 'reason', 'disabled');
  end if;

  select max(whisper_row.created_at)
  into v_last_sent_at
  from public.profile_whispers whisper_row
  where whisper_row.sender_id = v_sender_id
    and whisper_row.recipient_id = p_recipient_id;

  if v_last_sent_at is not null
     and v_last_sent_at > now() - interval '24 hours' then
    v_next_allowed_at := v_last_sent_at + interval '24 hours';
    return jsonb_build_object(
      'can_send', false,
      'reason', 'cooldown',
      'next_allowed_at', v_next_allowed_at
    );
  end if;

  return jsonb_build_object('can_send', true, 'reason', null);
end;
$$;

revoke all on function public.get_whisper_send_eligibility(uuid) from public;
grant execute on function public.get_whisper_send_eligibility(uuid) to authenticated;

create or replace function public.send_whisper(
  p_recipient_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_allow boolean := true;
  v_recent_count integer := 0;
  v_incoming_count integer := 0;
  v_whisper_id uuid;
  v_created_at timestamptz := now();
  v_expires_at timestamptz := now() + interval '24 hours';
begin
  if v_sender_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_recipient_id is null or p_recipient_id = v_sender_id then
    raise exception 'Choose an accepted connection';
  end if;

  if v_body is null then
    raise exception 'Write something to Whisper';
  end if;

  if char_length(v_body) > 140 then
    raise exception 'Whispers must be 140 characters or fewer';
  end if;

  if not exists (
    select 1 from public.users user_row where user_row.id = p_recipient_id
  ) then
    raise exception 'Account not found';
  end if;

  if not public.is_connected(v_sender_id, p_recipient_id) then
    raise exception 'Whispers are only for accepted connections';
  end if;

  if public.user_pair_is_blocked(v_sender_id, p_recipient_id) then
    raise exception 'Whisper unavailable';
  end if;

  select coalesce(user_row.allow_whispers, true)
  into v_allow
  from public.users user_row
  where user_row.id = p_recipient_id;

  if not coalesce(v_allow, true) then
    raise exception 'This person is not receiving Whispers';
  end if;

  -- Lock both user rows in deterministic UUID order. This serializes duplicate
  -- sends for the pair without exposing a sender-visible delivery/read state.
  perform user_row.id
  from public.users user_row
  where user_row.id in (v_sender_id, p_recipient_id)
  order by user_row.id
  for update;

  select count(*)::integer
  into v_recent_count
  from public.profile_whispers whisper_row
  where whisper_row.sender_id = v_sender_id
    and whisper_row.recipient_id = p_recipient_id
    and whisper_row.created_at > now() - interval '24 hours';

  if v_recent_count > 0 then
    raise exception 'You can Whisper this person once every 24 hours';
  end if;

  -- Keep the recipient header bounded even before the visual cap is added.
  -- Expired Whispers never count as live even if cleanup has not run yet.
  select count(*)::integer
  into v_incoming_count
  from public.profile_whispers whisper_row
  where whisper_row.recipient_id = p_recipient_id
    and whisper_row.consumed_at is null
    and whisper_row.expires_at > now();

  if v_incoming_count >= 10 then
    raise exception 'This person has enough Whispers floating right now';
  end if;

  insert into public.profile_whispers (
    sender_id,
    recipient_id,
    body,
    created_at,
    expires_at
  )
  values (
    v_sender_id,
    p_recipient_id,
    v_body,
    v_created_at,
    v_expires_at
  )
  returning id into v_whisper_id;

  -- The sender receives only the immediate send acknowledgement. There is no
  -- sender-side list/detail/read-status RPC.
  return jsonb_build_object(
    'sent', true,
    'whisper_id', v_whisper_id,
    'expires_at', v_expires_at,
    'next_allowed_at', v_created_at + interval '24 hours'
  );
end;
$$;

revoke all on function public.send_whisper(uuid, text) from public;
grant execute on function public.send_whisper(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Recipient-only read lifecycle
-- ---------------------------------------------------------------------------

create or replace function public.get_my_active_whispers()
returns table (
  whisper_id uuid,
  sender_id uuid,
  sender_name text,
  sender_avatar text,
  body text,
  created_at timestamptz,
  expires_at timestamptz,
  opened_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_id uuid := auth.uid();
begin
  if v_recipient_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Opportunistic cleanup keeps the table small without requiring pg_cron.
  delete from public.profile_whispers whisper_row
  where whisper_row.recipient_id = v_recipient_id
    and (
      whisper_row.expires_at <= now()
      or whisper_row.consumed_at is not null
    )
    and whisper_row.created_at < now() - interval '48 hours';

  return query
  select
    whisper_row.id,
    whisper_row.sender_id,
    coalesce(sender_row.display_name, 'Connection'),
    sender_row.avatar_url,
    whisper_row.body,
    whisper_row.created_at,
    whisper_row.expires_at,
    whisper_row.opened_at
  from public.profile_whispers whisper_row
  join public.users sender_row on sender_row.id = whisper_row.sender_id
  where whisper_row.recipient_id = v_recipient_id
    and whisper_row.consumed_at is null
    and whisper_row.expires_at > now()
    and public.is_connected(v_recipient_id, whisper_row.sender_id)
    and not public.user_pair_is_blocked(v_recipient_id, whisper_row.sender_id)
  order by whisper_row.created_at desc, whisper_row.id desc
  limit 10;
end;
$$;

revoke all on function public.get_my_active_whispers() from public;
grant execute on function public.get_my_active_whispers() to authenticated;

create or replace function public.mark_whisper_opened(
  p_whisper_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_id uuid := auth.uid();
  v_row public.profile_whispers%rowtype;
begin
  if v_recipient_id is null then
    raise exception 'Not authenticated';
  end if;

  select whisper_row.*
  into v_row
  from public.profile_whispers whisper_row
  where whisper_row.id = p_whisper_id
    and whisper_row.recipient_id = v_recipient_id
  for update;

  if not found
     or v_row.consumed_at is not null
     or v_row.expires_at <= now()
     or not public.is_connected(v_recipient_id, v_row.sender_id)
     or public.user_pair_is_blocked(v_recipient_id, v_row.sender_id) then
    raise exception 'Whisper is no longer available';
  end if;

  update public.profile_whispers whisper_row
  set opened_at = coalesce(whisper_row.opened_at, now())
  where whisper_row.id = p_whisper_id;

  return jsonb_build_object(
    'opened', true,
    'whisper_id', p_whisper_id,
    'sender_id', v_row.sender_id,
    'body', v_row.body,
    'expires_at', v_row.expires_at
  );
end;
$$;

revoke all on function public.mark_whisper_opened(uuid) from public;
grant execute on function public.mark_whisper_opened(uuid) to authenticated;

create or replace function public.consume_whisper(
  p_whisper_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_id uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_recipient_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.profile_whispers whisper_row
  set consumed_at = coalesce(whisper_row.consumed_at, now())
  where whisper_row.id = p_whisper_id
    and whisper_row.recipient_id = v_recipient_id
    and whisper_row.consumed_at is null;

  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'consumed', v_updated > 0,
    'whisper_id', p_whisper_id
  );
end;
$$;

revoke all on function public.consume_whisper(uuid) from public;
grant execute on function public.consume_whisper(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Safety evidence
-- ---------------------------------------------------------------------------

create or replace function public.submit_whisper_report(
  p_whisper_id uuid,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_id uuid := auth.uid();
  v_row public.profile_whispers%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_details text := nullif(trim(coalesce(p_details, '')), '');
  v_evidence text;
  v_report_id uuid;
  v_enabled boolean := true;
begin
  if v_reporter_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_reason not in (
    'harassment_or_bullying',
    'unwanted_romantic_contact',
    'impersonation',
    'spam_or_scam',
    'safety_concern',
    'other'
  ) then
    raise exception 'Choose a report reason';
  end if;

  select coalesce(flag_row.enabled, true)
  into v_enabled
  from public.app_feature_flags flag_row
  where flag_row.flag_key = 'safety_blocking_reporting';

  if not coalesce(v_enabled, true) then
    raise exception 'Safety controls are temporarily unavailable';
  end if;

  select whisper_row.*
  into v_row
  from public.profile_whispers whisper_row
  where whisper_row.id = p_whisper_id
    and whisper_row.recipient_id = v_reporter_id
    and whisper_row.consumed_at is null
  for update;

  if not found then
    raise exception 'Whisper is no longer available';
  end if;

  if v_details is not null and char_length(v_details) > 1600 then
    raise exception 'Report details must be 1600 characters or fewer';
  end if;

  v_evidence := 'Whisper content: ' || v_row.body;
  if v_details is not null then
    v_evidence := v_evidence || E'\n\nReporter note: ' || v_details;
  end if;

  insert into public.user_reports (
    reporter_id,
    reported_user_id,
    reason,
    details,
    source_context
  )
  values (
    v_reporter_id,
    v_row.sender_id,
    v_reason,
    v_evidence,
    'whisper'
  )
  returning id into v_report_id;

  -- Reporting consumes the disappearing content for the recipient while the
  -- evidence snapshot remains available only through the private safety flow.
  update public.profile_whispers whisper_row
  set opened_at = coalesce(whisper_row.opened_at, now()),
      consumed_at = coalesce(whisper_row.consumed_at, now())
  where whisper_row.id = p_whisper_id;

  perform public.record_safety_analytics(
    'safety_user_reported',
    'report',
    'whisper'
  );

  return jsonb_build_object(
    'submitted', true,
    'report_id', v_report_id,
    'whisper_consumed', true
  );
end;
$$;

revoke all on function public.submit_whisper_report(uuid, text, text) from public;
grant execute on function public.submit_whisper_report(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Pair cleanup on disconnect/block
-- ---------------------------------------------------------------------------

create or replace function public.consume_whispers_after_connection_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profile_whispers whisper_row
  set consumed_at = coalesce(whisper_row.consumed_at, now())
  where whisper_row.consumed_at is null
    and (
      (whisper_row.sender_id = old.user_id and whisper_row.recipient_id = old.other_user_id)
      or
      (whisper_row.sender_id = old.other_user_id and whisper_row.recipient_id = old.user_id)
    );

  return old;
end;
$$;

revoke all on function public.consume_whispers_after_connection_removed() from public;

drop trigger if exists consume_whispers_on_connection_removed on public.connections;
create trigger consume_whispers_on_connection_removed
after delete on public.connections
for each row
execute function public.consume_whispers_after_connection_removed();

create or replace function public.consume_whispers_after_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profile_whispers whisper_row
  set consumed_at = coalesce(whisper_row.consumed_at, now())
  where whisper_row.consumed_at is null
    and (
      (whisper_row.sender_id = new.blocker_id and whisper_row.recipient_id = new.blocked_id)
      or
      (whisper_row.sender_id = new.blocked_id and whisper_row.recipient_id = new.blocker_id)
    );

  return new;
end;
$$;

revoke all on function public.consume_whispers_after_block() from public;

drop trigger if exists consume_whispers_on_block on public.user_blocks;
create trigger consume_whispers_on_block
after insert on public.user_blocks
for each row
execute function public.consume_whispers_after_block();

comment on table public.profile_whispers is
  'Private ephemeral profile Whispers. Direct client table access is denied; recipient visibility and sender creation are mediated by RPCs.';

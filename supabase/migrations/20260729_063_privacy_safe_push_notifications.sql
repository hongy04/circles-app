-- Circles Phase 9C: privacy-safe device push notifications.
--
-- Existing in-app notification rows remain the source of truth. This migration
-- adds per-device Expo push-token registration and an idempotent delivery
-- queue. No message body, report detail, birth date, romantic state, or private
-- moderation note is copied into a push payload.

begin;

-- ---------------------------------------------------------------------------
-- Registered devices
-- ---------------------------------------------------------------------------

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  app_version text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_devices_token_format check (
    expo_push_token ~ '^(Expo|Exponent)PushToken\\[[A-Za-z0-9_-]+\\]$'
  )
);

create index if not exists push_devices_user_enabled_index
  on public.push_devices (user_id, enabled, last_seen_at desc);

alter table public.push_devices enable row level security;
revoke all on table public.push_devices from anon, authenticated;
-- No direct client policies. Owner actions use narrow security-definer RPCs.

-- ---------------------------------------------------------------------------
-- Per-device delivery jobs
-- ---------------------------------------------------------------------------

create table if not exists public.push_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  push_device_id uuid not null references public.push_devices(id) on delete cascade,
  source_kind text not null check (source_kind in ('notification', 'message', 'connection_request')),
  source_id uuid not null,
  notification_type text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (
    status in (
      'pending',
      'sending',
      'retry',
      'ticket',
      'receipt_checking',
      'complete',
      'failed',
      'skipped'
    )
  ),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  expo_ticket_id text,
  ticket_error_code text,
  ticket_error_message text,
  next_receipt_check_at timestamptz,
  receipt_status text,
  receipt_error_code text,
  receipt_error_message text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  receipt_checked_at timestamptz,
  completed_at timestamptz,
  unique (source_kind, source_id, push_device_id)
);

create index if not exists push_delivery_jobs_dispatch_index
  on public.push_delivery_jobs (status, next_attempt_at, created_at)
  where status in ('pending', 'retry', 'sending');

create index if not exists push_delivery_jobs_receipt_index
  on public.push_delivery_jobs (status, next_receipt_check_at)
  where status in ('ticket', 'receipt_checking');

create index if not exists push_delivery_jobs_user_index
  on public.push_delivery_jobs (user_id, created_at desc);

alter table public.push_delivery_jobs enable row level security;
revoke all on table public.push_delivery_jobs from anon, authenticated;
-- Delivery internals are service-role only and never exposed to app clients.

-- ---------------------------------------------------------------------------
-- Owner device-registration RPCs
-- ---------------------------------------------------------------------------

create or replace function public.register_my_push_device(
  p_expo_push_token text,
  p_platform text,
  p_app_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text := trim(coalesce(p_expo_push_token, ''));
  v_platform text := lower(trim(coalesce(p_platform, '')));
  v_device public.push_devices%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_token !~ '^(Expo|Exponent)PushToken\\[[A-Za-z0-9_-]+\\]$' then
    raise exception 'Invalid Expo push token';
  end if;

  if v_platform not in ('ios', 'android') then
    raise exception 'Unsupported push platform';
  end if;

  if exists (
    select 1 from public.users user_row
    where user_row.id = v_user_id
      and user_row.deleted_at is not null
  ) then
    raise exception 'Deleted accounts cannot register devices';
  end if;

  -- A physical installation can belong to only the currently signed-in user.
  -- Cancel unsent jobs owned by the previous session before transferring it.
  update public.push_delivery_jobs job
  set
    status = 'skipped',
    last_error = 'Device token moved to another signed-in account',
    completed_at = now(),
    updated_at = now()
  where job.push_device_id in (
      select device_row.id
      from public.push_devices device_row
      where device_row.expo_push_token = v_token
        and device_row.user_id <> v_user_id
    )
    and job.status in ('pending', 'retry', 'sending', 'ticket', 'receipt_checking');

  insert into public.push_devices (
    user_id,
    expo_push_token,
    platform,
    app_version,
    enabled,
    last_seen_at,
    disabled_at,
    disabled_reason,
    updated_at
  ) values (
    v_user_id,
    v_token,
    v_platform,
    nullif(trim(coalesce(p_app_version, '')), ''),
    true,
    now(),
    null,
    null,
    now()
  )
  on conflict (expo_push_token) do update
  set
    user_id = excluded.user_id,
    platform = excluded.platform,
    app_version = excluded.app_version,
    enabled = true,
    last_seen_at = now(),
    disabled_at = null,
    disabled_reason = null,
    updated_at = now()
  returning * into v_device;

  return jsonb_build_object(
    'registered', true,
    'platform', v_device.platform,
    'last_seen_at', v_device.last_seen_at
  );
end;
$$;

revoke all on function public.register_my_push_device(text, text, text) from public;
grant execute on function public.register_my_push_device(text, text, text) to authenticated;

create or replace function public.unregister_my_push_device(
  p_expo_push_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text := trim(coalesce(p_expo_push_token, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.push_devices device_row
  set
    enabled = false,
    disabled_at = now(),
    disabled_reason = 'owner_disabled',
    updated_at = now()
  where device_row.user_id = v_user_id
    and device_row.expo_push_token = v_token;

  update public.push_delivery_jobs job
  set
    status = 'skipped',
    last_error = 'Device disabled by owner',
    completed_at = now(),
    updated_at = now()
  where job.user_id = v_user_id
    and job.push_device_id in (
      select device_row.id
      from public.push_devices device_row
      where device_row.user_id = v_user_id
        and device_row.expo_push_token = v_token
    )
    and job.status in ('pending', 'retry', 'sending', 'ticket', 'receipt_checking');
end;
$$;

revoke all on function public.unregister_my_push_device(text) from public;
grant execute on function public.unregister_my_push_device(text) to authenticated;

create or replace function public.get_my_push_notification_status(
  p_expo_push_token text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'active_device_count', (
      select count(*)
      from public.push_devices device_row
      where device_row.user_id = auth.uid()
        and device_row.enabled
    ),
    'last_registered_at', (
      select max(device_row.last_seen_at)
      from public.push_devices device_row
      where device_row.user_id = auth.uid()
        and device_row.enabled
    ),
    'current_device_registered', exists (
      select 1
      from public.push_devices device_row
      where device_row.user_id = auth.uid()
        and device_row.enabled
        and p_expo_push_token is not null
        and device_row.expo_push_token = trim(p_expo_push_token)
    )
  );
$$;

revoke all on function public.get_my_push_notification_status(text) from public;
grant execute on function public.get_my_push_notification_status(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Queue creation from the existing private notification source of truth
-- ---------------------------------------------------------------------------

create or replace function public.queue_circle_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
  v_conversation_title text;
  v_title text := 'Circles';
  v_body text := 'You have new private activity.';
  v_payload jsonb;
  v_is_safety boolean;
begin
  if tg_op = 'UPDATE' then
    if new.created_at is not distinct from old.created_at then
      return new;
    end if;
  end if;

  v_is_safety := new.notification_type in (
    'safety_report_resolved',
    'safety_appeal_resolved',
    'safety_age_correction_resolved'
  );

  -- Suspended accounts receive only the safety outcomes needed to review or
  -- appeal their status. Restricted accounts may still read ordinary content.
  if not v_is_safety and exists (
    select 1
    from public.account_enforcements enforcement_row
    where enforcement_row.user_id = new.user_id
      and enforcement_row.state = 'suspended'
      and (enforcement_row.ends_at is null or enforcement_row.ends_at > now())
  ) then
    return new;
  end if;

  select coalesce(nullif(trim(user_row.display_name), ''), 'Someone')
  into v_actor_name
  from public.users user_row
  where user_row.id = new.actor_id;

  select coalesce(
    nullif(trim(conversation_row.title), ''),
    case when conversation_row.kind = 'direct' then 'a private conversation' else 'your Circle' end
  )
  into v_conversation_title
  from public.conversations conversation_row
  where conversation_row.id = new.conversation_id;

  case new.notification_type
    when 'personal_like' then
      v_body := coalesce(v_actor_name, 'Someone') || ' liked your post.';
    when 'personal_comment' then
      v_body := coalesce(v_actor_name, 'Someone') || ' commented on your post.';
    when 'circle_post' then
      v_body := 'A new post was shared in one of your private Circles.';
    when 'circle_comment' then
      v_body := 'There is new activity in one of your private Circles.';
    when 'circle_like' then
      v_body := 'There is new activity in one of your private Circles.';
    when 'conversation_invitation' then
      v_body := 'You have a new private Circle invitation.';
    when 'safety_report_resolved' then
      v_body := 'Circles completed an update on a safety report you submitted.';
    when 'safety_appeal_resolved' then
      v_body := 'Circles completed the review of your account-action appeal.';
    when 'safety_age_correction_resolved' then
      v_body := 'Circles completed the review of your birth-date correction request.';
    else
      v_body := 'You have new private activity.';
  end case;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'route', case
      when new.notification_type = 'conversation_invitation' then 'inbox'
      when new.notification_type in ('personal_like', 'personal_comment') then 'post'
      when new.notification_type in ('circle_post', 'circle_comment', 'circle_like') then 'circle_post'
      when new.notification_type = 'safety_report_resolved' then 'safety_reports'
      when new.notification_type = 'safety_appeal_resolved' then 'account_appeal'
      when new.notification_type = 'safety_age_correction_resolved' then 'age_correction'
      else 'notifications'
    end,
    'notificationId', new.id,
    'conversationId', new.conversation_id,
    'postId', coalesce(new.personal_post_id, new.post_id),
    'openComments', new.notification_type in ('personal_comment', 'circle_comment')
  ));

  insert into public.push_delivery_jobs (
    user_id,
    push_device_id,
    source_kind,
    source_id,
    notification_type,
    title,
    body,
    payload,
    status,
    next_attempt_at,
    updated_at
  )
  select
    new.user_id,
    device_row.id,
    'notification',
    new.id,
    new.notification_type,
    v_title,
    v_body,
    v_payload,
    'pending',
    now(),
    now()
  from public.push_devices device_row
  where device_row.user_id = new.user_id
    and device_row.enabled
  on conflict (source_kind, source_id, push_device_id) do update
  set
    notification_type = excluded.notification_type,
    title = excluded.title,
    body = excluded.body,
    payload = excluded.payload,
    status = 'pending',
    attempt_count = 0,
    next_attempt_at = now(),
    expo_ticket_id = null,
    ticket_error_code = null,
    ticket_error_message = null,
    next_receipt_check_at = null,
    receipt_status = null,
    receipt_error_code = null,
    receipt_error_message = null,
    last_error = null,
    sent_at = null,
    receipt_checked_at = null,
    completed_at = null,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.queue_circle_notification_push() from public;

drop trigger if exists circle_notifications_queue_push on public.circle_notifications;
create trigger circle_notifications_queue_push
after insert or update on public.circle_notifications
for each row execute function public.queue_circle_notification_push();

create or replace function public.cancel_circle_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.push_delivery_jobs job
  set
    status = 'skipped',
    last_error = 'Source notification was removed',
    completed_at = now(),
    updated_at = now()
  where job.source_kind = 'notification'
    and job.source_id = old.id
    and job.status in ('pending', 'retry', 'sending');

  return old;
end;
$$;

revoke all on function public.cancel_circle_notification_push() from public;

drop trigger if exists circle_notifications_cancel_push on public.circle_notifications;
create trigger circle_notifications_cancel_push
after delete on public.circle_notifications
for each row execute function public.cancel_circle_notification_push();

-- ---------------------------------------------------------------------------
-- Message pushes without copying message content
-- ---------------------------------------------------------------------------

create or replace function public.queue_message_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_name text;
  v_conversation public.conversations%rowtype;
  v_body text;
begin
  select * into v_conversation
  from public.conversations conversation_row
  where conversation_row.id = new.conversation_id;

  if v_conversation.id is null or v_conversation.closed_at is not null then
    return new;
  end if;

  select coalesce(nullif(trim(user_row.display_name), ''), 'Someone')
  into v_sender_name
  from public.users user_row
  where user_row.id = new.sender_id;

  if v_conversation.kind = 'direct' and not coalesce(v_conversation.circle_enabled, false) then
    v_body := coalesce(v_sender_name, 'Someone') || ' sent you a private message.';
  else
    v_body := 'You have a new message in one of your private Circles.';
  end if;

  insert into public.push_delivery_jobs (
    user_id,
    push_device_id,
    source_kind,
    source_id,
    notification_type,
    title,
    body,
    payload,
    status,
    next_attempt_at,
    updated_at
  )
  select
    membership.user_id,
    device_row.id,
    'message',
    new.id,
    'message',
    'Circles',
    v_body,
    jsonb_build_object(
      'route', 'chat',
      'conversationId', new.conversation_id,
      'messageId', new.id
    ),
    'pending',
    now(),
    now()
  from public.conversation_members membership
  join public.push_devices device_row
    on device_row.user_id = membership.user_id
   and device_row.enabled
  where membership.conversation_id = new.conversation_id
    and membership.user_id <> new.sender_id
    and membership.notify_messages
    and not (
      membership.notifications_muted
      and (
        membership.notifications_muted_until is null
        or membership.notifications_muted_until > now()
      )
    )
    and not exists (
      select 1
      from public.account_enforcements enforcement_row
      where enforcement_row.user_id = membership.user_id
        and enforcement_row.state = 'suspended'
        and (enforcement_row.ends_at is null or enforcement_row.ends_at > now())
    )
  on conflict (source_kind, source_id, push_device_id) do nothing;

  return new;
end;
$$;

revoke all on function public.queue_message_push() from public;

drop trigger if exists messages_queue_push on public.messages;
create trigger messages_queue_push
after insert on public.messages
for each row execute function public.queue_message_push();

create or replace function public.cancel_message_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.push_delivery_jobs job
  set
    status = 'skipped',
    last_error = 'Source message was removed',
    completed_at = now(),
    updated_at = now()
  where job.source_kind = 'message'
    and job.source_id = old.id
    and job.status in ('pending', 'retry', 'sending');

  return old;
end;
$$;

revoke all on function public.cancel_message_push() from public;

drop trigger if exists messages_cancel_push on public.messages;
create trigger messages_cancel_push
after delete on public.messages
for each row execute function public.cancel_message_push();

-- ---------------------------------------------------------------------------
-- Connection-request pushes
-- ---------------------------------------------------------------------------

create or replace function public.queue_connection_request_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_name text;
begin
  if new.status::text <> 'pending' then
    update public.push_delivery_jobs job
    set
      status = 'skipped',
      last_error = 'Connection request is no longer pending',
      completed_at = now(),
      updated_at = now()
    where job.source_kind = 'connection_request'
      and job.source_id = new.id
      and job.status in ('pending', 'retry', 'sending');
    return new;
  end if;

  if exists (
    select 1
    from public.account_enforcements enforcement_row
    where enforcement_row.user_id = new.to_user
      and enforcement_row.state = 'suspended'
      and (enforcement_row.ends_at is null or enforcement_row.ends_at > now())
  ) then
    return new;
  end if;

  select coalesce(nullif(trim(user_row.display_name), ''), 'Someone')
  into v_sender_name
  from public.users user_row
  where user_row.id = new.from_user;

  insert into public.push_delivery_jobs (
    user_id,
    push_device_id,
    source_kind,
    source_id,
    notification_type,
    title,
    body,
    payload,
    status,
    next_attempt_at,
    updated_at
  )
  select
    new.to_user,
    device_row.id,
    'connection_request',
    new.id,
    'connection_request',
    'Circles',
    coalesce(v_sender_name, 'Someone') || ' sent you a connection request.',
    jsonb_build_object('route', 'mutuals', 'requestId', new.id),
    'pending',
    now(),
    now()
  from public.push_devices device_row
  where device_row.user_id = new.to_user
    and device_row.enabled
  on conflict (source_kind, source_id, push_device_id) do nothing;

  return new;
end;
$$;

revoke all on function public.queue_connection_request_push() from public;

drop trigger if exists connection_requests_queue_push on public.connection_requests;
create trigger connection_requests_queue_push
after insert or update on public.connection_requests
for each row execute function public.queue_connection_request_push();

-- ---------------------------------------------------------------------------
-- Trusted dispatcher RPCs
-- ---------------------------------------------------------------------------

create or replace function public.claim_push_delivery_jobs(
  p_limit_count integer default 100
)
returns table (
  job_id uuid,
  push_device_id uuid,
  expo_push_token text,
  title text,
  body text,
  payload jsonb,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Recover jobs from an interrupted dispatcher invocation.
  update public.push_delivery_jobs job
  set
    status = 'retry',
    next_attempt_at = now(),
    last_error = 'Recovered interrupted dispatch',
    updated_at = now()
  where job.status = 'sending'
    and job.updated_at < now() - interval '5 minutes';

  -- Cancel jobs that are no longer relevant before sending them externally.
  update public.push_delivery_jobs job
  set
    status = 'skipped',
    last_error = 'Push source is no longer unread or deliverable',
    completed_at = now(),
    updated_at = now()
  where job.status in ('pending', 'retry')
    and (
      not exists (
        select 1
        from public.push_devices device_row
        where device_row.id = job.push_device_id
          and device_row.user_id = job.user_id
          and device_row.enabled
      )
      or (
        job.source_kind = 'notification'
        and not exists (
          select 1
          from public.circle_notifications notification_row
          where notification_row.id = job.source_id
            and notification_row.user_id = job.user_id
            and notification_row.read_at is null
        )
      )
      or (
        job.source_kind = 'message'
        and not exists (
          select 1
          from public.messages message_row
          join public.conversation_members membership
            on membership.conversation_id = message_row.conversation_id
           and membership.user_id = job.user_id
          where message_row.id = job.source_id
            and message_row.sender_id <> job.user_id
            and message_row.created_at > membership.last_read_at
            and membership.notify_messages
            and not (
              membership.notifications_muted
              and (
                membership.notifications_muted_until is null
                or membership.notifications_muted_until > now()
              )
            )
        )
      )
      or (
        job.source_kind = 'connection_request'
        and not exists (
          select 1
          from public.connection_requests request_row
          where request_row.id = job.source_id
            and request_row.to_user = job.user_id
            and request_row.status::text = 'pending'
        )
      )
    );

  return query
  with selected as (
    select job.id
    from public.push_delivery_jobs job
    where job.status in ('pending', 'retry')
      and job.next_attempt_at <= now()
    order by job.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit_count, 100), 100))
  ), claimed as (
    update public.push_delivery_jobs job
    set
      status = 'sending',
      attempt_count = job.attempt_count + 1,
      updated_at = now()
    from selected
    where job.id = selected.id
    returning job.*
  )
  select
    claimed.id,
    claimed.push_device_id,
    device_row.expo_push_token,
    claimed.title,
    claimed.body,
    claimed.payload,
    claimed.attempt_count
  from claimed
  join public.push_devices device_row
    on device_row.id = claimed.push_device_id;
end;
$$;

revoke all on function public.claim_push_delivery_jobs(integer) from public;
grant execute on function public.claim_push_delivery_jobs(integer) to service_role;

create or replace function public.complete_push_delivery_batch(
  p_results jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_job_id uuid;
  v_status text;
  v_error_code text;
  v_error_message text;
  v_device_id uuid;
  v_attempt_count integer;
begin
  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'Push results must be an array';
  end if;

  for v_result in select * from jsonb_array_elements(p_results)
  loop
    v_job_id := (v_result->>'job_id')::uuid;
    v_status := v_result->>'status';
    v_error_code := nullif(v_result->>'error_code', '');
    v_error_message := left(nullif(v_result->>'error_message', ''), 1000);

    select job.push_device_id, job.attempt_count
    into v_device_id, v_attempt_count
    from public.push_delivery_jobs job
    where job.id = v_job_id;

    if v_device_id is null then
      continue;
    end if;

    if v_status = 'ticket' then
      update public.push_delivery_jobs job
      set
        status = 'ticket',
        expo_ticket_id = nullif(v_result->>'ticket_id', ''),
        ticket_error_code = null,
        ticket_error_message = null,
        sent_at = now(),
        next_receipt_check_at = now() + interval '15 minutes',
        last_error = null,
        updated_at = now()
      where job.id = v_job_id;
    elsif v_status = 'retry' and v_attempt_count < 5 then
      update public.push_delivery_jobs job
      set
        status = 'retry',
        next_attempt_at = now() + make_interval(secs => least(300, (power(2, greatest(v_attempt_count, 1)) * 5)::integer)),
        ticket_error_code = v_error_code,
        ticket_error_message = v_error_message,
        last_error = coalesce(v_error_message, v_error_code, 'Temporary push failure'),
        updated_at = now()
      where job.id = v_job_id;
    else
      update public.push_delivery_jobs job
      set
        status = 'failed',
        ticket_error_code = v_error_code,
        ticket_error_message = v_error_message,
        last_error = coalesce(v_error_message, v_error_code, 'Push delivery failed'),
        completed_at = now(),
        updated_at = now()
      where job.id = v_job_id;
    end if;

    if coalesce(v_result->>'disable_device', 'false')::boolean
       or v_error_code = 'DeviceNotRegistered' then
      update public.push_devices device_row
      set
        enabled = false,
        disabled_at = now(),
        disabled_reason = coalesce(v_error_code, 'delivery_error'),
        updated_at = now()
      where device_row.id = v_device_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.complete_push_delivery_batch(jsonb) from public;
grant execute on function public.complete_push_delivery_batch(jsonb) to service_role;

create or replace function public.claim_push_receipt_jobs(
  p_limit_count integer default 300
)
returns table (
  job_id uuid,
  push_device_id uuid,
  expo_ticket_id text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.push_delivery_jobs job
  set
    status = 'ticket',
    next_receipt_check_at = now(),
    last_error = 'Recovered interrupted receipt check',
    updated_at = now()
  where job.status = 'receipt_checking'
    and job.updated_at < now() - interval '5 minutes';

  -- Expo receipts are not retained indefinitely. Stop retrying stale tickets
  -- rather than leaving an unbounded receipt-check queue.
  update public.push_delivery_jobs job
  set
    status = 'failed',
    last_error = 'Push receipt expired before confirmation',
    completed_at = now(),
    updated_at = now()
  where job.status = 'ticket'
    and job.sent_at < now() - interval '24 hours';

  return query
  with selected as (
    select job.id
    from public.push_delivery_jobs job
    where job.status = 'ticket'
      and job.expo_ticket_id is not null
      and job.next_receipt_check_at <= now()
    order by job.next_receipt_check_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit_count, 300), 1000))
  ), claimed as (
    update public.push_delivery_jobs job
    set status = 'receipt_checking', updated_at = now()
    from selected
    where job.id = selected.id
    returning job.*
  )
  select claimed.id, claimed.push_device_id, claimed.expo_ticket_id
  from claimed;
end;
$$;

revoke all on function public.claim_push_receipt_jobs(integer) from public;
grant execute on function public.claim_push_receipt_jobs(integer) to service_role;

create or replace function public.complete_push_receipt_batch(
  p_results jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_job_id uuid;
  v_status text;
  v_error_code text;
  v_error_message text;
  v_device_id uuid;
begin
  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'Receipt results must be an array';
  end if;

  for v_result in select * from jsonb_array_elements(p_results)
  loop
    v_job_id := (v_result->>'job_id')::uuid;
    v_status := v_result->>'status';
    v_error_code := nullif(v_result->>'error_code', '');
    v_error_message := left(nullif(v_result->>'error_message', ''), 1000);

    select job.push_device_id into v_device_id
    from public.push_delivery_jobs job
    where job.id = v_job_id;

    if v_device_id is null then
      continue;
    end if;

    if v_status = 'ok' then
      update public.push_delivery_jobs job
      set
        status = 'complete',
        receipt_status = 'ok',
        receipt_error_code = null,
        receipt_error_message = null,
        receipt_checked_at = now(),
        completed_at = now(),
        last_error = null,
        updated_at = now()
      where job.id = v_job_id;
    elsif v_status = 'pending' then
      update public.push_delivery_jobs job
      set
        status = 'ticket',
        next_receipt_check_at = now() + interval '5 minutes',
        last_error = 'Receipt not available yet',
        updated_at = now()
      where job.id = v_job_id;
    else
      update public.push_delivery_jobs job
      set
        status = 'failed',
        receipt_status = 'error',
        receipt_error_code = v_error_code,
        receipt_error_message = v_error_message,
        receipt_checked_at = now(),
        completed_at = now(),
        last_error = coalesce(v_error_message, v_error_code, 'Push receipt failed'),
        updated_at = now()
      where job.id = v_job_id;
    end if;

    if v_error_code = 'DeviceNotRegistered' then
      update public.push_devices device_row
      set
        enabled = false,
        disabled_at = now(),
        disabled_reason = 'DeviceNotRegistered',
        updated_at = now()
      where device_row.id = v_device_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.complete_push_receipt_batch(jsonb) from public;
grant execute on function public.complete_push_receipt_batch(jsonb) to service_role;

-- Account deletion immediately removes all registered device tokens and jobs.
create or replace function public.clear_push_devices_for_deleted_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.push_devices device_row
    where device_row.user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_push_devices_for_deleted_account() from public;

drop trigger if exists users_clear_push_devices_on_delete on public.users;
create trigger users_clear_push_devices_on_delete
after update of deleted_at on public.users
for each row execute function public.clear_push_devices_for_deleted_account();

commit;

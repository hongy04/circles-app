-- Circles Step 35 — participation awareness + global activity notifications
--
-- Keeps permanent Circle profiles clean while surfacing only current actions that
-- need the viewer: unanswered event RSVPs, open availability polls, pending
-- two-person plan proposals, and newly shared thoughts. The same underlying
-- actions also enter the universal notification center without introducing any
-- ranking or engagement scoring.

begin;

-- ---------------------------------------------------------------------------
-- Notification targets
-- ---------------------------------------------------------------------------

alter table public.circle_notifications
  add column if not exists event_id uuid
    references public.events(id) on delete cascade;

alter table public.circle_notifications
  add column if not exists poll_id uuid
    references public.event_availability_polls(id) on delete cascade;

alter table public.circle_notifications
  add column if not exists two_person_plan_id uuid
    references public.two_person_circle_plans(id) on delete cascade;

alter table public.circle_notifications
  add column if not exists two_person_thought_id uuid
    references public.two_person_circle_thoughts(id) on delete cascade;

alter table public.circle_notifications
  add column if not exists participation_version integer;

-- Replace whichever notification-type constraint is currently installed.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select constraint_info.conname
    from pg_constraint constraint_info
    where constraint_info.conrelid = 'public.circle_notifications'::regclass
      and constraint_info.contype = 'c'
      and pg_get_constraintdef(constraint_info.oid) ilike '%notification_type%'
  loop
    execute format(
      'alter table public.circle_notifications drop constraint %I',
      constraint_row.conname
    );
  end loop;
end;
$$;

alter table public.circle_notifications
  add constraint circle_notifications_notification_type_check
  check (
    notification_type in (
      'conversation_invitation',
      'circle_post',
      'circle_comment',
      'circle_like',
      'personal_comment',
      'personal_like',
      'event_participation',
      'event_poll_participation',
      'two_person_plan_participation',
      'two_person_thought_shared',
      'safety_report_resolved',
      'safety_appeal_resolved',
      'safety_age_correction_resolved'
    )
  );

create unique index if not exists circle_notifications_event_participation_unique
  on public.circle_notifications (user_id, notification_type, event_id)
  where notification_type = 'event_participation';

create unique index if not exists circle_notifications_poll_participation_unique
  on public.circle_notifications (user_id, notification_type, poll_id)
  where notification_type = 'event_poll_participation';

create unique index if not exists circle_notifications_plan_participation_unique
  on public.circle_notifications (
    user_id,
    notification_type,
    two_person_plan_id,
    participation_version
  )
  where notification_type = 'two_person_plan_participation';

create unique index if not exists circle_notifications_thought_shared_unique
  on public.circle_notifications (user_id, notification_type, two_person_thought_id)
  where notification_type = 'two_person_thought_shared';

-- ---------------------------------------------------------------------------
-- Read acknowledgement for shared thoughts
-- ---------------------------------------------------------------------------

create table if not exists public.two_person_thought_reads (
  thought_id uuid not null
    references public.two_person_circle_thoughts(id) on delete cascade,
  user_id uuid not null
    references public.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (thought_id, user_id)
);

alter table public.two_person_thought_reads enable row level security;
revoke all on table public.two_person_thought_reads from anon, authenticated;

create or replace function public.mark_two_person_thought_read(
  p_thought_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_thought public.two_person_circle_thoughts%rowtype;
  v_read_at timestamptz;
begin
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select thought_row.*
  into v_thought
  from public.two_person_circle_thoughts thought_row
  where thought_row.id = p_thought_id;

  if v_thought.id is null
     or v_thought.status <> 'shared'
     or v_thought.author_id = v_viewer_id
     or not public.two_person_circle_is_unlocked(
       v_thought.conversation_id,
       v_viewer_id
     ) then
    return null;
  end if;

  insert into public.two_person_thought_reads (thought_id, user_id, read_at)
  values (v_thought.id, v_viewer_id, now())
  on conflict (thought_id, user_id) do update
  set read_at = excluded.read_at
  returning read_at into v_read_at;

  update public.circle_notifications notification_row
  set read_at = coalesce(notification_row.read_at, v_read_at)
  where notification_row.user_id = v_viewer_id
    and notification_row.notification_type = 'two_person_thought_shared'
    and notification_row.two_person_thought_id = v_thought.id
    and notification_row.read_at is null;

  return v_read_at;
end;
$$;

revoke all on function public.mark_two_person_thought_read(uuid) from public;
grant execute on function public.mark_two_person_thought_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notification creation
-- ---------------------------------------------------------------------------

create or replace function public.notify_event_participation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
begin
  select event_row.*
  into v_event
  from public.events event_row
  where event_row.id = new.event_id;

  if v_event.id is null
     or v_event.status <> 'scheduled'
     or v_event.starts_at <= now() then
    return new;
  end if;

  insert into public.circle_notifications (
    user_id,
    conversation_id,
    actor_id,
    notification_type,
    event_id,
    created_at
  )
  select
    member_row.user_id,
    new.conversation_id,
    v_event.host_id,
    'event_participation',
    v_event.id,
    coalesce(v_event.created_at, now())
  from public.conversation_members member_row
  where member_row.conversation_id = new.conversation_id
    and member_row.user_id <> coalesce(v_event.host_id, member_row.user_id)
    and coalesce(member_row.notify_circle_interactions, true)
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.notify_event_participation() from public;

drop trigger if exists event_circles_create_participation_notifications
  on public.event_circles;
create trigger event_circles_create_participation_notifications
after insert on public.event_circles
for each row execute function public.notify_event_participation();

create or replace function public.notify_event_poll_participation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'open' then
    return new;
  end if;

  insert into public.circle_notifications (
    user_id,
    conversation_id,
    actor_id,
    notification_type,
    poll_id,
    created_at
  )
  select
    member_row.user_id,
    new.conversation_id,
    new.host_id,
    'event_poll_participation',
    new.id,
    new.created_at
  from public.conversation_members member_row
  where member_row.conversation_id = new.conversation_id
    and member_row.user_id <> coalesce(new.host_id, member_row.user_id)
    and coalesce(member_row.notify_circle_interactions, true)
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.notify_event_poll_participation() from public;

drop trigger if exists event_polls_create_participation_notifications
  on public.event_availability_polls;
create trigger event_polls_create_participation_notifications
after insert on public.event_availability_polls
for each row execute function public.notify_event_poll_participation();

create or replace function public.resolve_event_participation_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.circle_notifications notification_row
  set read_at = coalesce(notification_row.read_at, new.responded_at, now())
  where notification_row.user_id = new.user_id
    and notification_row.notification_type = 'event_participation'
    and notification_row.event_id = new.event_id
    and notification_row.read_at is null;
  return new;
end;
$$;

revoke all on function public.resolve_event_participation_notification() from public;

drop trigger if exists event_rsvps_resolve_participation_notification
  on public.event_rsvps;
create trigger event_rsvps_resolve_participation_notification
after insert or update on public.event_rsvps
for each row execute function public.resolve_event_participation_notification();

create or replace function public.resolve_event_poll_participation_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.circle_notifications notification_row
  set read_at = coalesce(notification_row.read_at, new.responded_at, now())
  where notification_row.user_id = new.user_id
    and notification_row.notification_type = 'event_poll_participation'
    and notification_row.poll_id = new.poll_id
    and notification_row.read_at is null;
  return new;
end;
$$;

revoke all on function public.resolve_event_poll_participation_notification() from public;

drop trigger if exists event_poll_responses_resolve_participation_notification
  on public.event_availability_responses;
create trigger event_poll_responses_resolve_participation_notification
after insert or update on public.event_availability_responses
for each row execute function public.resolve_event_poll_participation_notification();

create or replace function public.notify_two_person_plan_participation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.proposal_by is not null and new.response_state <> 'pending' then
    update public.circle_notifications notification_row
    set read_at = coalesce(notification_row.read_at, new.updated_at, now())
    where notification_row.conversation_id = new.conversation_id
      and notification_row.notification_type = 'two_person_plan_participation'
      and notification_row.two_person_plan_id = new.id
      and notification_row.user_id <> new.proposal_by
      and notification_row.read_at is null;
  end if;

  if new.status <> 'proposed'
     or new.response_state <> 'pending'
     or new.proposal_by is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.response_state is not distinct from new.response_state
     and old.proposal_version is not distinct from new.proposal_version then
    return new;
  end if;

  insert into public.circle_notifications (
    user_id,
    conversation_id,
    actor_id,
    notification_type,
    two_person_plan_id,
    participation_version,
    created_at
  )
  select
    member_row.user_id,
    new.conversation_id,
    new.proposal_by,
    'two_person_plan_participation',
    new.id,
    new.proposal_version,
    new.updated_at
  from public.conversation_members member_row
  where member_row.conversation_id = new.conversation_id
    and member_row.user_id <> new.proposal_by
    and coalesce(member_row.notify_circle_interactions, true)
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.notify_two_person_plan_participation() from public;

drop trigger if exists two_person_plans_create_participation_notifications
  on public.two_person_circle_plans;
create trigger two_person_plans_create_participation_notifications
after insert or update on public.two_person_circle_plans
for each row execute function public.notify_two_person_plan_participation();

create or replace function public.notify_two_person_thought_shared()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'shared'
     or new.shared_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'shared' then
    return new;
  end if;

  insert into public.circle_notifications (
    user_id,
    conversation_id,
    actor_id,
    notification_type,
    two_person_thought_id,
    created_at
  )
  select
    member_row.user_id,
    new.conversation_id,
    new.author_id,
    'two_person_thought_shared',
    new.id,
    new.shared_at
  from public.conversation_members member_row
  where member_row.conversation_id = new.conversation_id
    and member_row.user_id <> new.author_id
    and coalesce(member_row.notify_circle_interactions, true)
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.notify_two_person_thought_shared() from public;

drop trigger if exists two_person_thoughts_create_shared_notifications
  on public.two_person_circle_thoughts;
create trigger two_person_thoughts_create_shared_notifications
after insert or update on public.two_person_circle_thoughts
for each row execute function public.notify_two_person_thought_shared();

-- ---------------------------------------------------------------------------
-- Current participation prompt read model
-- ---------------------------------------------------------------------------

create or replace function public.get_circle_participation_prompts(
  p_conversation_id uuid
)
returns table (
  prompt_type text,
  target_id uuid,
  title text,
  actor_id uuid,
  actor_name text,
  starts_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as user_id
  ), allowed as (
    select conversation_row.id, conversation_row.kind
    from public.conversations conversation_row
    join public.conversation_members member_row
      on member_row.conversation_id = conversation_row.id
    join viewer on viewer.user_id = member_row.user_id
    where conversation_row.id = p_conversation_id
      and (
        conversation_row.kind <> 'direct'
        or public.two_person_circle_is_unlocked(conversation_row.id, viewer.user_id)
      )
  ), prompts as (
    select
      'event_poll'::text as prompt_type,
      poll_row.id as target_id,
      poll_row.title,
      poll_row.host_id as actor_id,
      coalesce(host_user.display_name, 'Circle member') as actor_name,
      first_option.starts_at,
      poll_row.created_at,
      10 as prompt_priority,
      poll_row.created_at as prompt_sort
    from public.event_availability_polls poll_row
    join allowed on allowed.id = poll_row.conversation_id
    join viewer on true
    left join public.users host_user on host_user.id = poll_row.host_id
    left join lateral (
      select option_row.starts_at
      from public.event_availability_options option_row
      where option_row.poll_id = poll_row.id
      order by option_row.sort_order, option_row.starts_at
      limit 1
    ) first_option on true
    where poll_row.status = 'open'
      and poll_row.host_id is distinct from viewer.user_id
      and not exists (
        select 1
        from public.event_availability_responses response_row
        where response_row.poll_id = poll_row.id
          and response_row.user_id = viewer.user_id
      )

    union all

    select
      'two_person_plan'::text,
      plan_row.id,
      plan_row.title,
      plan_row.proposal_by,
      coalesce(proposer.display_name, 'The other person'),
      plan_row.starts_at,
      plan_row.updated_at,
      10,
      plan_row.updated_at
    from public.two_person_circle_plans plan_row
    join allowed on allowed.id = plan_row.conversation_id
    join viewer on true
    left join public.users proposer on proposer.id = plan_row.proposal_by
    where plan_row.status = 'proposed'
      and plan_row.response_state = 'pending'
      and plan_row.proposal_by is distinct from viewer.user_id

    union all

    select
      'event_rsvp'::text,
      event_row.id,
      event_row.title,
      event_row.host_id,
      coalesce(host_user.display_name, 'Circle member'),
      event_row.starts_at,
      event_row.created_at,
      20,
      event_row.starts_at
    from public.events event_row
    join public.event_circles event_circle
      on event_circle.event_id = event_row.id
    join allowed on allowed.id = event_circle.conversation_id
    join viewer on true
    left join public.users host_user on host_user.id = event_row.host_id
    where event_row.status = 'scheduled'
      and event_row.starts_at > now()
      and event_row.host_id is distinct from viewer.user_id
      and not exists (
        select 1
        from public.event_rsvps rsvp_row
        where rsvp_row.event_id = event_row.id
          and rsvp_row.user_id = viewer.user_id
      )

    union all

    select
      'shared_thought'::text,
      thought_row.id,
      nullif(trim(thought_row.title), ''),
      thought_row.author_id,
      coalesce(author_user.display_name, 'The other person'),
      null::timestamptz,
      thought_row.shared_at,
      30,
      thought_row.shared_at
    from public.two_person_circle_thoughts thought_row
    join allowed on allowed.id = thought_row.conversation_id
    join viewer on true
    left join public.users author_user on author_user.id = thought_row.author_id
    where thought_row.status = 'shared'
      and thought_row.author_id <> viewer.user_id
      and not exists (
        select 1
        from public.two_person_thought_reads read_row
        where read_row.thought_id = thought_row.id
          and read_row.user_id = viewer.user_id
      )
  )
  select
    prompts.prompt_type,
    prompts.target_id,
    coalesce(prompts.title, 'A shared thought') as title,
    prompts.actor_id,
    prompts.actor_name,
    prompts.starts_at,
    prompts.created_at
  from prompts
  order by prompts.prompt_priority, prompts.prompt_sort desc nulls last
  limit 3;
$$;

revoke all on function public.get_circle_participation_prompts(uuid) from public;
grant execute on function public.get_circle_participation_prompts(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Universal notification-center read model with participation targets
-- ---------------------------------------------------------------------------

drop function if exists public.get_my_notifications(integer, timestamptz);

create function public.get_my_notifications(
  p_limit_count integer default 100,
  p_before timestamptz default now()
)
returns table (
  notification_id uuid,
  notification_type text,
  conversation_id uuid,
  conversation_title text,
  actor_id uuid,
  actor_name text,
  actor_avatar text,
  circle_post_id uuid,
  circle_comment_id uuid,
  personal_post_id uuid,
  personal_comment_id uuid,
  invitation_id uuid,
  event_id uuid,
  poll_id uuid,
  two_person_plan_id uuid,
  two_person_thought_id uuid,
  target_title text,
  safety_report_id uuid,
  account_appeal_id uuid,
  age_correction_request_id uuid,
  created_at timestamptz,
  read_at timestamptz,
  is_read boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    notification.id as notification_id,
    notification.notification_type,
    notification.conversation_id,
    case
      when notification.conversation_id is null then null
      else coalesce(
        nullif(trim(conversation.title), ''),
        case
          when conversation.kind = 'direct' then 'Private conversation'
          else 'Private Circle'
        end
      )
    end as conversation_title,
    notification.actor_id,
    case
      when notification.notification_type in (
        'safety_report_resolved',
        'safety_appeal_resolved',
        'safety_age_correction_resolved'
      ) then 'Circles'
      else coalesce(actor.display_name, 'Someone')
    end as actor_name,
    case
      when notification.notification_type in (
        'safety_report_resolved',
        'safety_appeal_resolved',
        'safety_age_correction_resolved'
      ) then null
      else actor.avatar_url
    end as actor_avatar,
    notification.post_id as circle_post_id,
    notification.comment_id as circle_comment_id,
    notification.personal_post_id,
    notification.personal_comment_id,
    notification.invitation_id,
    notification.event_id,
    notification.poll_id,
    notification.two_person_plan_id,
    notification.two_person_thought_id,
    coalesce(
      event_row.title,
      poll_row.title,
      plan_row.title,
      nullif(trim(thought_row.title), ''),
      case when notification.two_person_thought_id is not null then 'A shared thought' end
    ) as target_title,
    notification.safety_report_id,
    notification.account_appeal_id,
    notification.age_correction_request_id,
    notification.created_at,
    notification.read_at,
    notification.read_at is not null as is_read
  from public.circle_notifications notification
  left join public.conversations conversation
    on conversation.id = notification.conversation_id
  left join public.users actor
    on actor.id = notification.actor_id
  left join public.events event_row
    on event_row.id = notification.event_id
  left join public.event_availability_polls poll_row
    on poll_row.id = notification.poll_id
  left join public.two_person_circle_plans plan_row
    on plan_row.id = notification.two_person_plan_id
  left join public.two_person_circle_thoughts thought_row
    on thought_row.id = notification.two_person_thought_id
  where notification.user_id = auth.uid()
    and notification.created_at < coalesce(p_before, now())
  order by notification.created_at desc
  limit greatest(1, least(coalesce(p_limit_count, 100), 300));
$$;

revoke all on function public.get_my_notifications(integer, timestamptz) from public;
grant execute on function public.get_my_notifications(integer, timestamptz) to authenticated;

commit;

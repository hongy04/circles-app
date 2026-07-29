-- Circles Phase 8G — private safety outcome notifications
--
-- Adds broad, owner-only notification-center updates for completed safety
-- report reviews, account-action appeals, and birth-date correction requests.
-- Notifications never expose the reported account, reporter, moderator,
-- evidence, private notes, birth dates, or enforcement details.

begin;

-- ---------------------------------------------------------------------------
-- Feature control
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
      'two_person_plan_memory_links',
      'safety_blocking_reporting',
      'safety_moderation_console',
      'safety_account_enforcement',
      'safety_account_appeals',
      'safety_age_correction_requests',
      'safety_outcome_notifications'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'safety_outcome_notifications',
  true,
  'Adds privacy-safe notification-center updates for completed safety reviews.'
)
on conflict (flag_key) do update
set
  description = excluded.description,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Private notification targets
-- ---------------------------------------------------------------------------

alter table public.circle_notifications
  add column if not exists safety_report_id uuid
    references public.user_reports(id) on delete cascade;

alter table public.circle_notifications
  add column if not exists account_appeal_id uuid
    references public.account_enforcement_appeals(id) on delete cascade;

alter table public.circle_notifications
  add column if not exists age_correction_request_id uuid
    references public.age_eligibility_correction_requests(id) on delete cascade;

-- Replace whichever notification_type check is currently installed.
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
      'safety_report_resolved',
      'safety_appeal_resolved',
      'safety_age_correction_resolved'
    )
  );

create unique index if not exists circle_notifications_safety_report_unique
  on public.circle_notifications (
    user_id,
    notification_type,
    safety_report_id
  )
  where notification_type = 'safety_report_resolved';

create unique index if not exists circle_notifications_account_appeal_unique
  on public.circle_notifications (
    user_id,
    notification_type,
    account_appeal_id
  )
  where notification_type = 'safety_appeal_resolved';

create unique index if not exists circle_notifications_age_correction_unique
  on public.circle_notifications (
    user_id,
    notification_type,
    age_correction_request_id
  )
  where notification_type = 'safety_age_correction_resolved';

create or replace function public.safety_outcome_notifications_are_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select flag_row.enabled
    from public.app_feature_flags flag_row
    where flag_row.flag_key = 'safety_outcome_notifications'
  ), true);
$$;

revoke all on function public.safety_outcome_notifications_are_enabled()
  from public;

-- ---------------------------------------------------------------------------
-- Resolution triggers
-- ---------------------------------------------------------------------------

create or replace function public.notify_safety_report_outcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.safety_outcome_notifications_are_enabled()
     or new.status not in ('resolved', 'dismissed')
     or new.resolution_code is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.resolution_code is not distinct from new.resolution_code
     and old.public_resolution_message is not distinct from new.public_resolution_message then
    return new;
  end if;

  insert into public.circle_notifications (
    user_id,
    actor_id,
    notification_type,
    safety_report_id,
    created_at,
    read_at
  ) values (
    new.reporter_id,
    null,
    'safety_report_resolved',
    new.id,
    now(),
    null
  )
  on conflict (
    user_id,
    notification_type,
    safety_report_id
  ) where notification_type = 'safety_report_resolved'
  do update set
    created_at = excluded.created_at,
    read_at = null;

  return new;
end;
$$;

revoke all on function public.notify_safety_report_outcome() from public;

drop trigger if exists user_reports_safety_outcome_notification
  on public.user_reports;
create trigger user_reports_safety_outcome_notification
after insert or update on public.user_reports
for each row
execute function public.notify_safety_report_outcome();

create or replace function public.notify_account_appeal_outcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.safety_outcome_notifications_are_enabled()
     or new.status <> 'resolved'
     or new.resolution_code is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.resolution_code is not distinct from new.resolution_code
     and old.public_resolution_message is not distinct from new.public_resolution_message then
    return new;
  end if;

  insert into public.circle_notifications (
    user_id,
    actor_id,
    notification_type,
    account_appeal_id,
    created_at,
    read_at
  ) values (
    new.user_id,
    null,
    'safety_appeal_resolved',
    new.id,
    now(),
    null
  )
  on conflict (
    user_id,
    notification_type,
    account_appeal_id
  ) where notification_type = 'safety_appeal_resolved'
  do update set
    created_at = excluded.created_at,
    read_at = null;

  return new;
end;
$$;

revoke all on function public.notify_account_appeal_outcome() from public;

drop trigger if exists account_appeals_safety_outcome_notification
  on public.account_enforcement_appeals;
create trigger account_appeals_safety_outcome_notification
after insert or update on public.account_enforcement_appeals
for each row
execute function public.notify_account_appeal_outcome();

create or replace function public.notify_age_correction_outcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.safety_outcome_notifications_are_enabled()
     or new.status <> 'resolved'
     or new.resolution_code is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.resolution_code is not distinct from new.resolution_code
     and old.public_resolution_message is not distinct from new.public_resolution_message then
    return new;
  end if;

  insert into public.circle_notifications (
    user_id,
    actor_id,
    notification_type,
    age_correction_request_id,
    created_at,
    read_at
  ) values (
    new.user_id,
    null,
    'safety_age_correction_resolved',
    new.id,
    now(),
    null
  )
  on conflict (
    user_id,
    notification_type,
    age_correction_request_id
  ) where notification_type = 'safety_age_correction_resolved'
  do update set
    created_at = excluded.created_at,
    read_at = null;

  return new;
end;
$$;

revoke all on function public.notify_age_correction_outcome() from public;

drop trigger if exists age_corrections_safety_outcome_notification
  on public.age_eligibility_correction_requests;
create trigger age_corrections_safety_outcome_notification
after insert or update on public.age_eligibility_correction_requests
for each row
execute function public.notify_age_correction_outcome();

-- Backfill one unread broad notification for already-completed owner records.
insert into public.circle_notifications (
  user_id,
  actor_id,
  notification_type,
  safety_report_id,
  created_at
)
select
  report_row.reporter_id,
  null,
  'safety_report_resolved',
  report_row.id,
  coalesce(report_row.resolved_at, report_row.updated_at, report_row.created_at)
from public.user_reports report_row
where public.safety_outcome_notifications_are_enabled()
  and report_row.status in ('resolved', 'dismissed')
  and report_row.resolution_code is not null
on conflict do nothing;

insert into public.circle_notifications (
  user_id,
  actor_id,
  notification_type,
  account_appeal_id,
  created_at
)
select
  appeal_row.user_id,
  null,
  'safety_appeal_resolved',
  appeal_row.id,
  coalesce(appeal_row.resolved_at, appeal_row.updated_at, appeal_row.submitted_at)
from public.account_enforcement_appeals appeal_row
where public.safety_outcome_notifications_are_enabled()
  and appeal_row.status = 'resolved'
  and appeal_row.resolution_code is not null
on conflict do nothing;

insert into public.circle_notifications (
  user_id,
  actor_id,
  notification_type,
  age_correction_request_id,
  created_at
)
select
  request_row.user_id,
  null,
  'safety_age_correction_resolved',
  request_row.id,
  coalesce(request_row.resolved_at, request_row.updated_at, request_row.submitted_at)
from public.age_eligibility_correction_requests request_row
where public.safety_outcome_notifications_are_enabled()
  and request_row.status = 'resolved'
  and request_row.resolution_code is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Notification-center read model
-- ---------------------------------------------------------------------------

-- The return shape gains private target identifiers, so DROP is required.
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
  where notification.user_id = auth.uid()
    and notification.created_at < coalesce(p_before, now())
  order by notification.created_at desc
  limit greatest(1, least(coalesce(p_limit_count, 100), 300));
$$;

revoke all on function public.get_my_notifications(integer, timestamptz)
  from public;
grant execute on function public.get_my_notifications(integer, timestamptz)
  to authenticated;

commit;

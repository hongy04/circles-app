-- Circles Phase 3D — trusted Mutuals ranking
--
-- Expands Mutuals beyond contact overlap to legitimate social proximity from
-- confirmed shared events, shared Circles, mutual accepted connections, and
-- mutual contacts. Ordering is deterministic and relationship-based; posts,
-- likes, activity, popularity, and total connection counts never affect rank.

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
      'trusted_mutuals_ranking'
    )
  );

insert into public.app_feature_flags (flag_key, enabled, description)
values (
  'trusted_mutuals_ranking',
  true,
  'Orders Mutuals by confirmed shared events, shared Circles, mutual connections, and mutual contacts without engagement ranking.'
)
on conflict (flag_key) do nothing;

-- ---------------------------------------------------------------------------
-- Privacy-safe trusted-context candidate directory
-- ---------------------------------------------------------------------------

create or replace function public.trusted_mutual_candidates(
  limit_count integer default 50,
  offset_count integer default 0
)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  since timestamptz,
  preview_post_id uuid,
  preview_caption text,
  preview_url text,
  preview_media_type text,
  preview_created_at timestamptz,
  preview_media_count integer,
  has_mutual_contact boolean,
  mutual_connection_count integer,
  shared_circle_count integer,
  shared_event_count integer,
  latest_shared_event_title text,
  latest_shared_event_at timestamptz,
  primary_context text
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as id
  ),
  contact_context as (
    select
      edge_row.to_user as candidate_id,
      true as has_mutual_contact,
      max(edge_row.created_at) as latest_contact_at
    from public.contact_edges edge_row
    join viewer on edge_row.from_user = viewer.id
    group by edge_row.to_user
  ),
  mutual_connection_context as (
    select
      candidate_connection.user_id as candidate_id,
      count(distinct my_connection.other_user_id)::integer as mutual_connection_count
    from public.connections my_connection
    join viewer on my_connection.user_id = viewer.id
    join public.connections candidate_connection
      on candidate_connection.other_user_id = my_connection.other_user_id
     and candidate_connection.user_id <> viewer.id
    where my_connection.other_user_id <> candidate_connection.user_id
    group by candidate_connection.user_id
  ),
  shared_circle_context as (
    select
      other_membership.user_id as candidate_id,
      count(distinct my_membership.conversation_id)::integer as shared_circle_count,
      max(conversation_row.updated_at) as latest_circle_at
    from public.conversation_members my_membership
    join viewer on my_membership.user_id = viewer.id
    join public.conversation_members other_membership
      on other_membership.conversation_id = my_membership.conversation_id
     and other_membership.user_id <> viewer.id
    join public.conversations conversation_row
      on conversation_row.id = my_membership.conversation_id
    where conversation_row.kind = 'group'
       or conversation_row.circle_enabled
    group by other_membership.user_id
  ),
  shared_event_context as (
    select
      their_attendance.user_id as candidate_id,
      count(distinct my_attendance.event_id)::integer as shared_event_count,
      max(event_row.starts_at) as latest_shared_event_at,
      (array_agg(
        event_row.title
        order by event_row.starts_at desc, event_row.id desc
      ))[1] as latest_shared_event_title
    from public.confirmed_event_users my_attendance
    join viewer on my_attendance.user_id = viewer.id
    join public.confirmed_event_users their_attendance
      on their_attendance.event_id = my_attendance.event_id
     and their_attendance.user_id <> viewer.id
    join public.events event_row
      on event_row.id = my_attendance.event_id
     and event_row.attendance_reviewed_at is not null
     and event_row.status <> 'cancelled'
    group by their_attendance.user_id
  ),
  candidate_ids as (
    select candidate_id from contact_context
    union
    select candidate_id from mutual_connection_context
    union
    select candidate_id from shared_circle_context
    union
    select candidate_id from shared_event_context
  ),
  candidate_context as (
    select
      candidate_ids.candidate_id,
      coalesce(contact_context.has_mutual_contact, false) as has_mutual_contact,
      coalesce(mutual_connection_context.mutual_connection_count, 0) as mutual_connection_count,
      coalesce(shared_circle_context.shared_circle_count, 0) as shared_circle_count,
      coalesce(shared_event_context.shared_event_count, 0) as shared_event_count,
      shared_event_context.latest_shared_event_title,
      shared_event_context.latest_shared_event_at,
      case
        when shared_event_context.shared_event_count > 0 then 'shared_event'
        when shared_circle_context.shared_circle_count > 0 then 'shared_circle'
        when mutual_connection_context.mutual_connection_count > 0 then 'mutual_connection'
        else 'mutual_contact'
      end as primary_context,
      nullif(
        greatest(
          coalesce(shared_event_context.latest_shared_event_at, '-infinity'::timestamptz),
          coalesce(shared_circle_context.latest_circle_at, '-infinity'::timestamptz),
          coalesce(contact_context.latest_contact_at, '-infinity'::timestamptz)
        ),
        '-infinity'::timestamptz
      ) as latest_context_at
    from candidate_ids
    left join contact_context
      on contact_context.candidate_id = candidate_ids.candidate_id
    left join mutual_connection_context
      on mutual_connection_context.candidate_id = candidate_ids.candidate_id
    left join shared_circle_context
      on shared_circle_context.candidate_id = candidate_ids.candidate_id
    left join shared_event_context
      on shared_event_context.candidate_id = candidate_ids.candidate_id
  )
  select
    user_row.id,
    user_row.display_name,
    user_row.avatar_url,
    candidate_context.latest_context_at as since,
    preview_post.id as preview_post_id,
    preview_post.caption as preview_caption,
    coalesce(first_media.url, preview_post.image_url) as preview_url,
    case
      when preview_post.id is null then null
      else coalesce(
        first_media.media_type,
        case
          when preview_post.image_url ~* '\.(mp4|mov|m4v)(\?|$)' then 'video'
          else 'image'
        end
      )
    end as preview_media_type,
    preview_post.created_at as preview_created_at,
    case
      when preview_post.id is null then 0
      when coalesce(media_totals.media_count, 0) > 0 then media_totals.media_count
      when preview_post.image_url is not null then 1
      else 0
    end::integer as preview_media_count,
    candidate_context.has_mutual_contact,
    candidate_context.mutual_connection_count,
    candidate_context.shared_circle_count,
    candidate_context.shared_event_count,
    candidate_context.latest_shared_event_title,
    candidate_context.latest_shared_event_at,
    candidate_context.primary_context
  from candidate_context
  join viewer on true
  join public.users user_row
    on user_row.id = candidate_context.candidate_id
  left join public.posts preview_post
    on preview_post.id = user_row.mutual_preview_post_id
   and preview_post.user_id = user_row.id
  left join lateral (
    select media_row.url, media_row.media_type
    from public.post_media media_row
    where media_row.post_id = preview_post.id
    order by media_row.created_at asc, media_row.id asc
    limit 1
  ) first_media on true
  left join lateral (
    select count(*)::integer as media_count
    from public.post_media media_row
    where media_row.post_id = preview_post.id
  ) media_totals on true
  where viewer.id is not null
    and user_row.id <> viewer.id
    and not exists (
      select 1
      from public.connections connection_row
      where connection_row.user_id = viewer.id
        and connection_row.other_user_id = user_row.id
    )
    and not exists (
      select 1
      from public.connections connection_row
      where connection_row.user_id = user_row.id
        and connection_row.other_user_id = viewer.id
    )
    and not exists (
      select 1
      from public.connection_requests request_row
      where request_row.status = 'pending'
        and (
          (request_row.from_user = viewer.id and request_row.to_user = user_row.id)
          or
          (request_row.from_user = user_row.id and request_row.to_user = viewer.id)
        )
    )
  order by
    (candidate_context.shared_event_count > 0) desc,
    candidate_context.shared_event_count desc,
    candidate_context.latest_shared_event_at desc nulls last,
    (candidate_context.shared_circle_count > 0) desc,
    candidate_context.shared_circle_count desc,
    candidate_context.mutual_connection_count desc,
    candidate_context.has_mutual_contact desc,
    candidate_context.latest_context_at desc nulls last,
    lower(coalesce(user_row.display_name, '')) asc,
    user_row.id asc
  limit greatest(1, least(coalesce(limit_count, 50), 100))
  offset greatest(coalesce(offset_count, 0), 0);
$$;

revoke all on function public.trusted_mutual_candidates(integer, integer) from public;
grant execute on function public.trusted_mutual_candidates(integer, integer) to authenticated;

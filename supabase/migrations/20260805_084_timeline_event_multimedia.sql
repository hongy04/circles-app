-- Circles Step 29 — multimedia event memories in Circle Timeline
--
-- Extends the existing Circle event-list read model with a second, bounded
-- set of up to six ready event-gallery photo paths for the full Circle
-- Timeline. Plans & Events keeps using the three-photo scrapbook preview; the
-- Timeline can become a swipeable multimedia memory without fetching one
-- gallery per event or loading an unbounded photo history.

-- ---------------------------------------------------------------------------
-- Circle event list: preserve the existing contract and append memory fields.
-- ---------------------------------------------------------------------------

drop function if exists public.list_circle_events(uuid);

create function public.list_circle_events(p_conversation_id uuid)
returns table (
  event_id uuid,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  location_name text,
  event_status text,
  host_id uuid,
  host_name text,
  host_avatar text,
  viewer_rsvp_status text,
  attendee_count integer,
  going_count integer,
  maybe_count integer,
  not_going_count integer,
  pending_count integer,
  circle_count integer,
  guest_count integer,
  outside_guest_cap integer,
  attendance_reviewed_at timestamptz,
  completed_at timestamptz,
  attended_count integer,
  attendance_source text,
  appearance_key text,
  cover_storage_path text,
  cover_width integer,
  cover_height integer,
  cover_updated_at timestamptz,
  photo_count integer,
  preview_storage_paths jsonb,
  timeline_storage_paths jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due_event_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.conversations conversation_row
    join public.conversation_members member_row
      on member_row.conversation_id = conversation_row.id
     and member_row.user_id = auth.uid()
    where conversation_row.id = p_conversation_id
      and conversation_row.kind = 'group'
  ) then
    raise exception 'Circle not found or unavailable';
  end if;


  -- A normal visit to Plans & Events is enough to settle any memories whose
  -- next-morning threshold has arrived. This keeps automatic attendance truly
  -- automatic without requiring the host to open every old event detail page.
  for v_due_event_id in
    select distinct event_row.id
    from public.event_circles event_circle
    join public.events event_row on event_row.id = event_circle.event_id
    where event_circle.conversation_id = p_conversation_id
      and event_row.status <> 'cancelled'
      and event_row.attendance_reviewed_at is null
      and coalesce(event_row.ends_at, event_row.starts_at) < now()
  loop
    begin
      perform public.ensure_event_attendance_finalized(v_due_event_id);
    exception
      when others then
        -- A single legacy/malformed event should never prevent the rest of the
        -- Circle's event list from opening. Event Detail can retry it later.
        null;
    end;
  end loop;

  return query
  with linked_events as (
    select distinct event_circle.event_id
    from public.event_circles event_circle
    where event_circle.conversation_id = p_conversation_id
  ),
  eligible_members as (
    select distinct
      event_circle.event_id,
      member_row.user_id
    from public.event_circles event_circle
    join public.conversation_members member_row
      on member_row.conversation_id = event_circle.conversation_id
    join linked_events linked on linked.event_id = event_circle.event_id
  ),
  response_counts as (
    select
      eligible.event_id,
      count(*)::integer as attendee_count,
      count(*) filter (where rsvp.status = 'going')::integer as going_count,
      count(*) filter (where rsvp.status = 'maybe')::integer as maybe_count,
      count(*) filter (where rsvp.status = 'not_going')::integer as not_going_count,
      count(*) filter (where rsvp.status is null)::integer as pending_count
    from eligible_members eligible
    left join public.event_rsvps rsvp
      on rsvp.event_id = eligible.event_id
     and rsvp.user_id = eligible.user_id
    group by eligible.event_id
  ),
  circle_counts as (
    select
      event_circle.event_id,
      count(*)::integer as circle_count
    from public.event_circles event_circle
    join linked_events linked on linked.event_id = event_circle.event_id
    group by event_circle.event_id
  ),
  attendance_counts as (
    select
      attendance_row.event_id,
      count(*) filter (where attendance_row.attended)::integer as attended_count
    from public.event_attendance attendance_row
    join linked_events linked on linked.event_id = attendance_row.event_id
    group by attendance_row.event_id
  ),
  guest_counts as (
    select
      guest_row.event_id,
      count(*)::integer as guest_count
    from public.event_guests guest_row
    join linked_events linked on linked.event_id = guest_row.event_id
    group by guest_row.event_id
  ),
  photo_ranked as (
    select
      photo_row.event_id,
      photo_row.storage_path,
      row_number() over (
        partition by photo_row.event_id
        order by photo_row.ready_at desc nulls last, photo_row.id desc
      ) as photo_rank,
      count(*) over (partition by photo_row.event_id)::integer as photo_count
    from public.event_photos photo_row
    join linked_events linked on linked.event_id = photo_row.event_id
    where photo_row.status = 'ready'
  ),
  photo_counts as (
    select
      ranked.event_id,
      max(ranked.photo_count)::integer as photo_count,
      coalesce(
        jsonb_agg(ranked.storage_path order by ranked.photo_rank)
          filter (where ranked.photo_rank <= 3),
        '[]'::jsonb
      ) as preview_storage_paths,
      coalesce(
        jsonb_agg(ranked.storage_path order by ranked.photo_rank)
          filter (where ranked.photo_rank <= 6),
        '[]'::jsonb
      ) as timeline_storage_paths
    from photo_ranked ranked
    group by ranked.event_id
  )
  select
    event_row.id,
    event_row.title,
    event_row.description,
    event_row.starts_at,
    event_row.ends_at,
    event_row.location_name,
    event_row.status,
    host_user.id,
    coalesce(host_user.display_name, 'Circle member'),
    host_user.avatar_url,
    coalesce(viewer_rsvp.status, 'pending'),
    coalesce(counts.attendee_count, 0),
    coalesce(counts.going_count, 0),
    coalesce(counts.maybe_count, 0),
    coalesce(counts.not_going_count, 0),
    coalesce(counts.pending_count, 0),
    coalesce(circle_totals.circle_count, 1),
    coalesce(guest_totals.guest_count, 0),
    coalesce(event_row.outside_guest_cap, 0),
    event_row.attendance_reviewed_at,
    event_row.completed_at,
    coalesce(attendance_totals.attended_count, 0),
    event_row.attendance_source,
    coalesce(event_row.appearance_key, 'circle'),
    event_row.cover_storage_path,
    event_row.cover_width,
    event_row.cover_height,
    event_row.cover_updated_at,
    coalesce(photo_totals.photo_count, 0),
    coalesce(photo_totals.preview_storage_paths, '[]'::jsonb),
    coalesce(photo_totals.timeline_storage_paths, '[]'::jsonb)
  from linked_events linked
  join public.events event_row on event_row.id = linked.event_id
  left join public.users host_user on host_user.id = event_row.host_id
  left join public.event_rsvps viewer_rsvp
    on viewer_rsvp.event_id = event_row.id
   and viewer_rsvp.user_id = auth.uid()
  left join response_counts counts on counts.event_id = event_row.id
  left join circle_counts circle_totals on circle_totals.event_id = event_row.id
  left join attendance_counts attendance_totals on attendance_totals.event_id = event_row.id
  left join guest_counts guest_totals on guest_totals.event_id = event_row.id
  left join photo_counts photo_totals on photo_totals.event_id = event_row.id
  order by
    case
      when event_row.status <> 'completed'
       and coalesce(event_row.ends_at, event_row.starts_at) >= now() then 0
      else 1
    end,
    case
      when event_row.status <> 'completed'
       and coalesce(event_row.ends_at, event_row.starts_at) >= now()
        then event_row.starts_at
    end asc,
    case
      when event_row.status = 'completed'
        or coalesce(event_row.ends_at, event_row.starts_at) < now()
        then coalesce(event_row.completed_at, event_row.ends_at, event_row.starts_at)
    end desc;
end;
$$;

revoke all on function public.list_circle_events(uuid) from public;
grant execute on function public.list_circle_events(uuid) to authenticated;

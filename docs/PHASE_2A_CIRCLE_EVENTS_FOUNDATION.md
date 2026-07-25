# Circles Phase 2A — Private Circle Event Foundation

## Purpose

Phase 1 established the private social graph, trusted discovery, invitation paths, and launch measurement. Phase 2 begins the product’s real-world usefulness loop. This checkpoint adds the smallest complete event experience that is useful inside an existing Circle:

```text
Circle member creates an event
→ current Circle members see the details
→ each member answers Going, Maybe, or Can’t go
→ the Circle has one shared source of truth for the plan
```

It does not yet add outside guests, web RSVP, polls, plus-ones, multi-Circle creation, event photos, or post-event discovery.

## Product behavior

A new **Plans & Events** row appears on the Circle profile. From there, a current member can:

- view upcoming and past events attached to the Circle;
- create an event with a title, date, start/end time, location, and optional description;
- open the private event detail page;
- respond Going, Maybe, or Can’t go;
- see the current RSVP state of every current Circle member.

The creator begins as **Going** and is shown as the host.

## Privacy boundary

The database does not expose direct event-table access to the mobile client. All reads and writes go through security-definer RPCs that verify current membership in at least one linked Circle.

This means:

- a user cannot open an event merely by learning its UUID;
- leaving or being removed from every linked Circle removes event access;
- only current members appear in the attendee list;
- no event is public in this checkpoint;
- an RSVP does not grant access to anyone outside the Circle.

## Future-ready schema

The Phase 2A client creates an event from one Circle, but the database uses an `event_circles` linking table rather than placing one `conversation_id` directly on the event. This preserves the architecture’s future requirement that one event may combine multiple Circles without a destructive schema rewrite.

Tables:

- `events` — event identity, host, schedule, location, description, and lifecycle status;
- `event_circles` — one or more linked private Circles;
- `event_rsvps` — explicit app-user responses.

No-response state is calculated as **Pending** rather than stored as an affirmative RSVP.

## Feature control and analytics

Migration `20260725_023_circle_events_foundation.sql` adds the `circle_events` feature flag.

To pause the event surface:

```sql
update public.app_feature_flags
set enabled = false, updated_at = now()
where flag_key = 'circle_events';
```

The privacy-safe analytics allowlist gains:

- `event_created`
- `event_opened`
- `event_rsvp_updated`

Only controlled properties are recorded: surface, RSVP state, and whether optional location/description fields were used. Event titles, descriptions, locations, event IDs, Circle IDs, and profile IDs are not stored in analytics.

## Manual test

1. Run migration 023 in Supabase.
2. Restart Expo with a cleared cache.
3. Open an existing group Circle and tap **Plans & Events**.
4. Create an event for a future date/time.
5. Confirm the creator appears as Host and Going.
6. Open the same Circle from a second member account.
7. Confirm the second member can view the event but cannot see it from an unrelated account.
8. Change the second member’s RSVP through Going, Maybe, and Can’t go.
9. Confirm the counts and attendee row update after each response.
10. Run:

```sql
select event_name, properties, created_at
from public.app_analytics_events
where event_name like 'event_%'
order by created_at desc
limit 30;
```

Confirm event actions appear without titles, locations, user IDs, event IDs, or Circle IDs in `properties`.

## Explicitly deferred

The following remain later Phase 2 slices:

- availability polling before finalizing a date;
- inviting multiple Circles and selected connections;
- guest caps and plus-one permissions;
- outside-guest invitation and web RSVP;
- host attendance review;
- event photo galleries and completed-event Timeline memories;
- post-event trusted discovery.

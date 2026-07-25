# Phase 2B — Event Availability Polls

## Purpose

Phase 2A established private Circle events and app-user RSVPs. Phase 2B adds the step that comes before a finalized event when the Circle knows what it wants to do but has not agreed on a date.

This implementation stays within the Circles product architecture:

- availability polling happens only inside an existing private Circle;
- current Circle membership is checked on every read and write;
- members may choose every option that works, including none;
- one member's availability is never treated as a commitment to attend;
- only the poll host can finalize a date;
- finalizing creates a normal private Circle event;
- after finalization, the host is Going and all other members still RSVP for themselves.

Outside guests, public web access, plus-ones, multi-Circle events, guest caps, and attendance review remain intentionally deferred.

## User flow

1. Open a group Circle.
2. Open **Plans & Events**.
3. Tap **Poll Dates**.
4. Enter a title and optionally a location and description.
5. Add between two and six possible times.
6. Circle members open the poll and select every option that works.
7. A member may save zero selected options to communicate that none work.
8. The poll host chooses one proposed time.
9. Circles creates the finalized private event and opens its normal RSVP screen.

## Database additions

Migration `20260725_024_event_availability_polls.sql` adds:

- `event_availability_polls`
- `event_availability_options`
- `event_availability_responses`
- `event_availability_votes`

The response table is separate from votes so the app can distinguish:

- a member who has not answered; and
- a member who answered that none of the proposed times work.

All four tables have RLS enabled and no direct client policies. Access is mediated through security-definer RPCs that verify current Circle membership.

## RPCs

- `create_event_availability_poll`
- `list_circle_event_polls`
- `get_event_availability_poll`
- `respond_to_event_availability_poll`
- `finalize_event_availability_poll`
- `event_poll_viewer_can_access`

## Feature control

Remote flag:

```text
event_availability_polls
```

Disabling this flag hides the poll creation path while leaving normal Circle events and RSVPs available.

## Analytics

Privacy-safe aggregate actions:

- `event_poll_created`
- `event_poll_opened`
- `event_poll_response_updated`
- `event_poll_finalized`

Allowed poll properties are limited to controlled aggregate values such as option count, selected count, whether none were available, and poll status. The analytics system does not store poll titles, descriptions, dates, locations, user IDs, Circle IDs, poll IDs, option IDs, or event IDs in properties.

## Test checklist

1. Run Migration 024 in Supabase.
2. Open **Plans & Events** in a group Circle.
3. Confirm **Poll Dates** appears.
4. Create a poll with at least two different future times.
5. Confirm the poll appears above normal events.
6. On a second Circle-member account, select multiple times and save.
7. Confirm response totals and names update.
8. Save zero selected options and confirm the member shows **None work**.
9. Confirm a non-member cannot read or respond to the poll.
10. As a non-host member, confirm no finalize action appears.
11. As the host, choose a date.
12. Confirm a normal Circle event is created with the selected time.
13. Confirm availability selections were not converted into RSVPs.
14. Confirm the finalized poll links to the new event.

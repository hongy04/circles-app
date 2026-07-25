# Phase 2C — Multi-Circle Events

## Purpose

Allow one private gathering to bring together multiple existing group Circles
without opening the event to strangers or weakening profile privacy.

This is the next bounded Phase 2 step after private Circle events and date
polling. Outside guests, public web RSVP pages, plus-ones, and guest identity
remain intentionally deferred.

## Product behavior

- Event creation begins from one Circle, which remains locked into the event.
- The creator may add any other group Circle in which they are currently a
  member.
- Every current member of every selected Circle may view the event and RSVP.
- A person who belongs to more than one selected Circle appears only once in
  the attendee list and counts.
- The same event appears in the Plans & Events list of every linked Circle.
- Event details name each Circle invited to the gathering.
- The event is not exposed to connections, non-members, or outside guests.
- The host is automatically marked Going. Everyone else begins with no RSVP.

## Privacy and authorization

The client sends Circle IDs, but the database independently verifies that:

1. Every selected ID belongs to an existing group Circle.
2. The creator is a current member of every selected Circle.
3. Event access comes only from current membership in at least one linked
   Circle.
4. RSVP eligibility is the deduplicated union of current linked-Circle
   memberships.

Analytics store only an aggregate `circle_count`. Circle IDs, Circle names,
event IDs, titles, locations, descriptions, and attendee identities are not
written into analytics properties.

## Feature control

`multi_circle_events` controls the additional-Circle selector independently
from normal one-Circle events. Turning it off leaves existing multi-Circle
events accessible to their current members and leaves one-Circle event creation
working.

## Files

- `src/screens/conversations/CreateEventScreen.js`
- `src/screens/conversations/CircleEventsScreen.js`
- `src/screens/conversations/EventDetailScreen.js`
- `src/services/eventService.js`
- `src/services/featureFlagService.js`
- `src/services/analyticsService.js`
- `supabase/migrations/20260725_025_multi_circle_events.sql`

## Test path

1. Use an account that belongs to at least two group Circles.
2. Open Plans & Events from Circle A and choose Create Event.
3. Confirm Circle A is selected and locked.
4. Select Circle B and create the event.
5. Confirm the event details show both Circle names.
6. Confirm the event appears inside both Circle A and Circle B.
7. Open the event as a member who belongs only to Circle B and submit an RSVP.
8. Confirm overlapping members appear only once in responses.
9. Confirm an account outside both Circles cannot open the event.
10. Confirm `event_created` records `circle_count: 2` without IDs or names.

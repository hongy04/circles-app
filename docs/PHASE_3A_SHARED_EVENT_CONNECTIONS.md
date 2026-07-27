# Phase 3A — Shared-event context and post-event connections

## Purpose

Turn reviewed real-world attendance into limited social context without granting automatic profile access or automatic connections.

## Implemented boundary

- A completed event exposes a **People from this event** surface.
- The list uses explicit host-reviewed attendance, not RSVP guesses.
- Confirmed app attendees can open one another's pre-connection profile shell.
- Cross-Circle attendees become discoverable even when they did not previously share a Circle, contact edge, or mutual connection.
- A connection request remains an ordinary pending request requiring acceptance.
- Outside guests remain name-only event history entries until a later guest-account claim phase.
- Invited people who were not confirmed as attended may see the historical attendee list, but cannot use the event as connection eligibility.

## Privacy rules

The shared-event list returns only:

- Display name
- Profile photo
- Host label
- Connection-request state
- Aggregate shared-event count

It does not expose private posts, usernames, bios, connection totals, Circle names, event IDs in analytics, or guest identities beyond the existing event history.

The pre-connection profile may additionally show:

- `Met at <event title>`
- Aggregate shared-event count
- The user's deliberately selected Mutuals preview

Everything else stays private until acceptance.

## Provenance

Requests created from this surface store a private `source_event_id` on the pending request. This is not shown publicly and exists so future product-health analysis can distinguish legitimate request context without storing event identifiers in analytics.

## Deferred

- Non-user guest account claiming
- Automatic Mutuals ranking by social proximity
- “Let’s do this again” and organizer re-invite signals
- Public or engagement-based attendee ranking

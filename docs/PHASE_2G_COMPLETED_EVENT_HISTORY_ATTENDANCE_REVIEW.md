# Phase 2G — Completed Event History and Attendance Review

## Goal

Turn past events into trustworthy shared history without forcing a check-in ritual.

## Product behavior

- Plans & Events is divided into Upcoming events and Past events.
- A past event remains visible even when the host never reviews attendance.
- After the event starts, the host sees a quiet **Who made it?** prompt.
- Going responses are selected as the initial suggestion only.
- The host may add or remove any invited Circle member or named outside guest from the attended set.
- Saving the review marks the event completed and stores attendance separately from RSVP data.
- The host may reopen and correct the attendance review later.
- Other invited Circle members see only the completed attendance result, not edit controls.
- Confirmed attendees may contribute event photos even when their original RSVP was not Going.

## Privacy and evidence boundary

RSVP and attendance are distinct:

- RSVP records what a person said before the gathering.
- Attendance review records the host’s explicit post-event confirmation.
- Saving attendance does not rewrite the original RSVP.
- No location tracking, QR check-in, or background presence detection is used.
- Attendance records remain private to members who can already access the event.

This explicit distinction prepares Phase 3 shared-event context without treating an RSVP as unquestioned proof that two people met.

## Database changes

Migration 034 adds:

- `events.completed_at`
- `events.attendance_reviewed_at`
- `event_attendance`
- `get_event_attendance_summary`
- `get_event_attendance_review`
- `save_event_attendance_review`
- `event_history` feature flag
- Privacy-safe attendance analytics
- Completed-history fields on `list_circle_events`

## Analytics

Allowed events:

- `event_attendance_review_opened`
- `event_attendance_review_saved`

Only aggregate counts and controlled action labels are stored. Event IDs, Circle IDs, names, RSVP identities, and attendee identities are not included in analytics properties.

## Deferred

- Automatic promotion of completed events into Circle Timeline
- Guest attendance self-confirmation
- Attendance disputes or correction requests
- Shared-event connection eligibility
- Claiming attendance after joining Circles
- Individual event invitations outside a Circle

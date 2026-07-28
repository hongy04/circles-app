# Phase 3E — Private Repeat-Event Signals

## Purpose

Let confirmed attendees privately tell the original host that they would join a similar gathering again, then give the host a low-pressure way to start a fresh event from the completed gathering.

This is a relationship and planning signal, not an engagement score. It does not rank events or people, notify other attendees, or create a new invitation automatically.

## Attendee experience

After the host reviews attendance, a confirmed Circles user may toggle:

> I’d join again

The response is visible only to the original host. Other attendees do not see the count, names, or whether a specific person responded.

The signal is available from:

- The authenticated event detail screen for Circle members
- People from this event for a claimed former guest

Users who were invited but not confirmed as attended cannot send the signal.

## Host experience

The original host sees:

- The aggregate number of confirmed attendees who opted in
- The display names and avatars of those attendees
- A Plan another action

Plan another opens a new-event form with editable starting values copied from the previous event:

- Title
- Description
- Location
- Selected Circles, when the host still belongs to them
- Outside-guest limit and permission rules

The following are never copied:

- RSVP states
- Attendance records
- Outside-guest identities
- Pending guest invitations
- Guest invitation tokens
- Event photos
- Connection requests

The host must choose a new date and explicitly create the new event.

## Privacy and safety rules

- Only canonical confirmed attendees may create a signal.
- Claimed guest attendance counts only after the guest account is linked to a reviewed attendance record.
- Only the original event host may see identities or initiate Plan another from this surface.
- Signals are not public and are not exposed to other attendees.
- Signals do not affect Mutuals ranking, feed ordering, profile counts, or popularity metrics.
- Removing a signal deletes the attendee’s active repeat preference for that event.
- Direct table access is disabled; security-definer RPCs enforce attendance and host checks.

## Feature flag

`event_repeat_signals`

Disabling the flag hides the client surface and blocks the related RPCs.

## Analytics

Privacy-safe first-party events:

- `event_repeat_signal_updated`
- `event_repeat_plan_started`

Properties are limited to controlled action values and an aggregate interested count for the host planning action. Event IDs, titles, Circle IDs, user IDs, and attendee names are not stored in analytics properties.

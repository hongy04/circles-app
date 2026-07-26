# Phase 2E refinement — Guest attendee visibility

## Purpose

Give a person holding a valid outside-guest invitation useful social context before they RSVP, without granting access to private Circles profiles or group data.

## Guest experience

The invitation page now includes **Who’s going**.

When the host enables attendee visibility, the page shows only people marked **Going**:

- Circles members: display name and profile photo
- Event host: display name, profile photo, and a Host label
- Outside guests: display name and the Circles member who invited them
- Plus-ones: display name, a Plus-one label, and the Circles member who invited them

Rows are informational and non-tappable. The public response never returns user IDs, usernames, Circle names, bios, profile links, posts, messages, connections, or RSVP states other than Going.

When the host disables attendee visibility, the invitation page shows only the total number of people Going.

## Consent copy

When an outside guest selects **Going**, the invitation page explains whether their name will currently appear to other people holding valid guest invitations. Their Circles profile remains private.

## Host control

Guest Settings now includes:

> Show who’s going to guests

The setting defaults to on. Only the event host can change it.

## Database boundary

Migration 032 adds:

- `events.show_attendee_list_to_guests`
- Host-only attendee-visibility read/update RPCs
- A token-protected public attendee-list RPC

A valid, unexpired, non-revoked guest invitation token is required for the public list. Only Going attendees are returned.

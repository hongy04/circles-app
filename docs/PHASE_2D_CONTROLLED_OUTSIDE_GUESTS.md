# Phase 2D — Controlled Outside Guests

**Status:** Implemented; requires Migration 026 and device testing  
**Scope:** Private app-side guest controls before public web invitations

## Purpose

Phase 2D lets a host include named people who are outside the selected Circles without granting those people profile, Circle, feed, or message access.

This is intentionally not the public guest web experience yet. It creates the controlled guest model and host boundaries that future invitation links and web RSVPs will use.

## Included

- Host-set outside guest limit from 0–50
- Host-only or member-enabled guest adding
- Optional plus-ones
- One-layer invitation chain: only authenticated event members may add a named guest
- Named guest entries with Invited, Going, Maybe, or Can’t go state
- Host or original inviter may update or remove a guest
- Host may change guest settings after event creation
- Guest and plus-one entries count against the same limit
- Privacy-safe analytics
- Independent `event_outside_guests` feature flag

## Privacy boundary

A named outside guest:

- Is visible only inside the private event
- Is not a Circles profile
- Cannot open private Circles or profiles
- Cannot read messages or posts
- Cannot invite another person
- Does not become a connection
- Does not gain romantic-feature eligibility

Only the host and the authenticated member who added a guest may update or remove that entry.

## Deferred

- Public HTTPS event invitation page
- Guest-owned RSVP links
- SMS or share-sheet guest invitation delivery
- Guest photo upload or event gallery access
- Claiming an attendance entry after account creation
- Host attendance review

## Test checklist

1. Create an event with outside guests enabled and a limit of 2.
2. Confirm the host can add a named guest.
3. Confirm a plus-one can be added only when plus-ones are enabled.
4. Confirm the third guest is blocked when the limit is reached.
5. Update a guest between Invited, Going, Maybe, and Can’t go.
6. Remove a guest and confirm the open slot returns.
7. Change guest settings as the host.
8. Confirm a non-host cannot open Guest Settings.
9. With member invitations off, confirm another Circle member cannot add a guest.
10. Turn member invitations on and confirm that member can add one.
11. Confirm that member may manage only the guest they added, while the host may manage every guest.
12. Confirm an account outside all selected Circles still cannot open the event.

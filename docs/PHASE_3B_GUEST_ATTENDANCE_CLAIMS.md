# Phase 3B — Guest Attendance Claims

## Purpose

Let a former outside guest join Circles and claim the reviewed event attendance that already belongs to their private guest invitation.

The claim creates **shared-event context only**. It does not:

- join the guest to any invited Circle;
- expose private profiles, posts, messages, or Circle details;
- create a connection automatically;
- treat an RSVP as proof of attendance.

## Lifecycle

```text
Private guest invitation
→ guest enters their own name and RSVP
→ gathering happens
→ host reviews Who made it?
→ confirmed guest opens the same private link
→ guest signs in or creates a Circles account
→ reviewed guest attendance is linked to that account
→ People from this event becomes available
→ ordinary connection requests still require acceptance
```

## Eligibility

A claim succeeds only when all of the following are true:

1. The bearer token is current, unrevoked, and unexpired.
2. The invitation has already been claimed with a guest name and RSVP.
3. The event is not cancelled.
4. The host has completed attendance review.
5. That specific guest record was marked attended.
6. The guest record is not linked to another Circles account.
7. The account has not claimed another guest identity for the same event.
8. The account does not already have member attendance for the event.

## Data model

`event_guests` gains:

- `claimed_user_id`
- `claimed_account_at`

The original guest row remains intact so the event retains the guest name, guest type, inviter, RSVP, and reviewed attendance history.

`confirmed_event_users` is a private database view that combines:

- reviewed app-member attendance; and
- reviewed outside-guest attendance linked to a Circles account.

This avoids duplicating attendance counts while allowing claimed guests to use the same shared-event profile and connection rules as other confirmed attendees.

## Invitation-page behavior

Before the event:

- guests continue to RSVP without an account;
- the page explains that attendance can be claimed after host review.

After the event is completed:

- RSVP editing is locked;
- the page shows the reviewed attendee list when the host permits it;
- a confirmed guest sees **Join Circles and keep this event**;
- a guest not marked attended receives no shared-event access;
- an already-linked invitation cannot be claimed by another account.

## Privacy and safety

- Claim preview RPCs return no event, guest, user, Circle, or invitation IDs.
- The authenticated claim RPC returns the event ID only after eligibility is verified.
- Shared-event profile shells remain limited until a connection request is accepted.
- Claiming never creates a connection or direct conversation.
- Analytics record only the controlled action and whether the claim was already linked; no token, guest name, event title, or identifiers are recorded.

## Feature flag

`guest_attendance_claims`

## Analytics

`event_guest_account_claimed`

Allowed properties:

- `surface = event_guest_invitation`
- `action = claim`
- `already_claimed = true | false`

# Phase 2E refinement — Claimable guest invitations

## Product correction

The first Phase 2E implementation required a Circle member to create a named guest record before sharing an RSVP link. That made the invitation flow redundant and assigned a name and response before the recipient had acted.

The revised primary flow is:

```text
Inviter chooses Guest or My plus-one
→ Circles reserves one guest spot
→ Circles creates and shares a private link
→ recipient enters their own name
→ recipient chooses Going, Maybe, or Can’t go
→ the invitation becomes a real event guest
```

## User experience

The former **Add Guest** screen is now **Invite Guest**.

Primary path:

- Choose **Guest** or **My plus-one**
- Tap **Create & Share Invite**
- No guest name or response is entered by the inviter

Fallback path:

- Tap **Add manually instead**
- Enter a name and known response
- Use this only when the person responds outside Circles or will not open the link

## Invitation-slot behavior

Each generated link represents one reserved guest spot.

Before the recipient responds, the event displays:

```text
Guest invitation
Waiting for response · invited by Eric
```

The host or original inviter may:

- Re-share it, which rotates and invalidates the older bearer token
- Revoke it, which releases the reserved guest spot

After the recipient submits their name and RSVP, the pending invitation disappears and a normal guest entry appears.

## Guest limits

The guest cap counts both:

- Claimed/manual guests
- Active unclaimed invitation slots

Expired or revoked unclaimed invitations no longer reserve a spot. A host cannot lower the cap below the number of reserved spots or disable plus-ones while a claimed or pending plus-one exists.

## Privacy and consent

- The recipient chooses their own displayed name and response.
- The link exposes only the event information needed to RSVP.
- It does not expose Circle names, profiles, posts, messages, connections, or member identifiers.
- One link claims one guest slot and does not grant onward invitation rights.
- Only a token hash is stored in Supabase.
- Existing Phase 2E named-guest links remain supported for compatibility, but the current UI no longer creates them as the primary flow.

## Database changes

Migration `20260725_031_claimable_guest_invites.sql` adds:

- `event_guest_invitations`
- Create, rotate, list, and revoke invitation RPCs
- A public preview that supports claimable and legacy links
- A three-argument RSVP RPC accepting token, guest-entered name, and response
- Guest-cap enforcement that includes pending invitation slots

## Validation checklist

1. Create an invitation and confirm it appears as Waiting for response.
2. Confirm the reserved-spots count increases immediately.
3. Open the link while signed out.
4. Enter a name and select an RSVP.
5. Refresh the event and confirm the pending invitation becomes a named guest.
6. Reopen the same link and update the name or RSVP.
7. Create another invitation, re-share it, and confirm the older link stops working.
8. Revoke a pending invitation and confirm its link stops working and its guest spot is released.
9. Confirm manual entry still works.
10. Confirm the guest cap includes both pending invitations and claimed/manual guests.

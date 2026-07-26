# Phase 2E — Guest Invitation Links and Account-Free RSVP

## Goal

Let a Circle member create one private, reserved guest invitation and let the recipient enter their own name and RSVP without installing Circles or creating an account.

## Included

- The host or an eligible Circle member chooses **Guest** or **My plus-one**.
- Tapping **Create & Share Invite** reserves one spot under the event’s guest cap.
- A pending invitation appears in the private event as Waiting for response.
- The host or original inviter may re-share or revoke a pending invitation.
- Re-sharing creates a fresh 256-bit bearer token and invalidates the older link.
- Only a SHA-256 hash of the token is stored.
- The recipient enters their own name and chooses Going, Maybe, or Can’t go.
- Submitting converts the reserved invitation into a normal named event guest.
- The same link can later update that guest’s name or RSVP while valid.
- Manual name/response entry remains available as a fallback.
- The public page shows only the event title, host, inviter, date/time, permitted location, description, invitation type, name field, and RSVP controls.
- The recipient never receives access to Circle names, Circle membership, private profiles, posts, messages, connections, or the authenticated event screen.
- Cancelled/completed events, revoked invitations, and expired links cannot be opened or updated.
- A remote `event_guest_web_rsvp` flag can stop new links and public RSVP.

## Guest-cap behavior

Both of these reserve capacity:

- Active pending invitation slots
- Claimed or manually entered guests

An expired or revoked pending invitation releases its spot. A claimed invitation is counted through its resulting guest row rather than twice.

## Compatibility

Previously generated Phase 2E links tied directly to named guest rows remain readable and updateable. The current UI no longer uses that as the primary invitation flow.

## Intentionally deferred

- Event photo gallery on the guest page
- Public attendee names/photos
- Guest-to-user account claiming
- Host attendance confirmation
- Completed-event history and reconnection
- Production web deployment and universal-link configuration

## Link configuration

For production, set:

```text
EXPO_PUBLIC_EVENT_GUEST_BASE_URL=https://your-domain.example/event-guest
```

The final URL becomes:

```text
https://your-domain.example/event-guest/<token>
```

If this variable is absent, the app derives a URL from `EXPO_PUBLIC_INVITE_BASE_URL` when possible, otherwise it uses Expo Linking for development.

## Privacy boundary

The public RPC returns no event ID, guest ID, invitation ID, user ID, Circle ID, Circle name, or attendee list. Analytics contain only controlled booleans and states; tokens, names, titles, descriptions, locations, and IDs are excluded.

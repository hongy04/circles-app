# Phase 6A Refinement — Two-Person Circle Lifecycle

## Purpose

This refinement separates a persistent shared history from current permission to
open it. A two-person Circle survives the end of Mutual Focus, but its intimate
content is locked until both people rebuild the relationship progression and
mutually choose to reopen it.

## Locked product decisions

- Two-person Circles do not show People counts, People screens, roles, or invite
  controls.
- Activation automatically pins the conversation for both members.
- Both members may customize the shared name and profile photo while the Circle
  is open.
- Each member may leave one private silent message for the other person. Saving
  or changing it does not send a notification.
- Ending Mutual Focus locks the shared Circle instead of deleting it.
- Locked posts, Timeline media, shared identity, and silent messages remain
  preserved but inaccessible.
- Reopening requires fresh Mutual Interest, fresh Mutual Focus, and a new
  proposal accepted by the other person.
- A reopened Circle uses the original shared profile and history; it does not
  create a duplicate Circle.
- Direct messages and media exchanged while the Circle is locked do not later
  enter the Circle Timeline.
- Removing a connection is separate from ending Focus. It removes profile,
  Feed, and direct-message access while preserving and locking an existing
  shared Circle.
- Reconnecting restores the ordinary connection only. The preserved Circle
  remains locked until the full mutual reopening flow is completed.

## State model

```text
Mutual Focus
→ proposal accepted
→ Circle open and automatically pinned
→ Focus ends / romance closes / connection removed
→ Circle locked, history preserved
→ fresh Mutual Interest
→ fresh Mutual Focus
→ “Open Our Circle again?”
→ proposal accepted
→ original Circle reopened
```

## Provenance protection

`two_person_circle_access_periods` records each interval during which the shared
Circle was open. Circle Timeline media is drawn only from messages sent during
those intervals. Ordinary direct messages exchanged before activation or while
the Circle is locked stay outside the shared Timeline.

## Profile customization

A group Circle continues to use a shared bio. A two-person Circle instead uses:

- Shared name
- Shared profile photo
- One silent message authored by each member and shown only to the other member

## Disconnection behavior

Removing a connection:

- Deletes accepted-connection rows and pending requests for the pair
- Clears romantic state
- Locks the two-person Circle
- Removes conversation membership so neither person can read or send messages
- Preserves the direct conversation, messages, posts, and Circle history in the
  database
- Allows a later accepted reconnection to reuse the same direct conversation
  while keeping the Circle locked

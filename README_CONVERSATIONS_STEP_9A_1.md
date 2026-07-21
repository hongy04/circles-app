# Circles Step 9A.1 — iMessage Inbox + Pinned Circles

This checkpoint restores the iMessage-inspired Circles inbox while keeping the
real private-conversation and invitation architecture from Step 9A.

## What changed

### Pinned Circles

Pinned conversations now appear as large circular avatars at the top of the
inbox under **Your Circles**.

- Tap a circle to open its private conversation.
- Press and hold a circle to unpin it.
- Press and hold a normal message row to pin it.
- Unread badges and group badges remain visible on pinned circles.

### Group behavior

Private groups begin pinned for each accepted member because creating or joining
a group is an intentional decision to form a Circle.

- The creator's group is pinned immediately.
- Invitees receive no access while an invitation is pending.
- After an invitee accepts, the group is pinned for that member.
- Each person may later unpin the group without affecting anyone else.
- Existing Step 9A groups are pinned once by the migration.

### iMessage-inspired list

Unpinned direct messages and unpinned groups return to a clean white message
list with:

- circular avatars;
- name, latest message, and time;
- unread counts;
- subtle separators rather than card containers.

The private invitation cards remain separate because an invitation is not yet a
conversation membership.

## Apply

Copy this package into the project root and allow Windows to replace or merge
files.

## Migration

Run:

`supabase/migrations/20260721_010_default_pin_groups.sql`

No existing messages or memberships are deleted.

## Test

1. Open Circles and confirm connected DMs appear in the normal message list.
2. Long-press Alex and confirm Alex moves into **Your Circles**.
3. Long-press Alex's pinned circle and confirm it returns to Messages.
4. Create a group with Alex and Sam.
5. Confirm the group is immediately pinned for the creator.
6. Switch to Alex and accept the invitation.
7. Confirm the group appears pinned for Alex.
8. Switch to Sam before accepting and confirm the group is only an invitation.
9. Accept as Sam and confirm it becomes a pinned circle.
10. Unpin the group as Sam and confirm it remains pinned for Hongy and Alex.

## Commit

```powershell
git status
git add App.js src supabase/migrations README_CONVERSATIONS_STEP_9A_1.md
git commit -m "Restore iMessage inbox and pin groups"
git push
```

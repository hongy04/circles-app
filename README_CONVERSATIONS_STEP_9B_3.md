# Circles Step 9B.3 — Direct Chats vs. Circle Groups

This checkpoint implements the locked product rule:

> People have profiles. Groups are Circles. Two-person chats become Circles
> only through future mutual consent.

## What changes

### Normal direct chats

- Tapping the chat-header identity opens the other person's normal profile.
- The shared Circle profile is no longer available for an ordinary DM.
- A small information button opens private conversation details and Shared
  Media.
- Direct media is described as Shared Media, not a Timeline.
- Direct chats have no shared name, biography, avatar editor, Posts tab, or
  member strip.

### Group Circles

- Tapping the group identity still opens the full Circle profile.
- Timeline, Posts, members, shared identity editing, invitations, and private
  membership rules remain intact.
- Group memberships remain pinned Circles.

### Future two-person Circles

The migration adds `circle_enabled` and `circle_activated_at` to
`public.conversations` without activating the feature for normal DMs. Every
group is backfilled and enforced as a Circle. A later unanimous-consent flow can
promote the existing direct conversation without duplicating its chat history.

## 1. Run the migration

Run in Supabase SQL Editor:

`supabase/migrations/20260721_012_direct_chats_vs_circles.sql`

This migration:

- adds the future-compatible Circle activation fields;
- marks all existing and future groups as Circles;
- adds `is_circle` to inbox RPC results;
- adds `other_user_id` and Circle-state fields to conversation details;
- does not delete or move messages, media, members, invitations, or profiles.

## 2. Copy the app files

Copy this package into:

`C:\Users\honge\Dev\circles-app`

Allow Windows to merge and replace files.

The main changed files are:

- `App.js`
- `src/screens/conversations/ChatScreen.js`
- `src/screens/conversations/DirectConversationDetailsScreen.js`
- `src/screens/conversations/CircleProfileScreen.js`
- `src/screens/conversations/InboxScreen.js`
- `src/services/conversationService.js`
- `docs/CONVERSATION_SPACES_ARCHITECTURE.md`

## 3. Restart Expo

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## 4. Test direct-chat behavior

1. Open Hongy → Alex.
2. Tap Alex's avatar/name in the header.
3. Confirm Alex's normal user profile opens.
4. Return to Chat and tap the information icon at the top-right.
5. Confirm the details page shows Alex and Shared Media only.
6. Confirm there is no Circle biography, Circle editor, Posts tab, member strip,
   or Timeline label.
7. Send a photo, reopen Details, and confirm it appears under Shared Media.
8. Delete the photo message and confirm it disappears from Shared Media.

## 5. Test group-Circle behavior

1. Open the Hongy/Alex/Sam group.
2. Tap the group avatar/name.
3. Confirm the full Circle profile opens.
4. Confirm Timeline, Posts, members, and Edit Circle remain available.
5. Send and delete group media and confirm Timeline stays synchronized.

## 6. Regression checks

- Realtime updates still work after repeatedly opening/closing Chat and profile
  pages.
- The custom chat header remains fully visible above and below.
- Pending invitees still cannot access a private group.
- Account switching does not expose another account's direct Shared Media.
- Existing messages and media remain intact after the migration.

## Commit

```powershell
git status
git add App.js src supabase/migrations docs README_CONVERSATIONS_STEP_9B_3.md
git commit -m "Separate direct chats from Circle profiles"
git push
```

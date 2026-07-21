# Circles Step 9A — Real Conversations + Private Group Invitations

This checkpoint removes the placeholder Family, Basketball Crew, College,
Gaming, and other demo chats. The Circles inbox now reflects real relationship
and membership state.

## What changes

### Direct messages

- Accepting a connection automatically creates exactly one private DM.
- The connected person's profile appears in Circles even before either person
  sends a message.
- Pending connection requests and mutual-only candidates do not receive chats.
- Existing accepted connections are backfilled when the migration runs.
- Removing both connection rows removes the direct conversation and its test
  message history.

### Private groups

- The compose button opens a real connected-person picker.
- A group requires the creator plus at least two accepted connections.
- Selected people receive pending invitations; they are not silently added.
- Pending invitees cannot read the chat or shared-space details.
- Accepting adds membership and opens the group.
- Declining grants no access.
- The creator can see who has accepted and who is still invited.

### Shared private profile foundation

The conversation details page establishes the private shared-space shell:

- Chat is active now.
- Timeline is reserved for the automatic archive of media sent in chat.
- Posts is reserved for deliberate classic posts inside the conversation.
- People shows accepted members separately from pending invitations.

The automatic Timeline and intentional Posts remain separate by design.

## Database migration

Run:

`supabase/migrations/20260720_009_real_conversations.sql`

The migration:

1. Archives the old `public.messages` prototype as
   `public.legacy_messages_step9` without deleting its rows.
2. Creates `conversations`, `conversation_members`,
   `conversation_invitations`, and the new membership-bound `messages` table.
3. Adds strict RLS and membership helpers.
4. Adds triggers that create/backfill direct conversations from accepted
   `connections` rows.
5. Adds invitation-only group RPCs.
6. Adds real inbox, details, message, read-state, and pin RPCs.

Run the migration before replacing the app files.

## Apply the package

Copy the package contents into the project root and allow Windows to merge and
replace files.

Main app files:

- `App.js`
- `src/services/conversationService.js`
- `src/screens/conversations/InboxScreen.js`
- `src/screens/conversations/ChatScreen.js`
- `src/screens/conversations/CreateGroupScreen.js`
- `src/screens/conversations/ConversationDetailsScreen.js`
- `docs/CONVERSATION_SPACES_ARCHITECTURE.md`

## Test with Hongy, Alex Test, and Sam Test

Start clean by using **Me → Settings → Test accounts → Reset requests and
connections**, then prepare the mutual candidates again.

### Direct-message test

1. Connect Hongy and Alex Test.
2. Open Hongy's Circles tab.
3. Confirm Alex Test appears automatically with the empty-chat subtitle.
4. Switch to Alex and confirm Hongy appears there too.
5. Send a message from Alex.
6. Switch to Hongy and confirm the message appears.
7. Confirm Sam remains absent until Hongy and Sam actually connect.

### Group invitation test

1. Connect Hongy with both Alex Test and Sam Test.
2. As Hongy, tap the compose icon in Circles.
3. Select Alex and Sam, then create the group.
4. Confirm Hongy sees the group and both people as pending invitations.
5. Switch to Alex. Confirm the invitation appears, but the group chat itself is
   not accessible before acceptance.
6. Accept as Alex and send a message.
7. Switch to Sam. Decline the invitation.
8. Confirm Alex is an accepted member and Sam remains outside the private chat.
9. Create another group and accept from all three accounts for the later
   Timeline and Posts testing.

### Ownership/privacy checks

- A mutual-only or pending connection must not appear as a DM.
- A pending group invite must not be able to query messages or details.
- Only accepted members may send messages.
- An account switch must show only that account's memberships and invitations.

## Run

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## Commit

```powershell
git status
git add App.js src supabase/migrations docs README_CONVERSATIONS_STEP_9A.md
git commit -m "Build real private conversations"
git push
```

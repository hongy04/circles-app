# Circles Step 9B.5 — Authentic Read Receipts + Unread-Only Unsend

This checkpoint fixes media-message unsend and changes unsend into a privacy-safe,
server-enforced rule:

- Text and media messages can be unsent only before another eligible member reads them.
- Long-pressing an owned media tile now opens the same message actions as text.
- Direct chats show `Not read` or `Read`.
- Group Circles show `Not read`, `Read by N`, or `Read by all`.
- Read receipts are created automatically only while the chat is focused and the app is active in the foreground.
- The database enforces the unread-only rule, so an outdated client cannot bypass it.
- Unsent media disappears from Chat and from Shared Media or the Circle Timeline.

## Files in this package

- `App.js` — complete current app entry file.
- `src/screens/conversations/ChatScreen.js` — media long-press, receipt labels, foreground/focus-aware reading, and unread-only message actions.
- `src/services/conversationService.js` — loads exact receipt state and subscribes to receipt changes.
- `supabase/migrations/20260722_013_authentic_read_receipts_unread_unsend.sql` — exact read table, automatic marking, read-state RPC, strict unsend enforcement, and Realtime publication.
- `docs/CONVERSATION_SPACES_ARCHITECTURE.md` — updated architecture rule.
- `read-receipts-unsend-step9b5.patch` — exact source diff from Step 9B.4.

## 1. Run the Supabase migration

Open Supabase → SQL Editor. Paste the entire contents of:

```text
supabase/migrations/20260722_013_authentic_read_receipts_unread_unsend.sql
```

Press **Run**.

The migration creates:

```text
conversation_message_reads
```

It also replaces the existing `mark_conversation_read` and
`delete_own_conversation_message` RPC implementations without changing the RPC
names used by the app.

The migration does not delete any existing messages or media. It conservatively
backfills prior read knowledge from `conversation_members.last_read_at` so a
message that was probably already opened does not suddenly become unsendable in
reverse.

## 2. Apply the files

Extract the package and copy its contents into:

```text
C:\Users\honge\Dev\circles-app
```

Allow Windows to merge folders and replace files.

Restart Expo:

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## 3. Test a direct chat

Use Hongy and Alex.

1. As Hongy, send a text message.
2. Before Alex opens the chat, confirm Hongy sees `Not read`.
3. Long-press the message and confirm **Unsend Message** appears.
4. Cancel, then switch to Alex and open the chat.
5. Switch back to Hongy and confirm the message changes to `Read` automatically.
6. Long-press it and confirm the app says it has already been read rather than offering unsend.
7. Repeat with a photo-only message.
8. Before Alex opens it, long-press directly on the photo and unsend it.
9. Confirm it disappears for both accounts and from Shared Media.

## 4. Test a group Circle

1. As Hongy, send a text or photo to a three-person Circle.
2. Confirm it begins as `Not read`.
3. Open the Circle as Alex.
4. Switch back to Hongy and confirm `Read by 1` appears.
5. Confirm unsend is no longer available.
6. Open it as Sam and confirm the status becomes `Read by all`.
7. Send another media message and unsend it before Alex or Sam opens the Circle.
8. Confirm the item disappears from Chat and Timeline.

## 5. Foreground authenticity test

1. Leave Alex signed in with the direct chat closed or the app in the background.
2. Send a message from Hongy.
3. Confirm it remains `Not read`.
4. Bring Alex's app to the foreground and actually open the chat.
5. Confirm the receipt changes only then.

## Expected security behavior

- Only the sender can request unsend.
- A receipt from any other eligible member permanently closes the unsend window.
- The server rechecks receipt state at deletion time, protecting against Realtime delay or two people acting simultaneously.
- Read receipts cannot be manually turned off in this prototype because the feature represents whether the private chat was actually opened.

## Validation completed

The complete `App.js`, updated `ChatScreen.js`, and updated
`conversationService.js` passed Expo Babel transformation using the project's
installed Expo preset. Live Supabase migration behavior, Realtime receipt
updates, and physical-device interaction still require the test steps above.

## Commit after testing

```powershell
git status
git add App.js src supabase/migrations docs README_CONVERSATIONS_STEP_9B_5.md
git commit -m "Add authentic read receipts and unread-only unsend"
git push
```

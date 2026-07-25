# Step 9B.4 — Keyboard-safe composer and visible Unsend action

This is a small UI fix on top of Step 9B.3. No Supabase migration is required.

## What changed

### 1. The keyboard no longer covers the message composer

The `KeyboardAvoidingView` now owns the entire area below the custom chat header instead of wrapping only the composer. When the phone keyboard opens, the message list and composer resize together so the input remains visible.

The screen also:

- removes the extra iPhone home-indicator padding while the keyboard is open;
- scrolls back to the newest message after the keyboard appears;
- supports interactive keyboard dismissal when dragging the message list on iPhone;
- keeps the Step 9B.2 safe-area header and Step 9B.1 Realtime fix unchanged.

### 2. Own messages now have a clear Unsend action

Press and hold a message that you sent.

On iPhone, a native action sheet appears with **Unsend Message**. After confirmation, the message is removed for every member of that conversation.

- Only the original sender can unsend a message.
- Text messages disappear from Chat.
- Direct-chat media also disappears from Shared Media.
- Group media also disappears from the Circle Timeline.
- Other people's messages cannot be removed from this menu.

The backend already supported sender-owned deletion through `delete_own_conversation_message`, so this step does not need new SQL.

## Apply the files

Copy the contents of this package into:

```text
C:\Users\honge\Dev\circles-app
```

Allow Windows to replace:

```text
App.js
src\screens\conversations\ChatScreen.js
```

`App.js` is included as a complete reference. The functional change is in `ChatScreen.js`.

## Restart Expo

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## Test checklist

### Keyboard

1. Open a direct chat.
2. Tap the message field.
3. Confirm the composer moves above the keyboard.
4. Type enough lines to make the input grow.
5. Confirm the entire composer remains visible.
6. Drag down on the messages and confirm the keyboard dismisses smoothly.
7. Repeat in a group Circle.

### Unsend

1. Send a text message.
2. Press and hold your message bubble.
3. Choose **Unsend Message**.
4. Confirm it disappears on both test accounts.
5. Send a photo and unsend it.
6. Confirm it disappears from Chat and Shared Media or Timeline.
7. Press and hold another person's message and confirm no removal option opens.

## Commit after testing

```powershell
git status
git add App.js src/screens/conversations/ChatScreen.js README_CONVERSATIONS_STEP_9B_4.md
git commit -m "Fix chat keyboard and add unsend action"
git push
```

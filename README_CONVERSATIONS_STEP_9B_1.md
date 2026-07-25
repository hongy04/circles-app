# Circles Step 9B.1 — Realtime subscription fix

This fixes the runtime error:

`cannot add postgres_changes callbacks ... after subscribe()`

## Cause

Multiple mounted conversation screens could request a Supabase Realtime channel
with the same topic name. When a previously subscribed channel was returned or
still being removed, the app attempted to register another `postgres_changes`
callback after that channel had already subscribed.

## Fix

Every call to `subscribeToConversationChanges()` now creates unique channel
names for both:

- conversation message/media updates;
- conversation membership/profile updates.

All `.on(...)` callbacks are still registered before `.subscribe()`. Existing
cleanup continues removing each channel when its screen or effect unmounts.

## Apply

Copy this package into the Circles project root and allow Windows to replace:

`src/services/conversationService.js`

No Supabase migration is required. `App.js` is included only as a complete
Step 9B reference and does not contain an additional change for this fix.

Restart Expo with a cleared Metro cache:

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## Test

1. Open the Circles inbox.
2. Open the Hongy–Alex direct chat.
3. Tap the chat header to open the Circle profile.
4. Return to Chat and repeat this several times.
5. Open a group chat and its Circle profile.
6. Send a text or media message and confirm the other account receives it.
7. Confirm the Realtime callback error does not return.

# Circles Step 36A — Whisper Foundation

This patch implements the privacy/lifecycle foundation for Whisper. It does **not** add the profile ear icon, composer, floating avatar bubbles, read card, pop animation, or Whisper push notification yet. Those are intentionally later phases built on this server contract.

## Product rules implemented

- Accepted connections only.
- Never anonymous.
- Text-only foundation, maximum **140 characters**.
- A Whisper expires **24 hours after send** if it remains unread/unconsumed.
- Recipient-only active Whisper read access.
- No sender-side sent-history, read-receipt, opened/expired-status RPC.
- Fixed **one Whisper per sender → recipient every 24 hours**. This is intentionally a cooldown rather than merely “one active Whisper”: if sending became available immediately after a recipient popped a Whisper, the sender could infer that it had been read.
- Up to 10 live incoming Whispers at the server boundary; later UI will show at most 3 bubbles plus overflow.
- Turning Whispers off consumes all currently live incoming Whispers.
- Disconnecting or blocking consumes live Whispers for that pair.
- Safety reports can snapshot the disappearing Whisper body into the existing private moderation record before consuming it.
- Direct client table access is denied; narrow security-definer RPCs mediate the lifecycle.

## Migration

Apply Migration 088:

```bash
npx supabase db push
```

Migration file:

`supabase/migrations/20260808_088_whisper_foundation.sql`

## New service

`src/services/whisperService.js`

Exposes the contract later UI phases will use:

- `getMyWhisperSettings()`
- `updateMyWhisperSettings()`
- `getWhisperSendEligibility()`
- `sendWhisper()`
- `listMyActiveWhispers()`
- `markWhisperOpened()`
- `consumeWhisper()`
- `reportWhisper()`

`src/services/safetyService.js` also adds `submitWhisperSafetyReport()` for the future read/pop safety menu.

## Visible Step 36A UI

Settings → People now contains a **Whispers** toggle.

Turning it off means accepted connections cannot send new Whispers and any currently live incoming Whispers are consumed immediately.

## Testing now

After applying Migration 088:

1. Open **Settings → People**.
2. Toggle **Whispers** off.
3. Leave Settings and reopen it; the toggle should persist off.
4. Toggle it back on and verify persistence again.

The actual sender/recipient lifecycle becomes directly testable from the app in Step 36B/36C when the send and bubble surfaces are added.

## Build/deploy requirements

- Supabase migration: **YES — Migration 088**
- Edge Function deploy: **No**
- Native module changes: **No**
- EAS rebuild: **No**

## Validation

- `node --check src/services/whisperService.js` ✅
- `node --check src/services/safetyService.js` ✅
- `node --check src/screens/profile/AccountSettingsScreen.js` ✅
- Expo iOS/Hermes production export ✅ — **2,122 modules**

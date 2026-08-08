# Circles — Step 36B: Whisper Send Experience

This patch builds the sender-facing Whisper UI on top of confirmed Step 36A / Migration 088.

## What changed

- Accepted connections with Whispers enabled now get a small line-art ear + bubble control in the personal profile header.
- The affordance is driven by the Step 36A server eligibility RPC, so disabled recipients never expose a composer.
- Tapping Whisper opens a compact keyboard-safe composer.
- Whispers are limited to 140 characters and support normal emoji through the text input.
- Send success briefly shows `Whisper sent` and then returns the sender to the same profile.
- After sending, the local eligibility switches to the fixed 24-hour cooldown immediately.
- During cooldown, the icon stays subdued; tapping it only explains the once-per-24-hours rule. It exposes no opened/read/expired state.
- No sent Whisper text, history, read receipt, or recipient response is shown to the sender.

## Files

- `src/components/profile/ProfileHeader.js`
- `src/components/profile/WhisperComposerSheet.js` (new)
- `src/screens/profile/ProfileViewScreen.js`

## Backend / build requirements

- Requires Step 36A / Migration 088 to already be applied.
- **No new Supabase migration.**
- **No Edge Function deploy.**
- **No native module change.**
- **No EAS rebuild required.**

## Validation performed

- `node --check` passed for all edited/new JS files.
- Production iOS/Hermes Expo export passed at **2,123 modules**.

## Suggested device test

Use two already-connected accounts.

1. Make sure Account B has `Settings → People → Whispers` enabled.
2. Open B's personal profile from Account A.
3. Confirm the ear/bubble icon appears beside the Connected state.
4. Tap it and verify the composer stays above the keyboard.
5. Verify blank text cannot send and the counter stops at 140 characters.
6. Send a short Whisper.
7. Confirm the success state appears briefly and the sheet closes back to B's profile.
8. Tap the subdued Whisper icon again and confirm it only says A can Whisper this connection once every 24 hours.
9. Disable Whispers on B, reload B's profile from A, and confirm the Whisper affordance disappears.

Recipient bubbles/read/pop behavior intentionally arrives in Step 36C/36D.

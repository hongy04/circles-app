# Circles — Step 36D: Whisper Read & Pop

This patch builds on confirmed Step 36C + the three-dot-menu safe-zone hotfix.

## What changed

### Tap a real header bubble to open it
- Incoming Whisper photo bubbles are now accessible press targets.
- Tapping a bubble verifies/marks the Whisper opened through the existing recipient-only RPC.
- Opening alone does **not** consume the Whisper, so the recipient has time to read it and can still report it safely.

### Glass read experience
- A focused glass Whisper card comes forward over the profile.
- It shows the sender identity, the refracted sender-photo bubble, and the Whisper text.
- There is deliberately no reply action, read receipt, or sender-facing state.

### Pop = destructive consume
- `Pop Whisper` calls the existing `consume_whisper` RPC first.
- After the server confirms consumption, the read card closes and the actual header bubble bursts.
- Pop treatment includes a quick stretch/scale, refractive ring, micro-droplets, fade, and light haptic.
- Reduce Motion keeps the interaction short and avoids the longer animated treatment.

### Safety before disappearance
- The read card has a `...` safety menu with:
  - Report Whisper
  - Block sender
- Report Whisper opens the existing report flow in Whisper mode.
- Whisper reports call the existing `submit_whisper_report` RPC so the disappearing text is copied into private safety evidence before the Whisper is consumed.
- Blocking uses the existing block flow; the Step 36A database trigger consumes active Whispers for the blocked pair.

## Files

- `src/components/profile/WhisperBubbleField.js`
- `src/components/profile/WhisperReadSheet.js` (new)
- `src/components/profile/ProfileHeader.js`
- `src/screens/profile/ProfileViewScreen.js`
- `src/screens/profile/ReportUserScreen.js`

## Backend / build requirements

- **No new migration.** This uses Migration 088 (`mark_whisper_opened`, `consume_whisper`, `submit_whisper_report`) and Migration 089 from Step 36C.
- **No Edge Function deploy.**
- **No new native dependency.** `expo-haptics` was already in the app and already used elsewhere.
- **No EAS rebuild required.**

## Validation performed

- `node --check` passed on all changed JS files.
- Expo iOS/Hermes production export passed.
- Bundle count: **2,125 modules**.

## Suggested two-account test

1. Account A sends Account B a Whisper.
2. On B's own profile, tap A's floating photo bubble.
3. Confirm the glass read card shows the correct sender and text.
4. Tap `...` and confirm both `Report Whisper` and `Block` are available; cancel without taking action.
5. Tap `Pop Whisper`.
6. Confirm the card closes, the original header bubble visibly bursts, and it does not return after refresh/reopen.
7. Send another Whisper from a different connection and verify the first bubble's consumption did not disturb the others.
8. Optional safety test: report a fresh Whisper and confirm the report completes and the Whisper disappears. Blocking can be tested with disposable/dev accounts because it intentionally ends the connection.

The fixed 24-hour sender→recipient cooldown remains unchanged, so popping a Whisper does not tell the sender that it was read.

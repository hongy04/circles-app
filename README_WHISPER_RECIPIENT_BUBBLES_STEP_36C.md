# Circles — Step 36C: Whisper Recipient Bubbles

This patch builds the recipient-facing Whisper bubble layer on top of confirmed Step 36B / Migration 088.

## What changed

- Unread Whispers now appear on the recipient's **own personal profile header** as floating sender-photo bubbles.
- Up to **3 sender-photo bubbles** are shown at once; extra active Whispers collapse into a small translucent `+N` bubble.
- Bubble artwork uses layered avatar refraction instead of a plain circular crop:
  - enlarged/warped base avatar
  - faint offset refracted copy
  - translucent lens wash
  - iridescent/chromatic edge
  - specular highlight arc and highlight point
  - soft depth shadow
- Each bubble receives a slightly different size, depth, drift, wobble, and timing so the header feels alive without constant bouncing.
- **Reduce Motion** leaves the bubbles still.
- Newly received Whispers can float into an already-open self profile without a manual refresh.
- Returning to the Me profile and pull/focus refresh also reconcile the authoritative active Whisper list.
- Local expiry timers remove a bubble when its 24-hour Whisper lifetime ends.
- Step 36C is intentionally **visual-only**: bubbles do not open or consume the Whisper yet. Read/expand/pop behavior belongs to Step 36D.

## Privacy-safe realtime

`profile_whispers` remains RPC-only and its message body is never exposed through Realtime.

Migration 089 adds `profile_whisper_pulses`, a recipient-only RLS table containing only:

- recipient id
- Whisper id
- created timestamp

An insert trigger emits one metadata pulse when a Whisper is created. The recipient profile listens for its own pulse, then refreshes through the existing secure `get_my_active_whispers()` RPC.

## Files

- `src/components/profile/WhisperBubbleField.js` (new)
- `src/components/profile/ProfileHeader.js`
- `src/screens/profile/ProfileViewScreen.js`
- `src/services/whisperService.js`
- `supabase/migrations/20260808_089_whisper_realtime_pulses.sql` (new)

## Backend / build requirements

Apply the new migration:

```bash
npx supabase db push
```

- Requires Migration 088 from Step 36A.
- **No Edge Function deploy.**
- **No native module change.**
- **No EAS rebuild required.**

## Validation performed

- `node --check src/services/whisperService.js` passed.
- `git diff --check` passed for the Step 36C changes.
- Production iOS/Hermes Expo export completed successfully at **2,124 modules**.

## Suggested device test

Use two connected accounts with Whispers enabled.

1. Open Account B's **own** Me profile and leave it visible.
2. From Account A, send B a Whisper.
3. Return to B (or keep B open) and confirm a sender-photo bubble appears without a full-screen reload.
4. Inspect the bubble closely: the avatar should feel embedded/refracted rather than like a flat circular avatar.
5. Send Whispers from additional connected test accounts if available and confirm different bubble sizes/positions.
6. With 4+ active incoming Whispers, confirm only 3 photo bubbles plus a small `+N` overflow bubble appear.
7. Turn on iOS Reduce Motion and confirm the bubble field becomes still.
8. Confirm tapping bubbles does nothing yet and does not consume them — Step 36D will add the read/pop interaction.

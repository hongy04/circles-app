# Circles Step 21 — Cozy Event Room + Post-Event Lifecycle

Apply this patch on top of the confirmed Step 20 / Step 18 performance baseline.

## Migration required

Apply:

`supabase/migrations/20260804_079_event_memory_lifecycle.sql`

Typical linked-project command:

```bash
npx supabase db push
```

## What changed

- Event Detail redesigned as a room/memory surface rather than a stack of utility cards.
- Six lightweight optional Event Look presets: Circle, Sky, Garden, Sunset, Twilight, Celebrate.
- Event creation stays simple: Event Look is one horizontal optional strip, with no upload permission requirement.
- RSVP controls disappear when the gathering is over.
- Backend also rejects member/guest response changes after the event end (or start when no end was set).
- Event timezone is captured at creation.
- At 8:00 AM the morning after the event (in that saved timezone), Going responses become attendance automatically on the next normal event read.
- Existing events without timezone metadata use a 12-hour fallback.
- Host attendance review remains available only as a correction tool.
- Auto attendance is labeled separately from host-corrected attendance.
- Past event attendee list focuses on actual attendance; upcoming list focuses on Going/Maybe instead of every invited Circle member.
- Event Photos and People are cleaner action tiles.
- Guest controls/policy copy are significantly reduced.

## Test sequence

### New upcoming event
1. Create Event.
2. Pick a non-default Event Look.
3. Create it and confirm the selected artwork appears at the top of Event Detail.
4. Change Going / Maybe / Can't go and confirm the selected RSVP updates.
5. Confirm Photos opens normally.
6. Confirm outside-guest settings/invitations still work if enabled.

### Past-event lock
Use an event whose end time has passed (or no end time and start has passed):
1. Open Event Detail.
2. Confirm RSVP buttons are gone.
3. Confirm guest response controls are not editable.
4. If possible, verify an old client/server call to `respond_to_event` is rejected with `RSVPs are closed for this past event`.

### Automatic attendance
For easiest testing, temporarily create/adjust a dev event so its automatic due time has passed, then open it after applying Migration 079.
1. Open Event Detail.
2. Confirm Going users/guests become the attendance record.
3. Confirm the card says `Attendance remembered from RSVPs`.
4. Confirm People from this event / repeat-signal features become available using that finalized attendance.
5. As host, tap Correct, change one attendee, and Save corrections.
6. Return to Event Detail and confirm the card now says `Attendance corrected by the host`.

### Regression
- Circle Plans & Events parent list still works.
- Availability Poll creation/detail unaffected.
- Event Photo Gallery unaffected.
- Event Connections remain privacy-gated by finalized attendance.
- Repeat event flow copies the original Event Look as a starting point.

## Validation completed

- JS syntax checks passed.
- `git diff --check` passed for Step 21 files.
- iOS Expo/Hermes production export passed at 2,117 modules.
- No native changes / no EAS build required.

# Circles Step 30 — Timeline Milestones, Notes & Plan Memories

Apply on top of the confirmed Step 29 + no-photo title layout + title-glass removal state.

## What changed

- Our Circle Timeline now includes deliberately shared Thoughts as note-style memory cards.
- Private thought drafts never enter Timeline.
- Important Dates become milestone cards only once the stored date has happened; future dates remain on Important Dates.
- Completed Our Circle plans now appear in the full scrollable Timeline feed (they previously only existed as profile Timeline tiles).
- The Circle profile Timeline grid now includes milestone and shared-note tiles.
- Tapping plan/milestone/note tiles opens the full Timeline positioned on that memory first.
- Secondary actions still open Plan Detail, Important Dates, or the full shared Thought when needed.
- Timeline count/empty-state copy now reflects the broader memory model.
- Our Circle Timeline listens for plan/date/thought realtime changes and refreshes quietly.

## Privacy / lifecycle rules

- Draft thoughts stay private and are excluded.
- Only `status = shared` thoughts appear.
- Future Important Dates are excluded from the historical Timeline.
- No new occurrence history is fabricated for yearly dates; Timeline uses the stored date record only.

## Validation

- `node --check` passed for both changed screens.
- Scoped `git diff --check` passed.
- iOS Expo/Hermes production export passed: 2,122 modules.

## Backend

No migration, Edge Function, native code, or EAS rebuild is required.

## Suggested test

1. In Our Circle, share a Thought and confirm it appears as a note tile on the profile Timeline.
2. Tap it and confirm the full Timeline opens positioned on the shared note.
3. Confirm a private draft never appears.
4. Create/use an Important Date in the past and confirm it appears as a milestone; a future date should not.
5. Tap a completed Plan memory tile and confirm it opens the full Timeline first, with Memory details available from the full card.
6. Scroll vertically through media → plan → milestone → note entries and confirm the feed remains smooth.

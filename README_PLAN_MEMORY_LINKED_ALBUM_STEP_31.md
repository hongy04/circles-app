# Circles Step 31 — Linked Album Multimedia Plan Memories

Apply on top of the confirmed Step 30 state.

## What changed

- Completed Our Circle plans with a linked Shared Album now behave like multimedia memories in the full Timeline.
- Page 1 remains the plan-memory summary.
- Swipe horizontally to browse up to 6 photos from the linked album without leaving Timeline.
- The linked album title stays visible below the carousel.
- If the album contains more than 6 photos, the final inline photo shows how many remain.
- `All photos` opens the Shared Album; `Memory details` keeps the plan detail as a secondary destination.
- Linked albums with no photos keep the existing plan-memory presentation.
- Uploading/changing/removing album photos updates the warm album summary so Back navigation can reflect changes immediately.
- Album photo URLs use the existing private batched signed-URL cache.

## Migration 085

Apply:

```bash
npx supabase db push
```

Migration 085 extends the existing shared-album read model with a bounded six-photo `timeline_storage_paths` field. Before the migration is applied, the frontend gracefully falls back to the existing three-photo album preview.

## Suggested test

1. Open an Our Circle completed plan with no linked album — behavior should remain unchanged.
2. Link an album with 1–3 photos, then open Timeline.
3. Swipe from the plan summary into the album photos.
4. Link/use an album with more than 6 photos and confirm only six are inline, with a `more in the album` indicator.
5. Tap a photo or `All photos` and confirm the Shared Album opens.
6. Add/delete a photo in the album and Back to Timeline; the memory should catch up without a manual refresh.
7. Confirm `Memory details` still opens the original plan detail.

## Validation

- JS syntax checks passed.
- Scoped whitespace validation passed.
- iOS Expo/Hermes production export passed: 2,122 modules.
- No native code / no EAS rebuild required.

# Circles Step 26 — Shared Albums & Scrapbook Memories

## What changed

- Shared Albums is now a photo-forward scrapbook space over the Our Circle background.
- Album cards use large visual memory covers with gentle size/alignment variation instead of compact text rows.
- Albums default to an automatic collage of up to three album photos.
- Either member can choose one existing album photo as the deliberate cover.
- Returning to Automatic collage removes the explicit cover choice without removing any photo.
- Deleting the current cover photo automatically returns the album to its collage.
- Album Detail now opens with the same visual memory cover/collage and keeps the photo grid neutral below it.
- Existing photo uploads are reused for covers; Circles does not duplicate or upload another cover object.
- Shared album private-media signing now uses the existing batched in-memory signed URL cache.

## Backend

Apply Migration 082:

```bash
npx supabase db push
```

No Edge Function, native, or EAS rebuild is required.

## Suggested test

1. Open Our Circle → Shared Albums with a Circle background.
2. Verify existing albums now look like recognizable visual memory cards.
3. Open an album with at least three photos and confirm the automatic collage.
4. Tap Choose Cover and select a photo.
5. Go Back and confirm that photo becomes the album card cover.
6. Reopen the album → Change Cover → Automatic collage.
7. Confirm the three-photo collage returns.
8. Pick a cover again, then delete that exact photo; confirm the album safely falls back to its collage.
9. Add several new photos and confirm the page remains quick/smooth.
10. Verify the full-screen photo viewer remains neutral/black.

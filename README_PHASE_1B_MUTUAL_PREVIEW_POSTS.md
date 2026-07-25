# Circles Phase 1B — Mutuals Preview Posts

This checkpoint keeps the existing chronological Feed unchanged and makes the Mutuals discovery list more explorable without opening full profiles.

## What changed

- A user may deliberately choose one personal post as their **Mutuals preview**.
- Choosing a preview requires a clear privacy confirmation.
- The selected post receives a **Preview** badge on the owner's profile grid.
- The owner may remove or replace the preview at any time.
- Deleting the selected post clears the preview automatically.
- A mutual with a selected preview appears as an expanded discovery card.
- A mutual without a selected preview remains a compact profile row.
- Preview cards do not expose likes, comments, or the rest of the profile.
- Tapping a preview opens the existing private pre-connection profile shell.
- Circle posts cannot be selected because the selector only accepts personal posts owned by the current user.

## Install

Copy the contents of this folder over the existing Circles project. No new npm packages are required.

Then run this migration in Supabase SQL Editor:

`supabase/migrations/20260725_020_mutual_preview_posts.sql`

Run migration 020 only. Migrations 018 and 019 should already be installed from Phase 1A.

Restart Expo with a cleared cache:

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## Test

1. Open **Me** and tap the ellipsis on one of your personal posts.
2. Choose **Show as Mutuals preview** and confirm.
3. Verify the post receives a **Preview** badge.
4. View that account from another test account that is still only a mutual.
5. Verify the Mutuals list shows the selected post, but the tapped profile remains private.
6. Send or accept a connection request and verify normal profile access still requires acceptance.
7. Remove the preview and verify the mutual returns to a compact profile row.
8. Select a preview again, delete that post, and verify the database clears the preview automatically.

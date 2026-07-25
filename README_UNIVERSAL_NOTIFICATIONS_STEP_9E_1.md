# Circles Step 9E.1 — Universal Activity Notifications

This checkpoint extends the working Step 9E notification center so personal
profile posts and private Circle posts use one consistent activity stream.

## Included files

- `App.js` — complete current App entry file
- `src/services/notificationService.js`
- `src/screens/conversations/NotificationsScreen.js`
- `supabase/migrations/20260723_017_universal_activity_notifications.sql`
- `docs/UNIVERSAL_NOTIFICATIONS_ARCHITECTURE.md`
- `universal-notifications-step9e1.patch`

## 1. Run the migration first

Open Supabase → SQL Editor and run the complete contents of:

```text
supabase/migrations/20260723_017_universal_activity_notifications.sql
```

The migration:

- Preserves every existing Step 9E notification
- Adds personal-post notification targets
- Adds automatic personal like/comment triggers
- Adds generic notification RPCs
- Does not change personal posts, comments, or likes
- Does not backfill old interactions, avoiding a flood of stale alerts

## 2. Copy the app files

Extract the ZIP and copy its contents into:

```text
C:\Users\honge\Dev\circles-app
```

Allow Windows to merge folders and replace the included files.

## 3. Restart Expo

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## Test matrix

### Personal post like

1. Sign in as Hongy and create or choose a personal profile post.
2. Switch to Alex and like Hongy’s personal post.
3. Switch back to Hongy.
4. Open Circles → notification bell.
5. Confirm the row says Alex liked your post.
6. Tap it and confirm Hongy’s personal post opens.
7. Switch to Alex and unlike the post.
8. Confirm that like notification disappears from Hongy’s center.

### Personal post comment

1. As Alex, comment on Hongy’s personal post.
2. Switch to Hongy.
3. Confirm the comment notification appears in the same notification center.
4. Tap it and confirm the correct personal post opens.
5. Delete the comment and confirm its notification is removed.

### Self-interaction rule

1. As Hongy, like and comment on Hongy’s own personal post.
2. Confirm no notification is created for Hongy.

### Circle regression

1. Like and comment on a Circle post from another account.
2. Confirm Circle notifications still appear and open Circle Post Detail.
3. Confirm Circle mute preferences continue to affect only that Circle.

### Badge regression

1. Create one unread personal-post interaction and one unread Circle
   interaction.
2. Confirm both contribute to the notification count.
3. Tap Mark all read and confirm the activity count clears.

## Notes

This remains an in-app notification system. Device push delivery while the app
is closed is a later step.

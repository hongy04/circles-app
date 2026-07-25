# Circles Step 9E — Notifications, Preferences, and Circle Post Likes

This package should be applied on top of the confirmed Step 9D project.

## What this checkpoint adds

### Circle post likes

- Accepted Circle members can like and unlike Circle posts.
- Like counts and the current member's liked state are authoritative from Supabase.
- Likes appear in both the scrollable Circle post feed and the individual Circle post page.
- A post author receives a private in-app notification when another member likes the post.
- Removing a like removes that unread like event from the notification center.
- Ordinary personal-post likes are unchanged.

### Private notification center

The Circles inbox now has a bell button. It shows private alerts for:

- Circle invitations
- New Circle posts
- Comments on your Circle posts
- Likes on your Circle posts

Opening an alert marks it read and takes the member to the relevant Circle post or invitation area. The screen also supports **Mark all read**.

### Authentic unread behavior

The Circles tab badge now counts:

- Unread messages from conversations that are allowed to alert you
- Pending Circle invitations
- Unread private Circle activity alerts

Muting does **not** mark a message as read. A muted conversation still displays its truthful unread count inside the inbox.

### Per-conversation notification settings

Every member has independent settings for each conversation:

- Mute for 1 hour
- Mute for 8 hours
- Mute for 1 week
- Mute until manually restored
- New-message alerts
- New Circle-post alerts
- Likes and comments on your Circle posts

The settings screen is available from:

- A Circle profile
- A direct chat's Details page

Muted conversations display a bell-off icon in the inbox.

## Important scope boundary

This step adds **in-app notifications and notification preferences**. It does not yet send iOS or Android push notifications while the app is closed. The schema and preference model are designed for a later Expo Push/Edge Function checkpoint without exposing a service-role key in the client.

## Files included

```text
App.js
src/services/conversationService.js
src/services/circlePostService.js
src/services/notificationService.js
src/screens/conversations/InboxScreen.js
src/screens/conversations/NotificationsScreen.js
src/screens/conversations/ConversationNotificationSettingsScreen.js
src/screens/conversations/CircleProfileScreen.js
src/screens/conversations/DirectConversationDetailsScreen.js
src/screens/conversations/CirclePostDetailScreen.js
src/screens/conversations/CirclePostsFeedScreen.js
supabase/migrations/20260722_016_notifications_circle_likes.sql
docs/NOTIFICATIONS_AND_LIKES_ARCHITECTURE.md
```

## 1. Run the Supabase migration

Open Supabase → **SQL Editor**, create a new query, and run the complete contents of:

```text
supabase/migrations/20260722_016_notifications_circle_likes.sql
```

Run the migration before launching the new app files. The updated client expects the new RPC functions and Circle-like fields.

The migration does not delete existing:

- Messages or read receipts
- Conversation membership
- Circle invitations
- Circle posts, media, or comments
- Personal posts, stories, likes, or comments

## 2. Copy the package into the project

Extract the ZIP. In PowerShell:

```powershell
cd C:\Users\honge\Dev\circles-app
Copy-Item -Path "C:\PATH\TO\circles_notifications_likes_step9e_package\*" -Destination . -Recurse -Force
```

Replace `C:\PATH\TO\...` with the folder where the ZIP was extracted.

## 3. Restart Expo cleanly

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## 4. Test Circle likes

Use Hongy, Alex, and Sam in an accepted group Circle.

1. As Hongy, create a Circle post.
2. Switch to Alex and open the Circle's Posts feed.
3. Tap the heart. Confirm it fills and the count becomes 1.
4. Open the individual Circle post. Confirm the same liked state and count.
5. Switch to Hongy. Open the inbox bell and confirm Alex's like appears.
6. Switch to Alex and unlike the post. Confirm the count returns to 0.
7. Confirm a pending invitee cannot read or like the post.

## 5. Test comments and new-post alerts

1. As Alex, comment on Hongy's Circle post.
2. As Hongy, confirm the comment alert opens that post.
3. As Sam, create a new Circle post.
4. Confirm accepted members receive a private new-post alert, but Sam does not receive an alert for Sam's own action.

## 6. Test invitation alerts

1. Invite another accepted connection into the Circle.
2. Switch to that account.
3. Confirm the Circles tab and notification bell show an alert.
4. Open the alert and accept or decline through the existing invitation card.
5. Confirm the pending-invitation badge remains until the invitation is acted on.

## 7. Test mute and preference truthfulness

1. Open the Circle profile → **Notifications**.
2. Mute the Circle for 1 hour.
3. From another account, send a message and create a Circle post.
4. Return to the muted account.
5. Confirm the inbox still shows the message as unread inside that Circle.
6. Confirm the muted Circle has a bell-off icon.
7. Confirm the muted message/post does not increase the global Circles alert badge and the new post did not generate a notification-center item.
8. Unmute the Circle.
9. Turn **New messages** off and repeat the message test. The message must remain unread in the row but not count toward the global alert badge.
10. Turn the setting back on.

## 8. Test direct-chat preferences

1. Open a direct chat → information button → **Details**.
2. Tap **Notifications**.
3. Confirm only the message preference is shown; Circle-post and interaction options are hidden.
4. Mute and unmute the direct conversation.

## 9. Commit after the phone test

```powershell
cd C:\Users\honge\Dev\circles-app
git status
git add App.js src supabase/migrations docs README_NOTIFICATIONS_LIKES_STEP_9E.md
git commit -m "Add Circle notifications preferences and post likes"
git push
```

## Validation performed before packaging

- All 11 included JavaScript files were parsed through the TypeScript JSX transpiler.
- The new Step 9E screen/service paths match the imports added to the complete `App.js`.
- SQL delimiter, parenthesis, and PL/pgSQL `BEGIN`/`END` counts were checked.

Live RLS, trigger, Realtime, and physical-device behavior still require the Supabase and phone tests above.

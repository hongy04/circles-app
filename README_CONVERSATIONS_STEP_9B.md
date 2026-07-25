# Circles Step 9B — Circle Profiles, Media Messages, and Timeline

This checkpoint applies the confirmed Circle design before building private
Circle posts.

## Product behavior

### Chat header

The three-dot button is removed.

The Chat header now shows the person or group avatar and name in the center,
similar to iMessage. Tapping that identity opens the Circle profile.

### Circle profile

A Circle profile now follows the same basic visual language as a user profile:

- large avatar;
- name and private-Circle label;
- bio;
- Timeline, Posts, and member counts;
- accepted-member strip;
- `Timeline | Posts` tabs.

The Posts tab remains a clearly separated placeholder until Step 9C.

### Group identity

Every accepted group member may edit:

- Circle profile photo;
- Circle name;
- Circle bio.

Pending invitees cannot open the group, view its profile, or access its media.

### Private media messages

Chat supports up to six photos/videos in one message.

Current validation:

- 25 MB maximum per attachment;
- 30 seconds maximum per video;
- optional text caption;
- media-only messages are allowed.

All media is stored in the private `conversation-media` bucket.

### Automatic Timeline

Sent media automatically appears in the Circle Timeline.

The Timeline does not upload or copy the file again. It queries the original
`message_media` row and keeps the original message, sender, timestamp, and
caption relationship.

Long-pressing your own message allows deletion. Deleting a media message removes
it from both Chat and Timeline.

## Required migration

Run this file in the Supabase SQL Editor:

`supabase/migrations/20260721_011_circle_profiles_media_timeline.sql`

The migration:

- adds group Circle bio and private avatar paths;
- creates the private conversation-media bucket;
- adds membership-aware Storage policies;
- allows media-only messages;
- creates `message_media`;
- adds media-aware message and inbox RPCs;
- adds the automatic Timeline RPC;
- adds sender-only message deletion;
- allows accepted group members to update group identity.

## Apply

Copy the package contents into:

`C:\Users\honge\Dev\circles-app`

Allow Windows to merge and replace files.

Then restart Expo:

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## Test the new Chat header

1. Open Hongy and Alex's direct conversation.
2. Confirm there is no three-dot button.
3. Confirm Alex's avatar and name appear in the center header.
4. Tap the header.
5. Confirm the private Circle profile opens.
6. Confirm both Hongy and Alex appear in the member strip.

## Test a group Circle profile

1. Open the accepted Hongy/Alex/Sam group.
2. Tap the group avatar/name in Chat.
3. Confirm the Timeline and Posts tabs are visible.
4. Tap **Edit Circle**.
5. Change the group name, bio, and profile photo.
6. Save.
7. Return to Chat and confirm the header updates.
8. Return to Circles and confirm the pinned Circle avatar/name update.
9. Switch to Alex and confirm the same group identity appears.
10. Confirm a pending or declined account cannot access it.

## Test photo messages and Timeline

1. In Hongy and Alex's direct Chat, tap the plus button.
2. Choose one photo and send it without text.
3. Confirm it appears in Chat.
4. Tap the Chat header and confirm the same photo appears in Timeline.
5. Tap the Timeline tile and confirm the full-screen viewer opens.
6. Send several photos with a text caption.
7. Confirm all files appear once in Chat and once as references in Timeline.
8. Switch accounts and confirm the other accepted member can view them.
9. Long-press the sender's media message and delete it.
10. Confirm it disappears from both Chat and Timeline.

## Test video and sound

1. Send a video under 25 MB and 30 seconds.
2. Open it full-screen.
3. Confirm sound works even when the iPhone silent switch is enabled.
4. Test mute/unmute and native playback controls.
5. Confirm a non-member cannot obtain a signed media URL.

## Commit

After the full multi-account test passes:

```powershell
git status
git add App.js src supabase/migrations docs README_CONVERSATIONS_STEP_9B.md
git commit -m "Add Circle profiles and private media timeline"
git push
```

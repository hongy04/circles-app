# Circles Step 9C — Intentional Private Circle Posts

This checkpoint adds the second content surface to a Circle profile:

- **Timeline** remains an automatic archive of photos and videos sent in Chat.
- **Posts** are intentional private publications created specifically for the Circle.

Nothing in this step turns an ordinary direct message into a Circle. Normal DMs still have only Chat and Shared Media. The Circle Post system becomes available only when the conversation is already a group Circle, or later when a two-person direct chat is mutually promoted with `circle_enabled = true`.

## Files in this package

Copy the package into the project root. It includes:

```text
App.js
src/screens/conversations/CircleProfileScreen.js
src/screens/conversations/CreateCirclePostScreen.js
src/screens/conversations/CirclePostDetailScreen.js
src/screens/conversations/EditCirclePostScreen.js
src/services/circlePostService.js
supabase/migrations/20260722_014_circle_posts.sql
docs/CONVERSATION_SPACES_ARCHITECTURE.md
README_CONVERSATIONS_STEP_9C.md
circle-posts-step9c.patch
```

`App.js` is complete, not a partial snippet.

## What Step 9C adds

Circle Posts intentionally do **not** include like counts. The goal is private sharing and conversation, not turning a Circle into another attention scoreboard. Members can respond through comments.

### Circle profile Posts tab

The existing Posts tab is now functional. It displays a three-column private grid separate from Timeline.

Every accepted Circle member can:

- create a Circle post;
- view posts from other accepted members;
- comment on posts;
- open post media full screen.

### Intentional media uploads

A Circle post supports:

- 1–10 photos or videos;
- an optional caption of up to 2,200 characters;
- files up to 25 MB each;
- videos up to 30 seconds.

Post files are separately uploaded under:

```text
<conversation-id>/posts/<author-id>/<filename>
```

This is deliberately different from Timeline. A Circle post does not silently reuse or copy chat media.

### Ownership

A post remains attributed to the member who created it.

Only that author can:

- edit its caption;
- delete the post and its separately uploaded media.

A member can delete their own comment. Step 9C does not let every group member destroy another member's post.

### Privacy

The migration creates membership-protected tables and RPCs for:

```text
conversation_posts
conversation_post_media
conversation_post_comments
```

Pending or declined invitees cannot read posts, comments, or private post media. Direct chats with `circle_enabled = false` cannot create or retrieve Circle posts.

## 1. Run the Supabase migration

Open your Supabase project and select **SQL Editor**.

Open this package file:

```text
supabase/migrations/20260722_014_circle_posts.sql
```

Copy its complete contents into a new SQL query and press **Run**.

A successful run should create the four Circle Post tables and the related functions. It also updates `get_conversation_details` so the Posts count on the Circle profile is real rather than permanently zero.

Do not share `.env.local`, Supabase keys, or test-account passwords.

## 2. Copy the app files

Extract the package ZIP.

Copy the package contents into:

```text
C:\Users\honge\Dev\circles-app
```

Allow Windows to merge folders and replace the matching files.

## 3. Restart Expo cleanly

In PowerShell:

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## 4. Test post creation

Use an accepted group Circle such as the Hongy/Alex/Sam test group.

1. Open the group chat.
2. Tap the group identity at the top.
3. Confirm the Circle profile still has **Timeline** and **Posts** tabs.
4. Tap **New Post**.
5. Select one or more photos or videos.
6. Add an optional caption.
7. Tap **Post to Circle**.
8. Confirm the post opens and appears in the Circle's Posts grid.
9. Confirm the same media was not added to Timeline merely because it became a post.

## 5. Test multi-account privacy and engagement

### As Hongy

1. Create a post.
2. Confirm Hongy can edit its caption.
3. Add a comment.

### As Alex

1. Open the same Circle.
2. Confirm the post appears automatically.
3. Like the post.
4. Add a comment.
5. Confirm Alex cannot edit or delete Hongy's post.
6. Create a separate Alex-authored post.

### Back as Hongy

1. Confirm Alex's comment appears.
2. Confirm Hongy cannot edit or delete Alex's post.
3. Long-press Hongy's own comment and test deletion.

### As a pending or declined account

Confirm the account cannot open the Circle profile or access any Circle Post media.

## 6. Test deletion boundaries

Create both a chat-media Timeline item and a separate Circle Post.

Then verify:

- deleting a Circle Post removes that post, its comments, and post uploads;
- deleting a Circle Post does not delete the chat message or Timeline item;
- validly unsending a chat media message removes it from Chat and Timeline;
- unsending a chat message does not delete a separately created Circle Post.

This proves that Timeline and Posts remain different provenance paths.

## 7. Test ordinary direct chats

Open the Hongy–Alex direct chat.

Confirm:

- tapping the header still opens Alex's person profile;
- the information button still opens Details and Shared Media;
- there is no Circle profile or Circle Posts option;
- direct messaging and read receipts still work normally.

## 8. Commit after live testing

```powershell
git status
git add App.js src supabase/migrations docs README_CONVERSATIONS_STEP_9C.md
git commit -m "Add intentional private Circle posts"
git push
```

## Validation completed before delivery

The complete `App.js` and all five added or changed JavaScript modules passed Expo Babel transformation with `babel-preset-expo`.

Live Supabase execution, physical-device media selection, signed-URL loading, Realtime updates, and multi-account RLS behavior still require testing in your project.

# Universal Notifications Architecture — Step 9E.1

## Product rule

Circles has one private activity center. It does not matter whether the activity
originated from a personal profile post or a private Circle post.

The notification center now includes:

- Personal post likes
- Personal post comments
- Circle post likes
- Circle post comments
- New Circle posts
- Circle invitations

Direct-message content is still not copied into the activity stream. Messages
remain in the private inbox and use their own unread state.

## Authenticity behavior

Notifications represent current social reality rather than an immutable event
log:

- Users never receive notifications for liking or commenting on their own post.
- Removing a personal or Circle like removes the corresponding like
  notification.
- Deleting a comment removes its notification through the foreign-key cascade.
- Deleting a post removes all notifications targeting that post.
- A notification is visible only to its recipient through RLS.

## Database compatibility

The existing `circle_notifications` table is retained to avoid destroying Step
9E notification history or breaking older app clients. Step 9E.1 extends it into
the universal activity table with:

- `personal_post_id`
- `personal_comment_id`
- `personal_like`
- `personal_comment`

New generic RPCs are used by the current client:

- `get_my_notifications`
- `get_my_notification_unread_count`
- `mark_notification_read`
- `mark_all_notifications_read`

The old Circle-named RPCs remain available for compatibility.

## Badge behavior

The existing `get_my_notification_badge_count()` already counts all unread rows
in the activity table. Therefore personal post likes and comments immediately
contribute to the same live notification badge as Circle activity.

Conversation mute settings continue to suppress only activity belonging to that
specific conversation. Personal profile activity has no conversation ID and is
not accidentally silenced by a Circle mute.

## Navigation

- Personal like notification → personal `PostDetail`
- Personal comment notification → personal `PostDetail`
- Circle like/comment/post notification → `CirclePostDetail`
- Circle invitation → Inbox invitation area

## Intentionally not included yet

- Device push notifications while the app is closed
- Notification grouping such as “Alex and 3 others liked your post”
- Likes on comments
- Replies, mentions, or comment-thread notifications
- Account-wide switches for personal like/comment alerts

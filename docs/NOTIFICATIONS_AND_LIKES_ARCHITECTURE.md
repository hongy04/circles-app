# Circles Step 9E — Notifications, Preferences, and Circle Likes

## Product rules

1. **Unread truth is never erased by muting.** A muted conversation may still contain unread messages. The inbox continues to show those unread messages inside that conversation.
2. **Mute controls attention, not history.** Muting suppresses the global Circles badge and prevents new Circle post/interaction alerts while the mute is active.
3. **Preferences are member-specific.** Every member stores their own message, Circle-post, and interaction preferences in `conversation_members`.
4. **Circle likes are private.** Only accepted members of the Circle can see, add, or remove likes.
5. **Likes are lightweight acknowledgment, not public ranking.** There is no public discovery surface, recommendation system, or cross-Circle like total.
6. **Notifications are private activity records.** `circle_notifications` is protected by RLS and can only be read or marked by its recipient.

## Data model

### `conversation_members`

Added fields:

- `notifications_muted`
- `notifications_muted_until`
- `notify_messages`
- `notify_circle_posts`
- `notify_circle_interactions`

### `conversation_post_likes`

One row per `(post_id, user_id)`. The post relationship cascades on deletion, so deleting a Circle post also deletes its private likes.

### `circle_notifications`

Stores recipient-specific activity for:

- Circle invitations
- New Circle posts
- Comments on the recipient's Circle post
- Likes on the recipient's Circle post

Direct-message content does not get duplicated into this table. Message unread state remains authoritative through `conversation_members.last_read_at` and `conversation_message_reads`.

## Alert behavior

- **Global Circles tab badge:** unread unmuted messages + pending Circle invitations + unread Circle activity alerts.
- **Inbox conversation badge:** always shows the conversation's real unread-message count, even when muted.
- **Notification-center bell:** shows unread rows from `circle_notifications`.
- **Muted Circle:** does not create new post/like/comment notification rows during the active mute period.
- **Messages disabled:** messages remain unread in the conversation, but do not contribute to the global tab badge.

## Future device push integration

This checkpoint creates the in-app source of truth and delivery preferences. A later push checkpoint can add Expo push tokens and a trusted server/Edge Function that reads these same settings. No service-role key or push credential belongs in the mobile client.

# Circles Conversation Spaces — Product and Architecture Direction

## The idea

A direct message or group chat should not be only a disposable stream of text.
Creating any conversation automatically creates a private shared **Conversation
Space** for exactly those members.

The chat remains the immediate, everyday surface. The shared space becomes the
place where the relationship's history can be revisited and intentionally
built over time.

This is a core Circles feature, not a secondary messaging add-on.

## One conversation, four connected views

### 1. Chat

The familiar chronological message stream for text, reactions, replies, and
photo/video messages.

### 2. Timeline

A private chronological archive generated automatically from media that was
sent in the chat.

Important rule: the timeline should reference the original message media; it
should not upload or copy the file a second time. Every archived photo or video
keeps its original sender, timestamp, message context, and conversation.

The timeline is therefore a faithful shared-memory view, not a separate public
feed.

### 3. Posts

A separate, intentional post surface inside the Conversation Space. Members can
create classic multi-photo/video posts with captions and later comments or
reactions.

This remains distinct from the automatic timeline:

- **Timeline:** "This was sent while we were talking."
- **Post:** "We deliberately chose to preserve and present this here."

### 4. People / Details

Members, group name and photo, invitation controls, notification settings,
pinning, shared-media counts, and leave/remove-member actions.

A two-person DM uses the same architecture as a group; it simply has two
members and can present the other person's name/photo as its default identity.

## Privacy model

Conversation Spaces are membership-gated at the database level.

- Only current members may read the conversation, messages, timeline media,
  conversation posts, comments, and reactions.
- Only the message sender may edit or delete their message.
- Only the post creator may edit or delete their Conversation Space post.
- Removing or leaving a conversation removes future access to its private
  space unless a later product decision explicitly preserves historical access.
- Storage objects use conversation-owned paths and are served only through
  membership-aware access rules or signed URLs.

The client hiding a screen is never treated as the security boundary.

## Proposed data model

### `conversations`

- `id uuid`
- `kind text` (`direct` or `group`)
- `title text`
- `avatar_url text`
- `created_by uuid`
- `created_at timestamptz`

### `conversation_members`

- `conversation_id uuid`
- `user_id uuid`
- `role text` (`owner`, `admin`, `member`)
- `joined_at timestamptz`
- `last_read_at timestamptz`
- notification and pin preferences

A unique constraint on `(conversation_id, user_id)` prevents duplicate
membership.

### `messages`

- `id uuid`
- `conversation_id uuid`
- `sender_id uuid`
- `body text`
- optional reply reference
- `created_at`, `edited_at`, and deletion metadata

The current prototype's free-form `group_id text` should be replaced by a real
foreign key to `conversations.id`.

### `message_media`

- `id uuid`
- `message_id uuid`
- `storage_path text`
- `media_type text`
- dimensions, duration, and display order
- `created_at timestamptz`

The Timeline is primarily a membership-protected query over `message_media`
joined back to its original message and sender. A separate duplicate timeline
record is not required initially.

### `conversation_posts`

- `id uuid`
- `conversation_id uuid`
- `author_id uuid`
- `caption text`
- `created_at`, `updated_at`

Supporting tables:

- `conversation_post_media`
- `conversation_post_comments`
- `conversation_post_likes`

These are intentionally separate from personal-profile posts because their
audience and ownership belong to one private Conversation Space.

## Navigation direction

Opening an inbox item enters the Conversation Space with **Chat** as the default
view. A clear header control opens the shared profile page, where Timeline,
Posts, and People are available without making the user feel like they have
left the conversation.

The interface can later use a segmented control or horizontally swiped tabs:

`Chat | Timeline | Posts | People`

## Build sequence after multi-account testing

### Step 9A — Real conversation foundation

Create `conversations` and `conversation_members`, replace mock inbox groups,
move messages to membership-aware conversation IDs, and add strict RLS.

### Step 9B — Media messages and automatic timeline

Send photos/videos in chat, store one media object, and render the derived
chronological Timeline archive.

### Step 9C — Private shared profile and posts

Build the full Conversation Space page and its deliberate classic-post flow.

### Step 9D — Group lifecycle polish

Invites, roles, group editing, unread state, pinning, member removal/leaving,
notifications, and storage cleanup.

## Locked distinction

The automatic Timeline and the classic Posts surface must not be collapsed into
one feed. Their meaning is different, and that difference is the heart of this
feature: shared life can be remembered naturally while members still retain a
place for intentional expression.

## Step 9A decisions now locked

### Accepted connections automatically create DMs

An accepted one-to-one connection automatically creates one private direct
conversation. The conversation appears in both members' inboxes even before the
first message is sent. Pending requests and mutual-contact candidates do not
create a chat.

There must never be duplicate direct conversations for the same pair. The
server owns this invariant through a normalized pair key and database trigger;
it is not left to whichever client happens to open first.

### Groups are invitation-only

Creating a group does not immediately grant every selected person access.

1. The creator becomes the first accepted member and owner.
2. Only existing accepted connections may be selected.
3. Each selected person receives a separate pending invitation.
4. A pending invite may reveal only the invitation summary needed to decide.
5. Chat, Timeline, Posts, and People remain unavailable until that person
   explicitly accepts.
6. Declining grants no membership and no private-content access.

This invitation boundary is enforced in Supabase membership checks. Hiding the
group in the app is not considered sufficient privacy.

### Placeholder chats are retired

The old Family, Basketball Crew, College, Gaming, and similar sample chats are
not part of the product model. Step 9A archives the old free-form message table
and replaces the visible inbox with real accepted connections, accepted group
memberships, and pending private-group invitations.

## Inbox identity: pinned Circles

The inbox should retain the familiar clarity of iMessage while making Circles'
identity visible. Pinned conversations are presented as large circular items
above the standard message list.

Private groups begin pinned for every accepted member because group formation is
intentional and represents a shared Circle. Pin state remains personal: one
member may unpin a group without changing another member's inbox. Pending group
invitations never appear as pinned conversations because an invitation does not
yet grant membership or access.

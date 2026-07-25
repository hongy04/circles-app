# Circles Conversation Architecture — Locked Product Direction

## Core hierarchy

Circles distinguishes four related but different things:

1. **Person profile** — one individual's identity.
2. **Direct chat** — a private conversation between two accepted connections.
3. **Two-person Circle** — a direct chat intentionally promoted through mutual consent.
4. **Group Circle** — an invitation-only shared identity for three or more people.

The locked product rule is:

> People have profiles. Groups are Circles. Two-person chats become Circles only
> when both people explicitly agree.

The app must never infer a relationship category from message volume, media,
contact history, or behavior.

## Ordinary direct chats

An accepted connection automatically creates one direct conversation. That
conversation is not automatically a Circle.

A normal direct chat has:

- the other person's profile image and name in the chat header;
- a header tap that opens the other person's normal user profile;
- private text, photo, and video messages;
- a Shared Media/details view for sent photos and videos;
- no shared name, shared biography, shared avatar, Timeline, Posts, or Circle profile.

Shared Media is a private archive view over the original `message_media` rows.
It does not duplicate files and it does not claim that the two people have a
shared identity.

## Group Circles

A group with three or more intended members is created through individual
invitations. The creator becomes the first member; invited people gain no
access until they accept.

Once accepted, a group Circle has:

- a shared Circle name, avatar, and biography;
- an automatically generated Timeline from media sent in Chat;
- intentional private Circle Posts;
- members, invitations, pinning, unread state, and lifecycle controls;
- database and Storage access enforced through accepted membership.

Group Circle memberships are pinned by default for each member, while each
person may later unpin the Circle for themselves.

## Timeline versus Posts

These surfaces remain separate because they represent different kinds of truth.

### Timeline

Timeline is faithful shared history automatically derived from media sent in
Chat. It references the original `message_media` row and private Storage object.
It preserves sender, message context, timestamp, and conversation provenance.
It is never uploaded a second time merely to appear in Timeline.

When a chat message is validly unsent before anyone reads it, its Timeline item
disappears because both surfaces reference the same message.

### Posts

Posts are deliberate publications created specifically for the Circle profile.
They are not generated from Chat and do not silently copy Timeline media.

A Circle Post has:

- one to ten separately uploaded photos or videos;
- an optional caption;
- the creating member's identity and original timestamp;
- private comments from accepted Circle members;
- author-only caption editing and deletion.

Deleting a Circle Post removes that post's media and comments. It does
not delete or modify Chat or Timeline history. Deleting a chat message does not
delete a separately created Circle Post.

The Step 9C tables are:

- `conversation_posts`
- `conversation_post_media`
- `conversation_post_comments`

All access is membership-gated through RLS and membership-aware RPCs. The same
post architecture will automatically support a future two-person Circle after
that direct conversation is mutually promoted with `circle_enabled = true`.

## Circle Post ownership

Every accepted member may create a post for the Circle. A post remains visibly
attributed to its author; it is not an anonymous group-owned object.

Only the author may:

- edit the post caption;
- delete the post and its separately uploaded media.

Every accepted member may comment. Comment authors may delete their own comments.
Circle Posts intentionally avoid like counts so the private space does not become
a performance scoreboard. A future moderation system may add owner/admin intervention, but
Step 9C does not silently give every member destructive control over another
person's post.

## Future two-person Circle promotion

A direct chat may later expose **Create a Circle together**. This is a proposal,
not an automatic conversion.

The flow should be:

1. One member proposes a Circle name, optional image, and optional note.
2. The other member receives a neutral private invitation.
3. The existing direct chat remains unchanged until acceptance.
4. Acceptance promotes the same conversation; it does not create a duplicate
   chat or split message history.
5. Both members separately consent to whether older shared media may enter the
   new Timeline. The default should be to start the Timeline at activation.
6. Declining leaves the original DM and connection unchanged.

The database foundation uses:

- `kind = 'direct'`
- `circle_enabled = true`
- `circle_activated_at`

A group always has `circle_enabled = true`. A normal direct chat has
`circle_enabled = false`.

The invitation, unanimous-consent, historical-media-consent, and dissolution
workflows remain deferred until the main group Circle lifecycle is stable.

## Privacy boundaries

- Only accepted members may read conversation messages, Timeline media, Circle
  Posts, post comments, or private Storage objects.
- Pending invitees cannot open Chat, Timeline, Posts, People, or private media.
- A normal DM cannot create or view Circle Posts.
- Post uploads use the private `conversation-media` bucket under the path
  `<conversation-id>/posts/<author-id>/...`.
- The post-creation RPC validates that every attached path belongs to the
  current member and the intended Circle.
- The client UI is not the security boundary; RLS, membership-aware RPCs, and
  signed private Storage access enforce access.
- A normal DM never becomes a shared profile without explicit consent from both
  people.

## Read receipts and unread-only unsend

Circles treats reading as an automatic, truthful event rather than a cosmetic
setting. A message receives a per-user read receipt only when that conversation
is the focused screen and the app is active in the foreground.

The sender may unsend a message only while no other eligible member has a read
receipt for it. This rule is enforced by the database, not only hidden or shown
by the client. Text and media messages follow the same rule.

Direct conversations display `Not read` or `Read`. Group Circles display
`Not read`, `Read by N`, or `Read by all`. Exact receipt rows are stored in
`conversation_message_reads`; `conversation_members.last_read_at` remains the
conversation-level cursor used for inbox unread counts.

Circle Posts are intentional publications rather than transient messages, so
they use explicit author deletion instead of unread-only unsend.

## Build sequence

### Step 9A — real private conversations

Accepted connections create one deduplicated DM. Groups use invitation-gated
membership. Placeholder chats are retired.

### Step 9A.1 — Circles inbox identity

The inbox uses an iMessage-like layout. Group Circles are pinned by default and
appear as circular identities.

### Step 9B — media and Timeline foundation

Messages support private photo/video attachments. Group Circle Timelines derive
from those original attachments.

### Step 9B.3 — direct chats versus Circles

Direct headers open the other person's profile. Direct chats use Shared Media
rather than a Circle profile. Full Circle identity remains restricted to group
Circles and future mutually promoted two-person Circles.

### Step 9C — Circle Posts

Intentional private posts now live on Circle profiles with separate media,
captions, comments, author editing, and author deletion—without like counts. Timeline and
Posts remain provenance-distinct.

### Step 9D — lifecycle and consent polish

Roles, invite management, leaving/removal, notification controls, Storage
cleanup, and eventually mutually created two-person Circles.

# Circles — Step 33: Circle Posts in Feed

## What this changes

The main Feed remains strictly chronological, but now includes two kinds of posts that are already authorized for the viewer:

1. Personal posts from the viewer and accepted connections.
2. Circle posts from private Circles the viewer currently belongs to.

There is no recommendation score, popularity ranking, paid boost, or community/public content mixed into the Feed.

## Circle post identity

A Circle post still belongs to the person who authored it. The Feed header reads as the author first and then a distinct private Circle context line:

`Eric`
`○ in College Friends 🔒 · 2h`

- Tapping the author opens that person's profile.
- Tapping the Circle name opens the Circle profile.
- Tapping the media opens `CirclePostDetail`, not ordinary `PostDetail`.
- Circle comments and likes use the existing private Circle-post APIs.
- An author can edit/delete their own Circle post from the Feed.
- Personal-post owner controls and Mutuals Preview remain personal-post-only.

## Migration 086

`supabase/migrations/20260806_086_circle_posts_in_feed.sql`

Adds `public.get_feed_v3(integer, timestamptz)`, a single chronological read model that unions eligible personal posts and eligible private Circle posts before pagination.

Circle visibility is still membership-gated. A Circle post is only eligible when the authenticated user is currently a member of that group/two-person Circle.

The migration also adds a global `conversation_posts(created_at desc)` read index for the mixed chronological Feed.

Apply with:

```bash
npx supabase db push
```

## Performance

- One Feed RPC determines the mixed chronological page.
- Circle media paths for the visible page are signed together through the existing `conversation-media` signed-URL cache.
- No per-Circle or per-post fanout is introduced.
- Feed realtime now listens to Circle-post changes as well as personal posts.

## Files

- `src/services/feedService.js`
- `src/screens/feed/FeedScreen.js`
- `src/components/feed/PostCard.js`
- `supabase/migrations/20260806_086_circle_posts_in_feed.sql`

## Validation

- `node --check` passed for the three changed JavaScript files.
- iOS Expo/Hermes production export passed at 2,122 modules.

## Test checklist

1. Apply Migration 086.
2. Create a personal post from a connected account and a Circle post inside a Circle shared with the viewer.
3. Open Feed. Confirm both appear in pure newest-first chronological order.
4. Confirm the Circle post clearly shows the human author plus `in <Circle name>` with a private lock.
5. Tap the author: profile opens.
6. Tap the Circle name: Circle Profile opens.
7. Tap Circle-post media: Circle Post Detail opens.
8. Like/comment directly from Feed and confirm the Circle's own post surface reflects the same counts.
9. As the Circle-post author, test Edit Caption and Delete Post from Feed.
10. Confirm a user who is not a member of that Circle cannot receive that Circle post in Feed.
11. Confirm ordinary Feed ordering is chronological; there should be no ranking/recommendation behavior.

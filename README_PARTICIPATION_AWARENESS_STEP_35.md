# Circles Step 35 — Participation Awareness + Global Notifications

This step gives the temporary profile-card idea a specific usability job: surface only current Circle activity that still needs the viewer, then disappear when the viewer handles it.

## What changed

### Quiet Message retired from Our Circle profile
The old `A quiet message from ...` profile card is no longer rendered. Its backend fields are intentionally left untouched for compatibility, but the UI now has a cleaner division:

- Write Your Thoughts = deliberate, persistent shared writing
- future Whisper = lightweight, temporary personal interaction

### Active participation card
On the Posts side of Circle Profile, one compact card can appear when something actually needs the viewer:

- unanswered availability poll → **Vote**
- upcoming event with no RSVP → **RSVP**
- Our Circle plan proposal waiting for the other person → **Respond**
- newly shared Our Circle thought not yet opened → **Read**

Only the first unresolved item is expanded. If more exist, the card quietly says `+N waiting` instead of stacking several cards and cluttering the profile.

The card is state-driven, not engagement-driven. There is no ranking by likes, activity, or predicted interest.

### Interaction resolves the prompt
- voting resolves the poll prompt
- RSVP resolves the event prompt
- accepting or marking a plan tentative resolves the plan prompt
- opening a shared Thought marks it read and resolves the Thought prompt

Thoughts do not require a reply. Reading is enough.

### Global Notifications
New participation also enters the existing universal Notifications center:

- new event needing RSVP
- new availability poll needing a vote
- new Our Circle plan proposal
- newly shared Our Circle Thought

Notification rows name the relevant event/poll/plan and open the exact destination instead of only opening the Circle.

When the user handles an event, poll, plan, or Thought elsewhere in the app, the related unread participation notification is automatically marked read. This prevents stale notification badges for tasks already handled.

Conversation notification preferences are respected for global notification creation. If a user has muted Circle interactions, the global notification is skipped, while the current-state card can still appear when they intentionally enter the Circle.

## Migration

Apply Migration 087:

```bash
npx supabase db push
```

Migration:

`supabase/migrations/20260807_087_participation_awareness_notifications.sql`

The migration does **not** backfill old activity into Notifications. Only new participation created after the migration generates these global notifications.

No Edge Function deployment, native change, or EAS rebuild is required.

## Suggested test matrix

### Group Circle poll
1. Account A creates an availability poll.
2. Account B should receive a global notification.
3. Opening the Circle should show the Vote card.
4. Account B votes.
5. Return to Circle Profile: the card should be gone.
6. The related notification should no longer be unread.

### Group Circle event
1. Account A creates a future event.
2. Account B should receive a global notification.
3. Circle Profile should show the RSVP card.
4. Account B chooses Going / Maybe / Can't go.
5. Return to Circle Profile: the card should be gone.
6. The related notification should no longer be unread.

### Our Circle plan
1. Account A proposes a shared plan.
2. Account B should receive a global notification and Respond card.
3. Account B accepts or marks tentative.
4. Return to Our Circle: the card should be gone and notification resolved.

### Write Your Thoughts
1. Account A shares a Thought.
2. Account B should receive a global notification and Read card.
3. Account B opens the Thought from either the card, Notifications, or the Thoughts screen.
4. Return to Our Circle: the card should be gone.
5. No response is required.

### Quiet Message
The legacy `A quiet message from ...` card should no longer appear on Our Circle Profile.

## Validation

- changed JavaScript files pass `node --check`
- iOS Expo/Hermes production export passed
- **2,123 modules bundled**

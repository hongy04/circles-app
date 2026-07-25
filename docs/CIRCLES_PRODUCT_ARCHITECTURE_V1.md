# Circles Product Architecture v1

**Status:** Product decisions consolidated and ready to guide implementation  
**Purpose:** Source of truth for product direction, privacy rules, user states, MVP boundaries, and build order  
**Version:** 1.0  
**Date:** July 2026

---

## 1. Product thesis

### Core promise

**Circles helps real friend groups make plans, bring trusted people together, and keep the connections that come from them.**

Circles is not a public social network, a smaller Instagram, or a swipe-based dating marketplace. It is a private social system built around real relationships, real gatherings, and deliberate progression.

### Core product loop

```text
Trusted Circles
→ real plans and gatherings
→ controlled introductions and guests
→ shared event history
→ new real-world connections
→ optional mutual romantic interest
→ Mutual Focus
→ optional two-person Circle
```

### Core principles

1. **Real-world overlap earns context, not access.**
   Meeting at the same event or sharing mutual contacts can make someone discoverable, but it does not automatically expose their private profile, posts, or messages.

2. **People are primary; content supports relationships.**
   Posts, photos, events, and timelines should help people remain connected. They should not turn users into engagement inventory.

3. **Romance emerges from the trusted social graph.**
   Circles does not present a catalog of strangers. Romantic interest is available only after two people are accepted connections.

4. **Deeper stages require current mutual consent.**
   Mutual interest, Mutual Focus, and creating a two-person Circle are separate decisions. The app never treats one stage as permission for the next.

5. **Repeated usefulness should create adoption.**
   Guests can attend events, RSVP, and see event photos without being forced to install the app. Continued real-world usefulness should make joining feel natural.

6. **No popularity marketplace.**
   Circles should not rank people by likes, followers, public connection counts, or engagement scores.

---

## 2. What Circles is—and is not

### Circles is

- A private network of accepted connections
- A home for real friend groups
- A planning and event system
- A shared history of gatherings and relationships
- A trusted-context discovery system
- An optional relationship progression layer

### Circles is not

- A global public feed
- A searchable catalog of strangers
- A follower economy
- A swipe-based dating app
- A match-collection game
- A relationship scorekeeper
- A forced daily check-in or streak product
- A system that infers commitment without explicit mutual choice

---

## 3. Core entities

### Person

An individual user with:

- Private profile
- Profile photo, name, and short bio
- Personal posts
- Optional stories or temporary updates
- Accepted connections
- Mutual and shared-event context
- Privacy and romantic-visibility settings

### Connection

A two-way accepted relationship between two users.

A connection enables:

- Full profile access according to the user’s privacy settings
- Personal-feed posts
- Direct messaging
- Optional romantic channel eligibility

A connection is not automatically romantic.

### Circle

A persistent private group with three or more members by default.

Primary Circle areas:

- **Chat**
- **Posts**
- **Timeline**
- **People / Details**
- **Plans / Events**

A future two-person Circle is created only through the relationship progression described later.

### Event

A real-world gathering attached to one or more Circles, connections, or invited guests.

An event contains:

- Title, date, time, and location
- Host
- Invited Circles and people
- Availability polling when needed
- RSVP state
- Guest and plus-one rules
- Attendee list
- Photos and post-event history

### Plan

A lightweight version of an event, especially useful inside a two-person Circle.

A plan can move through:

```text
Idea → proposed → scheduled → completed → memory
```

### Two-person Circle

A mutually created shared relationship space available after Mutual Focus.

It is a distinct shared Circle profile linked to the two users and their existing direct connection. It does not erase their identities or automatically publish their old private messages into a shared archive.

---

## 4. Main product surfaces

## 4.1 Feed

The Feed remains a chronological stream of personal posts from accepted connections.

Rules:

- Only accepted connections appear
- Posts are ordered chronologically, not by engagement optimization
- Circle-only posts remain inside their Circle
- No recommended strangers
- No public popularity ranking

The Feed answers:

> What have the people I am connected to shared recently?

## 4.2 Mutuals

The Mutuals surface is a trusted discovery list for people the user is not yet connected with but shares legitimate context with.

Possible context includes:

- Mutual connections
- Shared Circles
- Shared events
- Direct invitation context

Each person appears once and may show:

- Profile photo and name
- Shared-context labels
- One intentionally selected **preview post**, when enabled
- A profile-only card when no preview post is selected

Rules:

- The latest ordinary private post is never exposed automatically
- The user intentionally chooses a post as their mutual-visible preview
- Circle posts never become preview posts
- Tapping the card opens a private pre-connection profile shell
- Full posts remain hidden until the connection request is accepted
- Messaging remains unavailable until connection, unless another explicit product rule grants it

The Mutuals surface answers:

> Who is already near my real social world, and what small amount of context have they chosen to share?

## 4.3 Connections

The full Connections directory contains all accepted connections, including those formed through:

- Contacts
- Mutual friends
- Shared events
- Circle introductions
- Direct invitations

“Mutuals” should not be used as the universal label for accepted connections because not every connection originates through mutual contacts.

## 4.4 Circle profile

Every Circle has a shared private profile with:

- Circle name and image
- Short description
- Members and roles
- Posts
- Timeline
- Chat
- Plans and events

The Circle is a persistent home, not merely a temporary group chat.

---

## 5. Launch growth architecture

A generic “download Circles” link is not enough. Invitations should carry immediate social context.

## 5.1 Invitation types

### Personal invitation

> Eric invited you to connect on Circles.

The recipient joins, creates an account, and still chooses whether to accept the connection.

### Circle invitation

> Eric invited you to join College Friends on Circles.

The recipient understands exactly which group they are joining.

### Group invitation

A user can create a Circle and share one link into an existing iMessage, WhatsApp, Discord, or other group chat.

This is the strongest early-network invitation because an existing group can migrate together.

### Event invitation

> Eric invited you to Game Night hosted through Circles.

A recipient can RSVP through the web without installing the app.

## 5.2 Contact invitation rules

- Contact access is optional
- Users choose whom to invite
- Circles never messages an entire address book automatically
- Users can share a link without granting contact access
- Invite state should be visible so people are not repeatedly spammed
- Automated reminders should be minimal or absent
- An invitation creates context, not automatic profile access

## 5.3 Growth loops

```text
Personal invite → new connection

Circle invite → existing group joins together

Event invite → guest attends without installing

Repeated event exposure → guest eventually joins Circles

Guest joins → claims attendance → discovers people they actually met
```

---

## 6. Event architecture

Events are the primary bridge between existing Circles and new real-world relationships.

## 6.1 Event creation

A host can create an event for:

- One Circle
- Multiple Circles
- Selected connections
- Controlled outside guests

Example:

> College Friends + Work Friends Game Night

## 6.2 Event tools

Core tools:

- Date, time, location, and description
- Going / Maybe / Not Going
- Availability poll before finalizing a date
- Invite one or more Circles
- Add individual invitees
- Host-controlled guest cap
- Host-controlled plus-one permissions
- One-layer outside-guest invitation chain

A non-user guest cannot invite additional guests unless the host explicitly allows it through a Circles user or the guest later joins the app.

## 6.3 Outside guest web experience

A non-user can view:

- Event title
- Host name
- Date, time, and location as permitted
- Attendee names and photos
- Who invited whom, such as “Maya — invited by Alex”
- Event photos after the gathering

A non-user can:

- RSVP with a name
- Appear in the attendee list
- View event photos

A non-user cannot:

- Open private Circles profiles
- View private posts
- Send messages
- Use romantic-interest features
- Continue inviting others unless allowed through the event’s rules

## 6.4 Attendance

Circles should not require QR codes, location tracking, or explicit check-in rituals.

Default rule:

> A guest marked Going is presumed to have attended unless the host edits the list afterward.

After the event, the host may receive a quiet optional prompt:

> Who made it?

Host confirmation may be required before enabling higher-sensitivity features such as shared-event romantic eligibility or event-based reconnection, when accuracy matters.

## 6.5 Event photos

Event photos are one of the strongest post-event value loops.

Rules:

- Event attendees, including non-user guests, can view event photos on the web
- Photos should not be held hostage behind an app installation
- App users gain convenience and deeper participation, not artificial access restriction
- Photos become part of the event’s history
- Completed events can appear in Circle Timelines

## 6.6 Post-event discovery

After an event:

- All attendees remain visible in the event history
- Circles users are tappable
- Non-user guests remain name/photo/inviter entries only
- Shared attendance does not automatically create a connection
- Users can send ordinary connection requests
- The host does not control who connects afterward

A pre-connection profile may show context such as:

- Met at Game Night
- 3 mutual connections
- 1 shared Circle
- 2 shared events

Preferred pre-connection context metrics:

- Mutual connections
- Shared Circles
- Shared events

Avoid emphasizing total public connection counts.

---

## 7. Connection and privacy architecture

## 7.1 Pre-connection profile

A non-connection may see only:

- Profile photo
- Name
- Short profile shell
- Mutual/shared-context indicators
- Optional selected preview post
- Connection-request action

They do not see the full post history.

## 7.2 Accepted connection

After acceptance:

- Both users can access each other’s connection-visible profile content
- Both can direct message
- Both appear in each other’s Feed
- Romantic eligibility may become available only when all related consent conditions are satisfied

## 7.3 Blocking and removal

Blocking or removing a connection should:

- Remove ordinary profile access
- Close the romantic channel
- Clear private romantic selections
- End Mutual Focus if active
- Prevent future direct interaction according to safety rules

Shared historical event records may remain as factual event history, but interaction access should be removed.

---

## 8. Romantic layer: product philosophy

The romantic layer is not a separate dating marketplace. It is a consent-based progression between two accepted connections who already exist in each other’s real social world.

### Product principle

> Romantic access between two people must be reciprocal, even before romantic interest itself becomes mutual.

### Progression

```text
Accepted connection
→ romantic channel available
→ private interest
→ Mutual Interest
→ Mutual Focus
→ optional two-person Circle
```

---

## 9. Romantic visibility and audience rules

## 9.1 Global setting

Romance is off by default.

A user may enable:

> Open to romantic connections

They then choose who may see the heart on their profile.

## 9.2 Audience options

Supported audience-building approaches may include:

- All accepted connections except excluded people
- Selected people only
- Current members of selected Circles as a one-time shortcut
- Connections from selected shared-event or mutual contexts
- Advanced combinations with individual exceptions

## 9.3 Default and per-person state

The user’s audience rule establishes defaults, but each accepted connection ultimately has an independent romantic-visibility state.

Example:

- A user selects “All accepted connections except…”
- New connections inherit romantic visibility by default
- The user can disable visibility for a specific person from that person’s settings

Selecting a Circle is a shortcut that selects its currently eligible members. It is not a permanent live permission that automatically includes every future Circle member.

## 9.4 Pair-level channel rule

The romantic channel between two accepted connections is open only when:

- Both have enabled Open to romantic connections
- Both audience settings include the other person
- Neither has disabled romantic visibility for the pair
- They remain accepted connections
- Neither has blocked the other

If either person closes romantic visibility for the pair:

- Neither sees the heart
- The channel closes in both directions
- Unmatched private interest between them is cleared
- Any active romantic state ends according to the state rules below

The app never explains why a heart is absent. Absence may result from global settings, audience choices, exclusions, pause state, or other eligibility rules.

---

## 10. Mutual Interest

## 10.1 Private interest

When the romantic channel is open, a subtle heart appears on the connected person’s profile.

Tapping it opens confirmation copy such as:

> Want to get to know Maya better?  
> This stays private unless she chooses you too.

The selection is visible only to the person who made it.

## 10.2 Mutual reveal

When both independently choose each other, the next direct-chat opening reveals:

> **The interest is mutual.**  
> Keep getting to know each other. When you’re both ready, you can choose to focus on this connection.

Experience:

- Circles logo transforms into a heart
- Chat briefly receives a warm celebration treatment
- The primary action is Continue chatting
- No immediate Focus decision is demanded

Mutual Interest means:

> We both want to explore this.

It does not mean exclusivity, official dating, or a relationship label.

## 10.3 Ending Mutual Interest

Either person can deactivate the romantic state.

When deactivated:

- Both private selections reset
- Mutual-interest styling disappears
- Both return to an ordinary connection
- Future romantic interest requires two fresh current selections
- Messages remain

The app may show a quiet factual status on the next open, without a dramatic rejection alert.

---

## 11. Mutual Focus

Mutual Focus is the deliberate step that differentiates Circles from disposable match collection.

## 11.1 Private selection

Either person may privately choose:

> Focus on this connection

The other person is not notified unless they independently choose the same thing.

## 11.2 Mutual activation

When both select Focus:

> **You’re focusing on each other.**  
> Romantic discovery with other connections is now paused while you explore this one.

Effects:

- Romantic visibility pauses with everyone else
- Hearts disappear from other profiles
- Unmatched private selections involving other people are cleared
- Ordinary friendships and messages remain unchanged
- Only one Mutual Focus connection can be active at a time
- The two-person Circle proposal becomes available

Mutual Focus means:

> We are choosing to give this connection a real chance.

It does not automatically declare public relationship status.

## 11.3 Ending Focus

If either person ends Focus:

- The entire romantic state between them resets
- They return to an ordinary connection
- Both heart selections clear
- Focus styling disappears
- The two-person Circle proposal becomes unavailable
- Their ordinary direct connection and messages remain
- Outside romantic visibility remains paused until each person deliberately re-enables it

This is intentionally stronger than returning to a weaker Mutual Interest state.

Product principle:

> Circles does not preserve romantic momentum after one person has stopped choosing it.

---

## 12. Two-person Circle

## 12.1 Eligibility

A two-person Circle can be proposed only while Mutual Focus is active.

There is no universal waiting period. Timing depends on the people and context.

## 12.2 Proposal

The invitation is direct:

> Eric wants to create a Circle with you.

The recipient chooses:

- **Create our Circle**
- **Not yet**
- **End Focus**

## 12.3 Acceptance

If accepted:

- A shared two-person Circle profile is created
- Mutual Focus remains the existing exclusivity state
- Creating the Circle does not separately switch off outside romantic visibility because Focus already did that
- The existing direct connection and message history remain intact
- Old messages or media are not automatically republished into the shared Circle Timeline

## 12.4 Decline / Not yet

If the recipient chooses Not yet:

- Mutual Focus remains active
- The proposal does not repeat automatically
- The original proposer loses the ability to propose again
- The person who declined holds the right to make the next proposal
- No reminders pressure them to do so

This prevents repeated requests while preserving the possibility that the timing—not the relationship—is the issue.

## 12.5 Ending Focus after a two-person Circle exists

Ending Focus does not automatically erase or delete the two-person Circle’s shared history.

The romantic state and the persistent shared space are separate systems. Archiving, dissolving, or changing the Circle requires its own explicit process.

---

## 13. Two-person Circle feature hierarchy

The two-person Circle should begin simple.

## 13.1 Core

### Shared profile

- Shared name and image
- Short shared bio
- Shared posts
- Private Timeline
- Two equal members

The shared profile itself is a meaningful relationship milestone.

### Plans

A reduced version of the event system:

- Suggest a date or activity
- Propose dates and places
- Accept, suggest changes, or mark tentative
- Save unscheduled ideas
- Add notes and locations
- Mark completed
- Attach photos afterward
- Convert completed plans into memories

Lifecycle:

```text
Idea → scheduled plan → shared experience → Timeline memory
```

### Timeline and posts

- Preserve completed plans and shared experiences
- Add deliberate shared posts
- Keep old private DM content separate unless intentionally added

## 13.2 Later additions

### Important dates

- Dates and trips
- Birthdays and anniversaries
- Recurring traditions
- Dates that matter to the pair

This should not become a general productivity calendar.

### Write your thoughts

A lightweight voluntary writing action:

```text
Write privately → edit until ready → Share with our Circle
```

Possible uses:

- A longer thoughtful message
- A letter
- An apology or reconciliation message
- A reflection after an experience

No streaks, frequency scoring, emotional grading, or required prompts.

---

## 14. Notifications

Notifications should support real activity without creating pressure.

Existing categories include:

- Personal post likes and comments
- Circle post likes and comments
- New Circle posts
- Circle invitations
- Direct and Circle messages

Future event notifications:

- Event invitation
- RSVP update relevant to the host
- Plan finalized or changed
- New event photos
- Optional post-event host attendance review

Future romantic notifications must remain privacy-protective:

- No notification for one-sided private interest
- No notification for one-sided Focus selection
- Notify only when the state becomes mutual
- No explanation when romantic visibility disappears
- A declined two-person Circle proposal is communicated directly but without public exposure

Muting remains per conversation and should not silence unrelated personal-profile activity unless the user separately changes those preferences.

---

## 15. Safety and consent guardrails

Required principles:

- No romantic interest toward non-users
- No stored secret romantic targeting before a person joins and consents
- No romance feature before accepted connection
- Pair-level visibility must be reciprocal
- Blocking immediately closes romantic access
- A declined two-person Circle proposal cannot be repeated by the same proposer
- Ending Focus resets the romantic state
- No public dating status inferred from Mutual Interest or Focus
- No location-based attendance surveillance
- No relationship-health scoring
- No streaks measuring affection
- No public popularity ranking
- Reporting, blocking, age eligibility, and abuse-response policies must be complete before the romantic layer is publicly released

---

## 16. Current foundation already implemented

The existing application already contains substantial infrastructure:

- Authentication and onboarding
- Profiles and account management
- Personal posts
- Stories
- Comments and likes
- Direct messaging
- Group/Circle conversations
- Circle profiles
- Circle Posts, Timeline, Chat, and People
- Circle invitations and roles
- Media messaging and unsend behavior
- Read receipts
- Inbox and pinned Circles
- Notifications and preferences
- Supabase-backed private data rules

This means the project should not restart. The new architecture should reshape and extend the current foundation.

---

## 17. MVP boundaries and phased rollout

Building every relationship feature before Circles has a functioning social graph would create unnecessary complexity. The product should grow in layers.

## Phase 1 — Social launch foundation

**Goal:** A new user can bring real people onto Circles and immediately understand its purpose.

Build:

- Personal invite links
- Contact selection and invitations
- Circle/group invitation links
- Connection request flow
- Clear Connections terminology
- Feed remains chronological from accepted connections
- Mutuals discovery list
- Optional selected preview post
- Private pre-connection profile shell
- Feature flags and analytics for new flows

Pass condition:

> A founder user can create a Circle, invite an existing group, form accepted connections, and see a living but private social network.

## Phase 2 — Events and guest growth

**Goal:** Circles becomes useful even before every attendee installs it.

Build:

- Create event for one or multiple Circles
- Availability poll
- RSVP states
- Guest cap and plus-one rules
- Web invitation and RSVP
- Outside guest attendee identity
- Event photo gallery viewable on web
- Optional host attendance review
- Completed event history

Pass condition:

> A real gathering can be planned, attended by users and non-users, and preserved without forcing app installation.

## Phase 3 — Shared-event social graph

**Goal:** Real gatherings naturally create new trusted connections.

Build:

- Post-event attendee list
- Shared-event context on profile shells
- Connection requests from event history
- Claim guest attendance after joining
- Mutuals ranking by legitimate social proximity, not engagement
- “Let’s do this again” and organizer re-invite signals

Pass condition:

> A guest can join later, claim the event, and connect with people they genuinely met without receiving automatic access.

## Phase 4 — Romantic channel beta

**Goal:** Test private mutual interest only after the social graph and safety controls are functioning.

Build:

- Open to romantic connections setting
- Audience defaults and per-person overrides
- Pair-level reciprocal visibility
- Subtle profile heart
- Private interest storage
- Mutual Interest reveal
- State reset and blocking behavior

Pass condition:

> Interest remains fully private unless mutual, visibility boundaries work reliably, and no action routes around connection consent.

## Phase 5 — Mutual Focus

**Goal:** Provide an intentional alternative to disposable match collecting.

Build:

- Private Focus selection
- Mutual Focus reveal
- Pause outside romantic visibility
- Clear other unmatched selections
- End-Focus reset behavior
- Focus-specific status and chat treatment

Pass condition:

> Two users can mutually choose focus, and either can end it without leaving stale or ambiguous romantic state.

## Phase 6 — Two-person Circle

**Goal:** Let a focused pair create a shared private home.

Build:

- Straightforward proposal
- Accept / Not yet / End Focus
- Proposal-right transfer after Not yet
- Shared Circle profile
- Plans
- Shared posts and Timeline
- Separate shared-space archival controls

Pass condition:

> A focused pair can create and use a shared profile without exposing old private content or weakening either person’s consent.

## Phase 7 — Relationship depth

Only after real use demonstrates demand:

- Important dates
- Lightweight shared calendar
- Write your thoughts
- Trip/occasion albums
- Deeper plan-to-memory workflows

Do not build therapy-like scoring, streaks, or automated relationship judgments.

---

## 18. Product health metrics

Metrics should measure useful relationship activity, not addictive engagement.

### Activation

- Invitation opened
- Account created from invitation
- Circle joined
- First connection accepted
- First post or message

### Social health

- Connection-request acceptance rate by context
- Circle invitation conversion
- Percentage of users with at least one active Circle
- Meaningful two-way conversation rate
- Block/report rate

### Event health

- Events created
- RSVP completion
- Attendee participation
- Event photo views
- Repeat hosting
- “Let’s do this again” signals
- Guest return across multiple events
- Guest-to-user conversion after repeated exposure

### Discovery health

- Mutual preview views
- Connection requests from legitimate context
- Acceptance rate after shared event
- Rate of unwanted or reported requests

### Romantic-layer guardrails

Do not optimize for total matches.

Prefer:

- Percentage of mutual interests leading to meaningful conversation
- Rate at which people voluntarily choose Mutual Focus
- Safety incidents and blocks
- Proposal decline pressure complaints
- State-consistency errors

The goal is not more romantic actions. The goal is clearer and more intentional relationship progression.

---

## 19. Locked decisions versus deferred details

## Locked

- Feed stays chronological from accepted connections
- Mutuals remains a separate trusted discovery surface
- Mutuals may show one intentionally selected preview post
- Full profiles remain private until connection acceptance
- Contact, Circle, group, and event invitations are core growth paths
- Events can combine Circles and controlled outside guests
- Guests can RSVP and view photos on the web
- Shared attendance gives context, not automatic connection
- Romantic interest requires accepted connection
- Romantic visibility is reciprocal at the pair level
- Mutual Interest does not imply exclusivity
- Mutual Focus requires two private selections and pauses outside romance
- Ending Focus resets the entire romantic state
- Two-person Circle is available after Mutual Focus
- A declined proposal keeps Focus active and transfers the next proposal right
- Two-person Circle centers on shared profile, plans, posts, and Timeline

## Recommended implementation choices

- Circle audience selection acts as a snapshot shortcut, then becomes person-level state
- Direct chat remains linked to the two-person Circle, but old content is not automatically moved into shared history
- Romantic rollout occurs after the social/event graph is stable
- Event photos remain accessible to invited guests without forced installation

## Deferred until validated by use

- Important dates and shared calendar depth
- Thought/letter formats beyond a lightweight share action
- Couple-specific albums and richer planning tools
- Optional two-person Circle labels or public presentation
- Advanced event-host tools

---

## 20. One-sentence positioning

**Circles is the private social app where real friend groups make plans, meet through trusted context, and build the relationships that grow from those experiences.**

## 21. Short product narrative

You join because someone real invited you—to connect, join a Circle, or attend an event. You use Circles to stay close to people you actually know, see what accepted connections share, and plan gatherings across your groups. Events create new real-world context without giving strangers automatic access. When a connection becomes meaningful, both people may privately recognize mutual interest, deliberately choose Mutual Focus, and eventually create a two-person Circle that belongs to them.

That progression is the product.

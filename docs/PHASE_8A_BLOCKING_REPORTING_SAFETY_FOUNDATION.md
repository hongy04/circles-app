# Phase 8A — Blocking and Reporting Safety Foundation

## Goal

Add the user-facing safety controls required before Circles can responsibly
release its romantic layer beyond private testing.

This phase implements immediate blocking and private reports. It does not yet
replace the need for moderation staffing, response-time policies, escalation
procedures, or an internal abuse-review console.

## Blocking

A user can block any non-self profile they can currently open, including:

- an accepted connection;
- a pending request;
- a Mutuals candidate;
- a reviewed shared-event attendee.

Blocking is silent. The blocked person is not notified and cannot query who
blocked them.

Blocking immediately:

- removes pending connection requests in both directions;
- removes an accepted connection in both directions;
- removes direct profile and personal-post access;
- removes direct-message access;
- clears one-sided romantic interest, Mutual Interest, Focus, and proposal
  state;
- locks an existing two-person Circle while preserving its history;
- removes pending direct Circle invitations between the pair;
- removes existing private notifications generated directly between the pair;
- excludes the pair from Mutuals and interactive post-event discovery.

Blocking does not erase factual shared history. If both people remain members
of a larger group Circle or attended the same event, names and historical
content may remain in those private group/event records. Blocking suppresses
new direct interaction and direct notifications; it does not silently remove a
person from someone else's group Circle.

## Unblocking

The blocker can review blocked accounts under:

`Me → Settings → Blocked accounts`

Unblocking does not restore:

- a connection;
- a connection request;
- a direct conversation membership;
- romantic visibility or selections;
- Mutual Interest or Mutual Focus;
- an Our Circle.

Any later relationship must begin again through the ordinary consent flow.
A reverse block, when present, remains in force.

## Reporting

A report contains:

- the reporting account;
- the reported account;
- one controlled reason;
- optional details up to 2,000 characters;
- the source surface;
- a private moderation status.

Supported reasons:

- Harassment or bullying
- Unwanted romantic contact
- Impersonation
- Spam or scam
- Safety concern
- Something else

Reports are stored privately. The reported person cannot read the report or
learn who submitted it. The reporting screen may optionally block the account
after the report is saved.

## Database enforcement

Blocking is enforced below the UI through:

- a pair-level block helper;
- triggers preventing new connection requests and accepted connections;
- a trigger preventing new direct messages across a block;
- a trigger preventing private Circle invitations across a block;
- block-aware profile RPCs;
- block-aware Mutuals ranking;
- block-aware shared-event connection discovery;
- block-aware Circle notification triggers.

This means a stale or modified client cannot route around the block through an
older invitation, request, or direct-message screen.

## Analytics

Safety analytics record only these controlled actions:

- `safety_user_blocked`
- `safety_user_unblocked`
- `safety_user_reported`

They do not include:

- either account's identifier;
- report reason;
- report details;
- profile names;
- conversation, Circle, event, or pair identifiers.

The report table itself necessarily retains the reported account, reason, and
optional details for private moderation review. That private operational data
is separate from product analytics.

## Still required before broad public release

This phase establishes the product and database safety boundary. A public
romantic release still requires:

- written abuse-response and escalation policies;
- moderation access controls and audit logging;
- report-review tooling;
- response-time targets;
- emergency and legal escalation procedures;
- age-policy enforcement beyond self-confirmation where required;
- a complete end-to-end safety review.

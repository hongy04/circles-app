# Phase 3D — Trusted Mutuals Ranking

## Purpose

Mutuals should help a person understand who is already near their real social
world. It must not become a popularity feed, an engagement recommendation
system, or a catalog of strangers.

## Candidate contexts

A person may appear only when at least one legitimate relationship context
exists:

1. Confirmed attendance at the same reviewed event
2. Current membership in the same private Circle
3. One or more accepted mutual connections
4. A mutual-contact edge created through privacy-safe contact matching

Accepted connections and either-direction pending requests are excluded.

## Ordering

Candidates are ordered by relationship evidence, not content performance:

1. Shared reviewed events
2. Shared Circles
3. Mutual accepted connections
4. Mutual contact
5. Recency of the legitimate context as a tie-breaker

Posts, preview availability, likes, comments, activity frequency, total
connection counts, and profile popularity never affect rank.

## Interface

Each candidate card explains why the person appears, such as:

- Met at Game Night
- 2 shared events
- 1 shared Circle
- 3 mutual connections
- Mutual contact

The existing intentionally selected Mutuals preview remains optional. A
candidate without a preview still appears as a compact profile card.

## Privacy

The RPC returns only display-safe candidate information and aggregate shared
context. It does not return Circle names, mutual-connection identities, total
connection counts, private posts, messages, or unrelated event history.

Tapping a candidate still opens the existing privacy-safe pre-connection shell.
Full profile access continues to require an accepted connection.

## Remote control

`trusted_mutuals_ranking` can be disabled to fall back to the original
contact-based `mutual_candidates` RPC without disabling Mutuals entirely.

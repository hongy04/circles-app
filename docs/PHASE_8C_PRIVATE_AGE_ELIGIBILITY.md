# Phase 8C — Private Age Eligibility

## Purpose

Replace the romantic layer's client-supplied 18+ checkbox with a private,
server-enforced date-of-birth boundary. This is an in-product eligibility
control, not full identity or age verification.

## Product behavior

- Birth date is entered once and remains visible only to the account owner.
- It is not returned by profile, discovery, event, connection, or moderation
  directory queries.
- It is not written to analytics.
- Romantic features remain unavailable until the account is at least 18.
- Turning 18 makes the account eligible, but romantic discovery still remains
  off until the user deliberately enables it.
- Social profiles, Circles, events, connections, and ordinary messaging do not
  depend on romantic age eligibility.

## Existing romantic state

Prior self-attestation is not converted into a saved birth date. Migration 054
closes existing romantic state, cancels unaccepted proposals, and locks any
preserved Our Circle. Shared history is not deleted. Each person must save a
private birth date and then rebuild current consent before romantic access can
return.

## Correction boundary

A confirmed birth date cannot be changed through the app. A production release
needs a separate, authenticated support procedure for correcting mistakes and
handling age-policy disputes.

## Deliberately deferred

- Government-ID or third-party age assurance
- App-wide minimum-age policy
- Parental consent flows
- Automated account suspension
- Legal-jurisdiction-specific age rules

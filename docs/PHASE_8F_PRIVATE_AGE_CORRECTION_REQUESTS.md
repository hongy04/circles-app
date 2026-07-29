# Phase 8F — Private Birth-Date Correction Requests

## Purpose

Close the production gap identified in Phase 8C: a confirmed birth date remains immutable in ordinary settings, while an authenticated owner may privately request correction of a genuine mistake.

This is a support and safety workflow, not a public profile feature and not identity verification.

## Owner experience

After saving a birth date, the owner can open **Age eligibility → Request a correction**.

The owner provides:

- the requested corrected birth date;
- a private explanation of at least 20 characters.

Only one submitted or reviewing request may exist at a time. The existing saved date and eligibility remain active until an administrator approves the correction.

The owner can see:

- Submitted, Under review, or Resolved status;
- the requested date and their own explanation;
- Approved or Not approved outcome;
- an optional broad administrator message.

The owner never sees private administrator notes or staff identities.

## Administration

Only active `admin` moderation staff may access **Settings → Age correction requests**.

Queue rows deliberately omit both birth dates. Sensitive current and requested dates appear only after an administrator opens a specific request. Opening and resolving the request are audit logged.

An administrator cannot review or resolve their own request.

Available decisions:

- Approve correction;
- Deny correction.

## Eligibility and relationship behavior

Approval updates the owner-only `user_age_eligibility` record and recalculates adult romantic eligibility on the server.

If the corrected date is under 18:

- romantic discovery is disabled;
- private Interest and Mutual Interest are cleared;
- Focus selections and Mutual Focus are ended;
- pending Our Circle proposals are removed;
- existing Our Circle history is preserved but locked.

If the corrected date is adult:

- eligibility is updated;
- romantic features are not automatically enabled;
- prior relationship or romantic state is not recreated.

Denial leaves the saved birth date unchanged.

## Privacy boundaries

Birth dates are excluded from:

- profiles and profile shells;
- connections and Mutuals;
- events and guest surfaces;
- ordinary moderation queues;
- analytics and audit metadata.

Direct table access remains unavailable. Owner and admin access is mediated by security-definer RPCs.

## Audit actions

- `submit_age_correction_request`
- `view_age_correction_request`
- `resolve_age_correction_request`

Audit metadata contains the request identifier and broad decision, not the current or requested birth date.

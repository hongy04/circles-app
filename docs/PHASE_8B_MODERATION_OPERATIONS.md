# Phase 8B — Report Receipts and Moderation Operations

## Goal

Complete the first operational safety layer behind Phase 8A by giving reporters
private receipts and trusted reviewers a role-gated report queue with immutable
audit history.

This is internal abuse-review tooling. It is not a public report feed, and it
does not reveal reports to the reported account.

## Reporter experience

`Me → Settings → Reports you submitted`

A reporter may see only their own:

- report reason;
- source surface;
- submitted date;
- broad status (`Submitted`, `Under review`, `Resolved`, or `Closed`);
- optional broad outcome message written by moderation.

The receipt never exposes:

- the reported account's private information;
- moderator identity;
- internal notes or evidence;
- other reports against the same account;
- enforcement details that could create another safety risk.

## Moderation access

Moderation membership lives in `public.moderation_staff` and supports:

- `reviewer`;
- `senior`;
- `admin`.

The client cannot grant itself moderation access. Staff records must be
provisioned through the Supabase SQL editor or another trusted server-side
administration path.

Only active staff can open the moderation console. Senior or admin access is
required to record account restriction, suspension, or external escalation as
the report resolution.

## Review workflow

The internal queue supports:

- New, Reviewing, Resolved, Closed, and All filters;
- severity triage (`Low`, `Medium`, `High`, `Urgent`);
- reporter and reported-account context;
- count of other open reports against the same account;
- private internal notes;
- optional broad message visible to the reporter;
- controlled resolution codes.

Closing a report requires an explicit resolution. Restriction and suspension outcomes in this phase document an action performed through a separate trusted administration path; they do not themselves disable a Supabase Auth account.

## Audit logging

Every sensitive report view and review update creates an append-only row in
`public.moderation_audit_log`, including:

- moderator account;
- report and reported-account references;
- action;
- previous and resulting status;
- controlled metadata;
- timestamp.

Ordinary clients have no direct read or write policy for the staff or audit
tables.

## Deliberate boundary

This phase provides access control, review tooling, and auditability. A public
launch still requires written staffing, response-time, emergency escalation,
legal preservation, and age-policy procedures outside the product code.

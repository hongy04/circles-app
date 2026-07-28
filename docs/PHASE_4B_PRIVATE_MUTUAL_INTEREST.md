# Phase 4B — Private Interest and Mutual Interest

## Purpose

Phase 4B adds the first romantic action only after the reciprocal Phase 4A channel is already open. It preserves the product rule that one-sided romantic interest is completely private and that a mutual state appears only after both accepted adult connections independently choose each other.

This phase does not add Mutual Focus, exclusivity, a two-person Circle, public relationship labels, match lists, or romantic discovery outside accepted connections.

## User experience

On an eligible connected profile, a subtle heart card appears.

Before selection:

> Want to get to know Maya better?
>
> This stays private unless Maya chooses you too.

After a one-sided selection, only the selecting user sees:

> Interest saved privately

The other person receives no notification and cannot query whether they were selected.

When both people independently select each other, neither profile immediately reveals the other person's action. The next time each person opens the existing direct conversation, they individually receive:

> The interest is mutual.
>
> Keep getting to know each other. When you are both ready, you can choose what comes next.

Each person sees the reveal once. Afterward, their connected profile may show the mutual state.

## State rules

- Interest can be selected only while the reciprocal romantic channel is open.
- A one-sided selection can be removed privately.
- Ending an active Mutual Interest clears both private selections.
- Ordinary connection status and message history remain unchanged.
- Turning romance off, excluding either person, changing audience state so the channel closes, or removing the connection clears both selections and the mutual state.
- A mutual reveal is tracked separately for each person, so one person opening chat does not mark the reveal as seen for the other.

## Privacy boundary

The client can read only:

- Whether the reciprocal channel is open
- Whether the current user selected the other person
- Whether Mutual Interest has already been revealed to the current user

The client cannot read:

- Whether the other person selected them before mutual reveal
- The other person's audience mode
- The other person's global romantic setting
- Why the heart is absent

The tables storing selection and pair state have RLS enabled with no direct client policies. All reads and writes use security-definer RPCs.

## Remote control

Feature flag:

```text
romantic_interest_beta
```

Turning it off hides the heart action and prevents new selections or reveals without affecting ordinary profiles, connections, or messages.

## Analytics

Privacy-safe events:

```text
romantic_interest_updated
romantic_interest_mutual_activated
romantic_interest_revealed
```

Allowed actions:

```text
select
clear
end_mutual
activate
reveal
```

Analytics do not store user IDs for the target, pair IDs, conversation IDs, names, profile IDs, audience settings, or one-sided counterpart state.

## Deferred

- Mutual Focus
- Pausing romantic visibility with everyone else
- Focus-specific chat treatment
- Two-person Circle proposals
- Public relationship presentation
- Full blocking/reporting release hardening

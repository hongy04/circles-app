# Circles Phase 1A.1 — Invite Hotfix

This bounded hotfix addresses the first device test of Phase 1A.

## Fixed

1. Personal and Circle link creation no longer fails when `pgcrypto` lives in Supabase's `extensions` schema.
2. Contact Invite buttons no longer look tappable while silently doing nothing when the invitation link is unavailable. They now retry link creation and show an actionable error when it still fails.
3. The contact-search screen now moves above the keyboard, allows Invite taps while typing, dismisses the keyboard when opening the SMS composer, and supports drag-to-dismiss.
4. Circle connection search gets the same keyboard interaction behavior for consistency.

## Required order

1. Copy the files into the project.
2. Run `supabase/migrations/20260725_019_fix_invite_token_generation.sql` in Supabase SQL Editor.
3. Restart Expo with `npx expo start --tunnel --clear`.

The revised `20260725_018_launch_invitations_connections.sql` is included for clean future installations, but an existing database only needs migration `019`.

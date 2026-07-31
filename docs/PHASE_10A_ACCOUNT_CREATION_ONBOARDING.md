# Phase 10A — Account Creation and Onboarding

## Goal

Replace the fake phone-code development path with a real, resumable account-creation flow while preserving explicit development-account access for local testing.

## User flow

1. Welcome to Circles
2. Enter country and mobile number
3. Verify the six-digit SMS code
4. Create a private profile
5. Review the contact-matching explanation
6. Sync selected contacts or choose Not now
7. Enter Circles

The same phone flow signs in returning accounts. Returning users who already completed onboarding go directly into Circles instead of repeating profile or contact setup.

## Development boundary

- Real phone OTP runs in development and production.
- The old `000000` phone-code bypass is removed.
- Configured email/password test identities are available through a clearly labeled **Development accounts** screen.
- The development screen exists only when both `EXPO_PUBLIC_APP_MODE=development` and React Native `__DEV__` are true.
- Production builds contain no test-account route or fake verification behavior.

## Database state

Migration 064 adds owner onboarding state to `public.users`:

- `onboarding_profile_completed_at`
- `onboarding_contacts_completed_at`
- `onboarding_contacts_choice`

Existing non-deleted accounts are backfilled as complete so they are not forced through first-run onboarding. Accounts created after Migration 064 start incomplete because the new fields default to `NULL`.

Owner-only RPCs:

- `get_my_onboarding_state()`
- `is_username_available(text)`
- `complete_my_profile_onboarding(text, text, text, text)`
- `complete_my_contacts_onboarding(text)`

## Profile rules

- Display name is required and limited to 40 characters.
- Username is required during first-run setup.
- Username is unique, case-insensitive, and checked live.
- Username supports lowercase letters, numbers, periods, and underscores.
- Bio remains optional and limited to 160 characters.
- Profile photo is optional for normal signup.
- Profile photo remains required when an outside event guest is claiming attendance because that existing guest-claim flow uses a completed visual identity.

## Privacy rules

- Phone number is used for authentication and private matching; it is not displayed on the profile.
- Full profiles remain unavailable before an accepted connection.
- Contact permission is requested only after an explanation screen.
- Contact selection remains editable before upload.
- Skipping contact sync completes onboarding and can be revisited later.
- Username availability reveals only whether the requested username can be used.

## Launch routing

`GateScreen` is now a session resolver rather than a tap-through portal:

- Signed out → Welcome
- Suspended → Account Status
- Restricted → Main tabs with enforcement boundary
- Profile incomplete → Profile Setup
- Contacts incomplete → Contacts Intro
- Onboarding complete → Main tabs

This makes app relaunch and returning sign-in deterministic.

## Migration

Run:

`supabase/migrations/20260730_064_account_creation_onboarding.sql`

Then restart Expo with a cleared cache.

## Required Supabase auth setup

Real account creation requires the Supabase Phone provider to be enabled and connected to a supported SMS provider. The app no longer silently substitutes a development email account when a phone number is entered.

## Recommended tests

### Existing accounts

1. Apply Migration 064.
2. Relaunch while signed into an existing test account.
3. Confirm it enters Circles without repeating onboarding.
4. Sign out and use **Development accounts**.
5. Confirm the selected test identity enters normally.

### Force onboarding on a development account

Existing accounts are intentionally backfilled as complete. To test the full UI without creating a new SMS identity, clear only the onboarding markers for one disposable development account:

```sql
update public.users
set
  onboarding_profile_completed_at = null,
  onboarding_contacts_completed_at = null,
  onboarding_contacts_choice = null
where id = '<DISPOSABLE_TEST_USER_ID>';
```

The saved profile fields remain available as editable defaults. After the test, completing both screens writes the markers again.

### New phone account

1. Sign out.
2. Continue with a real mobile number not previously used.
3. Confirm the SMS arrives.
4. Enter an invalid code and confirm a clear error.
5. Enter the valid code.
6. Confirm Profile Setup appears.
7. Verify unavailable and invalid usernames are rejected.
8. Save a valid name and username.
9. Choose Not now on contacts.
10. Confirm Circles opens.
11. Sign out and sign in again with the same number.
12. Confirm Profile Setup and Contacts Intro do not repeat.

### Interrupted onboarding

1. Create another phone account.
2. Close the app on Profile Setup.
3. Reopen and confirm it returns to Profile Setup.
4. Complete the profile, then close on Contacts Intro.
5. Reopen and confirm it returns to Contacts Intro.

### Contact sync

1. Grant contact permission.
2. Deselect at least one person.
3. Continue and confirm only selected numbers are uploaded.
4. Deny permission on a separate account and confirm onboarding can still finish.

### Invitations

1. Open an app invitation while signed out.
2. Complete account creation.
3. Confirm the invitation is applied after the profile exists.
4. Repeat with an outside-event guest link and confirm the event-claim identity requirements remain enforced.

## Verification queries

```sql
select
  id,
  display_name,
  username,
  onboarding_profile_completed_at,
  onboarding_contacts_completed_at,
  onboarding_contacts_choice
from public.users
order by created_at desc nulls last;
```

```sql
select
  has_function_privilege('authenticated', 'public.get_my_onboarding_state()', 'EXECUTE') as can_read_own_state,
  has_function_privilege('authenticated', 'public.is_username_available(text)', 'EXECUTE') as can_check_username,
  has_function_privilege('anon', 'public.get_my_onboarding_state()', 'EXECUTE') as anon_can_read_state;
```

Expected:

- `can_read_own_state = true`
- `can_check_username = true`
- `anon_can_read_state = false`

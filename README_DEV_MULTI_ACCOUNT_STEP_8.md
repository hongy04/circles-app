# Circles Step 8 — Controlled Multi-Account Testing

This checkpoint adds development-only account switching so the real connection,
profile, feed, story, comment, like, and ownership rules can be tested without
real SMS numbers.

It also records the messaging direction in:

`docs/CONVERSATION_SPACES_ARCHITECTURE.md`

That document treats each DM or group chat as an automatically created private
shared profile with Chat, an automatic sent-media Timeline, deliberate Posts,
and People/Details.

## Safety boundaries

- The screen is registered only when both `EXPO_PUBLIC_APP_MODE=development`
  and React Native `__DEV__` are true.
- Database helpers accept only confirmed `dev@circles.local` or
  `dev+...@circles.local` auth users.
- Helpers never modify relationships involving a non-development user.
- Test passwords are client-visible development credentials. Never reuse a real
  password or place real personal data in these accounts.
- No service-role key is used by the app.

## 1. Run the migration

Run this file in Supabase SQL Editor:

`supabase/migrations/20260720_007_dev_test_accounts.sql`

It adds three restricted development RPCs:

- `dev_ensure_test_profile`
- `dev_prepare_test_network`
- `dev_reset_test_relationships`

The prepare RPC creates missing `public.users` rows and mutual-contact edges for
confirmed Circles development auth users. It does not create Auth users.

## 2. Create two test users in Supabase

Open Supabase Dashboard → **Authentication** → **Users** → **Add user**.

Create:

1. `dev+alex@circles.local`
2. `dev+sam@circles.local`

For each user:

- assign a unique test-only password;
- enable the option to mark/auto-confirm the email;
- do not use a real password or real identity.

Your existing `dev@circles.local` account remains the primary account.

## 3. Update `.env.local`

Add these variables using the exact emails and passwords created above:

```env
EXPO_PUBLIC_DEV_NAME=Hongy

EXPO_PUBLIC_DEV_ACCOUNT_2_EMAIL=dev+alex@circles.local
EXPO_PUBLIC_DEV_ACCOUNT_2_PASSWORD=YOUR_TEST_ACCOUNT_2_PASSWORD
EXPO_PUBLIC_DEV_ACCOUNT_2_NAME=Alex Test

EXPO_PUBLIC_DEV_ACCOUNT_3_EMAIL=dev+sam@circles.local
EXPO_PUBLIC_DEV_ACCOUNT_3_PASSWORD=YOUR_TEST_ACCOUNT_3_PASSWORD
EXPO_PUBLIC_DEV_ACCOUNT_3_NAME=Sam Test
```

Do not send or upload `.env.local`. It should remain ignored by Git.

## 4. Apply the app files

Copy the package contents into the project root and allow Windows to replace or
merge files.

The main changed files are:

- `.env.example`
- `App.js`
- `src/config/env.js`
- `src/services/devTestService.js`
- `src/screens/dev/DevAccountsScreen.js`
- `src/screens/profile/AccountSettingsScreen.js`
- the Step 8 migration
- the Conversation Spaces architecture document

## 5. Restart Expo

The new environment variables are read when Metro starts, so use:

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## 6. Prepare and test

Open:

**Me → Settings → Test accounts**

Tap **Prepare mutual candidates**. It should report three accounts.

Recommended sequence:

1. While signed in as Hongy, open Mutuals and send Alex a request.
2. Open Settings → Test accounts and switch to Alex.
3. Open Mutuals → Requests and accept Hongy.
4. Create a post and story as Alex.
5. Switch to Hongy and confirm Alex's profile, post, and story are visible.
6. Like and comment on Alex's post.
7. Confirm Hongy cannot see edit/delete controls for Alex's content.
8. Switch to Alex and confirm the like/comment appears and Alex can manage only
   Alex-owned content.
9. Use **Reset requests and connections**.
10. Confirm profiles/posts/stories become private again and test pending and
    decline states.

## Expected privacy behavior

### Mutual only

- Profile metadata is visible enough to request a connection.
- Private posts and stories are not visible.

### Pending request

- The relationship button shows Requested or Accept/Decline depending on the
  account.
- Private content remains restricted.

### Accepted connection

- Profile posts and active stories become visible.
- Likes and comments work across accounts.
- Ownership controls remain limited to the creator.

## Commit

After the multi-account flow passes:

```powershell
git status
git add App.js .env.example src supabase/migrations docs README_DEV_MULTI_ACCOUNT_STEP_8.md
git commit -m "Add controlled multi-account testing"
git push
```

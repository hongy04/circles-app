# Circles — Profile & Account Polish (Step 5)

This checkpoint turns the basic `Me`, `Profile`, and `Edit Profile` views into a connected account experience while preserving Circles' private, mutual-first design.

## 1. Run the database migration first

Open the Supabase SQL Editor and run:

```text
supabase/migrations/20260720_002_profile_accounts.sql
```

The migration:

- adds an optional, unique lowercase `username` to `public.users`;
- adds `get_profile_overview(uuid)` for privacy-aware profile loading;
- adds `update_my_profile(...)` so name, username, bio, and avatar save together;
- changes `is_connected(...)` so a mutual contact is only a candidate, not an accepted connection;
- makes the security-definer Feed and Stories RPCs return only the signed-in user's content and accepted connections' content.

After this migration, the Feed may show fewer test posts. That is intentional: posts and stories from mutual candidates remain private until their connection request is accepted.

## 2. Copy the app files

Copy this package into the Circles project root and allow Windows to merge `src` and `supabase`, and replace `App.js` and `src/services/uploadService.js`.

New structure:

```text
src/
  components/profile/
    ProfileHeader.js
    ProfilePostGridItem.js

  screens/profile/
    AccountSettingsScreen.js
    EditProfileScreen.js
    MeScreen.js
    ProfileScreen.js
    ProfileViewScreen.js

  services/
    profileService.js
```

## What changed

### Me / profile page

- one reusable profile experience for your account and another person's account;
- polished identity header with avatar, display name, optional `@username`, bio, post count, and connection count;
- pull-to-refresh;
- responsive three-column post grid;
- photo, video, and multi-media indicators;
- post-grid items open Post Detail;
- self empty state links directly to Create Post;
- private-post state for profiles that are not connected;
- settings button on your profile.

### Connection-aware profiles

- mutual candidate → **Connect**;
- outgoing request → **Requested**;
- incoming request → **Accept / Decline**;
- accepted connection → **Connected**;
- Mutuals cards and incoming requests can open the person's profile.

### Edit Profile

- display-name validation and 40-character limit;
- optional unique username with normalization and friendly duplicate errors;
- 160-character bio limit;
- square photo picker and upload/save progress;
- Android/content URIs and other non-HTTP selected-photo URIs are treated as local uploads;
- name, username, bio, and avatar save in one RPC instead of silently ignoring bio errors;
- new avatar files are stored under `avatars/<user-id>/...` for future ownership policies.

### Settings

- account identity;
- Edit Profile shortcut;
- privacy explanation;
- development/production build label;
- working sign-out flow on mobile and web.

## 3. Test web

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --web --clear
```

Test:

1. Open **Me**.
2. Add a username, update the name and bio, and change the profile picture.
3. Refresh and confirm every field persists.
4. Open a post from the profile grid and go back.
5. Open **Settings**, then return.
6. Open an author profile from the Feed.
7. Open a mutual/request profile from Mutuals.
8. Test Sign Out, then sign back in with the development flow.

## 4. Test phone

```powershell
npx expo start --tunnel --clear
```

Pay special attention to:

- avatar cropping and upload;
- keyboard behavior on Edit Profile;
- pull-to-refresh;
- three-column grid sizing;
- Accept, Decline, Connect, and Requested states;
- sign out and return to the welcome portal.

## 5. Commit after testing

```powershell
git status
git add App.js src supabase/migrations README_PROFILE_ACCOUNTS_STEP_5.md
git commit -m "Polish profiles and account settings"
git push
```

Keep `.env.local` untracked.

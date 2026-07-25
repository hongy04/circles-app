# Circles Phase 1A — Launch Invitations and Connections

This checkpoint adds the first real launch-growth foundation without changing the chronological Feed or exposing private profiles.

## What this checkpoint adds

- A **People** surface with separate **Mutuals**, **Requests**, and **Connections** views.
- An **Invite** entry point from People and Account Settings.
- Reusable personal invitation links.
- A contact picker that opens **one private SMS at a time**, never a group text.
- Share-sheet support for group chats and other apps.
- Shareable Circle invitation links from the existing **Invite People** screen.
- Deep-link invitation previews.
- Invitation redemption that survives phone verification.
- Explicit acceptance remains required:
  - Personal invite → pending connection request.
  - Circle invite → pending Circle invitation.
- Thirty-day expiration, maximum-use limits, idempotent redemption, Circle role checks, and Circle-cap checks.
- An optional `EXPO_PUBLIC_INVITE_BASE_URL` hook for a later production web landing page.

## Privacy behavior

- An invitation never grants profile, post, message, or Circle access by itself.
- The recipient must still accept the connection or Circle invitation.
- The contact-invite screen does not upload the selected phone number.
- Circle links can invite people who are not already accepted Connections, but only an owner or admin can create the link.
- Circle history remains hidden until the recipient accepts and becomes a member.

## Install the replacement package

Close the Expo terminal first.

```powershell
$project = "C:\Users\honge\Dev\circles-app"
$zip = "$env:USERPROFILE\Downloads\circles-phase1a-launch-invitations.zip"
$temp = "$env:TEMP\circles-phase1a-launch-invitations"

Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $zip -DestinationPath $temp -Force
Copy-Item "$temp\circles-phase1a-launch-invitations\*" $project -Recurse -Force

Set-Location $project
npx expo install expo-linking expo-sms
```

The package intentionally does not contain or replace `.env.local`, `.git`, `.expo`, or `node_modules`.

## Run the Supabase migration

Open this file from the project:

```text
supabase/migrations/20260725_018_launch_invitations_connections.sql
```

Copy the entire file into the Supabase SQL Editor and run it once.

The migration creates:

- `app_invites`
- `app_invite_redemptions`
- `get_my_connections()`
- `create_app_invite(...)`
- `preview_app_invite(...)`
- `redeem_app_invite(...)`

## Start Circles

```powershell
Set-Location "C:\Users\honge\Dev\circles-app"
npx expo start --tunnel --clear
```

## Personal invitation test

1. Sign in as development account A.
2. Open **Mutuals → Invite**.
3. Tap **Share invite link** and save the link somewhere you can reopen it.
4. Switch to development account B.
5. Open the saved invitation link.
6. Continue through the invitation screen.
7. Open **Mutuals → Requests**.
8. Confirm account A's request appears and can be accepted.
9. Confirm both users then appear under **Connections** and receive their normal direct conversation.

## Contact invitation test

1. Open **Mutuals → Invite** on a physical phone.
2. Tap **Choose** under Invite from contacts.
3. Tap **Invite** beside one contact.
4. Confirm the system opens one SMS composer with one recipient and the Circles link already filled in.
5. Canceling the composer must not mark the person as invited.

The iOS simulator does not provide real SMS sending, so the app falls back to the system share sheet there.

## Circle-link test

1. Sign in as the owner or admin of a group Circle.
2. Open the Circle's **People → Invite People** screen.
3. Tap the share button in **Invite beyond your connections**.
4. Switch to an account that is not already in the Circle.
5. Open the link and continue.
6. Confirm the invitation appears in the Circles inbox.
7. Confirm Circle content remains inaccessible until the invitation is accepted.

## Development-link limitation

With `EXPO_PUBLIC_INVITE_BASE_URL` blank, development links are generated from the current Expo environment. This is suitable for the active tunnel session and testing. A public launch still needs a hosted HTTPS invitation page, app-store fallback, and production universal/app-link association. The backend tokens and redemption flow in this checkpoint are designed to remain underneath that later web layer.

## Files changed

- `.env.example`
- `App.js`
- `app.json`
- `package.json`
- `src/config/env.js`
- `src/navigation/AuthNavigator.js`
- `src/screens/auth/AuthPhoneScreen.js`
- `src/screens/auth/AuthOtpScreen.js`
- `src/screens/auth/ContactsIntroScreen.js`
- `src/screens/conversations/InviteCirclePeopleScreen.js`
- `src/screens/profile/AccountSettingsScreen.js`
- `src/screens/profile/InvitePeopleScreen.js`
- `src/screens/invitations/InvitationLandingScreen.js`
- `src/services/inviteService.js`
- `src/utils/contactPhones.js`
- `supabase/migrations/20260725_018_launch_invitations_connections.sql`

## Validation completed before packaging

- Parsed all JavaScript source files with Babel's JSX parser: no syntax failures.
- Checked every relative JavaScript import: no missing files.
- Verified the package contains no `.env.local`, Git history, Expo cache, or `node_modules`.

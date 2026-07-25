# Circles Step 9D — Circle People and Invitations

This checkpoint turns the member strip on each group Circle into a complete,
private People-management experience.

## Product behavior

### Every accepted Circle member can

- Open the full People page.
- See accepted members and their Owner/Admin roles.
- See pending invitations.
- Open another member's normal user profile.
- Leave the Circle, unless they are the current owner.

### Owners and admins can

- Invite their own accepted connections.
- Cancel pending invitations.
- See changes update through the existing membership Realtime subscription.

### Owner-only controls

- Promote a member to Admin.
- Remove an Admin role.
- Transfer ownership to another accepted Circle member.
- Remove an Admin or regular member.

### Admin controls

- Remove regular members.
- Admins cannot remove the owner or another admin.
- Admins cannot change roles or ownership.

### Authentic shared-history rule

Removing someone or leaving immediately revokes future access to Chat, Posts,
Timeline, comments, and member information. It does not erase or anonymously
rewrite contributions already made while that person was a member.

Pending invitees still receive no Circle access until they explicitly accept.

## Included files

- `App.js`
- `src/screens/conversations/CircleProfileScreen.js`
- `src/screens/conversations/CirclePeopleScreen.js`
- `src/screens/conversations/InviteCirclePeopleScreen.js`
- `src/services/circlePeopleService.js`
- `supabase/migrations/20260722_015_circle_people_membership.sql`
- `circle-people-step9d.patch`

## Apply Step 9D

### 1. Run the Supabase migration

Open Supabase, select the Circles project, and open **SQL Editor**.

Create a new query and paste the complete contents of:

```text
supabase/migrations/20260722_015_circle_people_membership.sql
```

Run it once. The migration does not delete messages, media, posts, comments, or
existing members.

### 2. Copy the app files

Extract the ZIP. Copy the contents of the extracted
`circles_circle_people_step9d_package` folder into:

```text
C:\Users\honge\Dev\circles-app
```

Choose **Replace the files in the destination** when Windows asks. Do not copy
a parent folder around the project root; merge the included `src` and
`supabase` folders into the existing ones.

### 3. Restart Expo

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

## Recommended multi-account test

Use the Hongy/Alex/Sam development accounts.

### Owner test

1. Open an existing three-person Circle as its owner.
2. Tap the **People** statistic, the **People** button, or **See all** above the
   member strip.
3. Confirm all accepted members and pending invitations appear.
4. Tap **Invite people** and invite another accepted connection.
5. Confirm the new person remains pending and cannot access the Circle.
6. Cancel the invitation and confirm it disappears.
7. Promote a regular member to Admin, then remove the Admin role again.

### Admin boundary test

1. Promote Alex to Admin.
2. Switch to Alex.
3. Confirm Alex can invite accepted connections and remove a regular member.
4. Confirm Alex cannot change roles, remove the owner, or remove another Admin.

### Ownership and leaving test

1. As the owner, transfer ownership to Alex.
2. Confirm Alex becomes Owner and the former owner becomes Admin.
3. Confirm the former owner now sees **Leave Circle**.
4. Leave the Circle and confirm the app returns to the inbox.
5. Confirm the departed account can no longer reopen Chat, Posts, Timeline, or
   People.
6. From another member's account, confirm the departed person's prior content
   remains attributed to them.

### Invitation acceptance test

1. Send a fresh invitation to Sam.
2. Switch to Sam and accept it from the Circles inbox.
3. Confirm Sam appears as a regular member and can now access all private Circle
   areas.

## Commit after phone testing

```powershell
cd C:\Users\honge\Dev\circles-app
git status
git add App.js src supabase/migrations README_CIRCLE_PEOPLE_STEP_9D.md
git commit -m "Add Circle people and invitation management"
git push
```

## Validation performed before packaging

The five included JavaScript files were passed through the installed TypeScript
JSX transpiler without syntax errors. The SQL was reviewed for role and
membership boundaries, but it still requires execution against the live
Supabase schema. Physical-device navigation, Realtime refresh, and all
multi-account permission boundaries require the test matrix above.

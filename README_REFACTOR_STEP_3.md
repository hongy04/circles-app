# Circles Refactor — Step 3

This step extracts the authentication and contact-onboarding flow from `App.js`.

## New files

- `src/navigation/AuthNavigator.js`
- `src/navigation/navigationActions.js`
- `src/screens/auth/AuthPhoneScreen.js`
- `src/screens/auth/AuthOtpScreen.js`
- `src/screens/auth/ContactsIntroScreen.js`
- `src/screens/auth/ContactsPickerScreen.js`
- `src/screens/auth/SyncingScreen.js`
- `src/screens/auth/authStyles.js`

## Behavior preserved

- Development mode still uses the configured bypass code.
- Production mode still sends and verifies real SMS OTP codes.
- Mobile contact permission, selection, normalization, and upload remain in place.
- The onboarding flow still ends at `MainTabs`.

## Web improvement

The browser no longer attempts to access native phone contacts. It explains that contact syncing is mobile-only and provides a direct **Continue to Circles** action.

## Test checklist

### Web

1. Open the welcome portal.
2. Continue through development phone verification.
3. Enter the development bypass code.
4. Confirm the contact intro says syncing is mobile-only.
5. Press **Continue to Circles**.
6. Open Circles, Mutuals, Feed, and Me.

### Mobile

1. Verify development login.
2. Choose **Skip for now** and confirm MainTabs opens.
3. Repeat and choose **Choose Contacts**.
4. Grant or deny contact permission and verify both flows.
5. Select/deselect contacts and sync.
6. Confirm the syncing summary moves to MainTabs.

## Suggested commit

```powershell
git add App.js src README_REFACTOR_STEP_3.md
git commit -m "Extract authentication and onboarding screens"
git push
```

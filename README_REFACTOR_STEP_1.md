# Circles refactor — Step 1

This step moves configuration, Supabase setup, authentication guards, upload
helpers, and theme colors out of the root `App.js`.

## Files

- `App.js`
- `src/config/env.js`
- `src/lib/supabase.js`
- `src/services/authService.js`
- `src/services/uploadService.js`
- `src/theme/colors.js`
- `.env.example`

## Install

Copy the files into the repository while preserving their folders.

Create `.env.local` from `.env.example` and fill in the new Supabase project's
URL, publishable key, and development account password.

Make sure `.gitignore` contains:

```text
.env*.local
```

## Behavior

- Development mode requires `EXPO_PUBLIC_APP_MODE=development` and a `__DEV__`
  bundle.
- `000000` signs into the dedicated dev account.
- Production mode always uses real phone OTP.
- `ensureAuthed()` no longer creates a hidden dev session automatically.
- Uploads use `expo-file-system/legacy`, which is the supported location for
  `readAsStringAsync` in Expo SDK 54.

## Test

```powershell
npx expo start --web --clear
```

Then test the physical phone:

```powershell
npx expo start --tunnel --clear
```

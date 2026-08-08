# Step 36C Hotfix — Whisper Menu Safe Zone

This focused replacement keeps incoming Whisper bubbles out of the personal-profile top-right three-dot menu area.

## Replace
- `src/components/profile/WhisperBubbleField.js`

## Behavior
- Reserves a fixed top-right exclusion zone whenever the profile has a header photo and the top bar overlays it.
- The exclusion includes extra space for bubble horizontal drift and the menu button shadow.
- All existing bubble refraction, motion, overflow, realtime refresh, and Reduce Motion behavior remains unchanged.

## Backend / native
- No migration.
- No Edge Function deploy.
- No native change or EAS rebuild.

## Validation
- `node --check` passed for `WhisperBubbleField.js`.
- Expo iOS/Hermes production export passed at 2,124 modules.

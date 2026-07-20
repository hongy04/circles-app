# Circles Step 6.1 — iPhone Story Audio Fix

This patch fixes story videos that stayed silent on iPhone even when the story mute button showed the unmuted state.

## Cause

The story viewer correctly passed `isMuted={false}` to the video, but iOS still respects the phone's Ring/Silent switch unless the app audio session explicitly enables playback in silent mode.

## Fix

`StoryViewer.js` now configures the Expo AV audio session when the viewer mounts:

- `playsInSilentModeIOS: true`
- playback routed through the speaker rather than the Android earpiece
- normal ducking behavior when another app owns audio
- no background audio session

The story video also explicitly uses full playback volume when unmuted.

## Apply

Copy this package into the project root and allow Windows to replace or merge files. Only `src/components/stories/StoryViewer.js` changed; `App.js` is included as the complete current checkpoint.

No Supabase migration is required.

## Test on iPhone 14

```powershell
cd C:\Users\honge\Dev\circles-app
npx expo start --tunnel --clear
```

1. Keep the iPhone Ring/Silent switch in silent mode.
2. Open a video story.
3. Confirm audio plays when the volume-high icon is shown.
4. Tap the icon and confirm audio stops.
5. Tap it again and confirm audio returns.
6. Raise the phone's media volume if the video is still quiet.

## Commit

```powershell
git status
git add App.js src README_STORY_AUDIO_FIX_STEP_6_1.md
git commit -m "Fix iPhone story video audio"
git push
```

# Step 29 – Force Remove Title Glass

This combined hotfix keeps the real no-photo event cover layout fix and force-removes the title/date contrast workaround.

Replace both files at their exact paths:

- `src/screens/conversations/CircleTimelineFeedScreen.js`
- `src/components/events/EventAlbumMemoryCover.js`

The title/date wrappers are explicitly transparent with no border or padding, so the dark title/date glass cannot remain even if the prior contrast-hotfix markup is still present.

After copying the files, restart Metro with a cleared cache:

```bash
npx expo start -c
```

No migration, Edge Function, native, or EAS changes are required.

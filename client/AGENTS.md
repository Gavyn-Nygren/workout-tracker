# Expo HAS CHANGED

This project is on Expo SDK 58. Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

- Import JS tabs from `expo-router/js-tabs`. The `Tabs` export from `expo-router` is deprecated.
- If `npm run typecheck` reports route errors mentioning paths like `/../hooks/...`, the running dev server has written a stale `.expo/types/router.d.ts`. Delete that file or restart `npx expo start`; it's generated and gitignored.
- The app is previewed in Expo Go on iOS. Only use modules that are "Included in Expo Go" until the roadmap's Phase 4 (EAS development build).

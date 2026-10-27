# Expo HAS CHANGED

This project is on Expo SDK 58. Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

- Import JS tabs from `expo-router/js-tabs`. The `Tabs` export from `expo-router` is deprecated.
- If `npm run typecheck` reports route errors mentioning paths like `/../hooks/...`, the running dev server has written a stale `.expo/types/router.d.ts`. Delete that file or restart `npx expo start`; it's generated and gitignored.
- Data lives in a local SQLite database (`src/data/db/`). Screens never touch it directly: they use the hooks in `src/data/hooks.ts`, which call the `DataRepository` in `src/data/repository.ts`. Schema changes go in a new entry in the `MIGRATIONS` list in `src/data/db/schema.ts`; never edit a shipped migration.
- The spec 2.7 calculation rules live in `src/data/calculations.ts`, `records.ts`, and `progress.ts`: which sets count, effective load, records, streaks, and badges. Screens use these helpers instead of re-deriving, so every screen counts the same way. Every write refreshes the queries listed for it in `src/data/invalidation.ts`.
- Calendar dates are local `YYYY-MM-DD` strings; timestamps are UTC. Get a date from a timestamp with `localDateOf` in `src/data/dates.ts`, never by slicing the string (that's the UTC date). The calendar engine, including push-forward shifts (`plan_shifts`), is `src/data/schedule.ts`; the week start comes from preferences (`weekStartsOn`), never a hard-coded Monday.
- Rest timer rules live in pure modules: `src/features/workout/rest.ts` (which rest follows a set, superset rounds, what's next) and `restAlarm.ts` (the rest-over notification). A blank plan rest means Auto: the exercise's remembered rest, then the Settings default. The provider changes the running rest only through `changeRest`.
- Progression rules live in a pure module, `src/features/workout/progression.ts`: what a rule suggests, misses and deloads, rounding, the reason line's wording, and undo. A planned exercise's "last time" is its own plan workout's (`slotHistory` in `history.ts`), else the exercise anywhere; the pre-fill and the PREVIOUS column both use it.
- `npm test` runs unit tests in `tests/` with Node's test runner. Tests can't import React Native or Expo modules; database tests use Node's built-in SQLite through `tests/support/nodeSqlite.ts`. `npm run typecheck` checks the app and the tests.
- The app is previewed in Expo Go on iOS. Only use modules that are "Included in Expo Go" until the roadmap's Phase 4 (EAS development build).

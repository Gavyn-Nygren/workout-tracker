# Exercise Tracker

iOS-first strength/hypertrophy tracker with on-device form analysis.

- **Spec (source of truth):** [exercise-tracker-draft.md](exercise-tracker-draft.md)
- **Build order and current goal:** [ROADMAP.md](ROADMAP.md). Check off goals as they're completed and update the "Current goal" line.
- [README.md](README.md) and [codex_context.md](codex_context.md) are outdated; the spec wins where they disagree.

## Layout

- `client/`: Expo SDK 58 + Expo Router + TypeScript. Run all frontend commands from here, and see [client/AGENTS.md](client/AGENTS.md).
- `server/`: Flask (Python 3.13) with a local `venv/`. Not in use until roadmap Phase 5.

## Working rules

- Look first, functionality second. Screens get built with fake data and approved on the user's iPhone (Expo Go) before real logic.
- For unsettled design choices, give the user 2-4 concrete options to pick from.
- Type-check with `npm run typecheck` in `client/`.

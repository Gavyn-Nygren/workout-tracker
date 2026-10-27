# Roadmap

Work goals for building the Exercise Tracker. [exercise-tracker-draft.md](exercise-tracker-draft.md) is the source of truth for *what* the app does; this file sets *the order* it gets built in.

**Priority: get the look right first, then add functionality.** Phases 0-2 build every screen with fake data so the design can be reviewed and approved on an iPhone before any real logic exists.

**Current goal:** G3.10 (goals, badges, streaks).

## How we work

- **Preview:** the app runs on the user's iPhone through **Expo Go**. The user is on Windows, so there's no iOS Simulator. Phases 0-3 must use only modules that work in Expo Go. Custom native code (camera, MediaPipe, Live Activity) waits for Phase 4.
- **Design decisions:** when a visual choice isn't already settled in the spec, present 2-4 concrete options (with mockups where helpful) for the user to pick from.
- **Review checkpoints:** a goal marked 👁 is done only when the user has looked at it on their phone and approved it.
- **Expo version:** the project is on Expo SDK 58, upgraded from 57 in G0.1 because the App Store's Expo Go now runs SDK 58 only. Read the versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing Expo code (see [client/AGENTS.md](client/AGENTS.md)).
- **Outdated docs:** [README.md](README.md) and [codex_context.md](codex_context.md) describe an older plan (web at launch, hand-built auth, gradient cards, AI priming). Where they disagree with the spec, the spec wins.
- **Defaults chosen for the build:**
  - TypeScript
  - Expo Router for navigation
  - expo-sqlite for local data, because it works in Expo Go; this settles the spec's open question about the local database library

---

## Phase 0: Foundation

The minimum setup needed to show anything on the phone.

### G0.1 Project housekeeping

- [x] Commit the current scaffold and spec to git.
- [x] Rename the app from `client` to its real name (or a placeholder) and set the iOS bundle ID. *Placeholder: "Exercise Tracker", bundle ID `com.gavynnygren.exercisetracker`.*
- [x] Convert the client to TypeScript (strict mode).
- [x] Add a root `CLAUDE.md` that points to the spec and this roadmap.
- [x] Mark README/codex_context as outdated, or rewrite them. *Status banners added.*
- [x] Upgrade from Expo SDK 57 to SDK 58 so the app runs in the current Expo Go.

**Done when:** the repo is committed, TypeScript compiles, and the docs point to the spec.

### G0.2 Navigation skeleton 👁

- [x] Set up Expo Router with the five tabs `Today | Plans | Home | Progress | Profile`, using placeholder screens.
- [x] Add a dark tab bar and dark header, with an explicit light/dark switch (not just the system setting). *System / Light / Dark switch on Profile, saved on the device.*
- [x] The user has reviewed it on their iPhone.

**Done when:** the user scans the QR code with Expo Go and can tap between all five tabs on their iPhone.

### G0.3 Fake data layer

- [x] Add TypeScript types matching spec Section 3: exercises, plans, sessions, blocks, sets (kind + modifiers), bodyweight, goals, PRs, badges, form reports. *In `client/src/data/types.ts`; loads are stored in kg.*
- [x] Add realistic sample data:
  - 2 active plans
  - about 30 exercises
  - 8 weeks of workout history with PRs
  - bodyweight entries
  - 3 form reports

  *Generated relative to today, so the app always looks recently used. Includes a missed, a skipped, a partial, a late, and a repeated workout, plus days with two workouts.*
- [x] Put the data behind a small repository interface so the SQLite version can replace it later without changing the screens. *Screens read through the hooks in `client/src/data/hooks.ts`.*

**Done when:** every screen in Phase 2 can get its data from this layer.

---

## Phase 1: Design System

### G1.1 Theme tokens 👁

- [x] Encode the spec 2.13 values as tokens:
  - accent #89CFF0 with dark text #0B1520
  - light theme: #F2F4F7 background, white cards, #0B0F14 header and tab bar
  - dark theme: #0B0D10 background, #171A1F cards, #F5F7FA text, #9AA4AF secondary text
- [x] Add the shared scales:
  - SF Pro type scale with Dynamic Type
  - spacing scale
  - 12-16px radii
  - shadows/elevation
- [x] Propose options for the colors the spec hasn't set yet (success, warning, error, disabled, and chart series colors) and let the user pick. *Picked: Classic status colors, Gold PRs, Sky blue charts, one-blue comparison shades; disabled = 40% opacity. Recorded in spec 2.13.*
- [x] Check WCAG AA contrast for every text and background pair in both themes. *54 pairs checked, all pass.*
- [x] The user has reviewed the tokens on their iPhone.

**Done when:** the user has approved the full token set, and the light/dark toggle switches the whole app.

### G1.2 Core components 👁

- [x] Build the shared components:
  - buttons (primary pill, secondary, ghost, destructive)
  - card, list row, section header
  - dark screen header and tab bar using SF Symbols, with a baby-blue active tab
  - inputs: text field, number field with decimal support, stepper, toggle, segmented control
  - chips and set kind/modifier tags
  - PR badge, progress bar, progress ring
  - bottom sheet and modal
  - toast
  - empty state and skeleton loader
- [x] Add haptics (light tap, success, warning) and a brief PR celebration animation. *Haptics respect the Settings toggle; animations respect Reduce Motion. Sheets use the native iOS sheet.*
- [x] The user picks the four unsettled styles in the gallery's "Choices" section (secondary button, stepper, selected chip, text field). *Picked: tinted secondary buttons, split steppers, filled selected chips, filled text fields. Recorded in spec 2.13.*

**Done when:** a dev-only **component gallery** screen shows every component in both themes, and the user has approved it on their phone.

---

## Phase 2: Every Screen with Fake Data

Screens are listed in priority order. Each one includes its empty, loading, and error states.

### G2.1 Today 👁

- [x] Calendar wheel for browsing past and future dates. *Week strip with status dots (user's pick).*
- [x] Today's workout card(s). *Dark hero cards (user's pick).*
- [x] `Start Workout 1/3` with a switcher between workouts. *Swipeable cards with page dots (user's pick).*
- [x] States for a rest day, a missed workout (with the "push plan forward?" prompt), a completed workout (reopen/repeat), and a partial workout. *Also skipped, late, and repeated workouts. Start, Reopen, Repeat, and the push-forward shift now work (G2.2, G3.7).*
- [x] The user has reviewed Today on their iPhone.

### G2.2 Active workout 👁

The most important screen.

- [x] Dense table rows: set, previous, weight, reps, and a complete check. *Completed rows turn green (user's pick).*
- [x] Pre-filled targets, with "last time" values in muted text.
- [x] Set kind and modifier selectors, RPE/RIR, tempo, notes. *In the set detail sheet (user's pick).*
- [x] Rest timer bar and sheet: pause, extend, skip, adjust. *Bottom bar (user's pick); also shown in the mini bar.*
- [x] Superset and circuit grouping.
- [x] Add, remove, reorder (drag), and swap exercises.
- [x] Skip an exercise, and finish as partial.
- [x] A camera button on the exercise header (opens the mock flow from G2.7). *Shows a note until G2.7.*
- [x] Opens as a sheet that minimizes to a mini bar above the tabs (user's pick).
- [x] The user has reviewed the workout screen on their iPhone.

*The workout lives in memory only: it survives minimizing and switching tabs, but not closing the app, and finishing doesn't save it to history yet. Saving comes with G3.4.*

### G2.3 Workout summary 👁

- [x] Total volume, new PRs, and a partial/complete badge. *Dark hero card plus comparison with the last time (user's picks).*
- [x] PR celebration, with confetti only when there are PRs. *Brand confetti (user's pick).*
- [x] A "save changes to plan?" prompt. *Lists the added, swapped, removed, and reordered exercises and set-count changes.*
- [x] The user has reviewed the summary on their iPhone.

*Finishing now saves the workout and plan changes into the in-memory sample data, so they show on Today and in "previous" values until the app restarts. Real storage comes in G3.1.*

### G2.4 Plans 👁

- [x] Plan list (multiple active plans) and plan detail with its calendar. *Segmented tab (My plans / Templates / Exercises) and week-grid schedule (user's picks).*
- [x] Plan editor for weekly, fixed-length, and rotating plans. *Three-step setup, then the editor (user's pick); schedule editor for weekdays, program length, and rotating cycles.*
- [x] Prescription editor: sets, reps, weight, RPE/RIR, rest, tempo, warm-ups, progression rule.
- [x] Template browser by category. *Category chips + cards (user's pick). Four templates have full sample workouts; three are listing-only until G3.13.*
- [x] Exercise picker and custom exercise form (with base-movement link).
- [x] The user has reviewed Plans on their iPhone.

*Plan and exercise edits save into the in-memory sample data, and the upcoming calendar is rebuilt so Today shows them, until the app restarts.*

### G2.5 Home 👁

- [x] Weekly snapshot at the top, then active goals, then recent PRs and form wins, then badges. *Dark hero snapshot, goal bars with pace, one mixed wins feed, earned + next-up badges (user's picks).*
- [x] Goal creation for all four goal types, with an optional deadline. *Also edit and delete.*
- [x] Badge detail.
- [x] The user has reviewed Home on their iPhone.

### G2.6 Progress 👁

Load the `dataviz` skill before building any charts.

- [x] Auto-analytics cards: pinned exercises plus the most frequent, shown as sparklines. *Full-width rows, e1RM by default (user's picks).*
- [x] Full graph view, with swipe between loaded graphs. *Drag-to-read crosshair; session table under each chart.*
- [x] Custom graph builder: exercise × metric.
- [x] Exercise history and PR list.
- [x] Bodyweight log. *Dots + 7-day trend (user's pick); log and delete weigh-ins.*
- [x] The user has reviewed Progress on their iPhone.

*Charts use react-native-svg instead of Victory Native XL (Skia version mismatch with Expo Go on SDK 58); see spec 2.2.*

### G2.7 Form analysis (visual mock only) 👁

- [x] Device-unavailable state for phones older than iPhone 12. *Detected with expo-device; previewable from the setup tips in dev builds.*
- [x] Camera setup guide: side placement, portrait/landscape tip, framing warnings. *Live preview + checklist (user's pick).*
- [x] Countdown and recording overlay with a live rep count, using a still image in place of the camera. *An animated skeleton lifter stands in for the camera.*
- [x] Report:
  - replay placeholder with skeleton overlay
  - joint-angle charts
  - rep-by-rep breakdown
  - comparison picker (last 2, or any earlier recording)
  - observations and cues
  - educational notice

  *Summary first, dots-per-rep chart (user's picks).*
- [x] Delete video vs. delete report.
- [x] The user has reviewed the form screens on their iPhone.

### G2.8 Profile & Settings 👁

- [x] Account section. *Account card with lifetime stats (user's pick); sample account until sign-in exists.*
- [x] Every setting from the spec: *Grouped sub-pages (user's pick).*
  - units, RPE/RIR, theme
  - rounding increments, rest defaults
  - notifications with quiet hours
  - Face ID and lock timing *(real Face ID prompt to turn it on; enforcing the lock is G4.8)*
  - haptics/celebrations toggle, telemetry opt-out
- [x] Data export, and delete account with the 7-day grace explanation. *CSV and JSON export really work through the share sheet; deletion is a preview until G5.4.*
- [x] The user has reviewed Profile on their iPhone.

*Week start (Monday or Sunday) is a setting under Units & logging (G3.7). Settings changes reset when the app restarts, like the rest of the sample data.*

### G2.9 Auth, onboarding, tutorial 👁

- [x] Sign in and sign up: email + Sign in with Apple, following Apple's button guidelines, and showing the age-16 requirement. *Dark hero welcome (user's pick); Apple's official button; a real Apple sign-in sheet in Expo Go.*
- [x] Verify-email and reset-password screens.
- [x] Optional onboarding steps and the recommendation result (1-3 templates). *One question per screen (user's pick); rule-based matching.*
- [x] Optional tutorial. *Swipeable cards (user's pick).*
- [x] Notification permission explainer screen. *Shown before the real iOS prompt when a notification is first turned on.*
- [x] The user has reviewed sign-in and onboarding on their iPhone.

*Accounts are mocked on the phone until Supabase Auth (G5.1): any valid email and password signs in. Profile → Developer → "Restart first-run setup" replays the whole new-user flow.*

### G2.10 iPad layouts 👁

- [x] Adapt every screen for iPad. *Two-column dashboards (user's pick) for Today, Home, Progress, Plans, and Profile; every other screen is one centered column at a readable width.*
- [ ] Review on an iPad. *The user has no iPad, so this waits for the TestFlight beta (G6.5) or a borrowed device. Phone layouts are unchanged.*

*The app is portrait-only (app.json). Before App Store submission (G6.6), decide whether iPad may rotate. Apple requires full-screen mode for iPad apps that don't support every orientation, which turns off Split View.*

### G2.11 Polish pass 👁

- [x] Check every screen in dark mode. *Audited for contrast; inputs, success text, and gold icons retuned, and dark hero cards get a thin blue edge and light-mode selections a darker outline (user's picks).*
- [x] Check every screen at large Dynamic Type sizes. *Scale fully, reflow rows (user's pick): text grows to iOS-like ceilings, rows stack, sheets open full height, and dense spots stop at 1.5×. The set table stays one row per set.*
- [x] Add VoiceOver labels. *Every control is labeled; steppers, timers, and charts are adjustable; sets, rest, PRs, and recording are announced.*
- [x] Make every empty, loading, and error state consistent. *Shared states in one order (error, loading, not found, empty), a toast for every failed save, and developer switches to slow or fail data (Profile → Developer → Component gallery).*
- [x] Refine motion. *Set complete pops the check, cards shrink when pressed, and the rest and workout bars slide in (user's picks). Reduce Motion turns movement off.*
- [x] The user has reviewed the polish pass on their iPhone.

### G2.12 App icon & splash 👁

- [x] Present icon and splash options; the user picks. *Five rounds on an options page. The user picked a black weight plate with a blue color-code stripe, stamped "45 LB / 20 KG", with lit progress ticks and a gold PR hand, plus a splash that follows the theme. iOS dark and tinted icons and Android adaptive icons are included.*
- [x] Light and dark splash backgrounds, and a themed root background, so dark-mode launches don't flash white. *Expo Go shows its own splash; these take effect in the development build (G4.1).*

### 🏁 Design sign-off

The user approves the app's look end to end before Phase 3 starts. Later phases change behavior, not appearance.

- [x] The user signed off the design.

---

## Phase 3: Core Functionality (local-first, still Expo Go)

Everything works on one phone, offline, with no server.

### G3.1 Local database

- [x] expo-sqlite schema and migrations, replacing the fake data layer. *Screens are unchanged. Data now survives restarts, and the calendar keeps generating 28 days ahead as days pass.*
- [x] Client-generated IDs and tombstones from the start, so cloud sync can be added later. *Sets are stored per row, and every change is queued in an outbox for Phase 5.*
- [x] Sample data on first launch (user's pick). Profile → Developer has "Erase all data" (to start using the app for real) and "Load sample data". Sample data is never queued to sync.
- [x] Automated tests: `npm test` runs the database tests on Node's built-in SQLite.

### G3.2 Exercise library content

- [x] 150-250 built-in exercises with stable IDs, equipment, muscle groups, and base-movement mappings. *270, covering the full gym plus Olympic lifts and strongman, with "Movement (Equipment)" names and word-order-free search (user's picks). How-to text comes later with demo media.*
- [x] Custom exercises. *Saved in the database. Linking to a built-in uses the same search, with main movements listed first.*

### G3.3 Plans engine

- [x] All three plan types generate calendar occurrences. *Weekly by weekday, fixed-length by program week (ending after the last week), rotating by day whatever the weekday. Paused and archived plans schedule nothing.*
- [x] Multiple active plans. *Their workouts merge on Today's calendar.*
- [x] Plan versioning, with edits applying to future workouts only. *Every saved version is kept: missed workouts keep their original prescription, started ones keep their own copy, and unstarted future ones are rebuilt.*
- [x] Templates are copied into plans. *A deep copy with fresh ids, so template changes never reach a plan.*

### G3.4 Workout session lifecycle

- [x] Start, auto-save/resume, skip, partial, finish, reopen (same session), repeat (new linked session), delete. *Workouts auto-save and resume after the app closes. Skip and Unskip are in the card's ⋯ menu, and Delete is in the summary's ⋯ menu (user's picks). Discarding a reopened workout restores it.*

### G3.5 Logging rules

- [x] Set kinds and modifiers. *Assisted sets now log assistance ("−LB"), and tempo is validated and normalized.*
- [x] Single effort value shown as RPE or RIR.
- [x] Pre-fill logic. *Plan target, else last time's top weight rounded to the equipment, with reps from last time kept inside the range.*
- [x] Per-equipment and custom rounding. *Fixed: metric rounding of equipment without its own increment, and the missing kettlebell default.*
- [x] Bodyweight snapshot on each set, effective load (added, assisted, override), and the ask-once prompt for missing bodyweight. *The override is "Counted load" in the set sheet. Bodyweight is asked right away at first sign-in and never again (user's call); Profile → Bodyweight adds one any time.*

### G3.6 Calculations

- [x] Volume, e1RM (Epley, 12 reps or fewer), and all PR types.
  - *One record per exercise and type per workout, measured against the best from before it. Previously, ramping sets made chains of PRs, and a first workout made PRs.*
  - *Volume PRs are per exercise per workout, and leave out partial reps.*
  - *Bodyweight lifts compare added weight. Kg/lb rounding no longer makes records.*
  - *Longest weekly streak is now a record (Recent wins, Profile). The live PR badge follows the same rules as the summary and is derived from the sets' current values.*
- [x] Rules for which sets count (spec 2.7).
  - *Completed sets in a skipped exercise count everywhere.*
  - *A workout needs a completed working set to count.*
  - *Effective load is read from what was logged, ignores leftover values from other kinds, and is never negative.*
  - *Assisted machines added or swapped in mid-workout start as assisted.*
- [x] Recalculation after an edit, delete, or reopen.
  - *Every mutation invalidates what depends on it: goals refresh the streak and badges, and custom exercises refresh records.*
  - *Date changes refresh the streak.*
  - *A failed read isn't cached.*
  - *Finishing a reopened workout celebrates only new records and skips the plan prompt.*
  - *Discarding a reopen waits for the restore. A lost resume note no longer turns a reopen into a new workout.*

**Done when:** automated unit tests cover all of the above. *Done: 193 tests, including the calculation rules, every record type, live badges, summary and Today stats, the CSV, and repository recalculation after edit, delete, reopen, and goal changes. Audit findings that belong to later goals are listed under G3.7 and G3.10.*

### G3.7 Calendar rules

- [x] Attribute workouts to their completion date.
  - *History, records, streaks, Home's week, and the report use the local date the workout was finished, including a workout finished after midnight or done on a different day than planned.*
- [x] Missed-workout prompt, push-forward shift, and one-tap undo.
  - *Today asks about the latest missed workout of the past week, together with anything else the plan missed that day. "Push forward" moves them to today and the later workouts by the same number of days. "Keep schedule" hides the question for those workouts.*
  - *Weekly plans move only within the current week, so next week is as usual. Programs and rotating cycles move everything later (user's pick).*
  - *Workouts already started or done never move. A workout already in progress when the push was made stays put even if it's later discarded.*
  - *Undo stays on the banner until the end of the day, or until the moved workout is started (user's pick).*
  - *Pushes are stored with the plan (a new `plan_shifts` table), so they survive plan edits and the calendar filling in ahead. A plan edit never deletes a pushed workout. A moved workout says "Moved from …" for a week after the push.*
- [x] Multi-workout days.
  - *Workouts from different plans, or two on one day after a push, show as swipeable cards, and the pager moves to the workout a push just brought to today.*
- [x] Decide time zone and week-start handling.
  - *Calendar dates are the phone's local dates and don't move when you travel. Completion times are stored in UTC and shown in local time. Day math is safe across daylight saving changes.*
  - *Week start is Monday by default, with a Sunday option under Units & logging (user's pick). The streak, Home's week, the week strip, and the plan week grids all follow it.*

**Done when:** pushes, undo, week start, and date handling have automated tests. *Done: 384 tests, covering every plan type, more than one plan, doubled-up days, edits after a push, Sunday weeks, completion dates, and streaks. Also fixed: the test typecheck wasn't checking the test files.*

### G3.8 Rest timer

- [x] Stays accurate when the app is backgrounded.
  - *The countdown runs on the clock and refreshes the moment the app comes back. A rest that ended while the app was away clears with no late buzz. A paused rest survives closing the app.*
- [x] Rest-over alarm as a local notification.
  - *"Rest over · Squat, set 3", rescheduled on every adjust, pause, skip, or finish, never more than one pending. Silent while the app is open.*
  - *The first rest after a completed set offers the alarm once (user's pick); Allow asks iOS and turns it on.*
- [x] Superset round rest.
  - *A round finishes when every exercise with a set in it is done, so uneven set counts and any order work. Mid-round, the workout jumps to the next exercise and the bar says what's next (user's pick).*
- [x] Per-exercise-type defaults, and memory of the last value used.
  - *Adjusting a rest teaches the exercise its rest (user's pick). The exercise page shows it, with Reset. A rest typed into a plan still wins.*
  - *Plan rests now start on Auto, so plan workouts use the remembered or default rest (user's pick). Rests the app had filled into existing plans were cleared once; typed ones were kept.*

**Done when:** the rest rules, memory, supersets, background behaviour and the alarm's schedule have automated tests. *Done: 499 tests. Not yet checked on an iPhone: the alarm ringing on the lock screen, the first-rest sheet, and the auto-scroll with the number pad open.*

### G3.9 Progression rules

- [x] Rep-range and percentage rules.
  - *Rep range adds the rule's weight once every set hits the top of its range. Weekly % adds its percent in the first workout of a new week, building on what you lifted, when every set was done with no miss (user's pick).*
  - *Suggestions build on the same plan workout's last time, so heavy and light days progress separately, else the exercise anywhere (user's pick). The PREVIOUS column shows the same workout.*
  - *Suggestions round to the equipment's increment and always move at least one step. Assisted exercises progress by taking off assistance. A typed plan weight turns the rule off.*
  - *A short reason line under the exercise says what changed and why; tapping it offers "Use last time's weight" (user's pick).*
- [x] Missed-rep behaviour set per rule.
  - *A set below the bottom of its range is a miss (user's pick). "Repeat weight" holds the weight; "Deload" drops it by its percent after N misses in a row at the same weight.*

*From the G3.6 check: "Discard it and start" on a reopened workout now pre-fills from the workout just restored (fixed in G3.9).*

*Done: 626 tests, covering both rules, misses and deloads, rounding, assisted and bodyweight exercises, which workout a suggestion builds on, undo, and the reason line's wording. The sample data now shows an increase, a same-weight-after-a-miss and a deload in the Upper / Lower plan. Not yet checked on an iPhone: the reason line's look, tapping it, and its action sheet.*

### G3.10 Goals, badges, streaks

*Carried over from the G3.6 audit:*

- *Streak target:*
  - *The target should be the planned number of workouts when there's no frequency goal; today it defaults to 4.*
  - *Each week should be judged against the target in force that week, and frozen once the week ends, so editing a goal or plan doesn't rewrite past streaks.*
- *Badges:*
  - *Next-up badges (50/100 workouts, 12-week streak, plate milestones, form) are never awarded. Use one catalog for earning and progress.*
- *Goals:*
  - *A lift goal on a bodyweight exercise compares total load, not added weight.*
  - *Lift goal progress uses all-time history, not progress since the goal was set.*
  - *A bodyweight goal saved without a weigh-in is "achieved" at any weight.*
  - *The form goal reads only the newest report.*
  - *Frequency goals have no deadline or pace.*
- *Reopened workouts:*
  - *While a reopened workout is open, it drops out of the streak until it's finished again. This is accepted for now.*

- [ ] Weekly streak rules, including partial workouts. *Partial workouts are done in G3.6: one completed working set (not a warm-up) counts.*
- [ ] All four goal types, with pace tracking.
- [ ] Badge catalog thresholds (a content task: propose them for the user to approve).

### G3.11 Progress on real data

- [ ] Auto-analytics selection, custom graphs, and history.

### G3.12 Local notifications

- [ ] Workout reminders, missed-workout prompts, Sunday weekly summary.
- [ ] Quiet hours, and permission requested at the first relevant moment.
- [ ] Cancel or reschedule reminders when a workout is completed or shifted.

### G3.13 Content

- [ ] AI-drafted starter templates for the user to review.
- [ ] Onboarding recommendation rules table.
- [ ] Tutorial copy.

---

## Phase 4: Native Build & Form Analysis

**Prerequisites:** an Apple Developer Program membership ($99/yr) and an Expo/EAS account. iOS builds come from EAS cloud builds, because Windows can't build iOS apps locally.

### G4.1 Switch to an EAS development build

- [ ] Install the custom dev client on the iPhone and confirm everything from Phases 0-3 still works.

### G4.2 Camera stack spike (go/no-go)

- [ ] Vision Camera + MediaPipe Pose Landmarker + Skia overlay running on an iPhone 12+.
- [ ] Measure frame rate, latency, battery use, and heat.
- [ ] Set the analysis latency, battery, and storage targets the spec left open.

### G4.3 Capture flow

- [ ] Real setup guide and framing/lighting checks (warn, but allow recording).
- [ ] Portrait and landscape.
- [ ] Countdown, auto-stop, and live rep count that pre-fills the set's reps.
- [ ] On-device video storage.

### G4.4 Analysis engine

- [ ] For each movement family: landmarks, angles, rep segmentation, range of motion, partial-rep detection, and confidence flags.
- [ ] Build a library of test footage.

**Done when:** the spec's accuracy bars are met: at least 95% exact rep counts, and angles consistent within ±5°.

### G4.5 Form reports

- [ ] Annotated replay, trends, comparisons, observation rule library (reviewed wording), and model/rule versioning.

### G4.6 Video lifecycle

- [ ] Export a video to Photos/Files.
- [ ] Delete a video but keep its metrics.
- [ ] Delete an entire report.

### G4.7 Live Activity rest timer

- [ ] Rest countdown on the lock screen and Dynamic Island.

### G4.8 Face ID lock

- [ ] Opt-in, with the inactivity timeout and passcode fallback.
- [ ] Never interrupts an active workout or running rest timer.

---

## Phase 5: Accounts & Cloud Sync

### G5.1 Supabase Auth

- [ ] Supabase project set up.
- [ ] Email/password with verification and reset, plus Sign in with Apple, wired to the G2.9 screens.
- [ ] Age-16 gate.

### G5.2 Flask API

- [ ] Verify Supabase JWTs.
- [ ] SQLAlchemy models matching the local schema.
- [ ] Deploy to a managed host.
- [ ] Separate dev and prod environments.

### G5.3 Sync

- [ ] Outbox and retries.
- [ ] Most-recent-write-wins per set; sets added on different devices are all kept.
- [ ] Tombstones.
- [ ] Sync status indicator.
- [ ] Decide what happens to local data and unsynced changes on logout.

### G5.4 Data rights

- [ ] CSV and JSON export.
- [ ] Account deletion: deactivate immediately, purge after 7 days, delete local videos.

---

## Phase 6: Launch Readiness

### G6.1 Telemetry

- [ ] Sentry crash reporting and the minimal anonymous events, with an opt-out.

### G6.2 Accessibility audit

- [ ] WCAG AA, VoiceOver, Dynamic Type.

### G6.3 Legal & store

- [ ] Privacy policy and terms.
- [ ] App Store privacy labels.
- [ ] Screenshots and listing copy.

### G6.4 Acceptance test pass

- [ ] Every criterion in spec Section 7.

### G6.5 TestFlight beta

- [ ] Fix the issues it turns up.

### G6.6 App Store submission 🚀

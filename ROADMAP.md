# Roadmap

Work goals for building the Exercise Tracker. [exercise-tracker-draft.md](exercise-tracker-draft.md) is the source of truth for *what* the app does; this file sets *the order* it gets built in.

**Priority: get the look right first, then add functionality.** Phases 0-2 build every screen with fake data so the design can be reviewed and approved on an iPhone before any real logic exists.

**Current goal:** G0.2, waiting for the user to review it on their iPhone

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
- [ ] The user has reviewed it on their iPhone.

**Done when:** the user scans the QR code with Expo Go and can tap between all five tabs on their iPhone.

### G0.3 Fake data layer

- [ ] Add TypeScript types matching spec Section 3: exercises, plans, sessions, blocks, sets (kind + modifiers), bodyweight, goals, PRs, badges, form reports.
- [ ] Add realistic sample data:
  - 2 active plans
  - about 30 exercises
  - 8 weeks of workout history with PRs
  - bodyweight entries
  - 3 form reports
- [ ] Put the data behind a small repository interface so the SQLite version can replace it later without changing the screens.

**Done when:** every screen in Phase 2 can get its data from this layer.

---

## Phase 1: Design System

### G1.1 Theme tokens 👁

- [ ] Encode the spec 2.13 values as tokens:
  - accent #89CFF0 with dark text #0B1520
  - light theme: #F2F4F7 background, white cards, #0B0F14 header and tab bar
  - dark theme: #0B0D10 background, #171A1F cards, #F5F7FA text, #9AA4AF secondary text
- [ ] Add the shared scales:
  - SF Pro type scale with Dynamic Type
  - spacing scale
  - 12-16px radii
  - shadows/elevation
- [ ] Propose options for the colors the spec hasn't set yet (success, warning, error, disabled, and chart series colors) and let the user pick.
- [ ] Check WCAG AA contrast for every text and background pair in both themes.

**Done when:** the user has approved the full token set, and the light/dark toggle switches the whole app.

### G1.2 Core components 👁

- [ ] Build the shared components:
  - buttons (primary pill, secondary, ghost, destructive)
  - card, list row, section header
  - dark screen header and tab bar using SF Symbols, with a baby-blue active tab
  - inputs: text field, number field with decimal support, stepper, toggle, segmented control
  - chips and set kind/modifier tags
  - PR badge, progress bar, progress ring
  - bottom sheet and modal
  - toast
  - empty state and skeleton loader
- [ ] Add haptics (light tap, success, warning) and a brief PR celebration animation.

**Done when:** a dev-only **component gallery** screen shows every component in both themes, and the user has approved it on their phone.

---

## Phase 2: Every Screen with Fake Data

Screens are listed in priority order. Each one includes its empty, loading, and error states.

### G2.1 Today 👁

- [ ] Calendar wheel for browsing past and future dates.
- [ ] Today's workout card(s).
- [ ] `Start Workout 1/3` with a switcher between workouts.
- [ ] States for a rest day, a missed workout (with the "push plan forward?" prompt), a completed workout (reopen/repeat), and a partial workout.

### G2.2 Active workout 👁

The most important screen.

- [ ] Dense table rows: set, previous, weight, reps, and a complete check.
- [ ] Pre-filled targets, with "last time" values in muted text.
- [ ] Set kind and modifier selectors, RPE/RIR, tempo, notes.
- [ ] Rest timer bar and sheet: pause, extend, skip, adjust.
- [ ] Superset and circuit grouping.
- [ ] Add, remove, reorder (drag), and swap exercises.
- [ ] Skip an exercise, and finish as partial.
- [ ] A camera button on the exercise header (opens the mock flow from G2.7).

### G2.3 Workout summary 👁

- [ ] Total volume, new PRs, and a partial/complete badge.
- [ ] PR celebration, with confetti only when there are PRs.
- [ ] A "save changes to plan?" prompt.

### G2.4 Plans 👁

- [ ] Plan list (multiple active plans) and plan detail with its calendar.
- [ ] Plan editor for weekly, fixed-length, and rotating plans.
- [ ] Prescription editor: sets, reps, weight, RPE/RIR, rest, tempo, warm-ups, progression rule.
- [ ] Template browser by category.
- [ ] Exercise picker and custom exercise form (with base-movement link).

### G2.5 Home 👁

- [ ] Weekly snapshot at the top, then active goals, then recent PRs and form wins, then badges.
- [ ] Goal creation for all four goal types, with an optional deadline.
- [ ] Badge detail.

### G2.6 Progress 👁

Load the `dataviz` skill before building any charts.

- [ ] Auto-analytics cards: pinned exercises plus the most frequent, shown as sparklines.
- [ ] Full graph view, with swipe between loaded graphs.
- [ ] Custom graph builder: exercise × metric.
- [ ] Exercise history and PR list.
- [ ] Bodyweight log.

### G2.7 Form analysis (visual mock only) 👁

- [ ] Device-unavailable state for phones older than iPhone 12.
- [ ] Camera setup guide: side placement, portrait/landscape tip, framing warnings.
- [ ] Countdown and recording overlay with a live rep count, using a still image in place of the camera.
- [ ] Report:
  - replay placeholder with skeleton overlay
  - joint-angle charts
  - rep-by-rep breakdown
  - comparison picker (last 2, or any earlier recording)
  - observations and cues
  - educational notice
- [ ] Delete video vs. delete report.

### G2.8 Profile & Settings 👁

- [ ] Account section.
- [ ] Every setting from the spec:
  - units, RPE/RIR, theme
  - rounding increments, rest defaults
  - notifications with quiet hours
  - Face ID and lock timing
  - haptics/celebrations toggle, telemetry opt-out
- [ ] Data export, and delete account with the 7-day grace explanation.

### G2.9 Auth, onboarding, tutorial 👁

- [ ] Sign in and sign up: email + Sign in with Apple, following Apple's button guidelines, and showing the age-16 requirement.
- [ ] Verify-email and reset-password screens.
- [ ] Optional onboarding steps and the recommendation result (1-3 templates).
- [ ] Optional tutorial.
- [ ] Notification permission explainer screen.

### G2.10 iPad layouts 👁

- [ ] Adapt every screen for iPad, for example split views for Plans, Progress, and the form report.

### G2.11 Polish pass 👁

- [ ] Check every screen in dark mode.
- [ ] Check every screen at large Dynamic Type sizes.
- [ ] Add VoiceOver labels.
- [ ] Make every empty, loading, and error state consistent.
- [ ] Refine motion.

### G2.12 App icon & splash 👁

- [ ] Present icon and splash options; the user picks.

### 🏁 Design sign-off

The user approves the app's look end to end before Phase 3 starts. Later phases change behavior, not appearance.

---

## Phase 3: Core Functionality (local-first, still Expo Go)

Everything works on one phone, offline, with no server.

### G3.1 Local database

- [ ] expo-sqlite schema and migrations, replacing the fake data layer.
- [ ] Client-generated IDs and tombstones from the start, so cloud sync can be added later.

### G3.2 Exercise library content

- [ ] 150-250 built-in exercises with stable IDs, equipment, muscle groups, and base-movement mappings.
- [ ] Custom exercises.

### G3.3 Plans engine

- [ ] All three plan types generate calendar occurrences.
- [ ] Multiple active plans.
- [ ] Plan versioning, with edits applying to future workouts only.
- [ ] Templates are copied into plans.

### G3.4 Workout session lifecycle

- [ ] Start, auto-save/resume, skip, partial, finish, reopen (same session), repeat (new linked session), delete.

### G3.5 Logging rules

- [ ] Set kinds and modifiers.
- [ ] Single effort value shown as RPE or RIR.
- [ ] Pre-fill logic.
- [ ] Per-equipment and custom rounding.
- [ ] Bodyweight snapshot on each set, effective load (added, assisted, override), and the ask-once prompt for missing bodyweight.

### G3.6 Calculations

- [ ] Volume, e1RM (Epley, 12 reps or fewer), and all PR types.
- [ ] Rules for which sets count (spec 2.7).
- [ ] Recalculation after an edit, delete, or reopen.

**Done when:** automated unit tests cover all of the above.

### G3.7 Calendar rules

- [ ] Attribute workouts to their completion date.
- [ ] Missed-workout prompt, push-forward shift, and one-tap undo.
- [ ] Multi-workout days.
- [ ] Decide time zone and week-start handling.

### G3.8 Rest timer

- [ ] Stays accurate when the app is backgrounded.
- [ ] Rest-over alarm as a local notification.
- [ ] Superset round rest.
- [ ] Per-exercise-type defaults, and memory of the last value used.

### G3.9 Progression rules

- [ ] Rep-range and percentage rules.
- [ ] Missed-rep behaviour set per rule.

### G3.10 Goals, badges, streaks

- [ ] Weekly streak rules, including partial workouts.
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

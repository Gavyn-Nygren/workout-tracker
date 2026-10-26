# Exercise Tracker - Product Requirements Draft

This is the handoff record of the product discussion to date (last updated 2026-10-22, after the second discovery round). It separates firm decisions from the work that is still open. Most of the gaps listed in the first draft now have a decision; the ones that remain are listed in Section 6.

**Sections**

1. Release scope
2. Locked-in decisions
3. Data model and lifecycle rules
4. Direction and preferences (needs fleshing out)
5. Rejected and deferred ideas
6. Unresolved gaps and edge cases
7. Acceptance criteria

---

## 1. Release Scope

### Builder and release target

- A solo developer, working with AI assistance, is building the app for public release on the app stores.
- **iOS ships first.** Android follows in a later release. The code should stay cross-platform (React Native), but V1 testing, polish, and store submission are iOS-only.

### Feature matrix

| Capability | V1 (iOS launch) | Later release |
| --- | --- | --- |
| Email/password + Sign in with Apple | Yes | |
| Google sign-in | | Yes (ships with Android) |
| Face ID / biometric unlock | Yes (opt-in) | |
| Optional onboarding + optional tutorial | Yes | |
| Rule-based plan recommendation from onboarding | Yes | |
| Starter templates, custom plans | Yes | |
| Weekly, fixed-length, and rotating-cycle plans | Yes | |
| Multiple active plans | Yes | |
| Rule-based progression | Yes | |
| Workout logging, timers, supersets/circuits | Yes | |
| Live Activity rest timer (lock screen / Dynamic Island) | Yes | |
| iPad layout | Yes | |
| On-device form analysis (lower body) | Yes | |
| Form reports + comparisons | Yes | |
| Home dashboard, goals, badges, streaks | Yes | |
| Progress analytics + custom graphs | Yes | |
| Notifications | Yes | |
| Data export (CSV + JSON) | Yes | |
| Account deletion | Yes | |
| Crash reporting + minimal anonymous events | Yes | |
| Home AI chatbot | | Yes (first follow-up release) |
| AI plan generation/assistance | | Yes (with chat) |
| Contextual AI in Plans/Progress | | Yes |
| Web companion | | Yes (V1.1+) |
| Import history from Strong/Hevy | | Yes |
| Apple Watch app | | Not planned yet |
| Home screen widget | | Not planned yet |
| Cloud backup of raw video | | Not planned (export only) |
| Subscriptions / paywall | | Second iteration |
| Nutrition, sleep, recovery, photos, body measurements | | Future |
| Apple Health / Google Health sync | | Future |

---

## 2. Locked-In Decisions

### 2.1 Product, audience, and release emphasis

- The app is a **mobile-first exercise tracker for independent lifters**, optimized for **strength and hypertrophy** training.
- The defining V1 experience is an **optional form-analysis workflow**. Routine planning, fast workout logging, post-workout analysis, and progress tracking support it.
- V1 covers workouts, form, and manually recorded bodyweight only.
- The output of discovery is a detailed product/requirements specification, which this document is becoming.

### 2.2 Technical architecture

The repository is still a scaffold: an Expo starter client and an empty Flask entry point.

**Client**

- React Native with **Expo using custom development builds** (`expo-dev-client` with prebuild/Continuous Native Generation). **Expo Go is not supported**, because Vision Camera, MediaPipe, Skia, and the Live Activity extension all need native code.
- Server state: TanStack Query.
- **Local persistence uses an on-device SQLite database through expo-sqlite** (chosen in G3.1). It holds workouts, plans, history, and the sync outbox.
  - Every synced row has a client-generated id, an `updated_at`, and a `deleted_at` tombstone.
  - Logged sets are stored one row per set, so sync can merge per set.
  - Every change is also written to an outbox table for the sync worker.
  - Personal records, streaks, and badges are calculated from the stored history rather than stored, so edits never leave them stale.
  - Small UI state (pinned graphs, theme, sign-in state) lives in expo-sqlite's key-value store.
- Charts: **custom react-native-svg charts** for now. Victory Native XL was the plan, but its current release needs Skia 2.15+ while Expo SDK 58 / Expo Go ships Skia 2.14. The charts follow the dataviz rules (one axis, hairline grid, 2px lines, ringed markers, labelled endpoints, drag-to-read crosshair). Revisit Victory once on development builds (roadmap Phase 4).
- Form analysis: Vision Camera, MediaPipe Pose Landmarker, and Skia overlays, **all running on-device**.
- Live Activity rest timer: a native iOS widget extension.
- React Native Web stays possible but is not built or tested for V1.

**Server**

- Python 3.13, Flask, SQLAlchemy.
- **Authentication is handled by Supabase Auth.** Flask verifies Supabase-issued JWTs and does not hash passwords or issue tokens itself. This replaces the earlier hand-built JWT + bcrypt plan.

**Data and hosting**

- **Supabase Postgres** is the primary database. pgvector is available there for the later AI release.
- The Flask API is hosted on a **managed platform** (for example Render, Railway, or Fly.io).
- AI (later release): LangChain with OpenAI or Google Gemini.

**Telemetry**

- Crash and error reporting (for example Sentry).
- A minimal set of anonymous product events, such as workout finished, recording started, and recording failed.
- Users can opt out in Settings.
- Video, pose data, and health values are never sent.

**Devices**

- **iOS 17+** is required.
- Form analysis requires an **iPhone 12 (A14 chip) or newer**. On older devices it shows as unavailable, with an explanation, and everything else works normally.
- iPad is supported with a proper layout.

### 2.3 Accounts, security, and privacy

- An account is required; there is no guest or local-only mode.
- **Minimum age is 16.** The age requirement is shown at sign-up.
- Launch sign-in methods are **email/password and Sign in with Apple**. Google arrives with Android, and Apple's rules require Sign in with Apple whenever Google is offered.
- Email verification and password reset are handled by Supabase Auth.
- Users stay signed in and can use device credential autofill.

**Biometric unlock**

- It is opt-in and off by default.
- When enabled, Face ID is required after the app has been in the background for a chosen time: immediately, 5 minutes, or 1 hour.
- If Face ID fails or is unavailable, the device passcode is the fallback.
- Biometric lock never interrupts an active workout or a running rest timer.
- The app never stores or processes a face scan itself.

**Account deletion** (from Settings)

- The account is deactivated immediately. Signing in within **7 days** restores it.
- After 7 days, all cloud data is permanently deleted. Database backups expire within 30 days.
- Videos stored on the device are deleted from that device immediately.

**Data export**

- Users can export a **CSV** of workouts and sets and a **full JSON** export from Settings.
- The export also satisfies data-access requests.

### 2.4 Onboarding and preferences

- Onboarding is optional. It may collect experience level, goals, available equipment, training days, body measurements, and injuries/limitations.
- **Plan recommendation in V1 is rule-based.** Experience, goal, days per week, and equipment map to the best 1-3 starter templates, adjusted to the days available. AI plan assistance arrives with the chat release.
- The tutorial is independently optional: a user can take the tutorial without a recommendation, or get a recommendation without the tutorial.
- Units default to lb/in, with kg/cm selectable in Settings. Weights may be decimals.
- Users choose RPE or RIR display in Settings (see 2.6).
- The theme is chosen explicitly in Settings (light or dark) and can be changed at any time. The app does not simply follow the system theme.

**Sign-in and first-run screens**

- **Welcome** (user's pick: dark hero):
  - The app name, a one-line pitch, and the animated skeleton lifter.
  - **Apple's official Sign in with Apple button** (white style) to keep within Apple's design rules, then **Continue with email** and **Create an account**.
  - The 16+ age requirement and the Terms/Privacy line.
- **Email:**
  - Sign in with iOS password autofill.
  - Create account (optional first name, email, password with iOS strong-password suggestions, and a required "I'm 16 or older" toggle).
  - **Verify email** ("Check your inbox", Open Mail, resend with a 30-second cooldown).
  - **Reset password**: the reply is the same whether or not the account exists, so it doesn't reveal which emails are registered.
- **Access rules** (navigation guards): signed out, only the welcome and sign-in screens exist. New accounts see onboarding first; skipping it counts as finishing it.
- **Onboarding** (user's pick: one question per screen):
  - A progress bar, Skip on every question, and "Skip setup" at any time.
  - Questions: experience, main goal, equipment, days per week, height and bodyweight (bodyweight becomes the first weigh-in), and limitations with notes. The limitations step states that the app doesn't give medical advice.
  - Then **1–3 recommended templates** with the reasons each fits, "Start this plan" (today or next Monday), or build your own.
  - Then the optional tour.
- **Recommendation rules (V1):**
  - Templates that need equipment the user lacks are left out.
  - The rest are scored by goal → category, experience level, and days per week, with ready-to-use templates first.
- **Tour** (user's pick: swipeable cards): five cards (Today, logging and rest, form recording, progress, goals and streaks), illustrated with the app's own components. Skip any time, and replay from Profile → About.
- **Notification permission:** the first time a notification type is turned on, an explainer screen lists the benefits before iOS asks. If permission was denied earlier, it links to iOS Settings instead.

### 2.5 Plans, calendar, and workout lifecycle

**Plan types**

| Type | How it schedules |
| --- | --- |
| **Weekly** | Workouts are assigned to weekdays and repeat. |
| **Fixed-length program** | For example 12 weeks, with prescriptions that differ week by week. |
| **Rotating cycle** | A day-based sequence (for example A, B, rest, C, rest) that repeats regardless of weekday. |

**Plans and templates**

- **Several plans can be active at once.** Their workouts merge on the calendar, which is one way a day ends up with multiple workouts.
- Templates are **copied** into the user's plans. Later changes to a template never rewrite a user's plan or history.
- **Editing a plan changes unstarted future workouts only.** Completed history and any workout in progress keep their original prescription. Every saved version of a plan is kept, so a missed workout still opens with the prescription it was scheduled with.
- Pausing or archiving a plan clears its upcoming workouts; resuming schedules them again from today. Deleting a plan removes every workout of it that wasn't started, missed ones included.
- Users can start from curated starter templates or build custom plans.
- Starter templates cover bodybuilding, powerlifting, ATG, CrossFit-style, athletic development, bodyweight, and gym/weighted training. They are **AI-drafted original programs reviewed by the developer**; branded programs are not reproduced.

**Plans tab layout**

- A segmented control at the top switches between **My plans / Templates / Exercises**.
- **My plans:**
  - Each plan is a card with its type, training days, a mini week grid, and the next workout.
  - Active plans come first, then paused or archived ones.
- **Plan detail:**
  - A status card, then the **week grid** for the schedule.
    - Weekly and fixed-length plans show seven day columns with workout chips.
    - Rotating plans show the cycle as a row of steps.
    - Fixed-length plans also show "Week N of M".
  - Below the grid, the plan's workouts.
  - The menu offers rename, pause/resume, and delete. Deleting removes upcoming workouts; logged history stays.
- **New plan:** a short three-step setup, then the plan editor:
  1. Plan type.
  2. Name and start date (today or next Monday).
  3. Training days and program length, or the rotating cycle.

  Each training day starts as an empty workout to fill in.
- **Workout editor:**
  - Exercises show their sets × reps, rest, and progression.
  - The ⋯ menu offers edit sets & reps, swap, superset with next / split up, move up or down, and remove.
- **Sets & reps editor:**
  - A per-set table of reps (a number or a range), effort, and rest, where you can change each set's type and add sets or warm-ups.
  - A shared target weight (Auto by default), applied to every working set, and a shared tempo.
  - The progression rule (none, rep range, or weekly %) and what to do on a miss (repeat, or deload after N misses).
  - It saves with a Save button and warns before you discard unsaved edits.
- **Templates:** category filter chips, then a card per template showing level, days per week, length, and equipment. A template's detail shows its schedule and workouts. **Use this template** copies it into a new plan starting today or next Monday.
- **Exercises:**
  - The library has search and muscle filters, with your custom exercises listed first.
  - Each exercise's detail shows its muscles, when you last did it (with your best set), and which plans use it.
  - The custom exercise form needs only a name. Linking it to a built-in movement groups its stats and inherits form analysis.

**Today screen**

- Today shows the scheduled workout(s) for the selected date, with a calendar wheel at the top for browsing past and future dates.
- When a date has several workouts, Today shows the position and count (for example `Start Workout 1/3`), provides controls to move between them, and allows them to be completed in any order.
- **Layout:**
  - **Calendar:** a **week strip**: seven days, swipe for other weeks, with a Today shortcut. Dots under each day show its workouts:
    - filled green: done
    - filled amber: partial
    - blue ring: planned
    - amber ring: missed
    - gray ring: skipped
  - **Workout cards:** **dark hero cards**, near-black in both themes, with white text and the baby-blue Start button.
  - **Several workouts on one day:** swipe sideways between the cards; page dots and the button label show the position.
  - **Header:** reads **"THURSDAY · UPPER B"**, with "+1" when more workouts are scheduled that day. On rest days it reads "THURSDAY · REST DAY".
  - **Below the cards:** a "Coming up" list of the next few planned workouts.
- **Each card shows** the plan name, a status pill, the workout name, and the estimated time and number of working sets. It lists the exercises with their planned sets × reps; for finished workouts, the top set instead.
- **Buttons by state:**
  - **Planned, missed, or in progress:** Start or Resume. Future workouts get "Start early" instead.
  - **Skipped:** Start anyway.
  - **Done or partial:** volume, time, and PR count, plus View summary, Reopen, and Repeat.

**Missed workouts**

- A missed workout **stays on its original date** and can still be opened and completed from there.
- The app then **asks** whether to push the plan forward. If the user accepts, the missed workout and every later workout in that plan move forward by the same number of days, keeping the original spacing and rest days.
- The shift can be undone in one tap.
- Nothing is ever rescheduled automatically.

**Dates and streaks**

- **History, volume, PRs, and streaks use the date a workout was actually completed.** The scheduled date is kept as metadata for adherence.
- **The streak counts consecutive weeks** in which the user completed at least the planned number of workouts, or their weekly frequency goal. Rest days never break it. A **partial workout counts if it has at least one completed working set**; summaries and adherence stats still mark it as partial.

**Session lifecycle**

- Active workouts auto-save and resume where the user left off. Changes are saved half a second after each edit and immediately when the app goes to the background. Reopening the app resumes the workout, including a running rest timer.
- **Skip** lives in a ⋯ menu on the workout card for planned and missed workouts. The same menu offers **Unskip** (user's pick). "Start anyway" on a skipped workout turns the skip into the workout.
- **Delete** lives in the workout summary's ⋯ menu, with a confirmation (user's pick). Deleting removes the workout's sets and form recordings, stats recalculate, and its scheduled day goes back to planned or missed.
- **Discarding** an unfinished workout deletes it. Discarding a *reopened* workout restores it exactly as it was.
- Exercises can be skipped, and a workout can be completed as partial.
- **Reopen** resumes the *same* session, for example after an accidental finish or to fix a log. Volume, PRs, and badges recalculate.
- **Repeat** creates a *new* session with the same exercises. It is linked to the original and counted separately.
- When a workout finishes, a quick summary appears immediately, including total volume and new PRs.
- **Summary layout:**
  - A **dark hero card** shows "WORKOUT COMPLETE" or "PARTIAL WORKOUT", the name, the date, and the plan, with time, volume, sets, and PR count.
  - Below it, in order:
    1. The "update your plan?" prompt, when the workout differed from the plan.
    2. New PRs, grouped by exercise, each showing its previous value.
    3. A **comparison with the last time** the same workout was done: volume, time, and sets.
    4. Each exercise's best set and how it changed.
  - Increases show in green. Decreases are neutral, never red. Time changes are always neutral.
- **Celebration:** workouts with new PRs get a 2-second burst of **baby-blue, gold, and white confetti** and a success haptic. It's skipped when celebrations are off or Reduce Motion is on.
- **Viewing later:** the same summary opens from Today's "View summary" for any past workout. Past summaries don't show confetti or the plan prompt.

### 2.6 Workout composition and logging

**Planned workouts**

- A planned workout can include target sets/reps, suggested weight, RPE/RIR, rest duration, tempo, notes, and warm-up guidance. Sets and reps are the primary fields.
- **Warm-up sets can be planned** as well as logged.
- Supersets, circuits, and warm-up blocks are supported.
- **Tempo** uses 4-digit eccentric-pause-concentric-pause notation (for example `3-1-1-0`), with `X` meaning explosive. A tooltip explains the format. Typing "3110" or "3 1 1 0" saves "3-1-1-0"; anything else isn't saved and the field explains why.

**Set model**

Every set has exactly one **kind** and any number of **modifiers**.

| | Values |
| --- | --- |
| Kind | normal, warm-up, drop, timed hold, assisted |
| Modifiers | AMRAP, to failure, shortened partials, lengthened partials |

- Every set requires weight and reps. A timed hold records duration instead of reps. Bodyweight sets only need reps (added weight defaults to none).
- Assisted sets log **assistance** (shown as "−LB"), and assisted machines (pull-up, dip) start their sets as assisted.
- Optional fields: effort, rest time, tempo, notes, and partial-rep count.
- **Effort** is stored as one internal value (RIR = 10 − RPE) and shown as RPE or RIR according to the user's Settings choice.

**Logging behaviour**

- **Pre-fill:** weight and reps start filled with the plan target, or the progression rule's suggestion. Last session's values appear alongside in muted text. One tap confirms.
- **Changes during a workout:** users can add or remove exercises and sets, reorder exercises by dragging, and swap an exercise for an alternative (suggested from the same base movement or muscle group). When the workout finishes, the app offers to **save those changes back to the plan**.
- **Active workout screen layout:**
  - **Opening and minimizing:** it opens as a **full-height sheet**. Swiping it down minimizes it to a **mini bar above the tab bar** showing the name, elapsed time, sets done, and rest remaining; tapping the bar brings the workout back.
  - **Header:** a dark header with minimize, the workout name, elapsed time, sets done out of the total, a thin progress bar, and Finish.
  - **Sets table:** each exercise is a card with a dense set table: SET / PREVIOUS / weight / REPS / check. Tapping a PREVIOUS value copies it into the set.
  - **Completed sets:** the row turns **soft green** and the check fills green.
  - **Set detail sheet:** tapping the set number opens a sheet for set type, modifiers, **RPE/RIR**, tempo, partial reps, notes, and deleting the set. Logged extras show as small tags under the row.
  - **Supersets and circuits:** they share one card, with a header explaining the rest and labels such as A1 and A2.
  - **Exercise menu:** the ⋯ menu offers swap, note, skip, reorder, and remove. Exercises with form analysis also get a camera button.
  - **Finishing:** finishing with unlogged sets asks before saving the workout as partial. A set can't be completed without weight and reps.
- **New PRs:** a set that beats the exercise's previous best weight or e1RM shows the gold PR badge with a success haptic as soon as it's completed.

**Rest timer**

- Marking a set complete starts its rest timer automatically. The user can pause, extend, skip, or adjust it.
- **In the app:** a **bar docked at the bottom** of the workout shows the countdown with −15 s, +15 s, and Skip, plus a draining progress line. Tapping the bar opens a larger timer sheet with pause/resume and presets. When rest ends, there's a strong haptic and a brief "Rest over" bar.
- The timer runs as a **Live Activity** on the lock screen and Dynamic Island.
- **Default rest when the plan sets none:** compound 3:00, isolation 1:30, warm-up 1:00. Defaults can be edited in Settings and per exercise, and the app remembers the last value used for each exercise.
- **Supersets and circuits:** completing one exercise moves straight to the next with no timer (an optional short transition is allowed). The round's rest timer starts after the last exercise in the round.

**Progression**

- Each exercise in a plan can have an optional rule, such as "add X lb when all sets hit the top of the rep range" or a fixed weekly percentage for fixed-length programs.
- **What happens after missed target reps is set per rule.** Options include repeating the weight, or suggesting a deload of about 10% after N consecutive misses.
- Progression only ever produces suggestions; the user can always override them.

**Rounding**

- Suggested weights round to **per-equipment increments**. Defaults: barbell 5 lb / 2.5 kg, dumbbell 5 lb / 2 kg, machine 5 lb / 2.5 kg, cable 5 lb / 2.5 kg, kettlebell 5 lb / 4 kg. Equipment without its own increment (added bodyweight load, bands, other implements) uses the barbell increment.
- Users can set **custom increments**, for example for microplates.
- Logged weights accept decimals.

**Exercise library**

- **270 built-in exercises** (user's pick: the full gym plus Olympic lifts and strongman), each with a stable ID. They live in `client/src/data/content/exercises.ts`.
- Names read **"Movement (Equipment)"**, for example "Bench Press (Dumbbell)", so variations sort together (user's pick). Search matches words in any order, plus nicknames ("RDL", "OHP") and gym shorthand ("db", "kb").
- Variations link to their family's main movement (for example Pause Squat → Back Squat), which drives swap suggestions.
- Form analysis is flagged only on the verified variations in 2.8.
- How-to instructions are added later, together with demonstration media (user's pick).
- Custom exercises are available from day one. Only the name is required; equipment, muscle groups, instructions, and demonstration media/link are optional.
- A custom exercise can **link to a built-in base movement** (for example "My Safety Bar Squat" → Squat). Linking makes it eligible for form analysis and grouped stats.
- History is tied to exercise IDs, so **renaming never breaks history**.

**Bodyweight and effective load**

- Bodyweight is entered manually.
- The set sheet's **Counted load** shows what a bodyweight set counts as and lets the user override it.
- For bodyweight movements, the user logs reps plus any added load.
- Effective load = the most recent bodyweight + added load. Assisted sets use bodyweight − assistance. Users can override the calculated load.
- The **bodyweight value used is saved with each set** when it is completed, so later bodyweight edits never rewrite history.
- If no bodyweight has been entered, the app **asks once** (ever, not per workout) when a bodyweight exercise is logged. If the user skips, the set records reps + added load only and is left out of effective-load volume. It is **not back-filled** later.

### 2.7 Calculations and records

**Which sets count**

| Set type | Volume | PRs | e1RM |
| --- | --- | --- | --- |
| Warm-up | No | No | No |
| Working set | Yes | Yes | Yes |
| Partial-rep set (shortened/lengthened) | Yes | No | No |
| Timed hold | No | Own "longest hold" PR | No |

- **Volume** = reps × effective load.
- **e1RM** uses **Epley**, weight × (1 + reps/30), and is calculated only for sets of **12 reps or fewer**.

**PR types**

- Heaviest weight
- Most reps at a given weight
- Estimated 1RM
- Highest volume
- Longest weekly streak
- Longest timed hold

Editing, deleting, or reopening a workout recalculates the affected PRs, volume, badges, and goals.

### 2.8 Form analysis

**Scope**

- Camera analysis is always optional and can be used for as many or as few sets as the user chooses.
- Analysis runs **entirely on-device**: video and pose data never leave the phone.
- **Recording is in-app only.** Importing video from the camera roll is not supported in V1.

**V1 verified movement families** (lower body only)

| Family | Variations | Angles measured |
| --- | --- | --- |
| Squats | back, front, goblet, ATG/deep | hip, knee, ankle/shin |
| Lunges / split squats | split squat, Bulgarian split squat, forward/reverse lunge | hip, knee, ankle/shin |
| Deadlifts / RDLs | conventional, trap-bar, RDL, stiff-leg | hip, knee, shin |
| Calf raises | standing, seated | ankle |

Sumo deadlifts are excluded because they are hard to read from a side view.

**Capture flow**

1. The user chooses to record a specific set.
2. A setup guide helps place the phone side-on and suggests portrait or landscape per movement; **both orientations are supported**.
3. If the side angle, lighting, distance, or body visibility is poor, the app **warns but still allows recording**. Low-confidence reps and angles are flagged in the report and left out of trends.
4. Recording starts after a **countdown** (5-10 seconds, configurable). It **stops automatically** after the user stays out of the start position for a few seconds or leaves the frame. A manual Stop is always available.
5. During the set, the screen shows framing guidance and a **live rep count** only. There are no corrective cues mid-set.
6. The detected rep count **pre-fills the set's reps**, and the user confirms or corrects them before completing the set.

**Report**

- The report attaches to both the set/workout and the exercise.
- It includes:
  - annotated replay
  - joint angles
  - a rep-by-rep breakdown
  - angle and range-of-motion trends
  - comparisons with earlier recordings
  - technique observations
- **Comparisons** default to the two most recent earlier recordings of the same exercise. A "choose another" list offers any earlier recording that still has metrics.
- **Self-comparison over scoring.** A standard movement model defines what is measured, and reports focus on the user's own change over time, especially week to week. Changes smaller than about 5° are reported as "no meaningful change."
- **Suggestions are observations plus neutral, educational cues** drawn from a fixed rule library the developer reviews. Example: "Depth on reps 4-6 was 12° shallower than reps 1-3 and last week. Some lifters find a slower descent helps keep depth consistent."
- Reports **contain no pain or injury language in V1.** A static notice reads: "Educational, not medical advice. Stop if you feel pain."
- Reports never diagnose injuries or prescribe treatment or rehabilitation.

**Form screens layout**

- **Setup** (user's pick: live preview + checklist):
  - The full-screen camera view has a dashed body outline to stand inside, and live check pills for side view, full body, and lighting.
  - A movement-specific orientation tip (for example, landscape for deadlifts and lunges).
  - A 5 s or 10 s countdown, then **Start recording**.
  - Warnings explain that recording still works and unclear reps get flagged.
  - The **?** button opens placement tips: side-on at hip height, about 3 m back, face the light, nobody else in frame.
- **Recording:**
  - A big countdown, then REC with elapsed time, a framing status pill, and a **large live rep counter** with a tap per rep.
  - There are no corrective cues during the set.
  - It stops automatically about 2 seconds after the last rep, or with the Stop button.
- **Analyzing:** an on-device analysis progress list, with "Your video never leaves this device."
- **Review:** confirm or correct the rep count, which fills in the set's reps. Shows the quality summary and the comparison used, plus **Save reps to set**, **View report**, and **Discard**.
- **Report** (user's pick: summary first):
  1. A summary card: average bottom angle of the primary joint, the change vs the comparison (under 5° shows as "no meaningful change"), range of motion, reps (and how many were unclear), time per rep, and framing quality.
  2. The comparison picker: the last two recordings, **Older…**, or None.
  3. The **annotated replay**: the skeleton with the live angle and rep markers, or a "Video deleted, metrics kept" state.
  4. **Dots per rep vs comparison** (user's pick): newest shade strongest, unclear reps as hollow rings, tap a rep to compare.
  5. Depth over time.
  6. A rep-by-rep table.
  7. "What changed": observations with neutral cues.
  8. The educational notice.

  The ⋯ menu offers Export video, Delete video (keep metrics), and Delete report.
- **Where reports open from:** Home form wins, and exercise history (Progress → exercise → Form recordings).
- **Older phones:** below iPhone 12, the camera button is hidden and setup explains why.

**Video lifecycle**

- Raw video is recorded only when the user starts a recording and is stored on the device.
- Videos can be **exported to Photos/Files** per set. There is **no app-cloud video backup**.
- **Deleting a video keeps the metrics** (angles, rep breakdown, and trend points, which sync), but removes the video and annotated replay.
- A separate **Delete report** action removes everything.
- Workout data, plans, analytics, and form metrics sync across devices; raw video does not.

### 2.9 Home, goals, and achievements

**Navigation:** `Today | Plans | Home | Progress | Profile` (five tabs, Home in the center).

- **Home** is a personal dashboard, not a dense analytics view. Top to bottom:
  1. **Weekly snapshot:** workouts done vs planned, plus the current week streak.
  2. Active goals.
  3. Recent PRs and form improvements.
  4. Badges.

  The AI chat entry point is added to Home in the chat release.
- **Home layout:**
  - **Weekly snapshot:** a **dark hero card** with a ring for workouts done against the weekly target and the 🔥 week streak.
    - A message says how many workouts remain this week to keep or start the streak.
    - A Mon–Sun row of status dots shows the week, with today underlined.
    - Tapping the card opens Today.
  - **Goals:** each goal has a **progress bar**, current vs target, and days left.
    - Goals with a deadline also get an **On track / Behind pace** tag. Pace is compared with a straight line from the goal's start to its deadline, with a little slack.
    - Tapping a goal offers Edit or Delete.
  - **Recent wins:** **one mixed feed** from the last 3 weeks of PRs (one line per exercise per workout), form improvements of 5° or more, and badges earned. Form wins and badges always make the list; minor PRs are dropped first.
  - **Badges:** a row of **earned** gold medallions, plus **"Next up"** badges shown dimmed with progress rings. Tapping a badge opens its detail sheet.
- **Goal form:**
  - Type: Lift, Frequency, Weight, or Form, each with its own fields and an optional deadline of 4, 8, or 12 weeks.
  - The goal title is generated automatically.
  - A frequency goal also sets the weekly streak target.
- **Goal types:**
  - lift target (X × Y reps, or an e1RM target)
  - frequency (N workouts per week)
  - bodyweight target
  - form / range of motion (for example reaching a squat depth angle)

  Each goal has an **optional deadline** with a pace indicator.
- **Badge categories:**
  - milestones: first workout, 10/50/100 workouts, total-volume milestones
  - strength: plate milestones, bodyweight-ratio lifts, PR counts
  - consistency: week-streak lengths, completing a full program
  - form: first analyzed set, N recordings of a movement, range-of-motion improvement
- **Profile** owns account, settings, data export, deletion, and (later) subscriptions.
- **Profile layout** (user's picks):
  - An **account card** with an initial avatar, name, sign-in method, and **lifetime stats**: workouts, current streak, and PRs set.
  - Then Appearance (System / Light / Dark), and **grouped settings pages** like iOS Settings:
    - **Units & logging:** lb/kg, which also resets rounding to that unit's defaults; RPE or RIR; per-equipment rounding increments, decimals allowed.
    - **Workout defaults:** rest for compound, isolation, and warm-up sets, in 15-second steps; the haptics and PR-celebration toggles.
    - **Notifications:** five opt-in categories, a reminder time, the weekly summary day and time, and quiet hours with start and end times. A rest timer still alerts during quiet hours.
    - **Privacy & security:**
      - The Face ID lock confirms with a real Face ID prompt when you turn it on, and locks after Immediately, 5 min, or 1 hour.
      - The anonymous usage data toggle.
      - A note that videos never leave the phone.
    - **Data & account:**
      - **Workouts as CSV** (one row per logged set) and **Everything as JSON**, both through the iOS share sheet.
      - Sign-in method and sign out.
      - Delete account, with a timeline of what happens when (right away, 7-day restore window, permanent deletion, backups within 30 days) and typing DELETE to confirm.
    - **About:** version, legal links, and the not-medical-advice line.

### 2.10 Progress analytics

- **Automatic analytics** show user-pinned exercises plus the most-logged exercises from the last 8 weeks, up to about 6 in total.
- **Custom graphs:** the user picks an exercise and plots volume, reps, top weight, sets, e1RM, and related history.
- **Several loaded graphs** appear as a scrollable list of compact sparkline cards. Tapping a card opens the full interactive graph, and swiping left or right moves between loaded graphs.
- **Progress layout:** **one scrolling page**. A row of range chips at the top (1M / 3M / 6M / 1Y / All, default 3M) scopes everything below it. Then, in order:
  1. **Key exercises:** **full-width cards** showing **estimated 1RM**, the change over about 4 weeks, and a sparkline.
     - Pinned exercises come first (Squat, Bench, and Deadlift by default), then compound lifts by how often they're logged.
     - Long-press a card to pin or unpin it.
  2. **Your graphs:** custom exercise × metric graphs. Metrics are e1RM, top set, volume, reps, and sets. "New" opens the builder.
  3. **Bodyweight:** a card with the 7-day trend.
  4. **All exercises:** every logged exercise, each opening its history.
- **Graph screen:**
  - A big readout of the latest value and its change. Dragging across the chart scrubs it, and the readout follows.
  - A table of every session underneath, which also serves as the chart's accessible view.
  - From Key exercises: chips to switch the metric, and **Add to Your graphs**.
  - From Your graphs: swipe between graphs, or remove one.
  - The header's pin button pins or unpins the exercise.
- **Exercise history:** personal records (heaviest weight, e1RM, best session volume, longest hold) and every session's sets. Tapping a session opens its workout summary.
- **Bodyweight screen:**
  - **Weigh-ins as dots plus a 7-day trend line**, with a legend.
  - Lowest, highest, and average for the range.
  - The full log, where a long press deletes an entry.
  - **Log weight** allows one entry per day; logging again that day replaces it.

### 2.11 Notifications

**Types**

- planned-workout reminders
- rest-timer alarms
- missed-workout prompts
- weekly summary
- form-analysis-complete alerts

**Behaviour**

- All are opt-in and configurable by day, time, and quiet hours.
- **Permission timing:** the app asks the first time it's relevant (the first rest timer or first plan scheduled), after a short explanation screen. It never asks at launch.
- **Lock-screen content shows workout details**, for example "Leg Day starts in 30 min" or "Rest over - Set 3 of Squat". The iOS "Show Previews" setting is respected.
- **Weekly summary:** Sunday evening by default, adjustable. It is computed on-device and delivered as a local notification that opens a summary screen. It covers workouts done vs planned, total volume, PRs, streak status, and form highlights.

### 2.12 Offline and sync

**What works offline**

A **whole gym session** works without signal:

- today's and upcoming workouts
- active logging and the rest timer
- camera recording and analysis
- the workout summary
- recent history for "last time" values

Plan editing and full Progress graphs may need a connection.

**Sync design**

- Client-generated IDs.
- A local outbox; changes sync when the connection returns.
- **Conflicts: the most recent write wins per set or field record**, and sets added on different devices are all kept.
- Performance and ease of use take priority over exhaustive offline support.

### 2.13 Visual design system

| Token | Value |
| --- | --- |
| Primary accent | **#89CFF0** (classic baby blue); buttons use dark text **#0B1520** on accent fills |
| Light theme | background **#F2F4F7**, **white #FFFFFF cards**, dark header and tab bar **#0B0F14** |
| Dark theme | background **#0B0D10**, cards **#171A1F**, primary text **#F5F7FA**, secondary text **#9AA4AF** |
| Typography | **SF Pro** (system font), with full Dynamic Type support |
| Icons | **SF Symbols** (an Android/web fallback set is needed later) |
| Shape | **Rounded, 12-16px** corners, pill buttons |
| Accent text | Baby blue is too pale for text on light surfaces (1.7:1), so accent-colored text uses **#1A6FA3** in the light theme and #89CFF0 in the dark theme |
| Status colors | **Classic set**. Fills: success **#0CA30C**, warning **#FAB219**, error **#D03B3B** (light) / #E66767 (dark). Light-theme text shades: #006300, #8A5A00, #B02A2A. Always shown with an icon and a label |
| Destructive buttons | **#D03B3B** with white text |
| Personal records | **Gold #F5B400** with dark text #0B1520 |
| Chart main color | **Sky blue**: #1E86C1 (light), #3A9AD6 (dark) |
| Recording comparisons | **Shades of one blue**, newest strongest: #155E8C / #1E86C1 / #72B3DC (light), #89CFF0 / #3A9AD6 / #1A6FA3 (dark) |
| Disabled controls | 40% opacity of the normal control |
| Component styles | Secondary buttons: **pale baby-blue fill with blue text**. Steppers: **round − and + buttons either side of the value**. Selected chips: **solid baby blue**. Text fields: **light gray fill, border only on focus or error** |

All token values live in `client/src/theme/tokens.ts`. Every text and background pair passes WCAG AA in both themes, and the chart palettes pass colorblind-separation checks against the app's card colors.

- **Active workout layout:** **dense table rows** in the Strong/Hevy style. Each set row shows set, previous, weight, reps, and a complete check. A camera button and a menu sit in the exercise header.
- **Feedback:** a light haptic on set complete and a stronger one when the timer ends. A brief animated badge appears on a PR, and confetti only when a workout with PRs finishes. Both can be toggled off in Settings.
- **Overall style:** athletic and high-contrast, with dark persistent header and navigation, baby-blue primary buttons and active navigation, and high-energy exercise cards.
- **iPad layout:** the user picked **two-column dashboards**. A screen counts as wide at **700 pt** or more, which covers every iPad including the iPad mini in portrait.
  - **Dashboards** (Today, Home, Progress, Plans, Profile) use two columns, up to 1120 pt wide:
    - **Today:** the week strip spans the top; the day's workouts are on the left, with Coming up beside them.
    - **Home:** this week and goals on the left; recent wins and badges on the right.
    - **Progress:** key exercises on the left; your graphs, bodyweight, and all exercises on the right.
    - **Plans:** plan and template cards two per row. The exercise library stays one readable column.
    - **Profile:** account and appearance on the left; settings on the right.
  - **Detail screens and forms** (plan editor, history, graphs, settings pages, sign-in, the active workout, the summary, the form report) stay one centered column, up to 720 pt wide.
  - **Sheets** become iPad's centered cards automatically.
  - On iPhone nothing changes: the right column's sections follow the left column's.
- **Large text (Dynamic Type):** the user picked **scale fully, reflow rows**.
  - Text grows with the iOS setting, up to how far iOS's own text styles grow: body text fully, big titles less.
  - At accessibility sizes, rows such as "title … value" and "label + stepper" stack, segmented controls become a vertical list, and sheets open full height.
  - Dense spots grow only to **1.5×**: set-table numbers, the week strip, badges, and camera overlays.
  - The workout set table stays **one row per set**. From about 1.3×, "previous" moves to a second line under the inputs.
- **Motion:** the user picked:
  - When a set completes, **the check pops and the row's green tint fades in**.
  - Tappable cards **shrink slightly (97%)** while pressed; list rows keep the iOS gray highlight.
  - The rest timer and the in-progress workout bar slide in.
  - With Reduce Motion on, cards dim instead and nothing moves.
- **Contrast fixes (user's picks):**
  - Light-mode inputs, chips and segmented controls use a **slightly darker gray** (#E4E7EC), so they show on the gray page. The "border only on focus or error" style stays.
  - Dark-mode hero cards get a **thin blue edge** (#2E4A5C).
  - Selected chips and segments get a **darker blue outline** in light mode.
  - Dark success text is #2DBE2D.
  - Text people need to read never uses the tertiary gray.
- **Screen states:** every screen checks them in the same order: error, then loading, then not found, then empty, then content.
  - **Load error:** "Couldn't load {thing}" / "Your data is still saved on this phone." / Try again.
  - **Not found:** "{Thing} not found" / "It may have been deleted." / Back (or Close in sheets).
  - **Loading:** skeletons shaped like the content.
  - **Failed save:** an error toast, "Couldn't save {thing}. Try again." The screen stays open with the user's input.
  - **Testing:** Profile → Developer → Component gallery has switches that make loads slow or fail, and saves fail.
- **App icon:** the user picked a **black rubber weight plate with a blue color-code stripe** (blue is the competition color for 20 kg plates). It has these details:
  - "45 LB" and "20 KG" stamped into the face, two cut-out grips, and a bolted steel hub.
  - Stopwatch-style ticks around the rim light up in blue for progress.
  - A gold hand points at the latest PR.
  - iOS 18 dark and tinted versions are included.
  - The source art is `client/assets/source/app-icon.svg`.
- **Splash screen:** the user picked **follows the theme**: the plate centered on #F2F4F7 in light mode and #0B0D10 in dark mode, the same as the page background, so nothing flashes on launch. The window behind the app follows the theme too.
- **VoiceOver:**
  - Every control has a spoken label, and steppers, timers and charts are adjustable (swipe up or down).
  - Set completion, rest ending, PRs and form-recording progress are announced.
  - Screen and section titles are headings.

---

## 3. Data Model and Lifecycle Rules

### 3.1 Core entities

All entities below are versioned and use client-generated IDs. Deletions are stored as tombstones so they can sync.

| Area | Entities |
| --- | --- |
| Account | user (via Supabase Auth), preferences (units, effort scale, theme, rounding increments, rest defaults, notification settings), devices, push tokens, consents, onboarding/tutorial state |
| Exercises | built-in exercise (stable ID), custom exercise (optional base-movement link), aliases |
| Plans | template, user plan (copied from a template, with type weekly/fixed/rotating), plan version, scheduled occurrence |
| Workouts | session, block (single/superset/circuit/warm-up), prescription (target values), logged set (kind + modifiers + actual values + bodyweight snapshot) |
| Body | bodyweight entries |
| Progress | goals, PR records, badges earned, streak state |
| Form | recording (on-device video reference), analysis report (metrics, rep breakdown, confidence, model/rule version), comparisons |

### 3.2 Session states

```
scheduled ──start──▶ in_progress ──finish──▶ completed (full | partial)
    │                    │  ▲                     │
    │                    │  └──────reopen─────────┘   (same session; stats recalculate)
    │                    └─auto-save / resume
    ├──skip──▶ skipped
    └──missed (date passes) ──▶ still openable on original date; app offers plan shift
completed ──repeat──▶ new session (linked to original, counted separately)
any ──delete──▶ tombstone (stats recalculate)
```

### 3.3 Calculation rules

- History, volume, PRs, and streaks use the **completion date**; adherence also uses the **scheduled date**.
- Each set keeps the bodyweight snapshot taken at completion.
- Any edit, delete, or reopen triggers recalculation of the affected PRs, goals, badges, and streak weeks.

---

## 4. Direction & Preferences (Needs Fleshing Out)

- **AI (later release):** contextual assistance is preferred over an isolated chatbot. The first AI release adds the Home chatbot, which covers workout-history questions, form-report explanations, exercise definitions, and general fitness education. It also adds AI plan assistance. Later releases may add swaps in Plans, insight explanations in Progress, load suggestions, weekly AI summaries, recovery-aware guidance, and camera setup coaching.
- **Pain-related language:** the user is fine with wording that movement may help reduce pain when done correctly and without pain. It is **excluded from V1** and needs a bounded content policy and safety review before appearing anywhere (chat or reports).
- **Subscriptions:** planned for the second iteration. The tentative direction is a lower-priced logging/templates tier and a higher-priced AI tier. Nothing about entitlements, pricing, or trials has been decided.
- **Form-calibration test profile:** an athletic test profile (5'10", 6-foot wingspan, 34-inch inseam, 40-inch chest) is for testing and calibration only. It is never a standard for users or movements.

---

## 5. Explicitly Rejected or Deferred Ideas

**Rejected**

- **Guest-first or no-account access:** sign-in is required.
- **Mandatory onboarding or mandatory plan recommendations:** both onboarding and the tutorial are independently optional.
- **Camera analysis for every working set, or video as a requirement:** camera analysis is always opt-in.
- **Live corrective coaching that interrupts a set:** live behavior is framing guidance and rep counting only.
- **A launch catalog that promises verified analysis for every exercise:** V1 offers broad logging plus a tiered, lower-body-first analysis catalog.
- **Cloud video processing:** analysis is fully on-device.
- **Cloud storage of raw videos, default or opt-in:** videos are exported to Photos/Files only.
- **Importing pre-recorded videos for analysis:** not in V1.
- **Medical diagnosis, injury diagnosis, rehabilitation prescriptions, and pain language in V1 reports.**
- **Automatic rescheduling of any kind:** the user always decides whether to shift the plan.
- **One workout per day, or a fixed daily order.**
- **Discarding interrupted workouts, blocking skips, or blocking partial completion.**
- **Permanently locking a completed workout.**
- **Requiring several charts on screen at once on a phone.**
- **System-theme-only behavior.**
- **Treating exhaustive offline operation as more important than responsiveness.**
- **Hand-built password/JWT auth in Flask:** replaced by Supabase Auth.
- **Expo Go / pure managed workflow:** custom development builds are required.
- **MMKV as the primary offline data store:** SQLite is used instead.
- **Branded or licensed third-party programs as templates:** templates are original.

**Deferred**

- Web companion (V1.1+).
- Google sign-in (ships with Android).
- Android release.
- Home AI chatbot and AI plan assistance (first follow-up release); other AI features later still.
- Importing history from Strong/Hevy.
- Apple Watch and home screen widget.
- Subscriptions and paywall (second iteration).
- Nutrition, sleep, recovery, progress photos, and broad body measurements.
- Apple Health / Google Health sync.

---

## 6. Unresolved Gaps & Edge Cases

### Content still to be produced

- **Template catalog:** the exact list of 6-10+ programs (at least one per category), their durations, and their progression rules. These are AI-drafted and reviewed by the developer.
- **Badge catalog:** exact thresholds (for example the volume milestones, plate milestones, and bodyweight ratios), names, and artwork.
- **Tutorial content:** screens and flow.
- **Onboarding recommendation rules:** the mapping table from onboarding answers to templates.
- **Form rule library:** the full set of observation and cue templates per movement, with reviewed wording.
- ~~**Built-in exercise list**~~: done in G3.2 (270 exercises). Still to do: how-to instructions and demonstration media.

### Technical decisions still open

- Local database library: expo-sqlite, op-sqlite, or WatermelonDB.
- Flask hosting vendor, email delivery through Supabase or a custom SMTP provider, environments, CI/CD (for example EAS Build/Submit), secrets management, and the release process.
- Validate the integration of Vision Camera + MediaPipe + Skia + the Live Activity extension in an Expo development build **before building features on top of it** (spike first).
- The context mentions a June 2026 full architecture specification that is not in the repository. Confirm that this document now supersedes it.

### Form-analysis engineering

- For each V1 variation, define:
  - landmarks
  - joint and angle definitions
  - rep segmentation
  - range-of-motion rules
  - partial-rep detection
  - confidence thresholds
  - which observation rules apply
- Choose 2D or 3D landmarks, the smoothing method, and how body proportions are handled. The test profile must not become a standard.
- Define the auto-stop details: the timeout length and how the start position is detected.
- Define analysis states (queued, processing, done, failed), retry behaviour, and how report and model versions are tracked.
- Decide how long pose data and annotated replays are kept locally, and how they move to a new device.
- Define behaviour for multiple people in frame, interrupted recordings, low storage, and thermal throttling.

### Sync, notifications, and edge cases

- Time zones and daylight saving time, for calendar occurrences, the weekly streak boundary (which day a week starts on), quiet hours, and reminders.
- Which notifications are local and which are remote. The working assumption is that reminders, timer alarms, and the weekly summary are local.
- Cancelling and rescheduling reminders when a workout is completed, shifted, or skipped.
- Notification behaviour on days with several workouts.
- Behaviour on logout: what local data is cleared and what happens to unsynced outbox items.
- The sync-status UX.
- Behaviour when the user disables or changes biometrics, and when reauthentication is needed for deletion or export.

### Design system remainder

- Usability guidance for the camera screen (with the real camera in Phase 4).

*Settled in G1.1 and G2.11 (see 2.13): the full color token set, spacing, motion, empty/loading/error states, and the accessibility targets (WCAG AA contrast, VoiceOver, and Dynamic Type at large sizes).*

---

## 7. Acceptance Criteria (V1 Launch Bars)

**Rep counting**

- On a test library of recordings that pass the framing check, **at least 95% of sets are counted exactly right, and none are off by more than 1 rep**.
- Low-confidence sets show a warning instead of a confident wrong number.

**Angle consistency**

- Re-analyzing the same rep, or near-identical reps, gives joint angles **within ±5°**.

**Low-quality video**

- Poor framing, lighting, or visibility always produces a visible warning, and the affected reps are excluded from trends.

**Device support**

- Form analysis is enabled on iPhone 12+ and shows a clear "unavailable" state on older devices.
- Analysis latency, battery, and storage-impact targets are still **to be set** once the technical spike has produced measurements.

**Calculations**

- Automated tests cover volume, e1RM, PR detection, bodyweight snapshots, effective load (added, assisted, overridden), rounding, unit conversion, and recalculation after an edit, delete, or reopen.

**Calendar**

- Tests cover all three plan types, multiple active plans, multi-workout days, the missed-workout shift and its undo, completion-date attribution, and weekly streaks including partial sessions.

**Timers**

- The rest timer and the Live Activity stay accurate when the app is backgrounded or the phone is locked. Superset transition and round rest behave as specified.

**Offline and sync**

- A complete workout session, including recording and analysis, works in airplane mode and syncs correctly afterward.
- Conflicting edits from two devices resolve by the last-write-wins-per-set rule without losing added sets.

**Notifications**

- Permission is requested only at the first relevant moment.
- Quiet hours are respected.
- Reminders cancel or reschedule when a workout is completed or shifted.

**Accessibility**

- WCAG AA contrast in both themes.
- VoiceOver labels on all interactive elements.
- Layouts hold up at large Dynamic Type sizes.

**Safety**

- Form-report text never diagnoses, prescribes, mentions pain or injury, or presents low-confidence inferences as fact.
- Every observation rule is reviewed before launch.

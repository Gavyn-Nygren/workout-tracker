# Starter content review (G3.13)

Generated from the app code by `node --import tsx tests/tools/writeContentReview.ts`, run in client/. Do not edit it by hand: a test checks that this file still matches the code.

What to do: reply in chat program by program with "approved" or the changes you want. Then do the same for the recommendation tables, the worked examples and the tour wording.

**Contents**

1. Programs at a glance
2. The 12 programs, in full
3. Recommendations: the best match for each answer
4. Recommendations: worked examples
5. The tour
6. Library additions

**How to read the programs**

- Working sets: "3 × 8–12" is 3 sets of 8 to 12 reps. "per leg" (or arm, or side) means each side gets that many. A hold reads "2 × 30 s".
- Effort: "RIR 2" means stop with about 2 reps left in reserve (RPE 8). "No target" is for jump, power and weekly-% sets.
- Warm-ups: the reps of each warm-up set, at most 2. Their load is blank: they pre-fill at about half of last time's working weight, both at the same weight, so a lift with two warm-ups has a note asking for a heavier second one.
- Tempo: seconds lowering, pausing, lifting and pausing, for example 3-1-1-0.
- Progression: the step the app takes, in lb and in kg, with a new account's rounding (barbell 5 lb / 2.5 kg, dumbbell 5 lb / 2 kg, machine 5 lb / 2.5 kg, cable 5 lb / 2.5 kg, kettlebell 5 lb / 4 kg; anything else uses the barbell's), then what happens on a miss.
- Rest: every set rests on Auto (the exercise's remembered rest, else the Settings default). Supersets and circuits rest after each round, as shown.
- Minutes: worked out from the Settings default rests (compound 180 s, isolation 90 s, warm-up 60 s) and 40 s of work a set (twice that one side at a time; a hold counts its own time), plus 5 minutes, rounded to 5.

## 1. Programs at a glance

12 programs, 41 workouts and 101 different exercises, in the order the Templates list shows them. Days a week lists every version, default first.

| # | Program | Style | Made for (suits) | Days a week | Length | Equipment | Also needs | Goals | Workouts | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Full-Body Foundations | Gym | Beginner (beginner to intermediate) | 3 or 2 | Ongoing | Dumbbell, Machine, Cable | a bench | General fitness (main), muscle growth, strength | 3 | Draft |
| 2 | Dumbbell Full Body | Gym | Beginner (beginner to intermediate) | 3 or 2 | Ongoing | Dumbbell | a bench | General fitness (main), muscle growth, strength | 3 | Draft |
| 3 | Home Bodyweight Starter | Bodyweight | Beginner only | 3 or 2 | Ongoing | Bodyweight | a low bar or sturdy table | General fitness (main), strength, muscle growth | 3 | Draft |
| 4 | Barbell Strength Base | Powerlifting | Beginner (beginner to intermediate) | 3 | 12 weeks | Barbell | a squat rack and a bench | Strength (main), muscle growth, general fitness | 3 | Draft |
| 5 | Full-Range Strength | Full range | Beginner (beginner to intermediate) | 3 or 2 | 8 weeks | Dumbbell | a bench and a box or step | Mobility and full range (main), general fitness | 3 | Draft |
| 6 | Upper / Lower Builder | Gym | Intermediate (intermediate to advanced) | 4 | Ongoing | Barbell, Dumbbell, Cable, Machine | a squat rack, a bench and a pull-up bar | Strength (main), muscle growth, general fitness | 4 | Draft |
| 7 | Five-Day Muscle Builder | Bodybuilding | Intermediate (intermediate to advanced) | 5 | Ongoing | Barbell, Dumbbell, Cable, Machine | a squat rack, a bench and a pull-up bar | Muscle growth (main), general fitness | 5 | Draft |
| 8 | Big Three Block | Powerlifting | Intermediate (intermediate to advanced) | 4 or 3 | 6 weeks | Barbell, Dumbbell | a squat rack, a bench and a pull-up bar | Strength | 4 | Draft |
| 9 | Calisthenics Strength | Bodyweight | Intermediate (intermediate to advanced) | 4 or 3 | Ongoing | Bodyweight | a bench, a pull-up bar, dip bars and a low bar or sturdy table | Strength (main), muscle growth, general fitness | 4 | Draft |
| 10 | Strength and Circuits | Conditioning | Intermediate (intermediate to advanced) | 3 or 2 | Ongoing | Barbell, Kettlebell, Dumbbell | a squat rack and a pull-up bar | General fitness (main), athletic performance, strength | 3 | Draft |
| 11 | Athletic Base | Athletic | Intermediate (beginner to advanced) | 3 or 2 | 10 weeks | Barbell, Dumbbell | a squat rack, a bench, a pull-up bar and a box or step | Athletic performance (main), strength | 3 | Draft |
| 12 | Push Pull Legs | Bodybuilding | Advanced (intermediate to advanced) | 6 | Ongoing | Barbell, Dumbbell, Cable, Machine | a squat rack, a bench and a pull-up bar | Muscle growth | 3 | Draft |

Gear used across the catalog: a squat rack, a bench, a pull-up bar, dip bars, a box or step and a low bar or sturdy table. Exercises missing from the library: none.

## 2. The 12 programs, in full

### 1. Full-Body Foundations

> Full-body workouts on machines, cables and dumbbells. Reach the top of each rep range, then add weight.

- Id: `tpl_full_body_foundations`
- Review status: Draft, not reviewed yet
- Card: Beginner · 2 or 3 days/week · Ongoing
- Style: Gym
- Level: Made for beginners. Also suits intermediate lifters
- Goals: General fitness (main), muscle growth, strength
- Equipment: Dumbbell, Machine, Cable
- Also needs: a bench
- Length: Ongoing (weekly)
- Day versions: 3 days a week (default), 2 days a week
- Form-analysis lifts: Goblet Squat (Dumbbell), Romanian Deadlift (Dumbbell), Split Squat (Dumbbell)

**Design notes**

- Squat, push and pull come up every session, at a beginner dose (ACSM 2009). The hinge (Romanian deadlift, hip thrust) comes twice a week on 3 days and once on 2 days, where the leg curl adds hamstring work.
- Stable machines keep the skill demand low.
- No exercise repeats across days.
- The 2-day version keeps the two workouts that cover every pattern.
- The dumbbell shoulder press and split squat use 8-15 reps, so the jump to the next dumbbell (5 lb or 2 kg) stalls them less. From the lightest dumbbells a lifter can still miss and deload once before the heavier pair sticks.

#### Day versions

**3 days a week (default)**. Weekly, ongoing. Card and page: Beginner · 3 days/week · Ongoing.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Full Body A | Rest | Full Body B | Rest | Full Body C | Rest | Rest |

**2 days a week**. Weekly, ongoing. Card and page: Beginner · 2 days/week · Ongoing. Also needs, in this version: nothing else.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Full Body A | Rest | Rest | Full Body B | Rest | Rest | Rest |

**Minutes and weekly sets.** Minutes add up the workouts in the week. Each set counts once for each primary muscle of its exercise; in brackets, the days that muscle is trained.

| Per week | 3 days a week (default) | 2 days a week |
|---|---|---|
| Minutes | 155 | 100 |
| Working sets | 45 | 30 |
| Quads | 9 (3 days) | 6 (2 days) |
| Hamstrings | 4 (2 days) | 4 (2 days) |
| Glutes | 13 (3 days) | 8 (2 days) |
| Chest | 6 (2 days) | 3 (1 day) |
| Back | 6 (2 days) | 3 (1 day) |
| Lats | 9 (3 days) | 6 (2 days) |
| Traps | 2 (1 day) | 0 |
| Shoulders | 7 (3 days) | 5 (2 days) |
| Biceps | 2 (1 day) | 2 (1 day) |
| Triceps | 11 (3 days) | 8 (2 days) |
| Core | 4 (2 days) | 2 (1 day) |

#### Full Body A

6 exercises · 15 working sets · ~50 min. Mon in the 3-day version; Mon in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Goblet Squat (Dumbbell) | 8 | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 2 | Chest Press (Machine) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 3 | Lat Pulldown (Cable) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 4 | Romanian Deadlift (Dumbbell) |  | 2 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 5 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 5a | Lateral Raise (Dumbbell) |  | 2 × 10–20 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |
| 5b | Plank |  | 2 × 30 s |  |  | None |

#### Full Body B

6 exercises · 15 working sets · ~50 min. Wed in the 3-day version; Thu in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Leg Press (Machine) | 10 | 3 × 10–15 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 2 | Seated Row (Cable) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 3 | Shoulder Press (Dumbbell) |  | 3 × 8–15 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 4 | Lying Leg Curl (Machine) |  | 2 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 5 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 5a | Bicep Curl (Dumbbell) |  | 2 × 10–20 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |
| 5b | Triceps Pushdown (Cable) |  | 2 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |

#### Full Body C

6 exercises · 15 working sets · ~55 min. Fri in the 3-day version; not in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Split Squat (Dumbbell) |  | 3 × 8–15 per leg | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 2 | Bench Press (Dumbbell) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 3 | One-Arm Row (Dumbbell) |  | 3 × 8–12 per arm | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 4 | Hip Thrust (Dumbbell) |  | 2 × 10–15 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 5 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 5a | Face Pull (Cable) |  | 2 × 12–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 5b | Dead Bug |  | 2 × 8–10 per side | RIR 2 |  | None |

Notes shown with the exercise:

- 1 Split Squat (Dumbbell): Reps are per leg.
- 3 One-Arm Row (Dumbbell): Reps are per arm.
- 5b Dead Bug: Reps are per side.

### 2. Dumbbell Full Body

> Full-body workouts with a pair of dumbbells and a bench, for home or a small gym.

- Id: `tpl_dumbbell_full_body`
- Review status: Draft, not reviewed yet
- Card: Beginner · 2 or 3 days/week · Ongoing
- Style: Gym
- Level: Made for beginners. Also suits intermediate lifters
- Goals: General fitness (main), muscle growth, strength
- Equipment: Dumbbell
- Also needs: a bench
- Length: Ongoing (weekly)
- Day versions: 3 days a week (default), 2 days a week
- Form-analysis lifts: Goblet Squat (Dumbbell), Romanian Deadlift (Dumbbell), Reverse Lunge (Dumbbell), Bulgarian Split Squat (Dumbbell)

**Design notes**

- Each day has a squat or lunge, a hinge or hip thrust, a press and a pull: a row on days 1 and 2, a pullover and a reverse fly on day 3.
- Supersets of opposing muscles keep sessions short.
- The dumbbell shoulder press, lunge and split squat use 8-15 reps, so the jump to the next dumbbell (5 lb or 2 kg) stalls them less. From the lightest dumbbells a lifter can still miss and deload once before the heavier pair sticks.

#### Day versions

**3 days a week (default)**. Weekly, ongoing. Card and page: Beginner · 3 days/week · Ongoing.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Dumbbell 1 | Rest | Dumbbell 2 | Rest | Dumbbell 3 | Rest | Rest |

**2 days a week**. Weekly, ongoing. Card and page: Beginner · 2 days/week · Ongoing.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Dumbbell 1 | Rest | Rest | Dumbbell 2 | Rest | Rest | Rest |

**Minutes and weekly sets.** Minutes add up the workouts in the week. Each set counts once for each primary muscle of its exercise; in brackets, the days that muscle is trained.

| Per week | 3 days a week (default) | 2 days a week |
|---|---|---|
| Minutes | 135 | 90 |
| Working sets | 48 | 32 |
| Quads | 9 (3 days) | 6 (2 days) |
| Hamstrings | 6 (2 days) | 3 (1 day) |
| Glutes | 18 (3 days) | 12 (2 days) |
| Chest | 9 (2 days) | 3 (1 day) |
| Back | 6 (2 days) | 6 (2 days) |
| Lats | 9 (3 days) | 6 (2 days) |
| Shoulders | 10 (3 days) | 5 (2 days) |
| Biceps | 4 (2 days) | 2 (1 day) |
| Triceps | 8 (2 days) | 8 (2 days) |
| Forearms | 2 (1 day) | 0 |
| Core | 2 (1 day) | 2 (1 day) |

#### Dumbbell 1

6 exercises · 16 working sets · ~45 min. Mon in the 3-day version; Mon in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Goblet Squat (Dumbbell) | 8 | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 2 | **Superset: 3 rounds, 120 s rest after each round** |  |  |  |  |  |
| 2a | Bench Press (Dumbbell) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 2b | One-Arm Row (Dumbbell) |  | 3 × 8–12 per arm | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 3 | Romanian Deadlift (Dumbbell) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 4a | Lateral Raise (Dumbbell) |  | 2 × 10–20 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |
| 4b | Bicep Curl (Dumbbell) |  | 2 × 10–20 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |

Notes shown with the exercise:

- 2b One-Arm Row (Dumbbell): Reps are per arm.

#### Dumbbell 2

6 exercises · 16 working sets · ~45 min. Wed in the 3-day version; Thu in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Reverse Lunge (Dumbbell) |  | 3 × 8–15 per leg | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 2 | **Superset: 3 rounds, 120 s rest after each round** |  |  |  |  |  |
| 2a | Shoulder Press (Dumbbell) |  | 3 × 8–15 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 2b | Chest-Supported Row (Dumbbell) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 3 | Hip Thrust (Dumbbell) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 4a | Overhead Triceps Extension (Dumbbell) |  | 2 × 10–15 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |
| 4b | Dead Bug |  | 2 × 8–10 per side | RIR 2 |  | None |

Notes shown with the exercise:

- 1 Reverse Lunge (Dumbbell): Reps are per leg.
- 4b Dead Bug: Reps are per side.

#### Dumbbell 3

6 exercises · 16 working sets · ~45 min. Fri in the 3-day version; not in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Bulgarian Split Squat (Dumbbell) |  | 3 × 8–15 per leg | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 2 | **Superset: 3 rounds, 120 s rest after each round** |  |  |  |  |  |
| 2a | Incline Bench Press (Dumbbell) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 2b | Pullover (Dumbbell) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |
| 3 | Deadlift (Dumbbell) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 4a | Hammer Curl (Dumbbell) |  | 2 × 10–20 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |
| 4b | Reverse Fly (Dumbbell) |  | 2 × 10–20 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |

Notes shown with the exercise:

- 1 Bulgarian Split Squat (Dumbbell): Reps are per leg.

### 3. Home Bodyweight Starter

> Short full-body workouts at home with no weights. Get more reps, then move to a harder version.

- Id: `tpl_bodyweight_starter`
- Review status: Draft, not reviewed yet
- Card: Beginner · 2 or 3 days/week · Ongoing
- Style: Bodyweight
- Level: Made for beginners
- Goals: General fitness (main), strength, muscle growth
- Equipment: Bodyweight
- Also needs: a low bar or sturdy table
- Length: Ongoing (weekly)
- Day versions: 3 days a week (default), 2 days a week
- Form-analysis lifts: Reverse Lunge, Standing Calf Raise, Split Squat

**Design notes**

- Push, pull and legs every session.
- Everything is in supersets, so sessions stay short.
- No progression rules: notes say when to move to a harder version.
- Pike push-ups start at 3 reps, with hands on a step to make them easier.

#### Day versions

**3 days a week (default)**. Weekly, ongoing. Card and page: Beginner · 3 days/week · Ongoing.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Home A | Rest | Home B | Rest | Home C | Rest | Rest |

**2 days a week**. Weekly, ongoing. Card and page: Beginner · 2 days/week · Ongoing.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Home A | Rest | Rest | Home B | Rest | Rest | Rest |

**Minutes and weekly sets.** Minutes add up the workouts in the week. Each set counts once for each primary muscle of its exercise; in brackets, the days that muscle is trained.

| Per week | 3 days a week (default) | 2 days a week |
|---|---|---|
| Minutes | 90 | 60 |
| Working sets | 48 | 32 |
| Quads | 9 (3 days) | 6 (2 days) |
| Glutes | 15 (3 days) | 9 (2 days) |
| Calves | 3 (1 day) | 3 (1 day) |
| Chest | 6 (2 days) | 3 (1 day) |
| Back | 11 (3 days) | 8 (2 days) |
| Lats | 9 (3 days) | 6 (2 days) |
| Shoulders | 3 (1 day) | 3 (1 day) |
| Triceps | 9 (3 days) | 6 (2 days) |
| Core | 12 (3 days) | 8 (2 days) |

#### Home A

6 exercises · 16 working sets · ~30 min. Mon in the 3-day version; Mon in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 1a | Incline Push-Up |  | 3 × 6–15 | RIR 2 |  | None |
| 1b | Inverted Row |  | 3 × 5–12 | RIR 2 |  | None |
| 2 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 2a | Air Squat |  | 3 × 12–20 | RIR 2 |  | None |
| 2b | Glute Bridge |  | 3 × 12–20 | RIR 2 |  | None |
| 3 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 3a | Plank |  | 2 × 30 s |  |  | None |
| 3b | Dead Bug |  | 2 × 8–10 per side | RIR 2 |  | None |

Notes shown with the exercise:

- 1a Incline Push-Up: Hands on a table or counter. Use a lower surface as it gets easier. At 3×15, move to Push-Up.
- 1b Inverted Row: Under a sturdy table or a low bar. Bend your knees to make it easier, straighten them to make it harder.
- 2a Air Squat: At 3×20, take three seconds on the way down.
- 2b Glute Bridge: At 3×20, do them one leg at a time.
- 3b Dead Bug: Reps are per side.

#### Home B

6 exercises · 16 working sets · ~30 min. Wed in the 3-day version; Thu in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 1a | Pike Push-Up |  | 3 × 3–12 | RIR 2 |  | None |
| 1b | Inverted Row |  | 3 × 5–12 | RIR 2 |  | None |
| 2 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 2a | Reverse Lunge |  | 3 × 8–12 per leg | RIR 2 |  | None |
| 2b | Standing Calf Raise |  | 3 × 12–20 | RIR 2 |  | None |
| 3 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 3a | Side Plank |  | 2 × 30 s per side |  |  | None |
| 3b | Bird Dog |  | 2 × 8–10 per side | RIR 2 |  | None |

Notes shown with the exercise:

- 1a Pike Push-Up: Hips high, head toward the floor between your hands. Too hard? Put your hands on a stair or sturdy step. At 3×12, put your feet on it instead.
- 1b Inverted Row: Under a sturdy table or a low bar. Bend your knees to make it easier, straighten them to make it harder.
- 2a Reverse Lunge: At 3×12, take three seconds on the way down. Reps are per leg.
- 2b Standing Calf Raise: At 3×20, do them one leg at a time.
- 3a Side Plank: Time is per side.
- 3b Bird Dog: Reps are per side.

#### Home C

6 exercises · 16 working sets · ~30 min. Fri in the 3-day version; not in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 1a | Push-Up |  | 3 × 3–12 | RIR 2 |  | None |
| 1b | Inverted Row |  | 3 × 5–12 | RIR 2 |  | None |
| 2 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 2a | Split Squat |  | 3 × 8–12 per leg | RIR 2 |  | None |
| 2b | Single-Leg Hip Thrust |  | 3 × 8–12 per leg | RIR 2 |  | None |
| 3 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 3a | Hollow Body Hold |  | 2 × 20 s |  |  | None |
| 3b | Lying Leg Raise |  | 2 × 8–12 | RIR 2 |  | None |

Notes shown with the exercise:

- 1a Push-Up: Can't do 3 yet? Put your hands on a table. At 3×12, take three seconds on the way down.
- 1b Inverted Row: Under a sturdy table or a low bar. Bend your knees to make it easier, straighten them to make it harder.
- 2a Split Squat: At 3×12, pause for two seconds at the bottom. Reps are per leg.
- 2b Single-Leg Hip Thrust: At 3×12, pause for two seconds at the top. Reps are per leg.
- 3b Lying Leg Raise: At 2×12, lower your legs more slowly.

### 4. Barbell Strength Base

> Twelve weeks to learn and build the squat, bench press, deadlift and overhead press.

- Id: `tpl_barbell_strength_base`
- Review status: Draft, not reviewed yet
- Card: Beginner · 3 days/week · 12 weeks
- Style: Powerlifting
- Level: Made for beginners. Also suits intermediate lifters
- Goals: Strength (main), muscle growth, general fitness
- Equipment: Barbell
- Also needs: a squat rack and a bench
- Length: Fixed, 12 weeks
- Day versions: 3 days a week
- Form-analysis lifts: Back Squat (Barbell), Deadlift (Barbell), Romanian Deadlift (Barbell)

**Design notes**

- Squat and bench come up twice a week, the second time as a variation. Deadlift and press come up once.
- Rep ranges (double progression), not fixed sets with a jump every session.
- Three different days rather than an A/B alternation, so it does not copy a well-known novice layout.
- Uses the canonical lift ids, so strength badges count.

#### Week

**3 days a week**. Fixed: weeks 1 to 12 all repeat this week. Card and page: Beginner · 3 days/week · 12 weeks.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Squat & Bench | Rest | Deadlift & Press | Rest | Variation Day | Rest | Rest |

**Minutes and weekly sets.** Minutes add up the workouts in the week. Each set counts once for each primary muscle of its exercise; in brackets, the days that muscle is trained.

| Per week | 3 days a week |
|---|---|
| Minutes | 145 |
| Working sets | 33 |
| Quads | 6 (2 days) |
| Hamstrings | 6 (2 days) |
| Glutes | 12 (3 days) |
| Chest | 6 (2 days) |
| Back | 9 (2 days) |
| Lats | 6 (2 days) |
| Shoulders | 3 (1 day) |
| Triceps | 9 (3 days) |
| Core | 6 (3 days) |

#### Squat & Bench

4 exercises · 11 working sets · ~50 min. On Mon.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Back Squat (Barbell) | 8, 3 | 3 × 5–8 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 2 | Bench Press (Barbell) | 8, 3 | 3 × 5–8 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 3 | Bent-Over Row (Barbell) |  | 3 × 6–10 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 4 | Plank |  | 2 × 30 s |  |  | None |

Notes shown with the exercise:

- 1 Back Squat (Barbell): Make the second warm-up heavier.
- 2 Bench Press (Barbell): Make the second warm-up heavier.

#### Deadlift & Press

4 exercises · 11 working sets · ~50 min. On Wed.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Deadlift (Barbell) | 5, 3 | 3 × 4–6 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 2 | Overhead Press (Barbell) | 5 | 3 × 5–8 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 3 | Pendlay Row (Barbell) |  | 3 × 6–8 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 4 | Dead Bug |  | 2 × 8–10 per side | RIR 2 |  | None |

Notes shown with the exercise:

- 1 Deadlift (Barbell): Make the second warm-up heavier.
- 4 Dead Bug: Reps are per side.

#### Variation Day

4 exercises · 11 working sets · ~45 min. On Fri.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Pause Squat (Barbell) | 8, 3 | 3 × 5–8 | RIR 2 | 2-2-1-0 | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 2 | Close-Grip Bench Press (Barbell) |  | 3 × 6–10 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 3 | Romanian Deadlift (Barbell) |  | 3 × 6–10 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 4 | Side Plank |  | 2 × 30 s per side |  |  | None |

Notes shown with the exercise:

- 1 Pause Squat (Barbell): Make the second warm-up heavier.
- 4 Side Plank: Time is per side.

### 5. Full-Range Strength

> Eight weeks of slow, deep squats, split squats and hinges, plus upper-body pressing and rows.

- Id: `tpl_full_range_strength`
- Review status: Draft, not reviewed yet
- Card: Beginner · 2 or 3 days/week · 8 weeks
- Style: Full range
- Level: Made for beginners. Also suits intermediate lifters
- Goals: Mobility and full range (main), general fitness
- Equipment: Dumbbell
- Also needs: a bench and a box or step
- Length: Fixed, 8 weeks
- Day versions: 3 days a week (default), 2 days a week
- Form-analysis lifts: Goblet Squat (Dumbbell), Romanian Deadlift (Dumbbell), Standing Calf Raise, Split Squat (Dumbbell)

**Design notes**

- A complete plan on its own: deep squats, split squats and hinges with slow lowering and pauses, plus a push and a pull every session.
- Lower-body work stays near a beginner dose. The Nordic comes once a week at low reps.
- Built around form-analysis lifts: goblet squat, split squat, Romanian deadlift and calf raise.
- Original: no daily shin and calf opener, no reverse Nordic, no Copenhagen, no pullover, no brand cues, and no joint or medical claims.
- Dumbbell split squats, step-ups and shoulder presses use 8-15 reps, and the single-leg Romanian deadlift 8-12, so the jump to the next dumbbell stalls them less. From the lightest dumbbells a lifter can still miss and deload once or twice before the heavier pair sticks.

#### Day versions

**3 days a week (default)**. Fixed: weeks 1 to 8 all repeat this week. Card and page: Beginner · 3 days/week · 8 weeks.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Full Range A | Rest | Full Range B | Rest | Full Range C | Rest | Rest |

**2 days a week**. Fixed: weeks 1 to 8 all repeat this week. Card and page: Beginner · 2 days/week · 8 weeks. Also needs, in this version: a bench.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Full Range A | Rest | Rest | Full Range B | Rest | Rest | Rest |

**Minutes and weekly sets.** Minutes add up the workouts in the week. Each set counts once for each primary muscle of its exercise; in brackets, the days that muscle is trained.

| Per week | 3 days a week (default) | 2 days a week |
|---|---|---|
| Minutes | 120 | 80 |
| Working sets | 43 | 29 |
| Quads | 12 (3 days) | 8 (2 days) |
| Hamstrings | 7 (3 days) | 5 (2 days) |
| Glutes | 15 (3 days) | 9 (2 days) |
| Adductors | 2 (1 day) | 2 (1 day) |
| Calves | 4 (2 days) | 2 (1 day) |
| Chest | 6 (2 days) | 3 (1 day) |
| Back | 6 (2 days) | 3 (1 day) |
| Lats | 6 (2 days) | 3 (1 day) |
| Shoulders | 6 (1 day) | 6 (1 day) |
| Triceps | 9 (3 days) | 6 (2 days) |
| Core | 2 (1 day) | 2 (1 day) |

#### Full Range A

5 exercises · 14 working sets · ~40 min. Mon in the 3-day version; Mon in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Goblet Squat (Dumbbell) | 8 | 3 × 8–12 | RIR 2 | 3-2-1-0 | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 2 | Romanian Deadlift (Dumbbell) |  | 3 × 8–12 | RIR 2 | 3-1-1-0 | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 3 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 3a | Push-Up |  | 3 × 5–15 | RIR 2 |  | None |
| 3b | Chest-Supported Row (Dumbbell) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 4 | Standing Calf Raise |  | 2 × 12–20 | RIR 2 | 2-2-1-1 | None |

Notes shown with the exercise:

- 1 Goblet Squat (Dumbbell): Go as deep as you can control. A small plate under your heels is fine.
- 3a Push-Up: Fewer than 5? Put your hands on a bench. At 3×15, take three seconds on the way down.
- 4 Standing Calf Raise: At 2×20, hold a dumbbell.

#### Full Range B

6 exercises · 15 working sets · ~40 min. Wed in the 3-day version; Thu in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Split Squat (Dumbbell) |  | 3 × 8–15 per leg | RIR 2 | 3-1-1-0 | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 2 | Cossack Squat |  | 2 × 6–8 per side | RIR 2 |  | None |
| 3 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 3a | Shoulder Press (Dumbbell) |  | 3 × 8–15 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 3b | Reverse Fly (Dumbbell) |  | 3 × 10–20 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |
| 4 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 4a | Nordic Hamstring Curl |  | 2 × 3–5 | RIR 2 |  | None |
| 4b | Side Plank |  | 2 × 30 s per side |  |  | None |

Notes shown with the exercise:

- 1 Split Squat (Dumbbell): Let the front knee move forward as you lower. Reps are per leg.
- 2 Cossack Squat: Sit as low as you can control onto one leg, with the other leg straight. At 2×8, hold a dumbbell at your chest. Reps are per side.
- 4a Nordic Hamstring Curl: Anchor your heels under something sturdy. Lower as slowly as you can, then push back up with your hands.
- 4b Side Plank: Time is per side.

#### Full Range C

6 exercises · 14 working sets · ~40 min. Fri in the 3-day version; not in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Step-Up (Dumbbell) |  | 2 × 8–15 per leg | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 2 | Single-Leg Romanian Deadlift (Dumbbell) |  | 2 × 8–12 per leg | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 3 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 3a | Bench Press (Dumbbell) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 3b | One-Arm Row (Dumbbell) |  | 3 × 8–12 per arm | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 4a | Tibialis Raise |  | 2 × 15–25 | RIR 2 |  | None |
| 4b | Deep Squat Hold |  | 2 × 45 s |  |  | None |

Notes shown with the exercise:

- 1 Step-Up (Dumbbell): Use a step height you can control on the way down. Reps are per leg.
- 2 Single-Leg Romanian Deadlift (Dumbbell): Reps are per leg.
- 3b One-Arm Row (Dumbbell): Reps are per arm.
- 4b Deep Squat Hold: Sit into the bottom of a squat and stay there. Hold a door frame if you need to.

### 6. Upper / Lower Builder

> Upper and lower body on alternate days: heavy compound lifts first, then higher-rep work for size.

- Id: `tpl_upper_lower`
- Review status: Draft, not reviewed yet
- Card: Intermediate · 4 days/week · Ongoing
- Style: Gym
- Level: Made for intermediate lifters. Also suits advanced lifters
- Goals: Strength (main), muscle growth, general fitness
- Equipment: Barbell, Dumbbell, Cable, Machine
- Also needs: a squat rack, a bench and a pull-up bar
- Length: Ongoing (weekly)
- Day versions: 4 days a week
- Form-analysis lifts: Back Squat (Barbell), Romanian Deadlift (Barbell), Standing Calf Raise (Machine), Deadlift (Barbell), Bulgarian Split Squat (Dumbbell), Seated Calf Raise (Machine)

**Design notes**

- Heavy compound work comes first, then higher-rep work for size.
- Chest, back, quads, hamstrings and calves are trained twice a week, with a different exercise the second time.
- Biceps and side delts get direct work once a week, plus compound work.

#### Week

**4 days a week**. Weekly, ongoing. Card and page: Intermediate · 4 days/week · Ongoing.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Upper A | Lower A | Rest | Upper B | Lower B | Rest | Rest |

**Minutes and weekly sets.** Minutes add up the workouts in the week. Each set counts once for each primary muscle of its exercise; in brackets, the days that muscle is trained.

| Per week | 4 days a week |
|---|---|
| Minutes | 200 |
| Working sets | 72 |
| Quads | 11 (2 days) |
| Hamstrings | 11 (2 days) |
| Glutes | 14 (2 days) |
| Calves | 6 (2 days) |
| Chest | 9 (2 days) |
| Back | 9 (3 days) |
| Lats | 12 (2 days) |
| Shoulders | 12 (2 days) |
| Biceps | 6 (2 days) |
| Triceps | 12 (2 days) |
| Core | 5 (2 days) |

#### Upper A

6 exercises · 18 working sets · ~45 min. On Mon.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Bench Press (Barbell) | 8, 3 | 3 × 5–8 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 2 | Bent-Over Row (Barbell) |  | 3 × 6–10 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 3 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 3a | Shoulder Press (Dumbbell) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 3b | Lat Pulldown (Cable) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 3 rounds, 75 s rest after each round** |  |  |  |  |  |
| 4a | Bicep Curl (Cable) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 4b | Triceps Pushdown (Rope) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |

Notes shown with the exercise:

- 1 Bench Press (Barbell): Make the second warm-up heavier.

#### Lower A

6 exercises · 16 working sets · ~50 min. On Tue.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Back Squat (Barbell) | 8, 3 | 3 × 5–8 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 2 | Romanian Deadlift (Barbell) |  | 3 × 6–10 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 3 | Leg Press (Machine) |  | 2 × 10–15 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 4a | Seated Leg Curl (Machine) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 4b | Standing Calf Raise (Machine) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 5 | Hanging Knee Raise |  | 2 × 10–15 | RIR 2 |  | None |

Notes shown with the exercise:

- 1 Back Squat (Barbell): Make the second warm-up heavier.

#### Upper B

7 exercises · 21 working sets · ~55 min. On Thu.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Incline Bench Press (Dumbbell) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 2 | Pull-Up |  | 3 × 5–10 | RIR 2 |  | None |
| 3 | Seated Row (Cable) |  | 3 × 10–12 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 3 rounds, 75 s rest after each round** |  |  |  |  |  |
| 4a | Chest Fly (Machine) |  | 3 × 12–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 4b | Reverse Fly (Machine) |  | 3 × 12–20 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 5 | **Superset: 3 rounds, 75 s rest after each round** |  |  |  |  |  |
| 5a | Lateral Raise (Cable) |  | 3 × 12–20 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 5b | Overhead Triceps Extension (Cable) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |

Notes shown with the exercise:

- 2 Pull-Up: Fewer than 5? Use the assisted pull-up machine or a band until you get there. At 3×10, hold a dumbbell between your feet.

#### Lower B

6 exercises · 17 working sets · ~50 min. On Fri.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Deadlift (Barbell) | 5, 3 | 3 × 3–5 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 2 | Bulgarian Split Squat (Dumbbell) |  | 3 × 8–12 per leg | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 3 | Leg Extension (Machine) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 4 | Lying Leg Curl (Machine) |  | 2 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 5 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 5a | Seated Calf Raise (Machine) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 5b | Crunch (Cable) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |

Notes shown with the exercise:

- 1 Deadlift (Barbell): Make the second warm-up heavier.
- 2 Bulgarian Split Squat (Dumbbell): Reps are per leg.

### 7. Five-Day Muscle Builder

> Upper and lower days, then push, pull and legs, so each muscle is trained twice a week.

- Id: `tpl_five_day_muscle`
- Review status: Draft, not reviewed yet
- Card: Intermediate · 5 days/week · Ongoing
- Style: Bodybuilding
- Level: Made for intermediate lifters. Also suits advanced lifters
- Goals: Muscle growth (main), general fitness
- Equipment: Barbell, Dumbbell, Cable, Machine
- Also needs: a squat rack, a bench and a pull-up bar
- Length: Ongoing (weekly)
- Day versions: 5 days a week
- Form-analysis lifts: Back Squat (Barbell), Romanian Deadlift (Barbell), Standing Calf Raise (Machine), Bulgarian Split Squat (Dumbbell), Seated Calf Raise (Machine)

**Design notes**

- Every major muscle, biceps and side delts included, is trained twice a week, each time with a different exercise (Schoenfeld 2016).
- Volume sits in the intermediate range; the weekly sets on the review page show it.

#### Week

**5 days a week**. Weekly, ongoing. Card and page: Intermediate · 5 days/week · Ongoing.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Upper Body | Lower Body | Rest | Push | Pull | Legs | Rest |

**Minutes and weekly sets.** Minutes add up the workouts in the week. Each set counts once for each primary muscle of its exercise; in brackets, the days that muscle is trained.

| Per week | 5 days a week |
|---|---|
| Minutes | 235 |
| Working sets | 83 |
| Quads | 11 (2 days) |
| Hamstrings | 9 (2 days) |
| Glutes | 11 (2 days) |
| Calves | 7 (2 days) |
| Chest | 12 (2 days) |
| Back | 6 (2 days) |
| Lats | 14 (2 days) |
| Shoulders | 15 (3 days) |
| Biceps | 10 (2 days) |
| Triceps | 14 (2 days) |
| Forearms | 2 (1 day) |
| Core | 3 (1 day) |

#### Upper Body

7 exercises · 19 working sets · ~50 min. On Mon.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Bench Press (Barbell) | 8, 3 | 3 × 6–10 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 2 | Chest-Supported Row (Dumbbell) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 3 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 3a | Shoulder Press (Machine) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 3b | Lat Pulldown (Cable) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 2 rounds, 75 s rest after each round** |  |  |  |  |  |
| 4a | Bicep Curl (Cable) |  | 2 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 4b | Triceps Pushdown (Rope) |  | 2 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 5 | Lateral Raise (Dumbbell) |  | 3 × 10–20 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |

Notes shown with the exercise:

- 1 Bench Press (Barbell): Make the second warm-up heavier.

#### Lower Body

5 exercises · 16 working sets · ~50 min. On Tue.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Back Squat (Barbell) | 8, 3 | 3 × 6–10 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 2 | Romanian Deadlift (Barbell) |  | 3 × 8–10 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 3 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 3a | Leg Extension (Machine) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 3b | Seated Leg Curl (Machine) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 4 | Standing Calf Raise (Machine) |  | 4 × 8–12 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |

Notes shown with the exercise:

- 1 Back Squat (Barbell): Make the second warm-up heavier.

#### Push

5 exercises · 15 working sets · ~40 min. On Thu.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Incline Bench Press (Dumbbell) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 2 | Chest Press (Machine) |  | 3 × 10–12 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 3 | **Superset: 3 rounds, 75 s rest after each round** |  |  |  |  |  |
| 3a | Chest Fly (Cable) |  | 3 × 12–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 3b | Lateral Raise (Cable) |  | 3 × 12–20 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 4 | Overhead Triceps Extension (Cable) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |

#### Pull

6 exercises · 16 working sets · ~45 min. On Fri.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Pull-Up |  | 3 × 6–10 | RIR 2 |  | None |
| 2 | Seated Row (Cable) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 3 | Straight-Arm Pulldown (Cable) |  | 2 × 12–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 4 | **Superset: 3 rounds, 75 s rest after each round** |  |  |  |  |  |
| 4a | Reverse Fly (Machine) |  | 3 × 12–20 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 4b | Incline Curl (Dumbbell) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |
| 5 | Hammer Curl (Dumbbell) |  | 2 × 10–20 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |

Notes shown with the exercise:

- 1 Pull-Up: Fewer than 6? Use the assisted pull-up machine or a band until you get there. At 3×10, hold a dumbbell between your feet.

#### Legs

6 exercises · 17 working sets · ~50 min. On Sat.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Hack Squat (Machine) | 10 | 3 × 8–12 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 2 | Hip Thrust (Barbell) |  | 3 × 8–12 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 3 | Bulgarian Split Squat (Dumbbell) |  | 2 × 8–12 per leg | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 4 | Lying Leg Curl (Machine) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 5 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 5a | Seated Calf Raise (Machine) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 5b | Crunch (Cable) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |

Notes shown with the exercise:

- 3 Bulgarian Split Squat (Dumbbell): Reps are per leg.

### 8. Big Three Block

> Six weeks of squat, bench press and deadlift. The weight rises about 2.5% a week as reps come down.

- Id: `tpl_big_three_block`
- Review status: Draft, not reviewed yet
- Card: Intermediate · 3 or 4 days/week · 6 weeks
- Style: Powerlifting
- Level: Made for intermediate lifters. Also suits advanced lifters
- Goals: Strength
- Equipment: Barbell, Dumbbell
- Also needs: a squat rack, a bench and a pull-up bar
- Length: Fixed, 6 weeks
- Day versions: 4 days a week (default), 3 days a week
- Form-analysis lifts: Back Squat (Barbell), Deadlift (Barbell)

**Design notes**

- Starts near a 10-rep max and rises about 2.5% a week, ending near a 5-rep max: heavy triples and fours with a rep or two in reserve.
- Weekly % goes only on the three heavy lifts, because of the one-step minimum. Other lifts use rep ranges.
- On lighter lifts the one-step minimum makes the weekly rise bigger than 2.5%. Under about 100 lb or 45 kg it is 5-8% a week, so misses can start by week 3 or 4; the 2-miss deload handles them. A smaller barbell step in Profile → Units & logging keeps the rise near 2.5% for lifters with small plates.
- Coming from another plan, week 1 pre-fills last time's weight on that lift plus 2.5%, which can be well above a 10-rep weight. The note says to lower it. An engine follow-up could skip the week-1 suggestion on a fixed plan's weekly-% lifts.
- Lower-body days are never back to back, and the second squat is a variation. Runs in a garage gym: no cables or machines.

#### Day versions

**4 days a week (default)**. Fixed: weeks 1 to 6 all repeat this week. Card and page: Intermediate · 4 days/week · 6 weeks.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Heavy Squat | Heavy Bench | Rest | Heavy Deadlift | Volume Day | Rest | Rest |

**3 days a week**. Fixed: weeks 1 to 6 all repeat this week. Card and page: Intermediate · 3 days/week · 6 weeks.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Heavy Squat | Rest | Heavy Bench | Rest | Heavy Deadlift | Rest | Rest |

**Minutes and weekly sets.** Minutes add up the workouts in the week. Each set counts once for each primary muscle of its exercise; in brackets, the days that muscle is trained.

| Per week | 4 days a week (default) | 3 days a week |
|---|---|---|
| Minutes | 195 | 150 |
| Working sets | 49 | 37 |
| Quads | 6 (2 days) | 6 (2 days) |
| Hamstrings | 3 (1 day) | 3 (1 day) |
| Glutes | 9 (2 days) | 9 (2 days) |
| Chest | 11 (3 days) | 6 (2 days) |
| Back | 12 (3 days) | 9 (2 days) |
| Lats | 12 (4 days) | 9 (3 days) |
| Shoulders | 9 (3 days) | 5 (2 days) |
| Biceps | 5 (1 day) | 5 (1 day) |
| Triceps | 14 (3 days) | 11 (2 days) |
| Core | 6 (3 days) | 4 (2 days) |

#### Heavy Squat

5 exercises · 13 working sets · ~50 min. Mon in the 4-day version; Mon in the 3-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Back Squat (Barbell) | 5, 3 | 3 × 3–5 | No target |  | +2.5% a week, at least +5 lb / +2.5 kg · deload 10% after 2 misses |
| 2 | Pause Bench Press (Barbell) | 8, 3 | 3 × 5–8 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 3 | Bent-Over Row (Barbell) |  | 3 × 6–10 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 2 rounds, 75 s rest after each round** |  |  |  |  |  |
| 4a | Hanging Knee Raise |  | 2 × 10–15 | RIR 2 |  | None |
| 4b | Reverse Fly (Dumbbell) |  | 2 × 10–20 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |

Notes shown with the exercise:

- 1 Back Squat (Barbell): Make the second warm-up heavier. Week 1: a weight you could lift about 10 times, even if the app fills in more. It goes up about 2.5% each week, so the first weeks feel easy. Do as many reps in the range as you cleanly can. If 2.5% is less than your smallest plate step, the app adds one step. Add more warm-up sets if you need them.
- 2 Pause Bench Press (Barbell): Make the second warm-up heavier.

#### Heavy Bench

5 exercises · 13 working sets · ~50 min. Tue in the 4-day version; Wed in the 3-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Bench Press (Barbell) | 8, 3 | 3 × 3–5 | No target |  | +2.5% a week, at least +5 lb / +2.5 kg · deload 10% after 2 misses |
| 2 | Overhead Press (Barbell) | 5 | 3 × 5–8 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 3 | Pull-Up |  | 3 × 5–10 | RIR 2 |  | None |
| 4 | **Superset: 2 rounds, 75 s rest after each round** |  |  |  |  |  |
| 4a | Overhead Triceps Extension (Dumbbell) |  | 2 × 10–15 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |
| 4b | Bicep Curl (Dumbbell) |  | 2 × 10–20 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |

Notes shown with the exercise:

- 1 Bench Press (Barbell): Make the second warm-up heavier. Week 1: a weight you could lift about 10 times, even if the app fills in more. It goes up about 2.5% each week, so the first weeks feel easy. Do as many reps in the range as you cleanly can. If 2.5% is less than your smallest plate step, the app adds one step. Add more warm-up sets if you need them.
- 3 Pull-Up: Fewer than 5? Use a band, or jump up and lower slowly, until you get there. At 3×10, hold a dumbbell between your feet.

#### Heavy Deadlift

4 exercises · 11 working sets · ~50 min. Thu in the 4-day version; Fri in the 3-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Deadlift (Barbell) | 5, 3 | 3 × 3–5 | No target |  | +2.5% a week, at least +5 lb / +2.5 kg · deload 10% after 2 misses |
| 2 | Pause Squat (Barbell) | 5 | 3 × 4–6 | RIR 2 | 2-2-1-0 | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 3 | Chest-Supported Row (Dumbbell) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 4 | Side Plank |  | 2 × 30 s per side |  |  | None |

Notes shown with the exercise:

- 1 Deadlift (Barbell): Make the second warm-up heavier. Week 1: a weight you could lift about 10 times, even if the app fills in more. It goes up about 2.5% each week, so the first weeks feel easy. Do as many reps in the range as you cleanly can. If 2.5% is less than your smallest plate step, the app adds one step. Add more warm-up sets if you need them.
- 4 Side Plank: Time is per side.

#### Volume Day

5 exercises · 12 working sets · ~45 min. Fri in the 4-day version; not in the 3-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Close-Grip Bench Press (Barbell) | 8 | 3 × 6–8 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 2 | One-Arm Row (Dumbbell) |  | 3 × 8–12 per arm | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 3 | Incline Bench Press (Dumbbell) |  | 2 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 4a | Lateral Raise (Dumbbell) |  | 2 × 10–20 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |
| 4b | Dead Bug |  | 2 × 8–10 per side | RIR 2 |  | None |

Notes shown with the exercise:

- 2 One-Arm Row (Dumbbell): Reps are per arm.
- 4b Dead Bug: Reps are per side.

### 9. Calisthenics Strength

> Bodyweight strength on bars: upper and lower days, three or four days a week.

- Id: `tpl_calisthenics_strength`
- Review status: Draft, not reviewed yet
- Card: Intermediate · 3 or 4 days/week · Ongoing
- Style: Bodyweight
- Level: Made for intermediate lifters. Also suits advanced lifters
- Goals: Strength (main), muscle growth, general fitness
- Equipment: Bodyweight
- Also needs: a bench, a pull-up bar, dip bars and a low bar or sturdy table
- Length: Ongoing (weekly)
- Day versions: 4 days a week (default), 3 days a week
- Form-analysis lifts: Bulgarian Split Squat, Standing Calf Raise

**Design notes**

- Both upper days start with pull-ups or chin-ups. Upper A adds dips and pike push-ups; Upper B adds push-ups and rows.
- Rows come once a week, the least back work in the catalog. Adding inverted rows to Upper A is an option.
- Pistols, Nordics and split squats load the legs without weights.
- The 3-day version trains legs once a week.
- Notes give the next step at the top of each range: a loaded backpack, a harder version or a slower lowering.

#### Day versions

**4 days a week (default)**. Weekly, ongoing. Card and page: Intermediate · 4 days/week · Ongoing.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Upper A | Lower A | Rest | Upper B | Lower B | Rest | Rest |

**3 days a week**. Weekly, ongoing. Card and page: Intermediate · 3 days/week · Ongoing.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Upper A | Rest | Lower A | Rest | Upper B | Rest | Rest |

**Minutes and weekly sets.** Minutes add up the workouts in the week. Each set counts once for each primary muscle of its exercise; in brackets, the days that muscle is trained.

| Per week | 4 days a week (default) | 3 days a week |
|---|---|---|
| Minutes | 145 | 110 |
| Working sets | 62 | 49 |
| Quads | 12 (2 days) | 6 (1 day) |
| Hamstrings | 6 (2 days) | 3 (1 day) |
| Glutes | 12 (2 days) | 9 (1 day) |
| Adductors | 2 (1 day) | 0 |
| Calves | 5 (2 days) | 3 (1 day) |
| Chest | 11 (2 days) | 11 (2 days) |
| Back | 3 (1 day) | 3 (1 day) |
| Lats | 11 (2 days) | 11 (2 days) |
| Shoulders | 7 (2 days) | 7 (2 days) |
| Biceps | 8 (2 days) | 8 (2 days) |
| Triceps | 10 (2 days) | 10 (2 days) |
| Core | 9 (2 days) | 9 (2 days) |

#### Upper A

5 exercises · 17 working sets · ~30 min. Mon in the 4-day version; Mon in the 3-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | **Superset: 4 rounds, 120 s rest after each round** |  |  |  |  |  |
| 1a | Pull-Up |  | 4 × 5–10 | RIR 2 |  | None |
| 1b | Dip |  | 4 × 6–12 | RIR 2 |  | None |
| 2 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 2a | Pike Push-Up |  | 3 × 6–12 | RIR 2 |  | None |
| 2b | Hanging Leg Raise |  | 3 × 8–12 | RIR 2 |  | None |
| 3 | L-Sit |  | 3 × 15 s |  |  | None |

Notes shown with the exercise:

- 1a Pull-Up: At 4×10, wear a loaded backpack, log its weight and start back at 5.
- 1b Dip: At 4×12, wear a loaded backpack, log its weight and start back at 6.
- 2a Pike Push-Up: At 3×12, put your feet on a bench.
- 2b Hanging Leg Raise: At 3×12, move to Toes-to-Bar.
- 3 L-Sit: On the floor, on two chairs or on the dip bars. Tuck your knees if straight legs are too hard.

#### Lower A

5 exercises · 15 working sets · ~45 min. Tue in the 4-day version; Wed in the 3-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Pistol Squat |  | 3 × 3–8 per leg | RIR 2 |  | None |
| 2 | Nordic Hamstring Curl |  | 3 × 3–6 | RIR 2 |  | None |
| 3 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 3a | Bulgarian Split Squat |  | 3 × 10–15 per leg | RIR 2 |  | None |
| 3b | Single-Leg Hip Thrust |  | 3 × 10–15 per leg | RIR 2 |  | None |
| 4 | Standing Calf Raise |  | 3 × 15–25 | RIR 2 |  | None |

Notes shown with the exercise:

- 1 Pistol Squat: Hold a door frame until you can do them freely. At 3×8 without support, wear a loaded backpack. Reps are per leg.
- 2 Nordic Hamstring Curl: Anchor your heels under something sturdy. Lower as slowly as you can, then push back up with your hands. At 3×6, push back up with less help from your hands.
- 3a Bulgarian Split Squat: At 3×15, wear a loaded backpack. Reps are per leg.
- 3b Single-Leg Hip Thrust: At 3×15, rest a loaded backpack on your hips. Reps are per leg.
- 4 Standing Calf Raise: When 25 is easy, do them one leg at a time.

#### Upper B

5 exercises · 17 working sets · ~35 min. Thu in the 4-day version; Fri in the 3-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | **Superset: 4 rounds, 120 s rest after each round** |  |  |  |  |  |
| 1a | Chin-Up |  | 4 × 5–10 | RIR 2 |  | None |
| 1b | Decline Push-Up |  | 4 × 8–15 | RIR 2 |  | None |
| 2 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 2a | Inverted Row |  | 3 × 8–15 | RIR 2 |  | None |
| 2b | Diamond Push-Up |  | 3 × 6–15 | RIR 2 |  | None |
| 3 | Hollow Body Hold |  | 3 × 30 s |  |  | None |

Notes shown with the exercise:

- 1a Chin-Up: At 4×10, wear a loaded backpack, log its weight and start back at 5.
- 1b Decline Push-Up: Feet on a bench or chair. At 4×15, take three seconds on the way down.
- 2a Inverted Row: Feet up on a bench to make it harder.
- 2b Diamond Push-Up: At 3×15, take three seconds on the way down.

#### Lower B

5 exercises · 13 working sets · ~35 min. Fri in the 4-day version; not in the 3-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Sissy Squat |  | 3 × 8–15 | RIR 2 |  | None |
| 2 | Slider Leg Curl |  | 3 × 8–12 | RIR 2 |  | None |
| 3 | Walking Lunge |  | 3 × 10–16 | RIR 2 |  | None |
| 4 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 4a | Copenhagen Plank |  | 2 × 20 s per side |  |  | None |
| 4b | Tibialis Raise |  | 2 × 15–25 | RIR 2 |  | None |

Notes shown with the exercise:

- 1 Sissy Squat: Hold a post or door frame for balance. At 3×15, take three seconds on the way down.
- 2 Slider Leg Curl: Heels on a towel on a smooth floor. At 3×12, do them one leg at a time.
- 3 Walking Lunge: Count every step. At 3×16, wear a loaded backpack.
- 4a Copenhagen Plank: Time is per side.
- 4b Tibialis Raise: At 2×25, stand on one leg.

### 10. Strength and Circuits

> A heavy lift, then a circuit of three to five rounds mixing kettlebell, dumbbell and bodyweight moves.

- Id: `tpl_strength_circuits`
- Review status: Draft, not reviewed yet
- Card: Intermediate · 2 or 3 days/week · Ongoing
- Style: Conditioning
- Level: Made for intermediate lifters. Also suits advanced lifters
- Goals: General fitness (main), athletic performance, strength
- Equipment: Barbell, Kettlebell, Dumbbell
- Also needs: a squat rack and a pull-up bar
- Length: Ongoing (weekly)
- Day versions: 3 days a week (default), 2 days a week
- Form-analysis lifts: Front Squat (Barbell), Deadlift (Barbell)

**Design notes**

- A heavy lift first, then a rep-based circuit.
- Honest about what the app logs today: rounds are sets, and reps and load are logged, so volume counts.
- No timers, no 'for time', no EMOM and no benchmark names, and nothing is logged as a hold.
- The circuit note asks for a heavier dumbbell or kettlebell, not a shorter rest, because a round rest cannot be changed in the plan yet.

#### Day versions

**3 days a week (default)**. Weekly, ongoing. Card and page: Intermediate · 3 days/week · Ongoing.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Squat & Circuit | Rest | Deadlift & Circuit | Rest | Press & Circuit | Rest | Rest |

**2 days a week**. Weekly, ongoing. Card and page: Intermediate · 2 days/week · Ongoing.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Squat & Circuit | Rest | Rest | Deadlift & Circuit | Rest | Rest | Rest |

**Minutes and weekly sets.** Minutes add up the workouts in the week. Each set counts once for each primary muscle of its exercise; in brackets, the days that muscle is trained.

| Per week | 3 days a week (default) | 2 days a week |
|---|---|---|
| Minutes | 120 | 80 |
| Working sets | 52 | 39 |
| Quads | 16 (3 days) | 13 (2 days) |
| Hamstrings | 13 (2 days) | 13 (2 days) |
| Glutes | 17 (2 days) | 17 (2 days) |
| Chest | 9 (2 days) | 9 (2 days) |
| Back | 7 (2 days) | 4 (1 day) |
| Lats | 11 (2 days) | 5 (1 day) |
| Shoulders | 12 (2 days) | 5 (1 day) |
| Biceps | 5 (1 day) | 5 (1 day) |
| Triceps | 8 (2 days) | 4 (1 day) |
| Core | 7 (2 days) | 4 (1 day) |

#### Squat & Circuit

5 exercises · 20 working sets · ~40 min. Mon in the 3-day version; Mon in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Front Squat (Barbell) | 8, 3 | 4 × 4–6 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 2 | **Circuit: 4 rounds, 10 s between exercises, 90 s rest after each round** |  |  |  |  |  |
| 2a | Swing (Kettlebell) |  | 4 × 15 | RIR 2 |  | None |
| 2b | Push-Up |  | 4 × 10 | RIR 2 |  | None |
| 2c | Walking Lunge |  | 4 × 20 | RIR 2 |  | None |
| 2d | Sit-Up |  | 4 × 15 | RIR 2 |  | None |

Notes shown with the exercise:

- 1 Front Squat (Barbell): Make the second warm-up heavier.
- 2a Swing (Kettlebell): One round is one set of each exercise. When every round feels smooth, go heavier on the dumbbell or kettlebell.
- 2c Walking Lunge: 20 steps in total.

#### Deadlift & Circuit

4 exercises · 19 working sets · ~40 min. Wed in the 3-day version; Thu in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Deadlift (Barbell) | 5, 3 | 4 × 3–5 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 2 | **Circuit: 5 rounds, 10 s between exercises, 60 s rest after each round** |  |  |  |  |  |
| 2a | Pull-Up |  | 5 × 5 | RIR 2 |  | None |
| 2b | Snatch (Dumbbell) |  | 5 × 10 | RIR 2 |  | None |
| 2c | Burpee |  | 5 × 8 | RIR 2 |  | None |

Notes shown with the exercise:

- 1 Deadlift (Barbell): Make the second warm-up heavier.
- 2a Pull-Up: One round is one set of each exercise. When every round feels smooth, go heavier on the dumbbell or kettlebell. Use a band, or jump up and lower slowly, if you need to.
- 2b Snatch (Dumbbell): 5 per arm.

#### Press & Circuit

4 exercises · 13 working sets · ~40 min. Fri in the 3-day version; not in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Push Press (Barbell) | 8, 3 | 4 × 4–6 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 2 | **Circuit: 3 rounds, 15 s between exercises, 120 s rest after each round** |  |  |  |  |  |
| 2a | Thruster (Dumbbell) |  | 3 × 12 | RIR 2 |  | None |
| 2b | One-Arm Row (Kettlebell) |  | 3 × 10 per arm | RIR 2 |  | None |
| 2c | Toes-to-Bar |  | 3 × 8 | RIR 2 |  | None |

Notes shown with the exercise:

- 1 Push Press (Barbell): Make the second warm-up heavier.
- 2a Thruster (Dumbbell): One round is one set of each exercise. When every round feels smooth, go heavier on the dumbbell or kettlebell.
- 2b One-Arm Row (Kettlebell): Reps are per arm.
- 2c Toes-to-Bar: Knee raises are fine.

### 11. Athletic Base

> Ten weeks of power for field and court sports: jumps and fast lifts first, then strength and single-leg work.

- Id: `tpl_athletic_base`
- Review status: Draft, not reviewed yet
- Card: Intermediate · 2 or 3 days/week · 10 weeks
- Style: Athletic
- Level: Made for intermediate lifters. Also suits beginners. Also suits advanced lifters
- Goals: Athletic performance (main), strength
- Equipment: Barbell, Dumbbell
- Also needs: a squat rack, a bench, a pull-up bar and a box or step
- Length: Fixed, 10 weeks
- Day versions: 3 days a week (default), 2 days a week
- Form-analysis lifts: Deadlift (Barbell), Bulgarian Split Squat (Dumbbell), Front Squat (Barbell), Single-Leg Calf Raise (Dumbbell)

**Design notes**

- Jumps and the push press come first, while fresh.
- Heavy two-leg lifts are paired with single-leg work and the Nordic; the 3-day version adds side-to-side, adductor and calf work.
- The 2-day version trains legs once a week, with no side-to-side, adductor or calf work.
- Jump landings stay low on purpose, so it fits around sport.
- No Olympic lift to learn from a note, so it suits beginners too.

#### Day versions

**3 days a week (default)**. Fixed: weeks 1 to 10 all repeat this week. Card and page: Intermediate · 3 days/week · 10 weeks.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Lower Power | Rest | Upper Power | Rest | Jumps & Single-Leg | Rest | Rest |

**2 days a week**. Fixed: weeks 1 to 10 all repeat this week. Card and page: Intermediate · 2 days/week · 10 weeks.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Lower Power | Rest | Rest | Upper Power | Rest | Rest | Rest |

**Minutes and weekly sets.** Minutes add up the workouts in the week. Each set counts once for each primary muscle of its exercise; in brackets, the days that muscle is trained.

| Per week | 3 days a week (default) | 2 days a week |
|---|---|---|
| Minutes | 155 | 105 |
| Working sets | 50 | 34 |
| Quads | 15 (2 days) | 6 (1 day) |
| Hamstrings | 8 (2 days) | 5 (1 day) |
| Glutes | 18 (2 days) | 9 (1 day) |
| Adductors | 2 (1 day) | 0 |
| Calves | 2 (1 day) | 0 |
| Chest | 3 (1 day) | 3 (1 day) |
| Back | 6 (2 days) | 6 (2 days) |
| Lats | 7 (1 day) | 7 (1 day) |
| Shoulders | 6 (1 day) | 6 (1 day) |
| Biceps | 4 (1 day) | 4 (1 day) |
| Triceps | 7 (1 day) | 7 (1 day) |
| Core | 7 (2 days) | 7 (2 days) |

#### Lower Power

6 exercises · 16 working sets · ~50 min. Mon in the 3-day version; Mon in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 1a | Box Jump |  | 3 × 3 | No target |  | None |
| 1b | Dead Bug |  | 3 × 8–10 per side | RIR 2 |  | None |
| 2 | Deadlift (Barbell) | 5, 3 | 3 × 3–5 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 3 | Bulgarian Split Squat (Dumbbell) |  | 3 × 6–10 per leg | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 4a | Nordic Hamstring Curl |  | 2 × 3–5 | RIR 2 |  | None |
| 4b | Side Plank |  | 2 × 30 s per side |  |  | None |

Notes shown with the exercise:

- 1a Box Jump: Step down after each jump. Pick a height you land on quietly.
- 1b Dead Bug: Reps are per side.
- 2 Deadlift (Barbell): Make the second warm-up heavier.
- 3 Bulgarian Split Squat (Dumbbell): Reps are per leg.
- 4a Nordic Hamstring Curl: Anchor your heels under something sturdy. Lower as slowly as you can, then push back up with your hands.
- 4b Side Plank: Time is per side.

#### Upper Power

6 exercises · 18 working sets · ~55 min. Wed in the 3-day version; Thu in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Push Press (Barbell) | 5, 3 | 4 × 3–5 | No target |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 2 | Pull-Up |  | 4 × 4–8 | RIR 2 |  | None |
| 3 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 3a | Bench Press (Dumbbell) |  | 3 × 6–10 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 3b | One-Arm Row (Dumbbell) |  | 3 × 8–12 per arm | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 4a | Reverse Fly (Dumbbell) |  | 2 × 10–20 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |
| 4b | Hanging Knee Raise |  | 2 × 10–15 | RIR 2 |  | None |

Notes shown with the exercise:

- 1 Push Press (Barbell): Make the second warm-up heavier. Dip and drive with your legs; move the bar fast.
- 2 Pull-Up: Fewer than 4? Use a band, or jump up and lower slowly, until you get there. At 4×8, hold a dumbbell between your feet.
- 3b One-Arm Row (Dumbbell): Reps are per arm.

#### Jumps & Single-Leg

6 exercises · 16 working sets · ~50 min. Fri in the 3-day version; not in the 2-day version.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 1a | Broad Jump |  | 3 × 3 | No target |  | None |
| 1b | Lateral Bound |  | 3 × 4 per side | No target |  | None |
| 2 | Front Squat (Barbell) | 8, 3 | 3 × 4–6 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 3 | Single-Leg Romanian Deadlift (Dumbbell) |  | 3 × 6–10 per leg | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 2 rounds, 60 s rest after each round** |  |  |  |  |  |
| 4a | Copenhagen Plank |  | 2 × 20 s per side |  |  | None |
| 4b | Single-Leg Calf Raise (Dumbbell) |  | 2 × 8–15 per leg | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |

Notes shown with the exercise:

- 1a Broad Jump: Land softly and reset before the next jump.
- 1b Lateral Bound: Stick each landing for a second. Reps are per side.
- 2 Front Squat (Barbell): Make the second warm-up heavier.
- 3 Single-Leg Romanian Deadlift (Dumbbell): Reps are per leg.
- 4a Copenhagen Plank: Top knee on the bench to make it easier, foot on the bench to make it harder. Time is per side.
- 4b Single-Leg Calf Raise (Dumbbell): Reps are per leg.

### 12. Push Pull Legs

> Push, pull and legs, each twice a week, for experienced lifters who want more volume.

- Id: `tpl_ppl`
- Review status: Draft, not reviewed yet
- Card: Advanced · 6 days/week · Ongoing
- Style: Bodybuilding
- Level: Made for advanced lifters. Also suits intermediate lifters
- Goals: Muscle growth
- Equipment: Barbell, Dumbbell, Cable, Machine
- Also needs: a squat rack, a bench and a pull-up bar
- Length: Ongoing (weekly)
- Day versions: 6 days a week
- Form-analysis lifts: Back Squat (Barbell), Romanian Deadlift (Barbell), Standing Calf Raise (Machine)

**Design notes**

- High weekly volume for experienced lifters.
- Three workouts, each run twice a week, so there is less to review and they abbreviate cleanly.
- Not a copy of a popular online split: no AMRAP sets, no row and deadlift alternation, and no session-by-session jumps.

#### Week

**6 days a week**. Weekly, ongoing. Card and page: Advanced · 6 days/week · Ongoing.

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| Push | Pull | Legs | Push | Pull | Legs | Rest |

**Minutes and weekly sets.** Minutes add up the workouts in the week. Each set counts once for each primary muscle of its exercise; in brackets, the days that muscle is trained.

| Per week | 6 days a week |
|---|---|
| Minutes | 340 |
| Working sets | 108 |
| Quads | 14 (2 days) |
| Hamstrings | 12 (2 days) |
| Glutes | 20 (2 days) |
| Calves | 6 (2 days) |
| Chest | 20 (2 days) |
| Back | 12 (2 days) |
| Lats | 18 (2 days) |
| Shoulders | 24 (4 days) |
| Biceps | 16 (2 days) |
| Triceps | 20 (2 days) |
| Forearms | 4 (2 days) |
| Core | 4 (2 days) |

#### Push

6 exercises · 19 working sets · ~60 min. On Mon and Thu.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Bench Press (Barbell) | 8, 3 | 4 × 6–10 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 2 | Incline Bench Press (Dumbbell) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2 kg at top of range · deload 10% after 3 misses |
| 3 | Shoulder Press (Machine) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 3 rounds, 75 s rest after each round** |  |  |  |  |  |
| 4a | Lateral Raise (Cable) |  | 3 × 12–20 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 4b | Overhead Triceps Extension (Cable) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 5 | Chest Fly (Machine) |  | 2 × 12–15, then 1 drop set to failure (about 12 reps) | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |

Notes shown with the exercise:

- 1 Bench Press (Barbell): Make the second warm-up heavier.

#### Pull

6 exercises · 17 working sets · ~50 min. On Tue and Fri.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Pull-Up |  | 3 × 6–10 | RIR 2 |  | None |
| 2 | Bent-Over Row (Barbell) | 8 | 3 × 6–10 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 3 | Seated Row (Cable) |  | 3 × 10–12 | RIR 2 |  | +5 lb / +2.5 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 3 rounds, 75 s rest after each round** |  |  |  |  |  |
| 4a | Reverse Fly (Machine) |  | 3 × 12–20 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 4b | Bicep Curl (Cable) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 5 | Hammer Curl (Dumbbell) |  | 2 × 10–20 | RIR 2 |  | +5 lb / +2 kg at top of range · repeat on a miss |

Notes shown with the exercise:

- 1 Pull-Up: Fewer than 6? Use the assisted pull-up machine or a band until you get there. At 3×10, hold a dumbbell between your feet.

#### Legs

6 exercises · 18 working sets · ~60 min. On Wed and Sat.

| # | Exercise | Warm-ups | Working sets | Effort | Tempo | Progression (lb / kg) |
|---|---|---|---|---|---|---|
| 1 | Back Squat (Barbell) | 8, 3 | 4 × 5–8 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 2 | Romanian Deadlift (Barbell) |  | 3 × 8–10 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 3 | Leg Press (Machine) |  | 3 × 10–15 | RIR 2 |  | +10 lb / +5 kg at top of range · deload 10% after 3 misses |
| 4 | **Superset: 3 rounds, 90 s rest after each round** |  |  |  |  |  |
| 4a | Seated Leg Curl (Machine) |  | 3 × 10–15 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 4b | Standing Calf Raise (Machine) |  | 3 × 8–12 | RIR 2 |  | +5 lb / +2.5 kg at top of range · repeat on a miss |
| 5 | Hanging Leg Raise |  | 2 × 10–15 | RIR 2 |  | None |

Notes shown with the exercise:

- 1 Back Squat (Barbell): Make the second warm-up heavier.

## 3. Recommendations: the best match for each answer

The first card onboarding shows, for every goal, experience and number of days, in six equipment setups (630 answers). Each cell is the program's code and the days a week of the version it starts. In brackets: the heading reads "Closest plans", because no eligible program is built for that goal or none fits every answer.

**Codes:** FBF Full-Body Foundations · DFB Dumbbell Full Body · HBS Home Bodyweight Starter · BSB Barbell Strength Base · FRS Full-Range Strength · ULB Upper / Lower Builder · FDMB Five-Day Muscle Builder · BTB Big Three Block · CS Calisthenics Strength · SC Strength and Circuits · AB Athletic Base · PPL Push Pull Legs.

### Full gym

Equipment answered: barbell, dumbbell, machine, cable, kettlebell and bodyweight.

| Goal, experience | 1 day | 2 days | 3 days | 4 days | 5 days | 6 days | 7 days |
|---|---|---|---|---|---|---|---|
| Strength, beginner | FBF 2 | FBF 2 | BSB 3 | BSB 3 | BSB 3 | BSB 3 | BSB 3 |
| Strength, intermediate | SC 2 | SC 2 | BTB 3 | ULB 4 | ULB 4 | ULB 4 | ULB 4 |
| Strength, advanced | SC 2 | SC 2 | BTB 3 | ULB 4 | ULB 4 | ULB 4 | ULB 4 |
| Muscle growth, beginner | FBF 2 | FBF 2 | FBF 3 | FBF 3 | FBF 3 | FBF 3 | FBF 3 |
| Muscle growth, intermediate | FBF 2 | FBF 2 | FBF 3 | ULB 4 | FDMB 5 | PPL 6 | PPL 6 |
| Muscle growth, advanced | FBF 2 | FBF 2 | FBF 3 | ULB 4 | FDMB 5 | PPL 6 | PPL 6 |
| Athletic performance, beginner | AB 2 | AB 2 | AB 3 | AB 3 | AB 3 | AB 3 | AB 3 |
| Athletic performance, intermediate | AB 2 | AB 2 | AB 3 | AB 3 | AB 3 | AB 3 | AB 3 |
| Athletic performance, advanced | AB 2 | AB 2 | AB 3 | AB 3 | AB 3 | AB 3 | AB 3 |
| Mobility and full range, beginner | FRS 2 | FRS 2 | FRS 3 | FRS 3 | FRS 3 | FRS 3 | FRS 3 |
| Mobility and full range, intermediate | FRS 2 | FRS 2 | FRS 3 | FRS 3 | FRS 3 | FRS 3 | FRS 3 |
| Mobility and full range, advanced | FRS 2 | FRS 2 | FRS 3 | FRS 3 | FRS 3 | FRS 3 | FRS 3 |
| General fitness, beginner | FBF 2 | FBF 2 | FBF 3 | FBF 3 | FBF 3 | FBF 3 | FBF 3 |
| General fitness, intermediate | SC 2 | SC 2 | SC 3 | SC 3 | SC 3 | SC 3 | SC 3 |
| General fitness, advanced | SC 2 | SC 2 | SC 3 | SC 3 | SC 3 | SC 3 | SC 3 |

### Barbell and dumbbells

Equipment answered: barbell and dumbbell.

| Goal, experience | 1 day | 2 days | 3 days | 4 days | 5 days | 6 days | 7 days |
|---|---|---|---|---|---|---|---|
| Strength, beginner | DFB 2 | DFB 2 | BSB 3 | BSB 3 | BSB 3 | BSB 3 | BSB 3 |
| Strength, intermediate | AB 2 | AB 2 | BTB 3 | BTB 4 | BTB 4 | BTB 4 | BTB 4 |
| Strength, advanced | AB 2 | AB 2 | BTB 3 | BTB 4 | BTB 4 | BTB 4 | BTB 4 |
| Muscle growth, beginner | DFB 2 | DFB 2 | DFB 3 | DFB 3 | DFB 3 | DFB 3 | DFB 3 |
| Muscle growth, intermediate | DFB 2 | DFB 2 | DFB 3 | DFB 3 | DFB 3 | DFB 3 | DFB 3 |
| Muscle growth, advanced | DFB 2 | DFB 2 | DFB 3 | CS 4 | CS 4 | DFB 3 | DFB 3 |
| Athletic performance, beginner | AB 2 | AB 2 | AB 3 | AB 3 | AB 3 | AB 3 | AB 3 |
| Athletic performance, intermediate | AB 2 | AB 2 | AB 3 | AB 3 | AB 3 | AB 3 | AB 3 |
| Athletic performance, advanced | AB 2 | AB 2 | AB 3 | AB 3 | AB 3 | AB 3 | AB 3 |
| Mobility and full range, beginner | FRS 2 | FRS 2 | FRS 3 | FRS 3 | FRS 3 | FRS 3 | FRS 3 |
| Mobility and full range, intermediate | FRS 2 | FRS 2 | FRS 3 | FRS 3 | FRS 3 | FRS 3 | FRS 3 |
| Mobility and full range, advanced | FRS 2 | FRS 2 | FRS 3 | FRS 3 | FRS 3 | FRS 3 | FRS 3 |
| General fitness, beginner | DFB 2 | DFB 2 | DFB 3 | DFB 3 | DFB 3 | DFB 3 | DFB 3 |
| General fitness, intermediate | DFB 2 | DFB 2 | DFB 3 | DFB 3 | DFB 3 | DFB 3 | DFB 3 |
| General fitness, advanced | DFB 2 | DFB 2 | DFB 3 | DFB 3 | DFB 3 | DFB 3 | DFB 3 |

### Barbell only

Equipment answered: barbell.

| Goal, experience | 1 day | 2 days | 3 days | 4 days | 5 days | 6 days | 7 days |
|---|---|---|---|---|---|---|---|
| Strength, beginner | HBS 2 | BSB 3 | BSB 3 | BSB 3 | BSB 3 | BSB 3 | BSB 3 |
| Strength, intermediate | HBS 2 | BSB 3 | BSB 3 | BSB 3 | BSB 3 | BSB 3 | BSB 3 |
| Strength, advanced | HBS 2 | BSB 3 | BSB 3 | CS 4 | CS 4 | BSB 3 | BSB 3 |
| Muscle growth, beginner | HBS 2 | HBS 2 | BSB 3 | BSB 3 | BSB 3 | BSB 3 | BSB 3 |
| Muscle growth, intermediate | HBS 2 | BSB 3 | BSB 3 | BSB 3 | BSB 3 | BSB 3 | BSB 3 |
| Muscle growth, advanced | HBS 2 | HBS 2 | BSB 3 | CS 4 | CS 4 | BSB 3 | BSB 3 |
| Athletic performance, beginner | (HBS 2) | (HBS 2) | (BSB 3) | (BSB 3) | (BSB 3) | (BSB 3) | (BSB 3) |
| Athletic performance, intermediate | (HBS 2) | (BSB 3) | (BSB 3) | (BSB 3) | (BSB 3) | (BSB 3) | (BSB 3) |
| Athletic performance, advanced | (HBS 2) | (HBS 2) | (BSB 3) | (CS 4) | (CS 4) | (BSB 3) | (BSB 3) |
| Mobility and full range, beginner | (HBS 2) | (HBS 2) | (BSB 3) | (BSB 3) | (BSB 3) | (BSB 3) | (BSB 3) |
| Mobility and full range, intermediate | (HBS 2) | (BSB 3) | (BSB 3) | (BSB 3) | (BSB 3) | (BSB 3) | (BSB 3) |
| Mobility and full range, advanced | (HBS 2) | (HBS 2) | (BSB 3) | (CS 4) | (CS 4) | (BSB 3) | (BSB 3) |
| General fitness, beginner | HBS 2 | HBS 2 | BSB 3 | BSB 3 | BSB 3 | BSB 3 | BSB 3 |
| General fitness, intermediate | HBS 2 | HBS 2 | BSB 3 | BSB 3 | BSB 3 | BSB 3 | BSB 3 |
| General fitness, advanced | HBS 2 | HBS 2 | BSB 3 | CS 4 | CS 4 | BSB 3 | BSB 3 |

### Dumbbells only

Equipment answered: dumbbell.

| Goal, experience | 1 day | 2 days | 3 days | 4 days | 5 days | 6 days | 7 days |
|---|---|---|---|---|---|---|---|
| Strength, beginner | DFB 2 | DFB 2 | DFB 3 | DFB 3 | DFB 3 | DFB 3 | DFB 3 |
| Strength, intermediate | DFB 2 | DFB 2 | DFB 3 | CS 4 | CS 4 | DFB 3 | DFB 3 |
| Strength, advanced | DFB 2 | DFB 2 | CS 3 | CS 4 | CS 4 | CS 4 | CS 4 |
| Muscle growth, beginner | DFB 2 | DFB 2 | DFB 3 | DFB 3 | DFB 3 | DFB 3 | DFB 3 |
| Muscle growth, intermediate | DFB 2 | DFB 2 | DFB 3 | DFB 3 | DFB 3 | DFB 3 | DFB 3 |
| Muscle growth, advanced | DFB 2 | DFB 2 | DFB 3 | CS 4 | CS 4 | DFB 3 | DFB 3 |
| Athletic performance, beginner | (DFB 2) | (DFB 2) | (DFB 3) | (DFB 3) | (DFB 3) | (DFB 3) | (DFB 3) |
| Athletic performance, intermediate | (DFB 2) | (DFB 2) | (DFB 3) | (DFB 3) | (DFB 3) | (DFB 3) | (DFB 3) |
| Athletic performance, advanced | (DFB 2) | (DFB 2) | (DFB 3) | (CS 4) | (CS 4) | (DFB 3) | (DFB 3) |
| Mobility and full range, beginner | FRS 2 | FRS 2 | FRS 3 | FRS 3 | FRS 3 | FRS 3 | FRS 3 |
| Mobility and full range, intermediate | FRS 2 | FRS 2 | FRS 3 | FRS 3 | FRS 3 | FRS 3 | FRS 3 |
| Mobility and full range, advanced | FRS 2 | FRS 2 | FRS 3 | FRS 3 | FRS 3 | FRS 3 | FRS 3 |
| General fitness, beginner | DFB 2 | DFB 2 | DFB 3 | DFB 3 | DFB 3 | DFB 3 | DFB 3 |
| General fitness, intermediate | DFB 2 | DFB 2 | DFB 3 | DFB 3 | DFB 3 | DFB 3 | DFB 3 |
| General fitness, advanced | DFB 2 | DFB 2 | DFB 3 | DFB 3 | DFB 3 | DFB 3 | DFB 3 |

### Bodyweight only

Equipment answered: bodyweight.

| Goal, experience | 1 day | 2 days | 3 days | 4 days | 5 days | 6 days | 7 days |
|---|---|---|---|---|---|---|---|
| Strength, beginner | HBS 2 | HBS 2 | HBS 3 | HBS 3 | HBS 3 | HBS 3 | HBS 3 |
| Strength, intermediate | HBS 2 | CS 3 | CS 3 | CS 4 | CS 4 | CS 4 | CS 4 |
| Strength, advanced | HBS 2 | CS 3 | CS 3 | CS 4 | CS 4 | CS 4 | CS 4 |
| Muscle growth, beginner | HBS 2 | HBS 2 | HBS 3 | HBS 3 | HBS 3 | HBS 3 | HBS 3 |
| Muscle growth, intermediate | HBS 2 | HBS 2 | CS 3 | CS 4 | CS 4 | CS 4 | CS 4 |
| Muscle growth, advanced | HBS 2 | HBS 2 | CS 3 | CS 4 | CS 4 | CS 4 | CS 4 |
| Athletic performance, beginner | (HBS 2) | (HBS 2) | (HBS 3) | (HBS 3) | (HBS 3) | (HBS 3) | (HBS 3) |
| Athletic performance, intermediate | (HBS 2) | (HBS 2) | (CS 3) | (CS 4) | (CS 4) | (CS 4) | (CS 4) |
| Athletic performance, advanced | (HBS 2) | (HBS 2) | (CS 3) | (CS 4) | (CS 4) | (CS 4) | (CS 4) |
| Mobility and full range, beginner | (HBS 2) | (HBS 2) | (HBS 3) | (HBS 3) | (HBS 3) | (HBS 3) | (HBS 3) |
| Mobility and full range, intermediate | (HBS 2) | (HBS 2) | (CS 3) | (CS 4) | (CS 4) | (CS 4) | (CS 4) |
| Mobility and full range, advanced | (HBS 2) | (HBS 2) | (CS 3) | (CS 4) | (CS 4) | (CS 4) | (CS 4) |
| General fitness, beginner | HBS 2 | HBS 2 | HBS 3 | HBS 3 | HBS 3 | HBS 3 | HBS 3 |
| General fitness, intermediate | HBS 2 | HBS 2 | CS 3 | CS 4 | CS 4 | CS 4 | CS 4 |
| General fitness, advanced | HBS 2 | HBS 2 | CS 3 | CS 4 | CS 4 | CS 4 | CS 4 |

### Equipment skipped

The equipment question skipped.

| Goal, experience | 1 day | 2 days | 3 days | 4 days | 5 days | 6 days | 7 days |
|---|---|---|---|---|---|---|---|
| Strength, beginner | FBF 2 | FBF 2 | BSB 3 | BSB 3 | BSB 3 | BSB 3 | BSB 3 |
| Strength, intermediate | SC 2 | SC 2 | BTB 3 | ULB 4 | ULB 4 | ULB 4 | ULB 4 |
| Strength, advanced | SC 2 | SC 2 | BTB 3 | ULB 4 | ULB 4 | ULB 4 | ULB 4 |
| Muscle growth, beginner | FBF 2 | FBF 2 | FBF 3 | FBF 3 | FBF 3 | FBF 3 | FBF 3 |
| Muscle growth, intermediate | FBF 2 | FBF 2 | CS 3 | ULB 4 | FDMB 5 | PPL 6 | PPL 6 |
| Muscle growth, advanced | FBF 2 | FBF 2 | CS 3 | ULB 4 | FDMB 5 | PPL 6 | PPL 6 |
| Athletic performance, beginner | AB 2 | AB 2 | AB 3 | AB 3 | AB 3 | AB 3 | AB 3 |
| Athletic performance, intermediate | AB 2 | AB 2 | AB 3 | AB 3 | AB 3 | AB 3 | AB 3 |
| Athletic performance, advanced | AB 2 | AB 2 | AB 3 | AB 3 | AB 3 | AB 3 | AB 3 |
| Mobility and full range, beginner | FRS 2 | FRS 2 | FRS 3 | FRS 3 | FRS 3 | FRS 3 | FRS 3 |
| Mobility and full range, intermediate | FRS 2 | FRS 2 | FRS 3 | FRS 3 | FRS 3 | FRS 3 | FRS 3 |
| Mobility and full range, advanced | FRS 2 | FRS 2 | FRS 3 | FRS 3 | FRS 3 | FRS 3 | FRS 3 |
| General fitness, beginner | FBF 2 | FBF 2 | FBF 3 | FBF 3 | FBF 3 | FBF 3 | FBF 3 |
| General fitness, intermediate | SC 2 | SC 2 | SC 3 | SC 3 | SC 3 | SC 3 | SC 3 |
| General fitness, advanced | SC 2 | SC 2 | SC 3 | SC 3 | SC 3 | SC 3 | SC 3 |

## 4. Recommendations: worked examples

Each example shows the answers, then exactly what onboarding shows: the heading, the text under it, and each card with its version and lines. Check lines have a check mark; info lines are shown without one. Tests hold the app to these.

**Example 1.** Answers: Beginner · strength · barbell only · 3.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

1. **Barbell Strength Base** · Beginner · 3 days/week · 12 weeks
   - Check: Built to get you stronger
   - Check: 3 days a week, as you planned
   - Check: Made for beginners
   - Info, no check mark: Also needs a squat rack and a bench
2. **Home Bodyweight Starter** · Beginner · 3 days/week · Ongoing
   - Check: Builds strength too
   - Check: 3 days a week, as you planned
   - Check: Made for beginners
   - Info, no check mark: Also needs a low bar or sturdy table

**Example 2.** Answers: Beginner · muscle · full gym · 6.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

Why it's here: A beginner who can train 6 days gets 3-day beginner plans: never more than 3 days, never Push Pull Legs.

1. **Full-Body Foundations** · Beginner · 3 days/week · Ongoing
   - Check: Builds muscle too
   - Check: 3 days a week, fits your schedule
   - Check: Made for beginners
2. **Dumbbell Full Body** · Beginner · 3 days/week · Ongoing
   - Check: Builds muscle too
   - Check: 3 days a week, fits your schedule
   - Check: Made for beginners
3. **Barbell Strength Base** · Beginner · 3 days/week · 12 weeks
   - Check: Builds muscle too
   - Check: 3 days a week, fits your schedule
   - Check: Made for beginners

**Example 3.** Answers: Intermediate · strength · full gym · 4.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

1. **Upper / Lower Builder** · Intermediate · 4 days/week · Ongoing
   - Check: Built to get you stronger
   - Check: 4 days a week, as you planned
   - Check: Made for intermediate lifters
2. **Big Three Block** · Intermediate · 4 days/week · 6 weeks
   - Check: Built to get you stronger
   - Check: 4 days a week, as you planned
   - Check: Made for intermediate lifters
3. **Barbell Strength Base** · Beginner · 3 days/week · 12 weeks
   - Check: Built to get you stronger
   - Check: 3 days a week, fits your schedule
   - Check: Also suits intermediate lifters

**Example 4.** Answers: Intermediate · muscle · full gym · 6.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

1. **Push Pull Legs** · Advanced · 6 days/week · Ongoing
   - Check: Built for muscle growth
   - Check: 6 days a week, as you planned
   - Check: Also suits intermediate lifters
2. **Five-Day Muscle Builder** · Intermediate · 5 days/week · Ongoing
   - Check: Built for muscle growth
   - Check: 5 days a week, fits your schedule
   - Check: Made for intermediate lifters
3. **Upper / Lower Builder** · Intermediate · 4 days/week · Ongoing
   - Check: Builds muscle too
   - Check: 4 days a week, fits your schedule
   - Check: Made for intermediate lifters

**Example 5.** Answers: Intermediate · muscle · full gym · 3.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

1. **Full-Body Foundations** · Beginner · 3 days/week · Ongoing
   - Check: Builds muscle too
   - Check: 3 days a week, as you planned
   - Check: Also suits intermediate lifters
2. **Dumbbell Full Body** · Beginner · 3 days/week · Ongoing
   - Check: Builds muscle too
   - Check: 3 days a week, as you planned
   - Check: Also suits intermediate lifters
3. **Barbell Strength Base** · Beginner · 3 days/week · 12 weeks
   - Check: Builds muscle too
   - Check: 3 days a week, as you planned
   - Check: Also suits intermediate lifters

**Example 6.** Answers: Intermediate · muscle · full gym · 2.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

1. **Full-Body Foundations** · Beginner · 2 days/week · Ongoing
   - Check: Builds muscle too
   - Check: 2 days a week, as you planned
   - Check: Also suits intermediate lifters
2. **Dumbbell Full Body** · Beginner · 2 days/week · Ongoing
   - Check: Builds muscle too
   - Check: 2 days a week, as you planned
   - Check: Also suits intermediate lifters
3. **Barbell Strength Base** · Beginner · 3 days/week · 12 weeks
   - Check: Builds muscle too
   - Check: Also suits intermediate lifters
   - Check: Uses the equipment you have
   - Info, no check mark: Needs 3 days a week

**Example 7.** Answers: Intermediate · muscle · dumbbells only · 4.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

Why it's here: Nothing that needs a barbell, cable or machine.

1. **Dumbbell Full Body** · Beginner · 3 days/week · Ongoing
   - Check: Builds muscle too
   - Check: 3 days a week, fits your schedule
   - Check: Also suits intermediate lifters
   - Info, no check mark: Also needs a bench
2. **Calisthenics Strength** · Intermediate · 4 days/week · Ongoing
   - Check: Builds muscle too
   - Check: 4 days a week, as you planned
   - Check: Made for intermediate lifters
   - Info, no check mark: Also needs a bench, a pull-up bar, dip bars and a low bar or sturdy table
3. **Home Bodyweight Starter** · Beginner · 3 days/week · Ongoing
   - Check: Builds muscle too
   - Check: 3 days a week, fits your schedule
   - Check: No weights needed
   - Info, no check mark: Also needs a low bar or sturdy table

**Example 8.** Answers: Advanced · strength · bodyweight only · 4.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

1. **Calisthenics Strength** · Intermediate · 4 days/week · Ongoing
   - Check: Built to get you stronger
   - Check: 4 days a week, as you planned
   - Check: Also suits advanced lifters
   - Info, no check mark: Also needs a bench, a pull-up bar, dip bars and a low bar or sturdy table
2. **Home Bodyweight Starter** · Beginner · 3 days/week · Ongoing
   - Check: Builds strength too
   - Check: 3 days a week, fits your schedule
   - Check: No weights needed
   - Info, no check mark: Also needs a low bar or sturdy table

**Example 9.** Answers: Intermediate · strength · bodyweight only · 3.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

1. **Calisthenics Strength** · Intermediate · 3 days/week · Ongoing
   - Check: Built to get you stronger
   - Check: 3 days a week, as you planned
   - Check: Made for intermediate lifters
   - Info, no check mark: Also needs a bench, a pull-up bar, dip bars and a low bar or sturdy table
2. **Home Bodyweight Starter** · Beginner · 3 days/week · Ongoing
   - Check: Builds strength too
   - Check: 3 days a week, as you planned
   - Check: No weights needed
   - Info, no check mark: Also needs a low bar or sturdy table

**Example 10.** Answers: Beginner · mobility · full gym · 3.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

1. **Full-Range Strength** · Beginner · 3 days/week · 8 weeks
   - Check: Built around full range of motion
   - Check: 3 days a week, as you planned
   - Check: Made for beginners

**Example 11.** Answers: Intermediate · athletic · barbell and dumbbells · 3.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

1. **Athletic Base** · Intermediate · 3 days/week · 10 weeks
   - Check: Built for speed and power
   - Check: 3 days a week, as you planned
   - Check: Made for intermediate lifters
   - Info, no check mark: Also needs a squat rack, a bench, a pull-up bar and a box or step

**Example 12.** Answers: Beginner · athletic · full gym · 3.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

1. **Athletic Base** · Intermediate · 3 days/week · 10 weeks
   - Check: Built for speed and power
   - Check: 3 days a week, as you planned
   - Check: Also suits beginners

**Example 13.** Answers: Intermediate · general · full gym · 1.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

Why it's here: No program runs 1 day a week, so each card says it needs 2.

1. **Strength and Circuits** · Intermediate · 2 days/week · Ongoing
   - Check: Good all-round training
   - Check: Made for intermediate lifters
   - Check: Uses the equipment you have
   - Info, no check mark: Needs 2 days a week
2. **Full-Body Foundations** · Beginner · 2 days/week · Ongoing
   - Check: Good all-round training
   - Check: Also suits intermediate lifters
   - Check: Uses the equipment you have
   - Info, no check mark: Needs 2 days a week
3. **Dumbbell Full Body** · Beginner · 2 days/week · Ongoing
   - Check: Good all-round training
   - Check: Also suits intermediate lifters
   - Check: Uses the equipment you have
   - Info, no check mark: Needs 2 days a week

**Example 14.** Answers: Advanced · muscle · full gym · 7.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

1. **Push Pull Legs** · Advanced · 6 days/week · Ongoing
   - Check: Built for muscle growth
   - Check: 6 days a week, fits your schedule
   - Check: Made for advanced lifters
2. **Five-Day Muscle Builder** · Intermediate · 5 days/week · Ongoing
   - Check: Built for muscle growth
   - Check: 5 days a week, fits your schedule
   - Check: Also suits advanced lifters
3. **Upper / Lower Builder** · Intermediate · 4 days/week · Ongoing
   - Check: Builds muscle too
   - Check: 4 days a week, fits your schedule
   - Check: Also suits advanced lifters

**Example 15.** Answers: Intermediate · strength · equipment skipped · 3.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

Why it's here: Equipment skipped: no equipment filter, and no equipment or gear lines.

1. **Big Three Block** · Intermediate · 3 days/week · 6 weeks
   - Check: Built to get you stronger
   - Check: 3 days a week, as you planned
   - Check: Made for intermediate lifters
2. **Calisthenics Strength** · Intermediate · 3 days/week · Ongoing
   - Check: Built to get you stronger
   - Check: 3 days a week, as you planned
   - Check: Made for intermediate lifters
3. **Barbell Strength Base** · Beginner · 3 days/week · 12 weeks
   - Check: Built to get you stronger
   - Check: 3 days a week, as you planned
   - Check: Also suits intermediate lifters

**Example 16.** Answers: Everything skipped.

Heading: "A few good places to start". Under it: "You skipped the questions, so here are three common starting points. Browse them all in Plans."

Why it's here: The first three programs in catalog order, default versions, no lines.

1. **Full-Body Foundations** · Beginner · 3 days/week · Ongoing
   - No lines
2. **Dumbbell Full Body** · Beginner · 3 days/week · Ongoing
   - No lines
3. **Home Bodyweight Starter** · Beginner · 3 days/week · Ongoing
   - No lines

**Example 17.** Answers: Beginner · general · kettlebells only · 3.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

1. **Home Bodyweight Starter** · Beginner · 3 days/week · Ongoing
   - Check: Good all-round training
   - Check: 3 days a week, as you planned
   - Check: Made for beginners
   - Info, no check mark: Also needs a low bar or sturdy table

**Example 18.** Answers: Beginner · athletic · bodyweight only · 3.

Heading: "Closest plans". Under it: "No program built for athletic performance fits your answers, so these come closest."

Why it's here: Known gap: no athletic program without a barbell.

1. **Home Bodyweight Starter** · Beginner · 3 days/week · Ongoing
   - Check: 3 days a week, as you planned
   - Check: Made for beginners
   - Check: No weights needed
   - Info, no check mark: Also needs a low bar or sturdy table

**Example 19.** Answers: Intermediate · athletic · bodyweight only · 3.

Heading: "Closest plans". Under it: "No program built for athletic performance fits your answers, so these come closest."

Why it's here: Known gap: no athletic program without a barbell.

1. **Calisthenics Strength** · Intermediate · 3 days/week · Ongoing
   - Check: 3 days a week, as you planned
   - Check: Made for intermediate lifters
   - Check: No weights needed
   - Info, no check mark: Also needs a bench, a pull-up bar, dip bars and a low bar or sturdy table
2. **Home Bodyweight Starter** · Beginner · 3 days/week · Ongoing
   - Check: 3 days a week, as you planned
   - Check: No weights needed
   - Info, no check mark: Also needs a low bar or sturdy table

**Example 20.** Answers: Only days answered: 1.

Heading: "Closest plans". Under it: "None of the plans fits every answer, so these come closest."

Why it's here: No check lines, so the heading is Closest plans.

1. **Full-Body Foundations** · Beginner · 2 days/week · Ongoing
   - Info, no check mark: Needs 2 days a week
2. **Dumbbell Full Body** · Beginner · 2 days/week · Ongoing
   - Info, no check mark: Needs 2 days a week
3. **Home Bodyweight Starter** · Beginner · 2 days/week · Ongoing
   - Info, no check mark: Needs 2 days a week

**Example 21.** Answers: Intermediate · muscle · barbell only · 3.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

1. **Barbell Strength Base** · Beginner · 3 days/week · 12 weeks
   - Check: Builds muscle too
   - Check: 3 days a week, as you planned
   - Check: Also suits intermediate lifters
   - Info, no check mark: Also needs a squat rack and a bench
2. **Calisthenics Strength** · Intermediate · 3 days/week · Ongoing
   - Check: Builds muscle too
   - Check: 3 days a week, as you planned
   - Check: Made for intermediate lifters
   - Info, no check mark: Also needs a bench, a pull-up bar, dip bars and a low bar or sturdy table
3. **Home Bodyweight Starter** · Beginner · 3 days/week · Ongoing
   - Check: Builds muscle too
   - Check: 3 days a week, as you planned
   - Check: No weights needed
   - Info, no check mark: Also needs a low bar or sturdy table

**Example 22.** Answers: Intermediate · muscle · full gym · 5.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

1. **Five-Day Muscle Builder** · Intermediate · 5 days/week · Ongoing
   - Check: Built for muscle growth
   - Check: 5 days a week, as you planned
   - Check: Made for intermediate lifters
2. **Upper / Lower Builder** · Intermediate · 4 days/week · Ongoing
   - Check: Builds muscle too
   - Check: 4 days a week, fits your schedule
   - Check: Made for intermediate lifters
3. **Full-Body Foundations** · Beginner · 3 days/week · Ongoing
   - Check: Builds muscle too
   - Check: 3 days a week, fits your schedule
   - Check: Also suits intermediate lifters

**Example 23.** Answers: Advanced · athletic · full gym · 5.

Heading: "Plans that fit you". Under it: "Based on your answers. Pick one to start, or build your own later in Plans."

1. **Athletic Base** · Intermediate · 3 days/week · 10 weeks
   - Check: Built for speed and power
   - Check: 3 days a week, fits your schedule
   - Check: Also suits advanced lifters
2. **Strength and Circuits** · Intermediate · 3 days/week · Ongoing
   - Check: Adds speed and power work
   - Check: 3 days a week, fits your schedule
   - Check: Also suits advanced lifters

## 5. The tour

Five cards, in order, as an iPhone 12 or newer shows them while form recording is a preview.

1. **Your plan, day by day**: Pick a plan in Plans and Today shows each day's workouts. Swipe when a day has more than one. Miss a workout and you decide whether to move the plan.
2. **Log a set in one tap**: Sets start from your plan and last time. Tap the check after each set: the rest timer starts, or a superset moves on. A line explains each weight change the plan suggests.
3. **Film a set, track your form**: Optional, for squats, lunges, deadlifts and calf raises. Prop up your phone, stand side-on and record a set to see your reps, depth and joint angles. The video stays on your phone. Under it: "In this preview build, recording is simulated."
4. **See your progress**: Progress charts each main lift's estimated one-rep max (e1RM) and your bodyweight. Tap a chart to open it, then drag across it to read each point.
5. **Goals and streaks**: Hit each week's target to grow your streak. On Home, set goals for a lift, your bodyweight, your form or how often you train, and see the badges you've earned.

- Form card on iPhones older than the 12: "Form recording needs an iPhone 12 or newer, so it's off on this phone. Logging, plans and progress all work as usual."
- Form card's preview line, shown until real form analysis ships (G4.3): "In this preview build, recording is simulated." It is on now.
- Onboarding's "Want a quick tour?" text: "Five short cards: Today, logging and rest, form recording, progress, and goals and streaks. About 30 seconds. Replay it any time from Profile → About."
- Last button: "Start training" when the tour opens from onboarding, "Done" from Profile → About.
- Today card picture: Full-Body Foundations · Full Body B · ~50 min · 15 working sets.
- Weights in the Log and Progress pictures follow the units setting (kg rounded to 2.5).

## 6. Library additions

8 exercises added for these programs. The library now has 278 exercises.

- **Bulgarian Split Squat** (`ex_bulgarian_split_squat_bw`): Bodyweight, compound; primary quads and glutes; secondary none; a variation of Reverse Lunge (Dumbbell); also called BSS; form analysis as a lunge; needs a bench; used in Calisthenics Strength.
- **Cossack Squat** (`ex_cossack_squat`): Bodyweight, compound; primary quads and adductors; secondary glutes; a variation of Reverse Lunge (Dumbbell); used in Full-Range Strength.
- **Deep Squat Hold** (`ex_deep_squat_hold`): Bodyweight, isolation; primary quads and glutes; secondary none; the main movement of its family; logged as a timed hold; used in Full-Range Strength.
- **Burpee** (`ex_burpee`): Bodyweight, compound; primary quads and chest; secondary shoulders, triceps and core; the main movement of its family; used in Strength and Circuits.
- **Thruster (Dumbbell)** (`ex_db_thruster`): Dumbbell, compound; primary quads and shoulders; secondary glutes, triceps and core; the main movement of its family; also called Squat to Press; used in Strength and Circuits.
- **Box Jump** (`ex_box_jump`): Bodyweight, compound; primary quads and glutes; secondary hamstrings and calves; the main movement of its family; needs a box or step; used in Athletic Base.
- **Broad Jump** (`ex_broad_jump`): Bodyweight, compound; primary quads and glutes; secondary hamstrings and calves; a variation of Box Jump; used in Athletic Base.
- **Lateral Bound** (`ex_lateral_bound`): Bodyweight, compound; primary glutes and quads; secondary adductors and calves; a variation of Box Jump; also called Skater Jump; used in Athletic Base.

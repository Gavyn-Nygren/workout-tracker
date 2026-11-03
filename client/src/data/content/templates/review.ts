import type { ID } from '../../types';

/**
 * Where each starter program stands in the owner's review (G3.13):
 * - draft: written, not yet reviewed;
 * - approved: the owner signed it off as it is;
 * - changes: the owner asked for changes, which the notes record.
 * Every program must be approved before release (roadmap G6.4).
 */
export type TemplateReviewStatus = 'draft' | 'approved' | 'changes';

/**
 * A program's review status and short design notes for the reviewer. The notes are qualitative on
 * purpose: weekly sets and minutes come from the generated review page, so they can't drift from
 * the program.
 */
export type TemplateReview = { status: TemplateReviewStatus; notes: string[] };

/** One entry per starter template, by template id, in catalog order. */
export const TEMPLATE_REVIEW: Readonly<Record<ID, TemplateReview>> = {
  tpl_full_body_foundations: {
    status: 'draft',
    notes: [
      'Squat, push and pull come up every session, at a beginner dose (ACSM 2009). The hinge (Romanian deadlift, hip thrust) comes twice a week on 3 days and once on 2 days, where the leg curl adds hamstring work.',
      'Stable machines keep the skill demand low.',
      'No exercise repeats across days.',
      'The 2-day version keeps the two workouts that cover every pattern.',
      'The dumbbell shoulder press and split squat use 8-15 reps, so the jump to the next dumbbell (5 lb or 2 kg) stalls them less. From the lightest dumbbells a lifter can still miss and deload once before the heavier pair sticks.',
    ],
  },
  tpl_dumbbell_full_body: {
    status: 'draft',
    notes: [
      'Each day has a squat or lunge, a hinge or hip thrust, a press and a pull: a row on days 1 and 2, a pullover and a reverse fly on day 3.',
      'Supersets of opposing muscles keep sessions short.',
      'The dumbbell shoulder press, lunge and split squat use 8-15 reps, so the jump to the next dumbbell (5 lb or 2 kg) stalls them less. From the lightest dumbbells a lifter can still miss and deload once before the heavier pair sticks.',
    ],
  },
  tpl_bodyweight_starter: {
    status: 'draft',
    notes: [
      'Push, pull and legs every session.',
      'Everything is in supersets, so sessions stay short.',
      'No progression rules: notes say when to move to a harder version.',
      'Pike push-ups start at 3 reps, with hands on a step to make them easier.',
    ],
  },
  tpl_barbell_strength_base: {
    status: 'draft',
    notes: [
      'Squat and bench come up twice a week, the second time as a variation. Deadlift and press come up once.',
      'Rep ranges (double progression), not fixed sets with a jump every session.',
      'Three different days rather than an A/B alternation, so it does not copy a well-known novice layout.',
      'Uses the canonical lift ids, so strength badges count.',
    ],
  },
  tpl_full_range_strength: {
    status: 'draft',
    notes: [
      'A complete plan on its own: deep squats, split squats and hinges with slow lowering and pauses, plus a push and a pull every session.',
      'Lower-body work stays near a beginner dose. The Nordic comes once a week at low reps.',
      'Built around form-analysis lifts: goblet squat, split squat, Romanian deadlift and calf raise.',
      'Original: no daily shin and calf opener, no reverse Nordic, no Copenhagen, no pullover, no brand cues, and no joint or medical claims.',
      'Dumbbell split squats, step-ups and shoulder presses use 8-15 reps, and the single-leg Romanian deadlift 8-12, so the jump to the next dumbbell stalls them less. From the lightest dumbbells a lifter can still miss and deload once or twice before the heavier pair sticks.',
    ],
  },
  tpl_upper_lower: {
    status: 'draft',
    notes: [
      'Heavy compound work comes first, then higher-rep work for size.',
      'Chest, back, quads, hamstrings and calves are trained twice a week, with a different exercise the second time.',
      'Biceps and side delts get direct work once a week, plus compound work.',
    ],
  },
  tpl_five_day_muscle: {
    status: 'draft',
    notes: [
      'Every major muscle, biceps and side delts included, is trained twice a week, each time with a different exercise (Schoenfeld 2016).',
      'Volume sits in the intermediate range; the weekly sets on the review page show it.',
    ],
  },
  tpl_big_three_block: {
    status: 'draft',
    notes: [
      'Starts near a 10-rep max and rises about 2.5% a week, ending near a 5-rep max: heavy triples and fours with a rep or two in reserve.',
      'Weekly % goes only on the three heavy lifts, because of the one-step minimum. Other lifts use rep ranges.',
      'On lighter lifts the one-step minimum makes the weekly rise bigger than 2.5%. Under about 100 lb or 45 kg it is 5-8% a week, so misses can start by week 3 or 4; the 2-miss deload handles them. A smaller barbell step in Profile → Units & logging keeps the rise near 2.5% for lifters with small plates.',
      "Coming from another plan, week 1 pre-fills last time's weight on that lift plus 2.5%, which can be well above a 10-rep weight. The note says to lower it. An engine follow-up could skip the week-1 suggestion on a fixed plan's weekly-% lifts.",
      'Lower-body days are never back to back, and the second squat is a variation. Runs in a garage gym: no cables or machines.',
    ],
  },
  tpl_calisthenics_strength: {
    status: 'draft',
    notes: [
      'Both upper days start with pull-ups or chin-ups. Upper A adds dips and pike push-ups; Upper B adds push-ups and rows.',
      'Rows come once a week, the least back work in the catalog. Adding inverted rows to Upper A is an option.',
      'Pistols, Nordics and split squats load the legs without weights.',
      'The 3-day version trains legs once a week.',
      'Notes give the next step at the top of each range: a loaded backpack, a harder version or a slower lowering.',
    ],
  },
  tpl_strength_circuits: {
    status: 'draft',
    notes: [
      'A heavy lift first, then a rep-based circuit.',
      'Honest about what the app logs today: rounds are sets, and reps and load are logged, so volume counts.',
      "No timers, no 'for time', no EMOM and no benchmark names, and nothing is logged as a hold.",
      'The circuit note asks for a heavier dumbbell or kettlebell, not a shorter rest, because a round rest cannot be changed in the plan yet.',
    ],
  },
  tpl_athletic_base: {
    status: 'draft',
    notes: [
      'Jumps and the push press come first, while fresh.',
      'Heavy two-leg lifts are paired with single-leg work and the Nordic; the 3-day version adds side-to-side, adductor and calf work.',
      'The 2-day version trains legs once a week, with no side-to-side, adductor or calf work.',
      'Jump landings stay low on purpose, so it fits around sport.',
      'No Olympic lift to learn from a note, so it suits beginners too.',
    ],
  },
  tpl_ppl: {
    status: 'draft',
    notes: [
      'High weekly volume for experienced lifters.',
      'Three workouts, each run twice a week, so there is less to review and they abbreviate cleanly.',
      'Not a copy of a popular online split: no AMRAP sets, no row and deadlift alternation, and no session-by-session jumps.',
    ],
  },
};

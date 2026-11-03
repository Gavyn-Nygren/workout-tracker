// Onboarding's recommendation rules (spec 2.4), as data: the points, the copy, the golden rows
// and the answer profiles the review page tabulates. recommend.ts applies them. Pure and types-only
// imports, so Node tests and the review page can load it (never answers.ts, which pulls in
// expo-sqlite through localStore).
//
// How it works, in short:
// 1. Who is eligible, in this order: equipment (every required item, bodyweight always counts),
//    experience (beginners only see programs whose levels include beginner; others see programs
//    whose lowest level is at or below theirs), the day version (the most days that still fit,
//    else the smallest; left out if that needs 2 or more extra days), then the goal (if any
//    eligible program lists it, only those are kept; otherwise the goal fallback applies).
// 2. Score with RULES and write the lines with COPY.
// 3. Sort by score, then main goal before secondary goal, then the smaller day gap, then catalog
//    order, and show the top 3.
// A skipped question applies no filter, adds no points and shows no line.
import type { Equipment, ExperienceLevel, ID, OnboardingAnswers, TrainingGoal } from '@/data/types';

/** The four answers that pick plans. Height and limitations never change a pick (spec 5). */
export type RecommendAnswers = Pick<OnboardingAnswers, 'experience' | 'goal' | 'equipment' | 'daysPerWeek'>;

/**
 * Which heading the results get: `start` when all four matching questions were skipped, `closest`
 * when the goal fallback happened or the best match has no check line, `fit` otherwise.
 */
export type RecommendHeading = 'fit' | 'closest' | 'start';

export const EXPERIENCE_LEVELS: readonly ExperienceLevel[] = ['beginner', 'intermediate', 'advanced'];
export const TRAINING_GOALS: readonly TrainingGoal[] = ['strength', 'muscle', 'athletic', 'mobility', 'general'];

/** Weights, for the equipment lines and points. Bands and bodyweight are not weights. */
export const WEIGHT_EQUIPMENT: readonly Equipment[] = ['barbell', 'dumbbell', 'kettlebell', 'machine', 'cable'];

/**
 * Equipment that makes a setup a gym. A home setup is an answered equipment list with neither, and
 * only home setups see the gear line, since gym programs can't reach them anyway.
 */
export const GYM_EQUIPMENT: readonly Equipment[] = ['machine', 'cable'];

/** The onboarding "Full gym" button: everything but bands. */
export const FULL_GYM: readonly Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'bodyweight'];

export const RULES = {
  /** The answered goal is the program's main goal (goals[0]), or another goal it lists. */
  goal: { main: 6, secondary: 3 },
  /**
   * The answered level against the program: its headline level, another level it suits, or 1 or
   * 2 levels above its range. (A level below the range is never eligible.)
   */
  experience: { headline: 4, inLevels: 3, oneAbove: -1, twoAbove: -3 },
  /** The chosen version's days against the answer: equal, 1 fewer, 2 or more fewer, 1 more. */
  days: { equal: 4, oneFewer: 3, twoOrMoreFewer: 1, oneMore: -3 },
  /** A program whose chosen version needs this many days or more beyond the answer is left out. */
  daysLeftOutAt: 2,
  /** Uses at least one weight; uses none though the user listed one; uses none and none listed. */
  equipment: { usesWeights: 2, noWeightsListedWeight: -3, noWeightsNoneListed: 0 },
  limits: {
    picks: 3,
    /** Check-mark lines per card, kept in the order goal, days, experience, equipment. */
    checkLines: 3,
    /** Info lines per card, shown without a check mark: days first, then gear. */
    infoLines: 2,
    /** Characters per line. The gear line is the exception: it lists every item, however long. */
    lineChars: 60,
  },
} as const;

/** How a goal reads in "No program built for {noun} fits your answers". */
export const GOAL_NOUN: Record<TrainingGoal, string> = {
  strength: 'strength',
  muscle: 'muscle growth',
  athletic: 'athletic performance',
  mobility: 'mobility and full range',
  general: 'general fitness',
};

const daysAWeek = (days: number) => `${days} ${days === 1 ? 'day' : 'days'} a week`;

/** Every line, heading and body the results use. Plain, no emoji, no "!" (spec 2.13). */
export const COPY = {
  goal: {
    main: {
      strength: 'Built to get you stronger',
      muscle: 'Built for muscle growth',
      athletic: 'Built for speed and power',
      mobility: 'Built around full range of motion',
      general: 'Good all-round training',
    } satisfies Record<TrainingGoal, string>,
    secondary: {
      strength: 'Builds strength too',
      muscle: 'Builds muscle too',
      athletic: 'Adds speed and power work',
      mobility: 'Includes full-range work',
      general: 'Works as all-round training too',
    } satisfies Record<TrainingGoal, string>,
  },
  experience: {
    headline: {
      beginner: 'Made for beginners',
      intermediate: 'Made for intermediate lifters',
      advanced: 'Made for advanced lifters',
    } satisfies Record<ExperienceLevel, string>,
    inLevels: {
      beginner: 'Also suits beginners',
      intermediate: 'Also suits intermediate lifters',
      advanced: 'Also suits advanced lifters',
    } satisfies Record<ExperienceLevel, string>,
  },
  days: {
    /** Check line: the version has exactly the days answered. */
    planned: (days: number) => `${daysAWeek(days)}, as you planned`,
    /** Check line: the version has fewer days than answered. Neutral, never a warning. */
    fits: (days: number) => `${daysAWeek(days)}, fits your schedule`,
    /** Info line: the version needs one more day than answered. */
    needs: (days: number) => `Needs ${daysAWeek(days)}`,
  },
  equipment: {
    usesWeights: 'Uses the equipment you have',
    noWeights: 'No weights needed',
  },
  /** Info line for home setups, from gearList: "Also needs a squat rack and a bench". */
  alsoNeeds: (gear: string) => `Also needs ${gear}`,
  heading: {
    fit: 'Plans that fit you',
    closest: 'Closest plans',
    start: 'A few good places to start',
  } satisfies Record<RecommendHeading, string>,
  body: {
    fit: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    start: 'You skipped the questions, so here are three common starting points. Browse them all in Plans.',
    /** `closest` after the goal fallback. */
    goalFallback: (goal: TrainingGoal) => `No program built for ${GOAL_NOUN[goal]} fits your answers, so these come closest.`,
    /** `closest` when the best match has no check line. */
    noFit: 'None of the plans fits every answer, so these come closest.',
  },
} as const;

/** An answer profile for the review page's generated table. A missing list means skipped. */
export type ReviewProfile = { key: string; label: string; equipment?: readonly Equipment[] };

/** The six equipment setups the review page's best-match table covers (× goal × experience × days 1-7). */
export const REVIEW_PROFILES: readonly ReviewProfile[] = [
  { key: 'full_gym', label: 'Full gym', equipment: FULL_GYM },
  { key: 'barbell_dumbbells', label: 'Barbell and dumbbells', equipment: ['barbell', 'dumbbell'] },
  { key: 'barbell', label: 'Barbell only', equipment: ['barbell'] },
  { key: 'dumbbells', label: 'Dumbbells only', equipment: ['dumbbell'] },
  { key: 'bodyweight', label: 'Bodyweight only', equipment: ['bodyweight'] },
  { key: 'skipped', label: 'Equipment skipped' },
];

/** One expected pick: the program, its version's days, and its exact lines. */
export type GoldenPick = { id: ID; days: number; reasons: string[]; notes: string[] };

/** A worked example the owner reviews and tests assert exactly (ids, versions, heading, lines). */
export type GoldenRow = {
  n: number;
  /** The answers as the owner reads them: experience · goal · equipment · days. */
  label: string;
  answers: RecommendAnswers;
  heading: RecommendHeading;
  /** The text under the heading. */
  subtitle: string;
  picks: GoldenPick[];
  /** What the row is there to show, when it isn't obvious from the picks. */
  note?: string;
};

const BARBELL_DUMBBELLS: Equipment[] = ['barbell', 'dumbbell'];
const full = () => [...FULL_GYM];

/** The golden rows, against the 12-program catalog (beginners see beginner-suitable plans only). */
export const GOLDEN_ROWS: readonly GoldenRow[] = [
  {
    n: 1,
    label: 'Beginner · strength · barbell only · 3',
    answers: { experience: 'beginner', goal: 'strength', equipment: ['barbell'], daysPerWeek: 3 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_barbell_strength_base', days: 3, reasons: ['Built to get you stronger', '3 days a week, as you planned', 'Made for beginners'], notes: ['Also needs a squat rack and a bench'] },
      { id: 'tpl_bodyweight_starter', days: 3, reasons: ['Builds strength too', '3 days a week, as you planned', 'Made for beginners'], notes: ['Also needs a low bar or sturdy table'] },
    ],
  },
  {
    n: 2,
    label: 'Beginner · muscle · full gym · 6',
    answers: { experience: 'beginner', goal: 'muscle', equipment: full(), daysPerWeek: 6 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_full_body_foundations', days: 3, reasons: ['Builds muscle too', '3 days a week, fits your schedule', 'Made for beginners'], notes: [] },
      { id: 'tpl_dumbbell_full_body', days: 3, reasons: ['Builds muscle too', '3 days a week, fits your schedule', 'Made for beginners'], notes: [] },
      { id: 'tpl_barbell_strength_base', days: 3, reasons: ['Builds muscle too', '3 days a week, fits your schedule', 'Made for beginners'], notes: [] },
    ],
    note: 'A beginner who can train 6 days gets 3-day beginner plans: never more than 3 days, never Push Pull Legs.',
  },
  {
    n: 3,
    label: 'Intermediate · strength · full gym · 4',
    answers: { experience: 'intermediate', goal: 'strength', equipment: full(), daysPerWeek: 4 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_upper_lower', days: 4, reasons: ['Built to get you stronger', '4 days a week, as you planned', 'Made for intermediate lifters'], notes: [] },
      { id: 'tpl_big_three_block', days: 4, reasons: ['Built to get you stronger', '4 days a week, as you planned', 'Made for intermediate lifters'], notes: [] },
      { id: 'tpl_barbell_strength_base', days: 3, reasons: ['Built to get you stronger', '3 days a week, fits your schedule', 'Also suits intermediate lifters'], notes: [] },
    ],
  },
  {
    n: 4,
    label: 'Intermediate · muscle · full gym · 6',
    answers: { experience: 'intermediate', goal: 'muscle', equipment: full(), daysPerWeek: 6 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_ppl', days: 6, reasons: ['Built for muscle growth', '6 days a week, as you planned', 'Also suits intermediate lifters'], notes: [] },
      { id: 'tpl_five_day_muscle', days: 5, reasons: ['Built for muscle growth', '5 days a week, fits your schedule', 'Made for intermediate lifters'], notes: [] },
      { id: 'tpl_upper_lower', days: 4, reasons: ['Builds muscle too', '4 days a week, fits your schedule', 'Made for intermediate lifters'], notes: [] },
    ],
  },
  {
    n: 5,
    label: 'Intermediate · muscle · full gym · 3',
    answers: { experience: 'intermediate', goal: 'muscle', equipment: full(), daysPerWeek: 3 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_full_body_foundations', days: 3, reasons: ['Builds muscle too', '3 days a week, as you planned', 'Also suits intermediate lifters'], notes: [] },
      { id: 'tpl_dumbbell_full_body', days: 3, reasons: ['Builds muscle too', '3 days a week, as you planned', 'Also suits intermediate lifters'], notes: [] },
      { id: 'tpl_barbell_strength_base', days: 3, reasons: ['Builds muscle too', '3 days a week, as you planned', 'Also suits intermediate lifters'], notes: [] },
    ],
  },
  {
    n: 6,
    label: 'Intermediate · muscle · full gym · 2',
    answers: { experience: 'intermediate', goal: 'muscle', equipment: full(), daysPerWeek: 2 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_full_body_foundations', days: 2, reasons: ['Builds muscle too', '2 days a week, as you planned', 'Also suits intermediate lifters'], notes: [] },
      { id: 'tpl_dumbbell_full_body', days: 2, reasons: ['Builds muscle too', '2 days a week, as you planned', 'Also suits intermediate lifters'], notes: [] },
      { id: 'tpl_barbell_strength_base', days: 3, reasons: ['Builds muscle too', 'Also suits intermediate lifters', 'Uses the equipment you have'], notes: ['Needs 3 days a week'] },
    ],
  },
  {
    n: 7,
    label: 'Intermediate · muscle · dumbbells only · 4',
    answers: { experience: 'intermediate', goal: 'muscle', equipment: ['dumbbell'], daysPerWeek: 4 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_dumbbell_full_body', days: 3, reasons: ['Builds muscle too', '3 days a week, fits your schedule', 'Also suits intermediate lifters'], notes: ['Also needs a bench'] },
      { id: 'tpl_calisthenics_strength', days: 4, reasons: ['Builds muscle too', '4 days a week, as you planned', 'Made for intermediate lifters'], notes: ['Also needs a bench, a pull-up bar, dip bars and a low bar or sturdy table'] },
      { id: 'tpl_bodyweight_starter', days: 3, reasons: ['Builds muscle too', '3 days a week, fits your schedule', 'No weights needed'], notes: ['Also needs a low bar or sturdy table'] },
    ],
    note: 'Nothing that needs a barbell, cable or machine.',
  },
  {
    n: 8,
    label: 'Advanced · strength · bodyweight only · 4',
    answers: { experience: 'advanced', goal: 'strength', equipment: ['bodyweight'], daysPerWeek: 4 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_calisthenics_strength', days: 4, reasons: ['Built to get you stronger', '4 days a week, as you planned', 'Also suits advanced lifters'], notes: ['Also needs a bench, a pull-up bar, dip bars and a low bar or sturdy table'] },
      { id: 'tpl_bodyweight_starter', days: 3, reasons: ['Builds strength too', '3 days a week, fits your schedule', 'No weights needed'], notes: ['Also needs a low bar or sturdy table'] },
    ],
  },
  {
    n: 9,
    label: 'Intermediate · strength · bodyweight only · 3',
    answers: { experience: 'intermediate', goal: 'strength', equipment: ['bodyweight'], daysPerWeek: 3 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_calisthenics_strength', days: 3, reasons: ['Built to get you stronger', '3 days a week, as you planned', 'Made for intermediate lifters'], notes: ['Also needs a bench, a pull-up bar, dip bars and a low bar or sturdy table'] },
      { id: 'tpl_bodyweight_starter', days: 3, reasons: ['Builds strength too', '3 days a week, as you planned', 'No weights needed'], notes: ['Also needs a low bar or sturdy table'] },
    ],
  },
  {
    n: 10,
    label: 'Beginner · mobility · full gym · 3',
    answers: { experience: 'beginner', goal: 'mobility', equipment: full(), daysPerWeek: 3 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_full_range_strength', days: 3, reasons: ['Built around full range of motion', '3 days a week, as you planned', 'Made for beginners'], notes: [] },
    ],
  },
  {
    n: 11,
    label: 'Intermediate · athletic · barbell and dumbbells · 3',
    answers: { experience: 'intermediate', goal: 'athletic', equipment: BARBELL_DUMBBELLS, daysPerWeek: 3 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_athletic_base', days: 3, reasons: ['Built for speed and power', '3 days a week, as you planned', 'Made for intermediate lifters'], notes: ['Also needs a squat rack, a bench, a pull-up bar and a box or step'] },
    ],
  },
  {
    n: 12,
    label: 'Beginner · athletic · full gym · 3',
    answers: { experience: 'beginner', goal: 'athletic', equipment: full(), daysPerWeek: 3 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_athletic_base', days: 3, reasons: ['Built for speed and power', '3 days a week, as you planned', 'Also suits beginners'], notes: [] },
    ],
  },
  {
    n: 13,
    label: 'Intermediate · general · full gym · 1',
    answers: { experience: 'intermediate', goal: 'general', equipment: full(), daysPerWeek: 1 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_strength_circuits', days: 2, reasons: ['Good all-round training', 'Made for intermediate lifters', 'Uses the equipment you have'], notes: ['Needs 2 days a week'] },
      { id: 'tpl_full_body_foundations', days: 2, reasons: ['Good all-round training', 'Also suits intermediate lifters', 'Uses the equipment you have'], notes: ['Needs 2 days a week'] },
      { id: 'tpl_dumbbell_full_body', days: 2, reasons: ['Good all-round training', 'Also suits intermediate lifters', 'Uses the equipment you have'], notes: ['Needs 2 days a week'] },
    ],
    note: 'No program runs 1 day a week, so each card says it needs 2.',
  },
  {
    n: 14,
    label: 'Advanced · muscle · full gym · 7',
    answers: { experience: 'advanced', goal: 'muscle', equipment: full(), daysPerWeek: 7 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_ppl', days: 6, reasons: ['Built for muscle growth', '6 days a week, fits your schedule', 'Made for advanced lifters'], notes: [] },
      { id: 'tpl_five_day_muscle', days: 5, reasons: ['Built for muscle growth', '5 days a week, fits your schedule', 'Also suits advanced lifters'], notes: [] },
      { id: 'tpl_upper_lower', days: 4, reasons: ['Builds muscle too', '4 days a week, fits your schedule', 'Also suits advanced lifters'], notes: [] },
    ],
  },
  {
    n: 15,
    label: 'Intermediate · strength · equipment skipped · 3',
    answers: { experience: 'intermediate', goal: 'strength', daysPerWeek: 3 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_big_three_block', days: 3, reasons: ['Built to get you stronger', '3 days a week, as you planned', 'Made for intermediate lifters'], notes: [] },
      { id: 'tpl_calisthenics_strength', days: 3, reasons: ['Built to get you stronger', '3 days a week, as you planned', 'Made for intermediate lifters'], notes: [] },
      { id: 'tpl_barbell_strength_base', days: 3, reasons: ['Built to get you stronger', '3 days a week, as you planned', 'Also suits intermediate lifters'], notes: [] },
    ],
    note: 'Equipment skipped: no equipment filter, and no equipment or gear lines.',
  },
  {
    n: 16,
    label: 'Everything skipped',
    answers: {  },
    heading: 'start',
    subtitle: 'You skipped the questions, so here are three common starting points. Browse them all in Plans.',
    picks: [
      { id: 'tpl_full_body_foundations', days: 3, reasons: [], notes: [] },
      { id: 'tpl_dumbbell_full_body', days: 3, reasons: [], notes: [] },
      { id: 'tpl_bodyweight_starter', days: 3, reasons: [], notes: [] },
    ],
    note: 'The first three programs in catalog order, default versions, no lines.',
  },
  {
    n: 17,
    label: 'Beginner · general · kettlebells only · 3',
    answers: { experience: 'beginner', goal: 'general', equipment: ['kettlebell'], daysPerWeek: 3 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_bodyweight_starter', days: 3, reasons: ['Good all-round training', '3 days a week, as you planned', 'Made for beginners'], notes: ['Also needs a low bar or sturdy table'] },
    ],
  },
  {
    n: 18,
    label: 'Beginner · athletic · bodyweight only · 3',
    answers: { experience: 'beginner', goal: 'athletic', equipment: ['bodyweight'], daysPerWeek: 3 },
    heading: 'closest',
    subtitle: 'No program built for athletic performance fits your answers, so these come closest.',
    picks: [
      { id: 'tpl_bodyweight_starter', days: 3, reasons: ['3 days a week, as you planned', 'Made for beginners', 'No weights needed'], notes: ['Also needs a low bar or sturdy table'] },
    ],
    note: 'Known gap: no athletic program without a barbell.',
  },
  {
    n: 19,
    label: 'Intermediate · athletic · bodyweight only · 3',
    answers: { experience: 'intermediate', goal: 'athletic', equipment: ['bodyweight'], daysPerWeek: 3 },
    heading: 'closest',
    subtitle: 'No program built for athletic performance fits your answers, so these come closest.',
    picks: [
      { id: 'tpl_calisthenics_strength', days: 3, reasons: ['3 days a week, as you planned', 'Made for intermediate lifters', 'No weights needed'], notes: ['Also needs a bench, a pull-up bar, dip bars and a low bar or sturdy table'] },
      { id: 'tpl_bodyweight_starter', days: 3, reasons: ['3 days a week, as you planned', 'No weights needed'], notes: ['Also needs a low bar or sturdy table'] },
    ],
    note: 'Known gap: no athletic program without a barbell.',
  },
  {
    n: 20,
    label: 'Only days answered: 1',
    answers: { daysPerWeek: 1 },
    heading: 'closest',
    subtitle: 'None of the plans fits every answer, so these come closest.',
    picks: [
      { id: 'tpl_full_body_foundations', days: 2, reasons: [], notes: ['Needs 2 days a week'] },
      { id: 'tpl_dumbbell_full_body', days: 2, reasons: [], notes: ['Needs 2 days a week'] },
      { id: 'tpl_bodyweight_starter', days: 2, reasons: [], notes: ['Needs 2 days a week'] },
    ],
    note: 'No check lines, so the heading is Closest plans.',
  },
  {
    n: 21,
    label: 'Intermediate · muscle · barbell only · 3',
    answers: { experience: 'intermediate', goal: 'muscle', equipment: ['barbell'], daysPerWeek: 3 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_barbell_strength_base', days: 3, reasons: ['Builds muscle too', '3 days a week, as you planned', 'Also suits intermediate lifters'], notes: ['Also needs a squat rack and a bench'] },
      { id: 'tpl_calisthenics_strength', days: 3, reasons: ['Builds muscle too', '3 days a week, as you planned', 'Made for intermediate lifters'], notes: ['Also needs a bench, a pull-up bar, dip bars and a low bar or sturdy table'] },
      { id: 'tpl_bodyweight_starter', days: 3, reasons: ['Builds muscle too', '3 days a week, as you planned', 'No weights needed'], notes: ['Also needs a low bar or sturdy table'] },
    ],
  },
  {
    n: 22,
    label: 'Intermediate · muscle · full gym · 5',
    answers: { experience: 'intermediate', goal: 'muscle', equipment: full(), daysPerWeek: 5 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_five_day_muscle', days: 5, reasons: ['Built for muscle growth', '5 days a week, as you planned', 'Made for intermediate lifters'], notes: [] },
      { id: 'tpl_upper_lower', days: 4, reasons: ['Builds muscle too', '4 days a week, fits your schedule', 'Made for intermediate lifters'], notes: [] },
      { id: 'tpl_full_body_foundations', days: 3, reasons: ['Builds muscle too', '3 days a week, fits your schedule', 'Also suits intermediate lifters'], notes: [] },
    ],
  },
  {
    n: 23,
    label: 'Advanced · athletic · full gym · 5',
    answers: { experience: 'advanced', goal: 'athletic', equipment: full(), daysPerWeek: 5 },
    heading: 'fit',
    subtitle: 'Based on your answers. Pick one to start, or build your own later in Plans.',
    picks: [
      { id: 'tpl_athletic_base', days: 3, reasons: ['Built for speed and power', '3 days a week, fits your schedule', 'Also suits advanced lifters'], notes: [] },
      { id: 'tpl_strength_circuits', days: 3, reasons: ['Adds speed and power work', '3 days a week, fits your schedule', 'Also suits advanced lifters'], notes: [] },
    ],
  },
];

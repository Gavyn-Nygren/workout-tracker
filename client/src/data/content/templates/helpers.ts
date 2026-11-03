import { defaultPreferences } from '../../preferences';
import { fixedFromPattern, weeklyFromPattern } from '../../schedule';
import type {
  BlockType,
  Exercise,
  ID,
  PlannedBlock,
  PlannedExercise,
  PlanSchedule,
  PlanWorkout,
  ProgressionRule,
  SetModifier,
  SetPrescription,
  StarterTemplate,
  TemplateDayOption,
  Weekday,
} from '../../types';
import { lbToKg } from '../../units';
import { BUILTIN_EXERCISES } from '../exercises';

/**
 * Building blocks for the starter catalog (G3.13). Pure: tests, the validator and the review page
 * import the templates built with these.
 *
 * How a program file reads:
 *
 *   const a = workout('tw_fbf_a', 'Full Body A', [
 *     single(ex('ex_goblet_squat', [warmups([8]), working(3, [8, 12])], { rule: rr(5) })),
 *     superset(60, ex('ex_lateral_raise', working(2, [10, 20]), { rule: rr(5) }), ex('ex_plank', hold(2, 30))),
 *   ]);
 *   ...versions(version(3, weekly({ mon: a, wed: b, fri: c })), version(2, weekly({ mon: a, thu: b }))),
 *
 * The rules every set follows here:
 * - Rest is never set (blank means Auto: the remembered rest, then the Settings default). Pacing
 *   comes from the round and transition rests of supersets and circuits.
 * - Loads are never set, warm-ups included: warm-ups pre-fill at about half of last time's
 *   working weight, and a typed target would switch progression off. A weighted lift with two
 *   warm-ups gets RAMP_NOTE, since both pre-fill at the same weight.
 *
 * Ids: each program picks a short prefix (fbf, dbf, ...) and names its workouts
 * 'tw_<prefix>_<key>'. `workout()` derives every block and exercise id from that, so ids are
 * unique within the template and across the catalog. Plans copied from a template get fresh ids.
 */

const LIBRARY: ReadonlyMap<ID, Exercise> = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));

/** The category of a built-in exercise; an unknown id counts as compound (the validator reports it). */
const categoryOf = (exerciseId: ID): Exercise['category'] => LIBRARY.get(exerciseId)?.category ?? 'compound';

// ---------------------------------------------------------------------------
// Sets

/** The effort target on working sets unless a line says otherwise: 2 reps in reserve. */
export const DEFAULT_RIR = 2;

/** A rep target: exact (5) or a range ([8, 12]). */
export type Reps = number | readonly [min: number, max: number];

export type WorkingOptions = {
  /** Reps in reserve; null for no effort target (jump, power and weekly-% sets). Default 2. */
  rir?: number | null;
  /** Eccentric-pause-concentric-pause, e.g. '3-1-1-0'. */
  tempo?: string;
  modifiers?: SetModifier[];
};

const repTarget = (reps: Reps): SetPrescription['targetReps'] => (typeof reps === 'number' ? reps : { min: reps[0], max: reps[1] });

/** `count` working sets of `reps` (5, or [8, 12] for a range) at RIR 2 unless `opts.rir` says otherwise. */
export function working(count: number, reps: Reps, opts: WorkingOptions = {}): SetPrescription[] {
  const rir = opts.rir === undefined ? DEFAULT_RIR : opts.rir;
  return Array.from({ length: count }, () => ({
    kind: 'normal' as const,
    modifiers: [...(opts.modifiers ?? [])],
    targetReps: repTarget(reps),
    ...(rir === null ? {} : { targetRir: rir }),
    ...(opts.tempo ? { tempo: opts.tempo } : {}),
  }));
}

/** Warm-up sets with these reps, at most 2 and falling ([8, 3]); load blank, so they pre-fill at about half last time's weight. */
export function warmups(reps: readonly [number] | readonly [number, number]): SetPrescription[] {
  return reps.map((r) => ({ kind: 'warmup' as const, modifiers: [], targetReps: r }));
}

/** `count` timed holds of `seconds` each: no reps, load or effort target. */
export function hold(count: number, seconds: number): SetPrescription[] {
  return Array.from({ length: count }, () => ({ kind: 'timed_hold' as const, modifiers: [], targetDurationSec: seconds }));
}

/** One drop set to failure of about `reps`, after the last working set. */
export function drop(reps: number): SetPrescription[] {
  return [{ kind: 'drop', modifiers: ['to_failure'], targetReps: reps }];
}

// ---------------------------------------------------------------------------
// Progression rules

/** A rule waiting for its exercise: the planned-exercise helper `ex()` resolves it by category. */
export type RuleSpec = (category: Exercise['category']) => ProgressionRule;

/**
 * Rep range: when every set reaches the top of the range, add `stepLb` (stored as lbToKg; labels
 * show the equipment's real step). On a miss, compound lifts deload 10% after 3 misses in a row and
 * isolation lifts repeat the weight.
 */
export function rr(stepLb: 5 | 10): RuleSpec {
  return (category) => ({
    type: 'rep_range',
    incrementKg: lbToKg(stepLb),
    onMiss: category === 'compound' ? { type: 'deload', afterConsecutiveMisses: 3, percent: 10 } : { type: 'repeat' },
  });
}

/** Weekly %, for fixed programs only: up `percent` each week, and a 10% deload after 2 misses in a row. */
export function pct(percent: 2.5): RuleSpec {
  return () => ({ type: 'percent_weekly', percent, onMiss: { type: 'deload', afterConsecutiveMisses: 2, percent: 10 } });
}

// ---------------------------------------------------------------------------
// One side at a time

export type Side = 'leg' | 'arm' | 'side';

/**
 * Built-in exercises done one side at a time, with what the reps (or the hold) count per. `ex()`
 * adds the matching note ("Reps are per leg.") and the estimate doubles their work time. Walking
 * lunges count every step, and alternating snatches count both arms, so they aren't listed.
 */
export const ONE_SIDE: Readonly<Record<ID, Side>> = {
  ex_reverse_lunge: 'leg',
  ex_reverse_lunge_bb: 'leg',
  ex_reverse_lunge_bw: 'leg',
  ex_forward_lunge: 'leg',
  ex_forward_lunge_bb: 'leg',
  ex_curtsy_lunge: 'leg',
  ex_split_squat: 'leg',
  ex_split_squat_bw: 'leg',
  ex_bulgarian_split_squat: 'leg',
  ex_bulgarian_split_squat_bb: 'leg',
  ex_bulgarian_split_squat_smith: 'leg',
  ex_bulgarian_split_squat_bw: 'leg',
  ex_step_up: 'leg',
  ex_step_up_bb: 'leg',
  ex_pistol_squat: 'leg',
  ex_single_leg_press: 'leg',
  ex_single_leg_extension: 'leg',
  ex_single_leg_rdl: 'leg',
  ex_single_leg_hip_thrust: 'leg',
  ex_single_leg_calf_raise: 'leg',
  ex_lateral_lunge: 'side',
  ex_cossack_squat: 'side',
  ex_lateral_bound: 'side',
  ex_db_row: 'arm',
  ex_kb_row: 'arm',
  ex_single_arm_cable_row: 'arm',
  ex_single_arm_pulldown: 'arm',
  ex_single_arm_pushdown: 'arm',
  ex_concentration_curl: 'arm',
  ex_kb_swing_single: 'arm',
  ex_side_plank: 'side',
  ex_copenhagen_plank: 'side',
  ex_dead_bug: 'side',
  ex_bird_dog: 'side',
  ex_cable_woodchop: 'side',
  ex_pallof_press: 'side',
  ex_turkish_get_up: 'side',
  ex_kb_windmill: 'side',
  ex_suitcase_carry: 'side',
};

const sideNote = (side: Side, holds: boolean) => (holds ? `Time is per ${side}.` : `Reps are per ${side}.`);
const SIDE_NOTES = (['leg', 'arm', 'side'] as const).flatMap((side) => [sideNote(side, false), sideNote(side, true)]);

/** Whether a planned exercise's notes say it's done per side (the note `ex()` adds), which doubles its time. */
export function isPerSide(notes: string | undefined): boolean {
  return !!notes && SIDE_NOTES.some((n) => notes.includes(n));
}

// ---------------------------------------------------------------------------
// Warm-ups

/**
 * Added first to a weighted lift with two warm-ups. Both pre-fill at about half of last time's
 * working weight (buildSession.ts), so the lifter raises the second one by hand.
 */
export const RAMP_NOTE = 'Make the second warm-up heavier.';

/** Whether a lift gets RAMP_NOTE: two warm-ups on a built-in exercise that isn't bodyweight. */
function ramps(exerciseId: ID, sets: readonly SetPrescription[]): boolean {
  const exercise = LIBRARY.get(exerciseId);
  return !!exercise && !exercise.isBodyweight && sets.filter((s) => s.kind === 'warmup').length >= 2;
}

// ---------------------------------------------------------------------------
// Planned exercises and blocks

/** A planned exercise before `workout()` gives it an id. */
export type ExerciseSpec = Omit<PlannedExercise, 'id'>;

export type ExerciseOptions = {
  rule?: RuleSpec;
  /** Shown above the sets during the workout, after the warm-up note and before the per-side note. */
  notes?: string;
  /** Per side or not, overriding ONE_SIDE (false: the reps count both sides). */
  side?: Side | false;
};

/**
 * A planned exercise: its sets (groups like [warmups([8]), working(3, [8, 12])] are flattened in
 * order), the rule resolved by the exercise's category, and notes, in the order the sets are
 * done: RAMP_NOTE on a weighted lift with two warm-ups, then `opts.notes`, then the per-side note
 * for exercises done one side at a time.
 */
export function ex(exerciseId: ID, sets: readonly (SetPrescription | readonly SetPrescription[])[], opts: ExerciseOptions = {}): ExerciseSpec {
  const flat = sets.flatMap((s) => (Array.isArray(s) ? (s as readonly SetPrescription[]) : [s as SetPrescription]));
  const listed = Object.prototype.hasOwnProperty.call(ONE_SIDE, exerciseId) ? ONE_SIDE[exerciseId] : undefined;
  const side = opts.side === undefined ? listed : opts.side || undefined;
  const holds = flat.some((s) => s.kind === 'timed_hold');
  const notes = [ramps(exerciseId, flat) ? RAMP_NOTE : undefined, opts.notes, side ? sideNote(side, holds) : undefined].filter(Boolean).join(' ');
  return {
    exerciseId,
    sets: flat,
    ...(opts.rule ? { progression: opts.rule(categoryOf(exerciseId)) } : {}),
    ...(notes ? { notes } : {}),
  };
}

/** A block before `workout()` gives it ids. */
export type BlockSpec = Omit<PlannedBlock, 'id' | 'exercises'> & { exercises: ExerciseSpec[] };

/** Straight sets of one exercise. */
export function single(exercise: ExerciseSpec): BlockSpec {
  return { type: 'single', exercises: [exercise] };
}

/** Two exercises alternated set by set, resting `roundRestSec` after each round. */
export function superset(roundRestSec: number, a: ExerciseSpec, b: ExerciseSpec): BlockSpec {
  return { type: 'superset', roundRestSec, exercises: [a, b] };
}

/** Three or more exercises in rounds: `transitionRestSec` between exercises, `roundRestSec` after each round. */
export function circuit(roundRestSec: number, transitionRestSec: number, a: ExerciseSpec, b: ExerciseSpec, c: ExerciseSpec, ...more: ExerciseSpec[]): BlockSpec {
  return { type: 'circuit', roundRestSec, ...(transitionRestSec > 0 ? { transitionRestSec } : {}), exercises: [a, b, c, ...more] };
}

// ---------------------------------------------------------------------------
// Time estimate

/** Work time per set, doubled for one side at a time; holds count their own time. */
export const WORK_SEC_PER_SET = 40;
/** Getting set up and moving between exercises, added once. */
export const SETUP_MIN = 5;

/** What the estimate reads: plain blocks, built (PlannedBlock) or not (BlockSpec). */
export type EstimateBlock = {
  type: BlockType;
  roundRestSec?: number;
  transitionRestSec?: number;
  exercises: readonly { exerciseId: ID; sets: readonly SetPrescription[]; notes?: string }[];
};

/**
 * A workout's minutes: estimateSeconds() plus 5 minutes, rounded to the nearest 5. What the
 * catalog's `estimatedMinutes` must equal (the validator recomputes it).
 */
export function estimateMinutes(blocks: readonly EstimateBlock[], exercisesById: ReadonlyMap<ID, Pick<Exercise, 'category'>>): number {
  return Math.round((estimateSeconds(blocks, exercisesById) / 60 + SETUP_MIN) / 5) * 5;
}

/**
 * The time the sets and rests take, from the Settings default rests (compound 3:00, isolation
 * 1:30, warm-up 1:00) as the rest timer applies them:
 * - every set is 40 s of work (80 s one side at a time; a hold its time, doubled per side);
 * - straight sets add their default rest after each set (warm-ups the warm-up rest);
 * - supersets and circuits add each round's work, a transition between exercises and the round
 *   rest after it (any warm-ups in them count as straight sets).
 */
export function estimateSeconds(blocks: readonly EstimateBlock[], exercisesById: ReadonlyMap<ID, Pick<Exercise, 'category'>>): number {
  const rests = defaultPreferences.restDefaultsSec;
  let sec = 0;
  for (const block of blocks) {
    const grouped = block.type === 'superset' || block.type === 'circuit';
    const entries = block.exercises.map((e) => ({
      work: (s: SetPrescription) => (s.kind === 'timed_hold' ? (s.targetDurationSec ?? WORK_SEC_PER_SET) : WORK_SEC_PER_SET) * (isPerSide(e.notes) ? 2 : 1),
      rest: (s: SetPrescription) => (s.kind === 'warmup' ? rests.warmup : rests[exercisesById.get(e.exerciseId)?.category ?? 'compound']),
      sets: e.sets,
      working: e.sets.filter((s) => s.kind !== 'warmup'),
    }));
    for (const e of entries) {
      for (const s of e.sets) if (!grouped || s.kind === 'warmup') sec += e.work(s) + e.rest(s);
    }
    if (!grouped) continue;
    const rounds = Math.max(0, ...entries.map((e) => e.working.length));
    for (let round = 0; round < rounds; round++) {
      const sets = entries.flatMap((e) => (e.working[round] ? [{ e, s: e.working[round] }] : []));
      sec += sets.reduce((sum, { e, s }) => sum + e.work(s), 0);
      sec += Math.max(0, sets.length - 1) * (block.transitionRestSec ?? 0);
      sec += block.roundRestSec ?? rests.compound;
    }
  }
  return sec;
}

// ---------------------------------------------------------------------------
// Workouts

/**
 * A workout: block ids 'tb_<key>_<n>' and exercise ids 'tp_<key>_<n>_<m>' from its id
 * 'tw_<key>', and `estimatedMinutes` from estimateMinutes() over the built-in library.
 */
export function workout(id: ID, name: string, blocks: readonly BlockSpec[]): PlanWorkout {
  const key = id.startsWith('tw_') ? id.slice(3) : id;
  // A deep copy, so specs reused across workouts share nothing.
  const built: PlannedBlock[] = (JSON.parse(JSON.stringify(blocks)) as BlockSpec[]).map((block, i) => ({
    id: `tb_${key}_${i + 1}`,
    ...block,
    exercises: block.exercises.map((e, j) => ({ id: `tp_${key}_${i + 1}_${j + 1}`, ...e })),
  }));
  return { id, name, estimatedMinutes: estimateMinutes(built, LIBRARY), blocks: built };
}

// ---------------------------------------------------------------------------
// Schedules and day versions

export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** A week: which workout (or workouts) each day has, e.g. { mon: a, wed: b, fri: c }. */
export type Week = Partial<Record<Day, PlanWorkout | readonly PlanWorkout[]>>;

const WEEKDAY: Record<Day, Weekday> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

function pattern(week: Week): Record<Weekday, string[]> {
  const out = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] } as Record<Weekday, string[]>;
  for (const [day, value] of Object.entries(week) as [Day, PlanWorkout | readonly PlanWorkout[] | undefined][]) {
    if (!value) continue;
    const workouts: readonly PlanWorkout[] = Array.isArray(value) ? value : [value as PlanWorkout];
    out[WEEKDAY[day]] = workouts.map((w) => w.id);
  }
  return out;
}

/** A weekly (ongoing) schedule. */
export function weekly(week: Week): PlanSchedule {
  return weeklyFromPattern(pattern(week));
}

/** A fixed-length program of `weeks` weeks; every week repeats this week's pattern. */
export function fixed(weeks: number, week: Week): PlanSchedule {
  return fixedFromPattern(weeks, pattern(week));
}

/** One "days a week" version of a template. */
export function version(daysPerWeek: number, schedule: PlanSchedule): TemplateDayOption {
  return { daysPerWeek, schedule };
}

/** A template's schedule fields from its versions, default first: `daysPerWeek`, `schedule`, and `otherDays` when there are more. */
export function versions(main: TemplateDayOption, ...others: TemplateDayOption[]): Pick<StarterTemplate, 'daysPerWeek' | 'schedule' | 'otherDays'> {
  return { daysPerWeek: main.daysPerWeek, schedule: main.schedule, ...(others.length ? { otherDays: others } : {}) };
}

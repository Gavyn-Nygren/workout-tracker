import { builtinExercises } from '../content';
import type { Exercise, ID, Plan, PlannedBlock, PlannedExercise, SetPrescription } from '../types';
import { nowISO, putRow } from './rows';
import type { SqlDb } from './sql';

/**
 * A one-time cleanup for G3.8 (user's pick: "Leave plan rest blank"). Before it, the app filled a
 * rest into every plan set it made, so plan workouts never used the exercise's remembered rest or
 * the defaults in Settings. New plans now leave rest blank; this clears the rests the app filled
 * into plans made before, and keeps the ones the user typed.
 *
 * A plan's saved versions show where each planned exercise came from, and so which rests the app
 * gave it. Outside supersets and circuits, a working set's rest is cleared when it's the one the
 * planned exercise got when it first appeared:
 * - In the first version of a plan made from a starter template (or the sample data): the rest it
 *   was copied with. "Use template" saved that version straight away, so nothing in it was typed.
 * - Otherwise (Add exercise): 2:30 compound or 1:30 isolation, if it had that in the version it
 *   first appears in. (Exercises the workout summary added had no rest.)
 * - Already there in the earliest saved version, when that isn't the plan's first (a plan edited
 *   before G3.3 kept only its latest version): a guess from the exercise alone, the new-exercise
 *   default for its type and, in a plan made from a template (or the sample data), the rest the
 *   template gave it. Exercises it was swapped from count too.
 * Whatever it came from, a rest is also cleared when it's:
 * - A warm-up at 1:00: "Add warm-up" and every starter warm-up.
 * - Once a saved version had it in a superset or circuit and it's on its own again (ungrouped):
 *   any set at that superset's round rest, which ungrouping filled in (1:30 when it had none).
 * - Left as the app filled it from one saved version to the next, in the same place, also when the
 *   set-type sheet changed only its type (a filled 2:30 set turned into a warm-up, or a 1:00
 *   warm-up turned into a working set).
 * - 0, which always meant "no plan rest".
 * "Add set" copies the last set, so its copies count the same.
 *
 * Working sets in a superset or circuit keep any other rest: the app always set those to 0, so one
 * was typed. A typed rest equal to one the app gave that planned exercise can't be told apart and
 * is cleared; it then rests like the exercise does.
 *
 * Every live plan and every saved version is cleaned, each judged by the versions up to it, so
 * workouts built from any version agree. Sessions are never touched: logged sets keep the targets
 * they were done with.
 */

/** The meta key recording that the cleanup ran (its value: when). */
export const BLANK_PLAN_RESTS_META_KEY = 'blank_plan_rests_at';

/** "Add warm-up" and every starter warm-up. */
const OLD_WARMUP_REST_SEC = 60;
/** `defaultSets` by exercise type; an exercise added without a type got the compound one. */
const OLD_NEW_EXERCISE_REST_SEC: Record<Exercise['category'], number> = { compound: 150, isolation: 90 };
/** What ungrouping filled in when the superset had no round rest; also the round rest a new superset got. */
const OLD_UNGROUP_REST_SEC = 90;

/**
 * The rest each starter template gave an exercise's working sets before G3.8, frozen from
 * src/data/fake/plans.ts at commit 03b0756. Exercises in a template superset or circuit (whose
 * sets had 0) are listed with the round rest, which is what ungrouping them filled in. No exercise
 * appeared twice in a template with different rests.
 */
export const LEGACY_TEMPLATE_RESTS_SEC: Readonly<Record<ID, Readonly<Record<ID, number>>>> = {
  tpl_upper_lower: {
    ex_bench_press: 180,
    ex_barbell_row: 150,
    ex_overhead_press: 150,
    ex_db_curl: 90, // superset, round rest
    ex_triceps_pushdown: 90, // superset, round rest
    ex_back_squat: 180,
    ex_rdl: 150,
    ex_bulgarian_split_squat: 90,
    ex_lying_leg_curl: 90,
    ex_pull_up: 150,
    ex_incline_db_press: 120,
    ex_seated_cable_row: 90,
    ex_lateral_raise: 60, // its drop set too
    ex_deadlift: 210,
    ex_front_squat: 150,
    ex_leg_press: 120,
    ex_leg_extension: 60,
  },
  tpl_ppl: {
    ex_bench_press: 150,
    ex_incline_db_press: 120,
    ex_overhead_press: 120,
    ex_lateral_raise: 75, // superset, round rest
    ex_triceps_pushdown: 75, // superset, round rest
    ex_pull_up: 150,
    ex_barbell_row: 120,
    ex_lat_pulldown: 90,
    ex_face_pull: 75, // superset, round rest
    ex_db_curl: 75, // superset, round rest
    ex_back_squat: 180,
    ex_rdl: 150,
    ex_leg_press: 120,
    ex_lying_leg_curl: 90,
    ex_standing_calf_raise: 60,
  },
  tpl_powerbuilding: {
    ex_back_squat: 180,
    ex_bench_press: 180,
    ex_barbell_row: 120,
    ex_overhead_press: 150,
    ex_deadlift: 210,
  },
  tpl_calisthenics: {
    ex_push_up: 120, // circuit, round rest
    ex_reverse_lunge: 120, // circuit, round rest
    ex_plank: 120, // circuit, round rest
    ex_pull_up: 120,
    ex_dips: 120,
    ex_bulgarian_split_squat: 90,
    ex_hanging_leg_raise: 60,
  },
};

/**
 * The sample plan that wasn't made from a template, by plan id, frozen the same way. (The other
 * sample plan, plan_upper_lower, has tpl_upper_lower's workouts and templateId.)
 */
export const LEGACY_SAMPLE_PLAN_RESTS_SEC: Readonly<Record<ID, Readonly<Record<ID, number>>>> = {
  plan_calves_core: {
    ex_standing_calf_raise: 60,
    ex_seated_calf_raise: 90, // circuit, round rest
    ex_hanging_leg_raise: 90, // circuit, round rest
    ex_plank: 90, // circuit, round rest
  },
};

/**
 * The version each sample plan was seeded at (the same since G3.1). Every other plan starts at
 * version 1.
 */
const SAMPLE_PLAN_FIRST_VERSION: ReadonlyMap<ID, number> = new Map([
  ['plan_upper_lower', 2],
  ['plan_calves_core', 1],
]);

export type CategoryOf = (exerciseId: ID) => Exercise['category'] | undefined;

/** A set as a saved version had it, and whether its rest was one the app filled in. */
type SeenSet = { set: SetPrescription; filled: boolean };

/** What the versions so far show about one planned exercise. */
type PlannedHistory = {
  /** The rests the app gave its warm-ups. */
  warmupFills: Set<number>;
  /**
   * The rests the app gave its other sets outside supersets and circuits; undefined when it's
   * older than the saved versions, so they're guessed from its exercises.
   */
  workingFills: Set<number> | undefined;
  /** Every exercise it has been (swaps keep the planned exercise and its sets). */
  exerciseIds: Set<ID>;
  /** What ungrouping it filled in: the round rests of the supersets and circuits it has been in. */
  roundRests: Set<number>;
  /** Its sets in the last version judged. */
  last: SeenSet[];
};

type Judge = {
  /** The rest a template gave each exercise, for planned exercises older than the saved versions. */
  legacy: Readonly<Record<ID, number>> | undefined;
  categoryOf: CategoryOf;
};

const isGrouped = (block: PlannedBlock) => block.type === 'superset' || block.type === 'circuit';
const isPositive = (rest: unknown): rest is number => typeof rest === 'number' && rest > 0;
/** A saved version's sets; one in an unexpected shape counts as none. */
const setsOf = (planned: PlannedExercise): SetPrescription[] => (Array.isArray(planned.sets) ? planned.sets : []);
const addedRest = (exerciseId: ID, categoryOf: CategoryOf) => OLD_NEW_EXERCISE_REST_SEC[categoryOf(exerciseId) ?? 'compound'];

/** Whether a working set's rest, outside supersets and circuits, is one the app gave this planned exercise. */
function workingFill(rest: number, history: PlannedHistory, { legacy, categoryOf }: Judge): boolean {
  if (history.workingFills) return history.workingFills.has(rest);
  return [...history.exerciseIds].some((id) => addedRest(id, categoryOf) === rest || legacy?.[id] === rest);
}

/** Whether a set's rest is one the app filled in (or 0, "no plan rest"), going by its value. */
function filledByValue(set: SetPrescription, grouped: boolean, history: PlannedHistory, judge: Judge): boolean {
  const rest = set.restSec;
  if (typeof rest !== 'number') return false;
  if (rest <= 0) return true;
  if (set.kind === 'warmup' && history.warmupFills.has(rest)) return true;
  // The app set every working-set rest in a superset or circuit to 0, so a positive one was typed.
  if (grouped) return false;
  if (set.kind !== 'warmup' && workingFill(rest, history, judge)) return true;
  // Ungrouped: every set got its own rest, else the round rest, else 1:30.
  return history.roundRests.has(rest);
}

/** Whether two sets differ in nothing but their type, as when the set-type sheet changed one. */
function sameApartFromKind(a: SetPrescription, b: SetPrescription): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof SetPrescription)[]);
  keys.delete('kind');
  return [...keys].every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

/**
 * Whether a set kept the rest the app filled into the set in its place in the version before. A
 * changed type counts only when nothing else changed, so a set that moved up into the place of a
 * deleted one isn't mistaken for it.
 */
function keptFill(set: SetPrescription, before: SeenSet | undefined): boolean {
  if (!before?.filled || before.set.restSec !== set.restSec) return false;
  return before.set.kind === set.kind || sameApartFromKind(before.set, set);
}

/**
 * The plan with the rests the app filled in left blank, and how many it cleared. `versions` is
 * every saved version of the plan (it may include this one). The ones before this plan's version
 * show where each planned exercise came from, what it was swapped from, and whether it was ever
 * in a superset. Returns the same plan when nothing was cleared.
 */
export function blankAutoFilledRests(plan: Plan, versions: readonly Plan[], categoryOf: CategoryOf): { plan: Plan; cleared: number } {
  const earlier = versions.filter((v) => v.version < plan.version).sort((a, b) => a.version - b.version);
  const first = earlier[0] ?? plan;
  // Whether the saved versions reach back to the plan's first one.
  const complete = first.version === (SAMPLE_PLAN_FIRST_VERSION.get(plan.id) ?? 1);
  const copied = complete && (Boolean(first.templateId) || SAMPLE_PLAN_FIRST_VERSION.has(plan.id));
  const judge: Judge = { legacy: (plan.templateId ? LEGACY_TEMPLATE_RESTS_SEC[plan.templateId] : undefined) ?? LEGACY_SAMPLE_PLAN_RESTS_SEC[plan.id], categoryOf };
  const history = new Map<ID, PlannedHistory>();

  /** The rests the app gave a planned exercise, from the version it first appears in. */
  const firstSeen = (planned: PlannedExercise, inFirstVersion: boolean): PlannedHistory => {
    const seen: PlannedHistory = { warmupFills: new Set([OLD_WARMUP_REST_SEC]), workingFills: new Set(), exerciseIds: new Set(), roundRests: new Set(), last: [] };
    if (inFirstVersion && !complete) {
      seen.workingFills = undefined;
    } else if (inFirstVersion && copied) {
      for (const set of setsOf(planned)) if (isPositive(set.restSec)) (set.kind === 'warmup' ? seen.warmupFills : seen.workingFills)?.add(set.restSec);
    } else {
      const added = addedRest(planned.exerciseId, categoryOf);
      if (setsOf(planned).some((s) => s.kind !== 'warmup' && s.restSec === added)) seen.workingFills?.add(added);
    }
    return seen;
  };

  /** Which of a planned exercise's sets have a rest the app filled in; remembers what this version shows. */
  const judgeSets = (planned: PlannedExercise, block: PlannedBlock, inFirstVersion: boolean): boolean[] => {
    const known = history.get(planned.id) ?? firstSeen(planned, inFirstVersion);
    known.exerciseIds.add(planned.exerciseId);
    const grouped = isGrouped(block);
    const sets = setsOf(planned);
    const filled = sets.map((set, i) => filledByValue(set, grouped, known, judge) || keptFill(set, known.last[i]));
    if (grouped) known.roundRests.add(block.roundRestSec || OLD_UNGROUP_REST_SEC);
    known.last = sets.map((set, i) => ({ set, filled: filled[i] }));
    history.set(planned.id, known);
    return filled;
  };

  earlier.forEach((version, step) => {
    for (const workout of version.workouts ?? []) for (const block of workout.blocks ?? []) for (const planned of block.exercises ?? []) judgeSets(planned, block, step === 0);
  });

  let cleared = 0;
  const workouts = plan.workouts.map((workout) => ({
    ...workout,
    blocks: workout.blocks.map((block) => ({
      ...block,
      exercises: block.exercises.map((planned) => {
        const filled = judgeSets(planned, block, earlier.length === 0);
        return {
          ...planned,
          sets: planned.sets.map((set, i) => {
            if (!filled[i]) return set;
            cleared++;
            const { restSec: _, ...blank } = set;
            return blank;
          }),
        };
      }),
    })),
  }));
  return cleared ? { plan: { ...plan, workouts }, cleared } : { plan, cleared };
}

export type BlankRestsResult = {
  /** Plans rows rewritten. */
  plans: number;
  /** Plan version rows rewritten. */
  versions: number;
  /** Set rests cleared across both. */
  sets: number;
};

function parse<T>(json: string): T | undefined {
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

const metaValue = (db: SqlDb, key: string) => db.getFirstSync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])?.value;

/**
 * Runs the cleanup once per database, at repository creation (after `migrate`). Later runs, and
 * runs on a database created after G3.8 (nothing to clear), only find the meta key and return
 * null. Rows are rewritten the way any write is: new `updated_at` and an outbox entry, so a later
 * sync carries the change. Sample data stays out of the outbox, like the rest of it.
 */
export function blankAutoFilledPlanRests(db: SqlDb, at: string = nowISO()): BlankRestsResult | null {
  if (metaValue(db, BLANK_PLAN_RESTS_META_KEY) !== undefined) return null;
  const result: BlankRestsResult = { plans: 0, versions: 0, sets: 0 };

  db.withTransactionSync(() => {
    const lastSeq = db.getFirstSync<{ seq: number | null }>('SELECT MAX(seq) AS seq FROM outbox', [])?.seq ?? 0;

    const categories = new Map<ID, Exercise['category']>(builtinExercises.map((e) => [e.id, e.category]));
    // Deleted custom exercises too: a plan may still use one.
    for (const row of db.getAllSync<{ data: string }>('SELECT data FROM custom_exercises', [])) {
      const exercise = parse<Exercise>(row.data);
      if (exercise?.id && exercise.category) categories.set(exercise.id, exercise.category);
    }
    const categoryOf: CategoryOf = (id) => categories.get(id);

    const plans = db
      .getAllSync<{ id: string; status: string; data: string }>('SELECT id, status, data FROM plans WHERE deleted_at IS NULL', [])
      .map((row) => ({ ...row, plan: parse<Plan>(row.data) }));
    const versions = db
      .getAllSync<{ id: string; plan_id: string; version: number; data: string }>('SELECT id, plan_id, version, data FROM plan_versions WHERE deleted_at IS NULL', [])
      .map((row) => ({ ...row, plan: parse<Plan>(row.data) }));
    const versionsOf = new Map<ID, Plan[]>();
    for (const row of versions) if (row.plan) versionsOf.set(row.plan_id, [...(versionsOf.get(row.plan_id) ?? []), row.plan]);

    /** The plan with filled-in rests cleared, or undefined when there's nothing to clear (or it can't be read). */
    const cleaned = (plan: Plan | undefined, planId: ID): Plan | undefined => {
      if (!plan || !Array.isArray(plan.workouts)) return undefined;
      try {
        const { plan: blank, cleared } = blankAutoFilledRests(plan, versionsOf.get(planId) ?? [], categoryOf);
        if (!cleared) return undefined;
        result.sets += cleared;
        return { ...blank, updatedAt: at };
      } catch {
        // A row in an unexpected shape is left as it is rather than stopping the app from opening.
        return undefined;
      }
    };

    for (const row of plans) {
      const plan = cleaned(row.plan, row.id);
      if (plan && putRow(db, 'plans', row.id, plan, { status: row.status }, at)) result.plans++;
    }
    for (const row of versions) {
      const plan = cleaned(row.plan, row.plan_id);
      if (plan && putRow(db, 'plan_versions', row.id, plan, { plan_id: row.plan_id, version: row.version }, at)) result.versions++;
    }

    // Sample data is never queued to sync (see sampleData.ts).
    if (metaValue(db, 'contents') === 'sample') db.runSync('DELETE FROM outbox WHERE seq > ?', [lastSeq]);
    db.runSync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [BLANK_PLAN_RESTS_META_KEY, at]);
  });
  return result;
}

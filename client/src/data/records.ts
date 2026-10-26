// Personal records (spec 2.7), unit-tested in tests/calculations.test.ts (roadmap G3.6).
//
// - Only working sets count: no warm-ups, no partial-rep sets; e1RM only for 12 reps or fewer.
// - Timed holds only count for their own "longest hold" record.
// - Bodyweight lifts compare added load (or less assistance) for heaviest weight and reps at a weight.
// - An exercise's first workout sets its baselines; records come from beating them later.
// - Each workout makes at most one record per exercise and type (and per load for reps): its best,
//   compared with the best from before that workout.
import { countsForPRs, effectiveLoadKg, recordLoadKg, setE1RM } from './calculations';
import type { Exercise, LoggedSet, PersonalRecord, PRType, WorkoutSession } from './types';

/**
 * Differences smaller than these are the same value, so kg↔lb rounding (a unit switch, or 220.5 lb
 * vs 100 kg) never makes a record. Reps and seconds are whole numbers.
 */
const TOLERANCE: Record<PRType, number> = { heaviest_weight: 0.05, e1rm: 0.05, volume: 0.5, reps_at_weight: 0, longest_hold: 0 };

/** "Most reps at a given weight" groups loads to the nearest 0.05 kg, for the same reason. */
const loadBucket = (kg: number) => Math.round(kg * 20);

/** The best so far for one record key: the value and the set that achieved it. */
export type RecordBest = Omit<PersonalRecord, 'id' | 'previousValue'>;

/** Best value for each record key (exercise and type, plus the load for reps at a weight). */
export type RecordBests = Map<string, RecordBest>;

/**
 * Added-load and total-load bests are kept apart, so a custom exercise whose "Counts bodyweight"
 * setting changed after logging never compares +20 kg against 100 kg.
 */
function recordKey(exerciseId: string, type: PRType, atLoadKg?: number, addedLoad?: boolean): string {
  const base = `${exerciseId}:${type}${addedLoad ? '+bw' : ''}`;
  return atLoadKg === undefined ? base : `${base}@${loadBucket(atLoadKg)}`;
}

const beats = (value: number, best: number, type: PRType) => value > best + TOLERANCE[type] + 1e-9;

type Completion = Pick<WorkoutSession, 'completedAt' | 'completedDate'>;
const byCompletion = (a: Completion, b: Completion) =>
  (a.completedAt ?? a.completedDate ?? '').localeCompare(b.completedAt ?? b.completedDate ?? '');

function finished(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessions.filter((s) => s.status === 'completed' && s.completedDate).sort(byCompletion);
}

/**
 * Each record key's best within one workout (the first set to reach it, on ties), in the order the
 * keys first appear. Completed sets count even in an exercise skipped afterwards.
 */
function workoutBests(session: WorkoutSession, exercisesById: Map<string, Exercise>): [string, RecordBest][] {
  const bests = new Map<string, RecordBest>();
  const volume = new Map<string, { value: number; setId: string }>();
  const achievedDate = session.completedDate ?? '';
  const offer = (best: RecordBest) => {
    const key = recordKey(best.exerciseId, best.type, best.type === 'reps_at_weight' ? best.atLoadKg : undefined, best.addedLoad);
    const current = bests.get(key);
    if (!current || best.value > current.value) bests.set(key, best);
  };

  for (const block of session.blocks) {
    for (const entry of block.exercises) {
      const exercise = exercisesById.get(entry.exerciseId);
      if (!exercise) continue;
      for (const set of entry.sets) {
        if (!set.completedAt) continue;
        const base = { exerciseId: exercise.id, sessionId: session.id, setId: set.id, achievedDate };
        if (set.kind === 'timed_hold') {
          if (set.durationSec) offer({ ...base, type: 'longest_hold', value: set.durationSec });
          continue;
        }
        if (!countsForPRs(set) || !set.reps) continue;
        const load = recordLoadKg(set, exercise);
        if (load) {
          const added = load.added ? { addedLoad: true } : {};
          offer({ ...base, ...added, type: 'heaviest_weight', value: load.kg });
          offer({ ...base, ...added, type: 'reps_at_weight', value: set.reps, atLoadKg: load.kg });
        }
        const e1rm = setE1RM(set, exercise);
        if (e1rm !== undefined) offer({ ...base, type: 'e1rm', value: e1rm });
        // Highest volume: the exercise's whole workout (every entry of it), from PR-eligible sets,
        // with loads to the same 0.05 kg as the other records.
        const setVolume = set.reps * (loadBucket(effectiveLoadKg(set, exercise) ?? 0) / 20);
        if (setVolume > 0) volume.set(exercise.id, { value: (volume.get(exercise.id)?.value ?? 0) + setVolume, setId: set.id });
      }
    }
  }
  for (const [exerciseId, { value, setId }] of volume) offer({ exerciseId, sessionId: session.id, setId, achievedDate, type: 'volume', value });
  return [...bests];
}

/** Folds one workout into the running bests, returning the records it set. */
function applyWorkout(session: WorkoutSession, bests: RecordBests, exercisesById: Map<string, Exercise>): PersonalRecord[] {
  const records: PersonalRecord[] = [];
  for (const [key, best] of workoutBests(session, exercisesById)) {
    const previous = bests.get(key);
    if (previous && !beats(best.value, previous.value, best.type)) continue;
    bests.set(key, best);
    if (previous) records.push({ ...best, id: `pr_${best.setId}_${best.type}`, previousValue: previous.value });
  }
  return records;
}

/** Every record ever set, oldest first. Unfinished and skipped workouts never count. */
export function derivePersonalRecords(sessions: WorkoutSession[], exercisesById: Map<string, Exercise>): PersonalRecord[] {
  const bests: RecordBests = new Map();
  return finished(sessions).flatMap((session) => applyWorkout(session, bests, exercisesById));
}

/** The current all-time best for every record key, including bests that were never beaten. */
export function deriveRecordBests(sessions: WorkoutSession[], exercisesById: Map<string, Exercise>): RecordBests {
  const bests: RecordBests = new Map();
  for (const session of finished(sessions)) applyWorkout(session, bests, exercisesById);
  return bests;
}

/**
 * One exercise's all-time bests, by type (reps at a weight: the most reps at its heaviest load).
 * Weights are read the way the exercise counts them now: added load for bodyweight lifts.
 */
export function exerciseBests(bests: RecordBests, exercise: Pick<Exercise, 'id' | 'isBodyweight'>): Partial<Record<PRType, RecordBest>> {
  const out: Partial<Record<PRType, RecordBest>> = {};
  const loadTypes = new Set<PRType>(['heaviest_weight', 'reps_at_weight']);
  const all = [...bests.values()].filter((b) => b.exerciseId === exercise.id);
  // Prefer the reading that matches the setting; fall back to the other if that's all there is.
  const preferred = all.filter((b) => !loadTypes.has(b.type) || Boolean(b.addedLoad) === exercise.isBodyweight);
  const pool = all.some((b) => loadTypes.has(b.type) && Boolean(b.addedLoad) === exercise.isBodyweight) ? preferred : all;
  for (const best of pool) {
    const current = out[best.type];
    const better = best.type === 'reps_at_weight' ? !current || (best.atLoadKg ?? 0) > (current.atLoadKg ?? 0) : !current || best.value > current.value;
    if (better) out[best.type] = best;
  }
  return out;
}

/**
 * The finished workouts a workout in progress is measured against: every other finished workout,
 * or for a reopened one, only those finished before it (spec 2.5: records follow completion dates).
 */
export function sessionsBefore(sessions: WorkoutSession[], active: Pick<WorkoutSession, 'id'> & Completion, mode: 'new' | 'reopen'): WorkoutSession[] {
  const others = sessions.filter((s) => s.status === 'completed' && s.completedDate && s.id !== active.id);
  if (mode !== 'reopen' || !active.completedAt) return others;
  return others.filter((s) => byCompletion(s, active) < 0);
}

/**
 * Sets in a workout that show the live PR badge (spec 2.6): a completed set that beats the
 * exercise's best weight or e1RM from before it, counting earlier workouts and the sets done
 * before it in this one. An exercise's first-ever workout sets baselines, so it shows none, as
 * the summary does. Derived from the sets' current values, so edits move the badge.
 */
export function livePRSetIds(session: WorkoutSession, before: RecordBests, exercisesById: Map<string, Exercise>): Set<string> {
  const ordered: { set: LoggedSet; exercise: Exercise; position: number }[] = [];
  for (const block of session.blocks) {
    for (const entry of block.exercises) {
      const exercise = exercisesById.get(entry.exerciseId);
      if (!exercise) continue;
      for (const set of entry.sets) if (set.completedAt && countsForPRs(set) && set.reps) ordered.push({ set, exercise, position: ordered.length });
    }
  }
  ordered.sort((a, b) => (a.set.completedAt ?? '').localeCompare(b.set.completedAt ?? '') || a.position - b.position);

  const running = new Map<string, number>();
  const flagged = new Set<string>();
  for (const { set, exercise } of ordered) {
    const values: [PRType, number | undefined][] = [
      ['heaviest_weight', recordLoadKg(set, exercise)?.kg],
      ['e1rm', setE1RM(set, exercise)],
    ];
    const added = recordLoadKg(set, exercise)?.added;
    for (const [type, value] of values) {
      if (value === undefined) continue;
      const key = recordKey(exercise.id, type, undefined, type === 'heaviest_weight' ? added : undefined);
      const baseline = before.get(key)?.value;
      if (baseline === undefined) continue;
      const best = running.get(key) ?? baseline;
      if (beats(value, best, type)) flagged.add(set.id);
      running.set(key, Math.max(best, value));
    }
  }
  return flagged;
}

/**
 * Records in `after` that weren't already there in `before`, matched by exercise, type, load and
 * value. Finishing a reopened workout celebrates only these (G3.6).
 */
export function newRecords(before: PersonalRecord[], after: PersonalRecord[]): PersonalRecord[] {
  const key = (r: PersonalRecord) => `${r.exerciseId}:${r.type}:${r.atLoadKg === undefined ? '' : loadBucket(r.atLoadKg)}:${r.value.toFixed(2)}`;
  const seen = new Set(before.map(key));
  return after.filter((r) => !seen.has(key(r)));
}

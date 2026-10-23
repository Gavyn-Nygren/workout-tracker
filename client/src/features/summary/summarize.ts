import { countsForPRs, effectiveLoadKg, setVolumeKg } from '@/data/calculations';
import { derivePersonalRecords } from '@/data/records';
import type { Exercise, PersonalRecord, PRType, SessionExercise, WorkoutSession } from '@/data/types';

export type BestSet =
  | { kind: 'load'; loadKg: number; reps: number }
  | { kind: 'bodyweight'; addedKg: number; reps: number }
  | { kind: 'hold'; seconds: number };

export type ExerciseSummary = {
  entryId: string;
  exerciseId: string;
  name: string;
  skipped: boolean;
  setsDone: number;
  setsTotal: number;
  best?: BestSet;
  /** Change in the best set's load (or added load, or hold time) since the exercise was last done. */
  delta?: { amount: number; kind: BestSet['kind'] };
  prTypes: PRType[];
};

export type WorkoutSummary = {
  minutes?: number;
  volumeKg: number;
  setsDone: number;
  setsTotal: number;
  /** PRs set in this workout. */
  records: PersonalRecord[];
  exercises: ExerciseSummary[];
  /** The last time this same workout was done, for comparisons. */
  previous?: { session: WorkoutSession; volumeKg: number; minutes?: number; setsDone: number };
};

function minutesOf(session: WorkoutSession): number | undefined {
  return session.startedAt && session.completedAt ? (Date.parse(session.completedAt) - Date.parse(session.startedAt)) / 60_000 : undefined;
}

function totals(session: WorkoutSession, exercisesById: Map<string, Exercise>) {
  let volumeKg = 0;
  let setsDone = 0;
  let setsTotal = 0;
  for (const block of session.blocks) {
    for (const entry of block.exercises) {
      if (entry.skipped) continue;
      setsTotal += entry.sets.length;
      setsDone += entry.sets.filter((s) => s.completedAt).length;
      const exercise = exercisesById.get(entry.exerciseId);
      if (exercise) for (const set of entry.sets) volumeKg += setVolumeKg(set, exercise);
    }
  }
  return { volumeKg, setsDone, setsTotal };
}

/** The heaviest working set (by load, added load, or hold time) of a logged exercise. */
export function bestSet(entry: SessionExercise, exercise: Exercise | undefined): BestSet | undefined {
  const done = entry.sets.filter((s) => s.completedAt && s.kind !== 'warmup');
  const holds = done.filter((s) => s.kind === 'timed_hold' && s.durationSec);
  if (holds.length) return { kind: 'hold', seconds: Math.max(...holds.map((s) => s.durationSec ?? 0)) };
  let best: BestSet | undefined;
  for (const set of done) {
    if (!countsForPRs(set) || !set.reps) continue;
    if (exercise?.isBodyweight) {
      const addedKg = set.addedLoadKg ?? 0;
      if (!best || (best.kind === 'bodyweight' && (addedKg > best.addedKg || (addedKg === best.addedKg && set.reps > best.reps)))) {
        best = { kind: 'bodyweight', addedKg, reps: set.reps };
      }
    } else {
      const loadKg = exercise ? (effectiveLoadKg(set, exercise) ?? 0) : (set.loadKg ?? 0);
      if (!best || (best.kind === 'load' && (loadKg > best.loadKg || (loadKg === best.loadKg && set.reps > best.reps)))) {
        best = { kind: 'load', loadKg, reps: set.reps };
      }
    }
  }
  return best;
}

function amountOf(best: BestSet): number {
  return best.kind === 'load' ? best.loadKg : best.kind === 'bodyweight' ? best.addedKg : best.seconds;
}

/** Everything the workout summary shows (G2.3). `allSessions` should include `session`. */
export function buildSummary(session: WorkoutSession, allSessions: WorkoutSession[], exercisesById: Map<string, Exercise>): WorkoutSummary {
  const completed = allSessions.filter((s) => s.status === 'completed' && s.id !== session.id);
  const chronological = [...completed, session].sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''));
  const records = derivePersonalRecords(chronological, exercisesById).filter((r) => r.sessionId === session.id);
  const earlier = completed.filter((s) => (s.completedAt ?? '') < (session.completedAt ?? '')).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  const lastEntry = (exerciseId: string) => {
    for (const s of earlier) {
      for (const block of s.blocks) {
        const entry = block.exercises.find((e) => e.exerciseId === exerciseId && !e.skipped && e.sets.some((x) => x.completedAt));
        if (entry) return entry;
      }
    }
    return undefined;
  };

  const exercises: ExerciseSummary[] = session.blocks.flatMap((block) =>
    block.exercises.map((entry) => {
      const exercise = exercisesById.get(entry.exerciseId);
      const best = entry.skipped ? undefined : bestSet(entry, exercise);
      const previousEntry = lastEntry(entry.exerciseId);
      const previousBest = previousEntry ? bestSet(previousEntry, exercise) : undefined;
      const delta = best && previousBest && best.kind === previousBest.kind ? { amount: amountOf(best) - amountOf(previousBest), kind: best.kind } : undefined;
      return {
        entryId: entry.id,
        exerciseId: entry.exerciseId,
        name: exercise?.name ?? 'Exercise',
        skipped: entry.skipped,
        setsDone: entry.sets.filter((s) => s.completedAt).length,
        setsTotal: entry.sets.length,
        best,
        delta,
        prTypes: [...new Set(records.filter((r) => r.exerciseId === entry.exerciseId).map((r) => r.type))],
      };
    }),
  );

  const previousSession = earlier.find((s) => (session.planWorkoutId ? s.planWorkoutId === session.planWorkoutId : s.name === session.name));
  const previous = previousSession
    ? { session: previousSession, ...totals(previousSession, exercisesById), minutes: minutesOf(previousSession) }
    : undefined;

  return { ...totals(session, exercisesById), minutes: minutesOf(session), records, exercises, previous };
}

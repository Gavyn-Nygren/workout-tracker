import type { LoggedSet, SessionBlock, SessionExercise, WorkoutSession } from '@/data/types';
import { newId } from '@/lib/id';

export type ActiveWorkout = {
  session: WorkoutSession;
  /** 'reopen' edits an already-finished session; 'new' covers fresh starts and repeats. */
  mode: 'new' | 'reopen';
  /** Position among the day's workouts, for "1/2" labels. */
  position?: { index: number; total: number };
};

export type WorkoutAction =
  | { type: 'start'; workout: ActiveWorkout }
  | { type: 'end' }
  | { type: 'updateSet'; entryId: string; setId: string; patch: Partial<LoggedSet> }
  | { type: 'completeSet'; entryId: string; setId: string; completedAt: string; bodyweightKg?: number }
  | { type: 'uncompleteSet'; entryId: string; setId: string }
  | { type: 'addSet'; entryId: string }
  | { type: 'removeSet'; entryId: string; setId: string }
  | { type: 'addExercise'; exerciseId: string }
  | { type: 'swapExercise'; entryId: string; exerciseId: string }
  | { type: 'toggleSkip'; entryId: string }
  | { type: 'removeExercise'; entryId: string }
  | { type: 'moveBlock'; from: number; to: number }
  | { type: 'setNotes'; entryId: string; notes: string };

function mapEntry(session: WorkoutSession, entryId: string, fn: (entry: SessionExercise) => SessionExercise): WorkoutSession {
  return {
    ...session,
    blocks: session.blocks.map((block) => ({
      ...block,
      exercises: block.exercises.map((entry) => (entry.id === entryId ? fn(entry) : entry)),
    })),
  };
}

function mapSet(session: WorkoutSession, entryId: string, setId: string, fn: (set: LoggedSet) => LoggedSet): WorkoutSession {
  return mapEntry(session, entryId, (entry) => ({ ...entry, sets: entry.sets.map((s) => (s.id === setId ? fn(s) : s)) }));
}

/** A fresh, unlogged copy of the entry's last set, so "Add set" keeps the same targets. */
function nextSet(entry: SessionExercise): LoggedSet {
  const last = [...entry.sets].reverse().find((s) => s.kind !== 'warmup') ?? entry.sets[entry.sets.length - 1];
  return {
    id: newId('set'),
    kind: last?.kind === 'drop' ? 'normal' : (last?.kind ?? 'normal'),
    modifiers: [],
    target: last?.target,
    reps: last?.reps,
    loadKg: last?.loadKg,
    addedLoadKg: last?.addedLoadKg,
    assistanceKg: last?.assistanceKg,
    durationSec: last?.durationSec,
  };
}

/** All edits to the in-progress session. Pure, so the rules can be unit-tested (G3.4). */
export function workoutReducer(state: ActiveWorkout | null, action: WorkoutAction): ActiveWorkout | null {
  if (action.type === 'start') return action.workout;
  if (!state) return null;
  const update = (session: WorkoutSession): ActiveWorkout => ({ ...state, session: { ...session, updatedAt: new Date().toISOString() } });
  const { session } = state;

  switch (action.type) {
    case 'end':
      return null;
    case 'updateSet':
      return update(mapSet(session, action.entryId, action.setId, (s) => ({ ...s, ...action.patch })));
    case 'completeSet':
      return update(
        mapSet(session, action.entryId, action.setId, (s) => ({
          ...s,
          completedAt: action.completedAt,
          bodyweightSnapshotKg: action.bodyweightKg ?? s.bodyweightSnapshotKg,
        })),
      );
    case 'uncompleteSet':
      return update(mapSet(session, action.entryId, action.setId, (s) => ({ ...s, completedAt: undefined })));
    case 'addSet':
      return update(mapEntry(session, action.entryId, (entry) => ({ ...entry, skipped: false, sets: [...entry.sets, nextSet(entry)] })));
    case 'removeSet':
      return update(mapEntry(session, action.entryId, (entry) => ({ ...entry, sets: entry.sets.filter((s) => s.id !== action.setId) })));
    case 'addExercise': {
      const entry: SessionExercise = {
        id: newId('entry'),
        exerciseId: action.exerciseId,
        skipped: false,
        sets: [1, 2, 3].map(() => ({ id: newId('set'), kind: 'normal' as const, modifiers: [] })),
      };
      const block: SessionBlock = { id: newId('block'), type: 'single', exercises: [entry] };
      return update({ ...session, blocks: [...session.blocks, block] });
    }
    case 'swapExercise':
      // Same number of sets and reps; loads cleared because they belonged to the old exercise.
      return update(
        mapEntry(session, action.entryId, (entry) => ({
          ...entry,
          exerciseId: action.exerciseId,
          skipped: false,
          sets: entry.sets.map((s) => ({ ...s, completedAt: undefined, loadKg: undefined, addedLoadKg: undefined, recordingId: undefined })),
        })),
      );
    case 'toggleSkip':
      return update(mapEntry(session, action.entryId, (entry) => ({ ...entry, skipped: !entry.skipped })));
    case 'removeExercise':
      return update({
        ...session,
        blocks: session.blocks
          .map((block) => ({ ...block, exercises: block.exercises.filter((e) => e.id !== action.entryId) }))
          .filter((block) => block.exercises.length > 0),
      });
    case 'moveBlock': {
      const blocks = [...session.blocks];
      const [moved] = blocks.splice(action.from, 1);
      if (!moved) return state;
      blocks.splice(Math.max(0, Math.min(blocks.length, action.to)), 0, moved);
      return update({ ...session, blocks });
    }
    case 'setNotes':
      return update(mapEntry(session, action.entryId, (entry) => ({ ...entry, notes: action.notes || undefined })));
  }
}

/**
 * A set's number as the set table shows it: working sets (drops included) count 1, 2, 3…, and
 * warm-ups count separately because they show a "W" tag instead of a number.
 */
export function setNumber(sets: LoggedSet[], set: LoggedSet): number {
  const warmup = set.kind === 'warmup';
  let n = 0;
  for (const s of sets) {
    if ((s.kind === 'warmup') === warmup) n++;
    if (s.id === set.id) break;
  }
  return n;
}

/** "Set 2" or "Warm-up set 1", for titles, labels, and announcements. */
export function setName(kind: LoggedSet['kind'], number: number): string {
  return kind === 'warmup' ? `Warm-up set ${number}` : `Set ${number}`;
}

export type SetCounts = { done: number; total: number };

/** Sets that count toward progress: everything in exercises that aren't skipped. */
export function countSets(session: WorkoutSession): SetCounts {
  let done = 0;
  let total = 0;
  for (const block of session.blocks) {
    for (const entry of block.exercises) {
      if (entry.skipped) continue;
      total += entry.sets.length;
      done += entry.sets.filter((s) => s.completedAt).length;
    }
  }
  return { done, total };
}

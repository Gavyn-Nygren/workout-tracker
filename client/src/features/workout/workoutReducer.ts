import { kindForExercise } from '@/data/logging';
import type { LoggedSet, SessionBlock, SessionExercise, SetKind, WorkoutSession } from '@/data/types';
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
  /** Picks an unfinished workout back up after the app reopens, unless one was started meanwhile. */
  | { type: 'resume'; workout: ActiveWorkout }
  | { type: 'end' }
  | { type: 'updateSet'; entryId: string; setId: string; patch: Partial<LoggedSet> }
  | { type: 'completeSet'; entryId: string; setId: string; completedAt: string; bodyweightKg?: number }
  | { type: 'uncompleteSet'; entryId: string; setId: string }
  | { type: 'addSet'; entryId: string }
  | { type: 'removeSet'; entryId: string; setId: string }
  /** `isAssisted` is the exercise's own setting, so its sets log assistance by default. */
  | { type: 'addExercise'; exerciseId: string; isAssisted?: boolean }
  | { type: 'swapExercise'; entryId: string; exerciseId: string; isAssisted?: boolean }
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

/**
 * A kind change keeps only the weight field the new kind shows: an assisted set has no added load,
 * and any other set no assistance.
 */
function withKind(set: LoggedSet, kind: SetKind | undefined): Partial<LoggedSet> {
  if (kind === undefined || kind === set.kind) return {};
  if (kind === 'assisted') return { addedLoadKg: undefined };
  return set.kind === 'assisted' ? { assistanceKg: undefined } : {};
}

/** A swapped-in exercise logs assistance (or not) by its own setting; other set kinds stay as they were. */
function swappedKind(kind: SetKind, isAssisted: boolean | undefined): SetKind {
  return kind === 'normal' || kind === 'assisted' ? kindForExercise('normal', { isAssisted }) : kind;
}

/** All edits to the in-progress session. Pure, so the rules can be unit-tested (G3.4). */
export function workoutReducer(state: ActiveWorkout | null, action: WorkoutAction): ActiveWorkout | null {
  if (action.type === 'start') return action.workout;
  if (action.type === 'resume') return state ?? action.workout;
  if (!state) return null;
  const update = (session: WorkoutSession): ActiveWorkout => ({ ...state, session: { ...session, updatedAt: new Date().toISOString() } });
  const { session } = state;

  switch (action.type) {
    case 'end':
      return null;
    case 'updateSet':
      return update(mapSet(session, action.entryId, action.setId, (s) => ({ ...s, ...action.patch, ...withKind(s, action.patch.kind) })));
    case 'completeSet':
      return update(
        mapSet(session, action.entryId, action.setId, (s) => ({
          ...s,
          completedAt: action.completedAt,
          // A set keeps the bodyweight it was first logged with, so re-checking it in a reopened
          // workout never stamps today's weight on an old set (spec 2.6).
          bodyweightSnapshotKg: s.bodyweightSnapshotKg ?? action.bodyweightKg,
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
        sets: [1, 2, 3].map(() => ({ id: newId('set'), kind: kindForExercise('normal', { isAssisted: action.isAssisted }), modifiers: [] })),
      };
      const block: SessionBlock = { id: newId('block'), type: 'single', exercises: [entry] };
      return update({ ...session, blocks: [...session.blocks, block] });
    }
    case 'swapExercise':
      // Same number of sets and reps. Loads, the bodyweight they were logged with, and recordings
      // are cleared because they belonged to the old exercise.
      return update(
        mapEntry(session, action.entryId, (entry) => ({
          ...entry,
          exerciseId: action.exerciseId,
          skipped: false,
          sets: entry.sets.map((s) => ({
            ...s,
            kind: swappedKind(s.kind, action.isAssisted),
            completedAt: undefined,
            loadKg: undefined,
            addedLoadKg: undefined,
            assistanceKg: undefined,
            effectiveLoadOverrideKg: undefined,
            bodyweightSnapshotKg: undefined,
            recordingId: undefined,
          })),
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
      // A skipped exercise counts only the sets already done in it (skipping skips the rest).
      const doneHere = entry.sets.filter((s) => s.completedAt).length;
      done += doneHere;
      total += entry.skipped ? doneHere : entry.sets.length;
    }
  }
  return { done, total };
}

/** How a finished workout is saved: 'partial' if any set is unlogged or an exercise was skipped. */
export function completionOf(session: WorkoutSession): 'full' | 'partial' {
  const { done, total } = countSets(session);
  const anySkipped = session.blocks.some((b) => b.exercises.some((e) => e.skipped));
  return done < total || anySkipped ? 'partial' : 'full';
}

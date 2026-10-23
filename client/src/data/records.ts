import { countsForPRs, effectiveLoadKg, setE1RM, setVolumeKg } from './calculations';
import type { Exercise, PersonalRecord, WorkoutSession } from './types';

// PR rules from spec 2.7: working sets only, no partial-rep sets, Epley e1RM for 12 reps or fewer.

/** Walks sessions in order and records every time a best is beaten. First-ever sessions set baselines only. */
export function derivePersonalRecords(sessions: WorkoutSession[], exercisesById: Map<string, Exercise>): PersonalRecord[] {
  const records: PersonalRecord[] = [];
  const best = new Map<string, number>();

  function consider(key: string, value: number, base: Omit<PersonalRecord, 'id' | 'value' | 'previousValue'>) {
    const previous = best.get(key);
    if (previous !== undefined && value <= previous + 1e-6) return;
    best.set(key, value);
    if (previous === undefined) return;
    records.push({ ...base, id: `pr_${base.setId}_${base.type}`, value, previousValue: previous });
  }

  for (const session of sessions) {
    if (session.status !== 'completed' || !session.completedDate) continue;
    for (const block of session.blocks) {
      for (const sessionExercise of block.exercises) {
        const exercise = exercisesById.get(sessionExercise.exerciseId);
        if (!exercise) continue;
        let volume = 0;
        let lastSetId: string | undefined;

        for (const set of sessionExercise.sets) {
          const base = { exerciseId: exercise.id, sessionId: session.id, setId: set.id, achievedDate: session.completedDate };
          if (set.kind === 'timed_hold' && set.durationSec && set.completedAt) {
            consider(`${exercise.id}:hold`, set.durationSec, { ...base, type: 'longest_hold' });
            continue;
          }
          volume += setVolumeKg(set, exercise);
          if (!countsForPRs(set) || !set.reps) continue;
          lastSetId = set.id;
          const load = effectiveLoadKg(set, exercise);
          if (load === undefined) continue;
          consider(`${exercise.id}:heaviest`, load, { ...base, type: 'heaviest_weight' });
          consider(`${exercise.id}:reps@${load.toFixed(2)}`, set.reps, { ...base, type: 'reps_at_weight', atLoadKg: load });
          const e1rm = setE1RM(set, exercise);
          if (e1rm !== undefined) consider(`${exercise.id}:e1rm`, e1rm, { ...base, type: 'e1rm' });
        }

        if (volume > 0 && lastSetId) {
          consider(`${exercise.id}:volume`, volume, {
            exerciseId: exercise.id,
            sessionId: session.id,
            setId: lastSetId,
            achievedDate: session.completedDate,
            type: 'volume',
          });
        }
      }
    }
  }
  return records;
}

import { effectiveLoadKg } from '@/data/calculations';
import type { BodyweightEntry, Exercise, FormReport, Goal, Plan, Preferences, UnitSystem, WorkoutSession } from '@/data/types';
import { kgToLb } from '@/data/units';

const csvCell = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const load = (kg: number | undefined, units: UnitSystem) => (kg === undefined ? undefined : Math.round((units === 'imperial' ? kgToLb(kg) : kg) * 100) / 100);

/**
 * One row per logged set, for spreadsheets (spec 2.3: CSV of workouts and sets). Bodyweight sets
 * show added load or assistance (whichever the set's kind uses), the bodyweight saved with the
 * set, and the load it counts as (its effective load).
 */
export function workoutsCsv(sessions: WorkoutSession[], exercisesById: Map<string, Exercise>, plans: Plan[], units: UnitSystem): string {
  const unit = units === 'imperial' ? 'lb' : 'kg';
  const header = [
    'date',
    'workout',
    'plan',
    'completion',
    'exercise',
    'set',
    'set_type',
    'modifiers',
    `weight_${unit}`,
    `added_${unit}`,
    `assistance_${unit}`,
    `bodyweight_${unit}`,
    `counted_load_${unit}`,
    'reps',
    'seconds',
    'rpe',
    'rest_s',
    'tempo',
    'notes',
  ];
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const rows = [header.join(',')];
  const completed = sessions.filter((s) => s.status === 'completed').sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''));
  for (const s of completed) {
    for (const entry of s.blocks.flatMap((b) => b.exercises)) {
      const exercise = exercisesById.get(entry.exerciseId);
      entry.sets.forEach((set, i) => {
        if (!set.completedAt) return;
        const assisted = set.kind === 'assisted';
        rows.push(
          [
            s.completedDate,
            s.name,
            s.planId ? planName.get(s.planId) : '',
            s.completion,
            exercise?.name ?? entry.exerciseId,
            i + 1,
            set.kind,
            set.modifiers.join(' '),
            load(set.loadKg, units),
            load(assisted ? undefined : set.addedLoadKg, units),
            load(assisted ? set.assistanceKg : undefined, units),
            load(set.bodyweightSnapshotKg, units),
            load(effectiveLoadKg(set, exercise ?? { isBodyweight: false }), units),
            set.reps,
            set.durationSec,
            set.rir === undefined ? undefined : 10 - set.rir,
            set.restSec,
            set.tempo,
            set.notes,
          ]
            .map(csvCell)
            .join(','),
        );
      });
    }
  }
  return rows.join('\n');
}

/** Everything, in the app's own format (spec 2.3; also covers data-access requests). Videos stay on the phone. */
export function everythingJson(input: {
  preferences: Preferences;
  exercises: Exercise[];
  plans: Plan[];
  sessions: WorkoutSession[];
  bodyweight: BodyweightEntry[];
  goals: Goal[];
  formReports: FormReport[];
}): string {
  return JSON.stringify(
    {
      format: 'exercise-tracker-export',
      // 2: a rotating plan's cycle is `steps` (each day's workouts), not `sequence`.
      version: 2,
      exportedAt: new Date().toISOString(),
      note: 'Weights are in kilograms. Raw videos are not included; they stay on your phone.',
      preferences: input.preferences,
      customExercises: input.exercises.filter((e) => e.source === 'custom'),
      plans: input.plans,
      sessions: input.sessions,
      bodyweight: input.bodyweight,
      goals: input.goals,
      formReports: input.formReports,
    },
    null,
    2,
  );
}

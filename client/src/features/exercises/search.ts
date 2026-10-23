import type { Equipment, Exercise, MuscleGroup } from '@/data/types';

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  adductors: 'Adductors',
  calves: 'Calves',
  chest: 'Chest',
  back: 'Back',
  lats: 'Lats',
  traps: 'Traps',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  core: 'Core',
};

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  kettlebell: 'Kettlebell',
  band: 'Band',
  bodyweight: 'Bodyweight',
  other: 'Other',
};

/** Gym shorthand people type, expanded before matching. */
const SHORTHAND: Record<string, string> = { db: 'dumbbell', bb: 'barbell', kb: 'kettlebell', bw: 'bodyweight', ohp: 'overhead press' };

/** Lowercase, accents and punctuation removed, so "Pull-Up" and "pull up" compare equal. */
const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Whether an exercise matches a search. Every word has to appear somewhere in its name, nicknames,
 * equipment, or muscles, in any order: "dumbbell bench" finds "Bench Press (Dumbbell)", "rdl" finds
 * "Romanian Deadlift (Barbell)", and "pullup" finds "Pull-Up".
 */
export function exerciseMatches(exercise: Exercise, query: string): boolean {
  const words = normalize(query)
    .split(' ')
    .filter(Boolean)
    .flatMap((w) => (SHORTHAND[w] ?? w).split(' '));
  if (!words.length) return true;
  const text = normalize(
    [
      exercise.name,
      ...(exercise.aliases ?? []),
      exercise.equipment ? EQUIPMENT_LABEL[exercise.equipment] : '',
      ...exercise.primaryMuscles.map((m) => MUSCLE_LABEL[m]),
    ].join(' '),
  );
  const squashed = text.replace(/ /g, '');
  return words.every((w) => text.includes(w) || squashed.includes(w));
}

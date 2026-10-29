import type {
  BodyweightEntry,
  EarnedBadge,
  Exercise,
  FormReport,
  Goal,
  ISODate,
  PersonalRecord,
  Plan,
  Preferences,
  Recording,
  ScheduledOccurrence,
  StarterTemplate,
  StreakState,
  WorkoutSession,
} from '../types';
import { defaultPreferences } from '../preferences';
import { weekTargetsFromHistory } from '../weekTargets';
import { deriveBadges, derivePersonalRecords, deriveStreak, fakeGoals } from './derived';
import { fakeExercises } from './exercises';
import { generateFormReports } from './form';
import { generateHistory } from './history';
import { fakePlans, fakeTemplates } from './plans';

export type FakeDataset = {
  today: ISODate;
  exercises: Exercise[];
  plans: Plan[];
  templates: StarterTemplate[];
  occurrences: ScheduledOccurrence[];
  sessions: WorkoutSession[];
  bodyweight: BodyweightEntry[];
  personalRecords: PersonalRecord[];
  goals: Goal[];
  badges: EarnedBadge[];
  streak: StreakState;
  recordings: Recording[];
  formReports: FormReport[];
  preferences: Preferences;
};

/** Builds the whole sample dataset relative to `today`, so the app always looks freshly used. */
export function buildFakeDataset(today: ISODate): FakeDataset {
  const exercisesById = new Map(fakeExercises.map((e) => [e.id, e]));
  const isBodyweight = (id: string) => exercisesById.get(id)?.isBodyweight ?? false;

  const { occurrences, sessions, bodyweight } = generateHistory(fakePlans, isBodyweight, today);
  const { recordings, formReports } = generateFormReports(sessions);
  const goals = fakeGoals(today);
  const { units, weekStartsOn } = defaultPreferences;
  // The same targets the database freezes for these weeks on its first read.
  const streak = deriveStreak(sessions, today, weekTargetsFromHistory({ goals, sessions, occurrences, weekStartsOn, today }), weekStartsOn);
  const personalRecords = derivePersonalRecords(sessions, exercisesById);
  const badges = deriveBadges({
    sessions,
    exercisesById,
    formReports,
    records: personalRecords,
    streak,
    occurrences,
    plans: fakePlans,
    planVersions: fakePlans,
    bodyweight,
    units,
    weekStartsOn,
    today,
  });

  return {
    today,
    exercises: fakeExercises,
    plans: fakePlans,
    templates: fakeTemplates,
    occurrences,
    sessions,
    bodyweight,
    personalRecords,
    goals,
    badges,
    streak,
    recordings,
    formReports,
    preferences: defaultPreferences,
  };
}

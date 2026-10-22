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

export const defaultPreferences: Preferences = {
  units: 'imperial',
  effortScale: 'rpe',
  roundingIncrements: { barbell: 5, dumbbell: 5, machine: 5, cable: 5 },
  restDefaultsSec: { compound: 180, isolation: 90, warmup: 60 },
  weekStartsOn: 1,
  haptics: true,
  celebrations: true,
  telemetry: true,
  biometricLock: { enabled: false, afterSec: 300 },
  notifications: {
    workoutReminders: false,
    restTimer: false,
    missedWorkout: false,
    weeklySummary: false,
    formAnalysisComplete: false,
  },
};

/** Builds the whole sample dataset relative to `today`, so the app always looks freshly used. */
export function buildFakeDataset(today: ISODate): FakeDataset {
  const exercisesById = new Map(fakeExercises.map((e) => [e.id, e]));
  const isBodyweight = (id: string) => exercisesById.get(id)?.isBodyweight ?? false;

  const { occurrences, sessions, bodyweight } = generateHistory(fakePlans, isBodyweight, today);
  const { recordings, formReports } = generateFormReports(sessions);
  const goals = fakeGoals(today);
  const frequencyGoal = goals.find((g) => g.type === 'frequency');
  const streak = deriveStreak(sessions, today, frequencyGoal?.type === 'frequency' ? frequencyGoal.workoutsPerWeek : 4);

  return {
    today,
    exercises: fakeExercises,
    plans: fakePlans,
    templates: fakeTemplates,
    occurrences,
    sessions,
    bodyweight,
    personalRecords: derivePersonalRecords(sessions, exercisesById),
    goals,
    badges: deriveBadges(sessions, exercisesById, formReports, streak),
    streak,
    recordings,
    formReports,
    preferences: defaultPreferences,
  };
}

import type {
  BodyweightEntry,
  EarnedBadge,
  Exercise,
  FormReport,
  Goal,
  ID,
  ISODate,
  PersonalRecord,
  Plan,
  PlannedBlock,
  Preferences,
  Recording,
  ScheduledOccurrence,
  StarterTemplate,
  StreakState,
  WorkoutSession,
} from './types';
import type { FakeDataset } from './fake';
import { deriveStreak } from './fake/derived';
import { derivePersonalRecords } from './records';

/** Inclusive date range. */
export type DateRange = { from: ISODate; to: ISODate };

/**
 * Everything screens read goes through this interface. Phase 2 uses the fake implementation;
 * G3.1 swaps in SQLite without changing screens. Writes are added as features need them.
 */
export interface DataRepository {
  today(): ISODate;
  getPreferences(): Promise<Preferences>;
  listExercises(): Promise<Exercise[]>;
  getExercise(id: ID): Promise<Exercise | undefined>;
  listPlans(): Promise<Plan[]>;
  getPlan(id: ID): Promise<Plan | undefined>;
  listTemplates(): Promise<StarterTemplate[]>;
  listOccurrences(range: DateRange): Promise<ScheduledOccurrence[]>;
  /** Sessions whose completed (or scheduled, if never completed) date falls in the range. */
  listSessions(range?: DateRange): Promise<WorkoutSession[]>;
  getSession(id: ID): Promise<WorkoutSession | undefined>;
  listBodyweight(): Promise<BodyweightEntry[]>;
  listPersonalRecords(filter?: { exerciseId?: ID; since?: ISODate }): Promise<PersonalRecord[]>;
  listGoals(): Promise<Goal[]>;
  listBadges(): Promise<EarnedBadge[]>;
  getStreak(): Promise<StreakState>;
  listFormReports(filter?: { exerciseId?: ID }): Promise<FormReport[]>;
  getFormReport(id: ID): Promise<FormReport | undefined>;
  getRecording(id: ID): Promise<Recording | undefined>;

  // Writes
  /** Inserts or replaces a session; links it to its scheduled occurrence and recalculates records. */
  saveSession(session: WorkoutSession): Promise<void>;
  /** Replaces a plan workout's blocks; affects future workouts only, since sessions keep their own copy. */
  updatePlanWorkout(planId: ID, workoutId: ID, blocks: PlannedBlock[]): Promise<void>;
}

function inRange(date: ISODate | undefined, range?: DateRange): boolean {
  if (!range) return true;
  return date !== undefined && date >= range.from && date <= range.to;
}

/** In-memory repository over the sample data. Writes last until the app restarts (real storage: G3.1). */
export function createFakeRepository(data: FakeDataset): DataRepository {
  const resolve = <T,>(value: T) => Promise.resolve(value);
  const exercisesById = new Map(data.exercises.map((e) => [e.id, e]));

  const recalculate = () => {
    const chronological = [...data.sessions].sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''));
    data.personalRecords = derivePersonalRecords(chronological, exercisesById);
    data.streak = deriveStreak(data.sessions, data.today, data.streak.thisWeekTarget);
  };

  return {
    today: () => data.today,
    getPreferences: () => resolve(data.preferences),
    listExercises: () => resolve(data.exercises),
    getExercise: (id) => resolve(data.exercises.find((e) => e.id === id)),
    listPlans: () => resolve(data.plans),
    getPlan: (id) => resolve(data.plans.find((p) => p.id === id)),
    listTemplates: () => resolve(data.templates),
    listOccurrences: (range) => resolve(data.occurrences.filter((o) => inRange(o.scheduledDate, range))),
    listSessions: (range) => resolve(data.sessions.filter((s) => inRange(s.completedDate ?? s.scheduledDate, range))),
    getSession: (id) => resolve(data.sessions.find((s) => s.id === id)),
    listBodyweight: () => resolve(data.bodyweight),
    listPersonalRecords: (filter) =>
      resolve(
        data.personalRecords.filter(
          (r) => (!filter?.exerciseId || r.exerciseId === filter.exerciseId) && (!filter?.since || r.achievedDate >= filter.since),
        ),
      ),
    listGoals: () => resolve(data.goals),
    listBadges: () => resolve(data.badges),
    getStreak: () => resolve(data.streak),
    listFormReports: (filter) => resolve(data.formReports.filter((r) => !filter?.exerciseId || r.exerciseId === filter.exerciseId)),
    getFormReport: (id) => resolve(data.formReports.find((r) => r.id === id)),
    getRecording: (id) => resolve(data.recordings.find((r) => r.id === id)),

    saveSession: async (session) => {
      data.sessions = [...data.sessions.filter((s) => s.id !== session.id), session];
      if (session.occurrenceId) {
        data.occurrences = data.occurrences.map((o) => (o.id === session.occurrenceId ? { ...o, sessionId: session.id } : o));
      }
      recalculate();
    },
    updatePlanWorkout: async (planId, workoutId, blocks) => {
      data.plans = data.plans.map((plan) =>
        plan.id !== planId
          ? plan
          : {
              ...plan,
              version: plan.version + 1,
              updatedAt: new Date().toISOString(),
              workouts: plan.workouts.map((w) => (w.id === workoutId ? { ...w, blocks } : w)),
            },
      );
    },
  };
}

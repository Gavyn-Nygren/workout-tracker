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
  Preferences,
  Recording,
  ScheduledOccurrence,
  StarterTemplate,
  StreakState,
  WorkoutSession,
} from './types';
import type { FakeDataset } from './fake';

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
}

function inRange(date: ISODate | undefined, range?: DateRange): boolean {
  if (!range) return true;
  return date !== undefined && date >= range.from && date <= range.to;
}

export function createFakeRepository(data: FakeDataset): DataRepository {
  const resolve = <T,>(value: T) => Promise.resolve(value);
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
  };
}

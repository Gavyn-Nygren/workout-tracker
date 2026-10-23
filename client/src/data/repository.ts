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

/** Inclusive date range. */
export type DateRange = { from: ISODate; to: ISODate };

/**
 * Everything screens read goes through this interface, implemented on the local SQLite database
 * by `db/sqliteRepository.ts`. Writes are added as features need them.
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
  /**
   * Creates or replaces a plan and rebuilds its upcoming calendar (spec 2.5: edits change unstarted
   * future workouts only). Past occurrences and anything already started are left alone.
   */
  savePlan(plan: Plan): Promise<void>;
  /** Deletes a plan and its unstarted future occurrences. Logged history stays. */
  deletePlan(planId: ID): Promise<void>;
  /** Creates or updates a custom exercise. */
  saveExercise(exercise: Exercise): Promise<void>;
  saveGoal(goal: Goal): Promise<void>;
  deleteGoal(goalId: ID): Promise<void>;
  /** One weigh-in per day: saving on a date that already has one replaces it. */
  saveBodyweight(entry: BodyweightEntry): Promise<void>;
  deleteBodyweight(entryId: ID): Promise<void>;
  /** Deletes a recording's video and annotated replay; its metrics and report stay (spec 2.8). */
  deleteRecordingVideo(recordingId: ID): Promise<void>;
  /** Deletes a form report, its recording, and the set's link to it. */
  deleteFormReport(reportId: ID): Promise<void>;
  savePreferences(preferences: Preferences): Promise<void>;
}

/** How far ahead the calendar is generated, in days. */
export const SCHEDULE_AHEAD_DAYS = 28;

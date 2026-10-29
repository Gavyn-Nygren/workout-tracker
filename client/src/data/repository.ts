import type { BadgeState } from './badges';
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
  PlanShift,
  PlannedBlock,
  Preferences,
  ProgressPreferences,
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
  /**
   * Every saved version of every plan. A scheduled workout uses the version it was scheduled with,
   * so editing a plan never changes a past (missed) workout's prescription (spec 2.5).
   */
  listPlanVersions(): Promise<Plan[]>;
  /** Every push forward that hasn't been undone, oldest first. */
  listPlanShifts(): Promise<PlanShift[]>;
  listTemplates(): Promise<StarterTemplate[]>;
  listOccurrences(range: DateRange): Promise<ScheduledOccurrence[]>;
  /** Sessions whose completed (or scheduled, if never completed) date falls in the range. */
  listSessions(range?: DateRange): Promise<WorkoutSession[]>;
  getSession(id: ID): Promise<WorkoutSession | undefined>;
  listBodyweight(): Promise<BodyweightEntry[]>;
  listPersonalRecords(filter?: { exerciseId?: ID; since?: ISODate }): Promise<PersonalRecord[]>;
  listGoals(): Promise<Goal[]>;
  /** Badges earned, each dated by the workout, record, or report that reached it (badges.ts). */
  listBadges(): Promise<EarnedBadge[]>;
  /** Badges earned, progress toward the rest, and every Next up candidate, nearest first. */
  getBadges(): Promise<BadgeState>;
  getStreak(): Promise<StreakState>;
  listFormReports(filter?: { exerciseId?: ID }): Promise<FormReport[]>;
  getFormReport(id: ID): Promise<FormReport | undefined>;
  getRecording(id: ID): Promise<Recording | undefined>;

  // Writes
  /** Inserts or replaces a session; links it to its scheduled occurrence and recalculates records. */
  saveSession(session: WorkoutSession): Promise<void>;
  /**
   * Deletes a workout (spec 3.2: a tombstone, and stats recalculate). Its sets, form recordings, and
   * reports go with it, and the scheduled workout it belonged to goes back to planned or missed.
   * Also how a skip is undone and an unfinished workout is discarded.
   */
  deleteSession(sessionId: ID): Promise<void>;
  /** Replaces a plan workout's blocks; affects future workouts only, since sessions keep their own copy. */
  updatePlanWorkout(planId: ID, workoutId: ID, blocks: PlannedBlock[]): Promise<void>;
  /**
   * Creates or replaces a plan and rebuilds its upcoming calendar (spec 2.5: edits change unstarted
   * future workouts only). Past occurrences and anything already started are left alone.
   */
  savePlan(plan: Plan): Promise<void>;
  /** Deletes a plan and every workout of it that wasn't started. Logged history stays. */
  deletePlan(planId: ID): Promise<void>;
  /**
   * Pushes a missed workout's plan forward (spec 2.5): the workout moves to today and the plan's
   * later workouts move the same number of days (see planShiftFor). `shiftId` names the push, for
   * undoing it. Fails if the workout isn't missed.
   */
  pushPlanForward(occurrenceId: ID, shiftId: ID): Promise<void>;
  /** Undoes a push: the workouts it moved that haven't been started go back to their dates. */
  undoPlanShift(shiftId: ID): Promise<void>;
  /** Creates or updates a custom exercise. */
  saveExercise(exercise: Exercise): Promise<void>;
  saveGoal(goal: Goal): Promise<void>;
  deleteGoal(goalId: ID): Promise<void>;
  /** One weigh-in per day: saving on a date that already has one replaces it. */
  saveBodyweight(entry: BodyweightEntry): Promise<void>;
  /**
   * Fixes a weigh-in: its weight, its date, or both, in one write. It keeps its id, when it was
   * created, and where it came from. Moving it onto a date that already has a weigh-in replaces that
   * one (one per day). Fails if the weigh-in has been deleted.
   */
  updateBodyweight(entryId: ID, change: { date?: ISODate; weightKg?: number }): Promise<void>;
  deleteBodyweight(entryId: ID): Promise<void>;
  /** Deletes a recording's video and annotated replay; its metrics and report stay (spec 2.8). */
  deleteRecordingVideo(recordingId: ID): Promise<void>;
  /** Deletes a form report, its recording, and the set's link to it. */
  deleteFormReport(reportId: ID): Promise<void>;
  savePreferences(preferences: Preferences): Promise<void>;
  /** Saves Progress's pins and graphs (Preferences.progress) alone; every other setting stays as saved. */
  saveProgressPreferences(progress: ProgressPreferences): Promise<void>;
}

/** How far ahead the calendar is generated, in days. */
export const SCHEDULE_AHEAD_DAYS = 28;

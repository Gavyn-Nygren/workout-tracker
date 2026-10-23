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
import { addDays } from './dates';
import { deriveStreak } from './fake/derived';
import { derivePersonalRecords } from './records';
import { scheduleOccurrences } from './schedule';

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
}

/** How far ahead the calendar is generated. */
const SCHEDULE_AHEAD_DAYS = 28;

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
    savePlan: async (plan) => {
      const existing = data.plans.find((p) => p.id === plan.id);
      const saved: Plan = { ...plan, version: existing ? existing.version + 1 : plan.version, updatedAt: new Date().toISOString() };
      data.plans = existing ? data.plans.map((p) => (p.id === plan.id ? saved : p)) : [...data.plans, saved];
      const keep = data.occurrences.filter((o) => o.planId !== plan.id || o.scheduledDate < data.today || o.sessionId);
      const kept = new Set(keep.map((o) => o.id));
      const upcoming = scheduleOccurrences(saved, data.today, addDays(data.today, SCHEDULE_AHEAD_DAYS)).filter((o) => !kept.has(o.id));
      data.occurrences = [...keep, ...upcoming];
    },
    deletePlan: async (planId) => {
      data.plans = data.plans.filter((p) => p.id !== planId);
      data.occurrences = data.occurrences.filter((o) => o.planId !== planId || o.scheduledDate < data.today || o.sessionId);
    },
    saveExercise: async (exercise) => {
      const existing = data.exercises.some((e) => e.id === exercise.id);
      data.exercises = existing ? data.exercises.map((e) => (e.id === exercise.id ? exercise : e)) : [...data.exercises, exercise];
      exercisesById.set(exercise.id, exercise);
    },
    saveGoal: async (goal) => {
      const existing = data.goals.some((g) => g.id === goal.id);
      data.goals = existing ? data.goals.map((g) => (g.id === goal.id ? goal : g)) : [...data.goals, goal];
      // The weekly streak target follows the frequency goal (spec 2.5).
      if (goal.type === 'frequency') data.streak = deriveStreak(data.sessions, data.today, goal.workoutsPerWeek);
    },
    deleteGoal: async (goalId) => {
      data.goals = data.goals.filter((g) => g.id !== goalId);
    },
    saveBodyweight: async (entry) => {
      data.bodyweight = [...data.bodyweight.filter((e) => e.id !== entry.id && e.date !== entry.date), entry].sort((a, b) => a.date.localeCompare(b.date));
    },
    deleteBodyweight: async (entryId) => {
      data.bodyweight = data.bodyweight.filter((e) => e.id !== entryId);
    },
  };
}

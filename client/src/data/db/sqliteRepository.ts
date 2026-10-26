import { builtinExercises, starterTemplates } from '../content';
import { addDays, todayISO } from '../dates';
import { defaultPreferences } from '../preferences';
import { deriveBadges, deriveStreak } from '../progress';
import { derivePersonalRecords } from '../records';
import { SCHEDULE_AHEAD_DAYS, type DataRepository, type DateRange } from '../repository';
import { planShiftFor, scheduleOccurrences, shiftCovers, shiftedDate } from '../schedule';
import type { BodyweightEntry, Exercise, FormReport, Goal, ID, ISODate, LoggedSet, Plan, PlanShift, Preferences, Recording, ScheduledOccurrence, WorkoutSession } from '../types';
import { insertRowIfMissing, joinSessions, nowISO, putRow, readAll, readAllSync, readOne, readOneSync, splitSession, tombstone } from './rows';
import type { SqlDb, SqlValue } from './sql';

const PREFERENCES_ID = 'me';
/** Weekly target when there's no frequency goal (refined in G3.10). */
const DEFAULT_WEEKLY_TARGET = 4;

const occurrenceColumns = (o: ScheduledOccurrence) => ({ plan_id: o.planId, scheduled_date: o.scheduledDate, session_id: o.sessionId ?? null });
const sessionColumns = (s: WorkoutSession) => ({
  status: s.status,
  day: s.completedDate ?? s.scheduledDate ?? null,
  completed_at: s.completedAt ?? null,
  occurrence_id: s.occurrenceId ?? null,
});

type Options = {
  /** Today's date; tests pin it. */
  today?: () => ISODate;
};

/**
 * The app's data layer on the local SQLite database (roadmap G3.1). Implements the same
 * `DataRepository` contract the sample-data version did, so screens are unchanged.
 */
export type SqliteRepository = DataRepository & {
  /** Drops cached reads; call after changing the database outside the repository (sample-data tools). */
  forgetCache(): void;
};

export function createSqliteRepository(db: SqlDb, options: Options = {}): SqliteRepository {
  const today = options.today ?? todayISO;
  const builtinById = new Map(builtinExercises.map((e) => [e.id, e]));

  // Every completed and in-progress session, loaded once and reused until the next write.
  let sessionsCache: Promise<WorkoutSession[]> | null = null;
  let scheduledThrough: ISODate | null = null;

  /** Runs a write atomically, then drops cached reads. */
  const write = (task: () => void): Promise<void> => {
    try {
      db.withTransactionSync(task);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    } finally {
      sessionsCache = null;
    }
  };

  /**
   * Keeps every active plan's calendar generated a few weeks ahead as days pass. Occurrence ids are
   * stable, so this never duplicates, and it never revives one that was deliberately removed.
   */
  const ensureSchedule = () => {
    const day = today();
    if (scheduledThrough === day) return;
    db.withTransactionSync(() => {
      for (const plan of readAllSync<Plan>(db, 'plans', "status = 'active'")) {
        for (const occ of scheduleOccurrences(plan, day, addDays(day, SCHEDULE_AHEAD_DAYS), shiftsFor(plan.id))) {
          insertRowIfMissing(db, 'occurrences', occ.id, occ, occurrenceColumns(occ));
        }
      }
    });
    scheduledThrough = day;
  };

  const loadSessions = async (clause?: string, params: SqlValue[] = []): Promise<WorkoutSession[]> => {
    const headers = await readAll<WorkoutSession>(db, 'sessions', clause, params, 'day, completed_at');
    if (!headers.length) return [];
    const sets = await db.getAllAsync<{ session_id: string; entry_id: string; position: number; data: string }>(
      `SELECT session_id, entry_id, position, data FROM logged_sets
       WHERE deleted_at IS NULL AND session_id IN (SELECT id FROM sessions WHERE deleted_at IS NULL${clause ? ` AND (${clause})` : ''})`,
      params,
    );
    return joinSessions(headers, sets);
  };
  const allSessions = () => {
    if (sessionsCache) return sessionsCache;
    const loading = loadSessions();
    sessionsCache = loading;
    // A failed read isn't kept, so Retry reads again instead of getting the same error back.
    loading.catch(() => {
      if (sessionsCache === loading) sessionsCache = null;
    });
    return loading;
  };

  const listExercises = async (): Promise<Exercise[]> => [...builtinExercises, ...(await readAll<Exercise>(db, 'custom_exercises'))];
  const exerciseMap = async () => new Map((await listExercises()).map((e) => [e.id, e]));
  const chronological = (sessions: WorkoutSession[]) =>
    sessions.filter((s) => s.status === 'completed').sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''));

  const weeklyTarget = async () => {
    const goals = await readAll<Goal>(db, 'goals');
    // The newest frequency goal wins if there's more than one.
    const frequency = goals.filter((g) => g.type === 'frequency').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    return frequency?.type === 'frequency' ? frequency.workoutsPerWeek : DEFAULT_WEEKLY_TARGET;
  };
  const preferencesSync = (): Preferences => {
    const stored = readOneSync<Preferences>(db, 'preferences', PREFERENCES_ID);
    return stored ? { ...defaultPreferences, ...stored } : defaultPreferences;
  };
  const getStreak = async () => deriveStreak(await allSessions(), today(), await weeklyTarget(), preferencesSync().weekStartsOn);

  /** A plan's pushes forward that haven't been undone. */
  const shiftsFor = (planId: ID) => readAllSync<PlanShift>(db, 'plan_shifts', 'plan_id = ?', [planId]);

  /**
   * Puts a plan's unstarted workouts on their dates after its pushes (spec 2.5). Started workouts
   * stay where they were done. Used after a push and after undoing one.
   */
  const placeUnstarted = (planId: ID) => {
    const shifts = shiftsFor(planId);
    for (const occ of readAllSync<ScheduledOccurrence>(db, 'occurrences', 'plan_id = ? AND session_id IS NULL', [planId])) {
      const original = occ.shiftedFromDate ?? occ.scheduledDate;
      const scheduledDate = shiftedDate(original, shifts, occ.id);
      if (scheduledDate === occ.scheduledDate) continue;
      const { shiftedFromDate: _, ...rest } = occ;
      const placed: ScheduledOccurrence = scheduledDate === original ? { ...rest, scheduledDate } : { ...rest, scheduledDate, shiftedFromDate: original };
      putRow(db, 'occurrences', occ.id, placed, occurrenceColumns(placed));
    }
  };

  /** Future occurrences of a plan that haven't been started. Past ones and started ones are history. */
  const unstartedFuture = (planId: ID) =>
    db.getAllSync<{ id: string; scheduled_date: string; shifted_from: string | null }>(
      "SELECT id, scheduled_date, json_extract(data, '$.shiftedFromDate') AS shifted_from FROM occurrences WHERE plan_id = ? AND scheduled_date >= ? AND session_id IS NULL AND deleted_at IS NULL",
      [planId, today()],
    );

  /**
   * Every plan change goes through here: the new version is stored (and kept, so workouts
   * scheduled under older versions still show their original prescription), then the plan's
   * future workouts that haven't started are rebuilt from it (spec 2.5).
   */
  const commitPlan = (plan: Plan) => {
    putRow(db, 'plans', plan.id, plan, { status: plan.status });
    insertRowIfMissing(db, 'plan_versions', `${plan.id}@${plan.version}`, plan, { plan_id: plan.id, version: plan.version });
    const day = today();
    const shifts = shiftsFor(plan.id);
    // Pushes can move workouts past the usual 4 weeks ahead, and an earlier save may have stored
    // some that far out: rebuild as far as either reaches, so none is dropped without a check.
    const reach = shifts.reduce((sum, s) => sum + Math.max(0, s.days), 0);
    const future = unstartedFuture(plan.id);
    let horizon = addDays(day, SCHEDULE_AHEAD_DAYS + reach);
    for (const { scheduled_date } of future) if (scheduled_date > horizon) horizon = scheduled_date;
    const upcoming = scheduleOccurrences(plan, day, horizon, shifts);
    const wanted = new Set(upcoming.map((o) => o.id));
    // A missed workout the user pushed forward is still that missed workout: like a missed one on
    // its day, an edit never deletes it, even if the plan no longer has its original day.
    const pushedMiss = (from: string | null) => plan.status === 'active' && from !== null && from < day;
    for (const { id, shifted_from } of future) if (!wanted.has(id) && !pushedMiss(shifted_from)) tombstone(db, 'occurrences', id);
    for (const occ of upcoming) {
      const current = readOneSync<ScheduledOccurrence>(db, 'occurrences', occ.id);
      // Started workouts stay where they were done, and past ones on their day: an edit only rebuilds the future.
      if (current?.sessionId || (current && current.scheduledDate < day)) continue;
      putRow(db, 'occurrences', occ.id, occ, occurrenceColumns(occ));
    }
  };

  ensureSchedule();

  return {
    today,
    forgetCache: () => {
      sessionsCache = null;
      scheduledThrough = null;
    },

    // Reads

    getPreferences: async () => {
      const stored = await readOne<Preferences>(db, 'preferences', PREFERENCES_ID);
      // Settings added in later versions fall back to their defaults.
      return stored ? { ...defaultPreferences, ...stored, notifications: { ...defaultPreferences.notifications, ...stored.notifications } } : defaultPreferences;
    },
    listExercises,
    getExercise: async (id) => builtinById.get(id) ?? (await readOne<Exercise>(db, 'custom_exercises', id)),
    listPlans: () => readAll<Plan>(db, 'plans'),
    getPlan: (id) => readOne<Plan>(db, 'plans', id),
    listPlanVersions: () => readAll<Plan>(db, 'plan_versions', undefined, [], 'plan_id, version'),
    listPlanShifts: async () => (await readAll<PlanShift>(db, 'plan_shifts')).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    listTemplates: async () => starterTemplates,
    listOccurrences: (range: DateRange) => {
      ensureSchedule();
      return readAll<ScheduledOccurrence>(db, 'occurrences', 'scheduled_date BETWEEN ? AND ?', [range.from, range.to], 'scheduled_date');
    },
    listSessions: (range?: DateRange) => (range ? loadSessions('day BETWEEN ? AND ?', [range.from, range.to]) : allSessions()),
    getSession: async (id) => (await loadSessions('id = ?', [id]))[0],
    listBodyweight: () => readAll<BodyweightEntry>(db, 'bodyweight', undefined, [], 'date'),
    listPersonalRecords: async (filter) => {
      const records = derivePersonalRecords(chronological(await allSessions()), await exerciseMap());
      return records.filter((r) => (!filter?.exerciseId || r.exerciseId === filter.exerciseId) && (!filter?.since || r.achievedDate >= filter.since));
    },
    listGoals: () => readAll<Goal>(db, 'goals'),
    listBadges: async () => {
      const sessions = chronological(await allSessions());
      const reports = (await readAll<FormReport>(db, 'form_reports')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return deriveBadges(sessions, await exerciseMap(), reports, await getStreak());
    },
    getStreak,
    listFormReports: (filter) => (filter?.exerciseId ? readAll<FormReport>(db, 'form_reports', 'exercise_id = ?', [filter.exerciseId]) : readAll<FormReport>(db, 'form_reports')),
    getFormReport: (id) => readOne<FormReport>(db, 'form_reports', id),
    getRecording: (id) => readOne<Recording>(db, 'recordings', id),

    // Writes

    saveSession: (session) =>
      write(() => {
        const { header, sets } = splitSession(session);
        putRow(db, 'sessions', session.id, header, sessionColumns(session));
        const keep = new Set(sets.map((s) => s.id));
        for (const { id } of db.getAllSync<{ id: string }>('SELECT id FROM logged_sets WHERE session_id = ? AND deleted_at IS NULL', [session.id])) {
          if (!keep.has(id)) tombstone(db, 'logged_sets', id);
        }
        for (const row of sets) putRow(db, 'logged_sets', row.id, row.set, { session_id: session.id, entry_id: row.entryId, position: row.position });
        if (session.occurrenceId) {
          const occ = readOneSync<ScheduledOccurrence>(db, 'occurrences', session.occurrenceId);
          if (occ && occ.sessionId !== session.id) {
            const linked = { ...occ, sessionId: session.id };
            putRow(db, 'occurrences', occ.id, linked, occurrenceColumns(linked));
          }
        }
      }),

    deleteSession: (sessionId) =>
      write(() => {
        const session = readOneSync<WorkoutSession>(db, 'sessions', sessionId);
        if (!session) return;
        tombstone(db, 'sessions', sessionId);
        for (const { id } of db.getAllSync<{ id: string }>('SELECT id FROM logged_sets WHERE session_id = ? AND deleted_at IS NULL', [sessionId])) {
          tombstone(db, 'logged_sets', id);
        }
        for (const table of ['form_reports', 'recordings'] as const) {
          for (const { id } of db.getAllSync<{ id: string }>(`SELECT id FROM ${table} WHERE session_id = ? AND deleted_at IS NULL`, [sessionId])) {
            tombstone(db, table, id);
          }
        }
        // The scheduled workout is free again: planned if it's still ahead, missed if its day has passed.
        const occ = session.occurrenceId ? readOneSync<ScheduledOccurrence>(db, 'occurrences', session.occurrenceId) : undefined;
        if (occ?.sessionId === sessionId) {
          const freed: ScheduledOccurrence = { ...occ, sessionId: undefined };
          putRow(db, 'occurrences', occ.id, freed, occurrenceColumns(freed));
          // An undo while it was started may have changed where it belongs.
          placeUnstarted(occ.planId);
        }
      }),

    updatePlanWorkout: (planId, workoutId, blocks) =>
      write(() => {
        const plan = readOneSync<Plan>(db, 'plans', planId);
        if (!plan) throw new Error(`Plan ${planId} not found`);
        commitPlan({ ...plan, version: plan.version + 1, updatedAt: nowISO(), workouts: plan.workouts.map((w) => (w.id === workoutId ? { ...w, blocks } : w)) });
      }),

    savePlan: (plan) =>
      write(() => {
        const existing = readOneSync<Plan>(db, 'plans', plan.id);
        commitPlan({ ...plan, version: existing ? existing.version + 1 : plan.version, updatedAt: nowISO() });
      }),

    deletePlan: (planId) =>
      write(() => {
        tombstone(db, 'plans', planId);
        // Workouts that were never started go, past (missed) ones included; logged history stays.
        const unstarted = db.getAllSync<{ id: string }>('SELECT id FROM occurrences WHERE plan_id = ? AND session_id IS NULL AND deleted_at IS NULL', [planId]);
        for (const { id } of unstarted) tombstone(db, 'occurrences', id);
        for (const shift of shiftsFor(planId)) tombstone(db, 'plan_shifts', shift.id);
      }),

    pushPlanForward: (occurrenceId, shiftId) =>
      write(() => {
        const occurrence = readOneSync<ScheduledOccurrence>(db, 'occurrences', occurrenceId);
        const plan = occurrence ? readOneSync<Plan>(db, 'plans', occurrence.planId) : undefined;
        if (!occurrence || !plan) throw new Error('That workout is no longer scheduled');
        const planned = planShiftFor({ id: shiftId, plan, occurrence, today: today(), weekStartsOn: preferencesSync().weekStartsOn, now: nowISO() });
        if (!planned) throw new Error('Only a missed workout can be pushed forward');
        // Workouts in range that were already started stay where they are, now and later.
        const keptIds = readAllSync<ScheduledOccurrence>(db, 'occurrences', 'plan_id = ? AND session_id IS NOT NULL', [plan.id])
          .filter((o) => shiftCovers(planned, o.shiftedFromDate ?? o.scheduledDate))
          .map((o) => o.id);
        // The plan's other unstarted workouts on the missed day move with it, wherever the plan first put them.
        const alongIds = readAllSync<ScheduledOccurrence>(db, 'occurrences', 'plan_id = ? AND session_id IS NULL AND scheduled_date = ?', [plan.id, occurrence.scheduledDate])
          .filter((o) => o.id !== occurrence.id && !shiftCovers(planned, o.shiftedFromDate ?? o.scheduledDate))
          .map((o) => o.id);
        const shift: PlanShift = { ...planned, ...(keptIds.length ? { keptIds } : {}), ...(alongIds.length ? { alongIds } : {}) };
        putRow(db, 'plan_shifts', shift.id, shift, { plan_id: plan.id });
        placeUnstarted(plan.id);
      }),

    undoPlanShift: (shiftId) =>
      write(() => {
        const shift = readOneSync<PlanShift>(db, 'plan_shifts', shiftId);
        if (!shift) return;
        tombstone(db, 'plan_shifts', shift.id);
        placeUnstarted(shift.planId);
        // Workouts moved back leave room at the end of the 4 weeks ahead; the next read fills it.
        scheduledThrough = null;
      }),

    saveExercise: (exercise) =>
      write(() => {
        if (exercise.source !== 'custom') throw new Error('Built-in exercises ship with the app and can’t be edited');
        putRow(db, 'custom_exercises', exercise.id, exercise);
      }),

    saveGoal: (goal) => write(() => void putRow(db, 'goals', goal.id, goal)),
    deleteGoal: (goalId) => write(() => void tombstone(db, 'goals', goalId)),

    saveBodyweight: (entry) =>
      write(() => {
        // One weigh-in per day: a new one on the same date replaces it.
        for (const { id } of db.getAllSync<{ id: string }>('SELECT id FROM bodyweight WHERE date = ? AND id != ? AND deleted_at IS NULL', [entry.date, entry.id])) {
          tombstone(db, 'bodyweight', id);
        }
        putRow(db, 'bodyweight', entry.id, entry, { date: entry.date });
      }),
    deleteBodyweight: (entryId) => write(() => void tombstone(db, 'bodyweight', entryId)),

    deleteRecordingVideo: (recordingId) =>
      write(() => {
        const recording = readOneSync<Recording>(db, 'recordings', recordingId);
        if (recording) putRow(db, 'recordings', recording.id, { ...recording, videoUri: undefined }, { session_id: recording.sessionId });
        for (const report of readAllSync<FormReport>(db, 'form_reports')) {
          if (report.recordingId !== recordingId) continue;
          const updated = { ...report, hasReplay: false, updatedAt: nowISO() };
          putRow(db, 'form_reports', report.id, updated, { exercise_id: report.exerciseId, session_id: report.sessionId });
        }
      }),

    deleteFormReport: (reportId) =>
      write(() => {
        const report = readOneSync<FormReport>(db, 'form_reports', reportId);
        if (!report) return;
        tombstone(db, 'form_reports', report.id);
        tombstone(db, 'recordings', report.recordingId);
        // The set keeps its numbers but loses the link to the deleted recording.
        const rows = db.getAllSync<{ id: string; entry_id: string; position: number; data: string }>(
          'SELECT id, entry_id, position, data FROM logged_sets WHERE session_id = ? AND deleted_at IS NULL',
          [report.sessionId],
        );
        for (const row of rows) {
          const set = JSON.parse(row.data) as LoggedSet;
          if (set.recordingId !== report.recordingId) continue;
          putRow(db, 'logged_sets', row.id, { ...set, recordingId: undefined }, { session_id: report.sessionId, entry_id: row.entry_id, position: row.position });
        }
      }),

    savePreferences: (preferences) => write(() => void putRow(db, 'preferences', PREFERENCES_ID, preferences)),
  };
}

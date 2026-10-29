import { badgeState, type BadgeInput } from '../badges';
import { countsAsWorkout } from '../calculations';
import { builtinExercises, starterTemplates } from '../content';
import { addDays, daysBetween, isISODate, startOfWeek, todayISO } from '../dates';
import { cleanProgress, withPreferenceDefaults } from '../preferences';
import { deriveStreak } from '../progress';
import { derivePersonalRecords } from '../records';
import { SCHEDULE_AHEAD_DAYS, type DataRepository, type DateRange } from '../repository';
import { planShiftFor, scheduleOccurrences, shiftCovers, shiftedDate } from '../schedule';
import type {
  BodyweightEntry,
  Exercise,
  FormReport,
  FrozenWeekTarget,
  Goal,
  ID,
  ISODate,
  LoggedSet,
  Plan,
  PlanShift,
  Preferences,
  PersonalRecord,
  Recording,
  ScheduledOccurrence,
  StreakState,
  Weekday,
  WorkoutSession,
} from '../types';
import { plannedPerWeek, weekTargetsFromHistory, type WeekTarget, type WeekTargetLookup } from '../weekTargets';
import { blankAutoFilledPlanRests } from './blankPlanRests';
import { insertRowIfMissing, joinSessions, nowISO, PREFERENCES_ID, putRow, readAll, readAllSync, readOne, readOneSync, splitSession, tombstone } from './rows';
import type { SqlDb, SqlValue } from './sql';
import { legacyStreakRule, upgradeToG310 } from './upgradeG310';


/**
 * After a week-start switch: the week stored under another setting that a week starting `week`
 * takes its target from. That's the stored week sharing most of its days (4 or more), the newest
 * if two settings have one.
 */
function carriedOver(week: ISODate, others: FrozenWeekTarget[]): FrozenWeekTarget | undefined {
  let best: { row: FrozenWeekTarget; shared: number } | undefined;
  for (const row of others) {
    const shared = 7 - Math.abs(daysBetween(row.weekStart, week));
    if (shared < 4) continue;
    if (!best || shared > best.shared || (shared === best.shared && row.frozenAt > best.row.frozenAt)) best = { row, shared };
  }
  return best?.row;
}

/**
 * A regrouped week's target after a week-start switch, so the switch keeps whether the old week was
 * met: the old week's target, lowered to what the regrouped week completed if the old week was met,
 * raised past it if it wasn't. (A met old week whose workouts all fall outside the regrouped week
 * can't stay met: a target is at least 1.)
 */
export function regroupedTarget(oldTarget: number, oldCompleted: number, completed: number): number {
  const target = Math.max(1, Math.round(oldTarget));
  return oldCompleted >= target ? Math.min(target, Math.max(1, completed)) : Math.max(target, completed + 1);
}

/** A scheduled workout as a stored week keeps it: its date, and its occurrence id where known. */
export type PlannedSlot = { date: ISODate; id?: ID };

/** A stored week's planned workouts, when it stored their dates. */
const slotsOf = (row: FrozenWeekTarget): PlannedSlot[] | undefined =>
  row.plannedDates?.map((date, i) => (row.plannedIds?.[i] ? { date, id: row.plannedIds[i] } : { date }));

/**
 * A regrouped week's scheduled workouts after a week-start switch, one per workout, for its planned
 * count and Perfect Week. Each day counts what the old setting's stored week covering it had on that
 * day when it was stored (the earliest, if two settings have one), so a push or plan delete after
 * that week ended can't take a missed workout out of the regrouped week. A day no stored week covers
 * with dates (the old setting's week under way at the switch) counts what's stored now: `now` is the
 * workouts stored in the regrouped week. A workout pushed from one old week into the next after the
 * first was stored is in both: it counts once, where it was stored last (now is latest).
 */
export function regroupedPlanned(week: ISODate, others: FrozenWeekTarget[], now: PlannedSlot[]): PlannedSlot[] {
  // Each workout found, with when its source was stored (undefined: now).
  const found: { slot: PlannedSlot; storedAt?: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(week, i);
    let snapshot: FrozenWeekTarget | undefined;
    for (const row of others) {
      if (!row.plannedDates || day < row.weekStart || day > addDays(row.weekStart, 6)) continue;
      if (!snapshot || row.frozenAt < snapshot.frozenAt) snapshot = row;
    }
    const stored = snapshot && slotsOf(snapshot);
    for (const slot of stored ?? now) if (slot.date === day) found.push({ slot, storedAt: stored ? snapshot!.frozenAt : undefined });
  }
  const later = (a?: string, b?: string) => a === undefined || (b !== undefined && a > b);
  const last = new Map<ID, (typeof found)[number]>();
  for (const f of found) {
    const seen = f.slot.id === undefined ? undefined : last.get(f.slot.id);
    if (f.slot.id !== undefined && (!seen || later(f.storedAt, seen.storedAt))) last.set(f.slot.id, f);
  }
  return found.filter((f) => f.slot.id === undefined || last.get(f.slot.id) === f).map((f) => f.slot);
}

/** A reopened workout (in progress again, its completion time kept) as it was before the reopen. */
const asBeforeReopen = (s: WorkoutSession): WorkoutSession => (s.status === 'in_progress' && s.completedAt ? { ...s, status: 'completed' } : s);
/** The same list with reopened workouts as they were before (the same array when there are none). */
const beforeReopens = (sessions: WorkoutSession[]): WorkoutSession[] =>
  sessions.some((s) => s.status === 'in_progress' && s.completedAt) ? sessions.map(asBeforeReopen) : sessions;
/** Sessions that were finished, reopened ones included (in progress again only while open). */
const FINISHED_CLAUSE = "status = 'completed' OR (status = 'in_progress' AND completed_at IS NOT NULL)";

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

  // Every completed and in-progress session, loaded once and reused until the next write. Records
  // and the streak are derived from them, so they're kept until the next write too (the streak only
  // for the day it was read: a week ends, and a reached goal stops counting, at midnight).
  let sessionsCache: Promise<WorkoutSession[]> | null = null;
  let recordsCache: Promise<PersonalRecord[]> | null = null;
  let streakCache: { day: ISODate; streak: Promise<StreakState> } | null = null;
  let scheduledThrough: ISODate | null = null;
  const dropCaches = () => {
    sessionsCache = null;
    recordsCache = null;
    streakCache = null;
  };

  /**
   * Runs a write atomically, then drops cached reads. `keepCaches`: for a write that can't change
   * workouts, records, or the streak (weigh-ins, since sets keep their own bodyweight; Progress's
   * pins and graphs), so the next read doesn't rebuild them from every workout.
   */
  const write = (task: () => void, { keepCaches = false } = {}): Promise<void> => {
    try {
      db.withTransactionSync(task);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    } finally {
      if (!keepCaches) dropCaches();
    }
  };

  /** A weigh-in's weight must be a real weight and its date a calendar date (the screens check the plausible range). */
  const checkWeighIn = (entry: Pick<BodyweightEntry, 'date' | 'weightKg'>) => {
    if (!isISODate(entry.date)) throw new Error('A weigh-in needs a date');
    if (!Number.isFinite(entry.weightKg) || entry.weightKg <= 0) throw new Error('A weigh-in needs a weight');
  };

  /** One weigh-in per day: any other live weigh-in on `date` is replaced (tombstoned). */
  const replaceWeighInsOn = (date: ISODate, keepId: ID) => {
    for (const { id } of db.getAllSync<{ id: string }>('SELECT id FROM bodyweight WHERE date = ? AND id != ? AND deleted_at IS NULL', [date, keepId])) {
      tombstone(db, 'bodyweight', id);
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

  /** Every personal record, derived once per write (the records read and badges share it). */
  const allRecords = () => {
    if (recordsCache) return recordsCache;
    const loading = (async () => derivePersonalRecords(chronological(await allSessions()), await exerciseMap()))();
    recordsCache = loading;
    loading.catch(() => {
      if (recordsCache === loading) recordsCache = null;
    });
    return loading;
  };

  const preferencesSync = (): Preferences => {
    return withPreferenceDefaults(readOneSync<Preferences>(db, 'preferences', PREFERENCES_ID));
  };

  /**
   * Finished workouts, read synchronously (inside a write's transaction). A reopened workout counts
   * as it was before the reopen while it's open, so looking at Home mid-edit can't freeze a finished
   * week with a target from a moment when that workout didn't count.
   */
  const finishedSessionsSync = (): WorkoutSession[] => {
    const headers = readAllSync<WorkoutSession>(db, 'sessions', FINISHED_CLAUSE);
    if (!headers.length) return [];
    const sets = db.getAllSync<{ session_id: string; entry_id: string; position: number; data: string }>(
      `SELECT session_id, entry_id, position, data FROM logged_sets
       WHERE deleted_at IS NULL AND session_id IN (SELECT id FROM sessions WHERE deleted_at IS NULL AND (${FINISHED_CLAUSE}))`,
      [],
    );
    return joinSessions(headers, sets).map(asBeforeReopen);
  };

  /**
   * The weekly goals the streak target reads (the newest one that isn't archived wins; goals.ts),
   * and the workouts that decide whether one is archived (`sessions`, with reopened workouts as
   * they were before). The streak reads goals only through here. Stays synchronous: writes call
   * it, through freezeEndedWeeks, inside their transaction.
   */
  const weeklyGoalsSync = (sessions: () => WorkoutSession[]) => {
    const goals = readAllSync<Goal>(db, 'goals').filter((g) => g.type === 'frequency');
    // Only a weekly goal with a deadline can be reached, and so archived; only then are workouts read.
    return { goals, sessions: goals.some((g) => g.deadline) ? sessions() : [] };
  };

  /** Scheduled workouts from `from` through `to`, from any plan, on their dates after pushes. */
  const plannedBetween = (from: ISODate, to: ISODate) =>
    db
      .getAllSync<{ id: string; scheduled_date: string }>('SELECT id, scheduled_date FROM occurrences WHERE deleted_at IS NULL AND scheduled_date BETWEEN ? AND ?', [from, to])
      .map((row) => ({ id: row.id, scheduledDate: row.scheduled_date }));

  /**
   * Stores the streak target of every finished week that doesn't have one yet (G3.10), so a later
   * goal or plan edit can't rewrite a past streak. Lazy: it runs when the streak is read, and inside
   * every write that can change a finished week's target, before the change (writeAfterFreeze).
   * - A week is frozen the first time this runs after it ends, with the rules as they stand then.
   * - Weeks that ended before the update to G3.10 keep G3.9's rule (upgradeG310.ts).
   * - Rows belong to a week-start setting. A switch (savePreferences, `carry`) freezes the weeks
   *   that ended under the old setting at once: each takes the stored target of the old setting's
   *   week it shares most days with, adjusted so it stays met or not met (regroupedTarget), so the
   *   switch can't rewrite a past streak. Its planned count is its own: the workouts on its days as
   *   the old weeks stored them (regroupedPlanned). Weeks that end after the switch, including
   *   the one under way when it was made, get the rules as they stand when they end, like any other
   *   week. Switching back finds the old setting's rows again.
   * - Covers the weeks from the first finished workout or stored scheduled workout, whichever is
   *   earlier, to last week. Weeks before the first counted workout only matter to Perfect Week.
   * - `sessions`: every workout, when the caller already has them. Call inside a transaction.
   */
  const freezeEndedWeeks = ({ carry = false, sessions }: { carry?: boolean; sessions?: WorkoutSession[] } = {}) => {
    const first = db.getFirstSync<{ day: string | null }>(
      `SELECT MIN(day) AS day FROM (
         SELECT MIN(day) AS day FROM sessions WHERE deleted_at IS NULL AND (${FINISHED_CLAUSE})
         UNION ALL SELECT MIN(scheduled_date) AS day FROM occurrences WHERE deleted_at IS NULL)`,
      [],
    )?.day;
    if (!first) return;
    const { weekStartsOn } = preferencesSync();
    const from = startOfWeek(first, weekStartsOn);
    const last = addDays(startOfWeek(today(), weekStartsOn), -7);
    if (from > last) return;
    const stored = db.getAllSync<{ week_start: string }>(
      'SELECT week_start FROM streak_weeks WHERE week_starts_on = ? AND week_start BETWEEN ? AND ? AND deleted_at IS NULL',
      [weekStartsOn, from, last],
    );
    if (stored.length === daysBetween(from, last) / 7 + 1) return;
    const frozen = new Set(stored.map((row) => row.week_start));
    const otherSettings = carry
      ? readAllSync<FrozenWeekTarget>(db, 'streak_weeks', 'week_starts_on != ? AND week_start BETWEEN ? AND ?', [weekStartsOn, addDays(from, -6), addDays(last, 6)])
      : [];
    const legacy = legacyStreakRule(db);
    const occurrences = plannedBetween(from, addDays(last, 6));
    const planned = plannedPerWeek(occurrences, weekStartsOn);
    // Each week's scheduled workouts, stored with it for Perfect Week and a later switch (regroupedPlanned).
    const slotsByWeek = new Map<ISODate, PlannedSlot[]>();
    for (const { id, scheduledDate } of occurrences) {
      const week = startOfWeek(scheduledDate, weekStartsOn);
      slotsByWeek.set(week, [...(slotsByWeek.get(week) ?? []), { date: scheduledDate, id }]);
    }
    const byDate = (a: PlannedSlot, b: PlannedSlot) => a.date.localeCompare(b.date) || (a.id ?? '').localeCompare(b.id ?? '');
    // Each worked out only if a week needs it: most freezes are one week, carried, or legacy.
    let finished: WorkoutSession[] | undefined;
    const finishedOnce = () => (finished ??= sessions ? beforeReopens(sessions) : finishedSessionsSync());
    let live: WeekTargetLookup | undefined;
    const rulesNow = (week: ISODate) => (live ??= weekTargetsFromHistory({ ...weeklyGoalsSync(finishedOnce), occurrences, weekStartsOn, today: today() }))(week);
    let countedDays: ISODate[] | undefined;
    /** Workouts that count, done in the 7 days from `weekStart` (as deriveStreak counts a week). */
    const completedIn = (weekStart: ISODate) => {
      countedDays ??= finishedOnce()
        .filter(countsAsWorkout)
        .map((s) => s.completedDate!);
      const end = addDays(weekStart, 6);
      return countedDays.filter((d) => d >= weekStart && d <= end).length;
    };
    const frozenAt = nowISO();
    for (let week = from; week <= last; week = addDays(week, 7)) {
      if (frozen.has(week)) continue;
      const old = carriedOver(week, otherSettings);
      let kept: WeekTarget;
      let slots = (slotsByWeek.get(week) ?? []).sort(byDate);
      if (old) {
        // The carried target keeps the streak as it was. The planned workouts are the regrouped
        // week's own, as its days stood when the old weeks were stored (Perfect Week reads them).
        slots = regroupedPlanned(week, otherSettings, slots);
        kept = { target: regroupedTarget(old.target, completedIn(old.weekStart), completedIn(week)), source: old.source, planned: slots.length };
      } else {
        if (legacy && addDays(week, 6) < legacy.before) kept = { target: legacy.target, source: 'legacy', planned: planned.get(week) ?? 0 };
        else kept = rulesNow(week);
        // A week frozen at a switch without a week to carry from (a switch made on its last day)
        // still takes its days as the old setting's stored weeks had them, for Perfect Week. Its
        // target is unchanged, so the streak is too.
        if (otherSettings.length) slots = regroupedPlanned(week, otherSettings, slots);
      }
      const plannedIds = slots.every((s) => s.id) ? slots.map((s) => s.id!) : undefined;
      const row: FrozenWeekTarget = {
        weekStart: week,
        weekStartsOn,
        target: kept.target,
        source: kept.source,
        planned: kept.planned,
        plannedDates: slots.map((s) => s.date),
        ...(plannedIds && { plannedIds }),
        frozenAt,
      };
      insertRowIfMissing(db, 'streak_weeks', `${week}@${weekStartsOn}`, row, { week_start: week, week_starts_on: weekStartsOn }, frozenAt);
    }
  };

  /** This week's target as things stand now (and any finished week not frozen yet). */
  const liveTarget = (weekStart: ISODate, weekStartsOn: Weekday, weekly: ReturnType<typeof weeklyGoalsSync>) =>
    weekTargetsFromHistory({ ...weekly, occurrences: plannedBetween(weekStart, addDays(weekStart, 6)), weekStartsOn, today: today() })(weekStart);

  const readStreak = async (day: ISODate): Promise<StreakState> => {
    ensureSchedule();
    const sessions = await allSessions();
    db.withTransactionSync(() => freezeEndedWeeks({ sessions }));
    const { weekStartsOn } = preferencesSync();
    const stored = await readAll<FrozenWeekTarget>(db, 'streak_weeks', 'week_starts_on = ? AND week_start < ?', [weekStartsOn, startOfWeek(day, weekStartsOn)]);
    const frozen = new Map(stored.map((w) => [w.weekStart, w]));
    const weekly = weeklyGoalsSync(() => beforeReopens(sessions));
    const targets: WeekTargetLookup = (week) => {
      const kept = frozen.get(week);
      return kept ? { target: kept.target, source: kept.source, planned: kept.planned, frozen: true } : liveTarget(week, weekStartsOn, weekly);
    };
    return deriveStreak(sessions, day, targets, weekStartsOn);
  };

  /** The streak, worked out once per write and day (Home's streak and its badges share it). */
  const getStreak = (): Promise<StreakState> => {
    const day = today();
    if (streakCache?.day === day) return streakCache.streak;
    const loading = readStreak(day);
    streakCache = { day, streak: loading };
    loading.catch(() => {
      if (streakCache?.streak === loading) streakCache = null;
    });
    return loading;
  };

  /** Everything badges are derived from (badges.ts). */
  const badgeInput = async (): Promise<BadgeInput> => {
    const streak = await getStreak();
    const sessions = await allSessions();
    const exercisesById = await exerciseMap();
    const { units, weekStartsOn } = preferencesSync();
    // Every finished week's planned count, weeks before the first counted workout too (Perfect Week).
    const frozenWeeks = await readAll<FrozenWeekTarget>(db, 'streak_weeks', 'week_starts_on = ?', [weekStartsOn]);
    return {
      sessions,
      exercisesById,
      formReports: await readAll<FormReport>(db, 'form_reports'),
      records: await allRecords(),
      streak,
      frozenWeeks: frozenWeeks.map(({ weekStart, planned, plannedDates, plannedIds }) => ({ weekStart, planned, plannedDates, plannedIds })),
      // Every stored scheduled workout, past and upcoming (getStreak just filled the calendar).
      occurrences: await readAll<ScheduledOccurrence>(db, 'occurrences'),
      plans: await readAll<Plan>(db, 'plans'),
      planVersions: await readAll<Plan>(db, 'plan_versions'),
      bodyweight: await readAll<BodyweightEntry>(db, 'bodyweight'),
      units,
      weekStartsOn,
      today: today(),
    };
  };

  /**
   * A write that can change a week's streak target (goals, plans, pushes, the week start): finished
   * weeks are frozen first, in the same transaction, so the change only reaches this week on.
   */
  const writeAfterFreeze = (task: () => void) =>
    write(() => {
      freezeEndedWeeks();
      task();
    });

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

  // Once per database: plans made before G3.8 lose the rests the app filled in (see blankPlanRests.ts).
  blankAutoFilledPlanRests(db);
  // Once per database that had workouts or goals before G3.10: keep what they meant then.
  upgradeToG310(db, today());
  ensureSchedule();

  return {
    today,
    forgetCache: () => {
      dropCaches();
      scheduledThrough = null;
    },

    // Reads

    getPreferences: async () => {
      // Settings added in later versions fall back to their defaults.
      return withPreferenceDefaults(await readOne<Preferences>(db, 'preferences', PREFERENCES_ID));
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
      const records = await allRecords();
      return records.filter((r) => (!filter?.exerciseId || r.exerciseId === filter.exerciseId) && (!filter?.since || r.achievedDate >= filter.since));
    },
    listGoals: () => readAll<Goal>(db, 'goals'),
    listBadges: async () => badgeState(await badgeInput()).earned,
    getBadges: async () => badgeState(await badgeInput(), Infinity),
    getStreak,
    listFormReports: (filter) => (filter?.exerciseId ? readAll<FormReport>(db, 'form_reports', 'exercise_id = ?', [filter.exerciseId]) : readAll<FormReport>(db, 'form_reports')),
    getFormReport: (id) => readOne<FormReport>(db, 'form_reports', id),
    getRecording: (id) => readOne<Recording>(db, 'recordings', id),

    // Writes

    // Workouts decide when a weekly goal with a deadline is reached and archived, and so a week's
    // target: finished weeks are frozen first. A reopened workout counts as it was (finishedSessionsSync).
    saveSession: (session) =>
      writeAfterFreeze(() => {
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
      // A freed workout can move back to a date in a finished week (an undo while it was started).
      writeAfterFreeze(() => {
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
      writeAfterFreeze(() => {
        const plan = readOneSync<Plan>(db, 'plans', planId);
        if (!plan) throw new Error(`Plan ${planId} not found`);
        commitPlan({ ...plan, version: plan.version + 1, updatedAt: nowISO(), workouts: plan.workouts.map((w) => (w.id === workoutId ? { ...w, blocks } : w)) });
      }),

    savePlan: (plan) =>
      writeAfterFreeze(() => {
        const existing = readOneSync<Plan>(db, 'plans', plan.id);
        commitPlan({ ...plan, version: existing ? existing.version + 1 : plan.version, updatedAt: nowISO() });
      }),

    deletePlan: (planId) =>
      writeAfterFreeze(() => {
        tombstone(db, 'plans', planId);
        // Workouts that were never started go, past (missed) ones included; logged history stays.
        const unstarted = db.getAllSync<{ id: string }>('SELECT id FROM occurrences WHERE plan_id = ? AND session_id IS NULL AND deleted_at IS NULL', [planId]);
        for (const { id } of unstarted) tombstone(db, 'occurrences', id);
        for (const shift of shiftsFor(planId)) tombstone(db, 'plan_shifts', shift.id);
      }),

    pushPlanForward: (occurrenceId, shiftId) =>
      writeAfterFreeze(() => {
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
      writeAfterFreeze(() => {
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

    saveGoal: (goal) => writeAfterFreeze(() => void putRow(db, 'goals', goal.id, goal)),
    deleteGoal: (goalId) => writeAfterFreeze(() => void tombstone(db, 'goals', goalId)),

    // Weigh-ins keep the workout caches: a set keeps the bodyweight saved with it, so records and
    // the streak never read the log (badges read it fresh).
    saveBodyweight: (entry) =>
      write(
        () => {
          checkWeighIn(entry);
          // One weigh-in per day: a new one on the same date replaces it.
          replaceWeighInsOn(entry.date, entry.id);
          putRow(db, 'bodyweight', entry.id, entry, { date: entry.date });
        },
        { keepCaches: true },
      ),
    updateBodyweight: (entryId, change) =>
      write(
        () => {
          const existing = readOneSync<BodyweightEntry>(db, 'bodyweight', entryId);
          if (!existing) throw new Error('That weigh-in was deleted');
          const updated: BodyweightEntry = {
            ...existing,
            ...(change.date !== undefined && { date: change.date }),
            ...(change.weightKg !== undefined && { weightKg: change.weightKg }),
            updatedAt: nowISO(),
          };
          checkWeighIn(updated);
          if (updated.date === existing.date && updated.weightKg === existing.weightKg) return;
          // Moved onto a day that has a weigh-in: this one replaces it, as a new one would.
          replaceWeighInsOn(updated.date, entryId);
          putRow(db, 'bodyweight', entryId, updated, { date: updated.date });
        },
        { keepCaches: true },
      ),
    deleteBodyweight: (entryId) => write(() => void tombstone(db, 'bodyweight', entryId), { keepCaches: true }),

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

    // Weeks are frozen under the old week start first, so switching back finds them again. Then the
    // weeks that ended under it are frozen under the new one, carrying their targets over.
    savePreferences: (preferences) =>
      writeAfterFreeze(() => {
        putRow(db, 'preferences', PREFERENCES_ID, preferences);
        freezeEndedWeeks({ carry: true });
      }),

    // Pins and graphs can't change a streak or a record, so nothing is frozen and the caches stay.
    saveProgressPreferences: (progress) =>
      write(
        () => {
          const stored = readOneSync<Partial<Preferences>>(db, 'preferences', PREFERENCES_ID);
          putRow(db, 'preferences', PREFERENCES_ID, { ...stored, progress: cleanProgress(progress) });
        },
        { keepCaches: true },
      ),
  };
}

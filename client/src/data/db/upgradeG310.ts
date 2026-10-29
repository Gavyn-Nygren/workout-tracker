import { builtinExercises } from '../content';
import { localDateOf } from '../dates';
import { formGoalAimsHigher, latestFormAngle, reportAngle } from '../goals';
import { withPreferenceDefaults } from '../preferences';
import type { BodyweightEntry, Exercise, FormReport, Goal, ISODate, LoggedSet, Preferences, UnitSystem } from '../types';
import { kgToLb } from '../units';
import { nowISO, putRow, readAllSync, readOneSync } from './rows';
import type { SqlDb } from './sql';

/**
 * One-time changes for a database that held workouts or goals before G3.10 (migration 4 marks it),
 * so the update itself doesn't change what they meant:
 * - Streak weeks that ended before the update keep G3.9's rule: the newest weekly goal's workouts
 *   per week, else 4. The rule is stored with the update date, and the repository freezes those
 *   weeks with it (G3.10 decision A: a finished week keeps the target it had when it ended).
 * - Weight × reps goals on bodyweight exercises compared total load (bodyweight + added) before;
 *   now they compare added weight, as records do. The target becomes that total minus the
 *   bodyweight when the goal was set, and the title is rebuilt the way the goal form writes it.
 * - Form goals took their direction from start → target before; now from the joint (knee and hip
 *   deeper, ankle higher). G3.9's form kept the knee's default target when another joint was
 *   picked, so a hip goal could aim up and an ankle goal down: read by joint, those would be met by
 *   the very next recording. Each one G3.9 didn't show as achieved gets G3.10's default target from
 *   its joint's latest recording at the update, starting over then at 0% (formGoalFromG39).
 * - A form goal set before any recording of its lift and joint stored a guessed start (target +
 *   10); the start is dropped, so the first recording after the goal was set starts it, as for new
 *   goals.
 */

/** Set to 'pending' by migration 4; when the upgrade ran, after. */
export const G310_UPGRADE_META_KEY = 'g310_upgrade';
/** G3.9's streak rule (LegacyStreakRule as JSON). */
export const LEGACY_STREAK_META_KEY = 'streak_legacy';

/** Weeks that ended before `before` (the update date) need `target`, as G3.9 judged them. */
export type LegacyStreakRule = { before: ISODate; target: number };

/** G3.9's target without a weekly goal. */
const G39_WEEKLY_TARGET = 4;

const metaValue = (db: SqlDb, key: string) => db.getFirstSync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])?.value;
const setMeta = (db: SqlDb, key: string, value: string) =>
  db.runSync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);

/** The stored G3.9 rule, if this database was upgraded with workouts in it. */
export function legacyStreakRule(db: SqlDb): LegacyStreakRule | undefined {
  const value = metaValue(db, LEGACY_STREAK_META_KEY);
  if (!value) return undefined;
  try {
    const rule = JSON.parse(value) as Partial<LegacyStreakRule>;
    return typeof rule.before === 'string' && typeof rule.target === 'number' ? { before: rule.before, target: rule.target } : undefined;
  } catch {
    return undefined;
  }
}

/** A G3.9 lift title, as the goal form now writes it: "Pull-Up +25 lb × 8", "Assisted Dip × 8, no assistance". */
function addedLoadTitle(exercise: Exercise, addedKg: number, reps: number, units: UnitSystem): string {
  const shown = Math.round((units === 'imperial' ? kgToLb(Math.abs(addedKg)) : Math.abs(addedKg)) * 10) / 10;
  if (!shown) return `${exercise.name} × ${reps}${exercise.isAssisted ? ', no assistance' : ''}`;
  return `${exercise.name} ${addedKg < 0 ? '−' : '+'}${shown} ${units === 'imperial' ? 'lb' : 'kg'} × ${reps}`;
}

/**
 * A G3.9 weight × reps goal on a bodyweight exercise, with its total-load target turned into added
 * weight: the total minus `bodyweightKg` (assisted machines can't go above no assistance).
 */
export function addedLoadGoal(goal: Extract<Goal, { type: 'lift' }>, exercise: Exercise, bodyweightKg: number, units: UnitSystem, at: string): Goal {
  if (goal.target.kind !== 'load_reps') return goal;
  let addedKg = Math.round((goal.target.loadKg - bodyweightKg) * 1000) / 1000;
  if (exercise.isAssisted) addedKg = Math.min(0, addedKg);
  const { reps } = goal.target;
  return { ...goal, title: addedLoadTitle(exercise, addedKg, reps, units), target: { kind: 'load_reps', loadKg: addedKg, reps }, updatedAt: at };
}

type FormGoal = Extract<Goal, { type: 'form' }>;

/**
 * A G3.9 form goal that aims the other way from its joint's G3.10 direction (a hip target above its
 * start, an ankle target below), rebuilt as the goal form now makes one: G3.10's default target
 * 5° past `latestDeg` (the joint's latest recording at the update), that start, and set at `at`, so
 * it starts at 0% and no earlier recording reaches it. Undefined for any other goal, and for one G3.9
 * showed as achieved (`achievedInG39`), so the update doesn't take a win away. Knee goals are left
 * alone: G3.9's default always aimed them deeper, so a knee target above the start was typed.
 */
export function formGoalFromG39(goal: FormGoal, exerciseName: string, latestDeg: number | undefined, achievedInG39: boolean, at: string): FormGoal | undefined {
  if (goal.joint === 'knee' || goal.startDeg === undefined || latestDeg === undefined || achievedInG39) return undefined;
  const g39AimsHigher = goal.targetDeg > goal.startDeg;
  const g39AimsLower = goal.targetDeg < goal.startDeg;
  const aimsHigher = formGoalAimsHigher(goal.joint);
  if (!(aimsHigher ? g39AimsLower : g39AimsHigher)) return undefined;
  const startDeg = Math.round(latestDeg);
  const targetDeg = aimsHigher ? Math.min(180, startDeg + 5) : Math.max(40, startDeg - 5);
  return { ...goal, title: `${exerciseName}: ${targetDeg}° ${goal.joint} angle`, targetDeg, startDeg, createdAt: at, updatedAt: at };
}

/** Whether G3.9 showed a form goal as achieved: its exercise's newest ready report met the target, aiming from start to target. */
function achievedInG39(goal: FormGoal, reports: FormReport[]): boolean {
  if (goal.startDeg === undefined) return false;
  const newest = reports
    .filter((r) => r.exerciseId === goal.exerciseId && r.status === 'ready')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  const current = newest ? reportAngle(newest, goal.joint) : undefined;
  if (current === undefined) return false;
  return goal.startDeg - goal.targetDeg > 0 ? current <= goal.targetDeg : current >= goal.targetDeg;
}

function parse<T>(json: string): T | undefined {
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

/**
 * Runs once per upgraded database, at repository creation (after `migrate`). Returns whether it
 * ran. Rewritten goals get a new `updated_at` and an outbox entry like any write; sample data stays
 * out of the outbox.
 */
export function upgradeToG310(db: SqlDb, today: ISODate, at: string = nowISO()): boolean {
  if (metaValue(db, G310_UPGRADE_META_KEY) !== 'pending') return false;
  db.withTransactionSync(() => {
    const lastSeq = db.getFirstSync<{ seq: number | null }>('SELECT MAX(seq) AS seq FROM outbox', [])?.seq ?? 0;
    const goals = readAllSync<Goal>(db, 'goals');

    // G3.9: the newest weekly goal (by last edit), else 4.
    const weekly = goals.filter((g) => g.type === 'frequency').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const rule: LegacyStreakRule = { before: today, target: weekly?.type === 'frequency' ? weekly.workoutsPerWeek : G39_WEEKLY_TARGET };
    setMeta(db, LEGACY_STREAK_META_KEY, JSON.stringify(rule));

    const exercises = new Map<string, Exercise>(builtinExercises.map((e) => [e.id, e]));
    // Deleted custom exercises too: a goal may still use one.
    for (const row of db.getAllSync<{ data: string }>('SELECT data FROM custom_exercises', [])) {
      const exercise = parse<Exercise>(row.data);
      if (exercise?.id) exercises.set(exercise.id, exercise);
    }
    const units = withPreferenceDefaults(readOneSync<Preferences>(db, 'preferences', 'me')).units;
    const weighIns = readAllSync<BodyweightEntry>(db, 'bodyweight')
      .filter((b) => b.weightKg > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const snapshots = db
      .getAllSync<{ data: string }>("SELECT data FROM logged_sets WHERE deleted_at IS NULL AND json_extract(data, '$.bodyweightSnapshotKg') > 0", [])
      .flatMap((row) => {
        const set = parse<LoggedSet>(row.data);
        return set?.bodyweightSnapshotKg && set.completedAt ? [{ kg: set.bodyweightSnapshotKg, at: Date.parse(set.completedAt) }] : [];
      });
    /** Bodyweight when a goal was set: the weigh-in by then, else the first after, else the snapshot on the set logged nearest. */
    const bodyweightAt = (moment: string): number | undefined => {
      const date = localDateOf(moment);
      const weighIn = weighIns.filter((b) => b.date <= date).at(-1) ?? weighIns[0];
      if (weighIn) return weighIn.weightKg;
      const t = Date.parse(moment);
      return [...snapshots].sort((a, b) => Math.abs(a.at - t) - Math.abs(b.at - t))[0]?.kg;
    };

    for (const goal of goals) {
      if (goal.type !== 'lift' || goal.target.kind !== 'load_reps') continue;
      const exercise = exercises.get(goal.exerciseId);
      if (!exercise?.isBodyweight) continue;
      // With no bodyweight anywhere, G3.9 never measured the goal (no total load); it's left as it is.
      const bodyweightKg = bodyweightAt(goal.createdAt);
      if (bodyweightKg === undefined) continue;
      putRow(db, 'goals', goal.id, addedLoadGoal(goal, exercise, bodyweightKg, units, at), {}, at);
    }

    const reports = readAllSync<FormReport>(db, 'form_reports');
    for (const goal of goals) {
      if (goal.type !== 'form') continue;
      // The joint's latest recording now: a rebuilt goal starts from it, so it starts at 0%.
      const latest = latestFormAngle(reports, goal.exerciseId, goal.joint)?.angle;
      const rebuilt = formGoalFromG39(goal, exercises.get(goal.exerciseId)?.name ?? 'Form', latest, achievedInG39(goal, reports), at);
      if (rebuilt) {
        putRow(db, 'goals', goal.id, rebuilt, {}, at);
        continue;
      }
      // No recording of this lift and joint by the time the goal was set: G3.9 guessed the start.
      const recordedBySet = reports.filter((r) => Date.parse(r.createdAt) <= Date.parse(goal.createdAt));
      if (goal.startDeg !== undefined && !latestFormAngle(recordedBySet, goal.exerciseId, goal.joint)) {
        const { startDeg: _guess, ...rest } = goal;
        putRow(db, 'goals', goal.id, { ...rest, updatedAt: at }, {}, at);
      }
    }

    // Sample data is never queued to sync (see sampleData.ts).
    if (metaValue(db, 'contents') === 'sample') db.runSync('DELETE FROM outbox WHERE seq > ?', [lastSeq]);
    setMeta(db, G310_UPGRADE_META_KEY, at);
  });
  return true;
}

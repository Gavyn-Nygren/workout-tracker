// Badge catalog (spec 2.7 and 2.9; G3.10 user's pick: full ladders, about 50), unit-tested in
// tests/badges.test.ts. One catalog both earns badges and shows Next up progress, so every badge
// Home counts toward can be earned.
//
// - Badges are derived from history, never stored. Each is dated by the workout, record or report
//   that reached it, so later workouts don't move it; editing or deleting that history does.
// - Loads and volume use round numbers in the user's unit (225 lb, 100 kg), so switching units can
//   move a badge across its threshold.
// - Next up: each ladder's lowest unearned step, once there's some progress toward it, nearest first.
import { countsAsWorkout, countsForPRs, effectiveLoadKg, setVolumeKg } from './calculations';
import { addDays, daysBetween, localDateOf, startOfWeek } from './dates';
import { formGainDeg, reportAngle } from './goals';
import { workoutsOn } from './schedule';
import type {
  BadgeCategory,
  BodyweightEntry,
  EarnedBadge,
  Exercise,
  FormMovementFamily,
  FormReport,
  ID,
  ISODate,
  Joint,
  PersonalRecord,
  Plan,
  ScheduledOccurrence,
  StreakState,
  UnitSystem,
  Weekday,
  WorkoutSession,
} from './types';
import { kgToLb, lbToKg } from './units';

// ---------------------------------------------------------------------------
// Catalog

/** How a badge's value is measured. */
export type BadgeMeasure =
  /** Workouts that count (countsAsWorkout). */
  | { kind: 'workouts' }
  /** Total volume of finished workouts (setVolumeKg). */
  | { kind: 'volume' }
  /** Heaviest effective load in one set that counts for PRs. */
  | { kind: 'load'; exerciseId: ID }
  /** Best effective load in one PR set over bodyweight at the time. */
  | { kind: 'ratio'; exerciseId: ID }
  /** Personal records set (records.ts). */
  | { kind: 'records' }
  /** Week streak length (StreakState). */
  | { kind: 'streak' }
  /** A week where every scheduled workout was done. */
  | { kind: 'perfect_week' }
  /** A fixed-length program finished, with 3 in 4 of its workouts done. */
  | { kind: 'program' }
  /** Ready form reports, of one movement family or all. */
  | { kind: 'recordings'; family?: FormMovementFamily }
  /**
   * Range-of-motion gain in degrees over the first recording of the same lift and joint, at the
   * report's primary joint: deeper for knees and hips, higher for the ankle (formGainDeg).
   */
  | { kind: 'depth' };

/** One value, or one per unit system. */
type PerUnit<T extends number | string> = T | Record<UnitSystem, T>;

export type BadgeDefinition = {
  key: string;
  category: BadgeCategory;
  /** The ladder it's a step of. Next up shows only each ladder's lowest unearned step. */
  ladder: string;
  /** 1-based, in threshold order. */
  step: number;
  measure: BadgeMeasure;
  /**
   * Workouts, PRs, weeks, recordings or degrees; loads and volume in the user's unit (lb or kg);
   * ratios as a multiple of bodyweight. Perfect week and program are 1 (done or not).
   */
  threshold: PerUnit<number>;
  title: PerUnit<string>;
  /** How to earn it: "Complete 50 workouts." */
  description: PerUnit<string>;
  /** Once earned, for Recent wins: "Completed 50 workouts." */
  earned: PerUnit<string>;
};

type Step = Pick<BadgeDefinition, 'key' | 'threshold' | 'title' | 'description' | 'earned'>;

function ladder(name: string, category: BadgeCategory, measure: BadgeMeasure, steps: Step[]): BadgeDefinition[] {
  return steps.map((s, i) => ({ ...s, ladder: name, category, measure, step: i + 1 }));
}

/** 100000 → "100,000" */
const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const WORKOUTS = [10, 25, 50, 100, 250, 500];

const VOLUME: Record<UnitSystem, number>[] = [
  { imperial: 100_000, metric: 50_000 },
  { imperial: 250_000, metric: 100_000 },
  { imperial: 500_000, metric: 250_000 },
  { imperial: 1_000_000, metric: 500_000 },
  { imperial: 2_500_000, metric: 1_000_000 },
];
const VOLUME_TITLE: Record<number, string> = {
  50_000: '50K Club',
  100_000: '100K Club',
  250_000: 'Quarter Million',
  500_000: 'Half a Million',
  1_000_000: 'Millionaire',
  2_500_000: '2.5 Million',
};

/** The bar plus this many 45 lb (or 20 kg) plates a side. */
const PLATE_LOAD: Record<number, Record<UnitSystem, number>> = {
  1: { imperial: 135, metric: 60 },
  2: { imperial: 225, metric: 100 },
  3: { imperial: 315, metric: 140 },
  4: { imperial: 405, metric: 180 },
  5: { imperial: 495, metric: 220 },
};

type Lift = { id: string; exerciseId: ID; name: string; does: (what: string) => string; did: (what: string) => string; plates: number[]; ratios: number[] };
const LIFTS: Lift[] = [
  { id: 'bench', exerciseId: 'ex_bench_press', name: 'Bench', does: (w) => `Bench ${w} for a working set.`, did: (w) => `Benched ${w} for a working set.`, plates: [1, 2, 3], ratios: [1, 1.5] },
  { id: 'squat', exerciseId: 'ex_back_squat', name: 'Squat', does: (w) => `Squat ${w} for a working set.`, did: (w) => `Squatted ${w} for a working set.`, plates: [1, 2, 3, 4], ratios: [1.5, 2] },
  {
    id: 'deadlift',
    exerciseId: 'ex_deadlift',
    name: 'Deadlift',
    does: (w) => `Deadlift ${w} for a working set.`,
    did: (w) => `Deadlifted ${w} for a working set.`,
    plates: [2, 3, 4, 5],
    ratios: [2, 2.5],
  },
  { id: 'ohp', exerciseId: 'ex_overhead_press', name: 'Press', does: (w) => `Press ${w} overhead for a working set.`, did: (w) => `Pressed ${w} overhead for a working set.`, plates: [1], ratios: [] },
];

const PRS = [10, 50, 100, 250];
const STREAK_WEEKS = [4, 8, 12, 26, 52];

const FAMILIES: FormMovementFamily[] = ['squat', 'deadlift', 'lunge', 'calf_raise'];
const FAMILY_TITLE: Record<FormMovementFamily, string> = { squat: 'Squat', deadlift: 'Deadlift', lunge: 'Lunge', calf_raise: 'Calf Raise' };
const FAMILY_NAME: Record<FormMovementFamily, string> = { squat: 'squat', deadlift: 'deadlift', lunge: 'lunge', calf_raise: 'calf raise' };

/** Every badge, ladder by ladder, each ladder's steps in order. */
export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  // Milestones
  ...ladder('workouts', 'milestone', { kind: 'workouts' }, [
    { key: 'first_workout', threshold: 1, title: 'First Rep', description: 'Complete your first workout.', earned: 'Completed your first workout.' },
    ...WORKOUTS.map((n) => ({ key: `workouts_${n}`, threshold: n, title: `${n} Workouts`, description: `Complete ${n} workouts.`, earned: `Completed ${n} workouts.` })),
  ]),
  ...ladder(
    'volume',
    'milestone',
    { kind: 'volume' },
    VOLUME.map((t, i) => ({
      key: `volume_${i + 1}`,
      threshold: t,
      title: { imperial: VOLUME_TITLE[t.imperial], metric: VOLUME_TITLE[t.metric] },
      description: { imperial: `Lift ${grouped(t.imperial)} lb of total volume.`, metric: `Lift ${grouped(t.metric)} kg of total volume.` },
      earned: { imperial: `Lifted ${grouped(t.imperial)} lb of total volume.`, metric: `Lifted ${grouped(t.metric)} kg of total volume.` },
    })),
  ),

  // Strength
  ...LIFTS.flatMap((lift) =>
    ladder(
      `plates_${lift.id}`,
      'strength',
      { kind: 'load', exerciseId: lift.exerciseId },
      lift.plates.map((plates) => ({
        key: `${lift.id}_${plates}_plate`,
        threshold: PLATE_LOAD[plates],
        title: `${plates}-Plate ${lift.name}`,
        description: { imperial: lift.does(`${PLATE_LOAD[plates].imperial} lb`), metric: lift.does(`${PLATE_LOAD[plates].metric} kg`) },
        earned: { imperial: lift.did(`${PLATE_LOAD[plates].imperial} lb`), metric: lift.did(`${PLATE_LOAD[plates].metric} kg`) },
      })),
    ),
  ),
  ...LIFTS.flatMap((lift) =>
    ladder(
      `ratio_${lift.id}`,
      'strength',
      { kind: 'ratio', exerciseId: lift.exerciseId },
      lift.ratios.map((ratio) => ({
        key: `${lift.id}_bodyweight_${String(ratio).replace('.', '_')}x`,
        threshold: ratio,
        title: ratio === 1 ? `Bodyweight ${lift.name}` : `${ratio}× Bodyweight ${lift.name}`,
        description: lift.does(ratio === 1 ? 'your bodyweight' : `${ratio}× your bodyweight`),
        earned: lift.did(ratio === 1 ? 'your bodyweight' : `${ratio}× your bodyweight`),
      })),
    ),
  ),
  ...ladder(
    'prs',
    'strength',
    { kind: 'records' },
    PRS.map((n) => ({ key: `prs_${n}`, threshold: n, title: `${n} PRs`, description: `Set ${n} personal records.`, earned: `Set your ${n}th personal record.` })),
  ),

  // Consistency
  ...ladder(
    'streak',
    'consistency',
    { kind: 'streak' },
    STREAK_WEEKS.map((n) => ({
      key: `streak_${n}_weeks`,
      threshold: n,
      title: `${n}-Week Streak`,
      description: `Hit your weekly target ${n} weeks in a row.`,
      earned: `Met your weekly target ${n} weeks in a row.`,
    })),
  ),
  ...ladder('perfect_week', 'consistency', { kind: 'perfect_week' }, [
    { key: 'perfect_week', threshold: 1, title: 'Perfect Week', description: 'Do every planned workout in a week.', earned: 'Did every planned workout in a week.' },
  ]),
  ...ladder('program', 'consistency', { kind: 'program' }, [
    {
      key: 'program_finished',
      threshold: 1,
      title: 'Program Complete',
      description: 'Finish a program, doing at least 3 in 4 of its workouts.',
      earned: 'Finished a program, doing at least 3 in 4 of its workouts.',
    },
  ]),

  // Form
  ...ladder('recordings', 'form', { kind: 'recordings' }, [
    { key: 'first_analysis', threshold: 1, title: 'Camera Ready', description: 'Analyze your first set on camera.', earned: 'Analyzed your first set on camera.' },
    { key: 'recordings_10', threshold: 10, title: 'Film Study', description: 'Analyze 10 sets on camera.', earned: 'Analyzed 10 sets on camera.' },
    { key: 'recordings_50', threshold: 50, title: "Director's Cut", description: 'Analyze 50 sets on camera.', earned: 'Analyzed 50 sets on camera.' },
  ]),
  ...FAMILIES.flatMap((family) =>
    ladder(`form_${family}`, 'form', { kind: 'recordings', family }, [
      {
        key: `form_${family}_10`,
        threshold: 10,
        title: `${FAMILY_TITLE[family]} Study`,
        description: `Analyze 10 ${FAMILY_NAME[family]} sets on camera.`,
        earned: `Analyzed 10 ${FAMILY_NAME[family]} sets on camera.`,
      },
    ]),
  ),
  ...ladder(
    'depth',
    'form',
    { kind: 'depth' },
    // Deeper for squats, lunges and deadlifts, higher for calf raises: one badge, so neutral words.
    [5, 10].map((deg) => ({
      key: `depth_${deg}`,
      threshold: deg,
      title: `${deg}° More Range`,
      description: `Improve a lift's range of motion by ${deg}° over your first recording of it.`,
      earned: `Improved a lift's range of motion by ${deg}° over your first recording of it.`,
    })),
  ),
];

const BY_KEY = new Map(BADGE_CATALOG.map((d) => [d.key, d]));

export function badgeDefinition(key: string): BadgeDefinition | undefined {
  return BY_KEY.get(key);
}

function inUnits<T extends number | string>(value: PerUnit<T>, units: UnitSystem): T {
  return typeof value === 'object' ? value[units] : value;
}

/** A badge's title, description (how to earn it), earned line, and threshold in the user's unit. */
export function badgeText(def: BadgeDefinition, units: UnitSystem): { title: string; description: string; earned: string; threshold: number } {
  return { title: inUnits(def.title, units), description: inUnits(def.description, units), earned: inUnits(def.earned, units), threshold: inUnits(def.threshold, units) };
}

/** What an earned badge's win says: "Completed 50 workouts." Undefined for a key not in the catalog. */
export function badgeEarnedText(key: string, units: UnitSystem): string | undefined {
  const def = BY_KEY.get(key);
  return def && inUnits(def.earned, units);
}

// ---------------------------------------------------------------------------
// Measuring

/** What was planned in a finished week when it was stored (a streak_weeks row's planned fields). */
export type FrozenWeekPlan = { weekStart: ISODate; planned: number; plannedDates?: ISODate[]; plannedIds?: ID[] };

/**
 * Whether a finished week's scheduled workouts now still include every one planned when it was
 * stored: by occurrence id where the row has them, else by date (each date as often as it was
 * planned), else by count. So neither a later push or plan delete taking a missed workout out, nor
 * another workout moving in (an undone push), can make the week perfect after the fact.
 */
export function holdsPlanned(then: FrozenWeekPlan | undefined, occurrences: readonly ScheduledOccurrence[]): boolean {
  if (!then) return true;
  if (then.plannedIds) {
    const ids = new Set(occurrences.map((o) => o.id));
    return then.plannedIds.every((id) => ids.has(id));
  }
  if (then.plannedDates) {
    const left = new Map<ISODate, number>();
    for (const o of occurrences) left.set(o.scheduledDate, (left.get(o.scheduledDate) ?? 0) + 1);
    return then.plannedDates.every((date) => {
      const n = left.get(date) ?? 0;
      left.set(date, n - 1);
      return n > 0;
    });
  }
  return occurrences.length >= then.planned;
}

/**
 * What badges are derived from. The repository supplies each: listSessions(), the exercise map,
 * listFormReports(), listPersonalRecords(), getStreak(), listOccurrences() over all dates,
 * listPlans(), listPlanVersions(), listBodyweight(), and the units and week start preferences.
 */
export type BadgeInput = {
  /** Every session; unfinished and skipped ones are ignored. */
  sessions: WorkoutSession[];
  exercisesById: Map<ID, Exercise>;
  formReports: FormReport[];
  /** Every personal record (records.ts); longest-streak records aren't PRs here. */
  records: PersonalRecord[];
  /**
   * Streak badges are dated by `milestoneDates`; Next up shows `currentWeeks`. A finished week's
   * frozen `planned` count keeps Perfect Week to what was planned when the week ended.
   */
  streak: Pick<StreakState, 'milestoneDates' | 'currentWeeks'> & Partial<Pick<StreakState, 'weeks'>>;
  /**
   * What was planned in every finished week when it was stored (the repository's streak_weeks rows
   * for this week-start setting), including weeks before the first counted workout: the count, and
   * the workouts' dates and occurrence ids where the row has them. When given, Perfect Week reads
   * these instead of the frozen weeks in `streak.weeks`.
   */
  frozenWeeks?: FrozenWeekPlan[];
  /** Every stored scheduled workout from every plan, past and upcoming, on its date after pushes. */
  occurrences: ScheduledOccurrence[];
  /** Current plans (not deleted). */
  plans: Plan[];
  /** Every saved version of every plan, so a deleted or edited program still resolves. */
  planVersions?: Plan[];
  bodyweight: BodyweightEntry[];
  units: UnitSystem;
  weekStartsOn: Weekday;
  today: ISODate;
};

type Reading = {
  /** The day the value first reached a threshold (in the measure's own unit), if it has. */
  reachedOn(threshold: number): ISODate | undefined;
  /** Progress toward a threshold, in the same unit. */
  progress(threshold: number): { current: number; target: number };
};

type Point = { date: ISODate; value: number };

/**
 * Loads within 0.05 kg are the same weight (spec 2.7), so kg↔lb rounding never decides a badge.
 * Volume uses the volume record's tolerance.
 */
const LOAD_TOLERANCE_KG = 0.05;
const VOLUME_TOLERANCE_KG = 0.5;
const EPSILON = 1e-9;

/** A count or best that only grows: the first point at the threshold reached it. */
function rising(points: Point[], tolerance = 0): Reading {
  const current = points.at(-1)?.value ?? 0;
  return {
    reachedOn: (threshold) => points.find((p) => p.value >= threshold - tolerance - EPSILON)?.date,
    progress: (threshold) => ({ current, target: threshold }),
  };
}

const counting = (dates: ISODate[]) => rising(dates.map((date, i) => ({ date, value: i + 1 })));

type Completion = Pick<WorkoutSession, 'completedAt' | 'completedDate'>;
const byCompletion = (a: Completion, b: Completion) => (a.completedAt ?? a.completedDate ?? '').localeCompare(b.completedAt ?? b.completedDate ?? '');
const byCreated = (a: FormReport, b: FormReport) => a.createdAt.localeCompare(b.createdAt);

/** Where a scheduled workout was first put, before any push. */
const originalDate = (o: ScheduledOccurrence) => o.shiftedFromDate ?? o.scheduledDate;

/**
 * How many whole degrees `report` improved on `baseline` at the report's primary joint: deeper for
 * knees and hips, higher for the ankle, the same measure as Home's Recent wins (wins.ts) and the
 * form report. Undefined without trusted angles.
 */
export function depthGainDeg(baseline: FormReport, report: FormReport): number | undefined {
  return formGainDeg(baseline, report, report.primaryJoint);
}

/** Reads every measure from history, each computed once. */
function measurer(input: BadgeInput): (measure: BadgeMeasure) => Reading {
  const finished = input.sessions.filter((s) => s.status === 'completed' && s.completedDate).sort(byCompletion);
  const counted = finished.filter(countsAsWorkout);
  const countedById = new Map(counted.map((s) => [s.id, s]));
  const ready = input.formReports.filter((r) => r.status === 'ready' && !r.deletedAt).sort(byCreated);
  const weighIns = input.bodyweight.filter((b) => !b.deletedAt && b.weightKg > 0).sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt));

  /** The latest weigh-in on or before a date. */
  const weightOn = (date: ISODate) => {
    let kg: number | undefined;
    for (const entry of weighIns) {
      if (entry.date > date) break;
      kg = entry.weightKg;
    }
    return kg;
  };

  /** Every completed set of one exercise that counts for PRs, with its effective load, oldest first. */
  const prSets = (exerciseId: ID) => {
    const exercise = input.exercisesById.get(exerciseId);
    if (!exercise) return [];
    return finished.flatMap((session) =>
      session.blocks
        .flatMap((b) => b.exercises)
        .filter((e) => e.exerciseId === exerciseId)
        .flatMap((e) => e.sets)
        .flatMap((set) => {
          const loadKg = countsForPRs(set) && set.reps ? effectiveLoadKg(set, exercise) : undefined;
          return loadKg === undefined ? [] : [{ session, set, loadKg }];
        }),
    );
  };

  const read: Record<BadgeMeasure['kind'], (measure: never) => Reading> = {
    workouts: () => counting(counted.map((s) => s.completedDate!)),

    volume: () => {
      let totalKg = 0;
      const points: Point[] = [];
      for (const session of finished) {
        for (const entry of session.blocks.flatMap((b) => b.exercises)) {
          const exercise = input.exercisesById.get(entry.exerciseId);
          if (exercise) for (const set of entry.sets) totalKg += setVolumeKg(set, exercise);
        }
        if (totalKg > (points.at(-1)?.value ?? 0)) points.push({ date: session.completedDate!, value: totalKg });
      }
      return rising(points, VOLUME_TOLERANCE_KG);
    },

    load: (measure: Extract<BadgeMeasure, { kind: 'load' }>) => {
      const points: Point[] = [];
      for (const { session, loadKg } of prSets(measure.exerciseId)) {
        if (loadKg > (points.at(-1)?.value ?? 0)) points.push({ date: session.completedDate!, value: loadKg });
      }
      return rising(points, LOAD_TOLERANCE_KG);
    },

    ratio: (measure: Extract<BadgeMeasure, { kind: 'ratio' }>) => {
      // Bodyweight at the time: the set's own snapshot, else the latest weigh-in by that day.
      const lifts = prSets(measure.exerciseId).flatMap(({ session, set, loadKg }) => {
        const bodyweightKg = set.bodyweightSnapshotKg ?? weightOn(session.completedDate!);
        return bodyweightKg && bodyweightKg > 0 ? [{ date: session.completedDate!, loadKg, bodyweightKg }] : [];
      });
      const best = lifts.reduce((max, l) => Math.max(max, l.loadKg / l.bodyweightKg), 0);
      return {
        reachedOn: (ratio) => lifts.find((l) => l.loadKg >= ratio * l.bodyweightKg - LOAD_TOLERANCE_KG - EPSILON)?.date,
        progress: (ratio) => ({ current: best, target: ratio }),
      };
    },

    records: () => counting(input.records.map((r) => r.achievedDate).sort()),

    streak: () => ({
      // milestoneDates[n - 1] is the day a streak first reached n weeks.
      reachedOn: (weeks) => input.streak.milestoneDates[weeks - 1],
      progress: (weeks) => ({ current: input.streak.currentWeeks, target: weeks }),
    }),

    perfect_week: () => {
      const weeks = new Map<ISODate, ScheduledOccurrence[]>();
      for (const occ of input.occurrences) {
        const week = startOfWeek(occ.scheduledDate, input.weekStartsOn);
        weeks.set(week, [...(weeks.get(week) ?? []), occ]);
      }
      const doneBy = (occ: ScheduledOccurrence) => (occ.sessionId ? countedById.get(occ.sessionId) : undefined);
      // What was planned in each finished week when it ended: every one of those workouts must still
      // be in the week, and done (holdsPlanned).
      const plannedThen = new Map<ISODate, FrozenWeekPlan>((input.frozenWeeks ?? (input.streak.weeks ?? []).filter((w) => w.frozen)).map((w) => [w.weekStart, w]));
      let earned: ISODate | undefined;
      for (const [week, occurrences] of weeks) {
        const done = occurrences.map(doneBy);
        if (done.some((s) => !s) || !holdsPlanned(plannedThen.get(week), occurrences)) continue;
        // Dated by the workout that completed the week's last one.
        const last = (done as WorkoutSession[]).sort(byCompletion).at(-1)!.completedDate!;
        if (!earned || last < earned) earned = last;
      }
      const thisWeek = weeks.get(startOfWeek(input.today, input.weekStartsOn)) ?? [];
      const doneThisWeek = thisWeek.filter((o) => doneBy(o)).length;
      return { reachedOn: () => earned, progress: () => ({ current: doneThisWeek, target: thisWeek.length }) };
    },

    program: () => {
      // Each plan as it is now: the current plan, else its newest saved version (a deleted one).
      const latest = new Map<ID, Plan>();
      for (const plan of input.planVersions ?? []) if ((latest.get(plan.id)?.version ?? -Infinity) < plan.version) latest.set(plan.id, plan);
      for (const plan of input.plans) latest.set(plan.id, plan);
      const current = new Set(input.plans.filter((p) => p.status === 'active' && !p.deletedAt).map((p) => p.id));
      // Every saved version of each plan, oldest first, for what the plan was on a past date.
      const versions = new Map<ID, Plan[]>();
      for (const plan of [...(input.planVersions ?? []), ...input.plans]) versions.set(plan.id, [...(versions.get(plan.id) ?? []), plan]);
      for (const list of versions.values()) list.sort((a, b) => a.version - b.version);
      /** The plan as it stood on a date: its newest version saved by then, else its first. */
      const versionOn = (planId: ID, date: ISODate) => {
        const list = versions.get(planId) ?? [];
        let found = list[0];
        for (const version of list) if (localDateOf(version.updatedAt) <= date) found = version;
        return found;
      };

      let earned: ISODate | undefined;
      let best: { current: number; target: number } | undefined;
      for (const plan of latest.values()) {
        const { schedule } = plan;
        if (schedule.type !== 'fixed') continue;
        const occurrences = input.occurrences.filter((o) => o.planId === plan.id);
        // Stored workouts, plus every day of the program with nothing stored:
        // - after the last stored one, the days the calendar hasn't filled in yet (it fills in a few
        //   weeks ahead): counted from the plan as it is now;
        // - before it, days that passed while the app wasn't opened (nothing filled them in), and the
        //   missed workouts a deleted plan removed: counted from the plan as it stood that day, so a
        //   day added by a later edit doesn't reach back and a paused stretch adds nothing.
        // So neither weeks away nor deleting a plan can shrink a program enough to finish it.
        const storedDates = new Set(occurrences.map(originalDate));
        const lastStored = [...storedDates].sort().at(-1);
        const end = addDays(plan.startDate, schedule.weeks * 7 - 1);
        let total = occurrences.length;
        for (let date = plan.startDate; date <= end; date = addDays(date, 1)) {
          if (storedDates.has(date)) continue;
          const then = lastStored === undefined || date > lastStored ? plan : versionOn(plan.id, date);
          if (then !== plan && then.status !== 'active') continue;
          if (then.schedule.type === 'fixed') total += workoutsOn(then.schedule, then.startDate, date).length;
        }
        if (!total) continue;
        const doneById = new Map<ID, WorkoutSession>();
        for (const o of occurrences) {
          const session = o.sessionId ? countedById.get(o.sessionId) : undefined;
          if (session) doneById.set(session.id, session);
        }
        const done = [...doneById.values()].sort(byCompletion);
        // The final week starts where the plan put it, moved as far as pushes moved its first workout.
        const finalWeek = addDays(plan.startDate, (schedule.weeks - 1) * 7);
        const firstOfFinal = occurrences.filter((o) => originalDate(o) >= finalWeek).sort((a, b) => originalDate(a).localeCompare(originalDate(b)))[0];
        const finalWeekStart = firstOfFinal ? addDays(finalWeek, daysBetween(originalDate(firstOfFinal), firstOfFinal.scheduledDate)) : finalWeek;
        const finisher = done.find((s, i) => (i + 1) * 4 >= total * 3 && s.completedDate! >= finalWeekStart);
        if (finisher && (!earned || finisher.completedDate! < earned)) earned = finisher.completedDate;
        if (current.has(plan.id) && done.length && (!best || done.length / total > best.current / best.target)) best = { current: done.length, target: total };
      }
      return { reachedOn: () => earned, progress: () => best ?? { current: 0, target: 1 } };
    },

    recordings: (measure: Extract<BadgeMeasure, { kind: 'recordings' }>) => {
      const familyOf = (r: FormReport) => input.exercisesById.get(r.exerciseId)?.formAnalysis ?? r.family;
      const reports = measure.family ? ready.filter((r) => familyOf(r) === measure.family) : ready;
      return counting(reports.map((r) => localDateOf(r.createdAt)));
    },

    depth: () => {
      // Each lift's first ready report with a trusted angle at a joint is its baseline there.
      const baselines = new Map<string, FormReport>();
      const points: Point[] = [];
      for (const report of ready) {
        const baseline = baselines.get(`${report.exerciseId}|${report.primaryJoint}`);
        const gain = baseline ? depthGainDeg(baseline, report) : undefined;
        if (gain !== undefined && gain > (points.at(-1)?.value ?? 0)) points.push({ date: localDateOf(report.createdAt), value: gain });
        for (const joint of ['hip', 'knee', 'ankle'] as Joint[]) {
          const key = `${report.exerciseId}|${joint}`;
          if (!baselines.has(key) && reportAngle(report, joint) !== undefined) baselines.set(key, report);
        }
      }
      return rising(points);
    },
  };

  const cache = new Map<string, Reading>();
  return (measure) => {
    const key = JSON.stringify(measure);
    let reading = cache.get(key);
    if (!reading) {
      reading = (read[measure.kind] as (m: BadgeMeasure) => Reading)(measure);
      cache.set(key, reading);
    }
    return reading;
  };
}

// ---------------------------------------------------------------------------
// Earned badges and progress

/** An earned badge, with where it sits in the catalog. */
export type CatalogBadge = EarnedBadge & { ladder: string; step: number };

/** A badge not yet earned, with progress toward it. */
export type NextBadge = {
  badgeKey: string;
  category: BadgeCategory;
  title: string;
  description: string;
  /** Progress, in the label's unit (lb or kg for loads and volume). */
  current: number;
  target: number;
  /** e.g. "41 / 50 workouts", "205 / 225 lb", "1.3× / 1.5× bodyweight" */
  progressLabel: string;
  ladder: string;
  step: number;
};

const isWeight = (measure: BadgeMeasure) => measure.kind === 'load' || measure.kind === 'volume';

/** Rounded down, so progress never shows the target before it's reached. */
const floorTo = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.floor(n * f + 1e-6) / f;
};

/** 312456 → "312k", 1234567 → "1.2M" */
function compact(n: number): string {
  if (n >= 1_000_000) return `${floorTo(n / 1_000_000, 1)}M`;
  if (n >= 1000) return `${Math.floor(n / 1000 + 1e-9)}k`;
  return String(Math.floor(n));
}

function progressLabel(measure: BadgeMeasure, current: number, target: number, units: UnitSystem): string {
  const unit = units === 'imperial' ? 'lb' : 'kg';
  switch (measure.kind) {
    case 'workouts':
      return `${current} / ${target} workouts`;
    case 'volume':
      return `${compact(current)} / ${compact(target)} ${unit}`;
    case 'load':
      return `${floorTo(current, 1)} / ${target} ${unit}`;
    case 'ratio':
      return `${floorTo(current, 1)}× / ${target}× bodyweight`;
    case 'records':
      return `${current} / ${target} PRs`;
    case 'streak':
      return `${current} / ${target} weeks`;
    case 'perfect_week':
      return `${current} / ${target} workouts this week`;
    case 'program':
      return `${current} / ${target} program workouts`;
    case 'recordings':
      return `${current} / ${target} ${measure.family ? `${FAMILY_NAME[measure.family]} ` : ''}recordings`;
    case 'depth':
      return `${current}° / ${target}° more range`;
  }
}

/** Earned badges (catalog order), progress toward every other one, and Next up. */
export type BadgeState = { earned: CatalogBadge[]; progress: NextBadge[]; nextUp: NextBadge[] };

/**
 * Every badge's state: the earned ones with their dates, every unearned one's progress, and
 * Next up (each ladder's lowest unearned step with progress above 0, nearest to done first).
 */
export function badgeState(input: BadgeInput, limit = 3): BadgeState {
  const read = measurer(input);
  const toKg = (value: number) => (input.units === 'imperial' ? lbToKg(value) : value);
  const fromKg = (kg: number) => (input.units === 'imperial' ? kgToLb(kg) : kg);
  const earned: CatalogBadge[] = [];
  const progress: NextBadge[] = [];
  const nextUp: NextBadge[] = [];
  const ladderSeen = new Set<string>();

  for (const def of BADGE_CATALOG) {
    const { title, description, threshold } = badgeText(def, input.units);
    const base = { badgeKey: def.key, category: def.category, title, description, ladder: def.ladder, step: def.step };
    const reading = read(def.measure);
    const date = reading.reachedOn(isWeight(def.measure) ? toKg(threshold) : threshold);
    if (date) {
      earned.push({ id: `badge_${def.key}`, ...base, earnedDate: date });
      continue;
    }
    const raw = reading.progress(isWeight(def.measure) ? toKg(threshold) : threshold);
    const current = isWeight(def.measure) ? fromKg(raw.current) : raw.current;
    const target = isWeight(def.measure) ? threshold : raw.target;
    const next: NextBadge = { ...base, current, target, progressLabel: progressLabel(def.measure, current, target, input.units) };
    progress.push(next);
    // Only a ladder's lowest unearned step, and only once there's progress toward it.
    if (ladderSeen.has(def.ladder)) continue;
    ladderSeen.add(def.ladder);
    if (raw.current > 0 && raw.current < raw.target) nextUp.push(next);
  }

  nextUp.sort((a, b) => b.current / b.target - a.current / a.target);
  return { earned, progress, nextUp: nextUp.slice(0, limit) };
}

/** Badges earned, each dated by the workout, record or report that reached it. */
export function deriveBadges(input: BadgeInput): CatalogBadge[] {
  return badgeState(input).earned;
}

/** Progress toward every badge not yet earned, in catalog order. */
export function badgeProgress(input: BadgeInput): NextBadge[] {
  return badgeState(input).progress;
}

/** Home's Next up: each ladder's lowest unearned step with some progress, nearest to done first. */
export function nextUpBadges(input: BadgeInput, limit = 3): NextBadge[] {
  return badgeState(input, limit).nextUp;
}

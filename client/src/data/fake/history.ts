import { addDays, daysBetween, fromISODate, isoWeekday } from '../dates';
import { lbToKg } from '../units';
import type {
  BodyweightEntry,
  ISODate,
  LoggedSet,
  Plan,
  PlannedExercise,
  ScheduledOccurrence,
  SessionBlock,
  SessionExercise,
  SetPrescription,
  WorkoutSession,
} from '../types';
import { createRandom } from './random';

/** Starting working load (lb), weekly gain, and rounding per planned exercise. */
const LOADS: Record<string, { startLb: number; perWeekLb: number; roundLb: number }> = {
  pe_ua_bench: { startLb: 185, perWeekLb: 2.5, roundLb: 5 },
  pe_ua_row: { startLb: 155, perWeekLb: 2.5, roundLb: 5 },
  pe_ua_ohp: { startLb: 105, perWeekLb: 1.25, roundLb: 5 },
  pe_ua_curl: { startLb: 30, perWeekLb: 0.65, roundLb: 5 },
  pe_ua_pushdown: { startLb: 50, perWeekLb: 1.25, roundLb: 5 },
  pe_la_squat: { startLb: 245, perWeekLb: 5, roundLb: 5 },
  pe_la_rdl: { startLb: 205, perWeekLb: 5, roundLb: 5 },
  pe_la_bss: { startLb: 40, perWeekLb: 1.25, roundLb: 5 },
  pe_la_curl: { startLb: 90, perWeekLb: 1.25, roundLb: 5 },
  pe_ub_pullup: { startLb: 0, perWeekLb: 1.5, roundLb: 5 },
  pe_ub_incline: { startLb: 60, perWeekLb: 1.25, roundLb: 5 },
  pe_ub_cablerow: { startLb: 140, perWeekLb: 2.5, roundLb: 5 },
  pe_ub_lateral: { startLb: 20, perWeekLb: 0.65, roundLb: 5 },
  pe_lb_deadlift: { startLb: 315, perWeekLb: 5, roundLb: 5 },
  pe_lb_frontsquat: { startLb: 165, perWeekLb: 2.5, roundLb: 5 },
  pe_lb_legpress: { startLb: 360, perWeekLb: 10, roundLb: 10 },
  pe_lb_ext: { startLb: 110, perWeekLb: 2.5, roundLb: 5 },
  pe_cc_standing: { startLb: 180, perWeekLb: 2.5, roundLb: 10 },
  pe_cc_seated: { startLb: 90, perWeekLb: 2.5, roundLb: 10 },
  pe_cc_legraise: { startLb: 0, perWeekLb: 0, roundLb: 5 },
};

/**
 * The rest the sample lifter takes after each working set, per planned exercise (warm-ups: 1:00).
 * The sample plans leave rest blank (it comes from the exercise and Settings), but logged sets
 * still record what was rested. Supersets and circuits rest by round, so theirs aren't listed.
 */
const REST_TAKEN_SEC: Record<string, number> = {
  pe_ua_bench: 180,
  pe_ua_row: 150,
  pe_ua_ohp: 150,
  pe_la_squat: 180,
  pe_la_rdl: 150,
  pe_la_bss: 90,
  pe_la_curl: 90,
  pe_ub_pullup: 150,
  pe_ub_incline: 120,
  pe_ub_cablerow: 90,
  pe_ub_lateral: 60,
  pe_lb_deadlift: 210,
  pe_lb_frontsquat: 150,
  pe_lb_legpress: 120,
  pe_lb_ext: 60,
  pe_cc_standing: 60,
};
const WARMUP_REST_TAKEN_SEC = 60;

/**
 * How the last few times of some lifts went, so the plan's progression rules (G3.9) have
 * something to show whichever day the sample is loaded: any two Upper / Lower workouts in a row
 * suggest more weight on one lift, the same weight after a miss on another, and a deload on a
 * third (tests/sampleProgression.test.ts).
 * - `top`: last time, every working set reached the top of its range, so the rule adds weight.
 * - `misses`: the last N times were all at the best weight so far, each with its last set one rep
 *   short of the range. Fewer misses than the rule's 3 keeps the weight; 3 in a row deloads it.
 */
const LAST_TIMES: Record<string, { top: true } | { misses: number }> = {
  pe_ua_bench: { top: true }, // Upper A: +5 lb
  pe_ua_row: { misses: 1 }, // Upper A: same weight, 1 of 3 misses
  pe_la_squat: { misses: 3 }, // Lower A: −10%
  pe_la_rdl: { top: true }, // Lower A: +10 lb
  pe_ub_incline: { misses: 2 }, // Upper B: same weight, 2 of 3 misses
  pe_lb_deadlift: { misses: 3 }, // Lower B: −10%
  pe_lb_frontsquat: { top: true }, // Lower B: +5 lb
};

const HISTORY_DAYS = 56;
const FUTURE_DAYS = 21;

export type FakeHistory = {
  occurrences: ScheduledOccurrence[];
  sessions: WorkoutSession[];
  bodyweight: BodyweightEntry[];
};

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function isoAt(date: ISODate, hour: number, minute: number): string {
  const d = fromISODate(date);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function generateBodyweight(today: ISODate): BodyweightEntry[] {
  const random = createRandom(7);
  const entries: BodyweightEntry[] = [];
  // Every 3-4 days, trending from about 186 lb down to about 181.5 lb.
  for (let offset = -HISTORY_DAYS; offset <= 0; offset += random() < 0.5 ? 3 : 4) {
    const date = addDays(today, offset);
    const progress = (offset + HISTORY_DAYS) / HISTORY_DAYS;
    const lb = 186 - 4.5 * progress + (random() - 0.5) * 1.2;
    const stamp = isoAt(date, 7, 15);
    entries.push({ id: `bw_${date}`, date, weightKg: lbToKg(Math.round(lb * 10) / 10), createdAt: stamp, updatedAt: stamp });
  }
  // Two days ago, the lowest yet: it reaches the sample bodyweight goal (fake/derived.ts).
  const low = addDays(today, -2);
  const stamp = isoAt(low, 7, 15);
  return [...entries.filter((e) => e.date !== low), { id: `bw_${low}`, date: low, weightKg: lbToKg(180.9), createdAt: stamp, updatedAt: stamp }];
}

function bodyweightOn(entries: BodyweightEntry[], date: ISODate): number | undefined {
  let latest: number | undefined;
  for (const entry of entries) {
    if (entry.date <= date) latest = entry.weightKg;
  }
  return latest;
}

function generateOccurrences(plans: Plan[], today: ISODate): ScheduledOccurrence[] {
  const occurrences: ScheduledOccurrence[] = [];
  for (let offset = -HISTORY_DAYS; offset <= FUTURE_DAYS; offset++) {
    const date = addDays(today, offset);
    const weekday = isoWeekday(date);
    for (const plan of plans) {
      if (plan.status !== 'active' || plan.schedule.type !== 'weekly') continue;
      const day = plan.schedule.days.find((d) => d.weekday === weekday);
      for (const workoutId of day?.workoutIds ?? []) {
        occurrences.push({
          id: `occ_${plan.id}_${date}_${workoutId}`,
          planId: plan.id,
          planVersion: plan.version,
          planWorkoutId: workoutId,
          scheduledDate: date,
        });
      }
    }
  }
  return occurrences;
}

type SetContext = {
  random: () => number;
  weekIndex: number;
  sessionId: string;
  completedDate: ISODate;
  bodyweightKg?: number;
  isBodyweight: boolean;
};

function repTop(target: SetPrescription['targetReps']): { min: number; max: number } {
  if (target === undefined) return { min: 8, max: 8 };
  return typeof target === 'number' ? { min: target, max: target } : target;
}

function logSets(planned: PlannedExercise, ctx: SetContext): LoggedSet[] {
  const load = LOADS[planned.id];
  // Every fourth week is a ~10% deload, so PRs come in waves rather than every session.
  const deload = ctx.weekIndex % 4 === 3 ? 0.9 : 1;
  const workingLb = load ? roundTo((load.startLb + load.perWeekLb * ctx.weekIndex) * deload, load.roundLb) : 0;
  let workingIndex = 0;

  return planned.sets.map((target, setIndex) => {
    const id = `${ctx.sessionId}_${planned.id}_s${setIndex + 1}`;
    const rested = target.restSec || (target.kind === 'warmup' ? WARMUP_REST_TAKEN_SEC : REST_TAKEN_SEC[planned.id]);
    const base: LoggedSet = {
      id,
      kind: target.kind,
      modifiers: [...target.modifiers],
      target,
      completedAt: isoAt(ctx.completedDate, 17, 40 + setIndex * 3),
      restSec: rested ? rested + Math.round((ctx.random() - 0.5) * 30) : undefined,
      tempo: target.tempo,
    };

    if (target.kind === 'warmup') {
      return { ...base, reps: repTop(target.targetReps).max, loadKg: target.targetLoadKg };
    }

    if (target.kind === 'timed_hold') {
      return {
        ...base,
        durationSec: (target.targetDurationSec ?? 45) + Math.round(ctx.random() * 15) - 5 + ctx.weekIndex,
        bodyweightSnapshotKg: ctx.bodyweightKg,
      };
    }

    const { min, max } = repTop(target.targetReps);
    // Early weeks sit near the bottom of the range; reps climb as the lifter adapts, then fatigue across sets.
    const reps = Math.max(min, Math.min(max, min + (ctx.weekIndex % 3) + 1 - workingIndex - Math.floor(ctx.random() * 2)));
    const rir = Math.max(0, 3 - workingIndex - Math.floor(ctx.random() * 2));
    workingIndex++;

    const lb = target.kind === 'drop' ? roundTo(workingLb * 0.7, 5) : workingLb;
    const loadFields: Partial<LoggedSet> = ctx.isBodyweight
      ? { bodyweightSnapshotKg: ctx.bodyweightKg, addedLoadKg: lb > 0 ? lbToKg(lb) : undefined }
      : { loadKg: lbToKg(lb) };

    return { ...base, ...loadFields, reps: target.kind === 'drop' ? 12 + Math.floor(ctx.random() * 3) : reps, rir };
  });
}

/**
 * The history with the LAST_TIMES lifts' last few times rewritten (`sessions` oldest first). Only
 * working sets change; the lifts are all plain loads.
 */
function withLastTimes(sessions: WorkoutSession[]): WorkoutSession[] {
  const rewritten = new Map<string, SessionExercise>();
  const workingOf = (entry: SessionExercise) => entry.sets.filter((s) => s.kind === 'normal' && s.completedAt);
  const topKg = (entry: SessionExercise) => Math.max(...workingOf(entry).map((s) => s.loadKg ?? 0));
  for (const [plannedId, story] of Object.entries(LAST_TIMES)) {
    const entries = sessions
      .filter((s) => s.status === 'completed')
      .flatMap((s) => s.blocks.flatMap((b) => b.exercises))
      .filter((e) => e.plannedExerciseId === plannedId && workingOf(e).length > 0);
    const count = 'top' in story ? 1 : story.misses;
    const recent = entries.slice(-count);
    const earlier = entries.slice(0, -count);
    // Stuck at the best weight so far: the generator's weekly gain (and deload week) stops there.
    const stallKg = Math.max(...(earlier.length ? earlier : recent.slice(0, 1)).map(topKg));
    for (const entry of recent) {
      const lastIndex = entry.sets.map((s) => s.kind).lastIndexOf('normal');
      const sets = entry.sets.map((set, i): LoggedSet => {
        if (set.kind !== 'normal') return set;
        const { min, max } = repTop(set.target?.targetReps);
        if ('top' in story) return { ...set, reps: max };
        // Reps fade toward the miss on the last set.
        if (i === lastIndex) return { ...set, loadKg: stallKg, reps: min - 1, rir: 0 };
        return { ...set, loadKg: stallKg, reps: Math.min(set.reps ?? min, min + lastIndex - i) };
      });
      rewritten.set(entry.id, { ...entry, sets });
    }
  }
  return sessions.map((s) => ({ ...s, blocks: s.blocks.map((b) => ({ ...b, exercises: b.exercises.map((e) => rewritten.get(e.id) ?? e) })) }));
}

type SessionVariant = { completedDate: ISODate; partial?: boolean; repeatedFromSessionId?: string; idSuffix?: string };

function buildSession(
  plan: Plan,
  occurrence: ScheduledOccurrence | undefined,
  planWorkoutId: string,
  variant: SessionVariant,
  firstDate: ISODate,
  bodyweight: BodyweightEntry[],
  isBodyweightExercise: (exerciseId: string) => boolean,
): WorkoutSession {
  const workout = plan.workouts.find((w) => w.id === planWorkoutId)!;
  const { completedDate } = variant;
  const sessionId = `sess_${completedDate}_${planWorkoutId}${variant.idSuffix ?? ''}`;
  const random = createRandom(daysBetween(firstDate, completedDate) * 31 + planWorkoutId.length);
  const weekIndex = Math.floor(daysBetween(firstDate, completedDate) / 7);
  const bodyweightKg = bodyweightOn(bodyweight, completedDate);

  const blocks: SessionBlock[] = workout.blocks.map((block, blockIndex) => {
    const skipBlock = variant.partial && blockIndex === workout.blocks.length - 1;
    const exercises: SessionExercise[] = block.exercises.map((planned) => ({
      id: `${sessionId}_${planned.id}`,
      exerciseId: planned.exerciseId,
      plannedExerciseId: planned.id,
      skipped: Boolean(skipBlock),
      sets: skipBlock
        ? []
        : logSets(planned, { random, weekIndex, sessionId, completedDate, bodyweightKg, isBodyweight: isBodyweightExercise(planned.exerciseId) }),
    }));
    return { id: `${sessionId}_${block.id}`, type: block.type, exercises, roundRestSec: block.roundRestSec, transitionRestSec: block.transitionRestSec };
  });

  const startedAt = isoAt(completedDate, 17, 30);
  const completedAt = isoAt(completedDate, 17, 30 + (workout.estimatedMinutes ?? 60));
  return {
    id: sessionId,
    name: workout.name,
    occurrenceId: occurrence?.id,
    planId: plan.id,
    planWorkoutId,
    status: 'completed',
    completion: variant.partial ? 'partial' : 'full',
    scheduledDate: occurrence?.scheduledDate,
    completedDate,
    startedAt,
    completedAt,
    repeatedFromSessionId: variant.repeatedFromSessionId,
    blocks,
    createdAt: startedAt,
    updatedAt: completedAt,
  };
}

/**
 * Eight weeks of history ending yesterday, plus three weeks of upcoming occurrences.
 * Deliberately includes the states the UI must show: a missed workout, an explicit skip,
 * a partial session, a late completion, a repeated session, and lifts whose last times make the
 * progression rules suggest more weight, the same weight after a miss, or a deload (LAST_TIMES).
 */
export function generateHistory(plans: Plan[], isBodyweightExercise: (exerciseId: string) => boolean, today: ISODate): FakeHistory {
  const firstDate = addDays(today, -HISTORY_DAYS);
  const bodyweight = generateBodyweight(today);
  const occurrences = generateOccurrences(plans, today);
  const sessions: WorkoutSession[] = [];
  const plansById = new Map(plans.map((p) => [p.id, p]));

  const past = occurrences.filter((o) => o.scheduledDate < today);
  const pastMain = past.filter((o) => o.planId === 'plan_upper_lower');
  const pastCalves = past.filter((o) => o.planId === 'plan_calves_core');

  const missed = pastMain[pastMain.length - 1];
  const skipped = pastCalves[pastCalves.length - 7];
  const partial = pastMain.filter((o) => o.planWorkoutId === 'pw_lower_b').at(-2);
  const late = pastMain.filter((o) => o.planWorkoutId === 'pw_upper_b').at(-3);

  for (const occurrence of past) {
    const plan = plansById.get(occurrence.planId)!;
    if (occurrence === missed) continue;

    if (occurrence === skipped) {
      const stamp = isoAt(occurrence.scheduledDate, 18, 0);
      const sessionId = `sess_${occurrence.scheduledDate}_${occurrence.planWorkoutId}_skipped`;
      sessions.push({
        id: sessionId,
        name: plan.workouts.find((w) => w.id === occurrence.planWorkoutId)!.name,
        occurrenceId: occurrence.id,
        planId: plan.id,
        planWorkoutId: occurrence.planWorkoutId,
        status: 'skipped',
        scheduledDate: occurrence.scheduledDate,
        blocks: [],
        createdAt: stamp,
        updatedAt: stamp,
      });
      occurrence.sessionId = sessionId;
      continue;
    }

    const completedDate = occurrence === late ? addDays(occurrence.scheduledDate, 1) : occurrence.scheduledDate;
    const session = buildSession(plan, occurrence, occurrence.planWorkoutId, { completedDate, partial: occurrence === partial }, firstDate, bodyweight, isBodyweightExercise);
    sessions.push(session);
    occurrence.sessionId = session.id;
  }

  // A repeated Upper A, done the Saturday after the original four weeks ago.
  const repeatSource = sessions.filter((s) => s.planWorkoutId === 'pw_upper_a').at(-4);
  if (repeatSource?.completedDate) {
    const plan = plansById.get('plan_upper_lower')!;
    sessions.push(
      buildSession(plan, undefined, 'pw_upper_a', { completedDate: addDays(repeatSource.completedDate, 5), repeatedFromSessionId: repeatSource.id, idSuffix: '_repeat' }, firstDate, bodyweight, isBodyweightExercise),
    );
  }

  sessions.sort((a, b) => (a.completedDate ?? a.scheduledDate ?? '').localeCompare(b.completedDate ?? b.scheduledDate ?? ''));
  return { occurrences, sessions: withLastTimes(sessions), bodyweight };
}

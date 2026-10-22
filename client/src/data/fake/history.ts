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
  return entries;
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
    const base: LoggedSet = {
      id,
      kind: target.kind,
      modifiers: [...target.modifiers],
      target,
      completedAt: isoAt(ctx.completedDate, 17, 40 + setIndex * 3),
      restSec: target.restSec ? target.restSec + Math.round((ctx.random() - 0.5) * 30) : undefined,
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
 * a partial session, a late completion, and a repeated session.
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
  return { occurrences, sessions, bodyweight };
}

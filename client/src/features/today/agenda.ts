import { isWorkingSet, setVolumeKg } from '@/data/calculations';
import { daysBetween } from '@/data/dates';
import type { Exercise, ISODate, PersonalRecord, Plan, PlanWorkout, ScheduledOccurrence, WorkoutSession } from '@/data/types';

export type DayItemStatus = 'planned' | 'in_progress' | 'completed' | 'partial' | 'missed' | 'skipped';

export type DayItem = {
  key: string;
  date: ISODate;
  name: string;
  status: DayItemStatus;
  plan?: Plan;
  workout?: PlanWorkout;
  occurrence?: ScheduledOccurrence;
  session?: WorkoutSession;
  /** Scheduled here but completed on another day (history counts it on that day). */
  completedOn?: ISODate;
  /** Completed here without being scheduled here. */
  extra?: 'repeat' | 'late';
  /** For late completions shown on their completion day. */
  scheduledFor?: ISODate;
};

export type Agenda = Map<ISODate, DayItem[]>;

function statusFor(session: WorkoutSession | undefined, scheduledDate: ISODate, today: ISODate): DayItemStatus {
  if (!session) return scheduledDate < today ? 'missed' : 'planned';
  if (session.status === 'skipped') return 'skipped';
  if (session.status === 'in_progress') return 'in_progress';
  return session.completion === 'partial' ? 'partial' : 'completed';
}

/**
 * What the calendar shows for each day: occurrences scheduled that day (with their status,
 * even if completed elsewhere), plus sessions completed that day that weren't scheduled for it.
 */
export function buildAgenda(input: {
  occurrences: ScheduledOccurrence[];
  sessions: WorkoutSession[];
  plans: Plan[];
  /** Saved versions of the plans, so a workout shows the prescription it was scheduled with. */
  planVersions?: Plan[];
  today: ISODate;
}): Agenda {
  const { occurrences, sessions, plans, planVersions = [], today } = input;
  const agenda: Agenda = new Map();
  const add = (item: DayItem) => {
    const list = agenda.get(item.date);
    if (list) list.push(item);
    else agenda.set(item.date, [item]);
  };
  const plansById = new Map(plans.map((p) => [p.id, p]));
  const versions = new Map(planVersions.map((p) => [`${p.id}@${p.version}`, p]));
  /**
   * The plan as it was when this workout was scheduled; editing a plan only changes unstarted
   * future workouts. A deleted plan's saved version still names its logged workouts.
   */
  const planFor = (occurrence: ScheduledOccurrence) => {
    const current = plansById.get(occurrence.planId);
    if (current?.version === occurrence.planVersion) return current;
    return versions.get(`${occurrence.planId}@${occurrence.planVersion}`) ?? current;
  };
  /** A deleted plan's latest saved version, for its workouts done on another day. */
  const latestVersions = new Map<string, Plan>();
  for (const p of planVersions) if (!plansById.has(p.id) && (latestVersions.get(p.id)?.version ?? -Infinity) < p.version) latestVersions.set(p.id, p);
  const sessionsById = new Map(sessions.map((s) => [s.id, s]));
  const occurrencesById = new Map(occurrences.map((o) => [o.id, o]));

  for (const occurrence of occurrences) {
    const session = occurrence.sessionId ? sessionsById.get(occurrence.sessionId) : undefined;
    // A deleted plan's workouts that were never started aren't history; they go with the plan.
    if (!plansById.has(occurrence.planId) && !session) continue;
    const plan = planFor(occurrence);
    const workout = plan?.workouts.find((w) => w.id === occurrence.planWorkoutId);
    add({
      key: occurrence.id,
      date: occurrence.scheduledDate,
      name: workout?.name ?? session?.name ?? 'Workout',
      status: statusFor(session, occurrence.scheduledDate, today),
      plan,
      workout,
      occurrence,
      session,
      completedOn: session?.completedDate && session.completedDate !== occurrence.scheduledDate ? session.completedDate : undefined,
    });
  }

  for (const session of sessions) {
    if (session.status !== 'completed' || !session.completedDate) continue;
    const occurrence = session.occurrenceId ? occurrencesById.get(session.occurrenceId) : undefined;
    if (occurrence?.scheduledDate === session.completedDate) continue;
    const plan = session.planId ? (plansById.get(session.planId) ?? latestVersions.get(session.planId)) : undefined;
    add({
      key: `${session.id}_extra`,
      date: session.completedDate,
      name: session.name,
      status: session.completion === 'partial' ? 'partial' : 'completed',
      plan,
      workout: plan?.workouts.find((w) => w.id === session.planWorkoutId),
      session,
      extra: session.repeatedFromSessionId ? 'repeat' : 'late',
      scheduledFor: occurrence?.scheduledDate,
    });
  }
  return agenda;
}

/** How far back a missed workout can still be pushed forward from Today. */
export const MISSED_LOOKBACK_DAYS = 7;

/**
 * The most recent missed workout in the past week, for the "push plan forward?" prompt (see
 * missed.ts). `include` narrows the candidates. On a tie, the first in agenda order wins.
 */
export function latestMissed(agenda: Agenda, today: ISODate, include: (item: DayItem) => boolean = () => true): DayItem | undefined {
  let latest: DayItem | undefined;
  for (const [date, items] of agenda) {
    if (date >= today || daysBetween(date, today) > MISSED_LOOKBACK_DAYS) continue;
    for (const item of items) {
      if (item.status === 'missed' && (!latest || item.date > latest.date) && include(item)) latest = item;
    }
  }
  return latest;
}

export type SessionSummary = { volumeKg: number; minutes?: number; prCount: number; exercisesDone: number; exercisesTotal: number };

/**
 * A finished workout's stats for its Today card. An exercise is done once it has a completed set,
 * even if it was skipped part-way; volume comes from completed sets (setVolumeKg checks), and
 * the PR count is the number of records the workout set, as on its summary.
 */
export function summarizeSession(session: WorkoutSession, exercisesById: Map<string, Exercise>, records: PersonalRecord[]): SessionSummary {
  let volumeKg = 0;
  let exercisesDone = 0;
  let exercisesTotal = 0;
  for (const block of session.blocks) {
    for (const se of block.exercises) {
      exercisesTotal++;
      if (se.sets.some((s) => s.completedAt && isWorkingSet(s))) exercisesDone++;
      const exercise = exercisesById.get(se.exerciseId);
      if (exercise) for (const set of se.sets) volumeKg += setVolumeKg(set, exercise);
    }
  }
  const minutes =
    session.startedAt && session.completedAt ? (Date.parse(session.completedAt) - Date.parse(session.startedAt)) / 60_000 : undefined;
  const prCount = records.filter((r) => r.sessionId === session.id).length;
  return { volumeKg, minutes, prCount, exercisesDone, exercisesTotal };
}

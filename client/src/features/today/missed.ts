// What the missed-workout banner on Today shows (spec 2.5). Kept free of React Native so the
// rules can be unit-tested (tests/today.test.ts).
import { addDays, localDateOf } from '@/data/dates';
import { planShiftFor, shiftedDate } from '@/data/schedule';
import type { ID, ISODate, Plan, PlanShift, Weekday } from '@/data/types';
import { formatWeekday, plural } from '@/lib/format';
import { latestMissed, type Agenda, type DayItem } from './agenda';

/** How many of the plan's later workouts a push moves along with the missed one. */
type LaterMoved = 'all' | 'some' | 'none';

/** The parts of a push that its wording needs. */
type PushSummary = {
  /** The workouts that move to today: the missed one, plus any others its plan had that day. */
  items: DayItem[];
  planName: string;
  /** How many days the push moves things: from the missed day to today. */
  days: number;
  /** Weekly plans only move the rest of this week; programs and cycles move for good. */
  weekly: boolean;
  /**
   * A weekly push leaves any workout that would cross into next week on its day, so it can move
   * all, some or none of the week's later workouts. Programs and cycles always move them all.
   */
  later: LaterMoved;
};

export type MissedBannerState =
  | (PushSummary & {
      kind: 'asking';
      /** The missed workout the push names: the one the plan put down first, so all of `items` move. */
      occurrenceId: ID;
      /** The day it was missed. */
      date: ISODate;
    })
  | (PushSummary & {
      kind: 'pushed';
      shift: PlanShift;
      /** Where the pushed workout goes back to if the push is undone. */
      returnsTo: ISODate;
    });

type Input = {
  agenda: Agenda;
  today: ISODate;
  plans: readonly Plan[];
  /** Pushes that haven't been undone. */
  shifts: readonly PlanShift[];
  /** Missed workouts the user chose to keep on their dates ("Keep schedule"). */
  dismissed: ReadonlySet<ID>;
  /** The workout open right now. It counts as started even before its first save. */
  activeOccurrenceId?: ID;
  /** The week-start setting: a weekly plan's push stays within the week that holds today. */
  weekStartsOn: Weekday;
};

/**
 * The banner's state, from saved data:
 * - 'pushed' (with Undo) after a push made today, until the moved workout is started. The newest
 *   such push shows.
 * - otherwise 'asking' about the latest missed workout in the past week whose plan is active and
 *   whose miss hasn't been settled (kept with "Keep schedule", started, or behind a later push).
 */
export function missedBannerState(input: Input): MissedBannerState | undefined {
  return pushedState(input) ?? askingState(input);
}

function planName(plans: readonly Plan[], planId: ID, item: DayItem): string {
  return plans.find((p) => p.id === planId)?.name ?? item.plan?.name ?? 'your plan';
}

/** The date the plan first put this workout on, before any push. */
const originalDate = (item: DayItem): ISODate => item.occurrence?.shiftedFromDate ?? item.date;

/**
 * Compares where each of the plan's unstarted workouts lands without the push and with it.
 * `skip` leaves out the workouts the push names, which move to today.
 */
function laterMoved(agenda: Agenda, push: PlanShift, before: readonly PlanShift[], skip: (item: DayItem) => boolean): LaterMoved {
  const { untilDate } = push;
  let moved = 0;
  let stayed = 0;
  for (const items of agenda.values()) {
    for (const item of items) {
      if (item.occurrence?.planId !== push.planId || item.occurrence.sessionId || skip(item)) continue;
      const original = originalDate(item);
      if (original < push.fromDate || (untilDate !== undefined && original > untilDate)) continue;
      if (shiftedDate(original, before, item.occurrence.id) === shiftedDate(original, [...before, push], item.occurrence.id)) stayed++;
      else moved++;
    }
  }
  return moved === 0 ? 'none' : stayed === 0 ? 'all' : 'some';
}

function pushedState({ agenda, today, plans, shifts, activeOccurrenceId }: Input): MissedBannerState | undefined {
  const byOccurrence = new Map<ID, DayItem>();
  for (const items of agenda.values()) for (const item of items) if (item.occurrence) byOccurrence.set(item.occurrence.id, item);
  const started = (item: DayItem) => !!item.occurrence?.sessionId || item.occurrence?.id === activeOccurrenceId;

  // createdAt is UTC; the Undo window is the local day of the push.
  const madeToday = shifts.filter((s) => localDateOf(s.createdAt) === today).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const shift of madeToday) {
    const pushed = byOccurrence.get(shift.occurrenceId);
    if (!pushed) continue;
    const others = shifts.filter((s) => s.planId === shift.planId && s.id !== shift.id);
    const returnsTo = shiftedDate(shift.fromDate, others, shift.occurrenceId);
    // The plan's workouts that sat on the missed day with it, before this push, came along too.
    const companions = (agenda.get(today) ?? []).filter(
      (i) => i !== pushed && i.occurrence?.planId === shift.planId && shiftedDate(originalDate(i), others, i.occurrence.id) === returnsTo,
    );
    const items = [pushed, ...companions];
    if (items.some(started)) continue;
    return {
      kind: 'pushed',
      shift,
      items,
      planName: planName(plans, shift.planId, pushed),
      days: shift.days,
      weekly: shift.untilDate !== undefined,
      later: laterMoved(agenda, shift, others, (i) => items.includes(i) || started(i)),
      returnsTo,
    };
  }
  return undefined;
}

function askingState({ agenda, today, plans, shifts, dismissed, activeOccurrenceId, weekStartsOn }: Input): MissedBannerState | undefined {
  // A push settles its plan's earlier misses: the plan carries on from the pushed workout.
  const settled = (item: DayItem) => shifts.some((s) => s.planId === item.occurrence?.planId && originalDate(item) < s.fromDate);
  const open = (item: DayItem) => !!activeOccurrenceId && item.occurrence?.id === activeOccurrenceId;
  const candidates = new Set<ID>();
  for (const plan of plans) {
    if (plan.status !== 'active') continue;
    const unsettled = (i: DayItem) => i.occurrence?.planId === plan.id && !settled(i);
    // Only a plan's latest miss is asked about, so keeping its schedule settles the earlier ones too.
    const latest = latestMissed(agenda, today, (i) => unsettled(i) && !open(i));
    // The open workout counts as started. When it's the latest miss, the plan carries on from it.
    const opened = latestMissed(agenda, today, (i) => unsettled(i) && open(i));
    if (!latest?.occurrence || (opened && opened.date > latest.date) || dismissed.has(latest.occurrence.id)) continue;
    candidates.add(latest.occurrence.id);
  }
  const missed = latestMissed(agenda, today, (i) => !!i.occurrence && candidates.has(i.occurrence.id));
  const plan = plans.find((p) => p.id === missed?.occurrence?.planId);
  if (!missed || !plan) return undefined;
  // The plan's other workouts that day were missed too, and the push moves them along.
  const items = (agenda.get(missed.date) ?? []).filter(
    (i) =>
      i === missed ||
      (i.status === 'missed' && i.occurrence?.planId === plan.id && !settled(i) && !dismissed.has(i.occurrence.id) && !open(i)),
  );
  // A push moves workouts from its original date on. Pushing the one the plan put down first
  // moves them all, even when an earlier push left one on its day beside a moved one.
  const first = items.reduce((a, b) => (originalDate(b) < originalDate(a) ? b : a));
  if (!first.occurrence) return undefined;
  // A preview of the push the repository will save. It's stamped with the plan's newest push's
  // time so it applies after them, as the real one will (the sort in shiftedDate is stable).
  const own = shifts.filter((s) => s.planId === plan.id);
  const now = own.reduce((newest, s) => (s.createdAt > newest ? s.createdAt : newest), '');
  const push = planShiftFor({ id: 'preview', plan, occurrence: first.occurrence, today, weekStartsOn, now });
  if (!push) return undefined;
  return {
    kind: 'asking',
    occurrenceId: first.occurrence.id,
    date: missed.date,
    items,
    planName: plan.name,
    days: push.days,
    weekly: push.untilDate !== undefined,
    later: laterMoved(agenda, push, own, (i) => items.includes(i) || open(i)),
  };
}

// ---------------------------------------------------------------------------
// Wording

/** "Upper B", "Upper B and Cardio", "Upper B, Cardio and Core". */
export function workoutNames(items: readonly DayItem[]): string {
  const names = items.map((i) => i.name);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? 'Workout');
}

const several = (items: readonly DayItem[]) => items.length > 1;

export function askingTitle(state: Extract<MissedBannerState, { kind: 'asking' }>): string {
  return `You missed ${workoutNames(state.items)} on ${formatWeekday(state.date)}`;
}

export function askingMessage(state: Extract<MissedBannerState, { kind: 'asking' }>): string {
  const names = workoutNames(state.items);
  const days = plural(state.days, 'day');
  const plan = state.planName;
  const keep = `If you keep the schedule, you can still do ${several(state.items) ? 'them' : 'it'} from ${formatWeekday(state.date)}.`;
  if (!state.weekly) return `Push ${plan} forward ${days} so ${names} ${several(state.items) ? 'land' : 'lands'} on today? ${keep}`;
  switch (state.later) {
    case 'all':
      return `Move ${names} to today and the rest of this week's ${plan} workouts ${days} later? Next week stays as planned. ${keep}`;
    case 'some':
      return `Move ${names} to today and this week's later ${plan} workouts ${days} later where they fit? Next week stays as planned. ${keep}`;
    case 'none':
      return `Move ${names} to today? Your other ${plan} workouts stay as planned. ${keep}`;
  }
}

/** Shown and announced once a push is saved. */
export function pushedMessage(push: PushSummary): string {
  const names = workoutNames(push.items);
  const days = plural(push.days, 'day');
  // A program's last workout has nothing after it to move.
  if (!push.weekly) return push.later === 'none' ? `${names} moved to today.` : `${names} moved to today, and the rest of ${push.planName} moved ${days} later.`;
  switch (push.later) {
    case 'all':
      return `${names} moved to today, and the rest of this week's ${push.planName} workouts moved ${days} later. Next week is unchanged.`;
    case 'some':
      return `${names} moved to today, and this week's later ${push.planName} workouts moved ${days} where they fit. Next week is unchanged.`;
    case 'none':
      return `${names} moved to today.`;
  }
}

/** Announced once an undo is saved. */
export function undoneMessage(state: Extract<MissedBannerState, { kind: 'pushed' }>): string {
  return `Push undone. ${workoutNames(state.items)} ${several(state.items) ? 'are' : 'is'} back on ${formatWeekday(state.returnsTo)}.`;
}

// ---------------------------------------------------------------------------
// "Keep schedule", remembered on the phone

/** A missed workout the user chose to keep on its date. */
export type DismissedMiss = { id: ID; date: ISODate };

/** Only the past week's misses are ever asked about, so older dismissals can go. */
const KEEP_DISMISSED_DAYS = 14;
const MAX_DISMISSED = 50;

/** Drops dismissals too old to matter (and anything unreadable), keeping the newest few. */
export function pruneDismissed(list: unknown, today: ISODate): DismissedMiss[] {
  if (!Array.isArray(list)) return [];
  const since = addDays(today, -KEEP_DISMISSED_DAYS);
  const valid = (list as Partial<DismissedMiss>[]).filter(
    (d): d is DismissedMiss => typeof d?.id === 'string' && typeof d.date === 'string' && d.date >= since,
  );
  return valid.slice(-MAX_DISMISSED);
}

/** Adds the asked-about workouts to the dismissed list. */
export function dismissMissed(list: unknown, items: readonly DayItem[], today: ISODate): DismissedMiss[] {
  const added = items.flatMap((i) => (i.occurrence ? [{ id: i.occurrence.id, date: i.date }] : []));
  const ids = new Set(added.map((d) => d.id));
  return pruneDismissed([...pruneDismissed(list, today).filter((d) => !ids.has(d.id)), ...added], today);
}

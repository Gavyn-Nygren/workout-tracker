import type { CycleStep, ID } from '@/data/types';
import { plural } from '@/lib/format';

// Words for a rotating plan's cycle days, shared by the cycle editor and the schedule grid.

/** A cycle day's workout names in order; a workout the plan no longer has reads "Workout". */
export function cycleDayNames(step: CycleStep, names: ReadonlyMap<ID, string>): string[] {
  return step.workoutIds.map((id) => names.get(id) ?? 'Workout');
}

/** "Push + Cardio", or "Rest" for a rest day. */
export const cycleDayTitle = (names: readonly string[]): string => (names.length ? names.join(' + ') : 'Rest');

/** Names as a sentence lists them: "Push", "Push and Cardio", "Push, Cardio and Core". */
export function nameList(names: readonly string[]): string {
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** A Reorder row's subtitle: "Day 2", "Day 2 · 2 workouts" (so a cut-off title still shows the count), or "Day 2 · Recovery". */
export function cycleDaySubtitle(index: number, workouts: number): string {
  const day = `Day ${index + 1}`;
  if (!workouts) return `${day} · Recovery`;
  return workouts === 1 ? day : `${day} · ${plural(workouts, 'workout')}`;
}

/**
 * The confirm before deleting a cycle day. It names the workouts that leave the cycle (those on no
 * other day), says they stay in the plan, and says what happens to the days after it and the calendar.
 */
export function deleteDayPrompt(steps: readonly CycleStep[], index: number, names: ReadonlyMap<ID, string>): { title: string; message: string } {
  const elsewhere = new Set(steps.flatMap((s, i) => (i === index ? [] : s.workoutIds)));
  const leaving = cycleDayNames({ workoutIds: (steps[index]?.workoutIds ?? []).filter((id) => !elsewhere.has(id)) }, names);
  const one = leaving.length === 1;
  const off = leaving.length ? `${nameList(leaving)} ${one ? 'comes' : 'come'} off the cycle but ${one ? 'stays' : 'stay'} in the plan.` : '';
  // Every upcoming date runs step (days since start % length), so any delete changes them, today included.
  const after = index < steps.length - 1 ? "Later days move up one day, so what's scheduled from today on changes." : "The cycle gets one day shorter, so what's scheduled from today on changes.";
  return { title: `Delete Day ${index + 1}?`, message: off ? `${off} ${after}` : after };
}

/**
 * The confirm before adding a day to the end of the cycle, or undefined when there's nothing to warn
 * about. A date runs step (days since start % length), so a longer cycle can change today and the
 * days after it. It doesn't when today is on the same step either way (always true in the first
 * lap): the days then run as before and the new day comes after the current lap's last.
 * `daysToday` is how far into its cycles the plan is today (cycleDaysToday in position.ts).
 */
export function addDayPrompt(length: number, daysToday: number): { title: string; message: string } | undefined {
  if (!length || daysToday < 0 || daysToday % length === daysToday % (length + 1)) return undefined;
  return { title: `Add Day ${length + 1}?`, message: "The cycle gets one day longer, so what's scheduled from today on changes." };
}

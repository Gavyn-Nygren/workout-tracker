// Lock-screen wording for workout reminders and missed-workout prompts (spec 2.11, G3.12).
// Short and plain, no guilt (spec 2.5). The weekly summary's wording is in
// features/weekly/weeklySummary.ts. Pure, tested in tests/notificationPlan.test.ts.
import type { DayItem } from '@/features/today/agenda';
import { workoutNames } from '@/features/today/missed';
import type { SummaryText } from './types';

/** About how long a list of names can be before it's shortened to "Upper A +2". */
const MAX_LIST_CHARS = 40;

/**
 * Several workouts named the way Today's banner does ("Upper A and Calves & Core"), or, past
 * about 40 characters, the way Today's header does ("Upper A +2").
 */
export function shortWorkoutList(names: string[], maxChars: number = MAX_LIST_CHARS): string {
  if (names.length === 0) return 'Workout';
  // workoutNames reads only the names.
  const full = workoutNames(names.map((name, i): DayItem => ({ key: String(i), date: '', name, status: 'planned' })));
  return names.length === 1 || full.length <= maxChars ? full : `${names[0]} +${names.length - 1}`;
}

/** Whole minutes for "about 85 min", or undefined when any workout has no estimate. */
function totalMinutes(items: { minutes?: number }[]): number | undefined {
  if (!items.length || items.some((i) => !(typeof i.minutes === 'number' && i.minutes > 0))) return undefined;
  return Math.round(items.reduce((sum, i) => sum + (i.minutes ?? 0), 0));
}

/**
 * A training day's reminder: "Lower A today" / "Upper / Lower Strength · about 60 min", or for
 * several workouts "Upper A and Calves & Core today" / "2 workouts · about 85 min".
 */
export function reminderCopy(items: { name: string; planName: string; minutes?: number }[]): SummaryText {
  const title = `${shortWorkoutList(items.map((i) => i.name))} today`;
  const minutes = totalMinutes(items);
  const about = minutes ? `about ${minutes} min` : undefined;
  const lead = items.length > 1 ? `${items.length} workouts` : items[0]?.planName;
  const body = [lead, about].filter((part): part is string => !!part).join(' · ');
  return { title, body: body || 'On your plan for today' };
}

/** The morning-after prompt: "You missed Lower A yesterday" / "Move it to today or keep your schedule. Tap to choose." */
export function missedCopy(names: string[]): SummaryText {
  return {
    title: `You missed ${shortWorkoutList(names)} yesterday`,
    body: `Move ${names.length > 1 ? 'them' : 'it'} to today or keep your schedule. Tap to choose.`,
  };
}

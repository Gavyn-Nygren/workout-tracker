// What a tapped notification opens (G3.12). Pure, so every branch is tested in Node
// (tests/notificationRouting.test.ts); NotificationTaps.tsx runs the action through the router.
//
// The route comes from the notification's kind and date, never from a stored URL, so a
// notification that was pending across an update still opens the right screen.
import { isISODate } from '@/data/dates';
import type { ISODate } from '@/data/types';
import { REST_ALARM_KIND } from '@/features/workout/restAlarm';
import { NOTIFICATION_APP } from './types';

/** Where the app is when the tap arrives. `rootRouteNames`: the root stack's routes (useRootNavigationState). */
export type TapContext = { workoutOpen: boolean; rootRouteNames: readonly string[]; pathname: string };

export type TapAction =
  /** Close any open modal and show Today with today selected. */
  | { kind: 'today' }
  | { kind: 'push'; href: { pathname: '/weekly-summary' | '/workout'; params?: Record<string, string> } }
  /** "Your week" is already showing: change its week instead of stacking another copy. */
  | { kind: 'setParams'; params: { week: ISODate } };

const WEEKLY_SUMMARY_PATH = '/weekly-summary';
const WORKOUT_PATH = '/workout';

/** The workout screen or one of its sheets ('workout/index', 'workout/timer', …) is in the root stack. */
const workoutInStack = (ctx: TapContext) =>
  ctx.rootRouteNames.some((name) => name === 'workout' || name.startsWith('workout/')) || ctx.pathname === WORKOUT_PATH || ctx.pathname.startsWith(`${WORKOUT_PATH}/`);

/**
 * The action for a tapped notification's content data, or null to do nothing:
 * - a workout reminder or missed-workout prompt opens Today (one for a past day too: Today is
 *   where the push-forward question is);
 * - the weekly summary opens "Your week" for its week, or changes the week when it's showing;
 * - the rest alarm opens the workout, unless no workout is open or it's already in the stack
 *   (a plain push would stack a second workout screen);
 * - anything else, or malformed data, does nothing.
 */
export function tapAction(data: unknown, ctx: TapContext): TapAction | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  if (d.kind === REST_ALARM_KIND) return ctx.workoutOpen && !workoutInStack(ctx) ? { kind: 'push', href: { pathname: WORKOUT_PATH } } : null;

  if (d.app !== NOTIFICATION_APP) return null;
  switch (d.kind) {
    case 'workoutReminder':
    case 'missedWorkout':
      return { kind: 'today' };
    case 'weeklySummary': {
      const week = isISODate(d.date) ? d.date : undefined;
      if (ctx.pathname === WEEKLY_SUMMARY_PATH) return week ? { kind: 'setParams', params: { week } } : null;
      // Without a readable week, the screen opens the latest summary's.
      return { kind: 'push', href: week ? { pathname: WEEKLY_SUMMARY_PATH, params: { week } } : { pathname: WEEKLY_SUMMARY_PATH } };
    }
    default:
      return null;
  }
}

/** One tap of one delivery: the same request delivered again (a re-fired id) is a new tap. */
export function responseKey(identifier: string, date: number): string {
  return `${identifier}@${date}`;
}

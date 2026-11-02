// How a notification shows when it arrives while the app is open (G3.12). iOS asks the app's
// notification handler only then; on the lock screen each one shows as it was scheduled (the
// reminders and prompts with the default sound, the summary silently). Pure, so every kind and
// context is tested in Node (tests/notificationRouting.test.ts).
import { isRestAlarm, presentationFor, type IncomingNotification, type Presentation } from '@/features/workout/restAlarm';
import { NOTIFICATION_APP } from './types';

/** Where the app is: Today showing, or a workout open (NotificationTaps keeps this up to date). */
export type ForegroundContext = { onToday: boolean; workoutOpen: boolean };

const BANNER_WITH_SOUND: Presentation = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };
const BANNER_SILENT: Presentation = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
const LIST_ONLY: Presentation = { shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };

/**
 * The handler's answer for any notification:
 * - the rest alarm stays hidden (presentationFor): the app's own "Rest over" bar marks the end;
 * - a workout reminder or missed prompt shows as a banner with sound, except on Today or during a
 *   workout, where a banner about what's on screen is noise: it goes to Notification Center only;
 * - the weekly summary shows as a banner with no sound;
 * - anything else shows as a banner with sound.
 * No notification sets a badge (the app never asks for badge permission).
 */
export function presentationForAny(n: IncomingNotification, ctx: ForegroundContext): Presentation {
  if (isRestAlarm(n)) return { ...presentationFor(n), shouldSetBadge: false };
  const data = n.request.content.data;
  if (data?.app === NOTIFICATION_APP) {
    if (data.kind === 'workoutReminder' || data.kind === 'missedWorkout') return { ...(ctx.onToday || ctx.workoutOpen ? LIST_ONLY : BANNER_WITH_SOUND) };
    if (data.kind === 'weeklySummary') return { ...BANNER_SILENT };
  }
  return { ...BANNER_WITH_SOUND };
}

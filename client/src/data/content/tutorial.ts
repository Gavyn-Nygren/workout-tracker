import { plural } from '@/lib/format';
import type { StarterTemplate, UnitSystem } from '../types';
import { lbToKg } from '../units';
import { STARTER_TEMPLATES } from './templates';

// The optional tour's words (spec 2.4 Tour, G3.13): five cards in spec order, the onboarding pitch,
// the last button and what the illustrations show. Pure, so tests check the copy and that the art
// matches the catalog; tutorial.tsx draws the cards. Copy follows spec 2.13: plain, no emoji, no
// "!", titles of 32 characters or fewer and bodies of 32 words or fewer.

export type TourCardKey = 'today' | 'log' | 'form' | 'progress' | 'goals';

export type TourCard = {
  key: TourCardKey;
  title: string;
  body: string;
  /** How the onboarding pitch names the card (TOUR_PITCH lists every one). */
  topic: string;
};

export const TOUR_CARDS: readonly TourCard[] = [
  {
    key: 'today',
    title: 'Your plan, day by day',
    body: "Pick a plan in Plans and Today shows each day's workouts. Swipe when a day has more than one. Miss a workout and you decide whether to move the plan.",
    topic: 'Today',
  },
  {
    key: 'log',
    title: 'Log a set in one tap',
    body: 'Sets start from your plan and last time. Tap the check after each set: the rest timer starts, or a superset moves on. A line explains each weight change the plan suggests.',
    topic: 'logging and rest',
  },
  {
    key: 'form',
    title: 'Film a set, track your form',
    body: 'Optional, for squats, lunges, deadlifts and calf raises. Prop up your phone, stand side-on and record a set to see your reps, depth and joint angles. The video stays on your phone.',
    topic: 'form recording',
  },
  {
    key: 'progress',
    title: 'See your progress',
    body: "Progress charts each main lift's estimated one-rep max (e1RM) and your bodyweight. Tap a chart to open it, then drag across it to read each point.",
    topic: 'progress',
  },
  {
    key: 'goals',
    title: 'Goals and streaks',
    body: "Hit each week's target to grow your streak. On Home, set goals for a lift, your bodyweight, your form or how often you train, and see the badges you've earned.",
    topic: 'goals and streaks',
  },
];

/** Under the form card's body while recording is a mock (FORM_ANALYSIS_PREVIEW, switched off at G4.3). */
export const FORM_PREVIEW_LINE = 'In this preview build, recording is simulated.';

/** The form card's body on phones older than the iPhone 12, where the camera is off (as FormUnavailable says). */
export const FORM_UNSUPPORTED_BODY = "Form recording needs an iPhone 12 or newer, so it's off on this phone. Logging, plans and progress all work as usual.";

/** Onboarding's "Want a quick tour?" text. It names every card's topic. */
export const TOUR_PITCH = 'Five short cards: Today, logging and rest, form recording, progress, and goals and streaks. About 30 seconds. Replay it any time from Profile → About.';

/** The workout the Today card's illustration shows: a real starter program, so the art can't drift from the catalog. */
export const TOUR_ART = { templateId: 'tpl_full_body_foundations', workoutName: 'Full Body B' } as const;

/** The `from` value onboarding opens the tour with (`/tutorial?from=onboarding`). */
export const TOUR_FROM_ONBOARDING = 'onboarding';

/**
 * The last card's button, by where the tour was opened: 'Start training' from onboarding, where
 * the app opens next, and 'Done' from Profile → About, which it closes back to.
 */
export function tourLastButton(from: string | readonly string[] | undefined): 'Start training' | 'Done' {
  const value = Array.isArray(from) ? from[0] : from;
  return value === TOUR_FROM_ONBOARDING ? 'Start training' : 'Done';
}

export type TourCardText = {
  title: string;
  body: string;
  /** A line under the body: the form card's preview line while recording is a mock. */
  note?: string;
};

/**
 * What a card shows on this phone. The form card swaps its body on phones without form recording,
 * and adds the preview line on the others while the flag is on (it would mean nothing where
 * recording is off).
 */
export function tourCardText(card: TourCard, device: { formSupported: boolean; preview: boolean }): TourCardText {
  if (card.key !== 'form') return { title: card.title, body: card.body };
  if (!device.formSupported) return { title: card.title, body: FORM_UNSUPPORTED_BODY };
  return { title: card.title, body: card.body, note: device.preview ? FORM_PREVIEW_LINE : undefined };
}

/** VoiceOver's label for a card, the visible words in order: "3 of 5. Title. Body. Note". */
export function spokenTourCard(index: number, total: number, text: TourCardText): string {
  return `${index + 1} of ${total}. ${text.title}. ${text.body}${text.note ? ` ${text.note}` : ''}`;
}

export type TourTodayArt = { programName: string; workoutName: string; meta: string };

/**
 * The Today illustration's program, workout and meta line, read from the catalog: the Today
 * card's "~50 min · 15 working sets" (minutes when the workout has an estimate, then every set
 * that isn't a warm-up, as WorkoutCard counts them). Undefined if TOUR_ART names a workout the
 * catalog doesn't have; tests/tutorial.test.ts keeps that from shipping.
 */
export function tourTodayArt(templates: readonly StarterTemplate[] = STARTER_TEMPLATES): TourTodayArt | undefined {
  const template = templates.find((t) => t.id === TOUR_ART.templateId);
  const workout = template?.workouts.find((w) => w.name === TOUR_ART.workoutName);
  if (!template || !workout) return undefined;
  const workingSets = workout.blocks
    .flatMap((b) => b.exercises)
    .flatMap((e) => e.sets)
    .filter((s) => s.kind !== 'warmup').length;
  const parts = workout.estimatedMinutes ? [`~${workout.estimatedMinutes} min`] : [];
  parts.push(plural(workingSets, 'working set'));
  return { programName: template.name, workoutName: workout.name, meta: parts.join(' · ') };
}

/** Just the Today illustration's meta line, for example "~50 min · 15 working sets". */
export function tourTodayMeta(templates: readonly StarterTemplate[] = STARTER_TEMPLATES): string | undefined {
  return tourTodayArt(templates)?.meta;
}

/** The kg step the illustrations' weights round to. */
const ART_KG_STEP = 2.5;

/**
 * A weight in the illustrations, written in pounds, in the user's units: unchanged in pounds, and
 * in kilograms rounded to 2.5 (275 lb shows as 125, 338 lb as 152.5).
 */
export function tourArtLoad(lb: number, units: UnitSystem): number {
  if (units === 'imperial') return lb;
  return Math.round(lbToKg(lb) / ART_KG_STEP) * ART_KG_STEP;
}

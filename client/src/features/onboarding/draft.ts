// Onboarding's draft answers (spec 2.4): what each question's Skip and Continue write, and the
// height question's units and range. A skipped question is unknown, so the questions start from
// nothing answered rather than the stored answers. Pure (types only), so tests can load it; the
// stored copy lives in answers.ts, which only screens import.
import type { OnboardingAnswers, UnitSystem } from '@/data/types';

/** The questions, one per screen, in order. */
export const ONBOARDING_STEPS = ['experience', 'goal', 'equipment', 'days', 'body', 'limits'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Where the questions start: nothing answered. */
export function emptyAnswers(): OnboardingAnswers {
  return { limitations: [], limitationNote: '' };
}

/** The days stepper's starting position. It's only a draft: nothing is answered until Continue. */
export const DAYS_DRAFT = 3;

/** Values not yet answered: the days stepper's position, and the height field in the user's units. */
export type StepDrafts = { days: number; height: number | undefined; units: UnitSystem };

type OptionalAnswer = 'experience' | 'goal' | 'equipment' | 'daysPerWeek' | 'heightIn';

function without(answers: OnboardingAnswers, key: OptionalAnswer): OnboardingAnswers {
  const next = { ...answers };
  delete next[key];
  return next;
}

/** The answers after `step`'s Skip: that question's answer is cleared, so it counts as skipped. */
export function skipStep(answers: OnboardingAnswers, step: OnboardingStep): OnboardingAnswers {
  switch (step) {
    case 'experience':
      return without(answers, 'experience');
    case 'goal':
      return without(answers, 'goal');
    case 'equipment':
      return without(answers, 'equipment');
    case 'days':
      return without(answers, 'daysPerWeek');
    case 'body':
      return without(answers, 'heightIn');
    case 'limits':
      return { ...answers, limitations: [], limitationNote: '' };
  }
}

/**
 * The answers after `step`'s Continue. Equipment with no chip selected counts as skipped. The days
 * stepper's draft is written only now. Height is stored in inches, and only when it's in range
 * (Continue is off otherwise); an empty field clears it.
 */
export function continueStep(answers: OnboardingAnswers, step: OnboardingStep, drafts: StepDrafts): OnboardingAnswers {
  switch (step) {
    case 'equipment':
      return answers.equipment?.length ? answers : without(answers, 'equipment');
    case 'days':
      return { ...answers, daysPerWeek: drafts.days };
    case 'body':
      return drafts.height !== undefined && isPlausibleHeight(drafts.height, drafts.units)
        ? { ...answers, heightIn: heightFromField(drafts.height, drafts.units) }
        : without(answers, 'heightIn');
    default:
      return answers;
  }
}

/** The height range the question accepts, in the user's units: 36-96 in, or 91-244 cm. */
export const HEIGHT_LIMITS: Record<UnitSystem, { min: number; max: number }> = {
  imperial: { min: 36, max: 96 },
  metric: { min: 91, max: 244 },
};

const CM_PER_IN = 2.54;

/** The height field's unit: in, or cm when Settings use kilograms. */
export const heightUnit = (units: UnitSystem) => (units === 'imperial' ? 'in' : 'cm');

/** The height field's spoken label. */
export const heightLabel = (units: UnitSystem) => (units === 'imperial' ? 'Height in inches' : 'Height in centimetres');

export function isPlausibleHeight(value: number | undefined, units: UnitSystem): value is number {
  if (value === undefined || !Number.isFinite(value)) return false;
  const { min, max } = HEIGHT_LIMITS[units];
  return value >= min && value <= max;
}

/** A height typed in the user's units, in inches (to 0.1 in, from centimetres). */
export function heightFromField(value: number, units: UnitSystem): number {
  return units === 'imperial' ? value : Math.round((value / CM_PER_IN) * 10) / 10;
}

/**
 * Why Continue is off for a typed height, or undefined when it's fine. An empty field has no
 * message (Continue clears it, like Skip). `editing`: still typing, so a height below the minimum
 * isn't called out yet (typing 180 passes through 1 and 18); one above the maximum is.
 */
export function heightProblem(value: number | undefined, units: UnitSystem, options: { editing?: boolean } = {}): string | undefined {
  if (value === undefined || isPlausibleHeight(value, units)) return undefined;
  const { min, max } = HEIGHT_LIMITS[units];
  if (options.editing && value < min) return undefined;
  return `Enter a height between ${min} and ${max} ${heightUnit(units)}.`;
}

/** Whether the height question's Continue can be pressed: an empty field or a height in range. */
export const canContinueWithHeight = (value: number | undefined, units: UnitSystem) => value === undefined || isPlausibleHeight(value, units);

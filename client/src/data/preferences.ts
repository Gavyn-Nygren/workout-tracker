import type { Equipment, ID, Preferences, UnitSystem } from './types';

/** Rounding defaults per unit system (spec 2.6): barbell 5 lb / 2.5 kg, dumbbell 5 lb / 2 kg, machine 5 lb / 2.5 kg. */
export const defaultRounding: Record<UnitSystem, Partial<Record<Equipment, number>>> = {
  imperial: { barbell: 5, dumbbell: 5, machine: 5, cable: 5, kettlebell: 5 },
  metric: { barbell: 2.5, dumbbell: 2, machine: 2.5, cable: 2.5, kettlebell: 4 },
};

/** Settings for a new account (spec 2.4): lb/in, RPE, per-equipment rounding, rest by exercise type. */
export const defaultPreferences: Preferences = {
  units: 'imperial',
  effortScale: 'rpe',
  roundingIncrements: { ...defaultRounding.imperial },
  restDefaultsSec: { compound: 180, isolation: 90, warmup: 60 },
  restByExerciseSec: {},
  weekStartsOn: 1,
  haptics: true,
  celebrations: true,
  telemetry: true,
  biometricLock: { enabled: false, afterSec: 300 },
  notifications: {
    workoutReminders: false,
    restTimer: false,
    missedWorkout: false,
    weeklySummary: false,
    formAnalysisComplete: false,
    reminderTime: '17:00',
    weeklySummaryAt: { weekday: 7, time: '19:00' },
  },
};

/** The range and step for rest lengths set in Settings, on an exercise, or learned from the timer. */
export const REST_LIMITS_SEC = { min: 15, max: 600, step: 15 } as const;

/** A rest length kept inside REST_LIMITS_SEC, in whole seconds. */
export function clampRestSec(sec: number): number {
  return Math.min(REST_LIMITS_SEC.max, Math.max(REST_LIMITS_SEC.min, Math.round(sec)));
}

/** Remembered rests as stored, minus anything unusable, each kept inside the limits. */
function cleanRestMemory(stored: unknown): Record<ID, number> {
  if (!stored || typeof stored !== 'object') return {};
  const clean: Record<ID, number> = {};
  for (const [id, sec] of Object.entries(stored)) {
    if (typeof sec === 'number' && Number.isFinite(sec) && sec > 0) clean[id] = clampRestSec(sec);
  }
  return clean;
}

/**
 * Saved preferences as the app uses them: settings added in later versions fall back to their
 * defaults, so rows saved by an older version still load.
 */
export function withPreferenceDefaults(stored: Partial<Preferences> | null | undefined): Preferences {
  if (!stored) return defaultPreferences;
  return {
    ...defaultPreferences,
    ...stored,
    notifications: { ...defaultPreferences.notifications, ...stored.notifications },
    restByExerciseSec: cleanRestMemory(stored.restByExerciseSec),
  };
}

/**
 * Preferences with exercises' remembered rests changed: a number sets one (kept inside the
 * limits), null forgets it so the exercise goes back to its type's default.
 */
export function withRememberedRests(preferences: Preferences, changes: Record<ID, number | null>): Preferences {
  const restByExerciseSec = { ...preferences.restByExerciseSec };
  for (const [id, sec] of Object.entries(changes)) {
    if (sec === null) delete restByExerciseSec[id];
    else restByExerciseSec[id] = clampRestSec(sec);
  }
  return { ...preferences, restByExerciseSec };
}

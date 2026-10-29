import type { Equipment, ID, Preferences, ProgressGraph, ProgressPin, ProgressPreferences, UnitSystem } from './types';

/** Rounding defaults per unit system (spec 2.6): barbell 5 lb / 2.5 kg, dumbbell 5 lb / 2 kg, machine 5 lb / 2.5 kg. */
export const defaultRounding: Record<UnitSystem, Partial<Record<Equipment, number>>> = {
  imperial: { barbell: 5, dumbbell: 5, machine: 5, cable: 5, kettlebell: 5 },
  metric: { barbell: 2.5, dumbbell: 2, machine: 2.5, cable: 2.5, kettlebell: 4 },
};

/** Progress's default Key exercise pins (spec 2.10): Squat, Bench, and Deadlift. */
export const DEFAULT_PIN_IDS: readonly ID[] = ['ex_back_squat', 'ex_bench_press', 'ex_deadlift'];

/**
 * Progress for a new account (G3.11, user's pick): the default pins, which show once logged, and
 * no saved graphs.
 */
export const defaultProgress: ProgressPreferences = {
  pins: DEFAULT_PIN_IDS.map((exerciseId) => ({ exerciseId, isDefault: true })),
  graphs: [],
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
  progress: defaultProgress,
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

const isId = (value: unknown): value is ID => typeof value === 'string' && value.length > 0;

/**
 * Progress pins and graphs as stored, minus anything unusable, so a bad value never crashes
 * Progress. Missing (saved before G3.11) or not an object: the defaults. Pins: a list (a missing
 * one is the default pins; an empty one stays empty), one per exercise, first kept; only a default
 * pin's id can be marked a default. Graphs: each needs an id, an exercise and a metric, one per id
 * and per exercise and metric, first kept. Whether the metric is one Progress knows is checked by
 * Progress itself (features/progress/progressPrefs.ts).
 */
export function cleanProgress(stored: unknown): ProgressPreferences {
  if (!stored || typeof stored !== 'object') return defaultProgress;
  const { pins: storedPins, graphs: storedGraphs } = stored as { pins?: unknown; graphs?: unknown };

  let pins = defaultProgress.pins;
  if (Array.isArray(storedPins)) {
    const seen = new Set<ID>();
    pins = [];
    for (const item of storedPins as unknown[]) {
      const exerciseId = typeof item === 'string' ? item : item && typeof item === 'object' ? (item as { exerciseId?: unknown }).exerciseId : undefined;
      if (!isId(exerciseId) || seen.has(exerciseId)) continue;
      seen.add(exerciseId);
      const isDefault = typeof item === 'object' && (item as ProgressPin).isDefault === true && DEFAULT_PIN_IDS.includes(exerciseId);
      pins.push(isDefault ? { exerciseId, isDefault: true } : { exerciseId });
    }
  }

  const graphs: ProgressGraph[] = [];
  if (Array.isArray(storedGraphs)) {
    const ids = new Set<ID>();
    const pairs = new Set<string>();
    for (const item of storedGraphs as unknown[]) {
      if (!item || typeof item !== 'object') continue;
      const { id, exerciseId, metric } = item as Partial<Record<keyof ProgressGraph, unknown>>;
      if (!isId(id) || !isId(exerciseId) || !isId(metric)) continue;
      const pair = `${exerciseId}\u0000${metric}`;
      if (ids.has(id) || pairs.has(pair)) continue;
      ids.add(id);
      pairs.add(pair);
      graphs.push({ id, exerciseId, metric });
    }
  }
  return { pins, graphs };
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
    progress: cleanProgress(stored.progress),
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

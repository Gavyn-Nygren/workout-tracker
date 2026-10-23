import type { Preferences } from './types';

/** Settings for a new account (spec 2.4): lb/in, RPE, per-equipment rounding, rest by exercise type. */
export const defaultPreferences: Preferences = {
  units: 'imperial',
  effortScale: 'rpe',
  roundingIncrements: { barbell: 5, dumbbell: 5, machine: 5, cable: 5 },
  restDefaultsSec: { compound: 180, isolation: 90, warmup: 60 },
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
  },
};

import type { Equipment, Preferences, UnitSystem } from './types';

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
    reminderTime: '17:00',
    weeklySummaryAt: { weekday: 7, time: '19:00' },
  },
};

/** Rounding defaults per unit system (spec 2.6): barbell 5 lb / 2.5 kg, dumbbell 5 lb / 2 kg, machine 5 lb / 2.5 kg. */
export const defaultRounding: Record<UnitSystem, Partial<Record<Equipment, number>>> = {
  imperial: { barbell: 5, dumbbell: 5, machine: 5, cable: 5, kettlebell: 5 },
  metric: { barbell: 2.5, dumbbell: 2, machine: 2.5, cable: 2.5, kettlebell: 4 },
};

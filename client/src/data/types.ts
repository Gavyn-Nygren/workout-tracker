// Domain types for the app, following spec section 3 (exercise-tracker-draft.md).
//
// Conventions:
// - Loads are stored canonically in kilograms (`...Kg`) and converted for display.
// - `ISODate` is a local calendar date ('YYYY-MM-DD'); `ISODateTime` is a full ISO timestamp.
// - Every synced record carries `createdAt`/`updatedAt`, plus `deletedAt` as a tombstone.

export type ID = string;
export type ISODate = string;
export type ISODateTime = string;

export type Timestamps = {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deletedAt?: ISODateTime;
};

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ---------------------------------------------------------------------------
// Exercises

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'kettlebell'
  | 'band'
  | 'bodyweight'
  | 'other';

export type MuscleGroup =
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'adductors'
  | 'calves'
  | 'chest'
  | 'back'
  | 'lats'
  | 'traps'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'core';

/** Movement families with verified form analysis in V1 (spec 2.8). */
export type FormMovementFamily = 'squat' | 'lunge' | 'deadlift' | 'calf_raise';

export type Exercise = Timestamps & {
  id: ID;
  name: string;
  source: 'builtin' | 'custom';
  /** Custom exercises may link to a built-in base movement for grouped stats and form analysis. */
  baseMovementId?: ID;
  equipment?: Equipment;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles?: MuscleGroup[];
  /** Drives default rest: compound 3:00, isolation 1:30. */
  category: 'compound' | 'isolation';
  /** Effective load = bodyweight snapshot + added load (or minus assistance). */
  isBodyweight: boolean;
  /** Sets log assistance subtracted from bodyweight by default (assisted pull-up and dip machines). */
  isAssisted?: boolean;
  formAnalysis?: FormMovementFamily;
  aliases?: string[];
  instructions?: string;
  mediaUrl?: string;
};

// ---------------------------------------------------------------------------
// Sets and prescriptions

export type SetKind = 'normal' | 'warmup' | 'drop' | 'timed_hold' | 'assisted';
export type SetModifier = 'amrap' | 'to_failure' | 'shortened_partials' | 'lengthened_partials';

export type RepTarget = number | { min: number; max: number };

/** A planned set. Effort is stored as RIR; RPE = 10 - RIR is a display choice. */
export type SetPrescription = {
  kind: SetKind;
  modifiers: SetModifier[];
  targetReps?: RepTarget;
  targetLoadKg?: number;
  targetRir?: number;
  targetDurationSec?: number;
  restSec?: number;
  /** Eccentric-pause-concentric-pause, e.g. '3-1-1-0'; 'X' means explosive. */
  tempo?: string;
};

export type MissBehavior =
  | { type: 'repeat' }
  | { type: 'deload'; afterConsecutiveMisses: number; percent: number };

export type ProgressionRule =
  | { type: 'rep_range'; incrementKg: number; onMiss: MissBehavior }
  | { type: 'percent_weekly'; percent: number; onMiss: MissBehavior };

// ---------------------------------------------------------------------------
// Plans and templates

export type BlockType = 'single' | 'superset' | 'circuit' | 'warmup';

export type PlannedExercise = {
  id: ID;
  exerciseId: ID;
  sets: SetPrescription[];
  progression?: ProgressionRule;
  notes?: string;
};

export type PlannedBlock = {
  id: ID;
  type: BlockType;
  exercises: PlannedExercise[];
  /** Supersets/circuits: rest after the last exercise of each round. */
  roundRestSec?: number;
  /** Supersets/circuits: optional short rest between exercises in a round. */
  transitionRestSec?: number;
};

export type PlanWorkout = {
  id: ID;
  name: string;
  blocks: PlannedBlock[];
  estimatedMinutes?: number;
};

export type PlanSchedule =
  | { type: 'weekly'; days: { weekday: Weekday; workoutIds: ID[] }[] }
  | { type: 'fixed'; weeks: number; days: { week: number; weekday: Weekday; workoutIds: ID[] }[] }
  | { type: 'rotating'; sequence: (ID | 'rest')[] };

export type TemplateCategory =
  | 'bodybuilding'
  | 'powerlifting'
  | 'atg'
  | 'crossfit'
  | 'athletic'
  | 'bodyweight'
  | 'gym';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export type StarterTemplate = {
  id: ID;
  name: string;
  category: TemplateCategory;
  level: ExperienceLevel;
  daysPerWeek: number;
  durationWeeks?: number;
  description: string;
  equipment: Equipment[];
  schedule: PlanSchedule;
  workouts: PlanWorkout[];
};

/** A user's plan. Templates are copied in, so template edits never rewrite it. */
export type Plan = Timestamps & {
  id: ID;
  name: string;
  templateId?: ID;
  /** Increments on edit; edits apply to unstarted future occurrences only. */
  version: number;
  status: 'active' | 'paused' | 'archived';
  startDate: ISODate;
  schedule: PlanSchedule;
  workouts: PlanWorkout[];
};

/**
 * A "push forward" after a missed workout (spec 2.5). The plan's workouts originally scheduled
 * from `fromDate` (through `untilDate`, if set) move `days` later; started ones stay where they
 * were done. Weekly plans stop at the end of the week the missed workout lands in, so the next
 * week is back on the usual days (user's pick); programs and rotating cycles shift for good.
 * Undoing a push deletes it, and the workouts move back.
 */
export type PlanShift = Timestamps & {
  id: ID;
  planId: ID;
  /** The missed workout that was pushed to the day of the push. */
  occurrenceId: ID;
  /** The pushed workout's original (unshifted) date. Dates here are always original ones. */
  fromDate: ISODate;
  untilDate?: ISODate;
  days: number;
  /**
   * Workouts in the push's range that were already started or done when it was made. They stayed
   * where they were, and the push never moves them, even if their session is later deleted.
   */
  keptIds?: ID[];
  /** The plan's other unstarted workouts on the missed day when it was pushed; they move with it. */
  alongIds?: ID[];
};

/** One scheduled instance of a plan workout on the calendar. */
export type ScheduledOccurrence = {
  id: ID;
  planId: ID;
  planVersion: number;
  planWorkoutId: ID;
  scheduledDate: ISODate;
  /** The date the plan originally put it on, when a push forward moved it (spec 2.5). */
  shiftedFromDate?: ISODate;
  /** The session that fulfilled this occurrence, if any. */
  sessionId?: ID;
};

// ---------------------------------------------------------------------------
// Workout sessions

export type LoggedSet = {
  id: ID;
  kind: SetKind;
  modifiers: SetModifier[];
  /** Snapshot of the plan's target at the time the set was logged. */
  target?: SetPrescription;
  reps?: number;
  /** External load (bar, dumbbells, machine stack). */
  loadKg?: number;
  /** Bodyweight movements: load added on top of bodyweight. */
  addedLoadKg?: number;
  /** Assisted sets: assistance subtracted from bodyweight. */
  assistanceKg?: number;
  /** User override of the computed effective load. */
  effectiveLoadOverrideKg?: number;
  /** Bodyweight in effect when the set was completed; never rewritten later. */
  bodyweightSnapshotKg?: number;
  durationSec?: number;
  rir?: number;
  restSec?: number;
  tempo?: string;
  partialReps?: number;
  notes?: string;
  completedAt?: ISODateTime;
  recordingId?: ID;
};

export type SessionExercise = {
  id: ID;
  exerciseId: ID;
  plannedExerciseId?: ID;
  skipped: boolean;
  sets: LoggedSet[];
  notes?: string;
};

export type SessionBlock = {
  id: ID;
  type: BlockType;
  exercises: SessionExercise[];
  roundRestSec?: number;
  transitionRestSec?: number;
};

export type SessionStatus = 'in_progress' | 'completed' | 'skipped';

export type WorkoutSession = Timestamps & {
  id: ID;
  name: string;
  occurrenceId?: ID;
  planId?: ID;
  planWorkoutId?: ID;
  status: SessionStatus;
  /** Set once completed. 'partial' if anything planned was skipped or left unlogged. */
  completion?: 'full' | 'partial';
  scheduledDate?: ISODate;
  /** History, volume, PRs, and streaks use this date. */
  completedDate?: ISODate;
  startedAt?: ISODateTime;
  completedAt?: ISODateTime;
  /** "Repeat" creates a new session linked to the original. */
  repeatedFromSessionId?: ID;
  blocks: SessionBlock[];
  notes?: string;
};

// ---------------------------------------------------------------------------
// Bodyweight, records, goals, badges

export type BodyweightEntry = Timestamps & {
  id: ID;
  date: ISODate;
  weightKg: number;
};

export type PRType = 'heaviest_weight' | 'reps_at_weight' | 'e1rm' | 'volume' | 'longest_hold';

export type PersonalRecord = {
  id: ID;
  exerciseId: ID;
  type: PRType;
  /** kg for weight/e1RM/volume, reps for reps_at_weight, seconds for longest_hold. */
  value: number;
  /** For reps_at_weight: the load the reps were done at. */
  atLoadKg?: number;
  /**
   * Bodyweight lifts: heaviest weight and reps-at-weight compare what was added to bodyweight, so
   * `value` / `atLoadKg` are added load (negative for assistance), not the total.
   */
  addedLoad?: boolean;
  sessionId: ID;
  /** The set that achieved it; for volume, the exercise's last counted set in the workout. */
  setId: ID;
  achievedDate: ISODate;
  /** The best this one beat. Records only exist once there's an earlier best to beat. */
  previousValue?: number;
};

/**
 * "Longest weekly streak" (spec 2.7): an account-wide record, one per streak that outlasts the
 * longest before it. It grows with the streak, dated by the workout that last extended it.
 */
export type StreakRecord = {
  id: ID;
  weeks: number;
  previousWeeks: number;
  achievedDate: ISODate;
  sessionId: ID;
};

export type Goal = Timestamps & {
  id: ID;
  title: string;
  deadline?: ISODate;
  achievedDate?: ISODate;
} & (
    | { type: 'lift'; exerciseId: ID; target: { kind: 'load_reps'; loadKg: number; reps: number } | { kind: 'e1rm'; loadKg: number } }
    | { type: 'frequency'; workoutsPerWeek: number }
    | { type: 'bodyweight'; targetKg: number; startKg: number }
    | { type: 'form'; exerciseId: ID; joint: Joint; targetDeg: number; startDeg: number }
  );

export type BadgeCategory = 'milestone' | 'strength' | 'consistency' | 'form';

export type EarnedBadge = {
  id: ID;
  badgeKey: string;
  category: BadgeCategory;
  title: string;
  description: string;
  earnedDate: ISODate;
};

export type StreakState = {
  currentWeeks: number;
  longestWeeks: number;
  /** Workouts that count toward this week's target (partials with at least 1 working set count). */
  thisWeekCompleted: number;
  thisWeekTarget: number;
  /** milestoneDates[n - 1] is the day a streak first reached n weeks, for streak badges. */
  milestoneDates: ISODate[];
  /** Longest-streak records, oldest first. */
  records: StreakRecord[];
};

// ---------------------------------------------------------------------------
// Form analysis

export type Joint = 'hip' | 'knee' | 'ankle';

export type AngleRange = { minDeg: number; maxDeg: number };

export type RepMetrics = {
  index: number;
  durationSec: number;
  confidence: 'high' | 'low';
  angles: Partial<Record<Joint, AngleRange>>;
  /** Range of motion of the primary joint, in degrees. */
  romDeg: number;
  partial: boolean;
};

export type Observation = {
  id: ID;
  kind: 'change' | 'consistency' | 'quality';
  text: string;
  /** Optional neutral, educational cue. Never pain, injury, or treatment language. */
  cue?: string;
};

export type Recording = {
  id: ID;
  sessionId: ID;
  setId: ID;
  exerciseId: ID;
  recordedAt: ISODateTime;
  orientation: 'portrait' | 'landscape';
  durationSec: number;
  /** Local file URI; undefined once the user deletes the video (metrics are kept). */
  videoUri?: string;
};

export type FormReport = Timestamps & {
  id: ID;
  recordingId: ID;
  sessionId: ID;
  setId: ID;
  exerciseId: ID;
  family: FormMovementFamily;
  status: 'processing' | 'ready' | 'failed';
  modelVersion: string;
  ruleVersion: string;
  primaryJoint: Joint;
  quality: { framing: 'good' | 'warning'; warnings: string[] };
  detectedReps: number;
  reps: RepMetrics[];
  observations: Observation[];
  hasReplay: boolean;
};

// ---------------------------------------------------------------------------
// Preferences

export type UnitSystem = 'imperial' | 'metric';

export type Preferences = {
  units: UnitSystem;
  effortScale: 'rpe' | 'rir';
  /** Weight rounding increments per equipment, in the user's display unit. */
  roundingIncrements: Partial<Record<Equipment, number>>;
  restDefaultsSec: { compound: number; isolation: number; warmup: number };
  /**
   * Each exercise's own rest, in seconds by exercise id, used instead of its type's default when a
   * plan sets none. Learned from adjusting the rest timer after its sets, or set on the exercise's page.
   */
  restByExerciseSec: Record<ID, number>;
  weekStartsOn: Weekday;
  haptics: boolean;
  celebrations: boolean;
  telemetry: boolean;
  biometricLock: { enabled: boolean; afterSec: 0 | 300 | 3600 };
  notifications: {
    workoutReminders: boolean;
    restTimer: boolean;
    missedWorkout: boolean;
    weeklySummary: boolean;
    formAnalysisComplete: boolean;
    /** Time of day ("HH:MM") for workout reminders on training days. */
    reminderTime: string;
    weeklySummaryAt: { weekday: Weekday; time: string };
    /** No notifications between these times ("HH:MM"), wrapping past midnight. */
    quietHours?: { start: string; end: string };
  };
};

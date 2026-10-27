import { clampRestSec } from '@/data/preferences';
import type { Exercise, ID, LoggedSet, Preferences, SessionBlock, SessionExercise, WorkoutSession } from '@/data/types';
import { setName, setNumber } from './workoutReducer';

// The rest timer's rules (spec 2.6 "Rest timer", roadmap G3.8). Pure, so they're unit-tested;
// ActiveWorkoutProvider applies them. Nothing here may import React Native or Expo.

/** Where a rest's length came from. */
export type RestSource =
  /** The set's own rest in the plan. A rest set in the plan always wins (adjusting it still teaches the exercise). */
  | 'plan'
  /** The exercise's remembered rest: from adjusting the timer before, or set on its page. */
  | 'remembered'
  /** The compound or isolation default from Settings. */
  | 'default'
  /** The warm-up default from Settings. */
  | 'warmup'
  /** A superset or circuit round just finished: the block's round rest. */
  | 'round'
  /** Between exercises within a superset or circuit round: the block's (optional) transition. */
  | 'transition';

/** A set in the active workout. */
export type SetRef = { entryId: ID; setId: ID };

/** The set to do next, with the words the app shows and says for it. */
export type NextUp = SetRef & {
  exerciseId: ID;
  exerciseName: string;
  /** "set 2" or "warm-up set 1", numbered like the set table (warm-ups count separately). */
  setLabel: string;
};

/** Rest countdown, kept as wall-clock times so it stays right while the app is away and across restarts. */
export type RestTimer = {
  /** When the countdown reaches zero (ms epoch); ignored while paused. */
  endsAtMs: number;
  /** The rest's total length. Adjusting it changes this too. */
  durationSec: number;
  /** Set while paused. */
  pausedRemainingMs?: number;
  /** What it follows, e.g. "Squat · set 2", or "manual timer". */
  label: string;
  // The fields below came with G3.8; notes saved before then don't have them.
  /** The completed set this rest follows. Absent for a timer started from the presets. */
  after?: SetRef & { exerciseId: ID };
  source?: RestSource;
  /** Adjusting this rest teaches the exercise's remembered rest (see `restAfterSet`). */
  learnable?: boolean;
  /**
   * The set to do after this rest, as it was when the rest started (`withCurrentNext` brings it up
   * to date with edits made since). Null when nothing was left to do: it followed the workout's
   * last set. Absent when that isn't known: a manual timer, or a note saved before G3.8.
   */
  next?: NextUp | null;
};

/** Which rest follows a completed set, and why. */
export type RestChoice = {
  durationSec: number;
  source: RestSource;
  /**
   * Adjusting it teaches the exercise its own rest (decision B). Only straight-set working sets do,
   * whether their rest came from the plan, memory, or a default: warm-ups, round and transition
   * rests never teach. A plan rest still wins over what was learned, wherever the plan sets one.
   */
  learnable: boolean;
};

export type RestSettings = {
  defaults: Preferences['restDefaultsSec'];
  /** Remembered rest per exercise id (preferences.restByExerciseSec plus anything not saved yet). */
  remembered: Readonly<Record<ID, number>>;
};

/** What the rules need to know about an exercise. */
export type ExerciseLookup = ReadonlyMap<ID, Pick<Exercise, 'name' | 'category'>>;

export const isGrouped = (block: SessionBlock) => block.type === 'superset' || block.type === 'circuit';

/** Remaining rest in ms, accounting for pause. */
export function restRemainingMs(rest: RestTimer, nowMs: number): number {
  return rest.pausedRemainingMs ?? Math.max(0, rest.endsAtMs - nowMs);
}

/** The rest an exercise uses when its plan sets none: its remembered rest, or its type's default. */
export function exerciseRest(exerciseId: ID, category: Exercise['category'] | undefined, settings: RestSettings): { durationSec: number; source: 'remembered' | 'default' } {
  const remembered = settings.remembered[exerciseId];
  if (typeof remembered === 'number' && Number.isFinite(remembered) && remembered > 0) return { durationSec: clampRestSec(remembered), source: 'remembered' };
  return { durationSec: category === 'isolation' ? settings.defaults.isolation : settings.defaults.compound, source: 'default' };
}

// ---------------------------------------------------------------------------
// Rounds

/**
 * A superset or circuit goes in rounds by set position: round r is each exercise's r-th working
 * set, numbered like the set table (drop sets count, warm-ups don't). Warm-ups sit outside the
 * rounds: they're done first, exercise by exercise, and rest like warm-ups anywhere else.
 * Skipped exercises are left out.
 */
function roundOf(entry: SessionExercise, set: LoggedSet): number | undefined {
  return set.kind === 'warmup' ? undefined : setNumber(entry.sets, set);
}

function nthWorkingSet(entry: SessionExercise, round: number): LoggedSet | undefined {
  return entry.sets.filter((s) => s.kind !== 'warmup')[round - 1];
}

/** Done already, or the set just completed (whether or not the session shows it yet). */
const isDone = (set: LoggedSet, completed: SetRef) => Boolean(set.completedAt) || set.id === completed.setId;

/**
 * A round is finished when every exercise that has a set in it has that set done. Robust to doing
 * the exercises out of order, and to uneven set counts: a round only waits for the exercises that
 * still have a set in it.
 */
function roundFinished(block: SessionBlock, round: number, completed: SetRef): boolean {
  return block.exercises.every((entry) => {
    if (entry.skipped) return true;
    const set = nthWorkingSet(entry, round);
    return !set || isDone(set, completed);
  });
}

function locate(session: WorkoutSession, ref: SetRef): { blockIndex: number; block: SessionBlock; entry: SessionExercise; set: LoggedSet } | undefined {
  for (const [blockIndex, block] of session.blocks.entries()) {
    const entry = block.exercises.find((e) => e.id === ref.entryId);
    const set = entry?.sets.find((s) => s.id === ref.setId);
    if (entry && set) return { blockIndex, block, entry, set };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Which rest follows a set

/**
 * The rest after completing a set:
 * - Warm-ups: the set's plan rest, or the warm-up default (also inside supersets).
 * - Supersets and circuits: the block's round rest (or the compound default) once the set finishes
 *   its round; before that only the block's transition, which is no rest unless the plan sets one.
 * - Straight sets: the set's plan rest, else the exercise's remembered rest, else its type's default.
 *   Adjusting any of these teaches the exercise its rest, used wherever a plan doesn't set one.
 * Pass the session as the completion leaves it; the completed set counts as done either way.
 */
export function restAfterSet(session: WorkoutSession, completed: SetRef, exercises: ExerciseLookup, settings: RestSettings): RestChoice | null {
  const found = locate(session, completed);
  if (!found) return null;
  const { block, entry, set } = found;
  const planned = set.target?.restSec;
  const fromPlan = typeof planned === 'number' && planned > 0 ? planned : undefined;

  if (set.kind === 'warmup') {
    return fromPlan ? { durationSec: fromPlan, source: 'plan', learnable: false } : { durationSec: settings.defaults.warmup, source: 'warmup', learnable: false };
  }
  if (isGrouped(block)) {
    const round = roundOf(entry, set) ?? 1;
    return roundFinished(block, round, completed)
      ? { durationSec: block.roundRestSec ?? settings.defaults.compound, source: 'round', learnable: false }
      : { durationSec: block.transitionRestSec ?? 0, source: 'transition', learnable: false };
  }
  if (fromPlan) return { durationSec: fromPlan, source: 'plan', learnable: true };
  return { ...exerciseRest(entry.exerciseId, exercises.get(entry.exerciseId)?.category, settings), learnable: true };
}

// ---------------------------------------------------------------------------
// What's next

type Slot = { blockIndex: number; entry: SessionExercise; set: LoggedSet; round?: number };

/**
 * Every set in the order the workout is done: blocks in order; a straight block's sets as listed;
 * a superset's warm-ups (exercise by exercise), then round 1 (A1, B1…), round 2, and so on.
 * Skipped exercises are left out.
 */
function workoutOrder(session: WorkoutSession): Slot[] {
  const slots: Slot[] = [];
  session.blocks.forEach((block, blockIndex) => {
    const entries = block.exercises.filter((e) => !e.skipped);
    if (!isGrouped(block)) {
      for (const entry of entries) for (const set of entry.sets) slots.push({ blockIndex, entry, set });
      return;
    }
    for (const entry of entries) for (const set of entry.sets) if (set.kind === 'warmup') slots.push({ blockIndex, entry, set });
    const rounds = Math.max(0, ...entries.map((e) => e.sets.filter((s) => s.kind !== 'warmup').length));
    for (let round = 1; round <= rounds; round++) {
      for (const entry of entries) {
        const set = nthWorkingSet(entry, round);
        if (set) slots.push({ blockIndex, entry, set, round });
      }
    }
  });
  return slots;
}

function lastIndexWhere<T>(items: T[], match: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) if (match(items[i])) return i;
  return -1;
}

function nextUpFor(entry: SessionExercise, set: LoggedSet, exercises: ExerciseLookup): NextUp {
  return {
    entryId: entry.id,
    setId: set.id,
    exerciseId: entry.exerciseId,
    exerciseName: exercises.get(entry.exerciseId)?.name ?? 'Exercise',
    setLabel: setName(set.kind, setNumber(entry.sets, set)).toLowerCase(),
  };
}

/**
 * The set to do after completing `completed`, or null when everything else is done:
 * - Inside a superset or circuit round that isn't finished: the next exercise in the block (in
 *   order, wrapping round) whose set in this round isn't done.
 * - After a finished round: the next round's first set not done, then the blocks after it.
 * - Straight sets: the exercise's next set not done (then any it skipped past); once the
 *   exercise is done, the next block's first set not done.
 * - Warm-ups in a superset: the block's next warm-up not done (wrapping round), then round 1.
 * Past the end of the workout it wraps round to sets left undone earlier. Skipped exercises are
 * passed over. Pass the session as the completion leaves it; the completed set counts as done.
 */
export function nextUp(session: WorkoutSession, completed: SetRef, exercises: ExerciseLookup): NextUp | null {
  const found = locate(session, completed);
  if (!found) return null;
  const { blockIndex, block, entry, set } = found;
  const undone = (s: LoggedSet) => !isDone(s, completed);
  const order = workoutOrder(session);
  /** First set not done after `index` in workout order, wrapping round past the end. */
  const forwardFrom = (index: number): NextUp | null => {
    const after = [...order.slice(index + 1), ...order.slice(0, Math.max(0, index + 1))];
    const slot = after.find((s) => undone(s.set));
    return slot ? nextUpFor(slot.entry, slot.set, exercises) : null;
  };

  const round = roundOf(entry, set);
  if (isGrouped(block) && round !== undefined) {
    if (!roundFinished(block, round, completed)) {
      const start = block.exercises.indexOf(entry);
      for (let step = 1; step <= block.exercises.length; step++) {
        const other = block.exercises[(start + step) % block.exercises.length];
        const candidate = other.skipped ? undefined : nthWorkingSet(other, round);
        if (candidate && undone(candidate)) return nextUpFor(other, candidate, exercises);
      }
    }
    return forwardFrom(lastIndexWhere(order, (s) => s.blockIndex === blockIndex && s.round === round));
  }

  if (isGrouped(block)) {
    // A warm-up: the block's other warm-ups not done (after this one first), then the rounds.
    const warmups = order.filter((s) => s.blockIndex === blockIndex && s.round === undefined);
    const index = warmups.findIndex((s) => s.set.id === set.id);
    const another = [...warmups.slice(index + 1), ...warmups.slice(0, Math.max(0, index))].find((s) => undone(s.set));
    if (another) return nextUpFor(another.entry, another.set, exercises);
    return forwardFrom(lastIndexWhere(order, (s) => s.blockIndex === blockIndex && s.round === undefined));
  }

  const index = entry.sets.indexOf(set);
  const sameExercise = [...entry.sets.slice(index + 1), ...entry.sets.slice(0, index)].find(undone);
  if (sameExercise && !entry.skipped) return nextUpFor(entry, sameExercise, exercises);
  return forwardFrom(lastIndexWhere(order, (s) => s.entry.id === entry.id));
}

/** "Bench Press, set 2", for the bar, VoiceOver, and the rest alarm. */
export function describeNextUp(next: NextUp): string {
  return `${next.exerciseName}, ${next.setLabel}`;
}

const sameNextUp = (a: NextUp | null | undefined, b: NextUp | null | undefined) =>
  a === b || (!!a && !!b && a.entryId === b.entryId && a.setId === b.setId && a.exerciseId === b.exerciseId && a.exerciseName === b.exerciseName && a.setLabel === b.setLabel);

/**
 * The rest with its next set worked out from the workout as it is now, so a swap, skip, removed
 * set or reorder during the rest shows, announces and rings with the right set. Returns the same
 * rest when nothing changed. If the set the rest follows is gone (its exercise was removed),
 * what's next isn't known any more.
 */
export function withCurrentNext(rest: RestTimer | null, session: WorkoutSession | undefined, exercises: ExerciseLookup): RestTimer | null {
  if (!rest?.after || !session) return rest;
  const next = locate(session, rest.after) ? nextUp(session, rest.after, exercises) : undefined;
  return sameNextUp(rest.next, next) ? rest : { ...rest, next };
}

/**
 * The next set a superset or circuit rest shows and announces ("Next: Bench Press, set 2").
 * Straight-set rests carry one too (for the rest alarm) but show the timer as before.
 */
export function shownNextUp(rest: RestTimer): NextUp | undefined {
  return rest.source === 'transition' || rest.source === 'round' ? (rest.next ?? undefined) : undefined;
}

/** The rest followed the workout's last set: nothing was left to do when it started. */
export function followsLastSet(rest: RestTimer): boolean {
  return Boolean(rest.after) && rest.next === null;
}

/** What VoiceOver says when the rest ends with the app open. */
export function restOverAnnouncement(rest: RestTimer): string {
  const next = shownNextUp(rest);
  if (next) return `Rest over. Next: ${describeNextUp(next)}.`;
  return followsLastSet(rest) ? 'Rest over. That was your last set.' : 'Rest over. Time for your next set.';
}

// ---------------------------------------------------------------------------
// Changing the running rest

/** The rest to run for a choice, or null when there's no rest (a superset transition of 0). */
export function startedRest(choice: RestChoice, about: Pick<RestTimer, 'label' | 'after' | 'next'>, nowMs: number): RestTimer | null {
  if (choice.durationSec <= 0) return null;
  return { endsAtMs: nowMs + choice.durationSec * 1000, durationSec: choice.durationSec, label: about.label, after: about.after, source: choice.source, learnable: choice.learnable, next: about.next };
}

/** −15 s / +15 s: moves the end and the total length together, running or paused. Never ends in the past. */
export function adjustedRest(rest: RestTimer, deltaSec: number, nowMs: number): RestTimer {
  const durationSec = Math.max(1, rest.durationSec + deltaSec);
  if (rest.pausedRemainingMs !== undefined) return { ...rest, durationSec, pausedRemainingMs: Math.max(0, rest.pausedRemainingMs + deltaSec * 1000) };
  return { ...rest, durationSec, endsAtMs: Math.max(nowMs, rest.endsAtMs + deltaSec * 1000) };
}

/** Pause keeps what's left; resume counts it down from now. */
export function toggledPause(rest: RestTimer, nowMs: number): RestTimer {
  if (rest.pausedRemainingMs !== undefined) return { ...rest, endsAtMs: nowMs + rest.pausedRemainingMs, pausedRemainingMs: undefined };
  return { ...rest, pausedRemainingMs: restRemainingMs(rest, nowMs) };
}

/**
 * A preset from the timer sheet restarts the running rest at that length (running, even if it was
 * paused) and keeps what it follows, so it can still teach. With no rest running it starts a
 * manual timer, which never teaches.
 */
export function presetRest(rest: RestTimer | null, sec: number, nowMs: number): RestTimer {
  const endsAtMs = nowMs + sec * 1000;
  if (!rest) return { endsAtMs, durationSec: sec, label: 'manual timer' };
  return { ...rest, endsAtMs, durationSec: sec, pausedRemainingMs: undefined };
}

/**
 * What an adjustment or preset teaches: a learnable rest's new total length becomes its
 * exercise's remembered rest (kept inside the limits). Null for anything else.
 */
export function learnedRest(rest: RestTimer | null): { exerciseId: ID; sec: number } | null {
  if (!rest?.learnable || !rest.after) return null;
  return { exerciseId: rest.after.exerciseId, sec: clampRestSec(rest.durationSec) };
}

// ---------------------------------------------------------------------------
// When the countdown ends

/**
 * When the rest alarm for an end rings: rounded up to the whole second, because iOS date triggers
 * drop the milliseconds, so it never rings before the countdown reads 0:00.
 */
export function restAlarmTimeMs(endsAtMs: number): number {
  return Math.ceil(endsAtMs / 1000) * 1000;
}

/**
 * How late the in-app "Rest over" may still come. Any later and the rest ended while the app was
 * away (JS timers don't run while iOS has it suspended), so the end passes quietly rather than
 * buzzing and announcing on return. The rest alarm notification covers that case.
 */
export const LATE_END_MS = 2000;
/** A timer firing this close to the end counts as the end (timers can fire a hair early). */
const END_SLACK_MS = 50;

/** Where the app is, as the end sees it. */
export type AppPresence = {
  /** When the app went to the background, until it's back and any end has been settled; else null. */
  awaySinceMs: number | null;
  /** Back in the foreground this moment: the end is settled before anything shows. */
  returning?: boolean;
};

/**
 * What the rest's end does now:
 * - 'none': no rest. 'running': paused or not over yet.
 * - 'away': it's over, but the app is still in the background (iOS lets JS timers run there for a
 *   moment before suspending it). It's left alone so its alarm still rings, and settled on return.
 * - 'alert': it just ended with the app open, or it ended while the app was away and the app came
 *   back before the alarm's time: haptic, "Rest over" bar and announcement.
 * - 'quiet': it ended while the app was away and the alarm's time has passed (the alarm marked
 *   the end), or it ended more than LATE_END_MS ago: it's cleared without a late buzz, bar, or
 *   announcement.
 */
export function restEnd(rest: RestTimer | null, nowMs: number, app: AppPresence): 'none' | 'running' | 'away' | 'alert' | 'quiet' {
  if (!rest) return 'none';
  if (rest.pausedRemainingMs !== undefined || rest.endsAtMs - nowMs > END_SLACK_MS) return 'running';
  if (app.awaySinceMs !== null && !app.returning) return 'away';
  if (app.awaySinceMs !== null && app.awaySinceMs <= rest.endsAtMs) return nowMs >= restAlarmTimeMs(rest.endsAtMs) ? 'quiet' : 'alert';
  return nowMs - rest.endsAtMs > LATE_END_MS ? 'quiet' : 'alert';
}

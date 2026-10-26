import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

import { useRepository } from '@/data/DataProvider';

import { toISODate } from '@/data/dates';
import { succeeded, useBodyweight, useDeleteSession, useExercises, usePreferences, useSaveSession, useSessions } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import { deriveRecordBests, livePRSetIds, sessionsBefore, type RecordBests } from '@/data/records';
import type { Exercise, LoggedSet, SessionBlock, SessionExercise, WorkoutSession } from '@/data/types';
import { useHaptics } from '@/hooks/useHaptics';
import { spokenDuration } from '@/hooks/useNow';
import { createLocalStore } from '@/lib/localStore';
import type { DayItem } from '../today/agenda';
import { sessionForReopen, sessionFromPlan } from './buildSession';
import { bodyweightForSet, completedNewestFirst, recordsAddedByReopen } from './history';
import { continueAs, discardPlan, restoredRest, sessionToResume, type ActiveWorkoutMeta, type RestTimer } from './persistence';
import { completionOf, countSets, setName, setNumber, workoutReducer, type ActiveWorkout, type SetCounts, type WorkoutAction } from './workoutReducer';

export type { RestTimer } from './persistence';

/** How long edits wait before they're written, so a burst of taps saves once. */
const AUTOSAVE_DELAY_MS = 500;

/** The phone's note of the unfinished workout, for resuming after the app is closed. */
const activeWorkoutStore = createLocalStore<ActiveWorkoutMeta | null>('activeWorkout', null);

type Position = { index: number; total: number };

/** What Finish saved, for opening the summary. */
export type FinishedWorkout = {
  session: WorkoutSession;
  /** A reopened workout finished again, rather than a new one. */
  reopened: boolean;
  /** For a reopened workout: how many records the edits added that it didn't have before (G3.6). */
  newRecordCount: number;
};

type ContextValue = {
  workout: ActiveWorkout | null;
  counts: SetCounts;
  rest: RestTimer | null;
  /** True for a few seconds after a rest countdown finishes. */
  restJustEnded: boolean;
  /**
   * Sets that show the live PR badge: completed sets that beat the best from before them (earlier
   * workouts and earlier sets in this one). Derived from the sets as they are, so edits move it.
   */
  prSetIds: ReadonlySet<string>;
  exercisesById: Map<string, Exercise>;
  /** Completed sessions other than the active one, newest first. */
  history: WorkoutSession[];
  dispatch: (action: WorkoutAction) => void;
  startFromItem: (item: DayItem, position?: Position) => void;
  reopen: (session: WorkoutSession, position?: Position) => void;
  /** Picks up an unfinished workout that's saved but not the one open (e.g. left over from earlier). */
  continueSession: (session: WorkoutSession, position?: Position) => void;
  repeat: (item: DayItem, source: WorkoutSession) => void;
  completeSet: (entryId: string, setId: string) => void;
  uncompleteSet: (entryId: string, setId: string) => void;
  startRest: (durationSec: number, label: string) => void;
  adjustRest: (deltaSec: number) => void;
  togglePauseRest: () => void;
  skipRest: () => void;
  /**
   * Discards the unfinished workout: a new one is deleted, a reopened one goes back to how it was
   * before it was reopened. Resolves false if that couldn't be saved; the workout then stays open
   * and the error toast says so.
   */
  end: () => Promise<boolean>;
  /**
   * Saves the workout as completed: 'full', or 'partial' if any set is unlogged or an exercise was
   * skipped. Unlogged sets stay in the session (they don't count anywhere) so the plan diff stays accurate.
   * Resolves null if it couldn't be saved; the workout then stays open and the error toast says so.
   */
  finish: () => Promise<FinishedWorkout | null>;
};

const Context = createContext<ContextValue | null>(null);

function locate(session: WorkoutSession, entryId: string): { block: SessionBlock; entry: SessionExercise } | undefined {
  for (const block of session.blocks) {
    const entry = block.exercises.find((e) => e.id === entryId);
    if (entry) return { block, entry };
  }
  return undefined;
}

/**
 * Owns the in-progress workout so it survives minimizing the sheet and switching tabs, and auto-saves
 * it so it survives the app closing too (spec 2.5).
 */
export function ActiveWorkoutProvider({ children }: { children: ReactNode }) {
  const [workout, dispatch] = useReducer(workoutReducer, null);
  const [rest, setRest] = useState<RestTimer | null>(null);
  const [restJustEnded, setRestJustEnded] = useState(false);
  const haptics = useHaptics();
  const repo = useRepository();
  const saveSession = useSaveSession();
  const deleteSession = useDeleteSession();
  /** For a reopened workout, the finished version to restore if the reopen is discarded. */
  const original = useRef<WorkoutSession | undefined>(undefined);
  const current = useRef<ActiveWorkout | null>(null);
  current.current = workout;
  /** Set while Finish or Discard is writing the workout, so auto-save doesn't write it back meanwhile. */
  const finishing = useRef(false);
  /** Counts workouts opened, so a Finish or Discard that resolves late never closes a newer workout. */
  const generation = useRef(0);

  const sessions = useSessions();
  const exercises = useExercises();
  const bodyweight = useBodyweight();
  const preferences = usePreferences().data ?? defaultPreferences;

  const exercisesById = useMemo(() => new Map((exercises.data ?? []).map((e) => [e.id, e])), [exercises.data]);
  const history = useMemo(() => completedNewestFirst(sessions.data ?? [], workout?.session.id), [sessions.data, workout?.session.id]);
  // Bests from the workouts before this one (for a reopened workout, those finished before it).
  // Only what sessionsBefore reads, so editing a set doesn't re-derive every best.
  const activeId = workout?.session.id;
  const activeCompletedAt = workout?.session.completedAt;
  const activeCompletedDate = workout?.session.completedDate;
  const activeMode = workout?.mode;
  const beforeBests = useMemo<RecordBests>(
    () =>
      activeId && activeMode
        ? deriveRecordBests(sessionsBefore(sessions.data ?? [], { id: activeId, completedAt: activeCompletedAt, completedDate: activeCompletedDate }, activeMode), exercisesById)
        : new Map(),
    [sessions.data, exercisesById, activeId, activeCompletedAt, activeCompletedDate, activeMode],
  );
  const activeSession = workout?.session;
  const prSetIds = useMemo<ReadonlySet<string>>(
    () => (activeSession ? livePRSetIds(activeSession, beforeBests, exercisesById) : new Set()),
    [activeSession, beforeBests, exercisesById],
  );
  const weighIns = useMemo(() => [...(bodyweight.data ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [bodyweight.data]);


  // Countdown end: haptic and a VoiceOver announcement (iOS has no live regions), then a brief
  // "Rest over" state. Works while the sheet is minimized, and with haptics turned off.
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (endTimer.current) clearTimeout(endTimer.current);
    if (!rest || rest.pausedRemainingMs !== undefined) return;
    endTimer.current = setTimeout(() => {
      haptics.timerEnd();
      AccessibilityInfo.announceForAccessibility('Rest over. Time for your next set.');
      setRest(null);
      setRestJustEnded(true);
      setTimeout(() => setRestJustEnded(false), 3000);
    }, Math.max(0, rest.endsAtMs - Date.now()));
    return () => {
      if (endTimer.current) clearTimeout(endTimer.current);
    };
  }, [rest, haptics]);

  // Resume: when the app opens, pick up the workout that was in progress when it closed.
  const [resumeChecked, setResumeChecked] = useState(false);
  useEffect(() => {
    const remembered = activeWorkoutStore.get();
    let cancelled = false;
    repo
      .listSessions()
      .then((all) => {
        if (cancelled || current.current) return;
        const found = sessionToResume(remembered, all);
        if (!found) return;
        original.current = found.meta.original;
        setRest(restoredRest(found.meta.rest, Date.now()));
        dispatch({ type: 'resume', workout: { mode: found.meta.mode, position: found.meta.position, session: found.session } });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setResumeChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  // Remember what resuming needs (mode, rest timer, restore point). Waits for the resume check, so
  // the note isn't wiped before it's been read.
  useEffect(() => {
    if (!resumeChecked) return;
    activeWorkoutStore.set(workout ? { sessionId: workout.session.id, mode: workout.mode, position: workout.position, rest, original: original.current } : null);
  }, [resumeChecked, workout, rest]);

  // Auto-save: the session is written shortly after each change, and right away when the app goes
  // to the background, so closing it never loses a set.
  const pendingSave = useRef<{ timer: ReturnType<typeof setTimeout>; session: WorkoutSession } | null>(null);
  const cancelAutosave = useCallback(() => {
    if (pendingSave.current) clearTimeout(pendingSave.current.timer);
    pendingSave.current = null;
  }, []);
  const flushAutosave = useCallback(() => {
    const pending = pendingSave.current;
    cancelAutosave();
    if (pending) repo.saveSession(pending.session).catch(() => {});
  }, [repo, cancelAutosave]);
  const scheduleAutosave = useCallback(
    (session: WorkoutSession) => {
      cancelAutosave();
      pendingSave.current = { session, timer: setTimeout(flushAutosave, AUTOSAVE_DELAY_MS) };
    },
    [cancelAutosave, flushAutosave],
  );
  useEffect(() => {
    if (!workout) {
      cancelAutosave();
      return;
    }
    // Finish and Discard write the workout themselves; an auto-save landing after them would undo it.
    if (!finishing.current) scheduleAutosave(workout.session);
  }, [workout, cancelAutosave, scheduleAutosave]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flushAutosave();
    });
    return () => subscription.remove();
  }, [flushAutosave]);

  const startRest = useCallback((durationSec: number, label: string) => {
    setRestJustEnded(false);
    setRest(durationSec > 0 ? { endsAtMs: Date.now() + durationSec * 1000, durationSec, label } : null);
  }, []);

  const restAfter = useCallback(
    (block: SessionBlock, entry: SessionExercise, set: LoggedSet): number => {
      const exercise = exercisesById.get(entry.exerciseId);
      const defaults = preferences.restDefaultsSec;
      if (set.kind === 'warmup') return set.target?.restSec || defaults.warmup;
      if (block.type === 'superset' || block.type === 'circuit') {
        // Rest after the round's last exercise; otherwise only the optional transition.
        const isLast = block.exercises[block.exercises.length - 1]?.id === entry.id;
        return isLast ? (block.roundRestSec ?? defaults.compound) : (block.transitionRestSec ?? 0);
      }
      return set.target?.restSec || (exercise?.category === 'isolation' ? defaults.isolation : defaults.compound);
    },
    [exercisesById, preferences.restDefaultsSec],
  );

  const completeSet = useCallback(
    (entryId: string, setId: string) => {
      if (!workout) return;
      const found = locate(workout.session, entryId);
      const set = found?.entry.sets.find((s) => s.id === setId);
      if (!found || !set) return;
      const exercise = exercisesById.get(found.entry.exerciseId);

      haptics.tap();
      const bodyweightKg = exercise?.isBodyweight ? bodyweightForSet(workout, original.current, setId, weighIns) : undefined;
      const action: WorkoutAction = { type: 'completeSet', entryId, setId, completedAt: new Date().toISOString(), bodyweightKg };
      dispatch(action);
      // The badge's own rule, applied to the workout as this completion leaves it. The badge brings the haptic.
      const next = workoutReducer(workout, action);
      const isPR = Boolean(next && livePRSetIds(next.session, beforeBests, exercisesById).has(setId));

      // Numbered like the set table, where warm-ups count separately from working sets.
      const name = setName(set.kind, setNumber(found.entry.sets, set)).toLowerCase();
      const exerciseName = exercise?.name ?? 'Exercise';
      const restSec = restAfter(found.block, found.entry, set);
      startRest(restSec, `${exerciseName} · ${name}`);
      // Queued so it follows VoiceOver reading the check's new state.
      AccessibilityInfo.announceForAccessibilityWithOptions(
        `${exerciseName} ${name} done.${isPR ? ' New personal record!' : ''}${restSec > 0 ? ` Rest ${spokenDuration(restSec)}.` : ''}`,
        { queue: true },
      );
    },
    [workout, exercisesById, weighIns, beforeBests, haptics, restAfter, startRest],
  );

  const value = useMemo<ContextValue>(() => {
    /** Clears what belonged to the last workout before another one opens. */
    const open = (next: ActiveWorkout, restorePoint?: WorkoutSession) => {
      generation.current++;
      finishing.current = false;
      original.current = restorePoint;
      setRest(null);
      dispatch({ type: 'start', workout: next });
    };
    const close = () => {
      original.current = undefined;
      setRest(null);
      setRestJustEnded(false);
      dispatch({ type: 'end' });
    };
    /** The write failed and the workout stays open: auto-save resumes, starting with any edits made meanwhile. */
    const keepOpen = () => {
      finishing.current = false;
      if (current.current) scheduleAutosave(current.current.session);
    };

    return {
      workout,
      counts: workout ? countSets(workout.session) : { done: 0, total: 0 },
      rest,
      restJustEnded,
      prSetIds,
      exercisesById,
      history,
      dispatch,
      startFromItem: (item, position) => {
        const session = sessionFromPlan({ item, history, exercisesById, preferences });
        // "Start anyway" on a skipped workout turns that skip into the workout itself.
        const skipped = item.session?.status === 'skipped' ? item.session : undefined;
        open({ mode: 'new', position, session: skipped ? { ...session, id: skipped.id, createdAt: skipped.createdAt } : session });
      },
      reopen: (session, position) => open({ mode: 'reopen', position, session: sessionForReopen(session) }, session),
      continueSession: (session, position) => {
        const { mode, original: restorePoint } = continueAs(session);
        open({ mode, position, session }, restorePoint);
      },
      repeat: (item, source) => open({ mode: 'new', session: sessionFromPlan({ item, history, exercisesById, preferences, repeatOf: source }) }),
      completeSet,
      uncompleteSet: (entryId, setId) => {
        const entry = workout ? locate(workout.session, entryId)?.entry : undefined;
        const set = entry?.sets.find((s) => s.id === setId);
        dispatch({ type: 'uncompleteSet', entryId, setId });
        if (entry && set) AccessibilityInfo.announceForAccessibilityWithOptions(`${setName(set.kind, setNumber(entry.sets, set))} marked not done.`, { queue: true });
      },
      startRest,
      adjustRest: (deltaSec) =>
        setRest((r) => {
          if (!r) return r;
          if (r.pausedRemainingMs !== undefined) return { ...r, pausedRemainingMs: Math.max(0, r.pausedRemainingMs + deltaSec * 1000) };
          const endsAtMs = Math.max(Date.now(), r.endsAtMs + deltaSec * 1000);
          return { ...r, endsAtMs, durationSec: Math.max(1, r.durationSec + deltaSec) };
        }),
      togglePauseRest: () =>
        setRest((r) => {
          if (!r) return r;
          if (r.pausedRemainingMs !== undefined) return { ...r, endsAtMs: Date.now() + r.pausedRemainingMs, pausedRemainingMs: undefined };
          return { ...r, pausedRemainingMs: Math.max(0, r.endsAtMs - Date.now()) };
        }),
      skipRest: () => setRest(null),
      end: async () => {
        if (!workout) return false;
        const opened = generation.current;
        finishing.current = true;
        cancelAutosave();
        const plan = discardPlan({ mode: workout.mode, original: original.current }, workout.session.id);
        const write = plan.kind === 'restore' ? saveSession.mutateAsync(plan.session) : deleteSession.mutateAsync(plan.sessionId);
        const ok = await succeeded(write);
        if (generation.current !== opened) return ok;
        if (ok) close();
        else keepOpen();
        return ok;
      },
      finish: async () => {
        if (!workout) return null;
        const { session, mode } = workout;
        const reopened = mode === 'reopen';
        const now = new Date();
        const finished: WorkoutSession = {
          ...session,
          status: 'completed',
          completion: completionOf(session),
          // Reopening keeps the original day so history and streaks don't move (spec 2.5).
          completedAt: reopened && session.completedAt ? session.completedAt : now.toISOString(),
          completedDate: reopened && session.completedDate ? session.completedDate : toISODate(now),
          updatedAt: now.toISOString(),
        };
        // A reopened workout celebrates only records its edits added, not ones it already had.
        const newRecordCount = reopened ? recordsAddedByReopen(sessions.data ?? [], original.current, finished, exercisesById).length : 0;
        const opened = generation.current;
        // A pending auto-save mustn't land after this and mark the workout unfinished again.
        finishing.current = true;
        cancelAutosave();
        const ok = await succeeded(saveSession.mutateAsync(finished));
        if (generation.current === opened) {
          if (ok) close();
          else keepOpen();
        }
        return ok ? { session: finished, reopened, newRecordCount } : null;
      },
    };
  }, [
    workout,
    rest,
    restJustEnded,
    prSetIds,
    exercisesById,
    history,
    sessions.data,
    preferences,
    completeSet,
    startRest,
    saveSession,
    deleteSession,
    cancelAutosave,
    scheduleAutosave,
  ]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useActiveWorkout(): ContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('useActiveWorkout must be used inside ActiveWorkoutProvider');
  return value;
}

/** Remaining rest in ms, accounting for pause. */
export function restRemainingMs(rest: RestTimer, now: number): number {
  return rest.pausedRemainingMs ?? Math.max(0, rest.endsAtMs - now);
}

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';

import { toISODate } from '@/data/dates';
import { useBodyweight, useExercises, usePreferences, useSaveSession, useSessions } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { Exercise, LoggedSet, SessionBlock, SessionExercise, WorkoutSession } from '@/data/types';
import { useHaptics } from '@/hooks/useHaptics';
import { spokenDuration } from '@/hooks/useNow';
import type { DayItem } from '../today/agenda';
import { sessionForReopen, sessionFromPlan } from './buildSession';
import { completedNewestFirst, computeBests, isNewRecord } from './history';
import { countSets, setName, setNumber, workoutReducer, type ActiveWorkout, type SetCounts, type WorkoutAction } from './workoutReducer';

export type RestTimer = {
  /** When the countdown reaches zero (ms epoch); ignored while paused. */
  endsAtMs: number;
  durationSec: number;
  /** Set while paused. */
  pausedRemainingMs?: number;
  label: string;
};

type Position = { index: number; total: number };

type ContextValue = {
  workout: ActiveWorkout | null;
  counts: SetCounts;
  rest: RestTimer | null;
  /** True for a few seconds after a rest countdown finishes. */
  restJustEnded: boolean;
  /** Sets completed this session that beat the exercise's previous best. */
  prSetIds: ReadonlySet<string>;
  exercisesById: Map<string, Exercise>;
  /** Completed sessions other than the active one, newest first. */
  history: WorkoutSession[];
  dispatch: (action: WorkoutAction) => void;
  startFromItem: (item: DayItem, position?: Position) => void;
  reopen: (session: WorkoutSession, position?: Position) => void;
  repeat: (item: DayItem, source: WorkoutSession) => void;
  completeSet: (entryId: string, setId: string) => void;
  uncompleteSet: (entryId: string, setId: string) => void;
  startRest: (durationSec: number, label: string) => void;
  adjustRest: (deltaSec: number) => void;
  togglePauseRest: () => void;
  skipRest: () => void;
  /** Discards the in-progress workout without saving. */
  end: () => void;
  /**
   * Saves the workout as completed: 'full', or 'partial' if any set is unlogged or an exercise was
   * skipped. Unlogged sets stay in the session (they don't count anywhere) so the plan diff stays accurate.
   */
  finish: () => Promise<WorkoutSession | null>;
};

const Context = createContext<ContextValue | null>(null);

function locate(session: WorkoutSession, entryId: string): { block: SessionBlock; entry: SessionExercise } | undefined {
  for (const block of session.blocks) {
    const entry = block.exercises.find((e) => e.id === entryId);
    if (entry) return { block, entry };
  }
  return undefined;
}

/** Owns the in-progress workout so it survives minimizing the sheet and switching tabs. */
export function ActiveWorkoutProvider({ children }: { children: ReactNode }) {
  const [workout, dispatch] = useReducer(workoutReducer, null);
  const [rest, setRest] = useState<RestTimer | null>(null);
  const [restJustEnded, setRestJustEnded] = useState(false);
  const [prSetIds, setPrSetIds] = useState<ReadonlySet<string>>(new Set());
  const haptics = useHaptics();
  const saveSession = useSaveSession();

  const sessions = useSessions();
  const exercises = useExercises();
  const bodyweight = useBodyweight();
  const preferences = usePreferences().data ?? defaultPreferences;

  const exercisesById = useMemo(() => new Map((exercises.data ?? []).map((e) => [e.id, e])), [exercises.data]);
  const history = useMemo(() => completedNewestFirst(sessions.data ?? [], workout?.session.id), [sessions.data, workout?.session.id]);
  const bests = useMemo(() => computeBests(history, exercisesById), [history, exercisesById]);
  const latestBodyweightKg = useMemo(() => {
    const entries = [...(bodyweight.data ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    return entries[entries.length - 1]?.weightKg;
  }, [bodyweight.data]);

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
      const bodyweightKg = exercise?.isBodyweight ? latestBodyweightKg : undefined;
      dispatch({ type: 'completeSet', entryId, setId, completedAt: new Date().toISOString(), bodyweightKg });

      const completed: LoggedSet = { ...set, completedAt: 'now', bodyweightSnapshotKg: bodyweightKg ?? set.bodyweightSnapshotKg };
      const isPR = Boolean(exercise && isNewRecord(completed, exercise, bests.get(exercise.id)));
      if (isPR) setPrSetIds((prev) => new Set(prev).add(setId));

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
    [workout, exercisesById, latestBodyweightKg, bests, haptics, restAfter, startRest],
  );

  const value = useMemo<ContextValue>(
    () => ({
      workout,
      counts: workout ? countSets(workout.session) : { done: 0, total: 0 },
      rest,
      restJustEnded,
      prSetIds,
      exercisesById,
      history,
      dispatch,
      startFromItem: (item, position) => {
        setRest(null);
        setPrSetIds(new Set());
        dispatch({ type: 'start', workout: { mode: 'new', position, session: sessionFromPlan({ item, history, exercisesById, preferences }) } });
      },
      reopen: (session, position) => {
        setRest(null);
        setPrSetIds(new Set());
        dispatch({ type: 'start', workout: { mode: 'reopen', position, session: sessionForReopen(session) } });
      },
      repeat: (item, source) => {
        setRest(null);
        setPrSetIds(new Set());
        dispatch({
          type: 'start',
          workout: { mode: 'new', session: sessionFromPlan({ item, history, exercisesById, preferences, repeatOf: source }) },
        });
      },
      completeSet,
      uncompleteSet: (entryId, setId) => {
        const entry = workout ? locate(workout.session, entryId)?.entry : undefined;
        const set = entry?.sets.find((s) => s.id === setId);
        dispatch({ type: 'uncompleteSet', entryId, setId });
        if (entry && set) AccessibilityInfo.announceForAccessibilityWithOptions(`${setName(set.kind, setNumber(entry.sets, set))} marked not done.`, { queue: true });
        setPrSetIds((prev) => {
          const next = new Set(prev);
          next.delete(setId);
          return next;
        });
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
      end: () => {
        setRest(null);
        setRestJustEnded(false);
        setPrSetIds(new Set());
        dispatch({ type: 'end' });
      },
      finish: async () => {
        if (!workout) return null;
        const { session, mode } = workout;
        const { done, total } = countSets(session);
        const anySkipped = session.blocks.some((b) => b.exercises.some((e) => e.skipped));
        const now = new Date();
        const finished: WorkoutSession = {
          ...session,
          status: 'completed',
          completion: done < total || anySkipped ? 'partial' : 'full',
          // Reopening keeps the original day so history and streaks don't move (spec 2.5).
          completedAt: mode === 'reopen' && session.completedAt ? session.completedAt : now.toISOString(),
          completedDate: mode === 'reopen' && session.completedDate ? session.completedDate : toISODate(now),
          updatedAt: now.toISOString(),
        };
        await saveSession.mutateAsync(finished);
        setRest(null);
        setRestJustEnded(false);
        setPrSetIds(new Set());
        dispatch({ type: 'end' });
        return finished;
      },
    }),
    [workout, rest, restJustEnded, prSetIds, exercisesById, history, preferences, completeSet, startRest, saveSession],
  );

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

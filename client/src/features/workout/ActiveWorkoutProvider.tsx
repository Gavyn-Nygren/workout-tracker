import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

import { useRepository } from '@/data/DataProvider';

import { completionStamp, todayISO } from '@/data/dates';
import {
  succeeded,
  useBodyweight,
  useDeleteSession,
  useExercises,
  useGoals,
  useLatestPreferences,
  usePlanShifts,
  usePreferences,
  useSavePreferences,
  useSaveSession,
  useSessions,
} from '@/data/hooks';
import { defaultPreferences, withRememberedRests } from '@/data/preferences';
import { deriveRecordBests, livePRSetIds, sessionsBefore, type RecordBests } from '@/data/records';
import type { Exercise, SessionBlock, SessionExercise, WorkoutSession } from '@/data/types';
import { useHaptics } from '@/hooks/useHaptics';
import { spokenDuration } from '@/hooks/useNow';
import { createLocalStore } from '@/lib/localStore';
import { goalsAddedByReopen } from '../summary/goalsReached';
import type { DayItem } from '../today/agenda';
import { sessionForReopen, sessionFromPlan } from './buildSession';
import { bodyweightForSet, completedNewestFirst, recordsAddedByReopen, withSessionWrite, type SessionWrite } from './history';
import { continueAs, discardPlan, restoredRest, sessionToResume, type ActiveWorkoutMeta } from './persistence';
import {
  adjustedRest,
  describeNextUp,
  followsLastSet,
  learnedRest,
  nextUp,
  presetRest,
  restAfterSet,
  restEnd,
  restOverAnnouncement,
  startedRest,
  toggledPause,
  withCurrentNext,
  type NextUp,
  type RestTimer,
} from './rest';
import { shouldOfferRestAlarm } from './restAlarm';
import { markRestAlarmAsked, notificationPermission, restAlarmAsked, useRestAlarm } from './useRestAlarm';
import { completionOf, countSets, setName, setNumber, workoutReducer, type ActiveWorkout, type SetCounts, type WorkoutAction } from './workoutReducer';

export type { RestTimer } from './rest';
export { restRemainingMs } from './rest';

/** How long edits wait before they're written, so a burst of taps saves once. */
const AUTOSAVE_DELAY_MS = 500;
/** How long rest adjustments wait before the exercise's remembered rest is saved, so a burst of ±15 taps saves once. */
const LEARN_SAVE_DELAY_MS = 2000;
/** How long the "Rest over" bar stays. */
const REST_OVER_MS = 3000;
/** How long the bar says "Next: Bench Press, set 2" after a superset set (or until the next completion). */
const UP_NEXT_MS = 4000;
/** How long after the first rest starts its rest-alarm offer opens, so the check and the rest bar land first. */
const REST_ALARM_OFFER_DELAY_MS = 1000;

/** The phone's note of the unfinished workout, for resuming after the app is closed. */
const activeWorkoutStore = createLocalStore<ActiveWorkoutMeta | null>('activeWorkout', null);

type Position = { index: number; total: number };

/**
 * After a superset or circuit set that isn't the last of its round: the set to do next. The
 * workout scrolls to it; `cue` is true when there's no transition rest, so the bar says "Next: …"
 * instead. `key` is new every time, even for the same set.
 */
export type UpNext = { next: NextUp; cue: boolean; key: number };

/** The brief "Rest over" notice after a rest ends with the app open. */
export type RestOver = {
  /** The rest followed the workout's last set, so there's no next set to go to. */
  lastSet: boolean;
};

/** What Finish saved, for opening the summary. */
export type FinishedWorkout = {
  session: WorkoutSession;
  /** A reopened workout finished again, rather than a new one. */
  reopened: boolean;
  /** For a reopened workout: how many records the edits added that it didn't have before (G3.6). */
  newRecordCount: number;
  /** For a reopened workout: goals the edits reached that weren't reached before (G3.10). */
  newGoalIds: string[];
};

type ContextValue = {
  workout: ActiveWorkout | null;
  counts: SetCounts;
  /** The running rest, with its next set up to date with edits made during it. */
  rest: RestTimer | null;
  /** Set for a few seconds after a rest countdown finishes with the app open. */
  restJustEnded: RestOver | null;
  /** For a few seconds after a superset or circuit set that isn't its round's last (decision C). */
  upNext: UpNext | null;
  /**
   * Sets that show the live PR badge: completed sets that beat the best from before them (earlier
   * workouts and earlier sets in this one). Derived from the sets as they are, so edits move it.
   */
  prSetIds: ReadonlySet<string>;
  exercisesById: Map<string, Exercise>;
  /**
   * Completed sessions other than the active one, newest first; for a reopened workout, only
   * those finished before it.
   */
  history: WorkoutSession[];
  dispatch: (action: WorkoutAction) => void;
  startFromItem: (item: DayItem, position?: Position) => void;
  reopen: (session: WorkoutSession, position?: Position) => void;
  /** Picks up an unfinished workout that's saved but not the one open (e.g. left over from earlier). */
  continueSession: (session: WorkoutSession, position?: Position) => void;
  repeat: (item: DayItem, source: WorkoutSession) => void;
  completeSet: (entryId: string, setId: string) => void;
  uncompleteSet: (entryId: string, setId: string) => void;
  /** A preset from the timer sheet: restarts the running rest at that length, or starts a manual timer. */
  pickRestPreset: (sec: number) => void;
  /** −15 s / +15 s. On a rest that can teach, the new length becomes the exercise's rest. */
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
  const [rest, setRestState] = useState<RestTimer | null>(null);
  const [restJustEnded, setRestJustEnded] = useState<RestOver | null>(null);
  const [upNext, setUpNext] = useState<UpNext | null>(null);
  const haptics = useHaptics();
  const repo = useRepository();
  const saveSession = useSaveSession();
  const deleteSession = useDeleteSession();
  const { mutateAsync: savePreferences } = useSavePreferences();
  const latestPreferences = useLatestPreferences();
  /** For a reopened workout, the finished version to restore if the reopen is discarded. */
  const original = useRef<WorkoutSession | undefined>(undefined);
  const current = useRef<ActiveWorkout | null>(null);
  current.current = workout;
  /** Set while Finish or Discard is writing the workout, so auto-save doesn't write it back meanwhile. */
  const finishing = useRef(false);
  /** Counts workouts opened, so a Finish or Discard that resolves late never closes a newer workout. */
  const generation = useRef(0);

  const sessions = useSessions();
  const planShifts = usePlanShifts();
  const exercises = useExercises();
  const bodyweight = useBodyweight();
  const goals = useGoals();
  const preferencesQuery = usePreferences();
  const preferences = preferencesQuery.data ?? defaultPreferences;

  const exercisesById = useMemo(() => new Map((exercises.data ?? []).map((e) => [e.id, e])), [exercises.data]);
  // Only what sessionsBefore reads, so editing a set doesn't re-derive every best.
  const activeId = workout?.session.id;
  const activeCompletedAt = workout?.session.completedAt;
  const activeCompletedDate = workout?.session.completedDate;
  const activeMode = workout?.mode;
  // Last time for the PREVIOUS column: for a reopened workout, the workouts finished before it,
  // which is what its pre-fill and progression suggestion were built on.
  const history = useMemo(
    () =>
      activeId && activeMode
        ? completedNewestFirst(sessionsBefore(sessions.data ?? [], { id: activeId, completedAt: activeCompletedAt, completedDate: activeCompletedDate }, activeMode))
        : completedNewestFirst(sessions.data ?? []),
    [sessions.data, activeId, activeCompletedAt, activeCompletedDate, activeMode],
  );
  // Bests from the workouts before this one (for a reopened workout, those finished before it).
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

  /**
   * The saved sessions as last known: the query's, with this provider's own Finish and Discard
   * writes applied as soon as they're saved. A workout started straight after "Discard it and
   * start" reads its history from here, so a reopened workout that was just restored counts, even
   * before the query catches up (and from a screen holding an older copy of this context).
   */
  const knownSessions = useRef<WorkoutSession[]>([]);
  useEffect(() => {
    knownSessions.current = sessions.data ?? [];
  }, [sessions.data]);
  const noteWrite = useCallback((write: SessionWrite) => {
    knownSessions.current = withSessionWrite(knownSessions.current, write);
  }, []);

  // ---------------------------------------------------------------------------
  // Rest timer (the rules live in rest.ts)

  /** The rest as last changed, for callbacks (state only catches up on the next render). */
  const restRef = useRef<RestTimer | null>(null);
  /**
   * The one place the running rest changes: a rest after a set, presets, ±15 s, pause, skip, its
   * end, opening or closing a workout, and restoring after a restart all come through here.
   * Everything that follows the rest (the end timer, the resume note, a rest alarm) watches `rest`.
   */
  const changeRest = useCallback((next: RestTimer | null) => {
    restRef.current = next;
    setRestState(next);
  }, []);

  // Brief notices in the bar's slot: "Rest over" and "Next: …". Each owns its timer, so an old one never cuts a new one short.
  const restOverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showRestOver = useCallback((ended: RestOver | null) => {
    if (restOverTimer.current) clearTimeout(restOverTimer.current);
    restOverTimer.current = ended ? setTimeout(() => setRestJustEnded(null), REST_OVER_MS) : null;
    setRestJustEnded(ended);
  }, []);
  const upNextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upNextCount = useRef(0);
  const showUpNext = useCallback((next: NextUp | null, cue: boolean) => {
    if (upNextTimer.current) clearTimeout(upNextTimer.current);
    upNextTimer.current = next ? setTimeout(() => setUpNext(null), UP_NEXT_MS) : null;
    setUpNext(next ? { next, cue, key: ++upNextCount.current } : null);
  }, []);

  /** When the app went to the background, while it's still there; null in the foreground. */
  const awaySince = useRef<number | null>(null);
  /** Counts returns to the foreground, so the end timer is re-armed from the clock (timers may run slow while the phone sleeps). */
  const [returns, setReturns] = useState(0);

  /**
   * Ends the rest if its time is up. With the app open: a strong haptic, a VoiceOver announcement
   * (iOS has no live regions), and the brief "Rest over" bar, also while the sheet is minimized.
   * While the app is in the background it's left alone, so the pending rest alarm still rings;
   * `returning` settles it when the app is back. If the alarm's time passed while the app was
   * away, it just clears: no late buzz, bar, or announcement (rest.ts `restEnd`).
   * Safe to call any time; it does nothing to a rest that's paused or still running.
   */
  const settleRest = useCallback(
    (returning = false) => {
      const ending = restRef.current;
      const outcome = restEnd(ending, Date.now(), { awaySinceMs: awaySince.current, returning });
      if (!ending || (outcome !== 'alert' && outcome !== 'quiet')) return outcome;
      changeRest(null);
      if (outcome === 'alert') {
        // What's next as the workout is now, not as it was when the rest started.
        const ended = withCurrentNext(ending, current.current?.session, exercisesById) ?? ending;
        haptics.timerEnd();
        AccessibilityInfo.announceForAccessibility(restOverAnnouncement(ended));
        showRestOver({ lastSet: followsLastSet(ended) });
      }
      return outcome;
    },
    [changeRest, haptics, showRestOver, exercisesById],
  );

  // The countdown's end while the app is open. Re-armed whenever the rest changes, so a timer
  // never fires for a rest that's been adjusted, paused, or replaced, and on every return to the app.
  useEffect(() => {
    if (!rest || rest.pausedRemainingMs !== undefined) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      timer = setTimeout(() => {
        // A timer that fires a moment early waits out the rest of it. One that fires in the
        // background ('away') isn't re-armed: returning to the app settles the rest.
        if (settleRest() === 'running' && restRef.current === rest) arm();
      }, Math.max(0, rest.endsAtMs - Date.now()));
    };
    arm();
    return () => clearTimeout(timer);
  }, [rest, settleRest, returns]);

  // Rest memory (decision B): adjusting a rest that can teach makes its new length the exercise's
  // rest, right away for this workout, and saved for later ones without a write per tap.
  /** Learned and not sent yet. */
  const unsaved = useRef<Record<string, number>>({});
  /** Sent and not settled yet, so they still count before the saved settings catch up. */
  const saving = useRef<Record<string, number>>({});
  const learnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushLearned = useCallback(() => {
    if (learnTimer.current) clearTimeout(learnTimer.current);
    learnTimer.current = null;
    // The settings as they are now, so a change saved meanwhile (another screen's) isn't undone.
    const base = latestPreferences();
    const changes = unsaved.current;
    // Before the saved settings load there's nothing to merge into; they wait for the next flush.
    if (!base || !Object.keys(changes).length) return;
    unsaved.current = {};
    // Rests still being saved go along again, in case the settings here don't show them yet.
    saving.current = { ...saving.current, ...changes };
    // Saved or not (a failure shows the settings error toast), the saved settings now say what counts.
    void succeeded(savePreferences(withRememberedRests(base, saving.current))).then(() => {
      const left = { ...saving.current };
      for (const [id, sec] of Object.entries(changes)) if (left[id] === sec) delete left[id];
      saving.current = left;
    });
  }, [savePreferences, latestPreferences]);
  const learn = useCallback(
    (changed: RestTimer | null) => {
      const lesson = learnedRest(changed);
      if (!lesson) return;
      unsaved.current = { ...unsaved.current, [lesson.exerciseId]: lesson.sec };
      if (learnTimer.current) clearTimeout(learnTimer.current);
      learnTimer.current = setTimeout(flushLearned, LEARN_SAVE_DELAY_MS);
    },
    [flushLearned],
  );

  const adjustRest = useCallback(
    (deltaSec: number) => {
      if (!restRef.current) return;
      const next = adjustedRest(restRef.current, deltaSec, Date.now());
      changeRest(next);
      learn(next);
    },
    [changeRest, learn],
  );
  const pickRestPreset = useCallback(
    (sec: number) => {
      const next = presetRest(restRef.current, sec, Date.now());
      showRestOver(null);
      changeRest(next);
      learn(next);
    },
    [changeRest, learn, showRestOver],
  );
  const togglePauseRest = useCallback(() => {
    if (restRef.current) changeRest(toggledPause(restRef.current, Date.now()));
  }, [changeRest]);
  const skipRest = useCallback(() => changeRest(null), [changeRest]);

  // Decision A: the first rest that starts by itself after a set offers the rest alarm, once per
  // phone. The sheet explains it, then iOS asks; it opens a moment later, if a rest is still on.
  const offerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRestAlarmOffer = useCallback(() => {
    if (offerTimer.current) clearTimeout(offerTimer.current);
    offerTimer.current = null;
  }, []);
  const offerRestAlarm = useCallback(
    (started: RestTimer | null) => {
      const wanted = (candidate: RestTimer | null) => {
        const settings = latestPreferences();
        return Boolean(settings) && shouldOfferRestAlarm({ rest: candidate, enabled: Boolean(settings?.notifications.restTimer), asked: restAlarmAsked(), permission: notificationPermission() });
      };
      if (!wanted(started)) return;
      cancelRestAlarmOffer();
      offerTimer.current = setTimeout(() => {
        offerTimer.current = null;
        // Skipped meanwhile, or a superset transition took over: wait for another rest.
        if (!wanted(restRef.current)) return;
        markRestAlarmAsked();
        router.push({ pathname: '/notifications-permission', params: { key: 'restTimer', from: 'rest' } });
      }, REST_ALARM_OFFER_DELAY_MS);
    },
    [cancelRestAlarmOffer, latestPreferences],
  );

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
        // A paused rest picks up where it was; one that ran out while the app was closed is dropped quietly.
        changeRest(restoredRest(found.meta.rest, Date.now()));
        dispatch({ type: 'resume', workout: { mode: found.meta.mode, position: found.meta.position, session: found.session } });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setResumeChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [repo, changeRest]);

  // What's next follows edits made during the rest (a swap, a skip, a removed set), for the bar,
  // the timer sheet and the alarm. The same rest object while nothing about it changed.
  const liveRest = useMemo(() => withCurrentNext(rest, activeSession, exercisesById), [rest, activeSession, exercisesById]);

  // The rest alarm follows the rest: scheduled, moved, and cancelled with it (useRestAlarm.ts).
  useRestAlarm(liveRest, preferencesQuery.data?.notifications, resumeChecked);

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

  // Leaving the app saves everything pending. Coming back settles a rest that ran out meanwhile
  // before anything shows, so there's no late buzz or "Rest over" once the alarm has rung (JS
  // timers stop while iOS has the app suspended, and fire late on return).
  useEffect(() => {
    if (AppState.currentState === 'background' && awaySince.current === null) awaySince.current = Date.now();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        settleRest(true);
        awaySince.current = null;
        setReturns((n) => n + 1);
        return;
      }
      if (state === 'background' && awaySince.current === null) awaySince.current = Date.now();
      flushAutosave();
      flushLearned();
    });
    return () => subscription.remove();
  }, [flushAutosave, flushLearned, settleRest]);

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
      const session = next?.session ?? workout.session;
      const done = { entryId, setId };
      const remembered = { ...preferences.restByExerciseSec, ...saving.current, ...unsaved.current };
      const choice = restAfterSet(session, done, exercisesById, { defaults: preferences.restDefaultsSec, remembered });
      // Null when this was the last set left to do.
      const following = nextUp(session, done, exercisesById);
      const restSec = choice?.durationSec ?? 0;
      showRestOver(null);
      const started = choice && startedRest(choice, { label: `${exerciseName} · ${name}`, after: { ...done, exerciseId: found.entry.exerciseId }, next: following }, Date.now());
      changeRest(started);
      offerRestAlarm(started);
      // Superset or circuit, mid-round (decision C): straight on to the next exercise. The workout
      // scrolls to it, and with no transition rest the bar says "Next: …" for a moment.
      const midRound = choice?.source === 'transition' ? following : null;
      showUpNext(midRound, restSec === 0);
      // Queued so it follows VoiceOver reading the check's new state.
      AccessibilityInfo.announceForAccessibilityWithOptions(
        `${exerciseName} ${name} done.${isPR ? ' New personal record!' : ''}${restSec > 0 ? ` Rest ${spokenDuration(restSec)}.` : ''}${midRound ? ` Next: ${describeNextUp(midRound)}.` : ''}`,
        { queue: true },
      );
    },
    [workout, exercisesById, weighIns, beforeBests, haptics, preferences.restByExerciseSec, preferences.restDefaultsSec, changeRest, showRestOver, showUpNext, offerRestAlarm],
  );

  const value = useMemo<ContextValue>(() => {
    /** Clears what belonged to the last workout. Learned rests are saved now rather than waiting. */
    const reset = () => {
      changeRest(null);
      cancelRestAlarmOffer();
      showRestOver(null);
      showUpNext(null, false);
      flushLearned();
    };
    /** Clears what belonged to the last workout before another one opens. */
    const open = (next: ActiveWorkout, restorePoint?: WorkoutSession) => {
      generation.current++;
      finishing.current = false;
      original.current = restorePoint;
      reset();
      dispatch({ type: 'start', workout: next });
    };
    const close = () => {
      original.current = undefined;
      reset();
      dispatch({ type: 'end' });
    };
    /** The write failed and the workout stays open: auto-save resumes, starting with any edits made meanwhile. */
    const keepOpen = () => {
      finishing.current = false;
      if (current.current) scheduleAutosave(current.current.session);
    };
    /**
     * What a new workout is built from. History is read when it starts, not when this render
     * happened, so a start right after Discard or Finish includes what they saved.
     */
    const startInput = (item: DayItem) => ({
      item,
      history: completedNewestFirst(knownSessions.current),
      exercisesById,
      preferences,
      today: todayISO(),
      shifts: planShifts.data,
    });

    return {
      workout,
      counts: workout ? countSets(workout.session) : { done: 0, total: 0 },
      rest: liveRest,
      restJustEnded,
      upNext,
      prSetIds,
      exercisesById,
      history,
      dispatch,
      startFromItem: (item, position) => {
        const session = sessionFromPlan(startInput(item));
        // "Start anyway" on a skipped workout turns that skip into the workout itself.
        const skipped = item.session?.status === 'skipped' ? item.session : undefined;
        open({ mode: 'new', position, session: skipped ? { ...session, id: skipped.id, createdAt: skipped.createdAt } : session });
      },
      reopen: (session, position) => open({ mode: 'reopen', position, session: sessionForReopen(session) }, session),
      continueSession: (session, position) => {
        const { mode, original: restorePoint } = continueAs(session);
        open({ mode, position, session }, restorePoint);
      },
      // A repeat follows the progression rules like any other start.
      repeat: (item, source) => open({ mode: 'new', session: sessionFromPlan({ ...startInput(item), repeatOf: source }) }),
      completeSet,
      uncompleteSet: (entryId, setId) => {
        const entry = workout ? locate(workout.session, entryId)?.entry : undefined;
        const set = entry?.sets.find((s) => s.id === setId);
        dispatch({ type: 'uncompleteSet', entryId, setId });
        if (entry && set) AccessibilityInfo.announceForAccessibilityWithOptions(`${setName(set.kind, setNumber(entry.sets, set))} marked not done.`, { queue: true });
      },
      pickRestPreset,
      adjustRest,
      togglePauseRest,
      skipRest,
      end: async () => {
        if (!workout) return false;
        const opened = generation.current;
        finishing.current = true;
        cancelAutosave();
        const plan = discardPlan({ mode: workout.mode, original: original.current }, workout.session.id);
        const write = plan.kind === 'restore' ? saveSession.mutateAsync(plan.session) : deleteSession.mutateAsync(plan.sessionId);
        const ok = await succeeded(write);
        if (ok) noteWrite(plan.kind === 'restore' ? { kind: 'save', session: plan.session } : { kind: 'delete', sessionId: plan.sessionId });
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
          // The local date at Finish; reopening keeps the original moment and day (spec 2.5).
          ...completionStamp(now, reopened ? session : undefined),
          updatedAt: now.toISOString(),
        };
        // A reopened workout celebrates only records its edits added, not ones it already had.
        const newRecordCount = reopened ? recordsAddedByReopen(sessions.data ?? [], original.current, finished, exercisesById).length : 0;
        const newGoalIds = reopened ? goalsAddedByReopen(goals.data ?? [], sessions.data ?? [], original.current, finished, exercisesById, todayISO(now)).map((g) => g.id) : [];
        const opened = generation.current;
        // A pending auto-save mustn't land after this and mark the workout unfinished again.
        finishing.current = true;
        cancelAutosave();
        const ok = await succeeded(saveSession.mutateAsync(finished));
        if (ok) noteWrite({ kind: 'save', session: finished });
        if (generation.current === opened) {
          if (ok) close();
          else keepOpen();
        }
        return ok ? { session: finished, reopened, newRecordCount, newGoalIds } : null;
      },
    };
  }, [
    workout,
    liveRest,
    restJustEnded,
    upNext,
    prSetIds,
    exercisesById,
    history,
    sessions.data,
    goals.data,
    planShifts.data,
    preferences,
    completeSet,
    pickRestPreset,
    adjustRest,
    togglePauseRest,
    skipRest,
    changeRest,
    showRestOver,
    showUpNext,
    cancelRestAlarmOffer,
    flushLearned,
    saveSession,
    deleteSession,
    cancelAutosave,
    scheduleAutosave,
    noteWrite,
  ]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useActiveWorkout(): ContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('useActiveWorkout must be used inside ActiveWorkoutProvider');
  return value;
}

import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActionSheetIOS, Alert, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, EmptyState, ToastViewport, useToast } from '@/components/ui';
import { usePlans, usePreferences } from '@/data/hooks';
import { missingForCompletion } from '@/data/logging';
import { defaultPreferences } from '@/data/preferences';
import type { LoggedSet, SessionExercise, WorkoutSession } from '@/data/types';
import { useHaptics } from '@/hooks/useHaptics';
import { keyboardHeightNow } from '@/hooks/useKeyboardFrame';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { plural } from '@/lib/format';

import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { BlockCard } from '@/features/workout/BlockCard';
import { ExerciseSection } from '@/features/workout/ExerciseSection';
import { RestTimerBar } from '@/features/workout/RestTimerBar';
import { WorkoutHeader } from '@/features/workout/WorkoutHeader';
import { lastTimes, previousSets } from '@/features/workout/history';
import { canUndoSuggestion } from '@/features/workout/progression';
import { coveredBelow, scrollOffsetToShow, settleDelayMs, SETTLE_MAX_MS } from '@/features/workout/scrollTarget';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { readable } from '@/theme/layout';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** The least the docked bar covers (default text size), in case it hasn't been measured yet. */
const MIN_BAR_SPACE = 72;

/** The active workout (roadmap G2.2), presented as a sheet that can be swiped down to minimize. */
export default function ActiveWorkoutScreen() {
  const { colors, scheme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const haptics = useHaptics();
  const preferences = usePreferences().data ?? defaultPreferences;
  const { workout, counts, prSetIds, exercisesById, history, dispatch, completeSet, uncompleteSet, rest, upNext, skipRest, end, finish: saveWorkout } = useActiveWorkout();
  const reducedMotion = useReducedMotion();
  // Space the floating rest bar covers; it grows with the text size, so it's measured.
  const [restBarSpace, setRestBarSpace] = useState(0);
  const barSpace = useRef(0);

  // Where each block, exercise and set row sits (from onLayout, each relative to its parent), and
  // the scroll view's own state: for bringing the next set into view in a superset.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const layout = useRef({
    blocks: new Map<string, number>(),
    entries: new Map<string, { blockId: string; y: number }>(),
    sets: new Map<string, { y: number; height: number }>(),
    scrollY: 0,
    viewportHeight: 0,
    contentHeight: 0,
  });

  // Decision C: after a superset set that isn't its round's last, the next exercise's set comes
  // into view above the docked bar, once per completion. No animation with Reduce Motion on. The
  // scroll waits for the layout to settle (scrollTarget.ts), so it uses the height of the bar that
  // just appeared and where the row sits after a PR line pushed it down, not sizes from before.
  const pendingScroll = useRef<{ setId: string; entryId: string; deadline: number } | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrolledFor = useRef<number | null>(null);
  const scrollToPending = useCallback(() => {
    settleTimer.current = null;
    const pending = pendingScroll.current;
    pendingScroll.current = null;
    if (!pending) return;
    const at = layout.current;
    const entry = at.entries.get(pending.entryId);
    const row = at.sets.get(pending.setId);
    const blockY = entry ? at.blocks.get(entry.blockId) : undefined;
    if (!entry || !row || blockY === undefined) return;
    // The number pad stays up when the check is tapped, and the bar rides on top of it.
    const keyboard = keyboardHeightNow();
    const y = scrollOffsetToShow({
      rowTop: blockY + entry.y + row.y,
      rowHeight: row.height,
      scrollY: at.scrollY,
      viewportHeight: at.viewportHeight,
      contentHeight: at.contentHeight,
      coveredBelow: coveredBelow({ safeAreaBottom: insets.bottom, keyboardHeight: keyboard, barSpace: Math.max(barSpace.current, MIN_BAR_SPACE) }),
      keyboardInset: keyboard,
    });
    if (y !== null) scrollRef.current?.scrollTo({ y, animated: !reducedMotion });
  }, [insets.bottom, reducedMotion]);
  /** Called on the completion and on every layout report: while a scroll is pending, it waits a moment longer. */
  const settle = useCallback(() => {
    const pending = pendingScroll.current;
    if (!pending) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(scrollToPending, settleDelayMs(Date.now(), pending.deadline));
  }, [scrollToPending]);
  useEffect(() => {
    if (!upNext || scrolledFor.current === upNext.key) return;
    scrolledFor.current = upNext.key;
    pendingScroll.current = { setId: upNext.next.setId, entryId: upNext.next.entryId, deadline: Date.now() + SETTLE_MAX_MS };
    settle();
  }, [upNext, settle]);

  const onBarHeight = useCallback(
    (height: number) => {
      barSpace.current = height;
      setRestBarSpace(height);
      settle();
    },
    [settle],
  );

  // Last time's sets per entry, for the PREVIOUS column: the same last time its pre-fill and
  // progression built on (this plan workout's, or the exercise's anywhere). It matches against the
  // plan workout's planned exercises, as the start did, so removing one of two bench entries
  // partway never hands the other one its last time.
  const planId = workout?.session.planId;
  const planWorkoutId = workout?.session.planWorkoutId;
  const blocks = workout?.session.blocks;
  const plans = usePlans().data;
  const planIds = useMemo(
    () => plans?.find((p) => p.id === planId)?.workouts.find((w) => w.id === planWorkoutId)?.blocks.flatMap((b) => b.exercises.map((e) => e.id)) ?? [],
    [plans, planId, planWorkoutId],
  );
  const lastByEntry = useMemo(() => {
    const session: Pick<WorkoutSession, 'planId' | 'planWorkoutId' | 'blocks'> = { planId, planWorkoutId, blocks: blocks ?? [] };
    return lastTimes(session, history, planIds);
  }, [planId, planWorkoutId, blocks, history, planIds]);

  if (!workout) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="dumbbell"
          title="No workout in progress"
          message="Start one from Today and it'll show up here."
          actionLabel="Back to Today"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const { session } = workout;
  let groupIndex = 0;

  const toggleSet = (entry: SessionExercise, set: LoggedSet) => {
    if (set.completedAt) {
      uncompleteSet(entry.id, set.id);
      return;
    }
    const exercise = exercisesById.get(entry.exerciseId);
    // Spec 2.6: every logged set needs weight and reps (bodyweight sets only reps; holds a time).
    const missing = missingForCompletion(set, exercise);
    if (missing) {
      haptics.warning();
      toast.show({ message: missing === 'duration' ? 'Enter the hold time first.' : missing === 'load' ? 'Enter weight and reps first.' : 'Enter reps first.', tone: 'warning' });
      return;
    }
    // Without a weigh-in, a bodyweight set is logged with reps and added weight only, and stays out
    // of load-based stats. Bodyweight is asked at first sign-in and added from Profile (spec 2.6).
    completeSet(entry.id, set.id);
  };

  const openMenu = (entry: SessionExercise) => {
    const name = exercisesById.get(entry.exerciseId)?.name ?? 'Exercise';
    const options = ['Swap exercise', entry.notes ? 'Edit note' : 'Add note', entry.skipped ? 'Unskip exercise' : 'Skip exercise', 'Reorder exercises', 'Remove exercise', 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: name, options, destructiveButtonIndex: 4, cancelButtonIndex: 5, userInterfaceStyle: scheme },
      (index) => {
        if (index === 0) router.push({ pathname: '/workout/picker', params: { mode: 'swap', entry: entry.id } });
        if (index === 1) {
          Alert.prompt(`Note for ${name}`, 'Shown above the sets next time too.', (text) => dispatch({ type: 'setNotes', entryId: entry.id, notes: text.trim() }), 'plain-text', entry.notes);
        }
        if (index === 2) dispatch({ type: 'toggleSkip', entryId: entry.id });
        if (index === 3) router.push('/workout/reorder');
        if (index === 4) {
          Alert.alert(`Remove ${name}?`, 'Its sets in this workout will be deleted.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => dispatch({ type: 'removeExercise', entryId: entry.id }) },
          ]);
        }
      },
    );
  };

  // Decision A: the reason line offers last time's weight back in one tap (progression.ts
  // undoSuggestion). The reducer applies it, and auto-save keeps it like any other edit.
  const openSuggestion = (entry: SessionExercise) => {
    const name = exercisesById.get(entry.exerciseId)?.name ?? 'Exercise';
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: name,
        message: 'Sets you’ve done or changed yourself stay as they are.',
        options: ['Use last time’s weight', 'Cancel'],
        cancelButtonIndex: 1,
        userInterfaceStyle: scheme,
      },
      (index) => {
        // Only when a weight goes back, so the toast is true.
        if (index !== 0 || !canUndoSuggestion(entry)) return;
        dispatch({ type: 'undoSuggestion', entryId: entry.id });
        toast.show({ message: 'Back to last time’s weight.' });
      },
    );
  };

  const finish = () => {
    const remaining = counts.total - counts.done;
    const close = async () => {
      // On failure the error toast shows (SaveErrorToasts) and the workout stays open, so nothing is lost.
      const saved = await saveWorkout();
      if (!saved) return;
      // A reopened workout celebrates only the records and goals its edits added, and never offers plan changes.
      const params = saved.reopened
        ? { session: saved.session.id, reopened: '1', newRecords: String(saved.newRecordCount), newGoals: saved.newGoalIds.join(',') }
        : { session: saved.session.id, fresh: '1' };
      router.replace({ pathname: '/summary', params });
    };
    if (counts.done === 0) {
      Alert.alert('No sets logged yet', 'Complete at least one set to save this workout, or discard it.', [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Discard workout', style: 'destructive', onPress: discard },
      ]);
    } else if (remaining > 0) {
      Alert.alert('Finish as partial?', `${plural(remaining, 'set')} not logged. They'll be left out, and the workout will be saved as partial.`, [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Finish as partial', onPress: close },
      ]);
    } else {
      Alert.alert('Finish workout?', `All ${plural(counts.total, 'set')} logged.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Finish', onPress: close },
      ]);
    }
  };

  const reopened = workout?.mode === 'reopen';

  async function discard() {
    // On failure the error toast shows and the workout stays open.
    if (!(await end())) return;
    router.back();
    toast.show({ message: reopened ? 'Changes discarded.' : 'Workout discarded.' });
  }

  return (
    <View
      style={[styles.screen, { backgroundColor: colors.background }]}
      // VoiceOver: the two-finger scrub minimizes; the two-finger double-tap skips rest or opens the timer.
      onAccessibilityEscape={() => router.back()}
      onMagicTap={() => {
        if (rest) {
          skipRest();
          AccessibilityInfo.announceForAccessibility('Rest skipped');
        } else {
          router.push('/workout/timer');
        }
      }}
    >
      <WorkoutHeader title={session.name} startedAt={session.startedAt} counts={counts} onMinimize={() => router.back()} onFinish={finish} />

      <ScrollView
        ref={scrollRef}
        onLayout={(e) => {
          layout.current.viewportHeight = e.nativeEvent.layout.height;
          settle();
        }}
        onContentSizeChange={(_width, height) => {
          layout.current.contentHeight = height;
          settle();
        }}
        onScroll={(e) => (layout.current.scrollY = e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.content, readable, { paddingBottom: insets.bottom + (restBarSpace ? restBarSpace + spacing.lg : spacing.huge) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {session.blocks.map((block) => {
          const grouped = block.type === 'superset' || block.type === 'circuit';
          const letter = grouped ? LETTERS[groupIndex++ % LETTERS.length] : '';
          return (
            <BlockCard
              key={block.id}
              block={block}
              letter={letter}
              defaultRoundRestSec={preferences.restDefaultsSec.compound}
              onLayout={(e) => {
                layout.current.blocks.set(block.id, e.nativeEvent.layout.y);
                settle();
              }}
              renderExercise={(entry, label) => (
                <ExerciseSection
                  entry={entry}
                  exercise={exercisesById.get(entry.exerciseId)}
                  label={label}
                  previous={previousSets(entry, lastByEntry.get(entry.id))}
                  units={preferences.units}
                  effortScale={preferences.effortScale}
                  prSetIds={prSetIds}
                  onChangeSet={(setId, patch) => dispatch({ type: 'updateSet', entryId: entry.id, setId, patch })}
                  onToggleSet={(set) => toggleSet(entry, set)}
                  onOpenSet={(setId) => router.push({ pathname: '/workout/set', params: { entry: entry.id, set: setId } })}
                  onAddSet={() => dispatch({ type: 'addSet', entryId: entry.id })}
                  onOpenMenu={() => openMenu(entry)}
                  onCamera={() => {
                    // Record the next set that isn't logged yet (or the last set if all are done).
                    const next = entry.sets.find((x) => !x.completedAt) ?? entry.sets[entry.sets.length - 1];
                    router.push({ pathname: '/form/setup', params: { exercise: entry.exerciseId, entry: entry.id, set: next?.id } });
                  }}
                  onUnskip={() => dispatch({ type: 'toggleSkip', entryId: entry.id })}
                  onSuggestion={() => openSuggestion(entry)}
                  onLayout={(e) => {
                    layout.current.entries.set(entry.id, { blockId: block.id, y: e.nativeEvent.layout.y });
                    settle();
                  }}
                  onSetLayout={(setId, e) => {
                    layout.current.sets.set(setId, { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height });
                    settle();
                  }}
                />
              )}
            />
          );
        })}

        {session.blocks.length === 0 && (
          <Card>
            <EmptyState icon="dumbbell" title="No exercises in this workout" message="Add an exercise to start logging sets." />
          </Card>
        )}

        <View style={styles.footer}>
          <Button title="Add exercise" variant="secondary" icon="plus" fullWidth onPress={() => router.push({ pathname: '/workout/picker', params: { mode: 'add' } })} />
          <View style={styles.footerRow}>
            <Button title="Reorder" variant="ghost" size="sm" icon="arrow.up.arrow.down" onPress={() => router.push('/workout/reorder')} />
            <Button title="Rest timer" variant="ghost" size="sm" icon="timer" onPress={() => router.push('/workout/timer')} />
            <Button
              title="Discard"
              variant="ghost"
              size="sm"
              icon="trash"
              onPress={() =>
                Alert.alert(
                  reopened ? 'Discard your changes?' : 'Discard this workout?',
                  reopened ? 'The workout goes back to how it was before you reopened it.' : 'Everything logged in it will be deleted.',
                  [
                    { text: 'Keep it', style: 'cancel' },
                    { text: 'Discard', style: 'destructive', onPress: discard },
                  ],
                )
              }
            />
          </View>
        </View>
      </ScrollView>

      <RestTimerBar onExpand={() => router.push('/workout/timer')} onHeightChange={onBarHeight} />
      {/* This sheet sits above the root view, so it needs its own toast host (clear of the rest bar). */}
      <ToastViewport bottomOffset={restBarSpace ? restBarSpace + spacing.sm : spacing.lg} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  footer: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
});

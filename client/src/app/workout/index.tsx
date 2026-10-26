import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { AccessibilityInfo, ActionSheetIOS, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, EmptyState, ToastViewport, useToast } from '@/components/ui';
import { usePreferences } from '@/data/hooks';
import { missingForCompletion } from '@/data/logging';
import { defaultPreferences } from '@/data/preferences';
import type { LoggedSet, SessionExercise } from '@/data/types';
import { useHaptics } from '@/hooks/useHaptics';
import { plural } from '@/lib/format';

import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { BlockCard } from '@/features/workout/BlockCard';
import { ExerciseSection } from '@/features/workout/ExerciseSection';
import { RestTimerBar } from '@/features/workout/RestTimerBar';
import { WorkoutHeader } from '@/features/workout/WorkoutHeader';
import { lastEntryFor, previousSets } from '@/features/workout/history';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { readable } from '@/theme/layout';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The active workout (roadmap G2.2), presented as a sheet that can be swiped down to minimize. */
export default function ActiveWorkoutScreen() {
  const { colors, scheme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const haptics = useHaptics();
  const preferences = usePreferences().data ?? defaultPreferences;
  const { workout, counts, prSetIds, exercisesById, history, dispatch, completeSet, uncompleteSet, rest, skipRest, end, finish: saveWorkout } = useActiveWorkout();
  // Space the floating rest bar covers; it grows with the text size, so it's measured.
  const [restBarSpace, setRestBarSpace] = useState(0);

  // Last time's sets per exercise, for the PREVIOUS column.
  const lastByExercise = useMemo(() => {
    const map = new Map<string, SessionExercise | undefined>();
    for (const block of workout?.session.blocks ?? []) {
      for (const entry of block.exercises) {
        if (!map.has(entry.exerciseId)) map.set(entry.exerciseId, lastEntryFor(entry.exerciseId, history));
      }
    }
    return map;
  }, [workout?.session.blocks, history]);

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

  const finish = () => {
    const remaining = counts.total - counts.done;
    const close = async () => {
      // On failure the error toast shows (SaveErrorToasts) and the workout stays open, so nothing is lost.
      const saved = await saveWorkout();
      if (!saved) return;
      // A reopened workout celebrates only the records its edits added, and never offers plan changes.
      const params = saved.reopened ? { session: saved.session.id, reopened: '1', newRecords: String(saved.newRecordCount) } : { session: saved.session.id, fresh: '1' };
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
              renderExercise={(entry, label) => (
                <ExerciseSection
                  entry={entry}
                  exercise={exercisesById.get(entry.exerciseId)}
                  label={label}
                  previous={previousSets(entry, lastByExercise.get(entry.exerciseId))}
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

      <RestTimerBar onExpand={() => router.push('/workout/timer')} onHeightChange={setRestBarSpace} />
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

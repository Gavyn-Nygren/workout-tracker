import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Fragment, useState } from 'react';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, ErrorState, Icon, NotFoundState, ScreenSkeleton } from '@/components/ui';
import { succeeded, useExercises, usePlan, usePreferences, useSavePlan } from '@/data/hooks';
import { roundingIncrementFor } from '@/data/logging';
import { defaultPreferences } from '@/data/preferences';
import type { Plan, PlannedBlock, PlannedExercise, PlanWorkout } from '@/data/types';
import { formatClock, spokenDuration } from '@/hooks/useNow';
import { describeProgression, exerciseName, prescriptionSummary, spokenPrescription, workoutDays } from '@/features/plans/describe';
import { moveBlock, removeExercise, removeWorkout, supersetWithNext, ungroup, updateWorkout } from '@/features/plans/planEdits';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { readable, useTextScale } from '@/theme/layout';

/** Edit one plan workout: its exercises, order, and supersets. Changes save immediately. */
export default function PlanWorkoutScreen() {
  const { plan: planId, workout: workoutId } = useLocalSearchParams<{ plan: string; workout: string }>();
  const { colors, scheme } = useAppTheme();
  const { large } = useTextScale();
  const planQuery = usePlan(planId);
  const exercisesQuery = useExercises();
  const preferences = usePreferences().data ?? defaultPreferences;
  const { units, weekStartsOn } = preferences;
  const savePlan = useSavePlan();
  // Set while a delete saves: the refetched plan no longer has this workout, and the screen shouldn't flash "Workout not found" on the way out.
  const [deleted, setDeleted] = useState<PlanWorkout>();

  const failed = [planQuery, exercisesQuery].filter((q) => q.error);
  if (failed.length) return <ErrorState fill title="Couldn't load this workout" onRetry={() => failed.forEach((q) => q.refetch())} />;
  if (planQuery.isPending || exercisesQuery.isPending) return <ScreenSkeleton />;
  const plan = planQuery.data;
  const workout = plan?.workouts.find((w) => w.id === workoutId) ?? deleted;
  if (!plan || !workout) return <NotFoundState thing="Workout" icon="dumbbell" />;

  const exercisesById = new Map((exercisesQuery.data ?? []).map((e) => [e.id, e]));

  const save = (next: Plan) => savePlan.mutate(next);

  // Each edit starts from the plan as shown, so one made while another saves would undo it (as on
  // the plan screen). Checked when the menu or prompt opens, not when it's answered.
  const openMenu = (block: PlannedBlock, blockIndex: number, planned: PlannedExercise) => {
    if (savePlan.isPending) return;
    const grouped = block.type !== 'single';
    const options = [
      'Edit sets & reps',
      'Swap exercise',
      grouped ? 'Split up superset' : 'Superset with next',
      'Move up',
      'Move down',
      'Remove',
      'Cancel',
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: exerciseName(exercisesById, planned.exerciseId),
        options,
        destructiveButtonIndex: 5,
        cancelButtonIndex: 6,
        disabledButtonIndices: [
          ...(!grouped && blockIndex >= workout.blocks.length - 1 ? [2] : []),
          ...(blockIndex === 0 ? [3] : []),
          ...(blockIndex >= workout.blocks.length - 1 ? [4] : []),
        ],
        userInterfaceStyle: scheme,
      },
      (index) => {
        if (index === 0) router.push({ pathname: '/plans/prescription', params: { plan: plan.id, workout: workout.id, pe: planned.id } });
        if (index === 1) router.push({ pathname: '/plan-picker', params: { plan: plan.id, workout: workout.id, mode: 'swap', pe: planned.id } });
        if (index === 2) save(grouped ? ungroup(plan, workout.id, blockIndex) : supersetWithNext(plan, workout.id, blockIndex));
        if (index === 3) save(moveBlock(plan, workout.id, blockIndex, blockIndex - 1));
        if (index === 4) save(moveBlock(plan, workout.id, blockIndex, blockIndex + 1));
        if (index === 5) save(removeExercise(plan, workout.id, planned.id));
      },
    );
  };

  const rename = () => {
    if (savePlan.isPending) return;
    Alert.prompt('Rename workout', undefined, (name) => name.trim() && save(updateWorkout(plan, workout.id, (w) => ({ ...w, name: name.trim() }))), 'plain-text', workout.name);
  };

  const days = workoutDays(plan, workout.id, false, weekStartsOn);

  return (
    <>
      <Stack.Screen
        options={{
          title: workout.name,
          headerRight: () => (
            <Pressable onPress={rename} accessibilityRole="button" accessibilityLabel="Rename workout" hitSlop={10}>
              <Icon name="pencil" color={colors.onChrome} size={18} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, readable]}>
        <View style={styles.header}>
          <AppText variant="title2" accessibilityRole="header">
            {workout.name}
          </AppText>
          <AppText variant="subhead" tone="secondary">
            {[plan.name, days].filter(Boolean).join('  ·  ')}
          </AppText>
        </View>

        {workout.blocks.map((block, blockIndex) => (
          <Card key={block.id} padding="none">
            {block.type !== 'single' && (
              <View
                style={[styles.groupHeader, { backgroundColor: colors.accentSubtle }]}
                accessible
                accessibilityRole="header"
                accessibilityLabel={`${block.type === 'superset' ? 'Superset' : 'Circuit'}${block.roundRestSec !== undefined ? `, ${spokenDuration(block.roundRestSec)} rest after each round` : ''}`}
              >
                <View style={styles.groupTitle}>
                  <Icon name={block.type === 'superset' ? 'arrow.left.arrow.right' : 'arrow.triangle.2.circlepath'} color={colors.accentText} size={13} />
                  <AppText variant="label" tone="accent" style={styles.flex}>
                    {block.type === 'superset' ? 'Superset' : 'Circuit'}
                  </AppText>
                  {!large && block.roundRestSec !== undefined && (
                    <AppText variant="caption" tone="accent" style={styles.shrink}>{`${formatClock(block.roundRestSec)} rest after each round`}</AppText>
                  )}
                </View>
                {/* Large text: the rest caption gets its own line so "SUPERSET" isn't squeezed out. */}
                {large && block.roundRestSec !== undefined && (
                  <AppText variant="caption" tone="accent">{`${formatClock(block.roundRestSec)} rest after each round`}</AppText>
                )}
              </View>
            )}
            {block.exercises.map((planned, i) => (
              <Fragment key={planned.id}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                <ExerciseRow
                  name={exerciseName(exercisesById, planned.exerciseId)}
                  summary={prescriptionSummary(planned)}
                  spokenSummary={spokenPrescription(planned)}
                  // The step as the rule takes it, on this exercise's rounding: a 5 lb step reads "+2.5 kg" in kg.
                  progression={planned.progression && describeProgression(planned.progression, units, planned.sets, exercisesById.get(planned.exerciseId), roundingIncrementFor(exercisesById.get(planned.exerciseId)?.equipment, preferences))}
                  onPress={() => router.push({ pathname: '/plans/prescription', params: { plan: plan.id, workout: workout.id, pe: planned.id } })}
                  onMenu={() => openMenu(block, blockIndex, planned)}
                />
              </Fragment>
            ))}
          </Card>
        ))}

        {!workout.blocks.length && <EmptyState icon="plus.circle" title="No exercises yet" message="Add the exercises for this workout, then set their sets and reps." />}

        <Button
          title="Add exercise"
          icon="plus"
          fullWidth
          onPress={() => router.push({ pathname: '/plan-picker', params: { plan: plan.id, workout: workout.id, mode: 'add' } })}
        />
        <Button
          title="Delete workout"
          variant="ghost"
          icon="trash"
          style={styles.centerSelf}
          onPress={() =>
            Alert.alert(`Delete ${workout.name}?`, 'It comes off the schedule too. Workouts you already logged stay in your history.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  setDeleted(workout);
                  if (!(await succeeded(savePlan.mutateAsync(removeWorkout(plan, workout.id))))) {
                    setDeleted(undefined);
                    return;
                  }
                  router.back();
                },
              },
            ])
          }
        />
      </ScrollView>
    </>
  );
}

/**
 * One exercise in the workout. The row and its options button are siblings, not nested, so
 * VoiceOver can reach both; the gray press highlight still covers the whole row.
 */
function ExerciseRow({
  name,
  summary,
  spokenSummary,
  progression,
  onPress,
  onMenu,
}: {
  name: string;
  summary: string;
  spokenSummary: string;
  progression?: string;
  onPress: () => void;
  onMenu: () => void;
}) {
  const { colors } = useAppTheme();
  const [pressed, setPressed] = useState(false);
  return (
    <View style={[styles.exercise, pressed && { backgroundColor: colors.input }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${spokenSummary}${progression ? `. Progression: ${progression.replace(/ · /g, ', ')}` : ''}`}
        accessibilityHint="Edits sets and reps."
        style={styles.exerciseBody}
      >
        <AppText variant="headline">{name}</AppText>
        <AppText variant="footnote" tone="secondary" numeric>
          {summary}
        </AppText>
        {progression && (
          <AppText variant="caption" tone="accent">
            {progression}
          </AppText>
        )}
      </Pressable>
      <Pressable onPress={onMenu} accessibilityRole="button" accessibilityLabel={`More options for ${name}`} hitSlop={8} style={[styles.menu, { backgroundColor: colors.input }]}>
        <Icon name="ellipsis" color={colors.text} size={15} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  groupHeader: {
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  groupTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg,
  },
  exercise: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.lg,
  },
  // The tappable body runs right up to the options button, so there's no dead strip between them.
  exerciseBody: {
    flex: 1,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    paddingVertical: spacing.md,
  },
  menu: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  centerSelf: {
    alignSelf: 'center',
  },
});

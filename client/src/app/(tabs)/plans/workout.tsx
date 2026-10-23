import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Fragment, useState } from 'react';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, ErrorState, Icon, NotFoundState, ScreenSkeleton } from '@/components/ui';
import { succeeded, useExercises, usePlan, usePreferences, useSavePlan } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { Plan, PlannedBlock, PlannedExercise, PlanWorkout } from '@/data/types';
import { formatClock } from '@/hooks/useNow';
import { describeProgression, exerciseName, prescriptionSummary, workoutDays } from '@/features/plans/describe';
import { moveBlock, removeExercise, removeWorkout, supersetWithNext, ungroup, updateWorkout } from '@/features/plans/planEdits';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { readable } from '@/theme/layout';

/** Edit one plan workout: its exercises, order, and supersets. Changes save immediately. */
export default function PlanWorkoutScreen() {
  const { plan: planId, workout: workoutId } = useLocalSearchParams<{ plan: string; workout: string }>();
  const { colors, scheme } = useAppTheme();
  const planQuery = usePlan(planId);
  const exercisesQuery = useExercises();
  const units = (usePreferences().data ?? defaultPreferences).units;
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

  const openMenu = (block: PlannedBlock, blockIndex: number, planned: PlannedExercise) => {
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

  const rename = () =>
    Alert.prompt('Rename workout', undefined, (name) => name.trim() && save(updateWorkout(plan, workout.id, (w) => ({ ...w, name: name.trim() }))), 'plain-text', workout.name);

  const days = workoutDays(plan, workout.id);

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
          <AppText variant="title2">{workout.name}</AppText>
          <AppText variant="subhead" tone="secondary">
            {[plan.name, days].filter(Boolean).join('  ·  ')}
          </AppText>
        </View>

        {workout.blocks.map((block, blockIndex) => (
          <Card key={block.id} padding="none">
            {block.type !== 'single' && (
              <View style={[styles.groupHeader, { backgroundColor: colors.accentSubtle }]}>
                <Icon name={block.type === 'superset' ? 'arrow.left.arrow.right' : 'arrow.triangle.2.circlepath'} color={colors.accentText} size={13} />
                <AppText variant="label" tone="accent" style={styles.flex}>
                  {block.type === 'superset' ? 'Superset' : 'Circuit'}
                </AppText>
                {block.roundRestSec !== undefined && (
                  <AppText variant="caption" tone="accent">{`${formatClock(block.roundRestSec)} rest after each round`}</AppText>
                )}
              </View>
            )}
            {block.exercises.map((planned, i) => (
              <Fragment key={planned.id}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                <Pressable
                  onPress={() => router.push({ pathname: '/plans/prescription', params: { plan: plan.id, workout: workout.id, pe: planned.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${exerciseName(exercisesById, planned.exerciseId)}, ${prescriptionSummary(planned)}. Edit sets and reps`}
                  style={({ pressed }) => [styles.exercise, pressed && { backgroundColor: colors.input }]}
                >
                  <View style={styles.flex}>
                    <AppText variant="headline" numberOfLines={1}>
                      {exerciseName(exercisesById, planned.exerciseId)}
                    </AppText>
                    <AppText variant="footnote" tone="secondary" numeric>
                      {prescriptionSummary(planned)}
                    </AppText>
                    {planned.progression && (
                      <AppText variant="caption" tone="accent">
                        {describeProgression(planned.progression, units)}
                      </AppText>
                    )}
                  </View>
                  <Pressable
                    onPress={() => openMenu(block, blockIndex, planned)}
                    accessibilityRole="button"
                    accessibilityLabel={`${exerciseName(exercisesById, planned.exerciseId)} options`}
                    hitSlop={8}
                    style={[styles.menu, { backgroundColor: colors.input }]}
                  >
                    <Icon name="ellipsis" color={colors.text} size={15} />
                  </Pressable>
                </Pressable>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg,
  },
  exercise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
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
  centerSelf: {
    alignSelf: 'center',
  },
});

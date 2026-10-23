import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, ErrorState, Icon, ListRow, NotFoundState, ScreenSkeleton, SectionHeader, useToast } from '@/components/ui';
import { useRepository } from '@/data/DataProvider';
import { succeeded, useDeletePlan, usePlan, useSavePlan, useTemplates } from '@/data/hooks';
import { programWeek } from '@/data/schedule';
import type { Plan } from '@/data/types';
import { formatShortDate } from '@/lib/format';
import { describeSchedule, workoutDays, workoutStats } from '@/features/plans/describe';
import { StatusPill } from '@/features/plans/PlanCard';
import { addWorkout } from '@/features/plans/planEdits';
import { ScheduleGrid } from '@/features/plans/ScheduleGrid';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { readable, useTextScale } from '@/theme/layout';

/** One plan: status, schedule week grid, and its workouts. */
export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, scheme } = useAppTheme();
  const { large } = useTextScale();
  const toast = useToast();
  const today = useRepository().today();
  const planQuery = usePlan(id);
  const templatesQuery = useTemplates();
  const savePlan = useSavePlan();
  const deletePlan = useDeletePlan();
  // Set while a delete finishes: its refetch finds nothing, and the screen shouldn't flash "Plan not found" on the way out.
  const [deleted, setDeleted] = useState<Plan>();

  const failed = [planQuery, templatesQuery].filter((q) => q.error);
  if (failed.length) return <ErrorState fill title="Couldn't load this plan" onRetry={() => failed.forEach((q) => q.refetch())} />;
  if (planQuery.isPending || templatesQuery.isPending) return <ScreenSkeleton />;
  const plan = planQuery.data ?? deleted;
  if (!plan) return <NotFoundState thing="Plan" icon="calendar" />;

  const template = templatesQuery.data?.find((t) => t.id === plan.templateId);
  const week = programWeek(plan, today);

  const openMenu = () => {
    const pauseLabel = plan.status === 'active' ? 'Pause plan' : 'Resume plan';
    ActionSheetIOS.showActionSheetWithOptions(
      { title: plan.name, options: ['Rename', pauseLabel, 'Delete plan', 'Cancel'], destructiveButtonIndex: 2, cancelButtonIndex: 3, userInterfaceStyle: scheme },
      (index) => {
        if (index === 0) {
          Alert.prompt('Rename plan', undefined, (name) => name.trim() && savePlan.mutate({ ...plan, name: name.trim() }), 'plain-text', plan.name);
        }
        if (index === 1) {
          const status = plan.status === 'active' ? 'paused' : 'active';
          savePlan.mutate({ ...plan, status }, { onSuccess: () => toast.show({ message: status === 'paused' ? 'Plan paused. Its upcoming workouts are off the calendar.' : 'Plan resumed.' }) });
        }
        if (index === 2) {
          Alert.alert(`Delete ${plan.name}?`, 'Upcoming workouts from this plan are removed. Workouts you already logged stay in your history.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                setDeleted(plan);
                if (!(await succeeded(deletePlan.mutateAsync(plan.id)))) {
                  setDeleted(undefined);
                  return;
                }
                router.back();
                toast.show({ message: `${plan.name} deleted.` });
              },
            },
          ]);
        }
      },
    );
  };

  const newWorkout = () => {
    // A second add while one saves would overwrite it.
    if (savePlan.isPending) return;
    Alert.prompt('New workout', 'Name it, then add exercises.', async (name) => {
      if (!name.trim()) return;
      const result = addWorkout(plan, name.trim());
      if (!(await succeeded(savePlan.mutateAsync(result.plan)))) return;
      router.push({ pathname: '/plans/workout', params: { plan: plan.id, workout: result.workoutId } });
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: plan.name,
          headerRight: () => (
            <Pressable onPress={openMenu} accessibilityRole="button" accessibilityLabel="Plan options" hitSlop={10}>
              <Icon name="ellipsis.circle" color={colors.onChrome} size={22} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, readable]}>
        <Card>
          <View style={styles.stack}>
            {/* Large text: the status pill drops under the name instead of squeezing it. */}
            <View style={large ? styles.rowStacked : styles.row}>
              <AppText variant="title2" accessibilityRole="header" style={large ? undefined : styles.flex}>
                {plan.name}
              </AppText>
              <StatusPill status={plan.status} />
            </View>
            <AppText variant="subhead" tone="secondary">
              {[describeSchedule(plan.schedule), week && plan.schedule.type === 'fixed' ? `Week ${week} of ${plan.schedule.weeks}` : undefined]
                .filter(Boolean)
                .join('  ·  ')}
            </AppText>
            <AppText variant="footnote" tone="secondary">
              {`Started ${formatShortDate(plan.startDate)}${template ? `  ·  From the ${template.name} template` : ''}`}
            </AppText>
            <View style={[styles.note, { backgroundColor: colors.accentSubtle }]}>
              <Icon name="info.circle" color={colors.accentText} size={14} />
              <AppText variant="footnote" tone="accent" style={styles.flex}>
                Edits apply to upcoming workouts. Workouts you've logged never change.
              </AppText>
            </View>
          </View>
        </Card>

        <View style={styles.section}>
          <SectionHeader title="Schedule" actionLabel="Edit" actionAccessibilityLabel="Edit schedule" onAction={() => router.push({ pathname: '/plans/schedule', params: { plan: plan.id } })} />
          <Card>
            <ScheduleGrid schedule={plan.schedule} workouts={plan.workouts} today={plan.status === 'active' ? today : undefined} startDate={plan.startDate} />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader title={`Workouts · ${plan.workouts.length}`} actionLabel="Add" actionAccessibilityLabel="Add workout" onAction={newWorkout} />
          <Card padding="none">
            {plan.workouts.map((w, i) => (
              <ListRow
                key={w.id}
                title={w.name}
                subtitle={[workoutDays(plan, w.id), workoutStats(w)].filter(Boolean).join('  ·  ')}
                accessibilityLabel={[w.name, workoutDays(plan, w.id, true), workoutStats(w, true)].filter(Boolean).join(', ')}
                icon={/core|abs/i.test(w.name) ? 'figure.core.training' : 'dumbbell'}
                onPress={() => router.push({ pathname: '/plans/workout', params: { plan: plan.id, workout: w.id } })}
                separator={i < plan.workouts.length - 1}
              />
            ))}
            {!plan.workouts.length && <EmptyState icon="dumbbell" title="No workouts yet" message="Add a workout, then put exercises in it." />}
          </Card>
          <Button title="Add workout" variant="secondary" icon="plus" fullWidth onPress={newWorkout} />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.xl,
  },
  stack: {
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowStacked: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  flex: {
    flex: 1,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: 10,
    padding: spacing.sm + 2,
    marginTop: spacing.xs,
  },
});

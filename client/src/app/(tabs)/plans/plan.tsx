import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, Icon, ListRow, SectionHeader, useToast } from '@/components/ui';
import { useRepository } from '@/data/DataProvider';
import { useDeletePlan, usePlans, useSavePlan, useTemplates } from '@/data/hooks';
import { programWeek } from '@/data/schedule';
import { formatShortDate } from '@/lib/format';
import { describeSchedule, PLAN_TYPE_LABEL, workoutDays, workoutStats } from '@/features/plans/describe';
import { StatusPill } from '@/features/plans/PlanCard';
import { addWorkout } from '@/features/plans/planEdits';
import { ScheduleGrid } from '@/features/plans/ScheduleGrid';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { readable } from '@/theme/layout';

/** One plan: status, schedule week grid, and its workouts. */
export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, scheme } = useAppTheme();
  const toast = useToast();
  const today = useRepository().today();
  const { data: plans } = usePlans();
  const { data: templates } = useTemplates();
  const savePlan = useSavePlan();
  const deletePlan = useDeletePlan();

  const plan = plans?.find((p) => p.id === id);
  if (!plan) {
    return (
      <View style={styles.center}>
        <EmptyState icon="calendar.badge.exclamationmark" title="Plan not found" message="It may have been deleted." actionLabel="Back to plans" onAction={() => router.back()} />
      </View>
    );
  }

  const template = templates?.find((t) => t.id === plan.templateId);
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
          savePlan.mutate({ ...plan, status });
          toast.show({ message: status === 'paused' ? 'Plan paused. Its upcoming workouts are off the calendar.' : 'Plan resumed.' });
        }
        if (index === 2) {
          Alert.alert(`Delete ${plan.name}?`, 'Upcoming workouts from this plan are removed. Workouts you already logged stay in your history.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                await deletePlan.mutateAsync(plan.id);
                router.back();
                toast.show({ message: `${plan.name} deleted.` });
              },
            },
          ]);
        }
      },
    );
  };

  const newWorkout = () =>
    Alert.prompt('New workout', 'Name it, then add exercises.', async (name) => {
      if (!name.trim()) return;
      const result = addWorkout(plan, name.trim());
      await savePlan.mutateAsync(result.plan);
      router.push({ pathname: '/plans/workout', params: { plan: plan.id, workout: result.workoutId } });
    });

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
            <View style={styles.row}>
              <AppText variant="title2" style={styles.flex}>
                {plan.name}
              </AppText>
              <StatusPill status={plan.status} />
            </View>
            <AppText variant="subhead" tone="secondary">
              {[PLAN_TYPE_LABEL[plan.schedule.type], describeSchedule(plan.schedule), week && plan.schedule.type === 'fixed' ? `Week ${week} of ${plan.schedule.weeks}` : undefined]
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
          <SectionHeader title="Schedule" actionLabel="Edit" onAction={() => router.push({ pathname: '/plans/schedule', params: { plan: plan.id } })} />
          <Card>
            <ScheduleGrid schedule={plan.schedule} workouts={plan.workouts} today={plan.status === 'active' ? today : undefined} startDate={plan.startDate} />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader title={`Workouts · ${plan.workouts.length}`} actionLabel="Add" onAction={newWorkout} />
          <Card padding="none">
            {plan.workouts.map((w, i) => (
              <ListRow
                key={w.id}
                title={w.name}
                subtitle={[workoutDays(plan, w.id), workoutStats(w)].filter(Boolean).join('  ·  ')}
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
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
});

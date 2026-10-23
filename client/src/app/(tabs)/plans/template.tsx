import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActionSheetIOS, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, ErrorState, Icon, NotFoundState, ScreenSkeleton, SectionHeader, useToast } from '@/components/ui';
import { useRepository } from '@/data/DataProvider';
import { succeeded, useExercises, useSavePlan, useTemplates } from '@/data/hooks';
import { formatShortDate } from '@/lib/format';
import { CATEGORY_LABEL, describeSchedule, exerciseName, PLAN_TYPE_LABEL, prescriptionSummary, workoutDays } from '@/features/plans/describe';
import { nextMonday, planFromTemplate } from '@/features/plans/planEdits';
import { ScheduleGrid } from '@/features/plans/ScheduleGrid';
import { templateMeta } from '@/features/plans/TemplateCard';
import { EQUIPMENT_LABEL } from '@/features/exercises/ExerciseList';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { readable } from '@/theme/layout';

/** A starter template's details, and "Use this template" to copy it into a new plan. */
export default function TemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, scheme } = useAppTheme();
  const toast = useToast();
  const today = useRepository().today();
  const templatesQuery = useTemplates();
  const exercisesQuery = useExercises();
  const savePlan = useSavePlan();

  const failed = [templatesQuery, exercisesQuery].filter((q) => q.error);
  if (failed.length) return <ErrorState fill title="Couldn't load this template" onRetry={() => failed.forEach((q) => q.refetch())} />;
  if (templatesQuery.isPending || exercisesQuery.isPending) return <ScreenSkeleton />;
  const template = templatesQuery.data?.find((t) => t.id === id);
  if (!template) return <NotFoundState thing="Template" icon="square.stack.3d.up" />;

  const exercisesById = new Map((exercisesQuery.data ?? []).map((e) => [e.id, e]));

  const ready = template.workouts.length > 0;
  const monday = nextMonday(today);

  const use = () => {
    if (savePlan.isPending) return;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `Start ${template.name}`,
        message: 'It becomes your own plan. Changing it later never affects the template.',
        options: ['Start today', `Start ${formatShortDate(monday)}`, 'Cancel'],
        cancelButtonIndex: 2,
        userInterfaceStyle: scheme,
      },
      async (i) => {
        if (i > 1) return;
        const plan = planFromTemplate(template, i === 0 ? today : monday);
        if (!(await succeeded(savePlan.mutateAsync(plan)))) return;
        router.replace({ pathname: '/plans/plan', params: { id: plan.id } });
        toast.show({ message: `${template.name} added to your plans.`, tone: 'success' });
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: template.name }} />
      <ScrollView contentContainerStyle={[styles.content, readable]}>
        <View style={styles.header}>
          <View style={[styles.category, { backgroundColor: colors.accentSubtle }]}>
            <AppText variant="caption" weight="800" tone="accent">
              {CATEGORY_LABEL[template.category].toUpperCase()}
            </AppText>
          </View>
          <AppText variant="title1">{template.name}</AppText>
          <AppText variant="body" tone="secondary">
            {template.description}
          </AppText>
          <AppText variant="footnote" weight="600" numeric>
            {templateMeta(template)}
          </AppText>
          <AppText variant="footnote" tone="secondary">
            {`Equipment: ${template.equipment.map((e) => EQUIPMENT_LABEL[e]).join(', ')}`}
          </AppText>
        </View>

        {ready ? (
          <>
            <View style={styles.section}>
              <SectionHeader title={`Schedule · ${PLAN_TYPE_LABEL[template.schedule.type]}`} />
              <Card>
                <View style={styles.stack}>
                  <ScheduleGrid schedule={template.schedule} workouts={template.workouts} />
                  <AppText variant="footnote" tone="secondary">
                    {describeSchedule(template.schedule)}
                  </AppText>
                </View>
              </Card>
            </View>

            {template.workouts.map((w) => (
              <View key={w.id} style={styles.section}>
                <SectionHeader title={[w.name, workoutDays(template, w.id)].filter(Boolean).join(' · ')} />
                <Card padding="none">
                  {w.blocks.flatMap((b) =>
                    b.exercises.map((pe, i) => (
                      <View key={pe.id} style={[styles.line, { borderTopColor: colors.border, borderTopWidth: i === 0 && b === w.blocks[0] ? 0 : StyleSheet.hairlineWidth }]}>
                        {b.type !== 'single' && <Icon name="arrow.left.arrow.right" color={colors.accentText} size={12} />}
                        <AppText variant="body" style={styles.flex} numberOfLines={1}>
                          {exerciseName(exercisesById, pe.exerciseId)}
                        </AppText>
                        <AppText variant="footnote" tone="secondary" numeric>
                          {prescriptionSummary(pe).split(' · ')[0]}
                        </AppText>
                      </View>
                    )),
                  )}
                </Card>
              </View>
            ))}
            <Button title="Use this template" icon="plus" fullWidth loading={savePlan.isPending} onPress={use} />
          </>
        ) : (
          <Card>
            <EmptyState icon="hammer" title="Program in progress" message="This template's workouts are still being written. They'll be ready before launch." />
          </Card>
        )}
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
  header: {
    gap: spacing.sm,
  },
  category: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  section: {
    gap: spacing.sm,
  },
  stack: {
    gap: spacing.md,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  flex: {
    flex: 1,
  },
});

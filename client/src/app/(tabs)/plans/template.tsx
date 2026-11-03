import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActionSheetIOS, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, ErrorState, Icon, NotFoundState, ScreenSkeleton, SectionHeader, SegmentedControl, useToast } from '@/components/ui';
import { gearForSchedule, gearList } from '@/data/content/gear';
import { useToday } from '@/data/DataProvider';
import { succeeded, useExercises, usePreferences, useSavePlan, useTemplates } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { BlockType } from '@/data/types';
import { formatShortDate, plural } from '@/lib/format';
import { CATEGORY_LABEL, describeSchedule, exerciseName, PLAN_TYPE_LABEL, prescriptionSummary, spokenPrescription, templateMeta, workoutDays } from '@/features/plans/describe';
import { notePlanScheduled } from '@/features/notifications/planOfferStore';
import { nextWeekStart, planFromTemplate, templateDayOption, templateDayOptions } from '@/features/plans/planEdits';
import { ScheduleGrid } from '@/features/plans/ScheduleGrid';
import { EQUIPMENT_LABEL } from '@/features/exercises/ExerciseList';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { DENSE_TEXT_MAX, readable, useTextScale } from '@/theme/layout';

/** How VoiceOver introduces an exercise in a grouped block: "Superset, …" or "Circuit, …". */
const GROUP_SPOKEN: Record<BlockType, string> = { single: '', warmup: '', superset: 'Superset, ', circuit: 'Circuit, ' };

/**
 * A starter template's details, and "Use this template" to copy it into a new plan. A program with
 * several day versions gets a "Days a week" switch (user's pick): the week grid, the schedule
 * line, the workouts and the gear follow it, and the plan starts that version.
 */
export default function TemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, scheme } = useAppTheme();
  const { large } = useTextScale();
  const toast = useToast();
  const today = useToday();
  const templatesQuery = useTemplates();
  const exercisesQuery = useExercises();
  const savePlan = useSavePlan();
  const weekStartsOn = usePreferences().data?.weekStartsOn ?? defaultPreferences.weekStartsOn;
  // The picked version's days; until a pick, the template's default version.
  const [days, setDays] = useState<number>();
  // Set while the start sheet is open or the plan is saving, so a quick second tap does nothing.
  const starting = useRef(false);

  const failed = [templatesQuery, exercisesQuery].filter((q) => q.error);
  if (failed.length) return <ErrorState fill title="Couldn't load this template" onRetry={() => failed.forEach((q) => q.refetch())} />;
  if (templatesQuery.isPending || exercisesQuery.isPending) return <ScreenSkeleton />;
  const template = templatesQuery.data?.find((t) => t.id === id);
  if (!template) return <NotFoundState thing="Template" icon="square.stack.3d.up" />;

  const exercisesById = new Map((exercisesQuery.data ?? []).map((e) => [e.id, e]));
  const options = templateDayOptions(template);
  const option = templateDayOption(template, days);
  const { schedule } = option;
  // Only the workouts this version schedules, in the template's order, and the gear they need.
  const scheduled = new Set<string>(schedule.type === 'rotating' ? schedule.sequence : schedule.days.flatMap((d) => d.workoutIds));
  const workouts = template.workouts.filter((w) => scheduled.has(w.id));
  const gear = gearForSchedule(template.workouts, schedule);

  // "Today or next Monday" (spec 2.5), or next Sunday when weeks start on Sunday.
  const weekStart = nextWeekStart(today, weekStartsOn);

  const use = () => {
    if (starting.current || savePlan.isPending) return;
    starting.current = true;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `Start ${template.name}`,
        message: 'It becomes your own plan. Changing it later never affects the template.',
        options: ['Start today', `Start ${formatShortDate(weekStart)}`, 'Cancel'],
        cancelButtonIndex: 2,
        userInterfaceStyle: scheme,
      },
      async (i) => {
        try {
          if (i > 1) return;
          const plan = planFromTemplate(template, i === 0 ? today : weekStart, { daysPerWeek: option.daysPerWeek });
          if (!(await succeeded(savePlan.mutateAsync(plan)))) return;
          notePlanScheduled();
          router.replace({ pathname: '/plans/plan', params: { id: plan.id } });
          toast.show({ message: `${template.name} added to your plans.`, tone: 'success' });
        } finally {
          starting.current = false;
        }
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: template.name }} />
      <ScrollView contentContainerStyle={[styles.content, readable]}>
        <View style={styles.header}>
          <View style={[styles.category, { backgroundColor: colors.accentSubtle }]}>
            <AppText variant="caption" weight="800" tone="accent" maxFontSizeMultiplier={DENSE_TEXT_MAX}>
              {CATEGORY_LABEL[template.category].toUpperCase()}
            </AppText>
          </View>
          <AppText variant="title1" accessibilityRole="header">
            {template.name}
          </AppText>
          <AppText variant="body" tone="secondary">
            {template.description}
          </AppText>
          <AppText variant="footnote" weight="600" numeric>
            {templateMeta(template, option)}
          </AppText>
          {/* Bodyweight programs list ['bodyweight'], so this reads "Equipment: Bodyweight". */}
          <AppText variant="footnote" tone="secondary">
            {`Equipment: ${template.equipment.map((e) => EQUIPMENT_LABEL[e]).join(', ')}`}
          </AppText>
          {gear.length > 0 && (
            <AppText variant="footnote" tone="secondary">
              {`Also needs ${gearList(gear)}`}
            </AppText>
          )}
        </View>

        {options.length > 1 && (
          <View style={styles.section}>
            <SectionHeader title="Days a week" />
            <SegmentedControl
              label="Days a week"
              options={options.map((o) => ({ value: String(o.daysPerWeek), label: plural(o.daysPerWeek, 'day') }))}
              value={String(option.daysPerWeek)}
              onChange={(value) => setDays(Number(value))}
            />
          </View>
        )}

        <View style={styles.section}>
          <SectionHeader title={`Schedule · ${PLAN_TYPE_LABEL[schedule.type]}`} />
          <Card>
            <View style={styles.stack}>
              <ScheduleGrid schedule={schedule} workouts={workouts} />
              <AppText variant="footnote" tone="secondary">
                {describeSchedule(schedule)}
              </AppText>
            </View>
          </Card>
        </View>

        {workouts.map((w) => (
          <View key={w.id} style={styles.section}>
            <SectionHeader title={[w.name, workoutDays({ ...template, schedule }, w.id, false, weekStartsOn)].filter(Boolean).join(' · ')} />
            <Card padding="none">
              {w.blocks.flatMap((b) =>
                b.exercises.map((pe, i) => {
                  const name = exerciseName(exercisesById, pe.exerciseId);
                  const sets = (
                    <AppText variant="footnote" tone="secondary" numeric style={large ? undefined : styles.shrink}>
                      {prescriptionSummary(pe).split(' · ')[0]}
                    </AppText>
                  );
                  return (
                    <View
                      key={pe.id}
                      accessible
                      accessibilityLabel={`${GROUP_SPOKEN[b.type]}${name}, ${spokenPrescription(pe).split(', ')[0]}`}
                      style={[styles.line, { borderTopColor: colors.border, borderTopWidth: i === 0 && b === w.blocks[0] ? 0 : StyleSheet.hairlineWidth }]}
                    >
                      {b.type !== 'single' && <Icon name="arrow.left.arrow.right" color={colors.accentText} size={12} />}
                      {/* Large text: the sets and reps go under the name instead of squeezing it. */}
                      <View style={styles.flex}>
                        <AppText variant="body" numberOfLines={large ? undefined : 2}>
                          {name}
                        </AppText>
                        {large && sets}
                      </View>
                      {!large && sets}
                    </View>
                  );
                }),
              )}
            </Card>
          </View>
        ))}
        <Button title="Use this template" icon="plus" fullWidth loading={savePlan.isPending} onPress={use} />
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
  shrink: {
    flexShrink: 1,
    textAlign: 'right',
  },
});

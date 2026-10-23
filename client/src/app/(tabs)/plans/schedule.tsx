import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActionSheetIOS, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, Icon, SectionHeader, Stepper } from '@/components/ui';
import { usePlans, useSavePlan } from '@/data/hooks';
import { weekPattern } from '@/data/schedule';
import type { Plan, Weekday } from '@/data/types';
import { ReorderList } from '@/features/workout/ReorderList';
import { ALL_WEEKDAYS, WEEKDAY_SHORT } from '@/features/plans/describe';
import { setProgramWeeks, setSequence, toggleWeekday } from '@/features/plans/planEdits';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/** Edit when a plan's workouts happen. Saves immediately; the calendar updates from today forward. */
export default function ScheduleScreen() {
  const { plan: planId } = useLocalSearchParams<{ plan: string }>();
  const { data: plans } = usePlans();
  const savePlan = useSavePlan();
  const [dragging, setDragging] = useState(false);
  const plan = plans?.find((p) => p.id === planId);

  if (!plan) {
    return (
      <View style={styles.center}>
        <EmptyState icon="calendar" title="Plan not found" message="It may have been deleted." actionLabel="Back" onAction={() => router.back()} />
      </View>
    );
  }

  const save = (next: Plan) => savePlan.mutate(next);

  return (
    <ScrollView contentContainerStyle={styles.content} scrollEnabled={!dragging}>
      <AppText variant="subhead" tone="secondary" style={styles.intro}>
        Changes apply from today forward. Days you've already logged stay as they were.
      </AppText>
      {plan.schedule.type === 'rotating' ? <CycleEditor plan={plan} save={save} onDraggingChange={setDragging} /> : <WeekEditor plan={plan} save={save} />}
    </ScrollView>
  );
}

function WeekEditor({ plan, save }: { plan: Plan; save: (p: Plan) => void }) {
  const { colors, scheme } = useAppTheme();
  const pattern = weekPattern(plan.schedule);
  const names = new Map(plan.workouts.map((w) => [w.id, w.name]));

  const addTo = (weekday: Weekday) => {
    const options = plan.workouts.filter((w) => !pattern[weekday].includes(w.id));
    if (!options.length) return;
    ActionSheetIOS.showActionSheetWithOptions(
      { title: `Add to ${WEEKDAY_SHORT[weekday]}`, options: [...options.map((w) => w.name), 'Cancel'], cancelButtonIndex: options.length, userInterfaceStyle: scheme },
      (i) => i < options.length && save(toggleWeekday(plan, weekday, options[i].id)),
    );
  };

  return (
    <View style={styles.section}>
      {plan.schedule.type === 'fixed' && (
        <Card>
          <View style={styles.inline}>
            <View style={styles.flex}>
              <AppText variant="body">Program length</AppText>
              <AppText variant="footnote" tone="secondary">
                Every week follows the pattern below.
              </AppText>
            </View>
            <Stepper label="Program length in weeks" value={plan.schedule.weeks} onChange={(w) => save(setProgramWeeks(plan, w))} min={1} max={52} unit="wk" />
          </View>
        </Card>
      )}
      <SectionHeader title="Days" />
      <Card padding="none">
        {ALL_WEEKDAYS.map((weekday, i) => (
          <View key={weekday} style={[styles.dayRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <AppText variant="headline" style={styles.dayLabel}>
              {WEEKDAY_SHORT[weekday]}
            </AppText>
            <View style={styles.chips}>
              {pattern[weekday].map((id) => (
                <Pressable
                  key={id}
                  onPress={() => save(toggleWeekday(plan, weekday, id))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${names.get(id)} from ${WEEKDAY_SHORT[weekday]}`}
                  style={[styles.chip, { backgroundColor: colors.accent }]}
                >
                  <AppText variant="footnote" weight="700" tone="onAccent">
                    {names.get(id)}
                  </AppText>
                  <Icon name="xmark" color={colors.onAccent} size={10} weight="bold" />
                </Pressable>
              ))}
              {!pattern[weekday].length && (
                <AppText variant="subhead" tone="tertiary">
                  Rest
                </AppText>
              )}
            </View>
            <Pressable onPress={() => addTo(weekday)} accessibilityRole="button" accessibilityLabel={`Add a workout to ${WEEKDAY_SHORT[weekday]}`} hitSlop={8} style={[styles.add, { backgroundColor: colors.accentSubtle }]}>
              <Icon name="plus" color={colors.accentText} size={14} weight="bold" />
            </Pressable>
          </View>
        ))}
      </Card>
    </View>
  );
}

function CycleEditor({ plan, save, onDraggingChange }: { plan: Plan; save: (p: Plan) => void; onDraggingChange: (dragging: boolean) => void }) {
  const { scheme } = useAppTheme();
  const sequence = plan.schedule.type === 'rotating' ? plan.schedule.sequence : [];
  const names = new Map(plan.workouts.map((w) => [w.id, w.name]));

  const onMove = useCallback(
    (from: number, to: number) => {
      const next = [...sequence];
      const [step] = next.splice(from, 1);
      next.splice(to, 0, step);
      save(setSequence(plan, next));
    },
    [sequence, plan, save],
  );

  const addWorkout = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title: 'Add a workout day', options: [...plan.workouts.map((w) => w.name), 'Cancel'], cancelButtonIndex: plan.workouts.length, userInterfaceStyle: scheme },
      (i) => i < plan.workouts.length && save(setSequence(plan, [...sequence, plan.workouts[i].id])),
    );

  return (
    <View style={styles.section}>
      <SectionHeader title={`Cycle · ${sequence.length} days, then repeats`} />
      <ReorderList
        items={sequence.map((s, i) => ({ id: `${i}`, title: `Day ${i + 1} · ${s === 'rest' ? 'Rest' : (names.get(s) ?? 'Workout')}`, subtitle: s === 'rest' ? 'Recovery' : undefined }))}
        onMove={onMove}
        onDraggingChange={onDraggingChange}
      />
      <View style={styles.buttons}>
        <Button title="Add workout day" variant="secondary" size="sm" icon="plus" onPress={addWorkout} />
        <Button title="Add rest day" variant="ghost" size="sm" icon="bed.double" onPress={() => save(setSequence(plan, [...sequence, 'rest']))} />
        {sequence.length > 1 && <Button title="Remove last day" variant="ghost" size="sm" icon="minus" onPress={() => save(setSequence(plan, sequence.slice(0, -1)))} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.md,
  },
  intro: {
    paddingHorizontal: spacing.xs,
  },
  section: {
    gap: spacing.sm,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    minHeight: 54,
  },
  dayLabel: {
    width: 40,
  },
  chips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
  },
  add: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
});

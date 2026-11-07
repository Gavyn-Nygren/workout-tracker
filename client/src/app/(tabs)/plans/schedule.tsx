import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, ErrorState, Icon, NotFoundState, ScreenSkeleton, SectionHeader, Stepper } from '@/components/ui';
import { useToday } from '@/data/DataProvider';
import { useOccurrences, usePlan, usePlanShifts, usePreferences, useSavePlan } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import { cycleSteps, weekPattern } from '@/data/schedule';
import type { ID, Plan, PlanShift, PlanWorkout, ScheduledOccurrence, Weekday } from '@/data/types';
import { ReorderList } from '@/features/workout/ReorderList';
import { plural, WEEKDAY_LONG, WEEKDAY_SHORT, weekdayOrder } from '@/lib/format';
import { addDayPrompt, cycleDayNames, cycleDaySubtitle, cycleDayTitle, deleteDayPrompt, nameList } from '@/features/plans/cycleLabels';
import { addCycleDay, deleteCycleDay, moveCycleDay, setProgramWeeks, toggleCycleWorkout, toggleWeekday } from '@/features/plans/planEdits';
import { cycleDaysToday, shiftsOf } from '@/features/plans/position';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { readable, useTextScale } from '@/theme/layout';

/** Edit when a plan's workouts happen. Saves immediately; the calendar updates from today forward. */
export default function ScheduleScreen() {
  const { plan: planId } = useLocalSearchParams<{ plan: string }>();
  const planQuery = usePlan(planId);
  const savePlan = useSavePlan();
  const [dragging, setDragging] = useState(false);

  if (planQuery.error) return <ErrorState fill title="Couldn't load this plan" onRetry={() => planQuery.refetch()} />;
  if (planQuery.isPending) return <ScreenSkeleton />;
  const plan = planQuery.data;
  if (!plan) return <NotFoundState thing="Plan" icon="calendar" />;

  const save = (next: Plan) => savePlan.mutate(next);
  // One edit at a time: each starts from the plan as shown, so one made while another saves would
  // undo it (as on the plan screen). Checked when an edit starts, not when a sheet or alert is
  // answered, which can come after the save is done.
  const busy = savePlan.isPending;

  return (
    <ScrollView contentContainerStyle={[styles.content, readable]} scrollEnabled={!dragging}>
      <AppText variant="subhead" tone="secondary" style={styles.intro}>
        Changes apply from today forward. Days you've already logged stay as they were.
      </AppText>
      {!plan.workouts.length ? (
        // Nothing to put on a day yet: every "+" would open an empty menu.
        <Card>
          <EmptyState icon="dumbbell" title="No workouts to schedule" message="Add a workout to this plan first, then choose the days it happens here." actionLabel="Back to plan" onAction={() => router.back()} />
        </Card>
      ) : plan.schedule.type === 'rotating' ? (
        <CycleEditor plan={plan} save={save} busy={busy} onDraggingChange={setDragging} />
      ) : (
        <WeekEditor plan={plan} save={save} busy={busy} />
      )}
    </ScrollView>
  );
}

type EditorProps = { plan: Plan; save: (p: Plan) => void; busy: boolean };

const NO_SHIFTS: PlanShift[] = [];
const NO_OCCURRENCES: ScheduledOccurrence[] = [];

/** `edit`, or nothing while a save is in flight (see `busy` in ScheduleScreen). */
const unlessBusy =
  <A extends unknown[]>(busy: boolean, edit: (...args: A) => void) =>
  (...args: A) => {
    if (!busy) edit(...args);
  };

function WeekEditor({ plan, save, busy }: EditorProps) {
  const { scheme } = useAppTheme();
  const { large } = useTextScale();
  const weekStartsOn = usePreferences().data?.weekStartsOn ?? defaultPreferences.weekStartsOn;
  const pattern = weekPattern(plan.schedule);
  const names = new Map(plan.workouts.map((w) => [w.id, w.name]));

  const addTo = (weekday: Weekday, options: PlanWorkout[]) =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title: `Add to ${WEEKDAY_LONG[weekday]}`, options: [...options.map((w) => w.name), 'Cancel'], cancelButtonIndex: options.length, userInterfaceStyle: scheme },
      (i) => i < options.length && save(toggleWeekday(plan, weekday, options[i].id)),
    );

  return (
    <View style={styles.section}>
      {plan.schedule.type === 'fixed' && (
        <Card>
          {/* Large text: the label sits above the stepper so neither gets squeezed. */}
          <View style={large ? styles.stacked : styles.inline}>
            <View style={large ? undefined : styles.flex}>
              <AppText variant="body">Program length</AppText>
              <AppText variant="footnote" tone="secondary">
                Every week follows the pattern below.
              </AppText>
            </View>
            <Stepper
              label="Program length"
              value={plan.schedule.weeks}
              onChange={unlessBusy(busy, (w: number) => save(setProgramWeeks(plan, w)))}
              min={1}
              max={52}
              unit="wk"
              spokenValue={(v) => plural(v, 'week')}
            />
          </View>
        </Card>
      )}
      <SectionHeader title="Days" />
      <Card padding="none">
        {weekdayOrder(weekStartsOn).map((weekday, i) => {
          const options = notOn(plan, pattern[weekday]);
          return (
            <DayRow
              key={weekday}
              title={WEEKDAY_SHORT[weekday]}
              spokenName={WEEKDAY_LONG[weekday]}
              ids={pattern[weekday]}
              names={names}
              first={i === 0}
              onRemove={unlessBusy(busy, (id: ID) => save(toggleWeekday(plan, weekday, id)))}
              onAdd={options.length ? unlessBusy(busy, () => addTo(weekday, options)) : undefined}
            />
          );
        })}
      </Card>
    </View>
  );
}

/** The plan's workouts that aren't on a day yet: what its "+" can add. */
const notOn = (plan: Plan, ids: readonly ID[]) => plan.workouts.filter((w) => !ids.includes(w.id));

type DayRowProps = {
  /** Shown at the start of the row: "Mon" or "Day 1". */
  title: string;
  /** The day as spoken: "Monday" or "Day 1". */
  spokenName: string;
  ids: readonly ID[];
  names: ReadonlyMap<ID, string>;
  first: boolean;
  onRemove: (id: ID) => void;
  /** Left out when every workout is already on the day, so there's no "+" that does nothing. */
  onAdd?: () => void;
};

/** One day of the week or the cycle: its workouts as chips (tap to take one off) and a "+" to add one. */
function DayRow({ title, spokenName, ids, names, first, onRemove, onAdd }: DayRowProps) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const border = !first && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth };
  const rest = !ids.length;
  // Tabular digits, so "Day 1" to "Day 9" line their chips up.
  const label = (
    <AppText variant="headline" numeric style={large ? styles.flex : styles.dayLabel} accessibilityLabel={`${spokenName}${rest ? ', rest' : ''}`}>
      {title}
    </AppText>
  );
  const chips = (
    <View style={large ? styles.chipsWrap : styles.chips}>
      {ids.map((id) => (
        <Pressable
          key={id}
          onPress={() => onRemove(id)}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${names.get(id) ?? 'workout'} from ${spokenName}`}
          style={[styles.chip, { backgroundColor: colors.accent }]}
        >
          <AppText variant="footnote" weight="700" tone="onAccent" style={styles.shrink}>
            {names.get(id) ?? 'Workout'}
          </AppText>
          <Icon name="xmark" color={colors.onAccent} size={10} weight="bold" />
        </Pressable>
      ))}
      {/* Already in the day's spoken label. */}
      {rest && (
        <AppText variant="subhead" tone="secondary" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          Rest
        </AppText>
      )}
    </View>
  );
  const add = onAdd && (
    <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={`Add a workout to ${spokenName}`} hitSlop={8} style={[styles.add, { backgroundColor: colors.accentSubtle }]}>
      <Icon name="plus" color={colors.accentText} size={14} weight="bold" />
    </Pressable>
  );
  // Large text: the day and its "+" on one line, that day's workouts wrapping under them.
  return large ? (
    <View style={[styles.dayRowStacked, border]}>
      <View style={styles.inline}>
        {label}
        {add}
      </View>
      {chips}
    </View>
  ) : (
    <View style={[styles.dayRow, border]}>
      {label}
      {chips}
      {add}
    </View>
  );
}

/**
 * The cycle as day rows like the week's (owner's pick), each with its workouts and a "+". "Reorder"
 * swaps the rows for a drag list, where a day can also be deleted from anywhere in the cycle.
 */
function CycleEditor({ plan, save, busy, onDraggingChange }: EditorProps & { onDraggingChange: (dragging: boolean) => void }) {
  const { scheme } = useAppTheme();
  const today = useToday();
  // Where the cycle is today, as the plan screen reads it. Not waited for: until they load, today's date alone.
  const shifts = usePlanShifts().data ?? NO_SHIFTS;
  const todays = useOccurrences({ from: today, to: today }).data ?? NO_OCCURRENCES;
  const [reordering, setReordering] = useState(false);
  const steps = plan.schedule.type === 'rotating' ? cycleSteps(plan.schedule) : [];
  const names = new Map(plan.workouts.map((w) => [w.id, w.name]));

  // False while a save is in flight, so VoiceOver isn't told the day moved.
  const onMove = useCallback(
    (from: number, to: number) => {
      if (busy) return false;
      save(moveCycleDay(plan, from, to));
      return true;
    },
    [busy, plan, save],
  );

  const pick = (title: string, options: PlanWorkout[], onPick: (id: ID) => void) =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: [...options.map((w) => w.name), 'Cancel'], cancelButtonIndex: options.length, userInterfaceStyle: scheme },
      (i) => i < options.length && onPick(options[i].id),
    );

  // A longer cycle can change today and the days after it, so that asks first, like a delete.
  const addDay = (workoutIds: ID[]) => {
    const daysToday = cycleDaysToday(plan.schedule, plan.startDate, today, shiftsOf(plan.id, shifts), todays.filter((o) => o.planId === plan.id));
    const prompt = addDayPrompt(steps.length, daysToday);
    if (!prompt) return save(addCycleDay(plan, workoutIds));
    Alert.alert(prompt.title, prompt.message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add', onPress: () => save(addCycleDay(plan, workoutIds)) },
    ]);
  };

  const confirmDelete = (index: number) => {
    const { title, message } = deleteDayPrompt(steps, index, names);
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => save(deleteCycleDay(plan, index)) },
    ]);
  };

  // Each row's id follows its day, not its place, so VoiceOver stays on a day it moves (two
  // identical days can trade ids, which reads the same).
  const seen = new Map<string, number>();
  const reorderItems = steps.map((step, i) => {
    const dayNames = cycleDayNames(step, names);
    const base = step.workoutIds.join('+') || 'rest';
    const repeat = seen.get(base) ?? 0;
    seen.set(base, repeat + 1);
    return { id: `${base}#${repeat}`, title: cycleDayTitle(dayNames), subtitle: cycleDaySubtitle(i, dayNames.length), accessibilityLabel: dayNames.length > 1 ? nameList(dayNames) : undefined };
  });

  // Leaving Reorder also turns scrolling back on, in case a drag never reported its end.
  const toggleReorder = () => {
    if (reordering) onDraggingChange(false);
    setReordering(!reordering);
  };

  return (
    <View style={styles.section}>
      <SectionHeader
        title={`Cycle · ${plural(steps.length, 'day')}, then repeats`}
        // A one-day cycle has nothing to move or delete.
        actionLabel={reordering ? 'Done' : steps.length > 1 ? 'Reorder' : undefined}
        actionAccessibilityLabel={reordering ? 'Done reordering' : 'Reorder days'}
        onAction={toggleReorder}
      />
      {reordering ? (
        // The workouts lead and the day number moves to the subtitle, so long names fit the fixed-height rows.
        <ReorderList
          items={reorderItems}
          onMove={onMove}
          onDraggingChange={onDraggingChange}
          // The last day left can't go: a cycle needs one.
          onDelete={steps.length > 1 ? unlessBusy(busy, confirmDelete) : undefined}
        />
      ) : (
        <Card padding="none">
          {steps.length ? (
            steps.map((step, i) => {
              const options = notOn(plan, step.workoutIds);
              return (
                <DayRow
                  key={i}
                  title={`Day ${i + 1}`}
                  spokenName={`Day ${i + 1}`}
                  ids={step.workoutIds}
                  names={names}
                  first={i === 0}
                  onRemove={unlessBusy(busy, (id: ID) => save(toggleCycleWorkout(plan, i, id)))}
                  onAdd={options.length ? unlessBusy(busy, () => pick(`Add to Day ${i + 1}`, options, (id) => save(toggleCycleWorkout(plan, i, id)))) : undefined}
                />
              );
            })
          ) : (
            <AppText variant="subhead" tone="secondary" style={styles.emptyCycle}>
              No days yet. Add a workout day below.
            </AppText>
          )}
        </Card>
      )}
      <View style={styles.buttons}>
        <Button title="Add workout day" variant="secondary" size="sm" icon="plus" onPress={unlessBusy(busy, () => pick('Add a workout day', plan.workouts, (id) => addDay([id])))} />
        <Button title="Add rest day" variant="ghost" size="sm" icon="bed.double" onPress={unlessBusy(busy, () => addDay([]))} />
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
  dayRowStacked: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  // A minimum, not a fixed width, so "Wed" never breaks into "We / d" at bigger text sizes.
  dayLabel: {
    minWidth: 40,
  },
  chips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  stacked: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  shrink: {
    flexShrink: 1,
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
  emptyCycle: {
    padding: spacing.lg,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});

import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, ErrorState, NotFoundState, NumberField, SegmentedControl, Skeleton, ToastViewport, useToast } from '@/components/ui';
import { useToday } from '@/data/DataProvider';
import { addDays, fromISODate, toISODate } from '@/data/dates';
import { succeeded, useBodyweight, useGoals, usePreferences, useSaveBodyweight, useUpdateBodyweight } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { BodyweightEntry, Goal, ISODate, UnitSystem } from '@/data/types';
import { bigChangeFrom, BODYWEIGHT_PLACEHOLDER, replacedOn } from '@/features/progress/bodyweight';
import {
  bigChangeMessage,
  canSaveWeight,
  dateForChoice,
  dayChoiceOf,
  replaceQuestion,
  replacesHint,
  rollDayChoice,
  weighInChange,
  weightForField,
  weightFromField,
  weightProblem,
  type DayChoice,
} from '@/features/progress/logWeight';
import { goalReachedMessage, goalsReachedByNewWeighIn } from '@/features/summary/goalsReached';
import { useHaptics } from '@/hooks/useHaptics';
import { formatLongDate, formatShortDateYear, unitLabel } from '@/lib/format';
import { newId } from '@/lib/id';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/**
 * Manual bodyweight entry (spec 2.6: bodyweight is entered by hand in V1), for today, yesterday, or
 * an earlier day. With `entry` it fixes that weigh-in instead (Bodyweight screen: tap a weigh-in).
 * One weigh-in per day: saving onto a day that has one replaces it. A typo guard keeps Save off
 * outside a plausible weight and asks before saving one more than 10% from the weigh-in before it.
 */
export default function LogWeightSheet() {
  const { colors } = useAppTheme();
  const { entry: entryId } = useLocalSearchParams<{ entry?: string }>();
  const preferences = usePreferences();
  const bodyweight = useBodyweight();
  // For "Goal reached" after saving; a failed read only skips that.
  const goals = useGoals();

  if (bodyweight.error) return <ErrorState fill title="Couldn't load your weigh-ins" onRetry={() => bodyweight.refetch()} />;
  // Wait for entries and units so the prefilled weight and the "replaces" hint are right.
  if (bodyweight.isLoading || preferences.isLoading || goals.isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.cardElevated }]} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
        <AppText variant="title2">{entryId ? 'Edit weigh-in' : 'Log bodyweight'}</AppText>
        <Skeleton width={150} height={44} radius={radius.md} />
        <Skeleton height={36} radius={radius.sm} />
        <Skeleton width="80%" height={14} />
        <Skeleton height={50} radius={radius.md} />
      </View>
    );
  }
  const entries = bodyweight.data ?? [];
  const editing = entryId ? entries.find((e) => e.id === entryId) : undefined;
  if (entryId && !editing) return <NotFoundState thing="Weigh-in" icon="scalemass" backLabel="Close" />;
  const { units, celebrations } = preferences.data ?? defaultPreferences;
  return <LogWeightForm key={editing?.id ?? 'new'} entries={entries} editing={editing} goals={goals.data ?? []} units={units} celebrations={celebrations} />;
}

/** An alert with Cancel and one action; resolves true when the action is chosen. */
function ask(title: string, message: string, action: string, destructive = false): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: action, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

type FormProps = { entries: BodyweightEntry[]; editing?: BodyweightEntry; goals: Goal[]; units: UnitSystem; celebrations: boolean };

function LogWeightForm({ entries, editing, goals, units, celebrations }: FormProps) {
  const { colors, scheme } = useAppTheme();
  const toast = useToast();
  const haptics = useHaptics();
  const today = useToday();
  const save = useSaveBodyweight();
  const update = useUpdateBodyweight();
  const pending = save.isPending || update.isPending;

  const latest = useMemo(() => entries.reduce<BodyweightEntry | undefined>((last, e) => (!last || e.date > last.date ? e : last), undefined), [entries]);
  const start = editing ?? latest;
  const [value, setValue] = useState<number | undefined>(start ? weightForField(start.weightKg, units) : undefined);
  const [choice, setChoice] = useState<DayChoice>(dayChoiceOf(editing?.date ?? today, today));
  // The date picker's day: the weigh-in's own day when fixing an older one, else the day before yesterday.
  const [picked, setPicked] = useState<ISODate>(editing && dayChoiceOf(editing.date, today) === 'other' ? editing.date : addDays(today, -2));
  // Fixing a weigh-in with the sheet left open past midnight: keep its date, relabelled for the new
  // day (Today becomes Yesterday), so Save doesn't move it. A new weigh-in's "Today" means the day
  // it's saved.
  const [shownToday, setShownToday] = useState(today);
  if (shownToday !== today) {
    setShownToday(today);
    if (editing) {
      const rolled = rollDayChoice(choice, picked, shownToday, today);
      setChoice(rolled.choice);
      setPicked(rolled.picked);
    }
  }
  const date = dateForChoice(choice, picked, today);
  const replaced = replacedOn(entries, date, editing?.id);
  // VoiceOver's hint for Save always says why it's off; the line under the field waits until
  // typing ends for a weight that's still too small (typing 180 passes through 1 and 18).
  const problem = weightProblem(value, units);
  const [typing, setTyping] = useState(false);
  const shownProblem = weightProblem(value, units, { editing: typing });
  const endOfToday = useMemo(() => {
    const d = fromISODate(today);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [today]);

  const submit = async () => {
    if (value === undefined || !canSaveWeight(value, units) || pending) return;
    const change = editing ? weighInChange(editing, { date, value }, units) : undefined;
    if (editing && change && change.date === undefined && change.weightKg === undefined) {
      router.back();
      return;
    }
    const weightKg = change && change.weightKg === undefined && editing ? editing.weightKg : weightFromField(value, units);

    // Typo guard: a typed weight far from the weigh-in before it. Moving a weigh-in to another day
    // without changing it isn't a typo, so it doesn't ask.
    const typed = !editing || change?.weightKg !== undefined;
    const big = typed ? bigChangeFrom(entries, { date, weightKg, id: editing?.id }) : undefined;
    if (big && !(await ask('Save anyway?', bigChangeMessage(big, units, today), 'Save'))) return;
    // Moving a weigh-in onto a day that has one replaces it: say so first.
    if (editing && replaced) {
      const question = replaceQuestion(replaced, units, today);
      if (!(await ask(question.title, question.message, 'Replace', true))) return;
    }

    const now = new Date().toISOString();
    const saved: BodyweightEntry = editing ? { ...editing, date, weightKg, updatedAt: now } : { id: newId('bw'), date, weightKg, createdAt: now, updatedAt: now };
    // Bodyweight goals this weigh-in reaches, measured against the weigh-ins from before it.
    const reached = goalsReachedByNewWeighIn(goals, entries, saved, today);
    const write = editing && change ? update.mutateAsync({ entryId: editing.id, change }) : save.mutateAsync(saved);
    if (!(await succeeded(write))) return;
    router.back();
    if (reached.length) {
      if (celebrations) haptics.success();
      toast.show({ message: goalReachedMessage(reached), tone: 'success', icon: 'target' });
    } else {
      toast.show({ message: editing ? 'Weigh-in updated.' : `Logged ${value} ${unitLabel(units)} for ${formatShortDateYear(date, today)}.`, tone: 'success' });
    }
  };

  return (
    // Scrolls, so Save stays reachable at large text sizes. The ScrollView is the sheet's first view (see sheet() in _layout.tsx).
    <>
      <ScrollView
        style={{ backgroundColor: colors.cardElevated }}
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        onAccessibilityEscape={() => router.back()}
      >
        <AppText variant="title2" accessibilityRole="header">
          {editing ? 'Edit weigh-in' : 'Log bodyweight'}
        </AppText>
        <View style={styles.field}>
          <NumberField
            label="Bodyweight"
            value={value}
            onChange={setValue}
            onFocusChange={setTyping}
            unit={unitLabel(units)}
            decimal
            width={150}
            placeholder={String(BODYWEIGHT_PLACEHOLDER[units])}
          />
          {shownProblem && (
            <AppText variant="footnote" tone="error">
              {shownProblem}
            </AppText>
          )}
        </View>
        <SegmentedControl
          label="Date"
          options={[
            { value: 'today', label: 'Today', accessibilityLabel: `Today, ${formatLongDate(today)}` },
            { value: 'yesterday', label: 'Yesterday' },
            { value: 'other', label: 'Other date…', accessibilityLabel: 'Other date' },
          ]}
          value={choice}
          onChange={setChoice}
        />
        {choice === 'other' && (
          <View style={styles.dateRow}>
            <AppText variant="body" style={styles.flex}>
              Date
            </AppText>
            <DateTimePicker
              value={fromISODate(picked)}
              mode="date"
              display="compact"
              maximumDate={endOfToday}
              themeVariant={scheme}
              accentColor={colors.accentText}
              accessibilityLabel="Date"
              onValueChange={(_, day) => setPicked(dateForChoice('other', toISODate(day), today))}
            />
          </View>
        )}
        <AppText variant="footnote" tone="secondary">
          {replaced ? replacesHint(replaced, units) : 'Weigh in at a similar time each day for the steadiest trend.'}
        </AppText>
        <Button
          title="Save"
          fullWidth
          disabled={!canSaveWeight(value, units)}
          loading={pending}
          onPress={submit}
          // VoiceOver: why Save is off.
          accessibilityHint={problem ?? (value === undefined ? 'Enter your weight first.' : undefined)}
        />
      </ScrollView>
      <ToastViewport bottomOffset={spacing.lg} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.lg,
  },
  field: {
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
});

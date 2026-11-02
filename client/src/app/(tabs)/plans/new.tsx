import type { SFSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, View, type ViewInstance } from 'react-native';

import { AppText, Button, Card, Chip, Icon, PressableScale, SectionHeader, SegmentedControl, Stepper, TextField } from '@/components/ui';
import { useToday } from '@/data/DataProvider';
import { succeeded, usePreferences, useSavePlan } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { PlanSchedule, Weekday } from '@/data/types';
import { formatLongDate, formatShortDate, plural, WEEKDAY_LONG, WEEKDAY_SHORT, weekdayOrder } from '@/lib/format';
import { notePlanScheduled } from '@/features/notifications/planOfferStore';
import { newPlan, nextWeekStart } from '@/features/plans/planEdits';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { readable, useTextScale } from '@/theme/layout';

type PlanType = PlanSchedule['type'];

const TYPES: { type: PlanType; title: string; body: string; icon: SFSymbol }[] = [
  { type: 'weekly', title: 'Weekly', body: 'Workouts on set weekdays, repeating every week. Most splits work this way.', icon: 'calendar' },
  { type: 'fixed', title: 'Fixed-length', body: 'A program with an end, like 12 weeks, usually with weekly progression.', icon: 'flag.checkered' },
  { type: 'rotating', title: 'Rotating', body: 'A cycle of workout and rest days that repeats regardless of weekday.', icon: 'arrow.triangle.2.circlepath' },
];

/** New plan setup (user's pick): type → name and start → days or cycle, then the plan editor. */
export default function NewPlanScreen() {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const today = useToday();
  const savePlan = useSavePlan();
  const weekStartsOn = usePreferences().data?.weekStartsOn ?? defaultPreferences.weekStartsOn;
  const [step, setStep] = useState(1);
  const [type, setType] = useState<PlanType>('weekly');
  const [name, setName] = useState('');
  const [start, setStart] = useState<'today' | 'weekStart'>('today');
  const [weekdays, setWeekdays] = useState<Weekday[]>([1, 3, 5]);
  const [weeks, setWeeks] = useState(8);
  const [cycle, setCycle] = useState<('workout' | 'rest')[]>(['workout', 'workout', 'rest']);

  // Each step replaces the screen's content, so VoiceOver focus moves to the new step's title.
  const titleRef = useRef<ViewInstance>(null);
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    const t = setTimeout(() => titleRef.current && AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus'), 100);
    return () => clearTimeout(t);
  }, [step]);

  // "Today or next Monday" (spec 2.5), or next Sunday when weeks start on Sunday.
  const weekStart = nextWeekStart(today, weekStartsOn);
  const startDate = start === 'today' ? today : weekStart;
  const canContinue = step === 1 || (step === 2 ? name.trim().length > 0 : type === 'rotating' ? cycle.includes('workout') : weekdays.length > 0);

  const create = async () => {
    if (savePlan.isPending) return;
    const plan = newPlan({ name, startDate, type, weekdays, weeks, cycle, weekStartsOn });
    if (!(await succeeded(savePlan.mutateAsync(plan)))) return;
    notePlanScheduled();
    router.replace({ pathname: '/plans/plan', params: { id: plan.id } });
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, readable]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <View
        style={styles.progress}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="New plan setup"
        accessibilityValue={{ min: 1, max: 3, now: step, text: `Step ${step} of 3` }}
      >
        {[1, 2, 3].map((s) => (
          <View key={s} style={[styles.progressBar, { backgroundColor: s <= step ? colors.accentText : colors.input }]} />
        ))}
      </View>

      {step === 1 && (
        <View style={styles.section}>
          <StepTitle title="What kind of plan?" focusRef={titleRef} />
          {TYPES.map((t) => {
            const selected = type === t.type;
            return (
              <PressableScale key={t.type} onPress={() => setType(t.type)} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`${t.title}. ${t.body}`}>
                <Card style={selected ? { borderColor: colors.accentText, borderWidth: 2 } : undefined}>
                  <View style={styles.typeRow}>
                    <View style={[styles.iconWell, { backgroundColor: selected ? colors.accent : colors.accentSubtle }]}>
                      <Icon name={t.icon} color={selected ? colors.onAccent : colors.accentText} size={20} />
                    </View>
                    <View style={styles.flex}>
                      <AppText variant="headline">{t.title}</AppText>
                      <AppText variant="subhead" tone="secondary">
                        {t.body}
                      </AppText>
                    </View>
                    {selected && <Icon name="checkmark.circle.fill" color={colors.accentText} size={22} />}
                  </View>
                </Card>
              </PressableScale>
            );
          })}
          <Button title="Or start from a template" variant="ghost" icon="square.stack.3d.up" style={styles.centerSelf} onPress={() => router.replace({ pathname: '/plans', params: { segment: 'templates' } })} />
        </View>
      )}

      {step === 2 && (
        <View style={styles.section}>
          <StepTitle title="Name and start" focusRef={titleRef} />
          <TextField label="Plan name" value={name} onChangeText={setName} placeholder="e.g. Summer Strength" autoFocus returnKeyType="done" />
          <SectionHeader title="Starts" />
          <SegmentedControl
            label="Start date"
            options={[
              { value: 'today', label: 'Today' },
              { value: 'weekStart', label: formatShortDate(weekStart), accessibilityLabel: formatLongDate(weekStart) },
            ]}
            value={start}
            onChange={setStart}
          />
        </View>
      )}

      {step === 3 && type !== 'rotating' && (
        <View style={styles.section}>
          <StepTitle title="Which days do you train?" focusRef={titleRef} />
          <AppText variant="subhead" tone="secondary">
            You'll get one workout per day to fill in. Rename or reassign them later.
          </AppText>
          <View style={styles.wrap}>
            {weekdayOrder(weekStartsOn).map((d) => (
              <Chip
                key={d}
                label={WEEKDAY_SHORT[d]}
                accessibilityLabel={WEEKDAY_LONG[d]}
                selected={weekdays.includes(d)}
                onPress={() => setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))}
              />
            ))}
          </View>
          {type === 'fixed' && (
            <Card>
              {/* Large text: the label sits above the stepper so neither gets squeezed. */}
              <View style={large ? styles.stacked : styles.typeRow}>
                <AppText variant="body" style={large ? undefined : styles.flex}>
                  Program length
                </AppText>
                <Stepper label="Program length" value={weeks} onChange={setWeeks} min={1} max={52} unit="wk" spokenValue={(v) => plural(v, 'week')} />
              </View>
            </Card>
          )}
        </View>
      )}

      {step === 3 && type === 'rotating' && (
        <View style={styles.section}>
          <StepTitle title="Build the cycle" focusRef={titleRef} />
          <AppText variant="subhead" tone="secondary">
            The cycle repeats from your start date. Tap a day to remove it.
          </AppText>
          <View style={styles.wrap}>
            {cycle.map((s, i) => (
              // Tapping removes the day, so VoiceOver hears a button, not a checkbox.
              <Chip
                key={i}
                label={`${i + 1} · ${s === 'rest' ? 'Rest' : 'Workout'}`}
                role="button"
                accessibilityLabel={`Day ${i + 1}, ${s === 'rest' ? 'rest' : 'workout'}. Remove`}
                selected={s === 'workout'}
                onPress={() => setCycle((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
          </View>
          <View style={styles.wrap}>
            <Button title="Workout day" variant="secondary" size="sm" icon="plus" onPress={() => setCycle((c) => [...c, 'workout'])} />
            <Button title="Rest day" variant="ghost" size="sm" icon="plus" onPress={() => setCycle((c) => [...c, 'rest'])} />
          </View>
        </View>
      )}

      <View style={styles.footer}>
        {step > 1 && <Button title="Back" variant="ghost" onPress={() => setStep(step - 1)} />}
        <Button
          title={step < 3 ? 'Continue' : 'Create plan'}
          icon={step < 3 ? undefined : 'checkmark'}
          disabled={!canContinue}
          loading={savePlan.isPending}
          style={styles.flex}
          fullWidth
          onPress={() => (step < 3 ? setStep(step + 1) : create())}
        />
      </View>
    </ScrollView>
  );
}

/** A step's title: a VoiceOver heading that takes focus when the step appears. */
function StepTitle({ title, focusRef }: { title: string; focusRef: RefObject<ViewInstance | null> }) {
  return (
    <View ref={focusRef} accessible accessibilityRole="header" accessibilityLabel={title}>
      <AppText variant="title2">{title}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.xl,
  },
  progress: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
  },
  section: {
    gap: spacing.md,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stacked: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  centerSelf: {
    alignSelf: 'center',
  },
});

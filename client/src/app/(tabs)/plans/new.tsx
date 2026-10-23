import type { SFSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip, Icon, PressableScale, SectionHeader, SegmentedControl, Stepper, TextField } from '@/components/ui';
import { useRepository } from '@/data/DataProvider';
import { succeeded, useSavePlan } from '@/data/hooks';
import type { PlanSchedule, Weekday } from '@/data/types';
import { formatShortDate } from '@/lib/format';
import { ALL_WEEKDAYS, WEEKDAY_SHORT } from '@/features/plans/describe';
import { newPlan, nextMonday } from '@/features/plans/planEdits';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { readable } from '@/theme/layout';

type PlanType = PlanSchedule['type'];

const TYPES: { type: PlanType; title: string; body: string; icon: SFSymbol }[] = [
  { type: 'weekly', title: 'Weekly', body: 'Workouts on set weekdays, repeating every week. Most splits work this way.', icon: 'calendar' },
  { type: 'fixed', title: 'Fixed-length', body: 'A program with an end, like 12 weeks, usually with weekly progression.', icon: 'flag.checkered' },
  { type: 'rotating', title: 'Rotating', body: 'A cycle of workout and rest days that repeats regardless of weekday.', icon: 'arrow.triangle.2.circlepath' },
];

/** New plan setup (user's pick): type → name and start → days or cycle, then the plan editor. */
export default function NewPlanScreen() {
  const { colors } = useAppTheme();
  const today = useRepository().today();
  const savePlan = useSavePlan();
  const [step, setStep] = useState(1);
  const [type, setType] = useState<PlanType>('weekly');
  const [name, setName] = useState('');
  const [start, setStart] = useState<'today' | 'monday'>('today');
  const [weekdays, setWeekdays] = useState<Weekday[]>([1, 3, 5]);
  const [weeks, setWeeks] = useState(8);
  const [cycle, setCycle] = useState<('workout' | 'rest')[]>(['workout', 'workout', 'rest']);

  const startDate = start === 'today' ? today : nextMonday(today);
  const canContinue = step === 1 || (step === 2 ? name.trim().length > 0 : type === 'rotating' ? cycle.includes('workout') : weekdays.length > 0);

  const create = async () => {
    if (savePlan.isPending) return;
    const plan = newPlan({ name, startDate, type, weekdays, weeks, cycle });
    if (!(await succeeded(savePlan.mutateAsync(plan)))) return;
    router.replace({ pathname: '/plans/plan', params: { id: plan.id } });
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, readable]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <View style={styles.progress} accessibilityLabel={`Step ${step} of 3`}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={[styles.progressBar, { backgroundColor: s <= step ? colors.accentText : colors.input }]} />
        ))}
      </View>

      {step === 1 && (
        <View style={styles.section}>
          <AppText variant="title2">What kind of plan?</AppText>
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
          <AppText variant="title2">Name and start</AppText>
          <TextField label="Plan name" value={name} onChangeText={setName} placeholder="e.g. Summer Strength" autoFocus returnKeyType="done" />
          <SectionHeader title="Starts" />
          <SegmentedControl
            label="Start date"
            options={[
              { value: 'today', label: 'Today' },
              { value: 'monday', label: formatShortDate(nextMonday(today)) },
            ]}
            value={start}
            onChange={setStart}
          />
        </View>
      )}

      {step === 3 && type !== 'rotating' && (
        <View style={styles.section}>
          <AppText variant="title2">Which days do you train?</AppText>
          <AppText variant="subhead" tone="secondary">
            You'll get one workout per day to fill in. Rename or reassign them later.
          </AppText>
          <View style={styles.wrap}>
            {ALL_WEEKDAYS.map((d) => (
              <Chip key={d} label={WEEKDAY_SHORT[d]} selected={weekdays.includes(d)} onPress={() => setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))} />
            ))}
          </View>
          {type === 'fixed' && (
            <Card>
              <View style={styles.typeRow}>
                <AppText variant="body" style={styles.flex}>
                  Program length
                </AppText>
                <Stepper label="Program length in weeks" value={weeks} onChange={setWeeks} min={1} max={52} unit="wk" />
              </View>
            </Card>
          )}
        </View>
      )}

      {step === 3 && type === 'rotating' && (
        <View style={styles.section}>
          <AppText variant="title2">Build the cycle</AppText>
          <AppText variant="subhead" tone="secondary">
            The cycle repeats from your start date. Tap a day to remove it.
          </AppText>
          <View style={styles.wrap}>
            {cycle.map((s, i) => (
              <Chip key={i} label={`${i + 1} · ${s === 'rest' ? 'Rest' : 'Workout'}`} selected={s === 'workout'} onPress={() => setCycle((prev) => prev.filter((_, j) => j !== i))} />
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

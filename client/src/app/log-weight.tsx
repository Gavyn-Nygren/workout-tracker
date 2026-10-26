import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, ErrorState, NumberField, SegmentedControl, Skeleton, ToastViewport, useToast } from '@/components/ui';
import { useToday } from '@/data/DataProvider';
import { addDays } from '@/data/dates';
import { succeeded, useBodyweight, usePreferences, useSaveBodyweight } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { BodyweightEntry, UnitSystem } from '@/data/types';
import { kgToLb, lbToKg } from '@/data/units';
import { formatShortDate, unitLabel } from '@/lib/format';
import { newId } from '@/lib/id';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/** Manual bodyweight entry (spec 2.6: bodyweight is entered by hand in V1). */
export default function LogWeightSheet() {
  const { colors } = useAppTheme();
  const preferences = usePreferences();
  const bodyweight = useBodyweight();

  if (bodyweight.error) return <ErrorState fill title="Couldn't load your weigh-ins" onRetry={() => bodyweight.refetch()} />;
  // Wait for entries and units so the prefilled weight and the "replaces" hint are right.
  if (bodyweight.isLoading || preferences.isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.cardElevated }]} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
        <AppText variant="title2">Log bodyweight</AppText>
        <Skeleton width={150} height={44} radius={radius.md} />
        <Skeleton height={36} radius={radius.sm} />
        <Skeleton width="80%" height={14} />
        <Skeleton height={50} radius={radius.md} />
      </View>
    );
  }
  return <LogWeightForm entries={bodyweight.data ?? []} units={(preferences.data ?? defaultPreferences).units} />;
}

function LogWeightForm({ entries, units }: { entries: BodyweightEntry[]; units: UnitSystem }) {
  const { colors } = useAppTheme();
  const toast = useToast();
  const today = useToday();
  const save = useSaveBodyweight();

  const latest = [...entries].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const toDisplay = (kg: number) => Math.round((units === 'imperial' ? kgToLb(kg) : kg) * 10) / 10;
  const [value, setValue] = useState<number | undefined>(latest ? toDisplay(latest.weightKg) : undefined);
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const date = day === 'today' ? today : addDays(today, -1);
  const replaces = entries.some((e) => e.date === date);

  const submit = async () => {
    if (!value || save.isPending) return;
    const now = new Date().toISOString();
    const weightKg = units === 'imperial' ? lbToKg(value) : value;
    if (!(await succeeded(save.mutateAsync({ id: newId('bw'), date, weightKg, createdAt: now, updatedAt: now })))) return;
    router.back();
    toast.show({ message: `Logged ${value} ${unitLabel(units)} for ${formatShortDate(date)}.`, tone: 'success' });
  };

  return (
    // Scrolls, so Save stays reachable at large text sizes.
    <View style={[styles.fill, { backgroundColor: colors.cardElevated }]} onAccessibilityEscape={() => router.back()}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <AppText variant="title2" accessibilityRole="header">
          Log bodyweight
        </AppText>
        <View style={styles.row}>
          <NumberField label="Bodyweight" value={value} onChange={setValue} unit={unitLabel(units)} decimal width={150} placeholder="180" />
        </View>
        <SegmentedControl
          label="Date"
          options={[
            { value: 'today', label: `Today · ${formatShortDate(today).split(', ')[1]}` },
            { value: 'yesterday', label: 'Yesterday' },
          ]}
          value={day}
          onChange={setDay}
        />
        <AppText variant="footnote" tone="secondary">
          {replaces ? 'This replaces the weigh-in already logged for that day.' : 'Weigh in at a similar time each day for the steadiest trend.'}
        </AppText>
        <Button title="Save" fullWidth disabled={!value} loading={save.isPending} onPress={submit} />
      </ScrollView>
      <ToastViewport bottomOffset={spacing.lg} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  screen: {
    flexGrow: 1,
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.lg,
  },
  row: {
    alignItems: 'flex-start',
  },
});

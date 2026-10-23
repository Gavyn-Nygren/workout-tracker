import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, NumberField, SegmentedControl, useToast } from '@/components/ui';
import { useRepository } from '@/data/DataProvider';
import { addDays } from '@/data/dates';
import { useBodyweight, usePreferences, useSaveBodyweight } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import { kgToLb, lbToKg } from '@/data/units';
import { formatShortDate, unitLabel } from '@/lib/format';
import { newId } from '@/lib/id';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** Manual bodyweight entry (spec 2.6: bodyweight is entered by hand in V1). */
export default function LogWeightSheet() {
  const { colors } = useAppTheme();
  const toast = useToast();
  const today = useRepository().today();
  const units = (usePreferences().data ?? defaultPreferences).units;
  const { data: entries } = useBodyweight();
  const save = useSaveBodyweight();

  const latest = [...(entries ?? [])].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const toDisplay = (kg: number) => Math.round((units === 'imperial' ? kgToLb(kg) : kg) * 10) / 10;
  const [value, setValue] = useState<number | undefined>(latest ? toDisplay(latest.weightKg) : undefined);
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const date = day === 'today' ? today : addDays(today, -1);
  const replaces = entries?.some((e) => e.date === date);

  const submit = async () => {
    if (!value) return;
    const now = new Date().toISOString();
    const weightKg = units === 'imperial' ? lbToKg(value) : value;
    await save.mutateAsync({ id: newId('bw'), date, weightKg, createdAt: now, updatedAt: now });
    router.back();
    toast.show({ message: `Logged ${value} ${unitLabel(units)} for ${formatShortDate(date)}.`, tone: 'success' });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.cardElevated }]}>
      <AppText variant="title2">Log bodyweight</AppText>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.lg,
  },
  row: {
    alignItems: 'flex-start',
  },
});

import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, NumberField, SectionHeader, SegmentedControl } from '@/components/ui';
import { defaultRounding } from '@/data/preferences';
import type { Equipment } from '@/data/types';
import { EQUIPMENT_LABEL } from '@/features/exercises/ExerciseList';
import { useSettings } from '@/features/settings/useSettings';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { readable } from '@/theme/layout';

const ROUNDED: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell'];

/** Units, effort scale, and weight rounding (spec 2.4 and 2.6). */
export default function UnitsScreen() {
  const { colors } = useAppTheme();
  const { preferences, update } = useSettings();
  const unit = preferences.units === 'imperial' ? 'lb' : 'kg';

  return (
    <ScrollView contentContainerStyle={[styles.content, readable]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <View style={styles.section}>
        <SectionHeader title="Units" />
        <SegmentedControl
          label="Units"
          options={[
            { value: 'imperial', label: 'Pounds · inches' },
            { value: 'metric', label: 'Kilograms · cm' },
          ]}
          value={preferences.units}
          // Switching units also switches rounding to that unit's defaults.
          onChange={(units) => update({ units, roundingIncrements: defaultRounding[units] })}
        />
        <AppText variant="footnote" tone="secondary" style={styles.hint}>
          Everything you've logged converts automatically. Rounding resets to the defaults for the new unit.
        </AppText>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Effort" />
        <SegmentedControl
          label="Effort scale"
          options={[
            { value: 'rpe', label: 'RPE (1–10)' },
            { value: 'rir', label: 'Reps in reserve' },
          ]}
          value={preferences.effortScale}
          onChange={(effortScale) => update({ effortScale })}
        />
        <AppText variant="footnote" tone="secondary" style={styles.hint}>
          {preferences.effortScale === 'rpe' ? 'RPE 10 is an all-out set; RPE 8 leaves about 2 reps in the tank.' : 'How many more reps you could have done. 0 means none left.'} Switching never changes what you logged.
        </AppText>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Weight rounding" />
        <Card padding="none">
          {ROUNDED.map((equipment, i) => (
            <View key={equipment} style={[styles.row, i < ROUNDED.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <AppText variant="body" style={styles.flex}>
                {EQUIPMENT_LABEL[equipment]}
              </AppText>
              <NumberField
                label={`${EQUIPMENT_LABEL[equipment]} rounding increment`}
                value={preferences.roundingIncrements[equipment]}
                onChange={(v) => v !== undefined && v > 0 && update((p) => ({ ...p, roundingIncrements: { ...p.roundingIncrements, [equipment]: v } }))}
                unit={unit}
                decimal
                width={100}
              />
            </View>
          ))}
        </Card>
        <AppText variant="footnote" tone="secondary" style={styles.hint}>
          Suggested weights round to these. Use decimals for microplates, like 2.5 or 1.25.
        </AppText>
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
  section: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 54,
  },
  hint: {
    paddingHorizontal: spacing.xs,
  },
  flex: {
    flex: 1,
  },
});

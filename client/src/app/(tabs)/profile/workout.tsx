import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, ListRow, SectionHeader, Toggle } from '@/components/ui';
import { RestStepper } from '@/features/settings/RestStepper';
import { useSettings } from '@/features/settings/useSettings';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { readable, useTextScale } from '@/theme/layout';

const REST_ROWS = [
  { key: 'compound', label: 'Compound lifts', hint: 'Squats, presses, rows, deadlifts' },
  { key: 'isolation', label: 'Isolation lifts', hint: 'Curls, raises, extensions' },
  { key: 'warmup', label: 'Warm-up sets', hint: 'Between warm-ups' },
] as const;

/** Rest defaults and in-workout feedback (spec 2.6 and 2.13). */
export default function WorkoutDefaultsScreen() {
  const { colors } = useAppTheme();
  const { preferences, update } = useSettings();
  const { large } = useTextScale();

  return (
    <ScrollView contentContainerStyle={[styles.content, readable]}>
      <View style={styles.section}>
        <SectionHeader title="Default rest" />
        <Card padding="none">
          {REST_ROWS.map((row, i) => (
            // At accessibility sizes the label sits above the stepper so neither gets squeezed.
            <View key={row.key} style={[large ? styles.stacked : styles.row, i < REST_ROWS.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <View style={!large && styles.flex}>
                <AppText variant="body">{row.label}</AppText>
                <AppText variant="footnote" tone="secondary">
                  {row.hint}
                </AppText>
              </View>
              <RestStepper
                label={`${row.label} rest`}
                value={preferences.restDefaultsSec[row.key]}
                onChange={(sec) => update((p) => ({ ...p, restDefaultsSec: { ...p.restDefaultsSec, [row.key]: sec } }))}
              />
            </View>
          ))}
        </Card>
        <AppText variant="footnote" tone="secondary" style={styles.hint}>
          {"Used when a plan doesn't set its own rest. When you change the timer after an exercise's set, that exercise keeps your time instead. Supersets rest after each round."}
        </AppText>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Feedback" />
        <Card padding="none">
          <ListRow
            title="Haptics"
            subtitle="A tap when you complete a set, a strong buzz when rest ends"
            icon="iphone.radiowaves.left.and.right"
            trailing={<Toggle label="Haptics" value={preferences.haptics} onChange={(haptics) => update({ haptics })} />}
          />
          <ListRow
            title="PR celebrations"
            subtitle="Badge animation and confetti when you set a record"
            icon="star"
            trailing={<Toggle label="PR celebrations" value={preferences.celebrations} onChange={(celebrations) => update({ celebrations })} />}
            separator={false}
          />
        </Card>
        <AppText variant="footnote" tone="secondary" style={styles.hint}>
          Animations also stay off when Reduce Motion is on in iOS Settings.
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
    paddingVertical: spacing.md,
  },
  stacked: {
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  hint: {
    paddingHorizontal: spacing.xs,
  },
  flex: {
    flex: 1,
  },
});

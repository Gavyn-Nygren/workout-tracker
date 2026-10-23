import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Chip, Icon } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { rangeStore } from './progressPrefs';
import { RANGES } from './series';

/** One row of time-range presets above the charts; it scopes everything below (dataviz rule). */
export function RangeChips() {
  const range = rangeStore.use();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {RANGES.map((r) => (
        <Chip key={r.value} label={r.label} selected={range === r.value} onPress={() => rangeStore.set(r.value)} />
      ))}
    </ScrollView>
  );
}

/**
 * A change readout. Increases in green (strength metrics); decreases neutral, never red.
 * `neutral` greys both directions, for bodyweight where neither way is "better".
 */
export function Change({ text, delta, neutral }: { text: string; delta: number; neutral?: boolean }) {
  const { colors } = useAppTheme();
  const up = delta > 0.001;
  const good = up && !neutral;
  return (
    <View style={styles.change}>
      <Icon name={up ? 'arrowtriangle.up.fill' : delta < -0.001 ? 'arrowtriangle.down.fill' : 'equal'} color={good ? colors.successFill : colors.textTertiary} size={10} />
      <AppText variant="footnote" weight="700" tone={good ? 'success' : 'secondary'} numeric>
        {text}
      </AppText>
    </View>
  );
}

/** Legend keys mirror the marks: a short line for line series, a dot for dot series. */
export function Legend({ items }: { items: { label: string; color: string; kind: 'line' | 'dot' }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={item.kind === 'line' ? [styles.keyLine, { backgroundColor: item.color }] : [styles.keyDot, { backgroundColor: item.color }]} />
          <AppText variant="caption" tone="secondary">
            {item.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    gap: spacing.sm,
  },
  change: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  keyLine: {
    width: 16,
    height: 2,
    borderRadius: 1,
  },
  keyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

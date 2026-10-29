import { ActionSheetIOS, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Chip, Icon } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { Direction } from './progressFormat';
import type { StatusLine } from './progressPage';
import { rangeStore } from './useProgressPrefs';
import { RANGES } from './series';

/** One row of time-range presets above the charts; it scopes everything below (dataviz rule). */
export function RangeChips() {
  const range = rangeStore.use();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {RANGES.map((r) => (
        <Chip key={r.value} label={r.label} accessibilityLabel={r.spoken} role="radio" selected={range === r.value} onPress={() => rangeStore.set(r.value)} />
      ))}
    </ScrollView>
  );
}

/**
 * A change readout. Increases in green (strength metrics); decreases neutral, never red; a change
 * that rounds to zero is neutral with an equals sign, never an arrow.
 * - `direction`: which way it goes as shown (progressFormat's deltaDirection or describeChange).
 *   `delta` is the older way to say it, read from the raw number.
 * - `neutral` greys both directions, for bodyweight where neither way is "better".
 * - `accessibilityLabel` is the spoken version, e.g. "Up 15 pounds since October 1".
 */
export function Change({
  text,
  direction,
  delta = 0,
  neutral,
  accessibilityLabel,
}: {
  text: string;
  direction?: Direction;
  delta?: number;
  neutral?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useAppTheme();
  const way: Direction = direction ?? (delta > 0.001 ? 'up' : delta < -0.001 ? 'down' : 'none');
  const good = way === 'up' && !neutral;
  return (
    <View style={styles.change}>
      <Icon name={way === 'up' ? 'arrowtriangle.up.fill' : way === 'down' ? 'arrowtriangle.down.fill' : 'equal'} color={good ? colors.successFill : colors.textTertiary} size={10} />
      {/* Shrinks and wraps beside a chart instead of running into it at large text sizes. */}
      <AppText variant="footnote" weight="700" tone={good ? 'success' : 'secondary'} numeric style={styles.changeText} accessibilityLabel={accessibilityLabel}>
        {text}
      </AppText>
    </View>
  );
}

/**
 * A card's status line (progressPage.ts StatusLine): a change with its arrow, or plain text such
 * as "Last logged Aug 20" or "Not logged yet".
 */
export function StatusText({ status, neutral }: { status: StatusLine; neutral?: boolean }) {
  if (status.isChange) return <Change text={status.text} direction={status.direction} neutral={neutral} accessibilityLabel={status.spoken} />;
  return (
    <AppText variant="footnote" tone="secondary" accessibilityLabel={status.spoken}>
      {status.text}
    </AppText>
  );
}

/**
 * Confirms removing a saved graph: the action sheet every Progress screen uses ("Remove graph" in
 * red, Cancel). `title` names the graph ("Back Squat · Volume"). Removing never touches the data.
 */
export function confirmRemoveGraph({ title, scheme, onRemove }: { title: string; scheme: 'light' | 'dark'; onRemove: () => void }) {
  ActionSheetIOS.showActionSheetWithOptions(
    { title, options: ['Remove graph', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1, userInterfaceStyle: scheme },
    (index) => {
      if (index === 0) onRemove();
    },
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
  changeText: {
    flexShrink: 1,
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

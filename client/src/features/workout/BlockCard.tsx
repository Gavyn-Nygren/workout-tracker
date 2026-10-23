import { Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, Icon } from '@/components/ui';
import type { SessionBlock, SessionExercise } from '@/data/types';
import { formatClock } from '@/hooks/useNow';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

type Props = {
  block: SessionBlock;
  /** Letter for grouped blocks: "A" gives exercises A1, A2. */
  letter: string;
  renderExercise: (entry: SessionExercise, label?: string) => ReactNode;
};

/** A card per block. Supersets and circuits share one card with a header explaining the rest. */
export function BlockCard({ block, letter, renderExercise }: Props) {
  const { colors } = useAppTheme();
  const grouped = block.type === 'superset' || block.type === 'circuit';

  return (
    <Card padding="none">
      {grouped && (
        <View style={[styles.groupHeader, { backgroundColor: colors.accentSubtle }]}>
          <Icon name={block.type === 'superset' ? 'arrow.left.arrow.right' : 'arrow.triangle.2.circlepath'} color={colors.accentText} size={14} />
          <AppText variant="label" tone="accent">
            {block.type === 'superset' ? `Superset ${letter}` : `Circuit ${letter}`}
          </AppText>
          <AppText variant="caption" tone="accent" style={styles.flex} numberOfLines={1}>
            {[
              block.transitionRestSec ? `${block.transitionRestSec} s between` : 'No rest between',
              block.roundRestSec ? `${formatClock(block.roundRestSec)} after each round` : undefined,
            ]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        </View>
      )}
      {block.exercises.map((entry, i) => (
        <Fragment key={entry.id}>
          {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
          {renderExercise(entry, grouped ? `${letter}${i + 1}` : undefined)}
        </Fragment>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.md + 2,
  },
  flex: {
    flex: 1,
    textAlign: 'right',
  },
});

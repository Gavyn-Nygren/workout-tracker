import { Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, Icon } from '@/components/ui';
import type { SessionBlock, SessionExercise } from '@/data/types';
import { formatClock, spokenDuration } from '@/hooks/useNow';
import { useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

type Props = {
  block: SessionBlock;
  /** Letter for grouped blocks: "A" gives exercises A1, A2. */
  letter: string;
  renderExercise: (entry: SessionExercise, label?: string) => ReactNode;
};

/** "No rest between · 2:00 after each round"; `spoken` uses words for VoiceOver. */
function restCaption(block: SessionBlock, spoken: boolean): string {
  const between = block.transitionRestSec
    ? `${spoken ? spokenDuration(block.transitionRestSec) : `${block.transitionRestSec} s`} between`
    : 'No rest between';
  const round = block.roundRestSec ? `${spoken ? spokenDuration(block.roundRestSec) : formatClock(block.roundRestSec)} after each round` : undefined;
  return [between, round].filter(Boolean).join(' · ');
}

/** A card per block. Supersets and circuits share one card with a header explaining the rest. */
export function BlockCard({ block, letter, renderExercise }: Props) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const grouped = block.type === 'superset' || block.type === 'circuit';

  return (
    <Card padding="none">
      {grouped && (
        // Large text: the rest caption moves under the label instead of squeezing beside it.
        <View style={[styles.groupHeader, large && styles.groupHeaderStacked, { backgroundColor: colors.accentSubtle }]}>
          <View style={styles.groupTitle}>
            <Icon name={block.type === 'superset' ? 'arrow.left.arrow.right' : 'arrow.triangle.2.circlepath'} color={colors.accentText} size={14} />
            <AppText variant="label" tone="accent" accessibilityRole="header">
              {block.type === 'superset' ? `Superset ${letter}` : `Circuit ${letter}`}
            </AppText>
          </View>
          <AppText variant="caption" tone="accent" style={!large && styles.caption} accessibilityLabel={restCaption(block, true)}>
            {restCaption(block, false)}
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
  groupHeaderStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  groupTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  caption: {
    flex: 1,
    textAlign: 'right',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.md + 2,
  },
});

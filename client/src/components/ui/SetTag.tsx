import { StyleSheet, View } from 'react-native';

import type { SetKind, SetModifier } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { AppText } from './AppText';

export type SetTagValue = Exclude<SetKind, 'normal'> | SetModifier;

const LABELS: Record<SetTagValue, { short: string; full: string }> = {
  warmup: { short: 'W', full: 'Warm-up' },
  drop: { short: 'D', full: 'Drop set' },
  timed_hold: { short: 'Hold', full: 'Timed hold' },
  assisted: { short: 'Assist', full: 'Assisted' },
  amrap: { short: 'AMRAP', full: 'AMRAP' },
  to_failure: { short: 'F', full: 'To failure' },
  shortened_partials: { short: 'SP', full: 'Shortened partials' },
  lengthened_partials: { short: 'LP', full: 'Lengthened partials' },
};

const KINDS = new Set<SetTagValue>(['warmup', 'drop', 'timed_hold', 'assisted']);

type Props = {
  tag: SetTagValue;
  /** Short code for dense set tables ("W", "D", "F"); VoiceOver always reads the full name. */
  compact?: boolean;
};

/** Marks a set's kind (neutral) or modifier (accent-tinted). Sets can carry one kind plus several modifiers. */
export function SetTag({ tag, compact }: Props) {
  const { colors } = useAppTheme();
  const isKind = KINDS.has(tag);
  const label = LABELS[tag];

  return (
    <View
      accessibilityLabel={label.full}
      style={[styles.tag, compact && styles.compact, { backgroundColor: isKind ? colors.input : colors.accentSubtle }]}
    >
      <AppText variant="caption" weight="700" tone={isKind ? 'secondary' : 'accent'} numberOfLines={1} maxFontSizeMultiplier={1.4}>
        {compact ? label.short : label.full}
      </AppText>
    </View>
  );
}

export function setTagLabel(tag: SetTagValue): string {
  return LABELS[tag].full;
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  compact: {
    minWidth: 24,
    alignItems: 'center',
    paddingHorizontal: spacing.xs + 1,
  },
});

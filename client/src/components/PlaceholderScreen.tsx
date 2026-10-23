import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing, typography } from '@/theme/tokens';

type Props = {
  title: string;
  summary: string;
  /** Roadmap goal that builds the real screen, e.g. "G2.1". */
  goal: string;
  children?: ReactNode;
};

/** Temporary stand-in for a tab until its Phase 2 goal builds the real screen. */
export function PlaceholderScreen({ title, summary, goal, children }: Props) {
  const { colors, elevation } = useAppTheme();

  return (
    <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, boxShadow: elevation.card }]}>
        <Text style={[typography.title1, { color: colors.text }]}>{title}</Text>
        <Text style={[typography.subhead, { color: colors.textSecondary }]}>{summary}</Text>
        <View style={[styles.goalPill, { backgroundColor: colors.accent }]}>
          <Text style={[typography.footnote, styles.goalText, { color: colors.onAccent }]}>Built in {goal}</Text>
        </View>
      </View>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  goalPill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  goalText: {
    fontWeight: '700',
  },
});

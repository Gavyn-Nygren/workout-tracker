import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

type Props = {
  title: string;
  summary: string;
  /** Roadmap goal that builds the real screen, e.g. "G2.1". */
  goal: string;
  children?: ReactNode;
};

/** Temporary stand-in for a tab until its Phase 2 goal builds the real screen. */
export function PlaceholderScreen({ title, summary, goal, children }: Props) {
  const { colors } = useAppTheme();

  return (
    <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.summary, { color: colors.textSecondary }]}>{summary}</Text>
        <View style={[styles.goalPill, { backgroundColor: colors.accent }]}>
          <Text style={[styles.goalText, { color: colors.onAccent }]}>Built in {goal}</Text>
        </View>
      </View>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  summary: {
    fontSize: 15,
    lineHeight: 21,
  },
  goalPill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 8,
  },
  goalText: {
    fontSize: 13,
    fontWeight: '700',
  },
});

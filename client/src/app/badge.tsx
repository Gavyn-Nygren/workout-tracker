import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, ErrorState, NotFoundState, ProgressBar, Skeleton } from '@/components/ui';
import { useBadges, useExercises, useFormReports, useSessions, useStreak } from '@/data/hooks';
import { BADGE_CATEGORY_LABEL } from '@/features/home/badges';
import { BadgeMedallion } from '@/features/home/HomeParts';
import { useHomeData } from '@/features/home/useHomeData';
import { formatShortDate } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/** A badge's details: earned date, or progress toward it. */
export default function BadgeSheet() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { colors } = useAppTheme();
  const { isLoading, earned, upcoming } = useHomeData();
  // The reads badges are built from (same cache as useHomeData), checked for errors.
  const queries = [useBadges(), useSessions(), useExercises(), useStreak(), useFormReports()];

  const failed = queries.filter((q) => q.error);
  if (failed.length) return <ErrorState fill title="Couldn't load this badge" onRetry={() => failed.forEach((q) => q.refetch())} />;
  if (isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.cardElevated }]} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
        <Skeleton width={96} height={96} radius={radius.pill} />
        <Skeleton width={80} height={12} />
        <Skeleton width="60%" height={26} />
        <Skeleton width="80%" height={18} />
      </View>
    );
  }

  const got = earned.find((b) => b.badgeKey === key);
  const next = upcoming.find((b) => b.badgeKey === key);
  const badge = got ?? next;
  if (!badge) return <NotFoundState thing="Badge" icon="medal" backLabel="Close" />;

  return (
    // Scrolls, so Done stays reachable at large text sizes.
    <ScrollView style={{ backgroundColor: colors.cardElevated }} contentContainerStyle={styles.screen} onAccessibilityEscape={() => router.back()}>
      {/* Decorative here: the progress bar below reads the same progress. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <BadgeMedallion category={badge.category} earned={Boolean(got)} progress={next ? next.current / next.target : undefined} size={96} />
      </View>
      <AppText variant="caption" weight="800" tone="accent">
        {BADGE_CATEGORY_LABEL[badge.category].toUpperCase()}
      </AppText>
      <AppText variant="title2" accessibilityRole="header" style={styles.center}>
        {badge.title}
      </AppText>
      <AppText variant="body" tone="secondary" style={styles.center}>
        {badge.description}
      </AppText>
      {got && (
        <AppText variant="subhead" weight="600" tone="success">
          {`Earned ${formatShortDate(got.earnedDate)}`}
        </AppText>
      )}
      {next && (
        <View style={styles.progress}>
          <ProgressBar value={next.current / next.target} label={`${next.title} progress`} />
          <AppText variant="subhead" tone="secondary" numeric style={styles.center}>
            {next.progressLabel}
          </AppText>
        </View>
      )}
      <Button title="Done" variant="secondary" onPress={() => router.back()} style={styles.done} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    alignItems: 'center',
    padding: spacing.xl,
    paddingTop: spacing.xxxl,
    gap: spacing.sm,
  },
  center: {
    textAlign: 'center',
  },
  progress: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  done: {
    alignSelf: 'center',
    marginTop: spacing.lg,
  },
});

import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, ProgressBar } from '@/components/ui';
import { BADGE_CATEGORY_LABEL } from '@/features/home/badges';
import { BadgeMedallion } from '@/features/home/HomeParts';
import { useHomeData } from '@/features/home/useHomeData';
import { formatShortDate } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** A badge's details: earned date, or progress toward it. */
export default function BadgeSheet() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { colors } = useAppTheme();
  const { earned, upcoming } = useHomeData();
  const got = earned.find((b) => b.badgeKey === key);
  const next = upcoming.find((b) => b.badgeKey === key);
  const badge = got ?? next;

  return (
    <View style={[styles.screen, { backgroundColor: colors.cardElevated }]}>
      {badge ? (
        <>
          <BadgeMedallion category={badge.category} earned={Boolean(got)} progress={next ? next.current / next.target : undefined} size={96} />
          <AppText variant="caption" weight="800" tone="accent">
            {BADGE_CATEGORY_LABEL[badge.category].toUpperCase()}
          </AppText>
          <AppText variant="title2" style={styles.center}>
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
        </>
      ) : (
        <AppText tone="secondary">This badge isn't available.</AppText>
      )}
      <Button title="Done" variant="secondary" onPress={() => router.back()} style={styles.done} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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

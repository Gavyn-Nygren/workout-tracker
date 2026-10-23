import { StyleSheet, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import type { UnitSystem, WorkoutSession } from '@/data/types';
import { formatDuration, formatLoadValue, formatShortDate, unitLabel } from '@/lib/format';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import type { WorkoutSummary } from './summarize';

type Props = {
  session: WorkoutSession;
  planName?: string;
  summary: WorkoutSummary;
  units: UnitSystem;
};

/** Dark hero card at the top of the summary (user's pick), matching Today's workout cards. */
export function SummaryHero(props: Props) {
  const { scheme } = useAppTheme();
  return (
    <SchemeOverride scheme="dark">
      <Body {...props} outerScheme={scheme} />
    </SchemeOverride>
  );
}

function Body({ session, planName, summary, units, outerScheme }: Props & { outerScheme: 'light' | 'dark' }) {
  const { colors } = useAppTheme();
  const partial = session.completion === 'partial';
  const prCount = new Set(summary.records.map((r) => r.setId)).size;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.chrome,
          borderColor: outerScheme === 'dark' ? colors.border : colors.chrome,
          boxShadow: outerScheme === 'light' ? '0px 10px 28px rgba(11, 15, 20, 0.22)' : undefined,
        },
      ]}
    >
      <Icon name="trophy.fill" color={colors.accent} size={150} weight="regular" style={styles.watermark} />
      <View style={[styles.pill, { backgroundColor: colors.input }]}>
        <Icon name={partial ? 'circle.lefthalf.filled' : 'checkmark.circle.fill'} color={partial ? colors.warningFill : colors.successFill} size={14} />
        <AppText variant="caption" weight="800" tone={partial ? 'warning' : 'success'}>
          {partial ? 'PARTIAL WORKOUT' : 'WORKOUT COMPLETE'}
        </AppText>
      </View>
      <View style={styles.title}>
        <AppText variant="largeTitle" numberOfLines={2}>
          {session.name}
        </AppText>
        <AppText variant="subhead" tone="secondary">
          {[session.completedDate && formatShortDate(session.completedDate), planName, session.repeatedFromSessionId && 'Repeat'].filter(Boolean).join('  ·  ')}
        </AppText>
      </View>
      <View style={[styles.stats, { borderTopColor: colors.border }]}>
        <Stat label="Time" value={summary.minutes !== undefined ? formatDuration(summary.minutes) : '—'} />
        <Stat label={`Volume (${unitLabel(units)})`} value={formatLoadValue(summary.volumeKg, units)} />
        <Stat label="Sets" value={`${summary.setsDone}/${summary.setsTotal}`} />
        <View style={styles.stat}>
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            PRs
          </AppText>
          <View style={styles.prValue}>
            <Icon name="star.fill" color={prCount ? colors.pr : colors.textTertiary} size={16} />
            <AppText variant="title3" weight="800" numeric>
              {prCount}
            </AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="caption" tone="secondary" numberOfLines={1}>
        {label}
      </AppText>
      <AppText variant="title3" weight="800" numeric numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card + 4,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    gap: spacing.lg,
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    right: -24,
    top: 18,
    opacity: 0.07,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  title: {
    gap: spacing.xs,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  prValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import type { UnitSystem, WorkoutSession } from '@/data/types';
import { spokenDuration } from '@/hooks/useNow';
import { formatDuration, formatLoadValue, formatShortDate, unitLabel } from '@/lib/format';
import { DENSE_TEXT_MAX, useTextScale } from '@/theme/layout';
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
  const { fontScale } = useTextScale();
  const partial = session.completion === 'partial';
  const prCount = new Set(summary.records.map((r) => r.setId)).size;
  // Four tiles across at default sizes, two by two from XXL (labels truncate there), one per line at accessibility sizes.
  const layout = fontScale >= 1.5 ? styles.statsStacked : fontScale >= 1.2 ? styles.statsGrid : styles.stats;
  const tile = fontScale >= 1.5 ? styles.statFull : fontScale >= 1.2 ? styles.statHalf : styles.stat;
  const unitWord = units === 'imperial' ? 'pounds' : 'kilograms';

  return (
    <View
      style={[
        styles.card,
        // Dark mode: a thin blue edge lifts the card off the near-black page. Light mode keeps its shadow (user's pick).
        outerScheme === 'dark'
          ? { backgroundColor: colors.chrome, borderColor: colors.heroBorder, borderWidth: 1 }
          : { backgroundColor: colors.chrome, borderColor: colors.chrome, boxShadow: '0px 10px 28px rgba(11, 15, 20, 0.22)' },
      ]}
    >
      <Icon name="trophy.fill" color={colors.accent} size={150} weight="regular" style={styles.watermark} />
      <View style={[styles.pill, { backgroundColor: colors.input }]}>
        <Icon name={partial ? 'circle.lefthalf.filled' : 'checkmark.circle.fill'} color={partial ? colors.warningFill : colors.successFill} size={14} />
        <AppText variant="caption" weight="800" tone={partial ? 'warning' : 'success'} maxFontSizeMultiplier={DENSE_TEXT_MAX}>
          {partial ? 'PARTIAL WORKOUT' : 'WORKOUT COMPLETE'}
        </AppText>
      </View>
      <View style={styles.title}>
        <AppText variant="largeTitle" numberOfLines={3} accessibilityRole="header">
          {session.name}
        </AppText>
        <AppText variant="subhead" tone="secondary">
          {[session.completedDate && formatShortDate(session.completedDate), planName, session.repeatedFromSessionId && 'Repeat'].filter(Boolean).join('  ·  ')}
        </AppText>
      </View>
      <View style={[styles.statsBase, layout, { borderTopColor: colors.border }]}>
        <Stat
          style={tile}
          label="Time"
          value={summary.minutes !== undefined ? formatDuration(summary.minutes) : '—'}
          spoken={`Time: ${summary.minutes !== undefined ? spokenDuration(Math.round(summary.minutes) * 60) : 'not recorded'}`}
        />
        <Stat style={tile} label={`Volume (${unitLabel(units)})`} value={formatLoadValue(summary.volumeKg, units)} spoken={`Volume: ${formatLoadValue(summary.volumeKg, units)} ${unitWord}`} />
        <Stat style={tile} label="Sets" value={`${summary.setsDone}/${summary.setsTotal}`} spoken={`Sets: ${summary.setsDone} of ${summary.setsTotal}`} />
        <View style={tile} accessible accessibilityLabel={`Personal records: ${prCount}`}>
          <AppText variant="caption" tone="secondary" numberOfLines={2}>
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

/** One stat tile; VoiceOver reads it as one item ("Sets: 18 of 20"). */
function Stat({ label, value, spoken, style }: { label: string; value: string; spoken: string; style?: StyleProp<ViewStyle> }) {
  const { fontScale } = useTextScale();
  return (
    <View style={style} accessible accessibilityLabel={spoken}>
      <AppText variant="caption" tone="secondary" numberOfLines={2}>
        {label}
      </AppText>
      {/* Four tiles across are narrow, so a long value may shrink a little there (never below 70%). */}
      <AppText variant="title3" weight="800" numeric numberOfLines={fontScale < 1.2 ? 1 : undefined} adjustsFontSizeToFit={fontScale < 1.2} minimumFontScale={0.7}>
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
  statsBase: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
  },
  statsStacked: {
    gap: spacing.md,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statFull: {
    gap: 2,
  },
  statHalf: {
    width: '50%',
    paddingRight: spacing.sm,
    gap: 2,
  },
  prValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});

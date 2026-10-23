import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, Icon, ProgressBar, ProgressRing } from '@/components/ui';
import type { EarnedBadge, Goal, UnitSystem } from '@/data/types';
import { formatLoad, formatMonthDay, plural } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { BADGE_ICON, type NextBadge } from './badges';
import type { GoalProgress } from './goals';
import type { Win } from './wins';

// ---------------------------------------------------------------------------
// Goals (user's pick: bars with pace)

function progressText(goal: Goal, p: GoalProgress, units: UnitSystem): string {
  switch (goal.type) {
    case 'lift':
      return `${p.current !== undefined ? formatLoad(p.current, units) : 'Not logged yet'} / ${formatLoad(p.target, units)}${goal.target.kind === 'e1rm' ? ' e1RM' : ` × ${goal.target.reps}`}`;
    case 'frequency':
      return `${p.current ?? 0} of ${plural(p.target, 'workout')} this week`;
    case 'bodyweight':
      return `${p.current !== undefined ? formatLoad(p.current, units) : '—'} now · target ${formatLoad(p.target, units)}`;
    case 'form':
      return `${p.current !== undefined ? `${Math.round(p.current)}°` : 'No recording yet'} now · target ${p.target}° ${goal.joint} angle`;
  }
}

function PaceTag({ progress }: { progress: GoalProgress }) {
  const { colors } = useAppTheme();
  const tag = progress.achieved
    ? { label: 'Done', bg: colors.successSubtle, tone: 'success' as const, icon: 'checkmark' as const }
    : progress.pace === 'on_track'
      ? { label: 'On track', bg: colors.successSubtle, tone: 'success' as const }
      : progress.pace === 'behind'
        ? { label: 'Behind pace', bg: colors.input, tone: 'warning' as const }
        : undefined;
  if (!tag) return null;
  return (
    <View style={[styles.tag, { backgroundColor: tag.bg }]}>
      {'icon' in tag && tag.icon && <Icon name={tag.icon} color={colors.successText} size={11} weight="bold" />}
      <AppText variant="caption" weight="700" tone={tag.tone}>
        {tag.label}
      </AppText>
    </View>
  );
}

export function GoalRow({ goal, progress, units, separator, onPress }: { goal: Goal; progress: GoalProgress; units: UnitSystem; separator: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const meta = [progressText(goal, progress, units), progress.daysLeft !== undefined && !progress.achieved ? `${plural(progress.daysLeft, 'day')} left` : undefined].filter(Boolean).join('  ·  ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${goal.title}. ${Math.round(progress.fraction * 100)} percent. ${meta}`}
      style={({ pressed }) => [styles.goal, separator && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: colors.input }]}
    >
      <View style={styles.goalTop}>
        <AppText variant="headline" style={styles.flex} numberOfLines={1}>
          {goal.title}
        </AppText>
        <PaceTag progress={progress} />
      </View>
      <ProgressBar value={progress.fraction} label={goal.title} />
      <AppText variant="footnote" tone="secondary" numeric>
        {meta}
      </AppText>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Recent wins (user's pick: one mixed feed)

export function WinsFeed({ wins }: { wins: Win[] }) {
  const { colors } = useAppTheme();
  return (
    <Card padding="none">
      {wins.map((win, i) => {
        const color = win.kind === 'pr' ? colors.pr : win.kind === 'form' ? colors.accentText : colors.successFill;
        return (
          <View key={win.id} style={[styles.win, i < wins.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <View style={[styles.winIcon, { backgroundColor: win.kind === 'pr' ? colors.input : colors.accentSubtle }]}>
              <Icon name={win.icon} color={color} size={15} />
            </View>
            <View style={styles.flex}>
              <AppText variant="subhead" weight="700" numberOfLines={1}>
                {win.title}
              </AppText>
              <AppText variant="footnote" tone="secondary" numberOfLines={1} numeric>
                {win.detail}
              </AppText>
            </View>
            <AppText variant="caption" tone="tertiary" numeric>
              {formatMonthDay(win.date)}
            </AppText>
          </View>
        );
      })}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Badges (user's pick: earned + next up)

export function BadgeMedallion({ category, earned, progress, size = 60 }: { category: EarnedBadge['category']; earned: boolean; progress?: number; size?: number }) {
  const { colors } = useAppTheme();
  const inner = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: earned ? colors.pr : colors.input,
        borderWidth: earned ? 3 : 0,
        borderColor: earned ? 'rgba(255, 255, 255, 0.55)' : 'transparent',
      }}
    >
      <Icon name={BADGE_ICON[category]} color={earned ? colors.onPr : colors.textTertiary} size={size * 0.42} />
    </View>
  );
  if (earned || progress === undefined) return inner;
  return (
    <ProgressRing value={progress} label="Progress" size={size + 10} strokeWidth={4}>
      {inner}
    </ProgressRing>
  );
}

export function EarnedRow({ badges, onPress }: { badges: EarnedBadge[]; onPress: (badge: EarnedBadge) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.earned}>
      {badges.map((b) => (
        <Pressable key={b.id} onPress={() => onPress(b)} accessibilityRole="button" accessibilityLabel={`${b.title} badge, earned ${formatMonthDay(b.earnedDate)}`} style={styles.earnedItem}>
          <BadgeMedallion category={b.category} earned />
          <AppText variant="caption" weight="600" numberOfLines={2} style={styles.center}>
            {b.title}
          </AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function NextUpList({ badges, onPress }: { badges: NextBadge[]; onPress: (badge: NextBadge) => void }) {
  const { colors } = useAppTheme();
  return (
    <Card padding="none">
      {badges.map((b, i) => (
        <Pressable
          key={b.badgeKey}
          onPress={() => onPress(b)}
          accessibilityRole="button"
          accessibilityLabel={`${b.title}, not earned yet. ${b.progressLabel}`}
          style={({ pressed }) => [styles.next, i < badges.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: colors.input }]}
        >
          <BadgeMedallion category={b.category} earned={false} progress={b.current / b.target} size={36} />
          <View style={styles.flex}>
            <AppText variant="subhead" weight="700">
              {b.title}
            </AppText>
            <AppText variant="footnote" tone="secondary" numeric>
              {b.progressLabel}
            </AppText>
          </View>
          <Icon name="chevron.right" color={colors.textTertiary} size={13} />
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    textAlign: 'center',
  },
  goal: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  goalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  win: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  winIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earned: {
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  earnedItem: {
    width: 76,
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});

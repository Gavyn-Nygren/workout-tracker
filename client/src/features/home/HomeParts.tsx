import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, Icon, PressableScale, ProgressBar, ProgressRing } from '@/components/ui';
import type { EarnedBadge, Goal, UnitSystem } from '@/data/types';
import { formatLoad, formatMonthDay, plural } from '@/lib/format';
import { useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { BADGE_ICON, type NextBadge } from './badges';
import type { GoalProgress } from './goals';
import type { Win } from './wins';

// ---------------------------------------------------------------------------
// Goals (user's pick: bars with pace)

/** `spoken` says "of" instead of "/" and "estimated one-rep max" instead of "e1RM". */
function progressText(goal: Goal, p: GoalProgress, units: UnitSystem, spoken = false): string {
  switch (goal.type) {
    case 'lift': {
      const current = p.current !== undefined ? formatLoad(p.current, units) : 'Not logged yet';
      const target = formatLoad(p.target, units);
      if (spoken) return `${current} of ${target}${goal.target.kind === 'e1rm' ? ' estimated one-rep max' : ` for ${plural(goal.target.reps, 'rep')}`}`;
      return `${current} / ${target}${goal.target.kind === 'e1rm' ? ' e1RM' : ` × ${goal.target.reps}`}`;
    }
    case 'frequency':
      return `${p.current ?? 0} of ${plural(p.target, 'workout')} this week`;
    case 'bodyweight':
      return `${p.current !== undefined ? formatLoad(p.current, units) : '—'} now · target ${formatLoad(p.target, units)}`;
    case 'form':
      return `${p.current !== undefined ? `${Math.round(p.current)}°` : 'No recording yet'} now · target ${p.target}° ${goal.joint} angle`;
  }
}

function paceTag(progress: GoalProgress) {
  return progress.achieved
    ? { label: 'Done', success: true, icon: 'checkmark' as const }
    : progress.pace === 'on_track'
      ? { label: 'On track', success: true }
      : progress.pace === 'behind'
        ? { label: 'Behind pace', success: false }
        : undefined;
}

function PaceTag({ progress }: { progress: GoalProgress }) {
  const { colors } = useAppTheme();
  const tag = paceTag(progress);
  if (!tag) return null;
  return (
    <View style={[styles.tag, { backgroundColor: tag.success ? colors.successSubtle : colors.input }]}>
      {'icon' in tag && tag.icon && <Icon name={tag.icon} color={colors.successText} size={11} weight="bold" />}
      <AppText variant="caption" weight="700" tone={tag.success ? 'success' : 'warning'}>
        {tag.label}
      </AppText>
    </View>
  );
}

export function GoalRow({ goal, progress, units, separator, onPress }: { goal: Goal; progress: GoalProgress; units: UnitSystem; separator: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const daysLeft = progress.daysLeft !== undefined && !progress.achieved ? `${plural(progress.daysLeft, 'day')} left` : undefined;
  const meta = [progressText(goal, progress, units), daysLeft].filter(Boolean).join('  ·  ');
  const pace = paceTag(progress)?.label;
  const spoken = [`${goal.title}.`, pace && `${pace}.`, `${Math.round(progress.fraction * 100)} percent.`, [progressText(goal, progress, units, true), daysLeft].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Edit or delete this goal"
      style={({ pressed }) => [styles.goal, separator && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: colors.input }]}
    >
      {/* Large text: the pace tag wraps under the title instead of squeezing it. */}
      <View style={[styles.goalTop, large && styles.wrap]}>
        <AppText variant="headline" style={large ? styles.grow : styles.flex}>
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
  const { large } = useTextScale();
  return (
    <Card padding="none">
      {wins.map((win, i) => {
        // Gold for PRs needs the darker on-surface gold on the light input well (raw gold is 1.7:1 there).
        const color = win.kind === 'pr' ? colors.prOnSurface : win.kind === 'form' ? colors.accentText : colors.successFill;
        const date = (
          <AppText variant="caption" tone="secondary" numeric>
            {formatMonthDay(win.date)}
          </AppText>
        );
        const content = (
          <>
            <View style={[styles.winIcon, { backgroundColor: win.kind === 'pr' ? colors.input : colors.accentSubtle }]}>
              <Icon name={win.icon} color={color} size={15} />
            </View>
            <View style={styles.flex}>
              <AppText variant="subhead" weight="700" numberOfLines={large ? undefined : 2}>
                {win.title}
              </AppText>
              <AppText variant="footnote" tone="secondary" numberOfLines={large ? undefined : 2} numeric>
                {win.detail}
              </AppText>
              {/* Large text: the date joins the text column so the title keeps the width. */}
              {large && date}
            </View>
            {!large && date}
            {win.reportId && <Icon name="chevron.right" color={colors.textSecondary} size={12} />}
          </>
        );
        const rowStyle = [styles.win, i < wins.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }];
        const spoken = `${win.title}. ${win.detail}. ${formatMonthDay(win.date)}`;
        // Only wins with a form report open something; the rest are plain text, not dimmed buttons.
        return win.reportId ? (
          <Pressable
            key={win.id}
            onPress={() => router.push({ pathname: '/form/report', params: { id: win.reportId! } })}
            accessibilityRole="button"
            accessibilityLabel={spoken}
            accessibilityHint="Opens the form report"
            style={({ pressed }) => [rowStyle, pressed && { backgroundColor: colors.input }]}
          >
            {content}
          </Pressable>
        ) : (
          <View key={win.id} accessible accessibilityLabel={spoken} style={rowStyle}>
            {content}
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
      <Icon name={BADGE_ICON[category]} color={earned ? colors.onPr : colors.textSecondary} size={size * 0.42} />
    </View>
  );
  if (earned || progress === undefined) return inner;
  return (
    <ProgressRing value={progress} label="Progress" size={size + 10} strokeWidth={4}>
      {inner}
    </ProgressRing>
  );
}

/** Earned badges scroll sideways, so their items can widen with the text for free. */
const EARNED_ITEM = 76;

export function EarnedRow({ badges, onPress }: { badges: EarnedBadge[]; onPress: (badge: EarnedBadge) => void }) {
  const { fontScale } = useTextScale();
  const width = EARNED_ITEM * Math.min(Math.max(fontScale, 1), 2);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.earned}>
      {badges.map((b) => (
        <PressableScale
          key={b.id}
          onPress={() => onPress(b)}
          accessibilityRole="button"
          accessibilityLabel={`${b.title} badge, earned ${formatMonthDay(b.earnedDate)}`}
          contentStyle={[styles.earnedItem, { width }]}
        >
          <BadgeMedallion category={b.category} earned />
          <AppText variant="caption" weight="600" numberOfLines={3} style={styles.center}>
            {b.title}
          </AppText>
        </PressableScale>
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
          <Icon name="chevron.right" color={colors.textSecondary} size={13} />
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  grow: {
    flexGrow: 1,
    flexShrink: 1,
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
  wrap: {
    flexWrap: 'wrap',
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

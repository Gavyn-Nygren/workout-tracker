import type { SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, PRBadge, type TextTone } from '@/components/ui';
import { usePlanShifts } from '@/data/hooks';
import type { Exercise, ISODate, UnitSystem } from '@/data/types';
import { movedFromDate } from '@/features/plans/position';
import { spokenDuration } from '@/hooks/useNow';
import { formatDuration, formatLoadValue, formatShortDate, plural, unitLabel } from '@/lib/format';
import { useTextScale } from '@/theme/layout';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import type { DayItem, DayItemStatus, SessionSummary } from './agenda';
import { planLines, sessionLines } from './cardLines';

type Props = {
  item: DayItem;
  index: number;
  total: number;
  today: ISODate;
  summary?: SessionSummary;
  exercisesById: Map<string, Exercise>;
  units: UnitSystem;
  onStart: () => void;
  onReopen: () => void;
  onRepeat: () => void;
  onViewSummary: () => void;
  /** Opens the card's options (Skip / Unskip). Omitted when there are none. */
  onMenu?: () => void;
};

const STATUS: Record<DayItemStatus, { label: string; icon: SFSymbol; tone: TextTone }> = {
  planned: { label: 'Planned', icon: 'calendar', tone: 'accent' },
  in_progress: { label: 'In progress', icon: 'play.circle.fill', tone: 'accent' },
  completed: { label: 'Done', icon: 'checkmark.circle.fill', tone: 'success' },
  partial: { label: 'Partial', icon: 'circle.lefthalf.filled', tone: 'warning' },
  missed: { label: 'Missed', icon: 'exclamationmark.circle.fill', tone: 'warning' },
  skipped: { label: 'Skipped', icon: 'forward.end.fill', tone: 'secondary' },
};

const MAX_LINES = 4;

/** High-energy dark card for one workout on the selected day (spec 2.13: dark in both themes). */
export function WorkoutCard(props: Props) {
  const { scheme } = useAppTheme();
  return (
    <SchemeOverride scheme="dark">
      <CardBody {...props} outerScheme={scheme} />
    </SchemeOverride>
  );
}

function CardBody({
  item,
  index,
  total,
  today,
  summary,
  exercisesById,
  units,
  onStart,
  onReopen,
  onRepeat,
  onViewSummary,
  onMenu,
  outerScheme,
}: Props & { outerScheme: 'light' | 'dark' }) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const status = STATUS[item.status];
  const done = item.status === 'completed' || item.status === 'partial';
  const position = total > 1 ? ` ${index + 1}/${total}` : '';
  // VoiceOver reads "1/2" as "one half", so the spoken labels spell the position out.
  const spokenPosition = total > 1 ? ` ${index + 1} of ${total}` : '';
  const verb = item.status === 'in_progress' ? 'Resume' : 'Start';
  const isCore = /core|abs/i.test(item.name);

  const lines = done && item.session ? sessionLines(item.session.blocks.flatMap((b) => b.exercises), exercisesById, units) : planLines(item.workout, exercisesById);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.chrome,
          // Dark mode: a thin blue edge lifts the card off the near-black page (user's pick). Light keeps the shadow.
          borderColor: outerScheme === 'dark' ? colors.heroBorder : colors.chrome,
          boxShadow: outerScheme === 'light' ? '0px 10px 28px rgba(11, 15, 20, 0.22)' : undefined,
        },
      ]}
    >
      <Icon
        name={isCore ? 'figure.core.training' : 'figure.strengthtraining.traditional'}
        color={colors.accent}
        size={170}
        weight="regular"
        style={styles.watermark}
      />

      {/* Large text: the status pill wraps under the plan name instead of squeezing it. */}
      <View style={styles.topBar}>
        <View style={[styles.topRow, large && styles.wrap, styles.flex]} accessible accessibilityLabel={`${item.plan?.name ?? 'Workout'}, ${status.label}`}>
          <AppText variant="label" tone="secondary" numberOfLines={2} style={large ? styles.grow : styles.flex}>
            {item.plan?.name ?? 'Workout'}
          </AppText>
          <View style={[styles.statusPill, { backgroundColor: colors.input }]}>
            <Icon name={status.icon} color={colors[toneColor(status.tone)]} size={13} />
            <AppText variant="caption" weight="700" tone={status.tone}>
              {status.label}
            </AppText>
          </View>
        </View>
        {onMenu && (
          <Pressable
            onPress={onMenu}
            accessibilityRole="button"
            accessibilityLabel={`Options for ${item.name}`}
            hitSlop={10}
            style={({ pressed }) => [styles.menu, { backgroundColor: colors.input, opacity: pressed ? 0.7 : 1 }]}
          >
            <Icon name="ellipsis" color={colors.onChrome} size={16} weight="bold" />
          </Pressable>
        )}
      </View>

      <View style={styles.titleBlock}>
        <AppText variant="largeTitle" numberOfLines={3} accessibilityRole="header">
          {item.name}
        </AppText>
        <MetaLine item={item} summary={summary} today={today} />
      </View>

      <View style={styles.lines}>
        {lines.slice(0, MAX_LINES).map((line) => (
          // Large text: the detail moves under the name so neither gets squeezed to nothing.
          <View key={line.key} style={[styles.line, large && styles.lineStacked]} accessible accessibilityLabel={`${line.spokenName}, ${line.spokenDetail ?? line.detail}`}>
            <AppText variant="subhead" weight="600" style={!large && styles.flex} tone={line.muted ? 'secondary' : 'primary'}>
              {line.name}
            </AppText>
            <AppText variant="subhead" tone="secondary" numeric style={!large && styles.detail}>
              {line.detail}
            </AppText>
          </View>
        ))}
        {lines.length > MAX_LINES && (
          <AppText variant="footnote" tone="secondary">
            + {plural(lines.length - MAX_LINES, 'more exercise')}
          </AppText>
        )}
      </View>

      {done && summary && <Stats summary={summary} units={units} />}

      <View style={styles.actions}>
        {(item.status === 'planned' || item.status === 'missed' || item.status === 'in_progress') &&
          (item.date > today ? (
            <Button
              title={`Start early${position}`}
              accessibilityLabel={total > 1 ? `Start workout${spokenPosition} early` : undefined}
              variant="secondary"
              fullWidth
              onPress={onStart}
            />
          ) : (
            <Button
              title={`${verb} Workout${position}`}
              accessibilityLabel={total > 1 ? `${verb} workout${spokenPosition}` : undefined}
              icon="play.fill"
              fullWidth
              onPress={onStart}
            />
          ))}
        {item.status === 'skipped' && (
          <Button
            title={`Start anyway${position}`}
            accessibilityLabel={total > 1 ? `Start workout${spokenPosition} anyway` : undefined}
            variant="secondary"
            fullWidth
            onPress={onStart}
          />
        )}
        {done && (
          <>
            <Button title="View summary" variant="secondary" icon="list.bullet" fullWidth onPress={onViewSummary} />
            <View style={styles.buttonRow}>
              <Button title="Reopen" variant="ghost" size="sm" icon="arrow.uturn.backward" onPress={onReopen} />
              <Button title="Repeat" variant="ghost" size="sm" icon="arrow.clockwise" onPress={onRepeat} />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function toneColor(tone: TextTone) {
  return ({ accent: 'accentText', success: 'successFill', warning: 'warningFill', secondary: 'textSecondary' } as const)[
    tone as 'accent' | 'success' | 'warning' | 'secondary'
  ];
}

function MetaLine({ item, summary, today }: { item: DayItem; summary?: SessionSummary; today: ISODate }) {
  const shifts = usePlanShifts().data ?? [];
  const parts: string[] = [];
  const spoken: string[] = [];
  const add = (text: string, words = text) => {
    parts.push(text);
    spoken.push(words);
  };
  if (item.status === 'missed') add(`Scheduled ${formatShortDate(item.date)}`);
  // A push forward moved it here from the date the plan first gave it (spec 2.5). Shown for a week
  // after the push, so a program's later workouts don't all say it for good.
  const movedFrom = movedFromDate(item.occurrence, shifts, today);
  if (movedFrom) add(`Moved from ${formatShortDate(movedFrom)}`);
  if (item.completedOn) add(`Done ${formatShortDate(item.completedOn)}`);
  if (item.extra === 'repeat') add('Repeated workout');
  if (item.extra === 'late' && item.scheduledFor) add(`Scheduled ${formatShortDate(item.scheduledFor)}`);
  if (summary && item.status === 'partial') add(`${summary.exercisesDone} of ${summary.exercisesTotal} exercises done`);
  if (!summary && item.workout?.estimatedMinutes) add(`~${item.workout.estimatedMinutes} min`, `about ${plural(item.workout.estimatedMinutes, 'minute')}`);
  if (!summary && item.workout) {
    const sets = item.workout.blocks.flatMap((b) => b.exercises).flatMap((e) => e.sets).filter((s) => s.kind !== 'warmup').length;
    add(plural(sets, 'working set'));
  }
  return (
    <AppText variant="subhead" tone="secondary" accessibilityLabel={spoken.join(', ')}>
      {parts.join('  ·  ')}
    </AppText>
  );
}

function Stats({ summary, units }: { summary: SessionSummary; units: UnitSystem }) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const volume = formatLoadValue(summary.volumeKg, units);
  return (
    // Large text: the tiles stack instead of splitting the width three ways.
    <View style={[styles.stats, large && styles.statsStacked, { borderColor: colors.border }]}>
      <Stat label="Volume" value={volume} unit={unitLabel(units)} spoken={`Volume: ${volume} ${units === 'imperial' ? 'pounds' : 'kilograms'}`} />
      {summary.minutes !== undefined && (
        <Stat label="Time" value={formatDuration(summary.minutes)} spoken={`Time: ${spokenDuration(Math.round(summary.minutes) * 60)}`} />
      )}
      <View
        style={[styles.stat, large && styles.statStacked]}
        accessible
        accessibilityLabel={`Records: ${summary.prCount > 0 ? plural(summary.prCount, 'personal record') : 'none'}`}
      >
        <AppText variant="caption" tone="secondary">
          Records
        </AppText>
        {summary.prCount > 0 ? <PRBadge label={plural(summary.prCount, 'PR')} /> : <AppText variant="headline">—</AppText>}
      </View>
    </View>
  );
}

/** One label + value tile, read by VoiceOver as one item ("Volume: 12,340 pounds"). */
function Stat({ label, value, unit, spoken }: { label: string; value: string; unit?: string; spoken: string }) {
  const { large } = useTextScale();
  return (
    <View style={[styles.stat, large && styles.statStacked]} accessible accessibilityLabel={spoken}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <AppText variant="headline" weight="800" numeric>
        {value}
        {unit && (
          <AppText variant="footnote" tone="secondary">
            {` ${unit}`}
          </AppText>
        )}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card + 4,
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.lg,
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    right: -28,
    top: 36,
    opacity: 0.07,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  menu: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  wrap: {
    flexWrap: 'wrap',
  },
  grow: {
    flexGrow: 1,
    flexShrink: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  titleBlock: {
    gap: spacing.xs,
  },
  lines: {
    gap: spacing.sm,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  lineStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 0,
  },
  detail: {
    flexShrink: 1,
    textAlign: 'right',
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  statsStacked: {
    flexDirection: 'column',
    gap: spacing.md,
  },
  stat: {
    flex: 1,
    gap: spacing.xs,
  },
  statStacked: {
    flex: 0,
  },
  actions: {
    gap: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  flex: {
    flex: 1,
  },
});

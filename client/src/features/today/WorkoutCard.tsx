import type { SFSymbol } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, PRBadge, type TextTone } from '@/components/ui';
import { countsForPRs, effectiveLoadKg } from '@/data/calculations';
import type { Exercise, ISODate, PlanWorkout, SessionExercise, UnitSystem } from '@/data/types';
import { formatDuration, formatLoad, formatLoadValue, formatRepTarget, formatShortDate, plural, unitLabel } from '@/lib/format';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import type { DayItem, DayItemStatus, SessionSummary } from './agenda';

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
};

const STATUS: Record<DayItemStatus, { label: string; icon: SFSymbol; tone: TextTone }> = {
  planned: { label: 'Planned', icon: 'calendar', tone: 'accent' },
  in_progress: { label: 'In progress', icon: 'play.circle.fill', tone: 'accent' },
  completed: { label: 'Done', icon: 'checkmark.circle.fill', tone: 'success' },
  partial: { label: 'Partial', icon: 'circle.lefthalf.filled', tone: 'warning' },
  missed: { label: 'Missed', icon: 'exclamationmark.circle.fill', tone: 'warning' },
  skipped: { label: 'Skipped', icon: 'forward.end.fill', tone: 'tertiary' },
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
  outerScheme,
}: Props & { outerScheme: 'light' | 'dark' }) {
  const { colors } = useAppTheme();
  const status = STATUS[item.status];
  const done = item.status === 'completed' || item.status === 'partial';
  const position = total > 1 ? ` ${index + 1}/${total}` : '';
  const isCore = /core|abs/i.test(item.name);

  const lines = done && item.session ? sessionLines(item.session.blocks.flatMap((b) => b.exercises), exercisesById, units) : planLines(item.workout, exercisesById);

  return (
    <View
      accessibilityLabel={`${item.name}, ${status.label}${item.plan ? `, ${item.plan.name}` : ''}`}
      style={[
        styles.card,
        {
          backgroundColor: colors.chrome,
          borderColor: outerScheme === 'dark' ? colors.border : colors.chrome,
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

      <View style={styles.topRow}>
        <AppText variant="label" tone="secondary" numberOfLines={1} style={styles.flex}>
          {item.plan?.name ?? 'Workout'}
        </AppText>
        <View style={[styles.statusPill, { backgroundColor: colors.input }]}>
          <Icon name={status.icon} color={colors[toneColor(status.tone)]} size={13} />
          <AppText variant="caption" weight="700" tone={status.tone}>
            {status.label}
          </AppText>
        </View>
      </View>

      <View style={styles.titleBlock}>
        <AppText variant="largeTitle" numberOfLines={2}>
          {item.name}
        </AppText>
        <MetaLine item={item} summary={summary} />
      </View>

      <View style={styles.lines}>
        {lines.slice(0, MAX_LINES).map((line) => (
          <View key={line.key} style={styles.line}>
            <AppText variant="subhead" weight="600" numberOfLines={1} style={styles.flex} tone={line.muted ? 'tertiary' : 'primary'}>
              {line.name}
            </AppText>
            <AppText variant="subhead" tone={line.muted ? 'tertiary' : 'secondary'} numeric numberOfLines={1}>
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
            <Button title={`Start early${position}`} variant="secondary" fullWidth onPress={onStart} />
          ) : (
            <Button
              title={`${item.status === 'in_progress' ? 'Resume' : 'Start'} Workout${position}`}
              icon="play.fill"
              fullWidth
              onPress={onStart}
            />
          ))}
        {item.status === 'skipped' && <Button title={`Start anyway${position}`} variant="secondary" fullWidth onPress={onStart} />}
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
  return ({ accent: 'accentText', success: 'successFill', warning: 'warningFill', tertiary: 'textTertiary' } as const)[
    tone as 'accent' | 'success' | 'warning' | 'tertiary'
  ];
}

function MetaLine({ item, summary }: { item: DayItem; summary?: SessionSummary }) {
  const parts: string[] = [];
  if (item.status === 'missed') parts.push(`Scheduled ${formatShortDate(item.date)}`);
  if (item.completedOn) parts.push(`Done ${formatShortDate(item.completedOn)}`);
  if (item.extra === 'repeat') parts.push('Repeated workout');
  if (item.extra === 'late' && item.scheduledFor) parts.push(`Scheduled ${formatShortDate(item.scheduledFor)}`);
  if (summary && item.status === 'partial') parts.push(`${summary.exercisesDone} of ${summary.exercisesTotal} exercises done`);
  if (!summary && item.workout?.estimatedMinutes) parts.push(`~${item.workout.estimatedMinutes} min`);
  if (!summary && item.workout) {
    const sets = item.workout.blocks.flatMap((b) => b.exercises).flatMap((e) => e.sets).filter((s) => s.kind !== 'warmup').length;
    parts.push(plural(sets, 'working set'));
  }
  return (
    <AppText variant="subhead" tone="secondary" numberOfLines={2}>
      {parts.join('  ·  ')}
    </AppText>
  );
}

function Stats({ summary, units }: { summary: SessionSummary; units: UnitSystem }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.stats, { borderColor: colors.border }]}>
      <Stat label="Volume" value={formatLoadValue(summary.volumeKg, units)} unit={unitLabel(units)} />
      {summary.minutes !== undefined && <Stat label="Time" value={formatDuration(summary.minutes)} />}
      <View style={styles.stat}>
        <AppText variant="caption" tone="secondary">
          Records
        </AppText>
        {summary.prCount > 0 ? <PRBadge label={plural(summary.prCount, 'PR')} /> : <AppText variant="headline">—</AppText>}
      </View>
    </View>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
      <AppText variant="headline" weight="800" numeric numberOfLines={1}>
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

type Line = { key: string; name: string; detail: string; muted?: boolean };

function planLines(workout: PlanWorkout | undefined, exercisesById: Map<string, Exercise>): Line[] {
  if (!workout) return [];
  return workout.blocks.flatMap((block) =>
    block.exercises.map((pe) => {
      const working = pe.sets.filter((s) => s.kind !== 'warmup');
      const first = working[0];
      const detail = first?.kind === 'timed_hold' ? `${working.length} × ${first.targetDurationSec ?? 0} s` : `${working.length} × ${formatRepTarget(first?.targetReps)}`;
      const prefix = block.type === 'superset' ? 'SS · ' : block.type === 'circuit' ? 'Circuit · ' : '';
      return { key: pe.id, name: `${prefix}${exercisesById.get(pe.exerciseId)?.name ?? 'Exercise'}`, detail };
    }),
  );
}

function sessionLines(exercises: SessionExercise[], exercisesById: Map<string, Exercise>, units: UnitSystem): Line[] {
  return exercises.map((se) => {
    const exercise = exercisesById.get(se.exerciseId);
    const name = exercise?.name ?? 'Exercise';
    if (se.skipped || !exercise) return { key: se.id, name, detail: 'Skipped', muted: true };
    const working = se.sets.filter((s) => s.kind !== 'warmup');
    const holds = working.filter((s) => s.kind === 'timed_hold');
    if (holds.length) return { key: se.id, name, detail: `${holds.length} × ${Math.max(...holds.map((s) => s.durationSec ?? 0))} s` };
    const sets = plural(working.length, 'set');

    if (exercise.isBodyweight) {
      // Show what the lifter added (or how many reps), not bodyweight plus load.
      const added = Math.max(0, ...working.map((s) => s.addedLoadKg ?? 0));
      const reps = Math.max(0, ...working.filter((s) => (s.addedLoadKg ?? 0) === added).map((s) => s.reps ?? 0));
      return { key: se.id, name, detail: added > 0 ? `${sets} · +${formatLoad(added, units)} × ${reps}` : `${sets} · ${reps} reps` };
    }

    let top: { load: number; reps: number } | undefined;
    for (const set of working) {
      const load = countsForPRs(set) ? effectiveLoadKg(set, exercise) : undefined;
      if (load !== undefined && set.reps && (!top || load > top.load)) top = { load, reps: set.reps };
    }
    return { key: se.id, name, detail: top ? `${sets} · ${formatLoad(top.load, units)} × ${top.reps}` : sets };
  });
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
    right: -28,
    top: 36,
    opacity: 0.07,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  stats: {
    flexDirection: 'row',
    gap: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  stat: {
    flex: 1,
    gap: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  flex: {
    flex: 1,
  },
});

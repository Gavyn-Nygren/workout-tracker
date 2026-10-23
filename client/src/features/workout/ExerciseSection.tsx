import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Icon } from '@/components/ui';
import type { Exercise, LoggedSet, SessionExercise, UnitSystem } from '@/data/types';
import { formatRepTarget, unitLabel } from '@/lib/format';
import { formatClock } from '@/hooks/useNow';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { SET_COLUMNS, SetRow } from './SetRow';

type Props = {
  entry: SessionExercise;
  exercise: Exercise | undefined;
  /** "A1", "A2" inside supersets and circuits. */
  label?: string;
  previous: (LoggedSet | undefined)[];
  units: UnitSystem;
  effortScale: 'rpe' | 'rir';
  prSetIds: ReadonlySet<string>;
  onChangeSet: (setId: string, patch: Partial<LoggedSet>) => void;
  onToggleSet: (set: LoggedSet) => void;
  onOpenSet: (setId: string) => void;
  onAddSet: () => void;
  onOpenMenu: () => void;
  onCamera: () => void;
  onUnskip: () => void;
};

function targetSummary(entry: SessionExercise): string {
  const working = entry.sets.filter((s) => s.kind !== 'warmup');
  const target = working[0]?.target;
  const parts: string[] = [];
  if (target?.kind === 'timed_hold') parts.push(`${working.length} × ${target.targetDurationSec ?? 0} s`);
  else if (target?.targetReps !== undefined) parts.push(`${working.length} × ${formatRepTarget(target.targetReps)}`);
  else parts.push(`${working.length} sets`);
  if (target?.restSec) parts.push(`Rest ${formatClock(target.restSec)}`);
  if (target?.tempo) parts.push(`Tempo ${target.tempo}`);
  return parts.join(' · ');
}

/** One exercise in the active workout: header, set table, and Add set. */
export function ExerciseSection(props: Props) {
  const { entry, exercise, label, previous, units, effortScale, prSetIds, onChangeSet, onToggleSet, onOpenSet, onAddSet, onOpenMenu, onCamera, onUnskip } = props;
  const { colors } = useAppTheme();
  const name = exercise?.name ?? 'Exercise';
  let workingNumber = 0;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        {label && (
          <View style={[styles.letter, { backgroundColor: colors.accentSubtle }]}>
            <AppText variant="caption" weight="800" tone="accent">
              {label}
            </AppText>
          </View>
        )}
        <View style={styles.flex}>
          <AppText variant="headline" weight="700" numberOfLines={2} tone={entry.skipped ? 'tertiary' : 'primary'}>
            {name}
          </AppText>
          <AppText variant="footnote" tone="secondary" numberOfLines={1}>
            {entry.skipped ? 'Skipped' : targetSummary(entry)}
          </AppText>
        </View>
        {exercise?.formAnalysis && !entry.skipped && (
          <Pressable onPress={onCamera} accessibilityRole="button" accessibilityLabel={`Record a set of ${name} for form analysis`} hitSlop={8} style={[styles.iconButton, { backgroundColor: colors.accentSubtle }]}>
            <Icon name="video.fill" color={colors.accentText} size={16} />
          </Pressable>
        )}
        <Pressable onPress={onOpenMenu} accessibilityRole="button" accessibilityLabel={`${name} options`} hitSlop={8} style={[styles.iconButton, { backgroundColor: colors.input }]}>
          <Icon name="ellipsis" color={colors.text} size={16} />
        </Pressable>
      </View>

      {entry.notes && !entry.skipped && (
        <View style={styles.note}>
          <Icon name="note.text" color={colors.textSecondary} size={13} />
          <AppText variant="footnote" tone="secondary" style={styles.flex}>
            {entry.notes}
          </AppText>
        </View>
      )}

      {entry.skipped ? (
        <View style={styles.skipped}>
          <Button title="Undo skip" variant="ghost" size="sm" icon="arrow.uturn.backward" onPress={onUnskip} />
        </View>
      ) : (
        <>
          <View style={styles.tableHeader} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <AppText variant="caption" tone="tertiary" weight="700" style={[styles.headCell, { width: SET_COLUMNS.set, textAlign: 'center' }]}>
              SET
            </AppText>
            <AppText variant="caption" tone="tertiary" weight="700" style={[styles.headCell, styles.flex]}>
              PREVIOUS
            </AppText>
            <AppText variant="caption" tone="tertiary" weight="700" style={[styles.headCell, { width: SET_COLUMNS.load, textAlign: 'center' }]}>
              {exercise?.isBodyweight ? `+${unitLabel(units).toUpperCase()}` : unitLabel(units).toUpperCase()}
            </AppText>
            <AppText variant="caption" tone="tertiary" weight="700" style={[styles.headCell, { width: SET_COLUMNS.reps, textAlign: 'center' }]}>
              {entry.sets.some((s) => s.kind === 'timed_hold') ? 'SEC' : 'REPS'}
            </AppText>
            <View style={{ width: SET_COLUMNS.check, alignItems: 'center' }}>
              <Icon name="checkmark" color={colors.textTertiary} size={12} weight="bold" />
            </View>
          </View>

          {entry.sets.map((set, i) => {
            if (set.kind !== 'warmup') workingNumber++;
            return (
              <SetRow
                key={set.id}
                set={set}
                number={set.kind === 'warmup' ? i + 1 : workingNumber}
                previous={previous[i]}
                exercise={exercise}
                units={units}
                effortScale={effortScale}
                isPR={prSetIds.has(set.id)}
                onChange={(patch) => onChangeSet(set.id, patch)}
                onToggle={() => onToggleSet(set)}
                onOpenDetail={() => onOpenSet(set.id)}
              />
            );
          })}

          <View style={styles.footer}>
            <Button title="Add set" variant="ghost" size="sm" icon="plus" onPress={onAddSet} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md + 2,
    paddingBottom: spacing.sm,
  },
  letter: {
    minWidth: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md + 2,
    paddingBottom: spacing.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  headCell: {
    letterSpacing: 0.5,
  },
  skipped: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
  },
  flex: {
    flex: 1,
  },
});

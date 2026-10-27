import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { AppText, Button, Icon } from '@/components/ui';
import type { Exercise, LoggedSet, SessionExercise, UnitSystem } from '@/data/types';
import { formatRepTarget, unitLabel } from '@/lib/format';
import { formatClock, spokenDuration } from '@/hooks/useNow';
import { DENSE_TEXT_MAX, useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { opacity, radius, spacing } from '@/theme/tokens';
import { isFormAnalysisSupported } from '../form/capability';
import { suggestionLine, type SuggestionLine } from './progression';
import { SetRow, useSetColumns } from './SetRow';
import { setNumber } from './workoutReducer';

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
  /** Tapping the progression reason line, while "Use last time's weight" can still apply. */
  onSuggestion: () => void;
  /** The section's place in its card, and each set row's place in the section, for scrolling to a set. */
  onLayout?: (e: LayoutChangeEvent) => void;
  onSetLayout?: (setId: string, e: LayoutChangeEvent) => void;
};

/** "3 × 8-12 · Rest 1:30"; `spoken` says "Rest 1 minute 30 seconds" so VoiceOver doesn't read a time of day. */
function targetSummary(entry: SessionExercise, spoken = false): string {
  const working = entry.sets.filter((s) => s.kind !== 'warmup');
  const target = working[0]?.target;
  const parts: string[] = [];
  if (target?.kind === 'timed_hold') parts.push(`${working.length} × ${target.targetDurationSec ?? 0} s`);
  else if (target?.targetReps !== undefined) parts.push(`${working.length} × ${formatRepTarget(target.targetReps)}`);
  else parts.push(`${working.length} sets`);
  if (target?.restSec) parts.push(`Rest ${spoken ? spokenDuration(target.restSec) : formatClock(target.restSec)}`);
  if (target?.tempo) parts.push(`Tempo ${target.tempo}`);
  return parts.join(' · ');
}

/** One exercise in the active workout: header, set table, and Add set. */
export function ExerciseSection(props: Props) {
  const { entry, exercise, label, previous, units, effortScale, prSetIds, onChangeSet, onToggleSet, onOpenSet, onAddSet, onOpenMenu, onCamera, onUnskip, onSuggestion, onLayout, onSetLayout } = props;
  const { colors } = useAppTheme();
  const cols = useSetColumns();
  const name = exercise?.name ?? 'Exercise';
  // Hidden once undone, and while the exercise is skipped.
  const reason = suggestionLine(entry, units);
  // Header labels grow with the set numbers, but no further.
  const head = { variant: 'caption', tone: 'secondary', weight: '700', maxFontSizeMultiplier: DENSE_TEXT_MAX } as const;

  return (
    <View style={styles.section} onLayout={onLayout}>
      <View style={styles.header}>
        {label && (
          // The letter is part of the heading's spoken label below.
          <View style={[styles.letter, { backgroundColor: colors.accentSubtle }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <AppText variant="caption" weight="800" tone="accent" maxFontSizeMultiplier={DENSE_TEXT_MAX}>
              {label}
            </AppText>
          </View>
        )}
        <View style={styles.flex}>
          <AppText
            variant="headline"
            weight="700"
            tone={entry.skipped ? 'secondary' : 'primary'}
            // A heading per exercise, so the VoiceOver rotor can jump between them.
            accessibilityRole="header"
            accessibilityLabel={`${label ? `${label}, ` : ''}${name}${entry.skipped ? ', skipped' : ''}`}
          >
            {name}
          </AppText>
          <AppText variant="footnote" tone="secondary" accessibilityLabel={entry.skipped ? undefined : targetSummary(entry, true)}>
            {entry.skipped ? 'Skipped' : targetSummary(entry)}
          </AppText>
          {reason && <ReasonLine line={reason} onPress={onSuggestion} />}
        </View>
        {/* Hidden on phones older than iPhone 12 (spec 2.2). */}
        {exercise?.formAnalysis && !entry.skipped && isFormAnalysisSupported() && (
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
          <Button title="Undo skip" variant="ghost" size="sm" icon="arrow.uturn.backward" onPress={onUnskip} accessibilityLabel={`Undo skip ${name}`} />
        </View>
      ) : (
        <>
          {/* Hidden from VoiceOver: each field's label already names its column and unit. */}
          <View style={[styles.tableHeader, { gap: cols.gap }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <AppText {...head} style={[styles.headCell, { minWidth: cols.set, textAlign: 'center' }]}>
              SET
            </AppText>
            {cols.stacked ? (
              // PREVIOUS moves under each row's inputs at large text sizes.
              <View style={styles.flex} />
            ) : (
              <AppText {...head} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[styles.headCell, styles.flex]}>
                PREVIOUS
              </AppText>
            )}
            <AppText {...head} style={[styles.headCell, { width: cols.load, textAlign: 'center' }]}>
              {exercise?.isBodyweight ? `${entry.sets.length && entry.sets.every((s) => s.kind === 'assisted') ? '−' : '+'}${unitLabel(units).toUpperCase()}` : unitLabel(units).toUpperCase()}
            </AppText>
            <AppText {...head} style={[styles.headCell, { width: cols.reps, textAlign: 'center' }]}>
              {entry.sets.some((s) => s.kind === 'timed_hold') ? 'SEC' : 'REPS'}
            </AppText>
            <View style={{ width: cols.check, alignItems: 'center' }}>
              <Icon name="checkmark" color={colors.textSecondary} size={12} weight="bold" />
            </View>
          </View>

          {entry.sets.map((set, i) => (
            <SetRow
              key={set.id}
              set={set}
              number={setNumber(entry.sets, set)}
              previous={previous[i]}
              exercise={exercise}
              exerciseName={name}
              units={units}
              effortScale={effortScale}
              isPR={prSetIds.has(set.id)}
              onChange={(patch) => onChangeSet(set.id, patch)}
              onToggle={() => onToggleSet(set)}
              onOpenDetail={() => onOpenSet(set.id)}
              onLayout={onSetLayout && ((e) => onSetLayout(set.id, e))}
            />
          ))}

          <View style={styles.footer}>
            <Button title="Add set" variant="ghost" size="sm" icon="plus" onPress={onAddSet} accessibilityLabel={`Add set to ${name}`} />
          </View>
        </>
      )}
    </View>
  );
}

/**
 * The progression rule's reason line (G3.9 decision A): what changed and why. Increases read in
 * the positive green, deloads and holds stay neutral (decreases are never red), with the same
 * arrows as the Progress changes. While a set can still go back, tapping it offers last time's
 * weight; otherwise it's one VoiceOver element with the same words.
 */
function ReasonLine({ line, onPress }: { line: SuggestionLine; onPress: () => void }) {
  const { colors } = useAppTheme();
  const { fontScale } = useTextScale();
  const up = line.direction === 'up';
  const content = (
    <>
      <Icon
        name={up ? 'arrowtriangle.up.fill' : line.direction === 'down' ? 'arrowtriangle.down.fill' : 'equal'}
        color={up ? colors.successFill : colors.textTertiary}
        size={Math.round(10 * Math.min(Math.max(fontScale, 1), 2))}
      />
      <AppText variant="footnote" weight={line.direction === 'same' ? undefined : '600'} tone={up ? 'success' : 'secondary'} style={styles.reasonText}>
        {line.text}
      </AppText>
    </>
  );
  if (!line.undoable) {
    return (
      <View accessible accessibilityLabel={line.label} style={styles.reason}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={line.label}
      accessibilityHint="Offers to use last time’s weight instead."
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [styles.reason, pressed && { opacity: opacity.pressed }]}
    >
      {content}
    </Pressable>
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
    minHeight: 28,
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
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingTop: 2,
  },
  reasonText: {
    flexShrink: 1,
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

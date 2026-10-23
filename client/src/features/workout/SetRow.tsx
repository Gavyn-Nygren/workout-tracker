import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Icon, NumberField, PRBadge, SetTag, setTagLabel } from '@/components/ui';
import type { Exercise, LoggedSet, UnitSystem } from '@/data/types';
import { kgToLb, lbToKg } from '@/data/units';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatLoadValue, plural } from '@/lib/format';
import { DENSE_TEXT_MAX, useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { motion, radius, spacing } from '@/theme/tokens';
import { setName } from './workoutReducer';

/** Column widths at the default text size, shared by the table header and rows. */
export const SET_COLUMNS = { set: 34, load: 74, reps: 58, check: 40 } as const;

/** From this text size PREVIOUS leaves the row and becomes a caption under the inputs. */
const STACK_PREVIOUS_AT = 1.3;

/**
 * Set-table geometry for the current text size (user's pick: one row per set at every size).
 * Set, weight and reps columns grow with the text up to DENSE_TEXT_MAX; the check stays 40.
 * At 1.5× on a 375 pt phone the first line is 51 + 111 + 87 + 40 + 3 × 6 gaps = 307 of ~319 pt.
 */
export function useSetColumns() {
  const { fontScale } = useTextScale();
  const k = Math.min(Math.max(fontScale, 1), DENSE_TEXT_MAX);
  const stacked = fontScale >= STACK_PREVIOUS_AT;
  // NumberField widens itself by min(fontScale, maxScale); with maxScale = DENSE_TEXT_MAX that's k, so hand it the base width.
  return {
    set: SET_COLUMNS.set * k,
    load: SET_COLUMNS.load * k,
    reps: SET_COLUMNS.reps * k,
    check: SET_COLUMNS.check,
    gap: stacked ? spacing.xs + 2 : spacing.sm,
    /** PREVIOUS shows as a caption on a second line instead of a column. */
    stacked,
    fieldWidth: (column: number) => column / k,
  };
}

type Props = {
  set: LoggedSet;
  /** Number among this exercise's working sets (or among its warm-ups), as from `setNumber`. */
  number: number;
  previous?: LoggedSet;
  exercise: Exercise | undefined;
  /** For VoiceOver, so the check reads "Bench Press, set 1…" even inside a superset. */
  exerciseName: string;
  units: UnitSystem;
  effortScale: 'rpe' | 'rir';
  isPR: boolean;
  onChange: (patch: Partial<LoggedSet>) => void;
  onToggle: () => void;
  onOpenDetail: () => void;
};

const toDisplay = (kg: number | undefined, units: UnitSystem) =>
  kg === undefined ? undefined : Math.round((units === 'imperial' ? kgToLb(kg) : kg) * 100) / 100;
const fromDisplay = (value: number | undefined, units: UnitSystem) =>
  value === undefined ? undefined : units === 'imperial' ? lbToKg(value) : value;

function previousLabel(prev: LoggedSet, exercise: Exercise | undefined, units: UnitSystem): string {
  if (prev.kind === 'timed_hold') return `${prev.durationSec ?? 0} s`;
  if (exercise?.isBodyweight) return prev.addedLoadKg ? `+${formatLoadValue(prev.addedLoadKg, units)} × ${prev.reps ?? 0}` : `${prev.reps ?? 0} reps`;
  return `${formatLoadValue(prev.loadKg ?? 0, units)} × ${prev.reps ?? 0}`;
}

const unitWord = (units: UnitSystem) => (units === 'imperial' ? 'pounds' : 'kilograms');

/** "225 pounds, 5 reps" rather than "225 times 5". */
function spokenPrevious(prev: LoggedSet, exercise: Exercise | undefined, units: UnitSystem): string {
  if (prev.kind === 'timed_hold') return plural(prev.durationSec ?? 0, 'second');
  const reps = plural(prev.reps ?? 0, 'rep');
  if (exercise?.isBodyweight) return prev.addedLoadKg ? `plus ${formatLoadValue(prev.addedLoadKg, units)} ${unitWord(units)}, ${reps}` : reps;
  return `${formatLoadValue(prev.loadKg ?? 0, units)} ${unitWord(units)}, ${reps}`;
}

/** One row of the dense set table (spec 2.13): set, previous, load, reps, complete. */
export function SetRow({ set, number, previous, exercise, exerciseName, units, effortScale, isPR, onChange, onToggle, onOpenDetail }: Props) {
  const { colors } = useAppTheme();
  const cols = useSetColumns();
  const done = Boolean(set.completedAt);
  const isHold = set.kind === 'timed_hold';
  const isBodyweight = exercise?.isBodyweight ?? false;
  const loadKey = isBodyweight ? 'addedLoadKg' : 'loadKg';
  const load = toDisplay(isBodyweight ? set.addedLoadKg : set.loadKg, units);

  const meta: string[] = [];
  if (set.rir !== undefined) meta.push(effortScale === 'rpe' ? `RPE ${10 - set.rir}` : `RIR ${set.rir}`);
  if (set.tempo) meta.push(`Tempo ${set.tempo}`);
  if (set.partialReps) meta.push(`+${set.partialReps} partials`);
  if (set.notes) meta.push(set.notes);
  const modifiers = set.modifiers;
  const showMeta = meta.length > 0 || modifiers.length > 0 || isPR;

  // VoiceOver: fields carry the set and unit; the check carries the exercise and what's logged.
  const name = setName(set.kind, number);
  const kindSuffix = set.kind !== 'normal' && set.kind !== 'warmup' ? `, ${setTagLabel(set.kind)}` : '';
  const logged = isHold
    ? [set.durationSec ? plural(set.durationSec, 'second') : undefined]
    : [load ? `${isBodyweight ? 'plus ' : ''}${load} ${unitWord(units)}` : undefined, set.reps ? plural(set.reps, 'rep') : undefined];
  const checkLabel = [exerciseName, `${name.toLowerCase()}${kindSuffix}`, ...logged].filter(Boolean).join(', ');

  const copyPrevious = () =>
    previous &&
    onChange(isHold ? { durationSec: previous.durationSec } : { [loadKey]: isBodyweight ? previous.addedLoadKg : previous.loadKg, reps: previous.reps });
  const previousA11y = previous ? `Last time ${spokenPrevious(previous, exercise, units)}. Copy into this set` : undefined;

  // Completing a set: the check pops and the green tint fades in (user's pick). Un-completing is instant.
  const reducedMotion = useReducedMotion();
  const tint = useRef(new Animated.Value(done ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const wasDone = useRef(done);
  useEffect(() => {
    if (done === wasDone.current) return;
    wasDone.current = done;
    if (!done) {
      tint.setValue(0);
      return;
    }
    Animated.timing(tint, { toValue: 1, duration: motion.normal, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    if (reducedMotion) return;
    pop.setValue(1);
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.15, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, speed: 20, bounciness: 10, useNativeDriver: true }),
    ]).start();
  }, [done, reducedMotion, tint, pop]);

  return (
    <View style={styles.wrap}>
      <Animated.View pointerEvents="none" style={[styles.tint, { backgroundColor: colors.successSubtle, opacity: tint }]} />
      <View style={[styles.row, { gap: cols.gap }]}>
        <Pressable
          onPress={onOpenDetail}
          accessibilityRole="button"
          accessibilityLabel={`${name}${kindSuffix}. Edit set type, effort, tempo, and notes`}
          hitSlop={6}
          // minWidth, not width: compact tags such as "Assist" are wider than a set number.
          style={[styles.setCell, { minWidth: cols.set }]}
        >
          {set.kind === 'normal' ? (
            <AppText variant="headline" weight="700" numeric maxFontSizeMultiplier={DENSE_TEXT_MAX}>
              {number}
            </AppText>
          ) : (
            <View>
              <SetTag tag={set.kind} compact />
            </View>
          )}
        </Pressable>

        {cols.stacked ? (
          <View style={styles.flex} />
        ) : previous ? (
          <Pressable onPress={copyPrevious} disabled={done} accessibilityRole="button" accessibilityLabel={previousA11y} style={styles.previous}>
            <AppText variant="subhead" tone="secondary" numeric numberOfLines={2} maxFontSizeMultiplier={DENSE_TEXT_MAX}>
              {previousLabel(previous, exercise, units)}
            </AppText>
          </Pressable>
        ) : (
          <View accessible accessibilityLabel="No previous set" style={styles.previous}>
            <AppText variant="subhead" tone="secondary" maxFontSizeMultiplier={DENSE_TEXT_MAX}>
              —
            </AppText>
          </View>
        )}

        <View style={{ width: cols.load }}>
          {!isHold && (
            <NumberField
              label={`${name} ${isBodyweight ? 'added weight' : 'weight'} in ${unitWord(units)}`}
              value={load}
              onChange={(v) => onChange({ [loadKey]: fromDisplay(v, units) })}
              decimal
              placeholder={isBodyweight ? '0' : '—'}
              width={cols.fieldWidth(cols.load)}
              maxScale={DENSE_TEXT_MAX}
            />
          )}
        </View>

        <NumberField
          label={isHold ? `${name} hold in seconds` : `${name} reps`}
          value={isHold ? set.durationSec : set.reps}
          onChange={(v) => onChange(isHold ? { durationSec: v } : { reps: v })}
          width={cols.fieldWidth(cols.reps)}
          maxScale={DENSE_TEXT_MAX}
          placeholder="—"
        />

        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Pressable
            onPress={onToggle}
            accessibilityRole="checkbox"
            accessibilityLabel={checkLabel}
            accessibilityState={{ checked: done }}
            hitSlop={6}
            style={[styles.check, { backgroundColor: done ? colors.successFill : colors.input }]}
          >
            <Icon name="checkmark" color={done ? '#FFFFFF' : colors.textSecondary} size={16} weight="bold" />
          </Pressable>
        </Animated.View>
      </View>

      {/* Large text: last time's numbers sit under the weight and reps fields, still tap to copy. */}
      {cols.stacked && previous && (
        <View style={[styles.lastLine, { width: cols.load + cols.reps + cols.check + cols.gap * 2 }]}>
          <Pressable onPress={copyPrevious} disabled={done} accessibilityRole="button" accessibilityLabel={previousA11y} hitSlop={8}>
            <AppText variant="footnote" tone="secondary" numeric maxFontSizeMultiplier={DENSE_TEXT_MAX}>
              {`Last ${previousLabel(previous, exercise, units)}`}
            </AppText>
          </Pressable>
        </View>
      )}

      {showMeta && (
        <View style={[styles.meta, { paddingLeft: cols.set + cols.gap }]}>
          {isPR && <PRBadge celebrate label="PR" />}
          {modifiers.map((m) => (
            <SetTag key={m} tag={m} />
          ))}
          {meta.length > 0 && (
            <AppText variant="caption" tone="secondary" numberOfLines={3} style={styles.metaText}>
              {meta.join(' · ')}
            </AppText>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tint: {
    position: 'absolute',
    inset: 0,
  },
  wrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  setCell: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  previous: {
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  check: {
    width: SET_COLUMNS.check,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastLine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-start',
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  metaText: {
    flexShrink: 1,
  },
  flex: {
    flex: 1,
  },
});

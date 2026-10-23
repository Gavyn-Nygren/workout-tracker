import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Icon, NumberField, PRBadge, SetTag } from '@/components/ui';
import type { Exercise, LoggedSet, UnitSystem } from '@/data/types';
import { kgToLb, lbToKg } from '@/data/units';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatLoadValue } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';
import { motion, radius, spacing } from '@/theme/tokens';

/** Column widths shared by the table header and rows. */
export const SET_COLUMNS = { set: 34, load: 74, reps: 58, check: 40 } as const;

type Props = {
  set: LoggedSet;
  /** 1-based number among this exercise's working sets; warm-ups and drops show a tag instead. */
  number: number;
  previous?: LoggedSet;
  exercise: Exercise | undefined;
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

function previousLabel(prev: LoggedSet | undefined, exercise: Exercise | undefined, units: UnitSystem): string {
  if (!prev) return '—';
  if (prev.kind === 'timed_hold') return `${prev.durationSec ?? 0} s`;
  if (exercise?.isBodyweight) return prev.addedLoadKg ? `+${formatLoadValue(prev.addedLoadKg, units)} × ${prev.reps ?? 0}` : `${prev.reps ?? 0} reps`;
  return `${formatLoadValue(prev.loadKg ?? 0, units)} × ${prev.reps ?? 0}`;
}

/** One row of the dense set table (spec 2.13): set, previous, load, reps, complete. */
export function SetRow({ set, number, previous, exercise, units, effortScale, isPR, onChange, onToggle, onOpenDetail }: Props) {
  const { colors } = useAppTheme();
  const done = Boolean(set.completedAt);
  const isHold = set.kind === 'timed_hold';
  const isBodyweight = exercise?.isBodyweight ?? false;
  const loadKey = isBodyweight ? 'addedLoadKg' : 'loadKg';

  const meta: string[] = [];
  if (set.rir !== undefined) meta.push(effortScale === 'rpe' ? `RPE ${10 - set.rir}` : `RIR ${set.rir}`);
  if (set.tempo) meta.push(`Tempo ${set.tempo}`);
  if (set.partialReps) meta.push(`+${set.partialReps} partials`);
  if (set.notes) meta.push(set.notes);
  const modifiers = set.modifiers;
  const showMeta = meta.length > 0 || modifiers.length > 0 || isPR;

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
      <View style={styles.row}>
        <Pressable
          onPress={onOpenDetail}
          accessibilityRole="button"
          accessibilityLabel={`Set ${number}${set.kind !== 'normal' ? `, ${set.kind.replace('_', ' ')}` : ''}. Edit set type, effort, tempo, and notes`}
          hitSlop={6}
          style={[styles.setCell, { width: SET_COLUMNS.set }]}
        >
          {set.kind === 'normal' ? (
            <AppText variant="headline" weight="700" numeric>
              {number}
            </AppText>
          ) : (
            <SetTag tag={set.kind} compact />
          )}
        </Pressable>

        <Pressable
          onPress={() =>
            previous &&
            onChange(
              isHold
                ? { durationSec: previous.durationSec }
                : { [loadKey]: isBodyweight ? previous.addedLoadKg : previous.loadKg, reps: previous.reps },
            )
          }
          disabled={!previous || done}
          accessibilityRole="button"
          accessibilityLabel={previous ? `Last time ${previousLabel(previous, exercise, units)}. Copy into this set` : 'No previous set'}
          style={styles.previous}
        >
          <AppText variant="subhead" tone="tertiary" numeric numberOfLines={1}>
            {previousLabel(previous, exercise, units)}
          </AppText>
        </Pressable>

        <View style={{ width: SET_COLUMNS.load }}>
          {!isHold && (
            <NumberField
              label={isBodyweight ? 'Added weight' : 'Weight'}
              value={toDisplay(isBodyweight ? set.addedLoadKg : set.loadKg, units)}
              onChange={(v) => onChange({ [loadKey]: fromDisplay(v, units) })}
              decimal
              placeholder={isBodyweight ? '0' : '—'}
              width={SET_COLUMNS.load}
            />
          )}
        </View>

        <NumberField
          label={isHold ? 'Seconds' : 'Reps'}
          value={isHold ? set.durationSec : set.reps}
          onChange={(v) => onChange(isHold ? { durationSec: v } : { reps: v })}
          width={SET_COLUMNS.reps}
          placeholder="—"
        />

        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Pressable
            onPress={onToggle}
            accessibilityRole="checkbox"
            accessibilityLabel={`Complete set ${number}`}
            accessibilityState={{ checked: done }}
            hitSlop={6}
            style={[styles.check, { backgroundColor: done ? colors.successFill : colors.input }]}
          >
            <Icon name="checkmark" color={done ? '#FFFFFF' : colors.textTertiary} size={16} weight="bold" />
          </Pressable>
        </Animated.View>
      </View>

      {showMeta && (
        <View style={styles.meta}>
          {isPR && <PRBadge celebrate label="PR" />}
          {modifiers.map((m) => (
            <SetTag key={m} tag={m} />
          ))}
          {meta.length > 0 && (
            <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.metaText}>
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
    gap: spacing.sm,
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
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingLeft: SET_COLUMNS.set + spacing.sm,
  },
  metaText: {
    flexShrink: 1,
  },
});

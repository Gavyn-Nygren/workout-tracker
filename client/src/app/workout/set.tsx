import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Chip, NotFoundState, NumberField, SectionHeader, Stepper, TextField, setTagLabel } from '@/components/ui';
import { effectiveLoadKg } from '@/data/calculations';
import { usePreferences } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { LoggedSet, SessionExercise, SetKind, SetModifier } from '@/data/types';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
import { setName, setNumber } from '@/features/workout/workoutReducer';
import { TempoField } from '@/features/plans/TempoField';
import { kgToLb, lbToKg } from '@/data/units';
import { formatLoad, plural, unitLabel } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const KINDS: SetKind[] = ['normal', 'warmup', 'drop', 'timed_hold', 'assisted'];
const MODIFIERS: SetModifier[] = ['amrap', 'to_failure', 'shortened_partials', 'lengthened_partials'];
/** Stored as RIR (spec 2.6); shown on the user's chosen scale. */
const RPE_STEPS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const RIR_STEPS = [5, 4, 3, 2, 1, 0];

/** Set details: kind, modifiers, effort, tempo, partial reps, notes (user's pick: RPE lives here). */
export default function SetDetailSheet() {
  const { colors } = useAppTheme();
  const { entry: entryId, set: setId } = useLocalSearchParams<{ entry: string; set: string }>();
  const { workout, exercisesById, dispatch } = useActiveWorkout();
  const preferences = usePreferences();
  // If preferences fail to load, the default scale is fine for editing a set.
  const { effortScale, units } = preferences.data ?? defaultPreferences;
  // Holds a deleted set on screen while the sheet closes, so "not found" doesn't flash.
  const [closing, setClosing] = useState<{ entry: SessionExercise; set: LoggedSet } | null>(null);

  // Wait for the user's effort scale so the RPE chips don't flash before RIR.
  if (preferences.isLoading) return <View style={[styles.blank, { backgroundColor: colors.cardElevated }]} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }} />;

  const liveEntry = workout?.session.blocks.flatMap((b) => b.exercises).find((e) => e.id === entryId);
  const liveSet = liveEntry?.sets.find((s) => s.id === setId);
  const found = liveEntry && liveSet ? { entry: liveEntry, set: liveSet } : closing;
  if (!found) return <NotFoundState thing="Set" icon="checkmark.circle" backLabel="Close" />;
  const { entry, set } = found;

  const exercise = exercisesById.get(entry.exerciseId);
  // Numbered like the set table, where warm-ups count separately.
  const title = setName(set.kind, setNumber(entry.sets, set));
  const update = (patch: Partial<LoggedSet>) => dispatch({ type: 'updateSet', entryId: entry.id, setId: set.id, patch });
  const toDisplay = (kg: number | undefined) => (kg === undefined ? undefined : Math.round((units === 'imperial' ? kgToLb(kg) : kg) * 100) / 100);
  const fromDisplay = (value: number) => (units === 'imperial' ? lbToKg(value) : value);
  // What the set counts as without an override (known once the set is done and has its bodyweight).
  const autoLoad = exercise ? effectiveLoadKg({ ...set, effectiveLoadOverrideKg: undefined }, exercise) : undefined;

  return (
    <ScrollView
      style={{ backgroundColor: colors.cardElevated }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      onAccessibilityEscape={() => router.back()}
    >
      <View style={styles.header}>
        <AppText variant="title2" accessibilityRole="header">
          {title}
        </AppText>
        <AppText variant="subhead" tone="secondary">
          {exercise?.name ?? 'Exercise'}
        </AppText>
      </View>

      <SectionHeader title="Set type" />
      <View style={styles.wrapRow}>
        {KINDS.map((kind) => (
          <Chip key={kind} role="radio" label={kind === 'normal' ? 'Normal' : setTagLabel(kind)} selected={set.kind === kind} onPress={() => update({ kind })} />
        ))}
      </View>

      <SectionHeader title="Modifiers" />
      <View style={styles.wrapRow}>
        {MODIFIERS.map((m) => (
          <Chip
            key={m}
            label={setTagLabel(m)}
            selected={set.modifiers.includes(m)}
            onPress={() => update({ modifiers: set.modifiers.includes(m) ? set.modifiers.filter((x) => x !== m) : [...set.modifiers, m] })}
          />
        ))}
      </View>

      <SectionHeader title={effortScale === 'rpe' ? 'Effort (RPE)' : 'Reps in reserve (RIR)'} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
        <Chip role="radio" label="None" accessibilityLabel={effortScale === 'rpe' ? 'No RPE' : 'No RIR'} selected={set.rir === undefined} onPress={() => update({ rir: undefined })} />
        {effortScale === 'rpe'
          ? RPE_STEPS.map((rpe) => (
              <Chip key={rpe} role="radio" label={String(rpe)} accessibilityLabel={`RPE ${rpe}`} selected={set.rir === 10 - rpe} onPress={() => update({ rir: 10 - rpe })} />
            ))
          : RIR_STEPS.map((rir) => (
              <Chip key={rir} role="radio" label={String(rir)} accessibilityLabel={`${plural(rir, 'rep')} in reserve`} selected={set.rir === rir} onPress={() => update({ rir })} />
            ))}
      </ScrollView>

      {set.modifiers.some((m) => m === 'shortened_partials' || m === 'lengthened_partials') && (
        <>
          <SectionHeader title="Partial reps" />
          <Stepper label="Partial reps" value={set.partialReps ?? 0} onChange={(partialReps) => update({ partialReps: partialReps || undefined })} />
        </>
      )}

      {exercise?.isBodyweight && set.kind !== 'timed_hold' && (
        <View style={styles.section}>
          <SectionHeader title="Counted load" />
          <NumberField
            label="Counted load"
            value={toDisplay(set.effectiveLoadOverrideKg)}
            onChange={(v) => update({ effectiveLoadOverrideKg: v === undefined || v <= 0 ? undefined : fromDisplay(v) })}
            unit={unitLabel(units)}
            decimal
            placeholder="Auto"
            width={120}
          />
          <AppText variant="footnote" tone="secondary">
            {set.kind === 'assisted' ? 'Bodyweight minus assistance' : 'Bodyweight plus added weight'}
            {autoLoad !== undefined ? ` (${formatLoad(autoLoad, units)})` : ''} counts toward volume and records. Enter a number to count a different load instead.
          </AppText>
        </View>
      )}

      <TempoField value={set.tempo} onChange={(tempo) => update({ tempo })} />
      <TextField label="Notes" value={set.notes ?? ''} onChangeText={(notes) => update({ notes: notes || undefined })} placeholder="Optional" />

      <View style={styles.footer}>
        <Button title="Done" fullWidth onPress={() => router.back()} />
        <Button
          title="Delete set"
          variant="ghost"
          icon="trash"
          onPress={() =>
            Alert.alert(`Delete ${title.toLowerCase()}?`, undefined, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  setClosing({ entry, set });
                  router.back();
                  dispatch({ type: 'removeSet', entryId: entry.id, setId: set.id });
                },
              },
            ])
          }
          style={styles.center}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  scrollRow: {
    gap: spacing.sm,
  },
  footer: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  center: {
    alignSelf: 'center',
  },
  blank: {
    flex: 1,
  },
});

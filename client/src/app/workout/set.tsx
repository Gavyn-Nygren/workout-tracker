import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Chip, NotFoundState, SectionHeader, Stepper, TextField, setTagLabel } from '@/components/ui';
import { usePreferences } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { LoggedSet, SessionExercise, SetKind, SetModifier } from '@/data/types';
import { useActiveWorkout } from '@/features/workout/ActiveWorkoutProvider';
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
  const effortScale = (preferences.data ?? defaultPreferences).effortScale;
  // Holds a deleted set on screen while the sheet closes, so "not found" doesn't flash.
  const [closing, setClosing] = useState<{ entry: SessionExercise; set: LoggedSet } | null>(null);

  // Wait for the user's effort scale so the RPE chips don't flash before RIR.
  if (preferences.isLoading) return <View style={[styles.blank, { backgroundColor: colors.cardElevated }]} />;

  const liveEntry = workout?.session.blocks.flatMap((b) => b.exercises).find((e) => e.id === entryId);
  const liveSet = liveEntry?.sets.find((s) => s.id === setId);
  const found = liveEntry && liveSet ? { entry: liveEntry, set: liveSet } : closing;
  if (!found) return <NotFoundState thing="Set" icon="checkmark.circle" backLabel="Close" />;
  const { entry, set } = found;

  const exercise = exercisesById.get(entry.exerciseId);
  const setNumber = entry.sets.indexOf(set) + 1;
  const update = (patch: Partial<LoggedSet>) => dispatch({ type: 'updateSet', entryId: entry.id, setId: set.id, patch });

  return (
    <ScrollView style={{ backgroundColor: colors.cardElevated }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <View style={styles.header}>
        <AppText variant="title2">{`Set ${setNumber}`}</AppText>
        <AppText variant="subhead" tone="secondary">
          {exercise?.name ?? 'Exercise'}
        </AppText>
      </View>

      <SectionHeader title="Set type" />
      <View style={styles.wrapRow}>
        {KINDS.map((kind) => (
          <Chip key={kind} label={kind === 'normal' ? 'Normal' : setTagLabel(kind)} selected={set.kind === kind} onPress={() => update({ kind })} />
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
        <Chip label="None" selected={set.rir === undefined} onPress={() => update({ rir: undefined })} />
        {effortScale === 'rpe'
          ? RPE_STEPS.map((rpe) => <Chip key={rpe} label={String(rpe)} selected={set.rir === 10 - rpe} onPress={() => update({ rir: 10 - rpe })} />)
          : RIR_STEPS.map((rir) => <Chip key={rir} label={String(rir)} selected={set.rir === rir} onPress={() => update({ rir })} />)}
      </ScrollView>

      {set.modifiers.some((m) => m === 'shortened_partials' || m === 'lengthened_partials') && (
        <>
          <SectionHeader title="Partial reps" />
          <Stepper label="Partial reps" value={set.partialReps ?? 0} onChange={(partialReps) => update({ partialReps: partialReps || undefined })} />
        </>
      )}

      <TextField
        label="Tempo"
        value={set.tempo ?? ''}
        onChangeText={(tempo) => update({ tempo: tempo || undefined })}
        placeholder="e.g. 3-1-1-0"
        hint="Down, pause, up, pause in seconds. Use X for explosive."
        autoCapitalize="characters"
      />
      <TextField label="Notes" value={set.notes ?? ''} onChangeText={(notes) => update({ notes: notes || undefined })} placeholder="Optional" />

      <View style={styles.footer}>
        <Button title="Done" fullWidth onPress={() => router.back()} />
        <Button
          title="Delete set"
          variant="ghost"
          icon="trash"
          onPress={() =>
            Alert.alert(`Delete set ${setNumber}?`, undefined, [
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

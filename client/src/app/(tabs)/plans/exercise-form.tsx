import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip, ErrorState, ListRow, NotFoundState, SectionHeader, SegmentedControl, Skeleton, TextField, Toggle, useToast } from '@/components/ui';
import { succeeded, useExercises, useSaveExercise } from '@/data/hooks';
import type { Equipment, Exercise, MuscleGroup } from '@/data/types';
import { newId } from '@/lib/id';
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '@/features/exercises/ExerciseList';
import { radius, spacing } from '@/theme/tokens';
import { readable } from '@/theme/layout';

const EQUIPMENT = Object.keys(EQUIPMENT_LABEL) as Equipment[];
const MUSCLES = Object.keys(MUSCLE_LABEL) as MuscleGroup[];

/**
 * Create or edit a custom exercise (spec 2.6: only the name is required). Linking a base movement
 * groups its stats with the built-in one and makes it eligible for form analysis.
 */
export default function ExerciseFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const exercises = useExercises();
  if (exercises.error) return <ErrorState fill title="Couldn't load your exercises" onRetry={() => exercises.refetch()} />;
  // Wait for the library so editing starts from the saved values, not blanks.
  if (exercises.isPending) return <Skeleton height={240} radius={radius.card} style={styles.loading} />;
  const existing = id ? exercises.data?.find((e) => e.id === id) : undefined;
  // An id that doesn't match must not quietly open a blank "New exercise" form.
  if (id && !existing) return <NotFoundState thing="Exercise" icon="dumbbell" />;
  return <ExerciseForm exercises={exercises.data ?? []} existing={existing} />;
}

function ExerciseForm({ exercises, existing }: { exercises: Exercise[]; existing?: Exercise }) {
  const id = existing?.id;
  const toast = useToast();
  const saveExercise = useSaveExercise();

  const [name, setName] = useState(existing?.name ?? '');
  const [equipment, setEquipment] = useState<Equipment | undefined>(existing?.equipment);
  const [muscles, setMuscles] = useState<MuscleGroup[]>(existing?.primaryMuscles ?? []);
  const [category, setCategory] = useState<Exercise['category']>(existing?.category ?? 'compound');
  const [isBodyweight, setIsBodyweight] = useState(existing?.isBodyweight ?? false);
  const [baseId, setBaseId] = useState<string | undefined>(existing?.baseMovementId);
  const [baseQuery, setBaseQuery] = useState('');
  const [instructions, setInstructions] = useState(existing?.instructions ?? '');
  const [mediaUrl, setMediaUrl] = useState(existing?.mediaUrl ?? '');
  const [showErrors, setShowErrors] = useState(false);

  const builtins = exercises.filter((e) => e.source === 'builtin');
  const base = builtins.find((e) => e.id === baseId);
  const baseMatches = baseQuery.trim() ? builtins.filter((e) => e.name.toLowerCase().includes(baseQuery.trim().toLowerCase())).slice(0, 6) : [];
  const duplicate = exercises.some((e) => e.id !== id && e.name.trim().toLowerCase() === name.trim().toLowerCase());
  const nameError = !name.trim() ? 'Give the exercise a name.' : duplicate ? 'An exercise with this name already exists.' : undefined;

  const save = async () => {
    if (saveExercise.isPending) return;
    if (nameError) {
      setShowErrors(true);
      return;
    }
    const now = new Date().toISOString();
    const exercise: Exercise = {
      id: existing?.id ?? newId('ex'),
      name: name.trim(),
      source: 'custom',
      baseMovementId: baseId,
      equipment,
      primaryMuscles: muscles.length ? muscles : (base?.primaryMuscles ?? []),
      category,
      isBodyweight,
      // Inherits form analysis from the linked built-in movement.
      formAnalysis: base?.formAnalysis,
      instructions: instructions.trim() || undefined,
      mediaUrl: mediaUrl.trim() || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (!(await succeeded(saveExercise.mutateAsync(exercise)))) return;
    router.back();
    toast.show({ message: existing ? 'Exercise updated.' : `${exercise.name} added to your exercises.`, tone: 'success' });
  };

  return (
    <>
      <Stack.Screen options={{ title: existing ? 'Edit exercise' : 'New exercise' }} />
      <ScrollView contentContainerStyle={[styles.content, readable]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Pause Squat" error={showErrors ? nameError : undefined} autoFocus={!existing} />

        <View style={styles.section}>
          <SectionHeader title="Variation of (optional)" />
          {base ? (
            <Card padding="none">
              <ListRow
                title={base.name}
                subtitle={base.formAnalysis ? 'Stats group together, and form analysis works for this exercise.' : 'Stats group together with this movement.'}
                icon="link"
                trailing={<Button title="Unlink" variant="ghost" size="sm" onPress={() => setBaseId(undefined)} />}
                separator={false}
              />
            </Card>
          ) : (
            <>
              <TextField label="Search built-in movements" value={baseQuery} onChangeText={setBaseQuery} placeholder="e.g. Squat" autoCorrect={false} />
              {baseMatches.length > 0 && (
                <Card padding="none">
                  {baseMatches.map((e, i) => (
                    <ListRow
                      key={e.id}
                      title={e.name}
                      subtitle={e.formAnalysis ? 'Supports form analysis' : undefined}
                      onPress={() => {
                        setBaseId(e.id);
                        setBaseQuery('');
                        if (!muscles.length) setMuscles(e.primaryMuscles);
                        if (!equipment) setEquipment(e.equipment);
                        setCategory(e.category);
                        setIsBodyweight(e.isBodyweight);
                      }}
                      separator={i < baseMatches.length - 1}
                    />
                  ))}
                </Card>
              )}
            </>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Equipment" />
          <View style={styles.wrap}>
            {EQUIPMENT.map((e) => (
              <Chip key={e} label={EQUIPMENT_LABEL[e]} selected={equipment === e} onPress={() => setEquipment(equipment === e ? undefined : e)} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Primary muscles" />
          <View style={styles.wrap}>
            {MUSCLES.map((m) => (
              <Chip key={m} label={MUSCLE_LABEL[m]} selected={muscles.includes(m)} onPress={() => setMuscles((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Type" />
          <SegmentedControl
            label="Exercise type"
            options={[
              { value: 'compound', label: 'Compound' },
              { value: 'isolation', label: 'Isolation' },
            ]}
            value={category}
            onChange={setCategory}
          />
          <AppText variant="footnote" tone="secondary" style={styles.hint}>
            Sets the default rest: 3:00 for compound, 1:30 for isolation.
          </AppText>
          <Card padding="none">
            <ListRow
              title="Counts bodyweight"
              subtitle="For pull-ups, dips, and similar: load is bodyweight plus any added weight."
              trailing={<Toggle label="Counts bodyweight" value={isBodyweight} onChange={setIsBodyweight} />}
              separator={false}
            />
          </Card>
        </View>

        <TextField label="How to (optional)" value={instructions} onChangeText={setInstructions} placeholder="Setup and cues" multiline />
        <TextField label="Demo video link (optional)" value={mediaUrl} onChangeText={setMediaUrl} placeholder="https://" keyboardType="url" autoCapitalize="none" autoCorrect={false} />

        <Button title={existing ? 'Save changes' : 'Add exercise'} fullWidth loading={saveExercise.isPending} onPress={save} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hint: {
    paddingHorizontal: spacing.xs,
  },
  loading: {
    margin: spacing.lg,
  },
});

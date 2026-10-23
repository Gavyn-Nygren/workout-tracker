import { router, Stack, useLocalSearchParams, useNavigation, usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Card, ErrorState, NotFoundState, NumberField, ScreenSkeleton, SectionHeader, SegmentedControl, SetTag, Stepper, TextField, useToast } from '@/components/ui';
import { succeeded, useExercises, usePlan, usePreferences, useSavePlan } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { MissBehavior, PlannedExercise, ProgressionRule, RepTarget, SetKind, SetPrescription } from '@/data/types';
import { kgToLb, lbToKg } from '@/data/units';
import { unitLabel } from '@/lib/format';
import { updatePlanned } from '@/features/plans/planEdits';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing, tabularNums, typography } from '@/theme/tokens';
import { readable } from '@/theme/layout';

const KIND_OPTIONS: [SetKind, string][] = [
  ['normal', 'Normal'],
  ['warmup', 'Warm-up'],
  ['drop', 'Drop set'],
  ['timed_hold', 'Timed hold'],
  ['assisted', 'Assisted'],
];

/** "8" or "8-12" (also accepts an en dash). */
function parseRepTarget(text: string): RepTarget | undefined {
  const [a, b] = text.split(/[-–]/).map((p) => Number.parseInt(p.trim(), 10));
  if (!Number.isFinite(a)) return undefined;
  if (!Number.isFinite(b) || b === a) return a;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}
const repText = (t: RepTarget | undefined) => (t === undefined ? '' : typeof t === 'number' ? String(t) : `${t.min}-${t.max}`);

/** Edits one exercise's prescription in a plan workout (roadmap G2.4). Changes save with Save. */
export default function PrescriptionScreen() {
  const { plan: planId, workout: workoutId, pe } = useLocalSearchParams<{ plan: string; workout: string; pe: string }>();
  const { colors, scheme } = useAppTheme();
  const navigation = useNavigation();
  const toast = useToast();
  const preferences = usePreferences().data ?? defaultPreferences;
  const planQuery = usePlan(planId);
  const exercisesQuery = useExercises();
  const savePlan = useSavePlan();

  const plan = planQuery.data;
  const planned = plan?.workouts.find((w) => w.id === workoutId)?.blocks.flatMap((b) => b.exercises).find((e) => e.id === pe);
  const exercise = exercisesQuery.data?.find((e) => e.id === planned?.exerciseId);

  const [draft, setDraft] = useState<PlannedExercise | undefined>(planned);
  const [dirty, setDirty] = useState(false);
  const leaving = useRef(false);
  useEffect(() => {
    if (!draft && planned) setDraft(planned);
  }, [draft, planned]);

  usePreventRemove(dirty, ({ data }) => {
    if (leaving.current) return navigation.dispatch(data.action);
    Alert.alert('Discard changes?', 'Your edits to this exercise haven’t been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const failed = [planQuery, exercisesQuery].filter((q) => q.error);
  if (failed.length) return <ErrorState fill title="Couldn't load this exercise" onRetry={() => failed.forEach((q) => q.refetch())} />;
  // The draft starts from the saved prescription one render after it loads.
  if (planQuery.isPending || exercisesQuery.isPending || (planned && !draft)) return <ScreenSkeleton />;
  if (!plan || !planned || !draft) return <NotFoundState thing="Exercise" icon="dumbbell" />;

  const units = preferences.units;
  const increment = (exercise?.equipment && preferences.roundingIncrements[exercise.equipment]) || 5;
  const toDisplay = (kg: number) => Math.round((units === 'imperial' ? kgToLb(kg) : kg) * 100) / 100;
  const fromDisplay = (v: number) => (units === 'imperial' ? lbToKg(v) : v);

  const edit = (fn: (d: PlannedExercise) => PlannedExercise) => {
    setDraft((d) => (d ? fn(d) : d));
    setDirty(true);
  };
  const editSet = (index: number, patch: Partial<SetPrescription>) => edit((d) => ({ ...d, sets: d.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  const editWorking = (patch: Partial<SetPrescription>) => edit((d) => ({ ...d, sets: d.sets.map((s) => (s.kind === 'warmup' ? s : { ...s, ...patch })) }));

  const working = draft.sets.filter((s) => s.kind !== 'warmup');
  const sharedTempo = working[0]?.tempo ?? '';
  const sharedLoad = working.find((s) => s.kind === 'normal')?.targetLoadKg;
  const rule = draft.progression;

  const openKind = (index: number) =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title: `Set ${index + 1}`, options: [...KIND_OPTIONS.map(([, l]) => l), 'Delete set', 'Cancel'], destructiveButtonIndex: KIND_OPTIONS.length, cancelButtonIndex: KIND_OPTIONS.length + 1, userInterfaceStyle: scheme },
      (i) => {
        if (i < KIND_OPTIONS.length) editSet(index, { kind: KIND_OPTIONS[i][0] });
        if (i === KIND_OPTIONS.length) edit((d) => ({ ...d, sets: d.sets.filter((_, j) => j !== index) }));
      },
    );

  const setRule = (type: 'none' | ProgressionRule['type']) => {
    const onMiss: MissBehavior = rule?.onMiss ?? { type: 'repeat' };
    edit((d) => ({
      ...d,
      progression: type === 'none' ? undefined : type === 'rep_range' ? { type, incrementKg: fromDisplay(increment), onMiss } : { type, percent: 2.5, onMiss },
    }));
  };

  const save = async () => {
    if (savePlan.isPending) return;
    if (!(await succeeded(savePlan.mutateAsync(updatePlanned(plan, workoutId, planned.id, () => draft))))) return;
    leaving.current = true;
    setDirty(false);
    router.back();
    toast.show({ message: 'Saved. Applies to upcoming workouts.', tone: 'success' });
  };

  const fieldStyle = [typography.headline, tabularNums, styles.field, { color: colors.text, backgroundColor: colors.input }];

  return (
    <>
      <Stack.Screen options={{ title: exercise?.name ?? 'Sets & reps' }} />
      <ScrollView contentContainerStyle={[styles.content, readable]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.header}>
          <AppText variant="title2">{exercise?.name ?? 'Exercise'}</AppText>
          <AppText variant="subhead" tone="secondary">
            Targets for every upcoming workout. On the day, sets pre-fill from these and from last time.
          </AppText>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Sets" />
          <Card padding="none">
            <View style={[styles.tableRow, styles.tableHead]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <AppText variant="caption" weight="700" tone="tertiary" style={styles.setCol}>SET</AppText>
              <AppText variant="caption" weight="700" tone="tertiary" style={styles.col}>REPS</AppText>
              <AppText variant="caption" weight="700" tone="tertiary" style={styles.col}>{preferences.effortScale === 'rpe' ? 'RPE' : 'RIR'}</AppText>
              <AppText variant="caption" weight="700" tone="tertiary" style={styles.col}>REST (s)</AppText>
            </View>
            {draft.sets.map((set, i) => {
              const hold = set.kind === 'timed_hold';
              const effort = set.targetRir === undefined ? undefined : preferences.effortScale === 'rpe' ? 10 - set.targetRir : set.targetRir;
              return (
                // Re-key when sets are added or removed so the uncontrolled reps field never shows a neighbour's text.
                <View key={`${i}-${draft.sets.length}`} style={[styles.tableRow, { borderTopColor: colors.border }]}>
                  <Pressable onPress={() => openKind(i)} style={styles.setCol} accessibilityRole="button" accessibilityLabel={`Set ${i + 1}, ${set.kind.replace('_', ' ')}. Change type or delete`}>
                    {set.kind === 'normal' ? (
                      <AppText variant="headline" weight="700" numeric>
                        {i + 1}
                      </AppText>
                    ) : (
                      <SetTag tag={set.kind} compact />
                    )}
                  </Pressable>
                  <View style={styles.col}>
                    {hold ? (
                      <NumberField label={`Set ${i + 1} seconds`} value={set.targetDurationSec} onChange={(v) => editSet(i, { targetDurationSec: v })} width={72} unit="s" />
                    ) : (
                      <TextInput
                        defaultValue={repText(set.targetReps)}
                        onChangeText={(t) => editSet(i, { targetReps: parseRepTarget(t) })}
                        keyboardType="numbers-and-punctuation"
                        placeholder="8-12"
                        placeholderTextColor={colors.textTertiary}
                        accessibilityLabel={`Set ${i + 1} target reps, a number or a range like 8-12`}
                        style={fieldStyle}
                      />
                    )}
                  </View>
                  <View style={styles.col}>
                    <NumberField
                      label={`Set ${i + 1} target ${preferences.effortScale === 'rpe' ? 'RPE' : 'reps in reserve'}`}
                      value={effort}
                      onChange={(v) => editSet(i, { targetRir: v === undefined ? undefined : preferences.effortScale === 'rpe' ? 10 - v : v })}
                      decimal={preferences.effortScale === 'rpe'}
                      width={64}
                      placeholder="—"
                    />
                  </View>
                  <View style={styles.col}>
                    <NumberField label={`Set ${i + 1} rest in seconds`} value={set.restSec} onChange={(v) => editSet(i, { restSec: v })} width={72} placeholder="—" />
                  </View>
                </View>
              );
            })}
          </Card>
          <View style={styles.buttons}>
            <Button
              title="Add set"
              variant="secondary"
              size="sm"
              icon="plus"
              onPress={() => edit((d) => ({ ...d, sets: [...d.sets, { ...(d.sets[d.sets.length - 1] ?? { kind: 'normal', modifiers: [] }), modifiers: [] }] }))}
            />
            <Button
              title="Add warm-up"
              variant="ghost"
              size="sm"
              icon="flame"
              onPress={() => edit((d) => ({ ...d, sets: [{ kind: 'warmup', modifiers: [], targetReps: 5, restSec: 60 }, ...d.sets] }))}
            />
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title="All working sets" />
          <Card>
            <View style={styles.stack}>
              <View style={styles.inline}>
                <AppText variant="body" style={styles.flex}>
                  Target weight
                </AppText>
                <NumberField
                  label="Target weight for all working sets"
                  value={sharedLoad === undefined ? undefined : toDisplay(sharedLoad)}
                  onChange={(v) => editWorking({ targetLoadKg: v === undefined ? undefined : fromDisplay(v) })}
                  unit={unitLabel(units)}
                  decimal
                  placeholder="Auto"
                  width={110}
                />
              </View>
              <AppText variant="footnote" tone="secondary">
                Leave on Auto to start from last time’s weight plus the progression rule.
              </AppText>
              <TextField label="Tempo" value={sharedTempo} onChangeText={(t) => editWorking({ tempo: t || undefined })} placeholder="e.g. 3-1-1-0" autoCapitalize="characters" hint="Down, pause, up, pause in seconds. X means explosive." />
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Progression" />
          <Card>
            <View style={styles.stack}>
              <SegmentedControl
                label="Progression rule"
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'rep_range', label: 'Rep range' },
                  { value: 'percent_weekly', label: 'Weekly %' },
                ]}
                value={rule?.type ?? 'none'}
                onChange={setRule}
              />
              {rule?.type === 'rep_range' && (
                <View style={styles.inline}>
                  <AppText variant="body" style={styles.flex}>
                    Add weight when every set hits the top of the range
                  </AppText>
                  <Stepper
                    label="Weight to add"
                    value={toDisplay(rule.incrementKg)}
                    onChange={(v) => edit((d) => ({ ...d, progression: { ...rule, incrementKg: fromDisplay(v) } }))}
                    step={increment / 2}
                    min={increment / 2}
                    unit={unitLabel(units)}
                  />
                </View>
              )}
              {rule?.type === 'percent_weekly' && (
                <View style={styles.inline}>
                  <AppText variant="body" style={styles.flex}>
                    Increase each week by
                  </AppText>
                  <Stepper label="Weekly increase" value={rule.percent} onChange={(v) => edit((d) => ({ ...d, progression: { ...rule, percent: v } }))} step={0.5} min={0.5} max={10} unit="%" />
                </View>
              )}
              {rule && (
                <>
                  <AppText variant="footnote" tone="secondary" weight="600">
                    If you miss the target reps
                  </AppText>
                  <SegmentedControl
                    label="When target reps are missed"
                    options={[
                      { value: 'repeat', label: 'Repeat weight' },
                      { value: 'deload', label: 'Deload' },
                    ]}
                    value={rule.onMiss.type}
                    onChange={(type) =>
                      edit((d) => ({ ...d, progression: { ...rule, onMiss: type === 'repeat' ? { type } : { type, afterConsecutiveMisses: 3, percent: 10 } } }))
                    }
                  />
                  {rule.onMiss.type === 'deload' && (
                    <View style={styles.deload}>
                      <View style={styles.inline}>
                        <AppText variant="body" style={styles.flex}>
                          After this many misses in a row
                        </AppText>
                        <Stepper
                          label="Misses before a deload"
                          value={rule.onMiss.afterConsecutiveMisses}
                          onChange={(v) => edit((d) => ({ ...d, progression: { ...rule, onMiss: { ...(rule.onMiss as Extract<MissBehavior, { type: 'deload' }>), afterConsecutiveMisses: v } } }))}
                          min={1}
                          max={6}
                        />
                      </View>
                      <View style={styles.inline}>
                        <AppText variant="body" style={styles.flex}>
                          Drop the weight by
                        </AppText>
                        <Stepper
                          label="Deload percent"
                          value={rule.onMiss.percent}
                          onChange={(v) => edit((d) => ({ ...d, progression: { ...rule, onMiss: { ...(rule.onMiss as Extract<MissBehavior, { type: 'deload' }>), percent: v } } }))}
                          step={5}
                          min={5}
                          max={30}
                          unit="%"
                        />
                      </View>
                    </View>
                  )}
                </>
              )}
              {!rule && (
                <AppText variant="footnote" tone="secondary">
                  Without a rule, each workout pre-fills last time’s weight and you adjust it yourself.
                </AppText>
              )}
            </View>
          </Card>
        </View>

        <TextField label="Notes" value={draft.notes ?? ''} onChangeText={(notes) => edit((d) => ({ ...d, notes: notes || undefined }))} placeholder="Shown on this exercise during the workout" />

        <Button title="Save changes" fullWidth disabled={!dirty} loading={savePlan.isPending} onPress={save} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  section: {
    gap: spacing.sm,
  },
  stack: {
    gap: spacing.md,
  },
  tableHead: {
    paddingVertical: spacing.sm,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  setCol: {
    width: 40,
    alignItems: 'center',
    textAlign: 'center',
  },
  col: {
    flex: 1,
    alignItems: 'center',
    textAlign: 'center',
  },
  field: {
    width: 76,
    minHeight: 44,
    borderRadius: radius.md,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  deload: {
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
});

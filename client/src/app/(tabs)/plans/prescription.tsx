import { router, Stack, useLocalSearchParams, useNavigation, usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { AppText, Button, Card, ErrorState, Icon, NotFoundState, NumberField, ScreenSkeleton, SectionHeader, SegmentedControl, SetTag, Stepper, TextField, useToast } from '@/components/ui';
import { succeeded, useExercises, usePlan, usePreferences, useSavePlan } from '@/data/hooks';
import { plannedWorkingField } from '@/data/logging';
import { defaultPreferences } from '@/data/preferences';
import type { MissBehavior, PlannedExercise, ProgressionRule, RepTarget, SetKind, SetPrescription } from '@/data/types';
import { kgToLb, lbToKg } from '@/data/units';
import { plural, unitLabel } from '@/lib/format';
import { autoRestHint, missHint } from '@/features/plans/describe';
import { updatePlanned, withWarmupSet } from '@/features/plans/planEdits';
import { TempoField } from '@/features/plans/TempoField';
import { isProgressionKind, repRange } from '@/features/workout/progression';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing, tabularNums, typography } from '@/theme/tokens';
import { DENSE_TEXT_MAX, readable, READABLE_MAX, useTextScale } from '@/theme/layout';

const KIND_OPTIONS: [SetKind, string][] = [
  ['normal', 'Normal'],
  ['warmup', 'Warm-up'],
  ['drop', 'Drop set'],
  ['timed_hold', 'Timed hold'],
  ['assisted', 'Assisted'],
];
const KIND_LABEL = Object.fromEntries(KIND_OPTIONS) as Record<SetKind, string>;

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
  const { fontScale } = useTextScale();
  const { width: windowWidth } = useWindowDimensions();
  const navigation = useNavigation();
  const toast = useToast();
  const preferences = usePreferences().data ?? defaultPreferences;
  const planQuery = usePlan(planId);
  const exercisesQuery = useExercises();
  const savePlan = useSavePlan();

  const plan = planQuery.data;
  const block = plan?.workouts.find((w) => w.id === workoutId)?.blocks.find((b) => b.exercises.some((e) => e.id === pe));
  const planned = block?.exercises.find((e) => e.id === pe);
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
  // From the first normal or Assisted set, so a pull-up planned all Assisted shows what's typed.
  const sharedLoad = working.find((s) => isProgressionKind(s.kind))?.targetLoadKg;
  const rule = draft.progression;
  // The sets a rule reads (progression.ts): a weight typed on any of them turns its suggestions off.
  const ruleSets = draft.sets.filter((s) => isProgressionKind(s.kind));
  const typedWeight = ruleSets.some((s) => s.targetLoadKg !== undefined);
  // Sets that log assistance get harder by taking it away (progression.ts), so the rule says that.
  const assisted = plannedWorkingField(draft.sets, exercise) === 'assistanceKg';
  const fixedReps = ruleSets.length > 0 && ruleSets.every((s) => s.targetReps === undefined || typeof s.targetReps === 'number') && ruleSets.some((s) => s.targetReps !== undefined);

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

  // Sets table: one row per set up to XXL. From XXXL four columns of fields no longer fit, so each
  // set becomes a stacked block with labelled fields (DT #6).
  const stackedSets = fontScale >= 1.3;
  const k = Math.min(Math.max(fontScale, 1), DENSE_TEXT_MAX);
  // "Assist" and "Hold" tags are wider than a set number, so the column widens for every row at once.
  const setColWidth = (draft.sets.some((s) => s.kind === 'assisted' || s.kind === 'timed_hold') ? 56 : 40) * k;
  const colWidth = (Math.min(windowWidth, READABLE_MAX) - spacing.lg * 2 - spacing.md * 2 - setColWidth - spacing.sm * 3) / 3;
  // NumberField widens itself with the text size (up to 2×); keep the result inside its column.
  const fieldScale = Math.min(Math.max(fontScale, 1), 2);
  const fieldWidth = (base: number) => (stackedSets ? base : Math.min(base, colWidth / fieldScale));
  const repsWidth = stackedSets ? 76 * fieldScale : Math.min(76 * Math.max(fontScale, 1), colWidth);
  const fieldStyle = [typography.headline, tabularNums, styles.field, { width: repsWidth, color: colors.text, backgroundColor: colors.input }];
  const effortName = preferences.effortScale === 'rpe' ? 'RPE' : 'RIR';
  const unitWord = units === 'imperial' ? 'pounds' : 'kilograms';

  // What a rest left on Auto does. In a superset or circuit the working sets rest after each round
  // instead of on their own (the block's round rest, else the compound default, like the timer).
  const group = block?.type === 'superset' || block?.type === 'circuit' ? { type: block.type, roundRestSec: block.roundRestSec ?? preferences.restDefaultsSec.compound } : undefined;
  const restHint = { text: autoRestHint(draft.sets, group), spoken: autoRestHint(draft.sets, group, true) };

  /** The set's type button and its three fields, laid out by the table row or the stacked block. */
  const setParts = (set: SetPrescription, i: number) => {
    const hold = set.kind === 'timed_hold';
    const effort = set.targetRir === undefined ? undefined : preferences.effortScale === 'rpe' ? 10 - set.targetRir : set.targetRir;
    return {
      kindLabel: `Set ${i + 1}, ${KIND_LABEL[set.kind]}. Change type or delete`,
      repsName: hold ? 'Hold (seconds)' : 'Reps',
      reps: hold ? (
        <NumberField label={`Set ${i + 1} target hold in seconds`} value={set.targetDurationSec} onChange={(v) => editSet(i, { targetDurationSec: v })} width={fieldWidth(72)} unit="s" />
      ) : (
        <TextInput
          defaultValue={repText(set.targetReps)}
          onChangeText={(t) => editSet(i, { targetReps: parseRepTarget(t) })}
          keyboardType="numbers-and-punctuation"
          keyboardAppearance={scheme}
          selectionColor={colors.accentText}
          placeholder="8-12"
          placeholderTextColor={colors.textTertiary}
          maxFontSizeMultiplier={stackedSets ? 2 : DENSE_TEXT_MAX}
          accessibilityLabel={`Set ${i + 1} target reps, a number or a range like 8-12`}
          style={fieldStyle}
        />
      ),
      effort: (
        <NumberField
          label={`Set ${i + 1} target ${preferences.effortScale === 'rpe' ? 'RPE' : 'reps in reserve'}`}
          value={effort}
          onChange={(v) => editSet(i, { targetRir: v === undefined ? undefined : preferences.effortScale === 'rpe' ? 10 - v : v })}
          decimal={preferences.effortScale === 'rpe'}
          width={fieldWidth(64)}
          placeholder="—"
        />
      ),
      // Blank (or 0) is Auto: the set rests like the exercise does (see restHint below).
      rest: (
        <NumberField
          label={`Set ${i + 1} rest in seconds`}
          value={set.restSec || undefined}
          onChange={(v) => editSet(i, { restSec: v || undefined })}
          width={fieldWidth(72)}
          placeholder="Auto"
        />
      ),
    };
  };

  return (
    <>
      <Stack.Screen options={{ title: exercise?.name ?? 'Sets & reps' }} />
      <ScrollView contentContainerStyle={[styles.content, readable]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.header}>
          <AppText variant="title2" accessibilityRole="header">
            {exercise?.name ?? 'Exercise'}
          </AppText>
          <AppText variant="subhead" tone="secondary">
            Targets for every upcoming workout. On the day, sets pre-fill from these and from last time.
          </AppText>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Sets" />
          <Card padding="none">
            {!stackedSets && (
              <View style={[styles.tableRow, styles.tableHead]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <AppText variant="caption" weight="700" tone="secondary" maxFontSizeMultiplier={DENSE_TEXT_MAX} style={[styles.setCol, { width: setColWidth }]}>
                  SET
                </AppText>
                <AppText variant="caption" weight="700" tone="secondary" maxFontSizeMultiplier={DENSE_TEXT_MAX} style={styles.col}>
                  REPS
                </AppText>
                <AppText variant="caption" weight="700" tone="secondary" maxFontSizeMultiplier={DENSE_TEXT_MAX} style={styles.col}>
                  {effortName}
                </AppText>
                <AppText variant="caption" weight="700" tone="secondary" maxFontSizeMultiplier={DENSE_TEXT_MAX} style={styles.col}>
                  REST (s)
                </AppText>
              </View>
            )}
            {draft.sets.map((set, i) => {
              const parts = setParts(set, i);
              // Re-key when sets are added or removed (or the layout switches) so the uncontrolled reps field never shows a neighbour's text.
              const key = `${i}-${draft.sets.length}-${stackedSets ? 's' : 't'}`;
              if (stackedSets) {
                return (
                  <View key={key} style={[styles.setBlock, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <Pressable onPress={() => openKind(i)} accessibilityRole="button" accessibilityLabel={parts.kindLabel} style={styles.setBlockHeader}>
                      <AppText variant="headline" weight="700" numeric>{`Set ${i + 1}`}</AppText>
                      {set.kind !== 'normal' && <SetTag tag={set.kind} />}
                      <View style={styles.flex} />
                      <Icon name="ellipsis.circle" color={colors.accentText} size={20} />
                    </Pressable>
                    <LabeledRow label={parts.repsName} field>
                      {parts.reps}
                    </LabeledRow>
                    <LabeledRow label={effortName} field>
                      {parts.effort}
                    </LabeledRow>
                    <LabeledRow label="Rest (seconds)" field>
                      {parts.rest}
                    </LabeledRow>
                  </View>
                );
              }
              return (
                <View key={key} style={[styles.tableRow, { borderTopColor: colors.border }]}>
                  <Pressable onPress={() => openKind(i)} style={[styles.setCol, { width: setColWidth }]} accessibilityRole="button" accessibilityLabel={parts.kindLabel}>
                    {set.kind === 'normal' ? (
                      <AppText variant="headline" weight="700" numeric maxFontSizeMultiplier={DENSE_TEXT_MAX}>
                        {i + 1}
                      </AppText>
                    ) : (
                      <SetTag tag={set.kind} compact />
                    )}
                  </Pressable>
                  <View style={styles.col}>{parts.reps}</View>
                  <View style={styles.col}>{parts.effort}</View>
                  <View style={styles.col}>{parts.rest}</View>
                </View>
              );
            })}
          </Card>
          <AppText variant="footnote" tone="secondary" accessibilityLabel={restHint.spoken} style={styles.hint}>
            {restHint.text}
          </AppText>
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
              onPress={() => edit(withWarmupSet)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title="All working sets" />
          <Card>
            <View style={styles.stack}>
              <LabeledRow label="Target weight">
                <NumberField
                  label="Target weight for all working sets"
                  value={sharedLoad === undefined ? undefined : toDisplay(sharedLoad)}
                  onChange={(v) => editWorking({ targetLoadKg: v === undefined ? undefined : fromDisplay(v) })}
                  unit={unitLabel(units)}
                  decimal
                  placeholder="Auto"
                  width={110}
                />
              </LabeledRow>
              <AppText variant="footnote" tone="secondary">
                Leave on Auto to start from last time’s weight plus the progression rule.
              </AppText>
              <TempoField value={sharedTempo || undefined} onChange={(tempo) => editWorking({ tempo })} />
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
              {rule && typedWeight && (
                <AppText variant="footnote" tone="secondary">
                  A typed target weight turns off this rule’s suggestions. Clear it to use Auto.
                </AppText>
              )}
              {rule?.type === 'rep_range' && (
                <LabeledRow
                  label={`${assisted ? 'Take off assistance' : 'Add weight'} when every set hits ${fixedReps ? 'its reps' : 'the top of the range'}`}
                >
                  <Stepper
                    label={assisted ? 'Assistance to take off' : 'Weight to add'}
                    value={toDisplay(rule.incrementKg)}
                    onChange={(v) => edit((d) => ({ ...d, progression: { ...rule, incrementKg: fromDisplay(v) } }))}
                    step={increment / 2}
                    min={increment / 2}
                    unit={unitLabel(units)}
                    spokenValue={(v) => `${v} ${unitWord}`}
                  />
                </LabeledRow>
              )}
              {rule?.type === 'percent_weekly' && (
                <LabeledRow label={assisted ? 'Take off assistance each week by' : 'Increase each week by'}>
                  <Stepper
                    label={assisted ? 'Assistance to take off each week' : 'Weekly increase'}
                    value={rule.percent}
                    onChange={(v) => edit((d) => ({ ...d, progression: { ...rule, percent: v } }))}
                    step={0.5}
                    min={0.5}
                    max={10}
                    unit="%"
                    spokenValue={(v) => `${v} percent`}
                  />
                </LabeledRow>
              )}
              {rule?.type === 'percent_weekly' && (
                <AppText variant="footnote" tone="secondary">
                  {assisted
                    ? 'Takes this % off last time’s assistance each new week, when you hit your reps.'
                    : 'Adds this to last time’s weight each new week, when you hit your reps.'}
                </AppText>
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
                      <LabeledRow label="After this many misses in a row">
                        <Stepper
                          label="Misses before a deload"
                          value={rule.onMiss.afterConsecutiveMisses}
                          onChange={(v) => edit((d) => ({ ...d, progression: { ...rule, onMiss: { ...(rule.onMiss as Extract<MissBehavior, { type: 'deload' }>), afterConsecutiveMisses: v } } }))}
                          min={1}
                          max={6}
                          spokenValue={(v) => plural(v, 'miss', 'misses')}
                        />
                      </LabeledRow>
                      <LabeledRow label={assisted ? 'Add assistance by' : 'Drop the weight by'}>
                        <Stepper
                          label="Deload percent"
                          value={rule.onMiss.percent}
                          onChange={(v) => edit((d) => ({ ...d, progression: { ...rule, onMiss: { ...(rule.onMiss as Extract<MissBehavior, { type: 'deload' }>), percent: v } } }))}
                          step={5}
                          min={5}
                          max={30}
                          unit="%"
                          spokenValue={(v) => `${v} percent`}
                        />
                      </LabeledRow>
                    </View>
                  )}
                  <AppText variant="footnote" tone="secondary">
                    {missHint(ruleSets.map((s) => repRange(s.targetReps)), rule.onMiss.type === 'deload', assisted)}
                  </AppText>
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

/**
 * A label beside its control (Stepper, NumberField). At accessibility text sizes the label moves
 * above the control so neither gets squeezed (DT #10). `field` marks a label that only repeats the
 * field's own spoken label, so VoiceOver skips it.
 */
function LabeledRow({ label, field, children }: { label: string; field?: boolean; children: ReactNode }) {
  const { large } = useTextScale();
  return (
    <View style={large ? styles.labeledStacked : styles.inline}>
      <AppText
        variant="body"
        tone={field ? 'secondary' : 'primary'}
        style={large ? undefined : styles.flex}
        accessibilityElementsHidden={field}
        importantForAccessibility={field ? 'no-hide-descendants' : 'auto'}
      >
        {label}
      </AppText>
      {children}
    </View>
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
    alignItems: 'center',
    textAlign: 'center',
  },
  setBlock: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  setBlockHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    textAlign: 'center',
  },
  field: {
    minHeight: 44,
    borderRadius: radius.md,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  hint: {
    paddingHorizontal: spacing.xs,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  labeledStacked: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  deload: {
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
});

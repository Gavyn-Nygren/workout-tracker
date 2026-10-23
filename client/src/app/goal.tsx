import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip, ListRow, NumberField, SectionHeader, SegmentedControl, Skeleton, Stepper, TextField, useToast } from '@/components/ui';
import { addDays } from '@/data/dates';
import { useSaveGoal } from '@/data/hooks';
import type { Exercise, FormMovementFamily, Goal, Joint, UnitSystem } from '@/data/types';
import { kgToLb, lbToKg } from '@/data/units';
import { formatShortDate, unitLabel } from '@/lib/format';
import { newId } from '@/lib/id';
import { reportAngle } from '@/features/home/goals';
import { useHomeData } from '@/features/home/useHomeData';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

type GoalType = Goal['type'];
const JOINTS: Record<FormMovementFamily, Joint[]> = { squat: ['knee', 'hip', 'ankle'], lunge: ['knee', 'hip', 'ankle'], deadlift: ['hip', 'knee'], calf_raise: ['ankle'] };
const JOINT_LABEL: Record<Joint, string> = { knee: 'Knee', hip: 'Hip', ankle: 'Ankle' };
type DeadlineChoice = 'none' | 'keep' | '28' | '56' | '84';

/** Create or edit a goal (spec 2.9): lift, frequency, bodyweight, or form, with an optional deadline. */
export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const home = useHomeData();
  if (home.isLoading) return <Skeleton height={300} radius={16} style={{ margin: spacing.lg }} />;
  const existing = home.goals.find((g) => g.goal.id === id)?.goal;
  return <GoalForm existing={existing} home={home} />;
}

function GoalForm({ existing, home }: { existing?: Goal; home: ReturnType<typeof useHomeData> }) {
  const { colors } = useAppTheme();
  const toast = useToast();
  const saveGoal = useSaveGoal();
  const units: UnitSystem = home.units;
  const exercises = [...home.exercisesById.values()].sort((a, b) => a.name.localeCompare(b.name));
  const toDisplay = (kg: number) => Math.round((units === 'imperial' ? kgToLb(kg) : kg) * 10) / 10;
  const fromDisplay = (v: number) => (units === 'imperial' ? lbToKg(v) : v);

  const [type, setType] = useState<GoalType>(existing?.type ?? 'lift');
  // Lift
  const [liftExerciseId, setLiftExerciseId] = useState(existing?.type === 'lift' ? existing.exerciseId : 'ex_bench_press');
  const [liftQuery, setLiftQuery] = useState('');
  const [liftKind, setLiftKind] = useState<'load_reps' | 'e1rm'>(existing?.type === 'lift' ? existing.target.kind : 'load_reps');
  const [liftLoad, setLiftLoad] = useState<number | undefined>(existing?.type === 'lift' ? toDisplay(existing.target.loadKg) : undefined);
  const [liftReps, setLiftReps] = useState(existing?.type === 'lift' && existing.target.kind === 'load_reps' ? existing.target.reps : 5);
  // Frequency
  const [perWeek, setPerWeek] = useState(existing?.type === 'frequency' ? existing.workoutsPerWeek : 4);
  // Bodyweight
  const [targetWeight, setTargetWeight] = useState<number | undefined>(existing?.type === 'bodyweight' ? toDisplay(existing.targetKg) : undefined);
  // Form
  const formExercises = exercises.filter((e) => e.formAnalysis && e.source === 'builtin');
  const [formExerciseId, setFormExerciseId] = useState(existing?.type === 'form' ? existing.exerciseId : 'ex_back_squat');
  const formExercise = home.exercisesById.get(formExerciseId);
  const joints = formExercise?.formAnalysis ? JOINTS[formExercise.formAnalysis] : ['knee' as Joint];
  const [chosenJoint, setJoint] = useState<Joint>(existing?.type === 'form' ? existing.joint : 'knee');
  // Calf raises only measure the ankle, so fall back to a joint the movement supports.
  const joint = joints.includes(chosenJoint) ? chosenJoint : joints[0];
  const latestReport = home.formReports.filter((r) => r.exerciseId === formExerciseId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  const currentAngle = latestReport ? reportAngle(latestReport, joint) : undefined;
  const [targetDeg, setTargetDeg] = useState(existing?.type === 'form' ? existing.targetDeg : Math.max(40, Math.round((currentAngle ?? 85) - 5)));
  // Deadline
  const [deadline, setDeadline] = useState<DeadlineChoice>(existing?.deadline ? 'keep' : 'none');

  const liftExercise = home.exercisesById.get(liftExerciseId);
  const liftMatches = liftQuery.trim() ? exercises.filter((e) => e.name.toLowerCase().includes(liftQuery.trim().toLowerCase())).slice(0, 6) : [];
  const deadlineDate = deadline === 'none' ? undefined : deadline === 'keep' ? existing?.deadline : addDays(home.today, Number(deadline));

  const title = (() => {
    const u = unitLabel(units);
    switch (type) {
      case 'lift':
        return liftKind === 'e1rm' ? `${liftExercise?.name ?? 'Lift'} e1RM ${liftLoad ?? '?'} ${u}` : `${liftExercise?.name ?? 'Lift'} ${liftLoad ?? '?'} × ${liftReps}`;
      case 'frequency':
        return `Train ${perWeek}× per week`;
      case 'bodyweight':
        return `Reach ${targetWeight ?? '?'} ${u}`;
      case 'form':
        return `${formExercise?.name ?? 'Form'}: ${targetDeg}° ${joint} angle`;
    }
  })();

  const valid =
    (type === 'lift' && Boolean(liftExercise) && (liftLoad ?? 0) > 0) ||
    type === 'frequency' ||
    (type === 'bodyweight' && (targetWeight ?? 0) > 0) ||
    (type === 'form' && Boolean(formExercise));

  const save = async () => {
    if (!valid) return;
    const now = new Date().toISOString();
    const base = { id: existing?.id ?? newId('goal'), title, deadline: deadlineDate, createdAt: existing?.createdAt ?? now, updatedAt: now };
    let goal: Goal;
    if (type === 'lift') {
      const loadKg = fromDisplay(liftLoad ?? 0);
      goal = { ...base, type, exerciseId: liftExerciseId, target: liftKind === 'e1rm' ? { kind: 'e1rm', loadKg } : { kind: 'load_reps', loadKg, reps: liftReps } };
    } else if (type === 'frequency') {
      goal = { ...base, type, workoutsPerWeek: perWeek };
    } else if (type === 'bodyweight') {
      const startKg = existing?.type === 'bodyweight' ? existing.startKg : (home.latestBodyweightKg ?? fromDisplay(targetWeight ?? 0));
      goal = { ...base, type, targetKg: fromDisplay(targetWeight ?? 0), startKg };
    } else {
      const startDeg = existing?.type === 'form' ? existing.startDeg : Math.round(currentAngle ?? targetDeg + 10);
      goal = { ...base, type, exerciseId: formExerciseId, joint, targetDeg, startDeg };
    }
    await saveGoal.mutateAsync(goal);
    router.back();
    toast.show({ message: existing ? 'Goal updated.' : 'Goal added to Home.', tone: 'success' });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.bar, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={10}>
          <AppText variant="body" tone="accent">
            Cancel
          </AppText>
        </Pressable>
        <AppText variant="headline">{existing ? 'Edit goal' : 'New goal'}</AppText>
        <Pressable onPress={save} disabled={!valid} accessibilityRole="button" accessibilityState={{ disabled: !valid }} hitSlop={10}>
          <AppText variant="body" weight="700" tone={valid ? 'accent' : 'tertiary'}>
            Save
          </AppText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <SegmentedControl
          label="Goal type"
          options={[
            { value: 'lift', label: 'Lift' },
            { value: 'frequency', label: 'Frequency' },
            { value: 'bodyweight', label: 'Weight' },
            { value: 'form', label: 'Form' },
          ]}
          value={type}
          onChange={setType}
        />

        {type === 'lift' && (
          <View style={styles.section}>
            <SectionHeader title="Exercise" />
            <Card padding="none">
              <ListRow title={liftExercise?.name ?? 'Choose an exercise'} icon="dumbbell" separator={false} />
            </Card>
            <TextField label="Change exercise" value={liftQuery} onChangeText={setLiftQuery} placeholder="Search" autoCorrect={false} />
            {liftMatches.length > 0 && (
              <Card padding="none">
                {liftMatches.map((e: Exercise, i) => (
                  <ListRow key={e.id} title={e.name} onPress={() => {
                      setLiftExerciseId(e.id);
                      setLiftQuery('');
                    }} separator={i < liftMatches.length - 1} />
                ))}
              </Card>
            )}
            <SegmentedControl
              label="Target kind"
              options={[
                { value: 'load_reps', label: 'Weight × reps' },
                { value: 'e1rm', label: 'Est. 1RM' },
              ]}
              value={liftKind}
              onChange={setLiftKind}
            />
            <Card>
              <View style={styles.inline}>
                <AppText variant="body" style={styles.flex}>
                  {liftKind === 'e1rm' ? 'Target e1RM' : 'Target weight'}
                </AppText>
                <NumberField label="Target weight" value={liftLoad} onChange={setLiftLoad} unit={unitLabel(units)} decimal width={110} placeholder="225" />
              </View>
              {liftKind === 'load_reps' && (
                <View style={[styles.inline, styles.spaced]}>
                  <AppText variant="body" style={styles.flex}>
                    For at least
                  </AppText>
                  <Stepper label="Target reps" value={liftReps} onChange={setLiftReps} min={1} max={30} unit="reps" />
                </View>
              )}
            </Card>
          </View>
        )}

        {type === 'frequency' && (
          <Card>
            <View style={styles.inline}>
              <View style={styles.flex}>
                <AppText variant="body">Workouts per week</AppText>
                <AppText variant="footnote" tone="secondary">
                  Also sets your weekly streak target.
                </AppText>
              </View>
              <Stepper label="Workouts per week" value={perWeek} onChange={setPerWeek} min={1} max={14} />
            </View>
          </Card>
        )}

        {type === 'bodyweight' && (
          <Card>
            <View style={styles.inline}>
              <AppText variant="body" style={styles.flex}>
                Target bodyweight
              </AppText>
              <NumberField label="Target bodyweight" value={targetWeight} onChange={setTargetWeight} unit={unitLabel(units)} decimal width={110} placeholder="180" />
            </View>
            <AppText variant="footnote" tone="secondary" style={styles.spaced}>
              {home.latestBodyweightKg !== undefined ? `Latest entry: ${toDisplay(home.latestBodyweightKg)} ${unitLabel(units)}. Progress is measured from there.` : 'Log your bodyweight to track progress.'}
            </AppText>
          </Card>
        )}

        {type === 'form' && (
          <View style={styles.section}>
            <SectionHeader title="Movement" />
            <View style={styles.wrap}>
              {formExercises.map((e) => (
                <Chip key={e.id} label={e.name} selected={formExerciseId === e.id} onPress={() => setFormExerciseId(e.id)} />
              ))}
            </View>
            <SectionHeader title="Joint" />
            <SegmentedControl label="Joint" options={joints.map((j) => ({ value: j, label: JOINT_LABEL[j] }))} value={joint} onChange={setJoint} />
            <Card>
              <View style={styles.inline}>
                <View style={styles.flex}>
                  <AppText variant="body">Target angle at the bottom</AppText>
                  <AppText variant="footnote" tone="secondary">
                    {currentAngle !== undefined ? `Your last recording: ${Math.round(currentAngle)}°. Smaller is deeper.` : 'Record a set to see your current angle.'}
                  </AppText>
                </View>
                <Stepper label="Target angle" value={targetDeg} onChange={setTargetDeg} min={20} max={180} unit="°" />
              </View>
            </Card>
            <AppText variant="footnote" tone="secondary" style={styles.hint}>
              Form goals compare you with yourself. They aren't a judgement of good or bad form.
            </AppText>
          </View>
        )}

        {type !== 'frequency' && (
          <View style={styles.section}>
            <SectionHeader title="Deadline (optional)" />
            <SegmentedControl
              label="Deadline"
              options={[
                { value: 'none', label: 'None' },
                ...(existing?.deadline ? [{ value: 'keep' as const, label: formatShortDate(existing.deadline).split(', ')[1] }] : []),
                { value: '28', label: '4 wk' },
                { value: '56', label: '8 wk' },
                { value: '84', label: '12 wk' },
              ]}
              value={deadline}
              onChange={setDeadline}
            />
            {deadlineDate && (
              <AppText variant="footnote" tone="secondary" style={styles.hint}>
                {`Due ${formatShortDate(deadlineDate)}. Home shows whether you're on pace.`}
              </AppText>
            )}
          </View>
        )}

        <Card>
          <AppText variant="footnote" tone="secondary">
            Shows on Home as
          </AppText>
          <AppText variant="headline">{title}</AppText>
        </Card>

        <Button title={existing ? 'Save goal' : 'Add goal'} fullWidth disabled={!valid} loading={saveGoal.isPending} onPress={save} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  spaced: {
    marginTop: spacing.md,
  },
  flex: {
    flex: 1,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hint: {
    paddingHorizontal: spacing.xs,
  },
});

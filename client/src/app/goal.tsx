import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip, ErrorState, ListRow, NotFoundState, NumberField, SectionHeader, SegmentedControl, Skeleton, Stepper, TextField, ToastViewport, useToast } from '@/components/ui';
import { addDays } from '@/data/dates';
import {
  bodyweightGoalStartKg,
  formGoalAimsHigher,
  goalDeadlineSetAt,
  goalEditStartsOver,
  goalStatus,
  latestFormAngle,
  LIFT_BASELINE_DAYS,
  liftBest,
  liftGoalAddsToBodyweight,
  liftGoalFormKind,
  weeklyGoalTotal,
  type GoalSubject,
  type LiftShape,
} from '@/data/goals';
import { succeeded, useBodyweight, useExercises, useFormReports, useGoals, useSaveGoal } from '@/data/hooks';
import type { Exercise, FormMovementFamily, Goal, Joint, UnitSystem } from '@/data/types';
import { kgToLb, lbToKg } from '@/data/units';
import { formatAddedLoad, formatLoad, formatMonthDay, formatShortDate, plural, unitLabel } from '@/lib/format';
import { newId } from '@/lib/id';
import { useHomeData } from '@/features/home/useHomeData';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { DENSE_TEXT_MAX, readable, useTextScale } from '@/theme/layout';

type GoalType = Goal['type'];
const JOINTS: Record<FormMovementFamily, Joint[]> = { squat: ['knee', 'hip', 'ankle'], lunge: ['knee', 'hip', 'ankle'], deadlift: ['hip', 'knee'], calf_raise: ['ankle'] };
const JOINT_LABEL: Record<Joint, string> = { knee: 'Knee', hip: 'Hip', ankle: 'Ankle' };
type DeadlineChoice = 'none' | 'keep' | '28' | '56' | '84';
/** What a lift goal's weight field holds: plain load, weight added to bodyweight, or assistance. */
type LoadField = 'load' | 'added' | 'assistance';
const LOAD_LABEL: Record<LoadField | 'e1rm', string> = { load: 'Target weight', added: 'Added weight', assistance: 'Assistance', e1rm: 'Target e1RM' };
/** Same weight within 0.05 kg, as goals and records compare. */
const SAME_KG = 0.05;

/** Bodyweight exercises take added weight; assisted machines (assisted pull-up and dip) take assistance. */
const loadFieldOf = (exercise: Pick<Exercise, 'isBodyweight' | 'isAssisted'> | undefined): LoadField =>
  exercise?.isBodyweight ? (exercise.isAssisted ? 'assistance' : 'added') : 'load';

/** Create or edit a goal (spec 2.9): lift, frequency, bodyweight, or form, with an optional deadline. */
export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors } = useAppTheme();
  const home = useHomeData();
  // The reads the form uses (same cache as useHomeData), checked for errors. Goals only matter when editing.
  const goals = useGoals();
  const queries = [useExercises(), useFormReports(), useBodyweight(), ...(id ? [goals] : [])];

  const shell = (body: ReactNode) => (
    <View style={[styles.screen, { backgroundColor: colors.background }]} onAccessibilityEscape={() => router.back()}>
      <Bar title={id ? 'Edit goal' : 'New goal'} canSave={false} />
      {body}
    </View>
  );

  const failed = queries.filter((q) => q.error);
  if (failed.length) return shell(<ErrorState fill title={id ? "Couldn't load this goal" : "Couldn't load goal setup"} onRetry={() => failed.forEach((q) => q.refetch())} />);
  if (home.isLoading) {
    return shell(
      <View style={[styles.content, readable]}>
        <Skeleton height={300} radius={radius.card} />
      </View>,
    );
  }
  const existing = [...home.goals, ...home.completedGoals].find((g) => g.goal.id === id)?.goal;
  if (id && !existing) return <NotFoundState thing="Goal" icon="target" backLabel="Close" />;
  return <GoalForm existing={existing} home={home} />;
}

/**
 * Cancel / title / Save. Shown while loading too, so the sheet can always be closed. Like a native
 * nav bar, its text stops growing at 1.5×.
 */
function Bar({ title, canSave, onSave }: { title: string; canSave: boolean; onSave?: () => void }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.bar, { borderBottomColor: colors.border }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={10}>
        <AppText variant="body" tone="accent" maxFontSizeMultiplier={DENSE_TEXT_MAX}>
          Cancel
        </AppText>
      </Pressable>
      <AppText variant="headline" accessibilityRole="header" maxFontSizeMultiplier={DENSE_TEXT_MAX} style={styles.barTitle}>
        {title}
      </AppText>
      <Pressable onPress={onSave} disabled={!canSave} accessibilityRole="button" accessibilityState={{ disabled: !canSave }} hitSlop={10}>
        <AppText variant="body" weight="700" tone={canSave ? 'accent' : 'tertiary'} maxFontSizeMultiplier={DENSE_TEXT_MAX}>
          Save
        </AppText>
      </Pressable>
    </View>
  );
}

function GoalForm({ existing, home }: { existing?: Goal; home: ReturnType<typeof useHomeData> }) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const toast = useToast();
  const saveGoal = useSaveGoal();
  // Large text: labels sit above their Stepper or field instead of being squeezed beside it.
  const inline = [styles.inline, large && styles.stackedField];
  const inlineLabel = !large && styles.flex;
  const units: UnitSystem = home.units;
  const exercises = [...home.exercisesById.values()].sort((a, b) => a.name.localeCompare(b.name));
  const toDisplay = (kg: number) => Math.round((units === 'imperial' ? kgToLb(kg) : kg) * 10) / 10;
  const fromDisplay = (v: number) => (units === 'imperial' ? lbToKg(v) : v);

  const [type, setType] = useState<GoalType>(existing?.type ?? 'lift');
  // Lift. Bodyweight lifts store added weight, negative for assistance; the field shows it unsigned.
  const existingLift = existing?.type === 'lift' ? existing : undefined;
  const [liftExerciseId, setLiftExerciseId] = useState(existingLift?.exerciseId ?? 'ex_bench_press');
  const [liftQuery, setLiftQuery] = useState('');
  const [chosenKind, setLiftKind] = useState<'load_reps' | 'e1rm'>(existingLift?.target.kind ?? 'load_reps');
  const [liftLoad, setLiftLoad] = useState<number | undefined>(existingLift ? toDisplay(Math.abs(existingLift.target.loadKg)) : undefined);
  const [liftReps, setLiftReps] = useState(existingLift?.target.kind === 'load_reps' ? existingLift.target.reps : 5);
  // Frequency
  const [perWeek, setPerWeek] = useState(existing?.type === 'frequency' ? existing.workoutsPerWeek : 4);
  // Bodyweight
  const [targetWeight, setTargetWeight] = useState<number | undefined>(existing?.type === 'bodyweight' ? toDisplay(existing.targetKg) : undefined);
  // Form
  const formExercises = exercises.filter((e) => e.formAnalysis && e.source === 'builtin');
  const [formExerciseId, setFormExerciseId] = useState(existing?.type === 'form' ? existing.exerciseId : 'ex_back_squat');
  const formExercise = home.exercisesById.get(formExerciseId);
  const jointsOf = (exercise: Exercise | undefined): Joint[] => (exercise?.formAnalysis ? JOINTS[exercise.formAnalysis] : ['knee']);
  const joints = jointsOf(formExercise);
  const [chosenJoint, setJoint] = useState<Joint>(existing?.type === 'form' ? existing.joint : 'knee');
  // Calf raises only measure the ankle, so fall back to a joint the movement supports.
  const joint = joints.includes(chosenJoint) ? chosenJoint : joints[0];
  // The newest recording with a trusted reading for this joint.
  const currentAngle = latestFormAngle(home.formReports, formExerciseId, joint)?.angle;
  /** A target 5° past the latest recording: deeper for knees and hips, higher for the ankle. Editing keeps the goal's own. */
  const defaultTargetDeg = (exerciseId: string, forJoint: Joint) => {
    if (existing?.type === 'form' && existing.exerciseId === exerciseId && existing.joint === forJoint) return existing.targetDeg;
    const angle = latestFormAngle(home.formReports, exerciseId, forJoint)?.angle;
    return formGoalAimsHigher(forJoint) ? Math.min(180, Math.round((angle ?? 105) + 5)) : Math.max(40, Math.round((angle ?? 85) - 5));
  };
  const [targetDeg, setTargetDeg] = useState(() => defaultTargetDeg(formExerciseId, joint));
  // A new movement or joint gets its own default target, so it always aims the right way.
  const chooseFormExercise = (exercise: Exercise) => {
    const supported = jointsOf(exercise);
    setFormExerciseId(exercise.id);
    setTargetDeg(defaultTargetDeg(exercise.id, supported.includes(chosenJoint) ? chosenJoint : supported[0]));
  };
  const chooseJoint = (next: Joint) => {
    setJoint(next);
    setTargetDeg(defaultTargetDeg(formExerciseId, next));
  };
  // Deadline
  const [deadline, setDeadline] = useState<DeadlineChoice>(existing?.deadline ? 'keep' : 'none');

  const liftExercise = home.exercisesById.get(liftExerciseId);
  const liftMatches = liftQuery.trim() ? exercises.filter((e) => e.name.toLowerCase().includes(liftQuery.trim().toLowerCase())).slice(0, 6) : [];
  // e1RM targets aren't offered for bodyweight exercises, but an existing e1RM goal keeps its kind.
  const liftKind = liftGoalFormKind(chosenKind, liftExercise, existingLift);
  const liftShape: LiftShape = liftKind === 'e1rm' ? { kind: 'e1rm' } : { kind: 'load_reps', reps: liftReps };
  const addsToBodyweight = liftGoalAddsToBodyweight(liftShape, liftExercise);
  // A goal saved with assistance keeps showing it as assistance.
  const loadField: LoadField = !addsToBodyweight
    ? 'load'
    : existingLift?.exerciseId === liftExerciseId && existingLift.target.loadKg < 0
      ? 'assistance'
      : loadFieldOf(liftExercise);
  // Bodyweight lifts: blank is 0, bodyweight only (or no assistance).
  const liftTargetKg = loadField === 'assistance' ? -fromDisplay(liftLoad ?? 0) : fromDisplay(liftLoad ?? 0);
  const deadlineDate = deadline === 'none' ? undefined : deadline === 'keep' ? existing?.deadline : addDays(home.today, Number(deadline));
  // A goal measures from when it was set: a new type, exercise or joint, or a weekly goal given a new
  // deadline, starts over today.
  const subject: GoalSubject =
    type === 'lift' ? { type, exerciseId: liftExerciseId } : type === 'form' ? { type, exerciseId: formExerciseId, joint } : { type };
  const restarts = goalEditStartsOver(existing, subject, type === 'frequency' && deadline !== 'none' && deadline !== 'keep');
  const startedAt = (now: string) => (existing && !restarts ? existing.createdAt : now);
  // A deadline added or changed on a goal that keeps its set date: its pace counts from now.
  const deadlineSetAt = (now: string) => goalDeadlineSetAt(existing, restarts, deadlineDate, now);
  const paceFromNow = Boolean(existing && !restarts && deadlineDate && deadlineDate !== existing.deadline);

  /** What the weight field holds for an exercise and kind: an e1RM total, a plain load, added weight or assistance. */
  const fieldMeaning = (exercise: Exercise | undefined, kind: LiftShape['kind']) => (kind === 'e1rm' ? 'e1rm' : loadFieldOf(exercise));
  const chooseLiftExercise = (exercise: Exercise) => {
    const nextChosen = exercise.isBodyweight ? 'load_reps' : chosenKind;
    // A weight typed for one kind of field means something else in another (an e1RM total isn't added weight).
    if (fieldMeaning(exercise, liftGoalFormKind(nextChosen, exercise, existingLift)) !== fieldMeaning(liftExercise, liftKind)) setLiftLoad(undefined);
    setLiftKind(nextChosen);
    setLiftExerciseId(exercise.id);
    setLiftQuery('');
  };

  const title = (() => {
    const u = unitLabel(units);
    switch (type) {
      case 'lift': {
        const name = liftExercise?.name ?? 'Lift';
        if (liftKind === 'e1rm') return `${name} e1RM ${liftLoad ?? '?'} ${u}`;
        if (loadField === 'load') return `${name} ${liftLoad ?? '?'} × ${liftReps}`;
        // "Pull-Up × 10", "Pull-Up +25 lb × 8", "Assisted Dip −40 lb × 8".
        if (!liftLoad) return `${name} × ${liftReps}${loadField === 'assistance' ? ', no assistance' : ''}`;
        return `${name} ${loadField === 'assistance' ? '−' : '+'}${liftLoad} ${u} × ${liftReps}`;
      }
      case 'frequency':
        return `Train ${perWeek}× per week`;
      case 'bodyweight':
        return `Reach ${targetWeight ?? '?'} ${u}`;
      case 'form':
        return `${formExercise?.name ?? 'Form'}: ${targetDeg}° ${joint} angle`;
    }
  })();

  const valid =
    (type === 'lift' && Boolean(liftExercise) && (addsToBodyweight || (liftLoad ?? 0) > 0)) ||
    type === 'frequency' ||
    (type === 'bodyweight' && (targetWeight ?? 0) > 0) ||
    (type === 'form' && Boolean(formExercise));

  /** The goal as it would be saved at `now`. */
  const buildGoal = (now: string, id: string): Goal => {
    const setAt = deadlineSetAt(now);
    const base = { id, title, deadline: deadlineDate, ...(setAt ? { deadlineSetAt: setAt } : {}), createdAt: startedAt(now), updatedAt: now };
    if (type === 'lift') {
      const loadKg = liftTargetKg;
      return { ...base, type, exerciseId: liftExerciseId, target: liftKind === 'e1rm' ? { kind: 'e1rm', loadKg } : { kind: 'load_reps', loadKg, reps: liftReps } };
    }
    if (type === 'frequency') return { ...base, type, workoutsPerWeek: perWeek };
    if (type === 'bodyweight') {
      // Without a weigh-in there's no start yet: the next weigh-in sets it. An old goal's placeholder start (its target) isn't one.
      const startKg = existing?.type === 'bodyweight' ? bodyweightGoalStartKg(existing) : home.latestBodyweightKg;
      return { ...base, type, targetKg: fromDisplay(targetWeight ?? 0), ...(startKg !== undefined ? { startKg } : {}) };
    }
    // The start stays while the movement and joint do. Without a recording there's no start yet: the
    // first recording after the goal is set is the start.
    const keepStart = existing?.type === 'form' && existing.exerciseId === formExerciseId && existing.joint === joint;
    const startDeg = keepStart ? existing.startDeg : currentAngle !== undefined ? Math.round(currentAngle) : undefined;
    return { ...base, type, exerciseId: formExerciseId, joint, targetDeg, ...(startDeg !== undefined ? { startDeg } : {}) };
  };

  // Lift hint: the best at this measure in the last 12 weeks, the window a new goal's start uses.
  const best =
    type === 'lift' && liftExercise
      ? liftBest(liftExerciseId, liftShape, home.goalInput.sessions, home.exercisesById, { withinDays: LIFT_BASELINE_DAYS, today: home.today })
      : undefined;
  const bestText = (() => {
    if (!liftExercise) return undefined;
    if (!best) return liftKind === 'load_reps' && liftReps > 1 ? `No sets of ${liftReps}+ reps in the last 12 weeks.` : 'No sets in the last 12 weeks.';
    if (liftKind === 'e1rm') return `Your best in the last 12 weeks: ${formatLoad(best.value, units)} e1RM, from ${formatLoad(best.loadKg ?? 0, units)} × ${best.reps}.`;
    const load = best.addedLoad ? formatAddedLoad(best.value, units, 'bodyweight') : formatLoad(best.value, units);
    return `Your best in the last 12 weeks: ${load} × ${best.reps}.`;
  })();
  const liftNote = (() => {
    if (type !== 'lift' || !valid) return undefined;
    // An edited goal may already be reached by workouts since it was set.
    if (existing && !restarts) {
      const draft = goalStatus(buildGoal(new Date().toISOString(), existing.id), home.goalInput);
      if (draft.reachedDate) return `Already reached on ${formatMonthDay(draft.reachedDate)}.`;
    }
    if (best && liftTargetKg <= best.value + SAME_KG) return "You've lifted this in the last 12 weeks. The goal is reached the next time you do it.";
    return undefined;
  })();

  // Weekly goals with a deadline count a total: per week × weeks from when the goal was set.
  const weeklyTotal =
    type === 'frequency' && deadlineDate ? weeklyGoalTotal({ workoutsPerWeek: perWeek, createdAt: startedAt(new Date().toISOString()), deadline: deadlineDate }) : undefined;
  const weeklyTotalText = (() => {
    if (weeklyTotal === undefined) return undefined;
    const total = `${perWeek}× a week for ${plural(weeklyTotal / perWeek, 'week')} is ${plural(weeklyTotal, 'workout')}`;
    const extra = 'An extra workout makes up for a short week.';
    // An existing weekly goal given a new deadline starts over today: say so, and what stops counting.
    if (existing?.type !== 'frequency' || !restarts) return `${total}. ${extra}`;
    const before = goalStatus(existing, home.goalInput);
    const done = before.mode === 'total' ? (before.done ?? 0) : 0;
    return `${total}, counted from today.${done > 0 ? ` The ${done} done so far won't count.` : ''} ${extra}`;
  })();

  // Bodyweight: progress runs from the goal's start weight.
  const bodyweightHint = (() => {
    if (existing?.type === 'bodyweight') {
      const start = goalStatus(existing, home.goalInput).start;
      return start !== undefined ? `Started at ${formatLoad(start, units)}. Progress is measured from there.` : 'Progress starts from your next weigh-in.';
    }
    return home.latestBodyweightKg !== undefined
      ? `Latest weigh-in: ${formatLoad(home.latestBodyweightKg, units)}. Progress is measured from there.`
      : 'No weigh-ins yet. Progress starts from your next weigh-in.';
  })();

  const save = async () => {
    // Guards a double tap while the first save is still running.
    if (!valid || saveGoal.isPending) return;
    const goal = buildGoal(new Date().toISOString(), existing?.id ?? newId('goal'));
    if (!(await succeeded(saveGoal.mutateAsync(goal)))) return;
    router.back();
    toast.show({ message: existing ? 'Goal updated.' : 'Goal added to Home.', tone: 'success' });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]} onAccessibilityEscape={() => router.back()}>
      <Bar title={existing ? 'Edit goal' : 'New goal'} canSave={valid && !saveGoal.isPending} onSave={save} />

      <ScrollView contentContainerStyle={[styles.content, readable]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <SegmentedControl
          label="Goal type"
          options={[
            { value: 'lift', label: 'Lift' },
            // "Frequency" truncates in a four-way control even at the default text size.
            { value: 'frequency', label: 'Weekly' },
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
                  <ListRow key={e.id} title={e.name} onPress={() => chooseLiftExercise(e)} separator={i < liftMatches.length - 1} />
                ))}
              </Card>
            )}
            {!liftExercise?.isBodyweight && (
              <SegmentedControl
                label="Target kind"
                options={[
                  { value: 'load_reps', label: 'Weight × reps' },
                  { value: 'e1rm', label: 'Est. 1RM' },
                ]}
                value={liftKind}
                onChange={setLiftKind}
              />
            )}
            <Card>
              <View style={inline}>
                <View style={inlineLabel}>
                  <AppText variant="body">{LOAD_LABEL[liftKind === 'e1rm' ? 'e1rm' : loadField]}</AppText>
                  {loadField !== 'load' && (
                    <AppText variant="footnote" tone="secondary">
                      {loadField === 'added' ? '0 is bodyweight only.' : 'This much or less. 0 is none.'}
                    </AppText>
                  )}
                </View>
                <NumberField
                  label={LOAD_LABEL[liftKind === 'e1rm' ? 'e1rm' : loadField]}
                  value={liftLoad}
                  onChange={setLiftLoad}
                  unit={unitLabel(units)}
                  decimal
                  width={110}
                  placeholder={loadField === 'load' ? '225' : '0'}
                />
              </View>
              {liftKind === 'load_reps' && (
                <View style={[inline, styles.spaced]}>
                  <AppText variant="body" style={inlineLabel}>
                    For at least
                  </AppText>
                  <Stepper label="Target reps" value={liftReps} onChange={setLiftReps} min={1} max={30} unit="reps" spokenValue={(v) => plural(v, 'rep')} />
                </View>
              )}
              {bestText && (
                <AppText variant="footnote" tone="secondary" style={styles.spaced}>
                  {bestText}
                </AppText>
              )}
              {liftNote && (
                <AppText variant="footnote" tone="accent" style={styles.note}>
                  {liftNote}
                </AppText>
              )}
            </Card>
          </View>
        )}

        {type === 'frequency' && (
          <Card>
            <View style={inline}>
              <View style={inlineLabel}>
                <AppText variant="body">Workouts per week</AppText>
                <AppText variant="footnote" tone="secondary">
                  Also sets your weekly streak target.
                </AppText>
              </View>
              <Stepper label="Workouts per week" value={perWeek} onChange={setPerWeek} min={1} max={14} spokenValue={(v) => plural(v, 'workout')} />
            </View>
          </Card>
        )}

        {type === 'bodyweight' && (
          <Card>
            <View style={inline}>
              <AppText variant="body" style={inlineLabel}>
                Target bodyweight
              </AppText>
              <NumberField label="Target bodyweight" value={targetWeight} onChange={setTargetWeight} unit={unitLabel(units)} decimal width={110} placeholder="180" />
            </View>
            <AppText variant="footnote" tone="secondary" style={styles.spaced}>
              {bodyweightHint}
            </AppText>
          </Card>
        )}

        {type === 'form' && (
          <View style={styles.section}>
            <SectionHeader title="Movement" />
            <View style={styles.wrap}>
              {formExercises.map((e) => (
                <Chip key={e.id} label={e.name} selected={formExerciseId === e.id} onPress={() => chooseFormExercise(e)} />
              ))}
            </View>
            <SectionHeader title="Joint" />
            <SegmentedControl label="Joint" options={joints.map((j) => ({ value: j, label: JOINT_LABEL[j] }))} value={joint} onChange={chooseJoint} />
            <Card>
              <View style={inline}>
                <View style={inlineLabel}>
                  <AppText variant="body">Target angle at the bottom</AppText>
                  <AppText variant="footnote" tone="secondary">
                    {currentAngle !== undefined
                      ? `Your latest recording: ${Math.round(currentAngle)}°. ${formGoalAimsHigher(joint) ? 'Larger is higher.' : 'Smaller is deeper.'}`
                      : 'Record a set to see your current angle.'}
                  </AppText>
                </View>
                <Stepper label="Target angle" value={targetDeg} onChange={setTargetDeg} min={20} max={180} unit="°" spokenValue={(v) => plural(v, 'degree')} />
              </View>
            </Card>
            <AppText variant="footnote" tone="secondary" style={styles.hint}>
              Form goals compare you with yourself. They aren't a judgement of good or bad form.
            </AppText>
          </View>
        )}

        <View style={styles.section}>
          <SectionHeader title="Deadline (optional)" />
          <SegmentedControl
            label="Deadline"
            options={[
              { value: 'none', label: 'None' },
              ...(existing?.deadline ? [{ value: 'keep' as const, label: formatShortDate(existing.deadline).split(', ')[1] }] : []),
              { value: '28', label: '4 wk', accessibilityLabel: '4 weeks' },
              { value: '56', label: '8 wk', accessibilityLabel: '8 weeks' },
              { value: '84', label: '12 wk', accessibilityLabel: '12 weeks' },
            ]}
            value={deadline}
            onChange={setDeadline}
          />
          {deadlineDate && (
            <AppText variant="footnote" tone="secondary" style={styles.hint}>
              {deadlineDate < home.today
                ? `Was due ${formatShortDate(deadlineDate)}. Pick a new deadline to see your pace again.`
                : `Due ${formatShortDate(deadlineDate)}. ${paceFromNow ? 'Pace counts from today.' : "Home shows whether you're on pace."}`}
            </AppText>
          )}
          {weeklyTotalText && (
            <AppText variant="footnote" tone="secondary" style={styles.hint}>
              {weeklyTotalText}
            </AppText>
          )}
        </View>

        <Card>
          <AppText variant="footnote" tone="secondary">
            Shows on Home as
          </AppText>
          <AppText variant="headline">{title}</AppText>
        </Card>

        <Button title={existing ? 'Save goal' : 'Add goal'} fullWidth disabled={!valid} loading={saveGoal.isPending} onPress={save} />
      </ScrollView>
      <ToastViewport bottomOffset={spacing.lg} />
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
  stackedField: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  barTitle: {
    flexShrink: 1,
    textAlign: 'center',
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
  note: {
    marginTop: spacing.xs,
  },
});

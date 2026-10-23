import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  ListRow,
  NumberField,
  PRBadge,
  ProgressBar,
  ProgressRing,
  SectionHeader,
  SegmentedControl,
  SetTag,
  Skeleton,
  Stepper,
  TextField,
  Toggle,
  useToast,
  type SetTagValue,
} from '@/components/ui';
import { devFaults } from '@/data/devFaults';
import { useHaptics } from '@/hooks/useHaptics';
import { useAppTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors, type TypographyVariant } from '@/theme/tokens';
import { readable } from '@/theme/layout';

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies readonly { value: ThemePreference; label: string }[];

const SWATCHES: (keyof ThemeColors)[] = [
  'accent', 'accentText', 'accentSubtle', 'background', 'card', 'input', 'border', 'text', 'textSecondary', 'textTertiary',
  'chrome', 'successFill', 'warningFill', 'errorFill', 'destructive', 'pr', 'chartPrimary',
];

const TAGS: SetTagValue[] = ['warmup', 'drop', 'timed_hold', 'assisted', 'amrap', 'to_failure', 'shortened_partials', 'lengthened_partials'];
const MUSCLES = ['Quads', 'Hamstrings', 'Glutes', 'Chest', 'Back'];

/** Dev-only screen showing every shared component in the current theme (roadmap G1.2). */
export default function ComponentGallery() {
  const { colors, preference, setPreference } = useAppTheme();
  const toast = useToast();
  const haptics = useHaptics();

  const [name, setName] = useState('My Safety Bar Squat');
  const [weight, setWeight] = useState<number | undefined>(227.5);
  const [reps, setReps] = useState<number | undefined>(8);
  const [stepWeight, setStepWeight] = useState(225);
  const [stepReps, setStepReps] = useState(8);
  const [units, setUnits] = useState<'lb' | 'kg'>('lb');
  const [reminders, setReminders] = useState(true);
  const [selectedMuscles, setSelectedMuscles] = useState(['Quads', 'Glutes']);
  const [celebration, setCelebration] = useState(0);
  const faults = devFaults.use();
  const queryClient = useQueryClient();

  return (
    <ScrollView contentContainerStyle={[styles.content, readable]} contentInsetAdjustmentBehavior="automatic">
      <SegmentedControl label="Theme" options={THEME_OPTIONS} value={preference} onChange={setPreference} />

      <Section title="Loading & error states">
        <Card padding="none">
          <ListRow
            title="Slow loading"
            subtitle="Every load and save waits 1.5 seconds"
            icon="tortoise"
            trailing={<Toggle label="Slow loading" value={faults.delayMs > 0} onChange={(on) => devFaults.set({ delayMs: on ? 1500 : 0 })} />}
          />
          <ListRow
            title="Fail loads"
            subtitle="Screens that load data show their error state"
            icon="exclamationmark.triangle"
            trailing={<Toggle label="Fail loads" value={faults.failReads} onChange={(failReads) => devFaults.set({ failReads })} />}
          />
          <ListRow
            title="Fail saves"
            subtitle="Saves and deletes show an error toast"
            icon="xmark.octagon"
            trailing={<Toggle label="Fail saves" value={faults.failWrites} onChange={(failWrites) => devFaults.set({ failWrites })} />}
          />
          <ListRow
            title="Reload all data"
            subtitle="Forget what's loaded so every screen loads again"
            icon="arrow.clockwise"
            onPress={() => {
              queryClient.resetQueries();
              toast.show({ message: 'Reloading. Open any tab to see it load.' });
            }}
            separator={false}
          />
        </Card>
        <AppText variant="footnote" tone="secondary" style={styles.hint}>
          Turn on a switch, tap Reload all data, then visit the tabs. Switches turn off when the app restarts.
        </AppText>
      </Section>

      <Section title="Typography">
        <Card>
          <View style={styles.stack}>
            {(Object.keys(typography) as TypographyVariant[]).map((variant) => (
              <AppText key={variant} variant={variant} numberOfLines={1}>
                {variant === 'display' ? '275 × 6' : variant === 'label' ? 'Section label' : `${variant} · Back Squat`}
              </AppText>
            ))}
          </View>
        </Card>
      </Section>

      <Section title="Colors">
        <Card>
          <View style={styles.swatches}>
            {SWATCHES.map((token) => (
              <View key={token} style={styles.swatch}>
                <View style={[styles.swatchChip, { backgroundColor: colors[token] as string, borderColor: colors.border }]} />
                <AppText variant="caption" tone="secondary" numberOfLines={1}>
                  {token}
                </AppText>
              </View>
            ))}
          </View>
        </Card>
      </Section>

      <Section title="Buttons">
        <Card>
          <View style={styles.stack}>
            <Button title="Start workout" icon="play.fill" fullWidth onPress={() => haptics.tap()} />
            <View style={styles.wrapRow}>
              <Button title="Add set" variant="secondary" icon="plus" />
              <Button title="Skip" variant="ghost" />
              <Button title="Delete" variant="destructive" icon="trash" />
            </View>
            <View style={styles.wrapRow}>
              <Button title="Small" size="sm" />
              <Button title="Small secondary" size="sm" variant="secondary" />
              <Button title="Disabled" size="sm" disabled />
              <Button title="Loading" size="sm" loading />
            </View>
          </View>
        </Card>
      </Section>

      <Section title="Inputs">
        <Card>
          <View style={styles.stack}>
            <TextField label="Exercise name" value={name} onChangeText={setName} placeholder="e.g. Pause Squat" />
            <TextField label="Notes" placeholder="Optional" error="Notes can be up to 500 characters." />
            <View style={styles.wrapRow}>
              <NumberField label="Weight" value={weight} onChange={setWeight} unit={units} decimal />
              <NumberField label="Reps" value={reps} onChange={setReps} width={64} />
            </View>
            <View style={styles.wrapRow}>
              <Stepper label="Weight" value={stepWeight} onChange={setStepWeight} step={5} unit={units} />
              <Stepper label="Reps" value={stepReps} onChange={setStepReps} min={1} />
            </View>
            <SegmentedControl
              label="Units"
              options={[
                { value: 'lb', label: 'lb' },
                { value: 'kg', label: 'kg' },
              ]}
              value={units}
              onChange={setUnits}
            />
          </View>
        </Card>
      </Section>

      <Section title="Chips & set tags">
        <Card>
          <View style={styles.stack}>
            <View style={styles.wrapRow}>
              {MUSCLES.map((m) => (
                <Chip
                  key={m}
                  label={m}
                  selected={selectedMuscles.includes(m)}
                  onPress={() => setSelectedMuscles((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))}
                />
              ))}
            </View>
            <View style={styles.wrapRow}>
              {TAGS.map((t) => (
                <SetTag key={t} tag={t} />
              ))}
            </View>
            <View style={styles.wrapRow}>
              {TAGS.map((t) => (
                <SetTag key={t} tag={t} compact />
              ))}
            </View>
          </View>
        </Card>
      </Section>

      <Section title="Records & progress">
        <Card>
          <View style={styles.stack}>
            <View style={[styles.wrapRow, styles.center]}>
              <PRBadge key={celebration} celebrate={celebration > 0} />
              <PRBadge label="Heaviest weight" />
              <PRBadge label="e1RM 330 lb" />
              <Button title="Replay celebration" size="sm" variant="ghost" onPress={() => setCelebration((n) => n + 1)} />
            </View>
            <View style={styles.stack}>
              <View style={styles.spread}>
                <AppText variant="subhead" weight="600">Bench 225 × 5</AppText>
                <AppText variant="subhead" tone="secondary" numeric>205 / 225 lb</AppText>
              </View>
              <ProgressBar value={205 / 225} label="Bench 225 × 5 goal, 91 percent" />
            </View>
            <View style={[styles.wrapRow, styles.center]}>
              <ProgressRing value={2 / 4} label="2 of 4 workouts this week">
                <AppText variant="headline" numeric weight="800">2/4</AppText>
              </ProgressRing>
              <AppText variant="subhead" tone="secondary" style={styles.flex}>
                Weekly target ring for Home. The fill uses the accent text color so it shows on white.
              </AppText>
            </View>
          </View>
        </Card>
      </Section>

      <Section title="Lists">
        <Card padding="none">
          <ListRow title="Units" icon="scalemass" value={units} onPress={() => setUnits(units === 'lb' ? 'kg' : 'lb')} />
          <ListRow title="Workout reminders" subtitle="Weekdays at 5:30 PM" icon="bell" trailing={<Toggle label="Workout reminders" value={reminders} onChange={setReminders} />} />
          <ListRow title="Export data" icon="square.and.arrow.up" onPress={() => {}} />
          <ListRow title="Delete account" icon="trash" destructive onPress={() => {}} separator={false} />
        </Card>
      </Section>

      <Section title="Feedback">
        <Card>
          <View style={styles.stack}>
            <AppText variant="footnote" tone="secondary">Toasts</AppText>
            <View style={styles.wrapRow}>
              <Button title="Saved" size="sm" variant="secondary" onPress={() => toast.show({ message: 'Workout saved', tone: 'success' })} />
              <Button title="Warning" size="sm" variant="secondary" onPress={() => toast.show({ message: 'Camera is about 20° off a side view', tone: 'warning' })} />
              <Button title="Error" size="sm" variant="secondary" onPress={() => toast.show({ message: "Couldn't sync. Saved on this phone.", tone: 'error' })} />
              <Button title="PR" size="sm" variant="secondary" onPress={() => toast.show({ message: 'New PR: Back Squat 275 lb', tone: 'pr' })} />
            </View>
            <AppText variant="footnote" tone="secondary">Haptics</AppText>
            <View style={styles.wrapRow}>
              <Button title="Set done" size="sm" variant="secondary" onPress={haptics.tap} />
              <Button title="Picker" size="sm" variant="secondary" onPress={haptics.selection} />
              <Button title="Timer end" size="sm" variant="secondary" onPress={haptics.timerEnd} />
              <Button title="Success" size="sm" variant="secondary" onPress={haptics.success} />
            </View>
            <AppText variant="footnote" tone="secondary">Sheet</AppText>
            <Button title="Open set type sheet" variant="secondary" icon="rectangle.bottomhalf.inset.filled" onPress={() => router.push('/dev/sheet')} />
          </View>
        </Card>
      </Section>

      <Section title="Empty & loading">
        <Card>
          <EmptyState
            icon="figure.strengthtraining.traditional"
            title="No workouts yet"
            message="Your finished workouts show up here. Start one from Today."
            actionLabel="Go to Today"
            onAction={() => router.navigate('/')}
          />
        </Card>
        <Card>
          <View style={styles.stack}>
            <Skeleton width="60%" height={18} />
            <Skeleton height={12} />
            <Skeleton width="80%" height={12} />
          </View>
        </Card>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge * 2,
    gap: spacing.xxl,
  },
  section: {
    gap: spacing.sm,
  },
  hint: {
    paddingHorizontal: spacing.xs,
  },
  stack: {
    gap: spacing.md,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  center: {
    alignItems: 'center',
  },
  spread: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  swatch: {
    width: 88,
    gap: spacing.xs,
  },
  swatchChip: {
    height: 36,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

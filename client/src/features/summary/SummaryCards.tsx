import type { SFSymbol } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon, PRBadge, SectionHeader } from '@/components/ui';
import { succeeded } from '@/data/hooks';
import type { PersonalRecord, PRType, UnitSystem } from '@/data/types';
import { formatDuration, formatLoad, formatShortDate, formatSigned, formatSignedLoad, plural } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { BestSet, ExerciseSummary, WorkoutSummary } from './summarize';

const PR_LABEL: Record<PRType, string> = {
  heaviest_weight: 'Heaviest weight',
  e1rm: 'Est. 1RM',
  volume: 'Exercise volume',
  reps_at_weight: 'Most reps',
  longest_hold: 'Longest hold',
};

function formatRecord(record: PersonalRecord, units: UnitSystem): { value: string; was?: string } {
  switch (record.type) {
    case 'reps_at_weight':
      return { value: `${record.value} reps at ${formatLoad(record.atLoadKg ?? 0, units)}`, was: record.previousValue !== undefined ? `${record.previousValue} reps` : undefined };
    case 'longest_hold':
      return { value: `${record.value} s`, was: record.previousValue !== undefined ? `${record.previousValue} s` : undefined };
    default:
      return { value: formatLoad(record.value, units), was: record.previousValue !== undefined ? formatLoad(record.previousValue, units) : undefined };
  }
}

export function formatBest(best: BestSet | undefined, units: UnitSystem): string {
  if (!best) return 'No sets logged';
  if (best.kind === 'hold') return `best ${best.seconds} s`;
  if (best.kind === 'bodyweight') return best.addedKg > 0 ? `best +${formatLoad(best.addedKg, units)} × ${best.reps}` : `best ${best.reps} reps`;
  return `best ${formatLoad(best.loadKg, units)} × ${best.reps}`;
}

/** Up is good news (green); down is shown neutrally, never red (user's pick). `neutral` greys out both. */
function Delta({ text, direction, neutral }: { text: string; direction: 'up' | 'down' | 'same'; neutral?: boolean }) {
  const { colors } = useAppTheme();
  const icon: SFSymbol = direction === 'up' ? 'arrowtriangle.up.fill' : direction === 'down' ? 'arrowtriangle.down.fill' : 'equal';
  const good = direction === 'up' && !neutral;
  return (
    <View style={styles.delta}>
      <Icon name={icon} color={good ? colors.successFill : colors.textTertiary} size={10} />
      <AppText variant="footnote" weight="700" tone={good ? 'success' : 'secondary'} numeric>
        {text}
      </AppText>
    </View>
  );
}

const direction = (n: number) => (n > 0.01 ? 'up' : n < -0.01 ? 'down' : 'same') as 'up' | 'down' | 'same';

export function ComparisonCard({ summary, units, name }: { summary: WorkoutSummary; units: UnitSystem; name: string }) {
  const { previous } = summary;
  if (!previous) return null;
  const volume = summary.volumeKg - previous.volumeKg;
  const minutes = summary.minutes !== undefined && previous.minutes !== undefined ? summary.minutes - previous.minutes : undefined;
  const sets = summary.setsDone - previous.setsDone;

  return (
    <View style={styles.section}>
      <SectionHeader title={`vs last ${name} · ${previous.session.completedDate ? formatShortDate(previous.session.completedDate) : ''}`} />
      <Card padding="none">
        <Row label="Volume" value={formatLoad(summary.volumeKg, units)} delta={<Delta text={formatSignedLoad(volume, units)} direction={direction(volume)} />} />
        {minutes !== undefined && summary.minutes !== undefined && (
          // Time isn't better or worse either way, so both directions are neutral.
          <Row label="Time" value={formatDuration(summary.minutes)} delta={<Delta text={formatSigned(minutes, 'min')} direction={direction(Math.round(minutes))} neutral />} />
        )}
        <Row label="Sets logged" value={String(summary.setsDone)} delta={<Delta text={formatSigned(sets, Math.abs(sets) === 1 ? 'set' : 'sets')} direction={direction(sets)} />} last />
      </Card>
    </View>
  );
}

function Row({ label, value, delta, last }: { label: string; value: string; delta: ReactNode; last?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.row, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <AppText variant="body" style={styles.flex}>
        {label}
      </AppText>
      <AppText variant="body" weight="600" numeric>
        {value}
      </AppText>
      <View style={styles.deltaCell}>{delta}</View>
    </View>
  );
}

export function RecordsCard({ summary, units }: { summary: WorkoutSummary; units: UnitSystem }) {
  const { colors } = useAppTheme();
  if (!summary.records.length) return null;
  const byExercise = new Map<string, PersonalRecord[]>();
  for (const r of summary.records) byExercise.set(r.exerciseId, [...(byExercise.get(r.exerciseId) ?? []), r]);
  const names = new Map(summary.exercises.map((e) => [e.exerciseId, e.name]));

  return (
    <View style={styles.section}>
      <SectionHeader title={`New personal records · ${summary.records.length}`} />
      <Card padding="none">
        {[...byExercise].map(([exerciseId, records], i) => (
          <View key={exerciseId} style={[styles.prGroup, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <AppText variant="headline">{names.get(exerciseId) ?? 'Exercise'}</AppText>
            {records.map((r) => {
              const { value, was } = formatRecord(r, units);
              return (
                <View key={r.id} style={styles.prLine}>
                  <PRBadge label={PR_LABEL[r.type]} />
                  <AppText variant="subhead" weight="600" numeric style={styles.flex}>
                    {value}
                  </AppText>
                  {was && (
                    <AppText variant="footnote" tone="secondary" numeric>
                      {`was ${was}`}
                    </AppText>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </Card>
    </View>
  );
}

function formatExerciseDelta(e: ExerciseSummary, units: UnitSystem): string | undefined {
  if (!e.delta || Math.abs(e.delta.amount) < 0.01) return undefined;
  return e.delta.kind === 'hold' ? formatSigned(e.delta.amount, 's') : formatSignedLoad(e.delta.amount, units);
}

export function ExercisesCard({ summary, units }: { summary: WorkoutSummary; units: UnitSystem }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.section}>
      <SectionHeader title="Exercises" />
      <Card padding="none">
        {summary.exercises.map((e, i) => {
          const delta = formatExerciseDelta(e, units);
          return (
            <View key={e.entryId} style={[styles.row, i < summary.exercises.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <View style={styles.flex}>
                <AppText variant="body" weight="600" tone={e.skipped ? 'tertiary' : 'primary'} numberOfLines={1}>
                  {e.name}
                </AppText>
                <AppText variant="footnote" tone="secondary" numeric>
                  {e.skipped ? 'Skipped' : `${e.setsDone} of ${plural(e.setsTotal, 'set')} · ${formatBest(e.best, units)}`}
                </AppText>
              </View>
              {e.prTypes.length > 0 && <Icon name="star.fill" color={colors.pr} size={14} />}
              {delta && <Delta text={delta} direction={direction(e.delta!.amount)} />}
            </View>
          );
        })}
      </Card>
    </View>
  );
}

/** Offers to save mid-workout changes back to the plan (spec 2.6). */
export function SavePlanCard({ workoutName, planName, changes, onSave }: { workoutName: string; planName: string; changes: string[]; onSave: () => Promise<void> }) {
  const { colors } = useAppTheme();
  const [state, setState] = useState<'asking' | 'saving' | 'saved' | 'dismissed'>('asking');
  if (state === 'dismissed') return null;

  return (
    <Card>
      {state === 'saved' ? (
        <View style={styles.saved}>
          <Icon name="checkmark.circle.fill" color={colors.successFill} size={22} />
          <AppText variant="subhead" style={styles.flex}>
            {`${workoutName} in ${planName} updated. Future ${workoutName} workouts use these changes; past ones stay as they were.`}
          </AppText>
        </View>
      ) : (
        <View style={styles.saveStack}>
          <View style={styles.saved}>
            <Icon name="square.and.pencil" color={colors.accentText} size={20} />
            <AppText variant="headline" style={styles.flex}>{`Update ${workoutName} in your plan?`}</AppText>
          </View>
          <View style={styles.changes}>
            {changes.map((c) => (
              <AppText key={c} variant="subhead" tone="secondary">
                {`•  ${c}`}
              </AppText>
            ))}
          </View>
          <View style={styles.buttons}>
            <Button
              title="Update plan"
              variant="secondary"
              size="sm"
              loading={state === 'saving'}
              onPress={async () => {
                setState('saving');
                // On failure the error toast is already shown; ask again so they can retry.
                setState((await succeeded(onSave())) ? 'saved' : 'asking');
              }}
            />
            <Button title="Just this time" variant="ghost" size="sm" onPress={() => setState('dismissed')} />
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  deltaCell: {
    minWidth: 92,
    alignItems: 'flex-end',
  },
  delta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  prGroup: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  prLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  saveStack: {
    gap: spacing.md,
  },
  saved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  changes: {
    gap: spacing.xs,
    paddingLeft: 20 + spacing.md,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingLeft: 20 + spacing.md,
  },
  flex: {
    flex: 1,
  },
});

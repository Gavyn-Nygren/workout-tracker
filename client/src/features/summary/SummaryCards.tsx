import type { SFSymbol } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon, PRBadge, SectionHeader } from '@/components/ui';
import { succeeded } from '@/data/hooks';
import type { Goal, ISODate, PersonalRecord, PRType, UnitSystem } from '@/data/types';
import { spokenDuration } from '@/hooks/useNow';
import { formatAddedLoad, formatDuration, formatLoad, formatShortDate, formatSigned, plural, spokenAddedLoad, spokenLoad } from '@/lib/format';
import { useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { reachedAfter } from './goalsReached';
import type { BestSet, ExerciseSummary, WorkoutSummary } from './summarize';
import { exerciseChange, loadChange } from './summaryChanges';

const PR_LABEL: Record<PRType, string> = {
  heaviest_weight: 'Heaviest weight',
  e1rm: 'Est. 1RM',
  volume: 'Exercise volume',
  reps_at_weight: 'Most reps',
  longest_hold: 'Longest hold',
};
const PR_SPOKEN: Record<PRType, string> = { ...PR_LABEL, e1rm: 'Estimated one-rep max' };

// VoiceOver versions of the numbers below: "1,240 pounds", "up 2 sets", "no change".
function spokenChange(amount: number, unit: (n: number) => string): string {
  if (Math.abs(amount) < 0.01) return 'no change';
  return `${amount > 0 ? 'up' : 'down'} ${unit(Math.abs(amount))}`;
}

/**
 * A record's load. Bodyweight lifts' heaviest weight and reps-at-weight records hold what was
 * added to bodyweight ("+20 lb", "−20 lb" for assistance), not the total.
 */
const recordLoad = (record: PersonalRecord, kg: number, units: UnitSystem, bodyweight?: string) =>
  record.addedLoad ? formatAddedLoad(kg, units, bodyweight) : formatLoad(kg, units);
const spokenRecordLoad = (record: PersonalRecord, kg: number, units: UnitSystem) => (record.addedLoad ? spokenAddedLoad(kg, units) : spokenLoad(kg, units));

function spokenRecord(record: PersonalRecord, units: UnitSystem): string {
  const previous = record.previousValue;
  switch (record.type) {
    case 'reps_at_weight':
      return `${plural(record.value, 'rep')} at ${spokenRecordLoad(record, record.atLoadKg ?? 0, units)}${previous !== undefined ? `, was ${plural(previous, 'rep')}` : ''}`;
    case 'longest_hold':
      return `${spokenDuration(record.value)}${previous !== undefined ? `, was ${spokenDuration(previous)}` : ''}`;
    default:
      return `${spokenRecordLoad(record, record.value, units)}${previous !== undefined ? `, was ${spokenRecordLoad(record, previous, units)}` : ''}`;
  }
}

function spokenBest(best: BestSet | undefined, units: UnitSystem): string {
  if (!best) return 'no sets logged';
  if (best.kind === 'hold') return `best hold ${spokenDuration(best.seconds)}`;
  if (best.kind === 'bodyweight') return `best ${spokenAddedLoad(best.addedKg, units)} for ${plural(best.reps, 'rep')}`;
  return `best ${spokenLoad(best.loadKg, units)} for ${plural(best.reps, 'rep')}`;
}

function formatRecord(record: PersonalRecord, units: UnitSystem): { value: string; was?: string } {
  switch (record.type) {
    case 'reps_at_weight':
      return {
        value: `${record.value} reps at ${recordLoad(record, record.atLoadKg ?? 0, units, 'bodyweight')}`,
        was: record.previousValue !== undefined ? `${record.previousValue} reps` : undefined,
      };
    case 'longest_hold':
      return { value: `${record.value} s`, was: record.previousValue !== undefined ? `${record.previousValue} s` : undefined };
    default:
      return { value: recordLoad(record, record.value, units), was: record.previousValue !== undefined ? recordLoad(record, record.previousValue, units) : undefined };
  }
}

export function formatBest(best: BestSet | undefined, units: UnitSystem): string {
  if (!best) return 'No sets logged';
  if (best.kind === 'hold') return `best ${best.seconds} s`;
  if (best.kind === 'bodyweight') return `best ${formatAddedLoad(best.addedKg, units, 'bodyweight')} × ${best.reps}`;
  return `best ${formatLoad(best.loadKg, units)} × ${best.reps}`;
}

/** An exercise's line on the summary: "3 of 4 sets · best 225 lb × 5", or "Skipped after 2 sets · …". */
function exerciseLine(e: ExerciseSummary, units: UnitSystem): { text: string; spoken: string } {
  if (e.skipped && !e.setsDone) return { text: 'Skipped', spoken: 'skipped' };
  const sets = e.skipped ? `Skipped after ${plural(e.setsDone, 'set')}` : `${e.setsDone} of ${plural(e.setsTotal, 'set')}`;
  // Sets done without a best (partial reps only) show just the count.
  if (!e.best && e.setsDone) return { text: sets, spoken: sets.toLowerCase() };
  return { text: `${sets} · ${formatBest(e.best, units)}`, spoken: `${sets.toLowerCase()}, ${spokenBest(e.best, units)}` };
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
  const volume = loadChange(summary.volumeKg - previous.volumeKg, units);
  const minutes = summary.minutes !== undefined && previous.minutes !== undefined ? summary.minutes - previous.minutes : undefined;
  const sets = summary.setsDone - previous.setsDone;

  return (
    <View style={styles.section}>
      <SectionHeader title={`vs last ${name} · ${previous.session.completedDate ? formatShortDate(previous.session.completedDate) : ''}`} />
      <Card padding="none">
        <Row
          label="Volume"
          value={formatLoad(summary.volumeKg, units)}
          delta={<Delta text={volume.text} direction={volume.direction} />}
          spoken={`Volume: ${spokenLoad(summary.volumeKg, units)}, ${volume.spoken} vs last time`}
        />
        {minutes !== undefined && summary.minutes !== undefined && (
          // Time isn't better or worse either way, so both directions are neutral.
          <Row
            label="Time"
            value={formatDuration(summary.minutes)}
            delta={<Delta text={formatSigned(minutes, 'min')} direction={direction(Math.round(minutes))} neutral />}
            spoken={`Time: ${spokenDuration(Math.round(summary.minutes) * 60)}, ${spokenChange(Math.round(minutes), (n) => plural(n, 'minute'))} vs last time`}
          />
        )}
        <Row
          label="Sets logged"
          value={String(summary.setsDone)}
          delta={<Delta text={formatSigned(sets, Math.abs(sets) === 1 ? 'set' : 'sets')} direction={direction(sets)} />}
          spoken={`Sets logged: ${summary.setsDone}, ${spokenChange(sets, (n) => plural(n, 'set'))} vs last time`}
          last
        />
      </Card>
    </View>
  );
}

function Row({ label, value, delta, spoken, last }: { label: string; value: string; delta: ReactNode; spoken: string; last?: boolean }) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const border = !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth };
  if (large) {
    // Large text: the label on its own line, the value and change under it.
    return (
      <View style={[styles.rowStacked, border]} accessible accessibilityLabel={spoken}>
        <AppText variant="body">{label}</AppText>
        <View style={styles.wrapLine}>
          <AppText variant="body" weight="600" numeric>
            {value}
          </AppText>
          {delta}
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.row, border]} accessible accessibilityLabel={spoken}>
      <AppText variant="body" style={styles.flex}>
        {label}
      </AppText>
      <AppText variant="body" weight="600" numeric style={styles.shrink}>
        {value}
      </AppText>
      <View style={styles.deltaCell}>{delta}</View>
    </View>
  );
}

export function RecordsCard({ summary, units }: { summary: WorkoutSummary; units: UnitSystem }) {
  const { colors } = useAppTheme();
  const { fontScale } = useTextScale();
  // The badge crowds the value out early, so record lines stack from XXXL.
  const stacked = fontScale >= 1.3;
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
              const valueText = (
                <AppText variant="subhead" weight="600" numeric style={stacked ? styles.shrink : styles.flex}>
                  {value}
                </AppText>
              );
              const wasText = was && (
                <AppText variant="footnote" tone="secondary" numeric style={styles.shrink}>
                  {`was ${was}`}
                </AppText>
              );
              return (
                <View key={r.id} style={stacked ? styles.prLineStacked : styles.prLine} accessible accessibilityLabel={`Personal record, ${PR_SPOKEN[r.type]}: ${spokenRecord(r, units)}`}>
                  <PRBadge label={PR_LABEL[r.type]} />
                  {stacked ? (
                    <View style={styles.wrapLine}>
                      {valueText}
                      {wasText}
                    </View>
                  ) : (
                    <>
                      {valueText}
                      {wasText}
                    </>
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

/**
 * Goals this workout reached (G3.10), with how long each took. `date` is the workout's completion
 * date, which is the day it reached them.
 */
export function GoalsReachedCard({ goals, date }: { goals: Goal[]; date?: ISODate }) {
  const { colors } = useAppTheme();
  if (!goals.length) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title={goals.length > 1 ? `Goals reached · ${goals.length}` : 'Goal reached'} />
      <Card padding="none">
        {goals.map((goal, i) => {
          const detail = date ? reachedAfter(goal, date) : undefined;
          return (
            <View
              key={goal.id}
              accessible
              accessibilityLabel={`Goal reached: ${goal.title}${detail ? `. ${detail}` : ''}`}
              style={[styles.row, i < goals.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <View style={[styles.goalIcon, { backgroundColor: colors.successSubtle }]}>
                <Icon name="target" color={colors.successText} size={16} />
              </View>
              <View style={styles.flex}>
                <AppText variant="body" weight="600">
                  {goal.title}
                </AppText>
                {detail && (
                  <AppText variant="footnote" tone="secondary" numeric>
                    {detail}
                  </AppText>
                )}
              </View>
              <Icon name="checkmark.circle.fill" color={colors.successFill} size={20} />
            </View>
          );
        })}
      </Card>
    </View>
  );
}

export function ExercisesCard({ summary, units }: { summary: WorkoutSummary; units: UnitSystem }) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  return (
    <View style={styles.section}>
      <SectionHeader title="Exercises" />
      <Card padding="none">
        {summary.exercises.map((e, i) => {
          const change = exerciseChange(e, units);
          const line = exerciseLine(e, units);
          const pr = e.prTypes.length > 0;
          const spokenDelta = change ? `, ${change.spoken} since last time` : '';
          const marks = (pr || change) && (
            <>
              {pr && <Icon name="star.fill" color={colors.prOnSurface} size={14} />}
              {change && <Delta text={change.text} direction={change.direction} />}
            </>
          );
          return (
            <View
              key={e.entryId}
              accessible
              accessibilityLabel={`${e.name}, ${line.spoken}${pr ? ', personal record' : ''}${spokenDelta}`}
              style={[styles.row, i < summary.exercises.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <View style={styles.flex}>
                <AppText variant="body" weight="600" tone={e.skipped ? 'secondary' : 'primary'} numberOfLines={large ? undefined : 2}>
                  {e.name}
                </AppText>
                <AppText variant="footnote" tone="secondary" numeric>
                  {line.text}
                </AppText>
                {/* Large text: the PR star and change move under the name so it keeps the width. */}
                {large && marks && <View style={styles.marksLine}>{marks}</View>}
              </View>
              {!large && marks}
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
  const { large } = useTextScale();
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
          <View style={[styles.changes, large && styles.noIndent]}>
            {changes.map((c) => (
              // The bullet is visual only; VoiceOver would read it as "bullet".
              <AppText key={c} variant="subhead" tone="secondary" accessibilityLabel={c}>
                {`•  ${c}`}
              </AppText>
            ))}
          </View>
          <View style={[styles.buttons, large && styles.noIndent]}>
            <Button
              title="Update plan"
              variant="secondary"
              size="sm"
              loading={state === 'saving'}
              onPress={async () => {
                setState('saving');
                // On failure the error toast is already shown; ask again so they can retry.
                const ok = await succeeded(onSave());
                setState(ok ? 'saved' : 'asking');
                // The pressed button disappears, so say what happened.
                if (ok) AccessibilityInfo.announceForAccessibility(`${workoutName} in ${planName} updated.`);
              }}
            />
            <Button
              title="Just this time"
              variant="ghost"
              size="sm"
              onPress={() => {
                setState('dismissed');
                AccessibilityInfo.announceForAccessibility('Plan left as it was.');
              }}
            />
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
  rowStacked: {
    gap: 2,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  wrapLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.md,
    rowGap: 2,
  },
  marksLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  deltaCell: {
    minWidth: 92,
    flexShrink: 1,
    alignItems: 'flex-end',
  },
  shrink: {
    flexShrink: 1,
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
  prLineStacked: {
    gap: spacing.xs,
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
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingLeft: 20 + spacing.md,
  },
  noIndent: {
    paddingLeft: 0,
  },
  goalIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
});

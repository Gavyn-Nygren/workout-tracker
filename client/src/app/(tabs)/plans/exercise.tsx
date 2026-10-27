import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, ErrorState, Icon, ListRow, NotFoundState, ScreenSkeleton, SectionHeader } from '@/components/ui';
import { useExercises, usePlans, useSessions } from '@/data/hooks';
import { withRememberedRests } from '@/data/preferences';
import { formatClock, spokenDuration } from '@/hooks/useNow';
import { formatShortDate } from '@/lib/format';
import { EQUIPMENT_ICON, EQUIPMENT_LABEL, MUSCLE_LABEL } from '@/features/exercises/ExerciseList';
import { RestStepper } from '@/features/settings/RestStepper';
import { useSettings } from '@/features/settings/useSettings';
import { formatBest } from '@/features/summary/SummaryCards';
import { bestSet } from '@/features/summary/summarize';
import { exerciseRest } from '@/features/workout/rest';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { readable, useTextScale } from '@/theme/layout';

/** Exercise details: what it trains, its rest, where it's used, and when you last did it. */
export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const exercisesQuery = useExercises();
  const plansQuery = usePlans();
  const sessionsQuery = useSessions();
  const { data: exercises } = exercisesQuery;
  const { data: plans } = plansQuery;
  const { data: sessions } = sessionsQuery;
  const { preferences, update } = useSettings();
  const units = preferences.units;

  const exercise = exercises?.find((e) => e.id === id);
  const base = exercises?.find((e) => e.id === exercise?.baseMovementId);
  const variants = (exercises ?? []).filter((e) => e.baseMovementId === id);

  const usedIn = useMemo(
    () =>
      (plans ?? []).flatMap((p) =>
        p.workouts.filter((w) => w.blocks.some((b) => b.exercises.some((e) => e.exerciseId === id))).map((w) => ({ plan: p, workout: w })),
      ),
    [plans, id],
  );
  const last = useMemo(() => {
    const done = (sessions ?? [])
      .filter((s) => s.status === 'completed')
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    for (const s of done) {
      const entry = s.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === id && e.sets.some((x) => x.completedAt));
      if (entry) return { session: s, entry };
    }
    return undefined;
  }, [sessions, id]);

  // "Last done" and "In your plans" wait for sessions and plans too, so they never flash "Not yet".
  const queries = [exercisesQuery, plansQuery, sessionsQuery];
  const failed = queries.filter((q) => q.error);
  if (failed.length) return <ErrorState fill title="Couldn't load this exercise" onRetry={() => failed.forEach((q) => q.refetch())} />;
  if (queries.some((q) => q.isPending)) return <ScreenSkeleton />;
  if (!exercise) return <NotFoundState thing="Exercise" icon="dumbbell" />;

  const tags = [
    exercise.equipment && EQUIPMENT_LABEL[exercise.equipment],
    exercise.category === 'compound' ? 'Compound' : 'Isolation',
    exercise.isBodyweight ? 'Bodyweight load' : undefined,
    exercise.source === 'custom' ? 'Custom' : undefined,
  ].filter(Boolean) as string[];

  // The rest between its sets when a plan sets none (spec 2.6): remembered from adjusting the
  // timer in workouts or set here, else its type's default from Settings.
  const rest = exerciseRest(exercise.id, exercise.category, { defaults: preferences.restDefaultsSec, remembered: preferences.restByExerciseSec });
  const typeName = exercise.category === 'compound' ? 'compound' : 'isolation';
  const typeDefaultSec = preferences.restDefaultsSec[exercise.category];

  return (
    <>
      <Stack.Screen
        options={{
          title: exercise.name,
          headerRight:
            exercise.source === 'custom'
              ? () => (
                  <Pressable onPress={() => router.push({ pathname: '/plans/exercise-form', params: { id: exercise.id } })} accessibilityRole="button" accessibilityLabel="Edit exercise" hitSlop={10}>
                    <Icon name="pencil" color={colors.onChrome} size={18} />
                  </Pressable>
                )
              : undefined,
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, readable]}>
        <View style={styles.header}>
          <View style={[styles.iconWell, { backgroundColor: colors.accentSubtle }]}>
            <Icon name={EQUIPMENT_ICON[exercise.equipment ?? 'other']} color={colors.accentText} size={26} />
          </View>
          <AppText variant="title1" accessibilityRole="header">
            {exercise.name}
          </AppText>
          <View style={styles.tags}>
            {tags.map((t) => (
              <View key={t} style={[styles.tag, { backgroundColor: colors.input }]}>
                <AppText variant="caption" weight="700" tone="secondary">
                  {t}
                </AppText>
              </View>
            ))}
            {exercise.formAnalysis && (
              <View style={[styles.tag, { backgroundColor: colors.accentSubtle }]}>
                <Icon name="video.fill" color={colors.accentText} size={11} />
                <AppText variant="caption" weight="700" tone="accent">
                  Form analysis
                </AppText>
              </View>
            )}
          </View>
        </View>

        <Card padding="none">
          <ListRow title="Primary muscles" value={exercise.primaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ') || '—'} />
          {!!exercise.secondaryMuscles?.length && <ListRow title="Also works" value={exercise.secondaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')} />}
          {!!exercise.aliases?.length && <ListRow title="Also called" value={exercise.aliases.join(', ')} />}
          {base && <ListRow title="Variation of" value={base.name} onPress={() => router.push({ pathname: '/plans/exercise', params: { id: base.id } })} />}
          <ListRow
            title="Last done"
            subtitle={last ? formatBest(last.entry && bestSet(last.entry, exercise), units) : undefined}
            value={last?.session.completedDate ? formatShortDate(last.session.completedDate) : 'Not yet'}
            separator={false}
          />
        </Card>

        <View style={styles.section}>
          <SectionHeader title="Rest" />
          <Card padding="none">
            {/* At accessibility sizes the label sits above the stepper so neither gets squeezed. */}
            <View style={large ? styles.restStacked : styles.restRow}>
              <View style={!large && styles.flex}>
                <AppText variant="body">Rest between sets</AppText>
                <AppText variant="footnote" tone="secondary">
                  {rest.source === 'remembered' ? 'Remembered for this exercise' : `${typeName === 'compound' ? 'Compound' : 'Isolation'} default`}
                </AppText>
              </View>
              <RestStepper
                label={`Rest between sets of ${exercise.name}`}
                value={rest.durationSec}
                onChange={(sec) => update((p) => withRememberedRests(p, { [exercise.id]: sec }))}
              />
            </View>
            {rest.source === 'remembered' && (
              <View style={[styles.restFooter, { borderTopColor: colors.border }]}>
                <Button
                  title={`Reset to ${typeName} default`}
                  variant="ghost"
                  size="sm"
                  icon="arrow.counterclockwise"
                  onPress={() => {
                    update((p) => withRememberedRests(p, { [exercise.id]: null }));
                    // The button goes away with the remembered rest, so the result is said.
                    AccessibilityInfo.announceForAccessibility(`Rest reset to the ${typeName} default, ${spokenDuration(typeDefaultSec)}.`);
                  }}
                  accessibilityLabel={`Reset rest to the ${typeName} default, ${spokenDuration(typeDefaultSec)}`}
                />
              </View>
            )}
          </Card>
          <AppText variant="footnote" tone="secondary" style={styles.hint}>
            {`Used when a plan doesn't set its own rest. Changing the rest timer after a set of this exercise updates it.${rest.source === 'remembered' ? ` The ${typeName} default is ${formatClock(typeDefaultSec)}.` : ''}`}
          </AppText>
        </View>

        {exercise.instructions && (
          <View style={styles.section}>
            <SectionHeader title="How to" />
            <Card>
              <AppText variant="body">{exercise.instructions}</AppText>
            </Card>
          </View>
        )}

        {variants.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Your variations" />
            <Card padding="none">
              {variants.map((v, i) => (
                <ListRow key={v.id} title={v.name} onPress={() => router.push({ pathname: '/plans/exercise', params: { id: v.id } })} separator={i < variants.length - 1} />
              ))}
            </Card>
          </View>
        )}

        <View style={styles.section}>
          <SectionHeader title="In your plans" />
          <Card padding="none">
            {usedIn.map(({ plan, workout }, i) => (
              <ListRow
                key={`${plan.id}-${workout.id}`}
                title={workout.name}
                subtitle={plan.name}
                onPress={() => router.push({ pathname: '/plans/workout', params: { plan: plan.id, workout: workout.id } })}
                separator={i < usedIn.length - 1}
              />
            ))}
            {!usedIn.length && (
              <AppText variant="subhead" tone="secondary" style={styles.none}>
                Not in any plan yet. Add it from a workout in My plans.
              </AppText>
            )}
          </Card>
        </View>
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
  header: {
    gap: spacing.sm,
  },
  iconWell: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  section: {
    gap: spacing.sm,
  },
  none: {
    padding: spacing.lg,
  },
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  restStacked: {
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  restFooter: {
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  hint: {
    paddingHorizontal: spacing.xs,
  },
  flex: {
    flex: 1,
  },
});

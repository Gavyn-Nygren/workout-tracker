import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Chip, EmptyState, ErrorState, SectionHeader, SegmentedControl, Skeleton } from '@/components/ui';
import { useRepository } from '@/data/DataProvider';
import { useExercises, usePlans, useTemplates } from '@/data/hooks';
import type { StarterTemplate } from '@/data/types';
import { ExerciseList } from '@/features/exercises/ExerciseList';
import { CATEGORY_LABEL } from '@/features/plans/describe';
import { PlanCard } from '@/features/plans/PlanCard';
import { TemplateCard } from '@/features/plans/TemplateCard';
import { dashboard, Grid, readable } from '@/theme/layout';
import { radius, spacing } from '@/theme/tokens';

type Segment = 'plans' | 'templates' | 'exercises';
const SEGMENTS = [
  { value: 'plans', label: 'My plans' },
  { value: 'templates', label: 'Templates' },
  { value: 'exercises', label: 'Exercises' },
] as const;

const CATEGORIES = Object.keys(CATEGORY_LABEL) as StarterTemplate['category'][];

/** Plans tab (roadmap G2.4): your plans, starter templates, and the exercise library. */
export default function PlansScreen() {
  const params = useLocalSearchParams<{ segment?: Segment }>();
  const [segment, setSegment] = useState<Segment>(params.segment ?? 'plans');

  return (
    <ScrollView contentContainerStyle={[styles.content, dashboard]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <View style={readable}>
        <SegmentedControl label="Plans sections" options={SEGMENTS} value={segment} onChange={setSegment} />
      </View>
      {segment === 'plans' && <MyPlans />}
      {segment === 'templates' && <Templates />}
      {segment === 'exercises' && <Exercises />}
    </ScrollView>
  );
}

function MyPlans() {
  const today = useRepository().today();
  const { data: plans, isLoading, error, refetch } = usePlans();
  if (error) return <ErrorState title="Couldn't load your plans" onRetry={refetch} />;
  if (isLoading) return <Skeleton height={180} radius={radius.card} />;

  const active = (plans ?? []).filter((p) => p.status === 'active');
  const inactive = (plans ?? []).filter((p) => p.status !== 'active');
  const open = (id: string) => router.push({ pathname: '/plans/plan', params: { id } });

  return (
    <View style={styles.section}>
      {active.length > 0 && <SectionHeader title={`Active · ${active.length}`} />}
      {/* Two cards per row on iPad. */}
      <Grid>
        {active.map((plan) => (
          <PlanCard key={plan.id} plan={plan} today={today} onPress={() => open(plan.id)} />
        ))}
      </Grid>
      {!plans?.length && (
        <EmptyState icon="calendar.badge.plus" title="No plans yet" message="Create your own plan, or start from a template and adjust it as you go." />
      )}
      <Button title="New plan" icon="plus" fullWidth onPress={() => router.push('/plans/new')} />
      {inactive.length > 0 && <SectionHeader title={`Paused & archived · ${inactive.length}`} />}
      <Grid>
        {inactive.map((plan) => (
          <PlanCard key={plan.id} plan={plan} today={today} onPress={() => open(plan.id)} />
        ))}
      </Grid>
    </View>
  );
}

function Templates() {
  const { data: templates, isLoading, error, refetch } = useTemplates();
  const [category, setCategory] = useState<StarterTemplate['category'] | null>(null);

  const list = (templates ?? []).filter((t) => !category || t.category === category);
  return (
    <View style={styles.section}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="All" role="radio" selected={!category} onPress={() => setCategory(null)} />
        {CATEGORIES.map((c) => (
          <Chip key={c} label={CATEGORY_LABEL[c]} role="radio" selected={category === c} onPress={() => setCategory(category === c ? null : c)} />
        ))}
      </ScrollView>
      {/* The category chips show right away; the cards below wait for the templates. */}
      {error ? (
        <ErrorState title="Couldn't load templates" onRetry={refetch} />
      ) : isLoading ? (
        <Skeleton height={160} radius={radius.card} />
      ) : (
        <Grid>
          {list.map((t) => (
            <TemplateCard key={t.id} template={t} onPress={() => router.push({ pathname: '/plans/template', params: { id: t.id } })} />
          ))}
        </Grid>
      )}
      {!isLoading && !error && !list.length && <EmptyState icon="square.stack.3d.up" title="No templates here yet" message="More programs are being written. Try another category." />}
    </View>
  );
}

function Exercises() {
  const { data: exercises, isLoading, error, refetch } = useExercises();
  // A long list reads best at a readable width, even on iPad.
  return (
    <View style={readable}>
      <ExerciseList
        exercises={exercises ?? []}
        groupCustom
        loading={isLoading}
        error={Boolean(error)}
        onRetry={refetch}
        onPick={(e) => router.push({ pathname: '/plans/exercise', params: { id: e.id } })}
        accessory={<Button title="New custom exercise" variant="secondary" icon="plus" fullWidth onPress={() => router.push('/plans/exercise-form')} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.md,
  },
  chips: {
    gap: spacing.sm,
  },
});

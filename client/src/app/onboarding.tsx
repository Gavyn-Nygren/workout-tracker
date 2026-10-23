import type { SFSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActionSheetIOS, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Card, Chip, Icon, NumberField, Stepper, TextField, useToast } from '@/components/ui';
import { useRepository } from '@/data/DataProvider';
import { useSaveBodyweight, useSavePlan, useTemplates } from '@/data/hooks';
import type { Equipment, ExperienceLevel } from '@/data/types';
import { lbToKg } from '@/data/units';
import { formatShortDate } from '@/lib/format';
import { newId } from '@/lib/id';
import { authStore, completeOnboarding } from '@/features/auth/authStore';
import { onboardingAnswers, type Answers } from '@/features/onboarding/answers';
import { recommendTemplates, type Goal } from '@/features/onboarding/recommend';
import { nextMonday, planFromTemplate } from '@/features/plans/planEdits';
import { templateMeta } from '@/features/plans/TemplateCard';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

const STEPS = ['experience', 'goal', 'equipment', 'days', 'body', 'limits'] as const;

const EXPERIENCE: { value: ExperienceLevel; title: string; body: string }[] = [
  { value: 'beginner', title: 'Beginner', body: 'Less than a year of regular lifting' },
  { value: 'intermediate', title: 'Intermediate', body: '1 to 3 years; comfortable with the main lifts' },
  { value: 'advanced', title: 'Advanced', body: '3+ years; you run your own programming' },
];
const GOALS: { value: Goal; title: string; icon: SFSymbol }[] = [
  { value: 'strength', title: 'Build strength', icon: 'dumbbell.fill' },
  { value: 'muscle', title: 'Build muscle', icon: 'figure.strengthtraining.traditional' },
  { value: 'athletic', title: 'Athletic performance', icon: 'figure.run' },
  { value: 'mobility', title: 'Mobility and full range', icon: 'figure.flexibility' },
  { value: 'general', title: 'General fitness', icon: 'heart.fill' },
];
const EQUIPMENT: { value: Equipment; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbells' },
  { value: 'machine', label: 'Machines' },
  { value: 'cable', label: 'Cables' },
  { value: 'kettlebell', label: 'Kettlebells' },
  { value: 'band', label: 'Bands' },
  { value: 'bodyweight', label: 'Bodyweight' },
];
const LIMITS = ['Lower back', 'Knees', 'Shoulders', 'Hips', 'Wrists', 'Ankles'];

/**
 * Optional onboarding (spec 2.4; user's pick: one question per screen). Every step can be
 * skipped, and the recommendation and the tour are separate, optional choices at the end.
 */
export default function OnboardingScreen() {
  const { colors, scheme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const today = useRepository().today();
  const { data: templates } = useTemplates();
  const savePlan = useSavePlan();
  const saveBodyweight = useSaveBodyweight();
  const name = authStore.use().name;
  const [step, setStep] = useState<number>(-1);
  const [phase, setPhase] = useState<'questions' | 'recommend' | 'tour'>('questions');
  const [answers, setAnswers] = useState<Answers>(onboardingAnswers.get());
  const set = (patch: Partial<Answers>) => setAnswers((a) => ({ ...a, ...patch }));

  const recommendations = useMemo(() => recommendTemplates(templates ?? [], answers), [templates, answers]);

  const finishQuestions = () => {
    onboardingAnswers.set(answers);
    if (answers.bodyweightLb) {
      const now = new Date().toISOString();
      saveBodyweight.mutate({ id: newId('bw'), date: today, weightKg: lbToKg(answers.bodyweightLb), createdAt: now, updatedAt: now });
    }
    setPhase('recommend');
  };

  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : finishQuestions());
  const skipAll = () => {
    completeOnboarding();
  };

  const startTemplate = (templateId: string) => {
    const template = templates?.find((t) => t.id === templateId);
    if (!template) return;
    const monday = nextMonday(today);
    ActionSheetIOS.showActionSheetWithOptions(
      { title: `Start ${template.name}`, options: ['Start today', `Start ${formatShortDate(monday)}`, 'Cancel'], cancelButtonIndex: 2, userInterfaceStyle: scheme },
      async (i) => {
        if (i > 1) return;
        await savePlan.mutateAsync(planFromTemplate(template, i === 0 ? today : monday));
        toast.show({ message: `${template.name} is in your plans.`, tone: 'success' });
        setPhase('tour');
      },
    );
  };

  const progress = phase === 'questions' ? Math.max(0, step + 1) / STEPS.length : 1;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.topBar}>
        {phase === 'questions' && step > -1 ? (
          <Pressable onPress={() => setStep(step - 1)} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
            <Icon name="chevron.left" color={colors.accentText} size={20} weight="bold" />
          </Pressable>
        ) : (
          <View style={styles.spacer} />
        )}
        <View style={[styles.track, { backgroundColor: colors.input }]} accessibilityLabel={`Setup ${Math.round(progress * 100)} percent done`}>
          <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: colors.accentText }]} />
        </View>
        <Pressable onPress={skipAll} accessibilityRole="button" hitSlop={10}>
          <AppText variant="subhead" weight="600" tone="accent">
            Skip setup
          </AppText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {phase === 'questions' && step === -1 && (
          <View style={styles.stack}>
            <AppText variant="largeTitle">{`Hi ${name}. Let's set up your training.`}</AppText>
            <AppText variant="body" tone="secondary">
              A few quick questions so we can suggest a plan. Every one is optional, and you can change your answers later.
            </AppText>
          </View>
        )}

        {phase === 'questions' && STEPS[step] === 'experience' && (
          <Question title="How long have you been lifting?">
            {EXPERIENCE.map((o) => (
              <Option key={o.value} title={o.title} body={o.body} selected={answers.experience === o.value} onPress={() => set({ experience: o.value })} />
            ))}
          </Question>
        )}

        {phase === 'questions' && STEPS[step] === 'goal' && (
          <Question title="What's your main goal?">
            {GOALS.map((o) => (
              <Option key={o.value} title={o.title} icon={o.icon} selected={answers.goal === o.value} onPress={() => set({ goal: o.value })} />
            ))}
          </Question>
        )}

        {phase === 'questions' && STEPS[step] === 'equipment' && (
          <Question title="What equipment can you use?" subtitle="Pick everything you have regular access to.">
            <View style={styles.wrap}>
              {EQUIPMENT.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={answers.equipment.includes(o.value)}
                  onPress={() => set({ equipment: answers.equipment.includes(o.value) ? answers.equipment.filter((e) => e !== o.value) : [...answers.equipment, o.value] })}
                />
              ))}
            </View>
            <Button title="Full gym" variant="ghost" size="sm" icon="building.2" onPress={() => set({ equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'bodyweight'] })} />
          </Question>
        )}

        {phase === 'questions' && STEPS[step] === 'days' && (
          <Question title="How many days a week can you train?">
            <Card>
              <View style={styles.inline}>
                <AppText variant="body" style={styles.flex}>
                  Days per week
                </AppText>
                <Stepper label="Days per week" value={answers.daysPerWeek} onChange={(daysPerWeek) => set({ daysPerWeek })} min={1} max={7} />
              </View>
            </Card>
            <AppText variant="footnote" tone="secondary">
              Pick what you can keep up most weeks. Rest days count as part of the plan.
            </AppText>
          </Question>
        )}

        {phase === 'questions' && STEPS[step] === 'body' && (
          <Question title="About you" subtitle="Optional. Bodyweight is used to count pull-ups, dips, and other bodyweight exercises. It's never shared.">
            <Card>
              <View style={styles.stack}>
                <View style={styles.inline}>
                  <AppText variant="body" style={styles.flex}>
                    Height
                  </AppText>
                  <NumberField label="Height in inches" value={answers.heightIn} onChange={(heightIn) => set({ heightIn })} unit="in" width={100} placeholder="70" />
                </View>
                <View style={styles.inline}>
                  <AppText variant="body" style={styles.flex}>
                    Bodyweight
                  </AppText>
                  <NumberField label="Bodyweight in pounds" value={answers.bodyweightLb} onChange={(bodyweightLb) => set({ bodyweightLb })} unit="lb" decimal width={100} placeholder="180" />
                </View>
              </View>
            </Card>
          </Question>
        )}

        {phase === 'questions' && STEPS[step] === 'limits' && (
          <Question title="Anything to work around?" subtitle="Optional. Later this helps suggest swaps. This app doesn't give medical advice; check with a professional about pain or injuries.">
            <View style={styles.wrap}>
              {LIMITS.map((l) => (
                <Chip key={l} label={l} selected={answers.limitations.includes(l)} onPress={() => set({ limitations: answers.limitations.includes(l) ? answers.limitations.filter((x) => x !== l) : [...answers.limitations, l] })} />
              ))}
            </View>
            <TextField label="Notes (optional)" value={answers.limitationNote} onChangeText={(limitationNote) => set({ limitationNote })} placeholder="e.g. avoid overhead pressing" />
          </Question>
        )}

        {phase === 'recommend' && (
          <View style={styles.stack}>
            <AppText variant="largeTitle">Plans that fit you</AppText>
            <AppText variant="body" tone="secondary">
              Based on your answers. Pick one to start, or build your own later in Plans.
            </AppText>
            {recommendations.map(({ template, reasons }, i) => (
              <Card key={template.id} style={i === 0 ? { borderColor: colors.accentText, borderWidth: 2 } : undefined}>
                <View style={styles.stack}>
                  {i === 0 && (
                    <View style={[styles.best, { backgroundColor: colors.accent }]}>
                      <AppText variant="caption" weight="800" tone="onAccent">
                        BEST MATCH
                      </AppText>
                    </View>
                  )}
                  <AppText variant="title3" weight="700">
                    {template.name}
                  </AppText>
                  <AppText variant="footnote" weight="600" numeric>
                    {templateMeta(template)}
                  </AppText>
                  {reasons.map((r) => (
                    <View key={r} style={styles.reason}>
                      <Icon name="checkmark" color={colors.successText} size={12} weight="bold" />
                      <AppText variant="subhead" tone="secondary">
                        {r}
                      </AppText>
                    </View>
                  ))}
                  {template.workouts.length ? (
                    <Button title="Start this plan" variant={i === 0 ? 'primary' : 'secondary'} size="sm" loading={savePlan.isPending} onPress={() => startTemplate(template.id)} />
                  ) : (
                    <AppText variant="footnote" tone="tertiary">
                      This program is still being written.
                    </AppText>
                  )}
                </View>
              </Card>
            ))}
            <Button title="I'll build my own later" variant="ghost" onPress={() => setPhase('tour')} style={styles.centerSelf} />
          </View>
        )}

        {phase === 'tour' && (
          <View style={styles.stack}>
            <AppText variant="largeTitle">Want a quick tour?</AppText>
            <AppText variant="body" tone="secondary">
              Five short cards on logging, rest timers, form recording, and progress. About 30 seconds. You can replay it anytime from Profile → About.
            </AppText>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {phase === 'questions' && step === -1 && (
          <>
            <Button title="Get started" fullWidth onPress={() => setStep(0)} />
            <Button title="Skip for now" variant="ghost" onPress={skipAll} style={styles.centerSelf} />
          </>
        )}
        {phase === 'questions' && step >= 0 && (
          <View style={styles.row}>
            <Button title="Skip" variant="ghost" onPress={next} />
            <Button title={step === STEPS.length - 1 ? 'See my plans' : 'Continue'} onPress={next} style={styles.flex} fullWidth />
          </View>
        )}
        {phase === 'tour' && (
          <>
            <Button
              title="Take the tour"
              icon="play.fill"
              fullWidth
              onPress={() => {
                // Finish onboarding first so the app is underneath; closing the tour lands there.
                completeOnboarding();
                setTimeout(() => router.push('/tutorial'), 150);
              }}
            />
            <Button title="Skip, take me to the app" variant="ghost" onPress={skipAll} style={styles.centerSelf} />
          </>
        )}
      </View>
    </View>
  );
}

function Question({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={styles.stack}>
      <AppText variant="title1" accessibilityRole="header">
        {title}
      </AppText>
      {subtitle && (
        <AppText variant="subhead" tone="secondary">
          {subtitle}
        </AppText>
      )}
      <View style={styles.options}>{children}</View>
    </View>
  );
}

function Option({ title, body, icon, selected, onPress }: { title: string; body?: string; icon?: SFSymbol; selected: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={body ? `${title}. ${body}` : title}>
      <View style={[styles.option, { backgroundColor: selected ? colors.accentSubtle : colors.card, borderColor: selected ? colors.accentText : colors.border }]}>
        {icon && <Icon name={icon} color={selected ? colors.accentText : colors.textSecondary} size={20} />}
        <View style={styles.flex}>
          <AppText variant="headline" tone={selected ? 'accent' : 'primary'}>
            {title}
          </AppText>
          {body && (
            <AppText variant="footnote" tone="secondary">
              {body}
            </AppText>
          )}
        </View>
        {selected && <Icon name="checkmark.circle.fill" color={colors.accentText} size={20} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  spacer: {
    width: 20,
  },
  track: {
    flex: 1,
    height: 5,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  stack: {
    gap: spacing.md,
  },
  options: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1.5,
    padding: spacing.lg,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  best: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  centerSelf: {
    alignSelf: 'center',
  },
});

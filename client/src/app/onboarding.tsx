import type { SFSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AccessibilityInfo, ActionSheetIOS, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Card, Chip, EmptyState, ErrorState, Icon, NumberField, PressableScale, Skeleton, Stepper, TextField, useToast } from '@/components/ui';
import { TOUR_FROM_ONBOARDING, TOUR_PITCH } from '@/data/content/tutorial';
import { useToday } from '@/data/DataProvider';
import { succeeded, usePreferences, useSaveBodyweight, useSavePlan, useTemplates } from '@/data/hooks';
import type { Equipment, ExperienceLevel, OnboardingAnswers, TrainingGoal } from '@/data/types';
import { lbToKg } from '@/data/units';
import { formatShortDate } from '@/lib/format';
import { newId } from '@/lib/id';
import { authStore, completeOnboarding } from '@/features/auth/authStore';
import { notePlanScheduled } from '@/features/notifications/planOfferStore';
import { onboardingAnswers } from '@/features/onboarding/answers';
import {
  canContinueWithHeight,
  continueStep,
  DAYS_DRAFT,
  emptyAnswers,
  heightLabel,
  heightProblem,
  heightUnit,
  ONBOARDING_STEPS,
  skipStep,
} from '@/features/onboarding/draft';
import { recommendTemplates, type RecommendationPick } from '@/features/onboarding/recommend';
import { COPY, FULL_GYM } from '@/features/onboarding/rules';
import { templateMeta } from '@/features/plans/describe';
import { nextWeekStart, planFromTemplate } from '@/features/plans/planEdits';
import { canContinueWithWeight, canSaveWeight, weightProblem } from '@/features/progress/logWeight';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { DENSE_TEXT_MAX, readable, useTextScale } from '@/theme/layout';

const STEPS = ONBOARDING_STEPS;

const EXPERIENCE: { value: ExperienceLevel; title: string; body: string }[] = [
  { value: 'beginner', title: 'Beginner', body: 'Less than a year of regular lifting' },
  { value: 'intermediate', title: 'Intermediate', body: '1 to 3 years; comfortable with the main lifts' },
  { value: 'advanced', title: 'Advanced', body: '3+ years; you run your own programming' },
];
const GOALS: { value: TrainingGoal; title: string; icon: SFSymbol }[] = [
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

const START_MESSAGE = 'It becomes your own plan. Changing it later never affects the template.';

/**
 * Optional onboarding (spec 2.4; user's pick: one question per screen). Every step can be
 * skipped, and the recommendation and the tour are separate, optional choices at the end. The
 * questions start from nothing answered, and Skip clears its question, so a skipped answer is
 * unknown to the recommendation (features/onboarding/draft.ts).
 */
export default function OnboardingScreen() {
  const { colors, scheme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { large } = useTextScale();
  const toast = useToast();
  const today = useToday();
  const templatesQuery = useTemplates();
  const templates = templatesQuery.data;
  const savePlan = useSavePlan();
  const saveBodyweight = useSaveBodyweight();
  const name = authStore.use().name;
  const [step, setStep] = useState<number>(-1);
  // Bodyweight is asked first, right after the first sign-in, and never again (user's call): it's
  // added later from Profile. The setup questions that follow are all optional.
  const [phase, setPhase] = useState<'weight' | 'questions' | 'recommend' | 'tour'>('weight');
  const [weight, setWeight] = useState<number>();
  // The typo guard Log weight uses: the reason waits until typing ends for a weight still too small.
  const [typingWeight, setTypingWeight] = useState(false);
  const preferences = usePreferences().data;
  const units = preferences?.units ?? 'imperial';
  const weekStartsOn = preferences?.weekStartsOn ?? 1;
  // Not the stored answers: earlier answers (or a restarted setup) never pre-fill a question.
  const [answers, setAnswers] = useState<OnboardingAnswers>(emptyAnswers);
  const set = (patch: Partial<OnboardingAnswers>) => setAnswers((a) => ({ ...a, ...patch }));
  // The days stepper and the height field hold drafts, written to the answers only on Continue.
  const [daysDraft, setDaysDraft] = useState(DAYS_DRAFT);
  const [heightDraft, setHeightDraft] = useState<number>();
  const [typingHeight, setTypingHeight] = useState(false);
  // Set while a start sheet is open or its plan is saving, so a quick second tap does nothing.
  const starting = useRef(false);
  // The card whose plan is saving: only its button spins.
  const [startingId, setStartingId] = useState<string>();
  // Each step's heading. Only one shows at a time, so one ref covers them all.
  const titleRef = useRef<ViewInstance>(null);
  const firstStep = useRef(true);

  // The pressed Continue / Back button stays put while the content swaps, so VoiceOver would
  // stay on it. Move to the new heading instead (not on first open: VoiceOver starts at the top).
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    const t = setTimeout(() => titleRef.current && AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus'), 150);
    return () => clearTimeout(t);
  }, [step, phase]);

  const results = useMemo(() => recommendTemplates(templates ?? [], answers), [templates, answers]);

  /** Moves to the next question, or to the plans once the last one is answered or skipped. */
  const advance = (next: OnboardingAnswers) => {
    setAnswers(next);
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    onboardingAnswers.set(next);
    setPhase('recommend');
  };
  const continueQuestion = () => advance(continueStep(answers, STEPS[step], { days: daysDraft, height: heightDraft, units }));
  const skipQuestion = () => {
    const current = STEPS[step];
    // Skipped means unanswered, so the drafts go back to where they start too.
    if (current === 'days') setDaysDraft(DAYS_DRAFT);
    if (current === 'body') setHeightDraft(undefined);
    advance(skipStep(answers, current));
  };

  /** Saves the weigh-in straight away (in the user's units), then moves on to the optional setup. */
  const saveWeight = () => {
    if (weight !== undefined && canSaveWeight(weight, units)) {
      const now = new Date().toISOString();
      saveBodyweight.mutate({ id: newId('bw'), date: today, weightKg: units === 'imperial' ? lbToKg(weight) : weight, createdAt: now, updatedAt: now, source: 'onboarding' });
    }
    setPhase('questions');
  };
  // Skipping setup still offers the tour; skipping from there finishes. Answers given so far
  // aren't saved.
  const skipSetup = () => (phase === 'tour' ? completeOnboarding() : setPhase('tour'));

  const startPick = ({ template, option }: RecommendationPick) => {
    if (starting.current || savePlan.isPending) return;
    starting.current = true;
    // "Today or next Monday" (spec 2.5), or next Sunday when weeks start on Sunday.
    const weekStart = nextWeekStart(today, weekStartsOn);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `Start ${template.name}`,
        message: START_MESSAGE,
        options: ['Start today', `Start ${formatShortDate(weekStart)}`, 'Cancel'],
        cancelButtonIndex: 2,
        userInterfaceStyle: scheme,
      },
      async (i) => {
        try {
          if (i > 1) return;
          setStartingId(template.id);
          // The day version the card shows.
          const plan = planFromTemplate(template, i === 0 ? today : weekStart, { daysPerWeek: option.daysPerWeek });
          if (!(await succeeded(savePlan.mutateAsync(plan)))) return;
          // Reminders are offered once onboarding and the tour are over (PlanReminderOffer).
          notePlanScheduled();
          toast.show({ message: `${template.name} is in your plans.`, tone: 'success' });
          setPhase('tour');
        } finally {
          starting.current = false;
          setStartingId(undefined);
        }
      },
    );
  };

  const progress = phase === 'questions' ? Math.max(0, step + 1) / STEPS.length : 1;
  const progressText = phase !== 'questions' ? 'Questions done' : step < 0 ? 'Not started' : `Question ${step + 1} of ${STEPS.length}`;
  const equipment = answers.equipment ?? [];
  // Continue is off for a height out of range, as the weigh-in's is for a weight.
  const continueBlocked = STEPS[step] === 'body' && !canContinueWithHeight(heightDraft, units);
  const continueHint = STEPS[step] === 'body' ? heightProblem(heightDraft, units) : undefined;
  const continueTitle = step === STEPS.length - 1 ? 'See my plans' : 'Continue';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
      {/* This screen paints the page background under the status bar, so its text follows the theme. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.topBar}>
        {phase === 'questions' && step > -1 ? (
          <Pressable onPress={() => setStep(step - 1)} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}>
            <Icon name="chevron.left" color={colors.accentText} size={20} weight="bold" />
          </Pressable>
        ) : (
          <View style={styles.spacer} />
        )}
        {/* The bodyweight question stands on its own, before the setup and its progress. */}
        {phase !== 'weight' && (
          <>
            <View
              style={[styles.track, { backgroundColor: colors.input }]}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Setup progress"
              accessibilityValue={{ min: 0, max: STEPS.length, now: Math.round(progress * STEPS.length), text: progressText }}
            >
              <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: colors.accentText }]} />
            </View>
            <Pressable onPress={skipSetup} accessibilityRole="button" hitSlop={10} style={styles.skip}>
              {/* Nav-bar control: grows only to the dense cap so the progress track keeps its room. */}
              <AppText variant="subhead" weight="600" tone="accent" maxFontSizeMultiplier={DENSE_TEXT_MAX}>
                Skip setup
              </AppText>
            </Pressable>
          </>
        )}
      </View>

      {/* The number pads have no return key, so Continue and Skip ride above the keyboard. The
          ScrollView shrinks with them, so it needs no keyboard inset of its own. */}
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={spacing.md} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.content, readable]} keyboardShouldPersistTaps="handled">
          {phase === 'weight' && (
            <Question
              titleRef={titleRef}
              title={`Welcome, ${name}. What do you weigh?`}
              subtitle="Pull-ups, dips, and other bodyweight exercises count your bodyweight in their load. You can update it any time in Profile."
            >
              <Card>
                <View style={large ? styles.stack : styles.inline}>
                  <AppText variant="body" style={!large && styles.flex} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    Bodyweight
                  </AppText>
                  <NumberField
                    label={`Bodyweight in ${units === 'imperial' ? 'pounds' : 'kilograms'}`}
                    value={weight}
                    onChange={setWeight}
                    unit={units === 'imperial' ? 'lb' : 'kg'}
                    decimal
                    width={110}
                    placeholder={units === 'imperial' ? '180' : '82'}
                    onFocusChange={setTypingWeight}
                  />
                </View>
              </Card>
              {weightProblem(weight, units, { editing: typingWeight }) && (
                <AppText variant="footnote" tone="error">
                  {weightProblem(weight, units)}
                </AppText>
              )}
            </Question>
          )}

          {phase === 'questions' && step === -1 && (
            <View style={styles.stack}>
              <Heading titleRef={titleRef} variant="largeTitle" text="Let's set up your training." />
              <AppText variant="body" tone="secondary">
                A few quick questions so we can suggest a plan. Every one is optional.
              </AppText>
            </View>
          )}

          {phase === 'questions' && STEPS[step] === 'experience' && (
            <Question titleRef={titleRef} title="How long have you been lifting?">
              {EXPERIENCE.map((o) => (
                <Option key={o.value} title={o.title} body={o.body} selected={answers.experience === o.value} onPress={() => set({ experience: o.value })} />
              ))}
            </Question>
          )}

          {phase === 'questions' && STEPS[step] === 'goal' && (
            <Question titleRef={titleRef} title="What's your main goal?">
              {GOALS.map((o) => (
                <Option key={o.value} title={o.title} icon={o.icon} selected={answers.goal === o.value} onPress={() => set({ goal: o.value })} />
              ))}
            </Question>
          )}

          {phase === 'questions' && STEPS[step] === 'equipment' && (
            <Question titleRef={titleRef} title="What equipment can you use?" subtitle="Pick everything you have regular access to.">
              <View style={styles.wrap}>
                {EQUIPMENT.map((o) => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    selected={equipment.includes(o.value)}
                    onPress={() => set({ equipment: equipment.includes(o.value) ? equipment.filter((e) => e !== o.value) : [...equipment, o.value] })}
                  />
                ))}
              </View>
              <Button title="Full gym" variant="ghost" size="sm" icon="building.2" onPress={() => set({ equipment: [...FULL_GYM] })} />
            </Question>
          )}

          {phase === 'questions' && STEPS[step] === 'days' && (
            <Question titleRef={titleRef} title="How many days a week can you train?">
              <Card>
                {/* Label above the control at accessibility sizes. The control speaks its own label. */}
                <View style={large ? styles.stack : styles.inline}>
                  <AppText variant="body" style={!large && styles.flex} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    Days per week
                  </AppText>
                  <Stepper label="Days per week" value={daysDraft} onChange={setDaysDraft} min={1} max={7} />
                </View>
              </Card>
              <AppText variant="footnote" tone="secondary">
                Pick what you can keep up most weeks. Rest days count as part of the plan.
              </AppText>
            </Question>
          )}

          {phase === 'questions' && STEPS[step] === 'body' && (
            <Question titleRef={titleRef} title="About you" subtitle="Optional. It's never shared.">
              <Card>
                <View style={styles.stack}>
                  <View style={large ? styles.stack : styles.inline}>
                    <AppText variant="body" style={!large && styles.flex} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      Height
                    </AppText>
                    {/* In the units setting (cm with kilograms); stored in inches. */}
                    <NumberField
                      label={heightLabel(units)}
                      value={heightDraft}
                      onChange={setHeightDraft}
                      unit={heightUnit(units)}
                      width={100}
                      placeholder={units === 'imperial' ? '70' : '178'}
                      onFocusChange={setTypingHeight}
                    />
                  </View>
                </View>
              </Card>
              {heightProblem(heightDraft, units, { editing: typingHeight }) && (
                <AppText variant="footnote" tone="error">
                  {heightProblem(heightDraft, units)}
                </AppText>
              )}
            </Question>
          )}

          {phase === 'questions' && STEPS[step] === 'limits' && (
            <Question titleRef={titleRef} title="Anything to work around?" subtitle="Optional. This app doesn't give medical advice; check with a professional about pain or injuries.">
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
              {/* The heading says how well the picks fit (rules.ts): fit, closest, or a starting point when every question was skipped. */}
              <Heading titleRef={titleRef} variant="largeTitle" text={templates ? results.title : COPY.heading.fit} />
              {templates && results.picks.length > 0 && (
                <AppText variant="body" tone="secondary">
                  {results.subtitle}
                </AppText>
              )}
              {templatesQuery.error ? (
                <ErrorState title="Couldn't load plans" message="You can also pick one later in Plans." onRetry={() => templatesQuery.refetch()} />
              ) : templatesQuery.isLoading ? (
                <View style={styles.stack} accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
                  <Skeleton height={190} radius={radius.card} />
                  <Skeleton height={160} radius={radius.card} />
                </View>
              ) : !results.picks.length ? (
                <EmptyState icon="square.stack.3d.up" title="No plans to suggest" message="Browse them all, or build your own, in Plans." />
              ) : (
                results.picks.map((pick, i) => {
                  const { template, option, reasons, notes } = pick;
                  // Nothing was matched when every question was skipped, so no pick is called the best.
                  const best = i === 0 && results.heading !== 'start';
                  return (
                    <Card key={template.id} style={best ? { borderColor: colors.accentText, borderWidth: 2 } : undefined}>
                      <View style={styles.stack}>
                        {best && (
                          <View style={[styles.best, { backgroundColor: colors.accent }]}>
                            <AppText variant="caption" weight="800" tone="onAccent" maxFontSizeMultiplier={DENSE_TEXT_MAX}>
                              BEST MATCH
                            </AppText>
                          </View>
                        )}
                        <AppText variant="title3" weight="700" accessibilityRole="header">
                          {template.name}
                        </AppText>
                        {/* The day version this card starts. */}
                        <AppText variant="footnote" weight="600" numeric>
                          {templateMeta(template, option)}
                        </AppText>
                        {reasons.map((r) => (
                          <Line key={r} icon="checkmark" color={colors.successText} text={r} />
                        ))}
                        {/* Info lines are worth knowing but aren't a match, so they get no check mark. */}
                        {notes.map((n) => (
                          <Line key={n} icon="info.circle" color={colors.textSecondary} text={n} />
                        ))}
                        <Button
                          title="Start this plan"
                          accessibilityLabel={`Start ${template.name}`}
                          variant={i === 0 ? 'primary' : 'secondary'}
                          size="sm"
                          loading={startingId === template.id}
                          onPress={() => startPick(pick)}
                        />
                      </View>
                    </Card>
                  );
                })
              )}
              <Button title="I'll build my own later" variant="ghost" onPress={() => setPhase('tour')} style={styles.centerSelf} />
            </View>
          )}

          {phase === 'tour' && (
            <View style={styles.stack}>
              <Heading titleRef={titleRef} variant="largeTitle" text="Want a quick tour?" />
              <AppText variant="body" tone="secondary">
                {TOUR_PITCH}
              </AppText>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {phase === 'weight' &&
            (large ? (
              <>
                <Button title="Continue" onPress={saveWeight} fullWidth disabled={!canContinueWithWeight(weight, units)} accessibilityHint={weightProblem(weight, units)} />
                <Button title="Skip" accessibilityLabel="Skip bodyweight" variant="ghost" onPress={() => setPhase('questions')} style={styles.centerSelf} />
              </>
            ) : (
              <View style={styles.row}>
                <Button title="Skip" accessibilityLabel="Skip bodyweight" variant="ghost" onPress={() => setPhase('questions')} />
                <Button title="Continue" onPress={saveWeight} style={styles.flex} fullWidth disabled={!canContinueWithWeight(weight, units)} accessibilityHint={weightProblem(weight, units)} />
              </View>
            ))}
          {phase === 'questions' && step === -1 && (
            <>
              <Button title="Get started" fullWidth onPress={() => setStep(0)} />
              <Button title="Skip for now" variant="ghost" onPress={skipSetup} style={styles.centerSelf} />
            </>
          )}
          {phase === 'questions' &&
            step >= 0 &&
            (large ? (
              // Stacked at accessibility sizes so neither title gets squeezed.
              <>
                <Button title={continueTitle} onPress={continueQuestion} fullWidth disabled={continueBlocked} accessibilityHint={continueHint} />
                <Button title="Skip" accessibilityLabel="Skip this question" variant="ghost" onPress={skipQuestion} style={styles.centerSelf} />
              </>
            ) : (
              <View style={styles.row}>
                <Button title="Skip" accessibilityLabel="Skip this question" variant="ghost" onPress={skipQuestion} />
                <Button title={continueTitle} onPress={continueQuestion} style={styles.flex} fullWidth disabled={continueBlocked} accessibilityHint={continueHint} />
              </View>
            ))}
          {phase === 'tour' && (
            <>
              <Button
                title="Take the tour"
                icon="play.fill"
                fullWidth
                onPress={() => {
                  // Finish onboarding first so the app is underneath; closing the tour lands there.
                  completeOnboarding();
                  setTimeout(() => router.push({ pathname: '/tutorial', params: { from: TOUR_FROM_ONBOARDING } }), 150);
                }}
              />
              <Button title="Skip, take me to the app" variant="ghost" onPress={completeOnboarding} style={styles.centerSelf} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** A step's heading: a header for VoiceOver, and where focus moves when the step changes. */
function Heading({ text, variant, titleRef }: { text: string; variant: 'largeTitle' | 'title1'; titleRef: RefObject<ViewInstance | null> }) {
  return (
    <View ref={titleRef} accessible accessibilityRole="header" accessibilityLabel={text}>
      <AppText variant={variant}>{text}</AppText>
    </View>
  );
}

function Question({ title, subtitle, titleRef, children }: { title: string; subtitle?: string; titleRef: RefObject<ViewInstance | null>; children: ReactNode }) {
  return (
    <View style={styles.stack}>
      <Heading titleRef={titleRef} variant="title1" text={title} />
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
    <PressableScale onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={body ? `${title}. ${body}` : title}>
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
    </PressableScale>
  );
}

/** A line on a plan card. The icon is decoration (Icon hides it from VoiceOver), so only the words are read. */
function Line({ icon, color, text }: { icon: SFSymbol; color: string; text: string }) {
  return (
    <View style={styles.reason}>
      <Icon name={icon} color={color} size={12} weight="bold" />
      <AppText variant="subhead" tone="secondary" style={styles.flex}>
        {text}
      </AppText>
    </View>
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
  skip: {
    flexShrink: 0,
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

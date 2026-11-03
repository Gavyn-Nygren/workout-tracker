import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ListViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sparkline } from '@/components/charts/Sparkline';
import { AppText, Button, Icon, ProgressRing } from '@/components/ui';
import { spokenTourCard, TOUR_ART, TOUR_CARDS, tourArtLoad, tourCardText, tourLastButton, tourTodayArt, type TourCard, type TourCardKey } from '@/data/content/tutorial';
import { usePreferences } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { UnitSystem } from '@/data/types';
import { isFormAnalysisSupported } from '@/features/form/capability';
import { FORM_ANALYSIS_PREVIEW } from '@/features/form/preview';
import { SkeletonFigure, useRepLoop } from '@/features/form/SkeletonFigure';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { unitLabel } from '@/lib/format';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { readable, READABLE_MAX, useTextScale } from '@/theme/layout';
import { radius, spacing, type ColorScheme } from '@/theme/tokens';

/** What an illustration needs: weights follow the units setting, and only the visible card animates. */
type ArtProps = { units: UnitSystem; playing: boolean };

// The cards' words live in data/content/tutorial.ts (tested); the pictures are drawn here, by key.
const ART: Record<TourCardKey, (props: ArtProps) => ReactNode> = {
  today: () => <TodayArt />,
  log: ({ units }) => <LogArt units={units} />,
  form: ({ playing }) => <FormArt playing={playing} />,
  progress: ({ units }) => <ProgressArt units={units} />,
  goals: () => <GoalsArt />,
};

/** The art area. The illustrations are pictures of the app, so their text grows only a little. */
const ART_HEIGHT = 300;
const ART_TEXT_MAX = 1.3;
/** At accessibility text sizes the art shrinks to this height, leaving room for the words. */
const ART_HEIGHT_LARGE = 160;

/**
 * Optional tour (spec 2.4; user's pick: swipeable cards). Opened from onboarding
 * (`/tutorial?from=onboarding`, last button "Start training") and from Profile → About ("Done").
 */
export default function TutorialScreen() {
  const { colors, scheme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { large } = useTextScale();
  const reducedMotion = useReducedMotion();
  const units = usePreferences().data?.units ?? defaultPreferences.units;
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [page, setPage] = useState(0);
  const list = useRef<FlatList<TourCard>>(null);
  const last = page === TOUR_CARDS.length - 1;
  const artHeight = large ? ART_HEIGHT_LARGE : ART_HEIGHT;

  // The form card's words depend on the phone (no camera before iPhone 12) and the preview flag.
  const texts = useMemo(() => {
    const device = { formSupported: isFormAnalysisSupported(), preview: FORM_ANALYSIS_PREVIEW };
    return TOUR_CARDS.map((card) => tourCardText(card, device));
  }, []);
  const spoken = (index: number) => spokenTourCard(index, TOUR_CARDS.length, texts[index]);

  // Tracks the page however the list scrolls, including VoiceOver's three-finger swipe (which
  // doesn't always end in a momentum event), so the dots, Next and the last label stay in step.
  const viewability = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const index = viewableItems[0]?.index;
    if (index !== null && index !== undefined) setPage(index);
  }).current;

  const done = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View
      style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}
      onAccessibilityEscape={done}
    >
      {/* This screen paints the page background under the status bar, so its text follows the theme. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.topBar}>
        <Pressable onPress={done} accessibilityRole="button" accessibilityLabel="Skip the tour" hitSlop={10}>
          <AppText variant="subhead" weight="600" tone="accent">
            Skip
          </AppText>
        </Pressable>
      </View>
      <FlatList
        ref={list}
        data={TOUR_CARDS}
        extraData={page}
        keyExtractor={(c) => c.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        viewabilityConfig={viewability}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({ item, index }) => {
          const text = texts[index];
          return (
            // Each page scrolls on its own when the text is too big to fit.
            <ScrollView style={{ width }} contentContainerStyle={[styles.page, { paddingHorizontal: Math.max(spacing.xl, (width - READABLE_MAX) / 2) }]} showsVerticalScrollIndicator={false}>
              <View style={styles.pageBody} accessible accessibilityLabel={spoken(index)}>
                <View style={[styles.art, { height: artHeight }]}>
                  {/* Laid out at full size, then scaled down as a whole so the illustration keeps its
                      proportions. Pictures only, so nothing in them can be tapped. The neighbouring
                      cards draw theirs too, so nothing pops in mid-swipe; only the visible one animates. */}
                  <View pointerEvents="none" style={[styles.artInner, { transform: [{ scale: artHeight / ART_HEIGHT }] }]}>
                    {Math.abs(index - page) <= 1 ? ART[item.key]({ units, playing: index === page }) : null}
                  </View>
                </View>
                <AppText variant="title1" style={styles.center}>
                  {text.title}
                </AppText>
                <AppText variant="body" tone="secondary" style={styles.center}>
                  {text.body}
                </AppText>
                {text.note && (
                  <AppText variant="footnote" tone="secondary" style={styles.center}>
                    {text.note}
                  </AppText>
                )}
              </View>
            </ScrollView>
          );
        }}
      />
      <View style={styles.dots}>
        {TOUR_CARDS.map((c, i) => (
          <View key={c.key} style={[styles.dot, { backgroundColor: i === page ? colors.accentText : colors.textTertiary }, i === page && styles.dotActive]} />
        ))}
      </View>
      <View style={[styles.footer, readable]}>
        <Button
          title={last ? tourLastButton(from) : 'Next'}
          icon={last ? 'checkmark' : undefined}
          fullWidth
          onPress={() => {
            if (last) return done();
            const next = page + 1;
            // With Reduce Motion on, the next card replaces this one instead of sliding in (spec 2.13).
            list.current?.scrollToIndex({ index: next, animated: !reducedMotion });
            setPage(next);
            // Focus stays on Next, so VoiceOver reads the new card.
            AccessibilityInfo.announceForAccessibility(spoken(next));
          }}
        />
      </View>
    </View>
  );
}

// Small illustrations built from the app's own parts, so the tour looks like the app.

/** The Today card's program, workout and meta line, from the starter catalog (tests/tutorial.test.ts). */
const TODAY_ART = tourTodayArt();

function TodayArt() {
  // Read the app's scheme before the override: the hero edge only shows on a dark page.
  const { scheme } = useAppTheme();
  return (
    <SchemeOverride scheme="dark">
      <TodayCard outerScheme={scheme} />
    </SchemeOverride>
  );
}
function TodayCard({ outerScheme }: { outerScheme: ColorScheme }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.mini, { backgroundColor: colors.chrome, borderColor: colors.border }, outerScheme === 'dark' && { borderWidth: 1, borderColor: colors.heroBorder }]}>
      {TODAY_ART && (
        <AppText variant="label" tone="secondary" maxFontSizeMultiplier={ART_TEXT_MAX}>
          {TODAY_ART.programName}
        </AppText>
      )}
      <AppText variant="title1" maxFontSizeMultiplier={ART_TEXT_MAX}>
        {TODAY_ART?.workoutName ?? TOUR_ART.workoutName}
      </AppText>
      {TODAY_ART && (
        <AppText variant="footnote" tone="secondary" maxFontSizeMultiplier={ART_TEXT_MAX}>
          {TODAY_ART.meta}
        </AppText>
      )}
      <View style={[styles.fakeButton, { backgroundColor: colors.accent }]}>
        <Icon name="play.fill" color={colors.onAccent} size={14} />
        <AppText variant="headline" tone="onAccent" maxFontSizeMultiplier={ART_TEXT_MAX}>
          Start Workout 1/2
        </AppText>
      </View>
    </View>
  );
}

/** The set rows' weight, written in pounds and shown in the user's units. */
const LOG_ART_LB = 275;
const LOG_ART_ROWS = [
  { n: 1, reps: 6, done: true },
  { n: 2, reps: 6, done: true },
  { n: 3, reps: 5, done: false },
];

function LogArt({ units }: { units: UnitSystem }) {
  const { colors } = useAppTheme();
  const load = tourArtLoad(LOG_ART_LB, units);
  return (
    <View style={[styles.mini, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <AppText variant="headline" maxFontSizeMultiplier={ART_TEXT_MAX}>
        Back Squat
      </AppText>
      {LOG_ART_ROWS.map(({ n, reps, done }) => (
        <View key={n} style={[styles.setRow, done ? { backgroundColor: colors.successSubtle } : null]}>
          <AppText variant="headline" numeric maxFontSizeMultiplier={ART_TEXT_MAX}>
            {String(n)}
          </AppText>
          <AppText variant="body" numeric style={{ flex: 1 }} maxFontSizeMultiplier={ART_TEXT_MAX}>
            {`${load} × ${reps}`}
          </AppText>
          <View style={[styles.check, { backgroundColor: done ? colors.successFill : colors.input }]}>
            <Icon name="checkmark" color={done ? '#FFFFFF' : colors.textSecondary} size={14} weight="bold" />
          </View>
        </View>
      ))}
      <View style={[styles.rest, { backgroundColor: colors.chrome }]}>
        <AppText variant="caption" weight="700" style={{ color: colors.chromeInactive }} maxFontSizeMultiplier={ART_TEXT_MAX}>
          REST
        </AppText>
        <AppText variant="title3" weight="800" tone="onChrome" numeric maxFontSizeMultiplier={ART_TEXT_MAX}>
          2:45
        </AppText>
      </View>
    </View>
  );
}

function FormArt({ playing }: { playing: boolean }) {
  const loop = useRepLoop({ playing, repSeconds: 2.8 });
  return (
    <View style={[styles.formArt, { backgroundColor: '#05080B' }]}>
      <SkeletonFigure family="squat" depth={loop.depth} withBar showAngle width={200} height={220} />
    </View>
  );
}

/** The e1RM shown, written in pounds and shown in the user's units. */
const PROGRESS_ART_LB = 338;
const PROGRESS_ART_POINTS = [286, 300, 312, 296, 327, 342, 338].map((value, i) => ({ date: `2026-09-${String(1 + i * 7).padStart(2, '0')}`, value }));

function ProgressArt({ units }: { units: UnitSystem }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.mini, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <AppText variant="subhead" weight="700" maxFontSizeMultiplier={ART_TEXT_MAX}>
        Back Squat · e1RM
      </AppText>
      <AppText variant="title1" numeric maxFontSizeMultiplier={ART_TEXT_MAX}>
        {`${tourArtLoad(PROGRESS_ART_LB, units)} ${unitLabel(units)}`}
      </AppText>
      <Sparkline points={PROGRESS_ART_POINTS} height={90} label="Example chart rising over seven weeks" />
    </View>
  );
}

function GoalsArt() {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.mini, styles.goals, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ProgressRing value={0.75} label="3 of 4 workouts" size={110} strokeWidth={10}>
        <AppText variant="title1" numeric maxFontSizeMultiplier={ART_TEXT_MAX}>
          3/4
        </AppText>
      </ProgressRing>
      <View style={styles.flame}>
        <Icon name="flame.fill" color={colors.prOnSurface} size={30} />
        <AppText variant="display" numeric maxFontSizeMultiplier={ART_TEXT_MAX}>
          8
        </AppText>
        <AppText variant="subhead" weight="700" maxFontSizeMultiplier={ART_TEXT_MAX}>
          week streak
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xl,
  },
  page: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  pageBody: {
    gap: spacing.md,
  },
  art: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  artInner: {
    height: ART_HEIGHT,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    marginBottom: spacing.lg,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotActive: {
    width: 20,
  },
  footer: {
    paddingHorizontal: spacing.xl,
  },
  mini: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.card + 4,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  fakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    height: 48,
    marginTop: spacing.sm,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  check: {
    width: 36,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rest: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  formArt: {
    borderRadius: radius.card + 4,
    padding: spacing.md,
  },
  goals: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  flame: {
    alignItems: 'flex-start',
  },
});

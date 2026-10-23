import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sparkline } from '@/components/charts/Sparkline';
import { AppText, Button, Icon, ProgressRing } from '@/components/ui';
import { SkeletonFigure, useRepLoop } from '@/features/form/SkeletonFigure';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { readable, READABLE_MAX, useTextScale } from '@/theme/layout';
import { radius, spacing, type ColorScheme } from '@/theme/tokens';

type Card = { key: string; title: string; body: string; art: () => ReactNode };

const CARDS: Card[] = [
  { key: 'today', title: 'Your plan, every day', body: "Today shows what's scheduled. Swipe between workouts when a day has more than one.", art: () => <TodayArt /> },
  { key: 'log', title: 'Log a set in one tap', body: 'Weights and reps start from your plan and last time. Check the set off and the rest timer starts.', art: () => <LogArt /> },
  { key: 'form', title: 'Film a set, see your form', body: 'Optional. Prop your phone side-on and record. Analysis happens on your phone; video never leaves it.', art: () => <FormArt /> },
  { key: 'progress', title: 'Watch your lifts climb', body: 'Progress charts your estimated 1RM, volume, and bodyweight. Drag across any chart to read it.', art: () => <ProgressArt /> },
  { key: 'goals', title: 'Goals and streaks', body: 'Hit your weekly target to grow your streak. Set goals on Home and see if you are on pace.', art: () => <GoalsArt /> },
];

/** The art area. The illustrations are pictures of the app, so their text grows only a little. */
const ART_HEIGHT = 300;
const ART_TEXT_MAX = 1.3;
/** At accessibility text sizes the art shrinks to this height, leaving room for the words. */
const ART_HEIGHT_LARGE = 160;

const spokenCard = (index: number) => `${index + 1} of ${CARDS.length}. ${CARDS[index].title}. ${CARDS[index].body}`;

/** Optional tour (spec 2.4; user's pick: swipeable cards). Replay any time from Profile → About. */
export default function TutorialScreen() {
  const { colors, scheme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { large } = useTextScale();
  const [page, setPage] = useState(0);
  const list = useRef<FlatList<Card>>(null);
  const last = page === CARDS.length - 1;
  const artHeight = large ? ART_HEIGHT_LARGE : ART_HEIGHT;

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
        data={CARDS}
        keyExtractor={(c) => c.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index }) => (
          // Each page scrolls on its own when the text is too big to fit.
          <ScrollView style={{ width }} contentContainerStyle={[styles.page, { paddingHorizontal: Math.max(spacing.xl, (width - READABLE_MAX) / 2) }]} showsVerticalScrollIndicator={false}>
            <View style={styles.pageBody} accessible accessibilityLabel={spokenCard(index)}>
              <View style={[styles.art, { height: artHeight }]}>
                {/* Laid out at full size, then scaled down as a whole so the illustration keeps its proportions. */}
                <View style={[styles.artInner, { transform: [{ scale: artHeight / ART_HEIGHT }] }]}>{index === page ? item.art() : null}</View>
              </View>
              <AppText variant="title1" style={styles.center}>
                {item.title}
              </AppText>
              <AppText variant="body" tone="secondary" style={styles.center}>
                {item.body}
              </AppText>
            </View>
          </ScrollView>
        )}
      />
      <View style={styles.dots}>
        {CARDS.map((c, i) => (
          <View key={c.key} style={[styles.dot, { backgroundColor: i === page ? colors.accentText : colors.textTertiary }, i === page && styles.dotActive]} />
        ))}
      </View>
      <View style={[styles.footer, readable]}>
        <Button
          title={last ? 'Start training' : 'Next'}
          icon={last ? 'checkmark' : undefined}
          fullWidth
          onPress={() => {
            if (last) return done();
            list.current?.scrollToIndex({ index: page + 1 });
            setPage(page + 1);
            // Focus stays on Next, so VoiceOver reads the new card.
            AccessibilityInfo.announceForAccessibility(spokenCard(page + 1));
          }}
        />
      </View>
    </View>
  );
}

// Small illustrations built from the app's own parts, so the tour looks like the app.

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
      <AppText variant="label" tone="secondary" maxFontSizeMultiplier={ART_TEXT_MAX}>
        Upper / Lower Strength
      </AppText>
      <AppText variant="title1" maxFontSizeMultiplier={ART_TEXT_MAX}>
        Upper B
      </AppText>
      <AppText variant="footnote" tone="secondary" maxFontSizeMultiplier={ART_TEXT_MAX}>
        ~60 min · 13 working sets
      </AppText>
      <View style={[styles.fakeButton, { backgroundColor: colors.accent }]}>
        <Icon name="play.fill" color={colors.onAccent} size={14} />
        <AppText variant="headline" tone="onAccent" maxFontSizeMultiplier={ART_TEXT_MAX}>
          Start Workout 1/2
        </AppText>
      </View>
    </View>
  );
}

function LogArt() {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.mini, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <AppText variant="headline" maxFontSizeMultiplier={ART_TEXT_MAX}>
        Back Squat
      </AppText>
      {[
        ['1', '275 × 6', true],
        ['2', '275 × 6', true],
        ['3', '275 × 5', false],
      ].map(([n, v, done]) => (
        <View key={String(n)} style={[styles.setRow, done ? { backgroundColor: colors.successSubtle } : null]}>
          <AppText variant="headline" numeric maxFontSizeMultiplier={ART_TEXT_MAX}>
            {String(n)}
          </AppText>
          <AppText variant="body" numeric style={{ flex: 1 }} maxFontSizeMultiplier={ART_TEXT_MAX}>
            {String(v)}
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

function FormArt() {
  const loop = useRepLoop({ playing: true, repSeconds: 2.8 });
  return (
    <View style={[styles.formArt, { backgroundColor: '#05080B' }]}>
      <SkeletonFigure family="squat" depth={loop.depth} withBar showAngle width={200} height={220} />
    </View>
  );
}

function ProgressArt() {
  const { colors } = useAppTheme();
  const points = [286, 300, 312, 296, 327, 342, 338].map((value, i) => ({ date: `2026-09-${String(1 + i * 7).padStart(2, '0')}`, value }));
  return (
    <View style={[styles.mini, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <AppText variant="subhead" weight="700" maxFontSizeMultiplier={ART_TEXT_MAX}>
        Back Squat · e1RM
      </AppText>
      <AppText variant="title1" numeric maxFontSizeMultiplier={ART_TEXT_MAX}>
        338 lb
      </AppText>
      <Sparkline points={points} height={90} label="Example chart rising over seven weeks" />
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

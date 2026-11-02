import { router } from 'expo-router';
import type { SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Card, EmptyState, Icon, ProgressRing, SectionHeader } from '@/components/ui';
import { formGoalAimsHigher } from '@/data/goals';
import { fromISODate, isoWeekday } from '@/data/dates';
import type { Exercise, ISODate, UnitSystem } from '@/data/types';
import { DAY_WORDS, type DayStatus } from '@/features/home/weekDots';
import { JOINT_LABEL } from '@/features/home/wins';
import { formatLoad, formatLoadValue, formatLongDate, formatMonthDay, formatShortDate, plural, spokenLoad, unitLabel, WEEKDAY_LETTER } from '@/lib/format';
import { DENSE_TEXT_MAX, readable, useTextScale } from '@/theme/layout';
import { SchemeOverride, useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { weekHeroLines, weeklyRecordRows, type WeeklySummary } from './weeklySummary';

type Props = {
  summary: WeeklySummary;
  units: UnitSystem;
  today: ISODate;
  exercisesById: ReadonlyMap<string, Exercise>;
  /** Closes the screen and shows Today. */
  onToday: () => void;
  onDone: () => void;
};

/** Text inside the ring and under the narrow day columns stops growing here, like Home's snapshot. */
const COMPACT_TEXT_MAX = 1.3;

/**
 * "Your week" (G3.12, user's pick: a dark top card like the workout summary's). The ring, the
 * streak and four stat tiles on top; the week's days under it; then the workouts, PRs, and form
 * highlights. Every look decision for the screen lives in this file.
 */
export function WeeklySummaryView({ summary, units, today, exercisesById, onToday, onDone }: Props) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.padded, readable, { paddingBottom: insets.bottom + spacing.huge }]}>
        <WeekHero summary={summary} units={units} />
        <DaysCard summary={summary} today={today} />
        <WorkoutsCard summary={summary} units={units} onToday={onToday} />
        <RecordsCard summary={summary} units={units} exercisesById={exercisesById} />
        <FormCard summary={summary} exercisesById={exercisesById} />
        <Button title="Done" fullWidth onPress={onDone} />
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Top card

function WeekHero(props: { summary: WeeklySummary; units: UnitSystem }) {
  const { scheme } = useAppTheme();
  return (
    <SchemeOverride scheme="dark">
      <HeroBody {...props} outerScheme={scheme} />
    </SchemeOverride>
  );
}

const BADGE_ICON: Record<ReturnType<typeof weekHeroLines>['badge']['kind'], SFSymbol> = {
  met: 'checkmark.circle.fill',
  ongoing: 'calendar',
  ended: 'calendar',
  ahead: 'calendar',
};

function HeroBody({ summary: s, units, outerScheme }: { summary: WeeklySummary; units: UnitSystem; outerScheme: 'light' | 'dark' }) {
  const { colors } = useAppTheme();
  const { fontScale, large } = useTextScale();
  const lines = weekHeroLines(s);
  // Four tiles across at default sizes, two by two from XXL, one per line at accessibility sizes (as on the workout summary).
  const layout = fontScale >= 1.5 ? styles.statsStacked : fontScale >= 1.2 ? styles.statsGrid : styles.stats;
  const tile = fontScale >= 1.5 ? styles.statFull : fontScale >= 1.2 ? styles.statHalf : styles.stat;
  const met = lines.badge.kind === 'met';
  const badgeColor = met ? colors.successFill : lines.badge.kind === 'ended' ? colors.textSecondary : colors.accentText;

  return (
    <View
      style={[
        styles.hero,
        // Dark mode: a thin blue edge lifts the card off the near-black page. Light mode keeps its shadow (as on the workout summary).
        outerScheme === 'dark'
          ? { backgroundColor: colors.chrome, borderColor: colors.heroBorder, borderWidth: 1 }
          : { backgroundColor: colors.chrome, borderColor: colors.chrome, boxShadow: '0px 10px 28px rgba(11, 15, 20, 0.22)' },
      ]}
    >
      <Icon name="flame.fill" color={colors.accent} size={150} weight="regular" style={styles.watermark} />
      <View style={[styles.pill, { backgroundColor: colors.input }]}>
        <Icon name={BADGE_ICON[lines.badge.kind]} color={badgeColor} size={14} />
        <AppText variant="caption" weight="800" tone={met ? 'success' : lines.badge.kind === 'ended' ? 'secondary' : 'accent'} maxFontSizeMultiplier={DENSE_TEXT_MAX}>
          {lines.badge.text}
        </AppText>
      </View>
      <View style={styles.title}>
        <AppText variant="largeTitle" accessibilityRole="header">
          Your week
        </AppText>
        <AppText variant="subhead" tone="secondary" numeric>
          {lines.subtitle}
        </AppText>
      </View>

      {/* Large text: the streak text gets the card's full width under the ring. */}
      <View style={[styles.top, large && styles.topStacked]}>
        <ProgressRing value={s.done / Math.max(1, s.target)} label={`${s.done} of ${plural(s.target, 'workout')} done`} size={104} strokeWidth={10}>
          <AppText variant="title1" numeric maxFontSizeMultiplier={COMPACT_TEXT_MAX}>{`${s.done}/${s.target}`}</AppText>
          <AppText variant="caption" tone="secondary" maxFontSizeMultiplier={COMPACT_TEXT_MAX}>
            workouts
          </AppText>
        </ProgressRing>
        <View style={[styles.streak, large && styles.streakStacked]} accessible accessibilityLabel={`${lines.streakWeeks}-week streak. ${lines.streakLine} ${lines.caption}.`}>
          <View style={styles.streakRow}>
            <Icon name="flame.fill" color={lines.streakWeeks ? colors.pr : colors.textSecondary} size={26} />
            <AppText variant="display" numeric>
              {lines.streakWeeks}
            </AppText>
          </View>
          <AppText variant="subhead" weight="700">
            week streak
          </AppText>
          <AppText variant="footnote" tone="secondary">
            {lines.streakLine}
          </AppText>
          <View style={styles.caption}>
            <Icon name={s.source === 'goal' ? 'target' : 'calendar'} color={colors.textSecondary} size={12} />
            <AppText variant="caption" weight="600" tone="secondary" style={styles.shrink}>
              {lines.caption}
            </AppText>
          </View>
        </View>
      </View>

      <View style={[styles.statsBase, layout, { borderTopColor: colors.border }]}>
        <Stat style={tile} label="Workouts" value={String(s.done)} spoken={`Workouts: ${s.done}`} />
        <Stat style={tile} label={`Volume (${unitLabel(units)})`} value={formatLoadValue(s.volumeKg, units)} spoken={`Volume: ${spokenLoad(s.volumeKg, units)}`} />
        <Stat style={tile} label="Working sets" value={String(s.workingSets)} spoken={`Working sets: ${s.workingSets}`} />
        <View style={tile} accessible accessibilityLabel={`Personal records: ${s.prCount}`}>
          <AppText variant="caption" tone="secondary" numberOfLines={2}>
            PRs
          </AppText>
          <View style={styles.prValue}>
            <Icon name="star.fill" color={s.prCount ? colors.pr : colors.textTertiary} size={16} />
            <AppText variant="title3" weight="800" numeric>
              {s.prCount}
            </AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

/** One stat tile; VoiceOver reads it as one item ("Working sets: 62"). */
function Stat({ label, value, spoken, style }: { label: string; value: string; spoken: string; style?: StyleProp<ViewStyle> }) {
  const { fontScale } = useTextScale();
  return (
    <View style={style} accessible accessibilityLabel={spoken}>
      <AppText variant="caption" tone="secondary" numberOfLines={2}>
        {label}
      </AppText>
      {/* Four tiles across are narrow, so a long value may shrink a little there (never below 70%). */}
      <AppText variant="title3" weight="800" numeric numberOfLines={fontScale < 1.2 ? 1 : undefined} adjustsFontSizeToFit={fontScale < 1.2} minimumFontScale={0.7}>
        {value}
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The week's days (Home's dots)

function DaysCard({ summary: s, today }: { summary: WeeklySummary; today: ISODate }) {
  const { colors } = useAppTheme();
  const dotStyle = (status: DayStatus) =>
    ({
      done: { backgroundColor: colors.successFill },
      partial: { backgroundColor: colors.warningFill },
      missed: { borderColor: colors.warningFill, borderWidth: 2 },
      planned: { borderColor: colors.accentText, borderWidth: 2 },
      rest: { backgroundColor: colors.input, transform: [{ scale: 0.5 }] },
    })[status];
  const spokenDays = s.days
    .filter((d) => d.status !== 'rest')
    .map((d) => `${formatLongDate(d.date)} ${DAY_WORDS[d.status as Exclude<DayStatus, 'rest'>]}`)
    .join(', ');

  return (
    <Card padding="md">
      <View style={styles.days} accessible accessibilityLabel={spokenDays ? `Days: ${spokenDays}.` : 'No workouts planned or done these days.'}>
        {s.days.map(({ date, status }) => {
          const isToday = date === today;
          return (
            <View key={date} style={styles.day}>
              <AppText variant="caption" weight="700" tone={isToday ? 'accent' : 'secondary'} maxFontSizeMultiplier={COMPACT_TEXT_MAX}>
                {WEEKDAY_LETTER[isoWeekday(date)]}
              </AppText>
              <View style={[styles.dot, dotStyle(status)]} />
              <AppText variant="caption" tone="tertiary" numeric maxFontSizeMultiplier={COMPACT_TEXT_MAX}>
                {String(fromISODate(date).getDate())}
              </AppText>
              <View style={[styles.todayBar, { backgroundColor: isToday ? colors.accent : 'transparent' }]} />
            </View>
          );
        })}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Workouts

function WorkoutsCard({ summary: s, units, onToday }: { summary: WeeklySummary; units: UnitSystem; onToday: () => void }) {
  const { colors } = useAppTheme();
  const rows = s.workouts.length + s.missed.length;
  const separator = (i: number) => i < rows - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth };

  return (
    <View style={styles.section}>
      <SectionHeader title={s.done ? `Workouts · ${s.done}` : 'Workouts'} />
      <Card padding="none">
        {s.done === 0 && (
          <View style={s.missed.length > 0 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }}>
            <EmptyState
              icon="dumbbell"
              title={s.ended ? 'No workouts logged that week' : 'No workouts logged this week'}
              message={s.ended ? 'Workouts you finished that week would show up here.' : 'Workouts you finish this week show up here, with their volume and PRs.'}
              actionLabel="Go to Today"
              onAction={onToday}
            />
          </View>
        )}
        {s.workouts.map((w, i) => {
          const detail = [formatShortDate(w.date), formatLoad(w.volumeKg, units), w.partial && 'Partial'].filter(Boolean).join(' · ');
          const spoken = [w.name, formatLongDate(w.date), spokenLoad(w.volumeKg, units), w.partial && 'partial', w.pr && 'personal record'].filter(Boolean).join(', ');
          return (
            <Row
              key={w.sessionId}
              icon={w.partial ? 'circle.lefthalf.filled' : 'checkmark.circle.fill'}
              iconColor={w.partial ? colors.warningFill : colors.successFill}
              title={w.name}
              detail={detail}
              trailing={w.pr && <Icon name="star.fill" color={colors.prOnSurface} size={14} />}
              spoken={spoken}
              hint="Opens the workout summary"
              onPress={() => router.push({ pathname: '/summary', params: { session: w.sessionId } })}
              style={separator(i)}
            />
          );
        })}
        {s.missed.map((m, i) => (
          <Row
            key={`${m.date}|${m.name}|${i}`}
            icon={m.skipped ? 'forward.end.fill' : 'exclamationmark.circle.fill'}
            iconColor={m.skipped ? colors.textSecondary : colors.warningFill}
            title={m.name}
            muted
            detail={`${formatShortDate(m.date)} · ${m.skipped ? 'Skipped' : 'Missed'}`}
            spoken={`${m.name}, ${formatLongDate(m.date)}, ${m.skipped ? 'skipped' : 'missed'}`}
            style={separator(s.workouts.length + i)}
          />
        ))}
      </Card>
    </View>
  );
}

/** A list row: a round icon, a title and a detail line, and an optional trailing mark and chevron. */
function Row({
  icon,
  iconColor,
  iconWell,
  title,
  detail,
  date,
  trailing,
  muted,
  spoken,
  hint,
  onPress,
  style,
}: {
  icon: SFSymbol;
  iconColor: string;
  iconWell?: string;
  title: string;
  detail: string;
  date?: string;
  trailing?: ReactNode;
  muted?: boolean;
  spoken: string;
  hint?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();
  const { large } = useTextScale();
  const dateText = date && (
    <AppText variant="caption" tone="secondary" numeric>
      {date}
    </AppText>
  );
  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: iconWell ?? colors.input }]}>
        <Icon name={icon} color={iconColor} size={15} />
      </View>
      <View style={styles.flex}>
        <AppText variant="subhead" weight="700" tone={muted ? 'secondary' : 'primary'} numberOfLines={large ? undefined : 2}>
          {title}
        </AppText>
        <AppText variant="footnote" tone="secondary" numberOfLines={large ? undefined : 2} numeric>
          {detail}
        </AppText>
        {/* Large text: the date joins the text column so the title keeps the width. */}
        {large && dateText}
      </View>
      {!large && dateText}
      {trailing}
      {onPress && <Icon name="chevron.right" color={colors.textSecondary} size={12} />}
    </>
  );
  // Only rows that open something are buttons; the rest are plain text, not dimmed buttons.
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.row, style, pressed && { backgroundColor: colors.input }]}
    >
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={spoken} style={[styles.row, style]}>
      {content}
    </View>
  );
}

// ---------------------------------------------------------------------------
// PRs (as Recent wins words them) and form highlights

function RecordsCard({ summary: s, units, exercisesById }: { summary: WeeklySummary; units: UnitSystem; exercisesById: ReadonlyMap<string, Exercise> }) {
  const { colors } = useAppTheme();
  const rows = weeklyRecordRows(s.records, exercisesById, units);
  const total = rows.length + s.streakRecords.length;
  if (!total) return null;
  const separator = (i: number) => i < total - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth };
  const openWorkout = (session: string) => () => router.push({ pathname: '/summary', params: { session } });

  return (
    <View style={styles.section}>
      <SectionHeader title={s.prCount ? `Personal records · ${s.prCount}` : 'Records'} />
      <Card padding="none">
        {rows.map((r, i) => (
          <Row
            key={r.key}
            icon="star.fill"
            iconColor={colors.prOnSurface}
            title={r.title}
            detail={r.detail}
            date={formatMonthDay(r.date)}
            spoken={`${r.title}. ${r.detail}. ${formatLongDate(r.date)}`}
            hint="Opens the workout summary"
            onPress={openWorkout(r.sessionId)}
            style={separator(i)}
          />
        ))}
        {s.streakRecords.map((r, i) => {
          const title = `Longest streak · ${plural(r.weeks, 'week')}`;
          const detail = `was ${plural(r.previousWeeks, 'week')}`;
          return (
            <Row
              key={r.id}
              icon="flame.fill"
              iconColor={colors.prOnSurface}
              title={title}
              detail={detail}
              date={formatMonthDay(r.achievedDate)}
              spoken={`${title}, ${detail}. ${formatLongDate(r.achievedDate)}`}
              style={separator(rows.length + i)}
            />
          );
        })}
      </Card>
    </View>
  );
}

function FormCard({ summary: s, exercisesById }: { summary: WeeklySummary; exercisesById: ReadonlyMap<string, Exercise> }) {
  const { colors } = useAppTheme();
  const { recordings } = s.form;
  // Hidden when there's nothing to show (always, until form analysis arrives in Phase 4).
  if (!recordings.length) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title="Form highlights" />
      <Card padding="none">
        {recordings.map((r, i) => {
          const name = exercisesById.get(r.exerciseId)?.name ?? 'Exercise';
          const title = r.gain ? `${name} · ${r.gain.deg}° ${formGoalAimsHigher(r.joint) ? 'higher' : 'deeper'}` : name;
          const detail = r.gain ? `${JOINT_LABEL[r.joint]} angle ${r.gain.nowDeg}° vs ${r.gain.beforeDeg}° last recording` : 'Form recording';
          return (
            <Row
              key={r.reportId}
              icon="video.fill"
              iconColor={colors.accentText}
              iconWell={colors.accentSubtle}
              title={title}
              detail={detail}
              date={formatMonthDay(r.date)}
              spoken={`${title}. ${detail}. ${formatLongDate(r.date)}`}
              hint="Opens the form report"
              onPress={() => router.push({ pathname: '/form/report', params: { id: r.reportId } })}
              style={i < recordings.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }}
            />
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  padded: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  hero: {
    borderRadius: radius.card + 4,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    gap: spacing.lg,
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    right: -24,
    top: 18,
    opacity: 0.07,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  title: {
    gap: spacing.xs,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  topStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  streak: {
    flex: 1,
    gap: 2,
  },
  streakStacked: {
    flex: 0,
    alignSelf: 'stretch',
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  caption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  shrink: {
    flexShrink: 1,
  },
  statsBase: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
  },
  statsStacked: {
    gap: spacing.md,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statFull: {
    gap: 2,
  },
  statHalf: {
    width: '50%',
    paddingRight: spacing.sm,
    gap: 2,
  },
  prValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  days: {
    flexDirection: 'row',
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  todayBar: {
    width: 14,
    height: 3,
    borderRadius: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowIcon: {
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

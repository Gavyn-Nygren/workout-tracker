import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { addDays, daysBetween, isoWeekday, startOfWeek } from '@/data/dates';
import type { ISODate } from '@/data/types';
import { useHaptics } from '@/hooks/useHaptics';
import { formatLongDate, formatMonthYear, plural } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import type { Agenda, DayItem, DayItemStatus } from './agenda';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

type Props = {
  agenda: Agenda;
  today: ISODate;
  selected: ISODate;
  onSelect: (date: ISODate) => void;
  range: { from: ISODate; to: ISODate };
};

function describeDay(items: DayItem[]): string {
  if (!items.length) return 'rest day';
  const counts = new Map<DayItemStatus, number>();
  for (const item of items) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  const words: Record<DayItemStatus, string> = {
    planned: 'planned',
    in_progress: 'in progress',
    completed: 'done',
    partial: 'partly done',
    missed: 'missed',
    skipped: 'skipped',
  };
  return [...counts].map(([status, n]) => `${plural(n, 'workout')} ${words[status]}`).join(', ');
}

/**
 * Seven days at a time; swipe for other weeks. Dots: filled = done, ring = planned or missed.
 * Pages size to the strip's own width (not the window), so it fits an iPad dashboard.
 */
export function WeekStrip({ agenda, today, selected, onSelect, range }: Props) {
  // Phones span the window, so that guess is exact; on iPad the measured width replaces it.
  const screen = useWindowDimensions();
  const [measured, setMeasured] = useState<number>();
  const width = measured ?? screen.width;
  const haptics = useHaptics();
  const { colors } = useAppTheme();
  const list = useRef<FlatList<ISODate>>(null);

  const weeks = useMemo(() => {
    const result: ISODate[] = [];
    for (let w = startOfWeek(range.from); w <= range.to; w = addDays(w, 7)) result.push(w);
    return result;
  }, [range.from, range.to]);

  const selectedWeek = weeks.indexOf(startOfWeek(selected));
  const [visibleWeek, setVisibleWeek] = useState(selectedWeek);

  // Keep the visible page in step when the selection jumps (Today button, chevrons).
  useEffect(() => {
    if (selectedWeek >= 0 && selectedWeek !== visibleWeek) {
      list.current?.scrollToIndex({ index: selectedWeek, animated: true });
      setVisibleWeek(selectedWeek);
    }
    // Only react to selection changes; swipes update visibleWeek themselves.
  }, [selectedWeek]);

  const goToWeek = (index: number) => {
    if (index < 0 || index >= weeks.length) return;
    const offset = isoWeekday(selected) - 1;
    const date = addDays(weeks[index], offset);
    const clamped = date < range.from ? range.from : date > range.to ? range.to : date;
    setVisibleWeek(index);
    haptics.selection();
    onSelect(clamped);
  };

  const monthLabel = weeks[visibleWeek] ? formatMonthYear(addDays(weeks[visibleWeek], 3)) : '';

  return (
    <View style={styles.wrap} onLayout={(e) => setMeasured(Math.round(e.nativeEvent.layout.width))}>
      <View style={styles.header}>
        <AppText variant="headline" weight="700" accessibilityRole="header">
          {monthLabel}
        </AppText>
        <View style={styles.headerActions}>
          {selected !== today && (
            <Pressable
              onPress={() => {
                haptics.selection();
                onSelect(today);
              }}
              accessibilityRole="button"
              accessibilityLabel="Go to today"
              hitSlop={8}
              style={[styles.todayPill, { backgroundColor: colors.accentSubtle }]}
            >
              <AppText variant="footnote" tone="accent" weight="700">
                Today
              </AppText>
            </Pressable>
          )}
          <Pressable onPress={() => goToWeek(visibleWeek - 1)} accessibilityRole="button" accessibilityLabel="Previous week" hitSlop={10}>
            <Icon name="chevron.left" color={visibleWeek > 0 ? colors.accentText : colors.textTertiary} size={18} />
          </Pressable>
          <Pressable onPress={() => goToWeek(visibleWeek + 1)} accessibilityRole="button" accessibilityLabel="Next week" hitSlop={10}>
            <Icon name="chevron.right" color={visibleWeek < weeks.length - 1 ? colors.accentText : colors.textTertiary} size={18} />
          </Pressable>
        </View>
      </View>

      <FlatList
        // Remount on resize (rotation, Split View) so paging lines up with the new width.
        key={width}
        ref={list}
        data={weeks}
        keyExtractor={(w) => w}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={Math.max(0, visibleWeek)}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          if (index !== visibleWeek) goToWeek(index);
        }}
        renderItem={({ item: weekStart }) => (
          <View style={[styles.week, { width }]}>
            {LETTERS.map((letter, i) => {
              const date = addDays(weekStart, i);
              return (
                <DayCell
                  key={date}
                  letter={letter}
                  date={date}
                  items={agenda.get(date) ?? []}
                  isToday={date === today}
                  isSelected={date === selected}
                  disabled={daysBetween(range.from, date) < 0 || daysBetween(date, range.to) < 0}
                  onPress={() => {
                    haptics.selection();
                    onSelect(date);
                  }}
                />
              );
            })}
          </View>
        )}
      />
    </View>
  );
}

function DayCell({
  letter,
  date,
  items,
  isToday,
  isSelected,
  disabled,
  onPress,
}: {
  letter: string;
  date: ISODate;
  items: DayItem[];
  isToday: boolean;
  isSelected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const day = Number(date.slice(8));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${formatLongDate(date)}${isToday ? ', today' : ''}, ${describeDay(items)}`}
      accessibilityState={{ selected: isSelected, disabled }}
      style={[styles.day, disabled && { opacity: 0.3 }]}
    >
      <AppText variant="caption" weight="600" tone={isToday ? 'accent' : 'secondary'} maxFontSizeMultiplier={1.3}>
        {letter}
      </AppText>
      <View
        style={[
          styles.dateCircle,
          isSelected && { backgroundColor: colors.accent },
          !isSelected && isToday && { borderColor: colors.accentText, borderWidth: 1.5 },
        ]}
      >
        <AppText
          variant="callout"
          numeric
          weight={isSelected || isToday ? '800' : '600'}
          tone={isSelected ? 'onAccent' : isToday ? 'accent' : 'primary'}
          maxFontSizeMultiplier={1.3}
        >
          {day}
        </AppText>
      </View>
      <View style={styles.dots}>
        {items.slice(0, 3).map((item) => (
          <StatusDot key={item.key} status={item.status} />
        ))}
      </View>
    </Pressable>
  );
}

function StatusDot({ status }: { status: DayItemStatus }) {
  const { colors } = useAppTheme();
  const style = {
    completed: { backgroundColor: colors.successFill },
    partial: { backgroundColor: colors.warningFill },
    in_progress: { backgroundColor: colors.accentText },
    planned: { borderColor: colors.accentText, borderWidth: 1.5 },
    missed: { borderColor: colors.warningFill, borderWidth: 1.5 },
    skipped: { borderColor: colors.textTertiary, borderWidth: 1.5 },
  }[status];
  return <View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg + spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  todayPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  week: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  dateCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    height: 7,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});

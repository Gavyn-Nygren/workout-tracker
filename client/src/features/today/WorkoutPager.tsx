import { useEffect, useRef, useState, type ReactElement } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View, type ListViewToken } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { DayItem } from './agenda';

type Props = {
  items: DayItem[];
  renderCard: (item: DayItem, index: number) => ReactElement;
  /** The workout to show (its key). The pager opens on it, and moves to it whenever it changes. */
  focusKey?: string;
};

/**
 * One workout card per page; swipe sideways between a day's workouts. Page dots show position.
 * Pages size to the pager's own width, so it also works inside an iPad column.
 */
export function WorkoutPager({ items, renderCard, focusKey }: Props) {
  const { colors } = useAppTheme();
  const [page, setPage] = useState(() => Math.max(0, items.findIndex((i) => i.key === focusKey)));
  const screen = useWindowDimensions();
  const [measured, setMeasured] = useState<number>();
  const width = measured ?? screen.width;
  const list = useRef<FlatList<DayItem>>(null);

  // Tracks the page however the list scrolls, including VoiceOver's three-finger swipe (which
  // doesn't always end in a momentum event).
  const viewability = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const index = viewableItems[0]?.index;
    if (index !== null && index !== undefined) setPage(index);
  }).current;

  // A new focus (say, the workout a push just moved here) brings its card into view, once the
  // day's list has it: the push and the calendar can reload separately. The page is set while
  // rendering; the effect only scrolls the list there.
  const [focused, setFocused] = useState(items.some((i) => i.key === focusKey) ? focusKey : undefined);
  if (focusKey !== focused) {
    const index = items.findIndex((i) => i.key === focusKey);
    if (!focusKey) setFocused(undefined);
    else if (index >= 0) {
      setFocused(focusKey);
      setPage(index);
    }
  }
  const scrolledTo = useRef(focused);
  useEffect(() => {
    if (!focused || focused === scrolledTo.current) return;
    scrolledTo.current = focused;
    const index = items.findIndex((i) => i.key === focused);
    if (index >= 0 && items.length > 1) list.current?.scrollToIndex({ index, animated: true });
  }, [focused, items]);

  if (items.length === 1) return <View style={styles.page}>{renderCard(items[0], 0)}</View>;

  const goTo = (index: number) => {
    if (index < 0 || index >= items.length) return;
    list.current?.scrollToIndex({ index, animated: true });
    setPage(index);
  };

  return (
    <View style={styles.wrap} onLayout={(e) => setMeasured(Math.round(e.nativeEvent.layout.width))}>
      <FlatList
        // Remount on resize so paging lines up with the new width.
        key={width}
        ref={list}
        data={items}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={page}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        viewabilityConfig={viewability}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({ item, index }) => <View style={[styles.page, { width }]}>{renderCard(item, index)}</View>}
      />
      {/* For VoiceOver the dots are one adjustable control: swipe up or down to change workout. */}
      <View
        style={styles.dots}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Workouts this day"
        accessibilityValue={{ text: `${page + 1} of ${items.length}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => goTo(page + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
      >
        {items.map((item, i) => (
          <View key={item.key} style={[styles.dot, { backgroundColor: i === page ? colors.accentText : colors.textTertiary }, i === page && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  page: {
    paddingHorizontal: spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs + 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotActive: {
    width: 20,
  },
});

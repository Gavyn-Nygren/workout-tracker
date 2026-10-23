import { useState, type ReactElement } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { DayItem } from './agenda';

type Props = {
  items: DayItem[];
  renderCard: (item: DayItem, index: number) => ReactElement;
};

/** One workout card per page; swipe sideways between a day's workouts. Page dots show position. */
export function WorkoutPager({ items, renderCard }: Props) {
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const [page, setPage] = useState(0);

  if (items.length === 1) return <View style={styles.page}>{renderCard(items[0], 0)}</View>;

  return (
    <View style={styles.wrap}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index }) => <View style={[styles.page, { width }]}>{renderCard(item, index)}</View>}
      />
      <View style={styles.dots} accessibilityLabel={`Workout ${page + 1} of ${items.length}. Swipe for the others.`}>
        {items.map((item, i) => (
          <View key={item.key} style={[styles.dot, { backgroundColor: i === page ? colors.accentText : colors.border }, i === page && styles.dotActive]} />
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

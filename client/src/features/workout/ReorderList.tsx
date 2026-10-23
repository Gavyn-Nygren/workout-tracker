import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { useHaptics } from '@/hooks/useHaptics';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

export type ReorderItem = { id: string; title: string; subtitle?: string };

type Props = {
  items: ReorderItem[];
  onMove: (from: number, to: number) => void;
  /** Lets a parent ScrollView stop scrolling while a row is being dragged. */
  onDraggingChange?: (dragging: boolean) => void;
};

const ROW_HEIGHT = 64;
const GAP = 8;
const STEP = ROW_HEIGHT + GAP;

function moved<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Drag the handle to reorder. Built on PanResponder so it runs in Expo Go; VoiceOver users get
 * "move up/down" actions on each row instead.
 */
export function ReorderList({ items, onMove, onDraggingChange }: Props) {
  const { colors } = useAppTheme();
  const haptics = useHaptics();
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dy = useRef(new Animated.Value(0)).current;

  const clampIndex = (i: number) => Math.max(0, Math.min(items.length - 1, i));

  const order = drag ? moved(items, drag.from, drag.to) : items;

  const responders = useMemo(
    () =>
      items.map((_, index) =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderTerminationRequest: () => false,
          onPanResponderGrant: () => {
            haptics.selection();
            dy.setValue(0);
            setDrag({ from: index, to: index });
            onDraggingChange?.(true);
          },
          onPanResponderMove: (_, g) => {
            dy.setValue(g.dy);
            const to = clampIndex(Math.round(index + g.dy / STEP));
            setDrag((d) => {
              if (!d || d.to === to) return d;
              haptics.selection();
              return { ...d, to };
            });
          },
          onPanResponderRelease: (_, g) => {
            const to = clampIndex(Math.round(index + g.dy / STEP));
            setDrag(null);
            dy.setValue(0);
            onDraggingChange?.(false);
            if (to !== index) onMove(index, to);
          },
          onPanResponderTerminate: () => {
            setDrag(null);
            dy.setValue(0);
            onDraggingChange?.(false);
          },
        }),
      ),
    // Rebuild when the list changes so each handle knows its index.
    [items, onMove, onDraggingChange],
  );

  return (
    <View style={{ height: items.length * STEP - GAP }}>
      {order.map((item, position) => {
        const index = items.indexOf(item);
        const dragging = drag?.from === index;
        const top = dragging ? Animated.add(new Animated.Value(drag.from * STEP), dy) : position * STEP;
        return (
          <Animated.View
            key={item.id}
            accessible
            accessibilityLabel={`${item.title}, position ${index + 1} of ${items.length}`}
            accessibilityActions={[
              { name: 'increment', label: 'Move up' },
              { name: 'decrement', label: 'Move down' },
            ]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'increment' && index > 0) onMove(index, index - 1);
              if (e.nativeEvent.actionName === 'decrement' && index < items.length - 1) onMove(index, index + 1);
            }}
            style={[
              styles.row,
              {
                top,
                backgroundColor: colors.card,
                borderColor: dragging ? colors.accentText : colors.border,
                zIndex: dragging ? 2 : 1,
                boxShadow: dragging ? '0px 8px 20px rgba(0, 0, 0, 0.2)' : undefined,
                transform: [{ scale: dragging ? 1.02 : 1 }],
              },
            ]}
          >
            <View style={styles.text}>
              <AppText variant="headline" numberOfLines={1}>
                {item.title}
              </AppText>
              {item.subtitle && (
                <AppText variant="footnote" tone="secondary" numberOfLines={1}>
                  {item.subtitle}
                </AppText>
              )}
            </View>
            <View {...responders[index].panHandlers} hitSlop={8} style={styles.handle}>
              <Icon name="line.3.horizontal" color={colors.textSecondary} size={20} />
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.lg,
  },
  text: {
    flex: 1,
  },
  handle: {
    width: 56,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Icon } from '@/components/ui';
import { useHaptics } from '@/hooks/useHaptics';
import { DENSE_TEXT_MAX } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

export type ReorderItem = {
  id: string;
  title: string;
  subtitle?: string;
  /** Spoken instead of the title, e.g. "Push and Cardio" for "Push + Cardio". */
  accessibilityLabel?: string;
};

type Props = {
  items: ReorderItem[];
  /** Return false when the move is dropped (a save still in flight), so VoiceOver doesn't confirm it. */
  onMove: (from: number, to: number) => boolean | void;
  /** Lets a parent ScrollView stop scrolling while a row is being dragged. */
  onDraggingChange?: (dragging: boolean) => void;
  /**
   * Shows a delete button at the start of each row, and "Delete" in its VoiceOver actions. The
   * parent asks first; leave it out where a row can't be deleted.
   */
  onDelete?: (index: number) => void;
};

/** Rows are fixed-height and absolutely placed, so their text stops at 1.5× (33 + 27 pt fits in 64). */
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
 * "Move up" and "Move down" in each row's Actions rotor instead.
 */
export function ReorderList({ items, onMove, onDraggingChange, onDelete }: Props) {
  const { colors } = useAppTheme();
  const haptics = useHaptics();
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dy = useRef(new Animated.Value(0)).current;

  const clampIndex = (i: number) => Math.max(0, Math.min(items.length - 1, i));

  const order = drag ? moved(items, drag.from, drag.to) : items;
  const spoken = (item: ReorderItem) => item.accessibilityLabel ?? item.title;

  const moveBy = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= items.length) return;
    if (onMove(index, to) === false) {
      AccessibilityInfo.announceForAccessibility('Still saving. Try again.');
      return;
    }
    AccessibilityInfo.announceForAccessibility(`${spoken(items[index])}, position ${to + 1} of ${items.length}`);
  };

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
    <View style={{ height: Math.max(0, items.length * STEP - GAP) }}>
      {order.map((item, position) => {
        const index = items.indexOf(item);
        const dragging = drag?.from === index;
        const top = dragging ? Animated.add(new Animated.Value(drag.from * STEP), dy) : position * STEP;
        return (
          <Animated.View
            key={item.id}
            accessible
            accessibilityLabel={[spoken(item), item.subtitle, `position ${index + 1} of ${items.length}`].filter(Boolean).join(', ')}
            // Custom actions (not increment/decrement, which only fire on adjustable elements), offered only where they apply.
            accessibilityActions={[
              ...(index > 0 ? [{ name: 'moveUp', label: 'Move up' }] : []),
              ...(index < items.length - 1 ? [{ name: 'moveDown', label: 'Move down' }] : []),
              ...(onDelete ? [{ name: 'delete', label: 'Delete' }] : []),
            ]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'moveUp') moveBy(index, -1);
              if (e.nativeEvent.actionName === 'moveDown') moveBy(index, 1);
              if (e.nativeEvent.actionName === 'delete') onDelete?.(index);
            }}
            style={[
              styles.row,
              onDelete && styles.rowWithDelete,
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
            {/* Off the handle, so it never starts a drag. VoiceOver uses the row's Delete action. */}
            {onDelete && (
              <Pressable onPress={() => !drag && onDelete(index)} hitSlop={4} style={styles.delete}>
                <Icon name="minus.circle.fill" color={colors.errorFill} size={22} />
              </Pressable>
            )}
            <View style={styles.text}>
              <AppText variant="headline" numberOfLines={1} maxFontSizeMultiplier={DENSE_TEXT_MAX}>
                {item.title}
              </AppText>
              {item.subtitle && (
                <AppText variant="footnote" tone="secondary" numberOfLines={1} maxFontSizeMultiplier={DENSE_TEXT_MAX}>
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
  // The delete button brings its own space in front of the text.
  rowWithDelete: {
    paddingLeft: 0,
  },
  delete: {
    width: 48,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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

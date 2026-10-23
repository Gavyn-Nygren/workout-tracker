import type { SFSymbol } from 'expo-symbols';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAppTheme } from '@/theme/ThemeProvider';
import { colors as palette, motion, radius, spacing } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'error' | 'pr';

type ToastOptions = {
  message: string;
  tone?: ToastTone;
  icon?: SFSymbol;
  durationMs?: number;
};

type ToastState = ToastOptions & { id: number };

type ToastContextValue = {
  show: (options: ToastOptions) => void;
  current: ToastState | null;
  clear: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_ICON: Record<ToastTone, SFSymbol | undefined> = {
  neutral: undefined,
  success: 'checkmark.circle.fill',
  warning: 'exclamationmark.triangle.fill',
  error: 'xmark.octagon.fill',
  pr: 'star.fill',
};

/** Space reserved above the bottom safe area so toasts clear the tab bar. */
const TAB_BAR_CLEARANCE = 56;

/**
 * Holds the current toast. Render a <ToastViewport /> in the root layout and inside each native
 * sheet: iOS draws sheets above the root view, so a root-only toast would hide behind them.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastState | null>(null);
  const counter = useRef(0);

  const show = useCallback((options: ToastOptions) => {
    counter.current += 1;
    setCurrent({ ...options, id: counter.current });
    AccessibilityInfo.announceForAccessibility(options.message);
  }, []);
  const clear = useCallback((id: number) => setCurrent((c) => (c?.id === id ? null : c)), []);
  const value = useMemo(() => ({ show, current, clear }), [show, current, clear]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

/** Where toasts appear. `bottomOffset` is the space kept clear above the bottom safe area. */
export function ToastViewport({ bottomOffset = TAB_BAR_CLEARANCE }: { bottomOffset?: number }) {
  const context = useContext(ToastContext);
  if (!context?.current) return null;
  const toast = context.current;
  return <ToastView key={toast.id} toast={toast} bottomOffset={bottomOffset} onDone={() => context.clear(toast.id)} />;
}

/** Short confirmation on the dark chrome, so it reads in both themes. */
function ToastView({ toast, bottomOffset, onDone }: { toast: ToastState; bottomOffset: number; onDone: () => void }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const tone = toast.tone ?? 'neutral';
  const icon = toast.icon ?? DEFAULT_ICON[tone];
  // The toast always sits on the dark chrome, so it uses the dark theme's status shades.
  const onDark = palette.dark;
  const iconColor = {
    neutral: colors.onChrome,
    success: onDark.successFill,
    warning: onDark.warningFill,
    error: onDark.errorFill,
    pr: onDark.pr,
  }[tone];

  useEffect(() => {
    const duration = reducedMotion ? 0 : motion.normal;
    const animation = Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration, useNativeDriver: true }),
      Animated.delay(toast.durationMs ?? 2500),
      Animated.timing(progress, { toValue: 0, duration, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => finished && onDoneRef.current());
    return () => animation.stop();
  }, [progress, reducedMotion, toast.durationMs]);

  return (
    <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + bottomOffset }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          {
            backgroundColor: colors.chrome,
            borderColor: colors.chromeBorder,
            opacity: progress,
            transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
          },
        ]}
      >
        {icon && <Icon name={icon} color={iconColor} size={18} />}
        <AppText variant="subhead" weight="600" tone="onChrome" numberOfLines={2} style={styles.message}>
          {toast.message}
        </AppText>
      </Animated.View>
    </View>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  const { show } = context;
  return useMemo(() => ({ show }), [show]);
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 480,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    boxShadow: '0px 6px 20px rgba(0, 0, 0, 0.25)',
  },
  message: {
    flexShrink: 1,
  },
});

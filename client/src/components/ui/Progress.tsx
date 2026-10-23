import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useAppTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

type BarProps = {
  /** 0 to 1. */
  value: number;
  /** Read by VoiceOver, e.g. "Bench 225 × 5 goal". */
  label: string;
  height?: number;
};

/**
 * Horizontal progress (goals, weekly target). The fill uses accent text color rather than the
 * pale accent so it stays visible against the track in the light theme.
 */
export function ProgressBar({ value, label, height = 8 }: BarProps) {
  const { colors } = useAppTheme();
  const pct = clamp01(value);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={[styles.track, { height, backgroundColor: colors.input }]}
    >
      <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: colors.accentText }]} />
    </View>
  );
}

type RingProps = BarProps & {
  size?: number;
  strokeWidth?: number;
  /** Centered content, e.g. "2/4". */
  children?: ReactNode;
};

/** Circular progress, e.g. this week's workouts against the weekly target on Home. */
export function ProgressRing({ value, label, size = 72, strokeWidth = 8, children }: RingProps) {
  const { colors } = useAppTheme();
  const pct = clamp01(value);
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.input} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.accentText}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  center: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

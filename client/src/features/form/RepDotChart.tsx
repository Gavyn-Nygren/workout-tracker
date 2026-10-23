import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';

import { AppText } from '@/components/ui';
import type { Joint, RepMetrics } from '@/data/types';
import { niceTicks } from '@/features/progress/series';
import { useAppTheme } from '@/theme/ThemeProvider';
import { typography } from '@/theme/tokens';

type Series = { label: string; color: string; reps: RepMetrics[] };

type Props = {
  current: Series;
  comparison?: Series;
  joint: Joint;
  height?: number;
};

const PAD = { top: 14, right: 14, bottom: 26, left: 40 };

/**
 * Bottom angle per rep (user's pick): this recording's reps as solid dots, the comparison's as
 * lighter dots behind. Low-confidence reps are hollow rings. Tap a rep to read both values.
 */
export function RepDotChart({ current, comparison, joint, height = 200 }: Props) {
  const { colors } = useAppTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | undefined>();

  const value = (r: RepMetrics) => r.angles[joint]?.minDeg;
  const all = [...current.reps, ...(comparison?.reps ?? [])].map(value).filter((v): v is number => v !== undefined);
  const ticks = niceTicks(Math.min(...all), Math.max(...all), 4);
  const count = Math.max(current.reps.length, comparison?.reps.length ?? 0);
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const x = (i: number) => PAD.left + (count <= 1 ? plotW / 2 : (i / (count - 1)) * plotW);
  const y = (v: number) => PAD.top + (1 - (v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0] || 1)) * (height - PAD.top - PAD.bottom);

  const readout =
    selected !== undefined
      ? [
          `Rep ${selected + 1}`,
          current.reps[selected] && value(current.reps[selected]) !== undefined ? `${current.label}: ${Math.round(value(current.reps[selected])!)}°${current.reps[selected].confidence === 'low' ? ' (low confidence)' : ''}` : undefined,
          comparison?.reps[selected] && value(comparison.reps[selected]) !== undefined ? `${comparison.label}: ${Math.round(value(comparison.reps[selected])!)}°` : undefined,
        ]
          .filter(Boolean)
          .join(' · ')
      : `Tap a rep to compare. Lower is deeper.`;

  const dots = (series: Series, filled: boolean) =>
    series.reps.map((r, i) => {
      const v = value(r);
      if (v === undefined) return null;
      const low = r.confidence === 'low';
      return (
        <Circle
          key={`${series.label}-${i}`}
          cx={x(i)}
          cy={y(v)}
          r={selected === i ? 7 : 5.5}
          fill={low ? colors.card : series.color}
          stroke={low ? series.color : colors.card}
          strokeWidth={low ? 2.5 : 2}
          opacity={filled ? 1 : 0.9}
        />
      );
    });

  return (
    <View style={styles.wrap}>
      <AppText variant="footnote" tone="secondary" numeric accessibilityLiveRegion="polite">
        {readout}
      </AppText>
      <View
        style={{ height }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Bottom ${joint} angle for each rep. ${current.label}: ${current.reps.map((r) => `${Math.round(value(r) ?? 0)}°`).join(', ')}.${comparison ? ` ${comparison.label}: ${comparison.reps.map((r) => `${Math.round(value(r) ?? 0)}°`).join(', ')}.` : ''}`}
      >
        {width > 0 && (
          <Svg width={width} height={height}>
            {ticks.map((t) => (
              <Line key={`g${t}`} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={colors.chartGrid} strokeWidth={1} />
            ))}
            {ticks.map((t) => (
              <SvgText key={`t${t}`} x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fill={colors.textSecondary} fontSize={typography.caption.fontSize} fontWeight="600">
                {`${t}°`}
              </SvgText>
            ))}
            {Array.from({ length: count }, (_, i) => (
              <SvgText key={`r${i}`} x={x(i)} y={height - 8} textAnchor="middle" fill={selected === i ? colors.text : colors.textSecondary} fontSize={typography.caption.fontSize} fontWeight="700">
                {String(i + 1)}
              </SvgText>
            ))}
            {selected !== undefined && <Line x1={x(selected)} x2={x(selected)} y1={PAD.top - 6} y2={height - PAD.bottom} stroke={colors.textTertiary} strokeWidth={1} />}
            {comparison && dots(comparison, false)}
            {dots(current, true)}
          </Svg>
        )}
        {/* One hit column per rep, wider than the dots so it's easy to tap. */}
        <View style={[StyleSheet.absoluteFill, styles.hits]}>
          {width > 0 &&
            Array.from({ length: count }, (_, i) => (
              <Pressable
                key={i}
                onPress={() => setSelected(selected === i ? undefined : i)}
                accessibilityRole="button"
                accessibilityLabel={`Rep ${i + 1}`}
                style={{ position: 'absolute', left: x(i) - Math.max(16, plotW / count / 2), width: Math.max(32, plotW / count), top: 0, bottom: 0 }}
              />
            ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 4,
  },
  hits: {
    flexDirection: 'row',
  },
});

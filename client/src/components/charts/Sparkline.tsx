import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { fromISODate } from '@/data/dates';
import { useAppTheme } from '@/theme/ThemeProvider';

type Props = {
  points: { date: string; value: number }[];
  height?: number;
  /** Read by VoiceOver, e.g. "Back Squat e1RM rising from 290 to 330 lb". */
  label: string;
};

const PAD = 5;

/** Tiny trend line (dataviz specs: 2px line, ~10% area wash, ringed end dot). No axes. */
export function Sparkline({ points, height = 44, label }: Props) {
  const { colors } = useAppTheme();
  const [width, setWidth] = useState(0);

  const times = points.map((p) => fromISODate(p.date).getTime());
  const values = points.map((p) => p.value);
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const v0 = Math.min(...values);
  const v1 = Math.max(...values);
  const x = (t: number) => PAD + (t1 === t0 ? (width - 2 * PAD) / 2 : ((t - t0) / (t1 - t0)) * (width - 2 * PAD));
  const y = (v: number) => PAD + (v1 === v0 ? (height - 2 * PAD) / 2 : (1 - (v - v0) / (v1 - v0)) * (height - 2 * PAD));

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points.length - 1;

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={label}>
      {width > 0 && points.length > 0 && (
        <Svg width={width} height={height}>
          {points.length > 1 && (
            <>
              <Path d={`${line} L${x(times[last]).toFixed(1)},${height} L${x(times[0]).toFixed(1)},${height} Z`} fill={colors.chartPrimary} fillOpacity={0.1} />
              <Path d={line} stroke={colors.chartPrimary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" />
            </>
          )}
          <Circle cx={x(times[last])} cy={y(values[last])} r={4} fill={colors.chartPrimary} stroke={colors.card} strokeWidth={2} />
        </Svg>
      )}
    </View>
  );
}

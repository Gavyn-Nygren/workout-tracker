import { memo, useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { Point } from '@/features/progress/series';
import { useAppTheme } from '@/theme/ThemeProvider';
import { areaPath, lineRuns, linePath, placeX, timeDomain, type ChartGaps } from './chartMath';

type Props = {
  /** Oldest first. `at` (the finish time) keeps same-day workouts apart. */
  points: Pick<Point, 'date' | 'value' | 'at'>[];
  height?: number;
  /**
   * Read by VoiceOver, e.g. "Back Squat e1RM rising from 290 to 330 lb" (`describeTrend` builds the
   * direction part). Inside a tappable card it isn't reached, so put the trend in the card's label.
   */
  label: string;
  /**
   * Long gaps between points: by default a dashed, faded segment across gaps of more than 28 days,
   * as the full graph draws them. The bodyweight trend passes `{ days: 7, draw: 'none' }` to break
   * its line instead; `false` joins every point.
   */
  gaps?: ChartGaps | false;
};

const PAD = 5;
const DEFAULT_GAPS: ChartGaps = { days: 28, draw: 'dashed' };

/** Tiny trend line (dataviz specs: 2px line, ~10% area wash, ringed end dot). No axes. */
function SparklineView({ points, height = 44, label, gaps = DEFAULT_GAPS }: Props) {
  const { colors } = useAppTheme();
  const [width, setWidth] = useState(0);

  const shape = useMemo(() => {
    const domain = timeDomain([points]);
    if (width <= 0 || !domain) return undefined;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const p of points) {
      if (p.value < v0) v0 = p.value;
      if (p.value > v1) v1 = p.value;
    }
    const xs = placeX(points, domain, PAD, width - 2 * PAD, 3);
    const ys = points.map((p) => PAD + (v1 === v0 ? (height - 2 * PAD) / 2 : (1 - (p.value - v0) / (v1 - v0)) * (height - 2 * PAD)));
    return { xs, ys, runs: lineRuns(points, gaps) };
  }, [points, width, height, gaps]);

  const last = points.length - 1;

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={label}>
      {shape && (
        <Svg width={width} height={height}>
          {shape.runs.map((r, i) =>
            r.to > r.from && !r.gap ? <Path key={`a${i}`} d={areaPath(shape.xs, shape.ys, r.from, r.to, height)} fill={colors.chartPrimary} fillOpacity={0.1} /> : null,
          )}
          {shape.runs.map((r, i) =>
            r.to > r.from ? (
              <Path
                key={`l${i}`}
                d={linePath(shape.xs, shape.ys, r.from, r.to)}
                stroke={colors.chartPrimary}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
                {...(r.gap ? { strokeDasharray: '3 4', strokeOpacity: 0.45 } : null)}
              />
            ) : // A point standing alone between gaps still shows.
            r.from !== last ? (
              <Circle key={`p${i}`} cx={shape.xs[r.from]} cy={shape.ys[r.from]} r={2.5} fill={colors.chartPrimary} />
            ) : null,
          )}
          <Circle cx={shape.xs[last]} cy={shape.ys[last]} r={4} fill={colors.chartPrimary} stroke={colors.card} strokeWidth={2} />
        </Svg>
      )}
    </View>
  );
}

export const Sparkline = memo(SparklineView);

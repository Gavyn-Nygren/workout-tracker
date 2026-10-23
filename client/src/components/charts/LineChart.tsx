import { useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { fromISODate } from '@/data/dates';
import { useHaptics } from '@/hooks/useHaptics';
import { niceTicks, type Point } from '@/features/progress/series';
import { formatMonthDay } from '@/lib/format';
import { useAppTheme } from '@/theme/ThemeProvider';
import { typography } from '@/theme/tokens';

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  /** Values already in display units. */
  points: Point[];
  style: 'line' | 'dots';
  area?: boolean;
};

type Props = {
  series: ChartSeries[];
  /** The series the crosshair snaps to and reports. */
  primaryKey: string;
  height?: number;
  formatValue: (value: number) => string;
  /** Called while the user drags across the chart, and with undefined when they let go. */
  onSelect?: (point: Point | undefined) => void;
  /** Lets parents pause their own scrolling while a finger is on the chart. */
  onScrubbingChange?: (scrubbing: boolean) => void;
  /** Which extreme gets the "Best" label; 'min' for joint angles, where smaller is deeper. */
  bestIs?: 'max' | 'min';
  /** Read by VoiceOver; the screen also lists every value in a table below. */
  label: string;
};

const PAD = { top: 18, right: 44, bottom: 24, left: 44 };

/**
 * Time-scaled line chart drawn with react-native-svg (runs in Expo Go). Follows the dataviz
 * specs: one axis, hairline grid, 2px lines, 10% area wash, ringed markers, the endpoint and best
 * value labelled, and a crosshair that snaps to the nearest point while dragging.
 */
export function LineChart({ series, primaryKey, height = 220, formatValue, onSelect, onScrubbingChange, bestIs = 'max', label }: Props) {
  const { colors } = useAppTheme();
  const haptics = useHaptics();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | undefined>(undefined);

  const primary = series.find((s) => s.key === primaryKey) ?? series[0];
  const all = series.flatMap((s) => s.points);

  const scale = useMemo(() => {
    const times = all.map((p) => fromISODate(p.date).getTime());
    const values = all.map((p) => p.value);
    const t0 = Math.min(...times);
    const t1 = Math.max(...times);
    const ticks = niceTicks(Math.min(...values), Math.max(...values), 4);
    const v0 = ticks[0];
    const v1 = ticks[ticks.length - 1];
    const plotW = Math.max(1, width - PAD.left - PAD.right);
    const plotH = height - PAD.top - PAD.bottom;
    return {
      ticks,
      x: (date: string) => PAD.left + (t1 === t0 ? plotW / 2 : ((fromISODate(date).getTime() - t0) / (t1 - t0)) * plotW),
      y: (v: number) => PAD.top + (1 - (v - v0) / (v1 - v0 || 1)) * plotH,
    };
  }, [all, width, height]);

  const nearest = (touchX: number) => {
    let best = 0;
    let bestDist = Infinity;
    primary.points.forEach((p, i) => {
      const d = Math.abs(scale.x(p.date) - touchX);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  const selectRef = useRef<(x: number) => void>(() => {});
  selectRef.current = (touchX: number) => {
    if (!primary.points.length) return;
    const index = nearest(touchX);
    if (index !== selected) {
      haptics.selection();
      setSelected(index);
      onSelect?.(primary.points[index]);
    }
  };
  const clear = () => {
    setSelected(undefined);
    onSelect?.(undefined);
    onScrubbingChange?.(false);
  };
  const clearRef = useRef(clear);
  clearRef.current = clear;
  const startRef = useRef(onScrubbingChange);
  startRef.current = onScrubbingChange;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Parents pause scrolling while scrubbing; if one takes over anyway, clear the selection.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          startRef.current?.(true);
          selectRef.current(e.nativeEvent.locationX);
        },
        onPanResponderMove: (e) => selectRef.current(e.nativeEvent.locationX),
        onPanResponderRelease: () => clearRef.current(),
        onPanResponderTerminate: () => clearRef.current(),
      }),
    [],
  );

  const pathFor = (points: Point[]) => points.map((p, i) => `${i ? 'L' : 'M'}${scale.x(p.date).toFixed(1)},${scale.y(p.value).toFixed(1)}`).join(' ');
  const baseline = height - PAD.bottom;
  const first = primary.points[0];
  const last = primary.points[primary.points.length - 1];
  const bestIndex = primary.points.reduce((bi, p, i, arr) => ((bestIs === 'max' ? p.value > arr[bi].value : p.value < arr[bi].value) ? i : bi), 0);
  const showBest = primary.points.length > 2 && bestIndex < primary.points.length - 2;
  const textStyle = { fontSize: typography.caption.fontSize, fontWeight: '600' as const };

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={label} {...responder.panHandlers}>
      {width > 0 && all.length > 0 && (
        <Svg width={width} height={height}>
          {scale.ticks.map((t) => (
            <Line key={`g${t}`} x1={PAD.left} x2={width - PAD.right} y1={scale.y(t)} y2={scale.y(t)} stroke={colors.chartGrid} strokeWidth={1} />
          ))}
          {scale.ticks.map((t) => (
            <SvgText key={`t${t}`} x={PAD.left - 8} y={scale.y(t) + 4} textAnchor="end" fill={colors.textSecondary} {...textStyle}>
              {formatValue(t)}
            </SvgText>
          ))}
          {first && (
            <SvgText x={scale.x(first.date)} y={height - 6} textAnchor="start" fill={colors.textSecondary} {...textStyle}>
              {formatMonthDay(first.date)}
            </SvgText>
          )}
          {last && last !== first && (
            <SvgText x={scale.x(last.date)} y={height - 6} textAnchor="end" fill={colors.textSecondary} {...textStyle}>
              {formatMonthDay(last.date)}
            </SvgText>
          )}

          {primary.style === 'line' && primary.area && primary.points.length > 1 && (
            <Path
              d={`${pathFor(primary.points)} L${scale.x(last.date).toFixed(1)},${baseline} L${scale.x(first.date).toFixed(1)},${baseline} Z`}
              fill={primary.color}
              fillOpacity={0.1}
            />
          )}
          {series.map((s) =>
            s.style === 'dots' ? (
              s.points.map((p, i) => <Circle key={`${s.key}${i}`} cx={scale.x(p.date)} cy={scale.y(p.value)} r={4} fill={s.color} stroke={colors.card} strokeWidth={2} />)
            ) : (
              <Path key={s.key} d={pathFor(s.points)} stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" />
            ),
          )}
          {primary.style === 'line' &&
            primary.points.length <= 16 &&
            primary.points.map((p, i) => <Circle key={`m${i}`} cx={scale.x(p.date)} cy={scale.y(p.value)} r={i === primary.points.length - 1 ? 4.5 : 3} fill={primary.color} stroke={colors.card} strokeWidth={2} />)}

          {last && selected === undefined && (
            <SvgText x={scale.x(last.date) + 8} y={scale.y(last.value) + 4} textAnchor="start" fill={colors.text} fontSize={typography.footnote.fontSize} fontWeight="700">
              {formatValue(last.value)}
            </SvgText>
          )}
          {showBest && selected === undefined && (
            <SvgText
              x={scale.x(primary.points[bestIndex].date)}
              y={scale.y(primary.points[bestIndex].value) + (bestIs === 'max' ? -10 : 18)}
              textAnchor="middle"
              fill={colors.textSecondary}
              {...textStyle}
            >
              {`Best ${formatValue(primary.points[bestIndex].value)}`}
            </SvgText>
          )}

          {selected !== undefined && primary.points[selected] && (
            <>
              <Line
                x1={scale.x(primary.points[selected].date)}
                x2={scale.x(primary.points[selected].date)}
                y1={PAD.top - 6}
                y2={baseline}
                stroke={colors.textTertiary}
                strokeWidth={1}
              />
              <Circle cx={scale.x(primary.points[selected].date)} cy={scale.y(primary.points[selected].value)} r={6} fill={primary.color} stroke={colors.card} strokeWidth={2.5} />
            </>
          )}
        </Svg>
      )}
    </View>
  );
}

import { useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { fromISODate } from '@/data/dates';
import { useHaptics } from '@/hooks/useHaptics';
import { niceTicks, type Point } from '@/features/progress/series';
import { formatLongDate, formatMonthDay } from '@/lib/format';
import { DENSE_TEXT_MAX, useTextScale } from '@/theme/layout';
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
  /** Height at the default text size; it grows a little with the axis text. */
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
  /**
   * What VoiceOver says for a point while swiping up or down through the chart, e.g.
   * "Tuesday, October 20, Push Day: 330 pounds". Defaults to the date and `formatValue`.
   */
  describePoint?: (point: Point) => string;
  accessibilityHint?: string;
};

const PAD = { top: 18, right: 44, bottom: 24, left: 44 };

/**
 * Time-scaled line chart drawn with react-native-svg (runs in Expo Go). Follows the dataviz
 * specs: one axis, hairline grid, 2px lines, 10% area wash, ringed markers, the endpoint and best
 * value labelled, and a crosshair that snaps to the nearest point while dragging.
 */
export function LineChart({
  series,
  primaryKey,
  height: plotHeight = 220,
  formatValue,
  onSelect,
  onScrubbingChange,
  bestIs = 'max',
  label,
  describePoint,
  accessibilityHint = 'Swipe up or down to read each value.',
}: Props) {
  const { colors } = useAppTheme();
  const haptics = useHaptics();
  const { fontScale } = useTextScale();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | undefined>(undefined);

  // Axis text grows with Dynamic Type up to the dense cap. The padding that holds it grows too,
  // and the chart gets taller by the same amount so the plot area keeps its size.
  const k = Math.min(Math.max(fontScale, 1), DENSE_TEXT_MAX);
  const pad = useMemo(() => ({ top: PAD.top * k, right: PAD.right * k, bottom: PAD.bottom * k, left: PAD.left * k }), [k]);
  const height = plotHeight + (pad.top + pad.bottom - PAD.top - PAD.bottom);

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
    const plotW = Math.max(1, width - pad.left - pad.right);
    const plotH = height - pad.top - pad.bottom;
    return {
      ticks,
      x: (date: string) => pad.left + (t1 === t0 ? plotW / 2 : ((fromISODate(date).getTime() - t0) / (t1 - t0)) * plotW),
      y: (v: number) => pad.top + (1 - (v - v0) / (v1 - v0 || 1)) * plotH,
    };
  }, [all, width, height, pad]);

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
  const baseline = height - pad.bottom;
  const first = primary.points[0];
  const last = primary.points[primary.points.length - 1];
  const bestIndex = primary.points.reduce((bi, p, i, arr) => ((bestIs === 'max' ? p.value > arr[bi].value : p.value < arr[bi].value) ? i : bi), 0);
  const showBest = primary.points.length > 2 && bestIndex < primary.points.length - 2;
  const textStyle = { fontSize: typography.caption.fontSize * k, fontWeight: '600' as const };

  // VoiceOver: one adjustable element. Swiping up or down steps through the points and moves the
  // crosshair and the screen's readout, as a drag would.
  const speak = describePoint ?? ((p: Point) => `${formatLongDate(p.date)}: ${formatValue(p.value)}`);
  const step = (by: 1 | -1) => {
    const count = primary.points.length;
    if (!count) return;
    const index = Math.max(0, Math.min(count - 1, (selected ?? count - 1) + by));
    setSelected(index);
    onSelect?.(primary.points[index]);
  };
  const current = selected !== undefined ? primary.points[selected] : undefined;

  return (
    <View
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityHint={primary.points.length > 1 ? accessibilityHint : undefined}
      accessibilityValue={{ text: current ? speak(current) : last ? `Latest, ${speak(last)}` : 'No data' }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      {...responder.panHandlers}
    >
      {width > 0 && all.length > 0 && (
        <Svg width={width} height={height}>
          {scale.ticks.map((t) => (
            <Line key={`g${t}`} x1={pad.left} x2={width - pad.right} y1={scale.y(t)} y2={scale.y(t)} stroke={colors.chartGrid} strokeWidth={1} />
          ))}
          {scale.ticks.map((t) => (
            <SvgText key={`t${t}`} x={pad.left - 8} y={scale.y(t) + 4 * k} textAnchor="end" fill={colors.textSecondary} {...textStyle}>
              {formatValue(t)}
            </SvgText>
          ))}
          {first && (
            <SvgText x={scale.x(first.date)} y={height - 6 * k} textAnchor="start" fill={colors.textSecondary} {...textStyle}>
              {formatMonthDay(first.date)}
            </SvgText>
          )}
          {last && last !== first && (
            <SvgText x={scale.x(last.date)} y={height - 6 * k} textAnchor="end" fill={colors.textSecondary} {...textStyle}>
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
            <SvgText x={scale.x(last.date) + 8} y={scale.y(last.value) + 4 * k} textAnchor="start" fill={colors.text} fontSize={typography.footnote.fontSize * k} fontWeight="700">
              {formatValue(last.value)}
            </SvgText>
          )}
          {showBest && selected === undefined && (
            <SvgText
              x={scale.x(primary.points[bestIndex].date)}
              y={scale.y(primary.points[bestIndex].value) + (bestIs === 'max' ? -10 : 18) * k}
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
                y1={pad.top - 6}
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

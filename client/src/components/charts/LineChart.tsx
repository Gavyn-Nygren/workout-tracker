import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { fromISODate, todayISO } from '@/data/dates';
import type { ISODate } from '@/data/types';
import { useHaptics } from '@/hooks/useHaptics';
import { niceTicks, type Point } from '@/features/progress/series';
import { formatLongDateYear } from '@/lib/format';
import { DENSE_TEXT_MAX, useTextScale } from '@/theme/layout';
import { useAppTheme } from '@/theme/ThemeProvider';
import { typography } from '@/theme/tokens';
import {
  areaPath,
  dotsPath,
  lineRuns,
  linePath,
  maxTimeTicks,
  nearestIndex,
  placeX,
  textWidth,
  timeDomain,
  timeLabels,
  uniqueTicks,
  type ChartGaps,
  type Run,
} from './chartMath';

export type { ChartGaps };

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  /** Values already in display units, oldest first. `at` (the finish time) places same-day points. */
  points: Point[];
  style: 'line' | 'dots';
  area?: boolean;
  /**
   * Where consecutive points are more than `days` apart: a dashed, faded segment ('dashed', graphs:
   * 28 days) or no line ('none', the bodyweight trend: 7 days). Without it every point is joined.
   */
  gaps?: ChartGaps;
};

type Props = {
  series: ChartSeries[];
  /** The series the crosshair snaps to and reports. */
  primaryKey: string;
  /** Height at the default text size; it grows a little with the axis text. */
  height?: number;
  /** A value as the chart's labels show it (no unit), e.g. "102.5" or "+20". */
  formatValue: (value: number) => string;
  /**
   * Y-axis ticks for every plotted value (progressFormat's valueTicks gives ones whose labels never
   * repeat). Default: round numbers. A tick whose label repeats the one below is left out.
   */
  ticks?: (values: number[]) => number[];
  /** A y-axis label; defaults to formatValue. E.g. compact thousands ("12.5K"). */
  formatTick?: (value: number) => string;
  /** 'ends' (default) labels the first and last dates; 'months' gives month or year ticks (1Y, All). */
  timeAxis?: 'ends' | 'months';
  /** Today (local), so dates get a year when it isn't this year. Defaults to the device's today. */
  today?: ISODate;
  /** Called while the user scrubs, with undefined when they let go (or the data changes). */
  onSelect?: (point: Point | undefined) => void;
  /**
   * True while a scrub is on: a horizontal drag, or a touch held still for a moment. Pause the
   * page's vertical scrolling while it is; a vertical drag that starts on the chart scrolls instead.
   */
  onScrubbingChange?: (scrubbing: boolean) => void;
  /**
   * True from the moment a finger lands on the chart until it lifts (or a scroll takes over). A
   * horizontal pager pauses on it, so horizontal drags on the chart scrub instead of paging.
   */
  onTouchChange?: (touching: boolean) => void;
  /**
   * Which extreme gets a "Best" label: 'max' for strength metrics, 'min' for joint angles (smaller
   * is deeper), 'none' (default) where neither is better, like bodyweight.
   */
  bestIs?: 'max' | 'min' | 'none';
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
/** A touch held this long without moving starts a scrub (so a vertical drag can scroll first). */
const HOLD_MS = 160;
/** Movement that decides a touch's direction. */
const SLOP = 6;
/** Same-day points are kept at least this far apart, so a drag reaches each. */
const SAME_DAY_GAP = 6;
/** At most one selection haptic this often, so long histories don't buzz continuously. */
const HAPTIC_MS = 45;
/** Above this many points a line drops its per-point markers (they'd merge into a band). */
const MARKER_LIMIT = 16;
/** One empty list, so a chart without data keeps the same `points` between renders. */
const NO_POINTS: Point[] = [];

type Placed = { series: ChartSeries; xs: number[]; ys: number[]; runs: Run[] };

/**
 * Time-scaled line chart drawn with react-native-svg (runs in Expo Go). Follows the dataviz specs:
 * one axis, hairline grid, 2px lines, 10% area wash, ringed markers, the endpoint (and optionally
 * the best value) labelled, and a crosshair that snaps to the nearest point while scrubbing. Long
 * gaps can draw dashed and faded. Horizontal drags scrub; vertical ones scroll the page.
 *
 * Memoized: pass a memoized `series` and stable callbacks, and scrubbing only redraws the
 * crosshair, not the lines.
 */
function LineChartView({
  series,
  primaryKey,
  height: plotHeight = 220,
  formatValue,
  ticks: makeTicks,
  formatTick,
  timeAxis = 'ends',
  today = todayISO(),
  onSelect,
  onScrubbingChange,
  onTouchChange,
  bestIs = 'none',
  label,
  describePoint,
  accessibilityHint = 'Swipe up or down to read each value.',
}: Props) {
  const { colors } = useAppTheme();
  const haptics = useHaptics();
  const { fontScale } = useTextScale();
  const [width, setWidth] = useState(0);

  // Axis text grows with Dynamic Type up to the dense cap. The padding that holds it grows too,
  // and the chart gets taller by the same amount so the plot area keeps its size.
  const k = Math.min(Math.max(fontScale, 1), DENSE_TEXT_MAX);
  const height = plotHeight + (PAD.top + PAD.bottom) * (k - 1);
  const axisFont = typography.caption.fontSize * k;
  const valueFont = typography.footnote.fontSize * k;

  const primaryIndex = Math.max(0, series.findIndex((s) => s.key === primaryKey));
  const primary = series[primaryIndex] ?? series[0];
  const points = primary?.points ?? NO_POINTS;

  // The selection belongs to the data it was made on: a new metric, range or history clears it.
  const signature = useMemo(
    () =>
      series
        .map((s) => {
          const a = s.points[0];
          const b = s.points[s.points.length - 1];
          return `${s.key}:${s.points.length}:${a?.date}:${a?.value}:${b?.date}:${b?.value}:${b?.sessionId}`;
        })
        .join('|'),
    [series],
  );
  const [selection, setSelection] = useState<{ signature: string; index: number } | undefined>();
  const selected = selection && selection.signature === signature && selection.index < points.length ? selection.index : undefined;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  useEffect(() => {
    if (selection && selection.signature !== signature) {
      setSelection(undefined);
      onSelectRef.current?.(undefined);
    }
  }, [signature, selection]);

  const geometry = useMemo(() => {
    if (width <= 0) return undefined;
    const values = series.flatMap((s) => s.points.map((p) => p.value));
    const domain = timeDomain(series.map((s) => s.points));
    if (!values.length || !domain) return undefined;
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const raw = makeTicks?.(values) ?? [];
    const tickValues = raw.length >= 2 ? raw : niceTicks(min, max, 4);
    const ticks = uniqueTicks(tickValues, formatTick ?? formatValue);
    const v0 = tickValues[0];
    const v1 = tickValues[tickValues.length - 1];

    // Padding holds the widest tick label and the endpoint label.
    const lastPoint = points[points.length - 1];
    const left = Math.max(PAD.left * k, Math.max(...ticks.map((t) => textWidth(t.label, axisFont))) + 12);
    const endLabel = lastPoint ? textWidth(formatValue(lastPoint.value), valueFont) + 14 : 0;
    const right = Math.min(Math.max(PAD.right * k, endLabel), Math.max(PAD.right * k, width * 0.3));
    const top = PAD.top * k;
    const baseline = height - PAD.bottom * k;
    const plotW = Math.max(1, width - left - right);
    const plotH = baseline - top;
    const y = (v: number) => top + (1 - (v - v0) / (v1 - v0 || 1)) * plotH;

    const placed: Placed[] = series.map((s) => {
      const xs = placeX(s.points, domain, left, plotW, SAME_DAY_GAP);
      const ys = s.points.map((p) => y(p.value));
      return { series: s, xs, ys, runs: s.style === 'line' ? lineRuns(s.points, s.gaps) : [] };
    });
    const main = placed[primaryIndex] ?? placed[0];
    const span = domain.t1 - domain.t0;
    const xOf = (date: ISODate) => (span > 0 ? left + ((fromISODate(date).getTime() - domain.t0) / span) * plotW : left + plotW / 2);
    const allDates = series.flatMap((s) => s.points.map((p) => p.date)).sort();
    const firstDate = allDates[0];
    const lastDate = allDates[allDates.length - 1];
    const xFor = (date: ISODate) => {
      const i = main.series.points.findIndex((p) => p.date === date);
      return i >= 0 ? main.xs[i] : xOf(date);
    };
    const dates = timeLabels({
      first: { date: firstDate, x: xFor(firstDate) },
      last: { date: lastDate, x: lastIndexX(main, lastDate) ?? xOf(lastDate) },
      mode: timeAxis,
      xOf,
      width,
      today,
      measure: (text) => textWidth(text, axisFont),
      maxTicks: maxTimeTicks(plotW, axisFont),
    });
    return { ticks, y, left, right, baseline, top, placed, main, dates };
  }, [series, width, height, k, axisFont, valueFont, makeTicks, formatTick, formatValue, timeAxis, today, primaryIndex, points]);

  // The lines, grid and labels, built once per data and size, so scrubbing only redraws the crosshair.
  const plot = useMemo(() => {
    if (!geometry) return null;
    const { ticks, y, left, baseline, placed, main, dates } = geometry;
    const textStyle = { fontSize: axisFont, fontWeight: '600' as const };
    return (
      <G>
        {ticks.map((t) => (
          <Line key={`g${t.value}`} x1={left} x2={width - geometry.right} y1={y(t.value)} y2={y(t.value)} stroke={colors.chartGrid} strokeWidth={1} />
        ))}
        {ticks.map((t) => (
          <SvgText key={`t${t.value}`} x={left - 8} y={y(t.value) + 4 * k} textAnchor="end" fill={colors.textSecondary} {...textStyle}>
            {t.label}
          </SvgText>
        ))}
        {dates.map((d) => (
          <G key={`d${d.date}`}>
            {d.markX !== undefined && <Line x1={d.markX} x2={d.markX} y1={baseline} y2={baseline + 4} stroke={colors.textTertiary} strokeWidth={1} />}
            <SvgText x={d.x} y={height - 6 * k} textAnchor={d.anchor} fill={colors.textSecondary} {...textStyle}>
              {d.text}
            </SvgText>
          </G>
        ))}

        {placed.map(({ series: s, xs, ys, runs }) => {
          if (s.style === 'dots') {
            // A dense dot series is one path; its dots lose the surface ring, which would only add noise.
            const dense = xs.length > (width - left) / 6;
            return dense ? (
              <Path key={s.key} d={dotsPath(xs, ys, 2.5)} fill={s.color} />
            ) : (
              <G key={s.key}>
                {xs.map((x, i) => (
                  <Circle key={i} cx={x} cy={ys[i]} r={4} fill={s.color} stroke={colors.card} strokeWidth={2} />
                ))}
              </G>
            );
          }
          return (
            <G key={s.key}>
              {s.area && runs.map((r, i) => !r.gap && r.to > r.from && <Path key={`a${i}`} d={areaPath(xs, ys, r.from, r.to, baseline)} fill={s.color} fillOpacity={0.1} />)}
              {runs.map((r, i) =>
                r.to > r.from ? (
                  <Path
                    key={`l${i}`}
                    d={linePath(xs, ys, r.from, r.to)}
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    fill="none"
                    {...(r.gap ? { strokeDasharray: '4 5', strokeOpacity: 0.45 } : null)}
                  />
                ) : null,
              )}
            </G>
          );
        })}
        {main.series.style === 'line' &&
          main.xs.map((x, i) => {
            const lastOne = i === main.xs.length - 1;
            // Every point while there are few; past that the end, and points standing alone between gaps.
            const alone = main.runs.some((r) => !r.gap && r.from === i && r.to === i);
            if (!lastOne && !alone && main.xs.length > MARKER_LIMIT) return null;
            return <Circle key={`m${i}`} cx={x} cy={main.ys[i]} r={lastOne ? 4.5 : 3} fill={main.series.color} stroke={colors.card} strokeWidth={2} />;
          })}
      </G>
    );
  }, [geometry, colors, width, height, k, axisFont]);

  // Scrubbing. Refs keep the responder (made once) reading this render's data.
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const signatureRef = useRef(signature);
  signatureRef.current = signature;
  const callbacks = useRef({ onScrubbingChange, onTouchChange });
  callbacks.current = { onScrubbingChange, onTouchChange };
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const lastHaptic = useRef(0);
  const hapticsRef = useRef(haptics);
  hapticsRef.current = haptics;

  const selectAt = (x: number, y: number) => {
    const main = geometryRef.current?.main;
    if (!main) return;
    const index = nearestIndex(main.xs, main.ys, x, y);
    if (index < 0 || index === selectedRef.current) return;
    selectedRef.current = index;
    const now = Date.now();
    if (now - lastHaptic.current >= HAPTIC_MS) {
      lastHaptic.current = now;
      hapticsRef.current.selection();
    }
    setSelection({ signature: signatureRef.current, index });
    onSelectRef.current?.(main.series.points[index]);
  };
  const selectRef = useRef(selectAt);
  selectRef.current = selectAt;

  const gesture = useRef({ mode: 'idle' as 'idle' | 'pending' | 'vertical' | 'scrub', x: 0, y: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined });

  const responder = useMemo(() => {
    const g = gesture.current;
    const stopTimer = () => {
      if (g.timer) clearTimeout(g.timer);
      g.timer = undefined;
    };
    const begin = () => {
      stopTimer();
      if (g.mode !== 'pending') return;
      g.mode = 'scrub';
      callbacks.current.onScrubbingChange?.(true);
      selectRef.current(g.x, g.y);
    };
    const end = () => {
      stopTimer();
      const was = g.mode;
      g.mode = 'idle';
      if (was === 'scrub') {
        selectedRef.current = undefined;
        setSelection(undefined);
        onSelectRef.current?.(undefined);
        callbacks.current.onScrubbingChange?.(false);
      }
      if (was !== 'idle') callbacks.current.onTouchChange?.(false);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Before a scrub starts the page may take the touch to scroll; once scrubbing, it stays here.
      onPanResponderTerminationRequest: () => g.mode !== 'scrub',
      onPanResponderGrant: (e) => {
        g.mode = 'pending';
        g.x = e.nativeEvent.locationX;
        g.y = e.nativeEvent.locationY;
        callbacks.current.onTouchChange?.(true);
        g.timer = setTimeout(begin, HOLD_MS);
      },
      onPanResponderMove: (e, state) => {
        g.x = e.nativeEvent.locationX;
        g.y = e.nativeEvent.locationY;
        if (g.mode === 'pending') {
          const dx = Math.abs(state.dx);
          const dy = Math.abs(state.dy);
          if (dx >= SLOP && dx > dy) begin();
          else if (dy >= SLOP) {
            // A vertical drag: leave it to the page, which scrolls.
            stopTimer();
            g.mode = 'vertical';
          }
        }
        if (g.mode === 'scrub') selectRef.current(g.x, g.y);
      },
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
    });
  }, []);

  useEffect(
    () => () => {
      if (gesture.current.timer) clearTimeout(gesture.current.timer);
    },
    [],
  );

  // VoiceOver: one adjustable element. Swiping up or down steps through the points and moves the
  // crosshair and the screen's readout, as a drag would.
  const speak = describePoint ?? ((p: Point) => `${formatLongDateYear(p.date, today)}: ${formatValue(p.value)}`);
  const step = (by: 1 | -1) => {
    const count = points.length;
    if (!count) return;
    const index = Math.max(0, Math.min(count - 1, (selected ?? count - 1) + by));
    selectedRef.current = index;
    setSelection({ signature, index });
    onSelect?.(points[index]);
  };
  const current = selected !== undefined ? points[selected] : undefined;
  const last = points[points.length - 1];

  return (
    <View
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityHint={points.length > 1 ? accessibilityHint : undefined}
      accessibilityValue={{ text: current ? speak(current) : last ? `Latest, ${speak(last)}` : 'No data' }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      {...responder.panHandlers}
    >
      {geometry && (
        // Touches land on the container, so locationX/Y are in chart coordinates.
        <Svg width={width} height={height} pointerEvents="none">
          {plot}
          <Overlay geometry={geometry} selected={selected} bestIs={bestIs} formatValue={formatValue} width={width} k={k} axisFont={axisFont} valueFont={valueFont} />
        </Svg>
      )}
    </View>
  );
}

/** The parts that change while scrubbing: the endpoint and best labels, or the crosshair. */
function Overlay({
  geometry,
  selected,
  bestIs,
  formatValue,
  width,
  k,
  axisFont,
  valueFont,
}: {
  geometry: { main: Placed; top: number; baseline: number; left: number; right: number };
  selected: number | undefined;
  bestIs: 'max' | 'min' | 'none';
  formatValue: (value: number) => string;
  width: number;
  k: number;
  axisFont: number;
  valueFont: number;
}) {
  const { colors } = useAppTheme();
  const { main, top, baseline, left } = geometry;
  const { xs, ys, series } = main;
  const count = xs.length;
  if (!count) return null;

  if (selected !== undefined && selected < count) {
    return (
      <G>
        <Line x1={xs[selected]} x2={xs[selected]} y1={top - 6} y2={baseline} stroke={colors.textTertiary} strokeWidth={1} />
        <Circle cx={xs[selected]} cy={ys[selected]} r={6} fill={series.color} stroke={colors.card} strokeWidth={2.5} />
      </G>
    );
  }

  const last = count - 1;
  const endText = formatValue(series.points[last].value);
  const endFits = xs[last] + 8 + textWidth(endText, valueFont) <= width;
  let best = -1;
  if (bestIs !== 'none' && count > 2) {
    best = 0;
    series.points.forEach((p, i) => {
      if (bestIs === 'max' ? p.value > series.points[best].value : p.value < series.points[best].value) best = i;
    });
    // The endpoint label already says it when the best is at the end.
    if (best >= count - 2) best = -1;
  }
  const bestText = best >= 0 ? `Best ${formatValue(series.points[best].value)}` : '';
  const bestWidth = textWidth(bestText, axisFont);
  return (
    <G>
      <SvgText
        x={endFits ? xs[last] + 8 : xs[last]}
        y={endFits ? ys[last] + 4 * k : ys[last] - 10 * k}
        textAnchor={endFits ? 'start' : 'end'}
        fill={colors.text}
        fontSize={valueFont}
        fontWeight="700"
      >
        {endText}
      </SvgText>
      {best >= 0 && (
        <SvgText
          // Kept clear of the y-axis labels and inside the chart.
          x={Math.min(Math.max(xs[best], left + bestWidth / 2 + 2), width - bestWidth / 2)}
          y={Math.max(ys[best] + (bestIs === 'max' ? -10 : 18) * k, axisFont)}
          textAnchor="middle"
          fill={colors.textSecondary}
          fontSize={axisFont}
          fontWeight="600"
        >
          {bestText}
        </SvgText>
      )}
    </G>
  );
}

/** The x of the main series' last point on `date`, if it has one. */
function lastIndexX(main: Placed, date: ISODate): number | undefined {
  for (let i = main.series.points.length - 1; i >= 0; i--) if (main.series.points[i].date === date) return main.xs[i];
  return undefined;
}

export const LineChart = memo(LineChartView);

// How Progress shows its numbers (G3.11), pure and unit-tested (tests/progressFormat.test.ts).
//
// - Values come in display units (toDisplay in series.ts), as the charts use them.
// - Top set shows the weight as logged: one decimal, a trailing .0 dropped, whole numbers from
//   1,000 up (like History). Bodyweight lifts read added weight: "+20 lb", "Bodyweight", "−20 lb".
// - e1RM and volume show whole numbers; reps, sets, and holds whole too ("1 set", "75 s").
// - A change is rounded to what's shown before its direction is read, so one that rounds to zero
//   reads "No change", never "+0 kg" or "−0 kg".
import { spokenDuration } from '@/hooks/useNow';
import type { ISODate, UnitSystem } from '@/data/types';
import { formatLongDateYear, formatMonthDayYear, plural, unitLabel } from '@/lib/format';
import { metricPhrase, niceTicks, spokenMetricPhrase, toDisplay, type ChangeSince, type Metric } from './series';

/** What's being shown: a metric, or bodyweight (one decimal). */
export type ShownMetric = Metric | 'bodyweight';
/** `added`: a bodyweight lift's top set, read as weight added to bodyweight (Point.added). */
export type FormatOptions = { added?: boolean };
/** Which way a change goes once rounded to what's shown. */
export type Direction = 'up' | 'down' | 'none';

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/**
 * Decimal places a metric shows: one for top set and bodyweight (top set: whole numbers from 1,000
 * up, as History shows loads), none for the rest. `magnitude` is the size of the values shown.
 */
export function metricDecimals(metric: ShownMetric, magnitude = 0): 0 | 1 {
  if (metric === 'bodyweight') return 1;
  if (metric === 'top_set') return Math.abs(magnitude) >= 1000 ? 0 : 1;
  return 0;
}

const roundTo = (value: number, decimals: number) => Math.round(value * 10 ** decimals) / 10 ** decimals + 0; // + 0: no −0

/** A number at a metric's precision: "102.5", "100", "18,450". */
function number(value: number, metric: ShownMetric): string {
  const decimals = metricDecimals(metric, value);
  const rounded = roundTo(value, decimals);
  if (Math.abs(rounded) < 1000) return String(rounded);
  return (decimals ? oneDecimal : integer).format(rounded);
}

const unitWord = (units: UnitSystem, shown: string) => `${units === 'imperial' ? 'pound' : 'kilogram'}${shown === '1' ? '' : 's'}`;

/**
 * A value as text: "102.5 kg", "317 lb", "12 reps", "1 set", "75 s", "+20 lb", "Bodyweight".
 * Without the unit (`withUnit` false, for chart axes and labels): "102.5", "12", "+20", "0".
 */
export function formatMetric(value: number, metric: ShownMetric, units: UnitSystem, withUnit = true, options: FormatOptions = {}): string {
  if (metric === 'reps' || metric === 'sets') {
    const count = Math.round(value);
    return withUnit ? plural(count, metric === 'reps' ? 'rep' : 'set') : String(count);
  }
  if (metric === 'longest_hold') return `${Math.round(value)}${withUnit ? ' s' : ''}`;
  const unit = withUnit ? ` ${unitLabel(units)}` : '';
  if (metric === 'top_set' && options.added) {
    const shown = number(Math.abs(value), metric);
    if (shown === '0') return withUnit ? 'Bodyweight' : '0';
    return `${value > 0 ? '+' : '−'}${shown}${unit}`;
  }
  return `${number(value, metric)}${unit}`;
}

/** formatMetric for VoiceOver: "225 pounds", "1 kilogram", "12 reps", "1 minute 15 seconds", "bodyweight plus 20 pounds". */
export function spokenMetric(value: number, metric: ShownMetric, units: UnitSystem, options: FormatOptions = {}): string {
  if (metric === 'reps' || metric === 'sets') return formatMetric(value, metric, units);
  if (metric === 'longest_hold') return spokenDuration(value);
  if (metric === 'top_set' && options.added) {
    const shown = number(Math.abs(value), metric);
    if (shown === '0') return 'bodyweight';
    const load = `${shown} ${unitWord(units, shown)}`;
    return value > 0 ? `bodyweight plus ${load}` : `${load} of assistance`;
  }
  const shown = number(value, metric);
  return `${shown} ${unitWord(units, shown)}`;
}

/** A change rounded to what's shown (top set and bodyweight to 0.1, the rest to whole numbers). */
export function roundDelta(delta: number, metric: ShownMetric): number {
  return roundTo(delta, metric === 'top_set' || metric === 'bodyweight' ? 1 : 0);
}

/** Which way a change goes as shown: a change that rounds to zero is 'none' (no arrow, neutral). */
export function deltaDirection(delta: number, metric: ShownMetric): Direction {
  const rounded = roundDelta(delta, metric);
  return rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'none';
}

/**
 * "+15 lb", "−2.5 kg", "+1 rep", "−2 sets", "+15 s" (true minus sign), or "No change" when it rounds
 * to zero. A change in added weight reads as a plain weight change.
 */
export function formatMetricDelta(delta: number, metric: ShownMetric, units: UnitSystem): string {
  const rounded = roundDelta(delta, metric);
  if (rounded === 0) return 'No change';
  return `${rounded > 0 ? '+' : '−'}${formatMetric(Math.abs(rounded), metric, units)}`;
}

/** "up 15 pounds" / "down 1 rep" / "no change" for VoiceOver. */
export function spokenMetricDelta(delta: number, metric: ShownMetric, units: UnitSystem): string {
  const rounded = roundDelta(delta, metric);
  if (rounded === 0) return 'no change';
  return `${rounded > 0 ? 'up' : 'down'} ${spokenMetric(Math.abs(rounded), metric, units)}`;
}

/** A change line, ready to show: the text, what VoiceOver says, and the arrow. */
export type ChangeText = { text: string; spoken: string; direction: Direction };

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The change line for a Key exercises card and the graph readout (one helper for both), from
 * changeSince over the full history. `change` is in stored units (kg for weights); it's converted
 * here. "+5 kg since Oct 1", "No change since Oct 1", "Last logged Aug 20", "First logged Oct 20",
 * "Last e1RM Sep 19", "First e1RM Oct 28", with the year when it isn't this year. Undefined when
 * there's nothing logged.
 */
export function describeChange(change: ChangeSince, metric: Metric, units: UnitSystem, today: ISODate): ChangeText | undefined {
  const date = (d: ISODate) => ({ text: formatMonthDayYear(d, today), spoken: formatLongDateYear(d, today) });
  switch (change.kind) {
    case 'none':
      return undefined;
    case 'last_logged': {
      const d = date(change.date);
      return { text: `Last logged ${d.text}`, spoken: `Last logged ${d.spoken}`, direction: 'none' };
    }
    case 'first_logged': {
      const d = date(change.date);
      return { text: `First logged ${d.text}`, spoken: `First logged ${d.spoken}`, direction: 'none' };
    }
    case 'metric_last':
    case 'metric_first': {
      const d = date(change.date);
      const word = change.kind === 'metric_last' ? 'Last' : 'First';
      return { text: `${word} ${metricPhrase(metric)} ${d.text}`, spoken: `${word} ${spokenMetricPhrase(metric)} on ${d.spoken}`, direction: 'none' };
    }
    case 'change': {
      const d = date(change.since);
      const delta = toDisplay(change.delta, metric, units);
      return {
        text: `${formatMetricDelta(delta, metric, units)} since ${d.text}`,
        spoken: `${capitalize(spokenMetricDelta(delta, metric, units))} since ${d.spoken}`,
        direction: deltaDirection(delta, metric),
      };
    }
  }
}

/** Room above and below a flat line: 5% of its value, but at least this many display units. */
const FLAT_PAD = 2;

/**
 * Y-axis ticks for values in display units, at the metric's precision, so labels from
 * formatMetric(tick, metric, units, false) never repeat and always match their gridline. A flat
 * line gets whole-unit room around it (never "0.1" steps), and doesn't cross zero: a bodyweight
 * lift always done at bodyweight reads 0 to +2, never an assistance tick nobody logged.
 */
export function valueTicks(values: readonly number[], metric: ShownMetric, count = 4): number[] {
  if (!values.length) return [];
  let min = Math.min(...values);
  let max = Math.max(...values);
  const decimals = metricDecimals(metric, Math.max(Math.abs(min), Math.abs(max)));
  if (max - min < 1e-9) {
    const pad = Math.max(Math.abs(min) * 0.05, FLAT_PAD);
    if (min >= 0) {
      min = Math.max(0, min - pad);
      max += pad;
    } else {
      min -= pad;
      max = Math.min(0, max + pad);
    }
    return niceTicks(min, max, Math.max(2, Math.floor(count / 2)), decimals);
  }
  return niceTicks(min, max, count, decimals);
}

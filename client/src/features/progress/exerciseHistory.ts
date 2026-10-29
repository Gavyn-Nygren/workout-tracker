// An exercise's history screen (spec 2.10, G3.11), pure and unit-tested (tests/exerciseHistory.test.ts).
//
// - Records come from records.ts, worked out from this exercise's own workouts, with a reopened
//   workout counted as it was before the reopen (data/reopen.ts), like the graphs.
// - The card lists the spec's records (heaviest weight, e1RM, best session volume, longest hold) plus
//   Most reps (at the heaviest weight). A session gets a star only for a record the card lists: a
//   most-reps record counts only at the heaviest weight lifted so far (that session included), so
//   beating your reps at a lighter back-off weight earns no star here (the workout summary still
//   lists it). Like every star, it stays after a later record beats it.
// - A session is listed when it has a completed working set of the exercise (what the graphs and
//   "All exercises" count), and shows every completed set: warm-ups dimmed with "w", and small
//   markers for drop sets ("d"), partial-rep sets ("p"), and AMRAP sets ("+").
// - Every session gets a best-set line: the top set (added weight for bodyweight lifts), or the
//   longest hold.
// - e1RM and volume read as whole numbers, like the graphs; weights as logged (one decimal).
import { countsForPRs, isPartialRepSet, isWorkingSet, recordLoadKg, signedAddedKg, usesBodyweight } from '@/data/calculations';
import { asBeforeReopen } from '@/data/reopen';
import { derivePersonalRecords, deriveRecordBests, exerciseBests, type RecordBest } from '@/data/records';
import type { Exercise, ISODate, LoggedSet, PRType, UnitSystem } from '@/data/types';
import { bestSet } from '@/features/summary/summarize';
import { spokenDuration } from '@/hooks/useNow';
import {
  formatAddedLoad,
  formatLoad,
  formatLoadValue,
  formatLongDateYear,
  formatMonthDayYear,
  formatMonthYear,
  formatShortDateYear,
  plural,
  spokenAddedLoad,
  spokenLoad,
} from '@/lib/format';
import { formatMetric, spokenMetric } from './progressFormat';
import { hasWorkingSet, toDisplay, type ExerciseLog } from './series';

/** The records card's rows, in order (spec 2.10's four, plus Most reps). */
export const RECORD_ROWS: readonly { type: PRType; label: string; spoken: string }[] = [
  { type: 'heaviest_weight', label: 'Heaviest weight', spoken: 'Heaviest weight' },
  { type: 'reps_at_weight', label: 'Most reps', spoken: 'Most reps' },
  { type: 'e1rm', label: 'Est. 1RM', spoken: 'Estimated one-rep max' },
  { type: 'volume', label: 'Best session volume', spoken: 'Best session volume' },
  { type: 'longest_hold', label: 'Longest hold', spoken: 'Longest hold' },
];

const LISTED = new Set<PRType>(RECORD_ROWS.map((r) => r.type));
const ROW_ORDER = new Map<PRType, number>(RECORD_ROWS.map((r, i) => [r.type, i]));

/** A record a workout set, as its star says: the type, and for most reps the weight it was at. */
export type SessionRecord = { type: PRType; atLoadKg?: number; addedLoad?: boolean };

export type ExerciseRecords = {
  /** The all-time best of each type (records.ts exerciseBests), including never-beaten baselines. */
  bests: Partial<Record<PRType, RecordBest>>;
  /** The listed records each workout set (beat an earlier best), by session id, in card order. */
  bySession: ReadonlyMap<string, SessionRecord[]>;
};

/** Loads closer than this are the same weight (records.ts groups loads to 0.05 kg). */
const SAME_LOAD_KG = 0.05;

/**
 * The heaviest weight lifted up to and including each workout, by session id, read the way records
 * compare it: added weight and total load kept apart (records.ts recordKey).
 */
function heaviestSoFar(logs: readonly ExerciseLog[], exercise: Exercise): Map<string, { added?: number; total?: number }> {
  const out = new Map<string, { added?: number; total?: number }>();
  const top: { added?: number; total?: number } = {};
  for (const log of logs) {
    for (const set of log.sets) {
      if (set.kind === 'timed_hold' || !countsForPRs(set) || !set.reps) continue;
      const load = recordLoadKg(set, exercise);
      if (!load) continue;
      const key = load.added ? 'added' : 'total';
      if (top[key] === undefined || load.kg > top[key]) top[key] = load.kg;
    }
    out.set(log.session.id, { ...top });
  }
  return out;
}

/**
 * An exercise's bests and which of its workouts set a record, from its logs (series.ts
 * exerciseLogs). Only this exercise's workouts are read, and records are per exercise, so the
 * result is the same as records.ts over every workout. Reopened workouts count as they were.
 */
export function exerciseRecords(logs: readonly ExerciseLog[], exercise: Exercise): ExerciseRecords {
  const sessions = logs.map((log) => asBeforeReopen(log.session));
  const only = new Map([[exercise.id, exercise]]);
  const bests = exerciseBests(deriveRecordBests(sessions, only), exercise);
  const heaviest = heaviestSoFar(logs, exercise);
  const bySession = new Map<string, SessionRecord[]>();
  for (const record of derivePersonalRecords(sessions, only)) {
    if (record.exerciseId !== exercise.id || !LISTED.has(record.type)) continue;
    const entry: SessionRecord = { type: record.type };
    if (record.type === 'reps_at_weight') {
      // Most reps is listed at the heaviest weight: a record at a lighter weight isn't on the card.
      const top = heaviest.get(record.sessionId)?.[record.addedLoad ? 'added' : 'total'];
      const at = record.atLoadKg ?? 0;
      if (top === undefined || at < top - SAME_LOAD_KG - 1e-9) continue;
      entry.atLoadKg = at;
      if (record.addedLoad) entry.addedLoad = true;
    }
    const list = bySession.get(record.sessionId);
    const same = list?.find((r) => r.type === record.type);
    if (!list) bySession.set(record.sessionId, [entry]);
    else if (!same) list.push(entry);
    else if ((entry.atLoadKg ?? 0) > (same.atLoadKg ?? 0)) Object.assign(same, entry);
  }
  for (const list of bySession.values()) list.sort((a, b) => (ROW_ORDER.get(a.type) ?? 0) - (ROW_ORDER.get(b.type) ?? 0));
  return { bests, bySession };
}

export type RecordRow = {
  type: PRType;
  label: string;
  value: string;
  date: ISODate;
  dateText: string;
  /** The whole row for VoiceOver: "Heaviest weight: 140 kilograms, Tuesday, October 20". */
  accessibilityLabel: string;
};

/** A record's value: "140 kg", "+20 lb", "8 reps at 100 kg", "117 kg" (e1RM, whole), "75 s". */
export function recordValue(best: RecordBest, units: UnitSystem): { text: string; spoken: string } {
  const load = (kg: number, bodyweightWord?: string) =>
    best.addedLoad ? { text: formatAddedLoad(kg, units, bodyweightWord), spoken: spokenAddedLoad(kg, units) } : { text: formatLoad(kg, units), spoken: spokenLoad(kg, units) };
  switch (best.type) {
    case 'longest_hold':
      return { text: `${best.value} s`, spoken: spokenDuration(best.value) };
    case 'reps_at_weight': {
      const at = load(best.atLoadKg ?? 0, 'bodyweight');
      return { text: `${plural(best.value, 'rep')} at ${at.text}`, spoken: `${plural(best.value, 'rep')} at ${at.spoken}` };
    }
    case 'heaviest_weight':
      return load(best.value);
    case 'e1rm':
    case 'volume': {
      const shown = toDisplay(best.value, best.type, units);
      return { text: formatMetric(shown, best.type, units), spoken: spokenMetric(shown, best.type, units) };
    }
  }
}

/** The records card's rows that have a value, in card order. */
export function recordRows(bests: ExerciseRecords['bests'], units: UnitSystem, today: ISODate): RecordRow[] {
  return RECORD_ROWS.flatMap((row) => {
    const best = bests[row.type];
    if (!best) return [];
    const value = recordValue(best, units);
    return [
      {
        type: row.type,
        label: row.label,
        value: value.text,
        date: best.achievedDate,
        dateText: formatMonthDayYear(best.achievedDate, today),
        accessibilityLabel: `${row.spoken}: ${value.spoken}, ${formatLongDateYear(best.achievedDate, today)}`,
      },
    ];
  });
}

/** Set markers, in the order they're shown after a set. */
export type SetMark = 'warmup' | 'drop' | 'partial' | 'amrap';

export const MARKS: Record<SetMark, { short: string; legend: string; spoken: string }> = {
  warmup: { short: 'w', legend: 'warm-up', spoken: 'warm-up' },
  drop: { short: 'd', legend: 'drop set', spoken: 'drop set' },
  partial: { short: 'p', legend: 'partial reps', spoken: 'partial reps' },
  amrap: { short: '+', legend: 'AMRAP', spoken: 'AMRAP' },
};
const MARK_ORDER: SetMark[] = ['warmup', 'drop', 'partial', 'amrap'];

export function setMarks(set: LoggedSet): SetMark[] {
  const marks: SetMark[] = [];
  if (set.kind === 'warmup') marks.push('warmup');
  if (set.kind === 'drop') marks.push('drop');
  if (isPartialRepSet(set)) marks.push('partial');
  if (set.modifiers.includes('amrap')) marks.push('amrap');
  return marks;
}

export type HistorySet = {
  /** "100×5", "+20×8", "BW×10", "−20×6", "45 s". */
  text: string;
  /** The markers after it: "w", "d", "p", "+" (e.g. "d+"). Empty for a plain working set. */
  mark: string;
  /** Shown dimmed. */
  warmup: boolean;
  /** "warm-up, 60 kilograms for 5 reps", "bodyweight plus 20 pounds for 8 reps", "45 seconds hold". */
  spoken: string;
};

/** One set as History lists it. Bodyweight sets show what was added ("+20", "−20" assistance, "BW"). */
export function historySet(set: LoggedSet, exercise: Pick<Exercise, 'isBodyweight'>, units: UnitSystem): HistorySet {
  const marks = setMarks(set);
  const mark = marks.map((m) => MARKS[m].short).join('');
  const kinds = marks.map((m) => MARKS[m].spoken);
  if (set.kind === 'timed_hold') {
    const seconds = set.durationSec ?? 0;
    return { text: `${seconds} s`, mark, warmup: false, spoken: [...kinds, `${spokenDuration(seconds)} hold`].join(', ') };
  }
  const reps = set.reps ?? 0;
  let load: string;
  let spokenWeight: string;
  if (usesBodyweight(set, exercise)) {
    const added = signedAddedKg(set);
    const shown = formatLoadValue(Math.abs(added), units);
    load = shown === '0' ? 'BW' : `${added > 0 ? '+' : '−'}${shown}`;
    spokenWeight = spokenAddedLoad(added, units);
  } else {
    load = formatLoadValue(set.loadKg ?? 0, units);
    spokenWeight = spokenLoad(set.loadKg ?? 0, units);
  }
  return { text: `${load}×${reps}`, mark, warmup: set.kind === 'warmup', spoken: [...kinds, `${spokenWeight} for ${plural(reps, 'rep')}`].join(', ') };
}

/** Sets for VoiceOver, with repeats read once with a count: "warm-up, 60 kilograms for 5 reps; 3 sets of 100 kilograms for 5 reps". */
export function spokenSets(sets: readonly HistorySet[]): string {
  const groups: { text: string; count: number }[] = [];
  for (const { spoken } of sets) {
    const last = groups[groups.length - 1];
    if (last?.text === spoken) last.count += 1;
    else groups.push({ text: spoken, count: 1 });
  }
  return groups.map((g) => (g.count > 1 ? `${g.count} sets of ${g.text}` : g.text)).join('; ');
}

/**
 * A session's best-set line, as the workout summary picks it (summarize.ts bestSet): "Top set 100 kg
 * × 5", "Top set +20 lb × 8", "Top set bodyweight × 12", "Longest hold 75 s".
 */
export function bestSetLine(sets: readonly LoggedSet[], exercise: Exercise, units: UnitSystem): { text: string; spoken: string } | undefined {
  const best = bestSet({ sets: [...sets] }, exercise);
  if (!best) return undefined;
  switch (best.kind) {
    case 'hold':
      return { text: `Longest hold ${best.seconds} s`, spoken: `Longest hold ${spokenDuration(best.seconds)}` };
    case 'bodyweight':
      return {
        text: `Top set ${formatAddedLoad(best.addedKg, units, 'bodyweight')} × ${best.reps}`,
        spoken: `Top set ${spokenAddedLoad(best.addedKg, units)} for ${plural(best.reps, 'rep')}`,
      };
    case 'load':
      return { text: `Top set ${formatLoad(best.loadKg, units)} × ${best.reps}`, spoken: `Top set ${spokenLoad(best.loadKg, units)} for ${plural(best.reps, 'rep')}` };
  }
}

export type HistorySession = {
  sessionId: string;
  date: ISODate;
  /** "Tue, Oct 20 · Push Day" (the year added when it isn't this year). */
  title: string;
  /** Every completed set of the exercise, in the order logged. */
  sets: HistorySet[];
  best?: string;
  /** Listed record types it set, in card order; a star when there are any. */
  records: PRType[];
  accessibilityLabel: string;
};

const RECORD_SPOKEN = new Map<PRType, string>(RECORD_ROWS.map((r) => [r.type, r.spoken.toLowerCase()]));

/** A star's record for VoiceOver: "estimated one-rep max", "most reps at 100 kilograms". */
function spokenRecord(record: SessionRecord, units: UnitSystem): string {
  const name = RECORD_SPOKEN.get(record.type) ?? record.type;
  if (record.type !== 'reps_at_weight' || record.atLoadKg === undefined) return name;
  return `${name} at ${record.addedLoad ? spokenAddedLoad(record.atLoadKg, units) : spokenLoad(record.atLoadKg, units)}`;
}

const listOf = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : (items[0] ?? ''));

/**
 * The sessions History lists, newest first: each finished workout (a reopened one as it was) with a
 * completed working set of the exercise, with every completed set in it.
 */
export function historySessions(
  logs: readonly ExerciseLog[],
  exercise: Exercise,
  units: UnitSystem,
  today: ISODate,
  recordsBySession: ReadonlyMap<string, readonly SessionRecord[]> = new Map(),
): HistorySession[] {
  const out: HistorySession[] = [];
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i];
    if (!hasWorkingSet(log)) continue;
    const sets = log.sets.map((s) => historySet(s, exercise, units));
    const working = log.sets.filter(isWorkingSet).length;
    const warmups = log.sets.length - working;
    const best = bestSetLine(log.sets, exercise, units);
    const starred = recordsBySession.get(log.session.id) ?? [];
    const records = starred.map((r) => r.type);
    const name = log.session.name;
    const recordText = starred.length ? `, ${starred.length > 1 ? 'personal records' : 'personal record'}: ${listOf(starred.map((r) => spokenRecord(r, units)))}` : '';
    const counts = `${plural(working, 'set')}${warmups ? ` and ${plural(warmups, 'warm-up')}` : ''}`;
    out.push({
      sessionId: log.session.id,
      date: log.date,
      title: `${formatShortDateYear(log.date, today)} · ${name}`,
      sets,
      best: best?.text,
      records,
      accessibilityLabel: `${formatLongDateYear(log.date, today)}, ${name}${recordText}. ${counts}: ${spokenSets(sets)}.${best ? ` ${best.spoken}.` : ''}`,
    });
  }
  return out;
}

export type HistoryMonth = { key: string; title: string; data: HistorySession[] };

/** Sessions (newest first) grouped by month: "October 2026". */
export function historyMonths(sessions: readonly HistorySession[]): HistoryMonth[] {
  const months: HistoryMonth[] = [];
  for (const session of sessions) {
    const key = session.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last?.key === key) last.data.push(session);
    else months.push({ key, title: formatMonthYear(`${key}-01`), data: [session] });
  }
  return months;
}

/** The markers used anywhere in the list, for its key: "w warm-up · d drop set · + AMRAP". Undefined when none. */
export function markLegend(logs: readonly ExerciseLog[]): string | undefined {
  const used = new Set<SetMark>();
  for (const log of logs) {
    if (!hasWorkingSet(log)) continue;
    for (const set of log.sets) for (const mark of setMarks(set)) used.add(mark);
  }
  const items = MARK_ORDER.filter((m) => used.has(m)).map((m) => `${MARKS[m].short} ${MARKS[m].legend}`);
  return items.length ? items.join(' · ') : undefined;
}

/** Whether any completed partial-rep set was logged, so the records card explains they don't count. */
export function hasPartialRepSets(logs: readonly ExerciseLog[]): boolean {
  return logs.some((log) => log.sets.some((s) => isWorkingSet(s) && isPartialRepSet(s)));
}

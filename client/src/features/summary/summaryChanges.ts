// The summary's changes since last time, ready to show. Pure and unit-tested (tests/stats.test.ts).
// A change is read as it's shown, in the user's unit, so one that shows as 0 gets no arrow and
// never reads "+0 lb" or "−0 kg" (Progress does the same).
import type { UnitSystem } from '@/data/types';
import { spokenDuration } from '@/hooks/useNow';
import { formatSigned, formatSignedLoad, showsAsZero, spokenLoad } from '@/lib/format';
import type { ExerciseSummary } from './summarize';

export type ChangeDirection = 'up' | 'down' | 'same';

/** A change line: the text, which way it goes as shown, and what VoiceOver says ("up 5 pounds", "no change"). */
export type ShownChange = { text: string; direction: ChangeDirection; spoken: string };

const spokenAs = (direction: ChangeDirection, size: string) => (direction === 'same' ? 'no change' : `${direction} ${size}`);

/** A change in load: "+2.5 kg", "−5 lb", or "±0 kg" when it shows as 0. */
export function loadChange(kg: number, units: UnitSystem): ShownChange {
  const direction: ChangeDirection = showsAsZero(kg, units) ? 'same' : kg > 0 ? 'up' : 'down';
  return { text: formatSignedLoad(kg, units), direction, spoken: spokenAs(direction, spokenLoad(Math.abs(kg), units)) };
}

/** A change in hold time, in whole seconds: "+15 s". */
export function holdChange(seconds: number): ShownChange {
  const rounded = Math.round(seconds);
  const direction: ChangeDirection = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'same';
  return { text: formatSigned(seconds, 's'), direction, spoken: spokenAs(direction, spokenDuration(Math.abs(rounded))) };
}

/** An exercise's change in its best set since last time, or undefined when there's none to show. */
export function exerciseChange(e: Pick<ExerciseSummary, 'delta'>, units: UnitSystem): ShownChange | undefined {
  if (!e.delta) return undefined;
  const change = e.delta.kind === 'hold' ? holdChange(e.delta.amount) : loadChange(e.delta.amount, units);
  return change.direction === 'same' ? undefined : change;
}

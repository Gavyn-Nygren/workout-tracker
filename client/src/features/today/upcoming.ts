import type { ISODate } from '@/data/types';
import type { Agenda, DayItem } from './agenda';

/**
 * The next few planned workouts after the selected day, for Coming up and a rest day's "Next up".
 * From a past day, today's come first: they're still to do.
 */
export function upcoming(agenda: Agenda, selected: ISODate, today: ISODate, limit: number): DayItem[] {
  return [...agenda.entries()]
    .filter(([date]) => date > selected && date >= today)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, items]) => items.filter((i) => i.status === 'planned'))
    .slice(0, limit);
}

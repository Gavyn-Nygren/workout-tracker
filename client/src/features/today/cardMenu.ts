import type { ID, ISODate, Plan } from '@/data/types';
import type { DayItem } from './agenda';

/**
 * What a Today card's ⋯ menu offers (user's pick): skip a planned or missed workout, or undo a
 * skip. Unskipping frees the day, so it isn't offered when the plan wouldn't put the workout back:
 * a deleted plan (none at all), or a paused or archived one from today on, since pausing clears
 * its upcoming workouts.
 */
export function cardMenu(
  item: Pick<DayItem, 'status' | 'occurrence' | 'date'>,
  planStatus: ReadonlyMap<ID, Plan['status']>,
  today: ISODate,
): 'skip' | 'unskip' | undefined {
  const status = item.occurrence && planStatus.get(item.occurrence.planId);
  if (!status) return undefined;
  if (item.status === 'planned' || item.status === 'missed') return 'skip';
  if (item.status === 'skipped' && (status === 'active' || item.date < today)) return 'unskip';
  return undefined;
}

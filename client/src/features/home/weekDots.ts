// The week's day dots and target caption, shared by Home's weekly snapshot and the "Your week"
// summary (G3.12). Pure, so Node tests can reach them.
import type { StreakTargetSource } from '@/data/types';
import type { DayItem } from '../today/agenda';

export type DayStatus = 'done' | 'partial' | 'missed' | 'planned' | 'rest';

/** What VoiceOver says for a day's dot ("Tuesday missed"). Rest days aren't read. */
export const DAY_WORDS: Record<Exclude<DayStatus, 'rest'>, string> = { done: 'done', partial: 'partly done', missed: 'missed', planned: 'planned' };

/** One dot per day: done beats partial beats missed beats planned. */
export function dayStatus(items: readonly Pick<DayItem, 'status'>[]): DayStatus {
  if (items.some((x) => x.status === 'completed')) return 'done';
  if (items.some((x) => x.status === 'partial')) return 'partial';
  if (items.some((x) => x.status === 'missed')) return 'missed';
  if (items.some((x) => x.status === 'planned' || x.status === 'in_progress')) return 'planned';
  return 'rest';
}

/**
 * Where a week's target comes from, since it can change week to week (G3.10). `thisWeek` words it
 * for the week in progress ("3 planned this week"); otherwise for a past one ("3 planned that week").
 */
export function targetCaption(week: { source: StreakTargetSource; target: number; planned: number }, o: { thisWeek: boolean }): string {
  const which = o.thisWeek ? 'this week' : 'that week';
  switch (week.source) {
    case 'goal':
      return `Weekly goal: ${week.target}`;
    case 'plan':
      return `${week.planned} planned ${which}`;
    case 'minimum':
      return `Nothing planned ${which}`;
    // Only weeks that ended before G3.10.
    case 'legacy':
      return `Weekly target: ${week.target}`;
  }
}

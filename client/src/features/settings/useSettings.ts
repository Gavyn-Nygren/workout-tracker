import { usePreferences, useSavePreferences } from '@/data/hooks';
import { defaultPreferences } from '@/data/preferences';
import type { Preferences } from '@/data/types';

/**
 * Current preferences plus an `update` that merges and saves (optimistically). Until the saved
 * preferences load, the defaults show and `update` does nothing, so a tap can't overwrite them.
 */
export function useSettings() {
  const query = usePreferences();
  const preferences = query.data ?? defaultPreferences;
  const save = useSavePreferences();
  const update = (patch: Partial<Preferences> | ((p: Preferences) => Preferences)) => {
    if (!query.data) return;
    save.mutate(typeof patch === 'function' ? patch(query.data) : { ...query.data, ...patch });
  };
  return { preferences, update, isLoading: query.isLoading, error: query.error, retry: query.refetch };
}

/** "17:00" ↔ Date (today at that time), for the time pickers. */
export function timeToDate(time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}
export function dateToTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
/** "5:00 PM" */
export function formatTime(time: string): string {
  return timeToDate(time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

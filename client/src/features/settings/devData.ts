/** What a developer data swap did. */
export type DataSwapResult = 'workout-open' | 'cancelled' | 'done' | 'failed';

/**
 * Profile → Developer's Load sample data and Erase all data replace the whole database. An open
 * workout would keep autosaving into the new data and bring itself back, so neither runs (or asks)
 * until it's finished or discarded. A swap that fails is reported, never thrown.
 */
export async function swapData(steps: { workoutOpen: boolean; confirm: () => Promise<boolean>; swap: () => Promise<void> }): Promise<DataSwapResult> {
  if (steps.workoutOpen) return 'workout-open';
  if (!(await steps.confirm())) return 'cancelled';
  try {
    await steps.swap();
    return 'done';
  } catch {
    return 'failed';
  }
}

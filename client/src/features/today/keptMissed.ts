import { createLocalStore } from '@/lib/localStore';
import type { DismissedMiss } from './missed';

/**
 * Missed workouts kept on their dates with "Keep schedule", remembered across restarts. Today's
 * banner reads and writes it (MissedBanner.tsx), and the notification sync reads it so a kept miss
 * gets no missed-workout prompt. Old entries are pruned when read (pruneDismissed in missed.ts).
 */
export const keptMissedStore = createLocalStore<DismissedMiss[]>('today.keptMissed', []);

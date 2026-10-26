import { createLocalStore } from '@/lib/localStore';

/**
 * Whether the app has already asked for bodyweight (spec 2.6: it asks once, when a bodyweight
 * exercise is first logged without a weigh-in). Kept on the phone.
 */
export const bodyweightPromptStore = createLocalStore<boolean>('bodyweightPromptShown', false);

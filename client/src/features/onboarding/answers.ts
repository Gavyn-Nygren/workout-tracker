import type { OnboardingAnswers } from '@/data/types';
import { createLocalStore } from '@/lib/localStore';

/**
 * Onboarding's answers, kept on the phone (spec 2.4). A missing matching answer (experience,
 * goal, equipment, days) means it was skipped, so the fallback answers nothing. Only screens
 * import this: it pulls in expo-sqlite through localStore, so pure modules (rules.ts,
 * recommend.ts) use the OnboardingAnswers type from data/types.ts instead. Older saved answers
 * still parse, since every new field is optional.
 */
export const onboardingAnswers = createLocalStore<OnboardingAnswers>('onboarding.answers', { limitations: [], limitationNote: '' });

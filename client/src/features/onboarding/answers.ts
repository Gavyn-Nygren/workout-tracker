import type { Equipment, ExperienceLevel } from '@/data/types';
import { createLocalStore } from '@/lib/localStore';
import type { Goal } from './recommend';

export type Answers = {
  experience?: ExperienceLevel;
  goal?: Goal;
  equipment: Equipment[];
  daysPerWeek: number;
  heightIn?: number;
  bodyweightLb?: number;
  limitations: string[];
  limitationNote: string;
};

/** Kept on the phone so recommendations and swap suggestions (later) can use them. */
export const onboardingAnswers = createLocalStore<Answers>('onboarding.answers', { equipment: ['bodyweight'], daysPerWeek: 3, limitations: [], limitationNote: '' });

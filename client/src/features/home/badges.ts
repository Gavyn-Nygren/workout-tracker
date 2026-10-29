import type { SFSymbol } from 'expo-symbols';

import type { BadgeCategory } from '@/data/types';

// The badge catalog, earning, and Next up are in src/data/badges.ts; this is how Home draws them.
export type { NextBadge } from '@/data/badges';

export const BADGE_ICON: Record<BadgeCategory, SFSymbol> = {
  milestone: 'flag.checkered',
  strength: 'dumbbell.fill',
  consistency: 'flame.fill',
  form: 'video.fill',
};

export const BADGE_CATEGORY_LABEL: Record<BadgeCategory, string> = {
  milestone: 'Milestone',
  strength: 'Strength',
  consistency: 'Consistency',
  form: 'Form',
};

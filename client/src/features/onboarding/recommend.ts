import type { Equipment, ExperienceLevel, StarterTemplate, TemplateCategory } from '@/data/types';

export type Goal = 'strength' | 'muscle' | 'athletic' | 'mobility' | 'general';

export type OnboardingAnswers = {
  experience?: ExperienceLevel;
  goal?: Goal;
  equipment: Equipment[];
  daysPerWeek?: number;
};

const GOAL_CATEGORIES: Record<Goal, TemplateCategory[]> = {
  strength: ['powerlifting', 'gym'],
  muscle: ['bodybuilding', 'gym'],
  athletic: ['athletic', 'crossfit'],
  mobility: ['atg', 'bodyweight'],
  general: ['gym', 'bodyweight', 'crossfit'],
};

const GOAL_REASON: Record<Goal, string> = {
  strength: 'Built around getting stronger',
  muscle: 'Built for muscle growth',
  athletic: 'Built for athletic power',
  mobility: 'Full range of motion focus',
  general: 'Good all-round training',
};

const LEVELS: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced'];

export type Recommendation = { template: StarterTemplate; score: number; reasons: string[] };

/**
 * Rule-based matching of onboarding answers to starter templates (spec 2.4: AI recommendations
 * come later). Templates needing equipment the user doesn't have are left out; ready-to-use
 * templates rank above listing-only ones. The full rules table is content work for G3.13.
 */
export function recommendTemplates(templates: StarterTemplate[], answers: OnboardingAnswers, limit = 3): Recommendation[] {
  const have = new Set<Equipment>([...answers.equipment, 'bodyweight']);
  const results: Recommendation[] = [];

  for (const template of templates) {
    const reasons: string[] = [];
    let score = 0;

    const missing = template.equipment.filter((e) => !have.has(e));
    // A template can still work if most of its equipment is available (e.g. no kettlebell).
    if (missing.length > template.equipment.length / 2) continue;
    if (!missing.length) reasons.push(template.equipment.length === 1 && template.equipment[0] === 'bodyweight' ? 'No equipment needed' : 'Matches your equipment');
    else score -= 2;

    if (answers.goal && GOAL_CATEGORIES[answers.goal].includes(template.category)) {
      score += GOAL_CATEGORIES[answers.goal][0] === template.category ? 6 : 4;
      reasons.push(GOAL_REASON[answers.goal]);
    }

    if (answers.experience) {
      const gap = Math.abs(LEVELS.indexOf(answers.experience) - LEVELS.indexOf(template.level));
      score += gap === 0 ? 4 : gap === 1 ? 1 : -3;
      if (gap === 0) reasons.push(`Made for ${answers.experience} lifters`);
    }

    if (answers.daysPerWeek) {
      const diff = Math.abs(template.daysPerWeek - answers.daysPerWeek);
      score += diff === 0 ? 4 : diff === 1 ? 2 : -diff;
      if (diff === 0) reasons.push(`${template.daysPerWeek} days a week, as you planned`);
      else if (diff === 1) reasons.push(`${template.daysPerWeek} days a week`);
    }

    if (template.workouts.length) score += 3;
    results.push({ template, score, reasons });
  }

  // A listing-only template with nothing in its favour isn't worth showing.
  return results
    .filter((r) => r.template.workouts.length || r.reasons.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

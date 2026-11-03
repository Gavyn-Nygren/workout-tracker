import { gearForSchedule, gearList } from '@/data/content/gear';
import type { Equipment, ExperienceLevel, StarterTemplate, TemplateDayOption, TrainingGoal } from '@/data/types';
import { templateDayOptions } from '@/features/plans/planEdits';
import { COPY, EXPERIENCE_LEVELS, GYM_EQUIPMENT, RULES, WEIGHT_EQUIPMENT, type RecommendAnswers, type RecommendHeading } from './rules';

export type { RecommendAnswers, RecommendHeading } from './rules';

/** Kept while the move to TrainingGoal (data/types.ts) lands. */
export type Goal = TrainingGoal;

export type RecommendationPick = {
  template: StarterTemplate;
  /** The day version to start: one of templateDayOptions(template). */
  option: TemplateDayOption;
  score: number;
  /** Check-mark lines, at most 3, in the order goal, days, experience, equipment. */
  reasons: string[];
  /** Info lines shown without a check mark, at most 2: days first, then gear. */
  notes: string[];
};

export type Recommendations = {
  heading: RecommendHeading;
  /** COPY.heading for `heading`. */
  title: string;
  /** The text under the heading: the body for `fit` and `start`, the subtitle for `closest`. */
  subtitle: string;
  /** The goal was answered but no eligible program lists it, so no goal lines are shown. */
  goalFallback: boolean;
  /** Best first, at most `limit`. Empty only when no template is eligible at all. */
  picks: RecommendationPick[];
};

/** `goalRank` is 1 for a secondary-goal match, else 0; after the goal filter every candidate lists the goal. */
type Candidate = RecommendationPick & { index: number; gap: number; goalRank: number };

const WEIGHTS = new Set<Equipment>(WEIGHT_EQUIPMENT);
const levelIndex = (level: ExperienceLevel) => EXPERIENCE_LEVELS.indexOf(level);
const levelsOf = (t: StarterTemplate) => (t.levels.length ? t.levels : [t.level]);

/** The experience gate: beginners only see beginner-suitable programs; others anything starting at or below them. */
function suits(t: StarterTemplate, experience: ExperienceLevel): boolean {
  const levels = levelsOf(t);
  if (experience === 'beginner') return levels.includes('beginner');
  return Math.min(...levels.map(levelIndex)) <= levelIndex(experience);
}

/** The default version (the template's own schedule), as templateDayOptions lists it. */
function defaultOption(t: StarterTemplate, options: TemplateDayOption[]): TemplateDayOption {
  return options.find((o) => o.daysPerWeek === t.daysPerWeek) ?? options[0];
}

/** The version with the most days that still fits, else the smallest. Options are sorted by days. */
function versionFor(options: TemplateDayOption[], days: number): TemplateDayOption {
  const fitting = options.filter((o) => o.daysPerWeek <= days);
  return fitting.length ? fitting[fitting.length - 1] : options[0];
}

/**
 * Onboarding's rule-based picks (spec 2.4; AI help comes later), applying the rules table in
 * rules.ts. A skipped answer (missing, or an empty equipment list) applies no filter, adds no
 * points and shows no line. Each pick carries the day version to start. Templates come in catalog
 * order, the last tie-break.
 */
export function recommendTemplates(templates: readonly StarterTemplate[], answers: RecommendAnswers, limit: number = RULES.limits.picks): Recommendations {
  const { experience, goal } = answers;
  // Continue with no chip selected counts as skipped.
  const equipment = answers.equipment?.length ? answers.equipment : undefined;
  const days = answers.daysPerWeek !== undefined && answers.daysPerWeek >= 1 ? answers.daysPerWeek : undefined;

  if (!experience && !goal && !equipment && days === undefined) {
    const picks = templates.slice(0, Math.max(0, limit)).map((template) => ({ template, option: defaultOption(template, templateDayOptions(template)), score: 0, reasons: [], notes: [] }));
    return { heading: 'start', title: COPY.heading.start, subtitle: COPY.body.start, goalFallback: false, picks };
  }

  // Step 1: who is eligible, in order: equipment, experience, day version, goal.
  const have = equipment && new Set<Equipment>([...equipment, 'bodyweight']);
  let pool: Candidate[] = [];
  templates.forEach((template, index) => {
    if (have && !template.equipment.every((e) => have.has(e))) return;
    if (experience && !suits(template, experience)) return;
    const options = templateDayOptions(template);
    const option = days === undefined ? defaultOption(template, options) : versionFor(options, days);
    const gap = days === undefined ? 0 : option.daysPerWeek - days;
    if (gap >= RULES.daysLeftOutAt) return;
    pool.push({ template, option, index, gap, goalRank: 0, score: 0, reasons: [], notes: [] });
  });

  let goalFallback = false;
  if (goal) {
    const matching = pool.filter((c) => c.template.goals.includes(goal));
    if (matching.length) pool = matching;
    else goalFallback = true;
  }

  // Step 2: score and lines. Check lines in the order goal, days, experience, equipment.
  const home = !!equipment && !equipment.some((e) => GYM_EQUIPMENT.includes(e));
  const listedWeight = !!equipment && equipment.some((e) => WEIGHTS.has(e));
  for (const c of pool) {
    const t = c.template;
    const reasons: string[] = [];
    const notes: string[] = [];
    let score = 0;

    if (goal && !goalFallback) {
      if (t.goals[0] === goal) {
        score += RULES.goal.main;
        reasons.push(COPY.goal.main[goal]);
      } else if (t.goals.includes(goal)) {
        score += RULES.goal.secondary;
        reasons.push(COPY.goal.secondary[goal]);
        c.goalRank = 1;
      }
    }

    if (days !== undefined) {
      const versionDays = c.option.daysPerWeek;
      if (c.gap === 0) {
        score += RULES.days.equal;
        reasons.push(COPY.days.planned(versionDays));
      } else if (c.gap === -1) {
        score += RULES.days.oneFewer;
        reasons.push(COPY.days.fits(versionDays));
      } else if (c.gap < -1) {
        score += RULES.days.twoOrMoreFewer;
        reasons.push(COPY.days.fits(versionDays));
      } else {
        score += RULES.days.oneMore;
        notes.push(COPY.days.needs(versionDays));
      }
    }

    if (experience) {
      const levels = levelsOf(t);
      const above = levelIndex(experience) - Math.max(...levels.map(levelIndex));
      if (t.level === experience) {
        score += RULES.experience.headline;
        reasons.push(COPY.experience.headline[experience]);
      } else if (levels.includes(experience)) {
        score += RULES.experience.inLevels;
        reasons.push(COPY.experience.inLevels[experience]);
      } else if (above === 1) score += RULES.experience.oneAbove;
      else if (above >= 2) score += RULES.experience.twoAbove;
    }

    if (equipment) {
      // Eligibility already made sure the user has every item.
      if (t.equipment.some((e) => WEIGHTS.has(e))) {
        score += RULES.equipment.usesWeights;
        reasons.push(COPY.equipment.usesWeights);
      } else {
        score += listedWeight ? RULES.equipment.noWeightsListedWeight : RULES.equipment.noWeightsNoneListed;
        reasons.push(COPY.equipment.noWeights);
      }
      // The gear of the version this card starts, as its program page shows it: Full-Range
      // Strength on 2 days needs no box.
      const gear = home ? gearForSchedule(t.workouts, c.option.schedule) : [];
      if (gear.length) notes.push(COPY.alsoNeeds(gearList(gear)));
    }

    c.score = score;
    c.reasons = reasons.slice(0, RULES.limits.checkLines);
    c.notes = notes.slice(0, RULES.limits.infoLines);
  }

  // Step 3: order. Score, then main goal before secondary, then the smaller day gap, then catalog order.
  pool.sort((a, b) => b.score - a.score || a.goalRank - b.goalRank || Math.abs(a.gap) - Math.abs(b.gap) || a.index - b.index);
  const picks = pool.slice(0, Math.max(0, limit)).map(({ template, option, score, reasons, notes }) => ({ template, option, score, reasons, notes }));

  const heading: RecommendHeading = goalFallback || !picks[0]?.reasons.length ? 'closest' : 'fit';
  const subtitle = heading === 'fit' ? COPY.body.fit : goalFallback && goal ? COPY.body.goalFallback(goal) : COPY.body.noFit;
  return { heading, title: COPY.heading[heading], subtitle, goalFallback, picks };
}

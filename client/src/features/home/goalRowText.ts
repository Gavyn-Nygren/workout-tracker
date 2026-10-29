// What a goal row on Home says, on screen and to VoiceOver (HomeParts GoalRow). Pure, so it's
// unit-tested in tests/goalRowText.test.ts.
import { goalAwaitsStart, type GoalStatus } from '@/data/goals';
import type { Goal, UnitSystem } from '@/data/types';
import { formatAddedLoad, formatLoad, formatMonthDay, plural, spokenAddedLoad, spokenLoad } from '@/lib/format';

export type GoalTag = { label: string; tone: 'success' | 'warning' | 'neutral'; icon?: 'checkmark' };

/**
 * `spoken` says "of" instead of "/", "estimated one-rep max" instead of "e1RM", and "degrees". With
 * nothing measured yet, it's "Not logged yet · target …" (and "No weigh-in yet", "No recording yet").
 */
function progressText(goal: Goal, p: GoalStatus, units: UnitSystem, spoken = false): string {
  switch (goal.type) {
    case 'lift': {
      // Bodyweight lifts compare what was added to bodyweight ("+20 lb", "Bodyweight").
      const load = (kg: number) => (p.addedLoad ? (spoken ? spokenAddedLoad(kg, units) : formatAddedLoad(kg, units)) : spoken ? spokenLoad(kg, units) : formatLoad(kg, units));
      const target = load(p.target);
      const measure = spoken ? (goal.target.kind === 'e1rm' ? ' estimated one-rep max' : ` for ${plural(goal.target.reps, 'rep')}`) : goal.target.kind === 'e1rm' ? ' e1RM' : ` × ${goal.target.reps}`;
      if (p.current === undefined) return `Not logged yet${spoken ? ',' : ' ·'} target ${target}${measure}`;
      const current = load(p.current);
      // "bodyweight plus 20 pounds of bodyweight plus 45 pounds" doesn't read well: say now and target.
      if (spoken && p.addedLoad) return `Now ${current}, target ${target}${measure}`;
      return `${current}${spoken ? ' of' : ' /'} ${target}${measure}`;
    }
    case 'frequency':
      // With a deadline: the total by then ("14 / 32 workouts"); without: this week.
      if (p.mode === 'total') return `${p.done ?? 0}${spoken ? ' of' : ' /'} ${plural(p.total ?? p.target, 'workout')}`;
      return `${p.done ?? 0} of ${plural(p.target, 'workout')} this week`;
    case 'bodyweight': {
      const weight = (kg: number) => (spoken ? spokenLoad(kg, units) : formatLoad(kg, units));
      return `${p.current !== undefined ? `${weight(p.current)} now` : 'No weigh-in yet'}${spoken ? ',' : ' ·'} target ${weight(p.target)}`;
    }
    case 'form': {
      const degrees = (n: number) => (spoken ? plural(n, 'degree') : `${n}°`);
      return `${p.current !== undefined ? `${degrees(Math.round(p.current))} now` : 'No recording yet'}${spoken ? ',' : ' ·'} target ${degrees(p.target)} ${goal.joint} angle`;
    }
  }
}

/** Reached goals say when (instead of pace); past-deadline goals get a neutral tag, not a warning. */
function goalTag(progress: GoalStatus): GoalTag | undefined {
  if (progress.reached) return { label: progress.reachedDate ? `Reached ${formatMonthDay(progress.reachedDate)}` : 'Reached', tone: 'success', icon: 'checkmark' };
  if (progress.pace === 'on_track') return { label: 'On track', tone: 'success' };
  if (progress.pace === 'behind') return { label: 'Behind pace', tone: 'warning' };
  if (progress.pace === 'past_deadline') return { label: 'Deadline passed', tone: 'neutral' };
  return undefined;
}

/**
 * A goal row's tag (reached, pace, or none), its footnote ("200 lb / 225 lb × 5  ·  12 days left"),
 * and its VoiceOver label. A goal with no start yet has no pace tag and no percent: it says what it's
 * waiting for, and the days left.
 */
export function goalRowText(goal: Goal, progress: GoalStatus, units: UnitSystem): { tag?: GoalTag; meta: string; spoken: string } {
  // Only unreached goals before their deadline have days left.
  const daysLeft = progress.daysLeft !== undefined ? `${plural(progress.daysLeft, 'day')} left` : undefined;
  const tag = goalTag(progress);
  const percent = goalAwaitsStart(goal, progress) ? undefined : `${Math.round(progress.fraction * 100)} percent.`;
  return {
    tag,
    meta: [progressText(goal, progress, units), daysLeft].filter(Boolean).join('  ·  '),
    spoken: [`${goal.title}.`, tag && `${tag.label}.`, percent, [progressText(goal, progress, units, true), daysLeft].filter(Boolean).join(', ')].filter(Boolean).join(' '),
  };
}

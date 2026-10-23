import { countsForPRs, effectiveLoadKg, setE1RM } from '@/data/calculations';
import type { BodyweightEntry, Exercise, FormReport, Goal, ISODate, Joint, StreakState, WorkoutSession } from '@/data/types';

export type GoalProgress = {
  /** 0..1 toward the target. */
  fraction: number;
  /** Raw values in the goal's own unit (kg, degrees, workouts). */
  current?: number;
  start?: number;
  target: number;
  achieved: boolean;
  /** Only for goals with a deadline. */
  pace?: 'on_track' | 'behind';
  daysLeft?: number;
};

const DAY = 86_400_000;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function completedChronological(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessions.filter((s) => s.status === 'completed' && s.completedAt).sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''));
}

/** Best per session for a lift goal: heaviest load at the target reps or more, or best e1RM. */
function liftValues(goal: Extract<Goal, { type: 'lift' }>, sessions: WorkoutSession[], exercise: Exercise | undefined): number[] {
  if (!exercise) return [];
  return completedChronological(sessions)
    .map((s) => {
      let best = 0;
      for (const set of s.blocks.flatMap((b) => b.exercises).filter((e) => e.exerciseId === goal.exerciseId).flatMap((e) => e.sets)) {
        if (!countsForPRs(set) || !set.reps) continue;
        const value = goal.target.kind === 'e1rm' ? (setE1RM(set, exercise) ?? 0) : set.reps >= goal.target.reps ? (effectiveLoadKg(set, exercise) ?? 0) : 0;
        best = Math.max(best, value);
      }
      return best;
    })
    .filter((v) => v > 0);
}

/** Average bottom angle of a joint across a report's trusted reps. */
export function reportAngle(report: FormReport, joint: Joint): number | undefined {
  const values = report.reps.filter((r) => r.confidence === 'high').map((r) => r.angles[joint]?.minDeg).filter((v): v is number => v !== undefined);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
}

function withPace(progress: GoalProgress, goal: Goal, today: ISODate): GoalProgress {
  if (!goal.deadline || progress.achieved) return progress;
  const created = Date.parse(goal.createdAt);
  const deadline = Date.parse(`${goal.deadline}T23:59:59`);
  const now = Date.parse(`${today}T12:00:00`);
  const expected = clamp01((now - created) / Math.max(DAY, deadline - created));
  return {
    ...progress,
    daysLeft: Math.max(0, Math.ceil((deadline - now) / DAY)),
    // A little slack so a single quiet week doesn't flip a goal to "behind".
    pace: progress.fraction >= expected - 0.05 ? 'on_track' : 'behind',
  };
}

/** Progress for each goal type (spec 2.9). Start values come from the goal or the first logged value. */
export function goalProgress(
  goal: Goal,
  input: { sessions: WorkoutSession[]; exercisesById: Map<string, Exercise>; bodyweight: BodyweightEntry[]; formReports: FormReport[]; streak?: StreakState; today: ISODate },
): GoalProgress {
  switch (goal.type) {
    case 'lift': {
      const target = goal.target.loadKg;
      const values = liftValues(goal, input.sessions, input.exercisesById.get(goal.exerciseId));
      const current = values.length ? Math.max(...values) : undefined;
      const start = values[0];
      const fraction = current === undefined ? 0 : start !== undefined && start < target ? clamp01((current - start) / (target - start)) : clamp01(current / target);
      return withPace({ fraction, current, start, target, achieved: (current ?? 0) >= target }, goal, input.today);
    }
    case 'frequency': {
      const done = input.streak?.thisWeekCompleted ?? 0;
      return { fraction: clamp01(done / goal.workoutsPerWeek), current: done, target: goal.workoutsPerWeek, achieved: done >= goal.workoutsPerWeek };
    }
    case 'bodyweight': {
      const latest = [...input.bodyweight].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.weightKg;
      const span = goal.startKg - goal.targetKg;
      const fraction = latest === undefined || span === 0 ? 0 : clamp01((goal.startKg - latest) / span);
      const achieved = latest !== undefined && (span > 0 ? latest <= goal.targetKg : latest >= goal.targetKg);
      return withPace({ fraction, current: latest, start: goal.startKg, target: goal.targetKg, achieved }, goal, input.today);
    }
    case 'form': {
      const reports = input.formReports.filter((r) => r.exerciseId === goal.exerciseId && r.status === 'ready').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const latest = reports.at(-1);
      const current = latest ? reportAngle(latest, goal.joint) : undefined;
      const span = goal.startDeg - goal.targetDeg;
      const fraction = current === undefined || span === 0 ? 0 : clamp01((goal.startDeg - current) / span);
      const achieved = current !== undefined && (span > 0 ? current <= goal.targetDeg : current >= goal.targetDeg);
      return withPace({ fraction, current, start: goal.startDeg, target: goal.targetDeg, achieved }, goal, input.today);
    }
  }
}

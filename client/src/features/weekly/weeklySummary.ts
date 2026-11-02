// "Your week" (G3.12, spec 2.11): one week's workouts against its streak target, volume, working
// sets, PRs, the streak, and form highlights, plus the weekly-summary notification's text. Pure, so
// the notification sync (features/notifications/runSync.ts) and Node tests can use it. Every rule
// comes from the shared calculation modules, so the numbers match Home and the workout summary.
import { countsAsWorkout, sessionVolumeKg } from '@/data/calculations';
import { addDays, daysBetween, isISODate, localDateOf, startOfWeek } from '@/data/dates';
import { formGainDeg, reportAngle } from '@/data/goals';
import { beforeReopens } from '@/data/reopen';
import type {
  Exercise,
  FormReport,
  Goal,
  ID,
  ISODate,
  Joint,
  PersonalRecord,
  Plan,
  ScheduledOccurrence,
  StreakRecord,
  StreakState,
  StreakTargetSource,
  UnitSystem,
  Weekday,
  WorkoutSession,
} from '@/data/types';
import { weekTargetsFromHistory } from '@/data/weekTargets';
import { dayStatus, targetCaption, type DayStatus } from '@/features/home/weekDots';
import { PR_PRIORITY, PR_TITLE, prDetail } from '@/features/home/wins';
import type { LocalTime, SummaryFire, SummaryText } from '@/features/notifications/types';
import { workingSetCounts } from '@/features/summary/summarize';
import { buildAgenda } from '@/features/today/agenda';
import { formatLoad, formatMonthDay, plural } from '@/lib/format';

export type WeeklyStreakStatus = 'met' | 'atRisk' | 'ended' | 'started' | 'none';

/** A ready form recording made that week, with its change against the exercise's previous one. */
export type WeeklyRecording = {
  reportId: ID;
  exerciseId: ID;
  date: ISODate;
  joint: Joint;
  /** Whole degrees better than the previous ready recording (deeper, or higher for the ankle), when 5° or more. */
  gain?: { deg: number; nowDeg: number; beforeDeg: number };
};

export type WeeklySummary = {
  weekStart: ISODate;
  weekEnd: ISODate;
  /** The week is over at `asOf`. */
  ended: boolean;
  /** The week hasn't started at `asOf`. */
  ahead: boolean;
  /** Days left in the week counting asOf's day (7 for a week still ahead, 0 once it's over). */
  daysLeft: number;
  /** Finished workouts that count (at least one completed working set), by completion date. */
  done: number;
  /** The streak's target for the week, where it came from, and the workouts the plans scheduled. */
  target: number;
  source: StreakTargetSource;
  planned: number;
  volumeKg: number;
  workingSets: number;
  prCount: number;
  /** PRs achieved that week, oldest first. */
  records: PersonalRecord[];
  /** Longest-streak records reached that week. They aren't PRs (prCount leaves them out). */
  streakRecords: StreakRecord[];
  streak: {
    status: WeeklyStreakStatus;
    /**
     * The streak the week is about: with the week for 'met' and 'started', the run at stake for
     * 'atRisk', the run that ended for 'ended', 0 for 'none'.
     */
    weeks: number;
    /** Met weeks in a row just before this one. */
    before: number;
    /** Workouts still needed to meet the target (0 once met). */
    left: number;
  };
  form: { reports: number; gains: { exerciseId: ID; reportId: ID; deg: number; joint: Joint }[]; recordings: WeeklyRecording[] };
  /** The counted workouts, in the order they were finished. */
  workouts: { sessionId: ID; date: ISODate; name: string; partial: boolean; pr: boolean; volumeKg: number }[];
  /** Planned workouts that week that weren't done (missed by asOf) or were skipped, by day. */
  missed: { date: ISODate; name: string; skipped: boolean }[];
  /** The week's seven days, first day first, with Home's dot states. */
  days: { date: ISODate; status: DayStatus }[];
};

export type WeeklySummaryInput = {
  /** The week's first day under `weekStartsOn`. */
  weekStart: ISODate;
  weekStartsOn: Weekday;
  /** When the summary is for: decides whether the week is over and which planned workouts were missed. */
  asOf: LocalTime;
  /** Every session (reopened ones count as they were before the reopen). */
  sessions: WorkoutSession[];
  exercisesById: ReadonlyMap<string, Exercise>;
  /** Personal records; only those achieved that week are used. */
  records: PersonalRecord[];
  streak: StreakState;
  /** Stored occurrences covering at least the week. */
  occurrences: ScheduledOccurrence[];
  plans: Plan[];
  planVersions: Plan[];
  formReports: FormReport[];
  goals: Goal[];
};

const byCompletion = (a: WorkoutSession, b: WorkoutSession) => (a.completedAt ?? a.completedDate ?? '').localeCompare(b.completedAt ?? b.completedDate ?? '');

/** Everything "Your week" and the weekly-summary notification show for one week. */
export function buildWeeklySummary(input: WeeklySummaryInput): WeeklySummary {
  const { weekStart, weekStartsOn, asOf } = input;
  const weekEnd = addDays(weekStart, 6);
  const inWeek = (date: ISODate | undefined): date is ISODate => date !== undefined && date >= weekStart && date <= weekEnd;
  const ended = asOf.date > weekEnd;
  const daysLeft = ended ? 0 : daysBetween(asOf.date < weekStart ? weekStart : asOf.date, weekEnd) + 1;

  // A reopened workout counts as it was before the reopen (reopen.ts), here and on the day dots.
  const sessions = beforeReopens(input.sessions);
  const counted = sessions.filter((s) => countsAsWorkout(s) && inWeek(s.completedDate)).sort(byCompletion);

  const records = input.records.filter((r) => inWeek(r.achievedDate)).sort((a, b) => a.achievedDate.localeCompare(b.achievedDate));
  const prSessions = new Set(records.map((r) => r.sessionId));
  const workouts = counted.map((s) => ({
    sessionId: s.id,
    date: s.completedDate!,
    name: s.name,
    partial: s.completion === 'partial',
    pr: prSessions.has(s.id),
    volumeKg: sessionVolumeKg(s, input.exercisesById),
  }));
  const volumeKg = workouts.reduce((sum, w) => sum + w.volumeKg, 0);
  let workingSets = 0;
  for (const s of counted) for (const block of s.blocks) for (const entry of block.exercises) workingSets += workingSetCounts(entry).done;

  // The streak's own target for the week: stored for a finished week, live for this one. A week
  // the streak doesn't list (before the first counted workout, or still ahead) is worked out the
  // same way the repository works out a live week.
  const listed = input.streak.weeks.find((w) => w.weekStart === weekStart);
  const week = listed ?? weekTargetsFromHistory({ goals: input.goals, sessions, occurrences: input.occurrences, weekStartsOn, today: asOf.date })(weekStart);
  const target = Math.max(1, Math.round(week.target));
  const done = counted.length;

  // Met weeks in a row just before this one (the streak lists weeks with no gaps).
  let before = 0;
  let expect = addDays(weekStart, -7);
  for (let i = input.streak.weeks.length - 1; i >= 0; i--) {
    const w = input.streak.weeks[i];
    if (w.weekStart >= weekStart) continue;
    if (w.weekStart !== expect || !w.met) break;
    before++;
    expect = addDays(expect, -7);
  }
  const met = done >= target;
  const status: WeeklyStreakStatus = met ? (before > 0 ? 'met' : 'started') : before === 0 ? 'none' : ended ? 'ended' : 'atRisk';
  const streak = { status, weeks: met ? before + 1 : before, before, left: Math.max(0, target - done) };

  // Day dots and the planned workouts not done, as Today's calendar shows them.
  const occurrences = input.occurrences.filter((o) => inWeek(o.scheduledDate));
  const linked = new Set(occurrences.map((o) => o.sessionId).filter(Boolean));
  const agenda = buildAgenda({
    occurrences,
    sessions: sessions.filter((s) => inWeek(s.completedDate) || linked.has(s.id)),
    plans: input.plans,
    planVersions: input.planVersions,
    today: asOf.date,
  });
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const days = dates.map((date) => ({ date, status: dayStatus(agenda.get(date) ?? []) }));
  const missed = dates.flatMap((date) =>
    (agenda.get(date) ?? []).filter((x) => !x.extra && (x.status === 'missed' || x.status === 'skipped')).map((x) => ({ date, name: x.name, skipped: x.status === 'skipped' })),
  );

  // Ready form recordings that week, each against the exercise's previous ready one (as Recent wins compares them).
  const recordings: WeeklyRecording[] = [];
  const lastByExercise = new Map<ID, FormReport>();
  for (const report of input.formReports.filter((r) => r.status === 'ready').sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const previous = lastByExercise.get(report.exerciseId);
    lastByExercise.set(report.exerciseId, report);
    const date = localDateOf(report.createdAt);
    if (!inWeek(date)) continue;
    const joint = report.primaryJoint;
    const deg = previous ? formGainDeg(previous, report, joint) : undefined;
    const gain =
      previous && deg !== undefined && deg >= 5 ? { deg, nowDeg: Math.round(reportAngle(report, joint)!), beforeDeg: Math.round(reportAngle(previous, joint)!) } : undefined;
    recordings.push({ reportId: report.id, exerciseId: report.exerciseId, date, joint, gain });
  }
  const gains = recordings.flatMap((r) => (r.gain ? [{ exerciseId: r.exerciseId, reportId: r.reportId, deg: r.gain.deg, joint: r.joint }] : []));

  return {
    weekStart,
    weekEnd,
    ended,
    ahead: asOf.date < weekStart,
    daysLeft,
    done,
    target,
    source: week.source,
    planned: week.planned,
    volumeKg,
    workingSets,
    prCount: records.length,
    records,
    streakRecords: input.streak.records.filter((r) => inWeek(r.achievedDate)),
    streak,
    form: { reports: recordings.length, gains, recordings },
    workouts,
    missed,
    days,
  };
}

/**
 * The week a `?week=` link opens, under the current week-start setting: the week sharing the most
 * days with the given one (a summary saved under the other setting moves by a day), or undefined
 * for a missing or malformed value.
 */
export function summaryWeekStart(week: unknown, weekStartsOn: Weekday): ISODate | undefined {
  return isISODate(week) ? startOfWeek(addDays(week, 3), weekStartsOn) : undefined;
}

/** "Oct 26 – Nov 1" */
export function weekRangeText(s: Pick<WeeklySummary, 'weekStart' | 'weekEnd'>): string {
  return `${formatMonthDay(s.weekStart)} – ${formatMonthDay(s.weekEnd)}`;
}

/**
 * The weekly-summary notification (spec 2.11), worded for when it actually fires (`fire.held`):
 * "This week so far" while the week is still on, else "Your week · Oct 26 – Nov 1". A missed target
 * is said plainly, never as a failure (spec 2.13). `weekFullyAhead` is a week that hasn't started
 * yet: its text only claims what's true if nothing is logged, and nothing is sent when nothing is
 * planned. Null (don't send) when nothing was planned, nothing was done, and no streak is at stake.
 */
export function weeklySummaryText(s: WeeklySummary, o: { units: UnitSystem; fire: SummaryFire; weekFullyAhead: boolean }): SummaryText | null {
  const soFar = o.fire.held.date <= s.weekEnd;
  const title = soFar ? 'This week so far' : `Your week · ${weekRangeText(s)}`;
  const planned = soFar ? `${s.planned} planned this week.` : `${s.planned} ${s.planned === 1 ? 'was' : 'were'} planned.`;
  const nothingLogged = soFar ? 'No workouts logged so far.' : 'No workouts logged.';

  if (o.weekFullyAhead) return s.planned > 0 ? { title, body: `${nothingLogged} ${planned}` } : null;

  const { before } = s.streak;
  if (s.done === 0 && s.planned === 0 && before === 0) return null;

  let stats: string;
  if (s.done === 0) stats = s.planned > 0 ? `${nothingLogged} ${planned}` : nothingLogged;
  else {
    // With nothing planned the target is the minimum of 1, so "3 of 1" would read oddly.
    const count = s.source === 'minimum' ? plural(s.done, 'workout') : `${s.done} of ${plural(s.target, 'workout')}`;
    const parts = [`${count}${soFar ? ' so far' : ''}`, s.volumeKg > 0 && formatLoad(s.volumeKg, o.units), s.prCount > 0 && plural(s.prCount, 'PR')];
    stats = `${parts.filter(Boolean).join(' · ')}.`;
  }

  const left = Math.max(0, s.target - s.done);
  let streak = '';
  if (left === 0) streak = before > 0 ? `${before + 1}-week streak.` : 'Week target hit. Streak started.';
  else if (soFar) {
    const daysLeft = daysBetween(o.fire.held.date, s.weekEnd) + 1;
    if (daysLeft <= 1) {
      if (before > 0) streak = left === 1 ? `One more today keeps your ${before}-week streak.` : `Your ${before}-week streak needs ${left} more workouts today.`;
      else if (left === 1) streak = 'One more today starts a streak.';
    } else {
      streak = `${plural(left, 'more workout')} in ${plural(daysLeft, 'day')} to ${before > 0 ? `keep your ${before}-week streak` : 'start a streak'}.`;
    }
  } else if (before > 0) streak = `Your ${before}-week streak ended. Start a new one this week.`;

  return { title, body: streak ? `${stats} ${streak}` : stats };
}

/** The lines on "Your week"'s top card, worded for the screen's moment (the summary's `asOf`). */
export function weekHeroLines(s: WeeklySummary): {
  /** The pill at the top: "WEEK TARGET HIT", "WEEK SO FAR", "WEEK ENDED", "WEEK AHEAD". */
  badge: { text: string; kind: 'met' | 'ongoing' | 'ended' | 'ahead' };
  /** "Oct 26 – Nov 1 · 2 days left" */
  subtitle: string;
  /** The big number by the flame. */
  streakWeeks: number;
  /** One line under it, in Home's words for the week in progress. */
  streakLine: string;
  /** Where the target comes from: "5 planned this week", "Weekly goal: 4". */
  caption: string;
} {
  const met = s.done >= s.target;
  const badge = met
    ? { text: 'WEEK TARGET HIT', kind: 'met' as const }
    : s.ended
      ? { text: 'WEEK ENDED', kind: 'ended' as const }
      : s.ahead
        ? { text: 'WEEK AHEAD', kind: 'ahead' as const }
        : { text: 'WEEK SO FAR', kind: 'ongoing' as const };
  const left = s.ended ? '' : s.daysLeft === 1 ? ' · last day' : ` · ${plural(s.daysLeft, 'day')} left`;
  const { before } = s.streak;

  let streakLine: string;
  if (met) streakLine = before > 0 ? (s.ended ? 'Week target hit. Your streak grew.' : 'Week target hit. Your streak is safe.') : 'Week target hit. A new streak started.';
  else if (!s.ended) streakLine = `${plural(s.streak.left, 'more workout')} in ${plural(s.daysLeft, 'day')} to ${before > 0 ? 'keep your streak' : 'start a streak'}.`;
  else streakLine = before > 0 ? `Your ${before}-week streak ended that week.` : 'Hit a week target to start a streak.';

  return {
    badge,
    subtitle: `${weekRangeText(s)}${left}`,
    // A streak still on counts until the week ends; one that ended shows 0.
    streakWeeks: s.streak.status === 'ended' || s.streak.status === 'none' ? 0 : s.streak.weeks,
    streakLine,
    caption: targetCaption(s, { thisWeek: !s.ended && !s.ahead }),
  };
}

/**
 * The week's PRs as Recent wins shows them (wins.ts): one row per exercise and workout, its most
 * notable record first ("Back Squat · heaviest weight + 1 more"), oldest first.
 */
export function weeklyRecordRows(
  records: PersonalRecord[],
  exercisesById: ReadonlyMap<string, Pick<Exercise, 'name'>>,
  units: UnitSystem,
): { key: string; sessionId: ID; date: ISODate; title: string; detail: string }[] {
  const grouped = new Map<string, PersonalRecord[]>();
  for (const r of records) {
    const key = `${r.sessionId}|${r.exerciseId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), r]);
  }
  return [...grouped]
    .map(([key, group]) => {
      const best = [...group].sort((a, b) => PR_PRIORITY.indexOf(a.type) - PR_PRIORITY.indexOf(b.type))[0];
      const more = group.length > 1 ? ` + ${group.length - 1} more` : '';
      const name = exercisesById.get(best.exerciseId)?.name ?? 'Exercise';
      return { key, sessionId: best.sessionId, date: best.achievedDate, title: `${name} · ${PR_TITLE[best.type]}${more}`, detail: prDetail(best, units) };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

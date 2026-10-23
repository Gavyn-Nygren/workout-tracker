import type { SFSymbol } from 'expo-symbols';

import { addDays } from '@/data/dates';
import type { EarnedBadge, Exercise, FormReport, ISODate, Joint, PersonalRecord, PRType, UnitSystem } from '@/data/types';
import { formatLoad } from '@/lib/format';
import { reportAngle } from './goals';

export type Win = {
  id: string;
  kind: 'pr' | 'form' | 'badge';
  date: ISODate;
  title: string;
  detail: string;
  icon: SFSymbol;
  /** Form wins open their report. */
  reportId?: string;
};

/** Most notable PR type first, so each exercise-and-session shows one line. */
const PR_PRIORITY: PRType[] = ['heaviest_weight', 'e1rm', 'reps_at_weight', 'longest_hold', 'volume'];
const PR_TITLE: Record<PRType, string> = {
  heaviest_weight: 'heaviest weight',
  e1rm: 'est. 1RM',
  reps_at_weight: 'most reps',
  longest_hold: 'longest hold',
  volume: 'exercise volume',
};
const JOINT_LABEL: Record<Joint, string> = { knee: 'knee', hip: 'hip', ankle: 'ankle' };

function prDetail(r: PersonalRecord, units: UnitSystem): string {
  if (r.type === 'reps_at_weight') return `${r.value} reps at ${formatLoad(r.atLoadKg ?? 0, units)}${r.previousValue !== undefined ? ` (was ${r.previousValue})` : ''}`;
  if (r.type === 'longest_hold') return `${r.value} s${r.previousValue !== undefined ? ` (was ${r.previousValue} s)` : ''}`;
  const delta = r.previousValue !== undefined ? r.value - r.previousValue : undefined;
  return `${formatLoad(r.value, units)}${delta && delta > 0.01 ? ` · +${formatLoad(delta, units)}` : ''}`;
}

/**
 * Home's "Recent wins" feed (user's pick: one mixed list): PRs, form improvements of at least 5°
 * versus the previous recording (the spec's "meaningful change" threshold), and badges earned.
 */
export function buildWins(input: {
  records: PersonalRecord[];
  formReports: FormReport[];
  badges: EarnedBadge[];
  exercisesById: Map<string, Exercise>;
  units: UnitSystem;
  today: ISODate;
  days?: number;
  limit?: number;
}): Win[] {
  const since = addDays(input.today, -(input.days ?? 21));
  const name = (id: string) => input.exercisesById.get(id)?.name ?? 'Exercise';
  const wins: Win[] = [];

  const grouped = new Map<string, PersonalRecord[]>();
  for (const r of input.records.filter((r) => r.achievedDate >= since)) {
    const key = `${r.sessionId}|${r.exerciseId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), r]);
  }
  for (const [key, records] of grouped) {
    const best = [...records].sort((a, b) => PR_PRIORITY.indexOf(a.type) - PR_PRIORITY.indexOf(b.type))[0];
    const more = records.length > 1 ? ` + ${records.length - 1} more` : '';
    wins.push({ id: `pr_${key}`, kind: 'pr', date: best.achievedDate, title: `${name(best.exerciseId)} · ${PR_TITLE[best.type]}${more}`, detail: prDetail(best, input.units), icon: 'star.fill' });
  }

  const byExercise = new Map<string, FormReport[]>();
  for (const report of [...input.formReports].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    byExercise.set(report.exerciseId, [...(byExercise.get(report.exerciseId) ?? []), report]);
  }
  for (const reports of byExercise.values()) {
    reports.forEach((report, i) => {
      const previous = reports[i - 1];
      const date = report.createdAt.slice(0, 10);
      if (!previous || date < since) return;
      // Whole degrees, as shown in the report.
      const nowRaw = reportAngle(report, report.primaryJoint);
      const beforeRaw = reportAngle(previous, report.primaryJoint);
      const now = nowRaw === undefined ? undefined : Math.round(nowRaw);
      const before = beforeRaw === undefined ? undefined : Math.round(beforeRaw);
      if (now === undefined || before === undefined || before - now < 5) return;
      wins.push({
        id: `form_${report.id}`,
        kind: 'form',
        date,
        title: `${name(report.exerciseId)} · ${Math.round(before - now)}° deeper`,
        detail: `${JOINT_LABEL[report.primaryJoint]} angle ${Math.round(now)}° vs ${Math.round(before)}° last recording`,
        icon: 'video.fill',
        reportId: report.id,
      });
    });
  }

  for (const badge of input.badges.filter((b) => b.earnedDate >= since)) {
    wins.push({ id: `badge_${badge.id}`, kind: 'badge', date: badge.earnedDate, title: `Earned: ${badge.title}`, detail: badge.description, icon: 'medal.fill' });
  }

  // Form wins and badges are rare, so they always make the cut; minor PRs (extra reps or volume) go first.
  const limit = input.limit ?? 8;
  const minor = (w: Win) => w.kind === 'pr' && /most reps|exercise volume/.test(w.title);
  const byDate = (a: Win, b: Win) => b.date.localeCompare(a.date);
  const keep = [...wins.filter((w) => w.kind !== 'pr'), ...wins.filter((w) => w.kind === 'pr' && !minor(w)).sort(byDate), ...wins.filter(minor).sort(byDate)];
  return keep.slice(0, limit).sort(byDate);
}

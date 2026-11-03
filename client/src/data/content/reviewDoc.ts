import { EQUIPMENT_LABEL, MUSCLE_LABEL } from '@/features/exercises/search';
import { FORM_ANALYSIS_PREVIEW } from '@/features/form/preview';
import { recommendTemplates, type Recommendations } from '@/features/onboarding/recommend';
import { COPY, EXPERIENCE_LEVELS, GOAL_NOUN, GOLDEN_ROWS, REVIEW_PROFILES, TRAINING_GOALS } from '@/features/onboarding/rules';
import { CATEGORY_LABEL, describeProgression, LEVEL_LABEL, templateMeta, workoutStats } from '@/features/plans/describe';
import { isHoldExercise } from '@/features/progress/metrics';
import { formatRepTarget, plural, WEEKDAY_SHORT } from '@/lib/format';
import { roundingIncrementFor } from '../logging';
import { defaultPreferences, defaultRounding } from '../preferences';
import { weekdaysByWorkout, weekPattern } from '../schedule';
import type { Equipment, Exercise, ID, MuscleGroup, PlannedExercise, SetPrescription, StarterTemplate, TemplateDayOption, TrainingGoal, UnitSystem, Weekday } from '../types';
import { BUILTIN_EXERCISES } from './exercises';
import { gearForExercises, gearForSchedule, gearList } from './gear';
import { STARTER_TEMPLATES } from './templates';
import { SETUP_MIN, WORK_SEC_PER_SET } from './templates/helpers';
import { TEMPLATE_REVIEW, type TemplateReviewStatus } from './templates/review';
import { FORM_PREVIEW_LINE, FORM_UNSUPPORTED_BODY, TOUR_CARDS, TOUR_FROM_ONBOARDING, TOUR_PITCH, tourCardText, tourLastButton, tourTodayArt } from './tutorial';

// The owner's review page for the starter content (G3.13): every program in full, the weekly sets
// per muscle, the recommendation outcomes and the tour copy, rendered from the code so it can't
// drift. tests/tools/writeContentReview.ts writes it to CONTENT_REVIEW.md at the repo root, and
// tests/contentReview.test.ts checks the committed file still equals the render. Pure and
// deterministic: no dates, no random ids, so two renders are identical.

/** The exercises G3.13 added to the library, shown for review at the end. Ids are permanent. */
export const G313_LIBRARY_ADDITIONS: readonly ID[] = [
  'ex_bulgarian_split_squat_bw',
  'ex_cossack_squat',
  'ex_deep_squat_hold',
  'ex_burpee',
  'ex_db_thruster',
  'ex_box_jump',
  'ex_broad_jump',
  'ex_lateral_bound',
];

const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];
const MUSCLES = Object.keys(MUSCLE_LABEL) as MuscleGroup[];
const ROUNDED: readonly Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell'];

const STATUS_LABEL: Record<TemplateReviewStatus, string> = {
  draft: 'Draft, not reviewed yet',
  approved: 'Approved',
  changes: 'Changes asked for',
};

const MODIFIER_TEXT: Record<SetPrescription['modifiers'][number], string> = {
  amrap: 'as many reps as you can',
  to_failure: 'to failure',
  shortened_partials: 'short partials',
  lengthened_partials: 'long partials',
};

type Library = ReadonlyMap<ID, Exercise>;

// ---------------------------------------------------------------------------
// Markdown pieces

const capitalize = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);

/** The app's meta separator is two spaces each side; one reads the same in a document. */
const meta = (text: string) => text.replace(/\s+·\s+/g, ' · ');

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function table(head: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]) => `| ${cells.map(cell).join(' | ')} |`;
  return [line(head), `|${head.map(() => '---').join('|')}|`, ...rows.map(line)].join('\n');
}

const bullets = (items: readonly string[]) => items.map((i) => `- ${i}`).join('\n');

/** "a, b and c" */
function sentenceList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Templates

/** A template's day versions, default first and then `otherDays` as listed (templateDayOptions sorts by days). */
const dayVersions = (t: StarterTemplate): TemplateDayOption[] => [{ daysPerWeek: t.daysPerWeek, schedule: t.schedule }, ...(t.otherDays ?? [])];

const versionName = (o: TemplateDayOption, isDefault: boolean, several: boolean) => `${plural(o.daysPerWeek, 'day')} a week${several && isDefault ? ' (default)' : ''}`;

const goalsText = (goals: readonly TrainingGoal[]) => capitalize(goals.map((g, i) => (i === 0 && goals.length > 1 ? `${GOAL_NOUN[g]} (main)` : GOAL_NOUN[g])).join(', '));

const equipmentText = (t: StarterTemplate) => t.equipment.map((e) => EQUIPMENT_LABEL[e]).join(', ');

const alsoNeedsText = (t: StarterTemplate) => (t.alsoNeeds?.length ? gearList(t.alsoNeeds) : 'nothing else');

const lengthText = (t: StarterTemplate) => (t.durationWeeks ? `Fixed, ${t.durationWeeks} weeks` : 'Ongoing (weekly)');

const levelsOf = (t: StarterTemplate) => (t.levels.length ? t.levels : [t.level]);

/** The summary's level: "Beginner only", or "Beginner (beginner to intermediate)". Levels are contiguous (the validator checks). */
function levelSummary(t: StarterTemplate): string {
  const levels = levelsOf(t);
  if (levels.length === 1) return `${LEVEL_LABEL[t.level]} only`;
  return `${LEVEL_LABEL[t.level]} (${LEVEL_LABEL[levels[0]].toLowerCase()} to ${LEVEL_LABEL[levels[levels.length - 1]].toLowerCase()})`;
}

/** In the onboarding cards' words: "Made for beginners. Also suits intermediate lifters." */
const levelLines = (t: StarterTemplate) =>
  [COPY.experience.headline[t.level], ...levelsOf(t).filter((l) => l !== t.level).map((l) => COPY.experience.inLevels[l])].join('. ');

/** "per leg", from the note `ex()` adds to exercises done one side at a time. */
function perSide(notes: string | undefined): string {
  const match = notes && /\b(?:Reps are|Time is) per (leg|arm|side)\./.exec(notes);
  return match ? ` per ${match[1]}` : '';
}

/** Consecutive sets that read the same, so "3 × 8–12" is one group. */
function groupSets(sets: readonly SetPrescription[]): { count: number; set: SetPrescription }[] {
  const key = (s: SetPrescription) => JSON.stringify([s.kind, s.targetReps, s.targetDurationSec, s.targetRir, s.tempo, s.modifiers, s.targetLoadKg, s.restSec]);
  const groups: { count: number; set: SetPrescription; key: string }[] = [];
  for (const set of sets) {
    const last = groups[groups.length - 1];
    if (last && last.key === key(set)) last.count++;
    else groups.push({ count: 1, set, key: key(set) });
  }
  return groups;
}

/** "3 × 8–12 per leg", "2 × 30 s per side", "2 × 12–15, then 1 drop set to failure (about 12 reps)". */
function workingSetsText(planned: PlannedExercise): string {
  const side = perSide(planned.notes);
  const modifiers = (s: SetPrescription) => s.modifiers.map((m) => MODIFIER_TEXT[m]);
  const parts = groupSets(planned.sets.filter((s) => s.kind !== 'warmup')).map(({ count, set }) => {
    const reps = formatRepTarget(set.targetReps);
    switch (set.kind) {
      case 'timed_hold':
        return `${count} × ${set.targetDurationSec ?? 0} s${side}`;
      case 'drop':
        return `${plural(count, 'drop set')}${modifiers(set).map((m) => ` ${m}`).join('')}${reps ? ` (about ${reps} reps)` : ''}`;
      default: {
        const extra = [set.kind === 'assisted' ? 'assisted' : '', ...modifiers(set)].filter(Boolean);
        return `${count} × ${reps || '?'}${side}${extra.length ? `, ${extra.join(', ')}` : ''}`;
      }
    }
  });
  return parts.join(', then ');
}

/** The warm-up sets' reps: "8, 3". */
const warmupsText = (planned: PlannedExercise) =>
  planned.sets
    .filter((s) => s.kind === 'warmup')
    .map((s) => formatRepTarget(s.targetReps) || '?')
    .join(', ');

/** The effort target on the rep sets: "RIR 2", or "No target" (jump, power and weekly-% sets). Holds have none. */
function effortText(planned: PlannedExercise): string {
  const repSets = planned.sets.filter((s) => s.kind === 'normal' || s.kind === 'assisted');
  if (!repSets.length) return '';
  const rirs = [...new Set(repSets.flatMap((s) => (s.targetRir === undefined ? [] : [s.targetRir])))];
  if (!rirs.length) return 'No target';
  const some = repSets.some((s) => s.targetRir === undefined) ? ' (some sets none)' : '';
  return `RIR ${rirs.join(', ')}${some}`;
}

const tempoText = (planned: PlannedExercise) => [...new Set(planned.sets.filter((s) => s.kind !== 'warmup' && s.tempo).map((s) => s.tempo as string))].join(', ');

/** The default rounding step for an exercise's equipment, as a new account has it. */
const stepFor = (exercise: Exercise | undefined, units: UnitSystem) => roundingIncrementFor(exercise?.equipment, { units, roundingIncrements: defaultRounding[units] });

/**
 * The rule as the plan workout's label reads it (describeProgression, whose step comes from
 * shownIncrement with the equipment's default rounding), in lb and kg: "+5 lb / +2 kg at top of
 * range · deload 10% after 3 misses". A weekly % adds at least one rounding step.
 */
function progressionText(planned: PlannedExercise, exercise: Exercise | undefined): string {
  const rule = planned.progression;
  if (!rule) return 'None';
  const lbStep = stepFor(exercise, 'imperial');
  const kgStep = stepFor(exercise, 'metric');
  const lb = describeProgression(rule, 'imperial', planned.sets, exercise, lbStep);
  const kg = describeProgression(rule, 'metric', planned.sets, exercise, kgStep);
  if (rule.type === 'percent_weekly') {
    if (lb !== kg) return `${lb}; in kg: ${kg}`;
    const [rise, ...miss] = lb.split(' · ');
    return [`${rise}, at least +${lbStep} lb / +${kgStep} kg`, ...miss].join(' · ');
  }
  const inLb = /^(\S+ lb) (.+)$/.exec(lb);
  const inKg = /^(\S+ kg) (.+)$/.exec(kg);
  return inLb && inKg && inLb[2] === inKg[2] ? `${inLb[1]} / ${inKg[1]} ${inLb[2]}` : `${lb}; in kg: ${kg}`;
}

/** Each exercise's working sets that count for its primary muscles: every set but warm-ups. */
const countedSets = (planned: PlannedExercise) => planned.sets.filter((s) => s.kind !== 'warmup').length;

type WeekStats = { minutes: number; sets: number; muscles: Map<MuscleGroup, { sets: number; days: Set<Weekday> }> };

/** One version's week (fixed programs repeat week 1): minutes, working sets, and sets and days per primary muscle. */
function weekStats(t: StarterTemplate, option: TemplateDayOption, library: Library): WeekStats {
  const pattern = weekPattern(option.schedule);
  const workouts = new Map(t.workouts.map((w) => [w.id, w]));
  const stats: WeekStats = { minutes: 0, sets: 0, muscles: new Map() };
  for (const day of WEEKDAYS) {
    for (const id of pattern[day]) {
      const w = workouts.get(id);
      if (!w) continue;
      stats.minutes += w.estimatedMinutes ?? 0;
      for (const planned of w.blocks.flatMap((b) => b.exercises)) {
        const n = countedSets(planned);
        stats.sets += n;
        for (const m of library.get(planned.exerciseId)?.primaryMuscles ?? []) {
          const entry = stats.muscles.get(m) ?? { sets: 0, days: new Set<Weekday>() };
          entry.sets += n;
          if (n > 0) entry.days.add(day);
          stats.muscles.set(m, entry);
        }
      }
    }
  }
  return stats;
}

function weekTable(t: StarterTemplate, option: TemplateDayOption): string {
  const names = new Map(t.workouts.map((w) => [w.id, w.name]));
  const pattern = weekPattern(option.schedule);
  return table(
    WEEKDAYS.map((d) => WEEKDAY_SHORT[d]),
    [WEEKDAYS.map((d) => (pattern[d].length ? pattern[d].map((id) => names.get(id) ?? id).join(' + ') : 'Rest'))],
  );
}

function versionsSection(t: StarterTemplate, library: Library): string[] {
  const options = dayVersions(t);
  const several = options.length > 1;
  const out: string[] = [several ? '#### Day versions' : '#### Week'];
  options.forEach((o, i) => {
    const kind = o.schedule.type === 'fixed' ? `Fixed: weeks 1 to ${o.schedule.weeks} all repeat this week.` : 'Weekly, ongoing.';
    // A version that drops a workout can need less gear; the program page and onboarding say so.
    const gear = gearForSchedule(t.workouts, o.schedule);
    const lessGear = gearList(gear) !== gearList(t.alsoNeeds ?? []) ? ` Also needs, in this version: ${gearList(gear) || 'nothing else'}.` : '';
    out.push(`**${versionName(o, i === 0, several)}**. ${kind} Card and page: ${meta(templateMeta(t, o))}.${lessGear}`, weekTable(t, o));
  });

  const stats = options.map((o) => weekStats(t, o, library));
  const head = ['Per week', ...options.map((o, i) => versionName(o, i === 0, several))];
  const rows: string[][] = [
    ['Minutes', ...stats.map((s) => String(s.minutes))],
    ['Working sets', ...stats.map((s) => String(s.sets))],
    ...MUSCLES.filter((m) => stats.some((s) => s.muscles.has(m))).map((m) => [
      MUSCLE_LABEL[m],
      ...stats.map((s) => {
        const entry = s.muscles.get(m);
        return entry ? `${entry.sets} (${plural(entry.days.size, 'day')})` : '0';
      }),
    ]),
  ];
  out.push(
    '**Minutes and weekly sets.** Minutes add up the workouts in the week. Each set counts once for each primary muscle of its exercise; in brackets, the days that muscle is trained.',
    table(head, rows),
  );
  return out;
}

function workoutSection(t: StarterTemplate, workoutIndex: number, library: Library): string[] {
  const w = t.workouts[workoutIndex];
  const options = dayVersions(t);
  const several = options.length > 1;
  const where = options.map((o) => {
    const on = (weekdaysByWorkout(o.schedule).get(w.id) ?? []).map((d) => WEEKDAY_SHORT[d]);
    const version = `the ${o.daysPerWeek}-day version`;
    if (!several) return on.length ? `On ${sentenceList(on)}` : 'Not scheduled';
    return on.length ? `${sentenceList(on)} in ${version}` : `not in ${version}`;
  });
  const days = several ? capitalize(where.join('; ')) : where[0];

  const rows: string[][] = [];
  const notes: string[] = [];
  w.blocks.forEach((block, b) => {
    const grouped = block.exercises.length > 1 || block.type === 'superset' || block.type === 'circuit';
    if (grouped) {
      const rounds = Math.max(0, ...block.exercises.map((e) => e.sets.filter((s) => s.kind !== 'warmup').length));
      const transition = block.transitionRestSec ? `, ${block.transitionRestSec} s between exercises` : '';
      const label =
        block.type === 'circuit'
          ? `Circuit: ${plural(rounds, 'round')}${transition}, ${block.roundRestSec ?? 0} s rest after each round`
          : `${capitalize(block.type)}: ${plural(rounds, 'round')}${transition}, ${block.roundRestSec ?? 0} s rest after each round`;
      rows.push([`${b + 1}`, `**${label}**`, '', '', '', '', '']);
    }
    block.exercises.forEach((planned, e) => {
      const exercise = library.get(planned.exerciseId);
      const name = exercise?.name ?? planned.exerciseId;
      const n = grouped ? `${b + 1}${String.fromCharCode(97 + e)}` : `${b + 1}`;
      rows.push([n, name, warmupsText(planned), workingSetsText(planned), effortText(planned), tempoText(planned), progressionText(planned, exercise)]);
      if (planned.notes) notes.push(`${n} ${name}: ${planned.notes}`);
    });
  });

  const out = [`#### ${w.name}`, `${workoutStats(w)}. ${days}.`, table(['#', 'Exercise', 'Warm-ups', 'Working sets', 'Effort', 'Tempo', 'Progression (lb / kg)'], rows)];
  if (notes.length) out.push(`Notes shown with the exercise:\n\n${bullets(notes)}`);
  return out;
}

function programSection(t: StarterTemplate, n: number, library: Library): string[] {
  const review = TEMPLATE_REVIEW[t.id];
  const options = dayVersions(t);
  const formLifts = [...new Set(t.workouts.flatMap((w) => w.blocks.flatMap((b) => b.exercises)).map((e) => library.get(e.exerciseId)).filter((e): e is Exercise => !!e?.formAnalysis).map((e) => e.name))];
  const out: string[] = [
    `### ${n}. ${t.name}`,
    `> ${t.description}`,
    bullets([
      `Id: \`${t.id}\``,
      `Review status: ${review ? STATUS_LABEL[review.status] : 'Missing'}`,
      `Card: ${meta(templateMeta(t))}`,
      `Style: ${CATEGORY_LABEL[t.category]}`,
      `Level: ${levelLines(t)}`,
      `Goals: ${goalsText(t.goals)}`,
      `Equipment: ${equipmentText(t)}`,
      `Also needs: ${alsoNeedsText(t)}`,
      `Length: ${lengthText(t)}`,
      `Day versions: ${options.map((o, i) => versionName(o, i === 0, options.length > 1)).join(', ')}`,
      `Form-analysis lifts: ${formLifts.length ? formLifts.join(', ') : 'None'}`,
    ]),
  ];
  if (review?.notes.length) out.push(`**Design notes**\n\n${bullets(review.notes)}`);
  out.push(...versionsSection(t, library));
  t.workouts.forEach((_, i) => out.push(...workoutSection(t, i, library)));
  return out;
}

// ---------------------------------------------------------------------------
// Sections

function intro(): string[] {
  const rests = defaultPreferences.restDefaultsSec;
  const rounding = ROUNDED.map((e) => `${EQUIPMENT_LABEL[e].toLowerCase()} ${defaultRounding.imperial[e]} lb / ${defaultRounding.metric[e]} kg`);
  return [
    '# Starter content review (G3.13)',
    'Generated from the app code by `node --import tsx tests/tools/writeContentReview.ts`, run in client/. Do not edit it by hand: a test checks that this file still matches the code.',
    'What to do: reply in chat program by program with "approved" or the changes you want. Then do the same for the recommendation tables, the worked examples and the tour wording.',
    '**Contents**',
    [
      '1. Programs at a glance',
      `2. The ${STARTER_TEMPLATES.length} programs, in full`,
      '3. Recommendations: the best match for each answer',
      '4. Recommendations: worked examples',
      '5. The tour',
      '6. Library additions',
    ].join('\n'),
    '**How to read the programs**',
    bullets([
      'Working sets: "3 × 8–12" is 3 sets of 8 to 12 reps. "per leg" (or arm, or side) means each side gets that many. A hold reads "2 × 30 s".',
      'Effort: "RIR 2" means stop with about 2 reps left in reserve (RPE 8). "No target" is for jump, power and weekly-% sets.',
      'Warm-ups: the reps of each warm-up set, at most 2. Their load is blank: they pre-fill at about half of last time\'s working weight, both at the same weight, so a lift with two warm-ups has a note asking for a heavier second one.',
      'Tempo: seconds lowering, pausing, lifting and pausing, for example 3-1-1-0.',
      `Progression: the step the app takes, in lb and in kg, with a new account's rounding (${rounding.join(', ')}; anything else uses the barbell's), then what happens on a miss.`,
      'Rest: every set rests on Auto (the exercise\'s remembered rest, else the Settings default). Supersets and circuits rest after each round, as shown.',
      `Minutes: worked out from the Settings default rests (compound ${rests.compound} s, isolation ${rests.isolation} s, warm-up ${rests.warmup} s) and ${WORK_SEC_PER_SET} s of work a set (twice that one side at a time; a hold counts its own time), plus ${SETUP_MIN} minutes, rounded to 5.`,
    ]),
  ];
}

function summarySection(library: Library): string[] {
  const rows = STARTER_TEMPLATES.map((t, i) => [
    String(i + 1),
    t.name,
    CATEGORY_LABEL[t.category],
    levelSummary(t),
    dayVersions(t)
      .map((o) => o.daysPerWeek)
      .join(' or '),
    t.durationWeeks ? `${t.durationWeeks} weeks` : 'Ongoing',
    equipmentText(t),
    alsoNeedsText(t),
    goalsText(t.goals),
    String(t.workouts.length),
    TEMPLATE_REVIEW[t.id] ? capitalize(TEMPLATE_REVIEW[t.id].status) : 'Missing',
  ]);
  const workouts = STARTER_TEMPLATES.reduce((n, t) => n + t.workouts.length, 0);
  const exercises = new Set(STARTER_TEMPLATES.flatMap((t) => t.workouts.flatMap((w) => w.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId)))));
  const gear = gearForExercises(exercises);
  return [
    '## 1. Programs at a glance',
    `${plural(STARTER_TEMPLATES.length, 'program')}, ${plural(workouts, 'workout')} and ${plural(exercises.size, 'different exercise')}, in the order the Templates list shows them. Days a week lists every version, default first.`,
    table(['#', 'Program', 'Style', 'Made for (suits)', 'Days a week', 'Length', 'Equipment', 'Also needs', 'Goals', 'Workouts', 'Status'], rows),
    `Gear used across the catalog: ${gearList(gear) || 'none'}. Exercises missing from the library: ${[...exercises].filter((id) => !library.has(id)).join(', ') || 'none'}.`,
  ];
}

/** Short codes for the best-match table: the program's initials ("Push Pull Legs" is PPL). */
function shortCodes(templates: readonly StarterTemplate[]): Map<ID, string> {
  const codes = new Map<ID, string>();
  const used = new Set<string>();
  templates.forEach((t, i) => {
    const initials = t.name
      .split(/[\s/&-]+/)
      .filter((w) => w && w.toLowerCase() !== 'and')
      .map((w) => w[0].toUpperCase())
      .join('');
    const code = used.has(initials) ? `${initials}${i + 1}` : initials;
    used.add(code);
    codes.set(t.id, code);
  });
  return codes;
}

function bestMatchSection(): string[] {
  const codes = shortCodes(STARTER_TEMPLATES);
  const days = [1, 2, 3, 4, 5, 6, 7];
  const out: string[] = [
    '## 3. Recommendations: the best match for each answer',
    `The first card onboarding shows, for every goal, experience and number of days, in six equipment setups (${REVIEW_PROFILES.length * TRAINING_GOALS.length * EXPERIENCE_LEVELS.length * days.length} answers). Each cell is the program's code and the days a week of the version it starts. In brackets: the heading reads "Closest plans", because no eligible program is built for that goal or none fits every answer.`,
    `**Codes:** ${STARTER_TEMPLATES.map((t) => `${codes.get(t.id)} ${t.name}`).join(' · ')}.`,
  ];
  for (const profile of REVIEW_PROFILES) {
    const setup = profile.equipment ? `Equipment answered: ${sentenceList(profile.equipment.map((e) => EQUIPMENT_LABEL[e].toLowerCase()))}.` : 'The equipment question skipped.';
    const rows: string[][] = [];
    for (const goal of TRAINING_GOALS) {
      for (const experience of EXPERIENCE_LEVELS) {
        rows.push([
          `${capitalize(GOAL_NOUN[goal])}, ${experience}`,
          ...days.map((daysPerWeek) => {
            const r = recommendTemplates(STARTER_TEMPLATES, { experience, goal, equipment: profile.equipment ? [...profile.equipment] : undefined, daysPerWeek });
            const best = r.picks[0];
            if (!best) return 'none';
            const text = `${codes.get(best.template.id)} ${best.option.daysPerWeek}`;
            return r.heading === 'closest' ? `(${text})` : text;
          }),
        ]);
      }
    }
    out.push(`### ${profile.label}`, setup, table(['Goal, experience', ...days.map((d) => plural(d, 'day'))], rows));
  }
  return out;
}

function picksList(r: Recommendations): string {
  if (!r.picks.length) return 'No plans to suggest.';
  return r.picks
    .map((p, i) => {
      const lines = [...p.reasons.map((l) => `Check: ${l}`), ...p.notes.map((l) => `Info, no check mark: ${l}`)];
      const sub = lines.length ? lines.map((l) => `   - ${l}`).join('\n') : '   - No lines';
      return `${i + 1}. **${p.template.name}** · ${meta(templateMeta(p.template, p.option))}\n${sub}`;
    })
    .join('\n');
}

function goldenSection(): string[] {
  const out: string[] = [
    '## 4. Recommendations: worked examples',
    'Each example shows the answers, then exactly what onboarding shows: the heading, the text under it, and each card with its version and lines. Check lines have a check mark; info lines are shown without one. Tests hold the app to these.',
  ];
  for (const row of GOLDEN_ROWS) {
    const r = recommendTemplates(STARTER_TEMPLATES, row.answers);
    const head = [`**Example ${row.n}.** Answers: ${row.label}.`, `Heading: "${r.title}". Under it: "${r.subtitle}"`];
    if (row.note) head.push(`Why it's here: ${row.note}`);
    out.push(head.join('\n\n'), picksList(r));
  }
  return out;
}

function tourSection(): string[] {
  const device = { formSupported: true, preview: FORM_ANALYSIS_PREVIEW };
  const art = tourTodayArt();
  const cards = TOUR_CARDS.map((c, i) => {
    const text = tourCardText(c, device);
    return `${i + 1}. **${text.title}**: ${text.body}${text.note ? ` Under it: "${text.note}"` : ''}`;
  });
  return [
    '## 5. The tour',
    `Five cards, in order, as an iPhone 12 or newer shows them${FORM_ANALYSIS_PREVIEW ? ' while form recording is a preview' : ''}.`,
    cards.join('\n'),
    bullets([
      `Form card on iPhones older than the 12: "${FORM_UNSUPPORTED_BODY}"`,
      `Form card's preview line, shown until real form analysis ships (G4.3): "${FORM_PREVIEW_LINE}" It is ${FORM_ANALYSIS_PREVIEW ? 'on' : 'off'} now.`,
      `Onboarding's "Want a quick tour?" text: "${TOUR_PITCH}"`,
      `Last button: "${tourLastButton(TOUR_FROM_ONBOARDING)}" when the tour opens from onboarding, "${tourLastButton(undefined)}" from Profile → About.`,
      art ? `Today card picture: ${art.programName} · ${art.workoutName} · ${art.meta}.` : 'Today card picture: its workout is missing from the catalog.',
      'Weights in the Log and Progress pictures follow the units setting (kg rounded to 2.5).',
    ]),
  ];
}

function librarySection(library: Library): string[] {
  const muscles = (list: readonly MuscleGroup[] | undefined) => (list?.length ? sentenceList(list.map((m) => MUSCLE_LABEL[m].toLowerCase())) : 'none');
  const items = G313_LIBRARY_ADDITIONS.map((id) => {
    const e = library.get(id);
    if (!e) return `\`${id}\`: missing from the library`;
    const usedIn = STARTER_TEMPLATES.filter((t) => t.workouts.some((w) => w.blocks.some((b) => b.exercises.some((p) => p.exerciseId === id)))).map((t) => t.name);
    const facts = [
      `${EQUIPMENT_LABEL[e.equipment ?? 'other']}, ${e.category}${e.isBodyweight && e.equipment !== 'bodyweight' ? ', bodyweight counts toward the load' : ''}`,
      `primary ${muscles(e.primaryMuscles)}`,
      `secondary ${muscles(e.secondaryMuscles)}`,
      e.baseMovementId ? `a variation of ${library.get(e.baseMovementId)?.name ?? e.baseMovementId}` : 'the main movement of its family',
      ...(e.aliases?.length ? [`also called ${e.aliases.join(', ')}`] : []),
      ...(isHoldExercise(e) ? ['logged as a timed hold'] : []),
      ...(e.formAnalysis ? [`form analysis as a ${e.formAnalysis.replace('_', ' ')}`] : []),
      ...(gearForExercises([id]).length ? [`needs ${gearList(gearForExercises([id]))}`] : []),
      `used in ${usedIn.length ? sentenceList(usedIn) : 'no program'}`,
    ];
    return `**${e.name}** (\`${id}\`): ${facts.join('; ')}.`;
  });
  return [
    '## 6. Library additions',
    `${plural(G313_LIBRARY_ADDITIONS.length, 'exercise')} added for these programs. The library now has ${library.size} exercises.`,
    bullets(items),
  ];
}

/**
 * The review page as markdown, deterministic: the same code always renders the same text. LF
 * line endings, one blank line between blocks, and a final newline.
 */
export function renderContentReview(): string {
  const library: Library = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));
  const blocks = [
    ...intro(),
    ...summarySection(library),
    `## 2. The ${STARTER_TEMPLATES.length} programs, in full`,
    ...STARTER_TEMPLATES.flatMap((t, i) => programSection(t, i + 1, library)),
    ...bestMatchSection(),
    ...goldenSection(),
    ...tourSection(),
    ...librarySection(library),
  ];
  return `${blocks.join('\n\n')}\n`;
}

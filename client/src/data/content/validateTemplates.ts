// The starter-template validator (G3.13). Pure: tests run it over the catalog
// (tests/templates.test.ts expects no problems) and over one bad fixture per rule
// (tests/templateValidator.test.ts). It never runs in the app.
//
// Every problem is one readable line that starts with the template id and points at the part
// that's wrong: "tpl_x: Full Body A > block 2 > Plank (set 1): ...".
import { parseTempo } from '@/data/logging';
import { trainingDays } from '@/data/schedule';
import type { Equipment, Exercise, ExperienceLevel, ID, PlanSchedule, PlannedExercise, SetPrescription, StarterTemplate } from '@/data/types';
import { lbToKg } from '@/data/units';
import { abbreviate } from '@/features/plans/describe';
import { isHoldExercise } from '@/features/progress/metrics';
import { WEEKDAY_LONG } from '@/lib/format';
import { GEAR_LABEL, gearForExercises } from './gear';
import { estimateMinutes } from './templates/helpers';
import { RETIRED_TEMPLATE_IDS } from './templates';

/** The exercise lookup the validator reads (and passes on to `estimateMinutes`). */
export type ExercisesById = ReadonlyMap<ID, Exercise>;

export const MAX_TEMPLATE_NAME = 28;
export const MAX_WORKOUT_NAME = 20;
export const MAX_DESCRIPTION = 110;
export const MINUTES_RANGE = { min: 10, max: 90 } as const;
/** Programs that suit beginners (levels include beginner) run at most this many days in every version. */
export const BEGINNER_MAX_DAYS = 4;

const LEVEL_ORDER: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced'];
const RULE_STEPS_KG = [lbToKg(5), lbToKg(10)];

// ---------------------------------------------------------------------------
// Copy rules (spec 2.13): matched case-insensitively on word boundaries, so 'secure' and 'heel'
// pass while 'cure' and 'heal' don't.

/** Brand and trademarked program names that never appear in content, with how each is matched. */
export const BANNED_BRANDS: readonly { word: string; pattern: string }[] = [
  { word: 'CrossFit', pattern: 'cross[\\s-]?fit' },
  { word: 'WOD', pattern: 'wods?' },
  { word: 'Metcon', pattern: 'metcons?' },
  { word: 'ATG', pattern: 'atg' },
  { word: 'Knees Over Toes', pattern: 'knees[\\s-]+over[\\s-]+toes' },
  { word: 'StrongLifts', pattern: 'strong-?lifts' },
  { word: 'Starting Strength', pattern: 'starting[\\s-]+strength' },
  { word: '5/3/1', pattern: '5\\s*/\\s*3\\s*/\\s*1' },
  { word: 'GZCL', pattern: 'gzcl' },
  { word: 'nSuns', pattern: 'nsuns' },
  { word: 'PHUL', pattern: 'phul' },
  { word: 'PHAT', pattern: 'phat' },
  { word: 'Smolov', pattern: 'smolov' },
  { word: 'Sheiko', pattern: 'sheiko' },
  { word: 'Texas Method', pattern: 'texas[\\s-]+method' },
  { word: 'Madcow', pattern: 'mad[\\s-]?cow' },
  { word: 'Tabata', pattern: 'tabata' },
  { word: 'HYROX', pattern: 'hyrox' },
  { word: 'F45', pattern: 'f-?45' },
];

/** Pain, injury and medical words content never uses (spec 4 and 5). */
export const BANNED_INJURY_WORDS: readonly { word: string; pattern: string }[] = [
  { word: 'pain', pattern: 'pain(?:s|ful)?' },
  { word: 'injury', pattern: 'injur\\p{L}*' },
  { word: 'rehab', pattern: 'rehab\\p{L}*' },
  { word: 'bulletproof', pattern: 'bulletproof\\p{L}*' },
  { word: 'heal', pattern: 'heal(?:s|ed|ing)?' },
  { word: 'cure', pattern: 'cure[sd]?' },
];

const onWordBoundaries = (pattern: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'iu');
const BRAND_RES = BANNED_BRANDS.map((b) => ({ word: b.word, re: onWordBoundaries(b.pattern) }));
const INJURY_RES = BANNED_INJURY_WORDS.map((b) => ({ word: b.word, re: onWordBoundaries(b.pattern) }));
const EMOJI = /\p{Extended_Pictographic}/u;

/** The brand names a text uses, as listed in BANNED_BRANDS. */
export function brandNamesIn(text: string): string[] {
  return BRAND_RES.filter((b) => b.re.test(text)).map((b) => b.word);
}

/**
 * What breaks the copy rules in a text, as fragments like 'has an emoji' or 'uses the brand name
 * "ATG"'. Empty when it's fine. Other content tests (tour, rules copy) can use it too.
 */
export function copyProblems(text: string): string[] {
  const problems: string[] = [];
  if (EMOJI.test(text)) problems.push('has an emoji');
  if (text.includes('!')) problems.push('has a "!"');
  for (const word of brandNamesIn(text)) problems.push(`uses the brand name "${word}"`);
  for (const b of INJURY_RES) if (b.re.test(text)) problems.push(`uses the injury word "${b.word}"`);
  return problems;
}

/** Built-in exercise names and aliases scanned for brand names (the only copy rule they follow). */
export function validateLibraryNames(exercises: readonly Exercise[]): string[] {
  const problems: string[] = [];
  for (const e of exercises) {
    for (const word of brandNamesIn(e.name)) problems.push(`${e.id}: name "${e.name}" uses the brand name "${word}"`);
    for (const alias of e.aliases ?? []) {
      for (const word of brandNamesIn(alias)) problems.push(`${e.id}: alias "${alias}" uses the brand name "${word}"`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// The validator

/** Every template's problems, plus the ones across templates (repeated ids and names). Empty when all pass. */
export function validateTemplates(templates: readonly StarterTemplate[], exercises: readonly Exercise[]): string[] {
  const byId: ExercisesById = new Map(exercises.map((e) => [e.id, e]));
  const problems: string[] = [];
  for (const id of repeated(templates.map((t) => t.id))) problems.push(`${id}: id is used by more than one template`);
  for (const name of repeated(templates.map((t) => t.name))) {
    const ids = templates.filter((t) => t.name === name).map((t) => t.id);
    problems.push(`${ids[0]}: name "${name}" is also used by ${ids.slice(1).join(', ')}`);
  }
  for (const t of templates) problems.push(...validateTemplate(t, byId));
  return problems;
}

/** One template's problems. Empty when it passes. */
export function validateTemplate(t: StarterTemplate, exercisesById: ExercisesById): string[] {
  const problems: string[] = [];
  const say = (where: string, what: string) => problems.push(`${t.id}: ${where ? `${where}: ` : ''}${what}`);
  const lookup = (id: ID) => exercisesById.get(id);

  // Ids and names.
  if (!/^tpl_[a-z0-9_]+$/.test(t.id)) say('', 'id must be tpl_ followed by lowercase letters, digits or underscores');
  if ((RETIRED_TEMPLATE_IDS as readonly string[]).includes(t.id)) say('', 'id is retired and can never be reused');
  if (t.name.length > MAX_TEMPLATE_NAME) say('', `name "${t.name}" is longer than ${MAX_TEMPLATE_NAME} characters (${t.name.length})`);

  // Tags.
  const levels = t.levels;
  if (!levels.includes(t.level)) say('', `levels [${levels.join(', ')}] must include its level, ${t.level}`);
  const levelIndexes = [...new Set(levels)].map((l) => LEVEL_ORDER.indexOf(l)).sort((a, b) => a - b);
  const contiguous = levelIndexes.every((index, i) => i === 0 || index === levelIndexes[i - 1] + 1);
  if (repeated(levels).length || !contiguous) say('', `levels [${levels.join(', ')}] must be neighbouring levels, each listed once`);
  const goals = t.goals;
  if (!goals.length) say('', 'goals must list at least one goal');
  for (const goal of repeated(goals)) say('', `goal "${goal}" is listed more than once`);

  // Copy.
  if (t.description.length > MAX_DESCRIPTION) say('', `description is longer than ${MAX_DESCRIPTION} characters (${t.description.length})`);
  if (!t.description.trimEnd().endsWith('.')) say('', 'description must end with a full stop');
  for (const p of copyProblems(t.name)) say('name', p);
  for (const p of copyProblems(t.description)) say('description', p);

  // Equipment and gear, from the exercises the template uses.
  const planned = t.workouts.flatMap((w) => w.blocks.flatMap((b) => b.exercises));
  const usedIds = [...new Set(planned.map((p) => p.exerciseId))];
  const used = usedIds.map(lookup).filter((e): e is Exercise => e !== undefined);
  if (t.equipment.includes('other')) say('', "equipment lists 'other', which starter templates never use");
  const weights = unique(used.map((e) => e.equipment).filter((q): q is Equipment => q !== undefined && q !== 'bodyweight'));
  const needed: Equipment[] = weights.length ? weights : ['bodyweight'];
  if (!sameList(t.equipment.filter((q) => q !== 'other'), needed)) say('', `equipment is [${sorted(t.equipment).join(', ')}], but its exercises need [${sorted(needed).join(', ')}]`);
  const gear = gearForExercises(usedIds);
  const alsoNeeds = t.alsoNeeds ?? [];
  if (!sameList(alsoNeeds, gear)) say('', `alsoNeeds is [${sorted(alsoNeeds).join(', ')}], but its exercises need [${sorted(gear).join(', ')}]`);
  for (const g of unique(alsoNeeds)) for (const p of copyProblems(GEAR_LABEL[g])) say(`gear label "${GEAR_LABEL[g]}"`, p);

  // Schedules and day versions.
  const versions = [
    { label: `schedule (${t.daysPerWeek} days)`, daysPerWeek: t.daysPerWeek, schedule: t.schedule },
    ...(t.otherDays ?? []).map((o, i) => ({ label: `otherDays[${i}] (${o.daysPerWeek} days)`, ...o })),
  ];
  const types = unique(versions.map((v) => v.schedule.type));
  if (types.length > 1) say('', `day versions mix ${types.join(' and ')} schedules; they must all be weekly or all fixed`);
  const fixed = t.schedule.type === 'fixed';
  if (fixed && t.durationWeeks === undefined) say('', 'durationWeeks must be set on a fixed-length program');
  if (!fixed && t.durationWeeks !== undefined) say('', `durationWeeks is set, but the schedule is ${t.schedule.type}, not fixed`);
  const workoutIds = new Set(t.workouts.map((w) => w.id));
  const scheduled = new Set<ID>();
  for (const v of versions) {
    const s = v.schedule;
    if (s.type === 'rotating') {
      for (const id of s.sequence) if (id !== 'rest') scheduled.add(id);
      say(v.label, 'is rotating; starter templates are weekly or fixed');
      continue;
    }
    if (s.type === 'fixed') {
      if (t.durationWeeks !== undefined && s.weeks !== t.durationWeeks) say(v.label, `runs ${s.weeks} weeks, but durationWeeks is ${t.durationWeeks}`);
      for (const d of s.days) if (!Number.isInteger(d.week) || d.week < 1 || d.week > s.weeks) say(v.label, `has a day in week ${d.week}, outside its ${s.weeks} weeks`);
      const first = weekKey(s, 1);
      for (let week = 2; week <= s.weeks; week++) {
        if (weekKey(s, week) !== first) {
          say(v.label, `week ${week} doesn't repeat week 1's days`);
          break;
        }
      }
    }
    for (const week of weeksOf(s)) {
      const days = s.days.filter((d) => !('week' in d) || d.week === week);
      const where = s.type === 'fixed' ? `${v.label} week ${week}` : v.label;
      for (const day of repeated(days.map((d) => d.weekday))) say(where, `lists ${WEEKDAY_LONG[day]} more than once`);
      for (const d of days) if (!d.workoutIds.length) say(where, `has a ${WEEKDAY_LONG[d.weekday]} with no workouts`);
    }
    for (const id of unique(s.days.flatMap((d) => d.workoutIds))) {
      scheduled.add(id);
      if (!workoutIds.has(id)) say(v.label, `schedules "${id}", which isn't one of its workouts`);
    }
    const count = trainingDays(s).count;
    if (count !== v.daysPerWeek) say(v.label, `says ${v.daysPerWeek} days a week, but its schedule trains on ${count}`);
    if (levels.includes('beginner') && count > BEGINNER_MAX_DAYS) {
      say(v.label, `trains on ${count} days a week; programs that suit beginners run ${BEGINNER_MAX_DAYS} or fewer`);
    }
  }
  for (const days of repeated(versions.map((v) => v.daysPerWeek))) say('', `more than one day version runs ${days} days a week`);
  for (const w of t.workouts) if (!scheduled.has(w.id)) say(`workout "${w.name}"`, "isn't scheduled in any day version");

  // Ids inside the template: plan copies map workout ids, and screens key lists by id.
  const ids = t.workouts.flatMap((w) => [w.id, ...w.blocks.flatMap((b) => [b.id, ...b.exercises.map((e) => e.id)])]);
  for (const id of repeated(ids)) say('', `id "${id}" is used more than once inside the template`);

  // Workouts.
  for (const name of repeated(t.workouts.map((w) => w.name))) say('', `workout name "${name}" is used more than once`);
  const byAbbreviation = new Map<string, string[]>();
  for (const name of unique(t.workouts.map((w) => w.name))) byAbbreviation.set(abbreviate(name), [...(byAbbreviation.get(abbreviate(name)) ?? []), name]);
  for (const [short, names] of byAbbreviation) {
    if (names.length > 1) say('', `workouts ${names.map((n) => `"${n}"`).join(' and ')} all abbreviate to "${short}" in the week grid`);
  }

  for (const w of t.workouts) {
    const wName = `workout "${w.name}"`;
    if (w.name.length > MAX_WORKOUT_NAME) say(wName, `name is longer than ${MAX_WORKOUT_NAME} characters (${w.name.length})`);
    for (const p of copyProblems(w.name)) say(`${wName} name`, p);
    const empty = !w.blocks.some((b) => b.exercises.length);
    if (empty) say(wName, 'has no exercises');
    const known = w.blocks.every((b) => b.exercises.every((e) => lookup(e.exerciseId)));
    if (known && !empty) {
      const minutes = estimateMinutes(w.blocks, exercisesById);
      if (w.estimatedMinutes !== minutes) say(wName, `estimatedMinutes is ${w.estimatedMinutes ?? 'not set'}, but estimateMinutes() gives ${minutes}`);
      if (minutes < MINUTES_RANGE.min || minutes > MINUTES_RANGE.max) say(wName, `takes about ${minutes} min, outside ${MINUTES_RANGE.min}-${MINUTES_RANGE.max}`);
    }

    w.blocks.forEach((b, bi) => {
      const bWhere = `${w.name} > block ${bi + 1} (${b.type})`;
      const grouped = b.type === 'superset' || b.type === 'circuit';
      if (b.type === 'warmup') say(bWhere, 'warm-up blocks are not used; give the lift warm-up sets instead');
      const size = b.exercises.length;
      if (b.type === 'single' && size !== 1) say(bWhere, `a single holds exactly 1 exercise, not ${size}`);
      if (b.type === 'superset' && size !== 2) say(bWhere, `a superset holds exactly 2 exercises, not ${size}`);
      if (b.type === 'circuit' && size < 3) say(bWhere, `a circuit holds 3 or more exercises, not ${size}`);
      if (grouped && !(typeof b.roundRestSec === 'number' && b.roundRestSec > 0)) say(bWhere, 'needs a round rest (roundRestSec > 0)');
      if (!grouped && (b.roundRestSec !== undefined || b.transitionRestSec !== undefined)) say(bWhere, 'has a round or transition rest, which only supersets and circuits use');
      if (grouped) {
        const counts = b.exercises.map((e) => e.sets.filter((s) => s.kind !== 'warmup').length);
        if (unique(counts).length > 1) say(bWhere, `exercises have different working-set counts (${counts.join(', ')}); each round is one set of each`);
      }

      for (const pe of b.exercises) {
        const exercise = lookup(pe.exerciseId);
        const eWhere = `${w.name} > block ${bi + 1} > ${exercise?.name ?? pe.exerciseId}`;
        if (!exercise) {
          say(eWhere, `exercise "${pe.exerciseId}" isn't in the library`);
          continue;
        }
        if (pe.notes !== undefined) for (const p of copyProblems(pe.notes)) say(`${eWhere} notes`, p);
        checkSets(pe, exercise, grouped, eWhere, say);
        checkProgression(pe, exercise, fixed, eWhere, say);
      }
    });
  }
  return problems;
}

function checkSets(pe: PlannedExercise, exercise: Exercise, grouped: boolean, where: string, say: (where: string, what: string) => void) {
  const warmups = pe.sets.filter((s) => s.kind === 'warmup');
  const hold = isHoldExercise(exercise);
  if (warmups.length > 2) say(where, `has ${warmups.length} warm-up sets; at most 2`);
  if (grouped && warmups.length) say(where, 'has warm-up sets inside a superset or circuit');
  if (!pe.sets.some((s) => s.kind !== 'warmup')) say(where, 'has no working sets');
  const firstWorking = pe.sets.findIndex((s) => s.kind !== 'warmup');
  const lateWarmup = pe.sets.findIndex((s, i) => s.kind === 'warmup' && firstWorking >= 0 && i > firstWorking);
  if (lateWarmup >= 0) say(`${where} (set ${lateWarmup + 1})`, 'warm-up sets must come before the working sets');
  if (hold && pe.sets.some((s) => s.kind !== 'timed_hold')) say(where, 'is a hold exercise, so every set must be a timed hold');

  pe.sets.forEach((s, i) => {
    const sWhere = `${where} (set ${i + 1}, ${s.kind})`;
    if (s.kind === 'timed_hold') {
      if (!hold) say(sWhere, "is a timed hold, but this exercise isn't a hold exercise");
      if (!(typeof s.targetDurationSec === 'number' && Number.isInteger(s.targetDurationSec) && s.targetDurationSec > 0)) say(sWhere, 'a hold needs a duration in whole seconds');
      if (s.targetReps !== undefined) say(sWhere, 'a hold has no rep target');
    } else {
      if (!validReps(s)) say(sWhere, 'needs a rep target in whole reps, with min no more than max');
      if (s.targetDurationSec !== undefined) say(sWhere, "has a duration, but it isn't a hold");
    }
    if (s.kind === 'assisted' && !exercise.isBodyweight) say(sWhere, "is assisted, but the exercise isn't a bodyweight one");
    if (s.tempo !== undefined) {
      const parsed = parseTempo(s.tempo);
      if (!parsed.ok || parsed.tempo !== s.tempo) say(sWhere, `tempo "${s.tempo}" isn't valid; write it like 3-1-1-0`);
    }
    if (s.targetRir !== undefined && !(Number.isInteger(s.targetRir) && s.targetRir >= 0 && s.targetRir <= 5)) say(sWhere, `RIR ${s.targetRir} must be a whole number from 0 to 5`);
    if (s.restSec !== undefined) say(sWhere, 'has a rest; template rests stay blank (Auto)');
    if (s.targetLoadKg !== undefined) say(sWhere, 'has a typed load; template loads stay blank');
  });
}

function checkProgression(pe: PlannedExercise, exercise: Exercise, fixed: boolean, where: string, say: (where: string, what: string) => void) {
  const rule = pe.progression;
  if (!rule) return;
  if (exercise.isBodyweight) say(where, "has a progression rule, but it's a bodyweight exercise");
  if (!pe.sets.some((s) => s.kind !== 'warmup' && s.kind !== 'timed_hold')) say(where, 'has a progression rule, but no rep sets');
  if (rule.type === 'percent_weekly') {
    if (!fixed) say(where, 'has a weekly % rule, which only fixed-length programs use');
    if (!(rule.percent > 0 && rule.percent <= 5)) say(where, `weekly % step ${rule.percent} must be more than 0 and at most 5`);
  }
  if (rule.type === 'rep_range' && !RULE_STEPS_KG.some((kg) => Math.abs(kg - rule.incrementKg) < 1e-9)) {
    say(where, `rep_range step ${rule.incrementKg} kg must be lbToKg(5) or lbToKg(10)`);
  }
  const miss = rule.onMiss;
  if (miss.type === 'deload') {
    const ok = miss.percent >= 5 && miss.percent <= 30 && Number.isInteger(miss.afterConsecutiveMisses) && miss.afterConsecutiveMisses >= 1 && miss.afterConsecutiveMisses <= 6;
    if (!ok) say(where, `deload of ${miss.percent}% after ${miss.afterConsecutiveMisses} misses must be 5-30% after 1-6 misses`);
  }
}

// ---------------------------------------------------------------------------
// Helpers

function validReps(s: SetPrescription): boolean {
  const r = s.targetReps;
  if (r === undefined) return false;
  if (typeof r === 'number') return Number.isInteger(r) && r >= 1;
  return Number.isInteger(r.min) && Number.isInteger(r.max) && r.min >= 1 && r.min <= r.max;
}

/** One week of a fixed schedule as a comparable string: weekday → workout ids. */
function weekKey(s: Extract<PlanSchedule, { type: 'fixed' }>, week: number): string {
  return s.days
    .filter((d) => d.week === week)
    .map((d) => `${d.weekday}:${d.workoutIds.join(',')}`)
    .sort()
    .join('|');
}

function weeksOf(s: Exclude<PlanSchedule, { type: 'rotating' }>): number[] {
  if (s.type === 'weekly') return [1];
  return unique(s.days.map((d) => d.week)).sort((a, b) => a - b);
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/** Values that appear more than once, each listed once. */
function repeated<T>(items: readonly T[]): T[] {
  const seen = new Set<T>();
  const twice = new Set<T>();
  for (const item of items) (seen.has(item) ? twice : seen).add(item);
  return [...twice];
}

function sorted(items: readonly string[]): string[] {
  return [...items].sort();
}

/** Same items, each once, in any order. */
function sameList(a: readonly string[], b: readonly string[]): boolean {
  return sorted(a).join('\n') === sorted(unique(b)).join('\n');
}

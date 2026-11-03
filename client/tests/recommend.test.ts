import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { gearForExercises, gearList } from '../src/data/content/gear';
import { STARTER_TEMPLATES } from '../src/data/content/templates/index';
import { copyProblems } from '../src/data/content/validateTemplates';
import type { Equipment, ExperienceLevel, PlanSchedule, PlanWorkout, StarterTemplate, TemplateDayOption, TrainingGoal, Weekday } from '../src/data/types';
import { recommendTemplates, type RecommendAnswers, type Recommendations } from '../src/features/onboarding/recommend';
import {
  COPY,
  EXPERIENCE_LEVELS,
  FULL_GYM,
  GOAL_NOUN,
  GOLDEN_ROWS,
  GYM_EQUIPMENT,
  REVIEW_PROFILES,
  RULES,
  TRAINING_GOALS,
  WEIGHT_EQUIPMENT,
} from '../src/features/onboarding/rules';
import { templateDayOptions } from '../src/features/plans/planEdits';

// ---------------------------------------------------------------------------
// Helpers

/** The onboarding equipment chips, in screen order. */
const CHIPS: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'band', 'bodyweight'];

/** The whole answer space: 4 experience × 6 goal × 129 equipment × 8 days = 24,768 combinations. */
function* answerSpace(): Generator<RecommendAnswers> {
  const experiences = [undefined, ...EXPERIENCE_LEVELS];
  const goals = [undefined, ...TRAINING_GOALS];
  const equipments: (Equipment[] | undefined)[] = [undefined];
  for (let mask = 0; mask < 1 << CHIPS.length; mask++) equipments.push(CHIPS.filter((_, i) => mask & (1 << i)));
  const days = [undefined, 1, 2, 3, 4, 5, 6, 7];
  for (const experience of experiences) for (const goal of goals) for (const equipment of equipments) for (const daysPerWeek of days) yield { experience, goal, equipment, daysPerWeek };
}

const levelIndex = (l: ExperienceLevel) => EXPERIENCE_LEVELS.indexOf(l);
const usesWeights = (t: StarterTemplate) => t.equipment.some((e) => WEIGHT_EQUIPMENT.includes(e));

/** The version the rules choose, worked out independently: most days that fit, else the smallest. */
function expectedVersion(t: StarterTemplate, days: number | undefined): number {
  const all = [t.daysPerWeek, ...(t.otherDays ?? []).map((o) => o.daysPerWeek)].sort((a, b) => a - b);
  if (days === undefined) return t.daysPerWeek;
  const fitting = all.filter((d) => d <= days);
  return fitting.length ? fitting[fitting.length - 1] : all[0];
}

/** Who is eligible, worked out independently of recommend.ts (step 1 of the rules table). */
function eligible(templates: readonly StarterTemplate[], a: RecommendAnswers): { ids: Set<string>; goalFallback: boolean } {
  const equipment = a.equipment?.length ? a.equipment : undefined;
  let pool = templates.filter((t) => {
    if (equipment && !t.equipment.every((e) => e === 'bodyweight' || equipment.includes(e))) return false;
    if (a.experience === 'beginner' && !t.levels.includes('beginner')) return false;
    if (a.experience && a.experience !== 'beginner' && Math.min(...t.levels.map(levelIndex)) > levelIndex(a.experience)) return false;
    if (a.daysPerWeek !== undefined && expectedVersion(t, a.daysPerWeek) - a.daysPerWeek >= 2) return false;
    return true;
  });
  let goalFallback = false;
  if (a.goal) {
    const matching = pool.filter((t) => t.goals.includes(a.goal as TrainingGoal));
    if (matching.length) pool = matching;
    else goalFallback = true;
  }
  return { ids: new Set(pool.map((t) => t.id)), goalFallback };
}

const GOAL_MAIN = new Set<string>(Object.values(COPY.goal.main));
const GOAL_SECONDARY = new Set<string>(Object.values(COPY.goal.secondary));
const EXPERIENCE_LINES = new Set<string>([...Object.values(COPY.experience.headline), ...Object.values(COPY.experience.inLevels)]);
const EQUIPMENT_LINES = new Set<string>([COPY.equipment.usesWeights, COPY.equipment.noWeights]);
const DAYS_CHECK = /^\d+ days? a week, (as you planned|fits your schedule)$/;
const DAYS_NEEDS = /^Needs \d+ days? a week$/;

/** Which part of the rules a line comes from. Check lines are ordered goal, days, experience, equipment. */
function kind(line: string): 'goal' | 'days' | 'experience' | 'equipment' | 'needs' | 'gear' | 'unknown' {
  if (GOAL_MAIN.has(line) || GOAL_SECONDARY.has(line)) return 'goal';
  if (DAYS_CHECK.test(line)) return 'days';
  if (EXPERIENCE_LINES.has(line)) return 'experience';
  if (EQUIPMENT_LINES.has(line)) return 'equipment';
  if (DAYS_NEEDS.test(line)) return 'needs';
  if (line.startsWith('Also needs ')) return 'gear';
  return 'unknown';
}
const CHECK_ORDER = ['goal', 'days', 'experience', 'equipment'];
const INFO_ORDER = ['needs', 'gear'];

const fingerprint = (r: Recommendations) =>
  JSON.stringify([r.heading, r.title, r.subtitle, r.goalFallback, r.picks.map((p) => [p.template.id, p.option.daysPerWeek, p.score, p.reasons, p.notes])]);

const show = (a: RecommendAnswers) => JSON.stringify(a);

/** A minimal template for rule tests: weekly versions with the given days, default first. */
function tpl(id: string, opts: Partial<Omit<StarterTemplate, 'id'>> & { days?: number[] } = {}): StarterTemplate {
  const { days = [3], ...rest } = opts;
  const schedule = (n: number): PlanSchedule => ({ type: 'weekly', days: ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).slice(0, n).map((weekday) => ({ weekday, workoutIds: ['tw_x'] })) });
  const otherDays: TemplateDayOption[] = days.slice(1).map((d) => ({ daysPerWeek: d, schedule: schedule(d) }));
  return {
    id,
    name: id,
    category: 'gym',
    level: 'beginner',
    levels: ['beginner'],
    goals: ['general'],
    daysPerWeek: days[0],
    description: 'A test template.',
    equipment: ['bodyweight'],
    schedule: schedule(days[0]),
    ...(otherDays.length ? { otherDays } : {}),
    workouts: [],
    ...rest,
  };
}

const pickOf = (r: Recommendations, id: string) => {
  const p = r.picks.find((x) => x.template.id === id);
  assert.ok(p, `${id} should be picked`);
  return p;
};

/** The workout tpl() schedules, with a barbell bench press: it needs a squat rack and a bench. */
const benchWorkout: PlanWorkout = { id: 'tw_x', name: 'X', blocks: [{ id: 'tb_x', type: 'single', exercises: [{ id: 'tp_x', exerciseId: 'ex_bench_press', sets: [] }] }] };

// ---------------------------------------------------------------------------

describe('recommendation rules: modules', () => {
  test('rules.ts imports types only, and neither module imports answers.ts, React Native or Expo', () => {
    const src = (f: string) => readFileSync(join(__dirname, '..', 'src', 'features', 'onboarding', f), 'utf8');
    const imports = (text: string) => text.split('\n').filter((l) => /^(import|export) .* from '/.test(l));
    for (const line of imports(src('rules.ts'))) assert.match(line, /^import type /, `rules.ts: ${line}`);
    for (const f of ['rules.ts', 'recommend.ts']) {
      for (const line of imports(src(f))) {
        assert.doesNotMatch(line, /answers'/, `${f}: ${line}`);
        assert.doesNotMatch(line, /'(react-native|expo)/, `${f}: ${line}`);
      }
    }
  });

  test('the catalog is the 12 programs, beginner programs first (the "skipped everything" picks)', () => {
    assert.equal(STARTER_TEMPLATES.length, 12);
    assert.ok(STARTER_TEMPLATES.slice(0, 3).every((t) => t.level === 'beginner' && t.levels.includes('beginner')));
  });

  test('every fixed line, heading and body is plain copy', () => {
    const lines = [
      ...GOAL_MAIN,
      ...GOAL_SECONDARY,
      ...EXPERIENCE_LINES,
      ...EQUIPMENT_LINES,
      ...[1, 2, 3, 4, 5, 6, 7].flatMap((d) => [COPY.days.planned(d), COPY.days.fits(d), COPY.days.needs(d)]),
    ];
    for (const line of lines) {
      assert.deepEqual(copyProblems(line), [], line);
      assert.ok(line.length <= RULES.limits.lineChars, `${line} (${line.length} characters)`);
    }
    const texts = [...Object.values(COPY.heading), COPY.body.fit, COPY.body.start, COPY.body.noFit, ...TRAINING_GOALS.map((g) => COPY.body.goalFallback(g))];
    for (const text of texts) assert.deepEqual(copyProblems(text), [], text);
    assert.equal(COPY.days.planned(1), '1 day a week, as you planned');
    assert.equal(COPY.body.goalFallback('athletic'), `No program built for ${GOAL_NOUN.athletic} fits your answers, so these come closest.`);
  });
});

describe('recommendation rules: points and tie-breaks', () => {
  test('goal: main goal +6, another of its goals +3; programs without the goal are left out', () => {
    const r = recommendTemplates([tpl('a', { goals: ['muscle'] }), tpl('b', { goals: ['strength', 'muscle'] }), tpl('c', { goals: ['strength'] })], { goal: 'muscle' });
    assert.deepEqual(r.picks.map((p) => [p.template.id, p.score, p.reasons]), [
      ['a', RULES.goal.main, [COPY.goal.main.muscle]],
      ['b', RULES.goal.secondary, [COPY.goal.secondary.muscle]],
    ]);
    assert.equal(RULES.goal.main, 6);
    assert.equal(RULES.goal.secondary, 3);
  });

  test('goal fallback: nothing lists the goal, so everyone is kept with no goal line', () => {
    const r = recommendTemplates([tpl('a', { goals: ['strength'] }), tpl('b', { goals: ['general'] })], { goal: 'mobility' });
    assert.equal(r.goalFallback, true);
    assert.equal(r.heading, 'closest');
    assert.equal(r.subtitle, COPY.body.goalFallback('mobility'));
    assert.deepEqual(r.picks.map((p) => [p.template.id, p.score, p.reasons]), [['a', 0, []], ['b', 0, []]]);
  });

  test('experience: headline +4, in its levels +3, one level above -1, two above -3', () => {
    const templates = [
      tpl('head', { level: 'advanced', levels: ['intermediate', 'advanced'] }),
      tpl('also', { level: 'intermediate', levels: ['intermediate', 'advanced'] }),
      tpl('one', { level: 'beginner', levels: ['beginner', 'intermediate'] }),
      tpl('two', { level: 'beginner', levels: ['beginner'] }),
    ];
    const r = recommendTemplates(templates, { experience: 'advanced' });
    assert.deepEqual(r.picks.map((p) => [p.template.id, p.score, p.reasons]), [
      ['head', 4, [COPY.experience.headline.advanced]],
      ['also', 3, [COPY.experience.inLevels.advanced]],
      ['one', -1, []],
    ]);
    assert.equal(recommendTemplates(templates, { experience: 'advanced' }, 4).picks[3].score, -3);
  });

  test('experience gate: beginners only see programs that suit beginners; others see programs starting at or below them', () => {
    const templates = [tpl('beg', { levels: ['beginner'] }), tpl('int', { level: 'intermediate', levels: ['intermediate', 'advanced'] }), tpl('adv', { level: 'advanced', levels: ['advanced'] })];
    const ids = (experience: ExperienceLevel) => recommendTemplates(templates, { experience }).picks.map((p) => p.template.id);
    assert.deepEqual(ids('beginner'), ['beg']);
    assert.deepEqual(ids('intermediate'), ['int', 'beg']);
    assert.deepEqual(ids('advanced'), ['adv', 'int', 'beg']);
  });

  test('days: equal +4, 1 fewer +3, 2 or more fewer +1, 1 more -3 as an info line, 2 or more extra left out', () => {
    const templates = [tpl('d4', { days: [4] }), tpl('d3', { days: [3] }), tpl('d2', { days: [2] }), tpl('d5', { days: [5] }), tpl('d6', { days: [6] })];
    const r = recommendTemplates(templates, { daysPerWeek: 4 }, 5);
    assert.deepEqual(r.picks.map((p) => [p.template.id, p.score, p.reasons, p.notes]), [
      ['d4', 4, [COPY.days.planned(4)], []],
      ['d3', 3, [COPY.days.fits(3)], []],
      ['d2', 1, [COPY.days.fits(2)], []],
      ['d5', -3, [], [COPY.days.needs(5)]],
    ]);
  });

  test('day version: the most days that still fit, else the smallest; skipped days take the default', () => {
    const t = tpl('v', { days: [3, 2, 5] });
    const version = (daysPerWeek?: number) => recommendTemplates([t], { daysPerWeek }).picks[0]?.option.daysPerWeek;
    assert.equal(version(1), 2);
    assert.equal(version(2), 2);
    assert.equal(version(3), 3);
    assert.equal(version(4), 3);
    assert.equal(version(5), 5);
    assert.equal(version(7), 5);
    assert.equal(recommendTemplates([t], { goal: 'general' }).picks[0].option.daysPerWeek, 3);
    // The option is the template's own version, as planFromTemplate takes it.
    assert.equal(recommendTemplates([t], { daysPerWeek: 7 }).picks[0].option.schedule, t.otherDays?.[1].schedule);
  });

  test('equipment: strict filter; weights +2, no weights -3 when a weight was listed, 0 when none', () => {
    const templates = [tpl('db', { equipment: ['dumbbell'] }), tpl('bw', { equipment: ['bodyweight'] }), tpl('bb', { equipment: ['barbell', 'dumbbell'] })];
    const withDumbbells = recommendTemplates(templates, { equipment: ['dumbbell'] });
    assert.deepEqual(withDumbbells.picks.map((p) => [p.template.id, p.score, p.reasons]), [
      ['db', 2, [COPY.equipment.usesWeights]],
      ['bw', -3, [COPY.equipment.noWeights]],
    ]);
    const withBands = recommendTemplates(templates, { equipment: ['band'] });
    assert.deepEqual(withBands.picks.map((p) => [p.template.id, p.score, p.reasons]), [['bw', 0, [COPY.equipment.noWeights]]]);
  });

  test('gear: an info line for home setups only, after the days line', () => {
    const t = tpl('g', { equipment: ['dumbbell'], alsoNeeds: ['bench', 'rack'], days: [4], workouts: [benchWorkout] });
    const home = recommendTemplates([t], { equipment: ['dumbbell'], daysPerWeek: 3 }).picks[0];
    assert.deepEqual(home.notes, [COPY.days.needs(4), 'Also needs a squat rack and a bench']);
    const gym = recommendTemplates([t], { equipment: ['dumbbell', 'machine'], daysPerWeek: 3 }).picks[0];
    assert.deepEqual(gym.notes, [COPY.days.needs(4)]);
    assert.deepEqual(recommendTemplates([t], { daysPerWeek: 3 }).picks[0].notes, [COPY.days.needs(4)]);
  });

  test("gear: the line names only the card's version's gear, as its program page does", () => {
    // Full-Range Strength's step-up (the box) is in Full Range C, which the 2-day version drops.
    const frs = (days: number) => pickOf(recommendTemplates(STARTER_TEMPLATES, { goal: 'mobility', equipment: ['dumbbell'], daysPerWeek: days }), 'tpl_full_range_strength');
    assert.equal(frs(2).option.daysPerWeek, 2);
    assert.deepEqual(frs(2).notes, ['Also needs a bench']);
    assert.deepEqual(frs(3).notes, ['Also needs a bench and a box or step']);
  });

  test('ties: main goal before secondary, then the smaller day gap, then catalog order', () => {
    // Both score 7: secondary goal +3 with exact days +4, against main goal +6 with 2 days fewer +1.
    const secondary = tpl('secondary', { goals: ['strength', 'muscle'], days: [5] });
    const main = tpl('main', { goals: ['muscle'], days: [3] });
    const r = recommendTemplates([secondary, main], { goal: 'muscle', daysPerWeek: 5 });
    assert.deepEqual(r.picks.map((p) => [p.template.id, p.score]), [['main', 7], ['secondary', 7]]);

    // Both score 1 (2 or more days fewer); 5 days is the smaller gap from 7.
    const r2 = recommendTemplates([tpl('four', { days: [4] }), tpl('five', { days: [5] })], { daysPerWeek: 7 });
    assert.deepEqual(r2.picks.map((p) => [p.template.id, p.score]), [['five', 1], ['four', 1]]);

    const same = [tpl('x'), tpl('y'), tpl('z')];
    const ids = (ts: StarterTemplate[]) => recommendTemplates(ts, { daysPerWeek: 3 }).picks.map((p) => p.template.id);
    assert.deepEqual(ids(same), ['x', 'y', 'z']);
    assert.deepEqual(ids([...same].reverse()), ['z', 'y', 'x']);
  });

  test('an empty equipment list and an unset day count are skipped answers', () => {
    for (const a of [{ experience: 'beginner' as const, goal: 'muscle' as const, daysPerWeek: 3 }, { goal: 'strength' as const }, {}]) {
      assert.equal(fingerprint(recommendTemplates(STARTER_TEMPLATES, { ...a, equipment: [] })), fingerprint(recommendTemplates(STARTER_TEMPLATES, a)), show(a));
    }
    assert.equal(recommendTemplates(STARTER_TEMPLATES, { equipment: [] }).heading, 'start');
    assert.equal(recommendTemplates(STARTER_TEMPLATES, { daysPerWeek: 0 }).heading, 'start');
  });

  test('limit caps the picks; an empty catalog gives none', () => {
    assert.equal(recommendTemplates(STARTER_TEMPLATES, { goal: 'muscle' }, 1).picks.length, 1);
    assert.equal(recommendTemplates(STARTER_TEMPLATES, {}, 2).picks.length, 2);
    const none = recommendTemplates([], { goal: 'muscle' });
    assert.deepEqual(none.picks, []);
    assert.equal(none.heading, 'closest');
  });
});

describe('recommendation rules: golden rows', () => {
  test('23 rows, numbered in order, each with 1-3 picks', () => {
    assert.deepEqual(GOLDEN_ROWS.map((r) => r.n), Array.from({ length: 23 }, (_, i) => i + 1));
    assert.equal(new Set(GOLDEN_ROWS.map((r) => r.label)).size, GOLDEN_ROWS.length);
    for (const row of GOLDEN_ROWS) assert.ok(row.picks.length >= 1 && row.picks.length <= 3, row.label);
  });

  for (const row of GOLDEN_ROWS) {
    test(`row ${row.n}: ${row.label}`, () => {
      const r = recommendTemplates(STARTER_TEMPLATES, row.answers);
      assert.equal(r.heading, row.heading);
      assert.equal(r.title, COPY.heading[row.heading]);
      assert.equal(r.subtitle, row.subtitle);
      assert.deepEqual(
        r.picks.map((p) => ({ id: p.template.id, days: p.option.daysPerWeek, reasons: p.reasons, notes: p.notes })),
        row.picks,
      );
    });
  }

  test('the owner-facing rows say what the rules table says', () => {
    const row = (n: number) => GOLDEN_ROWS[n - 1];
    // Beginners who can train 5-7 days get beginner plans, with a neutral days line (owner's answer 4).
    assert.ok(row(2).picks.every((p) => p.days === 3 && p.reasons.includes('3 days a week, fits your schedule') && p.notes.length === 0));
    assert.ok(!row(2).picks.some((p) => p.id === 'tpl_ppl'));
    assert.deepEqual(row(1).picks[0].notes, ['Also needs a squat rack and a bench']);
    assert.deepEqual(row(14).picks[0].reasons, ['Built for muscle growth', '6 days a week, fits your schedule', 'Made for advanced lifters']);
    assert.ok(row(15).picks.every((p) => p.notes.length === 0 && !p.reasons.some((l) => EQUIPMENT_LINES.has(l))));
    assert.ok(row(16).picks.every((p) => p.reasons.length === 0 && p.notes.length === 0));
    assert.ok(row(20).picks.every((p) => p.reasons.length === 0 && p.notes[0] === 'Needs 2 days a week'));
  });
});

describe('recommendation rules: every answer combination', () => {
  const results = [...answerSpace()].map((a) => ({ a, r: recommendTemplates(STARTER_TEMPLATES, a) }));

  test('covers all 24,768 combinations', () => {
    assert.equal(results.length, 4 * 6 * 129 * 8);
  });

  test('every property in the rules table holds', () => {
    const problems: string[] = [];
    const fail = (a: RecommendAnswers, what: string) => problems.length < 20 && problems.push(`${show(a)}: ${what}`);

    for (const { a, r } of results) {
      const equipment = a.equipment?.length ? a.equipment : undefined;
      const days = a.daysPerWeek;
      const allSkipped = !a.experience && !a.goal && !equipment && days === undefined;
      const home = !!equipment && !equipment.some((e) => GYM_EQUIPMENT.includes(e));

      // 1-3 picks, no duplicates, never empty.
      if (r.picks.length < 1 || r.picks.length > RULES.limits.picks) fail(a, `${r.picks.length} picks`);
      if (new Set(r.picks.map((p) => p.template.id)).size !== r.picks.length) fail(a, 'duplicate picks');

      // Headings.
      if ((r.heading === 'start') !== allSkipped) fail(a, `heading ${r.heading}`);
      if (r.title !== COPY.heading[r.heading]) fail(a, 'title');
      if (allSkipped) {
        const first = STARTER_TEMPLATES.slice(0, 3).map((t) => t.id).join();
        if (r.picks.map((p) => p.template.id).join() !== first) fail(a, 'start picks are not the first three');
        if (r.subtitle !== COPY.body.start) fail(a, 'start body');
      } else {
        const { ids, goalFallback } = eligible(STARTER_TEMPLATES, a);
        if (r.goalFallback !== goalFallback) fail(a, 'goal fallback');
        if (r.picks.length !== Math.min(RULES.limits.picks, ids.size)) fail(a, `${r.picks.length} picks of ${ids.size} eligible`);
        for (const p of r.picks) if (!ids.has(p.template.id)) fail(a, `${p.template.id} isn't eligible`);
        const closest = goalFallback || !r.picks[0]?.reasons.length;
        if ((r.heading === 'closest') !== closest) fail(a, `heading ${r.heading}`);
        if (r.heading === 'fit' && !r.picks[0].reasons.length) fail(a, 'fit with no check line on the best match');
        const subtitle = r.heading === 'fit' ? COPY.body.fit : goalFallback ? COPY.body.goalFallback(a.goal as TrainingGoal) : COPY.body.noFit;
        if (r.subtitle !== subtitle) fail(a, 'subtitle');
      }

      // Best first.
      for (let i = 1; i < r.picks.length; i++) if (r.picks[i].score > r.picks[i - 1].score) fail(a, 'not sorted by score');

      for (const p of r.picks) {
        const t = p.template;
        const id = t.id;
        // Equipment: never a program missing a required item.
        if (equipment && !t.equipment.every((e) => e === 'bodyweight' || equipment.includes(e))) fail(a, `${id} needs equipment the user lacks`);
        // Experience: beginners only see beginner-suitable programs (owner's answer 4).
        if (a.experience === 'beginner' && !t.levels.includes('beginner')) fail(a, `${id} doesn't suit beginners`);
        if (a.experience && Math.min(...t.levels.map(levelIndex)) > levelIndex(a.experience)) fail(a, `${id} starts above the user's level`);
        if (a.experience === 'beginner' && p.option.daysPerWeek > 3) fail(a, `${id} runs ${p.option.daysPerWeek} days for a beginner`);
        // Day version: one of the template's, the rule's choice, and never 2 or more days beyond the answer.
        if (!templateDayOptions(t).some((o) => o.daysPerWeek === p.option.daysPerWeek && o.schedule === p.option.schedule)) fail(a, `${id}'s option isn't one of its versions`);
        if (p.option.daysPerWeek !== expectedVersion(t, days)) fail(a, `${id} took the ${p.option.daysPerWeek}-day version`);
        if (days !== undefined && p.option.daysPerWeek - days >= RULES.daysLeftOutAt) fail(a, `${id} needs 2 or more extra days`);

        // Lines: at most 3 check lines in order, at most 2 info lines (days, then gear).
        if (p.reasons.length > RULES.limits.checkLines) fail(a, `${id} has ${p.reasons.length} check lines`);
        if (p.notes.length > RULES.limits.infoLines) fail(a, `${id} has ${p.notes.length} info lines`);
        const kinds = p.reasons.map(kind);
        const order = kinds.map((k) => CHECK_ORDER.indexOf(k));
        if (order.some((o, i) => o < 0 || (i > 0 && o <= order[i - 1]))) fail(a, `${id} check lines out of order: ${kinds.join()}`);
        const noteKinds = p.notes.map(kind);
        const noteOrder = noteKinds.map((k) => INFO_ORDER.indexOf(k));
        if (noteOrder.some((o, i) => o < 0 || (i > 0 && o <= noteOrder[i - 1]))) fail(a, `${id} info lines out of order: ${noteKinds.join()}`);

        // Goal lines: main only for goals[0], secondary only for another listed goal, none in the fallback or when skipped.
        const goalLines = p.reasons.filter((l) => kind(l) === 'goal');
        const goal = a.goal;
        const expectedGoal = !goal || r.goalFallback || r.heading === 'start' ? [] : t.goals[0] === goal ? [COPY.goal.main[goal]] : t.goals.includes(goal) ? [COPY.goal.secondary[goal]] : ['(not eligible)'];
        if (goalLines.join() !== expectedGoal.join()) fail(a, `${id} goal lines ${goalLines.join()}`);

        // Days lines: "as you planned" only when answered and equal; nothing when skipped.
        const daysLines = [...p.reasons, ...p.notes].filter((l) => kind(l) === 'days' || kind(l) === 'needs');
        const v = p.option.daysPerWeek;
        const expectedDays = days === undefined ? [] : v === days ? [COPY.days.planned(v)] : v < days ? [COPY.days.fits(v)] : [COPY.days.needs(v)];
        if (daysLines.join() !== expectedDays.join()) fail(a, `${id} days lines ${daysLines.join()}`);
        if (p.notes.some((l) => kind(l) === 'days') || p.reasons.some((l) => kind(l) === 'needs' || kind(l) === 'gear')) fail(a, `${id} has a check mark on an info line`);

        // Experience lines.
        const expLines = p.reasons.filter((l) => kind(l) === 'experience');
        const exp = a.experience;
        const expectedExp = !exp ? [] : t.level === exp ? [COPY.experience.headline[exp]] : t.levels.includes(exp) ? [COPY.experience.inLevels[exp]] : [];
        if (expLines.join() !== expectedExp.join()) fail(a, `${id} experience lines ${expLines.join()}`);

        // Equipment lines: true when shown, and shown whenever there's room.
        const eqLines = p.reasons.filter((l) => kind(l) === 'equipment');
        const expectedEq = !equipment ? [] : [usesWeights(t) ? COPY.equipment.usesWeights : COPY.equipment.noWeights];
        const room = goalLines.length + daysLines.filter((l) => kind(l) === 'days').length + expLines.length < RULES.limits.checkLines;
        if (eqLines.join() !== (room ? expectedEq : []).join()) fail(a, `${id} equipment lines ${eqLines.join()}`);

        // Gear: only for home setups, and every item the card's version needs (its scheduled
        // workouts' exercises), which is the program's alsoNeeds or part of it.
        const gearLines = p.notes.filter((l) => kind(l) === 'gear');
        const s = p.option.schedule;
        const scheduled = new Set(s.type === 'rotating' ? s.sequence : s.days.flatMap((d) => d.workoutIds));
        const versionGear = gearForExercises(t.workouts.filter((w) => scheduled.has(w.id)).flatMap((w) => w.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId))));
        if (versionGear.some((g) => !(t.alsoNeeds ?? []).includes(g))) fail(a, `${id}'s version needs gear its alsoNeeds leaves out`);
        const expectedGear = home && versionGear.length ? [COPY.alsoNeeds(gearList(versionGear))] : [];
        if (gearLines.join() !== expectedGear.join()) fail(a, `${id} gear lines ${gearLines.join()}`);
      }
    }
    assert.deepEqual(problems, []);
  });

  test('the same answers always give the same picks', () => {
    for (const { a, r } of results) assert.equal(fingerprint(recommendTemplates(STARTER_TEMPLATES, a)), fingerprint(r), show(a));
  });

  test('a beginner answering 5-7 days gets beginner plans of 2-3 days with a neutral days line', () => {
    let checked = 0;
    for (const { a, r } of results) {
      if (a.experience !== 'beginner' || a.daysPerWeek === undefined || a.daysPerWeek < 5) continue;
      for (const p of r.picks) {
        checked++;
        assert.ok(p.template.levels.includes('beginner'), show(a));
        assert.ok(p.option.daysPerWeek <= 3, show(a));
        assert.ok(p.reasons.includes(COPY.days.fits(p.option.daysPerWeek)), show(a));
        assert.ok(!p.notes.some((l) => DAYS_NEEDS.test(l)), show(a));
      }
    }
    assert.ok(checked > 0);
  });

  test('every line shown is plain text of 60 characters or fewer; the gear line lists every item', () => {
    const lines = new Set<string>();
    for (const { r } of results) for (const p of r.picks) for (const l of [...p.reasons, ...p.notes]) lines.add(l);
    for (const line of lines) {
      assert.notEqual(kind(line), 'unknown', line);
      assert.deepEqual(copyProblems(line), [], line);
      // Gear lines are the one exception to the 60-character limit: cutting them would hide gear
      // the program needs. The longest in the catalog (Calisthenics Strength) is 73.
      const max = kind(line) === 'gear' ? 80 : RULES.limits.lineChars;
      assert.ok(line.length <= max, `${line} (${line.length} characters)`);
    }
  });
});

describe('recommendation rules: review profiles', () => {
  test('six equipment setups, the last one skipped', () => {
    assert.equal(REVIEW_PROFILES.length, 6);
    assert.equal(new Set(REVIEW_PROFILES.map((p) => p.key)).size, 6);
    assert.deepEqual(REVIEW_PROFILES[0].equipment, FULL_GYM);
    assert.equal(REVIEW_PROFILES[5].equipment, undefined);
    for (const p of REVIEW_PROFILES) assert.deepEqual(copyProblems(p.label), [], p.label);
  });

  test('every cell of the review table (profile × goal × experience × days 1-7) has a best match', () => {
    let cells = 0;
    for (const profile of REVIEW_PROFILES) {
      for (const goal of TRAINING_GOALS) {
        for (const experience of EXPERIENCE_LEVELS) {
          for (let daysPerWeek = 1; daysPerWeek <= 7; daysPerWeek++) {
            const r = recommendTemplates(STARTER_TEMPLATES, { experience, goal, equipment: profile.equipment ? [...profile.equipment] : undefined, daysPerWeek });
            assert.ok(r.picks.length > 0, `${profile.key} ${goal} ${experience} ${daysPerWeek}`);
            cells++;
          }
        }
      }
    }
    assert.equal(cells, 630);
  });
});

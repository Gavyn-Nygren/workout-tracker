import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { OnboardingAnswers } from '../src/data/types';
import {
  canContinueWithHeight,
  continueStep,
  DAYS_DRAFT,
  emptyAnswers,
  HEIGHT_LIMITS,
  heightFromField,
  heightLabel,
  heightProblem,
  heightUnit,
  isPlausibleHeight,
  ONBOARDING_STEPS,
  skipStep,
} from '../src/features/onboarding/draft';
import { recommendTemplates } from '../src/features/onboarding/recommend';
import { STARTER_TEMPLATES } from '../src/data/content/templates';

const answered = (): OnboardingAnswers => ({
  experience: 'intermediate',
  goal: 'muscle',
  equipment: ['barbell', 'dumbbell'],
  daysPerWeek: 4,
  heightIn: 70,
  limitations: ['Knees'],
  limitationNote: 'avoid deep lunges',
});
const drafts = { days: DAYS_DRAFT, height: undefined, units: 'imperial' as const };

describe('Onboarding draft: where the questions start', () => {
  test('nothing is answered, so every matching question counts as skipped', () => {
    assert.deepEqual(emptyAnswers(), { limitations: [], limitationNote: '' });
    assert.equal(recommendTemplates(STARTER_TEMPLATES, emptyAnswers()).heading, 'start');
  });

  test('a fresh draft each time, so one setup never edits another', () => {
    const a = emptyAnswers();
    a.limitations.push('Knees');
    assert.deepEqual(emptyAnswers().limitations, []);
  });

  test('the days stepper starts at 3, and the steps are in order', () => {
    assert.equal(DAYS_DRAFT, 3);
    assert.deepEqual([...ONBOARDING_STEPS], ['experience', 'goal', 'equipment', 'days', 'body', 'limits']);
  });
});

describe('Onboarding draft: Skip clears its question', () => {
  test('each step clears only its own answer', () => {
    const a = answered();
    const minus = (key: keyof OnboardingAnswers) => Object.fromEntries(Object.entries(answered()).filter(([k]) => k !== key));
    assert.deepEqual(skipStep(a, 'experience'), minus('experience'));
    assert.deepEqual(skipStep(a, 'goal'), minus('goal'));
    assert.deepEqual(skipStep(a, 'equipment'), minus('equipment'));
    assert.deepEqual(skipStep(a, 'days'), minus('daysPerWeek'));
    assert.deepEqual(skipStep(a, 'body'), minus('heightIn'));
    assert.deepEqual(skipStep(a, 'limits'), { ...answered(), limitations: [], limitationNote: '' });
    // The original is left as it was.
    assert.deepEqual(a, answered());
  });

  test('skipping every matching question after answering them gives the skipped heading', () => {
    let a = answered();
    for (const step of ONBOARDING_STEPS) a = skipStep(a, step);
    assert.deepEqual(a, emptyAnswers());
    assert.equal(recommendTemplates(STARTER_TEMPLATES, a).heading, 'start');
  });

  test('a skipped answer is gone from the saved form too', () => {
    const saved = JSON.parse(JSON.stringify(skipStep(answered(), 'goal'))) as OnboardingAnswers;
    assert.equal(saved.goal, undefined);
    assert.equal(saved.experience, 'intermediate');
  });
});

describe('Onboarding draft: Continue', () => {
  test('equipment with no chip selected counts as skipped', () => {
    assert.equal('equipment' in continueStep({ ...answered(), equipment: [] }, 'equipment', drafts), false);
    assert.deepEqual(continueStep(answered(), 'equipment', drafts).equipment, ['barbell', 'dumbbell']);
  });

  test('the days draft is written only on Continue', () => {
    const a = skipStep(answered(), 'days');
    assert.equal(a.daysPerWeek, undefined);
    assert.equal(continueStep(a, 'days', { ...drafts, days: 5 }).daysPerWeek, 5);
    assert.equal(continueStep(a, 'days', drafts).daysPerWeek, 3);
  });

  test('height is stored in inches, from inches or centimetres', () => {
    assert.equal(continueStep(emptyAnswers(), 'body', { ...drafts, height: 70 }).heightIn, 70);
    assert.equal(continueStep(emptyAnswers(), 'body', { ...drafts, height: 180, units: 'metric' }).heightIn, 70.9);
  });

  test('an empty or out-of-range height is not stored', () => {
    assert.equal('heightIn' in continueStep(answered(), 'body', drafts), false);
    assert.equal('heightIn' in continueStep(answered(), 'body', { ...drafts, height: 180 }), false);
    assert.equal('heightIn' in continueStep(answered(), 'body', { ...drafts, height: 50, units: 'metric' }), false);
  });

  test('the other steps write as they are tapped, so Continue leaves them alone', () => {
    for (const step of ['experience', 'goal', 'limits'] as const) assert.deepEqual(continueStep(answered(), step, drafts), answered());
  });
});

describe('Onboarding draft: height follows the units setting', () => {
  test('labels and units', () => {
    assert.equal(heightLabel('imperial'), 'Height in inches');
    assert.equal(heightLabel('metric'), 'Height in centimetres');
    assert.equal(heightUnit('imperial'), 'in');
    assert.equal(heightUnit('metric'), 'cm');
  });

  test('the range is 36-96 in or 91-244 cm, ends included', () => {
    assert.deepEqual(HEIGHT_LIMITS, { imperial: { min: 36, max: 96 }, metric: { min: 91, max: 244 } });
    for (const [value, ok] of [[35, false], [36, true], [70, true], [96, true], [97, false]] as const) assert.equal(isPlausibleHeight(value, 'imperial'), ok, `${value} in`);
    for (const [value, ok] of [[90, false], [91, true], [178, true], [244, true], [245, false]] as const) assert.equal(isPlausibleHeight(value, 'metric'), ok, `${value} cm`);
    assert.equal(isPlausibleHeight(undefined, 'metric'), false);
    assert.equal(isPlausibleHeight(Number.NaN, 'metric'), false);
  });

  test('centimetres convert to inches to 0.1', () => {
    assert.equal(heightFromField(70, 'imperial'), 70);
    assert.equal(heightFromField(254, 'metric'), 100);
    assert.equal(heightFromField(178, 'metric'), 70.1);
  });

  test('the message waits while a too-small number is still being typed', () => {
    assert.equal(heightProblem(undefined, 'imperial'), undefined);
    assert.equal(heightProblem(70, 'imperial'), undefined);
    assert.equal(heightProblem(18, 'metric', { editing: true }), undefined);
    assert.equal(heightProblem(18, 'metric'), 'Enter a height between 91 and 244 cm.');
    assert.equal(heightProblem(300, 'metric', { editing: true }), 'Enter a height between 91 and 244 cm.');
    assert.equal(heightProblem(100, 'imperial'), 'Enter a height between 36 and 96 in.');
  });

  test('Continue: an empty field or a height in range', () => {
    assert.equal(canContinueWithHeight(undefined, 'metric'), true);
    assert.equal(canContinueWithHeight(178, 'metric'), true);
    assert.equal(canContinueWithHeight(70, 'metric'), false);
    assert.equal(canContinueWithHeight(70, 'imperial'), true);
  });
});

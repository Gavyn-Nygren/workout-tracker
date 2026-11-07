// The words the cycle editor and the schedule grid use for a rotating plan's days (owner's pick:
// day rows with chips, a Reorder mode that can delete a day, and pills that list each day's workouts).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { cycleDayNames, cycleDaySubtitle, cycleDayTitle, deleteDayPrompt, nameList } from '../src/features/plans/cycleLabels';
import { cycle } from './support/cycles';

const names = new Map([
  ['push', 'Push'],
  ['cardio', 'Cardio'],
  ['legs', 'Legs'],
  ['core', 'Core'],
]);

describe('cycle day names', () => {
  test('lists a day in its stored order, and a workout the plan lost reads "Workout"', () => {
    assert.deepEqual(cycleDayNames({ workoutIds: ['cardio', 'push'] }, names), ['Cardio', 'Push']);
    assert.deepEqual(cycleDayNames({ workoutIds: ['push', 'gone'] }, names), ['Push', 'Workout']);
    assert.deepEqual(cycleDayNames({ workoutIds: [] }, names), []);
  });

  test('titles join with " + ", and a rest day is "Rest"', () => {
    assert.equal(cycleDayTitle(['Push', 'Cardio']), 'Push + Cardio');
    assert.equal(cycleDayTitle(['Legs']), 'Legs');
    assert.equal(cycleDayTitle([]), 'Rest');
  });

  test('spoken lists read like a sentence, never "plus"', () => {
    assert.equal(nameList([]), '');
    assert.equal(nameList(['Push']), 'Push');
    assert.equal(nameList(['Push', 'Cardio']), 'Push and Cardio');
    assert.equal(nameList(['Push', 'Cardio', 'Core']), 'Push, Cardio and Core');
  });
});

describe('Reorder row subtitles', () => {
  test('a double day shows its count, a single day only its number, a rest day "Recovery"', () => {
    assert.equal(cycleDaySubtitle(0, 2), 'Day 1 · 2 workouts');
    assert.equal(cycleDaySubtitle(2, 3), 'Day 3 · 3 workouts');
    assert.equal(cycleDaySubtitle(1, 1), 'Day 2');
    assert.equal(cycleDaySubtitle(2, 0), 'Day 3 · Recovery');
  });
});

describe('deleting a cycle day asks first', () => {
  // Push + Cardio, Legs, Rest, Push + Core
  const steps = cycle(['push', 'cardio'], ['legs'], [], ['push', 'core']).steps;

  test('names the workouts that leave the cycle, and says the later days move up', () => {
    assert.deepEqual(deleteDayPrompt(steps, 1, names), { title: 'Delete Day 2?', message: "Legs comes off the cycle but stays in the plan. Later days move up one day, so what's scheduled from today on changes." });
  });

  test('a workout still on another day is not named, since it stays in the cycle', () => {
    // Push is on Day 4 too; only Cardio leaves.
    assert.equal(deleteDayPrompt(steps, 0, names).message, "Cardio comes off the cycle but stays in the plan. Later days move up one day, so what's scheduled from today on changes.");
    const both = cycle(['push', 'cardio'], ['legs'], ['push', 'cardio']).steps;
    assert.equal(deleteDayPrompt(both, 0, names).message, "Later days move up one day, so what's scheduled from today on changes.");
  });

  test('two workouts leaving read as a list', () => {
    const doubles = cycle(['push', 'cardio'], ['legs']).steps;
    assert.equal(deleteDayPrompt(doubles, 0, names).message, "Push and Cardio come off the cycle but stay in the plan. Later days move up one day, so what's scheduled from today on changes.");
  });

  test('a rest day only mentions the days after it', () => {
    assert.deepEqual(deleteDayPrompt(steps, 2, names), { title: 'Delete Day 3?', message: "Later days move up one day, so what's scheduled from today on changes." });
  });

  test('the last day has no later days, so the cycle just gets shorter', () => {
    assert.equal(deleteDayPrompt(steps, 3, names).message, "Core comes off the cycle but stays in the plan. The cycle gets one day shorter, so what's scheduled from today on changes.");
    assert.equal(deleteDayPrompt(cycle(['legs'], []).steps, 1, names).message, "The cycle gets one day shorter, so what's scheduled from today on changes.");
  });
});

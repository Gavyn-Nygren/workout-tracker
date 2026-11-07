import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { BodyweightEntry } from '../src/data/types';
import { lbToKg } from '../src/data/units';
import { bigChangeFrom } from '../src/features/progress/bodyweight';
import {
  bigChangeMessage,
  canContinueWithWeight,
  canSaveWeight,
  dateForChoice,
  dayChoiceOf,
  replaceQuestion,
  replacesHint,
  rollDayChoice,
  weighInChange,
  weighInRows,
  weightForField,
  weightFromField,
  weightProblem,
} from '../src/features/progress/logWeight';

const today = '2026-10-29';
const weighIn = (date: string, weightKg: number, id = `bw_${date}`): BodyweightEntry => ({ id, date, weightKg, createdAt: `${date}T07:00:00Z`, updatedAt: `${date}T07:00:00Z` });

describe('Log weight: the day', () => {
  test('today, yesterday, or another day', () => {
    assert.equal(dayChoiceOf('2026-10-29', today), 'today');
    assert.equal(dayChoiceOf('2026-10-28', today), 'yesterday');
    assert.equal(dayChoiceOf('2026-10-12', today), 'other');
  });

  test('a choice gives its date; a picked date is never in the future', () => {
    assert.equal(dateForChoice('today', '2026-10-01', today), today);
    assert.equal(dateForChoice('yesterday', '2026-10-01', today), '2026-10-28');
    assert.equal(dateForChoice('other', '2026-10-01', today), '2026-10-01');
    assert.equal(dateForChoice('other', '2026-11-02', today), today);
  });

  test('fixing a weigh-in past midnight keeps its date, relabelled for the new day', () => {
    // Opened on Oct 28 for that day's weigh-in ("Today"); saved on Oct 29.
    assert.deepEqual(rollDayChoice('today', '2026-10-26', '2026-10-28', today), { choice: 'yesterday', picked: '2026-10-26' });
    const yesterday = rollDayChoice('yesterday', '2026-10-26', '2026-10-28', today);
    assert.deepEqual(yesterday, { choice: 'other', picked: '2026-10-27' });
    assert.deepEqual(rollDayChoice('other', '2026-10-20', '2026-10-28', today), { choice: 'other', picked: '2026-10-20' });
    // So an untouched Save changes nothing.
    const entry = weighIn('2026-10-28', 80);
    const rolled = rollDayChoice(dayChoiceOf(entry.date, '2026-10-28'), '2026-10-26', '2026-10-28', today);
    assert.deepEqual(weighInChange(entry, { date: dateForChoice(rolled.choice, rolled.picked, today), value: 80 }, 'metric'), {});
  });
});

describe('Log weight: typo guard', () => {
  test('Save is off outside a plausible weight, with the range as the reason', () => {
    assert.equal(canSaveWeight(undefined, 'metric'), false);
    assert.equal(weightProblem(undefined, 'metric'), undefined);
    assert.equal(canSaveWeight(80, 'metric'), true);
    assert.equal(weightProblem(80, 'metric'), undefined);
    assert.equal(canSaveWeight(25, 'metric'), true);
    assert.equal(canSaveWeight(350, 'metric'), true);
    assert.equal(canSaveWeight(18, 'metric'), false);
    assert.equal(weightProblem(18, 'metric'), 'Enter a weight between 25 and 350 kg.');
    assert.equal(weightProblem(1805, 'imperial'), 'Enter a weight between 55 and 770 lb.');
    assert.equal(canSaveWeight(180.5, 'imperial'), true);
  });

  test('while typing, a weight still too small isn’t called out yet; too big is', () => {
    // Typing 180 lb passes through 1 and 18.
    assert.equal(weightProblem(1, 'imperial', { editing: true }), undefined);
    assert.equal(weightProblem(18, 'imperial', { editing: true }), undefined);
    assert.equal(weightProblem(18, 'imperial'), 'Enter a weight between 55 and 770 lb.', 'once typing ends');
    assert.equal(weightProblem(8, 'metric', { editing: true }), undefined);
    assert.equal(weightProblem(1800, 'imperial', { editing: true }), 'Enter a weight between 55 and 770 lb.');
    assert.equal(weightProblem(180, 'imperial', { editing: true }), undefined);
    assert.equal(canSaveWeight(18, 'imperial'), false, 'Save stays off either way');
  });

  test('onboarding: Continue skips an empty field, and is off for an implausible weight', () => {
    assert.equal(canContinueWithWeight(undefined, 'imperial'), true);
    assert.equal(canContinueWithWeight(180, 'imperial'), true);
    assert.equal(canContinueWithWeight(1800, 'imperial'), false);
    assert.equal(canContinueWithWeight(8, 'metric'), false);
    assert.equal(canContinueWithWeight(0, 'metric'), false);
  });

  test('"Save anyway?" says how far it is from the weigh-in before it', () => {
    const entries = [weighIn('2026-10-20', lbToKg(162.4))];
    const big = bigChangeFrom(entries, { date: '2026-10-28', weightKg: lbToKg(182) });
    assert.ok(big);
    assert.equal(bigChangeMessage(big, 'imperial', today), 'That’s 12% more than 162.4 lb on Oct 20.');
    const lighter = bigChangeFrom([weighIn('2025-12-01', 90)], { date: '2026-01-05', weightKg: 75 })!;
    assert.equal(bigChangeMessage(lighter, 'metric', today), 'That’s 17% less than 90 kg on Dec 1, 2025.');
  });

  test('the hint and the confirm for a day that already has a weigh-in', () => {
    const existing = weighIn('2026-10-20', lbToKg(181.4));
    assert.equal(replacesHint(existing, 'imperial'), 'This replaces 181.4 lb logged that day.');
    assert.deepEqual(replaceQuestion(existing, 'imperial', today), {
      title: 'Replace the weigh-in on Tue, Oct 20?',
      message: 'That day has 181.4 lb. Only one weigh-in per day is kept.',
    });
  });
});

describe('Log weight: fixing a weigh-in', () => {
  const entry = weighIn('2026-10-20', 81.65);

  test('the field shows the weight in the user unit, to 0.1', () => {
    assert.equal(weightForField(81.65, 'imperial'), 180);
    assert.equal(weightForField(81.65, 'metric'), 81.7);
    assert.equal(weightFromField(180, 'imperial'), lbToKg(180));
  });

  test('nothing changed: nothing to save', () => {
    assert.deepEqual(weighInChange(entry, { date: entry.date, value: 180 }, 'imperial'), {});
  });

  test('a new day only: the stored weight stays exactly as it was', () => {
    assert.deepEqual(weighInChange(entry, { date: '2026-10-21', value: 180 }, 'imperial'), { date: '2026-10-21' });
  });

  test('a weigh-in dated after today (logged before a flight west) keeps its date', () => {
    const ahead = weighIn('2026-10-30', 80);
    // As the sheet opens it: another day, picked on its own date.
    const choice = dayChoiceOf(ahead.date, today);
    assert.equal(choice, 'other');
    const date = dateForChoice(choice, ahead.date, today, ahead.date);
    assert.equal(date, ahead.date);
    assert.deepEqual(weighInChange(ahead, { date, value: 79.5 }, 'metric'), { weightKg: 79.5 });
    assert.deepEqual(weighInChange(ahead, { date, value: 80 }, 'metric'), {});
    // Any other day after today is still today, as is a new weigh-in's.
    assert.equal(dateForChoice('other', '2026-10-31', today, ahead.date), today);
    assert.equal(dateForChoice('other', ahead.date, today), today);
    // Past midnight it stays on its day, which is now Today.
    assert.deepEqual(rollDayChoice('other', ahead.date, today, '2026-10-30', ahead.date), { choice: 'today', picked: ahead.date });
  });

  test('a new weight: converted from the user unit', () => {
    assert.deepEqual(weighInChange(entry, { date: entry.date, value: 178.5 }, 'imperial'), { weightKg: lbToKg(178.5) });
    assert.deepEqual(weighInChange(entry, { date: '2026-10-19', value: 80 }, 'metric'), { date: '2026-10-19', weightKg: 80 });
  });
});

describe('Bodyweight log rows', () => {
  const entries = [weighIn('2026-10-27', 80), weighIn('2026-10-29', 79.62), weighIn('2026-10-28', 79.6), weighIn('2025-12-30', 82)];

  test('newest first, each with its change from the weigh-in before it', () => {
    const rows = weighInRows(entries, 'metric', today);
    assert.deepEqual(
      rows.map((r) => [r.dateText, r.valueText, r.deltaText]),
      [
        ['Thu, Oct 29', '79.6 kg', 'No change'],
        ['Wed, Oct 28', '79.6 kg', '−0.4 kg'],
        ['Tue, Oct 27', '80 kg', '−2 kg'],
        ['Tue, Dec 30, 2025', '82 kg', undefined],
      ],
    );
  });

  test('VoiceOver reads the date, the weight and the change', () => {
    const rows = weighInRows(entries, 'metric', today);
    assert.equal(rows[0].accessibilityLabel, 'Thursday, October 29: 79.6 kilograms, the same as the previous weigh-in');
    assert.equal(rows[1].accessibilityLabel, 'Wednesday, October 28: 79.6 kilograms, down 0.4 kilograms from the previous weigh-in');
    assert.equal(rows[3].accessibilityLabel, 'Tuesday, December 30, 2025: 82 kilograms');
  });

  test('in lb', () => {
    const rows = weighInRows([weighIn('2026-10-28', lbToKg(180)), weighIn('2026-10-29', lbToKg(181.2))], 'imperial', today);
    assert.deepEqual(
      rows.map((r) => [r.valueText, r.deltaText]),
      [
        ['181.2 lb', '+1.2 lb'],
        ['180 lb', undefined],
      ],
    );
  });
});

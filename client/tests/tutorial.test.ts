// The tour's copy and art data (spec 2.4 Tour, G3.13): five cards in spec order, plain words in
// the length limits, a pitch that names every card, both form variants, and an illustration that
// shows a real starter workout with its real minutes and working sets.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { STARTER_TEMPLATES } from '../src/data/content/templates';
import {
  FORM_PREVIEW_LINE,
  FORM_UNSUPPORTED_BODY,
  spokenTourCard,
  TOUR_ART,
  TOUR_CARDS,
  TOUR_FROM_ONBOARDING,
  TOUR_PITCH,
  tourArtLoad,
  tourCardText,
  tourLastButton,
  tourTodayArt,
  tourTodayMeta,
} from '../src/data/content/tutorial';
import { copyProblems } from '../src/data/content/validateTemplates';
import type { StarterTemplate } from '../src/data/types';
import { FORM_ANALYSIS_PREVIEW } from '../src/features/form/preview';

const words = (text: string) => text.trim().split(/\s+/).length;
const card = (key: string) => {
  const found = TOUR_CARDS.find((c) => c.key === key);
  assert.ok(found, `no ${key} card`);
  return found;
};

describe('tour cards', () => {
  test('exactly five, in spec order', () => {
    assert.deepEqual(
      TOUR_CARDS.map((c) => c.key),
      ['today', 'log', 'form', 'progress', 'goals'],
    );
  });

  test('titles are unique and 32 characters or fewer; bodies are 32 words or fewer', () => {
    assert.equal(new Set(TOUR_CARDS.map((c) => c.title)).size, TOUR_CARDS.length);
    for (const c of TOUR_CARDS) {
      assert.ok(c.title.length <= 32, `${c.key} title is ${c.title.length} characters`);
      assert.ok(words(c.body) <= 32, `${c.key} body is ${words(c.body)} words`);
    }
    assert.ok(words(FORM_UNSUPPORTED_BODY) <= 32);
    // The preview line sits under a full body, so the two together stay readable.
    assert.ok(words(card('form').body) + words(FORM_PREVIEW_LINE) <= 40);
  });

  test('every text is plain: no emoji, no "!", no brand or injury words, and ends with a full stop', () => {
    const texts = [...TOUR_CARDS.flatMap((c) => [c.title, c.body]), FORM_PREVIEW_LINE, FORM_UNSUPPORTED_BODY, TOUR_PITCH];
    for (const text of texts) assert.deepEqual(copyProblems(text), [], text);
    for (const text of [...TOUR_CARDS.map((c) => c.body), FORM_PREVIEW_LINE, FORM_UNSUPPORTED_BODY, TOUR_PITCH]) {
      assert.match(text, /\.$/, text);
    }
    for (const c of TOUR_CARDS) assert.doesNotMatch(c.title, /[.!?]$/, c.title);
  });

  test('the pitch names every card, in card order', () => {
    let from = 0;
    for (const c of TOUR_CARDS) {
      const at = TOUR_PITCH.indexOf(c.topic, from);
      assert.ok(at >= 0, `the pitch doesn't name "${c.topic}" (after position ${from})`);
      from = at + c.topic.length;
    }
    assert.match(TOUR_PITCH, /^Five short cards/);
    assert.equal(TOUR_CARDS.length, 5);
    assert.match(TOUR_PITCH, /Profile → About/);
  });

  test('the form card names the V1 lifts and says the video stays on the phone', () => {
    const body = card('form').body;
    for (const lift of ['squats', 'lunges', 'deadlifts', 'calf raises']) assert.ok(body.includes(lift), lift);
    assert.match(body, /video stays on your phone/);
  });
});

describe('the form card variants', () => {
  const form = card('form');

  test('a supported phone gets the V1 body, plus the preview line while the flag is on', () => {
    assert.deepEqual(tourCardText(form, { formSupported: true, preview: true }), { title: form.title, body: form.body, note: FORM_PREVIEW_LINE });
    assert.deepEqual(tourCardText(form, { formSupported: true, preview: false }), { title: form.title, body: form.body, note: undefined });
  });

  test('an older phone gets its own body and no preview line, still as the third of five cards', () => {
    for (const preview of [true, false]) {
      assert.deepEqual(tourCardText(form, { formSupported: false, preview }), { title: form.title, body: FORM_UNSUPPORTED_BODY });
    }
    assert.notEqual(FORM_UNSUPPORTED_BODY, form.body);
    assert.match(FORM_UNSUPPORTED_BODY, /iPhone 12 or newer/);
    assert.equal(TOUR_CARDS.indexOf(form), 2);
  });

  test('the other cards never change with the phone or the flag', () => {
    for (const c of TOUR_CARDS.filter((x) => x.key !== 'form')) {
      for (const formSupported of [true, false]) {
        for (const preview of [true, false]) assert.deepEqual(tourCardText(c, { formSupported, preview }), { title: c.title, body: c.body });
      }
    }
  });

  test('the preview build has the flag on (switched off at G4.3)', () => {
    assert.equal(FORM_ANALYSIS_PREVIEW, true);
    assert.match(FORM_PREVIEW_LINE, /preview/);
  });
});

describe('VoiceOver label', () => {
  test('reads the position, then the visible words, the preview line included', () => {
    const text = tourCardText(card('form'), { formSupported: true, preview: true });
    assert.equal(spokenTourCard(2, 5, text), `3 of 5. Film a set, track your form. ${card('form').body} ${FORM_PREVIEW_LINE}`);
    assert.equal(spokenTourCard(0, 5, tourCardText(card('today'), { formSupported: true, preview: true })), `1 of 5. Your plan, day by day. ${card('today').body}`);
  });
});

describe('last button', () => {
  test("'Start training' from onboarding, 'Done' from Profile → About or anywhere else", () => {
    assert.equal(tourLastButton(TOUR_FROM_ONBOARDING), 'Start training');
    assert.equal(tourLastButton('onboarding'), 'Start training');
    assert.equal(tourLastButton(['onboarding']), 'Start training');
    assert.equal(tourLastButton(undefined), 'Done');
    assert.equal(tourLastButton('about'), 'Done');
    assert.equal(tourLastButton(''), 'Done');
  });
});

describe('the Today illustration', () => {
  const template = STARTER_TEMPLATES.find((t) => t.id === TOUR_ART.templateId);
  const workout = template?.workouts.find((w) => w.name === TOUR_ART.workoutName);

  test('shows a real starter program and one of its workouts', () => {
    assert.ok(template, `${TOUR_ART.templateId} isn't in STARTER_TEMPLATES`);
    assert.ok(workout, `${template.name} has no workout named ${TOUR_ART.workoutName}`);
    assert.equal(template.name, 'Full-Body Foundations');
    assert.deepEqual(tourTodayArt(), { programName: template.name, workoutName: workout.name, meta: tourTodayMeta() });
  });

  test("its meta line is the workout's real minutes and working sets", () => {
    assert.ok(workout?.estimatedMinutes, 'the workout has no time estimate');
    const workingSets = workout.blocks.flatMap((b) => b.exercises).flatMap((e) => e.sets).filter((s) => s.kind !== 'warmup').length;
    assert.equal(tourTodayMeta(), `~${workout.estimatedMinutes} min · ${workingSets} working sets`);
  });

  test('counts every set but warm-ups, and leaves out minutes the workout has none of', () => {
    const fixture: StarterTemplate = {
      ...STARTER_TEMPLATES[0],
      id: TOUR_ART.templateId,
      name: 'Fixture',
      workouts: [
        {
          id: 'tw_x',
          name: TOUR_ART.workoutName,
          blocks: [
            {
              id: 'tb_x',
              type: 'single',
              exercises: [
                {
                  id: 'tp_x',
                  exerciseId: 'ex_leg_press',
                  sets: [
                    { kind: 'warmup', modifiers: [], targetReps: 10 },
                    { kind: 'normal', modifiers: [], targetReps: { min: 8, max: 12 } },
                    { kind: 'drop', modifiers: [], targetReps: 12 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    assert.equal(tourTodayMeta([fixture]), '2 working sets');
    assert.equal(tourTodayMeta([{ ...fixture, workouts: [{ ...fixture.workouts[0], estimatedMinutes: 35 }] }]), '~35 min · 2 working sets');
    assert.equal(tourTodayMeta([{ ...fixture, workouts: [{ ...fixture.workouts[0], name: 'Other' }] }]), undefined);
    assert.equal(tourTodayArt([]), undefined);
  });
});

describe('illustration weights', () => {
  test('stay as written in pounds', () => {
    assert.equal(tourArtLoad(275, 'imperial'), 275);
    assert.equal(tourArtLoad(338, 'imperial'), 338);
  });

  test('convert to kilograms rounded to 2.5', () => {
    assert.equal(tourArtLoad(275, 'metric'), 125);
    assert.equal(tourArtLoad(338, 'metric'), 152.5);
    assert.equal(tourArtLoad(0, 'metric'), 0);
    assert.equal(tourArtLoad(45, 'metric'), 20);
    for (const lb of [95, 135, 185, 225, 315, 405]) {
      const kg = tourArtLoad(lb, 'metric');
      assert.equal(kg % 2.5, 0, `${lb} lb → ${kg} kg`);
      assert.ok(Math.abs(kg - lb * 0.45359237) <= 1.25, `${lb} lb → ${kg} kg`);
    }
  });
});

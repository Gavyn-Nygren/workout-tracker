import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { builtinExercises } from '../src/data/content';
import { defaultPreferences } from '../src/data/preferences';
import type { LoggedSet, OnboardingAnswers, WorkoutSession } from '../src/data/types';
import { everythingJson, workoutsCsv } from '../src/features/settings/exportData';

const exercisesById = new Map(builtinExercises.map((e) => [e.id, e]));

let nextId = 0;
const set = (patch: Partial<LoggedSet> = {}): LoggedSet => ({ id: `set${nextId++}`, kind: 'normal', modifiers: [], completedAt: '2026-10-01T10:00:00Z', ...patch });
const session = (day: string, name: string, patch: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: `sess_${day}_${nextId++}`,
  name,
  status: 'completed',
  completion: 'full',
  completedDate: day,
  startedAt: `${day}T09:00:00Z`,
  completedAt: `${day}T10:00:00Z`,
  blocks: [{ id: 'b', type: 'single', exercises: [{ id: `entry${nextId++}`, exerciseId: 'ex_back_squat', skipped: false, sets: [set({ loadKg: 100, reps: 5 })] }] }],
  createdAt: `${day}T09:00:00Z`,
  updatedAt: `${day}T10:00:00Z`,
  ...patch,
});

const nothing = { preferences: defaultPreferences, exercises: [], plans: [], sessions: [], bodyweight: [], goals: [], formReports: [] };

describe('data export (spec 2.3)', () => {
  test('the JSON export includes the onboarding answers kept on the phone', () => {
    const onboarding: OnboardingAnswers = { experience: 'intermediate', goal: 'strength', heightIn: 70, limitations: ['Knees', 'Lower back'], limitationNote: 'avoid deep lunges' };
    const exported = JSON.parse(everythingJson({ ...nothing, onboarding })) as { onboarding?: OnboardingAnswers; version: number };
    assert.deepEqual(exported.onboarding, onboarding);
    assert.equal(exported.version, 2);
  });

  test('the workouts CSV keeps a workout that is reopened for editing (data/reopen.ts)', () => {
    const finished = session('2026-10-06', 'Upper');
    // Reopened: in progress again, with its completion time and date kept.
    const reopened = session('2026-10-08', 'Lower', { status: 'in_progress' });
    // A workout that was never finished stays out.
    const open = session('2026-10-09', 'Full body', { status: 'in_progress', completedAt: undefined, completedDate: undefined });
    const rows = workoutsCsv([reopened, open, finished], exercisesById, [], 'metric').split('\n').slice(1);
    assert.deepEqual(
      rows.map((r) => r.split(',').slice(0, 2).join(',')),
      ['2026-10-06,Upper', '2026-10-08,Lower'],
    );
  });
});

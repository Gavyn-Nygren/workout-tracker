import { fakeExercises } from './fake/exercises';
import { fakeTemplates } from './fake/plans';
import type { Exercise, StarterTemplate } from './types';

/**
 * Content that ships with the app rather than living in the user's database: the built-in
 * exercise library and the starter templates. Built-in ids are stable, so logged sets and plans
 * can point at them. G3.2 replaces the sample library with the full 150-250 exercises, and G3.13
 * replaces the sample templates.
 */
export const builtinExercises: Exercise[] = fakeExercises.filter((e) => e.source === 'builtin');
export const starterTemplates: StarterTemplate[] = fakeTemplates;

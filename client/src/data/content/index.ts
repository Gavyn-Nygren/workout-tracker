import { fakeTemplates } from '../fake/plans';
import type { Exercise, StarterTemplate } from '../types';
import { BUILTIN_EXERCISES } from './exercises';

/**
 * Content that ships with the app rather than living in the user's database: the built-in
 * exercise library (G3.2) and the starter templates (the sample ones until G3.13).
 */
export const builtinExercises: Exercise[] = BUILTIN_EXERCISES;
export const starterTemplates: StarterTemplate[] = fakeTemplates;

import type { Exercise, StarterTemplate } from '../types';
import { BUILTIN_EXERCISES } from './exercises';
import { STARTER_TEMPLATES } from './templates';

/**
 * Content that ships with the app rather than living in the user's database: the built-in
 * exercise library (G3.2) and the starter catalog (G3.13, src/data/content/templates/).
 */
export const builtinExercises: Exercise[] = BUILTIN_EXERCISES;
export const starterTemplates: StarterTemplate[] = STARTER_TEMPLATES;

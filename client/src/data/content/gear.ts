import { scheduledWorkoutIds } from '../schedule';
import type { Gear, ID, PlanSchedule, PlanWorkout } from '../types';

/**
 * Gear a built-in exercise needs beyond its equipment value (G3.13). Onboarding's equipment chips
 * have no rack, bench, bar or box, so a template lists these in `alsoNeeds`, and the template
 * validator checks that list equals the union over the template's exercises. Pure: tests and the
 * review page import it.
 *
 * Only real needs are listed: something the exercise can't be done without in its usual form.
 * Optional supports (a wall, a door frame, a step for calf raises) aren't. A few calls, kept in
 * step with the catalog:
 * - A barbell lift taken from the shoulders or a bench needs the rack; floor lifts don't.
 * - Single-Leg Hip Thrust works with the shoulders on the floor or a couch, so no bench.
 * - Incline Push-Up uses any table or counter; the One-Arm Row (Kettlebell) is done bent over.
 * - Machines and the Smith machine bring their own seat, except where a separate bench is used.
 */
export const EXERCISE_GEAR: Record<ID, Gear[]> = {
  // Squats
  ex_back_squat: ['rack'],
  ex_low_bar_squat: ['rack'],
  ex_front_squat: ['rack'],
  ex_pause_squat: ['rack'],
  ex_box_squat: ['rack', 'box'],
  ex_ssb_squat: ['rack'],
  ex_zercher_squat: ['rack'],
  ex_overhead_squat: ['rack'],

  // Lunges and split squats
  ex_reverse_lunge_bb: ['rack'],
  ex_forward_lunge_bb: ['rack'],
  ex_bulgarian_split_squat: ['bench'],
  ex_bulgarian_split_squat_bb: ['rack', 'bench'],
  ex_bulgarian_split_squat_smith: ['bench'],
  ex_bulgarian_split_squat_bw: ['bench'],
  ex_step_up: ['box'],
  ex_step_up_bb: ['rack', 'box'],

  // Deadlifts and hinges
  ex_rack_pull: ['rack'],
  ex_good_morning: ['rack'],

  // Glutes
  ex_hip_thrust: ['bench'],
  ex_hip_thrust_db: ['bench'],

  // Hips
  ex_copenhagen_plank: ['bench'],

  // Chest: presses
  ex_bench_press: ['rack', 'bench'],
  ex_db_bench_press: ['bench'],
  ex_incline_bench_press: ['rack', 'bench'],
  ex_incline_db_press: ['bench'],
  ex_decline_bench_press: ['rack', 'bench'],
  ex_decline_db_press: ['bench'],
  ex_close_grip_bench: ['rack', 'bench'],
  ex_pause_bench: ['rack', 'bench'],
  ex_larsen_press: ['rack', 'bench'],
  ex_floor_press: ['rack'],
  ex_smith_bench: ['bench'],
  ex_smith_incline_bench: ['bench'],

  // Chest: push-ups, dips and flys
  ex_decline_push_up: ['bench'],
  ex_dips: ['dip_bars'],
  ex_bench_dip: ['bench'],
  ex_db_fly: ['bench'],
  ex_incline_db_fly: ['bench'],

  // Shoulders
  ex_overhead_press: ['rack'],
  ex_seated_ohp: ['rack', 'bench'],
  ex_push_press: ['rack'],
  ex_smith_shoulder_press: ['bench'],
  ex_z_press: ['rack'],

  // Back
  ex_db_row: ['bench'],
  ex_chest_supported_row: ['bench'],
  ex_seal_row: ['bench'],
  ex_inverted_row: ['low_bar'],
  ex_pull_up: ['pull_up_bar'],
  ex_chin_up: ['pull_up_bar'],
  ex_neutral_grip_pull_up: ['pull_up_bar'],
  ex_wide_grip_pull_up: ['pull_up_bar'],
  ex_band_assisted_pull_up: ['pull_up_bar'],
  ex_muscle_up: ['pull_up_bar'],
  ex_db_pullover: ['bench'],

  // Arms
  ex_incline_db_curl: ['bench'],
  ex_preacher_curl: ['bench'],
  ex_db_preacher_curl: ['bench'],
  ex_spider_curl: ['bench'],
  ex_skull_crusher: ['bench'],
  ex_db_skull_crusher: ['bench'],
  ex_jm_press: ['rack', 'bench'],

  // Grip and core
  ex_dead_hang: ['pull_up_bar'],
  ex_hanging_leg_raise: ['pull_up_bar'],
  ex_hanging_knee_raise: ['pull_up_bar'],
  ex_toes_to_bar: ['pull_up_bar'],
  ex_decline_crunch: ['bench'],

  // Olympic lifts taken from the rack
  ex_split_jerk: ['rack'],
  ex_push_jerk: ['rack'],

  // Jumps
  ex_box_jump: ['box'],
};

/** Gear in the order it's listed: the big items first. */
export const GEAR_ORDER: readonly Gear[] = ['rack', 'bench', 'pull_up_bar', 'dip_bars', 'box', 'low_bar'];

/** How each item reads in a sentence ("Also needs a squat rack and a bench"). */
export const GEAR_LABEL: Record<Gear, string> = {
  rack: 'a squat rack',
  bench: 'a bench',
  pull_up_bar: 'a pull-up bar',
  dip_bars: 'dip bars',
  box: 'a box or step',
  low_bar: 'a low bar or sturdy table',
};

/** The items once each, in GEAR_ORDER. */
function sorted(gear: Iterable<Gear>): Gear[] {
  const have = new Set(gear);
  return GEAR_ORDER.filter((g) => have.has(g));
}

/** Gear as a phrase, in GEAR_ORDER: "a squat rack, a bench and a pull-up bar"; '' for none. */
export function gearList(gear: readonly Gear[]): string {
  const labels = sorted(gear).map((g) => GEAR_LABEL[g]);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** The gear a set of exercises needs, once each, in GEAR_ORDER. Unknown ids need nothing. */
export function gearForExercises(exerciseIds: Iterable<ID>): Gear[] {
  const all: Gear[] = [];
  for (const id of exerciseIds) if (Object.prototype.hasOwnProperty.call(EXERCISE_GEAR, id)) all.push(...EXERCISE_GEAR[id]);
  return sorted(all);
}

/**
 * The gear one day version needs: only the workouts its schedule uses. A version that drops a
 * workout can need less (Full-Body Foundations on 2 days needs no bench), so the program page and
 * onboarding's cards both show this for the version they start, not the program's `alsoNeeds`.
 */
export function gearForSchedule(workouts: readonly Pick<PlanWorkout, 'id' | 'blocks'>[], schedule: PlanSchedule): Gear[] {
  const used = scheduledWorkoutIds(schedule);
  return gearForExercises(workouts.filter((w) => used.has(w.id)).flatMap((w) => w.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId))));
}

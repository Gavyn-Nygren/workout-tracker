import type { Equipment, Exercise, FormMovementFamily, MuscleGroup } from '../types';

/**
 * The built-in exercise library (roadmap G3.2; user's picks: about 250 covering the full gym,
 * Olympic lifts, and strongman; names read "Movement (Equipment)"; how-to text comes later with
 * demo media).
 *
 * Rules:
 * - Ids are permanent. Logged history and plans point at them, so never change or reuse one.
 *   Renaming is safe.
 * - `base` links a variation to its family's main movement (one level, no chains). It drives swap
 *   suggestions and lets custom exercises link to a family.
 * - `form` only on the variations spec 2.8 lists as verified (sumo deadlifts are excluded).
 * - `bw`: bodyweight is part of the load (effective load = bodyweight + added, or minus assistance).
 */

const STAMP = '2026-10-23T00:00:00.000Z';

type Extra = {
  secondary?: MuscleGroup[];
  base?: string;
  bw?: boolean;
  /** Logged as assistance subtracted from bodyweight. */
  assisted?: boolean;
  form?: FormMovementFamily;
  aliases?: string[];
};

const C = 'compound' as const;
const I = 'isolation' as const;

function x(id: string, name: string, equipment: Equipment, category: Exercise['category'], primaryMuscles: MuscleGroup[], extra: Extra = {}): Exercise {
  return {
    id,
    name,
    source: 'builtin',
    baseMovementId: extra.base,
    equipment,
    category,
    primaryMuscles,
    secondaryMuscles: extra.secondary,
    isBodyweight: extra.bw ?? false,
    isAssisted: extra.assisted,
    formAnalysis: extra.form,
    aliases: extra.aliases,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

// Family main movements (other entries link to these with `base`).
const SQUAT = 'ex_back_squat';
const LEG_PRESS = 'ex_leg_press';
const LEG_EXT = 'ex_leg_extension';
const LUNGE = 'ex_reverse_lunge';
const DEADLIFT = 'ex_deadlift';
const RDL = 'ex_rdl';
const SWING = 'ex_kb_swing';
const HIP_THRUST = 'ex_hip_thrust';
const KICKBACK = 'ex_glute_kickback_cable';
const LEG_CURL = 'ex_lying_leg_curl';
const CALF = 'ex_standing_calf_raise';
const ABDUCTION = 'ex_hip_abduction';
const ADDUCTION = 'ex_hip_adduction';
const BENCH = 'ex_bench_press';
const PUSH_UP = 'ex_push_up';
const DIP = 'ex_dips';
const FLY = 'ex_cable_fly';
const OHP = 'ex_overhead_press';
const LATERAL = 'ex_lateral_raise';
const FRONT_RAISE = 'ex_front_raise';
const REAR_DELT = 'ex_reverse_fly';
const UPRIGHT_ROW = 'ex_upright_row';
const SHRUG = 'ex_shrug';
const ROW = 'ex_barbell_row';
const PULL_UP = 'ex_pull_up';
const PULLDOWN = 'ex_lat_pulldown';
const PULLOVER = 'ex_straight_arm_pulldown';
const BACK_EXT = 'ex_back_extension';
const CURL = 'ex_db_curl';
const TRICEPS = 'ex_triceps_pushdown';
const WRIST_CURL = 'ex_wrist_curl';
const PLANK = 'ex_plank';
const CRUNCH = 'ex_cable_crunch';
const LEG_RAISE = 'ex_hanging_leg_raise';
const CLEAN = 'ex_power_clean';
const SNATCH = 'ex_snatch';
const JERK = 'ex_split_jerk';
const CARRY = 'ex_farmers_carry';
const SLED = 'ex_sled_push';
const STONE = 'ex_atlas_stone';

export const BUILTIN_EXERCISES: Exercise[] = [
  // Squats
  x(SQUAT, 'Back Squat (Barbell)', 'barbell', C, ['quads', 'glutes'], { secondary: ['adductors', 'core'], form: 'squat', aliases: ['Squat', 'High-Bar Squat', 'ATG Squat'] }),
  x('ex_low_bar_squat', 'Low-Bar Squat (Barbell)', 'barbell', C, ['glutes', 'quads'], { secondary: ['hamstrings', 'adductors', 'back'], base: SQUAT }),
  x('ex_front_squat', 'Front Squat (Barbell)', 'barbell', C, ['quads'], { secondary: ['glutes', 'core', 'back'], form: 'squat', base: SQUAT }),
  x('ex_pause_squat', 'Pause Squat (Barbell)', 'barbell', C, ['quads', 'glutes'], { secondary: ['adductors', 'core'], base: SQUAT }),
  x('ex_box_squat', 'Box Squat (Barbell)', 'barbell', C, ['glutes', 'quads'], { secondary: ['hamstrings'], base: SQUAT }),
  x('ex_ssb_squat', 'Squat (Safety Bar)', 'barbell', C, ['quads', 'glutes'], { secondary: ['back', 'core'], base: SQUAT, aliases: ['SSB Squat', 'Safety Squat Bar'] }),
  x('ex_smith_squat', 'Squat (Smith Machine)', 'machine', C, ['quads', 'glutes'], { base: SQUAT }),
  x('ex_goblet_squat', 'Goblet Squat (Dumbbell)', 'dumbbell', C, ['quads', 'glutes'], { secondary: ['core'], form: 'squat', base: SQUAT }),
  x('ex_goblet_squat_kb', 'Goblet Squat (Kettlebell)', 'kettlebell', C, ['quads', 'glutes'], { secondary: ['core'], form: 'squat', base: SQUAT }),
  x('ex_zercher_squat', 'Zercher Squat (Barbell)', 'barbell', C, ['quads', 'glutes'], { secondary: ['core', 'back', 'biceps'], base: SQUAT }),
  x('ex_overhead_squat', 'Overhead Squat (Barbell)', 'barbell', C, ['quads', 'glutes'], { secondary: ['shoulders', 'core'], base: SQUAT, aliases: ['OHS'] }),
  x('ex_hack_squat', 'Hack Squat (Machine)', 'machine', C, ['quads'], { secondary: ['glutes'], base: SQUAT }),
  x('ex_pendulum_squat', 'Pendulum Squat (Machine)', 'machine', C, ['quads'], { secondary: ['glutes'], base: SQUAT }),
  x('ex_belt_squat', 'Belt Squat (Machine)', 'machine', C, ['quads', 'glutes'], { base: SQUAT }),
  x('ex_bodyweight_squat', 'Air Squat', 'bodyweight', C, ['quads', 'glutes'], { bw: true, base: SQUAT, aliases: ['Bodyweight Squat'] }),
  x('ex_pistol_squat', 'Pistol Squat', 'bodyweight', C, ['quads', 'glutes'], { secondary: ['core'], bw: true, base: SQUAT, aliases: ['Single-Leg Squat'] }),
  x('ex_sissy_squat', 'Sissy Squat', 'bodyweight', I, ['quads'], { bw: true, base: LEG_EXT }),
  x('ex_wall_sit', 'Wall Sit', 'bodyweight', I, ['quads'], { bw: true, base: LEG_EXT }),

  // Leg press and leg extension
  x(LEG_PRESS, 'Leg Press (Machine)', 'machine', C, ['quads', 'glutes'], { secondary: ['hamstrings', 'adductors'] }),
  x('ex_single_leg_press', 'Single-Leg Leg Press (Machine)', 'machine', C, ['quads', 'glutes'], { base: LEG_PRESS }),
  x('ex_seated_leg_press', 'Seated Leg Press (Machine)', 'machine', C, ['quads', 'glutes'], { base: LEG_PRESS, aliases: ['Horizontal Leg Press'] }),
  x(LEG_EXT, 'Leg Extension (Machine)', 'machine', I, ['quads']),
  x('ex_single_leg_extension', 'Single-Leg Extension (Machine)', 'machine', I, ['quads'], { base: LEG_EXT }),

  // Lunges and split squats
  x(LUNGE, 'Reverse Lunge (Dumbbell)', 'dumbbell', C, ['quads', 'glutes'], { secondary: ['hamstrings', 'adductors'], form: 'lunge' }),
  x('ex_reverse_lunge_bb', 'Reverse Lunge (Barbell)', 'barbell', C, ['quads', 'glutes'], { secondary: ['hamstrings'], form: 'lunge', base: LUNGE }),
  x('ex_reverse_lunge_bw', 'Reverse Lunge', 'bodyweight', C, ['quads', 'glutes'], { bw: true, form: 'lunge', base: LUNGE }),
  x('ex_forward_lunge', 'Forward Lunge (Dumbbell)', 'dumbbell', C, ['quads', 'glutes'], { form: 'lunge', base: LUNGE }),
  x('ex_forward_lunge_bb', 'Forward Lunge (Barbell)', 'barbell', C, ['quads', 'glutes'], { form: 'lunge', base: LUNGE }),
  x('ex_walking_lunge', 'Walking Lunge (Dumbbell)', 'dumbbell', C, ['quads', 'glutes'], { secondary: ['hamstrings'], base: LUNGE }),
  x('ex_walking_lunge_bw', 'Walking Lunge', 'bodyweight', C, ['quads', 'glutes'], { bw: true, base: LUNGE }),
  x('ex_lateral_lunge', 'Lateral Lunge (Dumbbell)', 'dumbbell', C, ['adductors', 'glutes', 'quads'], { base: LUNGE, aliases: ['Side Lunge'] }),
  x('ex_curtsy_lunge', 'Curtsy Lunge (Dumbbell)', 'dumbbell', C, ['glutes', 'quads'], { secondary: ['adductors'], base: LUNGE }),
  x('ex_split_squat', 'Split Squat (Dumbbell)', 'dumbbell', C, ['quads', 'glutes'], { form: 'lunge', base: LUNGE }),
  x('ex_split_squat_bw', 'Split Squat', 'bodyweight', C, ['quads', 'glutes'], { bw: true, form: 'lunge', base: LUNGE }),
  x('ex_bulgarian_split_squat', 'Bulgarian Split Squat (Dumbbell)', 'dumbbell', C, ['quads', 'glutes'], { secondary: ['adductors'], form: 'lunge', base: LUNGE, aliases: ['BSS', 'Rear-Foot Elevated Split Squat'] }),
  x('ex_bulgarian_split_squat_bb', 'Bulgarian Split Squat (Barbell)', 'barbell', C, ['quads', 'glutes'], { form: 'lunge', base: LUNGE, aliases: ['BSS'] }),
  x('ex_bulgarian_split_squat_smith', 'Bulgarian Split Squat (Smith Machine)', 'machine', C, ['quads', 'glutes'], { base: LUNGE, aliases: ['BSS'] }),
  x('ex_step_up', 'Step-Up (Dumbbell)', 'dumbbell', C, ['quads', 'glutes'], { base: LUNGE }),
  x('ex_step_up_bb', 'Step-Up (Barbell)', 'barbell', C, ['quads', 'glutes'], { base: LUNGE }),

  // Deadlifts
  x(DEADLIFT, 'Deadlift (Barbell)', 'barbell', C, ['hamstrings', 'glutes', 'back'], { secondary: ['traps', 'forearms', 'quads'], form: 'deadlift', aliases: ['Conventional Deadlift'] }),
  x('ex_sumo_deadlift', 'Sumo Deadlift (Barbell)', 'barbell', C, ['glutes', 'quads', 'adductors'], { secondary: ['hamstrings', 'back'], base: DEADLIFT }),
  x('ex_trap_bar_deadlift', 'Deadlift (Trap Bar)', 'barbell', C, ['quads', 'glutes', 'hamstrings'], { secondary: ['back', 'traps'], form: 'deadlift', base: DEADLIFT, aliases: ['Trap Bar Deadlift', 'Hex Bar Deadlift'] }),
  x('ex_deficit_deadlift', 'Deficit Deadlift (Barbell)', 'barbell', C, ['hamstrings', 'glutes', 'back'], { secondary: ['quads'], base: DEADLIFT }),
  x('ex_rack_pull', 'Rack Pull (Barbell)', 'barbell', C, ['back', 'traps', 'glutes'], { secondary: ['hamstrings', 'forearms'], base: DEADLIFT, aliases: ['Block Pull'] }),
  x('ex_pause_deadlift', 'Pause Deadlift (Barbell)', 'barbell', C, ['hamstrings', 'glutes', 'back'], { base: DEADLIFT }),
  x('ex_snatch_grip_deadlift', 'Snatch-Grip Deadlift (Barbell)', 'barbell', C, ['back', 'hamstrings', 'glutes'], { secondary: ['traps'], base: DEADLIFT }),
  x('ex_db_deadlift', 'Deadlift (Dumbbell)', 'dumbbell', C, ['hamstrings', 'glutes'], { secondary: ['back'], base: DEADLIFT }),
  x('ex_kb_deadlift', 'Deadlift (Kettlebell)', 'kettlebell', C, ['hamstrings', 'glutes'], { base: DEADLIFT }),
  x('ex_axle_deadlift', 'Deadlift (Axle)', 'barbell', C, ['back', 'glutes', 'hamstrings'], { secondary: ['forearms'], base: DEADLIFT }),

  // Hinges: Romanian deadlifts, good mornings, swings
  x(RDL, 'Romanian Deadlift (Barbell)', 'barbell', C, ['hamstrings', 'glutes'], { secondary: ['back'], form: 'deadlift', aliases: ['RDL'] }),
  x('ex_db_rdl', 'Romanian Deadlift (Dumbbell)', 'dumbbell', C, ['hamstrings', 'glutes'], { secondary: ['back'], form: 'deadlift', base: RDL, aliases: ['RDL'] }),
  x('ex_stiff_leg_deadlift', 'Stiff-Leg Deadlift (Barbell)', 'barbell', C, ['hamstrings', 'glutes'], { secondary: ['back'], form: 'deadlift', base: RDL, aliases: ['SLDL'] }),
  x('ex_single_leg_rdl', 'Single-Leg Romanian Deadlift (Dumbbell)', 'dumbbell', C, ['hamstrings', 'glutes'], { secondary: ['core'], base: RDL, aliases: ['Single-Leg RDL'] }),
  x('ex_good_morning', 'Good Morning (Barbell)', 'barbell', C, ['hamstrings', 'glutes', 'back'], { base: RDL }),
  x('ex_cable_pull_through', 'Pull-Through (Cable)', 'cable', C, ['glutes', 'hamstrings'], { base: RDL }),
  x(SWING, 'Swing (Kettlebell)', 'kettlebell', C, ['glutes', 'hamstrings'], { secondary: ['back', 'core', 'shoulders'], aliases: ['Kettlebell Swing', 'Russian Swing'] }),
  x('ex_kb_swing_single', 'One-Arm Swing (Kettlebell)', 'kettlebell', C, ['glutes', 'hamstrings'], { secondary: ['core', 'forearms'], base: SWING }),
  x('ex_american_swing', 'American Swing (Kettlebell)', 'kettlebell', C, ['glutes', 'hamstrings', 'shoulders'], { secondary: ['core'], base: SWING }),

  // Glutes
  x(HIP_THRUST, 'Hip Thrust (Barbell)', 'barbell', C, ['glutes'], { secondary: ['hamstrings'] }),
  x('ex_hip_thrust_machine', 'Hip Thrust (Machine)', 'machine', C, ['glutes'], { secondary: ['hamstrings'], base: HIP_THRUST }),
  x('ex_hip_thrust_db', 'Hip Thrust (Dumbbell)', 'dumbbell', C, ['glutes'], { base: HIP_THRUST }),
  x('ex_single_leg_hip_thrust', 'Single-Leg Hip Thrust', 'bodyweight', C, ['glutes'], { secondary: ['hamstrings'], bw: true, base: HIP_THRUST }),
  x('ex_glute_bridge', 'Glute Bridge (Barbell)', 'barbell', C, ['glutes'], { secondary: ['hamstrings'], base: HIP_THRUST }),
  x('ex_glute_bridge_bw', 'Glute Bridge', 'bodyweight', C, ['glutes'], { bw: true, base: HIP_THRUST }),
  x('ex_frog_pump', 'Frog Pump', 'bodyweight', I, ['glutes'], { bw: true, base: HIP_THRUST }),
  x(KICKBACK, 'Glute Kickback (Cable)', 'cable', I, ['glutes']),
  x('ex_glute_kickback_machine', 'Glute Kickback (Machine)', 'machine', I, ['glutes'], { base: KICKBACK }),

  // Hamstring curls
  x(LEG_CURL, 'Lying Leg Curl (Machine)', 'machine', I, ['hamstrings']),
  x('ex_seated_leg_curl', 'Seated Leg Curl (Machine)', 'machine', I, ['hamstrings'], { base: LEG_CURL }),
  x('ex_standing_leg_curl', 'Standing Leg Curl (Machine)', 'machine', I, ['hamstrings'], { base: LEG_CURL }),
  x('ex_nordic_curl', 'Nordic Hamstring Curl', 'bodyweight', I, ['hamstrings'], { bw: true, base: LEG_CURL, aliases: ['Nordic Curl'] }),
  x('ex_slider_leg_curl', 'Slider Leg Curl', 'bodyweight', I, ['hamstrings'], { secondary: ['glutes'], bw: true, base: LEG_CURL }),
  x('ex_glute_ham_raise', 'Glute-Ham Raise', 'bodyweight', C, ['hamstrings', 'glutes'], { bw: true, base: LEG_CURL, aliases: ['GHR'] }),

  // Calves
  x(CALF, 'Standing Calf Raise (Machine)', 'machine', I, ['calves'], { form: 'calf_raise' }),
  x('ex_seated_calf_raise', 'Seated Calf Raise (Machine)', 'machine', I, ['calves'], { form: 'calf_raise', base: CALF }),
  x('ex_calf_raise_bw', 'Standing Calf Raise', 'bodyweight', I, ['calves'], { bw: true, form: 'calf_raise', base: CALF, aliases: ['Bodyweight Calf Raise'] }),
  x('ex_single_leg_calf_raise', 'Single-Leg Calf Raise (Dumbbell)', 'dumbbell', I, ['calves'], { form: 'calf_raise', base: CALF }),
  x('ex_smith_calf_raise', 'Standing Calf Raise (Smith Machine)', 'machine', I, ['calves'], { form: 'calf_raise', base: CALF }),
  x('ex_leg_press_calf_raise', 'Calf Press (Leg Press)', 'machine', I, ['calves'], { base: CALF }),
  x('ex_donkey_calf_raise', 'Donkey Calf Raise (Machine)', 'machine', I, ['calves'], { base: CALF }),
  x('ex_tibialis_raise', 'Tibialis Raise', 'bodyweight', I, ['calves'], { bw: true, aliases: ['Tib Raise'] }),

  // Hips: abductors and adductors
  x(ABDUCTION, 'Hip Abduction (Machine)', 'machine', I, ['glutes']),
  x('ex_cable_hip_abduction', 'Hip Abduction (Cable)', 'cable', I, ['glutes'], { base: ABDUCTION }),
  x('ex_banded_lateral_walk', 'Lateral Walk (Band)', 'band', I, ['glutes'], { base: ABDUCTION, aliases: ['Monster Walk', 'Band Walk'] }),
  x('ex_banded_clamshell', 'Clamshell (Band)', 'band', I, ['glutes'], { base: ABDUCTION }),
  x(ADDUCTION, 'Hip Adduction (Machine)', 'machine', I, ['adductors']),
  x('ex_cable_hip_adduction', 'Hip Adduction (Cable)', 'cable', I, ['adductors'], { base: ADDUCTION }),
  x('ex_copenhagen_plank', 'Copenhagen Plank', 'bodyweight', I, ['adductors'], { secondary: ['core'], bw: true, base: ADDUCTION }),

  // Chest: presses
  x(BENCH, 'Bench Press (Barbell)', 'barbell', C, ['chest', 'triceps'], { secondary: ['shoulders'], aliases: ['Flat Bench', 'Bench'] }),
  x('ex_db_bench_press', 'Bench Press (Dumbbell)', 'dumbbell', C, ['chest', 'triceps'], { secondary: ['shoulders'], base: BENCH }),
  x('ex_incline_bench_press', 'Incline Bench Press (Barbell)', 'barbell', C, ['chest', 'shoulders'], { secondary: ['triceps'], base: BENCH }),
  x('ex_incline_db_press', 'Incline Bench Press (Dumbbell)', 'dumbbell', C, ['chest', 'shoulders'], { secondary: ['triceps'], base: BENCH, aliases: ['Incline Dumbbell Press'] }),
  x('ex_decline_bench_press', 'Decline Bench Press (Barbell)', 'barbell', C, ['chest', 'triceps'], { base: BENCH }),
  x('ex_decline_db_press', 'Decline Bench Press (Dumbbell)', 'dumbbell', C, ['chest', 'triceps'], { base: BENCH }),
  x('ex_close_grip_bench', 'Close-Grip Bench Press (Barbell)', 'barbell', C, ['triceps', 'chest'], { secondary: ['shoulders'], base: BENCH, aliases: ['CGBP'] }),
  x('ex_pause_bench', 'Pause Bench Press (Barbell)', 'barbell', C, ['chest', 'triceps'], { base: BENCH }),
  x('ex_larsen_press', 'Larsen Press (Barbell)', 'barbell', C, ['chest', 'triceps'], { base: BENCH }),
  x('ex_floor_press', 'Floor Press (Barbell)', 'barbell', C, ['chest', 'triceps'], { base: BENCH }),
  x('ex_db_floor_press', 'Floor Press (Dumbbell)', 'dumbbell', C, ['chest', 'triceps'], { base: BENCH }),
  x('ex_smith_bench', 'Bench Press (Smith Machine)', 'machine', C, ['chest', 'triceps'], { base: BENCH }),
  x('ex_smith_incline_bench', 'Incline Bench Press (Smith Machine)', 'machine', C, ['chest', 'shoulders'], { base: BENCH }),
  x('ex_chest_press_machine', 'Chest Press (Machine)', 'machine', C, ['chest', 'triceps'], { base: BENCH }),
  x('ex_incline_chest_press_machine', 'Incline Chest Press (Machine)', 'machine', C, ['chest', 'shoulders'], { base: BENCH }),

  // Chest: push-ups and dips
  x(PUSH_UP, 'Push-Up', 'bodyweight', C, ['chest', 'triceps'], { secondary: ['shoulders', 'core'], bw: true, aliases: ['Press-Up'] }),
  x('ex_incline_push_up', 'Incline Push-Up', 'bodyweight', C, ['chest', 'triceps'], { bw: true, base: PUSH_UP }),
  x('ex_decline_push_up', 'Decline Push-Up', 'bodyweight', C, ['chest', 'shoulders'], { bw: true, base: PUSH_UP }),
  x('ex_diamond_push_up', 'Diamond Push-Up', 'bodyweight', C, ['triceps', 'chest'], { bw: true, base: PUSH_UP, aliases: ['Close-Grip Push-Up'] }),
  x('ex_deficit_push_up', 'Deficit Push-Up', 'bodyweight', C, ['chest', 'triceps'], { bw: true, base: PUSH_UP }),
  x(DIP, 'Dip', 'bodyweight', C, ['chest', 'triceps'], { secondary: ['shoulders'], bw: true, aliases: ['Dips', 'Parallel Bar Dip'] }),
  x('ex_assisted_dip', 'Assisted Dip (Machine)', 'machine', C, ['chest', 'triceps'], { bw: true, assisted: true, base: DIP }),
  x('ex_bench_dip', 'Bench Dip', 'bodyweight', C, ['triceps'], { secondary: ['chest'], bw: true, base: DIP }),
  x('ex_seated_dip_machine', 'Seated Dip (Machine)', 'machine', C, ['triceps', 'chest'], { base: DIP }),

  // Chest: flys
  x(FLY, 'Chest Fly (Cable)', 'cable', I, ['chest'], { aliases: ['Cable Fly', 'Cable Crossover'] }),
  x('ex_db_fly', 'Chest Fly (Dumbbell)', 'dumbbell', I, ['chest'], { base: FLY }),
  x('ex_incline_db_fly', 'Incline Chest Fly (Dumbbell)', 'dumbbell', I, ['chest'], { secondary: ['shoulders'], base: FLY }),
  x('ex_pec_deck', 'Chest Fly (Machine)', 'machine', I, ['chest'], { base: FLY, aliases: ['Pec Deck'] }),
  x('ex_low_cable_fly', 'Low-to-High Chest Fly (Cable)', 'cable', I, ['chest'], { secondary: ['shoulders'], base: FLY }),
  x('ex_high_cable_fly', 'High-to-Low Chest Fly (Cable)', 'cable', I, ['chest'], { base: FLY }),
  x('ex_svend_press', 'Svend Press (Plate)', 'other', I, ['chest'], { base: FLY }),

  // Shoulders: presses
  x(OHP, 'Overhead Press (Barbell)', 'barbell', C, ['shoulders', 'triceps'], { secondary: ['core', 'traps'], aliases: ['OHP', 'Military Press', 'Standing Press'] }),
  x('ex_seated_ohp', 'Seated Overhead Press (Barbell)', 'barbell', C, ['shoulders', 'triceps'], { base: OHP }),
  x('ex_db_shoulder_press', 'Shoulder Press (Dumbbell)', 'dumbbell', C, ['shoulders', 'triceps'], { base: OHP, aliases: ['Dumbbell Overhead Press'] }),
  x('ex_arnold_press', 'Arnold Press (Dumbbell)', 'dumbbell', C, ['shoulders'], { secondary: ['triceps'], base: OHP }),
  x('ex_push_press', 'Push Press (Barbell)', 'barbell', C, ['shoulders', 'triceps'], { secondary: ['quads', 'glutes'], base: OHP }),
  x('ex_smith_shoulder_press', 'Shoulder Press (Smith Machine)', 'machine', C, ['shoulders', 'triceps'], { base: OHP }),
  x('ex_machine_shoulder_press', 'Shoulder Press (Machine)', 'machine', C, ['shoulders', 'triceps'], { base: OHP }),
  x('ex_z_press', 'Z Press (Barbell)', 'barbell', C, ['shoulders', 'triceps'], { secondary: ['core'], base: OHP }),
  x('ex_landmine_press', 'Landmine Press', 'barbell', C, ['shoulders', 'chest'], { secondary: ['triceps', 'core'], base: OHP }),
  x('ex_kb_press', 'Overhead Press (Kettlebell)', 'kettlebell', C, ['shoulders', 'triceps'], { base: OHP }),
  x('ex_pike_push_up', 'Pike Push-Up', 'bodyweight', C, ['shoulders', 'triceps'], { bw: true, base: OHP }),
  x('ex_handstand_push_up', 'Handstand Push-Up', 'bodyweight', C, ['shoulders', 'triceps'], { bw: true, base: OHP, aliases: ['HSPU'] }),
  x('ex_log_press', 'Log Press', 'other', C, ['shoulders', 'triceps'], { secondary: ['chest', 'core'], base: OHP }),

  // Shoulders: raises
  x(LATERAL, 'Lateral Raise (Dumbbell)', 'dumbbell', I, ['shoulders'], { aliases: ['Side Raise', 'Side Lateral Raise'] }),
  x('ex_cable_lateral_raise', 'Lateral Raise (Cable)', 'cable', I, ['shoulders'], { base: LATERAL }),
  x('ex_machine_lateral_raise', 'Lateral Raise (Machine)', 'machine', I, ['shoulders'], { base: LATERAL }),
  x('ex_lean_away_lateral', 'Lean-Away Lateral Raise (Dumbbell)', 'dumbbell', I, ['shoulders'], { base: LATERAL }),
  x('ex_band_lateral_raise', 'Lateral Raise (Band)', 'band', I, ['shoulders'], { base: LATERAL }),
  x(FRONT_RAISE, 'Front Raise (Dumbbell)', 'dumbbell', I, ['shoulders']),
  x('ex_plate_front_raise', 'Front Raise (Plate)', 'other', I, ['shoulders'], { base: FRONT_RAISE }),
  x('ex_cable_front_raise', 'Front Raise (Cable)', 'cable', I, ['shoulders'], { base: FRONT_RAISE }),

  // Shoulders: rear delts
  x(REAR_DELT, 'Reverse Fly (Dumbbell)', 'dumbbell', I, ['shoulders'], { secondary: ['traps', 'back'], aliases: ['Rear Delt Fly'] }),
  x('ex_reverse_pec_deck', 'Reverse Fly (Machine)', 'machine', I, ['shoulders'], { secondary: ['traps'], base: REAR_DELT, aliases: ['Reverse Pec Deck'] }),
  x('ex_cable_rear_delt_fly', 'Reverse Fly (Cable)', 'cable', I, ['shoulders'], { base: REAR_DELT }),
  x('ex_face_pull', 'Face Pull (Cable)', 'cable', I, ['shoulders', 'traps'], { base: REAR_DELT }),
  x('ex_band_pull_apart', 'Pull-Apart (Band)', 'band', I, ['shoulders', 'traps'], { base: REAR_DELT, aliases: ['Band Pull-Apart'] }),

  // Traps
  x(UPRIGHT_ROW, 'Upright Row (Barbell)', 'barbell', C, ['shoulders', 'traps']),
  x('ex_cable_upright_row', 'Upright Row (Cable)', 'cable', C, ['shoulders', 'traps'], { base: UPRIGHT_ROW }),
  x('ex_db_upright_row', 'Upright Row (Dumbbell)', 'dumbbell', C, ['shoulders', 'traps'], { base: UPRIGHT_ROW }),
  x(SHRUG, 'Shrug (Barbell)', 'barbell', I, ['traps'], { secondary: ['forearms'] }),
  x('ex_db_shrug', 'Shrug (Dumbbell)', 'dumbbell', I, ['traps'], { base: SHRUG }),
  x('ex_trap_bar_shrug', 'Shrug (Trap Bar)', 'barbell', I, ['traps'], { base: SHRUG }),
  x('ex_cable_shrug', 'Shrug (Cable)', 'cable', I, ['traps'], { base: SHRUG }),

  // Back: rows
  x(ROW, 'Bent-Over Row (Barbell)', 'barbell', C, ['back', 'lats'], { secondary: ['biceps', 'traps'], aliases: ['Barbell Row'] }),
  x('ex_pendlay_row', 'Pendlay Row (Barbell)', 'barbell', C, ['back', 'lats'], { secondary: ['biceps'], base: ROW }),
  x('ex_yates_row', 'Underhand Row (Barbell)', 'barbell', C, ['back', 'lats', 'biceps'], { base: ROW, aliases: ['Yates Row'] }),
  x('ex_db_row', 'One-Arm Row (Dumbbell)', 'dumbbell', C, ['lats', 'back'], { secondary: ['biceps'], base: ROW, aliases: ['Dumbbell Row'] }),
  x('ex_chest_supported_row', 'Chest-Supported Row (Dumbbell)', 'dumbbell', C, ['back', 'lats'], { secondary: ['biceps'], base: ROW }),
  x('ex_seal_row', 'Seal Row (Barbell)', 'barbell', C, ['back', 'lats'], { base: ROW }),
  x('ex_t_bar_row', 'T-Bar Row', 'barbell', C, ['back', 'lats'], { secondary: ['biceps'], base: ROW }),
  x('ex_t_bar_row_machine', 'T-Bar Row (Machine)', 'machine', C, ['back', 'lats'], { base: ROW, aliases: ['Chest-Supported T-Bar Row'] }),
  x('ex_seated_cable_row', 'Seated Row (Cable)', 'cable', C, ['back', 'lats'], { secondary: ['biceps'], base: ROW, aliases: ['Seated Cable Row'] }),
  x('ex_single_arm_cable_row', 'One-Arm Row (Cable)', 'cable', C, ['lats', 'back'], { base: ROW }),
  x('ex_machine_row', 'Seated Row (Machine)', 'machine', C, ['back', 'lats'], { base: ROW }),
  x('ex_meadows_row', 'Meadows Row (Barbell)', 'barbell', C, ['lats', 'back'], { base: ROW }),
  x('ex_inverted_row', 'Inverted Row', 'bodyweight', C, ['back', 'lats'], { secondary: ['biceps'], bw: true, base: ROW, aliases: ['Bodyweight Row', 'Australian Pull-Up'] }),
  x('ex_kb_row', 'One-Arm Row (Kettlebell)', 'kettlebell', C, ['lats', 'back'], { base: ROW }),
  x('ex_band_row', 'Row (Band)', 'band', C, ['back', 'lats'], { base: ROW }),

  // Back: vertical pulls
  x(PULL_UP, 'Pull-Up', 'bodyweight', C, ['lats', 'biceps'], { secondary: ['back'], bw: true }),
  x('ex_chin_up', 'Chin-Up', 'bodyweight', C, ['lats', 'biceps'], { bw: true, base: PULL_UP }),
  x('ex_neutral_grip_pull_up', 'Neutral-Grip Pull-Up', 'bodyweight', C, ['lats', 'biceps'], { bw: true, base: PULL_UP }),
  x('ex_wide_grip_pull_up', 'Wide-Grip Pull-Up', 'bodyweight', C, ['lats'], { secondary: ['biceps'], bw: true, base: PULL_UP }),
  x('ex_assisted_pull_up', 'Assisted Pull-Up (Machine)', 'machine', C, ['lats', 'biceps'], { bw: true, assisted: true, base: PULL_UP }),
  x('ex_band_assisted_pull_up', 'Assisted Pull-Up (Band)', 'band', C, ['lats', 'biceps'], { bw: true, assisted: true, base: PULL_UP }),
  x('ex_muscle_up', 'Muscle-Up', 'bodyweight', C, ['lats', 'chest', 'triceps'], { bw: true, base: PULL_UP }),
  x(PULLDOWN, 'Lat Pulldown (Cable)', 'cable', C, ['lats'], { secondary: ['biceps', 'back'] }),
  x('ex_close_grip_pulldown', 'Close-Grip Lat Pulldown (Cable)', 'cable', C, ['lats', 'biceps'], { base: PULLDOWN }),
  x('ex_underhand_pulldown', 'Underhand Lat Pulldown (Cable)', 'cable', C, ['lats', 'biceps'], { base: PULLDOWN }),
  x('ex_single_arm_pulldown', 'One-Arm Lat Pulldown (Cable)', 'cable', C, ['lats'], { base: PULLDOWN }),
  x('ex_machine_pulldown', 'Lat Pulldown (Machine)', 'machine', C, ['lats'], { secondary: ['biceps'], base: PULLDOWN }),
  x(PULLOVER, 'Straight-Arm Pulldown (Cable)', 'cable', I, ['lats']),
  x('ex_db_pullover', 'Pullover (Dumbbell)', 'dumbbell', I, ['lats', 'chest'], { base: PULLOVER }),
  x('ex_machine_pullover', 'Pullover (Machine)', 'machine', I, ['lats'], { base: PULLOVER }),

  // Back: lower back
  x(BACK_EXT, 'Back Extension', 'bodyweight', I, ['back', 'glutes'], { secondary: ['hamstrings'], bw: true, aliases: ['Hyperextension', '45° Back Extension'] }),
  x('ex_machine_back_extension', 'Back Extension (Machine)', 'machine', I, ['back'], { base: BACK_EXT }),
  x('ex_reverse_hyper', 'Reverse Hyperextension (Machine)', 'machine', I, ['glutes', 'back'], { secondary: ['hamstrings'], base: BACK_EXT, aliases: ['Reverse Hyper'] }),
  x('ex_superman', 'Superman Hold', 'bodyweight', I, ['back'], { bw: true, base: BACK_EXT }),

  // Biceps
  x(CURL, 'Bicep Curl (Dumbbell)', 'dumbbell', I, ['biceps'], { aliases: ['Dumbbell Curl'] }),
  x('ex_barbell_curl', 'Bicep Curl (Barbell)', 'barbell', I, ['biceps'], { secondary: ['forearms'], base: CURL }),
  x('ex_ez_curl', 'Bicep Curl (EZ Bar)', 'barbell', I, ['biceps'], { base: CURL, aliases: ['EZ Bar Curl'] }),
  x('ex_cable_curl', 'Bicep Curl (Cable)', 'cable', I, ['biceps'], { base: CURL }),
  x('ex_band_curl', 'Bicep Curl (Band)', 'band', I, ['biceps'], { base: CURL }),
  x('ex_hammer_curl', 'Hammer Curl (Dumbbell)', 'dumbbell', I, ['biceps', 'forearms'], { base: CURL }),
  x('ex_cable_hammer_curl', 'Hammer Curl (Cable)', 'cable', I, ['biceps', 'forearms'], { base: CURL, aliases: ['Rope Hammer Curl'] }),
  x('ex_incline_db_curl', 'Incline Curl (Dumbbell)', 'dumbbell', I, ['biceps'], { base: CURL }),
  x('ex_preacher_curl', 'Preacher Curl (EZ Bar)', 'barbell', I, ['biceps'], { base: CURL }),
  x('ex_db_preacher_curl', 'Preacher Curl (Dumbbell)', 'dumbbell', I, ['biceps'], { base: CURL }),
  x('ex_machine_preacher_curl', 'Preacher Curl (Machine)', 'machine', I, ['biceps'], { base: CURL }),
  x('ex_concentration_curl', 'Concentration Curl (Dumbbell)', 'dumbbell', I, ['biceps'], { base: CURL }),
  x('ex_spider_curl', 'Spider Curl (Dumbbell)', 'dumbbell', I, ['biceps'], { base: CURL }),
  x('ex_bayesian_curl', 'Bayesian Curl (Cable)', 'cable', I, ['biceps'], { base: CURL }),
  x('ex_zottman_curl', 'Zottman Curl (Dumbbell)', 'dumbbell', I, ['biceps', 'forearms'], { base: CURL }),
  x('ex_reverse_curl', 'Reverse Curl (EZ Bar)', 'barbell', I, ['forearms', 'biceps'], { base: CURL }),

  // Triceps
  x(TRICEPS, 'Triceps Pushdown (Cable)', 'cable', I, ['triceps'], { aliases: ['Pushdown', 'Triceps Pressdown'] }),
  x('ex_rope_pushdown', 'Triceps Pushdown (Rope)', 'cable', I, ['triceps'], { base: TRICEPS, aliases: ['Rope Pushdown'] }),
  x('ex_single_arm_pushdown', 'One-Arm Pushdown (Cable)', 'cable', I, ['triceps'], { base: TRICEPS }),
  x('ex_overhead_cable_extension', 'Overhead Triceps Extension (Cable)', 'cable', I, ['triceps'], { base: TRICEPS }),
  x('ex_db_overhead_extension', 'Overhead Triceps Extension (Dumbbell)', 'dumbbell', I, ['triceps'], { base: TRICEPS }),
  x('ex_skull_crusher', 'Skull Crusher (EZ Bar)', 'barbell', I, ['triceps'], { base: TRICEPS, aliases: ['Lying Triceps Extension'] }),
  x('ex_db_skull_crusher', 'Skull Crusher (Dumbbell)', 'dumbbell', I, ['triceps'], { base: TRICEPS }),
  x('ex_db_kickback', 'Triceps Kickback (Dumbbell)', 'dumbbell', I, ['triceps'], { base: TRICEPS }),
  x('ex_cable_kickback', 'Triceps Kickback (Cable)', 'cable', I, ['triceps'], { base: TRICEPS }),
  x('ex_machine_triceps_extension', 'Triceps Extension (Machine)', 'machine', I, ['triceps'], { base: TRICEPS }),
  x('ex_jm_press', 'JM Press (Barbell)', 'barbell', C, ['triceps'], { secondary: ['chest'], base: TRICEPS }),

  // Forearms and grip
  x(WRIST_CURL, 'Wrist Curl (Barbell)', 'barbell', I, ['forearms']),
  x('ex_db_wrist_curl', 'Wrist Curl (Dumbbell)', 'dumbbell', I, ['forearms'], { base: WRIST_CURL }),
  x('ex_reverse_wrist_curl', 'Reverse Wrist Curl (Barbell)', 'barbell', I, ['forearms'], { base: WRIST_CURL }),
  x('ex_dead_hang', 'Dead Hang', 'bodyweight', I, ['forearms'], { secondary: ['lats'], bw: true }),
  x('ex_plate_pinch', 'Plate Pinch', 'other', I, ['forearms']),

  // Core
  x(PLANK, 'Plank', 'bodyweight', I, ['core'], { bw: true }),
  x('ex_side_plank', 'Side Plank', 'bodyweight', I, ['core'], { bw: true, base: PLANK }),
  x('ex_hollow_hold', 'Hollow Body Hold', 'bodyweight', I, ['core'], { bw: true, base: PLANK }),
  x('ex_l_sit', 'L-Sit', 'bodyweight', I, ['core'], { secondary: ['triceps'], bw: true, base: PLANK }),
  x('ex_dead_bug', 'Dead Bug', 'bodyweight', I, ['core'], { bw: true, base: PLANK }),
  x('ex_bird_dog', 'Bird Dog', 'bodyweight', I, ['core', 'back'], { bw: true, base: PLANK }),
  x(CRUNCH, 'Crunch (Cable)', 'cable', I, ['core'], { aliases: ['Cable Crunch', 'Kneeling Cable Crunch'] }),
  x('ex_crunch', 'Crunch', 'bodyweight', I, ['core'], { bw: true, base: CRUNCH }),
  x('ex_machine_crunch', 'Crunch (Machine)', 'machine', I, ['core'], { base: CRUNCH }),
  x('ex_decline_crunch', 'Decline Crunch', 'bodyweight', I, ['core'], { bw: true, base: CRUNCH }),
  x('ex_sit_up', 'Sit-Up', 'bodyweight', I, ['core'], { bw: true, base: CRUNCH }),
  x('ex_v_up', 'V-Up', 'bodyweight', I, ['core'], { bw: true, base: CRUNCH }),
  x(LEG_RAISE, 'Hanging Leg Raise', 'bodyweight', I, ['core'], { bw: true }),
  x('ex_hanging_knee_raise', 'Hanging Knee Raise', 'bodyweight', I, ['core'], { bw: true, base: LEG_RAISE }),
  x('ex_captains_chair_raise', "Knee Raise (Captain's Chair)", 'machine', I, ['core'], { bw: true, base: LEG_RAISE }),
  x('ex_lying_leg_raise', 'Lying Leg Raise', 'bodyweight', I, ['core'], { bw: true, base: LEG_RAISE }),
  x('ex_toes_to_bar', 'Toes-to-Bar', 'bodyweight', I, ['core', 'lats'], { bw: true, base: LEG_RAISE, aliases: ['T2B'] }),
  x('ex_ab_wheel', 'Ab Wheel Rollout', 'other', I, ['core'], { aliases: ['Rollout', 'Ab Roller'] }),
  x('ex_russian_twist', 'Russian Twist', 'bodyweight', I, ['core'], { bw: true }),
  x('ex_cable_woodchop', 'Woodchop (Cable)', 'cable', I, ['core']),
  x('ex_pallof_press', 'Pallof Press (Cable)', 'cable', I, ['core'], { aliases: ['Anti-Rotation Press'] }),

  // Olympic lifts
  x(CLEAN, 'Power Clean (Barbell)', 'barbell', C, ['glutes', 'hamstrings', 'traps'], { secondary: ['quads', 'back', 'shoulders'] }),
  x('ex_clean', 'Clean (Barbell)', 'barbell', C, ['quads', 'glutes', 'hamstrings'], { secondary: ['traps', 'back'], base: CLEAN, aliases: ['Squat Clean'] }),
  x('ex_hang_clean', 'Hang Clean (Barbell)', 'barbell', C, ['glutes', 'hamstrings', 'traps'], { secondary: ['quads'], base: CLEAN }),
  x('ex_hang_power_clean', 'Hang Power Clean (Barbell)', 'barbell', C, ['glutes', 'hamstrings', 'traps'], { base: CLEAN }),
  x('ex_clean_and_jerk', 'Clean and Jerk (Barbell)', 'barbell', C, ['quads', 'glutes', 'shoulders'], { secondary: ['traps', 'triceps', 'back'], base: CLEAN, aliases: ['C&J'] }),
  x('ex_clean_pull', 'Clean Pull (Barbell)', 'barbell', C, ['back', 'hamstrings', 'traps'], { secondary: ['glutes'], base: CLEAN }),
  x('ex_high_pull', 'High Pull (Barbell)', 'barbell', C, ['traps', 'shoulders'], { secondary: ['glutes', 'hamstrings'], base: CLEAN }),
  x('ex_kb_clean', 'Clean (Kettlebell)', 'kettlebell', C, ['glutes', 'hamstrings'], { secondary: ['shoulders', 'forearms'], base: CLEAN }),
  x(SNATCH, 'Snatch (Barbell)', 'barbell', C, ['glutes', 'hamstrings', 'shoulders'], { secondary: ['quads', 'traps', 'back'], aliases: ['Squat Snatch'] }),
  x('ex_power_snatch', 'Power Snatch (Barbell)', 'barbell', C, ['glutes', 'hamstrings', 'shoulders'], { secondary: ['traps'], base: SNATCH }),
  x('ex_hang_snatch', 'Hang Snatch (Barbell)', 'barbell', C, ['glutes', 'hamstrings', 'shoulders'], { base: SNATCH }),
  x('ex_hang_power_snatch', 'Hang Power Snatch (Barbell)', 'barbell', C, ['glutes', 'hamstrings', 'shoulders'], { base: SNATCH }),
  x('ex_snatch_pull', 'Snatch Pull (Barbell)', 'barbell', C, ['back', 'hamstrings', 'traps'], { base: SNATCH }),
  x('ex_db_snatch', 'Snatch (Dumbbell)', 'dumbbell', C, ['glutes', 'hamstrings', 'shoulders'], { base: SNATCH }),
  x('ex_kb_snatch', 'Snatch (Kettlebell)', 'kettlebell', C, ['glutes', 'hamstrings', 'shoulders'], { base: SNATCH }),
  x(JERK, 'Split Jerk (Barbell)', 'barbell', C, ['shoulders', 'triceps', 'quads'], { secondary: ['core'] }),
  x('ex_push_jerk', 'Push Jerk (Barbell)', 'barbell', C, ['shoulders', 'triceps', 'quads'], { base: JERK }),

  // Kettlebell skills
  x('ex_turkish_get_up', 'Turkish Get-Up (Kettlebell)', 'kettlebell', C, ['core', 'shoulders'], { secondary: ['glutes'], aliases: ['TGU'] }),
  x('ex_kb_windmill', 'Windmill (Kettlebell)', 'kettlebell', C, ['core', 'shoulders'], { secondary: ['hamstrings'] }),

  // Carries and strongman
  x(CARRY, "Farmer's Carry", 'other', C, ['forearms', 'traps'], { secondary: ['core'], aliases: ["Farmer's Walk"] }),
  x('ex_db_farmers_carry', "Farmer's Carry (Dumbbell)", 'dumbbell', C, ['forearms', 'traps'], { secondary: ['core'], base: CARRY }),
  x('ex_kb_farmers_carry', "Farmer's Carry (Kettlebell)", 'kettlebell', C, ['forearms', 'traps'], { secondary: ['core'], base: CARRY }),
  x('ex_suitcase_carry', 'Suitcase Carry (Dumbbell)', 'dumbbell', C, ['core', 'forearms'], { base: CARRY }),
  x('ex_overhead_carry', 'Overhead Carry (Dumbbell)', 'dumbbell', C, ['shoulders', 'core'], { base: CARRY }),
  x('ex_yoke_carry', 'Yoke Carry', 'other', C, ['traps', 'core', 'quads'], { secondary: ['back'], base: CARRY, aliases: ['Yoke Walk'] }),
  x('ex_sandbag_carry', 'Sandbag Carry', 'other', C, ['core', 'back'], { secondary: ['biceps'], base: CARRY }),
  x(SLED, 'Sled Push', 'other', C, ['quads', 'glutes'], { secondary: ['calves'] }),
  x('ex_sled_drag', 'Sled Drag', 'other', C, ['quads', 'hamstrings', 'glutes'], { base: SLED, aliases: ['Sled Pull'] }),
  x(STONE, 'Atlas Stone Load', 'other', C, ['back', 'glutes', 'hamstrings'], { secondary: ['biceps', 'traps'], aliases: ['Atlas Stone'] }),
  x('ex_sandbag_to_shoulder', 'Sandbag to Shoulder', 'other', C, ['back', 'glutes'], { secondary: ['biceps', 'traps'], base: STONE }),
  x('ex_tire_flip', 'Tire Flip', 'other', C, ['glutes', 'back', 'quads'], { secondary: ['hamstrings'] }),
];

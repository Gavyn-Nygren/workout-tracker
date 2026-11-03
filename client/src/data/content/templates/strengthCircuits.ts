import type { StarterTemplate } from '../../types';
import { circuit, ex, rr, single, version, versions, warmups, weekly, working, workout } from './helpers';

/**
 * 10. Strength and Circuits: a heavy barbell lift, then a rep-based circuit, 3 days (2 days drops
 * Press & Circuit). Rounds are sets, and reps and load are logged: no timers. Only the heavy lifts
 * carry rules; the circuit's first exercise says how to make it harder.
 */

const CIRCUIT_NOTE = 'One round is one set of each exercise. When every round feels smooth, go heavier on the dumbbell or kettlebell.';

/** The circuit note, then the exercise's own. */
const opener = (own?: string) => (own ? `${CIRCUIT_NOTE} ${own}` : CIRCUIT_NOTE);

const squat = workout('tw_sac_squat', 'Squat & Circuit', [
  single(ex('ex_front_squat', [warmups([8, 3]), working(4, [4, 6])], { rule: rr(5) })),
  circuit(
    90,
    10,
    ex('ex_kb_swing', working(4, 15), { notes: opener() }),
    ex('ex_push_up', working(4, 10)),
    ex('ex_walking_lunge_bw', working(4, 20), { notes: '20 steps in total.' }),
    ex('ex_sit_up', working(4, 15)),
  ),
]);

const deadlift = workout('tw_sac_deadlift', 'Deadlift & Circuit', [
  single(ex('ex_deadlift', [warmups([5, 3]), working(4, [3, 5])], { rule: rr(10) })),
  circuit(
    60,
    10,
    ex('ex_pull_up', working(5, 5), { notes: opener('Use a band, or jump up and lower slowly, if you need to.') }),
    ex('ex_db_snatch', working(5, 10), { notes: '5 per arm.' }),
    ex('ex_burpee', working(5, 8)),
  ),
]);

const press = workout('tw_sac_press', 'Press & Circuit', [
  single(ex('ex_push_press', [warmups([8, 3]), working(4, [4, 6])], { rule: rr(5) })),
  circuit(
    120,
    15,
    ex('ex_db_thruster', working(3, 12), { notes: opener() }),
    ex('ex_kb_row', working(3, 10)),
    ex('ex_toes_to_bar', working(3, 8), { notes: 'Knee raises are fine.' }),
  ),
]);

export const strengthCircuits: StarterTemplate = {
  id: 'tpl_strength_circuits',
  name: 'Strength and Circuits',
  category: 'crossfit',
  level: 'intermediate',
  levels: ['intermediate', 'advanced'],
  goals: ['general', 'athletic', 'strength'],
  description: 'A heavy lift, then a circuit of three to five rounds mixing kettlebell, dumbbell and bodyweight moves.',
  equipment: ['barbell', 'kettlebell', 'dumbbell'],
  alsoNeeds: ['rack', 'pull_up_bar'],
  ...versions(
    version(3, weekly({ mon: squat, wed: deadlift, fri: press })),
    version(2, weekly({ mon: squat, thu: deadlift })),
  ),
  workouts: [squat, deadlift, press],
};

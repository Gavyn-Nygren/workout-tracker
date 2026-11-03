import type { StarterTemplate } from '../../types';
import { ex, fixed, hold, rr, single, superset, version, versions, warmups, working, workout } from './helpers';

/**
 * 11. Athletic Base: ten weeks of power for field and court sports, 3 days (2 days drops Jumps &
 * Single-Leg). Jumps and the push press come first, while fresh, with no effort target; then
 * strength, single-leg and side-to-side work. No Olympic lift to learn, so it suits beginners too.
 */

const WEEKS = 10;

const NORDIC_NOTE = 'Anchor your heels under something sturdy. Lower as slowly as you can, then push back up with your hands.';

const lower = workout('tw_ath_lower', 'Lower Power', [
  superset(
    90,
    ex('ex_box_jump', working(3, 3, { rir: null }), { notes: 'Step down after each jump. Pick a height you land on quietly.' }),
    ex('ex_dead_bug', working(3, [8, 10])),
  ),
  single(ex('ex_deadlift', [warmups([5, 3]), working(3, [3, 5])], { rule: rr(10) })),
  single(ex('ex_bulgarian_split_squat', working(3, [6, 10]), { rule: rr(5) })),
  superset(60, ex('ex_nordic_curl', working(2, [3, 5]), { notes: NORDIC_NOTE }), ex('ex_side_plank', hold(2, 30))),
]);

const upper = workout('tw_ath_upper', 'Upper Power', [
  single(ex('ex_push_press', [warmups([5, 3]), working(4, [3, 5], { rir: null })], { rule: rr(5), notes: 'Dip and drive with your legs; move the bar fast.' })),
  single(ex('ex_pull_up', working(4, [4, 8]), { notes: 'Fewer than 4? Use a band, or jump up and lower slowly, until you get there. At 4×8, hold a dumbbell between your feet.' })),
  superset(90, ex('ex_db_bench_press', working(3, [6, 10]), { rule: rr(5) }), ex('ex_db_row', working(3, [8, 12]), { rule: rr(5) })),
  superset(60, ex('ex_reverse_fly', working(2, [10, 20]), { rule: rr(5) }), ex('ex_hanging_knee_raise', working(2, [10, 15]))),
]);

const jumps = workout('tw_ath_jumps', 'Jumps & Single-Leg', [
  superset(
    90,
    ex('ex_broad_jump', working(3, 3, { rir: null }), { notes: 'Land softly and reset before the next jump.' }),
    ex('ex_lateral_bound', working(3, 4, { rir: null }), { notes: 'Stick each landing for a second.' }),
  ),
  single(ex('ex_front_squat', [warmups([8, 3]), working(3, [4, 6])], { rule: rr(5) })),
  single(ex('ex_single_leg_rdl', working(3, [6, 10]), { rule: rr(5) })),
  superset(
    60,
    ex('ex_copenhagen_plank', hold(2, 20), { notes: 'Top knee on the bench to make it easier, foot on the bench to make it harder.' }),
    ex('ex_single_leg_calf_raise', working(2, [8, 15]), { rule: rr(5) }),
  ),
]);

export const athleticBase: StarterTemplate = {
  id: 'tpl_athletic_base',
  name: 'Athletic Base',
  category: 'athletic',
  level: 'intermediate',
  levels: ['beginner', 'intermediate', 'advanced'],
  goals: ['athletic', 'strength'],
  description: 'Ten weeks of power for field and court sports: jumps and fast lifts first, then strength and single-leg work.',
  equipment: ['barbell', 'dumbbell'],
  alsoNeeds: ['rack', 'bench', 'pull_up_bar', 'box'],
  durationWeeks: WEEKS,
  ...versions(
    version(3, fixed(WEEKS, { mon: lower, wed: upper, fri: jumps })),
    version(2, fixed(WEEKS, { mon: lower, thu: upper })),
  ),
  workouts: [lower, upper, jumps],
};

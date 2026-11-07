import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays, fromISODate, toISODate } from '../src/data/dates';
import { eraseAllData } from '../src/data/db/sampleData';
import { migrate } from '../src/data/db/schema';
import { createSqliteRepository } from '../src/data/db/sqliteRepository';
import { SCHEDULE_AHEAD_DAYS } from '../src/data/repository';
import { planShiftFor, scheduleOccurrences } from '../src/data/schedule';
import type { Plan, PlanShift, ScheduledOccurrence, WorkoutSession } from '../src/data/types';
import { buildAgenda } from '../src/features/today/agenda';
import {
  askingMessage,
  askingTitle,
  dismissMissed,
  missedBannerState,
  pruneDismissed,
  pushedMessage,
  undoneMessage,
  type MissedBannerState,
} from '../src/features/today/missed';
import { openTestDatabase } from './support/nodeSqlite';

const MONDAY = '2026-10-19';
const TUESDAY = '2026-10-20';
const WEDNESDAY = '2026-10-21';
const TODAY = '2026-10-22'; // a Thursday
const FRIDAY = '2026-10-23';
const STAMP = '2026-10-01T08:00:00.000Z';

const plan = (id: string, extra: Partial<Plan> = {}): Plan => ({
  id,
  name: `Plan ${id}`,
  version: 1,
  status: 'active',
  startDate: '2026-10-05',
  schedule: { type: 'weekly', days: [{ weekday: 1, workoutIds: ['a'] }, { weekday: 3, workoutIds: ['b'] }, { weekday: 5, workoutIds: ['a'] }] },
  workouts: [
    { id: 'a', name: 'Upper', blocks: [] },
    { id: 'b', name: 'Lower', blocks: [] },
    { id: 'c', name: 'Cardio', blocks: [] },
  ],
  createdAt: STAMP,
  updatedAt: STAMP,
  ...extra,
});

const program = (id: string) => plan(id, { schedule: { type: 'fixed', weeks: 4, days: [] } });

/** Ids keep the original date, as the scheduler makes them. */
const occ = (planId: string, date: string, workoutId = 'a', extra: Partial<ScheduledOccurrence> = {}): ScheduledOccurrence => ({
  id: `occ_${planId}_${extra.shiftedFromDate ?? date}_${workoutId}`,
  planId,
  planVersion: 1,
  planWorkoutId: workoutId,
  scheduledDate: date,
  ...extra,
});

/** The UTC timestamp of a local wall-clock time on `date`, as the app stores createdAt. */
const localStamp = (date: string, hours: number, minutes = 0) => {
  const d = fromISODate(date);
  d.setHours(hours, minutes);
  return d.toISOString();
};

const shiftFor = (moved: ScheduledOccurrence, createdAt: string, extra: Partial<PlanShift> = {}): PlanShift => {
  const fromDate = moved.shiftedFromDate ?? moved.scheduledDate;
  return { id: 'shift_1', planId: moved.planId, occurrenceId: moved.id, fromDate, days: 1, createdAt, updatedAt: createdAt, ...extra };
};

function banner(input: {
  occurrences: ScheduledOccurrence[];
  sessions?: WorkoutSession[];
  plans?: Plan[];
  shifts?: PlanShift[];
  dismissed?: string[];
  activeOccurrenceId?: string;
  today?: string;
}): MissedBannerState | undefined {
  const today = input.today ?? TODAY;
  const plans = input.plans ?? [plan('p')];
  const agenda = buildAgenda({ occurrences: input.occurrences, sessions: input.sessions ?? [], plans, today });
  return missedBannerState({
    agenda,
    today,
    plans,
    shifts: input.shifts ?? [],
    dismissed: new Set(input.dismissed ?? []),
    activeOccurrenceId: input.activeOccurrenceId,
    weekStartsOn: 1,
  });
}

function asking(state: MissedBannerState | undefined) {
  assert.equal(state?.kind, 'asking');
  return state as Extract<MissedBannerState, { kind: 'asking' }>;
}

function pushed(state: MissedBannerState | undefined) {
  assert.equal(state?.kind, 'pushed');
  return state as Extract<MissedBannerState, { kind: 'pushed' }>;
}

// Wednesday's Lower, pushed to today (Thursday) by a weekly plan's push.
const moved = occ('p', TODAY, 'b', { shiftedFromDate: WEDNESDAY });
const weeklyPush = (createdAt = localStamp(TODAY, 9)) => shiftFor(moved, createdAt, { untilDate: '2026-10-25' });

describe('asking whether to push a plan forward', () => {
  test('asks about a missed workout in an active plan', () => {
    const missed = occ('p', WEDNESDAY, 'b');
    const state = asking(banner({ occurrences: [missed, occ('p', FRIDAY)] }));
    assert.equal(state.occurrenceId, missed.id);
    assert.equal(state.date, WEDNESDAY);
    assert.equal(state.days, 1);
    assert.equal(state.weekly, true);
    assert.deepEqual(state.items.map((i) => i.name), ['Lower']);
    assert.equal(askingTitle(state), 'You missed Lower on Wednesday');
    assert.equal(state.later, 'all');
    assert.equal(
      askingMessage(state),
      "Move Lower to today and the rest of this week's Plan p workouts 1 day later? Next week stays as planned. If you keep the schedule, you can still do it from Wednesday.",
    );
  });

  test("the open workout isn't offered, even before its first save", () => {
    const monday = occ('p', MONDAY);
    const wednesday = occ('p', WEDNESDAY, 'b');
    // Started from its card: the plan carries on from there, so Monday's earlier miss isn't asked about either.
    assert.equal(banner({ occurrences: [monday, wednesday], activeOccurrenceId: wednesday.id }), undefined);
    // Another workout the plan missed that day is still offered, without the open one, whichever comes first.
    const upper = occ('p', WEDNESDAY, 'a');
    const cardio = occ('p', WEDNESDAY, 'c');
    for (const [open, other] of [
      [upper, cardio],
      [cardio, upper],
    ]) {
      const state = asking(banner({ plans: [program('p')], occurrences: [upper, cardio], activeOccurrenceId: open.id }));
      assert.equal(state.occurrenceId, other.id);
      assert.deepEqual(state.items.map((i) => i.key), [other.id]);
    }
  });

  test('says nothing once the user keeps the schedule', () => {
    const missed = occ('p', WEDNESDAY, 'b');
    assert.equal(banner({ occurrences: [missed], dismissed: [missed.id] }), undefined);
  });

  test('says nothing when the plan is paused', () => {
    assert.equal(banner({ occurrences: [occ('p', WEDNESDAY, 'b')], plans: [plan('p', { status: 'paused' })] }), undefined);
  });

  test("a paused plan's miss doesn't hide an active plan's earlier one", () => {
    const state = asking(
      banner({
        occurrences: [occ('q', MONDAY), occ('p', WEDNESDAY, 'b')],
        plans: [plan('p', { status: 'paused' }), plan('q')],
      }),
    );
    assert.equal(state.occurrenceId, occ('q', MONDAY).id);
  });

  test('the latest of two missed workouts wins', () => {
    assert.equal(asking(banner({ occurrences: [occ('p', MONDAY), occ('p', WEDNESDAY, 'b')] })).occurrenceId, occ('p', WEDNESDAY, 'b').id);
    // Across plans too.
    const twoPlans = banner({ occurrences: [occ('q', WEDNESDAY, 'b'), occ('p', MONDAY)], plans: [plan('p'), plan('q')] });
    assert.equal(asking(twoPlans).occurrenceId, occ('q', WEDNESDAY, 'b').id);
  });

  test('nothing older than a week', () => {
    assert.equal(banner({ occurrences: [occ('p', addDays(TODAY, -8))] }), undefined);
  });

  test("keeping the schedule settles the plan's earlier misses, but not another plan's", () => {
    const occurrences = [occ('p', MONDAY), occ('q', TUESDAY, 'b'), occ('p', WEDNESDAY, 'b')];
    const plans = [plan('p'), plan('q')];
    const state = asking(banner({ occurrences, plans, dismissed: [occ('p', WEDNESDAY, 'b').id] }));
    assert.equal(state.occurrenceId, occ('q', TUESDAY, 'b').id, "Plan q's miss, not Plan p's Monday");
    assert.equal(banner({ occurrences, plans, dismissed: [occ('p', WEDNESDAY, 'b').id, occ('q', TUESDAY, 'b').id] }), undefined);
  });

  test("a push settles the plan's earlier misses", () => {
    // Yesterday Wednesday's Lower was pushed to Thursday and done there; Monday's Upper was missed before it.
    const done = occ('p', TODAY, 'b', { shiftedFromDate: WEDNESDAY, sessionId: 'sess_1' });
    const session: WorkoutSession = {
      id: 'sess_1',
      name: 'Lower',
      occurrenceId: done.id,
      planId: 'p',
      status: 'completed',
      completion: 'full',
      completedDate: TODAY,
      blocks: [],
      createdAt: STAMP,
      updatedAt: STAMP,
    };
    const state = banner({
      today: FRIDAY,
      occurrences: [occ('p', MONDAY), done, occ('p', '2026-10-24', 'a', { shiftedFromDate: FRIDAY })],
      sessions: [session],
      shifts: [shiftFor(done, localStamp(TODAY, 9), { untilDate: '2026-10-25' })],
    });
    assert.equal(state, undefined);
  });

  test('workouts missed on the same day are asked about, and moved, together', () => {
    const plans = [program('p')];
    const state = asking(banner({ plans, occurrences: [occ('p', WEDNESDAY, 'a'), occ('p', WEDNESDAY, 'c')] }));
    assert.equal(state.weekly, false);
    assert.equal(askingTitle(state), 'You missed Upper and Cardio on Wednesday');
    assert.match(askingMessage(state), /^Push Plan p forward 1 day so Upper and Cardio land on today\? If you keep the schedule, you can still do them from Wednesday\.$/);
    // Keeping the schedule remembers both.
    const kept = dismissMissed([], state.items, TODAY).map((d) => d.id);
    assert.equal(banner({ plans, occurrences: [occ('p', WEDNESDAY, 'a'), occ('p', WEDNESDAY, 'c')], dismissed: kept }), undefined);

    const a = occ('p', TODAY, 'a', { shiftedFromDate: WEDNESDAY });
    const c = occ('p', TODAY, 'c', { shiftedFromDate: WEDNESDAY });
    const friday = occ('p', '2026-10-24', 'b', { shiftedFromDate: FRIDAY });
    const after = pushed(banner({ plans, occurrences: [a, c, friday], shifts: [shiftFor(a, localStamp(TODAY, 9))] }));
    assert.equal(pushedMessage(after), 'Upper and Cardio moved to today, and the rest of Plan p moved 1 day later.');
    assert.equal(undoneMessage(after), 'Push undone. Upper and Cardio are back on Wednesday.');
  });
});

describe('Undo after a push', () => {
  test('shows after a push made today, while the moved workout is unstarted', () => {
    const shift = weeklyPush();
    const state = pushed(banner({ occurrences: [occ('p', MONDAY), moved, occ('p', '2026-10-24', 'a', { shiftedFromDate: FRIDAY })], shifts: [shift] }));
    assert.equal(state.shift.id, shift.id);
    assert.equal(state.returnsTo, WEDNESDAY);
    assert.equal(pushedMessage(state), "Lower moved to today, and the rest of this week's Plan p workouts moved 1 day later. Next week is unchanged.");
    assert.equal(undoneMessage(state), 'Push undone. Lower is back on Wednesday.');
  });

  test('a fixed program or rotating cycle says the rest of the plan moved', () => {
    const friday = occ('p', '2026-10-24', 'a', { shiftedFromDate: FRIDAY });
    const state = pushed(banner({ plans: [program('p')], occurrences: [moved, friday], shifts: [shiftFor(moved, localStamp(TODAY, 9))] }));
    assert.equal(pushedMessage(state), 'Lower moved to today, and the rest of Plan p moved 1 day later.');
  });

  test("a program's last workout says only that it moved", () => {
    // Nothing comes after it, so there's no "rest of the plan" to mention.
    const state = pushed(banner({ plans: [program('p')], occurrences: [moved], shifts: [shiftFor(moved, localStamp(TODAY, 9))] }));
    assert.equal(state.later, 'none');
    assert.equal(pushedMessage(state), 'Lower moved to today.');
  });

  test('the newest push today shows', () => {
    const other = occ('q', TODAY, 'a', { shiftedFromDate: TUESDAY });
    const later = shiftFor(other, localStamp(TODAY, 10), { id: 'shift_2', days: 2 });
    const state = pushed(banner({ plans: [plan('p'), plan('q')], occurrences: [moved, other], shifts: [later, weeklyPush()] }));
    assert.equal(state.shift.id, 'shift_2');
  });

  test('goes once the moved workout is started', () => {
    const started = { ...moved, sessionId: 'sess_1' };
    const session: WorkoutSession = { id: 'sess_1', name: 'Lower', occurrenceId: moved.id, planId: 'p', status: 'in_progress', blocks: [], createdAt: STAMP, updatedAt: STAMP };
    assert.equal(banner({ occurrences: [started], sessions: [session], shifts: [weeklyPush()] }), undefined);
    // Open in the workout screen but not saved yet counts too.
    assert.equal(banner({ occurrences: [moved], shifts: [weeklyPush()], activeOccurrenceId: moved.id }), undefined);
  });

  test('goes at the end of the day', () => {
    // Friday: the moved workout wasn't done on Thursday either, so that's what's asked about now.
    const state = asking(banner({ today: FRIDAY, occurrences: [moved], shifts: [weeklyPush()] }));
    assert.equal(state.occurrenceId, moved.id);
    assert.equal(state.date, TODAY);
  });

  test("a push late in the evening or just after midnight counts on the local day, not UTC's", () => {
    const original = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      // West of UTC a late-evening push is already tomorrow in UTC; east of it, an early one is still yesterday.
      for (const [zone, hours, minutes] of [
        ['America/Chicago', 23, 30],
        ['Asia/Tokyo', 0, 30],
      ] as const) {
        process.env.TZ = zone;
        const createdAt = localStamp(TODAY, hours, minutes);
        assert.notEqual(createdAt.slice(0, 10), TODAY, `${zone}: the UTC date differs, so slicing it would fail`);
        assert.equal(banner({ occurrences: [moved], shifts: [weeklyPush(createdAt)] })?.kind, 'pushed', zone);
      }
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('a weekly push stays within its week', () => {
  // Upper on Mondays and Lower on Wednesdays. Last week's Upper was missed; its Lower was done.
  const weekly = plan('w', { schedule: { type: 'weekly', days: [{ weekday: 1, workoutIds: ['a'] }, { weekday: 3, workoutIds: ['b'] }] } });
  const LAST_MONDAY = '2026-10-12';
  const lastUpper = occ('w', LAST_MONDAY).id;
  const thisUpper = occ('w', MONDAY).id;
  const lastLower = occ('w', '2026-10-14', 'b', { sessionId: 'sess_lower' });
  const lastLowerSession: WorkoutSession = {
    id: 'sess_lower',
    name: 'Lower',
    occurrenceId: lastLower.id,
    planId: 'w',
    status: 'completed',
    completion: 'full',
    completedDate: lastLower.scheduledDate,
    blocks: [],
    createdAt: STAMP,
    updatedAt: STAMP,
  };

  /**
   * The banner on `today`, with the plan's workouts where the engine puts them after `shifts`.
   * `laterFirst` lists each day's workouts newest first, as SQLite's row order may.
   */
  const weeklyBanner = (today: string, shifts: PlanShift[] = [], laterFirst = false) => {
    // Started workouts stay where they were done.
    const placed = [lastLower, ...scheduleOccurrences(weekly, LAST_MONDAY, '2026-11-08', shifts).filter((o) => o.id !== lastLower.id)];
    const occurrences = laterFirst ? placed.reverse() : placed;
    const on = (date: string) => occurrences.filter((o) => o.scheduledDate === date).map((o) => o.id);
    return { on, state: banner({ today, plans: [weekly], occurrences, sessions: [lastLowerSession], shifts }) };
  };

  /** The push the repository saves for the asked-about workout. */
  const pushFor = (state: Extract<MissedBannerState, { kind: 'asking' }>, today: string, id: string) => {
    const occurrence = state.items.find((i) => i.key === state.occurrenceId)?.occurrence;
    assert.ok(occurrence);
    const shift = planShiftFor({ id, plan: weekly, occurrence, today, weekStartsOn: 1, now: localStamp(today, 9) });
    assert.ok(shift);
    return shift;
  };

  test('a week-old miss moves only itself, and says so', () => {
    const before = asking(weeklyBanner(MONDAY).state);
    assert.equal(before.occurrenceId, lastUpper);
    assert.equal(before.days, 7);
    assert.equal(before.later, 'none');
    assert.equal(askingMessage(before), 'Move Upper to today? Your other Plan w workouts stay as planned. If you keep the schedule, you can still do it from Monday.');

    const after = weeklyBanner(MONDAY, [pushFor(before, MONDAY, 'shift_1')]);
    // This week's own workouts would cross into next week, so they stay: today holds two Uppers.
    assert.deepEqual(after.on(MONDAY), [lastUpper, thisUpper]);
    assert.deepEqual(after.on(WEDNESDAY), [occ('w', WEDNESDAY, 'b').id]);
    const state = pushed(after.state);
    assert.deepEqual(state.items.map((i) => i.key), [lastUpper], "today's own Upper didn't move");
    assert.equal(state.later, 'none');
    assert.equal(pushedMessage(state), 'Upper moved to today.');
    assert.equal(undoneMessage(state), 'Push undone. Upper is back on Monday.');
  });

  test('a doubled-up day pushes the earliest original, so both move', () => {
    const shift1 = pushFor(asking(weeklyBanner(MONDAY).state), MONDAY, 'shift_1');
    // Neither Upper was done on Monday. Today's own comes first in the list.
    const before = asking(weeklyBanner(TUESDAY, [shift1], true).state);
    assert.equal(before.date, MONDAY);
    assert.deepEqual(before.items.map((i) => i.key), [thisUpper, lastUpper]);
    assert.equal(before.occurrenceId, lastUpper, "pushing today's own would leave last week's behind");
    assert.equal(before.later, 'all');
    assert.equal(
      askingMessage(before),
      "Move Upper and Upper to today and the rest of this week's Plan w workouts 1 day later? Next week stays as planned. If you keep the schedule, you can still do them from Monday.",
    );

    const shift2 = pushFor(before, TUESDAY, 'shift_2');
    const after = weeklyBanner(TUESDAY, [shift1, shift2], true);
    assert.deepEqual(after.on(TUESDAY), [thisUpper, lastUpper]);
    assert.deepEqual(after.on(TODAY), [occ('w', WEDNESDAY, 'b').id], "Wednesday's Lower moved a day");
    const state = pushed(after.state);
    assert.equal(state.shift.id, 'shift_2');
    assert.equal(state.returnsTo, MONDAY);
    assert.deepEqual(state.items.map((i) => i.key).sort(), [lastUpper, thisUpper].sort());
    assert.equal(pushedMessage(state), "Upper and Upper moved to today, and the rest of this week's Plan w workouts moved 1 day later. Next week is unchanged.");
    assert.equal(undoneMessage(state), 'Push undone. Upper and Upper are back on Monday.');
  });

  test("workouts that would cross into next week stay, and the wording says only some moved", () => {
    // Lower on Wednesdays, Upper on Fridays, Cardio on Sundays. Wednesday's was missed; it's Friday.
    const split = plan('s', {
      schedule: { type: 'weekly', days: [{ weekday: 3, workoutIds: ['b'] }, { weekday: 5, workoutIds: ['a'] }, { weekday: 7, workoutIds: ['c'] }] },
    });
    const SUNDAY = '2026-10-25';
    const view = (shifts: PlanShift[] = []) => {
      const occurrences = scheduleOccurrences(split, MONDAY, '2026-11-08', shifts);
      return { occurrences, state: banner({ today: FRIDAY, plans: [split], occurrences, shifts }) };
    };
    const before = asking(view().state);
    assert.equal(before.later, 'some');
    assert.equal(
      askingMessage(before),
      "Move Lower to today and this week's later Plan s workouts 2 days later where they fit? Next week stays as planned. If you keep the schedule, you can still do it from Wednesday.",
    );

    const occurrence = before.items[0].occurrence;
    assert.ok(occurrence);
    const shift = planShiftFor({ id: 'shift_1', plan: split, occurrence, today: FRIDAY, weekStartsOn: 1, now: localStamp(FRIDAY, 9) });
    assert.ok(shift);
    const after = view([shift]);
    // Friday's Upper fits on Sunday; Sunday's Cardio would cross into next week, so it stays.
    assert.deepEqual(
      after.occurrences.filter((o) => o.scheduledDate === SUNDAY).map((o) => o.planWorkoutId),
      ['a', 'c'],
    );
    const state = pushed(after.state);
    assert.equal(state.later, 'some');
    assert.equal(pushedMessage(state), "Lower moved to today, and this week's later Plan s workouts moved 2 days where they fit. Next week is unchanged.");
  });
});

describe('remembering "Keep schedule"', () => {
  test('adds ids once, drops ones over two weeks old and unreadable values, and caps the list', () => {
    const items = asking(banner({ occurrences: [occ('p', WEDNESDAY, 'b')] })).items;
    const once = dismissMissed([{ id: 'old', date: addDays(TODAY, -15) }, { id: 'recent', date: MONDAY }, 'junk'], items, TODAY);
    assert.deepEqual(once, [
      { id: 'recent', date: MONDAY },
      { id: occ('p', WEDNESDAY, 'b').id, date: WEDNESDAY },
    ]);
    assert.deepEqual(dismissMissed(once, items, TODAY), once);
    assert.deepEqual(pruneDismissed({ not: 'a list' }, TODAY), []);

    const many = Array.from({ length: 60 }, (_, i) => ({ id: `occ_${i}`, date: MONDAY }));
    const capped = pruneDismissed(many, TODAY);
    assert.equal(capped.length, 50);
    assert.equal(capped[capped.length - 1].id, 'occ_59', 'the newest are kept');
  });
});

describe('push and undo through the repository', () => {
  test('the banner follows a real push and its undo', async () => {
    const db = openTestDatabase();
    migrate(db);
    eraseAllData(db);
    // The push is stamped with the real clock, so this runs on the real date.
    const realToday = toISODate(new Date());
    let today = addDays(realToday, -2);
    const repo = createSqliteRepository(db, { today: () => today });
    await repo.savePlan(plan('r', { startDate: today, schedule: { type: 'rotating', steps: [{ workoutIds: ['a'] }, { workoutIds: ['b'] }] } }));
    today = realToday;

    const state = async () => {
      const [occurrences, sessions, plans, shifts] = await Promise.all([
        repo.listOccurrences({ from: addDays(today, -14), to: addDays(today, SCHEDULE_AHEAD_DAYS) }),
        repo.listSessions(),
        repo.listPlans(),
        repo.listPlanShifts(),
      ]);
      const agenda = buildAgenda({ occurrences, sessions, plans, today });
      return { agenda, banner: missedBannerState({ agenda, today, plans, shifts, dismissed: new Set(), weekStartsOn: 1 }) };
    };

    // Two days missed: yesterday's B is the one asked about.
    const before = asking((await state()).banner);
    assert.equal(before.date, addDays(today, -1));
    assert.equal(before.items[0].name, 'Lower');
    assert.equal(before.weekly, false);

    await repo.pushPlanForward(before.occurrenceId, 'shift_test');
    const afterPush = await state();
    const undo = pushed(afterPush.banner);
    assert.equal(undo.shift.id, 'shift_test');
    assert.equal(undo.returnsTo, addDays(today, -1));
    assert.deepEqual(
      (afterPush.agenda.get(today) ?? []).map((i) => i.key),
      [before.occurrenceId],
      "today shows the moved workout; today's own moved a day later",
    );

    await repo.undoPlanShift(undo.shift.id);
    const again = asking((await state()).banner);
    assert.equal(again.occurrenceId, before.occurrenceId);
    assert.equal(again.date, addDays(today, -1));
    db.close();
  });
});

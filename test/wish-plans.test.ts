import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Operation } from '../src/ledger.ts';
import type { Budget, Purchase } from '../src/week.ts';
import {
  combinedPlan,
  covered,
  gathering,
  heldByWay,
  keptSteps,
  parsePicks,
  picksText,
  savingsTaken,
  waysOf,
  wishPurchases,
  type ChosenPlan,
  type PlanContext,
  type Step,
  type WishGoal,
} from '../src/wish-plans.ts';

// The user's case: weeks from Saturday, today 13 October, tyres for 60 000 needed by 1 November, which falls in the
// week of 31 October, a week of November.
const today = '2026-10-13';
const tyres: WishGoal = { id: 1, title: 'Резина', amount: 60_000, due: '2026-11-01' };

function purchase(id: number, title: string, amount: number, week: string, overrides: Partial<Purchase> = {}): Purchase {
  return { id, title, amount, week, envelope: 'extra', kind: 'required', done: false, ...overrides };
}

/** October's extras have 30 000 planned, November's 73 600 with flexible boots among them, December's nothing. */
function context(purchases: Purchase[] = [], savings = 120_000): PlanContext {
  const budget: Budget = {
    expenses: [],
    purchases: [
      purchase(1, 'Ремонт', 30_000, '2026-10-10'),
      purchase(2, 'Подарок Савве', 64_100, '2026-11-14'),
      purchase(3, 'Ботинки', 9_500, '2026-10-31', { kind: 'flexible' }),
      ...purchases,
    ],
    marks: new Map(),
    regular: [],
    weekStart: 5,
    weekLimits: new Map(),
  };
  return { budget, today, savings: () => savings };
}

const parts = (plan: ReturnType<typeof combinedPlan>) => plan.parts.map((p) => [p.way.id, p.given, p.fixed]);

describe('Ways to afford a wish', () => {
  it('offers the extras of the months up to the day, flexible purchases, the weeks, savings and waiting', () => {
    assert.deepEqual(
      waysOf(tyres, context()).map((w) => [w.id, w.most]),
      [
        ['extra-2026-10', 70_000],
        ['extra-2026-11', 26_400],
        ['flexible', 9_500],
        ['weeks', 20_000],
        ['savings', 120_000],
        ['later-2026-12', 100_000],
      ],
    );
    assert.deepEqual(
      waysOf(tyres, context([], 0)).map((w) => w.id),
      ['extra-2026-10', 'extra-2026-11', 'flexible', 'weeks', 'later-2026-12'],
      'a way with nothing to give is left out',
    );
  });

  it('gives the weeks what the user set and takes the rest from the extras', () => {
    const plan = combinedPlan(tyres, context(), parsePicks('weeks:5000,extra-2026-10:'));
    assert.deepEqual(parts(plan), [
      ['weeks', 15_000, true],
      ['extra-2026-10', 45_000, false],
    ]);
    assert.deepEqual(plan.plan, {
      buyWeek: '2026-10-31',
      short: 0,
      steps: [
        { way: 'weeks', kind: 'week', week: '2026-10-17', amount: 5_000 },
        { way: 'weeks', kind: 'week', week: '2026-10-24', amount: 5_000 },
        { way: 'weeks', kind: 'week', week: '2026-10-31', amount: 5_000 },
        { way: 'extra-2026-10', kind: 'extra', week: '2026-10-10', amount: 45_000 },
      ],
    });
    assert.equal(picksText(plan.parts), 'weeks:5000,extra-2026-10:');
  });

  it('lets a way just picked take over from the ways picked before it', () => {
    assert.deepEqual(parts(combinedPlan(tyres, context(), parsePicks('weeks:,extra-2026-10:'))), [
      ['weeks', 0, false],
      ['extra-2026-10', 60_000, false],
    ]);
    assert.deepEqual(parts(combinedPlan(tyres, context(), parsePicks('weeks:,extra-2026-11:'))), [
      ['weeks', 33_600, false],
      ['extra-2026-11', 26_400, false],
    ]);
  });

  it('lets a way be given by hand no more than the others given by hand leave', () => {
    const plan = combinedPlan(tyres, context(), parsePicks('extra-2026-10:45000,weeks:,savings:'));
    assert.deepEqual(
      plan.parts.map((p) => [p.way.id, p.top]),
      [
        ['extra-2026-10', 60_000],
        ['weeks', 5_000],
        ['savings', 15_000],
      ],
    );
    assert.equal(combinedPlan(tyres, context(), parsePicks('extra-2026-11:')).plan.short, 33_600, 'what the ways picked cannot give is short');
  });

  it('moves flexible purchases past the day and holds the room they leave', () => {
    const plan = combinedPlan(tyres, context(), parsePicks('flexible:,extra-2026-11:'));
    assert.deepEqual(plan.plan.steps, [
      { way: 'flexible', kind: 'move', purchase: 3, from: '2026-10-31', to: '2026-11-28', amount: 9_500 },
      { way: 'flexible', kind: 'extra', week: '2026-10-31', amount: 9_500 },
      { way: 'extra-2026-11', kind: 'extra', week: '2026-10-31', amount: 26_400 },
    ]);
    assert.equal(plan.plan.short, 24_100);
  });

  it('buys later when waiting for a later month’s extras', () => {
    const plan = combinedPlan(tyres, context(), parsePicks('later-2026-12:'));
    assert.deepEqual(plan.plan, { buyWeek: '2026-11-28', short: 0, steps: [{ way: 'later-2026-12', kind: 'extra', week: '2026-11-28', amount: 60_000 }] });
  });

  it('holds the money of chosen plans as purchases of the wish, set aside before the month it is bought in', () => {
    const plan = {
      ways: 'weeks:5000,extra-2026-10:,savings:',
      buyWeek: '2026-10-31',
      steps: [
        { way: 'weeks', kind: 'week', week: '2026-10-17', amount: 5_000 },
        { way: 'weeks', kind: 'week', week: '2026-10-31', amount: 5_000 },
        { way: 'extra-2026-10', kind: 'extra', week: '2026-10-10', amount: 40_000 },
        { way: 'flexible', kind: 'extra', week: '2026-10-17', amount: 2_000 },
        { way: 'savings', kind: 'savings', month: '2026-11', amount: 8_000 },
      ] satisfies Step[],
    };
    const held = { kind: 'required', done: false, wish: 1 } as const;
    assert.deepEqual(wishPurchases([{ wish: tyres, plan }], { today, weekStart: 5 }), [
      { id: -1001, title: 'Резина · отложить', amount: 5_000, week: '2026-10-17', envelope: 'week', ...held, savedIn: { from: '2026-10-17', to: '2026-10-23' } },
      { id: -1002, title: 'Резина', amount: 5_000, week: '2026-10-31', envelope: 'week', ...held, savedIn: { from: '2026-10-31', to: '2026-11-06' } },
      { id: -1003, title: 'Резина · отложить', amount: 42_000, week: '2026-10-10', envelope: 'extra', ...held, savedIn: { from: '2026-10-03', to: '2026-10-30' } },
    ], "a month's extras are held once, in the earliest week, and set aside by expenses of any week of the month");
    assert.equal(savingsTaken([{ plan }], '2026-11'), 8_000);
    assert.equal(savingsTaken([{ plan }], '2026-10'), 0);
  });
});

/** An expense that set money aside for the wish. */
function saving(id: string, date: string, amount: number, envelope: 'week' | 'extra' = 'week'): Operation {
  return { id, date, created: 0, kind: 'expense', amount, saving: { id: 1, title: 'Шины Kia K5', envelope } } as Operation;
}

// The user's case, 18 October: tyres for the Kia, 60 000 by 28 November, from 5 000 a week and the rest from
// December's extras; the week of 28 November is December's. On 17 October the user set aside 5 000 for them.
const kia = { id: 1, title: 'Шины Kia K5', amount: 60_000 };
const weeks = ['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28'];
const kiaPlan: ChosenPlan = {
  ways: 'weeks:5000,extra-2026-12:',
  buyWeek: '2026-11-28',
  steps: [...weeks.map((week): Step => ({ way: 'weeks', kind: 'week', week, amount: 5_000 })), { way: 'extra-2026-12', kind: 'extra', week: '2026-11-28', amount: 25_000 }],
};
const on = (day: string) => ({ today: day, weekStart: 5 });

describe('Money set aside for a wish', () => {
  it('pays what the plan holds in its week, so the week does not count it twice', () => {
    const g = gathering(kia, kiaPlan, [saving('t17', '2026-10-17', 5_000)], on('2026-10-18'));
    assert.deepEqual(g.held.map((h) => [h.purchase.week, h.purchase.envelope, h.covered, h.left]).slice(0, 2), [
      ['2026-10-17', 'week', 5_000, 0],
      ['2026-10-24', 'week', 0, 5_000],
    ]);
    assert.deepEqual([g.saved, g.covered, g.short], [5_000, 60_000, 0]);
  });

  it('keeps of a week gone by only what was set aside in it (the user’s rule, 2026-10-18)', () => {
    const set = [saving('t17', '2026-10-17', 5_000), saving('t26', '2026-10-26', 4_000)];
    const g = gathering(kia, kiaPlan, set, on('2026-11-02'));
    assert.deepEqual([g.saved, g.covered, g.short], [9_000, 59_000, 1_000], 'four thousand instead of five leaves the wish a thousand short');
    assert.equal(g.held.find((h) => h.purchase.week === '2026-10-24')?.left, 0, 'what was not set aside goes back to the week');

    const none = gathering(kia, kiaPlan, [set[0]!], on('2026-11-02'));
    assert.deepEqual([none.saved, none.short], [5_000, 5_000], 'a week with nothing set aside sets nothing aside');

    const late = gathering(kia, kiaPlan, set, on('2027-01-10'));
    assert.equal(late.held.find((h) => h.purchase.week === '2026-11-28' && h.purchase.envelope === 'week')?.left, 5_000, "the buying week's money stays, as the expense that buys the wish pays it");
    assert.equal(late.held.find((h) => h.purchase.envelope === 'extra')?.left, 25_000, "so does the buying month's");
  });

  it('starts a plan chosen anew from what is set aside, so the same ways gather what is short', () => {
    const set = [saving('t17', '2026-10-17', 5_000), saving('t26', '2026-10-26', 4_000)];
    const g = gathering(kia, kiaPlan, set, on('2026-11-02'));
    const kept = keptSteps(g, kiaPlan.steps, '2026-11-02', 5);
    assert.deepEqual(kept, [
      { way: 'weeks', kind: 'week', week: '2026-10-17', amount: 5_000 },
      { way: 'weeks', kind: 'week', week: '2026-10-24', amount: 4_000 },
      { way: 'weeks', kind: 'week', week: '2026-10-31', amount: 5_000 },
    ], 'weeks gone by as set aside, this one as planned, the rest planned anew');
    const goal: WishGoal = { ...kia, due: '2026-11-28' };
    const again = combinedPlan(goal, { ...context(), today: '2026-11-02' }, parsePicks(kiaPlan.ways), kept);
    assert.deepEqual(parts(again), [
      ['weeks', 20_000, true],
      ['extra-2026-12', 26_000, false],
    ]);
    assert.equal(gathering(kia, again.plan, set, on('2026-11-02')).short, 0);
    assert.equal(Math.round(heldByWay(g, kiaPlan.steps, '2026-10-31').get('extra-2026-12') ?? 0), 25_000, 'the chosen plan still gives what it was chosen with');
  });

  it('keeps what was set aside where no plan held it, and of this month’s extras what is set aside of them', () => {
    const loose = gathering(kia, null, [saving('t17', '2026-10-17', 5_000)], on('2026-10-18'));
    assert.deepEqual([loose.saved, loose.covered, loose.loose.length], [5_000, 5_000, 1]);
    assert.deepEqual(keptSteps(loose, [], '2026-10-18', 5), [{ way: 'saved', kind: 'week', week: '2026-10-17', amount: 5_000 }]);

    const geely: ChosenPlan = {
      ways: 'extra-2026-10:61514,extra-2026-11:',
      buyWeek: '2026-11-14',
      steps: [
        { way: 'extra-2026-10', kind: 'extra', week: '2026-10-17', amount: 61_514 },
        { way: 'extra-2026-11', kind: 'extra', week: '2026-11-14', amount: 3_486 },
      ],
    };
    const wish = { ...kia, amount: 65_000 };
    const set = [saving('t20', '2026-10-20', 20_000, 'extra')];
    const now = gathering(wish, geely, set, on('2026-10-25'));
    assert.deepEqual([now.saved, now.covered, now.short], [20_000, 65_000, 0]);
    assert.deepEqual(keptSteps(now, geely.steps, '2026-10-25', 5), [{ way: 'extra-2026-10', kind: 'extra', week: '2026-10-17', amount: 20_000 }]);
    assert.equal(gathering(wish, geely, set, on('2026-11-02')).short, 41_514, "October's extras gone by keep what was set aside of them");
  });
});

describe('Picks', () => {
  it('reads picks as the app sends them, leaving out what is not a way', () => {
    assert.deepEqual(parsePicks('weeks:5000,extra-2026-10:,bad way:1,savings:x'), [
      { id: 'weeks', amount: 5_000 },
      { id: 'extra-2026-10', amount: null },
      { id: 'savings', amount: null },
    ]);
    assert.deepEqual(parsePicks(''), []);
    assert.deepEqual(parsePicks(null), []);
  });
});

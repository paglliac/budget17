import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Budget, Purchase } from '../src/week.ts';
import { begunSteps, combinedPlan, covered, parsePicks, picksText, savingsTaken, waysOf, wishPurchases, type PlanContext, type Step, type WishGoal } from '../src/wish-plans.ts';

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

  it('keeps what a plan chosen before set aside already, and plans only the rest', () => {
    const chosen: Step[] = [
      { way: 'weeks', kind: 'week', week: '2026-10-10', amount: 5_000 },
      { way: 'weeks', kind: 'week', week: '2026-10-17', amount: 5_000 },
      { way: 'extra-2026-09', kind: 'extra', week: '2026-09-05', amount: 10_000 },
      { way: 'extra-2026-10', kind: 'extra', week: '2026-10-10', amount: 40_000 },
      { way: 'flexible', kind: 'move', purchase: 3, from: '2026-10-31', to: '2026-11-28', amount: 9_500 },
    ];
    const kept = begunSteps(chosen, today, 5);
    assert.deepEqual(kept, [chosen[0], chosen[2]]);
    const plan = combinedPlan(tyres, context(), parsePicks('extra-2026-10:'), kept);
    assert.equal(covered(plan.plan.steps), 60_000);
    assert.deepEqual(parts(plan), [['extra-2026-10', 45_000, false]]);
  });

  it('holds the money of chosen plans as purchases of the wish, set aside before the month it is bought in', () => {
    const plan = {
      ways: 'weeks:5000,extra-2026-10:,savings:',
      buyWeek: '2026-10-31',
      steps: [
        { way: 'weeks', kind: 'week', week: '2026-10-17', amount: 5_000 },
        { way: 'weeks', kind: 'week', week: '2026-10-31', amount: 5_000 },
        { way: 'extra-2026-10', kind: 'extra', week: '2026-10-10', amount: 40_000 },
        { way: 'flexible', kind: 'extra', week: '2026-10-10', amount: 2_000 },
        { way: 'savings', kind: 'savings', month: '2026-11', amount: 8_000 },
      ] satisfies Step[],
    };
    assert.deepEqual(wishPurchases([{ wish: tyres, plan }]), [
      { id: -1001, title: 'Резина · отложить', amount: 5_000, week: '2026-10-17', envelope: 'week', kind: 'required', done: false, wish: 1 },
      { id: -1002, title: 'Резина', amount: 5_000, week: '2026-10-31', envelope: 'week', kind: 'required', done: false, wish: 1 },
      { id: -1003, title: 'Резина · отложить', amount: 42_000, week: '2026-10-10', envelope: 'extra', kind: 'required', done: false, wish: 1 },
    ]);
    assert.equal(savingsTaken([{ plan }], '2026-11'), 8_000);
    assert.equal(savingsTaken([{ plan }], '2026-10'), 0);
  });

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

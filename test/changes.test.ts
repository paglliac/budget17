import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { weekChanges, type WeekChange } from '../src/changes.ts';
import type { Operation } from '../src/ledger.ts';
import type { Budget, Envelope, Purchase } from '../src/week.ts';

// The user's week of 17–23 October 2026, from Saturday, as it was when his wife put «Участие в Кедродзилле» for 3 500
// into its plan from her phone: 45 000 for the week, groceries planned and paid, an expense of 2 000 in the extras.
const week = '2026-10-17';
const next = '2026-10-24';

function spending(id: string, date: string, amount: number, fields: Partial<Operation> = {}): Operation {
  return { id, date, created: 0, kind: 'expense', amount, original: null, payee: id, shop: null, name: id, originalPayee: null, comment: null, description: null, category: null, zenmoneyCategory: null, regular: null, purchase: null, account: 'Основной', toAccount: null, hold: false, ignored: false, optional: false, ...fields };
}

function purchase(id: number, title: string, amount: number, fields: Partial<Purchase> = {}): Purchase {
  return { id, title, amount, week, envelope: 'week', kind: 'required', done: false, ...fields };
}

const food = purchase(28, 'Продукты на неделю', 8_000);
const race = purchase(35, 'Участие в Кедродзилле', 3_500);

function budget({ purchases = [food], marks = [['gibdd', 'extra']], limits = [], expenses }: {
  purchases?: Purchase[];
  marks?: Array<[string, Envelope]>;
  limits?: Array<[string, number]>;
  expenses?: Operation[];
} = {}): Budget {
  return {
    expenses: expenses ?? [
      spending('lenta', '2026-10-17', 7_992, { name: 'Лента', purchase: { id: food.id, title: food.title } }),
      spending('auto', '2026-10-17', 5_000, { name: 'Автомобиль' }),
      spending('gibdd', '2026-10-19', 2_000, { name: 'Штрафы ГИБДД' }),
    ],
    purchases,
    marks: new Map(marks),
    regular: [],
    weekStart: 5,
    weekLimits: new Map(limits),
  };
}

const brief = (c: WeekChange) => [c.week, Math.round(c.before), Math.round(c.after), c.subject.kind === 'limit' ? 'limit' : c.subject.title, c.what.kind];

describe('what a change in the app did to the weeks', () => {
  it('sees a purchase put into the plan take its amount from the week', () => {
    assert.deepEqual(weekChanges(budget(), budget({ purchases: [food, race] })).map(brief), [[week, 32_000, 28_500, 'Участие в Кедродзилле', 'added']]);
  });

  it('sees a purchase moved to another week in both weeks', () => {
    const moved = { ...race, week: next };
    const changes = weekChanges(budget({ purchases: [food, race] }), budget({ purchases: [food, moved] }));
    assert.deepEqual(changes.map(brief), [
      [week, 28_500, 32_000, 'Участие в Кедродзилле', 'moved'],
      [next, 45_000, 41_500, 'Участие в Кедродзилле', 'moved'],
    ]);
    assert.deepEqual(changes[0]?.what, { kind: 'moved', from: week, to: next });
  });

  it('sees a purchase’s amount, envelope and finishing', () => {
    const before = budget({ purchases: [food, race] });
    assert.deepEqual(weekChanges(before, budget({ purchases: [food, { ...race, amount: 4_000 }] })).map((c) => c.what), [{ kind: 'amount', from: 3_500, to: 4_000 }]);
    assert.deepEqual(weekChanges(before, budget({ purchases: [food, { ...race, envelope: 'extra' }] })).map((c) => c.what), [{ kind: 'envelope', from: 'week', to: 'extra' }]);
    assert.deepEqual(weekChanges(before, budget({ purchases: [{ ...food, done: true }, race] })).map(brief), [[week, 28_500, 28_508, 'Продукты на неделю', 'done']]);
    assert.deepEqual(weekChanges(before, budget({ purchases: [food] })).map(brief), [[week, 28_500, 32_000, 'Участие в Кедродзилле', 'removed']]);
  });

  it('leaves out a change that moved no money, such as a new title', () => {
    assert.deepEqual(weekChanges(budget({ purchases: [food, race] }), budget({ purchases: [food, { ...race, title: 'Кедродзилла' }] })), []);
    assert.deepEqual(weekChanges(budget(), budget({ purchases: [food, { ...race, envelope: 'extra' }] })), [], 'a purchase from the extras');
  });

  it('sees what the week allows', () => {
    assert.deepEqual(weekChanges(budget(), budget({ limits: [[week, 40_000]] })).map((c) => [...brief(c), c.what]), [
      [week, 32_000, 27_000, 'limit', 'amount', { kind: 'amount', from: 45_000, to: 40_000 }],
    ]);
  });

  it('sees an expense counted in the week again, or no longer paying a purchase', () => {
    assert.deepEqual(weekChanges(budget(), budget({ marks: [] })).map((c) => [...brief(c), c.what]), [
      [week, 32_000, 30_000, 'Штрафы ГИБДД', 'counted', { kind: 'counted', from: { envelope: 'extra', paid: null }, to: { envelope: 'week', paid: null } }],
    ]);
    const unlinked = budget().expenses.map((o) => (o.id === 'lenta' ? { ...o, purchase: null } : o));
    const changes = weekChanges(budget(), budget({ expenses: unlinked }));
    assert.deepEqual(changes.map(brief), [[week, 32_000, 24_008, 'Лента', 'counted']], 'the groceries hold their whole plan again');
    assert.deepEqual(changes[0]?.what, { kind: 'counted', from: { envelope: 'week', paid: { kind: 'purchase', id: food.id, title: food.title } }, to: { envelope: 'week', paid: null } });
  });

  it('sees an expense the user said not to count leave the budget', () => {
    const without = budget().expenses.filter((o) => o.id !== 'auto');
    assert.deepEqual(weekChanges(budget(), budget({ expenses: without })).map((c) => [...brief(c), c.what]), [
      [week, 32_000, 37_000, 'Автомобиль', 'counted', { kind: 'counted', from: { envelope: 'week', paid: null }, to: { envelope: 'ignored', paid: null } }],
    ]);
  });

  it('keeps nothing when the week begins on another day, since every week moves', () => {
    assert.deepEqual(weekChanges(budget(), { ...budget({ purchases: [{ ...food, week: '2026-10-19' }] }), weekStart: 0 }), []);
  });
});

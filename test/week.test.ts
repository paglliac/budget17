import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Operation } from '../src/ledger.ts';
import {
  adviceTarget,
  adviseWish,
  envelopeOf,
  monthOfWeek,
  summarizeExtras,
  summarizeWeek,
  weekOf,
  weeksOfMonth,
  type Budget,
  type Envelope,
  type Purchase,
} from '../src/week.ts';
import { regular } from './fixtures.ts';

const today = '2026-10-06';
const week = '2026-10-05';

function spending(id: string, date: string, amount: number): Operation {
  return { id, date, created: 0, kind: 'expense', amount, original: null, payee: id, originalPayee: null, comment: null, category: null, zenmoneyCategory: null, regular: null, purchase: null, account: 'Основной', toAccount: null, hold: false, ignored: false };
}

function purchase(id: number, title: string, amount: number, overrides: Partial<Purchase> = {}): Purchase {
  return { id, title, amount, week, envelope: 'week', done: false, ...overrides };
}

/** The user's week: five purchases on 22 000 from the week's money. */
function budget(overrides: Partial<Budget> = {}, marks: Array<[string, Envelope]> = []): Budget {
  return {
    expenses: [spending('groceries', '2026-10-05', 473), spending('transfer', '2026-10-05', 40_000), spending('last-week', '2026-10-04', 120_000)],
    purchases: [
      purchase(1, 'Ласты, шапочка', 5_000),
      purchase(2, 'Ботинки Савве', 8_000),
      purchase(3, 'Продукты', 3_000),
      purchase(4, 'Подарок', 5_000),
      purchase(5, 'Проезд', 1_000),
    ],
    marks: new Map(marks),
    regular: [regular({ id: 1, title: 'Школа', amount: 45_000, day: 7 })],
    ...overrides,
  };
}

describe('weeks', () => {
  it('start on Monday and belong to the month that holds their Thursday', () => {
    assert.equal(weekOf('2026-10-11'), '2026-10-05');
    assert.equal(weekOf('2026-10-05'), '2026-10-05');
    assert.equal(weekOf('2026-11-01'), '2026-10-26');
    assert.equal(monthOfWeek('2026-09-28'), '2026-10', '28 September – 4 October has four days in October');
    assert.equal(monthOfWeek('2026-10-26'), '2026-10');
    assert.deepEqual(weeksOfMonth('2026-10'), ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    assert.deepEqual(weeksOfMonth('2026-11'), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
  });
});

describe('summarizeWeek', () => {
  it('counts all spending of the week and what the plan still needs', () => {
    const w = summarizeWeek(budget(), week);

    assert.equal(w.spent, 40_473);
    assert.equal(w.planned, 22_000);
    assert.equal(w.free, 45_000 - 40_473 - 22_000);
    assert.deepEqual(w.spending.map((o) => o.id), ['groceries', 'transfer'], 'Sunday belongs to the week before');
    assert.deepEqual(w.regular.map((r) => [r.expense.title, r.date]), [['Школа', '2026-10-07']]);
  });

  it('leaves out spending moved to extras or outside the budget, and bought or extra purchases', () => {
    const b = budget(
      {
        purchases: [purchase(1, 'Ласты', 5_000, { done: true }), purchase(2, 'Куртка', 20_000, { envelope: 'extra' }), purchase(3, 'Проезд', 1_000)],
      },
      [['transfer', 'outside']],
    );
    const w = summarizeWeek(b, week);

    assert.equal(w.spent, 473);
    assert.equal(w.planned, 1_000);
    assert.equal(w.free, 43_527);
    assert.equal(w.spending.length, 2, 'moved spending is still listed under its week');
  });

  it('leaves out a payment of a regular expense unless it is moved, since regular expenses are outside the budget', () => {
    const rent = { ...spending('transfer', '2026-10-05', 40_000), regular: { id: 1, title: 'Мастерская аренда' } };
    const expenses = [spending('groceries', '2026-10-05', 473), rent];

    assert.equal(summarizeWeek(budget({ expenses }), week).spent, 473);
    assert.equal(summarizeExtras(budget({ expenses }, [['transfer', 'extra']]), '2026-10').spent, 40_000);
  });

  it('finds the expenses that paid a regular payment, even in an earlier week, but not those of another month', () => {
    const rent = regular({ id: 1, title: 'Мастерская аренда', amount: 40_000, day: 10 });
    const paid = (id: string, date: string) => ({ ...spending(id, date, 40_000), regular: { id: 1, title: 'Мастерская аренда' } });
    const w = summarizeWeek(budget({ regular: [rent], expenses: [paid('october', '2026-10-02'), paid('september', '2026-09-09')] }), week);

    assert.deepEqual(w.regular.map((r) => [r.date, r.paid.map((o) => o.id)]), [['2026-10-10', ['october']]]);
  });

  it('finds regular payments in a week that spans two months', () => {
    const w = summarizeWeek(budget({ regular: [regular({ id: 1, title: 'Связь', amount: 600, day: 1 }), regular({ id: 2, title: 'Аренда', amount: 30_000, day: 30 })] }), '2026-09-28');

    assert.deepEqual(w.regular.map((r) => r.date), ['2026-09-30', '2026-10-01']);
  });
});

describe('purchases paid by linked spending', () => {
  const linked = (id: string, date: string, amount: number, purchaseId: number) => ({ ...spending(id, date, amount), purchase: { id: purchaseId, title: '' } });

  it('take what they paid out of the plan, and buy a purchase once they cover it', () => {
    const expenses = [linked('groceries', '2026-10-05', 473, 3), linked('pass', '2026-10-06', 1_000, 5), spending('transfer', '2026-10-05', 40_000)];
    const w = summarizeWeek(budget({ expenses }), week);

    assert.equal(w.spent, 41_473, 'they still count as spent in the week');
    assert.equal(w.planned, 22_000 - 473 - 1_000);
    assert.deepEqual(
      w.purchases.filter((p) => p.paid.length > 0).map((p) => [p.purchase.title, p.covered, p.bought, p.left]),
      [
        ['Продукты', 473, false, 2_527],
        ['Проезд', 1_000, true, 0],
      ],
    );
  });

  it('count where the purchase does, unless moved', () => {
    const jacket = purchase(9, 'Куртка', 20_000, { envelope: 'extra' });
    const expenses = [linked('transfer', '2026-10-05', 18_000, 9), spending('groceries', '2026-10-05', 473)];
    const b = budget({ expenses, purchases: [jacket] });

    assert.equal(summarizeWeek(b, week).spent, 473);
    assert.deepEqual([summarizeExtras(b, '2026-10').spent, summarizeExtras(b, '2026-10').planned], [18_000, 2_000]);
    assert.equal(envelopeOf(b, expenses[0]!), 'extra');
    assert.equal(envelopeOf({ ...b, marks: new Map([['transfer', 'outside']]) }, expenses[0]!), 'outside');
  });
});

describe('summarizeExtras', () => {
  it('counts spending marked as extras and extra purchases of the month', () => {
    const b = budget({ purchases: [purchase(1, 'Куртка', 20_000, { envelope: 'extra' }), purchase(2, 'Пальто', 15_000, { envelope: 'extra', week: '2026-11-02' })] }, [
      ['transfer', 'extra'],
      ['last-week', 'extra'],
    ]);
    const m = summarizeExtras(b, '2026-10');

    assert.equal(m.spent, 160_000, 'the week of 28 September belongs to October');
    assert.equal(m.planned, 20_000);
    assert.equal(m.free, 100_000 - 160_000 - 20_000);
  });
});

describe('adviseWish', () => {
  it('says now when the wish fits in this week', () => {
    const b = budget({}, [['transfer', 'outside']]);
    const advice = adviseWish(b, { amount: 4_500 }, today);

    assert.deepEqual(advice, { when: 'now', week, freeAfter: 45_000 - 473 - 22_000 - 4_500 });
    assert.deepEqual(adviceTarget(advice), { week, envelope: 'week' });
  });

  it('points to the first later week with room, and says when extras could take it today', () => {
    assert.deepEqual(adviseWish(budget(), { amount: 4_500 }, today), { when: 'later', week: '2026-10-12', extrasNow: true });

    const busy = budget({ purchases: [...budget().purchases, purchase(9, 'Куртка', 20_000, { week: '2026-10-12' })] }, [['last-week', 'extra']]);
    assert.deepEqual(adviseWish(busy, { amount: 30_000 }, today), { when: 'later', week: '2026-10-19', extrasNow: false });
  });

  it('falls back to extras for what no week can hold, and to nothing for what nothing can', () => {
    const advice = adviseWish(budget(), { amount: 60_000 }, today);
    assert.deepEqual(advice, { when: 'extras', week, month: '2026-10', freeAfter: 40_000 });
    assert.deepEqual(adviceTarget(advice), { week, envelope: 'extra' });

    const never = adviseWish(budget(), { amount: 120_000 }, today);
    assert.deepEqual(never, { when: 'never' });
    assert.equal(adviceTarget(never), null);
  });
});

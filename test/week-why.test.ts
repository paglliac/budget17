import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Operation } from '../src/ledger.ts';
import type { Budget, Envelope, Purchase } from '../src/week.ts';
import { misplacedSpending, weekWhy, type KindOf, type Overspend, type WhyStep } from '../src/week-why.ts';

// The user's week of 10–16 October 2026, from Saturday, on 20 000 for it to go below zero: a gift planned for 5 000
// cost 6 600, yoga was finished without paying, groceries were partly paid by expenses linked to them, and the
// dentist planned for 3 000 in the extras was paid 10 000 on Wednesday without a link, so the week paid it.
const week = '2026-10-10';
const health = { id: 'health', title: 'Здоровье и спорт', color: null };
const groceries = { id: 'groceries', title: 'Продукты', color: null };
const shopping = { id: 'shopping', title: 'Шоппинг', color: null };

function spending(id: string, date: string, amount: number, fields: Partial<Operation> = {}): Operation {
  return { id, date, created: 0, kind: 'expense', amount, original: null, payee: id, shop: null, name: id, originalPayee: null, comment: null, description: null, category: null, zenmoneyCategory: null, regular: null, purchase: null, account: 'Основной', toAccount: null, hold: false, ignored: false, optional: false, ...fields };
}

function purchase(id: number, title: string, amount: number, fields: Partial<Purchase> = {}): Purchase {
  return { id, title, amount, week, envelope: 'week', kind: 'required', done: false, ...fields };
}

const paying = (p: Purchase) => ({ purchase: { id: p.id, title: p.title } });
const gift = purchase(4, 'Подарок Серёге В.', 5_000, { kind: 'flexible' });
const yoga = purchase(9, 'Йога', 2_500, { done: true });
const food = purchase(12, 'Продукты', 8_000);
const dentist = purchase(22, 'Стоматолог', 3_000, { envelope: 'extra' });

function budget(marks: Array<[string, Envelope]> = [], limit = 20_000): Budget {
  return {
    expenses: [
      spending('sergey', '2026-10-10', 6_600, paying(gift)),
      spending('samokat', '2026-10-12', 2_652, { ...paying(food), category: groceries }),
      spending('lenta', '2026-10-11', 1_143, { category: groceries, optional: true }),
      spending('neurologist', '2026-10-11', 2_500, { category: health }),
      spending('subscriptions', '2026-10-14', 1_895, { category: { id: 'subs', title: 'Подписки', color: null } }),
      spending('dobryj-den', '2026-10-14', 10_000, { name: 'OOO Dobryj Den', category: health }),
      spending('samokat-2', '2026-10-14', 1_248, { ...paying(food), category: groceries }),
      spending('yandex', '2026-10-14', 990, { category: shopping, optional: true }),
    ],
    purchases: [gift, yoga, food, dentist],
    marks: new Map([['neurologist', 'extra'], ...marks]),
    regular: [],
    weekStart: 5,
    weekLimits: new Map([[week, limit]]),
  };
}

/** Kinds as the app's icons give them: Стоматолог and Здоровье и спорт are both health. */
const kindOf: KindOf = (title) => (/здоров|стомат/i.test(title) ? 'heart' : /продукт/i.test(title) ? 'cart' : null);

const step = (s: WhyStep) => [s.kind === 'plan' ? 'plan' : s.spending.id, Math.round(s.amount)];
const over = (o: Overspend) => [o.kind, o.kind === 'plan' ? null : o.kind === 'purchase' ? o.status.purchase.title : o.purchase.title, Math.round(o.amount)];
const total = (steps: WhyStep[]) => steps.reduce((sum, s) => sum + s.amount, 0);

describe('why a week went below zero', () => {
  it('starts from the expense that took the week below zero, whatever day it came', () => {
    const why = weekWhy(budget(), week, kindOf);
    // 20 000 less what the plan held, 5 000 + 8 000 with yoga finished: 7 000; the gift took 1 600 past its plan,
    // Lenta 1 143 and the subscriptions 1 895, so 2 362 was free when the dentist came.
    assert.equal(Math.round(why.was), 2_362);
    assert.equal(why.since, '2026-10-14');
    assert.deepEqual(why.last.map(step), [['dobryj-den', -10_000], ['yandex', -990]], 'groceries linked to their plan take nothing of it');
    assert.equal(Math.round(why.now), -8_628);
    assert.equal(Math.round(why.was + total(why.last)), Math.round(why.now), 'the steps add up to the change');
    const first = why.last[0]!;
    assert.ok(first.kind === 'spending' && first.misplaced?.purchase.title === 'Стоматолог', 'the dentist may have paid the extras’ plan');
  });

  it('takes the last time the week went below zero, after a day it was missed', () => {
    // Without the dentist the week went below zero on Tuesday with Lenta and stayed there.
    const b = budget([], 15_000);
    b.expenses = b.expenses.filter((o) => o.id !== 'dobryj-den');
    const why = weekWhy(b, week, kindOf);
    assert.equal(why.since, '2026-10-11');
    assert.equal(Math.round(why.was), 400, '15 000 − 13 000 held, less the 1 600 the gift took past its plan');
    assert.deepEqual(why.last.map(step), [['lenta', -1_143], ['subscriptions', -1_895], ['yandex', -990]]);
  });

  it('starts from the week’s amount when the plan alone was past it, the plan first', () => {
    const why = weekWhy(budget([], 12_000), week, kindOf);
    assert.equal(why.since, null);
    assert.equal(why.was, 12_000);
    assert.deepEqual(why.last.map(step).slice(0, 2), [['plan', -13_000], ['sergey', -1_600]]);
    assert.equal(Math.round(why.was + total(why.last)), Math.round(why.now));
    assert.deepEqual(why.over.map(over).at(-1), ['plan', null, -1_000], 'the plan past the week is past its plan too');
  });

  it('tells the purchases that cost more than planned, the dentist paid by the week against the extras’ plan', () => {
    const why = weekWhy(budget(), week, kindOf);
    assert.deepEqual(why.over.map(over), [
      ['misplaced', 'Стоматолог', -7_000],
      ['purchase', 'Подарок Серёге В.', -1_600],
    ]);
  });

  it('tells the week’s expenses marked optional, largest first, and where the week would be without them', () => {
    const why = weekWhy(budget(), week, kindOf);
    assert.deepEqual(why.optional.map((o) => o.id), ['lenta', 'yandex']);
    assert.equal(Math.round(why.withoutOptional), -8_628 + 1_143 + 990);
    const outside = budget([['yandex', 'extra']]);
    assert.deepEqual(weekWhy(outside, week, kindOf).optional.map((o) => o.id), ['lenta'], 'one the week did not pay is not its own');
  });

  it('ties an expense to a purchase of the extras by a word or by kind, never one moved or linked already', () => {
    assert.deepEqual([...misplacedSpending(budget(), week, kindOf).keys()], ['dobryj-den']);
    assert.equal(misplacedSpending(budget([['dobryj-den', 'extra']]), week, kindOf).size, 0, 'moved to the extras by hand');
    assert.equal(misplacedSpending(budget(), week, () => null).size, 0, 'nothing ties them without a kind or a word');
    const b = budget();
    b.expenses.push(spending('clinic', '2026-10-13', 2_900, { description: 'стоматолог Савве' }));
    assert.deepEqual([...misplacedSpending(b, week, kindOf).keys()], ['clinic'], 'a word of its title wins over the kind');
  });
});

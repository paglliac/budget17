import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Operation } from '../src/ledger.ts';
import type { Budget, Envelope, Purchase } from '../src/week.ts';
import { misplacedSpending, whyByPlan, whySinceEvening, type Cause, type KindOf } from '../src/week-why.ts';

// The user's week of 10–16 October 2026, from Saturday: a gift planned for 5 000 cost 6 600, yoga was finished
// without paying, groceries were partly paid by expenses linked to them, and the dentist planned for 3 000 in the
// extras was paid 10 000 on Wednesday without a link, so the week paid it.
const week = '2026-10-10';
const today = '2026-10-14';
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

function budget(marks: Array<[string, Envelope]> = []): Budget {
  return {
    expenses: [
      spending('sergey', '2026-10-10', 6_600, paying(gift)),
      spending('samokat', '2026-10-12', 2_652, { ...paying(food), category: groceries }),
      spending('lenta', '2026-10-11', 1_143, { category: groceries }),
      spending('neurologist', '2026-10-11', 2_500, { category: health }),
      spending('subscriptions', '2026-10-14', 1_895, { category: { id: 'subs', title: 'Подписки', color: null } }),
      spending('dobryj-den', '2026-10-14', 10_000, { name: 'OOO Dobryj Den', category: health }),
      spending('samokat-2', '2026-10-14', 1_248, { ...paying(food), category: groceries }),
      spending('yandex', '2026-10-14', 990, { category: shopping }),
    ],
    purchases: [gift, yoga, food, dentist],
    marks: new Map([['neurologist', 'extra'], ...marks]),
    regular: [],
    weekStart: 5,
    weekLimits: new Map(),
  };
}

/** Kinds as the app's icons give them: Стоматолог and Здоровье и спорт are both health. */
const kindOf: KindOf = (title) => (/здоров|стомат/i.test(title) ? 'heart' : /продукт/i.test(title) ? 'cart' : null);

const brief = (c: Cause) => [c.kind, Math.round(c.amount)];
const total = (causes: Cause[]) => causes.reduce((sum, c) => sum + c.amount, 0);

describe('why a week went below zero', () => {
  it('by the plan: from nothing, the dentist the week paid, the gift past its plan, the free rest and yoga given back', () => {
    const why = whyByPlan(budget(), week, kindOf);
    // 45 000 − 6 600 − 2 652 − 1 143 − 1 895 − 10 000 − 1 248 − 990 spent, 8 000 − 3 900 of groceries still planned.
    assert.equal(Math.round(why.now), 16_372);
    assert.equal(why.was, 0);
    assert.deepEqual(why.causes.map(brief), [
      ['misplaced', -10_000],
      ['purchase', -1_600],
      // 45 000 − 5 000 − 2 500 − 8 000 allowed; 1 143 + 1 895 + 990 spent freely.
      ['free', 25_472],
      ['purchase', 2_500],
    ]);
    assert.equal(Math.round(total(why.causes)), Math.round(why.now - why.was), 'the causes add up to the change');
    const misplaced = why.causes[0]!;
    assert.ok(misplaced.kind === 'misplaced' && misplaced.purchase.title === 'Стоматолог' && misplaced.left === 3_000);
  });

  it('by the plan: a plan past what the week allows is a cause of its own, and all free spending goes past it', () => {
    const b = budget();
    b.weekLimits = new Map([[week, 12_000]]);
    const why = whyByPlan(b, week, kindOf);
    const plan = why.causes.find((c) => c.kind === 'plan');
    assert.ok(plan?.kind === 'plan');
    assert.equal(plan.amount, 12_000 - 15_500);
    const free = why.causes.find((c) => c.kind === 'free');
    assert.ok(free?.kind === 'free' && free.allowed === 0 && Math.round(free.amount) === -4_028);
    assert.equal(Math.round(total(why.causes)), Math.round(why.now));
  });

  it('since the evening: what was free yesterday, and today’s expenses with what each took of it', () => {
    const why = whySinceEvening(budget(), week, today, kindOf);
    assert.equal(why.since, '2026-10-13');
    // Yesterday: 45 000 − 6 600 − 2 652 − 1 143 spent, 8 000 − 2 652 of groceries planned, yoga finished.
    assert.equal(Math.round(why.was), 29_257);
    assert.deepEqual(why.causes.map(brief), [
      ['misplaced', -10_000],
      ['spending', -1_895],
      ['spending', -990],
    ], 'the groceries linked to their plan take nothing of what is free');
    assert.equal(Math.round(why.was + total(why.causes)), Math.round(why.now));
  });

  it('since the evening: a past week from the evening before its last day, the first day from the week’s start', () => {
    assert.equal(whySinceEvening(budget(), week, '2026-10-20', kindOf).since, '2026-10-15');
    const first = whySinceEvening(budget(), week, week, kindOf);
    assert.equal(first.since, null);
    assert.equal(first.was, 45_000 - 15_500 + 2_500, 'what the plan left free at the start, yoga finished');
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

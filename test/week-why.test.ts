import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Operation } from '../src/ledger.ts';
import type { Budget, Envelope, Purchase } from '../src/week.ts';
import { weekWhy, type Check, type Overspend } from '../src/week-why.ts';

// The user's week of 10–16 October 2026, from Saturday: a gift planned for 5 000 cost 6 600, yoga was finished
// without paying, groceries were partly paid by expenses linked to them, Lenta and Yandex were marked optional, and
// the dentist planned for 3 000 in the extras was paid 10 000 on Wednesday without a link, so the week paid it all.
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

function budget(marks: Array<[string, Envelope]> = [], limit = 45_000): Budget {
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

const hour = 3_600;
const at = (date: string, hours: number) => Date.parse(`${date}T00:00:00Z`) / 1000 + hours * hour;
const over = (o: Overspend) => [o.kind, o.kind === 'plan' ? null : o.status.purchase.title, Math.round(o.amount)];
const brief = (c: Check) => (c.kind === 'spending' ? c.spending.id : c.spending.map((o) => o.id).join('+'));

// 45 000 less the 15 500 the week's purchases were planned for, yoga too, is 29 500 free: a day's share is 4 214.
const notable = 29_500 / 7;

describe('why a week went below zero', () => {
  it('takes a lot to be a day’s share of what the week allows beyond its plan', () => {
    assert.equal(weekWhy(budget(), week).notable, notable);
    assert.equal(weekWhy(budget([], 12_000), week).notable, 0, 'nothing when the plan is past the week');
  });

  it('checks an expense that is a lot, counted in the week only by default', () => {
    // The gift and groceries are linked, the neurologist moved to the extras, Lenta and Yandex marked optional, and
    // the subscriptions are not a lot.
    assert.deepEqual(weekWhy(budget(), week).check.map(brief), ['dobryj-den']);
    assert.deepEqual(weekWhy(budget([['dobryj-den', 'extra']]), week).check.map(brief), [], 'placed by hand');
    assert.deepEqual(weekWhy(budget(), week, new Set(['dobryj-den'])).check.map(brief), [], 'said to count right');
  });

  it('checks small expenses that come close together and add up to a lot, the newest first', () => {
    const b = budget();
    b.expenses.push(
      spending('cafe', '2026-10-13', 1_500, { created: at('2026-10-13', 10) }),
      spending('bar', '2026-10-13', 2_000, { created: at('2026-10-13', 11.5) }),
      spending('taxi', '2026-10-13', 900, { created: at('2026-10-13', 12.9) }),
      spending('bakery', '2026-10-13', 400, { created: at('2026-10-13', 16) }),
    );
    for (const o of b.expenses) if (o.date === '2026-10-14') o.created = at('2026-10-14', 9);
    assert.deepEqual(weekWhy(b, week).check.map(brief), ['dobryj-den', 'cafe+bar+taxi'], 'the bakery came hours later');
    const two = budget();
    two.expenses.push(spending('cafe', '2026-10-13', 2_500, { created: at('2026-10-13', 10) }), spending('bar', '2026-10-13', 2_000, { created: at('2026-10-13', 11) }));
    assert.deepEqual(weekWhy(two, week).check.map(brief), ['dobryj-den'], 'two are not a run');
  });

  it('reminds to keep to the plan only when it cost a lot more than planned', () => {
    const why = weekWhy(budget(), week);
    assert.deepEqual(why.over.map(over), [['purchase', 'Подарок Серёге В.', 1_600]]);
    assert.equal(why.remindPlan, false, '1 600 is less than a day’s share');
    // On 20 000 the week allows 4 500 beyond its plan, 643 a day.
    assert.equal(weekWhy(budget([], 20_000), week).remindPlan, true);
  });

  it('reminds to spend less on optional expenses only when they add up to a lot, with where the week would be', () => {
    const why = weekWhy(budget(), week);
    assert.deepEqual(why.optional.map((o) => o.id), ['lenta', 'yandex']);
    assert.equal(why.remindOptional, false, '2 133 is less than a day’s share');
    assert.equal(Math.round(why.withoutOptional), Math.round(why.now + 1_143 + 990));
    assert.equal(weekWhy(budget([], 20_000), week).remindOptional, true);
    const outside = budget([['yandex', 'extra']]);
    assert.deepEqual(weekWhy(outside, week).optional.map((o) => o.id), ['lenta'], 'one the week did not pay is not its own');
  });

  it('tells the plan past the week as past its plan', () => {
    const why = weekWhy(budget([], 12_000), week);
    assert.deepEqual(why.over.map(over), [['purchase', 'Подарок Серёге В.', 1_600], ['plan', null, 1_000]]);
    assert.equal(why.remindPlan, true);
  });
});

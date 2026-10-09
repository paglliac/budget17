import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NO_SETUP } from '../src/categories.ts';
import { findings, kindOf, ordinaryPerWeek, reviewMonth, transferHint, weekThatHolds } from '../src/review.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { budgetOf, type SavedBudget } from '../src/web/pages/dashboard.ts';
import { listOperations } from '../src/ledger.ts';
import { account, regular, RUB, tag, transaction, user } from './fixtures.ts';

// September 2026 with weeks from Monday: 31 August – 27 September, four weeks.
const today = '2026-10-09';
const food = tag({ id: 'food', title: 'Продукты' });

function data(extra: ReturnType<typeof transaction>[] = []): EntityCollections {
  return {
    instrument: [RUB],
    user: [user()],
    account: [account({ id: 'card', title: 'Основной' })],
    tag: [food],
    transaction: [
      transaction({ id: 'salary', date: '2026-09-04', income: 300_000, payee: 'Зарплата' }),
      transaction({ id: 'groceries', date: '2026-09-02', outcome: 10_000, tag: [food.id], payee: 'Лента' }),
      transaction({ id: 'august-groceries', date: '2026-08-12', outcome: 16_000, tag: [food.id], payee: 'Лента' }),
      transaction({ id: 'school', date: '2026-09-07', outcome: 45_000, payee: 'ИП Бондарь' }),
      transaction({ id: 'person', date: '2026-09-18', outcome: 70_000, payee: 'Татьяна А.' }),
      transaction({ id: 'self', date: '2026-09-25', outcome: 2_547, payee: 'Иван И.' }),
      transaction({ id: 'loan', date: '2026-09-19', outcome: 30_500, payee: 'Иван И.' }),
      transaction({ id: 'untitled', date: '2026-09-10', outcome: 500 }),
      transaction({ id: 'extra', date: '2026-09-12', outcome: 3_000, payee: 'Ozon' }),
      transaction({ id: 'october', date: '2026-09-29', outcome: 999, payee: 'Октябрь' }),
      ...extra,
    ],
  };
}

function saved(selfPayee: string | null = 'Иван И.'): SavedBudget {
  return {
    categorizations: new Map([['school', { regular: 1 }]]),
    purchasePayments: new Map(),
    regular: [regular({ id: 1, title: 'Школа', amount: 45_000, day: 7 }), regular({ id: 2, title: 'Кредит', amount: 30_500, day: 26 })],
    purchases: [],
    marks: new Map([['extra', 'extra' as const]]),
    descriptions: new Map(),
    categories: NO_SETUP,
    weekStart: 0,
    weekLimits: new Map(),
    wishes: [],
    selfPayee,
  };
}

function review(collections = data(), sorted = saved()) {
  const budget = budgetOf(collections, sorted, { today, from: '2026-06-01' });
  const incomes = listOperations(collections, { from: '2026-08-31', to: '2026-09-27' }, sorted).filter((o) => o.kind === 'income');
  return reviewMonth(budget, incomes, { month: '2026-09', today, selfPayee: sorted.selfPayee ?? null });
}

describe('reviewMonth', () => {
  it('sorts the month’s expenses into what they turned out to be, largest first', () => {
    const r = review();

    assert.equal(r.from, '2026-08-31');
    assert.equal(r.to, '2026-09-27');
    assert.deepEqual(
      r.expenses.map((e) => [e.operation.id, e.kind]),
      [
        ['person', 'person'],
        ['school', 'regular'],
        ['loan', 'self'],
        ['groceries', 'ordinary'],
        ['extra', 'extra'],
        ['self', 'self'],
        ['untitled', 'untitled'],
      ],
    );
    assert.deepEqual(r.toCheck.map((e) => e.operation.id), ['person', 'loan', 'self', 'untitled']);
  });

  it('adds up income, spending, the weeks against their limits and the envelopes', () => {
    const r = review();

    assert.equal(r.income, 300_000);
    assert.equal(r.spent, 161_547);
    assert.equal(r.left, 138_453);
    assert.equal(r.inWeeks, 10_000 + 70_000 + 30_500 + 2_547 + 500);
    assert.equal(r.limits, 4 * 45_000);
    assert.equal(r.regular, 45_000);
    assert.equal(r.extra, 3_000);
    assert.equal(r.outside, 0);
    assert.deepEqual(r.next, { month: '2026-10', weeks: 5, regular: 75_500 });
  });

  it('counts ordinary spending a week by category against the three months before', () => {
    const r = review();

    assert.deepEqual(
      r.categories.map((c) => ({ title: c.title, perWeek: c.perWeek, usual: Math.round(c.usual ?? 0) })),
      [{ title: 'Продукты', perWeek: 2_500, usual: 1_333 }],
    );
    assert.equal(ordinaryPerWeek(r), 2_500);
  });

  it('counts transfers to the user’s own name as transfers to people when the name is not given', () => {
    const r = review(data(), saved(null));

    assert.deepEqual(r.toCheck.map((e) => e.kind), ['person', 'person', 'person', 'untitled']);
  });
});

describe('kindOf', () => {
  it('puts a payment of a regular expense and what was moved before what has a category', () => {
    const budget = { marks: new Map([['moved', 'outside' as const]]), purchases: [] };
    const base = { id: 'x', payee: 'Татьяна А.', category: null, regular: null, purchase: null } as never;
    assert.equal(kindOf(budget, { ...(base as object), regular: { id: 1, title: 'Школа' } } as never, null), 'regular');
    assert.equal(kindOf(budget, { ...(base as object), id: 'moved' } as never, null), 'outside');
    assert.equal(kindOf(budget, { ...(base as object), category: { id: 'food', title: 'Продукты', color: null } } as never, null), 'ordinary');
    assert.equal(kindOf(budget, base, 'Татьяна А.'), 'self');
    assert.equal(kindOf(budget, base, null), 'person');
    assert.equal(kindOf(budget, { ...(base as object), payee: 'LENTA 089' } as never, null), 'untitled');
  });
});

describe('transferHint', () => {
  const loans = [{ title: 'Кредит', amount: 30_500 }];

  it('names the regular expense of the same amount, and a purchase on a marketplace for an uneven small one', () => {
    assert.deepEqual(transferHint({ amount: 30_500 }, loans), { regular: 'Кредит' });
    assert.equal(transferHint({ amount: 2_547 }, loans), 'marketplace');
    assert.equal(transferHint({ amount: 15_000 }, loans), null);
    assert.equal(transferHint({ amount: 25_123 }, loans), null);
  });
});

describe('findings', () => {
  it('names what to check and untouched extras, but not weeks within their limits or a small growth', () => {
    const sorted = saved();
    assert.deepEqual(
      findings(review(), today, sorted.regular).map((f) => f.kind),
      ['unclear', 'people', 'self', 'extrasUnused'],
    );
    const self = findings(review(), today, sorted.regular).find((f) => f.kind === 'self');
    assert.deepEqual(self && { count: self.count, amount: self.amount, marketplace: self.marketplace }, { count: 2, amount: 33_047, marketplace: 1 });
  });

  it('names overspent weeks with the one that spent most, and a category that grew', () => {
    const big = [transaction({ date: '2026-09-15', outcome: 160_000, tag: [food.id], payee: 'Мебель' })];
    const found = findings(review(data(big)), today, saved().regular);

    const overspent = found.find((f) => f.kind === 'overspent');
    assert.equal(overspent?.kind === 'overspent' && overspent.week.week, '2026-09-14');
    assert.equal(overspent?.kind === 'overspent' && overspent.over, 10_000 + 160_000 + 70_000 + 30_500 + 2_547 + 500 - 180_000);
    assert.ok(found.some((f) => f.kind === 'grown' && f.category.title === 'Продукты'));
  });
});

describe('weekThatHolds', () => {
  it('rounds up to 5 000, never under the usual week', () => {
    assert.equal(weekThatHolds(54_694), 55_000);
    assert.equal(weekThatHolds(30_000), 45_000);
  });
});

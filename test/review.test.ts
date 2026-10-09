import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { categoryCatalog, NO_SETUP, NO_SUBCATEGORIES, type SubcategorySetup } from '../src/categories.ts';
import { findings, kindOf, ordinaryPerWeek, reviewHints, reviewMonth, transferHint, weekParts, weekThatHolds } from '../src/review.ts';
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

describe('weekParts', () => {
  const lenta = transaction({ id: 'lenta-latin', date: '2026-09-09', outcome: 4_000, tag: [food.id], payee: 'Lenta-0089' });
  const market = transaction({ id: 'market', date: '2026-09-16', outcome: 5_000, tag: [food.id], payee: 'Арсен Г.' });

  it('splits the weeks into categories and the kinds to check, largest first, each in pieces by shop or by amount', () => {
    const parts = weekParts(review(data([lenta])), { subcategories: NO_SUBCATEGORIES, regular: saved().regular, selfPayee: 'Иван И.' });

    assert.deepEqual(
      parts.map((p) => [p.category?.title ?? p.kind, p.amount]),
      [
        ['person', 70_000],
        ['self', 33_047],
        ['Продукты', 14_000],
        ['untitled', 500],
      ],
    );
    assert.deepEqual(
      parts[1]!.pieces.map((p) => [p.key, p.amount]),
      [
        ['regular-Кредит', 30_500],
        ['marketplace', 2_547],
      ],
    );
    const groceries = parts[2]!.pieces;
    assert.deepEqual(groceries.map((p) => [p.key, p.by === 'shop' && p.name, p.amount]), [['shop-lenta', 'Лента', 14_000]], 'Lenta-0089 and Лента are one shop');
  });

  it('pieces a split category by subcategory, the rest without one last', () => {
    const subcategories: SubcategorySetup = {
      subcategories: [{ id: 1, category: food.id, title: 'Супермаркеты' }],
      shops: new Map([[food.id, new Map([['lenta', 1]])]]),
      spending: new Map(),
    };
    const parts = weekParts(review(data([lenta, market])), { subcategories, regular: [], selfPayee: 'Иван И.' });
    const groceries = parts.find((p) => p.category?.id === food.id)!;

    assert.deepEqual(
      groceries.pieces.map((p) => [p.key, p.amount]),
      [
        ['sub-1', 14_000],
        ['sub-none', 5_000],
      ],
    );
  });
});

describe('reviewHints', () => {
  const cafe = tag({ id: 'cafe', title: 'Кафе' });
  const shopping = tag({ id: 'shopping', title: 'Шоппинг' });
  const gifts = tag({ id: 'gifts', title: 'Подарки' });
  const tags = [food, cafe, shopping, gifts];

  function hints(extra: ReturnType<typeof transaction>[], options: { subcategories?: SubcategorySetup; dismissed?: string[]; sorted?: ReturnType<typeof saved> } = {}) {
    const collections = { ...data(extra), tag: tags };
    const sorted = options.sorted ?? saved();
    const all = listOperations(collections, { from: '2000-01-01', to: '2100-01-01' }, sorted);
    return reviewHints(review(collections, sorted), {
      history: all.filter((o) => o.kind === 'expense'),
      incomes: all.filter((o) => o.kind === 'income'),
      categories: categoryCatalog(tags, NO_SETUP),
      incomeCategories: categoryCatalog(tags, NO_SETUP, 'income'),
      subcategories: options.subcategories ?? NO_SUBCATEGORIES,
      regular: sorted.regular,
      selfPayee: sorted.selfPayee ?? null,
      today,
      dismissed: new Set(options.dismissed ?? []),
    });
  }
  const used = [transaction({ date: '2026-09-20', outcome: 700, tag: [cafe.id], payee: 'Кофейня' }), transaction({ date: '2026-08-20', outcome: 900, tag: [shopping.id], payee: 'DNS' }), transaction({ date: '2026-08-01', outcome: 1_500, tag: [gifts.id], payee: 'Цветы' })];
  const toTatiana = (date: string, category: string) => transaction({ date, outcome: 3_000, tag: [category], payee: 'Татьяна А.' });

  it('hints a transfer to a person into the category at least two of three of its payee’s earlier expenses went', () => {
    const found = hints([...used, toTatiana('2026-08-02', food.id), toTatiana('2026-07-02', food.id), toTatiana('2026-06-02', cafe.id)]);
    const usual = found.find((h) => h.kind === 'usual');

    assert.equal(usual?.kind === 'usual' && usual.category.title, 'Продукты');
    assert.deepEqual(usual?.kind === 'usual' && [usual.expenses.map((o) => o.id), usual.times, usual.of, usual.last.date], [['person'], 2, 3, '2026-08-02']);
    const split = hints([...used, toTatiana('2026-08-02', food.id), toTatiana('2026-07-02', food.id), toTatiana('2026-06-02', cafe.id), toTatiana('2026-05-02', cafe.id)]);
    assert.ok(!split.some((h) => h.kind === 'usual'), 'two of four is no rule');
    assert.ok(!hints([...used, toTatiana('2026-08-02', food.id)], { dismissed: ['spending:person'] }).some((h) => h.kind === 'usual'), 'turned down');
  });

  it('hints a transfer in a split category into the subcategory its payee’s earlier ones there went into', () => {
    const market = { id: 1, category: food.id, title: 'Рынок' };
    const subcategories: SubcategorySetup = { subcategories: [market], shops: new Map(), spending: new Map([['august-market', market.id]]) };
    const found = hints(
      [
        ...used,
        transaction({ id: 'market', date: '2026-09-16', outcome: 5_000, tag: [food.id], payee: 'Арсен Г.' }),
        transaction({ id: 'august-market', date: '2026-08-16', outcome: 4_000, tag: [food.id], payee: 'Арсен Г.' }),
      ],
      { subcategories },
    );
    const usual = found.find((h) => h.kind === 'usual');

    assert.deepEqual(usual?.kind === 'usual' && [usual.expenses.map((o) => o.id), usual.category.id, usual.subcategory], [['market'], food.id, market]);
  });

  it('hints transfers to oneself that look like purchases on Ozon or WB where such went before, into a new subcategory unless one is there', () => {
    const earlier = transaction({ date: '2026-08-05', outcome: 1_234, tag: [shopping.id], payee: 'Иван И.' });
    const found = hints([...used, earlier]).find((h) => h.kind === 'marketplace');

    assert.deepEqual(found?.kind === 'marketplace' && [found.expenses.map((o) => o.id), found.category.id, found.subcategory], [['self'], shopping.id, { title: 'Ozon и WB' }]);
    const ozon = { id: 7, category: shopping.id, title: 'Ozon и WB' };
    const named = hints([...used, earlier], { subcategories: { subcategories: [ozon], shops: new Map(), spending: new Map() } }).find((h) => h.kind === 'marketplace');
    assert.equal(named?.kind === 'marketplace' && named.subcategory, ozon);
    assert.ok(!hints(used).some((h) => h.kind === 'marketplace'), 'nothing to go by');
  });

  it('hints hiding a category nothing went into for three months, unless it is turned down', () => {
    const own = saved();
    own.categories = { changes: new Map(), own: [{ id: 'own-1', title: 'Путешествия', hidden: false, kind: 'expense' }] };
    const found = hints(used.slice(0, 2), { sorted: own }).filter((h) => h.kind === 'hide');

    assert.deepEqual(
      found.map((h) => h.kind === 'hide' && [h.category.title, h.last]),
      [['Подарки', null]],
      'a ZenMoney category never used; an own one may wait for its first expense',
    );
    const old = hints([...used.slice(0, 2), transaction({ date: '2026-05-01', outcome: 1_500, tag: [gifts.id], payee: 'Цветы' })]).filter((h) => h.kind === 'hide');
    assert.deepEqual(old.map((h) => h.kind === 'hide' && [h.category.title, h.last]), [['Подарки', '2026-05-01']]);
    assert.deepEqual(hints(used.slice(0, 2), { dismissed: ['hide:gifts'] }).filter((h) => h.kind === 'hide'), []);
  });
});

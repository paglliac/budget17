import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { byPopularity, categoryCatalog, categoryFinder, NO_SETUP, recentCount, subcategoryOf, type CategorySetup, type SubcategorySetup } from '../src/categories.ts';
import type { Category } from '../src/operations.ts';
import { tag } from './fixtures.ts';

const groceries = tag({ id: 'groceries', title: 'Groceries' });
const home = tag({ id: 'home', title: 'Home' });
const repair = tag({ id: 'repair', title: 'Repair', parent: home.id });
const salary = tag({ id: 'salary', title: 'Salary', showIncome: true, showOutcome: false });
const tags = [salary, repair, home, groceries];
const setup: CategorySetup = {
  changes: new Map([
    [groceries.id, { title: 'Продукты', hidden: false }],
    [home.id, { title: 'Дом', hidden: true }],
  ]),
  own: [{ id: 'own-1', title: 'Дети', hidden: false, kind: 'expense' }],
};

describe('categories', () => {
  it('lists ZenMoney’s spending categories with the user’s titles, then the user’s own', () => {
    assert.deepEqual(
      categoryCatalog(tags, setup).map((c) => [c.id, c.title, c.name, c.zenmoneyTitle, c.hidden]),
      [
        ['home', 'Дом', 'Дом', 'Home', true],
        ['repair', 'Дом / Repair', 'Repair', 'Repair', false],
        ['groceries', 'Продукты', 'Продукты', 'Groceries', false],
        ['own-1', 'Дети', 'Дети', null, false],
      ],
    );
    assert.deepEqual(categoryCatalog(tags, NO_SETUP).map((c) => c.title), ['Groceries', 'Home', 'Home / Repair']);
  });

  it('finds a category by id as its top-level one, with the user’s title', () => {
    const find = categoryFinder(new Map(tags.map((t) => [t.id, t])), setup);

    assert.deepEqual(find('repair'), { id: 'home', title: 'Дом', color: null });
    assert.deepEqual(find('own-1'), { id: 'own-1', title: 'Дети', color: null });
    assert.equal(find('own-2'), undefined);
  });

  it('puts the categories with the most expenses over the last three months first, then over all time', () => {
    const today = '2026-10-06';
    const spent = (category: Category, ...dates: string[]) => dates.map((date) => ({ date, category }));
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id): Category => ({ id, title: id, color: null }));
    const expenses = [
      ...spent(a!, '2026-10-01', '2025-01-01', '2025-01-02', '2025-01-03'),
      ...spent(b!, '2026-09-01', '2026-08-01'),
      ...spent(c!, '2026-07-01', '2025-01-01'),
      { date: '2026-10-01', category: null },
    ];

    assert.deepEqual(byPopularity([a!, c!, d!, b!], expenses, today).map((x) => x.id), ['b', 'a', 'c', 'd']);
    assert.equal(recentCount(b!, expenses, today), 2);
    assert.equal(recentCount(c!, expenses, today), 0, '1 July is more than 90 days ago');
  });

  it('puts an expense into its shop’s subcategory, or the one it was put into by hand', () => {
    const lenta = { id: 1, category: groceries.id, title: 'Лента' };
    const market = { id: 2, category: groceries.id, title: 'Рынок' };
    const split: SubcategorySetup = {
      subcategories: [lenta, market],
      shops: new Map([[groceries.id, new Map([['lenta', lenta.id]])]]),
      spending: new Map<string, number | null>([
        ['by-hand', market.id],
        ['kept-out', null],
      ]),
    };
    const food = { id: groceries.id, title: 'Продукты', color: null };
    const expense = (id: string, payee: string, category: Category | null = food) => ({ id, payee, category });

    assert.equal(subcategoryOf(expense('a', 'Лента-0089'), split, { shop: true }), lenta, 'any shop of the chain');
    assert.equal(subcategoryOf(expense('a', 'Лента-0089'), split, { shop: false }), null, 'a transfer goes only where it was put');
    assert.equal(subcategoryOf(expense('by-hand', 'Lenta 178'), split, { shop: true }), market);
    assert.equal(subcategoryOf(expense('kept-out', 'Lenta 178'), split, { shop: true }), null);
    assert.equal(subcategoryOf(expense('a', 'Lenta 178', { id: 'cafe', title: 'Кафе', color: null }), split, { shop: true }), null, 'in another category');
    assert.equal(subcategoryOf(expense('by-hand', 'Арсен Г.', null), split, { shop: false }), null, 'no longer in its category');
  });
});

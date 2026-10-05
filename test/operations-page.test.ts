import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import { loadOperations, renderOperations } from '../src/web/pages/operations.ts';
import { account, RUB, tag, transaction, user } from './fixtures.ts';

const today = '2026-10-05';
const food = tag({ title: 'Продукты' });
const data: EntityCollections = {
  instrument: [RUB],
  user: [user()],
  account: [account({ id: 'card', title: 'Т-Банк' }), account({ id: 'savings', title: 'Копилка' })],
  tag: [food],
  transaction: [
    transaction({ date: '2026-10-05', created: 2, outcome: 1200, tag: [food.id], payee: '<i>Лавка</i>' }),
    transaction({ date: '2026-10-05', created: 1, income: 50_000, payee: 'Зарплата' }),
    transaction({ date: '2026-10-03', outcome: 300, payee: 'Киоск' }),
    transaction({ date: '2026-10-02', outcome: 5000, income: 5000, outcomeAccount: 'card', incomeAccount: 'savings' }),
    transaction({ date: '2026-09-30', outcome: 999, payee: 'Сентябрь' }),
  ],
};
const sorting = { categorizations: new Map(), regular: [] };
const render = (options: Parameters<typeof loadOperations>[2]) => String(renderOperations(loadOperations(data, sorting, options), createHref()));

describe('operations page', () => {
  it('lists the month by day with a summary, escaping payees', () => {
    const page = render({ today });

    assert.ok(page.includes('Операции за октябрь'));
    assert.ok(page.includes('4 операции: потрачено 1 500 ₽, получено 50 000 ₽.'));
    assert.ok(page.includes('&lt;i&gt;Лавка&lt;/i&gt;'));
    assert.ok(!page.includes('<i>Лавка</i>'));
    assert.ok(page.includes('Сегодня'));
    assert.ok(page.includes('Т-Банк → Копилка'));
    assert.ok(!page.includes('Сентябрь</b>'));
  });

  it('filters by kind, category and text, keeping the other filters in links', () => {
    const expenses = loadOperations(data, sorting, { today, kind: 'expense' });
    assert.deepEqual(expenses.operations.map((o) => o.payee), ['<i>Лавка</i>', 'Киоск']);
    assert.deepEqual(expenses.counts, { all: 4, expense: 2, income: 1, transfer: 1 });

    const page = render({ today, month: '2026-10', category: food.id, query: 'лав' });
    assert.ok(page.includes(`href="/operations?category=${food.id}"`), 'removing the text filter keeps the category');
    assert.ok(page.includes(`href="/operations?kind=expense&amp;category=${food.id}&amp;q=%D0%BB%D0%B0%D0%B2"`), 'kind links keep the other filters');
    assert.ok(page.includes('1 операция: потрачено 1 200 ₽.'));
    assert.ok(page.includes('«лав»'));
  });

  it('shows uncategorised operations under none and says when nothing is found', () => {
    assert.deepEqual(loadOperations(data, sorting, { today, category: 'none' }).operations.map((o) => o.payee), ['Зарплата', 'Киоск']);
    assert.ok(render({ today, query: 'нет такого' }).includes('Ничего не нашлось'));
  });

  it('counts categories picked in the app and leaves out transfers within one bank, with their tab', () => {
    const tbank = { ...data, account: (data.account ?? []).map((a) => ({ ...a, company: 4902 })) };
    const sorted = { categorizations: new Map([[data.transaction![2]!.id, { tag: food.id }]]), regular: [] };
    const operations = loadOperations(tbank, sorted, { today });

    assert.deepEqual(operations.counts, { all: 3, expense: 2, income: 1, transfer: 0 });
    assert.deepEqual(operations.categories.map((c) => [c.title, c.amount]), [['Продукты', 1_500]]);
    const page = String(renderOperations(operations, createHref()));
    assert.ok(!page.includes('>Переводы<'));
    assert.ok(page.includes('Продукты, Т-Банк'));
  });

  it('ignores an unknown kind and a month in the future', () => {
    const page = loadOperations(data, sorting, { today, kind: 'gift', month: '2027-01' });
    assert.equal(page.filter.kind, undefined);
    assert.equal(page.month, '2026-10');
  });
});

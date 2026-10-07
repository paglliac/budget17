import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import { loadOperations, renderOperations } from '../src/web/pages/operations.ts';
import { NO_SETUP } from '../src/categories.ts';
import type { SavedMarking } from '../src/web/pages/marking.ts';
import { account, regular, RUB, tag, transaction, user } from './fixtures.ts';

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
const sorting: SavedMarking = { categorizations: new Map(), purchasePayments: new Map(), regular: [], purchases: [], marks: new Map(), categories: NO_SETUP, weekStart: 0 };
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
    const sorted = { ...sorting, categorizations: new Map([[data.transaction![2]!.id, { tag: food.id }]]) };
    const operations = loadOperations(tbank, sorted, { today });

    assert.deepEqual(operations.counts, { all: 3, expense: 2, income: 1, transfer: 0 });
    assert.deepEqual(operations.categories.map((c) => [c.title, c.amount]), [['Продукты', 1_500]]);
    const page = String(renderOperations(operations, createHref()));
    assert.ok(!page.includes('>Переводы<'));
    assert.ok(page.includes('Продукты, Т-Банк'));
  });

  it('opens an expense in place to mark it, keeping the filters, even one ZenMoney put into a category', () => {
    const lavka = data.transaction![0]!.id;
    const cafe = tag({ id: 'cafe', title: 'Кафе' });
    const page = String(
      renderOperations(
        loadOperations({ ...data, tag: [food, cafe] }, { ...sorting, regular: [regular({ id: 1, title: 'Аренда', amount: 1_200, day: 5 })] }, { today, kind: 'expense', edit: `spending-${lavka}` }),
        createHref(),
      ),
    );

    assert.ok(page.includes(`id="spending-${lavka}"`) && page.includes('href="/operations?kind=expense" title="Закрыть"'));
    assert.ok(page.includes(`action="/spending/${lavka}/regular-1"`), 'it can be linked to a payment');
    assert.ok(page.includes(`action="/spending/${lavka}/tag-cafe"`), 'ZenMoney’s category can be changed');
    assert.ok(page.includes('Продукты <small>из ZenMoney</small>'));
    assert.ok(page.includes(`href="/operations?kind=expense&amp;edit=spending-${data.transaction![2]!.id}"`), 'another expense opens with the filters kept');
    assert.ok(!page.includes(`edit=spending-${data.transaction![1]!.id}`), 'an income does not open');

    const picked = { ...sorting, categorizations: new Map([[lavka, { tag: cafe.id }]]) };
    const changed = String(renderOperations(loadOperations({ ...data, tag: [food, cafe] }, picked, { today, edit: `spending-${lavka}` }), createHref()));
    assert.ok(changed.includes('Кафе, Т-Банк'), 'the pick in the app wins');
    assert.ok(changed.includes(`action="/spending/${lavka}/uncategorize"`), 'ZenMoney’s category takes the pick back');
  });

  it('lists an expense not counted at all quieter, outside every sum, and opens it with when and how it was paid', () => {
    const at = (time: string) => new Date(`2026-10-03T${time}`).getTime() / 1000;
    const cash = transaction({ id: 'cash', date: '2026-10-03', created: at('14:58:00'), outcome: 120_000, payee: 'Снятие наличных', comment: 'Снял в банкомате', originalPayee: 'ATM 1234' });
    const withCash = { ...data, transaction: [...data.transaction!, cash] };
    const ignored = { ...sorting, marks: new Map([['cash', 'ignored' as const]]) };
    const month = loadOperations(withCash, ignored, { today, edit: 'spending-cash' });
    const page = String(renderOperations(month, createHref())).replaceAll('\u00a0', ' ');

    assert.deepEqual(month.categories.map((c) => [c.title, c.amount]), [['Продукты', 1_200], ['Без категории', 300]]);
    assert.ok(page.includes('5 операций: потрачено 1 500 ₽, получено 50 000 ₽.'));
    assert.ok(page.includes('class="operation-item open muted" id="spending-cash"') && page.includes('не учитывается, Т-Банк'));
    assert.ok(page.includes('<dt>Когда</dt><dd>3 октября, 14:58</dd>'));
    assert.ok(page.includes('<dt>В банке</dt><dd>ATM 1234</dd>') && page.includes('<dt>Комментарий</dt><dd>Снял в банкомате</dd>'));
    assert.ok(page.includes('Не учитывать</span></span>'), 'chosen');
  });

  it('ignores an unknown kind and a month in the future', () => {
    const page = loadOperations(data, sorting, { today, kind: 'gift', month: '2027-01' });
    assert.equal(page.filter.kind, undefined);
    assert.equal(page.month, '2026-10');
  });
});

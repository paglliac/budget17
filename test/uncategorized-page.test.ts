import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NO_SETUP } from '../src/categories.ts';
import type { Categorization } from '../src/categorization.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import type { SavedMarking } from '../src/web/pages/marking.ts';
import { loadUncategorized, renderUncategorized } from '../src/web/pages/uncategorized.ts';
import { account, regular, RUB, tag, transaction, user } from './fixtures.ts';

const today = '2026-10-06';
const groceries = tag({ id: 'groceries', title: 'Продукты' });
const cafe = tag({ id: 'cafe', title: 'Кафе' });
const salary = tag({ id: 'salary', title: 'Зарплата', showIncome: true, showOutcome: false });
const data: EntityCollections = {
  instrument: [RUB],
  user: [user()],
  account: [account({ id: 'card', title: 'Основной', company: 4902 }), account({ id: 'reserve', title: 'Запас', company: 4902 })],
  tag: [groceries, cafe, salary],
  transaction: [
    transaction({ id: 'rent', date: '2026-10-05', created: 3, outcome: 40_000, payee: 'Александр А.', outcomeAccount: 'reserve' }),
    transaction({ id: 'kiosk', date: '2026-10-03', outcome: 300, payee: 'Киоск 12' }),
    transaction({ id: 'shop', date: '2026-10-02', outcome: 120, payee: '<b>Лавка</b>', comment: 'За Савелия' }),
    transaction({ id: 'tagged', date: '2026-10-02', outcome: 500, payee: 'Пятёрочка', tag: [groceries.id] }),
    transaction({ id: 'sorted', date: '2026-10-01', outcome: 4_000, payee: 'Марина Б.' }),
    transaction({ id: 'move', date: '2026-10-01', outcome: 9_000, income: 9_000, outcomeAccount: 'card', incomeAccount: 'reserve' }),
    transaction({ id: 'kiosk-before', date: '2026-09-20', outcome: 250, payee: 'Киоск 7', tag: [cafe.id] }),
    transaction({ id: 'cafe-before', date: '2026-09-21', outcome: 250, payee: 'Кофейня', tag: [cafe.id] }),
    transaction({ id: 'september', date: '2026-09-12', outcome: 2_900, payee: 'Алишер Ш.' }),
  ],
};
const workshop = regular({ id: 2, title: 'Мастерская аренда', amount: 40_000, day: 10 });

function saved(overrides: Partial<SavedMarking> = {}): SavedMarking {
  return {
    categorizations: new Map<string, Categorization>([['sorted', { tag: groceries.id }]]),
    purchasePayments: new Map(),
    regular: [workshop],
    purchases: [{ id: 5, title: 'Ласты', amount: 300, week: '2026-09-28', envelope: 'week', done: false }],
    marks: new Map(),
    categories: NO_SETUP,
    ...overrides,
  };
}

const render = (options: Parameters<typeof loadUncategorized>[2], s = saved()) =>
  String(renderUncategorized(loadUncategorized(data, s, options), createHref())).replaceAll('\u00a0', ' ');

describe('uncategorized page', () => {
  it('lists the month’s expenses without a category, with suggestions to accept', () => {
    const page = render({ today });

    assert.ok(page.includes('В октябре 3 траты из 5 без категории, на 40 420 ₽. Для 2 есть подсказка'));
    assert.ok(page.includes('5 октября, Запас · похоже на регулярную «Мастерская аренда»'));
    assert.ok(page.includes('action="/spending/rent/regular-2"'));
    assert.ok(page.includes('3 октября, Основной · похоже на «Кафе»') && page.includes('action="/spending/kiosk/tag-cafe"'));
    assert.ok(page.includes('2 октября, Основной · За Савелия'));
    assert.ok(page.includes('&lt;b&gt;Лавка&lt;/b&gt;') && !page.includes('<b>Лавка</b>'));
    assert.ok(page.includes('href="/uncategorized?edit=spending-shop"'));
    assert.ok(!page.includes('Пятёрочка') && !page.includes('Алишер'), 'tagged ones and other months are not here');
    assert.ok(page.includes('Разобрано') && page.includes('1 октября, Основной · Продукты · в неделе'));
  });

  it('opens an expense in place to mark it, with the suggestion marked and the most popular categories first', () => {
    const kiosk = render({ today, edit: 'spending-kiosk' });
    assert.ok(kiosk.includes('id="spending-kiosk"') && kiosk.includes('href="/uncategorized"'), 'the row closes it');
    assert.ok(kiosk.includes('class="choice suggested" type="submit" title="Подсказка"><svg'));
    assert.ok(kiosk.indexOf('tag-cafe') < kiosk.indexOf('tag-groceries'), 'Кафе has more expenses lately');
    assert.ok(!kiosk.includes('tag-salary'), 'only spending categories');
    assert.ok(kiosk.includes('action="/spending/kiosk/purchase-5"') && kiosk.includes('план недели · 300 ₽'));
    assert.ok(kiosk.indexOf('action="/spending/kiosk/purchase-5"') < kiosk.indexOf('action="/spending/kiosk/regular-2"'), 'the closer amount first');
    assert.ok(!kiosk.includes('Другой платёж'), 'no list when all are buttons');

    const sorted = render({ today, edit: 'spending-sorted' });
    assert.ok(sorted.includes('class="choice current" aria-current="true"><svg') && sorted.includes('action="/spending/sorted/uncategorize"'));
  });

  it('leaves out an expense ZenMoney put into a category, even when the user picked another one', () => {
    const page = render({ today }, saved({ categorizations: new Map<string, Categorization>([['tagged', { tag: cafe.id }]]) }));

    assert.ok(!page.includes('Пятёрочка'));
  });

  it('leaves out an expense not counted at all', () => {
    const page = render({ today }, saved({ marks: new Map([['rent', 'ignored']]) }));

    assert.ok(!page.includes('Александр А.'));
    assert.ok(page.includes('В октябре 2 траты из 4 без категории'));
  });

  it('counts an expense that paid a purchase as sorted', () => {
    const page = render({ today }, saved({ purchasePayments: new Map([['kiosk', 5]]) }));

    assert.ok(page.includes('В октябре 2 траты из 5 без категории'));
    assert.ok(page.includes('3 октября, Основной · покупка «Ласты» · в неделе'));
  });

  it('shows another month and says when nothing is left', () => {
    assert.ok(render({ today, month: '2026-09' }).includes('Алишер Ш.'));
    const categorizations = new Map<string, Categorization>([
      ['sorted', { tag: groceries.id }],
      ['rent', { regular: 2 }],
      ['kiosk', { tag: 'cafe' }],
      ['shop', { tag: 'cafe' }],
    ]);
    const done = loadUncategorized(data, saved({ categorizations }), { today });
    assert.deepEqual(done.pending, []);
    assert.ok(String(renderUncategorized(done, createHref())).includes('В октябре у всех трат есть категория.'));
  });
});

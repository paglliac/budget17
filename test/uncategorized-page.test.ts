import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Categorization } from '../src/categorization.ts';
import { Settings } from '../src/settings.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import { loadUncategorized, renderUncategorized, submitUncategorized } from '../src/web/pages/uncategorized.ts';
import { account, regular, regularInput, RUB, tag, transaction, user } from './fixtures.ts';

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
    transaction({ id: 'september', date: '2026-09-12', outcome: 2_900, payee: 'Алишер Ш.' }),
  ],
};
const workshop = regular({ id: 2, title: 'Мастерская аренда', amount: 40_000, day: 10 });
const saved = { categorizations: new Map<string, Categorization>([['sorted', { tag: groceries.id }]]), regular: [workshop] };
const render = (options: Parameters<typeof loadUncategorized>[2]) =>
  String(renderUncategorized(loadUncategorized(data, saved, options), createHref())).replaceAll(' ', ' ');

describe('uncategorized page', () => {
  it('lists the month’s expenses without a category, with suggestions to accept', () => {
    const page = render({ today });

    assert.ok(page.includes('В октябре 3 траты из 5 без категории, на 40 420 ₽. Для 2 есть подсказка'));
    assert.ok(page.includes('5 октября, Запас · похоже на регулярную «Мастерская аренда»'));
    assert.ok(page.includes('action="/uncategorized/rent/regular-2"'));
    assert.ok(page.includes('3 октября, Основной · похоже на «Кафе»') && page.includes('action="/uncategorized/kiosk/tag-cafe"'));
    assert.ok(page.includes('2 октября, Основной · За Савелия'));
    assert.ok(page.includes('&lt;b&gt;Лавка&lt;/b&gt;') && !page.includes('<b>Лавка</b>'));
    assert.ok(page.includes('href="/uncategorized?edit=shop"'));
    assert.ok(!page.includes('Пятёрочка') && !page.includes('Алишер'), 'tagged ones and other months are not here');
    assert.ok(page.includes('Разобрано здесь') && page.includes('1 октября, Основной · Продукты'));
  });

  it('opens an expense as a form with the suggestion picked, and a sorted one with a way back', () => {
    const rent = render({ today, edit: 'rent' });
    assert.ok(rent.includes('action="/uncategorized/rent"'));
    assert.ok(rent.includes('<option value="regular-2" selected>Мастерская аренда · 40 000 ₽</option>'));
    assert.ok(rent.includes('<option value="tag-cafe">Кафе</option>') && !rent.includes('tag-salary'), 'only spending categories');

    const shop = render({ today, edit: 'shop' });
    assert.ok(shop.includes('<option value="" disabled selected>'), 'nothing is picked without a suggestion');

    const sorted = render({ today, edit: 'sorted' });
    assert.ok(sorted.includes('<option value="tag-groceries" selected>Продукты</option>'));
    assert.ok(sorted.includes('formaction="/uncategorized/sorted/reset"'));
  });

  it('shows another month and says when nothing is left', () => {
    assert.ok(render({ today, month: '2026-09' }).includes('Алишер Ш.'));
    const categorizations = new Map<string, Categorization>([...saved.categorizations, ['rent', { regular: 2 }], ['kiosk', { tag: 'cafe' }], ['shop', { tag: 'cafe' }]]);
    const done = loadUncategorized(data, { ...saved, categorizations }, { today });
    assert.deepEqual(done.pending, []);
    assert.ok(String(renderUncategorized(done, createHref())).includes('В октябре у всех трат есть категория.'));
  });
});

describe('submitUncategorized', () => {
  const form = (fields: Record<string, string> = {}) => new URLSearchParams(fields);

  it('saves an accepted suggestion, a picked target and a way back', () => {
    using settings = new Settings(':memory:');
    const rent = settings.addRegularExpense(regularInput({ title: 'Мастерская аренда', amount: 40_000, day: 10 }));

    assert.deepEqual(submitUncategorized(settings, data, `/uncategorized/rent/regular-${rent.id}`, form()), { status: 'saved' });
    assert.deepEqual(submitUncategorized(settings, data, '/uncategorized/kiosk', form({ target: 'tag-cafe' })), { status: 'saved' });
    assert.deepEqual([...settings.categorizations()], [['rent', { regular: rent.id }], ['kiosk', { tag: 'cafe' }]]);

    submitUncategorized(settings, data, '/uncategorized/rent/reset', form());
    assert.deepEqual([...settings.categorizations()], [['kiosk', { tag: 'cafe' }]]);
  });

  it('refuses an unknown expense, category or regular expense', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitUncategorized(settings, data, '/uncategorized/nope/tag-cafe', form()), { status: 'missing' });
    assert.deepEqual(submitUncategorized(settings, data, '/uncategorized/kiosk/tag-nope', form()), { status: 'missing' });
    assert.deepEqual(submitUncategorized(settings, data, '/uncategorized/kiosk/regular-5', form()), { status: 'missing' });
    assert.deepEqual(submitUncategorized(settings, data, '/uncategorized/kiosk', form({ target: '' })), { status: 'missing' });
    assert.deepEqual(submitUncategorized(settings, data, '/uncategorized/kiosk/drop', form()), { status: 'missing' });
    assert.deepEqual([...settings.categorizations()], []);
  });
});

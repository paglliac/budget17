import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Settings } from '../src/settings.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import { loadSettingsPage, renderSettings, submitBudget, submitSettings, type SavedSettings } from '../src/web/pages/settings.ts';
import { account, RUB, tag, transaction, user } from './fixtures.ts';

const today = '2026-10-06';
const groceries = tag({ id: 'groceries', title: 'Groceries' });
const cafe = tag({ id: 'cafe', title: 'Eating out' });
const correction = tag({ id: 'correction', title: 'Correction' });
const data: EntityCollections = {
  instrument: [RUB],
  user: [user()],
  account: [account({ id: 'card' })],
  tag: [groceries, cafe, correction],
  transaction: [
    transaction({ date: '2026-10-01', outcome: 300, tag: [cafe.id] }),
    transaction({ date: '2026-10-02', outcome: 300, tag: [cafe.id] }),
    transaction({ id: 'kids', date: '2026-10-03', outcome: 300 }),
    transaction({ date: '2026-10-04', outcome: 300, tag: [groceries.id] }),
  ],
};

function saved(settings: Settings): SavedSettings {
  return {
    categorizations: settings.categorizations(),
    purchasePayments: new Map(),
    regular: [],
    purchases: [],
    marks: new Map(),
    categories: settings.categorySetup(),
    weekStart: settings.weekStart(),
    weekLimits: settings.weekLimits(),
  };
}

const render = (settings: Settings, options: Partial<Parameters<typeof loadSettingsPage>[2]> = {}) =>
  String(renderSettings(loadSettingsPage(data, saved(settings), { today, ...options }), createHref())).replaceAll(' ', ' ');

describe('settings page', () => {
  it('lists categories most popular first, renamed, own and hidden ones apart', () => {
    using settings = new Settings(':memory:');
    settings.renameCategory(groceries.id, 'Продукты');
    settings.hideCategory(correction.id, true);
    const kids = settings.addOwnCategory('Дети');
    settings.categorize('kids', { tag: kids.id });
    const page = render(settings);

    assert.ok(page.includes('3 категории из ZenMoney и 1 своя, 1 скрыта.'));
    const rows = [...page.slice(page.indexOf('aria-label="Категории"')).matchAll(/<b>([^<]*)<\/b><small>([^<]*)<\/small>/g)].map((m) => `${m[1]}: ${m[2]}`);
    assert.deepEqual(rows, [
      'Eating out: из ZenMoney · 2 траты за три месяца',
      'Продукты: в ZenMoney «Groceries» · 1 трата за три месяца',
      'Дети: своя · 1 трата за три месяца',
      'Correction: из ZenMoney · за три месяца трат нет',
    ]);
    assert.ok(page.indexOf('Скрытые') < page.indexOf('Correction'));
    assert.ok(page.includes('href="/settings"') && page.includes('action="/categories"'));
  });

  it('opens a ZenMoney category to rename or hide it, and an own one to delete it too', () => {
    using settings = new Settings(':memory:');
    const kids = settings.addOwnCategory('Дети');

    const zenmoney = render(settings, { edit: groceries.id });
    assert.ok(zenmoney.includes('action="/categories/groceries"') && zenmoney.includes('value="Groceries"'));
    assert.ok(zenmoney.includes('Название, в ZenMoney «Groceries»'));
    assert.ok(zenmoney.includes('formaction="/categories/groceries/hide"') && !zenmoney.includes('formaction="/categories/groceries/delete"'));

    const own = render(settings, { edit: kids.id });
    assert.ok(own.includes(`formaction="/categories/${kids.id}/delete"`));
  });
});

describe('settings page budget', () => {
  it('picks the day a week begins on in one click and lists the weeks with an amount of their own', () => {
    using settings = new Settings(':memory:');
    settings.setWeekStart(2);
    settings.setWeekLimit('2026-09-30', 40_000);
    settings.setWeekLimit('2026-10-14', 30_000);
    const page = render(settings);

    assert.ok(page.includes('Неделя начинается в среду: в этот день обновляются 45 000 ₽ на обычные траты.'));
    const days = /aria-label="Неделя начинается".*?<\/div>/s.exec(page)?.[0] ?? '';
    assert.ok(days.includes('aria-current="true"><svg') && /aria-current="true">.*?<span>Ср<\/span>/s.test(days), 'Wednesday is the current choice');
    assert.ok(days.includes('action="/budget/week-start/0"') && !days.includes('action="/budget/week-start/2"'));
    const rows = [...page.slice(page.indexOf('aria-label="Бюджет недель"')).matchAll(/<b>([^<]*)<\/b><small>([^<]*)<\/small>/g)].map((m) => `${m[1]}: ${m[2]}`);
    assert.deepEqual(rows.slice(0, 3), [
      'Неделя 30 сентября – 6 октября: идёт · вместо 45 000 ₽',
      'Неделя 14–20 октября: впереди · вместо 45 000 ₽',
      'Изменить бюджет недели: неделя и сумма',
    ]);
  });

  it('opens a week to change its amount or give the usual back, and the form for another week', () => {
    using settings = new Settings(':memory:');
    settings.setWeekLimit('2026-10-12', 30_000);

    const own = render(settings, { edit: 'week-2026-10-12' });
    assert.ok(own.includes('action="/budget/weeks/2026-10-12"') && own.includes('value="30000"'));
    assert.ok(own.includes('formaction="/budget/weeks/2026-10-12/delete">Вернуть 45 000 ₽'));

    const another = render(settings, { edit: 'new-week' });
    assert.ok(another.includes('action="/budget/weeks"'));
    assert.ok(another.includes('<option value="2026-10-05" selected>Эта неделя</option>'), 'this week unless another is picked');

    const invalid = render(settings, { weekForm: { week: '2026-10-19', new: true, amount: 'много', error: 'Сумма в рублях, например 13 000' } });
    assert.ok(invalid.includes('<option value="2026-10-19" selected>') && invalid.includes('value="много"') && invalid.includes('Сумма в рублях, например 13 000'));
  });
});

describe('submitBudget', () => {
  const form = (fields: Record<string, string> = {}) => new URLSearchParams(fields);

  it('sets the first day of a week and the amounts of weeks, and gives the usual back', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitBudget(settings, '/budget/weeks', form({ week: '2026-10-12', amount: '30 000' }), today), { status: 'saved' });
    assert.deepEqual(submitBudget(settings, '/budget/weeks/2026-10-12', form({ amount: '25000' }), today), { status: 'saved' });
    assert.deepEqual([...settings.weekLimits()], [['2026-10-12', 25_000]]);
    assert.deepEqual(submitBudget(settings, '/budget/weeks/2026-10-12', form({ amount: '45 000' }), today), { status: 'saved' });
    assert.deepEqual([...settings.weekLimits()], [], 'the usual amount is no amount of its own');

    submitBudget(settings, '/budget/weeks', form({ week: '2026-10-19', amount: '20000' }), today);
    assert.deepEqual(submitBudget(settings, '/budget/weeks/2026-10-19/delete', form(), today), { status: 'saved' });
    assert.deepEqual([...settings.weekLimits()], []);

    assert.deepEqual(submitBudget(settings, '/budget/week-start/4', form(), today), { status: 'saved' });
    assert.equal(settings.weekStart(), 4);
  });

  it('returns the form with an error, and refuses a week without an amount of its own or a day that is not one', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitBudget(settings, '/budget/weeks', form({ week: '2026-10-13', amount: '30000' }), today), {
      status: 'invalid',
      form: { week: '2026-10-13', new: true, amount: '30000', error: 'Выберите неделю' },
    });
    assert.equal(submitBudget(settings, '/budget/weeks', form({ week: '2026-10-12', amount: '0' }), today).status, 'invalid');
    assert.deepEqual(submitBudget(settings, '/budget/weeks/2026-10-12', form({ amount: '30000' }), today), { status: 'missing' });
    assert.deepEqual(submitBudget(settings, '/budget/week-start/7', form(), today), { status: 'missing' });
    assert.deepEqual([...settings.weekLimits()], []);
  });
});

describe('submitSettings', () => {
  const form = (fields: Record<string, string> = {}) => new URLSearchParams(fields);

  it('adds own categories, renames, hides and deletes them', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitSettings(settings, data, '/categories', form({ title: '  Дети ' })), { status: 'saved' });
    assert.deepEqual(submitSettings(settings, data, '/categories/groceries', form({ title: 'Продукты' })), { status: 'saved' });
    assert.deepEqual(submitSettings(settings, data, '/categories/correction/hide', form()), { status: 'saved' });
    assert.deepEqual(submitSettings(settings, data, '/categories/own-1', form({ title: 'Савва' })), { status: 'saved' });
    assert.deepEqual(settings.categorySetup(), {
      changes: new Map([
        ['groceries', { title: 'Продукты', hidden: false }],
        ['correction', { title: null, hidden: true }],
      ]),
      own: [{ id: 'own-1', title: 'Савва', hidden: false }],
    });

    submitSettings(settings, data, '/categories/groceries', form({ title: 'Groceries' }));
    submitSettings(settings, data, '/categories/correction/show', form());
    assert.deepEqual(settings.categorySetup().changes.get('groceries'), { title: null, hidden: false }, 'ZenMoney’s title back');
    assert.deepEqual(settings.categorySetup().changes.get('correction'), { title: null, hidden: false });
    assert.deepEqual(submitSettings(settings, data, '/categories/own-1/delete', form()), { status: 'saved' });
    assert.deepEqual(settings.categorySetup().own, []);
  });

  it('returns the form with an error, and refuses an unknown category or deleting a ZenMoney one', () => {
    using settings = new Settings(':memory:');
    settings.addOwnCategory('Дети');

    assert.deepEqual(submitSettings(settings, data, '/categories', form({ title: ' ' })), { status: 'invalid', form: { id: null, title: ' ', error: 'Укажите название' } });
    assert.equal(submitSettings(settings, data, '/categories/own-1', form({ title: '' })).status, 'invalid');
    assert.deepEqual(submitSettings(settings, data, '/categories/nope', form({ title: 'Нет' })), { status: 'missing' });
    assert.deepEqual(submitSettings(settings, data, '/categories/groceries/delete', form()), { status: 'missing' });
    assert.deepEqual(submitSettings(settings, data, '/categories/groceries/drop', form()), { status: 'missing' });
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Settings } from '../src/settings.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import type { SavedMarking } from '../src/web/pages/marking.ts';
import { loadSettingsPage, renderSettings, submitSettings } from '../src/web/pages/settings.ts';
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

function saved(settings: Settings): SavedMarking {
  return {
    categorizations: settings.categorizations(),
    purchasePayments: new Map(),
    regular: [],
    purchases: [],
    marks: new Map(),
    categories: settings.categorySetup(),
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
    const rows = [...page.matchAll(/<b>([^<]*)<\/b><small>([^<]*)<\/small>/g)].map((m) => `${m[1]}: ${m[2]}`);
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

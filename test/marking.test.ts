import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Settings } from '../src/settings.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { submitMarking } from '../src/web/pages/marking.ts';
import { account, regularInput, RUB, tag, transaction, user } from './fixtures.ts';

const data: EntityCollections = {
  instrument: [RUB],
  user: [user()],
  account: [account({ id: 'card' })],
  tag: [tag({ id: 'cafe', title: 'Кафе' }), tag({ id: 'salary', title: 'Зарплата', showIncome: true, showOutcome: false })],
  transaction: [
    transaction({ id: 'rent', outcome: 40_000, payee: 'Александр А.' }),
    transaction({ id: 'kiosk', outcome: 300, payee: 'Киоск' }),
    transaction({ id: 'gone', outcome: 100, deleted: true }),
  ],
};
const form = (fields: Record<string, string> = {}) => new URLSearchParams(fields);

describe('submitMarking', () => {
  it('puts an expense into a category, ZenMoney’s or the user’s own, and takes it back', () => {
    using settings = new Settings(':memory:');
    const kids = settings.addOwnCategory('Дети');

    assert.deepEqual(submitMarking(settings, data, '/spending/kiosk/tag-cafe', form()), { status: 'saved' });
    assert.deepEqual(submitMarking(settings, data, `/spending/rent/tag-${kids.id}`, form()), { status: 'saved' });
    assert.deepEqual([...settings.categorizations()], [['kiosk', { tag: 'cafe' }], ['rent', { tag: kids.id }]]);

    submitMarking(settings, data, '/spending/kiosk/uncategorize', form());
    assert.deepEqual([...settings.categorizations()], [['rent', { tag: kids.id }]]);
  });

  it('links an expense to a regular expense or a purchase, picked from a list too, so it counts where that does', () => {
    using settings = new Settings(':memory:');
    const rent = settings.addRegularExpense(regularInput({ title: 'Мастерская аренда', amount: 40_000, day: 10 }));
    const shoes = settings.addPurchase({ title: 'Ботинки', amount: 8_000, week: '2026-09-28', envelope: 'extra', kind: 'flexible', done: false });
    settings.markSpending('rent', 'extra');
    settings.categorize('kiosk', { tag: 'cafe' });

    assert.deepEqual(submitMarking(settings, data, '/spending/rent', form({ target: `regular-${rent.id}` })), { status: 'saved' });
    assert.deepEqual(submitMarking(settings, data, `/spending/kiosk/purchase-${shoes.id}`, form()), { status: 'saved' });
    assert.deepEqual([...settings.categorizations()], [['kiosk', { tag: 'cafe' }], ['rent', { regular: rent.id }]], 'a purchase keeps the category');
    assert.deepEqual([...settings.purchasePayments()], [['kiosk', shoes.id]]);
    assert.deepEqual([...settings.spendingMarks()], [], 'a payment counts where what it paid counts');

    submitMarking(settings, data, `/spending/rent/purchase-${shoes.id}`, form());
    assert.deepEqual([...settings.categorizations()], [['kiosk', { tag: 'cafe' }]], 'a purchase replaces a regular expense');
    submitMarking(settings, data, '/spending/rent/unlink', form());
    submitMarking(settings, data, '/spending/kiosk/unlink', form());
    assert.deepEqual([...settings.purchasePayments()], []);
  });

  it('moves an expense between the week, extras, outside the budget and not counted at all', () => {
    using settings = new Settings(':memory:');
    const rent = settings.addRegularExpense(regularInput({ title: 'Мастерская аренда', amount: 40_000, day: 10 }));

    submitMarking(settings, data, '/spending/kiosk/outside', form());
    assert.deepEqual([...settings.spendingMarks()], [['kiosk', 'outside']]);
    submitMarking(settings, data, '/spending/kiosk/week', form());
    assert.deepEqual([...settings.spendingMarks()], []);

    submitMarking(settings, data, '/spending/rent/ignored', form());
    assert.deepEqual([...settings.spendingMarks()], [['rent', 'ignored']]);
    submitMarking(settings, data, `/spending/rent/regular-${rent.id}`, form());
    assert.deepEqual([...settings.spendingMarks()], [], 'a linked payment counts again');
  });

  it('refuses an unknown expense, category, regular expense, purchase or choice', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitMarking(settings, data, '/spending/nope/tag-cafe', form()), { status: 'missing' });
    assert.deepEqual(submitMarking(settings, data, '/spending/gone/tag-cafe', form()), { status: 'missing' });
    assert.deepEqual(submitMarking(settings, data, '/spending/kiosk/tag-salary', form()), { status: 'missing' }, 'not a spending category');
    assert.deepEqual(submitMarking(settings, data, '/spending/kiosk/tag-own-1', form()), { status: 'missing' });
    assert.deepEqual(submitMarking(settings, data, '/spending/kiosk/regular-5', form()), { status: 'missing' });
    assert.deepEqual(submitMarking(settings, data, '/spending/kiosk/purchase-5', form()), { status: 'missing' });
    assert.deepEqual(submitMarking(settings, data, '/spending/kiosk', form({ target: '' })), { status: 'missing' });
    assert.deepEqual(submitMarking(settings, data, '/spending/kiosk/nowhere', form()), { status: 'missing' });
    assert.deepEqual([...settings.categorizations()], []);
    assert.deepEqual([...settings.spendingMarks()], []);
  });
});

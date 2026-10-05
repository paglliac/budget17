import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Settings } from '../src/settings.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import { loadRegular, renderRegular, submitRegular } from '../src/web/pages/regular.ts';
import { RUB, user } from './fixtures.ts';

const today = '2026-10-05';
const data: EntityCollections = { instrument: [RUB], user: [user()] };
const expenses = [
  { id: 1, title: 'Телефон', amount: 1_500, day: 2 },
  { id: 2, title: 'Машина', amount: 91_000, day: 5 },
  { id: 3, title: '<b>Офис</b> аренда', amount: 13_000, day: 25 },
];
const render = (options: Parameters<typeof loadRegular>[2], list = expenses) =>
  String(renderRegular(loadRegular(data, list, options), createHref()));
const form = (fields: Record<string, string>) => new URLSearchParams(fields);

describe('regular expenses page', () => {
  it('lists expenses with their next payment, the monthly total and what is left this month', () => {
    const page = render({ today });

    assert.ok(page.includes('Каждый месяц на них уходит 105 500 ₽. В октябре осталось заплатить 104 000 ₽, ближайший платёж — «Машина», сегодня.'));
    assert.ok(page.includes('2-го числа · через 28 дней'));
    assert.ok(page.includes('25-го числа · через 20 дней'));
    assert.ok(page.includes('&lt;b&gt;Офис&lt;/b&gt; аренда'));
    assert.ok(!page.includes('<b>Офис</b>'));
    assert.ok(page.includes('href="/regular?edit=2"'));
    assert.ok(page.includes('на 3 платежа'));
    assert.ok(page.includes('title="Машина 91 000 ₽"'), 'the calendar marks payment days');
    assert.ok(page.includes('action="/regular"'), 'there is always a form to add one');
  });

  it('opens a row for editing with its values, delete and cancel', () => {
    const page = render({ today, edit: '3' });

    assert.ok(page.includes('action="/regular/3"'));
    assert.ok(page.includes('value="13000"'));
    assert.ok(page.includes('formaction="/regular/3/delete"'));
    assert.ok(!page.includes('href="/regular?edit=3"'));
    assert.ok(render({ today, edit: '99' }).includes('href="/regular?edit=3"'), 'an unknown id opens nothing');
  });

  it('invites to add the first expense', () => {
    const page = render({ today }, []);

    assert.ok(page.includes('Добавьте платежи, которые повторяются каждый месяц'));
    assert.ok(page.includes('Регулярных трат пока нет'));
  });
});

describe('submitRegular', () => {
  it('adds, saves and deletes', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitRegular(settings, '/regular', form({ title: 'Школа', amount: '45 000', day: '30' })), { status: 'saved' });
    const [school] = settings.regularExpenses();
    assert.deepEqual(school, { id: 1, title: 'Школа', amount: 45_000, day: 30 });

    assert.deepEqual(submitRegular(settings, '/regular/1', form({ title: 'Школа', amount: '47000', day: '30' })), { status: 'saved' });
    assert.equal(settings.regularExpenses()[0]?.amount, 47_000);

    assert.deepEqual(submitRegular(settings, '/regular/1/delete', form({})), { status: 'saved' });
    assert.deepEqual(settings.regularExpenses(), []);
  });

  it('returns what was typed with the errors, and the page shows them in the right form', () => {
    using settings = new Settings(':memory:');
    settings.addRegularExpense({ title: 'Бокс', amount: 25_000, day: 3 });

    const result = submitRegular(settings, '/regular/1', form({ title: 'Бокс', amount: 'дорого', day: '3' }));
    assert.ok(result.status === 'invalid');
    assert.deepEqual(result.form, { id: 1, values: { title: 'Бокс', amount: 'дорого', day: '3' }, errors: { amount: 'Сумма в рублях, например 13 000' } });
    assert.equal(settings.regularExpenses()[0]?.amount, 25_000, 'nothing is saved');

    const page = render({ today, form: result.form }, settings.regularExpenses());
    assert.ok(page.includes('value="дорого"'));
    assert.ok(page.includes('Сумма в рублях, например 13 000'));
    assert.ok(page.includes('action="/regular/1"'));
  });

  it('reports expenses and paths that are not there', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitRegular(settings, '/regular/7', form({ title: 'А', amount: '1', day: '1' })), { status: 'missing' });
    assert.deepEqual(submitRegular(settings, '/regular/7/delete', form({})), { status: 'missing' });
    assert.deepEqual(submitRegular(settings, '/regular/abc', form({})), { status: 'missing' });
  });
});

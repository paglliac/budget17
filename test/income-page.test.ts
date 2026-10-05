import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Income } from '../src/income.ts';
import { Settings } from '../src/settings.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import { loadIncome, renderIncome, submitIncome } from '../src/web/pages/income.ts';
import { RUB, user } from './fixtures.ts';

const today = '2026-10-05';
const data: EntityCollections = { instrument: [RUB], user: [user()] };
const incomes: Income[] = [
  { id: 1, title: 'Зарплата', model: 'salary', params: { salary: 200_000, advanceDay: 20, payDay: 5 } },
  { id: 2, title: '<i>Сдача</i> квартиры', model: 'fixed', params: { amount: 100_000, day: 10 } },
];
const render = (options: Parameters<typeof loadIncome>[2], list = incomes) => String(renderIncome(loadIncome(data, list, options), createHref()));
const form = (fields: Record<string, string>) => new URLSearchParams(fields);

describe('income page', () => {
  it('lists incomes and the upcoming payments with how each is worked out', () => {
    const page = render({ today });

    assert.ok(page.includes('В месяц приходит 300 000 ₽. Ближайшее поступление — «Зарплата за сентябрь», 100 000 ₽, сегодня.'));
    assert.ok(page.includes('аванс 20-го, остальное 5-го · сегодня'));
    assert.ok(page.includes('&lt;i&gt;Сдача&lt;/i&gt; квартиры'));
    assert.ok(!page.includes('<i>Сдача</i>'));
    assert.ok(page.includes('Аванс за октябрь'));
    assert.ok(page.includes('200 000 × 11/22 рабочих дней'));
    assert.ok(page.includes('из 2 источников'));
    assert.ok(page.includes('href="/income?edit=1"'));
  });

  it('offers a form for each model, starting with a fixed sum', () => {
    const fixed = render({ today });
    assert.ok(fixed.includes('name="model" value="fixed"'));
    assert.ok(fixed.includes('name="day"'));

    const salary = render({ today, add: 'salary' });
    assert.ok(salary.includes('name="model" value="salary"'));
    assert.ok(salary.includes('name="advanceDay" value="20"'), 'the salary form starts with the usual days');
    assert.ok(salary.includes('href="/income?add=salary" aria-current="page"'));
    assert.ok(render({ today, add: 'lottery' }).includes('name="model" value="fixed"'));
  });

  it('opens an income for editing with its own fields', () => {
    const page = render({ today, edit: '1' });

    assert.ok(page.includes('action="/income/1"'));
    assert.ok(page.includes('name="salary" value="200000"'));
    assert.ok(page.includes('formaction="/income/1/delete"'));
  });

  it('invites to add the first income', () => {
    const page = render({ today }, []);

    assert.ok(page.includes('Добавьте, откуда и когда приходят деньги'));
    assert.ok(!page.includes('Ближайшие поступления'));
  });
});

describe('submitIncome', () => {
  it('adds an income of the posted model, saves and deletes it', () => {
    using settings = new Settings(':memory:');

    const added = submitIncome(settings, '/income', form({ model: 'salary', title: 'Зарплата', salary: '200 000', advanceDay: '20', payDay: '5' }));
    assert.deepEqual(added, { status: 'saved' });
    assert.deepEqual(settings.incomes(), [{ id: 1, title: 'Зарплата', model: 'salary', params: { salary: 200_000, advanceDay: 20, payDay: 5 } }]);

    const saved = submitIncome(settings, '/income/1', form({ model: 'fixed', title: 'Зарплата', salary: '210000', advanceDay: '20', payDay: '5' }));
    assert.deepEqual(saved, { status: 'saved' });
    assert.equal(settings.incomes()[0]?.model, 'salary', 'an income keeps its model');
    assert.equal(settings.incomes()[0]?.params.salary, 210_000);

    assert.deepEqual(submitIncome(settings, '/income/1/delete', form({})), { status: 'saved' });
    assert.deepEqual(settings.incomes(), []);
  });

  it('returns what was typed with the errors, and the page shows them in the form of that model', () => {
    using settings = new Settings(':memory:');

    const result = submitIncome(settings, '/income', form({ model: 'salary', title: 'Зарплата', salary: '', advanceDay: '20', payDay: '35' }));
    assert.ok(result.status === 'invalid');
    assert.deepEqual(result.form.errors, { salary: 'Укажите сумму', payDay: 'От 1 до 31' });
    assert.deepEqual(settings.incomes(), []);

    const page = render({ today, form: result.form }, []);
    assert.ok(page.includes('name="model" value="salary"'));
    assert.ok(page.includes('name="payDay" value="35"'));
    assert.ok(page.includes('От 1 до 31'));
  });

  it('reports incomes, models and paths that are not there', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitIncome(settings, '/income/3', form({ title: 'А' })), { status: 'missing' });
    assert.deepEqual(submitIncome(settings, '/income/3/delete', form({})), { status: 'missing' });
    assert.deepEqual(submitIncome(settings, '/income', form({ model: 'lottery', title: 'А' })), { status: 'missing' });
    assert.deepEqual(submitIncome(settings, '/incomes', form({})), { status: 'missing' });
  });
});

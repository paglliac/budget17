import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Settings } from '../src/settings.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import { loadRegular, renderRegular, submitRegular } from '../src/web/pages/regular.ts';
import { regular, regularInput, RUB, user } from './fixtures.ts';

const today = '2026-10-05';
const data: EntityCollections = { instrument: [RUB], user: [user()] };
const expenses = [
  regular({ id: 1, title: 'Телефон', amount: 1_500, day: 2 }),
  regular({ id: 2, title: 'Машина', amount: 91_000, day: 5 }),
  regular({ id: 3, title: '<b>Офис</b> аренда', amount: 13_000, day: 25 }),
];
const render = (options: Parameters<typeof loadRegular>[2], list = expenses) =>
  String(renderRegular(loadRegular(data, list, options), createHref())).replaceAll('\u00a0', ' ');
const form = (fields: Record<string, string>) => new URLSearchParams(fields);

describe('regular expenses page', () => {
  it('lists expenses with their next payment, the month’s total and what is left of it', () => {
    const page = render({ today });

    assert.ok(page.includes('В октябре на них уходит 105 500 ₽. Осталось заплатить 104 000 ₽, ближайший платёж — «Машина», сегодня.'));
    assert.ok(page.includes('2-го числа · через 28 дней'));
    assert.ok(page.includes('25-го числа · через 20 дней'));
    assert.ok(page.includes('&lt;b&gt;Офис&lt;/b&gt; аренда'));
    assert.ok(!page.includes('<b>Офис</b>'));
    assert.ok(page.includes('href="/regular?edit=2"'));
    assert.ok(page.includes('на 3 платежа'));
    assert.ok(page.includes('title="Машина 91 000 ₽"'), 'the calendar marks payment days');
    assert.ok(page.includes('action="/regular"'), 'there is always a form to add one');
  });

  it('counts only the payments between their start and end dates', () => {
    const page = render({ today }, [
      ...expenses,
      regular({ id: 4, title: 'Кредит', amount: 9_000, day: 20, start: '2026-11-01', end: '2027-03-20' }),
      regular({ id: 5, title: 'Секция', amount: 5_000, day: 15, end: '2026-09-15' }),
      regular({ id: 6, title: 'Бассейн', amount: 4_000, day: 28, end: '2026-12-31' }),
    ]);

    assert.ok(page.includes('В октябре на них уходит 109 500 ₽.'), 'the loan has not started and the club is over');
    assert.ok(page.includes('20-го числа · с 1 ноября · по 20 марта 2027 · через 46 дней'));
    assert.ok(page.includes('15-го числа · по 15 сентября · платежи закончились'));
    assert.ok(page.includes('28-го числа · по 31 декабря · через 23 дня'));
    assert.ok(page.includes('на 4 платежа'));
    assert.ok(!page.includes('Кредит 9 000 ₽') && !page.includes('Секция 5 000 ₽'), 'the calendar leaves them out');
  });

  it('says when nothing is paid this month and when the next payment comes', () => {
    const page = render({ today }, [regular({ id: 1, title: 'Кредит', amount: 9_000, day: 20, start: '2026-11-01' })]);

    assert.ok(page.includes('В октябре регулярных платежей нет. Ближайший — «Кредит», 20 ноября.'));
    assert.ok(page.includes('В октябре платежей нет'));
  });

  it('shows the icon picked for an expense instead of the one by its title', () => {
    const entryIcon = (list: Parameters<typeof render>[1]) => /<span class="entry-icon">(<svg.*?<\/svg>)/s.exec(render({ today }, list))?.[1];
    const picked = entryIcon([regular({ id: 1, title: 'Телефон', amount: 1_500, day: 2, icon: 'gift' })]);

    assert.notEqual(picked, entryIcon([regular({ id: 1, title: 'Телефон', amount: 1_500, day: 2 })]));
    assert.equal(picked, entryIcon([regular({ id: 1, title: 'Подарок', amount: 1_500, day: 2 })]));
  });

  it('opens a row for editing with its values, delete and cancel', () => {
    const page = render({ today, edit: '3' });

    assert.ok(page.includes('action="/regular/3"'));
    assert.ok(page.includes('value="13000"'));
    assert.ok(page.includes('formaction="/regular/3/delete"'));
    assert.ok(!page.includes('href="/regular?edit=3"'));
    assert.ok(render({ today, edit: '99' }).includes('href="/regular?edit=3"'), 'an unknown id opens nothing');
  });

  it('folds the dates and the icon of the open expense under «Даты и иконка»', () => {
    const loan = regular({ id: 4, title: 'Кредит', amount: 9_000, day: 20, start: '2026-11-01', end: '2027-03-20', icon: 'card' });
    const page = render({ today, edit: '4' }, [loan]);

    assert.ok(page.includes('<details class="entry-more"><summary class="entry-quiet">Даты и иконка'), 'folded');
    assert.ok(page.includes('name="start" value="2026-11-01"') && page.includes('type="date"'));
    assert.ok(page.includes('name="end" value="2027-03-20"'));
    assert.ok(page.includes('name="icon" value="card" aria-label="Кредит" checked'));
    assert.ok(page.includes('name="icon" value="" aria-label="По названию">'), 'the icon by the title is not picked');
    assert.ok(render({ today }).includes('name="icon" value="" aria-label="По названию" checked'), 'a new expense gets its icon by the title');
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
    assert.deepEqual(school, { id: 1, title: 'Школа', amount: 45_000, day: 30, start: null, end: null, icon: null });

    assert.deepEqual(submitRegular(settings, '/regular/1', form({ title: 'Школа', amount: '47000', day: '30' })), { status: 'saved' });
    assert.equal(settings.regularExpenses()[0]?.amount, 47_000);

    assert.deepEqual(submitRegular(settings, '/regular/1/delete', form({})), { status: 'saved' });
    assert.deepEqual(settings.regularExpenses(), []);
  });

  it('saves the dates and the icon, leaving out an icon the app does not offer', () => {
    using settings = new Settings(':memory:');
    const fields = { title: 'Кредит', amount: '9000', day: '20', start: '2026-11-01', end: '2027-03-20' };

    assert.deepEqual(submitRegular(settings, '/regular', form({ ...fields, icon: 'card' })), { status: 'saved' });
    assert.deepEqual(settings.regularExpenses()[0], { id: 1, title: 'Кредит', amount: 9_000, day: 20, start: '2026-11-01', end: '2027-03-20', icon: 'card' });

    submitRegular(settings, '/regular/1', form({ ...fields, end: '', icon: 'pencil' }));
    assert.deepEqual(settings.regularExpenses()[0], { id: 1, title: 'Кредит', amount: 9_000, day: 20, start: '2026-11-01', end: null, icon: null });
  });

  it('unfolds the dates when one of them is wrong', () => {
    using settings = new Settings(':memory:');
    settings.addRegularExpense(regularInput({ title: 'Кредит', amount: 9_000, day: 20 }));

    const result = submitRegular(settings, '/regular/1', form({ title: 'Кредит', amount: '9000', day: '20', start: '2026-11-01', end: '2026-10-01' }));
    assert.ok(result.status === 'invalid');
    assert.deepEqual(result.form.errors, { end: 'Раньше даты начала' });

    const page = render({ today, form: result.form }, settings.regularExpenses());
    assert.ok(page.includes('<details class="entry-more" open>'));
    assert.ok(page.includes('Раньше даты начала'));
  });

  it('returns what was typed with the errors, and the page shows them in the right form', () => {
    using settings = new Settings(':memory:');
    settings.addRegularExpense(regularInput({ title: 'Бокс', amount: 25_000, day: 3 }));

    const result = submitRegular(settings, '/regular/1', form({ title: 'Бокс', amount: 'дорого', day: '3' }));
    assert.ok(result.status === 'invalid');
    assert.deepEqual(result.form, {
      id: 1,
      values: { title: 'Бокс', amount: 'дорого', day: '3', start: '', end: '', icon: '' },
      errors: { amount: 'Сумма в рублях, например 13 000' },
    });
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

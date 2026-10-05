import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Settings } from '../src/settings.ts';
import type { Envelope } from '../src/week.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import { budgetOf, loadDashboard, renderDashboard, submitDashboard, type SavedBudget } from '../src/web/pages/dashboard.ts';
import { account, regular, RUB, transaction, user } from './fixtures.ts';

const today = '2026-10-06';

function data(): EntityCollections {
  return {
    instrument: [RUB],
    user: [user({ login: 'kir' })],
    account: [account({ id: 'card', title: 'Основной' })],
    transaction: [
      transaction({ id: 'groceries', date: '2026-10-05', outcome: 473, payee: '<b>Пятёрочка</b>' }),
      transaction({ id: 'transfer', date: '2026-10-05', outcome: 40_000, payee: 'Александр А.' }),
      transaction({ id: 'last-week', date: '2026-10-01', outcome: 30_000, payee: 'Дарья Ч.' }),
    ],
  };
}

function saved(marks: Array<[string, Envelope]> = []): SavedBudget {
  return {
    purchases: [
      { id: 1, title: 'Ботинки Савве', amount: 8_000, week: '2026-10-05', envelope: 'week', done: false },
      { id: 2, title: 'Подарок', amount: 5_000, week: '2026-10-05', envelope: 'week', done: true },
      { id: 3, title: 'Куртка', amount: 20_000, week: '2026-10-05', envelope: 'extra', done: false },
    ],
    wishes: [{ id: 1, title: 'Укладка для волос', amount: 4_500 }],
    marks: new Map(marks),
    regular: [regular({ id: 7, title: 'Школа, ЛДК', amount: 45_000, day: 7 })],
    categorizations: new Map(),
  };
}

const options = { today, source: 'zenmoney' as const, canSync: true };
/** The page with non-breaking spaces as plain ones, so the expected text reads naturally. */
const render = (extra: Partial<Parameters<typeof loadDashboard>[2]> = {}, budget = saved()) =>
  String(renderDashboard(loadDashboard(data(), budget, { ...options, ...extra }), createHref())).replaceAll('\u00a0', ' ');

describe('dashboard', () => {
  it('shows what is left this week, the plan with bought marks, regular payments and the spending', () => {
    const page = render();

    assert.ok(page.includes('Неделя 5–11 октября'));
    assert.ok(page.includes('Неделя в минусе на 3 473 ₽: потрачено 40 473 ₽ из 45 000 ₽, ещё 8 000 ₽ ждут покупок из плана.'));
    assert.ok(page.includes('action="/purchases/1/done"') && page.includes('>Куплено</button>'));
    assert.ok(page.includes('>Не куплено</button>'), 'a bought purchase can be taken back');
    assert.ok(page.includes('регулярная, вне бюджета · 7 октября') && page.includes('href="/regular?edit=7"'));
    assert.ok(page.includes('&lt;b&gt;Пятёрочка&lt;/b&gt;') && !page.includes('<b>Пятёрочка</b>'));
    assert.ok(!page.includes('Дарья Ч.'), 'last week’s spending is not this week’s');
    assert.ok(page.includes('action="/sync"'));
    assert.ok(page.includes('href="/?view=month"'));
  });

  it('advises when to buy a wish and offers to plan it', () => {
    assert.ok(render().includes('На следующей неделе или сейчас из дополнительных'));

    const page = render({}, saved([['transfer', 'outside']]));
    assert.ok(page.includes('Можно потратить ещё 36 527 ₽.'));
    assert.ok(page.includes('Можно на этой неделе, останется 32 027 ₽'));
    assert.ok(page.includes('action="/wishes/1/plan"'));
  });

  it('opens spending to move it out of the week, and opens purchases for editing', () => {
    const spending = render({ edit: 'spending-transfer' });
    assert.ok(spending.includes('action="/spending/transfer/extra"'));
    assert.ok(spending.includes('action="/spending/transfer/outside"'));
    assert.ok(!spending.includes('action="/spending/transfer/week"'));

    const purchase = render({ edit: 'purchase-1' });
    assert.ok(purchase.includes('action="/purchases/1"') && purchase.includes('value="8000"'));
    assert.ok(purchase.includes('formaction="/purchases/1/move"') && purchase.includes('В дополнительные'));
    assert.ok(purchase.includes('formaction="/purchases/1/delete"'));
  });

  it('keeps a payment of a regular expense outside the week, naming the expense, with no way back into the week', () => {
    const page = render({ edit: 'spending-transfer' }, { ...saved(), categorizations: new Map([['transfer', { regular: 7 }]]) });

    assert.ok(page.includes('Можно потратить ещё 36 527 ₽.'));
    assert.ok(page.includes('5 октября, Основной · Школа, ЛДК · вне бюджета'));
    assert.ok(page.includes('action="/spending/transfer/extra"'));
    assert.ok(!page.includes('action="/spending/transfer/week"') && !page.includes('action="/spending/transfer/outside"'));
  });

  it('shows the month as weeks, with extras and a form to plan one', () => {
    const page = render({ view: 'month' }, saved([['last-week', 'extra']]));

    assert.ok(page.includes('В октябре на дополнительные осталось 50 000 ₽ из 100 000 ₽.'));
    assert.ok(page.includes('Неделя 28 сентября – 4 октября') && page.includes('href="/?week=2026-09-28"'));
    assert.ok(page.includes('Неделя 26 октября – 1 ноября'));
    assert.ok(page.includes('Куртка') && page.includes('Дарья Ч.'));
    assert.ok(page.includes('name="envelope" value="extra"'));
  });

  it('opens an earlier week and ignores a week that is not a past Monday', () => {
    assert.ok(render({ week: '2026-09-28' }).includes('За эту неделю потрачено 30 000 ₽ из 45 000 ₽, осталось 15 000 ₽.'));
    assert.ok(render({ week: '2026-10-12' }).includes('Неделя 5–11 октября'));
    assert.ok(render({ week: '2026-10-07' }).includes('Неделя 5–11 октября'));
  });
});

describe('submitDashboard', () => {
  const context = (settings: Settings) => ({ today, budget: () => budgetOf(data(), { ...saved(), purchases: settings.purchases(), wishes: settings.wishes() }, { today }) });
  const form = (fields: Record<string, string>) => new URLSearchParams(fields);

  it('adds purchases to a week, marks them bought, moves them to extras and deletes them', () => {
    using settings = new Settings(':memory:');
    const submit = (path: string, fields: Record<string, string> = {}) => submitDashboard(settings, path, form(fields), context(settings));

    assert.deepEqual(submit('/purchases', { title: 'Ласты', amount: '5 000', week: '2026-10-05', envelope: 'week' }), { status: 'saved' });
    const [flippers] = settings.purchases();
    assert.deepEqual(flippers && { ...flippers, id: 0 }, { id: 0, title: 'Ласты', amount: 5_000, week: '2026-10-05', envelope: 'week', done: false });

    submit(`/purchases/${flippers!.id}/done`);
    assert.equal(settings.purchases()[0]!.done, true);
    submit(`/purchases/${flippers!.id}/move`, { title: 'Ласты и шапочка', amount: '5500' });
    assert.deepEqual(settings.purchases().map((p) => [p.title, p.amount, p.envelope]), [['Ласты и шапочка', 5_500, 'extra']]);
    submit(`/purchases/${flippers!.id}/delete`);
    assert.deepEqual(settings.purchases(), []);
    assert.deepEqual(submit(`/purchases/${flippers!.id}/done`), { status: 'missing' });
  });

  it('returns the form with errors and puts a purchase without a valid week into the current one', () => {
    using settings = new Settings(':memory:');

    const result = submitDashboard(settings, '/purchases', form({ title: '', amount: 'дорого', envelope: 'extra' }), context(settings));
    assert.equal(result.status, 'invalid');
    assert.deepEqual(result.status === 'invalid' && result.form.errors, { title: 'Укажите название', amount: 'Сумма в рублях, например 13 000' });
    assert.equal(result.status === 'invalid' && result.form.envelope, 'extra');

    submitDashboard(settings, '/purchases', form({ title: 'Проезд', amount: '1000', week: '2026-10-07' }), context(settings));
    assert.equal(settings.purchases()[0]!.week, '2026-10-05');
  });

  it('plans a wish into the advised week and marks spending', () => {
    using settings = new Settings(':memory:');
    settings.addPurchase({ title: 'Ботинки', amount: 8_000, week: '2026-10-05', envelope: 'week', done: false });
    const styler = settings.addWish({ title: 'Укладка', amount: 4_500 });

    submitDashboard(settings, `/wishes/${styler.id}/plan`, form({}), context(settings));
    assert.deepEqual(settings.wishes(), []);
    assert.deepEqual(settings.purchases().map((p) => [p.title, p.week, p.envelope]), [
      ['Ботинки', '2026-10-05', 'week'],
      ['Укладка', '2026-10-12', 'week'],
    ]);

    submitDashboard(settings, '/spending/transfer/outside', form({}), context(settings));
    assert.deepEqual([...settings.spendingMarks()], [['transfer', 'outside']]);
    assert.deepEqual(submitDashboard(settings, '/spending/transfer/nowhere', form({}), context(settings)), { status: 'missing' });
  });
});

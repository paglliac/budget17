import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NO_SETUP } from '../src/categories.ts';
import { Settings } from '../src/settings.ts';
import type { Envelope } from '../src/week.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import { budgetOf, loadDashboard, renderDashboard, submitDashboard, type SavedBudget } from '../src/web/pages/dashboard.ts';
import { account, regular, RUB, tag, transaction, user } from './fixtures.ts';

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
    purchasePayments: new Map(),
    categories: NO_SETUP,
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
    assert.ok(page.includes('action="/purchases/1/done"><button class="entry-icon-action" type="submit" title="Завершить: остаток вернётся"'));
    assert.ok(page.includes('<b>Подарок</b><small>завершено, вернулось 5 000 ₽ · обычные</small>'), 'a finished one gives its amount back');
    assert.ok(!page.includes('Куплено'));
    assert.ok(page.includes('регулярная, вне бюджета · 7 октября') && page.includes('href="/regular?edit=7"'));
    assert.ok(page.includes('&lt;b&gt;Пятёрочка&lt;/b&gt;') && !page.includes('<b>Пятёрочка</b>'));
    assert.ok(!page.includes('Дарья Ч.'), 'last week’s spending is not this week’s');
    assert.ok(page.includes('action="/sync"'));
    assert.ok(page.includes('href="/?view=month"'));
  });

  it('leaves out spending not counted at all, from the list and the figures', () => {
    const page = render({}, saved([['transfer', 'ignored']]));

    assert.ok(!page.includes('Александр А.'));
    assert.ok(page.includes('Можно потратить ещё 36 527 ₽.'));
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
    assert.ok(purchase.includes('formaction="/purchases/1/done">Завершить</button>'), 'for touch screens, where the row has no icon');
  });

  it('keeps a payment of a regular expense outside the week, naming the expense, with no way back into the week', () => {
    const page = render({ edit: 'spending-transfer' }, { ...saved(), categorizations: new Map([['transfer', { regular: 7 }]]) });

    assert.ok(page.includes('Можно потратить ещё 36 527 ₽.'));
    assert.ok(page.includes('5 октября, Основной · регулярная «Школа, ЛДК» · вне бюджета'));
    assert.ok(page.includes('action="/spending/transfer/extra"'));
    assert.ok(!page.includes('action="/spending/transfer/week"') && !page.includes('action="/spending/transfer/outside"'));
    assert.ok(page.includes('action="/spending/transfer/unlink"'));
  });

  it('opens spending to mark it: what it paid, likeliest first, its category, most popular first, and where it counts', () => {
    const groceries = tag({ id: 'groceries', title: 'Продукты' });
    const cafe = tag({ id: 'cafe', title: 'Кафе' });
    const collections = {
      ...data(),
      tag: [cafe, groceries],
      transaction: [
        ...data().transaction!,
        transaction({ id: 'shop', date: '2026-09-20', outcome: 300, payee: 'Лента', tag: [groceries.id] }),
        transaction({ id: 'shop-2', date: '2026-09-21', outcome: 300, payee: 'Лента', tag: [groceries.id] }),
        transaction({ id: 'coffee', date: '2026-09-22', outcome: 300, payee: 'Кофейня', tag: [cafe.id] }),
      ],
    };
    const budget = { ...saved(), purchases: [...saved().purchases, { id: 4, title: 'Продукты на неделю', amount: 3_000, week: '2026-10-05', envelope: 'week' as const, done: false }] };
    const page = String(renderDashboard(loadDashboard(collections, budget, { ...options, edit: 'spending-groceries' }), createHref())).replaceAll('\u00a0', ' ');
    const choices = (label: string) => [...(new RegExp(`aria-label="${label}">(.*?)</div>`, 's').exec(page)?.[1] ?? '').matchAll(/<span>([^<]*)/g)].map((m) => m[1]!.trim());

    assert.deepEqual(choices('Оплата'), ['Продукты на неделю', 'Ботинки Савве', 'Куртка', 'Школа, ЛДК'], 'the closest amount left first; bought ones are left out');
    assert.ok(page.includes('action="/spending/groceries/purchase-4"') && page.includes('план недели · 3 000 ₽'));
    assert.deepEqual(choices('Категория'), ['Продукты', 'Кафе']);
    assert.ok(page.includes('action="/spending/groceries/tag-groceries"'));
    assert.deepEqual(choices('Бюджет'), ['Неделя', 'Дополнительные', 'Вне бюджета', 'Не учитывать']);
    assert.ok(page.includes('class="choice current" aria-current="true"><svg') && page.includes('Неделя</span></span>'));
    assert.ok(page.includes('id="spending-groceries"'), 'the open expense keeps its place on the screen');
    assert.ok(page.includes('<dt>Когда</dt><dd>5 октября</dd>') && page.includes('<dt>Сумма</dt><dd>473,00 ₽</dd>'), 'no time when ZenMoney has none for that day');
  });

  it('takes what linked expenses paid out of the plan, buys a purchase they cover, and counts them where it is', () => {
    const linked = (payments: Array<[string, number]>) => ({ ...saved(), purchasePayments: new Map(payments) });
    const purchaseOf = (page: string, title: string) => new RegExp(`<b>${title}</b><small>([^<]*)</small>`).exec(page)?.[1];

    const partly = render({}, linked([['groceries', 1]]));
    assert.equal(purchaseOf(partly, 'Ботинки Савве'), 'оплачено 473 ₽ из 8 000 ₽ · обычные');
    assert.ok(partly.includes('ещё 7 527 ₽ ждут покупок из плана'));
    assert.ok(partly.includes('5 октября, Основной · покупка «Ботинки Савве» · в неделе'));

    const paid = render({}, linked([['transfer', 1]]));
    assert.equal(purchaseOf(paid, 'Ботинки Савве'), 'куплено 5 октября, на 32 000 ₽ больше плана · обычные');
    assert.ok(!paid.includes('action="/purchases/1/done"'), 'nothing to finish once paid in full');

    const finished = linked([['groceries', 1]]);
    finished.purchases = finished.purchases.map((p) => (p.id === 1 ? { ...p, done: true } : p));
    const page = render({}, finished);
    assert.equal(purchaseOf(page, 'Ботинки Савве'), 'завершено, вернулось 7 527 ₽ · обычные');
    assert.ok(page.includes('473 ₽</b>'), 'it shows what it cost');
    assert.ok(page.includes('Можно потратить ещё 4 527 ₽. Потрачено 40 473 ₽ из 45 000 ₽.'), 'the rest is back in the week');
    assert.ok(render({ edit: 'purchase-1' }, finished).includes('formaction="/purchases/1/done">Вернуть в план</button>'));

    const extra = render({ view: 'month' }, linked([['transfer', 3]]));
    assert.ok(extra.includes('В октябре на дополнительные осталось 60 000 ₽ из 100 000 ₽.'), 'the payment counts in extras, the jacket is bought');
  });

  it('marks a regular payment of the week paid once linked expenses cover it, and says how much when they do not', () => {
    const linked = (ids: string[]) => ({ ...saved(), categorizations: new Map(ids.map((id) => [id, { regular: 7 }] as const)) });
    const school = (page: string) => /<b>Школа, ЛДК<\/b><small>([^<]*)<\/small>/.exec(page)?.[1];

    assert.equal(school(render({}, linked(['groceries']))), 'оплачено 473 ₽ из 45 000 ₽ · 7 октября');
    assert.equal(school(render({}, linked(['groceries', 'transfer', 'last-week']))), 'оплачено 5 октября · вне бюджета', 'the latest of them');
    assert.equal(school(render()), 'регулярная, вне бюджета · 7 октября');
  });

  it('shows the month as weeks, with extras and a form to plan one', () => {
    const page = render({ view: 'month' }, saved([['last-week', 'extra']]));

    assert.ok(page.includes('В октябре на дополнительные осталось 50 000 ₽ из 100 000 ₽.'));
    assert.ok(page.includes('Неделя 28 сентября – 4 октября') && page.includes('href="/?week=2026-09-28"'));
    assert.ok(page.includes('Неделя 26 октября – 1 ноября'));
    assert.ok(page.includes('Куртка') && page.includes('Дарья Ч.'));
    assert.ok(page.includes('name="envelope" value="extra"'));
  });

  it('steps through weeks and months, a year ahead at most', () => {
    const week = render();
    assert.ok(week.includes('href="/?week=2026-09-28">← Раньше</a>') && week.includes('href="/?week=2026-10-12">Позже →</a>'));
    assert.ok(week.includes('href="/" aria-current="page">Эта неделя</a>'));
    assert.ok(!render({ week: '2027-10-04' }).includes('Позже →'), 'no step beyond a year');

    const month = render({ view: 'month' });
    assert.ok(month.includes('href="/?view=month&amp;month=2026-09">← Сентябрь</a>'));
    assert.ok(month.includes('href="/?view=month&amp;month=2026-11">Ноябрь →</a>'));
    assert.ok(month.includes('href="/?week=2026-10-26"'), 'a week ahead opens from the month');
  });

  it('shows a month ahead with what is planned in its weeks and extras', () => {
    const budget = {
      ...saved(),
      purchases: [
        { id: 4, title: 'Стрижка', amount: 3_500, week: '2026-11-16', envelope: 'week' as const, done: false },
        { id: 5, title: 'Пальто', amount: 15_000, week: '2026-11-02', envelope: 'extra' as const, done: false },
      ],
    };
    const page = render({ view: 'month', month: '2026-11' }, budget);

    assert.ok(page.includes('В ноябре на дополнительные осталось 85 000 ₽ из 100 000 ₽. По неделям запланировано 3 500 ₽ из 180 000 ₽.'));
    assert.ok(page.includes('впереди · в плане 3 500 ₽ · свободно') && page.includes('Пальто'));
    assert.ok(page.includes('name="week" value="2026-11-02"'), 'new extras go into the first week of the month');
    assert.ok(page.includes('href="/?view=month&amp;month=2026-11&amp;edit=purchase-5"'), 'an entry opens in the month it is in');
    assert.ok(render({ view: 'month', month: '2028-01' }).includes('В октябре'), 'a month more than a year ahead falls back to this one');
  });

  it('opens an earlier week and ignores a week that is not a Monday or is more than a year ahead', () => {
    assert.ok(render({ week: '2026-09-28' }).includes('За эту неделю потрачено 30 000 ₽ из 45 000 ₽, осталось 15 000 ₽.'));
    assert.ok(render({ week: '2026-10-07' }).includes('Неделя 5–11 октября'));
    assert.ok(render({ week: '2027-10-11' }).includes('Неделя 5–11 октября'));
  });

  it('opens a week ahead with what is planned in it, which cannot be bought yet, and its regular payments', () => {
    const budget = { ...saved(), purchases: [{ id: 4, title: 'Стрижка', amount: 3_500, week: '2026-11-02', envelope: 'week' as const, done: false }] };
    const page = render({ week: '2026-11-02' }, budget);

    assert.ok(page.includes('Неделя 2–8 ноября'));
    assert.ok(page.includes('Неделя впереди: в плане 3 500 ₽, свободно 41 500 ₽ из 45 000 ₽.'));
    assert.ok(page.includes('Будет свободно') && !page.includes('Завершить'), 'nothing paid it yet');
    assert.ok(page.includes('регулярная, вне бюджета · 7 ноября'));
    assert.ok(page.includes('name="week" value="2026-11-02"'), 'a new purchase goes into the week shown');
    assert.ok(render({ week: '2026-11-09' }, budget).includes('Неделя впереди, в плане пока ничего: свободны все 45 000 ₽.'));
  });

  it('opens a purchase with the week it is planned for, to move it to another', () => {
    const page = render({ edit: 'purchase-1' });

    assert.ok(page.includes('name="week"'));
    assert.ok(page.includes('<option value="2026-10-05" selected>Эта неделя</option>'));
    assert.ok(page.includes('<option value="2026-10-12">Следующая неделя</option>'));
    assert.ok(page.includes('<optgroup label="Ноябрь">'));
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

  it('plans a purchase into a week ahead and moves it to another week', () => {
    using settings = new Settings(':memory:');
    const submit = (path: string, fields: Record<string, string> = {}) => submitDashboard(settings, path, form(fields), context(settings));

    submit('/purchases', { title: 'Стрижка', amount: '3500', week: '2026-10-19', envelope: 'week' });
    const [haircut] = settings.purchases();
    assert.equal(haircut!.week, '2026-10-19');

    submit(`/purchases/${haircut!.id}`, { title: 'Стрижка', amount: '3500', week: '2026-11-16' });
    assert.equal(settings.purchases()[0]!.week, '2026-11-16');
    submit(`/purchases/${haircut!.id}`, { title: 'Стрижка', amount: '4000' });
    assert.deepEqual(settings.purchases().map((p) => [p.amount, p.week]), [[4_000, '2026-11-16']], 'a form without the week keeps it');
  });

  it('plans a wish into the advised week', () => {
    using settings = new Settings(':memory:');
    settings.addPurchase({ title: 'Ботинки', amount: 8_000, week: '2026-10-05', envelope: 'week', done: false });
    const styler = settings.addWish({ title: 'Укладка', amount: 4_500 });

    submitDashboard(settings, `/wishes/${styler.id}/plan`, form({}), context(settings));
    assert.deepEqual(settings.wishes(), []);
    assert.deepEqual(settings.purchases().map((p) => [p.title, p.week, p.envelope]), [
      ['Ботинки', '2026-10-05', 'week'],
      ['Укладка', '2026-10-12', 'week'],
    ]);

  });
});

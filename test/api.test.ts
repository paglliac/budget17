import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NO_SETUP } from '../src/categories.ts';
import type { Envelope } from '../src/week.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import {
  budgetSettingsScreen,
  categoriesScreen,
  colorOf,
  incomeScreen,
  monthScreen,
  operationsScreen,
  regularScreen,
  shopsScreen,
  spendingScreen,
  uncategorizedScreen,
  weekLevel,
  weekScreen,
  widgetScreen,
  wishScreen,
  wishesScreen,
  withRubleSign,
} from '../src/web/api.ts';
import { Settings } from '../src/settings.ts';
import type { SavedBudget } from '../src/web/pages/dashboard.ts';
import { submitMarking } from '../src/web/pages/marking.ts';
import { submitWishPlan } from '../src/web/pages/wishes.ts';
import { account, regular, RUB, tag, transaction, user } from './fixtures.ts';

const today = '2026-10-06';
const groceries = tag({ id: 'groceries', title: 'Продукты', color: 0xff3fa46a });

function data(): EntityCollections {
  return {
    instrument: [RUB],
    user: [user({ login: 'kir' })],
    account: [account({ id: 'card', title: 'Основной' })],
    tag: [groceries],
    transaction: [
      transaction({ id: 'pyaterochka', date: '2026-10-05', outcome: 473, payee: 'Пятёрочка', tag: ['groceries'] }),
      transaction({ id: 'transfer', date: '2026-10-05', outcome: 40_000, payee: 'Александр А.' }),
      transaction({ id: 'salary', date: '2026-10-05', income: 150_000, payee: 'ООО Работа' }),
      transaction({ id: 'last-week', date: '2026-10-01', outcome: 30_000, payee: 'Дарья Ч.' }),
    ],
  };
}

function saved(marks: Array<[string, Envelope]> = []): SavedBudget {
  return {
    purchases: [
      { id: 1, title: 'Ботинки Савве', amount: 8_000, week: '2026-10-05', envelope: 'week', kind: 'required', done: false },
      { id: 2, title: 'Подарок', amount: 5_000, week: '2026-10-05', envelope: 'week', kind: 'flexible', done: true },
      { id: 3, title: 'Куртка', amount: 20_000, week: '2026-10-05', envelope: 'extra', kind: 'flexible', done: false },
      { id: 4, title: 'Стрижка', amount: 1_500, week: '2026-10-19', envelope: 'week', kind: 'flexible', done: false },
    ],
    wishes: [{ id: 1, title: 'Укладка для волос', amount: 4_500, due: null }],
    marks: new Map(marks),
    descriptions: new Map(),
    regular: [regular({ id: 7, title: 'Школа, ЛДК', amount: 45_000, day: 7 })],
    categorizations: new Map(),
    purchasePayments: new Map(),
    categories: NO_SETUP,
    weekStart: 0,
    weekLimits: new Map(),
  };
}

const budget = { today, source: 'zenmoney' as const, canSync: true };
/** Text with non-breaking spaces as plain ones, so the expected phrases read naturally. */
const plain = (value: unknown) => JSON.parse(JSON.stringify(value).replaceAll(' ', ' '));

describe('api', () => {
  it('names tones by name and keeps a category’s own colour', () => {
    assert.equal(colorOf('var(--violet)'), 'violet');
    assert.equal(colorOf('#3fa46a'), '#3fa46a');
  });

  it('gives the week as the page shows it: what is left, the spending by days, the plan and the wishes', () => {
    const week = plain(weekScreen(data(), saved(), budget));

    assert.equal(week.phase, 'current');
    assert.equal(week.title, 'Неделя 5–11 октября');
    assert.deepEqual([week.prev, week.next], ['2026-09-28', '2026-10-12']);
    assert.equal(week.sentence, undefined, 'the figures speak for themselves');
    assert.deepEqual(week.total, {
      label: 'Можно потратить',
      amount: -3_473,
      note: 'из 45 000 ₽ на неделю',
      parts: [
        { label: 'Потрачено', value: 40_473, tone: 'yellow' },
        { label: 'План', value: 8_000, tone: 'violet' },
        { label: 'Свободно', value: -3_473, tone: 'gray' },
      ],
    });

    assert.deepEqual(week.days.map((d: { title: string; subtitle: string }) => [d.title, d.subtitle]), [['Вчера', '5 октября, понедельник']]);
    const [shop] = week.days[0].items;
    assert.deepEqual(shop, {
      id: 'spending-pyaterochka',
      title: 'Пятёрочка',
      details: 'Продукты',
      icon: 'cart',
      color: '#3fa46a',
      photo: null,
      logo: null,
      amount: 473,
      mark: 'week',
      muted: false,
      spending: 'pyaterochka',
      optional: false,
    });

    const [boots, gift, jacket, school] = week.plan;
    assert.equal(boots.details, 'Обязательная', 'waiting to be bought goes without saying');
    assert.equal(boots.purchase.kind, 'required');
    assert.equal(boots.finishable, true);
    assert.deepEqual(boots.actions, [
      { action: 'move', label: 'В дополнительные' },
      { action: 'done', label: 'Завершить' },
    ]);
    assert.equal(boots.purchase.weekLabel, '5–11 октября');
    assert.deepEqual([gift.details, gift.muted, gift.finishable], ['завершено, вернулось 5 000 ₽', true, false]);
    assert.deepEqual(gift.actions, [
      { action: 'move', label: 'В дополнительные' },
      { action: 'done', label: 'Вернуть в план' },
    ]);
    assert.deepEqual([jacket.title, jacket.mark, jacket.color], ['Куртка', 'extra', 'violet'], 'a purchase from the extras is in its week’s plan too');
    assert.deepEqual([school.title, school.details, school.mark, school.regular], ['Школа, ЛДК', 'регулярная · 7 октября', 'outside', 7]);

    assert.equal(week.wishes[0].details, 'На следующей неделе или сейчас из дополнительных');
    assert.equal(week.wishes[0].plannable, true);
    assert.equal(week.weekChoices[0].options[0].label, 'Эта неделя');
  });

  it('has no wishes but in the current week, and a week ahead knows it is ahead', () => {
    assert.equal(weekScreen(data(), saved(), { ...budget, week: '2026-09-28' }).wishes, null);
    const ahead = plain(weekScreen(data(), saved(), { ...budget, week: '2026-10-19' }));
    assert.equal(ahead.phase, 'ahead');
    assert.equal(ahead.total.label, 'Будет свободно');
    assert.deepEqual(ahead.plan.map((p: { title: string; details: string; finishable: boolean }) => [p.title, p.details, p.finishable]), [['Стрижка', 'Гибкая', false]]);
    assert.equal(ahead.home.free.label, 'Будет свободно');
    assert.equal(ahead.home.spent, null, 'nothing is spent in a week ahead');
  });

  it('tells on top what is free, what the plan holds by kind, what was spent today and what waits to be sorted', () => {
    const paid = { ...saved(), purchasePayments: new Map([['pyaterochka', 1]]) };
    const week = plain(weekScreen(data(), paid, { ...budget, today: '2026-10-05', syncedAt: '2026-10-05T11:42:00.000Z' }));

    assert.deepEqual(week.home, {
      free: { label: 'Свободно', amount: -3_000, state: 'over', share: 0.067 },
      reserved: {
        label: 'Зарезервировано',
        amount: 7_527,
        required: { label: 'обязательное', amount: 7_527 },
        flexible: { label: 'гибкое', amount: 0 },
      },
      spent: { label: 'Сегодня потрачено', amount: 40_473 },
      pending: { count: 2, label: 'траты ждут разбора', title: 'Разобрать операции', note: '2 новые' },
      extras: { label: 'Доп. бюджет', amount: 80_000, over: false, note: 'из 100 000 ₽', month: null },
      syncedAt: '2026-10-05T11:42:00.000Z',
    });
    assert.equal(week.plan[0].details, 'Обязательная · оплачено 473 ₽ из 8 000 ₽');

    const past = plain(weekScreen(data(), saved(), { ...budget, week: '2026-09-28' }));
    assert.deepEqual([past.home.free.label, past.home.spent], ['Итог недели', { label: 'Потрачено за неделю', amount: 30_000 }]);
  });

  it('gives the main page the extras of the shown week’s month, for when nothing waits to be sorted', () => {
    const sorted = { ...saved(), categorizations: new Map([['transfer', { tag: 'groceries' }], ['last-week', { tag: 'groceries' }]]) };
    const week = plain(weekScreen(data(), sorted, budget));
    assert.deepEqual(week.home.pending, { count: 0, label: 'Всё разобрано', title: 'Разобрать операции', note: '0 новых' });
    assert.deepEqual(week.home.extras, { label: 'Доп. бюджет', amount: 80_000, over: false, note: 'из 100 000 ₽', month: null }, 'the jacket is planned from them');

    // The week of 28 September has its Thursday in October, the current month the card opens as null; the one before it is September's.
    assert.equal(plain(weekScreen(data(), sorted, { ...budget, week: '2026-09-28' })).home.extras.month, null);
    assert.deepEqual(plain(weekScreen(data(), sorted, { ...budget, week: '2026-09-21' })).home.extras, {
      label: 'Доп. бюджет',
      amount: 100_000,
      over: false,
      note: 'из 100 000 ₽',
      month: '2026-09',
    });

    // 40 000 and 30 000 moved there and 20 000 planned are 90 000; a 15 000 purchase more goes 5 000 past them.
    const over = saved([['transfer', 'extra'], ['last-week', 'extra']]);
    over.purchases.push({ id: 5, title: 'Велосипед', amount: 15_000, week: '2026-10-12', envelope: 'extra', kind: 'flexible', done: false });
    assert.deepEqual(plain(weekScreen(data(), over, budget)).home.extras, { label: 'Доп. бюджет', amount: 5_000, over: true, note: 'сверх 100 000 ₽', month: null });
  });

  it('rounds the figures on top to the hundred when asked, adding up to what the week allows', () => {
    const paid = { ...saved(), purchasePayments: new Map([['pyaterochka', 1]]), roundFigures: true };
    const week = plain(weekScreen(data(), paid, { ...budget, today: '2026-10-05' }));

    // 40 473 spent, 7 527 reserved and 3 000 over make 45 000, and so do 40 500, 7 500 and 3 000.
    assert.deepEqual(week.home.free, { label: 'Свободно', amount: -3_000, state: 'over', share: 0.067 });
    assert.deepEqual(week.home.reserved, {
      label: 'Зарезервировано',
      amount: 7_500,
      required: { label: 'обязательное', amount: 7_500 },
      flexible: { label: 'гибкое', amount: 0 },
    });
    assert.deepEqual(week.home.spent, { label: 'Сегодня потрачено', amount: 40_500 });
    assert.deepEqual([week.total.amount, week.total.parts.map((p: { value: number }) => p.value)], [-3_000, [40_500, 7_500, -3_000]]);
    assert.deepEqual(week.limit, { amount: 45_000, usual: 45_000 }, 'what the week allows is the user’s own figure');
    assert.deepEqual(week.days[0].items.map((o: { amount: number }) => o.amount), [473, 40_000], 'expenses keep their amounts');
    assert.deepEqual(week.plan, plain(weekScreen(data(), { ...paid, roundFigures: false }, { ...budget, today: '2026-10-05' })).plan, 'and so do purchases');

    const lamp = saved();
    lamp.purchases.push({ id: 5, title: 'Лампа', amount: 1_234, week: '2026-10-05', envelope: 'extra', kind: 'flexible', done: false });
    assert.equal(plain(weekScreen(data(), { ...lamp, roundFigures: true }, budget)).home.extras.amount, 78_800, '21 234 planned of the extras leave 78 766');

    const later = plain(weekScreen(data(), { ...saved(), roundFigures: true }, { ...budget, today: '2026-10-06' }));
    assert.deepEqual(later.home.spent, { label: 'Сегодня потрачено', amount: 0 });
    assert.equal(later.home.free.amount, -3_500, '45 000 − 40 473 − 8 000');
  });

  it('tells how full the week is for the wave on the circle', () => {
    assert.deepEqual(weekLevel(27_000, 45_000), { state: 'enough', share: 0.6 });
    assert.deepEqual(weekLevel(6_500, 45_000), { state: 'enough', share: 0.144 }, 'a day’s share of the week is still enough');
    assert.deepEqual(weekLevel(3_660, 45_000), { state: 'low', share: 0.081 });
    assert.deepEqual(weekLevel(0.3, 45_000), { state: 'empty', share: 0 });
    assert.deepEqual(weekLevel(-16_372, 45_000), { state: 'over', share: 0.364 });
    assert.deepEqual(weekLevel(-440_341, 45_000), { state: 'over', share: 1 }, 'the wave is full past the whole amount');
    assert.deepEqual(weekLevel(60_000, 45_000).share, 1);
  });

  it('gives the month’s weeks and its extras with where they count', () => {
    const month = plain(monthScreen(data(), saved([['last-week', 'extra']]), budget));

    assert.equal(month.title, 'Октябрь');
    assert.deepEqual(month.prev, { value: '2026-09', label: 'Сентябрь' });
    assert.equal(month.weeks[0].title, '28 сентября – 4 октября');
    assert.equal(month.weeks[0].week, '2026-09-28');
    assert.equal(month.total.label, 'Дополнительные');
    assert.deepEqual(month.purchases.map((p: { title: string; mark: string }) => [p.title, p.mark]), [['Куртка', 'extra']]);
    assert.deepEqual(month.spending.map((d: { date: string }) => d.date), ['2026-10-01']);
    assert.deepEqual(month.spending[0].items.map((o: { title: string; details: string; mark: string }) => [o.title, o.details, o.mark]), [['Дарья Ч.', 'без категории', 'extra']]);
    assert.equal(month.newPurchaseWeek, '2026-10-05');
    assert.equal(month.flow, null, 'without incomes there is no income to split');
  });

  it('splits the month’s income into the regular payments, the weeks, the extras and what is left for savings', () => {
    const rent = { id: 1, title: 'Аренда', model: 'fixed' as const, params: { amount: 500_000, day: 5 } };
    const month = plain(monthScreen(data(), { ...saved(), weekLimits: new Map([['2026-10-12', 30_000]]) }, { ...budget, incomes: [rent] }));
    assert.deepEqual(month.flow.income, { label: 'Доход', amount: 500_000, note: 'в этом месяце' });
    assert.deepEqual(
      month.flow.parts.map((p: { label: string; amount: number }) => [p.label, p.amount]),
      [
        ['Обязательные расходы', 45_000],
        ['Недельные бюджеты', 4 * 45_000 + 30_000],
        ['Доп. бюджет', 100_000],
        ['В накопления', 500_000 - 45_000 - 210_000 - 100_000],
      ],
      'five weeks belong to October, one of them with an amount of its own',
    );
    assert.equal(month.flow.parts[0].share, 45_000 / 500_000);

    const short = plain(monthScreen(data(), saved(), { ...budget, month: '2026-11', incomes: [{ ...rent, params: { amount: 200_000, day: 5 } }] }));
    assert.equal(short.flow.income.note, 'в ноябре');
    assert.deepEqual(short.flow.parts.at(-1), { label: 'Не хватает', amount: 200_000 - 45_000 - 4 * 45_000 - 100_000, share: -125_000 / 200_000 });
  });

  it('rounds the month to the hundred when asked: its income with the parts, its weeks and its extras', () => {
    const income = { id: 1, title: 'Зарплата', model: 'fixed' as const, params: { amount: 456_789, day: 5 } };
    const phone = regular({ id: 8, title: 'Связь', amount: 649.9, day: 10 });
    const round = { ...saved([['pyaterochka', 'extra']]), regular: [...saved().regular, phone], roundFigures: true };
    const month = plain(monthScreen(data(), round, { ...budget, incomes: [income] }));

    assert.deepEqual(month.flow.income, { label: 'Доход', amount: 456_800, note: 'в этом месяце' });
    assert.deepEqual(
      month.flow.parts.map((p: { label: string; amount: number }) => [p.label, p.amount]),
      [
        ['Обязательные расходы', 45_700],
        ['Недельные бюджеты', 225_000],
        ['Доп. бюджет', 100_000],
        ['В накопления', 86_100],
      ],
      '45 649,90 rounds up and 86 139,10 down, so the parts still make the income',
    );
    assert.equal(month.flow.parts[0].share, 45_700 / 456_800);
    assert.deepEqual([month.total.amount, month.total.parts.map((p: { value: number }) => p.value)], [79_500, [500, 20_000, 79_500]]);
    assert.deepEqual(month.spending[0].items.map((o: { amount: number }) => o.amount), [473]);
    assert.equal(month.total.note, 'осталось из 100 000 ₽ в октябре');

    const weeks = plain(monthScreen(data(), { ...saved(), roundFigures: true }, budget)).weeks;
    assert.deepEqual([weeks[1].details, weeks[1].amount], ['идёт · потрачено 40 500 ₽ · перерасход', 3_500]);
  });

  it('opens an expense with what is known of it and the choices to mark it', () => {
    const spending = plain(spendingScreen(data(), saved(), { today, id: 'transfer' }));

    assert.equal(spending.title, 'Александр А.');
    assert.deepEqual([spending.when, spending.account, spending.notes], ['5 октября', 'Основной', []]);
    const school = spending.payments.choices.find((c: { choice: string }) => c.choice === 'regular-7');
    assert.equal(school.icon, 'graduation', 'a payment has an icon for its card');
    assert.equal(spending.payments.otherLabel, 'Другой платёж');
    assert.deepEqual(spending.categories.choices[0], { choice: 'tag-groceries', label: 'Продукты', color: '#3fa46a', current: false, suggested: false, icon: 'cart', photo: null });
    assert.deepEqual(
      spending.envelopes.map((c: { choice: string }) => c.choice),
      ['week', 'extra', 'outside', 'ignored'],
    );
    assert.equal(spending.envelopes[0].detail, 'Учесть в текущей неделе', 'the app says what each place means');
    assert.deepEqual(spending.optional, { label: 'Необязательная', current: false });
    assert.equal(spending.hint, null, 'nothing to suggest for a transfer to a person');
    assert.deepEqual(spending.undo, []);
    assert.equal(spending.description, null);
  });

  it('names an expense by its shop with its logo, in its rows and on its sheet, which opens the shop', () => {
    const lenta = { ...data(), transaction: [transaction({ id: 'lenta', date: '2026-10-05', outcome: 736, payee: 'Lenta 089', tag: ['groceries'] })] };
    const shops = { ...saved(), shops: { looks: new Map(), icons: new Map([['lenta.com', 'v1']]) } };
    const logo = '/shop-logo/lenta?v=sv1';

    const sheet = plain(spendingScreen(lenta, shops, { today, id: 'lenta' }));
    assert.equal(sheet.title, 'Лента');
    assert.deepEqual(sheet.notes, ['в банке — Lenta 089']);
    assert.deepEqual(sheet.shop, {
      key: 'lenta',
      title: '',
      placeholder: 'Лента',
      site: '',
      sitePlaceholder: 'lenta.com',
      logo,
      photo: false,
      dressed: false,
      note: 'Для 1 операции: Lenta 089.',
      names: [{ name: 'Lenta 089', count: 1 }],
    });
    const operation = plain(operationsScreen(lenta, shops, { today })).days[0].items[0];
    assert.deepEqual([operation.title, operation.logo, operation.icon, operation.photo], ['Лента', logo, 'cart', null], 'the logo comes beside the category’s icon');
    const week = plain(weekScreen(lenta, shops, budget)).days[0].items[0];
    assert.deepEqual([week.title, week.logo], ['Лента', logo]);
    assert.equal(plain(spendingScreen(data(), saved(), { today, id: 'pyaterochka' })).shop.logo, null, 'no logo until its site’s icon is kept');

    const list = plain(shopsScreen(lenta, shops, { today, query: null }));
    assert.equal(list.recent, 1);
    assert.deepEqual(list.items, [
      {
        id: 'shop-lenta',
        title: 'Лента',
        details: 'Lenta 089',
        icon: 'bag',
        color: '#ffffff',
        photo: null,
        logo,
        amount: null,
        mark: null,
        muted: false,
        shop: sheet.shop,
      },
    ]);
    assert.deepEqual(plain(shopsScreen(lenta, shops, { today, query: 'пятёрочка' })).items, [], 'a search finds only what it asks for');
  });

  it('shows what the user wrote about an expense on its sheet and under its rows', () => {
    const described = { ...data(), transaction: data().transaction!.map((t) => (t.id === 'pyaterochka' ? { ...t, comment: 'Оплата товаров' } : t)) };
    const descriptions = { ...saved(), descriptions: new Map([['pyaterochka', 'Торт на день рождения']]) };

    assert.equal(spendingScreen(described, descriptions, { today, id: 'pyaterochka' })?.description, 'Торт на день рождения');
    const operation = plain(operationsScreen(described, descriptions, { today })).days[0].items.find((o: { id: string }) => o.id === 'pyaterochka');
    assert.equal(operation.comment, 'Торт на день рождения · Оплата товаров', 'the description goes before the bank’s comment');
    const week = plain(weekScreen(described, descriptions, budget)).days.flatMap((d: { items: unknown[] }) => d.items);
    assert.equal(week.find((o: { spending: string }) => o.spending === 'pyaterochka').details, 'Продукты · Торт на день рождения');
  });

  it('tells the expenses that could have been done without, beside their chips, and gives them a view of their own and what they cost', () => {
    const optional = { ...saved([['transfer', 'extra']]), optionalSpending: new Set(['pyaterochka', 'transfer']) };
    const operations = plain(operationsScreen(data(), optional, { today }));

    assert.deepEqual(operations.kinds.at(-1), { value: 'optional', label: 'Необязательные', count: 2 });
    assert.equal(operations.totals.optional, 40_473);
    const [monday] = operations.days;
    const shop = monday.items.find((o: { id: string }) => o.id === 'pyaterochka');
    assert.deepEqual([shop.optional, shop.chip], [true, null], 'an ordinary expense of the week still has no chip');
    assert.deepEqual(monday.items.find((o: { id: string }) => o.id === 'transfer').chip, { label: 'Ждёт разбора', tone: 'red' }, 'the chip stays what it was');
    assert.equal(monday.items.find((o: { id: string }) => o.id === 'salary').optional, false);

    const view = plain(operationsScreen(data(), optional, { today, kind: 'optional' }));
    assert.equal(view.kind, 'optional');
    assert.deepEqual(view.days.flatMap((d: { items: Array<{ id: string }> }) => d.items.map((o) => o.id)), ['pyaterochka', 'transfer']);
    assert.deepEqual(view.totals, { expense: 40_473, income: 0, optional: 40_473, count: 2 });
    assert.equal(view.categoriesTitle, 'Необязательные по категориям');

    const week = plain(weekScreen(data(), optional, budget)).days.flatMap((d: { items: unknown[] }) => d.items);
    assert.equal(week.find((o: { spending: string }) => o.spending === 'pyaterochka').optional, true);
    assert.deepEqual(spendingScreen(data(), optional, { today, id: 'pyaterochka' })?.optional, { label: 'Необязательная', current: true });
  });

  it('opens an expense that does not count, and nothing that is neither an expense nor an income', () => {
    const ignored = spendingScreen(data(), saved([['transfer', 'ignored']]), { today, id: 'transfer' });
    assert.equal(ignored?.envelopes.find((c) => c.current)?.choice, 'ignored');
    assert.equal(ignored?.kind, 'expense');
    assert.equal(ignored?.optional, null, 'nothing could be saved on what is not counted');
    const moved = { ...data(), transaction: [transaction({ id: 'cash', date: '2026-10-05', income: 1_000, outcome: 1_000, incomeAccount: 'cash' })] };
    assert.equal(spendingScreen(moved, saved(), { today, id: 'cash' }), null, 'a transfer');
    assert.equal(spendingScreen(data(), saved(), { today, id: 'nope' }), null);
  });

  it('opens an income with its categories and whether it counts, and nothing to pay', () => {
    const salary = tag({ id: 'salary-tag', title: 'Salary', showIncome: true, showOutcome: false });
    const incomes = { ...data(), tag: [groceries, salary] };
    const setup = { changes: new Map(), own: [{ id: 'own-1', title: 'Кэшбэк', hidden: false, kind: 'income' as const }] };
    const income = plain(spendingScreen(incomes, { ...saved(), categories: setup }, { today, id: 'salary' }));

    assert.equal(income.kind, 'income');
    assert.equal(income.title, 'ООО Работа');
    assert.equal(income.optional, null);
    assert.deepEqual(income.payments.choices, []);
    assert.deepEqual(income.payments.others, []);
    assert.deepEqual(
      income.categories.choices.map((c: { label: string }) => c.label),
      ['Salary', 'Кэшбэк'],
      'income categories only, not the spending ones',
    );
    assert.deepEqual(
      income.envelopes.map((c: { choice: string; label: string; current: boolean }) => [c.choice, c.label, c.current]),
      [
        ['counted', 'В доходах', true],
        ['ignored', 'Не учитывать', false],
      ],
    );
    assert.equal(income.envelopes[1].detail, 'Например, вернули долг или командировочные');

    const ignored = spendingScreen(incomes, saved([['salary', 'ignored']]), { today, id: 'salary' });
    assert.equal(ignored?.envelopes.find((c) => c.current)?.choice, 'ignored');
  });

  it('gives operations by day with their net, kinds with counts and spending by category', () => {
    const operations = plain(operationsScreen(data(), saved(), { today }));

    assert.equal(operations.title, 'Операции за октябрь');
    assert.deepEqual(operations.kinds, [
      { value: null, label: 'Все', count: 4 },
      { value: 'expense', label: 'Расходы', count: 3 },
      { value: 'income', label: 'Доходы', count: 1 },
    ]);
    const [monday] = operations.days;
    assert.equal(monday.net, 150_000 - 473 - 40_000);
    const salary = monday.items.find((o: { id: string }) => o.id === 'salary');
    assert.deepEqual([salary.kind, salary.spending, salary.color, salary.details], ['income', 'salary', 'green', 'Доход'], 'no account money came to');
    assert.equal(monday.items.find((o: { id: string }) => o.id === 'transfer').spending, 'transfer');
    assert.deepEqual(monday.items.find((o: { id: string }) => o.id === 'transfer').chip, { label: 'Ждёт разбора', tone: 'red' });
    assert.equal(monday.items.find((o: { id: string }) => o.id === 'pyaterochka').chip, null, 'an ordinary expense of the week has no chip');
    assert.equal(salary.chip, null);
    assert.equal(operations.pending, 2, 'the transfer and last week’s expense wait for a category');
    const moved = plain(operationsScreen(data(), saved([['pyaterochka', 'extra']]), { today })).days[0].items;
    assert.deepEqual(moved.find((o: { id: string }) => o.id === 'pyaterochka').chip, { label: 'Дополнительные', tone: 'violet' });
    assert.deepEqual(operations.categories[0], { id: 'none', title: 'Без категории', icon: 'tag', color: 'gray', photo: null, amount: 70_000, share: 70_000 / 70_473 });

    const filtered = plain(operationsScreen(data(), saved(), { today, kind: 'income', query: 'работа' }));
    assert.equal(filtered.kind, 'income');
    assert.equal(filtered.query, 'работа');
    assert.equal(filtered.days.length, 1);
    assert.deepEqual(filtered.totals, { expense: 0, income: 150_000, optional: 0, count: 1 });
    assert.deepEqual(operations.totals, { expense: 70_473, income: 150_000, optional: 0, count: 4 });
    assert.equal(plain(operationsScreen(data(), saved(), { today, query: 'нет такого' })).empty, 'Ничего не нашлось. Попробуйте другой запрос или уберите фильтры.');
  });

  it('gives expenses without a category with the suggestion to accept', () => {
    const history = { ...data(), transaction: [...data().transaction!, transaction({ id: 'school', date: '2026-09-07', outcome: 45_000, payee: 'Школа' })] };
    const sorted = { ...saved(), categorizations: new Map([['school', { regular: 7 }]]) };
    const later = { ...history, transaction: [...history.transaction!, transaction({ id: 'school-oct', date: '2026-10-06', outcome: 45_000, payee: 'Школа' })] };
    const screen = plain(uncategorizedScreen(later, sorted, { today }));

    assert.deepEqual(screen.pending.map((d: { title: string }) => d.title), ['Сегодня', 'Вчера', '1 октября']);
    const school = screen.pending.flatMap((d: { items: unknown[] }) => d.items).find((p: { spending: string }) => p.spending === 'school-oct');
    assert.deepEqual(school.suggestion, { choice: 'regular-7', name: 'регулярную «Школа, ЛДК»' });
    assert.equal(school.details, 'похоже на регулярную «Школа, ЛДК»');
    assert.equal(plain(spendingScreen(later, sorted, { today, id: 'school-oct' })).hint, 'Похоже на регулярную «Школа, ЛДК»');
    assert.equal(screen.total.label, 'Без категории в октябре');
    assert.match(screen.total.note, /^3 траты из 4$/);
  });

  it('gives regular expenses in the order of the month with what is left to pay', () => {
    const settings = { ...saved(), regular: [regular({ id: 1, title: 'Связь', amount: 700, day: 2 }), regular({ id: 7, title: 'Школа, ЛДК', amount: 45_000, day: 7 })] };
    const screen = plain(regularScreen(data(), settings, { today }));

    assert.deepEqual(screen.behind.map((r: { title: string }) => r.title), ['Связь']);
    assert.deepEqual(screen.ahead.map((r: { title: string; details: string }) => [r.title, r.details]), [['Школа, ЛДК', '7-го числа · завтра']]);
    assert.equal(screen.today, 'Сегодня, 6 октября');
    assert.equal(screen.total.label, 'Осталось заплатить в октябре');
    assert.equal(screen.total.amount, 45_000);
    assert.equal(screen.ahead[0].values.day, '7');
    assert.ok(screen.icons.some((i: { icon: string }) => i.icon === 'home'));
  });

  it('gives incomes with the next payments and the models a new one can follow', () => {
    const incomes = [{ id: 1, title: 'Зарплата', model: 'salary' as const, params: { salary: 200_000, advanceDay: 20, payDay: 5 } }];
    const screen = plain(incomeScreen(data(), incomes, { today }));

    assert.equal(screen.total.amount, 200_000);
    assert.equal(screen.incomes[0].details, 'аванс 20-го, остальное 5-го · через 14 дней');
    assert.deepEqual(screen.incomes[0].values, { title: 'Зарплата', salary: '200000', advanceDay: '20', payDay: '5' });
    assert.equal(screen.upcoming[0].items[0].title, 'Аванс за октябрь');
    assert.match(screen.upcoming[0].items[0].formula, /^200 000 × \d+\/\d+ рабочих дней$/);
    assert.deepEqual(screen.models.map((m: { id: string }) => m.id), ['fixed', 'salary']);
    assert.equal(screen.models[1].defaults.title, 'Зарплата');
  });

  it('writes the ruble as ₽ in the figures and the sentences, where ZenMoney names it руб.', () => {
    const zenmoney = { ...data(), instrument: [{ ...RUB, symbol: 'руб.' }] };
    const week = plain(weekScreen(withRubleSign(zenmoney), saved(), budget));

    assert.equal(week.symbol, '₽');
    assert.equal(week.total.note, 'из 45 000 ₽ на неделю');
    assert.doesNotMatch(JSON.stringify(week), /руб\./);
    assert.equal(plain(weekScreen(zenmoney, saved(), budget)).total.note, 'из 45 000 руб. на неделю', 'the pages keep руб.');
  });

  it('gives the widgets the week with its days, today, what waits for a category and the next payment', () => {
    const widget = plain(widgetScreen(data(), saved(), { today, syncedAt: '2026-10-06T08:00:00.000Z' }));

    assert.deepEqual([widget.week.label, widget.week.free, widget.week.note], ['Неделя', -3_473, 'потрачено сверх недели']);
    assert.deepEqual(widget.week.days[0], { label: 'Пн', today: false, ahead: false, spent: true });
    assert.deepEqual(widget.week.days[1], { label: 'Вт', today: true, ahead: false, spent: false });
    assert.deepEqual(
      widget.week.days.map((d: { label: string; ahead: boolean }) => `${d.label}${d.ahead ? '…' : ''}`),
      ['Пн', 'Вт', 'Ср…', 'Чт…', 'Пт…', 'Сб…', 'Вс…'],
    );
    assert.deepEqual(widget.today, { label: 'Сегодня потрачено', amount: 0, syncedAt: '2026-10-06T08:00:00.000Z' });
    assert.deepEqual(widget.pending, {
      count: 2,
      amount: 70_000,
      sorted: 1 / 3,
      label: 'траты ждут разбора',
      title: '2 траты ждут разбора',
      note: 'на 70 000 ₽',
    });
    assert.deepEqual(widget.payment, { title: 'Школа, ЛДК', amount: 45_000, date: '7 октября', when: 'завтра' });
    assert.deepEqual(widget.extras, {
      label: 'Доп. бюджет',
      amount: 80_000,
      over: false,
      note: 'из 100 000 ₽',
      limit: 100_000,
      spent: 0,
      planned: 20_000,
    });

    const sorted = { ...saved(), categorizations: new Map([['transfer', { tag: 'groceries' }], ['last-week', { tag: 'groceries' }]]) };
    const done = plain(widgetScreen(data(), sorted, { today })).pending;
    assert.deepEqual([done.count, done.sorted, done.label, done.title, done.note], [0, 1, 'Всё разобрано', 'Все операции разобраны', 'Отличная работа!']);
  });

  it('gives the savings widget income above spending by month, against the month before', () => {
    const first = plain(widgetScreen(data(), saved(), { today })).savings;
    assert.deepEqual(first, { label: 'Накопления', period: 'в этом месяце', amount: 150_000 - 70_473, change: null, months: [{ month: '2026-10', amount: 79_527 }] });

    const withSeptember = (income: number) => ({
      ...data(),
      transaction: [
        ...data().transaction!,
        transaction({ id: 'september-salary', date: '2026-09-05', income, payee: 'ООО Работа' }),
        transaction({ id: 'september-rent', date: '2026-09-10', outcome: 20_000, payee: 'Аренда' }),
      ],
    });
    // What is not counted is left out: October without the transfer saves 119 527, September 80 000.
    const savings = plain(widgetScreen(withSeptember(100_000), saved([['transfer', 'ignored']]), { today })).savings;
    assert.equal(savings.amount, 119_527);
    assert.deepEqual(savings.months, [
      { month: '2026-09', amount: 80_000 },
      { month: '2026-10', amount: 119_527 },
    ]);
    assert.deepEqual(savings.change, { direction: 'up', label: 'на 49% больше', note: 'чем в прошлом месяце' });

    // A month that spent more than it got is compared in money.
    const after = plain(widgetScreen(withSeptember(10_000), saved(), { today })).savings;
    assert.deepEqual(after.change, { direction: 'up', label: 'на 89 527 ₽ больше', note: 'чем в прошлом месяце' });
  });

  it('gives the week from the day picked in the settings with the amount set for it', () => {
    const settings = { ...saved(), purchases: [], weekStart: 3, weekLimits: new Map([['2026-10-01', 80_000]]) };
    const week = plain(weekScreen(data(), settings, budget));

    assert.deepEqual([week.week, week.current, week.title, week.prev, week.next], ['2026-10-01', '2026-10-01', 'Неделя 1–7 октября', '2026-09-24', '2026-10-08']);
    assert.equal(week.total.note, 'из 80 000 ₽ на неделю');
    assert.deepEqual(week.limit, { amount: 80_000, usual: 45_000 });
    assert.deepEqual(plain(weekScreen(data(), saved(), budget)).limit, { amount: 45_000, usual: 45_000 });
    assert.equal(week.total.amount, 80_000 - 70_473);
    assert.equal(plain(widgetScreen(data(), settings, { today })).week.free, 80_000 - 70_473);
    assert.deepEqual(plain(monthScreen(data(), settings, budget)).weeks.map((w: { week: string }) => w.week), ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22']);
  });

  it('gives the day a week begins on, to pick from the days Monday first', () => {
    const screen = plain(budgetSettingsScreen(data(), { weekStart: 2 }));

    assert.equal(screen.weekStart, 2);
    assert.deepEqual(screen.weekdays.slice(0, 3), [
      { value: 0, label: 'Понедельник' },
      { value: 1, label: 'Вторник' },
      { value: 2, label: 'Среда' },
    ]);
    assert.equal(screen.limit, 45_000);
    assert.equal(screen.roundFigures, false);
    assert.equal(plain(budgetSettingsScreen(data(), { weekStart: 0, roundFigures: true })).roundFigures, true);
  });

  it('gives categories with the hidden ones apart, and the income ones', () => {
    const settings = {
      ...saved(),
      categories: { changes: new Map([['groceries', { title: null, hidden: true }]]), own: [{ id: 'own-1', title: 'Кэшбэк', hidden: false, kind: 'income' as const }] },
    };
    const screen = plain(categoriesScreen(data(), settings, { today }));

    assert.deepEqual(screen.shown, []);
    assert.deepEqual(screen.hidden.map((c: { category: { id: string; hidden: boolean } }) => [c.category.id, c.category.hidden]), [['groceries', true]]);
    assert.equal(screen.hidden[0].color, 'gray');
    assert.deepEqual(screen.income.shown.map((c: { id: string; details: string; category: { kind: string } }) => [c.id, c.details, c.category.kind]), [
      ['income-category-own-1', 'своя · за три месяца доходов нет', 'income'],
    ]);
    assert.deepEqual(screen.income.hidden, []);
  });

  it('gives a category what the user picked for it, what it would have without, and the icons and colours to pick', () => {
    const settings = {
      ...saved(),
      categories: {
        changes: new Map(),
        own: [{ id: 'own-1', title: 'Кэшбэк', hidden: false, kind: 'income' as const }],
        looks: new Map([
          ['groceries', { icon: 'basket', color: 'orange', photo: 'abc' }],
          ['own-1', { icon: null, color: '#1E90FF', photo: null }],
        ]),
      },
    };
    const screen = plain(categoriesScreen(data(), settings, { today }));
    const [groceries] = screen.shown;
    const [cashback] = screen.income.shown;

    assert.deepEqual([groceries.icon, groceries.color, groceries.photo], ['basket', 'orange', '/category-photo/groceries?v=abc']);
    assert.deepEqual(groceries.category, {
      id: 'groceries',
      name: 'Продукты',
      zenmoneyTitle: 'Продукты',
      hidden: false,
      kind: 'expense',
      icon: 'basket',
      color: 'orange',
      auto: { icon: 'cart', color: '#3fa46a' },
    });
    assert.deepEqual([cashback.icon, cashback.color, cashback.category.icon, cashback.category.color], ['tag', '#1E90FF', null, '#1E90FF']);
    assert.ok(screen.icons.some((i: { icon: string; label: string }) => i.icon === 'partyPopper' && i.label === 'Развлечения'));
    assert.deepEqual(screen.colors[0], { value: 'violet', label: 'Фиолетовый' });

    const week = plain(weekScreen(data(), { ...saved(), categories: settings.categories }, { ...budget, week: null }));
    const [shop] = week.days[0].items;
    assert.deepEqual([shop.icon, shop.color, shop.photo], ['basket', 'orange', '/category-photo/groceries?v=abc'], 'an expense is drawn as its category');
  });

  it('opens incomes from the operations, and leaves one not counted out of the sums with its chip', () => {
    const operations = plain(operationsScreen(data(), saved([['salary', 'ignored']]), { today }));
    const salary = operations.days[0].items.find((o: { id: string }) => o.id === 'salary');

    assert.equal(salary.spending, 'salary');
    assert.deepEqual(salary.chip, { label: 'Не учитывается', tone: 'gray' });
    assert.equal(salary.muted, true);
    assert.deepEqual(operations.totals, { expense: 70_473, income: 0, optional: 0, count: 4 });
    assert.equal(operations.days[0].net, -473 - 40_000);
    assert.equal(operations.categoriesTitle, 'Расходы по категориям');
    assert.equal(plain(operationsScreen(data(), saved(), { today, kind: 'income' })).categoriesTitle, 'Доходы по категориям');
    assert.equal(plain(widgetScreen(data(), saved([['salary', 'ignored']]), { today })).savings.amount, -70_473, 'nor in savings');
  });
});

describe('api: a wish’s plan', () => {
  /** What the server reads from settings.db, as savedBudget does. */
  const savedOf = (settings: Settings): SavedBudget => ({
    categorizations: settings.categorizations(),
    purchasePayments: settings.purchasePayments(),
    regular: settings.regularExpenses(),
    purchases: settings.purchases(),
    wishPayments: settings.wishPayments(),
    wishes: settings.wishes(),
    wishPlans: settings.wishPlans(),
    marks: settings.spendingMarks(),
    descriptions: settings.spendingDescriptions(),
    categories: settings.categorySetup(),
    weekStart: settings.weekStart(),
    weekLimits: settings.weekLimits(),
  });
  const incomes = [{ id: 1, title: 'Зарплата', model: 'fixed' as const, params: { amount: 400_000, day: 1 } }];
  const post = (settings: Settings, path: string, fields: Record<string, string> = {}) =>
    submitWishPlan(settings, data(), savedOf(settings), path, new URLSearchParams(fields), { today, incomes });

  it('offers the ways to afford a wish by its day, keeps the plan chosen and holds its money in the weeks and extras', () => {
    using settings = new Settings(':memory:');
    const tyres = settings.addWish({ title: 'Резина', amount: 60_000 });
    assert.equal(post(settings, `/wishes/${tyres.id}/due`, { due: '2026-11-01' }), 'saved');
    assert.equal(post(settings, `/wishes/${tyres.id}/due`, { due: today }), 'missing', 'a wish is needed after today');

    const fresh = plain(wishScreen(data(), savedOf(settings), { today, id: tyres.id, ways: null, incomes }));
    assert.deepEqual(fresh.wish, { id: tyres.id, title: 'Резина', amount: 60_000, due: '2026-11-01', dueSet: true });
    assert.deepEqual(fresh.ways.map((w: { id: string }) => w.id), ['extra-2026-10', 'weeks', 'savings', 'later-2026-11']);
    assert.deepEqual([fresh.covered, fresh.short, fresh.chosen, fresh.planned], [0, 60_000, false, false]);

    const picking = plain(wishScreen(data(), savedOf(settings), { today, id: tyres.id, ways: 'weeks:5000,extra-2026-10:', incomes }));
    assert.deepEqual(
      picking.ways.filter((w: { on: boolean }) => w.on).map((w: { title: string; amount: number; line: string; fixed: boolean }) => [w.title, w.amount, w.fixed, w.line]),
      [
        ['Дополнительные октября', 45_000, false, 'останется 55 000 ₽'],
        ['Ужать недели', 5_000, true, '40 000 вместо 45 000 · 3 недели, всего 15 000 ₽'],
      ],
    );
    assert.deepEqual([picking.covered, picking.chosen], [60_000, false]);

    assert.equal(post(settings, `/wishes/${tyres.id}/ways`, { ways: 'weeks:5000,extra-2026-10:' }), 'saved');
    const chosen = plain(wishScreen(data(), savedOf(settings), { today, id: tyres.id, ways: null, incomes }));
    assert.deepEqual([chosen.picks, chosen.covered, chosen.chosen, chosen.planned, chosen.buy.label], ['weeks:5000,extra-2026-10:', 60_000, true, true, '26 октября – 1 ноября']);
    assert.deepEqual(
      chosen.steps.map((s: { date: string; title: string; details: string; amount: number }) => [s.date, s.title, s.details, s.amount]),
      [
        ['2026-10-12', '12–18 октября', '40 000 вместо 45 000', 5_000],
        ['2026-10-19', '19–25 октября', '40 000 вместо 45 000', 5_000],
        ['2026-10-26', '26 октября – 1 ноября', '40 000 вместо 45 000', 5_000],
        ['2026-10-26', 'Дополнительные октября', 'на покупку', 45_000],
      ],
    );

    const ahead = plain(weekScreen(data(), savedOf(settings), { ...budget, week: '2026-10-12' }));
    const held = ahead.plan.find((p: { wish: number | null }) => p.wish === tyres.id);
    assert.deepEqual([held.title, held.details, held.amount, held.mark], ['Резина', 'Желание', 5_000, 'week']);
    assert.equal(ahead.total.amount, 40_000, 'the week has what the plan holds less');
    const week = plain(weekScreen(data(), savedOf(settings), budget));
    assert.deepEqual(
      week.wishes.map((w: { title: string; details: string; plannable: boolean }) => [w.title, w.details, w.plannable]),
      [['Резина', 'к 1 ноября · по 5 000 с 3 недель, 45 000 из дополнительных октября', false]],
    );

    assert.equal(post(settings, `/wishes/${tyres.id}/ways/delete`), 'saved');
    assert.equal(plain(weekScreen(data(), savedOf(settings), { ...budget, week: '2026-10-12' })).total.amount, 45_000);
    assert.equal(post(settings, '/wishes/99/ways', { ways: 'weeks:' }), 'missing');
    assert.equal(post(settings, `/wishes/${tyres.id}/ways`, { ways: 'nothing:' }), 'missing', 'a plan needs a way');
  });

  it('puts every wish in one place: its card with the ways of its plan, and what the plans hold by month', () => {
    using settings = new Settings(':memory:');
    const tyres = settings.addWish({ title: 'Резина', amount: 60_000 });
    settings.setWishDue(tyres.id, '2026-11-01');
    settings.addWish({ title: 'Ботинки', amount: 9_000 });
    post(settings, `/wishes/${tyres.id}/ways`, { ways: 'weeks:5000,extra-2026-10:' });

    const screen = plain(wishesScreen(data(), savedOf(settings), { today, incomes }));
    type Card = { title: string; state: string; situation: string | null; details: string; when: string; covered: number; short: number; ways: Array<{ title: string; amount: number; line: string }> };
    assert.deepEqual(
      screen.wishes.map((w: Card) => [w.title, w.state, w.situation, w.details, w.when, w.covered, w.short]),
      [
        ['Резина', 'planned', 'calm', 'к 1 ноября · купить 26 октября – 1 ноября', 'к 1 ноября · купить 26 октября – 1 ноября', 60_000, 0],
        ['Ботинки', 'none', 'action', 'не разложено', '', 0, 0],
      ],
    );
    assert.deepEqual(
      screen.wishes[0].ways.map((w: Card['ways'][number]) => [w.title, w.amount, w.line]),
      [
        ['Дополнительные октября', 45_000, 'останется 55 000 ₽'],
        ['Ужать недели', 15_000, '40 000 вместо 45 000 · 3 недели, всего 15 000 ₽'],
      ],
    );
    type Month = { title: string; total: number; rows: Array<{ title: string; details: string; amount: number; wish: number }> };
    assert.deepEqual(
      screen.months.map((m: Month) => [m.title, m.total, m.rows.map((r) => [r.title, r.details, r.amount, r.wish])]),
      [
        [
          'Октябрь',
          60_000,
          [
            ['Резина', '12–18 октября · 40 000 вместо 45 000', 5_000, tyres.id],
            ['Резина', '19–25 октября · 40 000 вместо 45 000', 5_000, tyres.id],
            ['Резина', '26 октября – 1 ноября · 40 000 вместо 45 000', 5_000, tyres.id],
            ['Резина', 'Дополнительные октября · на покупку', 45_000, tyres.id],
          ],
        ],
      ],
    );

    const tyresCard = () => plain(wishesScreen(data(), savedOf(settings), { today, incomes })).wishes[0];
    post(settings, `/wishes/${tyres.id}/ways`, { ways: 'weeks:1000' });
    assert.deepEqual([tyresCard().situation, tyresCard().covered, tyresCard().short], ['problem', 3_000, 57_000], 'a plan that falls short is a problem');
    post(settings, `/wishes/${tyres.id}/ways`, { ways: 'later-2026-11:' });
    assert.deepEqual([tyresCard().situation, tyresCard().when], ['risk', 'к 1 ноября · купить 2–8 ноября · позже срока'], 'a plan that buys it after its day is a risk');

    post(settings, `/wishes/${tyres.id}/ways/delete`);
    const taken = plain(wishesScreen(data(), savedOf(settings), { today, incomes }));
    assert.deepEqual(taken.wishes[0].details, 'к 1 ноября · не разложено', 'a plan taken back leaves the wish without one');
    assert.deepEqual(taken.months, []);

    settings.linkWish('transfer', tyres.id);
    const bought = plain(wishesScreen(data(), savedOf(settings), { today, incomes }));
    assert.deepEqual(
      bought.wishes.map((w: Card & { muted: boolean }) => [w.title, w.state, w.situation, w.details, w.muted]),
      [
        ['Ботинки', 'none', 'action', 'не разложено', false],
        ['Резина', 'bought', null, 'куплено', true],
      ],
      'a bought wish goes last',
    );
  });

  it('shows what a plan takes from savings in the month’s flow', () => {
    using settings = new Settings(':memory:');
    const tyres = settings.addWish({ title: 'Резина', amount: 60_000 });
    settings.setWishDue(tyres.id, '2026-11-01');
    assert.equal(post(settings, `/wishes/${tyres.id}/ways`, { ways: 'savings:' }), 'saved');
    const month = plain(monthScreen(data(), savedOf(settings), { ...budget, incomes }));
    assert.deepEqual(
      month.flow.parts.map((p: { label: string; amount: number }) => [p.label, p.amount]),
      [
        ['Обязательные расходы', 0],
        ['Недельные бюджеты', 225_000],
        ['Доп. бюджет', 100_000],
        ['На желания', 60_000],
        ['В накопления', 15_000],
      ],
    );
  });

  it('lets an expense buy a wish with a plan: it counts outside the budget, and the wish is bought', () => {
    using settings = new Settings(':memory:');
    const tyres = settings.addWish({ title: 'Резина', amount: 60_000 });
    settings.setWishDue(tyres.id, '2026-11-01');
    post(settings, `/wishes/${tyres.id}/ways`, { ways: 'extra-2026-10:' });

    const before = plain(spendingScreen(data(), savedOf(settings), { today, id: 'transfer' }));
    assert.deepEqual(
      before.payments.choices.filter((c: { choice: string }) => c.choice.startsWith('wish-')).map((c: { choice: string; label: string; detail: string; icon: string }) => [c.choice, c.label, c.detail, c.icon]),
      [[`wish-${tyres.id}`, 'Резина', 'желание · 60 000 ₽', 'sparkles']],
    );

    assert.deepEqual(submitMarking(settings, data(), `/spending/transfer/wish-${tyres.id}`, new URLSearchParams()), { status: 'saved' });
    const after = plain(spendingScreen(data(), savedOf(settings), { today, id: 'transfer' }));
    assert.equal(after.title, 'Резина');
    assert.deepEqual(after.envelopes.filter((e: { current: boolean }) => e.current).map((e: { choice: string }) => e.choice), ['outside']);
    const week = plain(weekScreen(data(), savedOf(settings), budget));
    assert.deepEqual(week.wishes, [], 'a wish bought is no longer wished for');
    assert.equal(week.total.amount, 45_000 - 473, 'the expense that bought it does not count in the week');
    const month = plain(monthScreen(data(), savedOf(settings), budget));
    const held = month.purchases.find((p: { wish: number | null }) => p.wish === tyres.id);
    assert.deepEqual([held.details, held.muted, held.amount], ['Желание · куплено', true, 60_000]);

    submitMarking(settings, data(), '/spending/transfer/unlink', new URLSearchParams());
    assert.equal(plain(weekScreen(data(), savedOf(settings), budget)).wishes.length, 1);
  });
});

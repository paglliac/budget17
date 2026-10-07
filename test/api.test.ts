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
  spendingScreen,
  uncategorizedScreen,
  weekScreen,
  widgetScreen,
} from '../src/web/api.ts';
import type { SavedBudget } from '../src/web/pages/dashboard.ts';
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
      { id: 1, title: 'Ботинки Савве', amount: 8_000, week: '2026-10-05', envelope: 'week', done: false },
      { id: 2, title: 'Подарок', amount: 5_000, week: '2026-10-05', envelope: 'week', done: true },
      { id: 3, title: 'Куртка', amount: 20_000, week: '2026-10-05', envelope: 'extra', done: false },
      { id: 4, title: 'Стрижка', amount: 1_500, week: '2026-10-19', envelope: 'week', done: false },
    ],
    wishes: [{ id: 1, title: 'Укладка для волос', amount: 4_500 }],
    marks: new Map(marks),
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
      amount: 473,
      mark: 'week',
      muted: false,
      spending: 'pyaterochka',
    });

    const [boots, gift, jacket, school] = week.plan;
    assert.equal(boots.details, 'ждёт покупки');
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
    assert.deepEqual(ahead.plan.map((p: { title: string; details: string; finishable: boolean }) => [p.title, p.details, p.finishable]), [['Стрижка', 'в плане', false]]);
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
  });

  it('opens an expense with what is known of it and the choices to mark it', () => {
    const spending = plain(spendingScreen(data(), saved(), { today, id: 'transfer' }));

    assert.equal(spending.title, 'Александр А.');
    assert.deepEqual([spending.when, spending.account, spending.notes], ['5 октября', 'Основной', []]);
    const school = spending.payments.choices.find((c: { choice: string }) => c.choice === 'regular-7');
    assert.equal(school.icon, 'book', 'a payment has an icon for its card');
    assert.equal(spending.payments.otherLabel, 'Другой платёж');
    assert.deepEqual(spending.categories.choices[0], { choice: 'tag-groceries', label: 'Продукты', color: '#3fa46a', current: false, suggested: false, icon: 'cart' });
    assert.deepEqual(
      spending.envelopes.map((c: { choice: string }) => c.choice),
      ['week', 'extra', 'outside', 'ignored'],
    );
    assert.deepEqual(spending.undo, []);
  });

  it('opens an expense that does not count, and nothing that is not an expense', () => {
    const ignored = spendingScreen(data(), saved([['transfer', 'ignored']]), { today, id: 'transfer' });
    assert.equal(ignored?.envelopes.find((c) => c.current)?.choice, 'ignored');
    assert.equal(spendingScreen(data(), saved(), { today, id: 'salary' }), null);
    assert.equal(spendingScreen(data(), saved(), { today, id: 'nope' }), null);
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
    assert.deepEqual([salary.kind, salary.spending, salary.color, salary.details], ['income', null, 'green', 'Доход'], 'no account money came to');
    assert.equal(monday.items.find((o: { id: string }) => o.id === 'transfer').spending, 'transfer');
    assert.deepEqual(operations.categories[0], { id: 'none', title: 'Без категории', icon: 'tag', color: 'gray', amount: 70_000, share: 70_000 / 70_473 });

    const filtered = plain(operationsScreen(data(), saved(), { today, kind: 'income', query: 'работа' }));
    assert.equal(filtered.kind, 'income');
    assert.equal(filtered.query, 'работа');
    assert.equal(filtered.days.length, 1);
    assert.deepEqual(filtered.totals, { expense: 0, income: 150_000, count: 1 });
    assert.deepEqual(operations.totals, { expense: 70_473, income: 150_000, count: 4 });
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

  it('gives the widget what is left of the week and what waits for a category', () => {
    const widget = plain(widgetScreen(data(), saved(), { today }));

    assert.equal(widget.week, '5–11 октября');
    assert.equal(widget.free, -3_473);
    assert.equal(widget.note, 'из 45 000 ₽ на неделю');
    assert.deepEqual(widget.parts.map((p: { label: string }) => p.label), ['Потрачено', 'План', 'Свободно']);
    assert.deepEqual(widget.pending, { count: 2, amount: 70_000, note: '2 траты без категории' });

    const sorted = { ...saved(), categorizations: new Map([['transfer', { tag: 'groceries' }], ['last-week', { tag: 'groceries' }]]) };
    assert.deepEqual(plain(widgetScreen(data(), sorted, { today })).pending, { count: 0, amount: 0, note: 'Всё разобрано' });
  });

  it('gives the week from the day picked in the settings with the amount set for it', () => {
    const settings = { ...saved(), purchases: [], weekStart: 3, weekLimits: new Map([['2026-10-01', 80_000]]) };
    const week = plain(weekScreen(data(), settings, budget));

    assert.deepEqual([week.week, week.current, week.title, week.prev, week.next], ['2026-10-01', '2026-10-01', 'Неделя 1–7 октября', '2026-09-24', '2026-10-08']);
    assert.equal(week.total.note, 'из 80 000 ₽ на неделю');
    assert.deepEqual(week.limit, { amount: 80_000, usual: 45_000 });
    assert.deepEqual(plain(weekScreen(data(), saved(), budget)).limit, { amount: 45_000, usual: 45_000 });
    assert.equal(week.total.amount, 80_000 - 70_473);
    assert.equal(plain(widgetScreen(data(), settings, { today })).note, 'из 80 000 ₽ на неделю');
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
  });

  it('gives categories with the hidden ones apart', () => {
    const settings = { ...saved(), categories: { ...NO_SETUP, changes: new Map([['groceries', { title: null, hidden: true }]]) } };
    const screen = plain(categoriesScreen(data(), settings, { today }));

    assert.deepEqual(screen.shown, []);
    assert.deepEqual(screen.hidden.map((c: { category: { id: string; hidden: boolean } }) => [c.category.id, c.category.hidden]), [['groceries', true]]);
    assert.equal(screen.hidden[0].color, 'gray');
  });
});

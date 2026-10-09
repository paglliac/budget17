import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { paymentChoices, suggester, type PaymentChoice, type Suggestion } from '../src/categorization.ts';
import { PURCHASE_CATEGORY, REGULAR_CATEGORY, type Operation } from '../src/ledger.ts';
import type { Category } from '../src/operations.ts';
import type { Purchase } from '../src/week.ts';
import { regular } from './fixtures.ts';

const groceries: Category = { id: 'groceries', title: 'Продукты', color: null };
const cafe: Category = { id: 'cafe', title: 'Кафе', color: null };
const workshop = regular({ id: 1, title: 'Мастерская аренда', amount: 40_000, day: 10 });
const oldCar = regular({ id: 2, title: 'Старая машина', amount: 30_500, day: 26 });
const mortgage = regular({ id: 3, title: 'Ипотека', amount: 29_000, day: 21 });
const phone = regular({ id: 4, title: 'Телефон', amount: 1_500, day: 2 });
const wifePhone = regular({ id: 5, title: 'Телефон жены', amount: 1_500, day: 2 });

function expense(payee: string, amount: number, date: string, sorted: Partial<Pick<Operation, 'category' | 'regular' | 'purchase'>> = {}): Operation {
  return { id: `${payee}-${date}`, date, created: 0, kind: 'expense', amount, original: null, payee, originalPayee: null, comment: null, description: null, category: null, zenmoneyCategory: null, regular: null, purchase: null, account: 'Основной', toAccount: null, hold: false, ignored: false, ...sorted };
}

/** An expense the user linked to a regular expense. */
function paid(payee: string, amount: number, date: string, e: { id: number; title: string }): Operation {
  return expense(payee, amount, date, { category: REGULAR_CATEGORY, regular: { id: e.id, title: e.title } });
}

const name = (s: Suggestion | null) => (s === null ? null : 'category' in s ? s.category.title : s.regular.title);

describe('suggester', () => {
  it('suggests a regular expense of the same amount due within ten days', () => {
    const suggest = suggester([], [workshop, oldCar]);

    assert.equal(name(suggest(expense('Александр А.', 40_000, '2026-10-05'))), 'Мастерская аренда');
    assert.equal(name(suggest(expense('Кирилл А.', 30_500, '2026-09-18'))), 'Старая машина', 'eight days early');
    assert.equal(name(suggest(expense('Кирилл А.', 30_500, '2026-10-02'))), 'Старая машина', 'the payment of the month before');
    assert.equal(suggest(expense('Александр А.', 40_000, '2026-10-25')), null, 'too far from the 10th');
    assert.equal(suggest(expense('Александр А.', 40_100, '2026-10-10')), null, 'another amount');
  });

  it('does not suggest a payment that another expense already paid, so the next same one goes elsewhere', () => {
    const suggest = suggester([paid('Т-Мобайл', 1_500, '2026-10-02', phone)], [phone, wifePhone]);

    assert.equal(name(suggest(expense('Т-Мобайл', 1_500, '2026-10-02'))), 'Телефон жены');
    assert.equal(name(suggest(expense('Т-Мобайл', 1_500, '2026-11-01'))), 'Телефон', 'next month is a new payment');
  });

  it('suggests what the same payee was paid for the same amount before, wherever it falls', () => {
    const history = [paid('Кирилл А.', 28_800, '2026-08-20', mortgage), paid('Кирилл А.', 30_500, '2026-08-20', oldCar)];
    const suggest = suggester(history, [mortgage, oldCar]);

    assert.equal(name(suggest(expense('Кирилл А.', 28_800, '2026-09-18'))), 'Ипотека');
    assert.equal(name(suggest(expense('Кирилл А.', 30_500, '2026-09-18'))), 'Старая машина');
    assert.equal(name(suggest(expense('Кирилл А.', 28_500, '2026-09-18'))), 'Ипотека', 'the closest earlier amount');
    assert.equal(suggest(expense('Кирилл А.', 5_000, '2026-09-18')), null, 'too far from any');
    assert.equal(suggest(expense('Дарья Ч.', 28_800, '2026-09-18')), null, 'another payee');
  });

  it('suggests the category the payee gets most often, ignoring store numbers and case', () => {
    const history = [
      expense('Lenta 089', 700, '2026-09-20', { category: groceries }),
      expense('LENTA 139', 900, '2026-09-12', { category: groceries }),
      expense('Лента кафе', 300, '2026-09-10', { category: cafe }),
      expense('KHLEB SOL', 610, '2026-09-27', { category: cafe }),
      expense('Khleb Sol', 400, '2026-09-01', { category: groceries }),
    ];
    const suggest = suggester(history, []);

    assert.equal(name(suggest(expense('Lenta 178', 6_862, '2026-10-01'))), 'Продукты');
    assert.equal(name(suggest(expense('KHLEB SOL', 300, '2026-10-01'))), 'Кафе', 'a tie goes to the latest');
    assert.equal(suggest(expense('Пятёрочка', 300, '2026-10-01')), null);
  });

  it('prefers a regular payment to a category, and suggests nothing by payee for an expense without one', () => {
    const history = [expense('Александр А.', 500, '2026-09-01', { category: cafe }), expense('Расход', 200, '2026-09-01', { category: cafe })];
    const suggest = suggester(history, [workshop]);

    assert.equal(name(suggest(expense('Александр А.', 40_000, '2026-10-09'))), 'Мастерская аренда');
    assert.equal(name(suggest(expense('Александр А.', 700, '2026-10-09'))), 'Кафе');
    assert.equal(suggest(expense('Расход', 200, '2026-10-09')), null);
    assert.equal(name(suggest(expense('Расход', 40_000, '2026-10-09'))), 'Мастерская аренда', 'amount and day still count');
  });

  it('takes the bank’s comment for the payee of an operation without one, such as interest on an income', () => {
    const interest: Category = { id: 'interest', title: 'Проценты', color: null };
    const income = (comment: string | null, date: string, sorted: Partial<Pick<Operation, 'category'>> = {}): Operation => ({
      ...expense('Доход', 59, date, sorted),
      kind: 'income',
      comment,
    });
    // Once sorted, an operation without a payee is called by its category, as listOperations names it.
    const sorted = { ...income('Проценты на остаток', '2026-09-04', { category: interest }), payee: 'Проценты' };
    const suggest = suggester([sorted], []);

    assert.equal(name(suggest(income('Проценты на остаток', '2026-10-04'))), 'Проценты');
    assert.equal(suggest(income('Зачисление кэшбэка', '2026-10-04')), null);
    assert.equal(suggest(income(null, '2026-10-04')), null);
  });

  it('suggests no regular expense outside its dates', () => {
    const suggest = suggester([], [regular({ id: 9, title: 'Машина', amount: 91_000, day: 5, start: '2026-11-01' })]);

    assert.equal(suggest(expense('Влас М.', 91_000, '2026-10-05')), null);
    assert.equal(name(suggest(expense('Влас М.', 91_000, '2026-11-04'))), 'Машина');
  });
});

describe('paymentChoices', () => {
  const purchase = (id: number, title: string, amount: number, week: string, overrides: Partial<Purchase> = {}): Purchase => ({
    id,
    title,
    amount,
    week,
    envelope: 'week',
    kind: 'flexible',
    done: false,
    ...overrides,
  });
  const named = (choices: PaymentChoice[]) => choices.map((c) => ('regular' in c ? `${c.regular.title} ${c.date} ${c.left}` : `${c.purchase.title} ${c.left}`));
  const groceries = purchase(1, 'Продукты', 3_000, '2026-10-05');
  const shoes = purchase(2, 'Ботинки', 8_000, '2026-10-12');

  it('offers payments due near the expense and purchases planned near it, the closest amount first', () => {
    const choices = paymentChoices(expense('Пятёрочка', 2_500, '2026-10-05'), {
      regular: [workshop, phone, oldCar, mortgage],
      purchases: [shoes, groceries, purchase(3, 'Пальто', 15_000, '2026-11-02'), purchase(4, 'Куртка', 20_000, '2026-10-26', { envelope: 'extra' })],
      expenses: [],
      weekStart: 0,
    });

    assert.deepEqual(
      named(choices),
      ['Продукты 3000', 'Телефон 2026-10-02 1500', 'Ботинки 8000', 'Куртка 20000', 'Старая машина 2026-09-26 30500', 'Мастерская аренда 2026-10-10 40000'],
      'not the mortgage of the 21st, nor the coat of November',
    );
  });

  it('puts a bill of the expense’s amount first, then the plan of its week, then payments of other amounts', () => {
    const internet = regular({ id: 6, title: 'Интернет', amount: 1_100, day: 1 });
    const context = {
      regular: [phone, internet, workshop],
      purchases: [groceries, purchase(5, 'Подарок', 5_000, '2026-10-05'), purchase(6, 'Стрижка', 2_200, '2026-10-12'), purchase(7, 'Ласты', 8_000, '2026-10-05')],
      expenses: [],
      weekStart: 0,
    };

    assert.deepEqual(
      named(paymentChoices(expense('Khofenberg', 1_797, '2026-10-07'), context)),
      ['Продукты 3000', 'Подарок 5000', 'Ласты 8000', 'Телефон 2026-10-02 1500', 'Стрижка 2200', 'Интернет 2026-10-01 1100', 'Мастерская аренда 2026-10-10 40000'],
      'the phone bill is closer to 1 797 than the plan, but no bill is paid with another amount',
    );
    assert.deepEqual(named(paymentChoices(expense('Т-Мобайл', 1_450, '2026-10-07'), context)).slice(0, 2), ['Телефон 2026-10-02 1500', 'Продукты 3000']);
  });

  it('leaves out what other expenses paid in full or what is bought, and counts what they paid in part', () => {
    const paidPhone = expense('Т-Мобайл', 1_500, '2026-10-01', { category: REGULAR_CATEGORY, regular: { id: phone.id, title: phone.title } });
    const someGroceries = expense('Лента', 1_000, '2026-10-06', { category: PURCHASE_CATEGORY, purchase: { id: 1, title: 'Продукты' } });
    const choices = paymentChoices(expense('Пятёрочка', 2_000, '2026-10-05'), {
      regular: [phone],
      purchases: [groceries, purchase(5, 'Подарок', 2_000, '2026-10-05', { done: true })],
      expenses: [paidPhone, someGroceries],
      weekStart: 0,
    });

    assert.deepEqual(named(choices), ['Продукты 2000']);
  });

  it('still offers what the expense itself paid', () => {
    const self = expense('Т-Мобайл', 1_500, '2026-10-01', { category: REGULAR_CATEGORY, regular: { id: phone.id, title: phone.title } });

    assert.deepEqual(named(paymentChoices(self, { regular: [phone], purchases: [], expenses: [self], weekStart: 0 })), ['Телефон 2026-10-02 1500']);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nearestPayment, nextPayment, parseRegularExpense, paymentDate, regularTotals, regularValues, upcomingRegular, type RegularValues } from '../src/regular.ts';
import { regular } from './fixtures.ts';

const today = '2026-10-05';
/** Paid on the day of every month, or only between `start` and `end`. */
const monthly = (day: number, start: string | null = null, end: string | null = null) => ({ day, start, end });
const typed = (values: Partial<RegularValues>): RegularValues => ({ title: '', amount: '', day: '', start: '', end: '', icon: '', ...values });

describe('regular expenses', () => {
  it('fall on the last day of a month shorter than their day', () => {
    assert.equal(paymentDate(monthly(30), '2026-02'), '2026-02-28');
    assert.equal(paymentDate(monthly(31), '2028-02'), '2028-02-29');
    assert.equal(paymentDate(monthly(31), '2026-04'), '2026-04-30');
    assert.equal(paymentDate(monthly(3), '2026-04'), '2026-04-03');
  });

  it('come next today or later, moving to the next month once the day has passed', () => {
    assert.equal(nextPayment(monthly(5), today), '2026-10-05');
    assert.equal(nextPayment(monthly(4), today), '2026-11-04');
    assert.equal(nextPayment(monthly(31), '2026-11-15'), '2026-11-30');
    assert.equal(nextPayment(monthly(10), '2026-12-20'), '2027-01-10');
  });

  it('fall only between the start and the end, both included', () => {
    const loan = monthly(25, '2026-11-01', '2027-03-25');
    assert.equal(paymentDate(loan, '2026-10'), null, 'before the start');
    assert.equal(paymentDate(loan, '2026-11'), '2026-11-25');
    assert.equal(paymentDate(loan, '2027-03'), '2027-03-25', 'on the end');
    assert.equal(paymentDate(loan, '2027-04'), null, 'after the end');
    assert.equal(paymentDate(monthly(5, '2026-10-10'), '2026-10'), null, 'the day of the month is before the start');
    assert.equal(paymentDate(monthly(31, null, '2027-02-28'), '2027-02'), '2027-02-28', 'a clamped day is still on the end');

    assert.equal(nextPayment(loan, today), '2026-11-25', 'waits for the start');
    assert.equal(nextPayment(monthly(5, '2026-10-10'), today), '2026-11-05');
    assert.equal(nextPayment(monthly(10, '2026-10-10'), today), '2026-10-10');
    assert.equal(nextPayment(loan, '2027-03-25'), '2027-03-25');
    assert.equal(nextPayment(loan, '2027-03-26'), null, 'over');
    assert.equal(nextPayment(monthly(4, null, '2026-10-31'), today), null, 'the last one has passed');
  });

  it('find the payment nearest to a date in its month or the months around it', () => {
    assert.equal(nearestPayment(monthly(26), '2026-09-18'), '2026-09-26');
    assert.equal(nearestPayment(monthly(3), '2026-09-28'), '2026-10-03');
    assert.equal(nearestPayment(monthly(30), '2026-10-02'), '2026-09-30');
    assert.equal(nearestPayment(monthly(5, '2026-11-01'), '2026-10-05'), '2026-11-05');
    assert.equal(nearestPayment(monthly(5, null, '2026-06-30'), '2026-10-05'), null);
  });

  it('become planned expenses within the window, every month they fall in', () => {
    const planned = upcomingRegular(
      [
        regular({ id: 1, title: 'Аренда', amount: 40_000, day: 10 }),
        regular({ id: 2, title: 'Интернет', amount: 1_100, day: 1 }),
        regular({ id: 3, title: 'Бокс', amount: 25_000, day: 3 }),
        regular({ id: 4, title: 'Секция', amount: 5_000, day: 15, end: '2026-10-14' }),
        regular({ id: 5, title: 'Кредит', amount: 9_000, day: 20, start: '2026-11-01' }),
      ],
      { today, days: 40 },
    );

    assert.deepEqual(
      planned.map((p) => [p.date, p.title, p.kind, p.amount]),
      [
        ['2026-10-10', 'Аренда', 'expense', 40_000],
        ['2026-11-01', 'Интернет', 'expense', 1_100],
        ['2026-11-03', 'Бокс', 'expense', 25_000],
        ['2026-11-10', 'Аренда', 'expense', 40_000],
      ],
    );
    assert.equal(new Set(planned.map((p) => p.id)).size, planned.length, 'ids are unique');
  });

  it('total the payments of this month and what is still ahead of it, today included', () => {
    const expenses = [
      regular({ id: 1, title: 'Телефон', amount: 1_500, day: 2 }),
      regular({ id: 2, title: 'Машина', amount: 91_000, day: 5 }),
      regular({ id: 3, title: 'Школа', amount: 45_000, day: 30 }),
      regular({ id: 4, title: 'Секция', amount: 5_000, day: 15, end: '2026-09-30' }),
      regular({ id: 5, title: 'Кредит', amount: 9_000, day: 20, start: '2026-11-01' }),
    ];
    assert.deepEqual(regularTotals(expenses, today), { count: 3, total: 137_500, ahead: 136_000 });
    assert.deepEqual(regularTotals([], today), { count: 0, total: 0, ahead: 0 });
  });
});

describe('parseRegularExpense', () => {
  it('accepts amounts with spaces and a decimal comma and tidies the title', () => {
    assert.deepEqual(parseRegularExpense(typed({ title: '  Офис   аренда ', amount: '13 000', day: '25' })), {
      expense: { title: 'Офис аренда', amount: 13_000, day: 25, start: null, end: null, icon: null },
    });
    assert.deepEqual(parseRegularExpense(typed({ title: 'Интернет', amount: '1 100,50', day: '1' })), {
      expense: { title: 'Интернет', amount: 1_100.5, day: 1, start: null, end: null, icon: null },
    });
  });

  it('takes the dates and the icon, each of them optional', () => {
    assert.deepEqual(parseRegularExpense(typed({ title: 'Кредит', amount: '9000', day: '20', start: '2026-11-01', end: '2027-03-20', icon: 'card' })), {
      expense: { title: 'Кредит', amount: 9_000, day: 20, start: '2026-11-01', end: '2027-03-20', icon: 'card' },
    });
    assert.deepEqual(parseRegularExpense(typed({ title: 'Кредит', amount: '9000', day: '20', start: '2026-11-01', end: '2026-11-01' })), {
      expense: { title: 'Кредит', amount: 9_000, day: 20, start: '2026-11-01', end: '2026-11-01', icon: null },
    });
  });

  it('explains every field that is wrong', () => {
    assert.deepEqual(parseRegularExpense(typed({ title: ' ', amount: '', day: '' })), {
      errors: { title: 'Укажите название', amount: 'Укажите сумму', day: 'Укажите число' },
    });
    for (const amount of ['0', '-5', '12,345', 'много', '1e5']) {
      assert.ok('errors' in parseRegularExpense(typed({ title: 'Школа', amount, day: '30' })), amount);
    }
    for (const day of ['0', '32', '2.5', 'пятое']) {
      assert.ok('errors' in parseRegularExpense(typed({ title: 'Школа', amount: '45000', day })), day);
    }
    assert.ok('errors' in parseRegularExpense(typed({ title: 'я'.repeat(81), amount: '1', day: '1' })));
    for (const start of ['2026-02-30', '2026-13-01', '01.11.2026', 'завтра']) {
      assert.deepEqual(parseRegularExpense(typed({ title: 'Школа', amount: '1', day: '1', start })), { errors: { start: 'Такой даты нет' } }, start);
    }
    assert.deepEqual(parseRegularExpense(typed({ title: 'Школа', amount: '1', day: '1', start: '2026-11-01', end: '2026-10-31' })), {
      errors: { end: 'Раньше даты начала' },
    });
  });

  it('round-trips through the form values', () => {
    const expense = { title: 'Интернет', amount: 1_100.5, day: 1, start: null, end: null, icon: null };
    assert.deepEqual(regularValues(expense), { title: 'Интернет', amount: '1100,5', day: '1', start: '', end: '', icon: '' });
    assert.deepEqual(parseRegularExpense(regularValues(expense)), { expense });
    const loan = { title: 'Кредит', amount: 9_000, day: 20, start: '2026-11-01', end: '2027-03-20', icon: 'card' };
    assert.deepEqual(parseRegularExpense(regularValues(loan)), { expense: loan });
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextPayment, parseRegularExpense, paymentDate, regularTotals, regularValues, upcomingRegular } from '../src/regular.ts';

const today = '2026-10-05';

describe('regular expenses', () => {
  it('fall on the last day of a month shorter than their day', () => {
    assert.equal(paymentDate({ day: 30 }, '2026-02'), '2026-02-28');
    assert.equal(paymentDate({ day: 31 }, '2028-02'), '2028-02-29');
    assert.equal(paymentDate({ day: 31 }, '2026-04'), '2026-04-30');
    assert.equal(paymentDate({ day: 3 }, '2026-04'), '2026-04-03');
  });

  it('come next today or later, moving to the next month once the day has passed', () => {
    assert.equal(nextPayment({ day: 5 }, today), '2026-10-05');
    assert.equal(nextPayment({ day: 4 }, today), '2026-11-04');
    assert.equal(nextPayment({ day: 31 }, '2026-11-15'), '2026-11-30');
    assert.equal(nextPayment({ day: 10 }, '2026-12-20'), '2027-01-10');
  });

  it('become planned expenses within the window, every month they fall in', () => {
    const planned = upcomingRegular(
      [
        { id: 1, title: 'Аренда', amount: 40_000, day: 10 },
        { id: 2, title: 'Интернет', amount: 1_100, day: 1 },
        { id: 3, title: 'Бокс', amount: 25_000, day: 3 },
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

  it('total a month and what is still ahead of it, today included', () => {
    const expenses = [
      { id: 1, title: 'Телефон', amount: 1_500, day: 2 },
      { id: 2, title: 'Машина', amount: 91_000, day: 5 },
      { id: 3, title: 'Школа', amount: 45_000, day: 30 },
    ];
    assert.deepEqual(regularTotals(expenses, today), { total: 137_500, ahead: 136_000 });
    assert.deepEqual(regularTotals([], today), { total: 0, ahead: 0 });
  });
});

describe('parseRegularExpense', () => {
  it('accepts amounts with spaces and a decimal comma and tidies the title', () => {
    assert.deepEqual(parseRegularExpense({ title: '  Офис   аренда ', amount: '13 000', day: '25' }), {
      expense: { title: 'Офис аренда', amount: 13_000, day: 25 },
    });
    assert.deepEqual(parseRegularExpense({ title: 'Интернет', amount: '1 100,50', day: '1' }), {
      expense: { title: 'Интернет', amount: 1_100.5, day: 1 },
    });
  });

  it('explains every field that is wrong', () => {
    assert.deepEqual(parseRegularExpense({ title: ' ', amount: '', day: '' }), {
      errors: { title: 'Укажите название', amount: 'Укажите сумму', day: 'Укажите число' },
    });
    for (const amount of ['0', '-5', '12,345', 'много', '1e5']) {
      assert.ok('errors' in parseRegularExpense({ title: 'Школа', amount, day: '30' }), amount);
    }
    for (const day of ['0', '32', '2.5', 'пятое']) {
      assert.ok('errors' in parseRegularExpense({ title: 'Школа', amount: '45000', day }), day);
    }
    assert.ok('errors' in parseRegularExpense({ title: 'я'.repeat(81), amount: '1', day: '1' }));
  });

  it('round-trips through the form values', () => {
    const expense = { title: 'Интернет', amount: 1_100.5, day: 1 };
    assert.deepEqual(regularValues(expense), { title: 'Интернет', amount: '1100,5', day: '1' });
    assert.deepEqual(parseRegularExpense(regularValues(expense)), { expense });
  });
});

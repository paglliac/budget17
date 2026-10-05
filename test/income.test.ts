import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { incomePayments, incomeValues, monthlyIncome, parseIncome, paymentsBetween, upcomingIncome, type Income } from '../src/income.ts';

const today = '2026-10-05';
const salary: Income = { id: 1, title: 'Зарплата', model: 'salary', params: { salary: 200_000, advanceDay: 20, payDay: 5 } };
const rent: Income = { id: 2, title: 'Сдача квартиры', model: 'fixed', params: { amount: 100_000, day: 5 } };

describe('fixed income', () => {
  it('comes on its day, or on the last day of a shorter month', () => {
    assert.deepEqual(incomePayments(rent, '2026-10'), [{ date: '2026-10-05', amount: 100_000 }]);
    assert.deepEqual(incomePayments({ ...rent, params: { amount: 1, day: 31 } }, '2026-11'), [{ date: '2026-11-30', amount: 1 }]);
  });
});

describe('salary with an advance', () => {
  it('pays the first half by working days on the advance day and the rest next month', () => {
    assert.deepEqual(incomePayments(salary, '2026-10'), [
      { date: '2026-10-20', amount: 100_000, label: 'Аванс за октябрь', formula: '200 000 × 11/22 рабочих дней' },
      { date: '2026-11-05', amount: 100_000, label: 'Зарплата за октябрь', formula: '200 000 − 100 000 аванса' },
    ]);
  });

  it('rounds to kopecks and keeps the two parts adding up to the salary', () => {
    const [advance, rest] = incomePayments(salary, '2026-11');
    assert.equal(advance?.amount, 90_000, '9 of 20 working days');
    assert.equal(rest?.amount, 110_000);

    const odd = incomePayments({ ...salary, params: { ...salary.params, salary: 100_000 } }, '2026-05');
    assert.equal(odd[0]?.formula, '100 000 × 9/19 рабочих дней', '1 and 11 May are days off');
    assert.equal(odd[0]?.amount, 47_368.42);
    assert.equal((odd[0]?.amount ?? 0) + (odd[1]?.amount ?? 0), 100_000);
  });

  it('moves a payday off a day off to the working day before it', () => {
    const december = incomePayments(salary, '2026-12');
    assert.deepEqual(december.map((p) => p.date), ['2026-12-18', '2026-12-30'], '20 December is a Sunday, 5 January a holiday');
  });
});

describe('upcoming income', () => {
  it('lists payments in the window, soonest first, including the rest of last month', () => {
    const payments = paymentsBetween([salary, rent], today, '2026-11-19');
    assert.deepEqual(
      payments.map((p) => [p.date, p.label ?? p.income.title, p.amount]),
      [
        ['2026-10-05', 'Зарплата за сентябрь', 100_000],
        ['2026-10-05', 'Сдача квартиры', 100_000],
        ['2026-10-20', 'Аванс за октябрь', 100_000],
        ['2026-11-05', 'Зарплата за октябрь', 100_000],
        ['2026-11-05', 'Сдача квартиры', 100_000],
      ],
    );
  });

  it('becomes planned incomes with unique ids', () => {
    const planned = upcomingIncome([salary, rent], { today, days: 45 });
    assert.ok(planned.every((p) => p.kind === 'income'));
    assert.equal(planned[0]?.title, 'Зарплата за сентябрь');
    assert.equal(new Set(planned.map((p) => p.id)).size, planned.length);
  });

  it('totals a month', () => {
    assert.equal(monthlyIncome([salary, rent]), 300_000);
  });
});

describe('parseIncome', () => {
  it('reads the fields of the model', () => {
    assert.deepEqual(parseIncome('salary', { title: ' Зарплата ', salary: '200 000', advanceDay: '20', payDay: '5' }), {
      income: { title: 'Зарплата', model: 'salary', params: { salary: 200_000, advanceDay: 20, payDay: 5 } },
    });
    assert.deepEqual(parseIncome('fixed', { title: 'Аренда', amount: '', day: '40' }), {
      errors: { amount: 'Укажите сумму', day: 'От 1 до 31' },
    });
  });

  it('round-trips through the form values', () => {
    assert.deepEqual(incomeValues(salary), { title: 'Зарплата', salary: '200000', advanceDay: '20', payDay: '5' });
    assert.deepEqual(parseIncome('salary', incomeValues(salary)), { income: { title: 'Зарплата', model: 'salary', params: salary.params } });
  });
});

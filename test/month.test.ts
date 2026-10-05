import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summarizeMonth } from '../src/month.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { budget, RUB, tag, transaction, USD, user } from './fixtures.ts';

const base: EntityCollections = { instrument: [RUB, USD], user: [user()] };
const today = '2026-10-05';

describe('summarizeMonth', () => {
  it('sums income and spending of the month, leaving out transfers and deleted operations', () => {
    const summary = summarizeMonth(
      {
        ...base,
        transaction: [
          transaction({ date: '2026-10-01', outcome: 500 }),
          transaction({ date: '2026-10-03', income: 1000 }),
          transaction({ date: '2026-10-03', outcome: 300, income: 300, outcomeAccount: 'card', incomeAccount: 'savings' }),
          transaction({ date: '2026-10-04', outcome: 999, deleted: true }),
          transaction({ date: '2026-11-01', outcome: 50 }),
        ],
      },
      { month: '2026-10', today },
    );

    assert.equal(summary.expense, 500);
    assert.equal(summary.income, 1000);
    assert.equal(summary.dailyExpense[0], 500);
    assert.equal(summary.dailyIncome[2], 1000);
    assert.equal(summary.dailyExpense.length, 31);
  });

  it('converts other currencies into the main one', () => {
    const summary = summarizeMonth(
      { ...base, transaction: [transaction({ outcome: 10, outcomeInstrument: USD.id, incomeInstrument: USD.id })] },
      { month: '2026-10', today },
    );

    assert.equal(summary.expense, 900);
  });

  it('groups spending by top-level category, largest first, with its colour', () => {
    const food = tag({ title: 'Продукты', color: 0xff4fae7f });
    const transport = tag({ title: 'Транспорт' });
    const taxi = tag({ title: 'Такси', parent: transport.id });
    const summary = summarizeMonth(
      {
        ...base,
        tag: [food, transport, taxi],
        transaction: [
          transaction({ outcome: 100, tag: [food.id] }),
          transaction({ outcome: 300, tag: [taxi.id] }),
          transaction({ outcome: 50, tag: [transport.id] }),
          transaction({ outcome: 20 }),
        ],
      },
      { month: '2026-10', today },
    );

    assert.deepEqual(summary.categories, [
      { id: transport.id, title: 'Транспорт', color: null, amount: 350 },
      { id: food.id, title: 'Продукты', color: '#4fae7f', amount: 100 },
      { id: null, title: 'Без категории', color: null, amount: 20 },
    ]);
  });

  it('compares with the previous month up to the same day', () => {
    const summary = summarizeMonth(
      {
        ...base,
        transaction: [
          transaction({ date: '2026-09-02', outcome: 100 }),
          transaction({ date: '2026-09-05', outcome: 200 }),
          transaction({ date: '2026-09-20', outcome: 400 }),
          transaction({ date: '2026-09-20', income: 1000 }),
        ],
      },
      { month: '2026-10', today },
    );

    assert.deepEqual(summary.previous, { income: 1000, expense: 700, expenseToDate: 300 });
  });

  it('counts elapsed days for current, past and future months', () => {
    assert.equal(summarizeMonth(base, { month: '2026-10', today }).elapsed, 5);
    assert.equal(summarizeMonth(base, { month: '2026-09', today }).elapsed, 30);
    assert.equal(summarizeMonth(base, { month: '2026-11', today }).elapsed, 0);
  });

  it('takes the whole-month budget when it is set', () => {
    const food = tag();
    const summary = summarizeMonth(
      {
        ...base,
        tag: [food],
        budget: [
          budget({ tag: '00000000-0000-0000-0000-000000000000', outcome: 100_000 }),
          budget({ tag: food.id, outcome: 30_000 }),
        ],
      },
      { month: '2026-10', today },
    );

    assert.equal(summary.budget, 100_000);
  });

  it('otherwise sums category budgets, counting a subcategory only when its parent has none', () => {
    const transport = tag();
    const taxi = tag({ parent: transport.id });
    const home = tag();
    const rent = tag({ parent: home.id });
    const summary = summarizeMonth(
      {
        ...base,
        tag: [transport, taxi, home, rent],
        budget: [
          budget({ tag: transport.id, outcome: 9_000 }),
          budget({ tag: taxi.id, outcome: 5_000 }),
          budget({ tag: rent.id, outcome: 60_000 }),
          budget({ tag: home.id, outcome: 0 }),
          budget({ tag: transport.id, outcome: 1, date: '2026-09-01' }),
        ],
      },
      { month: '2026-10', today },
    );

    assert.equal(summary.budget, 69_000);
  });

  it('has no budget when the month has none', () => {
    assert.equal(summarizeMonth(base, { month: '2026-10', today }).budget, null);
  });
});

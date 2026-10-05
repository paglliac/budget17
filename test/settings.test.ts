import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { Settings } from '../src/settings.ts';
import { regularInput } from './fixtures.ts';

describe('Settings', () => {
  it('adds, edits and deletes regular expenses, listing them by day and title', () => {
    using settings = new Settings(':memory:');
    assert.deepEqual(settings.regularExpenses(), []);

    const school = settings.addRegularExpense(regularInput({ title: 'Школа', amount: 45_000, day: 30 }));
    settings.addRegularExpense(regularInput({ title: 'Телефон', amount: 1_500, day: 2 }));
    settings.addRegularExpense(regularInput({ title: 'Интернет', amount: 1_100, day: 2 }));
    assert.deepEqual(settings.regularExpenses().map((e) => e.title), ['Интернет', 'Телефон', 'Школа']);

    assert.equal(settings.updateRegularExpense(school.id, regularInput({ title: 'Школа', amount: 47_000, day: 1 })), true);
    assert.deepEqual(settings.regularExpenses()[0], { id: school.id, title: 'Школа', amount: 47_000, day: 1, start: null, end: null, icon: null });

    assert.equal(settings.deleteRegularExpense(school.id), true);
    assert.deepEqual(settings.regularExpenses().map((e) => e.title), ['Интернет', 'Телефон']);
  });

  it('keeps the dates and the icon of a regular expense', () => {
    using settings = new Settings(':memory:');
    const loan = settings.addRegularExpense(regularInput({ title: 'Кредит', amount: 12_000, day: 25, end: '2027-03-25', icon: 'card' }));
    assert.deepEqual(settings.regularExpenses(), [{ ...loan, start: null, end: '2027-03-25', icon: 'card' }]);

    settings.updateRegularExpense(loan.id, regularInput({ title: 'Кредит', amount: 12_000, day: 25, start: '2026-11-01' }));
    assert.deepEqual(settings.regularExpenses(), [{ ...loan, start: '2026-11-01', end: null, icon: null }]);
  });

  it('reports an expense that is not there', () => {
    using settings = new Settings(':memory:');

    assert.equal(settings.updateRegularExpense(42, regularInput({ title: 'Нет', amount: 1, day: 1 })), false);
    assert.equal(settings.deleteRegularExpense(42), false);
  });

  it('keeps incomes with the numbers of their model', () => {
    using settings = new Settings(':memory:');

    const salary = settings.addIncome({ title: 'Зарплата', model: 'salary', params: { salary: 200_000, advanceDay: 20, payDay: 5 } });
    settings.addIncome({ title: 'Аренда', model: 'fixed', params: { amount: 100_000, day: 5 } });
    assert.deepEqual(settings.incomes().map((i) => [i.title, i.model]), [['Аренда', 'fixed'], ['Зарплата', 'salary']]);

    assert.equal(settings.updateIncome(salary.id, { ...salary, params: { salary: 210_000, advanceDay: 20, payDay: 5 } }), true);
    assert.deepEqual(settings.incomes()[1], { ...salary, params: { salary: 210_000, advanceDay: 20, payDay: 5 } });

    assert.equal(settings.deleteIncome(salary.id), true);
    assert.equal(settings.deleteIncome(salary.id), false);
    assert.deepEqual(settings.incomes().map((i) => i.title), ['Аренда']);
  });

  it('keeps purchases by week, edits them, marks them bought and deletes them', () => {
    using settings = new Settings(':memory:');

    const boots = settings.addPurchase({ title: 'Ботинки', amount: 8_000, week: '2026-10-12', envelope: 'week', done: false });
    settings.addPurchase({ title: 'Ласты', amount: 5_000, week: '2026-10-05', envelope: 'extra', done: false });
    assert.deepEqual(settings.purchases().map((p) => [p.title, p.envelope]), [['Ласты', 'extra'], ['Ботинки', 'week']]);

    assert.equal(settings.updatePurchase(boots.id, { amount: 7_400, done: true }), true);
    assert.deepEqual(settings.purchases()[1], { ...boots, amount: 7_400, done: true });

    assert.equal(settings.deletePurchase(boots.id), true);
    assert.equal(settings.updatePurchase(boots.id, { done: false }), false);
    assert.deepEqual(settings.purchases().map((p) => p.title), ['Ласты']);
  });

  it('turns a wish into a purchase of a week', () => {
    using settings = new Settings(':memory:');

    const styler = settings.addWish({ title: 'Укладка', amount: 4_500 });
    settings.addWish({ title: 'Пылесос', amount: 30_000 });
    assert.equal(settings.updateWish(styler.id, { title: 'Укладка для волос', amount: 4_500 }), true);

    const planned = settings.planWish(styler.id, { week: '2026-10-05', envelope: 'week' });
    assert.deepEqual(planned && { ...planned, id: 0 }, { id: 0, title: 'Укладка для волос', amount: 4_500, week: '2026-10-05', envelope: 'week', done: false });
    assert.deepEqual(settings.wishes().map((w) => w.title), ['Пылесос']);
    assert.equal(settings.planWish(styler.id, { week: '2026-10-05', envelope: 'week' }), null);
  });

  it('remembers spending moved out of its week, and forgets it when moved back', () => {
    using settings = new Settings(':memory:');

    settings.markSpending('tx-1', 'extra');
    settings.markSpending('tx-2', 'outside');
    settings.markSpending('tx-1', 'outside');
    assert.deepEqual([...settings.spendingMarks()], [['tx-1', 'outside'], ['tx-2', 'outside']]);

    settings.markSpending('tx-1', 'week');
    assert.deepEqual([...settings.spendingMarks()], [['tx-2', 'outside']]);
  });

  it('keeps categories picked for expenses and regular expenses they paid, and forgets them when taken back', () => {
    using settings = new Settings(':memory:');
    const rent = settings.addRegularExpense(regularInput({ title: 'Мастерская аренда', amount: 40_000, day: 10 }));

    settings.categorize('tx-1', { tag: 'groceries' });
    settings.categorize('tx-2', { regular: rent.id });
    settings.categorize('tx-3', { tag: 'cafe' });
    settings.categorize('tx-3', { regular: rent.id });
    settings.categorize('tx-1', null);
    assert.deepEqual([...settings.categorizations()], [['tx-2', { regular: rent.id }], ['tx-3', { regular: rent.id }]]);

    settings.categorize('tx-4', { tag: 'cafe' });
    settings.deleteRegularExpense(rent.id);
    assert.deepEqual([...settings.categorizations()], [['tx-4', { tag: 'cafe' }]], 'deleting the expense unlinks its payments');
  });

  it('keeps expenses in a file between runs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-settings-'));
    try {
      const path = join(dir, 'nested', 'settings.db');
      {
        using settings = new Settings(path);
        settings.addRegularExpense(regularInput({ title: 'Ипотека', amount: 29_000, day: 21 }));
      }
      using settings = new Settings(path);
      assert.deepEqual(settings.regularExpenses(), [{ id: 1, title: 'Ипотека', amount: 29_000, day: 21, start: null, end: null, icon: null }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adds the dates and the icon to a file made before them, keeping its expenses', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-settings-'));
    try {
      const path = join(dir, 'settings.db');
      {
        using db = new DatabaseSync(path);
        db.exec(`CREATE TABLE regular_expense (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          amount REAL NOT NULL CHECK (amount > 0),
          day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31)
        ) STRICT`);
        db.exec(`INSERT INTO regular_expense (title, amount, day) VALUES ('Школа, ЛДК', 45000, 7)`);
      }
      {
        using settings = new Settings(path);
        assert.deepEqual(settings.regularExpenses(), [{ id: 1, title: 'Школа, ЛДК', amount: 45_000, day: 7, start: null, end: null, icon: null }]);
        settings.updateRegularExpense(1, regularInput({ title: 'Школа, ЛДК', amount: 45_000, day: 7, end: '2027-05-31', icon: 'book' }));
      }
      using settings = new Settings(path);
      assert.equal(settings.regularExpenses()[0]?.end, '2027-05-31', 'opening it again changes nothing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

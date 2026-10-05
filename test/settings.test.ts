import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Settings } from '../src/settings.ts';

describe('Settings', () => {
  it('adds, edits and deletes regular expenses, listing them by day and title', () => {
    using settings = new Settings(':memory:');
    assert.deepEqual(settings.regularExpenses(), []);

    const school = settings.addRegularExpense({ title: 'Школа', amount: 45_000, day: 30 });
    settings.addRegularExpense({ title: 'Телефон', amount: 1_500, day: 2 });
    settings.addRegularExpense({ title: 'Интернет', amount: 1_100, day: 2 });
    assert.deepEqual(settings.regularExpenses().map((e) => e.title), ['Интернет', 'Телефон', 'Школа']);

    assert.equal(settings.updateRegularExpense(school.id, { title: 'Школа', amount: 47_000, day: 1 }), true);
    assert.deepEqual(settings.regularExpenses()[0], { id: school.id, title: 'Школа', amount: 47_000, day: 1 });

    assert.equal(settings.deleteRegularExpense(school.id), true);
    assert.deepEqual(settings.regularExpenses().map((e) => e.title), ['Интернет', 'Телефон']);
  });

  it('reports an expense that is not there', () => {
    using settings = new Settings(':memory:');

    assert.equal(settings.updateRegularExpense(42, { title: 'Нет', amount: 1, day: 1 }), false);
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

  it('keeps expenses in a file between runs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-settings-'));
    try {
      const path = join(dir, 'nested', 'settings.db');
      {
        using settings = new Settings(path);
        settings.addRegularExpense({ title: 'Ипотека', amount: 29_000, day: 21 });
      }
      using settings = new Settings(path);
      assert.deepEqual(settings.regularExpenses(), [{ id: 1, title: 'Ипотека', amount: 29_000, day: 21 }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

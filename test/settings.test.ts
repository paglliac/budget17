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

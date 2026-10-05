import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Store } from '../src/store.ts';
import type { Account, Budget } from '../src/zenmoney/types.ts';
import { account, RUB, user } from './fixtures.ts';

describe('Store', () => {
  it('starts empty', () => {
    using store = new Store(':memory:');

    assert.equal(store.serverTimestamp, 0);
    assert.deepEqual(store.load(), {});
  });

  it('saves entities and the server timestamp', () => {
    using store = new Store(':memory:');
    const card = account({ title: 'Карта' });

    const changes = store.apply({ serverTimestamp: 100, instrument: [RUB], user: [user()], account: [card] });

    assert.deepEqual(changes, { initial: true, updated: { instrument: 1, user: 1, account: 1 }, deleted: 0 });
    assert.equal(store.serverTimestamp, 100);
    assert.deepEqual(store.load(), { instrument: [RUB], user: [user()], account: [card] });
  });

  it('replaces changed entities and keeps the rest', () => {
    using store = new Store(':memory:');
    const a = account({ title: 'A', balance: 1 });
    const b = account({ title: 'B', balance: 2 });
    store.apply({ serverTimestamp: 100, account: [a, b] });

    const changes = store.apply({ serverTimestamp: 200, account: [{ ...a, balance: 5 }] });

    assert.deepEqual(changes, { initial: false, updated: { account: 1 }, deleted: 0 });
    assert.equal(store.serverTimestamp, 200);
    const balances = Object.fromEntries((store.load().account ?? []).map((x) => [x.title, x.balance]));
    assert.deepEqual(balances, { A: 5, B: 2 });
  });

  it('removes deleted entities', () => {
    using store = new Store(':memory:');
    const a = account();
    const b = account();
    store.apply({ serverTimestamp: 100, account: [a, b] });

    const changes = store.apply({
      serverTimestamp: 200,
      deletion: [
        { object: 'account', id: a.id, stamp: 150, user: 100 },
        { object: 'account', id: 'never-synced', stamp: 150, user: 100 },
      ],
    });

    assert.equal(changes.deleted, 1);
    assert.deepEqual(store.load().account?.map((x) => x.id), [b.id]);
  });

  it('keys budgets by user, category and month', () => {
    using store = new Store(':memory:');
    const september: Budget = {
      changed: 0,
      user: 100,
      tag: null,
      date: '2026-09-01',
      income: 0,
      incomeLock: false,
      outcome: 1000,
      outcomeLock: false,
    };
    store.apply({ serverTimestamp: 100, budget: [september, { ...september, date: '2026-10-01' }] });

    store.apply({ serverTimestamp: 200, budget: [{ ...september, outcome: 2000 }] });

    assert.deepEqual(
      store.load().budget?.map((b) => [b.date, b.outcome]).sort(),
      [['2026-09-01', 2000], ['2026-10-01', 1000]],
    );
  });

  it('keeps the previous state when saving fails halfway', () => {
    using store = new Store(':memory:');
    store.apply({ serverTimestamp: 100, account: [account({ title: 'Старый' })] });
    const unserializable = account({ balance: 1n as unknown as number });

    assert.throws(() =>
      store.apply({ serverTimestamp: 200, account: [account({ title: 'Новый' }), unserializable] }),
    );

    assert.equal(store.serverTimestamp, 100);
    assert.deepEqual(store.load().account?.map((x: Account) => x.title), ['Старый']);
  });

  it('persists to a file, creating its directory', (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'data', 'zenmoney.db');
    {
      using store = new Store(path);
      store.apply({ serverTimestamp: 100, account: [account({ title: 'Карта' })] });
    }

    using reopened = new Store(path);

    assert.equal(reopened.serverTimestamp, 100);
    assert.equal(reopened.load().account?.[0]?.title, 'Карта');
  });
});

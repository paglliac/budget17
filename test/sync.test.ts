import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Store } from '../src/store.ts';
import { sync } from '../src/sync.ts';
import type { DiffResponse, Timestamp } from '../src/zenmoney/types.ts';
import { account } from './fixtures.ts';

function fakeClient(responses: DiffResponse[]) {
  const requested: Timestamp[] = [];
  return {
    requested,
    async changesSince(serverTimestamp: Timestamp): Promise<DiffResponse> {
      requested.push(serverTimestamp);
      const response = responses.shift();
      assert.ok(response, 'unexpected request');
      return response;
    },
  };
}

describe('sync', () => {
  it('downloads everything first, then only changes since the previous sync', async () => {
    using store = new Store(':memory:');
    const card = account({ title: 'Карта', balance: 100 });
    const client = fakeClient([
      { serverTimestamp: 100, account: [card] },
      { serverTimestamp: 200, account: [{ ...card, balance: 50 }] },
    ]);

    const first = await sync(client, store);
    const second = await sync(client, store);

    assert.deepEqual(client.requested, [0, 100]);
    assert.equal(first.initial, true);
    assert.equal(second.initial, false);
    assert.equal(store.load().account?.[0]?.balance, 50);
  });
});

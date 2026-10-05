import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ZenMoneyClient, ZenMoneyError } from '../src/zenmoney/client.ts';

function fakeFetch(response: Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response;
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

describe('ZenMoneyClient', () => {
  it('posts a full-sync diff request with the bearer token', async () => {
    const { fetch, calls } = fakeFetch(Response.json({ serverTimestamp: 42, account: [] }));
    const client = new ZenMoneyClient('secret', { fetch });

    const result = await client.fetchAll();

    assert.equal(result.serverTimestamp, 42);
    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.equal(call?.url, 'https://api.zenmoney.ru/v8/diff/');
    assert.equal(call?.init.method, 'POST');
    assert.equal((call?.init.headers as Record<string, string>).Authorization, 'Bearer secret');
    const body = JSON.parse(String(call?.init.body));
    assert.equal(body.serverTimestamp, 0);
    assert.ok(Math.abs(body.currentClientTimestamp - Date.now() / 1000) < 5);
  });

  it('requests changes since the given server timestamp', async () => {
    const { fetch, calls } = fakeFetch(Response.json({ serverTimestamp: 200 }));
    const client = new ZenMoneyClient('t', { fetch });

    await client.changesSince(100);

    assert.equal(JSON.parse(String(calls[0]?.init.body)).serverTimestamp, 100);
  });

  it('explains how to get a new token on 401', async () => {
    const { fetch } = fakeFetch(new Response('Unauthorized', { status: 401 }));
    const client = new ZenMoneyClient('expired', { fetch });

    await assert.rejects(client.fetchAll(), (error) => {
      assert.ok(error instanceof ZenMoneyError);
      assert.equal(error.status, 401);
      assert.match(error.message, /zerro\.app\/token/);
      return true;
    });
  });

  it('includes the response body in other errors', async () => {
    const { fetch } = fakeFetch(new Response('boom', { status: 500 }));
    const client = new ZenMoneyClient('t', { fetch });

    await assert.rejects(client.fetchAll(), /500: boom/);
  });
});

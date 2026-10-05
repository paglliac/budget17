import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { demoCollections } from '../src/web/demo.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import { loadDashboard, renderDashboard } from '../src/web/pages/dashboard.ts';
import { account, reminderMarker, RUB, tag, transaction, user } from './fixtures.ts';

const today = '2026-10-05';
const options = { today, month: null, hour: 14, source: 'zenmoney' as const, canSync: true, regular: [] };
const link = createHref();

function data(): EntityCollections {
  const food = tag({ title: 'Продукты' });
  return {
    instrument: [RUB],
    user: [user({ login: 'kir' })],
    account: [account({ id: 'card', title: 'Т-Банк', balance: 12_345.6 }), account({ title: 'Брокер', balance: 500, inBalance: false })],
    tag: [food],
    transaction: [
      transaction({ date: '2026-10-02', outcome: 1500, tag: [food.id], payee: '<b>Лавка</b>' }),
      transaction({ date: '2026-10-03', income: 50_000 }),
    ],
    reminderMarker: [reminderMarker({ date: '2026-10-07', outcome: 650, payee: 'Т-Мобайл' })],
  };
}

describe('dashboard', () => {
  it('shows the month, categories, upcoming payments and accounts', () => {
    const page = String(renderDashboard(loadDashboard(data(), options), link));

    assert.ok(page.includes('Добрый день'));
    assert.ok(page.includes('В октябре вы потратили 1 500 ₽.'));
    assert.ok(page.includes('Продукты'));
    assert.ok(page.includes('Т-Мобайл'));
    assert.ok(page.includes('12 345<span>,60 ₽</span>'));
    assert.ok(page.includes('Не учитываются в балансе'));
    assert.ok(page.includes('action="/sync"'));
  });

  it('adds regular expenses to the planned payments and the calendar', () => {
    const regular = [
      { id: 1, title: 'Аренда', amount: 40_000, day: 10 },
      { id: 2, title: 'Связь', amount: 600, day: 1 },
    ];
    const dashboard = loadDashboard(data(), { ...options, regular });

    assert.deepEqual(
      dashboard.planned.slice(0, 3).map((p) => [p.date, p.title, p.amount]),
      [
        ['2026-10-07', 'Т-Мобайл', 650],
        ['2026-10-10', 'Аренда', 40_000],
        ['2026-11-01', 'Связь', 600],
      ],
    );
    const page = String(renderDashboard(dashboard, link));
    assert.ok(page.includes('Аренда'));
    assert.ok(page.includes('href="/regular"'), 'the rail links to regular expenses');
  });

  it('links categories and figures to the operations they come from', () => {
    const page = String(renderDashboard(loadDashboard(data(), { ...options, month: '2026-09' }), link));

    assert.ok(page.includes('href="/operations?month=2026-09&amp;kind=expense"'));
    assert.ok(page.includes('href="/operations?month=2026-09&amp;kind=income"'));
    assert.ok(page.includes('href="/operations"'), 'the rail links to operations');
  });

  it('falls back to the current month for a month in the future or a malformed one', () => {
    assert.equal(loadDashboard(data(), { ...options, month: '2026-11' }).month.month, '2026-10');
    assert.equal(loadDashboard(data(), { ...options, month: 'oct' }).month.month, '2026-10');
    assert.equal(loadDashboard(data(), { ...options, month: '2026-09' }).month.month, '2026-09');
  });

  it('offers no sync without a token and says when the data is a demo', () => {
    const page = String(renderDashboard(loadDashboard(demoCollections(today), { ...options, source: 'demo', canSync: false }), link));

    assert.ok(!page.includes('action="/sync"'));
    assert.ok(page.includes('Демо-данные'));
  });
});

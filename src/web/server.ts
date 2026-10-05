// Web UI on localhost: the overview at /, operations at /operations, the widget storyboard at /storyboard.
// Reads the local ZenMoney copy (data/zenmoney.db) and syncs it on start and on POST /sync when ZENMONEY_TOKEN
// is set. Without a local copy, or with ?demo, it shows demo data.

import { existsSync, readFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { localDate } from '../dates.ts';
import { renderSyncResult } from '../format.ts';
import { Store } from '../store.ts';
import { sync } from '../sync.ts';
import { ZenMoneyClient } from '../zenmoney/client.ts';
import type { EntityCollections } from '../zenmoney/types.ts';
import { demoCollections } from './demo.ts';
import { escape } from './html.ts';
import { createHref } from './pages/chrome.ts';
import { loadDashboard, renderDashboard } from './pages/dashboard.ts';
import { loadOperations, renderOperations } from './pages/operations.ts';
import { renderStoryboard } from './pages/storyboard.ts';
import { WIDGET_DOCS } from './stories.ts';

const DB_PATH = fileURLToPath(new URL('../../data/zenmoney.db', import.meta.url));
const STYLES_PATH = fileURLToPath(new URL('./styles.css', import.meta.url));
const PORT = Number(process.env.PORT ?? 4317);
const token = process.env.ZENMONEY_TOKEN;

async function syncNow(): Promise<void> {
  if (!token) return;
  using store = new Store(DB_PATH);
  console.log(renderSyncResult(await sync(new ZenMoneyClient(token), store)));
}

function loadCollections(demo: boolean, today: string): EntityCollections {
  if (demo) return demoCollections(today);
  using store = new Store(DB_PATH);
  return store.load();
}

function send(response: ServerResponse, status: number, type: string, body: string): void {
  response.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' }).end(body);
}

try {
  await syncNow();
} catch (error) {
  console.error('Не удалось синхронизироваться, показываю локальную копию:', error instanceof Error ? error.message : error);
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  try {
    if (request.method === 'POST' && url.pathname === '/sync') {
      await syncNow();
      const back = new URL(request.headers.referer ?? '/', 'http://localhost');
      response.writeHead(303, { location: `${back.pathname}${back.search}` }).end();
      return;
    }
    if (request.method !== 'GET') {
      send(response, 405, 'text/plain', 'Метод не поддерживается');
      return;
    }
    const params = url.searchParams;
    const today = localDate();
    const demo = params.has('demo') || !existsSync(DB_PATH);
    const href = createHref(params.has('demo') ? { demo: '1' } : {});
    switch (url.pathname) {
      case '/': {
        const dashboard = loadDashboard(loadCollections(demo, today), {
          today,
          month: params.get('month'),
          hour: new Date().getHours(),
          source: demo ? 'demo' : 'zenmoney',
          canSync: Boolean(token) && !demo,
        });
        send(response, 200, 'text/html', renderDashboard(dashboard, href).toString());
        return;
      }
      case '/operations': {
        const operations = loadOperations(loadCollections(demo, today), {
          today,
          month: params.get('month'),
          kind: params.get('kind'),
          category: params.get('category'),
          query: params.get('q'),
        });
        send(response, 200, 'text/html', renderOperations(operations, href).toString());
        return;
      }
      case '/storyboard':
        send(response, 200, 'text/html', renderStoryboard(WIDGET_DOCS, readFileSync(STYLES_PATH, 'utf8')).toString());
        return;
      case '/styles.css':
        send(response, 200, 'text/css', readFileSync(STYLES_PATH, 'utf8'));
        return;
      default:
        send(response, 404, 'text/plain', 'Страница не найдена');
    }
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    send(response, 500, 'text/html', `<p>Не удалось показать страницу: ${escape(message)}</p>`);
  }
}).listen(PORT, () => {
  console.log(`Обзор:    http://localhost:${PORT}/`);
  console.log(`Операции: http://localhost:${PORT}/operations`);
  console.log(`Виджеты:  http://localhost:${PORT}/storyboard`);
  if (!existsSync(DB_PATH)) console.log('Локальной копии ZenMoney нет, показываю демо-данные. Запустите make sync.');
});

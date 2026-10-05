// Web UI on localhost: the week's budget at /, operations at /operations, incomes at /income, regular expenses at
// /regular, the widget storyboard at /storyboard. Reads the local ZenMoney copy (data/zenmoney.db) and syncs it on
// start and on POST /sync when ZENMONEY_TOKEN is set. Without a local copy, or with ?demo, it shows demo data.
// Purchases, wishes, spending marks, incomes and regular expenses are the app's own data (data/settings.db),
// so demo mode leaves them as they are.

import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { localDate } from '../dates.ts';
import { renderSyncResult } from '../format.ts';
import { Settings } from '../settings.ts';
import { Store } from '../store.ts';
import { sync } from '../sync.ts';
import { ZenMoneyClient } from '../zenmoney/client.ts';
import type { EntityCollections } from '../zenmoney/types.ts';
import { demoCollections } from './demo.ts';
import { escape } from './html.ts';
import { createHref } from './pages/chrome.ts';
import { budgetOf, loadDashboard, renderDashboard, submitDashboard, type DashboardForm, type SavedBudget } from './pages/dashboard.ts';
import { loadIncome, renderIncome, submitIncome } from './pages/income.ts';
import { loadOperations, renderOperations } from './pages/operations.ts';
import { loadRegular, renderRegular, submitRegular } from './pages/regular.ts';
import { renderStoryboard } from './pages/storyboard.ts';
import { WIDGET_DOCS } from './stories.ts';

const DB_PATH = fileURLToPath(new URL('../../data/zenmoney.db', import.meta.url));
const SETTINGS_PATH = fileURLToPath(new URL('../../data/settings.db', import.meta.url));
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

function loadSettings<T>(read: (settings: Settings) => T): T {
  using settings = new Settings(SETTINGS_PATH);
  return read(settings);
}

function savedBudget(settings: Settings): SavedBudget {
  return { purchases: settings.purchases(), wishes: settings.wishes(), marks: settings.spendingMarks(), regular: settings.regularExpenses() };
}

/** The page a form was sent from, without the entry it had open, so saving closes the form. */
function backTo(request: IncomingMessage): URL {
  const back = new URL(request.headers.referer ?? '/', 'http://localhost');
  back.searchParams.delete('edit');
  return back;
}

/** Browsers send Origin with every POST, so a page of another site cannot change data here. */
function isSameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  return origin === undefined || origin === `http://${request.headers.host}`;
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > 65_536) throw new Error('Слишком большая форма');
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function send(response: ServerResponse, status: number, type: string, body: string): void {
  response.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' }).end(body);
}

function dashboardPage(
  collections: EntityCollections,
  saved: SavedBudget,
  params: URLSearchParams,
  today: string,
  demo: boolean,
  href: ReturnType<typeof createHref>,
  form?: DashboardForm,
): string {
  const dashboard = loadDashboard(collections, saved, {
    today,
    view: params.get('view'),
    week: params.get('week'),
    edit: params.get('edit'),
    form,
    source: demo ? 'demo' : 'zenmoney',
    canSync: Boolean(token) && !demo,
  });
  return renderDashboard(dashboard, href).toString();
}

try {
  await syncNow();
} catch (error) {
  console.error('Не удалось синхронизироваться, показываю локальную копию:', error instanceof Error ? error.message : error);
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const params = url.searchParams;
  const today = localDate();
  const demo = params.has('demo') || !existsSync(DB_PATH);
  const href = createHref(params.has('demo') ? { demo: '1' } : {});
  try {
    if (request.method === 'POST' && !isSameOrigin(request)) {
      send(response, 403, 'text/plain', 'Запрос с другого сайта');
      return;
    }
    if (request.method === 'POST' && url.pathname === '/sync') {
      await syncNow();
      const back = new URL(request.headers.referer ?? '/', 'http://localhost');
      response.writeHead(303, { location: `${back.pathname}${back.search}` }).end();
      return;
    }
    if (request.method === 'POST' && /^\/(purchases|wishes|spending)(\/|$)/.test(url.pathname)) {
      const body = await readForm(request);
      using settings = new Settings(SETTINGS_PATH);
      const collections = loadCollections(demo, today);
      const result = submitDashboard(settings, url.pathname, body, {
        today,
        budget: () => budgetOf(collections, savedBudget(settings), { today }),
      });
      const back = backTo(request);
      if (result.status === 'saved') {
        response.writeHead(303, { location: `${back.pathname}${back.search}` }).end();
      } else if (result.status === 'missing') {
        send(response, 404, 'text/plain', 'Такой записи нет');
      } else {
        send(response, 422, 'text/html', dashboardPage(collections, savedBudget(settings), back.searchParams, today, demo, href, result.form));
      }
      return;
    }
    if (request.method === 'POST' && url.pathname.startsWith('/regular')) {
      const body = await readForm(request);
      using settings = new Settings(SETTINGS_PATH);
      const result = submitRegular(settings, url.pathname, body);
      if (result.status === 'saved') {
        response.writeHead(303, { location: href('/regular') }).end();
      } else if (result.status === 'missing') {
        send(response, 404, 'text/plain', 'Такой регулярной траты нет');
      } else {
        const page = loadRegular(loadCollections(demo, today), settings.regularExpenses(), { today, form: result.form });
        send(response, 422, 'text/html', renderRegular(page, href).toString());
      }
      return;
    }
    if (request.method === 'POST' && url.pathname.startsWith('/income')) {
      const body = await readForm(request);
      using settings = new Settings(SETTINGS_PATH);
      const result = submitIncome(settings, url.pathname, body);
      if (result.status === 'saved') {
        response.writeHead(303, { location: href('/income') }).end();
      } else if (result.status === 'missing') {
        send(response, 404, 'text/plain', 'Такого дохода нет');
      } else {
        const page = loadIncome(loadCollections(demo, today), settings.incomes(), { today, form: result.form });
        send(response, 422, 'text/html', renderIncome(page, href).toString());
      }
      return;
    }
    if (request.method !== 'GET') {
      send(response, 405, 'text/plain', 'Метод не поддерживается');
      return;
    }
    switch (url.pathname) {
      case '/':
        send(response, 200, 'text/html', dashboardPage(loadCollections(demo, today), loadSettings(savedBudget), params, today, demo, href));
        return;
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
      case '/regular': {
        const page = loadRegular(loadCollections(demo, today), loadSettings((s) => s.regularExpenses()), { today, edit: params.get('edit') });
        send(response, 200, 'text/html', renderRegular(page, href).toString());
        return;
      }
      case '/income': {
        const page = loadIncome(loadCollections(demo, today), loadSettings((s) => s.incomes()), {
          today,
          edit: params.get('edit'),
          add: params.get('add'),
        });
        send(response, 200, 'text/html', renderIncome(page, href).toString());
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
  console.log(`Обзор:      http://localhost:${PORT}/`);
  console.log(`Операции:   http://localhost:${PORT}/operations`);
  console.log(`Доходы:     http://localhost:${PORT}/income`);
  console.log(`Регулярные: http://localhost:${PORT}/regular`);
  console.log(`Виджеты:    http://localhost:${PORT}/storyboard`);
  if (!existsSync(DB_PATH)) console.log('Локальной копии ZenMoney нет, показываю демо-данные. Запустите make sync.');
});

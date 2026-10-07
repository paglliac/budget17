// Web UI and the JSON API of the iPhone app: the week's budget at /, operations at /operations, expenses without a
// category at /uncategorized, incomes at /income, regular expenses at /regular, the day a week begins on and categories
// at /settings, the widget
// storyboard at /storyboard, and the same screens as JSON under /api (see api.ts). Forms post to the same paths
// whether they come from a page or, under /api, from the app, which gets JSON back instead of a redirect. Reads the
// local ZenMoney copy (data/zenmoney.db) and syncs it on start, every SYNC_MINUTES and on POST /sync when
// ZENMONEY_TOKEN is set. Without a local copy, or with ?demo, it shows demo data. Purchases, wishes, how expenses are
// marked, categories, incomes and regular expenses are the app's own data (data/settings.db), so demo mode leaves
// them as they are. With ACCESS_TOKEN set every request needs it (see auth.ts), for a server open to the internet.

import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { mainCurrency } from '../balances.ts';
import { localDate } from '../dates.ts';
import { renderSyncResult } from '../format.ts';
import { Settings } from '../settings.ts';
import { Store } from '../store.ts';
import { sync } from '../sync.ts';
import { ZenMoneyClient } from '../zenmoney/client.ts';
import type { EntityCollections } from '../zenmoney/types.ts';
import {
  budgetSettingsScreen,
  categoriesScreen,
  incomeScreen,
  monthScreen,
  operationsScreen,
  regularScreen,
  spendingScreen,
  uncategorizedScreen,
  weekScreen,
  widgetScreen,
  withRubleSign,
} from './api.ts';
import { isAccessToken, isAuthorized, sessionCookie } from './auth.ts';
import { demoCollections } from './demo.ts';
import { escape } from './html.ts';
import { createHref, userName } from './pages/chrome.ts';
import { budgetOf, loadDashboard, renderDashboard, submitDashboard, type DashboardForm, type SavedBudget } from './pages/dashboard.ts';
import { loadIncome, renderIncome, submitIncome } from './pages/income.ts';
import { renderLogin } from './pages/login.ts';
import { loadOperations, renderOperations } from './pages/operations.ts';
import { submitMarking, type SavedMarking } from './pages/marking.ts';
import { loadRegular, renderRegular, submitRegular } from './pages/regular.ts';
import { loadSettingsPage, renderSettings, submitBudget, submitSettings } from './pages/settings.ts';
import { renderStoryboard } from './pages/storyboard.ts';
import { loadUncategorized, renderUncategorized } from './pages/uncategorized.ts';
import { WIDGET_DOCS } from './stories.ts';

const DB_PATH = fileURLToPath(new URL('../../data/zenmoney.db', import.meta.url));
const SETTINGS_PATH = fileURLToPath(new URL('../../data/settings.db', import.meta.url));
const STYLES_PATH = fileURLToPath(new URL('./styles.css', import.meta.url));
const PORT = Number(process.env.PORT ?? 4317);
/** The address to listen on; every interface unless set, 127.0.0.1 behind a proxy on a server. */
const HOST = process.env.HOST || undefined;
const token = process.env.ZENMONEY_TOKEN;
const accessToken = process.env.ACCESS_TOKEN || undefined;
/** How often the server syncs by itself, so the app finds fresh data; 0 turns it off. */
const SYNC_MINUTES = Number(process.env.SYNC_MINUTES ?? 10);

let syncing: Promise<void> | null = null;
let syncedAt: Date | null = null;

/** Syncs with ZenMoney; a sync asked for while one runs waits for that one instead of starting another. */
function syncNow(): Promise<void> {
  if (!token) return Promise.resolve();
  syncing ??= (async () => {
    using store = new Store(DB_PATH);
    console.log(renderSyncResult(await sync(new ZenMoneyClient(token), store)));
    syncedAt = new Date();
  })().finally(() => {
    syncing = null;
  });
  return syncing;
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

function savedMarking(settings: Settings): SavedMarking {
  return {
    categorizations: settings.categorizations(),
    purchasePayments: settings.purchasePayments(),
    regular: settings.regularExpenses(),
    purchases: settings.purchases(),
    marks: settings.spendingMarks(),
    categories: settings.categorySetup(),
    weekStart: settings.weekStart(),
  };
}

function savedBudget(settings: Settings): SavedBudget {
  return { ...savedMarking(settings), weekLimits: settings.weekLimits(), wishes: settings.wishes() };
}

/** The page a form was sent from, without the entry it had open, so saving closes the form. */
function backTo(request: IncomingMessage): string {
  const back = new URL(request.headers.referer ?? '/', 'http://localhost');
  back.searchParams.delete('edit');
  return `${back.pathname}${back.search}`;
}

/**
 * Browsers send Origin with every POST, so a page of another site cannot change data here. Behind a proxy that ends
 * HTTPS the server itself sees plain HTTP, so either scheme of its own host will do. The app sends no Origin.
 */
function isSameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  return origin === undefined || origin === `http://${request.headers.host}` || origin === `https://${request.headers.host}`;
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

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  send(response, status, 'application/json', JSON.stringify(value));
}

function redirect(response: ServerResponse, location: string, headers: Record<string, string> = {}): void {
  response.writeHead(303, { location, ...headers }).end();
}

/** Where a login sends the browser: a path of this site, never another site. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

interface Context {
  today: string;
  demo: boolean;
  href: ReturnType<typeof createHref>;
}

function dashboardPage(params: URLSearchParams, { today, demo, href }: Context, form?: DashboardForm): string {
  const dashboard = loadDashboard(loadCollections(demo, today), loadSettings(savedBudget), {
    today,
    view: params.get('view'),
    week: params.get('week'),
    month: params.get('month'),
    edit: params.get('edit'),
    form,
    source: demo ? 'demo' : 'zenmoney',
    canSync: Boolean(token) && !demo,
  });
  return renderDashboard(dashboard, href).toString();
}

/**
 * What a posted form did: saved, with where a page goes next; nothing to change, with why; or invalid, with what to
 * fix by field and the page that shows the form again with it.
 */
type FormResult =
  | { status: 'saved'; next: string }
  | { status: 'missing'; message: string }
  | { status: 'invalid'; errors: Record<string, string>; page: () => string };

/** Applies a form posted to `path`, a page's form path; null when no form posts there. */
function submitForm(path: string, body: URLSearchParams, request: IncomingMessage, context: Context): FormResult | null {
  const { today, demo, href } = context;
  if (/^\/(purchases|wishes|week-limits)(\/|$)/.test(path)) {
    using settings = new Settings(SETTINGS_PATH);
    const collections = loadCollections(demo, today);
    const result = submitDashboard(settings, path, body, { today, budget: () => budgetOf(collections, savedBudget(settings), { today }) });
    if (result.status === 'saved') return { status: 'saved', next: backTo(request) };
    if (result.status === 'missing') return { status: 'missing', message: 'Такой записи нет' };
    const back = new URL(backTo(request), 'http://localhost');
    return { status: 'invalid', errors: result.form.errors, page: () => dashboardPage(back.searchParams, context, result.form) };
  }
  if (path.startsWith('/spending/')) {
    using settings = new Settings(SETTINGS_PATH);
    const result = submitMarking(settings, loadCollections(demo, today), path, body);
    return result.status === 'saved'
      ? { status: 'saved', next: backTo(request) }
      : { status: 'missing', message: 'Такой траты, категории, регулярной траты или покупки нет' };
  }
  if (/^\/categories(\/|$)/.test(path)) {
    using settings = new Settings(SETTINGS_PATH);
    const collections = loadCollections(demo, today);
    const result = submitSettings(settings, collections, path, body);
    if (result.status === 'saved') return { status: 'saved', next: href('/settings') };
    if (result.status === 'missing') return { status: 'missing', message: 'Такой категории нет' };
    const page = () => renderSettings(loadSettingsPage(collections, loadSettings(savedMarking), { today, form: result.form }), href).toString();
    return { status: 'invalid', errors: { title: result.form.error }, page };
  }
  if (path.startsWith('/budget/')) {
    using settings = new Settings(SETTINGS_PATH);
    return submitBudget(settings, path).status === 'saved' ? { status: 'saved', next: href('/settings') } : { status: 'missing', message: 'Такого дня недели нет' };
  }
  if (/^\/regular(\/|$)/.test(path)) {
    using settings = new Settings(SETTINGS_PATH);
    const result = submitRegular(settings, path, body);
    if (result.status === 'saved') return { status: 'saved', next: href('/regular') };
    if (result.status === 'missing') return { status: 'missing', message: 'Такой регулярной траты нет' };
    const page = () => renderRegular(loadRegular(loadCollections(demo, today), loadSettings(savedMarking), { today, form: result.form }), href).toString();
    return { status: 'invalid', errors: result.form.errors, page };
  }
  if (/^\/income(\/|$)/.test(path)) {
    using settings = new Settings(SETTINGS_PATH);
    const result = submitIncome(settings, path, body);
    if (result.status === 'saved') return { status: 'saved', next: href('/income') };
    if (result.status === 'missing') return { status: 'missing', message: 'Такого дохода нет' };
    const page = () => renderIncome(loadIncome(loadCollections(demo, today), loadSettings((s) => s.incomes()), { today, form: result.form }), href).toString();
    return { status: 'invalid', errors: result.form.errors, page };
  }
  return null;
}

/** A screen of the app as JSON (see api.ts); null when there is none at the path. */
function apiScreen(path: string, params: URLSearchParams, { today, demo }: Context): unknown {
  const budget = { today, source: demo ? ('demo' as const) : ('zenmoney' as const), canSync: Boolean(token) && !demo };
  const collections = () => withRubleSign(loadCollections(demo, today));
  const spending = /^\/api\/spending\/([\w-]+)$/.exec(path);
  if (spending) return spendingScreen(collections(), loadSettings(savedMarking), { today, id: spending[1]! });
  switch (path) {
    case '/api/session': {
      const data = collections();
      return { user: userName(data), symbol: mainCurrency(data).symbol, ...budget, syncedAt: syncedAt?.toISOString() ?? null };
    }
    case '/api/week':
      return weekScreen(collections(), loadSettings(savedBudget), { ...budget, week: params.get('week') });
    case '/api/month':
      return monthScreen(collections(), loadSettings(savedBudget), { ...budget, month: params.get('month') });
    case '/api/operations':
      return operationsScreen(collections(), loadSettings(savedMarking), {
        today,
        month: params.get('month'),
        kind: params.get('kind'),
        category: params.get('category'),
        query: params.get('q'),
      });
    case '/api/uncategorized':
      return uncategorizedScreen(collections(), loadSettings(savedMarking), { today, month: params.get('month') });
    case '/api/regular':
      return regularScreen(collections(), loadSettings(savedMarking), { today });
    case '/api/income':
      return incomeScreen(collections(), loadSettings((s) => s.incomes()), { today });
    case '/api/categories':
      return categoriesScreen(collections(), loadSettings(savedMarking), { today });
    case '/api/budget-settings':
      return budgetSettingsScreen(collections(), loadSettings(savedMarking));
    case '/api/widget':
      return widgetScreen(collections(), loadSettings(savedBudget), { today });
    default:
      return null;
  }
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const params = url.searchParams;
  const isApi = url.pathname.startsWith('/api/');
  const context: Context = {
    today: localDate(),
    demo: params.has('demo') || !existsSync(DB_PATH),
    href: createHref(params.has('demo') ? { demo: '1' } : {}),
  };
  const { today, demo, href } = context;

  if (request.method === 'POST' && !isSameOrigin(request)) {
    send(response, 403, 'text/plain', 'Запрос с другого сайта');
    return;
  }
  if (url.pathname === '/login') {
    if (!accessToken) {
      redirect(response, '/');
    } else if (request.method === 'POST') {
      const body = await readForm(request);
      const next = safeNext(body.get('next'));
      if (isAccessToken(body.get('token') ?? '', accessToken)) {
        redirect(response, next, { 'set-cookie': sessionCookie(accessToken, request.headers['x-forwarded-proto'] === 'https') });
      } else {
        send(response, 401, 'text/html', renderLogin({ next, error: 'Токен не подошёл' }).toString());
      }
    } else {
      send(response, 200, 'text/html', renderLogin({ next: safeNext(params.get('next')) }).toString());
    }
    return;
  }
  if (url.pathname !== '/styles.css' && !isAuthorized(request.headers, accessToken)) {
    if (isApi) sendJson(response, 401, { error: 'Нужен токен доступа' });
    else if (request.method === 'GET') redirect(response, `/login?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
    else send(response, 401, 'text/plain', 'Нужен вход');
    return;
  }

  if (request.method === 'POST') {
    const path = isApi ? url.pathname.slice('/api'.length) : url.pathname;
    if (path === '/sync') {
      await syncNow();
      if (isApi) {
        sendJson(response, 200, { status: 'saved', syncedAt: syncedAt?.toISOString() ?? null });
      } else {
        const back = new URL(request.headers.referer ?? '/', 'http://localhost');
        redirect(response, `${back.pathname}${back.search}`);
      }
      return;
    }
    const result = submitForm(path, await readForm(request), request, context);
    if (result === null) {
      if (isApi) sendJson(response, 404, { error: 'Такого действия нет' });
      else send(response, 405, 'text/plain', 'Метод не поддерживается');
    } else if (result.status === 'saved') {
      if (isApi) sendJson(response, 200, { status: 'saved' });
      else redirect(response, result.next);
    } else if (result.status === 'missing') {
      if (isApi) sendJson(response, 404, { error: result.message });
      else send(response, 404, 'text/plain', result.message);
    } else {
      if (isApi) sendJson(response, 422, { errors: result.errors });
      else send(response, 422, 'text/html', result.page());
    }
    return;
  }
  if (request.method !== 'GET') {
    send(response, 405, 'text/plain', 'Метод не поддерживается');
    return;
  }
  if (isApi) {
    const screen = apiScreen(url.pathname, params, context);
    if (screen === null) sendJson(response, 404, { error: 'Такого экрана нет' });
    else sendJson(response, 200, screen);
    return;
  }
  switch (url.pathname) {
    case '/':
      send(response, 200, 'text/html', dashboardPage(params, context));
      return;
    case '/operations': {
      const operations = loadOperations(loadCollections(demo, today), loadSettings(savedMarking), {
        today,
        month: params.get('month'),
        kind: params.get('kind'),
        category: params.get('category'),
        query: params.get('q'),
        edit: params.get('edit'),
      });
      send(response, 200, 'text/html', renderOperations(operations, href).toString());
      return;
    }
    case '/uncategorized': {
      const page = loadUncategorized(loadCollections(demo, today), loadSettings(savedMarking), {
        today,
        month: params.get('month'),
        edit: params.get('edit'),
      });
      send(response, 200, 'text/html', renderUncategorized(page, href).toString());
      return;
    }
    case '/regular': {
      const page = loadRegular(loadCollections(demo, today), loadSettings(savedMarking), { today, edit: params.get('edit') });
      send(response, 200, 'text/html', renderRegular(page, href).toString());
      return;
    }
    case '/settings': {
      const page = loadSettingsPage(loadCollections(demo, today), loadSettings(savedMarking), { today, edit: params.get('edit') });
      send(response, 200, 'text/html', renderSettings(page, href).toString());
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
}

try {
  await syncNow();
} catch (error) {
  console.error('Не удалось синхронизироваться, показываю локальную копию:', error instanceof Error ? error.message : error);
}
if (token && SYNC_MINUTES > 0) {
  setInterval(() => {
    syncNow().catch((error: unknown) => console.error('Не удалось синхронизироваться:', error instanceof Error ? error.message : error));
  }, SYNC_MINUTES * 60_000);
}

createServer(async (request, response) => {
  try {
    await handle(request, response);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    if (request.url?.startsWith('/api/')) sendJson(response, 500, { error: message });
    else send(response, 500, 'text/html', `<p>Не удалось показать страницу: ${escape(message)}</p>`);
  }
}).listen(PORT, HOST, () => {
  console.log(`Обзор:         http://localhost:${PORT}/`);
  console.log(`Операции:      http://localhost:${PORT}/operations`);
  console.log(`Без категории: http://localhost:${PORT}/uncategorized`);
  console.log(`Доходы:        http://localhost:${PORT}/income`);
  console.log(`Регулярные:    http://localhost:${PORT}/regular`);
  console.log(`Настройки:     http://localhost:${PORT}/settings`);
  console.log(`Виджеты:       http://localhost:${PORT}/storyboard`);
  console.log(`API:           http://localhost:${PORT}/api/week`);
  if (accessToken) console.log('Нужен токен доступа (ACCESS_TOKEN): браузер войдёт через /login, приложение пришлёт его в Authorization.');
  if (!existsSync(DB_PATH)) console.log('Локальной копии ZenMoney нет, показываю демо-данные. Запустите make sync.');
});

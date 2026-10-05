// PROTOTYPE, throwaway. Question: what should the main screen of the budget app look like?
// Four structurally different variants of one screen (balances, month spending, budgets, planned payments)
// on a single local page, switchable via ?variant=A|B|C|D or the floating bar at the bottom (← / → work too).
//
//   npm run prototype   →   http://localhost:4317
//
// Data: the local ZenMoney copy in data/zenmoney.db, synced on start when ZENMONEY_TOKEN is set; demo data when
// there is no database yet or with ?demo. Other params: ?month=yyyy-MM. Nothing is ever written back.

import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { renderSyncResult } from '../format.ts';
import { Store } from '../store.ts';
import { sync } from '../sync.ts';
import { ZenMoneyClient } from '../zenmoney/client.ts';
import type { EntityCollections } from '../zenmoney/types.ts';
import { buildDashboard } from './data.ts';
import { demoCollections } from './demo.ts';
import { esc, localToday, type Variant } from './shared.ts';
import { switcher } from './switcher.ts';
import { variantA } from './variant-a.ts';
import { variantB } from './variant-b.ts';
import { variantC } from './variant-c.ts';
import { variantD } from './variant-d.ts';

const DB_PATH = fileURLToPath(new URL('../../data/zenmoney.db', import.meta.url));
const PORT = Number(process.env.PORT ?? 4317);
const VARIANTS: Variant[] = [variantA, variantB, variantC, variantD];

const token = process.env.ZENMONEY_TOKEN;
if (token) {
  try {
    using store = new Store(DB_PATH);
    console.log(renderSyncResult(await sync(new ZenMoneyClient(token), store)));
  } catch (error) {
    console.error('Не удалось синхронизироваться, показываю локальную копию:', error instanceof Error ? error.message : error);
  }
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname !== '/') {
    response.writeHead(404).end();
    return;
  }
  try {
    const variant = VARIANTS.find((v) => v.key === url.searchParams.get('variant')?.toUpperCase()) ?? VARIANTS[0]!;
    const today = process.env.PROTOTYPE_TODAY ?? localToday();
    const demo = url.searchParams.has('demo') || !existsSync(DB_PATH);
    let collections: EntityCollections;
    if (demo) {
      collections = demoCollections(today);
    } else {
      using store = new Store(DB_PATH);
      collections = store.load();
    }
    const dashboard = buildDashboard(collections, { today, month: url.searchParams.get('month'), source: demo ? 'demo' : 'zenmoney' });
    const link = (params: Record<string, string | null>) => {
      const next = new URLSearchParams(url.searchParams);
      for (const [key, value] of Object.entries(params)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      return `?${next}`;
    };
    let html = variant.render(dashboard, { link });
    if (process.env.NODE_ENV !== 'production') {
      html = html.replace('</body>', `${switcher(VARIANTS, variant.key, dashboard.source)}\n</body>`);
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { 'content-type': 'text/html; charset=utf-8' }).end(`<pre>${esc(error instanceof Error ? error.stack : error)}</pre>`);
  }
}).listen(PORT, () => {
  console.log(`Прототип: http://localhost:${PORT}`);
  for (const v of VARIANTS) console.log(`  ${v.key}  ${v.name.padEnd(10)} http://localhost:${PORT}/?variant=${v.key}`);
  console.log(existsSync(DB_PATH) ? 'Данные: data/zenmoney.db (демо: добавьте &demo)' : 'Данные: демо (запустите make sync для своих)');
});

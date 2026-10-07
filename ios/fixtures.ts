// Writes every screen of the JSON API into a folder, made from demo data and a few entries of the app's own, for
// ios/FixtureCheck to read with the app's models (make ios-check). data/ is neither read nor written.
//   node ios/fixtures.ts <folder>

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Settings } from '../src/settings.ts';
import {
  categoriesScreen,
  incomeScreen,
  monthScreen,
  operationsScreen,
  regularScreen,
  spendingScreen,
  uncategorizedScreen,
  weekScreen,
  widgetScreen,
} from '../src/web/api.ts';
import { demoCollections } from '../src/web/demo.ts';
import type { SavedBudget } from '../src/web/pages/dashboard.ts';

const folder = process.argv[2];
if (!folder) throw new Error('Укажите папку: node ios/fixtures.ts <папка>');
mkdirSync(folder, { recursive: true });

const today = '2026-10-07';
const data = demoCollections(today);
using settings = new Settings(':memory:');
settings.addRegularExpense({ title: 'Аренда', amount: 40_000, day: 10, start: null, end: null, icon: 'home' });
settings.addRegularExpense({ title: 'Связь', amount: 700, day: 2, start: null, end: null, icon: null });
settings.addRegularExpense({ title: 'Кредит', amount: 9_000, day: 20, start: '2026-11-01', end: '2027-05-31', icon: 'card' });
const groceries = settings.addPurchase({ title: 'Продукты', amount: 3_000, week: '2026-10-05', envelope: 'week', done: false });
settings.addPurchase({ title: 'Стрижка', amount: 1_500, week: '2026-10-19', envelope: 'week', done: false });
settings.addPurchase({ title: 'Куртка', amount: 20_000, week: '2026-10-05', envelope: 'extra', done: false });
settings.addWish({ title: 'Укладка для волос', amount: 4_500 });
settings.addIncome({ title: 'Зарплата', model: 'salary', params: { salary: 200_000, advanceDay: 20, payDay: 5 } });
settings.addIncome({ title: 'Сдача квартиры', model: 'fixed', params: { amount: 30_000, day: 1 } });
settings.addOwnCategory('Дети');

const saved = (): SavedBudget => ({
  categorizations: settings.categorizations(),
  purchasePayments: settings.purchasePayments(),
  regular: settings.regularExpenses(),
  purchases: settings.purchases(),
  marks: settings.spendingMarks(),
  categories: settings.categorySetup(),
  wishes: settings.wishes(),
});
const budget = { today, source: 'demo' as const, canSync: false };

// One expense of the week pays the groceries, another moves to the extras, so their rows and choices show up.
const [paying, moved] = weekScreen(data, saved(), budget).days.flatMap((d) => d.items);
if (!paying || !moved) throw new Error('В демо-данных у недели нет трат');
settings.linkPurchase(paying.spending, groceries.id);
settings.markSpending(moved.spending, 'extra');

const screens: Record<string, unknown> = {
  session: { user: 'demo', symbol: '₽', today, source: 'demo', canSync: false, syncedAt: null },
  week: weekScreen(data, saved(), budget),
  'week-past': weekScreen(data, saved(), { ...budget, week: '2026-09-28' }),
  'week-ahead': weekScreen(data, saved(), { ...budget, week: '2026-10-19' }),
  month: monthScreen(data, saved(), budget),
  spending: spendingScreen(data, saved(), { today, id: paying.spending }),
  operations: operationsScreen(data, saved(), { today }),
  uncategorized: uncategorizedScreen(data, saved(), { today }),
  regular: regularScreen(data, saved(), { today }),
  income: incomeScreen(data, settings.incomes(), { today }),
  categories: categoriesScreen(data, saved(), { today }),
  widget: widgetScreen(data, saved(), { today }),
};
for (const [name, screen] of Object.entries(screens)) writeFileSync(join(folder, `${name}.json`), JSON.stringify(screen, null, 2));
console.log(`API: ${Object.keys(screens).length} экранов в ${folder}`);

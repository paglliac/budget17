// Writes every screen of the JSON API into a folder, made from demo data and a few entries of the app's own, for
// ios/FixtureCheck to read with the app's models (make ios-check). data/ is neither read nor written.
//   node ios/fixtures.ts <folder>

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { weekChanges } from '../src/changes.ts';
import { Settings } from '../src/settings.ts';
import {
  budgetSettingsScreen,
  categoriesScreen,
  extrasScreen,
  shopsScreen,
  incomeScreen,
  monthScreen,
  operationsScreen,
  regularScreen,
  spendingScreen,
  uncategorizedScreen,
  weekScreen,
  weekWhyScreen,
  widgetScreen,
  wishScreen,
  wishesScreen,
} from '../src/web/api.ts';
import { demoCollections } from '../src/web/demo.ts';
import { budgetOf, type SavedBudget } from '../src/web/pages/dashboard.ts';
import { submitWishPlan } from '../src/web/pages/wishes.ts';

const folder = process.argv[2];
if (!folder) throw new Error('Укажите папку: node ios/fixtures.ts <папка>');
mkdirSync(folder, { recursive: true });

const today = '2026-10-07';
const data = demoCollections(today);
using settings = new Settings(':memory:');
settings.addRegularExpense({ title: 'Аренда', amount: 40_000, day: 10, start: null, end: null, icon: 'home' });
settings.addRegularExpense({ title: 'Связь', amount: 700, day: 2, start: null, end: null, icon: null });
settings.addRegularExpense({ title: 'Кредит', amount: 9_000, day: 20, start: '2026-11-01', end: '2027-05-31', icon: 'card' });
const groceries = settings.addPurchase({ title: 'Продукты', amount: 3_000, week: '2026-10-05', envelope: 'week', kind: 'flexible', done: false });
settings.addPurchase({ title: 'Стрижка', amount: 1_500, week: '2026-10-19', envelope: 'week', kind: 'flexible', done: false });
settings.addPurchase({ title: 'Куртка', amount: 20_000, week: '2026-10-05', envelope: 'extra', kind: 'flexible', done: false });
const styler = settings.addWish({ title: 'Укладка для волос', amount: 4_500 });
settings.setWishDue(styler.id, '2026-10-20');
const tyres = settings.addWish({ title: 'Зимняя резина', amount: 60_000 });
settings.setWishDue(tyres.id, '2026-11-01');
const alfa = settings.addWish({ title: 'Альфа', amount: 50_000, kind: 'card', rate: 34.9 });
settings.setWishDue(alfa.id, '2026-11-18');
settings.addIncome({ title: 'Зарплата', model: 'salary', params: { salary: 200_000, advanceDay: 20, payDay: 5 } });
settings.addIncome({ title: 'Сдача квартиры', model: 'fixed', params: { amount: 30_000, day: 1 } });
const kids = settings.addOwnCategory('Дети');
settings.dressCategory(kids.id, { icon: 'baby', color: '#1E90FF' });
settings.setCategoryPhoto(kids.id, { type: 'image/jpeg', data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) });
settings.addOwnCategory('Кэшбэк', 'income');
// Shops get a logo: the demo's chains by the icons of their sites, one by a photo of the user's, and one a name.
const icon = { type: 'image/png' as const, data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) };
for (const site of ['5ka.ru', 'lenta.com', 'samokat.ru', 'perekrestok.ru', 'vkusvill.ru', 'magnit.ru']) settings.putSiteIcon(site, icon, new Date(`${today}T09:00:00Z`));
settings.setShopPhoto('kofemania', { type: 'image/jpeg', data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) });
settings.dressShop('rinoknatishinke', { title: 'Тишинский рынок', site: null });

const saved = (): SavedBudget => ({
  categorizations: settings.categorizations(),
  purchasePayments: settings.purchasePayments(),
  regular: settings.regularExpenses(),
  purchases: settings.purchases(),
  wishPayments: settings.wishPayments(),
  wishSavings: settings.wishSavings(),
  wishPlans: settings.wishPlans(),
  marks: settings.spendingMarks(),
  descriptions: settings.spendingDescriptions(),
  optionalSpending: settings.optionalSpending(),
  categories: settings.categorySetup(),
  weekStart: settings.weekStart(),
  weekLimits: settings.weekLimits(),
  wishes: settings.wishes(),
  shops: settings.shopSetup(),
  changes: settings.weekChanges(),
});
const budget = { today, source: 'demo' as const, canSync: false };

// Changes that took from the week, kept as the server keeps them: a purchase added from a named phone, and what the
// week allows lowered.
const keepChanges = (change: () => void, at: string, who: string | null) => {
  const before = budgetOf(data, saved(), { today });
  change();
  settings.addWeekChanges(weekChanges(before, budgetOf(data, saved(), { today })), { at: Date.parse(at), who });
};
keepChanges(() => settings.addPurchase({ title: 'Участие в забеге', amount: 2_000, week: '2026-10-05', envelope: 'week', kind: 'required', done: false }), '2026-10-06T19:40:00', 'Таня');
keepChanges(() => settings.setWeekLimit('2026-10-05', 30_000), '2026-10-07T09:10:00', null);

// One expense of the week pays the groceries, another moves to the extras and could have been done without, so their
// rows and choices show up.
const [paying, moved, aside] = weekScreen(data, saved(), budget).days.flatMap((d) => d.items);
if (!paying || !moved || !aside) throw new Error('В демо-данных у недели нет трат');
settings.linkPurchase(paying.spending, groceries.id);
settings.markSpending(moved.spending, 'extra');
settings.markOptional(moved.spending, true);
// The tyres get a plan: the weeks give 5 000 each and October's extras the rest, so the money it holds shows in the plan.
submitWishPlan(settings, data, saved(), `/wishes/${tyres.id}/ways`, new URLSearchParams({ ways: 'weeks:5000,extra-2026-10:' }), { today, incomes: settings.incomes() });
// A third sets money aside for them where the plan holds nothing, so they gather more than needed and can free it.
settings.saveForWish(aside.spending, { wish: tyres.id, envelope: 'week' });
// The styler's plan gives 500 a week and falls short, so the main page has a wish short of money.
submitWishPlan(settings, data, saved(), `/wishes/${styler.id}/ways`, new URLSearchParams({ ways: 'weeks:500' }), { today, incomes: settings.incomes() });
// The card is repaid by 20 000 a month from the savings, so its screen tells when that closes it, with scenarios.
submitWishPlan(settings, data, saved(), `/wishes/${alfa.id}/ways`, new URLSearchParams({ ways: 'savings:20000' }), { today, incomes: settings.incomes() });
// An income opens to be marked too, with its categories and whether it counts.
const income = operationsScreen(data, saved(), { today, kind: 'income' }).days.flatMap((d) => d.items)[0];
if (!income?.spending) throw new Error('В демо-данных нет доходов');

const screens: Record<string, unknown> = {
  session: { user: 'demo', symbol: '₽', today, source: 'demo', canSync: false, syncedAt: null },
  week: weekScreen(data, saved(), budget),
  'week-past': weekScreen(data, saved(), { ...budget, week: '2026-09-28' }),
  'week-ahead': weekScreen(data, saved(), { ...budget, week: '2026-10-19' }),
  'week-why': weekWhyScreen(data, saved(), budget),
  'week-why-ahead': weekWhyScreen(data, saved(), { ...budget, week: '2026-10-19' }),
  month: monthScreen(data, saved(), { ...budget, incomes: settings.incomes() }),
  'month-without-incomes': monthScreen(data, saved(), budget),
  extras: extrasScreen(data, saved(), budget),
  'extras-ahead': extrasScreen(data, saved(), { ...budget, month: '2026-11' }),
  spending: spendingScreen(data, saved(), { today, id: paying.spending }),
  'spending-income': spendingScreen(data, saved(), { today, id: income.spending }),
  operations: operationsScreen(data, saved(), { today }),
  'operations-income': operationsScreen(data, saved(), { today, kind: 'income' }),
  'operations-optional': operationsScreen(data, saved(), { today, kind: 'optional' }),
  'operations-categories': operationsScreen(data, saved(), { today, group: 'category' }),
  uncategorized: uncategorizedScreen(data, saved(), { today }),
  regular: regularScreen(data, saved(), { today }),
  income: incomeScreen(data, settings.incomes(), { today }),
  categories: categoriesScreen(data, saved(), { today }),
  shops: shopsScreen(data, saved(), { today, query: null }),
  'budget-settings': budgetSettingsScreen(data, saved()),
  widget: widgetScreen(data, saved(), { today }),
  wish: wishScreen(data, saved(), { today, id: tyres.id, ways: null, incomes: settings.incomes() }),
  card: wishScreen(data, saved(), { today, id: alfa.id, ways: null, incomes: settings.incomes() }),
  'wish-picking': wishScreen(data, saved(), { today, id: tyres.id, ways: 'weeks:3000,extra-2026-10:', incomes: settings.incomes() }),
  wishes: wishesScreen(data, saved(), { today, incomes: settings.incomes() }),
};
for (const [name, screen] of Object.entries(screens)) writeFileSync(join(folder, `${name}.json`), JSON.stringify(screen, null, 2));
console.log(`API: ${Object.keys(screens).length} экранов в ${folder}`);

// The JSON the iPhone app reads: each screen as the pages show it, its words included, so the app only lays it out
// and the rules stay here. The sentences that explain a page are left out: on a phone the figures speak for
// themselves, and so are the accounts money went from and the times. Rows carry an icon by name (see icons.ts), a
// colour as a tone's name or #rrggbb, a category's photo and a shop's logo as paths of the server (see looks.ts), and
// where an expense or a purchase counts as `mark`. Built from the same loaders and phrases as the pages.

import { mainCurrency } from '../balances.ts';
import type { Suggestion } from '../categorization.ts';
import { addDays, dateOf, daysInMonth, monthOf, shiftMonth, weekday, type MonthString } from '../dates.ts';
import { INCOME_MODEL_IDS, incomeModel, incomeValues, monthlyIncome, type Income, type IncomeModelId } from '../income.ts';
import { listOperations, type Operation } from '../ledger.ts';
import { paymentDate, regularTotals, regularValues, type RegularExpense } from '../regular.ts';
import { NO_SHOPS } from '../shops.ts';
import {
  envelopeOf,
  EXTRAS_LEVELS,
  extrasOutlook,
  extrasPath,
  MONTH_LIMIT,
  monthOfWeek,
  WEEK_LIMIT,
  weekLimit,
  weekOf,
  type Envelope,
  type ExtrasLevels,
  type ExtrasState,
  type ExtrasSummary,
  type PurchaseStatus,
  type WeekStart,
  type WeekSummary,
  type Wish,
} from '../week.ts';
import { weekWhy, type Check, type Overspend } from '../week-why.ts';
import { SAVED_WAY, savingsTaken, type Gathering } from '../wish-plans.ts';
import type { DateString, EntityCollections } from '../zenmoney/types.ts';
import { capitalize, dayHeading, dayMonth, dayTitle, fromToday, money, monthName, num, plural, ROUND_STEP, roundParts, timeOn, weekLabel, WEEKDAYS, WEEKDAYS_FULL } from './format.ts';
import { extrasCard, roundExtras, weekHome } from './home.ts';
import { CATEGORY_ICONS, categoryIcon, ENTRY_ICONS, entryIcon, type IconName } from './icons.ts';
import { recentMonths } from './pages/chrome.ts';
import {
  budgetOf,
  dueLabel,
  extrasLine,
  extrasPlan,
  extrasTotal,
  heldLine,
  loadDashboard,
  monthWeekLine,
  parseWeek,
  PLAN_AHEAD,
  PURCHASE_KINDS,
  purchaseActions,
  purchaseLine,
  regularPaymentLine,
  weekChoices,
  weekTotal,
  type SavedBudget,
  type Total,
} from './pages/dashboard.ts';
import { INCOME_ICONS, incomeColor, incomeDetails, incomeTotalNote, loadIncome } from './pages/income.ts';
import {
  allExpenses,
  categoryOptions,
  envelopeOptions,
  loadMarking,
  markingDetails,
  markingTitle,
  optionalSwitch,
  PAYMENT_WORDS,
  paymentOptions,
  plannedPurchases,
  undoChoices,
  writtenAbout,
  type Marking,
  type MarkingChoice,
  type SavedMarking,
} from './pages/marking.ts';
import { loadOperations, netOf, operationCategory, operationLine, operationsEmpty } from './pages/operations.ts';
import { isBought, wayCards, wishPlan, type WishPlanView } from './pages/wishes.ts';
import { loadRegular, regularLine, regularTotalNote, STATUS_TONE, timeline, type Placed } from './pages/regular.ts';
import { categoryDetails, loadBudgetSetup, loadSettingsPage } from './pages/settings.ts';
import { bankNames, loadShopsPage, operationShop, shopForm, shopLook, type ShopForm } from './pages/shops.ts';
import { loadUncategorized, suggestedChoice, suggestionName } from './pages/uncategorized.ts';
import { autoLook, CATEGORY_COLORS, categoryLook, logoOf } from './looks.ts';
import { categoryColor, toneColor, type Tone } from './tones.ts';

/** A row of a list, as entryRow and operationRow draw it. */
export interface Row {
  /** Unique within the screen. */
  id: string;
  title: string;
  details: string;
  icon: IconName;
  /** A tone's name, such as violet, or a category's own colour as #rrggbb. */
  color: string;
  /** A category's photo, drawn instead of the icon on its colour: a path of the server; null when there is none. */
  photo: string | null;
  /**
   * The logo of the shop of an expense or an income, drawn on white instead of its dot or icon: a path of the server;
   * null when its shop has none.
   */
  logo: string | null;
  amount: number | null;
  /** Where it counts, as the dot before the amount; null when it has none. */
  mark: Envelope | null;
  muted: boolean;
}

/** An expense that opens to be marked by its ZenMoney id. */
export interface ExpenseRow extends Row {
  spending: string;
  /** The user said it could have been done without. */
  optional: boolean;
}

/** A day of a list, under its heading. */
export interface Day<T> {
  date: DateString;
  title: string;
  subtitle: string;
  items: T[];
}

/**
 * The data as the app shows it: the ruble is ₽ in every figure and sentence of the app, though ZenMoney names it руб.
 * as the web pages write it.
 */
export function withRubleSign(data: EntityCollections): EntityCollections {
  return { ...data, instrument: data.instrument?.map((i) => (i.shortTitle === 'RUB' ? { ...i, symbol: '₽' } : i)) };
}

/** A colour as the app takes it: the tone's name for var(--violet), a category's own colour as it is. */
export function colorOf(css: string): string {
  return /^var\(--([a-z]+)\)$/.exec(css)?.[1] ?? css;
}

function row(fields: Pick<Row, 'id' | 'title' | 'details' | 'icon' | 'color'> & Partial<Row>): Row {
  return { photo: null, logo: null, amount: null, mark: null, muted: false, ...fields, color: colorOf(fields.color) };
}

function byDay<T>(items: readonly T[], dateOf: (item: T) => DateString, today: DateString): Array<Day<T>> {
  const days = new Map<DateString, T[]>();
  for (const item of items) days.set(dateOf(item), [...(days.get(dateOf(item)) ?? []), item]);
  return [...days].map(([date, list]) => ({ date, ...dayHeading(date, today), items: list }));
}

function months(today: DateString): Array<{ value: MonthString; label: string }> {
  return recentMonths(monthOf(today)).map((m) => ({ value: m, label: capitalize(monthName(m)) }));
}

/** An expense as the week and the extras list it: titled by what it paid, with a dot for where it counts. */
function expenseRow(m: Pick<Marking, 'marks' | 'purchases'>, o: Operation): ExpenseRow {
  return {
    ...row({
      id: `spending-${o.id}`,
      title: markingTitle(o),
      details: markingDetails(o),
      ...categoryLook(o.category),
      logo: logoOf(o),
      amount: o.amount,
      mark: envelopeOf(m, o),
    }),
    spending: o.id,
    optional: o.optional,
  };
}

/** Expenses by day, newest first, as the sheet lists them under a heading for each day. */
function expenseDays(m: Pick<Marking, 'marks' | 'purchases'>, expenses: readonly Operation[], today: DateString): Array<Day<ExpenseRow>> {
  return byDay(expenses, (o) => o.date, today).map((day) => ({ ...day, items: day.items.map((o) => expenseRow(m, o)) }));
}

/**
 * A purchase of a plan, saying first whether it is required or flexible; until it is bought, what paid it follows, and
 * that it waits to be bought goes without saying. The money a wish's plan holds is a row of the wish, which opens it.
 */
function purchaseRow(status: PurchaseStatus, current: DateString, symbol: string, saved: Pick<SavedBudget, 'wishPayments'>) {
  if (status.purchase.wish !== undefined) return wishPurchaseRow(status, symbol, saved);
  const { purchase: p, bought, covered } = status;
  const key = `purchase-${p.id}`;
  const line = purchaseLine(status, current, symbol);
  return {
    ...row({
      id: key,
      title: p.title,
      details: bought ? line.details : [PURCHASE_KINDS[p.kind].label, covered > 0 ? line.details : null].filter(Boolean).join(' · '),
      icon: categoryIcon(p.title),
      color: bought ? toneColor('gray') : p.envelope === 'extra' ? toneColor('violet') : categoryColor(key, null),
      amount: line.amount,
      mark: p.envelope,
      muted: bought,
    }),
    purchase: { ...p, weekLabel: weekLabel(p.week) },
    bought,
    finishable: line.finishable,
    actions: purchaseActions(status),
    wish: null,
  };
}

/**
 * Money a wish's plan holds in a week or the extras: «Желание» with what expenses set aside of it (see heldLine) until
 * an expense buys the wish, then «Куплено». It keeps the wish's sparkles, set aside or bought, only paler.
 */
function wishPurchaseRow(status: PurchaseStatus, symbol: string, saved: Pick<SavedBudget, 'wishPayments'>) {
  const p = status.purchase;
  const bought = isBought(saved, p.wish!);
  const line = heldLine(status, symbol);
  return {
    ...row({
      id: `purchase-${p.id}`,
      title: p.title,
      details: ['Желание', bought ? 'куплено' : line.details].filter(Boolean).join(' · '),
      icon: 'sparkles',
      color: bought || line.done ? toneColor('gray') : toneColor('yellow'),
      amount: line.amount,
      mark: p.envelope,
      muted: bought || line.done,
    }),
    purchase: { ...p, weekLabel: weekLabel(p.week) },
    bought,
    finishable: false,
    actions: [],
    wish: p.wish!,
  };
}

/** A regular payment of a plan; paid in full, it is pale as a purchase bought is. */
function regularPaymentRow(payment: WeekSummary['regular'][number], symbol: string) {
  const { expense, date } = payment;
  const { details, done } = regularPaymentLine(payment, symbol);
  return {
    ...row({
      id: `regular-${expense.id}-${date}`,
      title: expense.title,
      details,
      icon: done ? 'check' : entryIcon(expense.icon, expense.title),
      color: toneColor('gray'),
      amount: expense.amount,
      mark: 'outside',
      muted: done,
    }),
    regular: expense.id,
  };
}

// ---- Screens

export interface BudgetOptions {
  today: DateString;
  source: 'zenmoney' | 'demo';
  canSync: boolean;
  /** When the server last synced with ZenMoney, as an ISO moment; null before it has, or when it cannot. */
  syncedAt?: string | null;
}

/**
 * A week's figures to the hundred, adding up to what the week allows as the exact ones do: spent, required, flexible and
 * free. Its expenses and purchases keep their own amounts.
 */
function roundWeek(w: WeekSummary): WeekSummary {
  const [spent, required, flexible, free] = roundParts([w.spent, w.required, w.planned - w.required, w.free]) as [number, number, number, number];
  return { ...w, spent, required, planned: required + flexible, free };
}

/** The words of the extras' widget for where the month is headed: its title, what leads to the figure, and that in a word. */
const OUTLOOK_WORDS: Record<ExtrasState, { title: string; lead: string; unplanned: string; brief: string }> = {
  plenty: { title: 'Есть запас', lead: 'Даже с учётом запланированного вы, вероятно, отложите', unplanned: 'Если не появятся новые траты, вы отложите', brief: 'отложите' },
  calm: { title: 'Спокойно', lead: 'Если всё пойдёт по плану, вы, вероятно, отложите', unplanned: 'Если не появятся новые траты, вы отложите', brief: 'отложите' },
  tight: { title: 'Впритык', lead: 'Если не появятся новые траты, получится отложить', unplanned: 'Если не появятся новые траты, получится отложить', brief: 'отложите' },
  short: { title: 'Нужно сократить', lead: 'С текущими планами к концу месяца будет дефицит', unplanned: 'Доп. бюджет уже потрачен, дефицит', brief: 'дефицит' },
};

/**
 * Where a month's extras are headed, as the extras' widget tells it: plenty, calm, tight or short by what will be left
 * at the month's end once the plan is bought, against the levels the user set; that, about to the thousand, after its
 * lead; what is left of them now, before the plan; and the line of what they set aside through the month (see
 * extrasPath). Under a thousand, to the hundred.
 */
function extrasForecast(m: ExtrasSummary, levels: ExtrasLevels, start: WeekStart, today: DateString, symbol: string) {
  const outlook = extrasOutlook(m, levels);
  const words = OUTLOOK_WORDS[outlook.state];
  const step = Math.abs(outlook.end) < 1_000 ? 100 : 1_000;
  const end = Math.round(outlook.end / step) * step;
  const over = outlook.left < -0.5;
  return {
    state: outlook.state,
    label: 'Финансовый помощник',
    action: 'Прогноз',
    title: words.title,
    lead: m.planned > 0.5 ? words.lead : words.unplanned,
    brief: words.brief,
    figure: outlook.state === 'short' ? money(end, symbol) : `≈\u00A0${money(end, symbol)}`,
    left: { amount: over ? -outlook.left : outlook.left, over, note: over ? `сверх ${money(MONTH_LIMIT, symbol)}` : 'осталось' },
    path: extrasPath(m, start, today).map((p) => ({ ...p, amount: Math.round(p.amount) })),
  };
}

/**
 * The week tab: what is left, the spending by days and the plan; the wishes have a tab of their own. With round figures
 * the totals are to the hundred and still add up to what the week allows; expenses and purchases keep their amounts.
 */
export function weekScreen(data: EntityCollections, saved: SavedBudget, options: BudgetOptions & { week?: string | null }) {
  const { today } = options;
  // The extras are of the month the shown week is in.
  const shown = parseWeek(options.week, weekOf(today, saved.weekStart), saved.weekStart);
  const d = loadDashboard(data, saved, { ...options, week: options.week, month: monthOfWeek(shown) });
  const { current } = d;
  const w = saved.roundFigures ? roundWeek(d.week) : d.week;
  const phase = w.week > current ? 'ahead' : w.week < current ? 'past' : 'current';
  const next = addDays(w.week, 7);
  return {
    symbol: d.symbol,
    today,
    current,
    week: w.week,
    phase,
    title: `Неделя ${weekLabel(w.week)}`,
    prev: addDays(w.week, -7),
    next: next <= addDays(current, 7 * PLAN_AHEAD) ? next : null,
    total: weekTotal(w, current, d.symbol),
    home: weekHome(d, w, data, saved, options),
    /** What the week allows and the usual amount; another amount posts to /api/week-limits/:week, the usual one back to /api/week-limits/:week/delete. */
    limit: { amount: w.limit, usual: WEEK_LIMIT },
    days: expenseDays(d.marking, w.spending, today),
    plan: [...w.purchases.map((p) => purchaseRow(p, current, d.symbol, saved)), ...w.regular.map((r) => regularPaymentRow(r, d.symbol))],
    weekChoices: weekChoices(current),
    source: options.source,
    canSync: options.canSync,
  };
}

/**
 * Why a week went below zero, opened from the red figure on the app's circle, as what the user can do about it (see
 * week-why.ts): where the week is, the expenses to check where they count, a lot alone or a run of small ones close
 * together, each with the expenses «Верно» confirms (posted to /api/spending/confirmed); and reminders, each only when
 * it is a lot: to keep to the plan, with the purchases that cost more, and to spend less on the optional, with where
 * the week would be without them. An expense opens to be marked, a purchase or the plan opens the plan. With nothing to
 * check or remind of, `empty` says so. With round figures what is free is as on the circle and the week without the optional to the hundred; the rows
 * keep their amounts.
 */
export function weekWhyScreen(data: EntityCollections, saved: SavedBudget, options: BudgetOptions & { week?: string | null }) {
  const { today } = options;
  const shown = parseWeek(options.week, weekOf(today, saved.weekStart), saved.weekStart);
  const d = loadDashboard(data, saved, { ...options, week: shown, month: monthOfWeek(shown) });
  const { current, symbol } = d;
  const phase = shown > current ? 'ahead' : shown < current ? 'past' : 'current';
  const why = weekWhy(budgetOf(data, saved, { today, from: shown }), shown, saved.confirmedSpending);
  const round = (amount: number) => (saved.roundFigures ? Math.round(amount / ROUND_STEP) * ROUND_STEP : amount);
  const total = (rows: Array<{ amount: number | null }>) => rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const check = why.check.map((c) => checkRow(c, d.marking, symbol, today));
  const reminders = [];
  if (why.remindPlan) {
    const rows = why.over.map((o) => overspendRow(o, symbol));
    const [first] = rows;
    reminders.push({
      ...row({
        id: 'remind-plan',
        title: 'Придерживайся плана',
        details: rows.length === 1 ? (first?.title ?? '') : `${first?.title ?? ''} и ещё ${rows.length - 1}`,
        icon: 'target',
        color: 'red',
        amount: total(rows),
      }),
      rows,
    });
  }
  if (why.remindOptional) {
    const without = round(why.withoutOptional);
    const rows = why.optional.map((o) => ({ ...expenseRow(d.marking, o), id: `remind-optional-${o.id}`, plan: false }));
    reminders.push({
      ...row({
        id: 'remind-optional',
        title: 'Трать меньше на необязательное',
        details: `без них ${money(without, symbol, { sign: true })}`,
        icon: 'piggy',
        color: 'orange',
        amount: total(rows),
      }),
      rows,
    });
  }
  return {
    symbol,
    week: shown,
    phase,
    title: 'Почему неделя ушла в минус',
    subtitle: `Неделя ${weekLabel(shown)}`,
    now: { label: phase === 'current' ? 'сейчас' : phase === 'past' ? 'итог недели' : 'будет', amount: saved.roundFigures ? roundWeek(d.week).free : why.now },
    check: check.length > 0 ? { title: 'Проверь траты', rows: check } : null,
    reminders,
    empty: check.length + reminders.length === 0 ? 'Ни крупных трат, ни перерасходов' : null,
  };
}

/**
 * An expense to check as a row: by its title with the day it came and what it is, or a run of small ones by how many
 * came one after another, opened to them. `confirms` are the expenses «Верно» confirms.
 */
function checkRow(c: Check, m: Pick<Marking, 'marks' | 'purchases'>, symbol: string, today: DateString) {
  if (c.kind === 'spending') {
    const o = c.spending;
    const details = [dayTitle(o.date, today), markingDetails(o)].filter(Boolean).join(' · ');
    return { ...expenseRow(m, o), id: `check-${o.id}`, details, confirms: [o.id], parts: [] as ExpenseRow[] };
  }
  const [first] = c.spending;
  const count = c.spending.length;
  return {
    ...row({
      id: `check-run-${first?.id ?? ''}`,
      title: `${count} ${plural(count, ['трата', 'траты', 'трат'])} подряд`,
      details: first ? dayTitle(first.date, today) : '',
      icon: 'layers',
      color: toneColor('violet'),
      amount: c.amount,
    }),
    spending: null,
    optional: false,
    confirms: c.spending.map((o) => o.id),
    parts: c.spending.map((o) => expenseRow(m, o)),
  };
}

/**
 * What cost more than planned as a row: a purchase with what it was planned for and what it cost, or the plan past the
 * week. The amount is how far past the plan, above zero; it opens the plan.
 */
function overspendRow(o: Overspend, symbol: string) {
  const fields = { amount: o.amount, spending: null as string | null, optional: false, plan: true };
  switch (o.kind) {
    case 'purchase': {
      const p = o.status.purchase;
      return {
        ...row({ id: `over-purchase-${p.id}`, title: p.title, details: `план ${money(p.amount, symbol)} → ${money(o.status.covered, symbol)}`, icon: categoryIcon(p.title), color: categoryColor(`purchase-${p.id}`, null, p.title), mark: p.envelope }),
        ...fields,
      };
    }
    case 'plan':
      return {
        ...row({ id: 'over-plan', title: 'План больше недели', details: `${money(o.planned, symbol)} из ${money(o.limit, symbol)}`, icon: 'calendar', color: toneColor('violet') }),
        ...fields,
      };
  }
}

/**
 * Where a month's income goes, as the app's month tab draws it: the month's regular payments, the budgets of its weeks,
 * the extras, what the plans of wishes take from its savings, and what is left over for savings (short of money when
 * it is below zero). The income is what the incomes bring a month, as /income counts it; null without incomes. With
 * round figures the parts are to the hundred and add up to the income rounded.
 */
function monthFlow(d: ReturnType<typeof loadDashboard>, saved: SavedBudget, incomes: Income[], thisMonth: MonthString) {
  const exact = monthlyIncome(incomes);
  if (exact <= 0) return null;
  const month = d.extras.month;
  const exactParts = [
    saved.regular.filter((e) => paymentDate(e, month) !== null).reduce((sum, e) => sum + e.amount, 0),
    d.weeks.reduce((sum, w) => sum + w.limit, 0),
    MONTH_LIMIT,
    savingsTaken([...(saved.wishPlans?.values() ?? [])].map((plan) => ({ plan })), month),
  ];
  exactParts.push(exact - exactParts.reduce((sum, p) => sum + p, 0));
  const [regular, weeks, extras, wishes, savings] = (saved.roundFigures ? roundParts(exactParts) : exactParts) as [number, number, number, number, number];
  const income = regular + weeks + extras + wishes + savings;
  const part = (label: string, amount: number) => ({ label, amount, share: amount / income });
  return {
    income: { label: 'Доход', amount: income, note: month === thisMonth ? 'в этом месяце' : `в ${monthName(month, 'prepositional')}` },
    parts: [
      part('Обязательные расходы', regular),
      part('Недельные бюджеты', weeks),
      part('Доп. бюджет', extras),
      ...(wishes > 0 ? [part('На желания', wishes)] : []),
      part(savings >= 0 ? 'В накопления' : 'Не хватает', savings),
    ],
  };
}

/**
 * The month tab: where its income goes, its weeks, and what is left of its extras, which open their own screen (see
 * extrasScreen). With round figures the totals of each are to the hundred and add up as the exact ones do.
 */
export function monthScreen(data: EntityCollections, saved: SavedBudget, options: BudgetOptions & { month?: string | null; incomes?: Income[] }) {
  const { today } = options;
  const d = loadDashboard(data, saved, { ...options, view: 'month', month: options.month });
  const { current } = d;
  const thisMonth = monthOfWeek(current);
  const round = saved.roundFigures ?? false;
  const m = round ? roundExtras(d.extras) : d.extras;
  const prev = shiftMonth(m.month, -1);
  const next = shiftMonth(m.month, 1);
  const total: Total = extrasTotal(m, d.symbol);
  return {
    symbol: d.symbol,
    month: m.month,
    thisMonth,
    title: capitalize(monthName(m.month)),
    prev: { value: prev, label: capitalize(monthName(prev)) },
    next: next <= monthOfWeek(addDays(current, 7 * PLAN_AHEAD)) ? { value: next, label: capitalize(monthName(next)) } : null,
    weeks: d.weeks.map((w) => {
      const line = monthWeekLine(round ? roundWeek(w) : w, current, d.symbol);
      // The date beside the card says it is a week, so the title is only its days.
      return { ...row({ id: `week-${w.week}`, title: weekLabel(w.week), details: line.details, icon: 'calendar', color: toneColor(line.tone), amount: line.amount }), week: w.week };
    }),
    total,
    flow: monthFlow(d, saved, options.incomes ?? [], thisMonth),
    newPurchaseWeek: newExtraWeek(m.month, thisMonth, d.weeks, current),
    weekChoices: weekChoices(current),
    source: options.source,
    canSync: options.canSync,
  };
}

/** Where a new purchase of a month's extras goes: the current week in this month, else the month's first week. */
function newExtraWeek(month: MonthString, thisMonth: MonthString, weeks: readonly WeekSummary[], current: DateString): DateString {
  return month === thisMonth ? current : (weeks[0]?.week ?? current);
}

/** How a month's extras stand, by what will be left once the plan is bought (see extrasOutlook), as their screen says it. */
const EXTRAS_FREE: Record<ExtrasState, string> = { plenty: 'свободно', calm: 'свободно', tight: 'свободно', short: 'не хватает' };

/**
 * The extras of a month as their two screens in the app show them, after the user's pictures of 2026-10-18. The first
 * has the month to step from (`prev`, `next`), what is free «из 100 000 ₽» with how the month stands (plenty, calm,
 * tight or short, see extrasOutlook), the bar of what was spent, what is planned and what is free, and what the plan
 * still holds (see extrasPlan); «Подробнее» opens the second, with the month to pick, what was spent and how much of it
 * by the plan and without one, and the expenses by day. An expense the plan had says what its purchase was planned at
 * instead of its details, and the one that bought or finished the purchase how far over the plan it went (`over`,
 * below zero under it); one without a plan is `planned: false`. With round figures the totals are to the hundred and
 * add up to the month's extras; the rows keep their amounts. The months go from three back to the last one with an
 * extras purchase, the next one at least.
 */
export function extrasScreen(data: EntityCollections, saved: SavedBudget, options: BudgetOptions & { month?: string | null }) {
  const { today } = options;
  const d = loadDashboard(data, saved, { ...options, view: 'month', month: options.month });
  const { current } = d;
  const exact = d.extras;
  const m = saved.roundFigures ? roundExtras(exact) : exact;
  const thisMonth = monthOfWeek(current);
  const state = extrasOutlook(exact, saved.extrasLevels ?? EXTRAS_LEVELS).state;
  const planned = plannedPurchases(saved, today).filter((p) => p.envelope === 'extra').map((p) => monthOfWeek(p.week));
  const last = [shiftMonth(thisMonth, 1), m.month, ...planned].reduce((a, b) => (b > a ? b : a));
  const months: MonthString[] = [];
  for (let month = shiftMonth(thisMonth, -3); month <= last && month <= monthOfWeek(addDays(current, 7 * PLAN_AHEAD)); month = shiftMonth(month, 1)) months.push(month);
  const title = (month: MonthString) => `${capitalize(monthName(month))} ${month.slice(0, 4)}`;
  const option = (month: MonthString) => (months.includes(month) ? { value: month, label: title(month) } : null);
  return {
    symbol: d.symbol,
    month: m.month,
    thisMonth,
    title: title(m.month),
    months: months.map((month) => ({ value: month, label: title(month) })),
    prev: option(shiftMonth(m.month, -1)),
    next: option(shiftMonth(m.month, 1)),
    free: { label: EXTRAS_FREE[state], amount: Math.abs(m.free), state, note: state === 'short' ? null : `из ${money(MONTH_LIMIT, d.symbol)}` },
    bar: extrasTotal(m, d.symbol).parts,
    spent: {
      label: 'Потрачено',
      amount: m.spent,
      byPlan: { label: 'по плану', amount: m.spentByPlan },
      unplanned: { label: 'без плана', amount: m.spent - m.spentByPlan },
    },
    days: byDay(m.spending, (o) => o.date, today).map((day) => ({
      ...day,
      items: day.items.map((o) => {
        const line = extrasLine(exact, o);
        const expense = expenseRow(d.marking, o);
        return { ...expense, details: line.plan === null ? expense.details : `план ${num(line.plan)}`, planned: line.planned, over: line.over };
      }),
    })),
    plan: { label: 'В плане', amount: m.planned, items: extrasPlan(exact).map((p) => purchaseRow(p, current, d.symbol, saved)) },
    newPurchaseWeek: newExtraWeek(m.month, thisMonth, d.weeks, current),
    weekChoices: weekChoices(current),
    source: options.source,
  };
}

/**
 * An expense opened to be marked: when and from where it was paid with whatever else the bank said, then the choices
 * as the pages offer them, each with an icon for the app's tiles. Each choice posts to /api/spending/:id/:choice.
 * An income opens the same way, with nothing to pay, the income categories, and counted or not. Null when there is no
 * such expense or income.
 */
export function spendingScreen(data: EntityCollections, saved: SavedMarking, options: { today: DateString; id: string }) {
  const expenses = allExpenses(data, saved);
  // Operations that do not count are marked too, from the operations, so they are looked up among all of them.
  const operations = listOperations(data, { from: '0000-01-01', to: '9999-12-31' }, saved, { withIgnored: true });
  const o = operations.find((e) => e.id === options.id && e.kind !== 'transfer');
  if (!o) return null;
  const marking = loadMarking(data, saved, expenses, options.today);
  const suggestion = o.category === null ? marking.suggest(o) : null;
  const payments = o.kind === 'expense' ? paymentOptions(marking, o, suggestion) : { choices: [], others: [] };
  const categories = categoryOptions(marking, o, suggestion);
  const colored = (c: MarkingChoice): MarkingChoice => (c.color ? { ...c, color: colorOf(c.color) } : c);
  const regular = new Map(saved.regular.map((e) => [`regular-${e.id}`, e]));
  const purchases = new Map(saved.purchases.map((p) => [`purchase-${p.id}`, p]));
  /** A payment's icon: the one picked for its regular expense, a wish's, or one by its title. */
  const paymentIcon = (choice: string): IconName => {
    const e = regular.get(choice);
    if (choice.startsWith('wish-')) return 'sparkles';
    if (choice.startsWith('save-')) return 'piggy';
    return e ? entryIcon(e.icon, e.title) : categoryIcon(purchases.get(choice)?.title ?? '');
  };
  const time = timeOn(o.date, o.created);
  const hints = o.kind === 'income' ? INCOME_HINTS : ENVELOPE_HINTS;
  const shop = operationShop(o, operations, saved.shops ?? NO_SHOPS, options.today);
  return {
    id: o.id,
    /** expense or income: an income pays nothing and has income categories. */
    kind: o.kind,
    title: markingTitle(o),
    amount: o.amount,
    symbol: marking.symbol,
    when: time ? `${dayMonth(o.date)}, ${time}` : dayMonth(o.date),
    account: o.account,
    /** What the user wrote about the expense; posted to /api/spending/:id/description. */
    description: o.description,
    /** Its shop's form, which the app opens on the tab of shops, as shopsScreen gives it; null for one without a shop. */
    shop: shop ? shopJSON(shop) : null,
    /** What else the bank said: how it named the payee, its comment, the amount in a foreign currency, not settled yet. */
    notes: [
      o.originalPayee ? `в банке — ${o.originalPayee}` : null,
      o.comment,
      o.original ? money(o.original.amount, o.original.instrument.symbol, { cents: true }) : null,
      o.hold ? 'банк ещё не провёл' : null,
    ].filter((note) => note !== null),
    payments: {
      choices: payments.choices.map((c) => ({ ...c, icon: paymentIcon(c.choice) })),
      others: payments.others.map((g) => ({ ...g, options: g.options.map((option) => ({ ...option, icon: paymentIcon(option.value) })) })),
      otherLabel: payments.choices.length > 0 ? PAYMENT_WORDS.other : PAYMENT_WORDS.otherAlone,
      empty: PAYMENT_WORDS.empty,
    },
    categories: { choices: categories.choices.map(colored), empty: categories.empty },
    /** What the suggestion is, when there is one; its choice is marked as suggested. */
    hint: suggestion ? `Похоже на ${suggestionName(suggestion)}` : null,
    /**
     * Whether the expense could have been done without, as a switch: on posts optional, off required. Null for an
     * income or what is not counted.
     */
    optional: optionalSwitch(o),
    envelopes: envelopeOptions(marking, o).map((c) => ({ ...c, detail: hints[c.choice] })),
    undo: undoChoices(marking, o),
  };
}

/** What each place an expense counts in means, under its name on the app's marking sheet. */
const ENVELOPE_HINTS: Record<string, string> = {
  week: 'Учесть в текущей неделе',
  extra: 'Из дополнительных месяца',
  outside: 'Не учитывать в недельном бюджете',
  ignored: 'Например, перевод или снятые наличные',
};

/** The same for an income: counted among the incomes and savings of its month, or not at all. */
const INCOME_HINTS: Record<string, string> = {
  counted: 'В полученном и накоплениях месяца',
  ignored: 'Например, вернули долг или командировочные',
};

/**
 * What an expense is in the app's list of operations, as a chip under its amount: waiting for a category, paying a
 * regular expense, in the extras, outside the budget or not counted. An ordinary expense of the week has none, and
 * neither have transfers and incomes, unless an income is not counted. That an expense could have been done without
 * is told by the colour of its amount instead (`optional`).
 */
function operationChip(m: Pick<SavedMarking, 'marks' | 'purchases'>, o: Operation): { label: string; tone: Tone } | null {
  if (o.ignored) return { label: 'Не учитывается', tone: 'gray' };
  if (o.kind !== 'expense') return null;
  if (o.category === null) return { label: 'Ждёт разбора', tone: 'red' };
  if (o.regular) return { label: 'Регулярный', tone: 'violet' };
  const envelope = envelopeOf(m, o);
  if (envelope === 'extra') return { label: 'Дополнительные', tone: 'violet' };
  if (envelope === 'outside') return { label: 'Вне бюджета', tone: 'gray' };
  return null;
}

/** Operations of a month by day, filtered as on the page, and the month's spending, or incomes, by category. */
export function operationsScreen(
  data: EntityCollections,
  saved: SavedMarking,
  options: { today: DateString; month?: string | null; kind?: string | null; category?: string | null; query?: string | null },
) {
  const d = loadOperations(data, saved, options);
  const kinds = [
    { value: null, label: 'Все', count: d.counts.all },
    { value: 'expense', label: 'Расходы', count: d.counts.expense },
    { value: 'income', label: 'Доходы', count: d.counts.income },
    // Transfers within one bank are left out, so often there are none to show.
    ...(d.counts.transfer > 0 || d.view === 'transfer' ? [{ value: 'transfer', label: 'Переводы', count: d.counts.transfer }] : []),
    ...(d.counts.optional > 0 || d.view === 'optional' ? [{ value: 'optional', label: 'Необязательные', count: d.counts.optional }] : []),
  ];
  const sum = (kept: (o: Operation) => boolean) => d.operations.filter((o) => kept(o) && !o.ignored).reduce((total, o) => total + o.amount, 0);
  return {
    symbol: d.symbol,
    month: d.month,
    months: months(options.today),
    title: `Операции за ${monthName(d.month)}`,
    kinds,
    kind: d.view,
    category: d.filter.category ?? null,
    categoryTitle: d.categoryTitle,
    query: d.filter.query ?? null,
    /**
     * What the operations that pass the filter spent and brought, how many there are, and how much of what they spent
     * could have been done without.
     */
    totals: { expense: sum((o) => o.kind === 'expense'), income: sum((o) => o.kind === 'income'), optional: sum((o) => o.optional), count: d.operations.length },
    days: byDay(d.operations, (o) => o.date, options.today).map((day) => ({
      ...day,
      net: day.items.reduce((s, o) => s + netOf(o), 0),
      items: day.items.map((o) => ({
        ...row({
          id: o.id,
          title: o.name,
          ...operationLine(o),
          logo: logoOf(o),
          details: o.kind === 'transfer' ? `${o.account} → ${o.toAccount}` : operationCategory(o),
          amount: o.amount,
          muted: o.ignored,
        }),
        kind: o.kind,
        comment: writtenAbout(o),
        hold: o.hold,
        original: o.original ? { amount: o.original.amount, symbol: o.original.instrument.symbol } : null,
        spending: o.kind !== 'transfer' ? o.id : null,
        chip: operationChip(saved, o),
        optional: o.optional,
      })),
    })),
    /** Expenses of the month that wait for a category, as «Ждут разбора» counts them. */
    pending: loadUncategorized(data, saved, { today: options.today, month: d.month }).pending.length,
    empty: operationsEmpty(d),
    /** What the categories are: Расходы по категориям, Доходы по категориям or Необязательные по категориям. */
    categoriesTitle: d.categoriesTitle,
    categories: d.categories.map((c) => {
      const look = categoryLook(c);
      return {
        id: c.id ?? 'none',
        title: c.title,
        ...look,
        color: colorOf(look.color),
        amount: c.amount,
        share: d.categoryTotal > 0 ? c.amount / d.categoryTotal : 0,
      };
    }),
  };
}

/** Expenses of a month without a category, each with its suggestion, and those sorted in the app. */
export function uncategorizedScreen(data: EntityCollections, saved: SavedMarking, options: { today: DateString; month?: string | null }) {
  const d = loadUncategorized(data, saved, options);
  const left = d.pending.reduce((sum, p) => sum + p.expense.amount, 0);
  const pending = ({ expense: o, suggestion }: { expense: Operation; suggestion: Suggestion | null }) => ({
    ...row({
      id: `spending-${o.id}`,
      title: o.name,
      details: [writtenAbout(o), suggestion ? `похоже на ${suggestionName(suggestion)}` : 'без категории'].filter(Boolean).join(' · '),
      icon: 'tag',
      color: toneColor('gray'),
      logo: logoOf(o),
      amount: o.amount,
    }),
    spending: o.id,
    suggestion: suggestion ? { choice: suggestedChoice(suggestion), name: suggestionName(suggestion) } : null,
  });
  const sorted = (o: Operation) => {
    const regular = o.regular ? d.marking.regular.find((e) => e.id === o.regular?.id) : undefined;
    return {
      ...row({
        id: `spending-${o.id}`,
        title: markingTitle(o),
        details: markingDetails(o),
        ...categoryLook(o.category),
        ...(regular ? { icon: entryIcon(regular.icon, regular.title), photo: null } : { logo: logoOf(o) }),
        amount: o.amount,
        mark: envelopeOf(d.marking, o),
      }),
      spending: o.id,
      optional: o.optional,
    };
  };
  const month = monthName(d.month, 'prepositional');
  return {
    symbol: d.symbol,
    month: d.month,
    months: months(options.today),
    total: { label: `Без категории в ${month}`, amount: left, note: `${d.pending.length} ${plural(d.pending.length, ['трата', 'траты', 'трат'])} из ${d.count}` },
    pending: byDay(d.pending, (p) => p.expense.date, d.today).map((day) => ({ ...day, items: day.items.map(pending) })),
    sorted: byDay(d.sorted, (o) => o.date, d.today).map((day) => ({ ...day, items: day.items.map(sorted) })),
    empty: d.count ? 'Здесь пусто: у всех трат месяца есть категория.' : `В ${month} трат нет.`,
  };
}

/** Regular expenses in the order of the month, with what is left to pay of them, and the icons to pick from. */
export function regularScreen(data: EntityCollections, saved: SavedMarking, options: { today: DateString }) {
  const d = loadRegular(data, saved, options);
  const totals = regularTotals(d.expenses, d.today, d.linked);
  const { behind, ahead, later } = timeline(d);
  const item = ({ expense, status }: Placed) => ({
    ...row({ id: `regular-${expense.id}`, title: expense.title, ...regularLine(expense, status, d), amount: expense.amount }),
    expense: regularEntry(expense),
    values: regularValues(expense),
  });
  return {
    symbol: d.symbol,
    total: {
      label: `Осталось заплатить в ${monthName(d.today, 'prepositional')}`,
      amount: totals.ahead,
      note: regularTotalNote(d),
      parts: totals.count
        ? [
            { label: 'Оплачено', value: totals.paid, tone: STATUS_TONE.paid },
            { label: 'Прошли', value: totals.past, tone: STATUS_TONE.past },
            { label: 'Впереди', value: totals.ahead, tone: STATUS_TONE.ahead },
          ]
        : [],
    },
    behind: behind.map(item),
    today: `Сегодня, ${dayMonth(d.today)}`,
    ahead: ahead.map(item),
    later: later.map(item),
    icons: ENTRY_ICONS,
  };
}

function regularEntry(e: RegularExpense) {
  return { id: e.id, title: e.title, amount: e.amount, day: e.day, start: e.start, end: e.end, icon: e.icon };
}

/** Incomes with their next payments, and the models a new one can follow with their fields. */
export function incomeScreen(data: EntityCollections, incomes: Parameters<typeof loadIncome>[1], options: { today: DateString }) {
  const d = loadIncome(data, incomes, options);
  const icon = (model: IncomeModelId) => INCOME_ICONS[model];
  return {
    symbol: d.symbol,
    total: { label: 'В месяц', amount: monthlyIncome(d.incomes), note: incomeTotalNote(d) },
    incomes: d.incomes.map((income) => ({
      ...row({
        id: `income-${income.id}`,
        title: income.title,
        details: incomeDetails(income, d),
        icon: icon(income.model),
        color: incomeColor(income),
        amount: incomeModel(income.model).monthly(income.params),
      }),
      income: { id: income.id, model: income.model },
      values: incomeValues(income),
    })),
    upcoming: byDay(d.upcoming, (p) => p.date, d.today).map((day) => ({
      ...day,
      items: day.items.map((p, i) => ({
        ...row({
          id: `payment-${p.income.id}-${p.date}-${i}`,
          title: p.label ?? p.income.title,
          details: p.label ? p.income.title : incomeModel(p.income.model).schedule(p.income.params),
          icon: icon(p.income.model),
          color: incomeColor(p.income),
          amount: p.amount,
        }),
        formula: p.formula ?? null,
      })),
    })),
    models: INCOME_MODEL_IDS.map((id) => {
      const model = incomeModel(id);
      return { id, title: model.title, fields: model.fields, defaults: { title: '', ...model.defaults } };
    }),
  };
}

/** How many months the savings widget draws, this one last. */
const SAVINGS_MONTHS = 10;

/**
 * What the widgets show. The week: what is left of it, with its days, today among them and those with spending. Today:
 * what went into the week today and when the server last synced. The expenses of this month that wait for a category,
 * with the share of its expenses that do not. Savings: what this month's income is above its spending, as the
 * operations count them, against the month before and with the months before it. The next regular payment. The extras
 * of this month as the main page's card tells them, with what is spent of them and what the plan holds for them, and
 * where they are headed by the month's end.
 */
export function widgetScreen(data: EntityCollections, saved: SavedBudget, options: { today: DateString; syncedAt?: string | null }) {
  const { today } = options;
  const d = loadDashboard(data, saved, { today, source: 'zenmoney', canSync: false });
  const w = d.week;
  const spentOn = new Set(w.spending.map((o) => o.date));
  const todaySpent = w.spending.filter((o) => o.date === today && envelopeOf(d.marking, o) === 'week').reduce((sum, o) => sum + o.amount, 0);
  const u = loadUncategorized(data, saved, { today });
  const count = u.pending.length;
  const amount = u.pending.reduce((sum, p) => sum + p.expense.amount, 0);
  return {
    symbol: d.symbol,
    week: {
      label: 'Неделя',
      free: w.free,
      note: w.free < 0 ? 'потрачено сверх недели' : 'свободно до конца недели',
      days: Array.from({ length: 7 }, (_, i) => {
        const date = addDays(w.week, i);
        return { label: WEEKDAYS[weekday(date)], today: date === today, ahead: date > today, spent: spentOn.has(date) };
      }),
    },
    today: { label: 'Сегодня потрачено', amount: todaySpent, syncedAt: options.syncedAt ?? null },
    pending: {
      count,
      amount,
      /** Of this month's expenses, the share that has a category: the ring around the count. */
      sorted: u.count === 0 ? 1 : (u.count - count) / u.count,
      label: count === 0 ? 'Всё разобрано' : `${plural(count, ['трата ждёт', 'траты ждут', 'трат ждут'])} разбора`,
      title: count === 0 ? 'Все операции разобраны' : `${count} ${plural(count, ['трата ждёт', 'траты ждут', 'трат ждут'])} разбора`,
      note: count === 0 ? 'Отличная работа!' : `на ${money(amount, d.symbol)}`,
    },
    savings: savingsOf(data, saved, today, d.symbol),
    payment: nextPayment(data, saved, today),
    extras: {
      ...extrasCard(d.extras, d.symbol),
      limit: MONTH_LIMIT,
      spent: d.extras.spent,
      planned: d.extras.planned,
      forecast: extrasForecast(d.extras, saved.extrasLevels ?? EXTRAS_LEVELS, saved.weekStart, today, d.symbol),
    },
  };
}

/**
 * Income above spending of this month and of the months before it, as the operations count them: transfers between
 * the user's accounts and what is not counted left out. The months before the first operation are not drawn. Against
 * the month before in percent when both months saved, in money otherwise.
 */
function savingsOf(data: EntityCollections, saved: SavedMarking, today: DateString, symbol: string) {
  const current = monthOf(today);
  const first = shiftMonth(current, 1 - SAVINGS_MONTHS);
  const operations = listOperations(data, { from: dateOf(first, 1), to: dateOf(current, daysInMonth(current)) }, saved);
  const net = new Map<MonthString, number>();
  for (const o of operations) {
    const sign = o.kind === 'income' ? 1 : o.kind === 'expense' ? -1 : 0;
    if (sign !== 0) net.set(monthOf(o.date), (net.get(monthOf(o.date)) ?? 0) + sign * o.amount);
  }
  const months: Array<{ month: MonthString; amount: number }> = [];
  for (let month = first; month <= current; month = shiftMonth(month, 1)) {
    if (months.length > 0 || net.has(month) || month === current) months.push({ month, amount: net.get(month) ?? 0 });
  }
  const amount = net.get(current) ?? 0;
  const before = months.length > 1 ? (months.at(-2)?.amount ?? 0) : null;
  return {
    label: 'Накопления',
    period: 'в этом месяце',
    amount,
    change: before === null ? null : savingsChange(amount, before, symbol),
    months,
  };
}

function savingsChange(amount: number, before: number, symbol: string) {
  const diff = Math.round(amount) - Math.round(before);
  if (diff === 0) return { direction: 'same' as const, label: 'как в прошлом месяце', note: null };
  const direction = diff > 0 ? ('up' as const) : ('down' as const);
  const by = amount > 0 && before > 0 ? `${Math.round((Math.abs(diff) / before) * 100)}%` : money(Math.abs(diff), symbol);
  return { direction, label: `на ${by} ${diff > 0 ? 'больше' : 'меньше'}`, note: 'чем в прошлом месяце' };
}

/** The regular payment that comes next and is not paid yet: this month's, or else the next month's. */
function nextPayment(data: EntityCollections, saved: SavedMarking, today: DateString) {
  const { ahead, later } = timeline(loadRegular(data, saved, { today }));
  const next = ahead[0] ?? later[0];
  if (!next) return null;
  return { title: next.expense.title, amount: next.expense.amount - next.status.covered, date: dayMonth(next.status.date), when: fromToday(next.status.date, today) };
}

/**
 * The shops of the last three months, the most frequent first, or those a search finds by `q`, each with the other
 * names the bank gives it, without the count of its operations the page adds, and with its form: posted to
 * /api/shops/:key with title, site and photo, to /api/shops/:key/photo/delete and /api/shops/:key/forget (see
 * shops.ts).
 */
export function shopsScreen(data: EntityCollections, saved: SavedMarking, options: { today: DateString; query: string | null }) {
  const d = loadShopsPage(data, saved, options);
  return {
    query: d.query,
    /** How many shops the last three months had. */
    recent: d.recent,
    items: d.shops.map((e) => ({
      ...row({ id: `shop-${e.key}`, title: e.title, details: bankNames(e, e.title), ...shopLook(e.logo), photo: null, logo: e.logo }),
      shop: shopJSON(shopForm(e, d.setup)),
    })),
  };
}

/** A shop's form as the app's sheet of it takes it, which posts to /api/shops/:key. */
function shopJSON(f: ShopForm) {
  return {
    key: f.key,
    title: f.title,
    placeholder: f.placeholder,
    site: f.site,
    sitePlaceholder: f.sitePlaceholder,
    logo: f.logo,
    photo: f.photo,
    dressed: f.dressed,
    note: f.note,
    /** What it is made of, merged shops included: the names the bank gives it, the most frequent first. */
    names: f.names,
  };
}

/**
 * The day a week begins on, to pick from the days Monday first; it posts to /api/budget/week-start/:day. Round figures
 * on the main page post to /api/budget/round-figures/on or /off. Where the extras' widget tells plenty and tight posts
 * to /api/budget/extras-levels as plenty and tight.
 */
export function budgetSettingsScreen(data: EntityCollections, saved: Pick<SavedMarking, 'weekStart' | 'roundFigures' | 'extrasLevels'>) {
  const b = loadBudgetSetup(data, saved);
  return {
    symbol: b.symbol,
    weekStart: b.weekStart,
    roundFigures: b.roundFigures,
    extrasLevels: b.extrasLevels,
    weekdays: WEEKDAYS_FULL.map((day, value) => ({ value, label: capitalize(day) })),
    limit: WEEK_LIMIT,
  };
}

/**
 * Categories in the order marking offers them, the hidden ones apart, and the income categories the same way, with the
 * icons and colours to pick for one. A new income category posts to /api/categories with kind income; a category's
 * form posts its icon and colour as icon and color, empty for its own, and a photo as photo (see submitSettings).
 */
export function categoriesScreen(data: EntityCollections, saved: SavedMarking, options: { today: DateString }) {
  const d = loadSettingsPage(data, saved, options);
  const item = ({ category: c, kind, count, picked }: (typeof d.categories)[number]) => {
    const auto = autoLook(c);
    return {
      ...row({
        id: `${kind === 'income' ? 'income-' : ''}category-${c.id}`,
        title: c.title,
        details: categoryDetails(c, count, kind),
        ...categoryLook(c),
        ...(c.hidden ? { color: toneColor('gray') } : {}),
        muted: c.hidden,
      }),
      category: {
        id: c.id,
        name: c.name,
        zenmoneyTitle: c.zenmoneyTitle,
        hidden: c.hidden,
        kind,
        /** The icon and colour the user picked; null for the category's own, which `auto` gives. */
        icon: picked?.icon ?? null,
        color: picked?.color ?? null,
        auto: { icon: auto.icon, color: colorOf(auto.color) },
      },
    };
  };
  return {
    icons: CATEGORY_ICONS,
    colors: CATEGORY_COLORS,
    shown: d.categories.filter((c) => !c.category.hidden).map(item),
    hidden: d.categories.filter((c) => c.category.hidden).map(item),
    income: {
      shown: d.incomeCategories.filter((c) => !c.category.hidden).map(item),
      hidden: d.incomeCategories.filter((c) => c.category.hidden).map(item),
    },
  };
}

/**
 * A wish's screen: what it is and by when, the ways to afford it as cards to pick together, what they gather, and the
 * plan's steps up to buying it (see pages/wishes.ts). `ways` are the ways picked as the app sends them; without them
 * the screen shows the chosen plan. Null when there is no such wish.
 */
export function wishScreen(data: EntityCollections, saved: SavedBudget, options: { today: DateString; id: number; ways: string | null; incomes: Income[] }) {
  const { today } = options;
  const view = wishPlan(data, saved, options);
  const wish = saved.wishes.find((w) => w.id === options.id);
  if (!view || !wish) return null;
  const s = mainCurrency(data).symbol;
  const { goal, plan } = view;
  const late = plan.buyWeek > weekOf(goal.due, saved.weekStart);
  return {
    symbol: s,
    current: weekOf(today, saved.weekStart),
    wish: { id: wish.id, title: wish.title, amount: wish.amount, due: goal.due, dueSet: wish.due !== null },
    /** The days the wish can be needed by: from tomorrow to a year ahead. */
    dueRange: { from: addDays(today, 1), to: addDays(today, 365) },
    ways: wayCards(view, saved.purchases, s),
    picks: view.picks,
    covered: Math.min(goal.amount, view.gathered.covered),
    short: plan.short,
    /** What expenses set aside for the wish. */
    saved: view.gathered.saved,
    relay: relayAction(view, s),
    steps: planStepRows(view, saved, s),
    buy: { label: late ? `${weekLabel(plan.buyWeek)} · позже срока` : weekLabel(plan.buyWeek), late },
    chosen: view.chosen,
    planned: view.planned,
    bought: view.bought,
  };
}

/**
 * Every wish in one place, with its chosen plan: a card each with its day, the week it is bought, what the plan gathers
 * and the ways its money comes from, or that it has no plan; a row each for the list; and the money the plans of the
 * wishes not bought yet hold by month, each row naming its wish. Wishes go in the order they were added, the bought ones
 * last. A wish's situation is calm when its plan gathers it by its day, risk when the plan buys it later, problem when
 * the plan falls short, and action when it has no plan yet; a bought wish has none.
 */
export function wishesScreen(data: EntityCollections, saved: SavedBudget, options: { today: DateString; incomes: Income[] }) {
  const { today } = options;
  const s = mainCurrency(data).symbol;
  const expenses = allExpenses(data, saved);
  const views = saved.wishes.flatMap((wish) => {
    const view = wishPlan(data, saved, { today, id: wish.id, ways: null, incomes: options.incomes, expenses });
    return view ? [{ wish, view }] : [];
  });
  views.sort((a, b) => Number(a.view.bought) - Number(b.view.bought));
  const wishes = views.map(({ wish, view }) => {
    const state = view.bought ? 'bought' : view.planned ? 'planned' : 'none';
    const due = wish.due === null ? null : dueLabel(wish.due);
    const late = view.plan.buyWeek > weekOf(view.goal.due, saved.weekStart);
    const buy = state === 'planned' ? `купить ${weekLabel(view.plan.buyWeek)}${late ? ' · позже срока' : ''}` : null;
    const ways = state === 'planned' ? wayCards(view, saved.purchases, s).filter((w) => w.on && w.given > 0.5) : [];
    const kept = state === 'bought' ? null : savedWay(view.gathered);
    const line = state === 'bought' ? 'куплено' : [due, buy ?? 'не разложено'].filter(Boolean).join(' · ');
    const situation = state === 'bought' ? null : state === 'none' ? 'action' : view.plan.short > 0.5 ? 'problem' : late ? 'risk' : 'calm';
    return {
      ...row({ id: `wish-${wish.id}`, title: wish.title, details: line, icon: 'sparkles', color: toneColor(state === 'bought' ? 'gray' : 'yellow'), amount: wish.amount, muted: state === 'bought' }),
      wish: { id: wish.id, title: wish.title, amount: wish.amount },
      /** none: no plan chosen; planned; bought: an expense bought it. */
      state,
      situation,
      when: [due, buy].filter(Boolean).join(' · '),
      covered: state === 'bought' ? 0 : Math.min(wish.amount, state === 'none' ? view.gathered.saved : view.gathered.covered),
      short: state === 'planned' ? view.plan.short : 0,
      /** What expenses set aside for the wish. */
      saved: view.gathered.saved,
      relay: state === 'planned' ? relayAction(view, s) : null,
      ways: [...(kept ? [kept] : []), ...ways.map((w) => ({ id: w.id, title: w.title, icon: w.icon, color: w.color, line: w.line, amount: w.given }))],
    };
  });
  const held = new Map<MonthString, Array<{ wish: Wish; step: ReturnType<typeof planStepRows>[number] }>>();
  for (const { wish, view } of views) {
    if (!view.planned || view.bought) continue;
    for (const step of planStepRows(view, saved, s)) held.set(step.month, [...(held.get(step.month) ?? []), { wish, step }]);
  }
  const months = [...held]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, items]) => ({
      month,
      title: capitalize(monthName(month)),
      total: items.reduce((sum, { step }) => sum + step.counted, 0),
      rows: items
        .sort((a, b) => a.step.date.localeCompare(b.step.date) || a.wish.id - b.wish.id)
        .map(({ wish, step }) => ({
          ...row({
            id: `wish-${wish.id}-${step.id}`,
            title: wish.title,
            details: [step.title, step.details].filter(Boolean).join(' · '),
            icon: step.icon,
            color: step.color,
            amount: step.amount,
            mark: step.mark,
            muted: step.muted,
          }),
          wish: wish.id,
        })),
    }));
  return { symbol: s, wishes, months };
}

/**
 * What choosing the chosen plan's ways again does, as a button on the wish: «Добрать 1 000 ₽» when the plan lacks what
 * was not set aside, «Освободить 1 000 ₽» when more was set aside than planned. It posts `ways` to
 * /api/wishes/:id/ways. Null when choosing them again changes nothing.
 */
function relayAction(view: WishPlanView, s: string) {
  if (!view.relay || view.bought) return null;
  return { label: `${view.relay.add ? 'Добрать' : 'Освободить'} ${money(view.relay.amount, s)}`, amount: view.relay.amount, add: view.relay.add, ways: view.picks };
}

/** What is set aside for a wish as the first of the ways on its card: when, and how much; null when nothing is. */
function savedWay(gathered: Gathering) {
  const savings = [...gathered.held.flatMap((h) => h.paid), ...gathered.loose].sort((a, b) => b.date.localeCompare(a.date));
  const last = savings[0];
  if (!last || gathered.saved < 0.5) return null;
  const count = new Set(savings.map((o) => o.id)).size;
  const line = count === 1 ? dayMonth(last.date) : `${count} ${plural(count, ['раз', 'раза', 'раз'])}, последний ${dayMonth(last.date)}`;
  return { id: SAVED_WAY, title: 'Отложено', icon: 'piggy', color: 'green' satisfies Tone, line, amount: gathered.saved };
}

/**
 * A plan's steps by date as rows: each week's money held with what the week then allows, a month's extras held for the
 * buying or set aside, each with what expenses set aside of it (see heldLine), money set aside where the plan held
 * nothing, savings with what they keep, and the purchases moved; `month` is the month whose money each step takes, and
 * `counted` what it puts towards the wish, which the month's total adds up.
 */
function planStepRows(view: WishPlanView, saved: SavedBudget, s: string) {
  const { context, plan, gathered } = view;
  const buyingMonth = monthOfWeek(plan.buyWeek);
  const heldRows = gathered.held.map((status, i) => {
    const p = status.purchase;
    const id = `step-${i}`;
    const line = heldLine(status, s);
    const month = monthOfWeek(p.week);
    const counted = p.done ? status.covered : Math.max(p.amount, status.covered);
    const look: Pick<Row, 'icon' | 'color'> | null =
      line.state === 'set' ? { icon: 'check', color: toneColor('green') } : line.state === 'none' ? { icon: 'calendar', color: toneColor('gray') } : null;
    if (p.envelope === 'week') {
      const usual = weekLimit(context.budget, p.week);
      const details = line.details ?? `${num(usual - p.amount)} вместо ${num(usual)}`;
      return { date: p.week, month, counted, ...row({ id, title: weekLabel(p.week), details, ...(look ?? { icon: 'calendar', color: toneColor('yellow') }), amount: line.amount, mark: 'week', muted: line.state === 'none' }) };
    }
    const details = line.details ?? (month === buyingMonth ? 'на покупку' : 'отложить');
    return {
      date: p.week,
      month,
      counted,
      ...row({ id, title: `Дополнительные ${monthName(month, 'genitive')}`, details, ...(look ?? { icon: 'bag', color: toneColor('violet') }), amount: line.amount, mark: 'extra', muted: line.state === 'none' }),
    };
  });
  const looseRows = gathered.loose.map((o) => {
    const week = weekOf(o.date, context.budget.weekStart);
    return {
      date: week,
      month: monthOfWeek(week),
      counted: o.amount,
      ...row({ id: `saved-${o.id}`, title: weekLabel(week), details: 'отложено', icon: 'check', color: toneColor('green'), amount: o.amount, mark: o.saving?.envelope ?? 'week' }),
    };
  });
  const others = plan.steps.flatMap((step, i) => {
    const id = `other-${i}`;
    switch (step.kind) {
      case 'savings':
        return [{
          date: plan.buyWeek,
          month: step.month,
          counted: step.amount,
          ...row({ id, title: `Накопления ${monthName(step.month, 'genitive')}`, details: `останется ${num(context.savings(step.month) - step.amount)}`, icon: 'piggy', color: toneColor('green'), amount: step.amount, mark: 'outside' }),
        }];
      case 'move': {
        const title = saved.purchases.find((p) => p.id === step.purchase)?.title ?? 'Покупка';
        return [{
          date: step.from,
          month: monthOfWeek(step.from),
          counted: 0,
          ...row({ id, title, details: `перенести на ${monthName(monthOfWeek(step.to))}`, icon: 'arrows', color: toneColor('gray'), amount: step.amount }),
        }];
      }
      default:
        return [];
    }
  });
  return [...heldRows, ...looseRows, ...others].sort((a, b) => a.date.localeCompare(b.date));
}

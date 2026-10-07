// The JSON the iPhone app reads: each screen as the pages show it, its words included, so the app only lays it out
// and the rules stay here. The sentences that explain a page are left out: on a phone the figures speak for
// themselves, and so are the accounts money went from and the times. Rows carry an icon by name (see icons.ts), a colour as a tone's name or #rrggbb, and where an expense or
// a purchase counts as `mark`. Built from the same loaders and phrases as the pages.

import type { Suggestion } from '../categorization.ts';
import { addDays, monthOf, shiftMonth, type MonthString } from '../dates.ts';
import { INCOME_MODEL_IDS, incomeModel, incomeValues, monthlyIncome, type IncomeModelId } from '../income.ts';
import { listOperations, type Operation } from '../ledger.ts';
import { regularTotals, regularValues, type RegularExpense } from '../regular.ts';
import { adviceTarget, envelopeOf, monthOfWeek, WEEK_LIMIT, type Envelope, type PurchaseStatus, type WeekSummary } from '../week.ts';
import type { DateString, EntityCollections } from '../zenmoney/types.ts';
import { capitalize, dayHeading, dayMonth, money, monthName, plural, timeOn, weekLabel, WEEKDAYS_FULL } from './format.ts';
import { categoryIcon, ENTRY_ICONS, entryIcon, type IconName } from './icons.ts';
import { recentMonths } from './pages/chrome.ts';
import {
  adviceText,
  extrasTotal,
  loadDashboard,
  monthWeekLine,
  PLAN_AHEAD,
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
  PAYMENT_WORDS,
  paymentOptions,
  undoChoices,
  type Marking,
  type MarkingChoice,
  type SavedMarking,
} from './pages/marking.ts';
import { loadOperations, operationCategory, operationLine } from './pages/operations.ts';
import { loadRegular, regularLine, regularTotalNote, STATUS_TONE, timeline, type Placed } from './pages/regular.ts';
import { categoryDetails, loadBudgetSetup, loadSettingsPage } from './pages/settings.ts';
import { loadUncategorized, suggestedChoice, suggestionName } from './pages/uncategorized.ts';
import { categoryColor, toneColor } from './tones.ts';

/** A row of a list, as entryRow and operationRow draw it. */
export interface Row {
  /** Unique within the screen. */
  id: string;
  title: string;
  details: string;
  icon: IconName;
  /** A tone's name, such as violet, or a category's own colour as #rrggbb. */
  color: string;
  amount: number | null;
  /** Where it counts, as the dot before the amount; null when it has none. */
  mark: Envelope | null;
  muted: boolean;
}

/** An expense that opens to be marked by its ZenMoney id. */
export interface ExpenseRow extends Row {
  spending: string;
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
  return { amount: null, mark: null, muted: false, ...fields, color: colorOf(fields.color) };
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
      icon: o.category ? categoryIcon(o.category.title) : 'tag',
      color: categoryColor(o.category?.id ?? null, o.category?.color ?? null),
      amount: o.amount,
      mark: envelopeOf(m, o),
    }),
    spending: o.id,
  };
}

/** Expenses by day, newest first, as the sheet lists them under a heading for each day. */
function expenseDays(m: Pick<Marking, 'marks' | 'purchases'>, expenses: readonly Operation[], today: DateString): Array<Day<ExpenseRow>> {
  return byDay(expenses, (o) => o.date, today).map((day) => ({ ...day, items: day.items.map((o) => expenseRow(m, o)) }));
}

function purchaseRow(status: PurchaseStatus, current: DateString, symbol: string) {
  const { purchase: p, bought } = status;
  const key = `purchase-${p.id}`;
  const line = purchaseLine(status, current, symbol);
  return {
    ...row({
      id: key,
      title: p.title,
      details: line.details,
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
  };
}

function regularPaymentRow(payment: WeekSummary['regular'][number], symbol: string) {
  const { expense, date } = payment;
  const { details, done } = regularPaymentLine(payment, symbol);
  return {
    ...row({
      id: `regular-${expense.id}-${date}`,
      title: expense.title,
      details,
      icon: done ? 'check' : entryIcon(expense.icon, expense.title),
      color: toneColor(done ? 'green' : 'gray'),
      amount: expense.amount,
      mark: 'outside',
    }),
    regular: expense.id,
  };
}

// ---- Screens

export interface BudgetOptions {
  today: DateString;
  source: 'zenmoney' | 'demo';
  canSync: boolean;
}

/** The week tab: what is left, the spending by days, the plan and, in the current week, the wishes. */
export function weekScreen(data: EntityCollections, saved: SavedBudget, options: BudgetOptions & { week?: string | null }) {
  const { today } = options;
  const d = loadDashboard(data, saved, { ...options, week: options.week });
  const { current } = d;
  const w = d.week;
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
    /** What the week allows and the usual amount; another amount posts to /api/week-limits/:week, the usual one back to /api/week-limits/:week/delete. */
    limit: { amount: w.limit, usual: WEEK_LIMIT },
    days: expenseDays(d.marking, w.spending, today),
    plan: [...w.purchases.map((p) => purchaseRow(p, current, d.symbol)), ...w.regular.map((r) => regularPaymentRow(r, d.symbol))],
    wishes:
      phase === 'current'
        ? d.wishes.map(({ wish, advice }) => ({
            ...row({ id: `wish-${wish.id}`, title: wish.title, details: adviceText(advice, current, d.symbol), icon: 'sparkles', color: toneColor('yellow'), amount: wish.amount }),
            wish,
            plannable: adviceTarget(advice) !== null,
          }))
        : null,
    weekChoices: weekChoices(current),
    source: options.source,
    canSync: options.canSync,
  };
}

/** The month tab: its weeks, and its extras with what is left of them. */
export function monthScreen(data: EntityCollections, saved: SavedBudget, options: BudgetOptions & { month?: string | null }) {
  const { today } = options;
  const d = loadDashboard(data, saved, { ...options, view: 'month', month: options.month });
  const { current } = d;
  const thisMonth = monthOfWeek(current);
  const m = d.extras;
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
      const line = monthWeekLine(w, current, d.symbol);
      // The date beside the card says it is a week, so the title is only its days.
      return { ...row({ id: `week-${w.week}`, title: weekLabel(w.week), details: line.details, icon: 'calendar', color: toneColor(line.tone), amount: line.amount }), week: w.week };
    }),
    total,
    purchases: m.purchases.map((p) => purchaseRow(p, current, d.symbol)),
    spending: expenseDays(d.marking, m.spending, today),
    newPurchaseWeek: m.month === thisMonth ? current : (d.weeks[0]?.week ?? current),
    weekChoices: weekChoices(current),
    source: options.source,
    canSync: options.canSync,
  };
}

/**
 * An expense opened to be marked: when and from where it was paid with whatever else the bank said, then the choices
 * as the pages offer them, each with an icon for the app's tiles. Each choice posts to /api/spending/:id/:choice.
 * Null when there is no such expense.
 */
export function spendingScreen(data: EntityCollections, saved: SavedMarking, options: { today: DateString; id: string }) {
  const expenses = allExpenses(data, saved);
  // Expenses that do not count are marked too, from the operations, so they are looked up among all of them.
  const o = listOperations(data, { from: '0000-01-01', to: '9999-12-31' }, saved, { withIgnored: true }).find((e) => e.id === options.id && e.kind === 'expense');
  if (!o) return null;
  const marking = loadMarking(data, saved, expenses, options.today);
  const suggestion = o.category === null ? marking.suggest(o) : null;
  const payments = paymentOptions(marking, o, suggestion);
  const categories = categoryOptions(marking, o, suggestion);
  const colored = (c: MarkingChoice): MarkingChoice => (c.color ? { ...c, color: colorOf(c.color) } : c);
  const regular = new Map(saved.regular.map((e) => [`regular-${e.id}`, e]));
  const purchases = new Map(saved.purchases.map((p) => [`purchase-${p.id}`, p]));
  /** A payment's icon: the one picked for its regular expense, or one by its title. */
  const paymentIcon = (choice: string): IconName => {
    const e = regular.get(choice);
    return e ? entryIcon(e.icon, e.title) : categoryIcon(purchases.get(choice)?.title ?? '');
  };
  const time = timeOn(o.date, o.created);
  return {
    id: o.id,
    title: markingTitle(o),
    amount: o.amount,
    symbol: marking.symbol,
    when: time ? `${dayMonth(o.date)}, ${time}` : dayMonth(o.date),
    account: o.account,
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
    categories: { choices: categories.choices.map((c) => ({ ...colored(c), icon: categoryIcon(c.label) })), empty: categories.empty },
    envelopes: envelopeOptions(marking, o),
    undo: undoChoices(marking, o),
  };
}

/** Operations of a month by day, filtered as on the page, and the month's spending by category. */
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
    ...(d.counts.transfer > 0 || d.filter.kind === 'transfer' ? [{ value: 'transfer', label: 'Переводы', count: d.counts.transfer }] : []),
  ];
  const filtered = Boolean(d.filter.kind || d.filter.category || d.filter.query);
  const sum = (kind: Operation['kind']) => d.operations.filter((o) => o.kind === kind && !o.ignored).reduce((total, o) => total + o.amount, 0);
  return {
    symbol: d.symbol,
    month: d.month,
    months: months(options.today),
    title: `Операции за ${monthName(d.month)}`,
    kinds,
    kind: d.filter.kind ?? null,
    category: d.filter.category ?? null,
    categoryTitle: d.categoryTitle,
    query: d.filter.query ?? null,
    /** What the operations that pass the filter spent and brought, and how many there are. */
    totals: { expense: sum('expense'), income: sum('income'), count: d.operations.length },
    days: byDay(d.operations, (o) => o.date, options.today).map((day) => ({
      ...day,
      net: day.items.reduce((s, o) => s + (o.kind === 'income' ? o.amount : o.kind === 'expense' && !o.ignored ? -o.amount : 0), 0),
      items: day.items.map((o) => ({
        ...row({
          id: o.id,
          title: o.payee,
          ...operationLine(o),
          details: o.kind === 'transfer' ? `${o.account} → ${o.toAccount}` : operationCategory(o),
          amount: o.amount,
          muted: o.ignored,
        }),
        kind: o.kind,
        comment: o.comment,
        hold: o.hold,
        original: o.original ? { amount: o.original.amount, symbol: o.original.instrument.symbol } : null,
        spending: o.kind === 'expense' ? o.id : null,
      })),
    })),
    empty: filtered
      ? 'Ничего не нашлось. Попробуйте другой запрос или уберите фильтры.'
      : `В ${monthName(d.month, 'prepositional')} операций нет. Новые появятся после синхронизации ZenMoney.`,
    categories: d.categories.map((c) => ({
      id: c.id ?? 'none',
      title: c.title,
      icon: categoryIcon(c.title),
      color: colorOf(categoryColor(c.id, c.color)),
      amount: c.amount,
      share: d.expense > 0 ? c.amount / d.expense : 0,
    })),
  };
}

/** Expenses of a month without a category, each with its suggestion, and those sorted in the app. */
export function uncategorizedScreen(data: EntityCollections, saved: SavedMarking, options: { today: DateString; month?: string | null }) {
  const d = loadUncategorized(data, saved, options);
  const left = d.pending.reduce((sum, p) => sum + p.expense.amount, 0);
  const pending = ({ expense: o, suggestion }: { expense: Operation; suggestion: Suggestion | null }) => ({
    ...row({
      id: `spending-${o.id}`,
      title: o.payee,
      details: [o.comment, suggestion ? `похоже на ${suggestionName(suggestion)}` : 'без категории'].filter(Boolean).join(' · '),
      icon: 'tag',
      color: toneColor('gray'),
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
        icon: regular ? entryIcon(regular.icon, regular.title) : o.category ? categoryIcon(o.category.title) : 'tag',
        color: categoryColor(o.category?.id ?? null, o.category?.color ?? null),
        amount: o.amount,
        mark: envelopeOf(d.marking, o),
      }),
      spending: o.id,
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

/**
 * What the widget shows: what is left of the current week with its bar, and the expenses of this month that still
 * wait for a category, as the «Разобрать» tab counts them.
 */
export function widgetScreen(data: EntityCollections, saved: SavedBudget, options: { today: DateString }) {
  const { today } = options;
  const d = loadDashboard(data, saved, { today, source: 'zenmoney', canSync: false });
  const total = weekTotal(d.week, d.current, d.symbol);
  const { pending } = loadUncategorized(data, saved, { today });
  const count = pending.length;
  return {
    symbol: d.symbol,
    week: weekLabel(d.week.week),
    free: total.amount,
    note: total.note,
    parts: total.parts,
    pending: {
      count,
      amount: pending.reduce((sum, p) => sum + p.expense.amount, 0),
      note: count === 0 ? 'Всё разобрано' : `${count} ${plural(count, ['трата', 'траты', 'трат'])} без категории`,
    },
  };
}

/** The day a week begins on, to pick from the days Monday first; it posts to /api/budget/week-start/:day. */
export function budgetSettingsScreen(data: EntityCollections, saved: Pick<SavedMarking, 'weekStart'>) {
  const b = loadBudgetSetup(data, saved);
  return {
    symbol: b.symbol,
    weekStart: b.weekStart,
    weekdays: WEEKDAYS_FULL.map((day, value) => ({ value, label: capitalize(day) })),
    limit: WEEK_LIMIT,
  };
}

/** Categories in the order marking offers them, the hidden ones apart. */
export function categoriesScreen(data: EntityCollections, saved: SavedMarking, options: { today: DateString }) {
  const d = loadSettingsPage(data, saved, options);
  const item = ({ category: c, count }: (typeof d.categories)[number]) => ({
    ...row({
      id: `category-${c.id}`,
      title: c.title,
      details: categoryDetails(c, count),
      icon: categoryIcon(c.title),
      color: c.hidden ? toneColor('gray') : categoryColor(c.id, c.color),
      muted: c.hidden,
    }),
    category: { id: c.id, name: c.name, zenmoneyTitle: c.zenmoneyTitle, hidden: c.hidden },
  });
  return {
    shown: d.categories.filter((c) => !c.category.hidden).map(item),
    hidden: d.categories.filter((c) => c.category.hidden).map(item),
  };
}

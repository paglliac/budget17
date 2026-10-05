// Everything the prototype variants show, computed from ZenMoney collections for one month.
// PROTOTYPE: throwaway code, see server.ts.

import { convert, summarizeBalances, type BalanceSummary } from '../balances.ts';
import type { EntityCollections, Instrument, TagId, Transaction } from '../zenmoney/types.ts';
import {
  addDays,
  argbToHex,
  categoryIcon,
  dateOf,
  daysBetween,
  daysInMonth,
  money,
  shiftMonth,
  type IconName,
} from './shared.ts';

export type Source = 'zenmoney' | 'demo';
export type OperationKind = 'expense' | 'income' | 'transfer';

export interface Operation {
  id: string;
  date: string;
  /** Unix seconds, used for ordering within a day and for the time of day. */
  created: number;
  kind: OperationKind;
  /** In the main currency, always positive. */
  amount: number;
  /** '12,99 $' when the operation was not in the main currency. */
  original: string | null;
  payee: string;
  comment: string | null;
  categoryId: string;
  category: string;
  color: string;
  icon: IconName;
  account: string;
  toAccount: string | null;
  hold: boolean;
  mcc: number | null;
}

export interface CategoryStat {
  id: string;
  title: string;
  color: string;
  icon: IconName;
  spent: number;
  count: number;
  lastDate: string | null;
  prevSpent: number;
  /** Previous month up to the same day of month. */
  prevToDate: number;
  /** Average over the three months before the selected one. */
  avg: number;
  /** Planned expense from ZenMoney budgets. */
  budget: number | null;
}

export interface Planned {
  id: string;
  date: string;
  daysLeft: number;
  kind: OperationKind;
  amount: number;
  title: string;
  category: string;
  color: string;
  icon: IconName;
  account: string;
}

export interface Dashboard {
  source: Source;
  today: string;
  /** Selected month, 'yyyy-MM'. */
  month: string;
  /** The last six months, newest first. */
  months: string[];
  isCurrentMonth: boolean;
  daysInMonth: number;
  /** Today's day of month for the current month, the last day for past months. */
  dayOfMonth: number;
  main: Instrument;
  balance: BalanceSummary;
  income: number;
  expense: number;
  prevIncome: number;
  prevExpense: number;
  prevExpenseToDate: number;
  /** Whole-month budget, or the sum of category budgets; null when there are none. */
  budgetTotal: number | null;
  dailyExpense: number[];
  dailyIncome: number[];
  /** Expense categories, by spending in the month. */
  categories: CategoryStat[];
  /** Operations of the month, newest first. */
  operations: Operation[];
  /** Operations of the six months up to the selected one, newest first. */
  history: Operation[];
  /** Planned operations for the next 45 days. */
  planned: Planned[];
  /** Total balance at the end of each day up to dayOfMonth. */
  balanceSeries: number[];
  /** Expected balance for each day after dayOfMonth: planned operations plus typical daily spending. */
  forecastSeries: number[];
  startBalance: number;
  /** Balance expected at the end of the month (actual for past months). */
  endBalance: number;
  /** Typical daily spending outside planned operations, from the last 90 days. */
  typicalDaily: number;
}

interface Category {
  id: string;
  title: string;
  color: string;
  icon: IconName;
}

const PALETTE = ['#4FAE7F', '#F09A4A', '#5B84F0', '#9479E6', '#39B5C9', '#E2678B', '#EF7E6E', '#F2C14E', '#C58AD0', '#8FA35B'];
const WHOLE_MONTH_BUDGET = '00000000-0000-0000-0000-000000000000';
const TRANSFER: Category = { id: 'transfer', title: 'Перевод', color: '#9AA0A6', icon: 'arrows' };
const NO_EXPENSE_CATEGORY: Category = { id: 'none', title: 'Без категории', color: '#AEAEA8', icon: 'tag' };
const NO_INCOME_CATEGORY: Category = { id: 'income', title: 'Доход', color: '#3FA46A', icon: 'arrowDownLeft' };

export function buildDashboard(
  data: EntityCollections,
  options: { today: string; month?: string | null; source: Source },
): Dashboard {
  const { today, source } = options;
  const balance = summarizeBalances(data);
  const main = balance.mainInstrument;
  const instruments = new Map((data.instrument ?? []).map((i) => [i.id, i]));
  const accounts = new Map((data.account ?? []).map((a) => [a.id, a]));
  const tags = new Map((data.tag ?? []).map((t) => [t.id, t]));
  const merchants = new Map((data.merchant ?? []).map((m) => [m.id, m.title]));

  const currentMonth = today.slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(currentMonth, -i));
  const requested = options.month ?? '';
  const month = /^\d{4}-\d{2}$/.test(requested) && requested <= currentMonth ? requested : currentMonth;
  const isCurrentMonth = month === currentMonth;
  const days = daysInMonth(month);
  const dayOfMonth = isCurrentMonth ? Number(today.slice(8, 10)) : days;
  const monthStart = dateOf(month, 1);
  const monthEnd = dateOf(month, days);
  const prevMonth = shiftMonth(month, -1);

  const inMain = (amount: number, instrumentId: number) => {
    const instrument = instruments.get(instrumentId);
    return instrument ? convert(amount, instrument, main) : amount;
  };

  const categoryOf = (tagIds: TagId[] | null, kind: OperationKind): Category => {
    if (kind === 'transfer') return TRANSFER;
    const tag = tagIds?.[0] ? tags.get(tagIds[0]) : undefined;
    const top = tag?.parent ? (tags.get(tag.parent) ?? tag) : tag;
    if (!top) return kind === 'income' ? NO_INCOME_CATEGORY : NO_EXPENSE_CATEGORY;
    return {
      id: top.id,
      title: top.title,
      color: argbToHex(top.color) ?? PALETTE[hash(top.id) % PALETTE.length]!,
      icon: categoryIcon(top.title),
    };
  };

  const toOperation = (t: Transaction): Operation | null => {
    const kind = classify(t);
    if (!kind) return null;
    const isIncome = kind === 'income';
    const amount = isIncome ? t.income : t.outcome;
    const instrumentId = isIncome ? t.incomeInstrument : t.outcomeInstrument;
    const opAmount = isIncome ? t.opIncome : t.opOutcome;
    const opInstrumentId = isIncome ? t.opIncomeInstrument : t.opOutcomeInstrument;
    const shownInstrument = instruments.get(opAmount && opInstrumentId ? opInstrumentId : instrumentId);
    const shownAmount = opAmount && opInstrumentId ? opAmount : amount;
    const category = categoryOf(t.tag, kind);
    const account = accounts.get(isIncome ? t.incomeAccount : t.outcomeAccount)?.title ?? 'Счёт';
    const toAccount = kind === 'transfer' ? (accounts.get(t.incomeAccount)?.title ?? 'Счёт') : null;
    return {
      id: t.id,
      date: t.date,
      created: t.created,
      kind,
      amount: inMain(amount, instrumentId),
      original:
        shownInstrument && shownInstrument.id !== main.id
          ? money(shownAmount, shownInstrument.symbol, { cents: true })
          : null,
      payee:
        t.payee?.trim() ||
        (t.merchant ? merchants.get(t.merchant) : undefined) ||
        t.originalPayee?.trim() ||
        (toAccount ? `${account} → ${toAccount}` : category.title),
      comment: t.comment?.trim() || null,
      categoryId: category.id,
      category: category.title,
      color: category.color,
      icon: category.icon,
      account,
      toAccount,
      hold: Boolean(t.hold),
      mcc: t.mcc,
    };
  };

  const all = (data.transaction ?? [])
    .filter((t) => !t.deleted)
    .map(toOperation)
    .filter((o) => o !== null)
    .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  const between = (from: string, to: string) => all.filter((o) => o.date >= from && o.date <= to);
  const total = (ops: Operation[], kind: OperationKind) =>
    ops.filter((o) => o.kind === kind).reduce((sum, o) => sum + o.amount, 0);

  const operations = between(monthStart, monthEnd);
  const prevOperations = between(dateOf(prevMonth, 1), dateOf(prevMonth, daysInMonth(prevMonth)));
  const prevToDate = prevOperations.filter((o) => Number(o.date.slice(8, 10)) <= dayOfMonth);

  // Categories
  const stats = new Map<string, CategoryStat>();
  const statOf = (c: Category) => {
    let stat = stats.get(c.id);
    if (!stat) {
      stat = { ...c, spent: 0, count: 0, lastDate: null, prevSpent: 0, prevToDate: 0, avg: 0, budget: null };
      stats.set(c.id, stat);
    }
    return stat;
  };
  const categoryOfOperation = (o: Operation): Category => ({ id: o.categoryId, title: o.category, color: o.color, icon: o.icon });
  for (const o of operations) {
    if (o.kind !== 'expense') continue;
    const stat = statOf(categoryOfOperation(o));
    stat.spent += o.amount;
    stat.count += 1;
    stat.lastDate ??= o.date;
  }
  for (const o of prevOperations) {
    if (o.kind === 'expense') statOf(categoryOfOperation(o)).prevSpent += o.amount;
  }
  for (const o of prevToDate) {
    if (o.kind === 'expense') statOf(categoryOfOperation(o)).prevToDate += o.amount;
  }
  for (const o of between(dateOf(shiftMonth(month, -3), 1), dateOf(prevMonth, 31))) {
    if (o.kind === 'expense') statOf(categoryOfOperation(o)).avg += o.amount / 3;
  }
  let wholeMonthBudget: number | null = null;
  for (const b of data.budget ?? []) {
    if (b.date !== monthStart || b.outcome <= 0) continue;
    if (b.tag === WHOLE_MONTH_BUDGET) {
      wholeMonthBudget = b.outcome;
    } else if (b.tag) {
      const stat = statOf(categoryOf([b.tag], 'expense'));
      stat.budget = (stat.budget ?? 0) + b.outcome;
    }
  }
  const categories = [...stats.values()]
    .filter((c) => c.spent > 0 || (c.budget ?? 0) > 0 || c.avg > 0)
    .sort((a, b) => b.spent - a.spent || (b.budget ?? b.avg) - (a.budget ?? a.avg));
  const categoryBudgets = categories.reduce((sum, c) => sum + (c.budget ?? 0), 0);

  // Days
  const dailyExpense = new Array<number>(days).fill(0);
  const dailyIncome = new Array<number>(days).fill(0);
  for (const o of operations) {
    const index = Number(o.date.slice(8, 10)) - 1;
    if (o.kind === 'expense') dailyExpense[index]! += o.amount;
    if (o.kind === 'income') dailyIncome[index]! += o.amount;
  }

  // Planned operations
  const horizon = addDays(today, 45);
  const planned = (data.reminderMarker ?? [])
    .filter((m) => m.state === 'planned' && m.date >= today && m.date <= horizon)
    .map((m): Planned | null => {
      const kind = classify(m);
      if (!kind) return null;
      const isIncome = kind === 'income';
      const category = categoryOf(m.tag, kind);
      return {
        id: m.id,
        date: m.date,
        daysLeft: daysBetween(today, m.date),
        kind,
        amount: inMain(isIncome ? m.income : m.outcome, isIncome ? m.incomeInstrument : m.outcomeInstrument),
        title: m.payee?.trim() || (m.merchant ? merchants.get(m.merchant) : undefined) || m.comment?.trim() || category.title,
        category: category.title,
        color: category.color,
        icon: category.icon,
        account: accounts.get(isIncome ? m.incomeAccount : m.outcomeAccount)?.title ?? '',
      };
    })
    .filter((p) => p !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Balance through the month, walking back from today's total.
  const counted = (id: string) => {
    const account = accounts.get(id);
    return Boolean(account && account.inBalance && !account.archive && account.type !== 'debt');
  };
  const netByDate = new Map<string, number>();
  for (const t of data.transaction ?? []) {
    if (t.deleted) continue;
    let net = 0;
    if (t.income > 0 && counted(t.incomeAccount)) net += inMain(t.income, t.incomeInstrument);
    if (t.outcome > 0 && counted(t.outcomeAccount)) net -= inMain(t.outcome, t.outcomeInstrument);
    if (net !== 0) netByDate.set(t.date, (netByDate.get(t.date) ?? 0) + net);
  }
  const lastActual = dateOf(month, dayOfMonth);
  let running = balance.total;
  for (const [date, net] of netByDate) {
    if (date > lastActual) running -= net;
  }
  const balanceSeries = new Array<number>(dayOfMonth).fill(0);
  for (let day = dayOfMonth; day >= 1; day--) {
    balanceSeries[day - 1] = running;
    running -= netByDate.get(dateOf(month, day)) ?? 0;
  }
  const startBalance = running;

  const typicalDaily = trimmedDailyMean(all, today);
  const forecastSeries: number[] = [];
  if (isCurrentMonth) {
    const plannedNet = (date: string) =>
      planned
        .filter((p) => p.date === date && p.kind !== 'transfer')
        .reduce((sum, p) => sum + (p.kind === 'income' ? p.amount : -p.amount), 0);
    let expected = (balanceSeries[dayOfMonth - 1] ?? balance.total) + plannedNet(today);
    for (let day = dayOfMonth + 1; day <= days; day++) {
      expected += plannedNet(dateOf(month, day)) - typicalDaily;
      forecastSeries.push(expected);
    }
  }

  return {
    source,
    today,
    month,
    months,
    isCurrentMonth,
    daysInMonth: days,
    dayOfMonth,
    main,
    balance,
    income: total(operations, 'income'),
    expense: total(operations, 'expense'),
    prevIncome: total(prevOperations, 'income'),
    prevExpense: total(prevOperations, 'expense'),
    prevExpenseToDate: total(prevToDate, 'expense'),
    budgetTotal: wholeMonthBudget ?? (categoryBudgets > 0 ? categoryBudgets : null),
    dailyExpense,
    dailyIncome,
    categories,
    operations,
    history: between(dateOf(shiftMonth(month, -5), 1), monthEnd),
    planned,
    balanceSeries,
    forecastSeries,
    startBalance,
    endBalance: forecastSeries.at(-1) ?? balanceSeries.at(-1) ?? balance.total,
    typicalDaily,
  };
}

function classify(o: { income: number; outcome: number }): OperationKind | null {
  if (o.income > 0 && o.outcome > 0) return 'transfer';
  if (o.outcome > 0) return 'expense';
  if (o.income > 0) return 'income';
  return null;
}

/** Mean daily spending over the last 90 days without the top 10% of days, which hold rent and one-off purchases. */
function trimmedDailyMean(operations: Operation[], today: string): number {
  const from = addDays(today, -90);
  const byDay = new Map<string, number>();
  for (let i = 1; i <= 90; i++) byDay.set(addDays(today, -i), 0);
  for (const o of operations) {
    if (o.kind === 'expense' && o.date >= from && o.date < today) {
      byDay.set(o.date, (byDay.get(o.date) ?? 0) + o.amount);
    }
  }
  const sorted = [...byDay.values()].sort((a, b) => a - b);
  const kept = sorted.slice(0, Math.floor(sorted.length * 0.9));
  return kept.length > 0 ? kept.reduce((sum, v) => sum + v, 0) / kept.length : 0;
}

function hash(text: string): number {
  let h = 0;
  for (const char of text) h = (h * 31 + char.charCodeAt(0)) >>> 0;
  return h;
}

// The budget by weeks: a limit for ordinary spending each week, a limit for extras each month, purchases planned
// into weeks, and when a wish fits. Spending from ZenMoney counts towards its week unless it is marked as extras
// or as outside the budget, or it paid a regular expense. Pure functions; what the user plans and marks is kept by
// src/settings.ts.

import { addDays, monthOf, weekday, type MonthString } from './dates.ts';
import type { Operation } from './ledger.ts';
import { nearestPayment, paymentDate, type RegularExpense } from './regular.ts';
import type { DateString } from './zenmoney/types.ts';

/** Ordinary spending allowed in a week. */
export const WEEK_LIMIT = 45_000;
/** Extras allowed in a month. */
export const MONTH_LIMIT = 100_000;
/** How many weeks ahead a wish looks for room. */
const WISH_HORIZON = 8;

/** Where spending counts: the week's limit, the month's extras, or nowhere, such as a transfer to savings. */
export type Envelope = 'week' | 'extra' | 'outside';

/** Something to buy in a week, from the week's money or from the month's extras. */
export interface Purchase {
  id: number;
  title: string;
  /** In the main currency, always positive. */
  amount: number;
  /** Monday of the week it is planned for. */
  week: DateString;
  envelope: 'week' | 'extra';
  done: boolean;
}

export type PurchaseInput = Omit<Purchase, 'id'>;

/** Something to buy some day; the budget tells when. */
export interface Wish {
  id: number;
  title: string;
  amount: number;
}

export type WishInput = Omit<Wish, 'id'>;

/** Everything the figures are made of. */
export interface Budget {
  /** Expenses from ZenMoney. */
  expenses: Operation[];
  purchases: Purchase[];
  /** Envelopes of spending moved out of its week, by operation id. */
  marks: ReadonlyMap<string, Envelope>;
  regular: RegularExpense[];
}

/** Monday of the date's week. */
export function weekOf(date: DateString): DateString {
  return addDays(date, -weekday(date));
}

/** A week belongs to the month that holds its Thursday, that is most of its days, so it counts in one month only. */
export function monthOfWeek(week: DateString): MonthString {
  return monthOf(addDays(week, 3));
}

/** Mondays of the weeks that belong to a month. */
export function weeksOfMonth(month: MonthString): DateString[] {
  let week = weekOf(`${month}-01`);
  if (monthOfWeek(week) !== month) week = addDays(week, 7);
  const weeks: DateString[] = [];
  for (; monthOfWeek(week) === month; week = addDays(week, 7)) weeks.push(week);
  return weeks;
}

/** Spending counts towards its week until moved; a payment of a regular expense is outside the budget, as the expense is. */
export function envelopeOf(budget: Pick<Budget, 'marks'>, operation: Pick<Operation, 'id' | 'regular'>): Envelope {
  return budget.marks.get(operation.id) ?? (operation.regular ? 'outside' : 'week');
}

export interface WeekSummary {
  week: DateString;
  /** Spending of the week that counts towards its limit. */
  spent: number;
  /** Purchases from the week's money not bought yet. */
  planned: number;
  /** What is left after the spending and the planned purchases; negative when over the limit. */
  free: number;
  /** All expenses of the week, whatever they count towards, newest first. */
  spending: Operation[];
  purchases: Purchase[];
  /**
   * Regular payments that fall on the week; they are outside the budget. `paid` are the expenses linked to the regular
   * expense whose nearest payment is this one, newest first, even when they came in an earlier week.
   */
  regular: Array<{ expense: RegularExpense; date: DateString; paid: Operation[] }>;
}

export function summarizeWeek(budget: Budget, week: DateString): WeekSummary {
  const end = addDays(week, 6);
  const spending = budget.expenses.filter((o) => o.date >= week && o.date <= end);
  const purchases = budget.purchases.filter((p) => p.week === week);
  const spent = sum(spending.filter((o) => envelopeOf(budget, o) === 'week').map((o) => o.amount));
  const planned = sum(purchases.filter((p) => !p.done && p.envelope === 'week').map((p) => p.amount));
  const regular = [monthOf(week), monthOf(end)]
    .filter((month, i, months) => months.indexOf(month) === i)
    .flatMap((month) => budget.regular.flatMap((expense) => {
      const date = paymentDate(expense, month);
      if (date === null || date < week || date > end) return [];
      const paid = budget.expenses.filter((o) => o.regular?.id === expense.id && nearestPayment(expense, o.date) === date);
      return [{ expense, date, paid }];
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { week, spent, planned, free: WEEK_LIMIT - spent - planned, spending, purchases, regular };
}

export interface ExtrasSummary {
  month: MonthString;
  spent: number;
  /** Extras planned and not bought yet. */
  planned: number;
  free: number;
  /** Spending marked as extras in the month's weeks. */
  spending: Operation[];
  purchases: Purchase[];
}

export function summarizeExtras(budget: Budget, month: MonthString): ExtrasSummary {
  const spending = budget.expenses.filter((o) => envelopeOf(budget, o) === 'extra' && monthOfWeek(weekOf(o.date)) === month);
  const purchases = budget.purchases.filter((p) => p.envelope === 'extra' && monthOfWeek(p.week) === month);
  const spent = sum(spending.map((o) => o.amount));
  const planned = sum(purchases.filter((p) => !p.done).map((p) => p.amount));
  return { month, spent, planned, free: MONTH_LIMIT - spent - planned, spending, purchases };
}

/** When to buy a wish. */
export type Advice =
  /** It fits in this week's free money. */
  | { when: 'now'; week: DateString; freeAfter: number }
  /** It fits in a later week; `extrasNow` tells whether this month's extras could take it today. */
  | { when: 'later'; week: DateString; extrasNow: boolean }
  /** No week has room, but this month's extras do. */
  | { when: 'extras'; week: DateString; month: MonthString; freeAfter: number }
  | { when: 'never' };

/** The first of the next weeks with room for the wish, or this month's extras when no week has room. */
export function adviseWish(budget: Budget, wish: Pick<Wish, 'amount'>, today: DateString): Advice {
  const current = weekOf(today);
  const extras = summarizeExtras(budget, monthOfWeek(current));
  for (let i = 0; i < WISH_HORIZON; i++) {
    const week = addDays(current, 7 * i);
    const { free } = summarizeWeek(budget, week);
    if (free < wish.amount) continue;
    return i === 0 ? { when: 'now', week, freeAfter: free - wish.amount } : { when: 'later', week, extrasNow: extras.free >= wish.amount };
  }
  if (extras.free >= wish.amount) return { when: 'extras', week: current, month: extras.month, freeAfter: extras.free - wish.amount };
  return { when: 'never' };
}

/** Where a wish goes when it is planned as advised, or null when it fits nowhere. */
export function adviceTarget(advice: Advice): Pick<Purchase, 'week' | 'envelope'> | null {
  if (advice.when === 'never') return null;
  return { week: advice.week, envelope: advice.when === 'extras' ? 'extra' : 'week' };
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

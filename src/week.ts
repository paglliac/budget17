// The budget by weeks: a limit for ordinary spending each week, which the user can change for a week, a limit for
// extras each month, purchases planned into weeks, and when a wish fits. A week begins on the day the user picked,
// Monday unless they picked another. Spending from ZenMoney counts towards its week unless it is marked as extras
// or as outside the budget, or it paid a regular expense or an extra purchase. Spending linked to a purchase takes
// its amount out of the plan. Pure functions; what the user plans and marks is kept by src/settings.ts.

import { addDays, monthOf, weekday, type MonthString } from './dates.ts';
import type { Operation } from './ledger.ts';
import { paidBy, paymentDate, type RegularExpense } from './regular.ts';
import type { DateString } from './zenmoney/types.ts';

/** Ordinary spending allowed in a week, unless the user set another amount for it. */
export const WEEK_LIMIT = 45_000;
/** Extras allowed in a month. */
export const MONTH_LIMIT = 100_000;
/** How many weeks ahead a wish looks for room. */
const WISH_HORIZON = 8;

/**
 * Where spending counts: the week's limit, the month's extras, outside the budget, such as a transfer to savings, or
 * not at all, such as cash taken out that is only lying in a drawer. Spending not counted at all is left out of
 * everything but the list of operations (see listOperations).
 */
export type Envelope = 'week' | 'extra' | 'outside' | 'ignored';

/** Whether a purchase had better stay where it is planned (a haircut booked for Friday) or can move to another week. */
export type PurchaseKind = 'required' | 'flexible';

/** Something to buy in a week, from the week's money or from the month's extras. */
export interface Purchase {
  id: number;
  title: string;
  /** In the main currency, always positive. */
  amount: number;
  /** First day of the week it is planned for. */
  week: DateString;
  envelope: 'week' | 'extra';
  kind: PurchaseKind;
  /** Finished: it keeps what the expenses linked to it paid, and the rest of its amount goes back. */
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

/** The day of the week a week begins on, 0 for Monday to 6 for Sunday, as weekday() counts. */
export type WeekStart = number;

/** Everything the figures are made of. */
export interface Budget {
  /** Expenses from ZenMoney. */
  expenses: Operation[];
  purchases: Purchase[];
  /** Envelopes of spending moved out of its week, by operation id. */
  marks: ReadonlyMap<string, Envelope>;
  regular: RegularExpense[];
  weekStart: WeekStart;
  /** What the user allowed for a week instead of WEEK_LIMIT, by the week's first day. */
  weekLimits: ReadonlyMap<DateString, number>;
}

/** The first day of the date's week. */
export function weekOf(date: DateString, start: WeekStart): DateString {
  return addDays(date, -((weekday(date) - start + 7) % 7));
}

/**
 * A week belongs to the month that holds its fourth day, that is most of its days, so it counts in one month only:
 * the Thursday of a week from Monday.
 */
export function monthOfWeek(week: DateString): MonthString {
  return monthOf(addDays(week, 3));
}

/**
 * The week beginning on `start` that shares most days with a week that began on another day: where a purchase or a
 * week's limit goes when the user picks another first day. A week that already begins on `start` stays.
 */
export function alignWeek(week: DateString, start: WeekStart): DateString {
  return weekOf(addDays(week, 3), start);
}

/** First days of the weeks that belong to a month. */
export function weeksOfMonth(month: MonthString, start: WeekStart): DateString[] {
  let week = weekOf(`${month}-01`, start);
  if (monthOfWeek(week) !== month) week = addDays(week, 7);
  const weeks: DateString[] = [];
  for (; monthOfWeek(week) === month; week = addDays(week, 7)) weeks.push(week);
  return weeks;
}

/**
 * Spending counts towards its week until moved; a payment of a regular expense is outside the budget, as the expense
 * is, and a payment of a purchase counts where the purchase does.
 */
export function envelopeOf(budget: Pick<Budget, 'marks' | 'purchases'>, operation: Pick<Operation, 'id' | 'regular' | 'purchase'>): Envelope {
  const marked = budget.marks.get(operation.id);
  if (marked) return marked;
  if (operation.regular) return 'outside';
  const purchase = operation.purchase ? budget.purchases.find((p) => p.id === operation.purchase?.id) : undefined;
  return purchase?.envelope ?? 'week';
}

/** A purchase with the expenses that paid it. */
export interface PurchaseStatus {
  purchase: Purchase;
  /** Expenses linked to the purchase, newest first. */
  paid: Operation[];
  /** What they paid in all. */
  covered: number;
  /** Bought: finished, or paid in full by the expenses linked to it. */
  bought: boolean;
  /** What the plan still holds for it: nothing once bought. */
  left: number;
}

export function purchaseStatus(purchase: Purchase, expenses: readonly Operation[]): PurchaseStatus {
  const paid = expenses.filter((o) => o.purchase?.id === purchase.id);
  const covered = sum(paid.map((o) => o.amount));
  const bought = purchase.done || covered >= purchase.amount - 0.005;
  return { purchase, paid, covered, bought, left: bought ? 0 : purchase.amount - covered };
}

export interface WeekSummary {
  week: DateString;
  /** Ordinary spending allowed in the week. */
  limit: number;
  /** Spending of the week that counts towards its limit. */
  spent: number;
  /** What the plan still holds for purchases from the week's money. */
  planned: number;
  /** The part of `planned` held for required purchases; the rest is for flexible ones. */
  required: number;
  /** What is left after the spending and the planned purchases; negative when over the limit. */
  free: number;
  /** All expenses of the week, whatever they count towards, newest first. */
  spending: Operation[];
  purchases: PurchaseStatus[];
  /**
   * Regular payments that fall on the week; they are outside the budget. `paid` are the expenses linked to the regular
   * expense whose nearest payment is this one, newest first, even when they came in an earlier week.
   */
  regular: Array<{ expense: RegularExpense; date: DateString; paid: Operation[] }>;
}

export function summarizeWeek(budget: Budget, week: DateString): WeekSummary {
  const end = addDays(week, 6);
  const spending = budget.expenses.filter((o) => o.date >= week && o.date <= end);
  const purchases = budget.purchases.filter((p) => p.week === week).map((p) => purchaseStatus(p, budget.expenses));
  const spent = sum(spending.filter((o) => envelopeOf(budget, o) === 'week').map((o) => o.amount));
  const fromWeek = purchases.filter((p) => p.purchase.envelope === 'week');
  const planned = sum(fromWeek.map((p) => p.left));
  const required = sum(fromWeek.filter((p) => p.purchase.kind === 'required').map((p) => p.left));
  const regular = [monthOf(week), monthOf(end)]
    .filter((month, i, months) => months.indexOf(month) === i)
    .flatMap((month) => budget.regular.flatMap((expense) => {
      const date = paymentDate(expense, month);
      if (date === null || date < week || date > end) return [];
      return [{ expense, date, paid: paidBy(expense, date, budget.expenses) }];
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const limit = weekLimit(budget, week);
  return { week, limit, spent, planned, required, free: limit - spent - planned, spending, purchases, regular };
}

/** What a week allows: the amount the user set for it, or WEEK_LIMIT. */
export function weekLimit(budget: Pick<Budget, 'weekLimits'>, week: DateString): number {
  return budget.weekLimits.get(week) ?? WEEK_LIMIT;
}

export interface ExtrasSummary {
  month: MonthString;
  spent: number;
  /** What the plan still holds for extras. */
  planned: number;
  free: number;
  /** Spending marked as extras, or paying an extra purchase, in the month's weeks. */
  spending: Operation[];
  purchases: PurchaseStatus[];
}

export function summarizeExtras(budget: Budget, month: MonthString): ExtrasSummary {
  const spending = budget.expenses.filter((o) => envelopeOf(budget, o) === 'extra' && monthOfWeek(weekOf(o.date, budget.weekStart)) === month);
  const purchases = budget.purchases.filter((p) => p.envelope === 'extra' && monthOfWeek(p.week) === month).map((p) => purchaseStatus(p, budget.expenses));
  const spent = sum(spending.map((o) => o.amount));
  const planned = sum(purchases.map((p) => p.left));
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
  const current = weekOf(today, budget.weekStart);
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

// The budget by weeks: a limit for ordinary spending each week, which the user can change for a week, a limit for
// extras each month, purchases planned into weeks, and when a wish fits. A week begins on the day the user picked,
// Monday unless they picked another. Spending from ZenMoney counts towards its week unless it is marked as extras
// or as outside the budget, or it paid a regular expense, an extra purchase or a wish. Spending linked to a purchase
// takes its amount out of the plan. The money the plans of wishes hold comes as purchases too (see wish-plans.ts), and
// spending that set money aside for a wish takes its amount out of what the plan holds in its week or month.
// Pure functions; what the user plans and marks is kept by src/settings.ts.

import { addDays, daysBetween, monthOf, weekday, type MonthString } from './dates.ts';
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
  /** The wish whose plan holds this money (see wish-plans.ts); such a purchase is not in settings.db. */
  wish?: number;
  /**
   * For the money a wish's plan holds: the days whose expenses that set money aside for the wish from its envelope pay
   * it, those of its week or of its month's weeks.
   */
  savedIn?: { from: DateString; to: DateString };
}

export type PurchaseInput = Omit<Purchase, 'id' | 'wish'>;

/** Something to buy some day, by the day it is needed if the user said; the budget tells when, or how to afford it. */
export interface Wish {
  id: number;
  title: string;
  amount: number;
  due: DateString | null;
}

export type WishInput = Omit<Wish, 'id' | 'due'>;

/** An expense that set money aside for a wish, from the week's money or from the extras. */
export interface WishSaving {
  wish: number;
  envelope: 'week' | 'extra';
}

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
 * is, a payment of a purchase counts where the purchase does, and a payment of a wish is outside it too, since the
 * wish's plan held its money in the weeks and extras before. Money set aside for a wish counts where the plan held it.
 */
export function envelopeOf(budget: Pick<Budget, 'marks' | 'purchases'>, operation: Pick<Operation, 'id' | 'regular' | 'purchase' | 'wish' | 'saving'>): Envelope {
  const marked = budget.marks.get(operation.id);
  if (marked) return marked;
  if (operation.regular || operation.wish) return 'outside';
  if (operation.saving) return operation.saving.envelope;
  const purchase = operation.purchase ? budget.purchases.find((p) => p.id === operation.purchase?.id) : undefined;
  return purchase?.envelope ?? 'week';
}

/**
 * Whether an expense pays a purchase: it is linked to it, or, for the money a wish's plan holds, it set money aside
 * for the wish from the purchase's envelope on one of its days.
 */
export function pays(purchase: Purchase, o: Pick<Operation, 'date' | 'purchase' | 'saving'>): boolean {
  if (o.purchase?.id === purchase.id) return true;
  const days = purchase.savedIn;
  const saving = o.saving;
  return days !== undefined && saving != null && saving.id === purchase.wish && saving.envelope === purchase.envelope && o.date >= days.from && o.date <= days.to;
}

/** A purchase with the expenses that paid it. */
export interface PurchaseStatus {
  purchase: Purchase;
  /** Expenses linked to the purchase, or that set its money aside for a wish, newest first. */
  paid: Operation[];
  /** What they paid in all. */
  covered: number;
  /** Bought: finished, or paid in full by the expenses linked to it. */
  bought: boolean;
  /** What the plan still holds for it: nothing once bought. */
  left: number;
}

export function purchaseStatus(purchase: Purchase, expenses: readonly Operation[]): PurchaseStatus {
  const paid = expenses.filter((o) => pays(purchase, o));
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

/** Where a month's extras are headed by its end: plenty is left, a calm amount, little, or the plan holds more than is left. */
export type ExtrasState = 'plenty' | 'calm' | 'tight' | 'short';

/** What left at a month's end has plenty from, and what is tight below; short is below zero. */
export interface ExtrasLevels {
  plenty: number;
  tight: number;
}

/** The levels unless the user set others in the settings. */
export const EXTRAS_LEVELS: ExtrasLevels = { plenty: 30_000, tight: 10_000 };

export interface ExtrasOutlook {
  /** What is left of MONTH_LIMIT after what is spent, the plan not taken yet. */
  left: number;
  /** What will be left at the month's end once the plan is bought; what else comes nobody knows, so nothing. */
  end: number;
  state: ExtrasState;
}

/** A month's extras by its end, after what is spent and what the plan holds for them. */
export function extrasOutlook(m: ExtrasSummary, levels: ExtrasLevels): ExtrasOutlook {
  const end = m.free;
  const state = end < -0.5 ? 'short' : end < levels.tight ? 'tight' : end < levels.plenty ? 'calm' : 'plenty';
  return { left: MONTH_LIMIT - m.spent, end, state };
}

/** A point of the line a month's extras draw: where in the month, 0 at its first day to 1 at the end of its last. */
export interface ExtrasPoint {
  share: number;
  amount: number;
  /** The end of one of the month's weeks; the last point is the month's end. */
  week: boolean;
}

/**
 * What a month's extras have set aside, as if each day of the month's weeks brought its share of MONTH_LIMIT and each
 * expense took its amount: rising while less is spent than comes, falling when more. Up to today as spent, from today
 * straight to what will be left at the month's end once the plan is bought. A point at the start, at the end of every
 * week and at the end of today if it does not end a week.
 */
export function extrasPath(m: ExtrasSummary, start: WeekStart, today: DateString): ExtrasPoint[] {
  const weeks = weeksOfMonth(m.month, start);
  const first = weeks[0];
  if (first === undefined) return [];
  const days = weeks.length * 7;
  const setAside = (day: number) => (MONTH_LIMIT * day) / days - sum(m.spending.filter((o) => o.date < addDays(first, day)).map((o) => o.amount));
  // Days of the month gone by the end of today.
  const gone = Math.min(Math.max(daysBetween(first, today) + 1, 0), days);
  const now = setAside(gone);
  const at = (day: number) => (day <= gone && day < days ? setAside(day) : now + ((m.free - now) * (day - gone)) / (days - gone));
  const ends = weeks.map((_, i) => 7 * (i + 1));
  const points = [0, ...ends, ...(gone > 0 && !ends.includes(gone) ? [gone] : [])].sort((a, b) => a - b);
  return points.map((day) => ({ share: day / days, amount: day === days ? m.free : at(day), week: day > 0 && day % 7 === 0 }));
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

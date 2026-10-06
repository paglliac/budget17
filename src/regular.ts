// Regular expenses: payments that repeat every month on the same day, such as rent or a loan, optionally only
// between a start and an end date. They are entered in the app rather than in ZenMoney and kept by src/settings.ts.

import { addDays, clampedDate, daysBetween, monthOf, shiftMonth, type MonthString } from './dates.ts';
import { amountText, parseAmount, parseDay, parseOptionalDate, parseTitle } from './input.ts';
import type { Operation } from './ledger.ts';
import { soonestFirst, type PlannedOperation } from './planned.ts';
import type { DateString } from './zenmoney/types.ts';

export interface RegularExpense {
  id: number;
  title: string;
  /** In the main currency, always positive. */
  amount: number;
  /** Day of the month from 1 to 31; in a shorter month the payment falls on its last day. */
  day: number;
  /** No payment falls before this date; null when there is no start. */
  start: DateString | null;
  /** No payment falls after this date; null when the payments go on. */
  end: DateString | null;
  /** The icon the user picked by its name; null leaves it to the title. */
  icon: string | null;
}

export type RegularExpenseInput = Omit<RegularExpense, 'id'>;

/** When an expense is paid. */
export type RegularSchedule = Pick<RegularExpense, 'day' | 'start' | 'end'>;

/** The date of the payment in a month; null when the month is before the start or after the end. */
export function paymentDate(expense: RegularSchedule, month: MonthString): DateString | null {
  const date = clampedDate(month, expense.day);
  if (expense.start !== null && date < expense.start) return null;
  if (expense.end !== null && date > expense.end) return null;
  return date;
}

/** The first payment on or after `today`; null when the payments are over. */
export function nextPayment(expense: RegularSchedule, today: DateString): DateString | null {
  const from = expense.start !== null && expense.start > today ? expense.start : today;
  let date = clampedDate(monthOf(from), expense.day);
  if (date < from) date = clampedDate(shiftMonth(monthOf(from), 1), expense.day);
  return expense.end === null || date <= expense.end ? date : null;
}

/** The payment closest to `date` in its month or the months on either side; null when none of them has one. */
export function nearestPayment(expense: RegularSchedule, date: DateString): DateString | null {
  const month = monthOf(date);
  let nearest: DateString | null = null;
  for (const m of [shiftMonth(month, -1), month, shiftMonth(month, 1)]) {
    const payment = paymentDate(expense, m);
    if (payment !== null && (nearest === null || Math.abs(daysBetween(date, payment)) < Math.abs(daysBetween(date, nearest)))) nearest = payment;
  }
  return nearest;
}

/** An expense the user linked to a regular expense on /uncategorized, as the ledger lists it. */
export type LinkedExpense = Pick<Operation, 'date' | 'amount' | 'regular'>;

/**
 * The linked expenses that paid the payment of `expense` on `date`: those whose nearest payment it is, so an expense
 * paid a week early still counts towards it. They keep their order.
 */
export function paidBy<T extends LinkedExpense>(expense: RegularSchedule & Pick<RegularExpense, 'id'>, date: DateString, linked: readonly T[]): T[] {
  return linked.filter((o) => o.regular?.id === expense.id && nearestPayment(expense, o.date) === date);
}

/**
 * Where an expense stands in the month of `today`:
 * - ahead: this month's payment is today or later and not paid in full, `covered` being what linked expenses paid of
 *   it; when this month has no payment, its next one in a later month;
 * - past: this month's payment day has gone by and linked expenses do not cover it;
 * - paid: linked expenses cover this month's payment, even before its day; `on` is the date of the latest of them;
 * - over: its payments have ended.
 */
export type MonthStatus =
  | { kind: 'ahead'; date: DateString; covered: number }
  | { kind: 'past'; date: DateString }
  | { kind: 'paid'; date: DateString; on: DateString }
  | { kind: 'over' };

export function monthStatus(expense: RegularExpense, today: DateString, linked: readonly LinkedExpense[]): MonthStatus {
  const date = paymentDate(expense, monthOf(today));
  if (date === null) {
    const next = nextPayment(expense, today);
    return next === null ? { kind: 'over' } : { kind: 'ahead', date: next, covered: 0 };
  }
  const paid = paidBy(expense, date, linked);
  const covered = paid.reduce((total, o) => total + o.amount, 0);
  if (paid.length > 0 && covered >= expense.amount - 0.005) {
    return { kind: 'paid', date, on: paid.reduce((latest, o) => (o.date > latest ? o.date : latest), paid[0]!.date) };
  }
  if (date < today) return { kind: 'past', date };
  return { kind: 'ahead', date, covered };
}

/** Payments from today through the next `days` days as planned operations, soonest first. */
export function upcomingRegular(expenses: RegularExpense[], options: { today: DateString; days?: number }): PlannedOperation[] {
  const { today, days = 45 } = options;
  const until = addDays(today, days);
  const planned: PlannedOperation[] = [];
  for (let month = monthOf(today); month <= monthOf(until); month = shiftMonth(month, 1)) {
    for (const expense of expenses) {
      const date = paymentDate(expense, month);
      if (date === null || date < today || date > until) continue;
      planned.push({ id: `regular:${expense.id}:${date}`, date, kind: 'expense', amount: expense.amount, title: expense.title });
    }
  }
  return planned.sort(soonestFirst);
}

/**
 * The payments of the current month: how many and what they cost, split into what linked expenses paid, what passed
 * its day without them and what is still ahead, today included. Expenses with no payment this month count nowhere.
 */
export function regularTotals(
  expenses: RegularExpense[],
  today: DateString,
  linked: readonly LinkedExpense[],
): { count: number; total: number; paid: number; past: number; ahead: number } {
  const totals = { count: 0, total: 0, paid: 0, past: 0, ahead: 0 };
  for (const expense of expenses) {
    const status = monthStatus(expense, today, linked);
    if (status.kind === 'over' || monthOf(status.date) !== monthOf(today)) continue;
    totals.count += 1;
    totals.total += expense.amount;
    if (status.kind === 'paid') totals.paid += expense.amount;
    if (status.kind === 'past') totals.past += expense.amount;
    if (status.kind === 'ahead') {
      totals.paid += status.covered;
      totals.ahead += expense.amount - status.covered;
    }
  }
  return totals;
}

export type RegularField = 'title' | 'amount' | 'day' | 'start' | 'end' | 'icon';

/** Fields of a form as the user typed them; empty start, end and icon mean none. */
export type RegularValues = Record<RegularField, string>;

export type RegularErrors = Partial<Record<RegularField, string>>;

/** Checks what the user typed. The icon is taken as it is: which icons there are is up to the page. */
export function parseRegularExpense(values: RegularValues): { expense: RegularExpenseInput } | { errors: RegularErrors } {
  const title = parseTitle(values.title);
  const amount = parseAmount(values.amount);
  const day = parseDay(values.day);
  const start = parseOptionalDate(values.start);
  let end = parseOptionalDate(values.end);
  if ('value' in start && 'value' in end && start.value !== null && end.value !== null && end.value < start.value) {
    end = { error: 'Раньше даты начала' };
  }
  if ('value' in title && 'value' in amount && 'value' in day && 'value' in start && 'value' in end) {
    const icon = values.icon.trim() || null;
    return { expense: { title: title.value, amount: amount.value, day: day.value, start: start.value, end: end.value, icon } };
  }
  const errors: RegularErrors = {};
  if ('error' in title) errors.title = title.error;
  if ('error' in amount) errors.amount = amount.error;
  if ('error' in day) errors.day = day.error;
  if ('error' in start) errors.start = start.error;
  if ('error' in end) errors.end = end.error;
  return { errors };
}

/** The expense as form fields, for editing. */
export function regularValues(expense: RegularExpenseInput): RegularValues {
  return {
    title: expense.title,
    amount: amountText(expense.amount),
    day: String(expense.day),
    start: expense.start ?? '',
    end: expense.end ?? '',
    icon: expense.icon ?? '',
  };
}

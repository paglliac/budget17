// Regular expenses: payments that repeat every month on the same day, such as rent or a loan, optionally only
// between a start and an end date. They are entered in the app rather than in ZenMoney and kept by src/settings.ts.

import { addDays, clampedDate, daysBetween, monthOf, shiftMonth, type MonthString } from './dates.ts';
import { amountText, parseAmount, parseDay, parseOptionalDate, parseTitle } from './input.ts';
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

/** The payments of the current month: how many, what they cost and how much is still ahead, today included. */
export function regularTotals(expenses: RegularExpense[], today: DateString): { count: number; total: number; ahead: number } {
  const month = monthOf(today);
  let count = 0;
  let total = 0;
  let ahead = 0;
  for (const expense of expenses) {
    const date = paymentDate(expense, month);
    if (date === null) continue;
    count += 1;
    total += expense.amount;
    if (date >= today) ahead += expense.amount;
  }
  return { count, total, ahead };
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

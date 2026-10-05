// Regular expenses: payments that repeat every month on the same day, such as rent or a loan.
// They are entered in the app rather than in ZenMoney and kept by src/settings.ts.

import { addDays, dateOf, daysInMonth, monthOf, shiftMonth, type MonthString } from './dates.ts';
import { soonestFirst, type PlannedOperation } from './planned.ts';
import type { DateString } from './zenmoney/types.ts';

export interface RegularExpense {
  id: number;
  title: string;
  /** In the main currency, always positive. */
  amount: number;
  /** Day of the month from 1 to 31; in a shorter month the payment falls on its last day. */
  day: number;
}

export type RegularExpenseInput = Omit<RegularExpense, 'id'>;

/** The date of the payment in a month. */
export function paymentDate(expense: Pick<RegularExpense, 'day'>, month: MonthString): DateString {
  return dateOf(month, Math.min(expense.day, daysInMonth(month)));
}

/** The first payment on or after `today`. */
export function nextPayment(expense: Pick<RegularExpense, 'day'>, today: DateString): DateString {
  const month = monthOf(today);
  const date = paymentDate(expense, month);
  return date >= today ? date : paymentDate(expense, shiftMonth(month, 1));
}

/** Payments from today through the next `days` days as planned operations, soonest first. */
export function upcomingRegular(expenses: RegularExpense[], options: { today: DateString; days?: number }): PlannedOperation[] {
  const { today, days = 45 } = options;
  const until = addDays(today, days);
  const planned: PlannedOperation[] = [];
  for (let month = monthOf(today); month <= monthOf(until); month = shiftMonth(month, 1)) {
    for (const expense of expenses) {
      const date = paymentDate(expense, month);
      if (date < today || date > until) continue;
      planned.push({ id: `regular:${expense.id}:${date}`, date, kind: 'expense', amount: expense.amount, title: expense.title });
    }
  }
  return planned.sort(soonestFirst);
}

/** What the expenses cost in a month, and how much of the current month is still ahead, today included. */
export function regularTotals(expenses: RegularExpense[], today: DateString): { total: number; ahead: number } {
  const month = monthOf(today);
  let total = 0;
  let ahead = 0;
  for (const expense of expenses) {
    total += expense.amount;
    if (paymentDate(expense, month) >= today) ahead += expense.amount;
  }
  return { total, ahead };
}

export type RegularField = 'title' | 'amount' | 'day';

/** Fields of a form as the user typed them. */
export type RegularValues = Record<RegularField, string>;

export type RegularErrors = Partial<Record<RegularField, string>>;

const MAX_TITLE = 80;

/** Checks what the user typed. Amounts may have spaces and a decimal comma: 13 000, 1500,50. */
export function parseRegularExpense(values: RegularValues): { expense: RegularExpenseInput } | { errors: RegularErrors } {
  const title = values.title.trim().replace(/\s+/g, ' ');
  const amountText = values.amount.replace(/\s/g, '').replace(',', '.');
  const dayText = values.day.trim();
  const errors: RegularErrors = {};

  if (!title) errors.title = 'Укажите название';
  else if (title.length > MAX_TITLE) errors.title = `Не длиннее ${MAX_TITLE} символов`;

  const amount = Number(amountText);
  if (!amountText) errors.amount = 'Укажите сумму';
  else if (!/^\d{1,9}(\.\d{1,2})?$/.test(amountText) || amount <= 0) errors.amount = 'Сумма в рублях, например 13 000';

  const day = Number(dayText);
  if (!dayText) errors.day = 'Укажите число';
  else if (!/^\d{1,2}$/.test(dayText) || day < 1 || day > 31) errors.day = 'От 1 до 31';

  return Object.keys(errors).length > 0 ? { errors } : { expense: { title, amount, day } };
}

/** The expense as form fields, for editing. */
export function regularValues(expense: RegularExpenseInput): RegularValues {
  return { title: expense.title, amount: String(expense.amount).replace('.', ','), day: String(expense.day) };
}

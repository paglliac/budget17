// Incomes: where money comes from and when. Each income follows a model, such as a fixed sum on a day of the month
// or a salary paid as an advance and the rest. Models plug in through INCOME_MODELS: a new way of getting paid is
// one more model there, with the fields of its form and the payments it brings in a month.

import { addDays, clampedDate, daysInMonth, dateOf, monthName, monthOf, shiftMonth, type MonthString } from './dates.ts';
import { amountText, parseAmount, parseDay, parseTitle } from './input.ts';
import { soonestFirst, type PlannedOperation } from './planned.ts';
import { countWorkdays, workdayOnOrBefore } from './workdays.ts';
import type { DateString } from './zenmoney/types.ts';

export interface IncomePayment {
  date: DateString;
  /** In the main currency. */
  amount: number;
  /** What the payment is for, such as Аванс за октябрь; without it the income's title says it. */
  label?: string;
  /** How the amount is worked out, such as 200 000 × 11/22 рабочих дней. */
  formula?: string;
}

/** A number on the form of a model: a sum of money or a day of the month. */
export interface IncomeField<K extends string = string> {
  name: K;
  label: string;
  kind: 'amount' | 'day';
  placeholder?: string;
}

export interface IncomeModel<K extends string = string> {
  /** What the model is called in the app, such as Зарплата с авансом. */
  title: string;
  fields: ReadonlyArray<IncomeField<K>>;
  /** What the form of a new income starts with, the title included. */
  defaults: Partial<Record<K | 'title', string>>;
  /** What it brings in a month. */
  monthly(params: Record<K, number>): number;
  /** When it comes, such as 5-го числа. */
  schedule(params: Record<K, number>): string;
  /** Payments for the work of a month; a payment may come in the next month, as the rest of a salary does. */
  payments(params: Record<K, number>, month: MonthString): IncomePayment[];
}

const FIXED: IncomeModel<'amount' | 'day'> = {
  title: 'Фиксированная сумма',
  fields: [
    { name: 'amount', label: 'Сумма', kind: 'amount', placeholder: '100 000' },
    { name: 'day', label: 'Число', kind: 'day', placeholder: '5' },
  ],
  defaults: {},
  monthly: (p) => p.amount,
  schedule: (p) => `${p.day}-го числа`,
  payments: (p, month) => [{ date: clampedDate(month, p.day), amount: p.amount }],
};

/** The first half of the month, which the advance pays for, ends on this day. */
const HALF = 15;

/**
 * A salary in two parts, as the Labour Code has it: the advance for the first half of the month, and the rest
 * in the next month. The advance is the salary times the working days of the 1st–15th over those of the month.
 * A payday that falls on a day off moves to the working day before it (art. 136).
 */
const SALARY: IncomeModel<'salary' | 'advanceDay' | 'payDay'> = {
  title: 'Зарплата с авансом',
  fields: [
    { name: 'salary', label: 'Зарплата в месяц', kind: 'amount', placeholder: '200 000' },
    { name: 'advanceDay', label: 'День аванса', kind: 'day', placeholder: '20' },
    { name: 'payDay', label: 'День зарплаты', kind: 'day', placeholder: '5' },
  ],
  defaults: { title: 'Зарплата', advanceDay: '20', payDay: '5' },
  monthly: (p) => p.salary,
  schedule: (p) => `аванс ${p.advanceDay}-го, остальное ${p.payDay}-го`,
  payments(p, month) {
    const worked = countWorkdays(dateOf(month, 1), dateOf(month, HALF));
    const norm = countWorkdays(dateOf(month, 1), dateOf(month, daysInMonth(month)));
    const advance = cents((p.salary * worked) / norm);
    return [
      {
        date: workdayOnOrBefore(clampedDate(month, p.advanceDay)),
        amount: advance,
        label: `Аванс за ${monthName(month)}`,
        formula: `${number(p.salary)} × ${worked}/${norm} рабочих дней`,
      },
      {
        date: workdayOnOrBefore(clampedDate(shiftMonth(month, 1), p.payDay)),
        amount: cents(p.salary - advance),
        label: `Зарплата за ${monthName(month)}`,
        formula: `${number(p.salary)} − ${number(advance)} аванса`,
      },
    ];
  },
};

export const INCOME_MODELS = { fixed: FIXED, salary: SALARY };

export type IncomeModelId = keyof typeof INCOME_MODELS;

export const INCOME_MODEL_IDS = Object.keys(INCOME_MODELS) as IncomeModelId[];

export function isIncomeModel(id: string | null | undefined): id is IncomeModelId {
  return INCOME_MODEL_IDS.some((m) => m === id);
}

/** The model with its own parameter names forgotten, so any income can use it. */
export function incomeModel(id: IncomeModelId): IncomeModel {
  return INCOME_MODELS[id];
}

export interface Income {
  id: number;
  title: string;
  model: IncomeModelId;
  /** Numbers named after the model's fields. */
  params: Record<string, number>;
}

export type IncomeInput = Omit<Income, 'id'>;

/** Form fields as the user typed them: the title and the model's fields. */
export type IncomeValues = Record<string, string>;

/** Checks what the user typed into the form of a model. */
export function parseIncome(model: IncomeModelId, values: IncomeValues): { income: IncomeInput } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const params: Record<string, number> = {};
  const title = parseTitle(values.title ?? '');
  if ('error' in title) errors.title = title.error;
  for (const field of incomeModel(model).fields) {
    const text = values[field.name] ?? '';
    const parsed = field.kind === 'amount' ? parseAmount(text) : parseDay(text);
    if ('error' in parsed) errors[field.name] = parsed.error;
    else params[field.name] = parsed.value;
  }
  if ('error' in title || Object.keys(errors).length > 0) return { errors };
  return { income: { title: title.value, model, params } };
}

/** The income as form fields, for editing. */
export function incomeValues(income: IncomeInput): IncomeValues {
  const values: IncomeValues = { title: income.title };
  for (const field of incomeModel(income.model).fields) {
    const value = income.params[field.name] ?? 0;
    values[field.name] = field.kind === 'amount' ? amountText(value) : String(value);
  }
  return values;
}

export function incomePayments(income: Income, month: MonthString): IncomePayment[] {
  return incomeModel(income.model).payments(income.params, month);
}

export function monthlyIncome(incomes: Income[]): number {
  return incomes.reduce((sum, income) => sum + incomeModel(income.model).monthly(income.params), 0);
}

export interface UpcomingPayment extends IncomePayment {
  income: Income;
}

/** Payments dated from `from` through `to`, soonest first. */
export function paymentsBetween(incomes: Income[], from: DateString, to: DateString): UpcomingPayment[] {
  const payments: UpcomingPayment[] = [];
  for (const income of incomes) {
    // A month's payments can come a month later, and an early payday can move into the month before.
    for (let month = shiftMonth(monthOf(from), -1); month <= shiftMonth(monthOf(to), 1); month = shiftMonth(month, 1)) {
      for (const payment of incomePayments(income, month)) {
        if (payment.date >= from && payment.date <= to) payments.push({ ...payment, income });
      }
    }
  }
  return payments.sort((a, b) => a.date.localeCompare(b.date) || a.income.title.localeCompare(b.income.title, 'ru'));
}

/** Payments from today through the next `days` days as planned incomes. */
export function upcomingIncome(incomes: Income[], options: { today: DateString; days?: number }): PlannedOperation[] {
  const { today, days = 45 } = options;
  return paymentsBetween(incomes, today, addDays(today, days))
    .map((p): PlannedOperation => ({
      id: `income:${p.income.id}:${p.date}:${p.label ?? ''}`,
      date: p.date,
      kind: 'income',
      amount: p.amount,
      title: p.label ?? p.income.title,
    }))
    .sort(soonestFirst);
}

function cents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

function number(amount: number): string {
  return numberFormat.format(amount);
}

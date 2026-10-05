// Dates are 'yyyy-MM-dd' strings and months are 'yyyy-MM' strings, as in the ZenMoney API.
// Arithmetic runs in UTC so that time zones and daylight saving never shift a day.

import type { DateString } from './zenmoney/types.ts';

/** Month in 'yyyy-MM' format. */
export type MonthString = string;

/** Today's date in the local time zone. */
export function localDate(now = new Date()): DateString {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(date: DateString, days: number): DateString {
  const result = utc(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function daysBetween(from: DateString, to: DateString): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);
}

export function monthOf(date: DateString): MonthString {
  return date.slice(0, 7);
}

export function dayOfMonth(date: DateString): number {
  return Number(date.slice(8, 10));
}

export function dateOf(month: MonthString, day: number): DateString {
  return `${month}-${String(day).padStart(2, '0')}`;
}

export function shiftMonth(month: MonthString, months: number): MonthString {
  const [year = 1970, m = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1 + months, 1)).toISOString().slice(0, 7);
}

export function daysInMonth(month: MonthString): number {
  const [year = 1970, m = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

/** Day of the week, 0 for Monday. */
export function weekday(date: DateString): number {
  return (utc(date).getUTCDay() + 6) % 7;
}

function utc(date: DateString): Date {
  return new Date(`${date}T00:00:00Z`);
}

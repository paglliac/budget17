// Working days by the Russian production calendar. Weekends and public holidays (Labour Code, art. 112) are days off.
// A holiday on a weekend moves its day off to the next working day, except the New Year holidays of 1–8 January:
// the government moves their weekend days by a decree each year, listed in TRANSFERS.

import { addDays, weekday } from './dates.ts';
import type { DateString } from './zenmoney/types.ts';

/** Public holidays as 'MM-dd'. */
const HOLIDAYS = ['01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08', '02-23', '03-08', '05-01', '05-09', '06-12', '11-04'];

/** Their weekend days are moved by the yearly decree rather than to the next working day. */
const NEW_YEAR_HOLIDAYS = new Set(HOLIDAYS.filter((day) => day.startsWith('01-')));

/**
 * Days off moved by the government's yearly decree, and weekends made working days instead.
 * Add a year once its decree is out; until then the year follows the Labour Code rules alone.
 */
const TRANSFERS: Record<number, { off: DateString[]; work: DateString[] }> = {
  2025: { off: ['2025-05-02', '2025-11-03', '2025-12-31'], work: ['2025-11-01'] },
  2026: { off: ['2026-01-09', '2026-12-31'], work: [] },
};

const daysOffByYear = new Map<number, Set<DateString>>();

/** Days off of a year that fall on weekdays: holidays, holidays moved off weekends, and the decree's transfers. */
function daysOff(year: number): Set<DateString> {
  let days = daysOffByYear.get(year);
  if (days) return days;
  days = new Set(TRANSFERS[year]?.off ?? []);
  const holidays = HOLIDAYS.map((day) => `${year}-${day}`);
  for (const holiday of holidays) days.add(holiday);
  for (const holiday of holidays) {
    if (weekday(holiday) < 5 || NEW_YEAR_HOLIDAYS.has(holiday.slice(5))) continue;
    let moved = addDays(holiday, 1);
    while (weekday(moved) >= 5 || days.has(moved)) moved = addDays(moved, 1);
    days.add(moved);
  }
  daysOffByYear.set(year, days);
  return days;
}

export function isWorkday(date: DateString): boolean {
  const year = Number(date.slice(0, 4));
  if (TRANSFERS[year]?.work.includes(date)) return true;
  return weekday(date) < 5 && !daysOff(year).has(date);
}

/** Working days from `from` through `to`, both included. */
export function countWorkdays(from: DateString, to: DateString): number {
  let count = 0;
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (isWorkday(date)) count++;
  }
  return count;
}

/** The date itself when it is a working day, otherwise the last working day before it. */
export function workdayOnOrBefore(date: DateString): DateString {
  let day = date;
  while (!isWorkday(day)) day = addDays(day, -1);
  return day;
}

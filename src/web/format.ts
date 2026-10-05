// Russian formatting for the web UI: money, months, plurals.

import type { MonthString } from '../dates.ts';
import type { DateString } from '../zenmoney/types.ts';

const integerFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const centsFormat = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 12 340 or, with sign, +12 340 and −12 340 (a real minus sign). Zero never gets a sign. */
export function num(amount: number, options: { sign?: boolean; cents?: boolean } = {}): string {
  const abs = Math.abs(amount);
  const text = options.cents ? centsFormat.format(abs) : integerFormat.format(Math.round(abs));
  const isZero = options.cents ? Math.round(abs * 100) === 0 : Math.round(abs) === 0;
  if (isZero) return text;
  if (amount < 0) return `−${text}`;
  return options.sign ? `+${text}` : text;
}

/** 12 340 ₽, with a non-breaking space before the currency symbol. */
export function money(amount: number, symbol: string, options: { sign?: boolean; cents?: boolean } = {}): string {
  return `${num(amount, options)} ${symbol}`;
}

/** Splits 606 472,40 ₽ into '606 472' and ',40 ₽' so the kopecks can be shown quieter. */
export function moneyParts(amount: number, symbol: string): { whole: string; rest: string } {
  const [whole = '', fraction = '00'] = num(amount, { cents: true }).split(',');
  return { whole, rest: `,${fraction} ${symbol}` };
}

export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** Picks the Russian plural form: [1 день, 2 дня, 5 дней]. */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const tens = Math.abs(n) % 100;
  const units = tens % 10;
  if (tens > 10 && tens < 20) return forms[2];
  if (units === 1) return forms[0];
  if (units >= 2 && units <= 4) return forms[1];
  return forms[2];
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const MONTHS = {
  nominative: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
  genitive: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  prepositional: ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'],
} as const;

/** Month name of a 'yyyy-MM' or 'yyyy-MM-dd' string: октябрь, октября, (в) октябре. */
export function monthName(date: MonthString | DateString, form: keyof typeof MONTHS = 'nominative'): string {
  return MONTHS[form][Number(date.slice(5, 7)) - 1] ?? '';
}

/** 5 октября. */
export function dayMonth(date: DateString): string {
  return `${Number(date.slice(8, 10))} ${monthName(date, 'genitive')}`;
}

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

/** сегодня, завтра, 3 дня. */
export function daysLeft(days: number): string {
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'завтра';
  return `${days} ${plural(days, ['день', 'дня', 'дней'])}`;
}

export function greeting(hour: number): string {
  if (hour < 6) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

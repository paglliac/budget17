// What the user types into forms, checked and turned into values; an error says what to fix.

export type Parsed<T> = { value: T } | { error: string };

const MAX_TITLE = 80;

/** Trims the title and collapses inner spaces. */
export function parseTitle(text: string): Parsed<string> {
  const title = text.trim().replace(/\s+/g, ' ');
  if (!title) return { error: 'Укажите название' };
  if (title.length > MAX_TITLE) return { error: `Не длиннее ${MAX_TITLE} символов` };
  return { value: title };
}

/** A positive sum with up to two decimals; spaces and a decimal comma are fine: 13 000, 1500,50. */
export function parseAmount(text: string): Parsed<number> {
  const amount = text.replace(/\s/g, '').replace(',', '.');
  if (!amount) return { error: 'Укажите сумму' };
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return { error: 'Сумма в рублях, например 13 000' };
  return { value: Number(amount) };
}

/** A day of the month from 1 to 31. */
export function parseDay(text: string): Parsed<number> {
  const day = text.trim();
  if (!day) return { error: 'Укажите число' };
  if (!/^\d{1,2}$/.test(day) || Number(day) < 1 || Number(day) > 31) return { error: 'От 1 до 31' };
  return { value: Number(day) };
}

/** An amount as the user would type it: 1100,5. */
export function amountText(amount: number): string {
  return String(amount).replace('.', ',');
}

// Expenses that come from ZenMoney without a category are sorted in the app: into a category, or as the payment of
// a regular expense. What the user picks is kept by src/settings.ts and applied by listOperations; this module
// suggests a pick for each expense from the picks before it and from the amounts and days of regular expenses.

import { daysBetween } from './dates.ts';
import { isUntitled, type Operation } from './ledger.ts';
import type { Category } from './operations.ts';
import { nearestPayment, type RegularExpense } from './regular.ts';
import type { TagId } from './zenmoney/types.ts';

/** Where the user put an expense that came without a category. */
export type Categorization = { tag: TagId } | { regular: number };

export type Suggestion = { category: Category } | { regular: RegularExpense };

/** How many days from its payment day a payment of a regular expense may come. */
const PAYMENT_WINDOW = 10;
/** How far, as a share, an amount may be from an earlier payment to the same payee and still be that payment. */
const AMOUNT_SPREAD = 0.1;

/**
 * Builds a function that suggests where an expense goes. `history` is expenses with their categories and regular
 * expenses, such as all of them from listOperations. The suggestion is, in this order:
 * - the regular expense the same payee was paid for the same amount before;
 * - a regular expense of the same amount due within PAYMENT_WINDOW days;
 * - the category the payee gets most often;
 * - the regular expense the payee was paid for the closest amount before, within AMOUNT_SPREAD.
 * A regular expense is not suggested for a payment that some expense already paid.
 */
export function suggester(history: Operation[], regular: RegularExpense[]): (expense: Operation) => Suggestion | null {
  const expenses = new Map(regular.map((e) => [e.id, e]));
  const payments: Array<{ payee: string; amount: number; expense: RegularExpense }> = [];
  const paid = new Set<string>();
  const categories = new Map<string, Map<TagId, { category: Category; count: number }>>();

  for (const o of history) {
    const payee = payeeKey(o);
    const expense = o.regular ? expenses.get(o.regular.id) : undefined;
    if (expense) {
      const due = nearestPayment(expense, o.date);
      if (due !== null) paid.add(`${expense.id}:${due}`);
      if (payee !== null) payments.push({ payee, amount: o.amount, expense });
    } else if (o.category && payee !== null) {
      const counts = categories.get(payee) ?? new Map<TagId, { category: Category; count: number }>();
      const seen = counts.get(o.category.id);
      counts.set(o.category.id, { category: o.category, count: (seen?.count ?? 0) + 1 });
      categories.set(payee, counts);
    }
  }

  return (o) => {
    /** The payment of the expense that `o` could be, when no other expense paid it. */
    const due = (expense: RegularExpense) => {
      const date = nearestPayment(expense, o.date);
      return date !== null && !paid.has(`${expense.id}:${date}`) ? date : null;
    };
    const payee = payeeKey(o);
    const before = payee === null ? [] : payments.filter((p) => p.payee === payee && due(p.expense) !== null);

    const same = before.find((p) => sameAmount(p.amount, o.amount));
    if (same) return { regular: same.expense };

    const scheduled = regular.find((e) => {
      const date = due(e);
      return date !== null && sameAmount(e.amount, o.amount) && Math.abs(daysBetween(o.date, date)) <= PAYMENT_WINDOW;
    });
    if (scheduled) return { regular: scheduled };

    // Ties go to the category seen first, that is the latest one, since history comes newest first.
    const counts = payee === null ? [] : [...(categories.get(payee)?.values() ?? [])];
    const usual = counts.reduce<{ category: Category; count: number } | null>((best, c) => (best === null || c.count > best.count ? c : best), null);
    if (usual) return { category: usual.category };

    const close = before
      .filter((p) => Math.abs(p.amount - o.amount) <= p.amount * AMOUNT_SPREAD)
      .sort((a, b) => Math.abs(a.amount - o.amount) - Math.abs(b.amount - o.amount))[0];
    return close ? { regular: close.expense } : null;
  };
}

/** The payee without case, digits and punctuation, so that Lenta 089 and Lenta 139 are one shop; null when there is none. */
function payeeKey(o: Operation): string | null {
  if (isUntitled(o)) return null;
  return o.payee.toLocaleLowerCase('ru').replace(/[^\p{L}]+/gu, ' ').trim() || null;
}

function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

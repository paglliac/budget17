// Expenses are sorted in the app: into a category when ZenMoney has none for them, or as the payment of a regular
// expense or of a purchase planned in a week. What the user picks is kept by src/settings.ts and applied by
// listOperations; this module suggests a pick for each expense from the picks before it and from the amounts and days
// of regular expenses, and lists what an expense may have paid.

import { daysBetween } from './dates.ts';
import { isUntitled, type Operation } from './ledger.ts';
import type { Category } from './operations.ts';
import { nearestPayment, paidBy, type RegularExpense } from './regular.ts';
import { monthOfWeek, purchaseStatus, weekOf, type Purchase, type WeekStart } from './week.ts';
import type { DateString, TagId } from './zenmoney/types.ts';

/** Where the user put an expense: a category, or the regular expense it paid. A purchase it paid is kept apart. */
export type Categorization = { tag: TagId } | { regular: number };

export type Suggestion = { category: Category } | { regular: RegularExpense };

/** How many days from its payment day a payment of a regular expense may come. */
const PAYMENT_WINDOW = 10;
/** How far, as a share, an amount may be from an earlier payment to the same payee and still be that payment. */
const AMOUNT_SPREAD = 0.1;
/** How many days from the week of an expense a purchase it may have paid can be planned. */
const PURCHASE_WINDOW = 14;

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
    } else if (o.category && !o.purchase && payee !== null) {
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

/** Something an expense may have paid, with what other expenses have not paid of it yet. */
export type PaymentChoice = { regular: RegularExpense; date: DateString; left: number } | { purchase: Purchase; left: number };

/**
 * What an expense may have paid, likeliest first: payments of regular expenses due within PAYMENT_WINDOW days of it,
 * and purchases planned within PURCHASE_WINDOW days of its week or among the extras of its month. Payments and
 * purchases that other expenses paid in full, and purchases marked bought, are left out. A bill is paid with its
 * amount, so payments whose amount left is the expense's within AMOUNT_SPREAD come first, then the purchases planned
 * in the expense's week, then the rest. Within each, the closer what is left of one to the expense's amount, the
 * likelier it is; then the closer its date. `expenses` are the expenses around it with what they paid, the expense
 * itself among them or not.
 */
export function paymentChoices(
  expense: Operation,
  context: { regular: readonly RegularExpense[]; purchases: readonly Purchase[]; expenses: readonly Operation[]; weekStart: WeekStart },
): PaymentChoice[] {
  const others = context.expenses.filter((o) => o.id !== expense.id);
  const week = weekOf(expense.date, context.weekStart);
  /** 0 for a bill of the expense's amount, 1 for a purchase planned in its week, 2 for the rest. */
  const choices: Array<{ choice: PaymentChoice; rank: number; days: number }> = [];
  for (const e of context.regular) {
    const date = nearestPayment(e, expense.date);
    if (date === null || Math.abs(daysBetween(expense.date, date)) > PAYMENT_WINDOW) continue;
    const left = e.amount - paidBy(e, date, others).reduce((total, o) => total + o.amount, 0);
    const rank = Math.abs(left - expense.amount) <= left * AMOUNT_SPREAD ? 0 : 2;
    if (left > 0.005) choices.push({ choice: { regular: e, date, left }, rank, days: Math.abs(daysBetween(expense.date, date)) });
  }
  for (const p of context.purchases) {
    const days = Math.abs(daysBetween(week, p.week));
    const near = days <= PURCHASE_WINDOW || (p.envelope === 'extra' && monthOfWeek(p.week) === monthOfWeek(week));
    const status = purchaseStatus(p, others);
    if (near && !status.bought) choices.push({ choice: { purchase: p, left: status.left }, rank: p.week === week ? 1 : 2, days });
  }
  const distance = (left: number) => Math.abs(left - expense.amount) / Math.max(left, expense.amount);
  return choices.sort((a, b) => a.rank - b.rank || distance(a.choice.left) - distance(b.choice.left) || a.days - b.days).map((c) => c.choice);
}

/** The payee without case, digits and punctuation, so that Lenta 089 and Lenta 139 are one shop; null when there is none. */
function payeeKey(o: Operation): string | null {
  if (isUntitled(o)) return null;
  return o.payee.toLocaleLowerCase('ru').replace(/[^\p{L}]+/gu, ' ').trim() || null;
}

function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

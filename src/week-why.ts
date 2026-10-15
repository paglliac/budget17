// Why a week went below zero (prototype/week-why), three ways at once. The expense that took what is free of the week
// below zero for the last time and every one after it, whatever day they came, so a day missed hides nothing; the
// purchases that cost more than planned, an expense the week paid for a purchase planned in the extras among them;
// and the week's expenses the user marked optional, with where the week would be without them. Pure functions over a
// Budget (see week.ts).

import { addDays } from './dates.ts';
import type { Operation } from './ledger.ts';
import { paymentChoices } from './categorization.ts';
import { envelopeOf, summarizeWeek, type Budget, type Purchase, type PurchaseStatus } from './week.ts';
import type { DateString } from './zenmoney/types.ts';

/** What made what is free of the week change: an expense with what it took of it, or the plan held at the start. */
export type WhyStep =
  | {
      kind: 'spending';
      /** What it took of what is free: less than the expense when the plan held money for its purchase. */
      amount: number;
      spending: Operation;
      /** The purchase of the week it paid; null when it paid none. */
      purchase: Purchase | null;
      /** A purchase of the extras planned about then that it may have paid instead (see misplacedSpending). */
      misplaced: { purchase: Purchase; left: number } | null;
    }
  /** What the plan held at the week's start, when it alone was more than the week allows. */
  | { kind: 'plan'; amount: number };

export type Overspend =
  /** A purchase of the week's money that cost more than planned. */
  | { kind: 'purchase'; amount: number; status: PurchaseStatus }
  /** An expense the week paid that may have paid a purchase of the extras, for more than was left of it. */
  | { kind: 'misplaced'; amount: number; spending: Operation; purchase: Purchase; left: number }
  /** The purchases of the week planned for more than the week allows. */
  | { kind: 'plan'; amount: number; planned: number; limit: number };

export interface WeekWhy {
  /** What was free just before the week went below zero for the last time; the week's amount when the plan alone was past it. */
  was: number;
  /** The day of the expense that took the week below zero; null when the plan alone was past it from the start. */
  since: DateString | null;
  /** What is free of the week now; of a past week, how it ended. */
  now: number;
  /** From `was` to `now`, in the order they came: the expense that crossed zero, or the plan, first. */
  last: WhyStep[];
  /** What cost more than planned, the largest first; amounts below zero. */
  over: Overspend[];
  /** The week's own expenses the user marked optional, the largest first. */
  optional: Operation[];
  /** Where the week would be without them. */
  withoutOptional: number;
}

/**
 * What kind of thing a title names, such as the icon its words give it; null when they say nothing. A purchase and a
 * category of the same kind (Стоматолог and Здоровье и спорт) tie an expense to the purchase.
 */
export type KindOf = (title: string) => string | null;

/**
 * Why a week stands where it does. What is free is walked through the week's expenses in the order they came, against
 * the plan as it is now: it starts at the week's amount less what its purchases hold, an expense counted in the week
 * takes all of it, one paying a purchase of the week takes only what goes past the plan. Purchases finished are taken
 * as finished from the start, since when they were is not kept.
 */
export function weekWhy(budget: Budget, week: DateString, kindOf: KindOf): WeekWhy {
  const w = summarizeWeek(budget, week);
  const end = addDays(week, 6);
  const fromWeek = new Map(w.purchases.filter((p) => p.purchase.envelope === 'week').map((p) => [p.purchase.id, p]));
  // What the plan holds for each purchase as its expenses come; a finished one holds nothing.
  const covered = new Map<number, number>();
  const leftOf = (status: PurchaseStatus) => {
    const paid = covered.get(status.purchase.id) ?? 0;
    return status.purchase.done || paid >= status.purchase.amount - 0.005 ? 0 : status.purchase.amount - paid;
  };
  const pay = (o: Operation) => {
    const status = o.purchase ? fromWeek.get(o.purchase.id) : undefined;
    if (!status) return 0;
    const before = leftOf(status);
    covered.set(status.purchase.id, (covered.get(status.purchase.id) ?? 0) + o.amount);
    return before - leftOf(status);
  };
  const counts = (o: Operation) => o.date >= week && o.date <= end && envelopeOf(budget, o) === 'week';
  const byDate = [...budget.expenses].sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created);
  for (const o of byDate.filter((o) => o.date < week)) pay(o);
  const held = sum([...fromWeek.values()].map(leftOf));
  const misplaced = misplacedSpending(budget, week, kindOf);

  const steps: WhyStep[] = held >= 0.5 ? [{ kind: 'plan', amount: -held }] : [];
  for (const o of byDate.filter((o) => o.date >= week && o.date <= end)) {
    const amount = pay(o) - (counts(o) ? o.amount : 0);
    if (Math.abs(amount) < 0.5) continue;
    const found = misplaced.get(o.id);
    const purchase = o.purchase ? (fromWeek.get(o.purchase.id)?.purchase ?? null) : null;
    steps.push({ kind: 'spending', amount, spending: o, purchase, misplaced: found ? { purchase: found.purchase, left: found.left } : null });
  }
  // The last step that took what is free from zero or more below it; the plan's when the week never was above zero.
  let free = w.limit;
  let crossed = -1;
  steps.forEach((s, i) => {
    if (free >= -0.005 && free + s.amount < -0.005) crossed = i;
    free += s.amount;
  });
  const fromPlan = crossed === 0 && steps[0]?.kind === 'plan';
  const last = crossed < 0 ? [] : steps.slice(crossed);
  const was = crossed < 0 ? w.free : w.limit + sum(steps.slice(0, crossed).map((s) => s.amount));
  const since = crossed < 0 || fromPlan ? null : (steps[crossed] as Extract<WhyStep, { kind: 'spending' }>).spending.date;

  const over: Overspend[] = [];
  for (const { spending, purchase, left } of misplaced.values()) {
    if (spending.amount > left + 0.5) over.push({ kind: 'misplaced', amount: left - spending.amount, spending, purchase, left });
  }
  for (const status of fromWeek.values()) {
    if (status.covered > status.purchase.amount + 0.5) over.push({ kind: 'purchase', amount: status.purchase.amount - status.covered, status });
  }
  if (held > w.limit + 0.5) over.push({ kind: 'plan', amount: w.limit - held, planned: held, limit: w.limit });
  over.sort((a, b) => a.amount - b.amount);

  const optional = steps
    .flatMap((s) => (s.kind === 'spending' && s.spending.optional && s.amount < 0 ? [s] : []))
    .sort((a, b) => b.spending.amount - a.spending.amount);
  return {
    was,
    since,
    now: w.free,
    last,
    over,
    optional: optional.map((s) => s.spending),
    withoutOptional: w.free - sum(optional.map((s) => s.amount)),
  };
}

/**
 * Expenses counted in the week by default, paying nothing, that may have paid a purchase of the extras planned near
 * the week and not bought yet, by their ids: the purchase's title shares a word with what the expense says, or names
 * the same kind of thing as its category does, for at least a quarter of what is left of the purchase. Each purchase
 * goes to one expense and each expense to one purchase: a shared word first, then the amount closest to what is left.
 */
export function misplacedSpending(budget: Budget, week: DateString, kindOf: KindOf): Map<string, { spending: Operation; purchase: Purchase; left: number }> {
  const end = addDays(week, 6);
  const loose = budget.expenses.filter(
    (o) => o.date >= week && o.date <= end && !budget.marks.has(o.id) && !o.purchase && !o.regular && !o.wish && envelopeOf(budget, o) === 'week',
  );
  const extras = budget.purchases.filter((p) => p.envelope === 'extra');
  const pairs = loose.flatMap((o) =>
    paymentChoices(o, { regular: [], purchases: extras, expenses: budget.expenses, weekStart: budget.weekStart }).flatMap((choice) => {
      if (!('purchase' in choice)) return [];
      const fit = fitOf(choice.purchase, o, choice.left, kindOf);
      return fit === null ? [] : [{ spending: o, purchase: choice.purchase, left: choice.left, fit }];
    }),
  );
  pairs.sort((a, b) => a.fit - b.fit);
  const found = new Map<string, { spending: Operation; purchase: Purchase; left: number }>();
  const taken = new Set<number>();
  for (const pair of pairs) {
    if (found.has(pair.spending.id) || taken.has(pair.purchase.id)) continue;
    found.set(pair.spending.id, pair);
    taken.add(pair.purchase.id);
  }
  return found;
}

/** How well an expense fits a purchase, lower is better; null when nothing ties them. */
function fitOf(purchase: Purchase, o: Operation, left: number, kindOf: KindOf): number | null {
  const distance = Math.abs(Math.log(o.amount / Math.max(left, 1)));
  const said = [o.name, o.payee, o.originalPayee, o.description, o.comment, o.category?.title].flatMap((text) => words(text ?? ''));
  if (words(purchase.title).some((word) => said.includes(word))) return distance;
  const kind = kindOf(purchase.title);
  if (kind !== null && o.category && kindOf(o.category.title) === kind && o.amount >= left / 4) return 10 + distance;
  return null;
}

/** The words of a text long enough to tell something, cut to their first five letters so that forms of one word meet. */
function words(text: string): string[] {
  return text
    .toLocaleLowerCase('ru')
    .replaceAll('ё', 'е')
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length >= 4)
    .map((word) => word.slice(0, 5));
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

// Why a week went below zero (prototype/week-why): what made what is free of it fall past nothing, told two ways for
// the user to compare. By the plan, the week ends at zero when its purchases cost what was planned and the free rest,
// what the week allows beyond them, is spent as the user likes; the causes are what went otherwise. Since the evening,
// what was free at the end of the day before and every expense since, with what it took. Either way an expense
// counted in the week that may have paid a purchase planned in the extras is told as such: then the week paid for what
// the extras held money for. Pure functions over a Budget (see week.ts).

import { addDays } from './dates.ts';
import type { Operation } from './ledger.ts';
import { paymentChoices } from './categorization.ts';
import { envelopeOf, summarizeWeek, type Budget, type Purchase, type PurchaseStatus } from './week.ts';
import type { DateString } from './zenmoney/types.ts';

/** What a week's fall is told against: its plan, or the evening of the day before. */
export type WhyBasis = 'plan' | 'evening';

export type Cause =
  /** An expense counted in the week that may have paid a purchase of the extras planned about then and not bought yet. */
  | { kind: 'misplaced'; amount: number; spending: Operation; purchase: Purchase; left: number }
  /** What the free rest of the week came to: what it allowed less what was spent of it, below zero past it. */
  | { kind: 'free'; amount: number; allowed: number; spent: number; spending: Operation[] }
  /** The purchases of the week planned for more than the week allows: how far the plan alone is past it. */
  | { kind: 'plan'; amount: number; planned: number; limit: number }
  /** A purchase of the week's money that cost more than planned (below zero), or less and finished (above). */
  | { kind: 'purchase'; amount: number; status: PurchaseStatus }
  /** An expense since the evening with what it took of what is free: less than its amount when the plan held it. */
  | { kind: 'spending'; amount: number; spending: Operation; purchase: Purchase | null };

export interface WeekWhy {
  basis: WhyBasis;
  /** What the week was headed for: nothing left by the plan, or what was free at the end of `since`. */
  was: number;
  /** The day `was` is the evening of; null by the plan, and since the evening on the week's first day. */
  since: DateString | null;
  /** What is free of the week now; of a past week, how it ended. */
  now: number;
  /** Those below zero first, the largest first, then those above; they add up to now − was. */
  causes: Cause[];
}

/**
 * What kind of thing a title names, such as the icon its words give it; null when they say nothing. A purchase and a
 * category of the same kind (Стоматолог and Здоровье и спорт) tie an expense to the purchase.
 */
export type KindOf = (title: string) => string | null;

/**
 * Why a week stands where it does against its plan, from nothing: the expenses that may have paid a purchase of the
 * extras, purchases that cost more or less than planned, the plan itself when it is more than the week allows, and
 * what the rest of the expenses counted in the week came to against the free rest.
 */
export function whyByPlan(budget: Budget, week: DateString, kindOf: KindOf): WeekWhy {
  const w = summarizeWeek(budget, week);
  const end = addDays(week, 6);
  const fromWeek = w.purchases.filter((p) => p.purchase.envelope === 'week');
  const ofPlan = new Set(fromWeek.map((p) => p.purchase.id));
  const misplaced = misplacedSpending(budget, week, kindOf);
  const causes: Cause[] = [...misplaced.values()].map(({ spending, purchase, left }) => ({ kind: 'misplaced', amount: -spending.amount, spending, purchase, left }));
  for (const status of fromWeek) {
    // What the purchase gave back to the week beyond what the week's own expenses paid of it.
    const paidHere = sum(status.paid.filter((o) => o.date >= week && o.date <= end && envelopeOf(budget, o) === 'week').map((o) => o.amount));
    const amount = status.purchase.amount - status.left - paidHere;
    if (Math.abs(amount) >= 0.5) causes.push({ kind: 'purchase', amount, status });
  }
  const planned = sum(fromWeek.map((p) => p.purchase.amount));
  const rest = w.limit - planned;
  if (rest < -0.5) causes.push({ kind: 'plan', amount: rest, planned, limit: w.limit });
  const free = w.spending.filter((o) => envelopeOf(budget, o) === 'week' && !(o.purchase && ofPlan.has(o.purchase.id)) && !misplaced.has(o.id));
  const spent = sum(free.map((o) => o.amount));
  const allowed = Math.max(rest, 0);
  if (spent >= 0.5 || allowed >= 0.5) causes.push({ kind: 'free', amount: allowed - spent, allowed, spent, spending: free });
  return { basis: 'plan', was: 0, since: null, now: w.free, causes: ordered(causes) };
}

/**
 * Why a week stands where it does against the evening before its last day so far: yesterday's in the current week,
 * the one before its last day in a past one. Every expense since that counts in the week or pays one of its
 * purchases is a cause, with what it took of what is free; on the week's first day `was` is its start. Purchases
 * finished are taken as finished then too, since when they were is not kept.
 */
export function whySinceEvening(budget: Budget, week: DateString, today: DateString, kindOf: KindOf): WeekWhy {
  const w = summarizeWeek(budget, week);
  const end = addDays(week, 6);
  const last = today < end ? today : end;
  const since = addDays(last, -1) >= week ? addDays(last, -1) : null;
  const from = since ?? addDays(week, -1);
  const fromWeek = new Map(w.purchases.filter((p) => p.purchase.envelope === 'week').map((p) => [p.purchase.id, p]));
  // What the plan holds for each purchase as its expenses come; a finished one holds nothing.
  const covered = new Map<number, number>();
  const leftOf = (status: PurchaseStatus) => {
    const paid = covered.get(status.purchase.id) ?? 0;
    return status.purchase.done || paid >= status.purchase.amount - 0.005 ? 0 : status.purchase.amount - paid;
  };
  const byDate = [...budget.expenses].sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created);
  const pay = (o: Operation) => {
    const status = o.purchase ? fromWeek.get(o.purchase.id) : undefined;
    if (!status) return 0;
    const before = leftOf(status);
    covered.set(status.purchase.id, (covered.get(status.purchase.id) ?? 0) + o.amount);
    return before - leftOf(status);
  };
  const counts = (o: Operation) => o.date >= week && o.date <= end && envelopeOf(budget, o) === 'week';
  let spent = 0;
  for (const o of byDate.filter((o) => o.date <= from)) {
    pay(o);
    if (counts(o)) spent += o.amount;
  }
  const was = w.limit - spent - sum([...fromWeek.values()].map(leftOf));
  const misplaced = misplacedSpending(budget, week, kindOf);
  const causes: Cause[] = [];
  for (const o of byDate.filter((o) => o.date > from)) {
    const amount = pay(o) - (counts(o) ? o.amount : 0);
    if (Math.abs(amount) < 0.5) continue;
    const found = misplaced.get(o.id);
    causes.push(
      found
        ? { kind: 'misplaced', amount, spending: o, purchase: found.purchase, left: found.left }
        : { kind: 'spending', amount, spending: o, purchase: o.purchase ? (fromWeek.get(o.purchase.id)?.purchase ?? null) : null },
    );
  }
  return { basis: 'evening', was, since, now: w.free, causes: ordered(causes) };
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

function ordered(causes: Cause[]): Cause[] {
  return causes.sort((a, b) => (a.amount < 0) !== (b.amount < 0) ? (a.amount < 0 ? -1 : 1) : Math.abs(b.amount) - Math.abs(a.amount));
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

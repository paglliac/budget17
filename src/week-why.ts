// Why a week went below zero (prototype/week-why), three ways at once. The expense that took what is free of the week
// below zero for the last time and every one after it, whatever day they came, so a day missed hides nothing; the
// purchases that cost more than planned; and the week's expenses the user marked optional, with where the week would
// be without them. Only what the user marked counts: an expense linked to nothing is the week's, whatever it looks
// like. Pure functions over a Budget (see week.ts).

import { addDays } from './dates.ts';
import type { Operation } from './ledger.ts';
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
    }
  /** What the plan held at the week's start, when it alone was more than the week allows. */
  | { kind: 'plan'; amount: number };

export type Overspend =
  /** A purchase of the week's money that cost more than planned. */
  | { kind: 'purchase'; amount: number; status: PurchaseStatus }
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
 * Why a week stands where it does. What is free is walked through the week's expenses in the order they came, against
 * the plan as it is now: it starts at the week's amount less what its purchases hold, an expense counted in the week
 * takes all of it, one paying a purchase of the week takes only what goes past the plan. Purchases finished are taken
 * as finished from the start, since when they were is not kept.
 */
export function weekWhy(budget: Budget, week: DateString): WeekWhy {
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

  const steps: WhyStep[] = held >= 0.5 ? [{ kind: 'plan', amount: -held }] : [];
  for (const o of byDate.filter((o) => o.date >= week && o.date <= end)) {
    const amount = pay(o) - (counts(o) ? o.amount : 0);
    if (Math.abs(amount) < 0.5) continue;
    const purchase = o.purchase ? (fromWeek.get(o.purchase.id)?.purchase ?? null) : null;
    steps.push({ kind: 'spending', amount, spending: o, purchase });
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

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

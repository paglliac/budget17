// Why a week went below zero, as what the user can do about it. Expenses to check: those the week counts only by
// default, linked to nothing, placed nowhere by hand and not yet said to count right, that are a lot for the week, alone
// or in a run of small ones within a few hours. And reminders, each only when it is a lot: to keep to the plan when the purchases
// of the week cost more than planned, to spend less when the expenses marked optional add up. A lot is a day's share
// of what the week allows beyond its plan (the user's rule, 2026-10-15). Only what the user marked counts: an expense
// linked to nothing is the week's, whatever it looks like. Pure functions over a Budget (see week.ts).

import { addDays } from './dates.ts';
import type { Operation } from './ledger.ts';
import { envelopeOf, pays, summarizeWeek, type Budget, type PurchaseStatus } from './week.ts';
import type { DateString } from './zenmoney/types.ts';

/** How close small expenses come to be a run: within three hours from the first to the last. */
export const RUN_SECONDS = 3 * 3600;
/** How many small expenses make a run. */
export const RUN_COUNT = 3;

export type Overspend =
  /** A purchase of the week's money that cost more than planned. */
  | { kind: 'purchase'; amount: number; status: PurchaseStatus }
  /** The purchases of the week planned for more than the week allows. */
  | { kind: 'plan'; amount: number; planned: number; limit: number };

/** An expense to check where it counts: one that is a lot by itself, or a run of small ones that is a lot together. */
export type Check = { kind: 'spending'; spending: Operation } | { kind: 'run'; spending: Operation[]; amount: number };

export interface WeekWhy {
  /** What is free of the week now; of a past week, how it ended. */
  now: number;
  /** What is a lot for the week: a day's share of what it allows beyond what its purchases were planned for. */
  notable: number;
  /** The newest first. */
  check: Check[];
  /** What cost more than planned, the largest first; amounts above zero. */
  over: Overspend[];
  /** Whether what cost more than planned is a lot, to remind to keep to the plan. */
  remindPlan: boolean;
  /** The week's own expenses the user marked optional, the largest first. */
  optional: Operation[];
  /** Whether they are a lot, to remind to spend less on them. */
  remindOptional: boolean;
  /** Where the week would be without them. */
  withoutOptional: number;
}

/**
 * Why a week stands where it does, as things to check and to keep in mind. `confirmed` are the expenses the user said
 * count right in the week; they are not to check again. What an expense took of what is free is walked in the order they
 * came against the plan as it is now: all of it when counted in the week, only what goes past the plan when it paid a
 * purchase of the week.
 */
export function weekWhy(budget: Budget, week: DateString, confirmed: ReadonlySet<string> = new Set()): WeekWhy {
  const w = summarizeWeek(budget, week);
  const end = addDays(week, 6);
  const fromWeek = new Map(w.purchases.filter((p) => p.purchase.envelope === 'week').map((p) => [p.purchase.id, p]));
  const planned = sum([...fromWeek.values()].map((p) => p.purchase.amount));
  const notable = Math.max(w.limit - planned, 0) / 7;

  // What the plan holds for each purchase as its expenses come; a finished one holds nothing.
  const covered = new Map<number, number>();
  const leftOf = (status: PurchaseStatus) => {
    const paid = covered.get(status.purchase.id) ?? 0;
    return status.purchase.done || paid >= status.purchase.amount - 0.005 ? 0 : status.purchase.amount - paid;
  };
  const pay = (o: Operation) => {
    const status = [...fromWeek.values()].find((s) => pays(s.purchase, o));
    if (!status) return 0;
    const before = leftOf(status);
    covered.set(status.purchase.id, (covered.get(status.purchase.id) ?? 0) + o.amount);
    return before - leftOf(status);
  };
  const byDate = [...budget.expenses].sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created);
  for (const o of byDate.filter((o) => o.date < week)) pay(o);
  const ofWeek = byDate.filter((o) => o.date >= week && o.date <= end);
  const took = new Map(ofWeek.map((o) => [o.id, (envelopeOf(budget, o) === 'week' ? o.amount : 0) - pay(o)]));

  const byDefault = ofWeek.filter(
    (o) => envelopeOf(budget, o) === 'week' && !o.purchase && !o.regular && !o.wish && !o.saving && !budget.marks.has(o.id) && !o.optional && !confirmed.has(o.id),
  );
  const check: Check[] = byDefault.filter((o) => o.amount >= notable).map((spending) => ({ kind: 'spending', spending }));
  check.push(...runsOf(byDefault.filter((o) => o.amount < notable), notable));
  check.sort((a, b) => latest(b).localeCompare(latest(a)) || created(b) - created(a));

  const over: Overspend[] = [];
  for (const status of fromWeek.values()) {
    if (status.covered > status.purchase.amount + 0.5) over.push({ kind: 'purchase', amount: status.covered - status.purchase.amount, status });
  }
  const held = sum([...fromWeek.values()].map((p) => (p.purchase.done ? 0 : p.purchase.amount)));
  if (held > w.limit + 0.5) over.push({ kind: 'plan', amount: held - w.limit, planned: held, limit: w.limit });
  over.sort((a, b) => b.amount - a.amount);

  const optional = ofWeek.filter((o) => o.optional && (took.get(o.id) ?? 0) >= 0.5).sort((a, b) => b.amount - a.amount);
  const optionalTook = sum(optional.map((o) => took.get(o.id) ?? 0));
  return {
    now: w.free,
    notable,
    check,
    over,
    remindPlan: over.length > 0 && sum(over.map((o) => o.amount)) >= notable,
    optional,
    remindOptional: optional.length > 0 && optionalTook >= notable,
    withoutOptional: w.free + optionalTook,
  };
}

/**
 * Runs of small expenses: at least RUN_COUNT within RUN_SECONDS from the first, together a lot. Taken from the
 * earliest on, each expense in one run at most.
 */
function runsOf(small: Operation[], notable: number): Check[] {
  const sorted = [...small].sort((a, b) => a.created - b.created);
  const runs: Check[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1]!.created - sorted[i]!.created <= RUN_SECONDS) j++;
    const run = sorted.slice(i, j + 1);
    const amount = sum(run.map((o) => o.amount));
    if (run.length >= RUN_COUNT && amount >= notable) {
      runs.push({ kind: 'run', spending: run, amount });
      i = j + 1;
    } else {
      i++;
    }
  }
  return runs;
}

/** The day of a check's last expense, and when it was added, to put the newest first. */
function latest(c: Check): DateString {
  return c.kind === 'spending' ? c.spending.date : c.spending.at(-1)!.date;
}

function created(c: Check): number {
  return c.kind === 'spending' ? c.spending.created : c.spending.at(-1)!.created;
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

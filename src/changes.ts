// What a change made in the app did to the weeks' money. The budget before the change and after it are compared week
// by week: each week whose free money moved keeps what was free before and after, with what the change was about — a
// purchase of the plan (the money a wish's plan holds too), what the week allows, or an expense — and what happened to
// it. Only what the user does in the app is a change; expenses that come from ZenMoney are not. Pure functions over a
// Budget (see week.ts); settings.ts keeps the changes with when they were made and by whom.

import type { Operation } from './ledger.ts';
import { envelopeOf, summarizeWeek, weekLimit, weekOf, type Budget, type Envelope, type Purchase } from './week.ts';
import type { DateString } from './zenmoney/types.ts';

/** What a change was about, with its title then. */
export type ChangeSubject =
  | { kind: 'purchase'; id: number; title: string; wish: number | null }
  | { kind: 'limit' }
  | { kind: 'expense'; id: string; title: string };

/** How an expense counts: where, and what it paid, if anything. */
export interface ExpenseCount {
  envelope: Envelope;
  paid: { kind: 'purchase' | 'regular' | 'wish' | 'saving'; id: number; title: string } | null;
}

/** What happened to it. */
export type ChangeWhat =
  /** A purchase put into the plan. */
  | { kind: 'added' }
  /** A purchase taken out of the plan. */
  | { kind: 'removed' }
  /** A purchase moved from one week to another. */
  | { kind: 'moved'; from: DateString; to: DateString }
  /** A purchase's amount or what the week allows. */
  | { kind: 'amount'; from: number; to: number }
  /** A purchase moved between the week's money and the extras. */
  | { kind: 'envelope'; from: Purchase['envelope']; to: Purchase['envelope'] }
  /** A purchase finished, its rest going back. */
  | { kind: 'done' }
  /** A finished purchase back in the plan. */
  | { kind: 'reopened' }
  /** An expense counted elsewhere or paying something else. */
  | { kind: 'counted'; from: ExpenseCount; to: ExpenseCount };

/** A change as one week saw it. */
export interface WeekChange {
  week: DateString;
  /** What the week had free before the change and after it. */
  before: number;
  after: number;
  subject: ChangeSubject;
  what: ChangeWhat;
}

/** A change as settings.db keeps it: when it was made, in Unix milliseconds, and who made it, when the phone is named. */
export interface KeptChange extends WeekChange {
  at: number;
  who: string | null;
}

/** A change of one thing and the weeks it may have moved. */
interface Touch {
  weeks: DateString[];
  subject: ChangeSubject;
  what: ChangeWhat;
}

/**
 * The weeks whose free money moved between the two budgets, each with what moved it: a purchase before what the week
 * allows, and that before an expense, when one change touched several things of a week. A change of the day the week
 * begins on moves every week and is none of them.
 */
export function weekChanges(before: Budget, after: Budget): WeekChange[] {
  if (before.weekStart !== after.weekStart) return [];
  const touched = [...purchaseTouches(before, after), ...limitTouches(before, after), ...expenseTouches(before, after)];
  const weeks = [...new Set(touched.flatMap((t) => t.weeks))].sort();
  const changes: WeekChange[] = [];
  for (const week of weeks) {
    const was = summarizeWeek(before, week).free;
    const is = summarizeWeek(after, week).free;
    if (Math.abs(is - was) < 0.5) continue;
    const { subject, what } = touched.find((t) => t.weeks.includes(week))!;
    changes.push({ week, before: was, after: is, subject, what });
  }
  return changes;
}

/** The key of a change's subject, the same for every change of one thing. */
export function subjectKey(subject: ChangeSubject): string {
  return subject.kind === 'limit' ? 'limit' : `${subject.kind}-${subject.id}`;
}

function purchaseTouches(before: Budget, after: Budget): Touch[] {
  const was = new Map(before.purchases.map((p) => [p.id, p]));
  const is = new Set(after.purchases.map((p) => p.id));
  const touches: Touch[] = [];
  for (const p of after.purchases) {
    const q = was.get(p.id);
    const subject = purchaseSubject(p);
    if (!q) touches.push({ weeks: [p.week], subject, what: { kind: 'added' } });
    else if (q.week !== p.week) touches.push({ weeks: [q.week, p.week], subject, what: { kind: 'moved', from: q.week, to: p.week } });
    else if (q.envelope !== p.envelope) touches.push({ weeks: [p.week], subject, what: { kind: 'envelope', from: q.envelope, to: p.envelope } });
    else if (Math.abs(q.amount - p.amount) >= 0.005) touches.push({ weeks: [p.week], subject, what: { kind: 'amount', from: q.amount, to: p.amount } });
    else if (q.done !== p.done) touches.push({ weeks: [p.week], subject, what: { kind: p.done ? 'done' : 'reopened' } });
  }
  for (const q of before.purchases) {
    if (!is.has(q.id)) touches.push({ weeks: [q.week], subject: purchaseSubject(q), what: { kind: 'removed' } });
  }
  return touches;
}

function purchaseSubject(p: Purchase): ChangeSubject {
  return { kind: 'purchase', id: p.id, title: p.title, wish: p.wish ?? null };
}

function limitTouches(before: Budget, after: Budget): Touch[] {
  const weeks = new Set([...before.weekLimits.keys(), ...after.weekLimits.keys()]);
  return [...weeks].flatMap((week): Touch[] => {
    const from = weekLimit(before, week);
    const to = weekLimit(after, week);
    return Math.abs(from - to) < 0.005 ? [] : [{ weeks: [week], subject: { kind: 'limit' }, what: { kind: 'amount', from, to } }];
  });
}

/**
 * Expenses counted elsewhere or paying something else. One the user said not to count is not among the budget's
 * expenses at all. An expense moves its own week and the weeks of the purchases it paid before and after.
 */
function expenseTouches(before: Budget, after: Budget): Touch[] {
  const was = new Map(before.expenses.map((o) => [o.id, o]));
  const is = new Map(after.expenses.map((o) => [o.id, o]));
  const touches: Touch[] = [];
  for (const id of new Set([...was.keys(), ...is.keys()])) {
    const a = was.get(id);
    const b = is.get(id);
    const from = a ? countOf(before, a) : IGNORED;
    const to = b ? countOf(after, b) : IGNORED;
    if (sameCount(from, to)) continue;
    const o = (b ?? a)!;
    const paidWeeks = [paidWeek(before, from), paidWeek(after, to)].filter((w): w is DateString => w !== null);
    touches.push({ weeks: [weekOf(o.date, after.weekStart), ...paidWeeks], subject: { kind: 'expense', id, title: o.name }, what: { kind: 'counted', from, to } });
  }
  return touches;
}

const IGNORED: ExpenseCount = { envelope: 'ignored', paid: null };

function countOf(budget: Budget, o: Operation): ExpenseCount {
  const paid = o.purchase
    ? { kind: 'purchase' as const, ...o.purchase }
    : o.regular
      ? { kind: 'regular' as const, ...o.regular }
      : o.wish
        ? { kind: 'wish' as const, ...o.wish }
        : o.saving
          ? { kind: 'saving' as const, id: o.saving.id, title: o.saving.title }
          : null;
  return { envelope: envelopeOf(budget, o), paid };
}

function sameCount(a: ExpenseCount, b: ExpenseCount): boolean {
  return a.envelope === b.envelope && a.paid?.kind === b.paid?.kind && a.paid?.id === b.paid?.id;
}

function paidWeek(budget: Budget, count: ExpenseCount): DateString | null {
  if (count.paid?.kind !== 'purchase') return null;
  const id = count.paid.id;
  return budget.purchases.find((p) => p.id === id)?.week ?? null;
}

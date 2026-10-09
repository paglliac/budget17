// The month review: what the month's expenses turned out to be, where the money went and what stands out. A month is
// its weeks, as on the overview (see weeksOfMonth). Expenses that count in a week without the user having said what
// they are go apart to be checked: transfers to people, transfers to oneself in other banks, and spending without a
// category. Pure functions; the pages are src/web/pages/review.ts.

import { addDays, shiftMonth, type MonthString } from './dates.ts';
import type { Operation } from './ledger.ts';
import { paymentDate, type RegularExpense } from './regular.ts';
import { envelopeOf, MONTH_LIMIT, summarizeWeek, WEEK_LIMIT, weekOf, weeksOfMonth, type Budget, type Envelope, type WeekSummary } from './week.ts';
import type { DateString } from './zenmoney/types.ts';

/** What an expense turned out to be. */
export type Kind = 'ordinary' | 'person' | 'self' | 'untitled' | 'extra' | 'regular' | 'outside';

/** Kinds of expenses that count in a week although nobody said what they are, in the order they are checked. */
export const TO_CHECK = ['person', 'self', 'untitled'] as const;
export type ToCheck = (typeof TO_CHECK)[number];

/** A person as banks name the other side of an SBP transfer: Татьяна А. */
const PERSON = /^[А-ЯЁ][а-яё]+ [А-ЯЁ]\.$/;
/** A transfer to oneself under this amount and not in whole hundreds pays a purchase on a marketplace. */
const MARKETPLACE_LIMIT = 20_000;
/** How many months before the reviewed one tell what is usual. */
const USUAL_MONTHS = 3;

export function isToCheck(kind: Kind): kind is ToCheck {
  return (TO_CHECK as readonly string[]).includes(kind);
}

/**
 * A payment of a regular expense is regular; spending moved to extras or outside the budget is that; spending with a
 * category is ordinary. What is left counts in the week unexplained: a transfer to the user's own name in another bank
 * (`selfPayee`, as banks write it), a transfer to a person, or spending without a category.
 */
export function kindOf(budget: Pick<Budget, 'marks' | 'purchases'>, o: Operation, selfPayee: string | null): Kind {
  if (o.regular) return 'regular';
  const envelope = envelopeOf(budget, o);
  if (envelope === 'extra' || envelope === 'outside') return envelope;
  if (o.category) return 'ordinary';
  if (selfPayee !== null && o.payee === selfPayee) return 'self';
  if (PERSON.test(o.payee)) return 'person';
  return 'untitled';
}

/**
 * ZenMoney does not know which bank a transfer to oneself went to, so its amount hints at it: the amount of a regular
 * expense is a payment of it, such as a loan; an amount under 20 000 not in whole hundreds pays a purchase on Ozon or
 * WB. Null when the amount tells nothing.
 */
export function transferHint(o: Pick<Operation, 'amount'>, regular: readonly Pick<RegularExpense, 'title' | 'amount'>[]): { regular: string } | 'marketplace' | null {
  const paid = regular.find((r) => Math.abs(r.amount - o.amount) < 1);
  if (paid) return { regular: paid.title };
  return o.amount < MARKETPLACE_LIMIT && Math.round(o.amount) % 100 !== 0 ? 'marketplace' : null;
}

/** Ordinary spending of a category a week. */
export interface CategoryWeekly {
  id: string;
  title: string;
  color: string | null;
  perWeek: number;
  /** A week in the three months before, on average; null when there was none. */
  usual: number | null;
}

export interface ReviewedExpense {
  operation: Operation;
  kind: Kind;
  envelope: Envelope;
}

export interface MonthReview {
  month: MonthString;
  /** The first day of its first week and the last day of its last week. */
  from: DateString;
  to: DateString;
  weeks: WeekSummary[];
  /** Weeks that have begun, at least one. */
  elapsed: number;
  income: number;
  /** Expenses of the month's weeks, largest first. */
  expenses: ReviewedExpense[];
  spent: number;
  /** Income less spending; negative when spending took more than came in. */
  left: number;
  /** What the weeks spent and allowed. */
  inWeeks: number;
  limits: number;
  regular: number;
  extra: number;
  outside: number;
  /** Expenses to check, largest first. */
  toCheck: ReviewedExpense[];
  /** Ordinary spending a week by category, largest first. */
  categories: CategoryWeekly[];
  next: { month: MonthString; weeks: number; regular: number };
}

/**
 * Reviews a month. `budget` must hold expenses from three months before it, to tell what is usual; `incomes` are
 * the incomes of its weeks.
 */
export function reviewMonth(
  budget: Budget,
  incomes: readonly Pick<Operation, 'amount'>[],
  options: { month: MonthString; today: DateString; selfPayee: string | null },
): MonthReview {
  const { month, today, selfPayee } = options;
  const starts = weeksOfMonth(month, budget.weekStart);
  const from = starts[0]!;
  const to = addDays(starts.at(-1)!, 6);
  const expenses = budget.expenses
    .filter((o) => o.date >= from && o.date <= to)
    .map((operation) => ({ operation, kind: kindOf(budget, operation, selfPayee), envelope: envelopeOf(budget, operation) }))
    .sort((a, b) => b.operation.amount - a.operation.amount);
  const weeks = starts.map((w) => summarizeWeek(budget, w));
  const elapsed = Math.max(1, starts.filter((w) => w <= weekOf(today, budget.weekStart)).length);
  const sumOf = (list: ReviewedExpense[]) => list.reduce((s, e) => s + e.operation.amount, 0);
  const spent = sumOf(expenses);
  const income = incomes.reduce((s, o) => s + o.amount, 0);

  const ordinary = (start: DateString, end: DateString, weekCount: number) => {
    const sums = new Map<string, { title: string; color: string | null; amount: number }>();
    for (const o of budget.expenses) {
      if (o.date < start || o.date > end || !o.category || kindOf(budget, o, selfPayee) !== 'ordinary') continue;
      const entry = sums.get(o.category.id) ?? { title: o.category.title, color: o.category.color, amount: 0 };
      entry.amount += o.amount / weekCount;
      sums.set(o.category.id, entry);
    }
    return sums;
  };
  const before = Array.from({ length: USUAL_MONTHS }, (_, i) => {
    const earlier = weeksOfMonth(shiftMonth(month, -(i + 1)), budget.weekStart);
    return ordinary(earlier[0]!, addDays(earlier.at(-1)!, 6), earlier.length);
  });
  const categories = [...ordinary(from, to, elapsed)]
    .map(([id, c]) => {
      const past = before.map((m) => m.get(id)?.amount ?? 0);
      return { id, title: c.title, color: c.color, perWeek: c.amount, usual: past.some((v) => v > 0) ? past.reduce((s, v) => s + v, 0) / past.length : null };
    })
    .sort((a, b) => b.perWeek - a.perWeek);

  const next = shiftMonth(month, 1);
  return {
    month,
    from,
    to,
    weeks,
    elapsed,
    income,
    expenses,
    spent,
    left: income - spent,
    inWeeks: weeks.reduce((s, w) => s + w.spent, 0),
    limits: weeks.reduce((s, w) => s + w.limit, 0),
    regular: sumOf(expenses.filter((e) => e.kind === 'regular')),
    extra: sumOf(expenses.filter((e) => e.kind === 'extra')),
    outside: sumOf(expenses.filter((e) => e.kind === 'outside')),
    toCheck: expenses.filter((e) => isToCheck(e.kind)),
    categories,
    next: {
      month: next,
      weeks: weeksOfMonth(next, budget.weekStart).length,
      regular: budget.regular.reduce((s, r) => s + (paymentDate(r, next) ? r.amount : 0), 0),
    },
  };
}

/** What stands out in a month, most pressing first. */
export type Finding =
  /** The weeks spent more than they allowed; `week` spent most. */
  | { kind: 'overspent'; over: number; week: WeekSummary }
  /** Expenses that count in the weeks although nobody said what they are. */
  | { kind: 'unclear'; count: number; amount: number }
  | { kind: 'people'; count: number; amount: number; largest: Operation }
  /** Transfers to oneself; `marketplace` of them look like purchases on Ozon or WB. */
  | { kind: 'self'; count: number; amount: number; marketplace: number }
  /** An ordinary category spent a fifth more a week than usual, and at least 2 000 more. */
  | { kind: 'grown'; category: CategoryWeekly & { usual: number } }
  /** Extras were hardly touched: under a fifth of their limit. */
  | { kind: 'extrasUnused'; spent: number; limit: number };

export function findings(review: MonthReview, today: DateString, regular: readonly Pick<RegularExpense, 'title' | 'amount'>[]): Finding[] {
  const list: Finding[] = [];
  const over = review.inWeeks - review.limits;
  const week = worstWeek(review, today);
  if (over > 0 && week) list.push({ kind: 'overspent', over, week });
  const sumOf = (items: ReviewedExpense[]) => items.reduce((s, e) => s + e.operation.amount, 0);
  if (review.toCheck.length) list.push({ kind: 'unclear', count: review.toCheck.length, amount: sumOf(review.toCheck) });
  const people = review.toCheck.filter((e) => e.kind === 'person');
  if (people.length) list.push({ kind: 'people', count: people.length, amount: sumOf(people), largest: people[0]!.operation });
  const self = review.toCheck.filter((e) => e.kind === 'self');
  if (self.length)
    list.push({ kind: 'self', count: self.length, amount: sumOf(self), marketplace: self.filter((e) => transferHint(e.operation, regular) === 'marketplace').length });
  const grown = review.categories.find((c): c is CategoryWeekly & { usual: number } => c.usual !== null && c.perWeek > c.usual * 1.2 && c.perWeek - c.usual > 2_000);
  if (grown) list.push({ kind: 'grown', category: grown });
  if (review.extra < MONTH_LIMIT * 0.2) list.push({ kind: 'extrasUnused', spent: review.extra, limit: MONTH_LIMIT });
  return list;
}

/** The week of the month that spent most, of those that have begun. */
export function worstWeek(review: Pick<MonthReview, 'weeks'>, today: DateString): WeekSummary | undefined {
  return review.weeks.filter((w) => w.week <= today).sort((a, b) => b.spent - a.spent)[0];
}

/** Ordinary spending a week across the month's categories. */
export function ordinaryPerWeek(review: Pick<MonthReview, 'categories'>): number {
  return review.categories.reduce((s, c) => s + c.perWeek, 0);
}

/** A week's amount that would hold the ordinary spending: rounded up to 5 000, never under the usual WEEK_LIMIT. */
export function weekThatHolds(perWeek: number): number {
  return Math.max(WEEK_LIMIT, Math.ceil(perWeek / 5_000) * 5_000);
}

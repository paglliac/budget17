// The month review: what the month's expenses turned out to be, where the money went and what stands out. A month is
// its weeks, as on the overview (see weeksOfMonth). Expenses that count in a week without the user having said what
// they are go apart to be checked: transfers to people, transfers to oneself in other banks, and spending without a
// category. What the weeks were made of goes by category and subcategory, with hints worked out by rules at what to
// put where. Pure functions; the pages are src/web/pages/review.ts.

import { recentCount, subcategoryOf, type CategoryEntry, type Subcategory, type SubcategorySetup } from './categories.ts';
import { addDays, shiftMonth, type MonthString } from './dates.ts';
import { isUntitled, type Operation } from './ledger.ts';
import type { Category } from './operations.ts';
import { isPerson, shopKey, shopName } from './payees.ts';
import { paymentDate, type RegularExpense } from './regular.ts';
import { envelopeOf, MONTH_LIMIT, summarizeWeek, WEEK_LIMIT, weekOf, weeksOfMonth, type Budget, type Envelope, type WeekSummary } from './week.ts';
import type { DateString, TagId } from './zenmoney/types.ts';

/** What an expense turned out to be. */
export type Kind = 'ordinary' | 'person' | 'self' | 'untitled' | 'extra' | 'regular' | 'outside';

/** Kinds of expenses that count in a week although nobody said what they are, in the order they are checked. */
export const TO_CHECK = ['person', 'self', 'untitled'] as const;
export type ToCheck = (typeof TO_CHECK)[number];

/** A transfer to oneself under this amount and not in whole hundreds pays a purchase on a marketplace. */
const MARKETPLACE_LIMIT = 20_000;
/** How many months before the reviewed one tell what is usual. */
const USUAL_MONTHS = 3;

/** The four questions the review answers, as the assistant's chips ask them. */
export const QUESTIONS = ['overspend', 'check', 'optimize', 'plan'] as const;
export type Question = (typeof QUESTIONS)[number];

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
  if (isPerson(o.payee)) return 'person';
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

// ---- What the weeks were made of

/** A transfer goes to a person or to oneself, not to a shop, so it has no shop's subcategory. */
export function isTransfer(o: Pick<Operation, 'payee'>, selfPayee: string | null): boolean {
  return o.payee === selfPayee || isPerson(o.payee);
}

/** The ordinary expenses of the weeks in a category, or those of a kind still to check, and what they are made of. */
export interface WeekPart {
  /** Null for a kind to check. */
  category: Category | null;
  kind: 'ordinary' | ToCheck;
  amount: number;
  expenses: Operation[];
  /** Largest first; in a split category the rest without a subcategory goes last. */
  pieces: WeekPiece[];
}

/**
 * A piece of a part, named by `key` within it: a subcategory (sub-<id>), or the rest of a split category without one
 * (sub-none); a shop or a person (shop-<shopKey>), in a category nobody split and among the kinds to check; or what
 * the amounts of transfers to oneself hint at (marketplace, regular-<its title>, round).
 */
export type WeekPiece = PieceOf & { amount: number; expenses: Operation[] };

/** What a piece is made by. */
type PieceOf = { key: string } & (
  | { by: 'subcategory'; subcategory: Subcategory | null }
  /** `name` is the payee of its largest expense without the shop's number. */
  | { by: 'shop'; name: string }
  | { by: 'amount'; hint: 'marketplace' | 'round' | { regular: string } }
);

/** What the weeks' expenses were made of, by part, largest first. */
export function weekParts(
  review: Pick<MonthReview, 'expenses'>,
  context: { subcategories: SubcategorySetup; regular: readonly Pick<RegularExpense, 'title' | 'amount'>[]; selfPayee: string | null },
): WeekPart[] {
  const parts: WeekPart[] = [];
  const byCategory = new Map<TagId, Operation[]>();
  for (const { operation: o, kind } of review.expenses) {
    if (kind === 'ordinary' && o.category) byCategory.set(o.category.id, [...(byCategory.get(o.category.id) ?? []), o]);
  }
  for (const expenses of byCategory.values()) {
    const subOf = (o: Operation) => subcategoryOf(o, context.subcategories, { shop: !isTransfer(o, context.selfPayee) });
    const pieces: WeekPiece[] = expenses.some((o) => subOf(o) !== null)
      ? pieced(expenses, (o) => {
          const subcategory = subOf(o);
          return { key: subcategory ? `sub-${subcategory.id}` : 'sub-none', by: 'subcategory', subcategory };
        }).sort((a, b) => Number(a.key === 'sub-none') - Number(b.key === 'sub-none'))
      : byShop(expenses);
    parts.push({ category: expenses[0]!.category, kind: 'ordinary', amount: total(expenses), expenses, pieces });
  }
  for (const kind of TO_CHECK) {
    const expenses = review.expenses.filter((e) => e.kind === kind).map((e) => e.operation);
    if (!expenses.length) continue;
    const pieces: WeekPiece[] =
      kind === 'self'
        ? pieced(expenses, (o) => {
            const hint = transferHint(o, context.regular) ?? 'round';
            return { key: typeof hint === 'string' ? hint : `regular-${hint.regular}`, by: 'amount', hint };
          })
        : byShop(expenses);
    parts.push({ category: null, kind, amount: total(expenses), expenses, pieces });
  }
  return parts.sort((a, b) => b.amount - a.amount);
}

/** Expenses by shop or person, largest first. */
function byShop(expenses: Operation[]): WeekPiece[] {
  return pieced(expenses, (o) => ({ key: `shop-${shopKey(o.payee)}`, by: 'shop', name: shopName(o.payee) }));
}

/** Expenses in pieces by what `piece` makes of each, largest first; a piece is described by its largest expense. */
function pieced(expenses: Operation[], piece: (o: Operation) => PieceOf): WeekPiece[] {
  const pieces = new Map<string, WeekPiece>();
  for (const o of [...expenses].sort((a, b) => b.amount - a.amount)) {
    const made = piece(o);
    const found = pieces.get(made.key) ?? { ...made, amount: 0, expenses: [] };
    found.amount += o.amount;
    found.expenses.push(o);
    pieces.set(made.key, found);
  }
  return [...pieces.values()].sort((a, b) => b.amount - a.amount);
}

function total(expenses: readonly Operation[]): number {
  return expenses.reduce((s, o) => s + o.amount, 0);
}

// ---- Hints

/** What share of a payee's earlier expenses must have gone one way for its next ones to be hinted that way. */
const USUAL_SHARE = 2 / 3;
/** The subcategory transfers to oneself that pay for purchases on Ozon or WB are hinted into when none is usual yet. */
export const MARKETPLACE_SUBCATEGORY = 'Ozon и WB';

/**
 * A suggestion to put expenses somewhere or to hide a category, worked out by rules; nothing changes until the user
 * accepts it, and what is accepted is no rule for later: later expenses get hints again.
 */
export type Hint =
  /**
   * Expenses of one payee into the category, and the subcategory, that `times` of its `of` earlier expenses went
   * into, the latest of them `last`. A transfer already in that category only gets the subcategory.
   */
  | { kind: 'usual'; expenses: Operation[]; category: Category; subcategory: Subcategory | null; times: number; of: number; last: Operation }
  /**
   * Transfers to oneself with amounts like purchases on Ozon or WB, into the category such transfers went into and
   * their subcategory, or else a new one titled MARKETPLACE_SUBCATEGORY.
   */
  | { kind: 'marketplace'; expenses: Operation[]; category: Category; subcategory: Subcategory | { title: string } }
  /** A category nothing went into for the days recentCount looks back, three months, last on `last`. */
  | { kind: 'hide'; category: Category; last: DateString | null };

/** How the user turns a hint down: by the category it would hide, or by each expense it would move. */
export function hintKeys(hint: Hint): string[] {
  return hint.kind === 'hide' ? [`hide:${hint.category.id}`] : hint.expenses.map((o) => `spending:${o.id}`);
}

/**
 * The hints for a month's weeks, largest first, then the categories to hide; those turned down are left out.
 * - A transfer to a person or an expense without a category goes where most of its payee's earlier expenses went.
 * - A transfer in a split category goes into the subcategory most of its payee's earlier ones there went into; a
 *   shop's expenses need no hint, they follow their shop.
 * - A transfer to oneself that looks like a purchase on Ozon or WB goes where the earlier such went.
 * - An expense category nothing went into for three months, as recentCount counts, is better hidden: a ZenMoney one,
 *   or one of the user's own once something went into it, since a new one may be waiting for its first expense.
 */
export function reviewHints(
  review: Pick<MonthReview, 'expenses'>,
  context: {
    /** Every expense as the user sorted it, to tell where a payee's go. */
    history: readonly Operation[];
    /** Every income that counts, since a category may sort incomes too. */
    incomes: readonly Operation[];
    /** The expense categories to hint at hiding, and the income ones. */
    categories: readonly Pick<CategoryEntry, 'id' | 'title' | 'color' | 'hidden' | 'zenmoneyTitle'>[];
    incomeCategories: readonly Pick<CategoryEntry, 'id'>[];
    subcategories: SubcategorySetup;
    regular: readonly Pick<RegularExpense, 'title' | 'amount'>[];
    selfPayee: string | null;
    today: DateString;
    dismissed: ReadonlySet<string>;
  },
): Hint[] {
  const { history, subcategories, selfPayee } = context;
  const open = (o: Operation) => !context.dismissed.has(`spending:${o.id}`);
  const subOf = (o: Operation) => subcategoryOf(o, subcategories, { shop: !isTransfer(o, selfPayee) });
  /** Of `earlier`, the way most went when at least USUAL_SHARE of them did, with how many. */
  const usual = <T>(earlier: readonly Operation[], way: (o: Operation) => T | null, same: (a: T, b: T) => boolean) => {
    const ways: Array<{ way: T; times: number; last: Operation }> = [];
    for (const o of earlier) {
      const w = way(o);
      if (w === null) continue;
      const found = ways.find((x) => same(x.way, w));
      if (found) found.times += 1;
      else ways.push({ way: w, times: 1, last: o });
    }
    const best = ways.sort((a, b) => b.times - a.times)[0];
    return best && best.times >= earlier.length * USUAL_SHARE ? best : null;
  };
  const sameCategory = (a: Category, b: Category) => a.id === b.id;
  const sameSubcategory = (a: Subcategory, b: Subcategory) => a.id === b.id;
  // Payments of regular expenses and purchases tell nothing of where the payee's other expenses go.
  const sorted = history.filter((o) => o.category && !o.regular && !o.purchase).sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  const hints: Hint[] = [];

  const groups = new Map<string, Operation[]>();
  for (const { operation: o, kind } of review.expenses) {
    if (!open(o) || isUntitled(o)) continue;
    const toSort = kind === 'person' || kind === 'untitled';
    const toSplit = kind === 'ordinary' && isTransfer(o, selfPayee) && subOf(o) === null;
    if (!toSort && !toSplit) continue;
    const key = `${toSort ? '' : o.category!.id} ${shopKey(o.payee)}`;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  for (const expenses of groups.values()) {
    const ids = new Set(expenses.map((o) => o.id));
    const first = expenses[0]!;
    const shop = shopKey(first.payee);
    const earlier = sorted.filter((o) => !ids.has(o.id) && shopKey(o.payee) === shop);
    if (first.category) {
      const inCategory = earlier.filter((o) => o.category!.id === first.category!.id);
      const sub = usual(inCategory, subOf, sameSubcategory);
      if (sub) hints.push({ kind: 'usual', expenses, category: first.category, subcategory: sub.way, times: sub.times, of: inCategory.length, last: sub.last });
      continue;
    }
    const category = usual(earlier, (o) => o.category, sameCategory);
    if (!category) continue;
    const inCategory = earlier.filter((o) => o.category!.id === category.way.id);
    const sub = usual(inCategory, subOf, sameSubcategory);
    hints.push({ kind: 'usual', expenses, category: category.way, subcategory: sub?.way ?? null, times: category.times, of: earlier.length, last: category.last });
  }

  const marketplace = review.expenses.filter((e) => e.kind === 'self' && open(e.operation) && transferHint(e.operation, context.regular) === 'marketplace').map((e) => e.operation);
  if (marketplace.length) {
    const ids = new Set(marketplace.map((o) => o.id));
    const earlier = sorted.filter((o) => !ids.has(o.id) && o.payee === selfPayee && transferHint(o, context.regular) === 'marketplace');
    const category = usual(earlier, (o) => o.category, sameCategory);
    if (category) {
      const sub = usual(
        earlier.filter((o) => o.category!.id === category.way.id),
        subOf,
        sameSubcategory,
      );
      const named = subcategories.subcategories.find((s) => s.category === category.way.id && s.title.toLocaleLowerCase('ru') === MARKETPLACE_SUBCATEGORY.toLocaleLowerCase('ru'));
      hints.push({ kind: 'marketplace', expenses: marketplace, category: category.way, subcategory: sub?.way ?? named ?? { title: MARKETPLACE_SUBCATEGORY } });
    }
  }
  hints.sort((a, b) => ('expenses' in b ? total(b.expenses) : 0) - ('expenses' in a ? total(a.expenses) : 0));

  const forIncomes = new Set(context.incomeCategories.map((c) => c.id));
  for (const c of context.categories) {
    if (c.hidden || context.dismissed.has(`hide:${c.id}`)) continue;
    const used = [...history, ...(forIncomes.has(c.id) ? context.incomes : [])].filter((o) => o.category?.id === c.id);
    if (recentCount(c, used, context.today) > 0 || (c.zenmoneyTitle === null && used.length === 0)) continue;
    const last = used.reduce<DateString | null>((latest, o) => (latest === null || o.date > latest ? o.date : latest), null);
    hints.push({ kind: 'hide', category: { id: c.id, title: c.title, color: c.color }, last });
  }
  return hints;
}

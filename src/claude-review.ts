// What Claude makes of a month's review: findings, marking it suggests, questions with options to answer, splits of
// categories into subcategories, expenses that could have been spared, and answers to the four questions of the
// review. It is asked by src/claude/review.md with the month as claudeInput lays it out, and answers in the shape of
// src/claude/review.schema.json, expenses and categories named by their ids. Claude changes nothing itself: what it
// suggests is applied only when the user accepts it or picks an answer. What the user did with its word is kept by
// expense and by category, so that a later answer brings back nothing turned down or done. An answer stands for its
// month until a new one replaces it; Claude's word about an expense the user has marked otherwise since is no longer
// open. Pure functions; the page is src/web/pages/review.ts, the run src/claude/run.ts.

import { readFileSync } from 'node:fs';
import type { Subcategory } from './categories.ts';
import { addDays, shiftMonth, type MonthString } from './dates.ts';
import { parseTitle } from './input.ts';
import type { Operation } from './ledger.ts';
import type { Category } from './operations.ts';
import { shopKey, shopName } from './payees.ts';
import type { RegularExpense } from './regular.ts';
import { QUESTIONS, transferHint, type MonthReview, type Question, type ReviewedExpense } from './review.ts';
import { schemaErrors, type JsonSchema } from './schema.ts';
import { MONTH_LIMIT, WEEK_LIMIT, weeksOfMonth, type Envelope, type WeekStart } from './week.ts';
import type { DateString, TagId } from './zenmoney/types.ts';

export const ANSWER_SCHEMA: JsonSchema = JSON.parse(readFileSync(new URL('./claude/review.schema.json', import.meta.url), 'utf8'));

/** Where expenses go: a category by id, its subcategory by title (made when missing), where they count; null keeps what they have. */
export interface Placement {
  category: TagId | null;
  subcategory: string | null;
  envelope: Envelope | null;
}

export interface ClaudeMarking extends Placement {
  title: string;
  why: string;
  expenses: string[];
}

export interface ClaudeQuestion {
  title: string;
  text: string;
  expenses: string[];
  options: Array<Placement & { label: string }>;
}

export interface ClaudeSplit {
  category: TagId;
  why: string;
  /** Each with the payees whose expenses go into it, as banks write them. */
  subcategories: Array<{ title: string; payees: string[] }>;
}

/** Claude's answer, as review.schema.json shapes it. Tones and icons are the page's own names. */
export interface ClaudeAnswer {
  findings: Array<{ tone: string; icon: string; title: string; text: string; category: TagId | null; expenses: string[] }>;
  marking: ClaudeMarking[];
  questions: ClaudeQuestion[];
  splits: ClaudeSplit[];
  avoidable: Array<{ title: string; text: string; expenses: string[] }>;
  answers: Record<Question, { paragraphs: string[]; expenses: string[] }>;
}

export interface ClaudeReview {
  month: MonthString;
  /** When the answer came, as an ISO time. */
  madeAt: string;
  answer: ClaudeAnswer;
  /** What each expense of the month's weeks was when the answer came, by id (see stateOf). */
  seen: Map<string, string>;
}

/** What the user did with Claude's word about an expense or a category; `answer` is the option picked. */
export interface ClaudeDecision {
  decision: 'accepted' | 'declined' | 'answered';
  answer: string | null;
}

/** Claude's review of a month as saved, when the user asked it to look again, and what they did with its word. */
export interface ClaudeSaved {
  review: ClaudeReview | null;
  /** An ISO time; null when nothing is asked for. */
  askedAt: string | null;
  /** Why Claude did not answer what was asked; null while it may yet. */
  failed: string | null;
  decisions: Map<string, ClaudeDecision>;
}

export const NO_CLAUDE: ClaudeSaved = { review: null, askedAt: null, failed: null, decisions: new Map() };

/** How a decision about an expense or a category is kept. */
export function spendingKey(id: string): string {
  return `spending:${id}`;
}

export function splitKey(category: TagId): string {
  return `split:${category}`;
}

/** An expense of the month's weeks as it is now: where it counts and its subcategory, as on the review's map. */
export interface Current extends ReviewedExpense {
  subcategory: Subcategory | null;
}

/** What an expense is as far as Claude's word goes: its category, subcategory, where it counts and what it paid. */
export function stateOf(c: Current): string {
  const o = c.operation;
  return [o.category?.id ?? '', c.subcategory?.id ?? '', c.envelope, o.regular?.id ?? '', o.purchase?.id ?? ''].join('|');
}

/** Whether an expense already is where `p` would put it. */
export function isPlaced(c: Current, p: Placement): boolean {
  return (
    (p.category === null || c.operation.category?.id === p.category) &&
    (p.subcategory === null || c.subcategory?.title.toLocaleLowerCase('ru') === p.subcategory.toLocaleLowerCase('ru')) &&
    (p.envelope === null || c.envelope === p.envelope)
  );
}

/** How many first characters of an expense's id tell it from the others of a month. */
const ID_START = 8;

/**
 * Claude's answer checked against the schema, with what names no expense of the month or no category left out: ids
 * of expenses that are not the month's, unless their first characters name one, marking and options that would put expenses into no category or nowhere, and
 * questions with fewer than two options left. `dropped` says what was left out; errors, why the answer is no answer.
 */
export function readAnswer(
  value: unknown,
  context: { expenses: ReadonlySet<string>; categories: ReadonlySet<TagId> },
): { answer: ClaudeAnswer; dropped: string[] } | { errors: string[] } {
  const errors = schemaErrors(value, ANSWER_SCHEMA);
  if (errors.length) return { errors };
  const raw = value as ClaudeAnswer;
  const dropped: string[] = [];
  // Claude copies the start of a long id right and may garble the rest, so an id that names no expense is taken for
  // the one expense whose id starts the same way.
  const byStart = (id: string) => {
    const same = [...context.expenses].filter((x) => x.slice(0, ID_START) === id.slice(0, ID_START));
    return id.length >= ID_START && same.length === 1 ? same[0]! : null;
  };
  const known = (ids: string[], what: string) =>
    ids.flatMap((id) => {
      const found = context.expenses.has(id) ? id : byStart(id);
      if (!found) dropped.push(`${what}: нет траты ${id}`);
      return found ? [found] : [];
    });
  const titled = (title: string) => {
    const parsed = parseTitle(title);
    return 'error' in parsed ? null : parsed.value;
  };
  const placement = (p: Placement, what: string): boolean => {
    if (p.category !== null && !context.categories.has(p.category)) dropped.push(`${what}: нет категории ${p.category}`);
    else if (p.subcategory !== null && p.category === null) dropped.push(`${what}: подкатегория без категории`);
    else if (p.subcategory !== null && titled(p.subcategory) === null) dropped.push(`${what}: не название подкатегории`);
    else if (p.category === null && p.envelope === null) dropped.push(`${what}: ничего не меняет`);
    else return true;
    return false;
  };
  const subcategory = <T extends Placement>(p: T): T => ({ ...p, subcategory: p.subcategory === null ? null : titled(p.subcategory) });
  const answer: ClaudeAnswer = {
    findings: raw.findings.map((f) => ({
      ...f,
      category: f.category !== null && context.categories.has(f.category) ? f.category : null,
      expenses: known(f.expenses, `вывод «${f.title}»`),
    })),
    marking: raw.marking
      .map((m) => ({ ...m, expenses: known(m.expenses, `разметка «${m.title}»`) }))
      .filter((m) => (m.expenses.length ? placement(m, `разметка «${m.title}»`) : (dropped.push(`разметка «${m.title}»: нет трат`), false)))
      .map(subcategory),
    questions: raw.questions
      .map((q) => ({
        ...q,
        expenses: known(q.expenses, `вопрос «${q.title}»`),
        options: q.options.filter((o) => placement(o, `вопрос «${q.title}», «${o.label}»`)).map(subcategory),
      }))
      .filter((q) => (q.expenses.length && q.options.length >= 2) || (dropped.push(`вопрос «${q.title}»: не о чем спрашивать`), false)),
    splits: raw.splits
      .map((s) => ({ ...s, subcategories: s.subcategories.flatMap((x) => (titled(x.title) ? [{ ...x, title: titled(x.title)! }] : [])) }))
      .filter(
        (s) =>
          (context.categories.has(s.category) && s.subcategories.length >= 2) ||
          (dropped.push(`разбиение ${s.category}: нет категории или подкатегорий`), false),
      ),
    avoidable: raw.avoidable.map((a) => ({ ...a, expenses: known(a.expenses, `лишняя трата «${a.title}»`) })),
    answers: Object.fromEntries(QUESTIONS.map((q) => [q, { ...raw.answers[q], expenses: known(raw.answers[q].expenses, `ответ ${q}`) }])) as ClaudeAnswer['answers'],
  };
  return { answer, dropped };
}

/** What of Claude's word still waits for the user, about the month's expenses as they are now. */
export interface OpenWord {
  marking: Array<{ item: ClaudeMarking; expenses: Operation[] }>;
  questions: Array<{ item: ClaudeQuestion; expenses: Operation[] }>;
  splits: Array<{ item: ClaudeSplit; category: Category }>;
  /** Expenses of the month's weeks that came after the answer. */
  fresh: Operation[];
}

/**
 * The marking, questions and splits of a saved answer still open. An expense leaves Claude's word once the user
 * accepted, turned down or answered what Claude said about it, or marked it otherwise since the answer; marking also
 * leaves once the expense is where it would put it. A split leaves once accepted or turned down.
 */
export function openWord(review: ClaudeReview, decisions: ReadonlyMap<string, ClaudeDecision>, month: readonly Current[], categories: readonly Category[]): OpenWord {
  const now = new Map(month.map((c) => [c.operation.id, c]));
  const untouched = (id: string) => {
    const c = now.get(id);
    return c && !decisions.has(spendingKey(id)) && review.seen.get(id) === stateOf(c) ? c : null;
  };
  const marking = review.answer.marking
    .map((item) => ({
      item,
      expenses: item.expenses
        .map(untouched)
        .filter((c): c is Current => c !== null && !isPlaced(c, item))
        .map((c) => c.operation),
    }))
    .filter((m) => m.expenses.length);
  const questions = review.answer.questions
    .map((item) => ({ item, expenses: item.expenses.map(untouched).filter((c): c is Current => c !== null).map((c) => c.operation) }))
    .filter((q) => q.expenses.length);
  const splits = review.answer.splits.flatMap((item) => {
    const category = categories.find((c) => c.id === item.category);
    return category && !decisions.has(splitKey(item.category)) ? [{ item, category }] : [];
  });
  return { marking, questions, splits, fresh: month.filter((c) => !review.seen.has(c.operation.id)).map((c) => c.operation) };
}

/** The ids of the expenses Claude's open word is about. */
export function openExpenses(word: OpenWord): Set<string> {
  return new Set([...word.marking, ...word.questions].flatMap((x) => x.expenses.map((o) => o.id)));
}

// ---- What Claude is given

/** The month as Claude reads it; every amount in the main currency. */
export interface ClaudeInput {
  month: MonthString;
  today: DateString;
  /** The user's own name in transfers to their accounts in other banks. */
  selfPayee: string | null;
  weeks: Array<{ from: DateString; to: DateString; spent: number; limit: number }>;
  totals: Record<'income' | 'spent' | 'left' | 'inWeeks' | 'limits' | 'regular' | 'extra' | 'extraLimit' | 'outside', number>;
  next: { month: MonthString; weeks: number; weekLimit: number; extraLimit: number; regular: number };
  categories: Array<{ id: TagId; title: string; subcategories: string[]; perWeek: number | null; usualPerWeek: number | null; split: string | null }>;
  regular: Array<{ title: string; amount: number; day: number }>;
  expenses: Array<{
    id: string;
    date: DateString;
    amount: number;
    payee: string;
    bank: string | null;
    account: string;
    category: string | null;
    categoryId: TagId | null;
    subcategory: string | null;
    counts: Envelope;
    kind: string;
    paid: string | null;
    description: string | null;
    amountHint: string | null;
    decided: string | null;
  }>;
  notCounted: Array<{ date: DateString; amount: number; payee: string; bank: string | null; description: string | null }>;
  payees: Array<{ payee: string; before: { count: number; min: number; max: number; categories: Record<string, number> } | null; months: Record<MonthString, number> }>;
  previous: {
    madeAt: string;
    marking: Array<{ title: string; status: string }>;
    questions: Array<{ title: string; status: string }>;
    splits: Array<{ category: string; status: string }>;
  } | null;
}

/** How many months before the reviewed one Claude sees, as the review counts what is usual. */
const MONTHS_BEFORE = 3;

const DECIDED: Record<ClaudeDecision['decision'], string> = { accepted: 'принято', declined: 'не надо', answered: 'ответ' };

function decided(d: ClaudeDecision | undefined): string | null {
  return d ? (d.answer ? `${DECIDED[d.decision]}: ${d.answer}` : DECIDED[d.decision]) : null;
}

/**
 * The month for Claude: its weeks, totals and categories against the months before, the expenses of its weeks as
 * the user marked them, those not counted, where each payee's expenses went in the months before, and, when Claude
 * reviewed the month already, what became of its word.
 */
export function claudeInput(context: {
  review: MonthReview;
  today: DateString;
  weekStart: WeekStart;
  /** The month's expenses as they are now, largest first. */
  month: readonly Current[];
  /** The month's expenses the user said not to count. */
  ignored: readonly Operation[];
  /** Every expense as the user sorted it. */
  history: readonly Operation[];
  categories: ReadonlyArray<Category & { hidden: boolean }>;
  subcategories: readonly Subcategory[];
  regular: readonly RegularExpense[];
  selfPayee: string | null;
  claude: ClaudeSaved;
}): ClaudeInput {
  const { review: r, claude } = context;
  const round = (n: number) => Math.round(n);
  const weekly = new Map(r.categories.map((c) => [c.id, c]));
  const monthsBefore = Array.from({ length: MONTHS_BEFORE }, (_, i) => shiftMonth(r.month, -(MONTHS_BEFORE - i)));
  const spanOf = (m: MonthString) => {
    const weeks = weeksOfMonth(m, context.weekStart);
    return { from: weeks[0]!, to: addDays(weeks.at(-1)!, 6) };
  };
  const earliest = spanOf(monthsBefore[0]!).from;
  const earlier = context.history.filter((o) => o.date >= earliest && o.date < r.from);
  const shops = new Map<string, string>();
  for (const { operation: o } of context.month) if (!shops.has(shopKey(o.payee))) shops.set(shopKey(o.payee), shopName(o.payee));

  const previous = (() => {
    const saved = claude.review;
    if (!saved) return null;
    const word = openWord(saved, claude.decisions, context.month, context.categories);
    const status = (ids: string[], open: boolean) => {
      const all = ids.map((id) => claude.decisions.get(spendingKey(id)));
      const first = all.find(Boolean);
      return first ? decided(first)! : open ? 'ещё не решено' : 'размечено по-своему';
    };
    return {
      madeAt: saved.madeAt,
      marking: saved.answer.marking.map((m) => ({ title: m.title, status: status(m.expenses, word.marking.some((x) => x.item === m)) })),
      questions: saved.answer.questions.map((q) => ({ title: q.title, status: status(q.expenses, word.questions.some((x) => x.item === q)) })),
      splits: saved.answer.splits.map((s) => ({
        category: context.categories.find((c) => c.id === s.category)?.title ?? s.category,
        status: decided(claude.decisions.get(splitKey(s.category))) ?? 'ещё не решено',
      })),
    };
  })();

  return {
    month: r.month,
    today: context.today,
    selfPayee: context.selfPayee,
    weeks: r.weeks.map((w) => ({ from: w.week, to: addDays(w.week, 6), spent: round(w.spent), limit: w.limit })),
    totals: {
      income: round(r.income),
      spent: round(r.spent),
      left: round(r.left),
      inWeeks: round(r.inWeeks),
      limits: r.limits,
      regular: round(r.regular),
      extra: round(r.extra),
      extraLimit: MONTH_LIMIT,
      outside: round(r.outside),
    },
    next: { month: r.next.month, weeks: r.next.weeks, weekLimit: WEEK_LIMIT, extraLimit: MONTH_LIMIT, regular: round(r.next.regular) },
    categories: context.categories
      .filter((c) => !c.hidden || weekly.has(c.id))
      .map((c) => ({
        id: c.id,
        title: c.title,
        subcategories: context.subcategories.filter((s) => s.category === c.id).map((s) => s.title),
        perWeek: weekly.has(c.id) ? round(weekly.get(c.id)!.perWeek) : null,
        usualPerWeek: weekly.get(c.id)?.usual != null ? round(weekly.get(c.id)!.usual!) : null,
        split: decided(claude.decisions.get(splitKey(c.id))),
      })),
    regular: context.regular.map((x) => ({ title: x.title, amount: x.amount, day: x.day })),
    expenses: context.month.map(({ operation: o, kind, envelope, subcategory }) => {
      const hint = kind === 'self' ? transferHint(o, context.regular) : null;
      return {
        id: o.id,
        date: o.date,
        amount: o.amount,
        payee: o.payee,
        bank: [o.originalPayee, o.comment].filter(Boolean).join(' · ') || null,
        account: o.account,
        category: o.category?.title ?? null,
        categoryId: o.category?.id ?? null,
        subcategory: subcategory?.title ?? null,
        counts: envelope,
        kind,
        paid: o.regular?.title ?? o.purchase?.title ?? null,
        description: o.description,
        amountHint: hint === 'marketplace' ? 'похоже на Ozon или WB' : hint ? `сумма регулярной траты «${hint.regular}»` : null,
        decided: decided(claude.decisions.get(spendingKey(o.id))),
      };
    }),
    notCounted: context.ignored.map((o) => ({ date: o.date, amount: o.amount, payee: o.payee, bank: o.comment, description: o.description })),
    payees: [...shops].map(([key, payee]) => {
      const before = earlier.filter((o) => shopKey(o.payee) === key);
      const categories: Record<string, number> = {};
      for (const o of before) {
        const title = o.category?.title ?? 'без категории';
        categories[title] = (categories[title] ?? 0) + 1;
      }
      const months = Object.fromEntries(
        monthsBefore.map((m) => {
          const { from, to } = spanOf(m);
          return [m, round(before.filter((o) => o.date >= from && o.date <= to).reduce((s, o) => s + o.amount, 0))];
        }),
      );
      const amounts = before.map((o) => o.amount);
      return {
        payee,
        before: before.length ? { count: before.length, min: round(Math.min(...amounts)), max: round(Math.max(...amounts)), categories } : null,
        months,
      };
    }),
    previous,
  };
}

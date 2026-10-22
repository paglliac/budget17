// The plan of a credit card's debt: how the user says they will repay it, month after month, from what each month
// leaves over, from its extras and from a cut of its weeks, and when that closes the debt with the interest it costs
// after the days without interest (the user's rule, 2026-10-22: «я скажу, как буду закрывать, а приложение покажет,
// когда закрою»). Scenarios to pick are the same plan with some ways set. Its steps hold the money in the budget as a
// wish's plan does (wish-plans.ts). Pure functions.

import { dateOf, daysInMonth, monthOf, shiftMonth, type MonthString } from './dates.ts';
import { MONTH_LIMIT, monthOfWeek, weekOf, weeksOfMonth } from './week.ts';
import { covered, extrasFree, parsePicks, type Part, type Plan, type PlanContext, type Step, type Way, type WayPick, type WishGoal } from './wish-plans.ts';
import type { DateString } from './zenmoney/types.ts';

/** How far ahead a card's plan looks for the month that closes it. */
export const CARD_MONTHS = 36;
/** What a week gives when the weeks are cut and the user did not say how much. */
export const WEEK_CUT = 5_000;
/** The most a week can be cut by. */
const WEEK_MOST = 20_000;

/** A month of a card's plan: what it repays, the interest it adds and what is left owed after it. */
export interface CardMonth {
  month: MonthString;
  paid: number;
  interest: number;
  left: number;
}

/** When a card's plan closes its debt, if within CARD_MONTHS, and the interest it pays on the way. */
export interface CardProjection {
  months: CardMonth[];
  closes: MonthString | null;
  interest: number;
}

/** What `kept` steps took from a month's savings already, as the card's repayments from them. */
function keptSavings(kept: readonly Step[], month: MonthString): number {
  return kept.reduce((sum, s) => sum + (s.kind === 'savings' && s.month === month ? s.amount : 0), 0);
}

/** What a month leaves over for the card, after the other plans and its own repayments from it. */
function monthSavings(context: PlanContext, kept: readonly Step[], month: MonthString): number {
  return Math.max(0, context.savings(month) - keptSavings(kept, month));
}

/** Days of `month` after `due`, the last day without interest. */
function daysAfter(due: DateString, month: MonthString): number {
  const last = dateOf(month, daysInMonth(month));
  if (last <= due) return 0;
  return monthOf(due) === month ? Number(last.slice(8)) - Number(due.slice(8)) : daysInMonth(month);
}

/**
 * The ways to repay a card: what each month leaves over (`savings`), its extras (`extras`), a month's worth each, all of
 * it unless the user says how much, and a cut of each week (`weeks`). The most a month's savings give is the most a
 * month ahead leaves over.
 */
export function cardWays(context: PlanContext, kept: readonly Step[] = []): Way[] {
  const current = weekOf(context.today, context.budget.weekStart);
  const first = monthOfWeek(current);
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(first, i));
  const most = Math.max(0, ...months.map((m) => monthSavings(context, kept, m)));
  const ways: Way[] = [
    { id: 'savings', kind: 'savings', month: first, most },
    { id: 'extras', kind: 'extra', month: first, most: MONTH_LIMIT },
    { id: 'weeks', kind: 'weeks', month: first, most: WEEK_MOST },
  ];
  return ways.filter((way) => way.most > 0.5);
}

/**
 * The plan the ways picked make, on top of `kept`, the repayments made already: month after month from this one, what
 * the month leaves over, then its extras, then the cut of its weeks after this one, each as much as it is given or all
 * of it, until the debt is repaid; after `goal.due` what is still owed grows by `rate` percent a year, day by day. A
 * month's extras are held in its first week, or this one. The plan is short of what it would still owe after
 * CARD_MONTHS.
 */
export function cardPlan(
  goal: WishGoal,
  rate: number | null,
  context: PlanContext,
  picks: readonly WayPick[],
  kept: readonly Step[] = [],
): { plan: Plan; parts: Part[]; projection: CardProjection } {
  const { budget, today } = context;
  const current = weekOf(today, budget.weekStart);
  const ways = new Map(cardWays(context, kept).map((way) => [way.id, way]));
  const seen = new Set<string>();
  const picked = picks.flatMap((pick) => {
    const way = ways.get(pick.id);
    if (!way || seen.has(pick.id)) return [];
    seen.add(pick.id);
    // A slider at its end gives all there is.
    const amount = pick.amount === null || (way.kind !== 'weeks' && pick.amount >= way.most - 0.5) ? null : Math.max(0, pick.amount);
    return [{ way, amount }];
  });
  const cap = (id: string): number | null => {
    const pick = picked.find((p) => p.way.id === id);
    if (!pick) return null;
    return pick.amount ?? (pick.way.kind === 'weeks' ? WEEK_CUT : Infinity);
  };

  let left = Math.max(0, goal.amount - covered(kept));
  const steps: Step[] = [...kept];
  const given = new Map<string, number>();
  const months: CardMonth[] = [];
  let interest = 0;
  let closes: MonthString | null = left < 0.5 ? monthOfWeek(current) : null;
  let lastWeek = current;
  const take = (way: string, most: number, step: (amount: number) => Step) => {
    const amount = Math.round(Math.max(0, Math.min(most, left)));
    if (amount <= 0) return 0;
    left -= amount;
    given.set(way, (given.get(way) ?? 0) + amount);
    steps.push(step(amount));
    return amount;
  };
  for (let i = 0, month = monthOfWeek(current); i < CARD_MONTHS && closes === null; i++, month = shiftMonth(month, 1)) {
    const weeks = weeksOfMonth(month, budget.weekStart).filter((w) => w > current);
    const holdIn = month === monthOfWeek(current) ? current : (weeksOfMonth(month, budget.weekStart)[0] ?? current);
    let paid = 0;
    const savings = cap('savings');
    if (savings !== null) paid += take('savings', Math.min(savings, monthSavings(context, kept, month)), (amount) => ({ way: 'savings', kind: 'savings', month, amount }));
    const extras = cap('extras');
    if (extras !== null) paid += take('extras', Math.min(extras, extrasFree(budget, month)), (amount) => ({ way: 'extras', kind: 'extra', week: holdIn, amount }));
    const cut = cap('weeks');
    if (cut !== null) {
      for (const week of weeks) {
        const amount = take('weeks', cut, (a) => ({ way: 'weeks', kind: 'week', week, amount: a }));
        paid += amount;
        if (amount > 0) lastWeek = week;
      }
    }
    if (paid > 0 && holdIn > lastWeek) lastWeek = holdIn;
    const owed = rate && left > 0.5 ? (left * rate * daysAfter(goal.due, month)) / 100 / 365 : 0;
    left += owed;
    interest += owed;
    months.push({ month, paid, interest: owed, left: Math.max(0, left) });
    if (left < 0.5) closes = month;
  }

  const parts = picked.map(({ way, amount }): Part => {
    const all = amount === null && way.kind !== 'weeks';
    return { way, given: given.get(way.id) ?? 0, each: all ? way.most : (amount ?? WEEK_CUT), fixed: !all, top: way.most };
  });
  return {
    plan: { buyWeek: lastWeek, steps, short: closes === null ? Math.round(left) : 0 },
    parts,
    projection: { months, closes, interest: Math.round(interest) },
  };
}

/** A plan ready to pick: the ways it sets, as the app sends them, and when it closes the card with what interest. */
export interface CardScenario {
  ways: string;
  closes: MonthString;
  interest: number;
}

/**
 * Plans to pick in one tap, the soonest closed first, one a month: all that each month leaves over, that with all the
 * extras too, and equal repayments from the savings that close the card in about six months or a year. Those that do
 * not close it within CARD_MONTHS are left out.
 */
export function cardScenarios(goal: WishGoal, rate: number | null, context: PlanContext, kept: readonly Step[] = []): CardScenario[] {
  const left = Math.max(0, goal.amount - covered(kept));
  const candidates = ['savings:', 'savings:,extras:', ...[6, 12].map((n) => `savings:${Math.ceil(left / n / 1000) * 1000}`)];
  const scenarios = new Map<MonthString, CardScenario>();
  for (const ways of candidates) {
    const { projection } = cardPlan(goal, rate, context, parsePicks(ways), kept);
    if (projection.closes === null || scenarios.has(projection.closes)) continue;
    scenarios.set(projection.closes, { ways, closes: projection.closes, interest: projection.interest });
  }
  return [...scenarios.values()].sort((a, b) => a.closes.localeCompare(b.closes));
}

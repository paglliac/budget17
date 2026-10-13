// Ways to afford a wish by the day it is needed, picked together, each giving a part of it: a month's extras (spent
// in the month it is bought, or set aside in an earlier one), flexible purchases moved past the day to make room in
// the extras, a cut of the weeks before the day, the savings of the month it is bought in, or waiting for the extras
// of a later month. A plan, once chosen, is kept as its steps (settings.ts) and laid over the budget: the money it
// takes from a week or a month's extras is held there as a purchase of the wish, and what it takes from savings shows
// in the month's flow. Pure functions.

import { addDays, shiftMonth, type MonthString } from './dates.ts';
import { monthOfWeek, summarizeExtras, weekOf, weeksOfMonth, type Budget, type Purchase, type Wish } from './week.ts';
import type { DateString } from './zenmoney/types.ts';

/** A wish with the day it is needed by. */
export interface WishGoal {
  id: number;
  title: string;
  amount: number;
  due: DateString;
}

export type WayKind = 'extra' | 'flexible' | 'weeks' | 'savings' | 'later';

/** A way to put money towards a wish. */
export interface Way {
  /** `extra-<month>`, `flexible`, `weeks`, `savings` or `later-<month>`. */
  id: string;
  kind: WayKind;
  /** The month whose extras or savings it takes; for the weeks and flexible purchases, the month it is bought in. */
  month: MonthString;
  /** The most it gives; for the weeks, the most a week gives. */
  most: number;
}

/** A way picked with what it gives (a week's cut, for the weeks), or null for what the ways given by hand leave. */
export interface WayPick {
  id: string;
  amount: number | null;
}

/** What a picked way gives in a plan. */
export interface Part {
  way: Way;
  /** The whole of it, every week's cut together for the weeks. */
  given: number;
  /** What it gives as picked: a week's cut for the weeks. */
  each: number;
  /** Given by hand, not what the others leave. */
  fixed: boolean;
  /** The most it can be given by hand, with what the other ways given by hand take. */
  top: number;
}

/** What a plan does, with the way each step comes from. */
export type Step =
  /** Money held for the wish in a week: from the week's own money, or from its month's extras. */
  | { way: string; kind: 'week' | 'extra'; week: DateString; amount: number }
  /** The month puts less into savings. */
  | { way: string; kind: 'savings'; month: MonthString; amount: number }
  /** A flexible purchase moved past the day, which leaves its room in the extras. */
  | { way: string; kind: 'move'; purchase: number; from: DateString; to: DateString; amount: number };

export interface Plan {
  /** The week it is bought in. */
  buyWeek: DateString;
  steps: Step[];
  /** What the plan does not cover. */
  short: number;
}

export interface PlanContext {
  /** The budget with the plans of the other wishes laid over it, and this one's moves undone. */
  budget: Budget;
  today: DateString;
  /** What a month puts into savings by the plan of the month, after the other wishes. */
  savings: (month: MonthString) => number;
}

/** How far ahead waiting looks for a month with room in its extras. */
const MONTHS_AHEAD = 12;

const roundUp = (amount: number) => Math.ceil(amount / 100) * 100;

export const covered = (steps: readonly Step[]) => steps.reduce((sum, s) => sum + (s.kind === 'move' ? 0 : s.amount), 0);

/** The month a step's money is of. */
export function stepMonth(step: Exclude<Step, { kind: 'move' }>): MonthString {
  return step.kind === 'savings' ? step.month : monthOfWeek(step.week);
}

function weeksFrom(from: DateString, to: DateString): DateString[] {
  const weeks: DateString[] = [];
  for (let w = from; w <= to; w = addDays(w, 7)) weeks.push(w);
  return weeks;
}

function extrasFree(budget: Budget, month: MonthString): number {
  return Math.max(0, summarizeExtras(budget, month).free);
}

/** Flexible purchases from the extras still to buy in the weeks from `from` to `to`, the largest first. */
function flexibleExtras(budget: Budget, from: DateString, to: DateString): Purchase[] {
  return budget.purchases
    .filter((p) => p.kind === 'flexible' && !p.done && p.wish === undefined && p.envelope === 'extra' && p.week >= from && p.week <= to)
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Where it all stands for a wish: the current week, the week it is bought in by its day, the weeks after this one up
 * to it, which can be cut, and the months of the weeks from this one to it.
 */
export function wishFrame(goal: Pick<WishGoal, 'due'>, { budget, today }: Pick<PlanContext, 'budget' | 'today'>) {
  const current = weekOf(today, budget.weekStart);
  const due = weekOf(goal.due, budget.weekStart);
  const buyWeek = due < current ? current : due;
  const weeks = weeksFrom(addDays(current, 7), buyWeek);
  const months = [...new Set(weeksFrom(current, buyWeek).map(monthOfWeek))];
  return { current, buyWeek, weeks, months };
}

/** The first month after `month` with room in its extras. */
function laterMonth(budget: Budget, month: MonthString): MonthString | null {
  for (let i = 1; i <= MONTHS_AHEAD; i++) {
    const next = shiftMonth(month, i);
    if (extrasFree(budget, next) > 0.5) return next;
  }
  return null;
}

/**
 * The ways to put money towards the wish, in this order: the extras of the months up to the day, flexible purchases
 * moved past it, a cut of the weeks, the savings of the month it is bought in, and waiting for the extras of the first
 * month after it with room. A way with nothing to give is left out.
 */
export function waysOf(goal: WishGoal, context: PlanContext): Way[] {
  const { budget } = context;
  const { current, buyWeek, weeks, months } = wishFrame(goal, context);
  const buying = monthOfWeek(buyWeek);
  const ways: Way[] = months.map((month): Way => ({ id: `extra-${month}`, kind: 'extra', month, most: extrasFree(budget, month) }));
  ways.push({ id: 'flexible', kind: 'flexible', month: buying, most: flexibleExtras(budget, current, buyWeek).reduce((sum, p) => sum + p.amount, 0) });
  if (weeks.length > 0) ways.push({ id: 'weeks', kind: 'weeks', month: buying, most: roundUp(goal.amount / weeks.length) });
  ways.push({ id: 'savings', kind: 'savings', month: buying, most: Math.max(0, context.savings(buying)) });
  const later = laterMonth(budget, buying);
  if (later) ways.push({ id: `later-${later}`, kind: 'later', month: later, most: extrasFree(budget, later) });
  return ways.filter((way) => way.most > 0.5);
}

/**
 * The plan of the ways picked, on top of `kept`, the steps of a plan chosen before that have begun already. The ways
 * given by hand go first, each no more than what is left; the others then take what they leave, the one picked last
 * first, so a way just picked takes over from those picked before it. Money set aside in a month before the one it is
 * bought in is held in the month's first week, or this one. Waiting moves the buying to the first week of its month;
 * the weeks are cut up to the day either way.
 */
export function combinedPlan(goal: WishGoal, context: PlanContext, picks: readonly WayPick[], kept: readonly Step[] = []): { plan: Plan; parts: Part[] } {
  const { budget } = context;
  const { current, buyWeek, weeks } = wishFrame(goal, context);
  const ways = new Map(waysOf(goal, context).map((way) => [way.id, way]));
  const seen = new Set<string>();
  const picked = picks.flatMap((pick) => {
    const way = ways.get(pick.id);
    if (!way || seen.has(pick.id)) return [];
    seen.add(pick.id);
    return [{ way, amount: pick.amount === null ? null : Math.max(0, pick.amount) }];
  });
  const goalLeft = Math.max(0, goal.amount - covered(kept));
  let left = goalLeft;
  const given = new Map<string, Part>();
  for (const { way, amount } of [...picked.filter((p) => p.amount !== null), ...picked.filter((p) => p.amount === null).reverse()]) {
    if (way.kind === 'weeks') {
      const cap = roundUp(Math.max(0, left) / weeks.length);
      const each = Math.min(way.most, cap, amount ?? cap);
      given.set(way.id, { way, given: each * weeks.length, each, fixed: amount !== null, top: 0 });
      left -= each * weeks.length;
    } else {
      const take = Math.round(Math.max(0, Math.min(way.most, left, amount ?? left)));
      given.set(way.id, { way, given: take, each: take, fixed: amount !== null, top: 0 });
      left -= take;
    }
  }
  const parts = picked.map(({ way }) => given.get(way.id)!);
  for (const part of parts) {
    const others = parts.reduce((sum, p) => sum + (p !== part && p.fixed ? p.given : 0), 0);
    const room = Math.max(0, goalLeft - others);
    part.top = part.way.kind === 'weeks' ? Math.min(part.way.most, roundUp(room / weeks.length)) : Math.min(part.way.most, room);
  }

  let buying = buyWeek;
  for (const { way, given: amount } of parts) {
    if (way.kind !== 'later' || amount <= 0) continue;
    const first = weeksOfMonth(way.month, budget.weekStart)[0] ?? buyWeek;
    if (first > buying) buying = first;
  }
  /** Where a month's extras are held: the week it is bought in, or the month's first week still to come. */
  const holdIn = (month: MonthString) => {
    if (month === monthOfWeek(buying)) return buying;
    const first = weeksOfMonth(month, budget.weekStart)[0] ?? current;
    return first < current ? current : first;
  };
  const steps: Step[] = [...kept];
  for (const { way, given: amount, each } of parts) {
    if (amount <= 0) continue;
    if (way.kind === 'extra' || way.kind === 'later') steps.push({ way: way.id, kind: 'extra', week: holdIn(way.month), amount });
    if (way.kind === 'savings') steps.push({ way: way.id, kind: 'savings', month: way.month, amount });
    if (way.kind === 'weeks') steps.push(...weeks.map((week): Step => ({ way: way.id, kind: 'week', week, amount: each })));
    if (way.kind === 'flexible') {
      const to = weeksOfMonth(monthOfWeek(addDays(buyWeek, 7 * 5)), budget.weekStart)[0] ?? addDays(buyWeek, 7);
      const room = new Map<MonthString, number>();
      let rest = amount;
      for (const purchase of flexibleExtras(budget, current, buyWeek)) {
        if (rest <= 0) break;
        steps.push({ way: way.id, kind: 'move', purchase: purchase.id, from: purchase.week, to, amount: purchase.amount });
        const month = monthOfWeek(purchase.week);
        const take = Math.min(rest, purchase.amount);
        room.set(month, (room.get(month) ?? 0) + take);
        rest -= take;
      }
      for (const [month, take] of room) steps.push({ way: way.id, kind: 'extra', week: holdIn(month), amount: take });
    }
  }
  return { plan: { buyWeek: buying, steps, short: Math.max(0, Math.round(left)) }, parts };
}

/**
 * The steps of a plan that have begun by `today`, which a new plan keeps: what the weeks up to this one held, and what
 * the months before this one held or took from savings.
 */
export function begunSteps(steps: readonly Step[], today: DateString, weekStart: number): Step[] {
  const current = weekOf(today, weekStart);
  const thisMonth = monthOfWeek(current);
  return steps.filter((s) => (s.kind === 'week' ? s.week <= current : s.kind === 'move' ? false : stepMonth(s) < thisMonth));
}

/** Picks as the app sends them: `<way>:<amount>` in the order picked, the amount left out for what the others leave. */
export function parsePicks(text: string | null): WayPick[] {
  if (!text) return [];
  return text.split(',').flatMap((item) => {
    const [id, amount] = item.split(':');
    if (!id || !/^[\w-]+$/.test(id)) return [];
    const value = amount === undefined || amount === '' ? null : Number(amount);
    return [{ id, amount: value === null || !Number.isFinite(value) ? null : value }];
  });
}

export function picksText(parts: ReadonlyArray<Pick<Part, 'way' | 'fixed' | 'each'>>): string {
  return parts.map((p) => `${p.way.id}:${p.fixed ? p.each : ''}`).join(',');
}

/** A chosen plan as it is kept: the ways picked, the week it is bought in, and its steps. */
export interface ChosenPlan {
  ways: string;
  buyWeek: DateString;
  steps: Step[];
}

/**
 * The money chosen plans hold as purchases of their wishes: one a week and envelope each, titled by the wish, with
 * · отложить when it is set aside before the month the wish is bought in. Their ids are below zero, as no purchase of
 * settings.db has. A wish already bought keeps them, since the expense that bought it counts nowhere else.
 */
export function wishPurchases(plans: ReadonlyArray<{ wish: Pick<Wish, 'id' | 'title'>; plan: ChosenPlan }>): Purchase[] {
  const purchases: Purchase[] = [];
  for (const { wish, plan } of plans) {
    const held = new Map<string, Purchase>();
    for (const step of plan.steps) {
      if (step.kind !== 'week' && step.kind !== 'extra') continue;
      const envelope = step.kind;
      const key = `${step.week}/${envelope}`;
      const before = held.get(key);
      if (before) {
        before.amount += step.amount;
        continue;
      }
      const buying = monthOfWeek(step.week) === monthOfWeek(plan.buyWeek);
      held.set(key, {
        id: -(wish.id * 1000 + held.size + 1),
        title: buying ? wish.title : `${wish.title} · отложить`,
        amount: step.amount,
        week: step.week,
        envelope,
        kind: 'required',
        done: false,
        wish: wish.id,
      });
    }
    purchases.push(...held.values());
  }
  return purchases;
}

/** What chosen plans take from a month's savings. */
export function savingsTaken(plans: ReadonlyArray<{ plan: ChosenPlan }>, month: MonthString): number {
  return plans.reduce((total, { plan }) => total + plan.steps.reduce((sum, s) => sum + (s.kind === 'savings' && s.month === month ? s.amount : 0), 0), 0);
}

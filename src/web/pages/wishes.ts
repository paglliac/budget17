// A wish's plan: the ways to afford the wish by its day (wish-plans.ts) as the app's cards say them, and the forms that
// set the day and choose the plan; what a chosen plan does in a line is wishLine in dashboard.ts. Forms post to
// /wishes/:id/due, /wishes/:id/ways and /wishes/:id/ways/delete (see submitWishPlan).

import { addDays, monthName, type MonthString } from '../../dates.ts';
import { monthlyIncome, type Income } from '../../income.ts';
import { paymentDate } from '../../regular.ts';
import type { Settings } from '../../settings.ts';
import { MONTH_LIMIT, monthOfWeek, weekLimit, weekOf, weeksOfMonth, type Purchase, type Wish } from '../../week.ts';
import {
  begunSteps,
  combinedPlan,
  covered,
  parsePicks,
  picksText,
  savingsTaken,
  waysOf,
  wishFrame,
  type Part,
  type PlanContext,
  type Step,
  type WayKind,
  type WishGoal,
} from '../../wish-plans.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { dayMonth, money, num, plural } from '../format.ts';
import type { Tone } from '../tones.ts';
import { budgetOf, type SavedBudget } from './dashboard.ts';

/** How far ahead a wish without a day is planned, until the user picks one. */
const DEFAULT_DAYS = 30;
/** What a slider of a way moves by. */
export const WAY_STEP = 1000;

/** The wish with its day, or the day it is planned for without one. */
export function wishGoal(wish: Wish, today: DateString): WishGoal {
  return { id: wish.id, title: wish.title, amount: wish.amount, due: wish.due ?? addDays(today, DEFAULT_DAYS) };
}

/** Whether an expense bought the wish. */
export function isBought(saved: Pick<SavedBudget, 'wishPayments'>, wishId: number): boolean {
  return [...(saved.wishPayments?.values() ?? [])].includes(wishId);
}

/**
 * The budget as a wish's plan sees it: the plans of the other wishes laid over it, the purchases its own plan moved
 * back where they were, and what each month puts into savings by the plan of the month.
 */
export function planContext(data: EntityCollections, saved: SavedBudget, incomes: readonly Income[], today: DateString, wishId: number): PlanContext {
  const own = saved.wishPlans?.get(wishId);
  const moved = new Map((own?.steps ?? []).flatMap((s) => (s.kind === 'move' ? [[s.purchase, s] as const] : [])));
  const purchases = saved.purchases.map((p) => {
    const move = moved.get(p.id);
    return move && p.week === move.to ? { ...p, week: move.from } : p;
  });
  const others = new Map([...(saved.wishPlans ?? [])].filter(([id]) => id !== wishId));
  const current = weekOf(today, saved.weekStart);
  const budget = budgetOf(data, { ...saved, purchases, wishPlans: others }, { today, from: addDays(current, -7) });
  const income = monthlyIncome([...incomes]);
  const plans = [...others.values()].map((plan) => ({ plan }));
  const savings = (month: MonthString) => {
    const regular = saved.regular.filter((e) => paymentDate(e, month) !== null).reduce((sum, e) => sum + e.amount, 0);
    const weeks = weeksOfMonth(month, saved.weekStart).reduce((sum, w) => sum + weekLimit(saved, w), 0);
    return income - regular - weeks - MONTH_LIMIT - savingsTaken(plans, month);
  };
  return { budget, today, savings };
}

/** A wish's plan as its screen shows it. */
export interface WishPlanView {
  goal: WishGoal;
  context: PlanContext;
  /** The ways picked, what each gives and how far it can go, as the cards show them. */
  parts: Part[];
  /** The picks as the app sends them back. */
  picks: string;
  /** The chosen plan, or the one the picks make. */
  plan: { buyWeek: DateString; steps: Step[]; short: number };
  /** The plan shown is the chosen one. */
  chosen: boolean;
  /** A plan is chosen for the wish. */
  planned: boolean;
  bought: boolean;
}

/**
 * The plan of a wish: the chosen one, unless `ways` picks others, or the one `ways` makes. A new plan keeps what the
 * chosen one set aside already (begunSteps). Null when there is no such wish.
 */
export function wishPlan(data: EntityCollections, saved: SavedBudget, options: { today: DateString; id: number; ways: string | null; incomes: readonly Income[] }): WishPlanView | null {
  const { today } = options;
  const wish = saved.wishes.find((w) => w.id === options.id);
  if (!wish) return null;
  const goal = wishGoal(wish, today);
  const context = planContext(data, saved, options.incomes, today, wish.id);
  const stored = saved.wishPlans?.get(wish.id);
  const kept = stored ? begunSteps(stored.steps, today, saved.weekStart) : [];
  const live = combinedPlan(goal, context, parsePicks(options.ways ?? stored?.ways ?? null), kept);
  const picks = picksText(live.parts);
  const chosen = stored !== undefined && (options.ways === null || picks === stored.ways);
  const plan = chosen ? { buyWeek: stored.buyWeek, steps: stored.steps, short: Math.max(0, Math.round(goal.amount - covered(stored.steps))) } : live.plan;
  return { goal, context, parts: live.parts, picks, plan, chosen, planned: stored !== undefined, bought: isBought(saved, wish.id) };
}

const monthIn = (m: MonthString) => monthName(m, 'prepositional');
const monthOf = (m: MonthString) => monthName(m, 'genitive');
const weeksWord = (n: number) => `${n} ${plural(n, ['неделя', 'недели', 'недель'])}`;

const WAY_ICONS: Record<WayKind, string> = { extra: 'bag', flexible: 'arrows', weeks: 'calendar', savings: 'piggy', later: 'hourglass' };
const WAY_TONES: Record<WayKind, Tone> = { extra: 'violet', flexible: 'teal', weeks: 'yellow', savings: 'green', later: 'blue' };

/**
 * The ways as the app's cards: what each can give, and, picked, what it gives, how far its slider goes, and whether it
 * takes what the others leave. `purchases` name the purchases the plan moves.
 */
export function wayCards(view: WishPlanView, purchases: readonly Purchase[], s: string) {
  const { goal, context, parts, plan } = view;
  const { budget } = context;
  const { buyWeek, weeks } = wishFrame(goal, context);
  const usual = weeks[0] ? weekLimit(budget, weeks[0]) : 0;
  return waysOf(goal, context).map((way) => {
    const part = parts.find((p) => p.way.id === way.id);
    let title = '';
    let line = '';
    switch (way.kind) {
      case 'extra':
        title = way.month === monthOfWeek(buyWeek) ? `Дополнительные ${monthOf(way.month)}` : `Отложить в ${monthIn(way.month)}`;
        line = part ? `останется ${money(way.most - part.given, s)}` : `свободно ${money(way.most, s)}`;
        break;
      case 'flexible': {
        const moves = plan.steps.flatMap((x) => (x.kind === 'move' && x.way === way.id ? [x] : []));
        const titles = moves.map((m) => purchases.find((p) => p.id === m.purchase)?.title).filter(Boolean);
        title = 'Подвинуть гибкие';
        line = part && moves.length > 0 ? `перенести на ${monthName(monthOfWeek(moves[0]!.to))}: ${titles.join(', ')}` : `гибкие покупки до срока на ${money(way.most, s)}`;
        break;
      }
      case 'weeks':
        title = 'Ужать недели';
        line = part && part.each > 0
          ? `${num(usual - part.each)} вместо ${num(usual)} · ${weeksWord(weeks.length)}, всего ${money(part.given, s)}`
          : `до ${money(way.most, s)} с недели · ${weeksWord(weeks.length)}`;
        break;
      case 'savings':
        title = 'Из накоплений';
        line = part ? `останется ${money(way.most - part.given, s)}` : `в накоплениях ${monthOf(way.month)} ${money(way.most, s)}`;
        break;
      case 'later': {
        const first = weeksOfMonth(way.month, budget.weekStart)[0] ?? buyWeek;
        title = 'Подождать';
        line = part ? `купить с ${dayMonth(first)} · позже срока` : `с ${dayMonth(first)} · свободно в ${monthIn(way.month)} ${money(way.most, s)}`;
        break;
      }
    }
    return {
      id: way.id,
      title,
      icon: WAY_ICONS[way.kind],
      color: WAY_TONES[way.kind],
      on: part !== undefined,
      fixed: part?.fixed ?? false,
      amount: part?.each ?? 0,
      given: part?.given ?? 0,
      most: part?.top ?? way.most,
      step: WAY_STEP,
      unit: way.kind === 'weeks' ? 'с недели' : null,
      line,
      late: way.kind === 'later',
    };
  });
}

/**
 * Posts of a wish's plan: /wishes/:id/due sets the day it is needed by (`due`, a day after today); /wishes/:id/ways
 * chooses the plan the ways picked make (`ways`, as parsePicks reads them), keeping what the chosen one set aside
 * already; /wishes/:id/ways/delete forgets the plan. Null when the path is none of them.
 */
export function submitWishPlan(
  settings: Settings,
  data: EntityCollections,
  saved: SavedBudget,
  path: string,
  body: URLSearchParams,
  options: { today: DateString; incomes: readonly Income[] },
): 'saved' | 'missing' | null {
  const match = /^\/wishes\/(\d+)\/(due|ways|ways\/delete)$/.exec(path);
  if (!match) return null;
  const id = Number(match[1]);
  const wish = saved.wishes.find((w) => w.id === id);
  if (!wish) return 'missing';
  const { today } = options;
  if (match[2] === 'due') {
    const due = body.get('due') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due <= today) return 'missing';
    settings.setWishDue(id, due);
    return 'saved';
  }
  if (match[2] === 'ways/delete') {
    settings.dropWishPlan(id);
    return 'saved';
  }
  const view = wishPlan(data, saved, { today, id, ways: body.get('ways') ?? '', incomes: options.incomes });
  if (!view || view.parts.length === 0) return 'missing';
  settings.chooseWishPlan(id, { ways: view.picks, buyWeek: view.plan.buyWeek, steps: view.plan.steps });
  return 'saved';
}

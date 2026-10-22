// A wish's plan: the ways to afford the wish by its day (wish-plans.ts) as the app's cards say them, what it gathers
// with the money expenses set aside for the wish, and the forms that set the day and choose the plan; what a chosen
// plan does in a line is wishLine in dashboard.ts. Forms post to
// /wishes/:id/due, /wishes/:id/ways and /wishes/:id/ways/delete (see submitWishPlan).

import { addDays, monthName, type MonthString } from '../../dates.ts';
import { monthlyIncome, type Income } from '../../income.ts';
import type { Operation } from '../../ledger.ts';
import { paymentDate } from '../../regular.ts';
import type { Settings } from '../../settings.ts';
import { MONTH_LIMIT, monthOfWeek, weekLimit, weekOf, weeksOfMonth, type Purchase, type Wish } from '../../week.ts';
import {
  cardsTaken,
  combinedPlan,
  gathering,
  heldByWay,
  isRepaid,
  keptSteps,
  parsePicks,
  picksText,
  SAVED_WAY,
  savingsTaken,
  waysOf,
  wishFrame,
  type Gathering,
  type Part,
  type PlanContext,
  type Step,
  type WayKind,
  type WishGoal,
} from '../../wish-plans.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { cardPlan, cardScenarios, cardWays, type CardProjection, type CardScenario } from '../../card-plans.ts';
import { dayMonth, money, num, plural } from '../format.ts';
import type { Tone } from '../tones.ts';
import { budgetOf, type SavedBudget } from './dashboard.ts';
import { allExpenses } from './marking.ts';

/** How far ahead a wish without a day is planned, until the user picks one. */
const DEFAULT_DAYS = 30;
/** What a slider of a way moves by. */
export const WAY_STEP = 1000;

/** The wish with its day, or the day it is planned for without one. */
export function wishGoal(wish: Wish, today: DateString): WishGoal {
  return { id: wish.id, title: wish.title, amount: wish.amount, due: wish.due ?? addDays(today, DEFAULT_DAYS), kind: wish.kind };
}

/** Whether an expense bought the wish. */
export function isBought(saved: Pick<SavedBudget, 'wishPayments'>, wishId: number): boolean {
  return [...(saved.wishPayments?.values() ?? [])].includes(wishId);
}


/**
 * The credit cards other than `except`, each with its plan and its repayments from savings, those that count outside
 * the budget; `expenses` are all of them, as allExpenses lists them.
 */
export function cardsOf(saved: SavedBudget, expenses: readonly Operation[], except?: number) {
  return saved.wishes
    .filter((w) => w.kind === 'card' && w.id !== except)
    .map((w) => ({ plan: saved.wishPlans?.get(w.id) ?? null, repaid: expenses.filter((o) => o.saving?.id === w.id && saved.marks?.get(o.id) === 'outside') }));
}

/**
 * The budget as a wish's plan sees it: the plans of the other wishes laid over it, the purchases its own plan moved
 * back where they were, and what each month puts into savings by the plan of the month, after what the other wishes'
 * plans and the other cards take from it (cardsTaken). `expenses` are all of them, as allExpenses lists them.
 */
export function planContext(data: EntityCollections, saved: SavedBudget, incomes: readonly Income[], today: DateString, wishId: number, expenses: readonly Operation[]): PlanContext {
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
  const cardIds = new Set(saved.wishes.filter((w) => w.kind === 'card').map((w) => w.id));
  const plans = [...others].filter(([id]) => !cardIds.has(id)).map(([, plan]) => ({ plan }));
  const cards = cardsOf(saved, expenses, wishId);
  const savings = (month: MonthString) => {
    const regular = saved.regular.filter((e) => paymentDate(e, month) !== null).reduce((sum, e) => sum + e.amount, 0);
    const weeks = weeksOfMonth(month, saved.weekStart).reduce((sum, w) => sum + weekLimit(saved, w), 0);
    return income - regular - weeks - MONTH_LIMIT - savingsTaken(plans, month) - cardsTaken(cards, month);
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
  /** The plan the picks make, starting from what is set aside, which choosing them keeps, even when they are the chosen ones. */
  fresh: { buyWeek: DateString; steps: Step[] };
  /** What the plan shown gathers by today, with what is set aside for the wish. */
  gathered: Gathering;
  /**
   * What choosing the chosen plan's ways again would do, as it starts from what is set aside: gather what it lacks now
   * (`add`), or hold less where it holds more than the wish needs; null when it would change nothing.
   */
  relay: { add: boolean; amount: number } | null;
  /** The plan shown is the chosen one. */
  chosen: boolean;
  /** A plan is chosen for the wish. */
  planned: boolean;
  /** An expense bought the wish, or a card's repayments cover its debt. */
  bought: boolean;
  /** A card's: month by month how its plan repays it, when that closes it and the interest it pays. */
  projection?: CardProjection;
  /** A card's plans to pick in one tap. */
  scenarios?: CardScenario[];
}

/** Expenses that set money aside for a wish, newest first; `expenses` are all of them, as allExpenses lists them. */
function savingsOf(expenses: readonly Operation[], wishId: number): Operation[] {
  return expenses.filter((o) => o.saving?.id === wishId);
}

/**
 * The plan of a wish: the chosen one, unless `ways` picks others, or the one `ways` makes. A new plan starts from what
 * the chosen one set aside already and what was set aside for the wish without a plan (keptSteps). `expenses` are all
 * of them, as allExpenses lists them, when the caller has them. Null when there is no such wish.
 */
export function wishPlan(
  data: EntityCollections,
  saved: SavedBudget,
  options: { today: DateString; id: number; ways: string | null; incomes: readonly Income[]; expenses?: readonly Operation[] },
): WishPlanView | null {
  const { today } = options;
  const wish = saved.wishes.find((w) => w.id === options.id);
  if (!wish) return null;
  const goal = wishGoal(wish, today);
  const expenses = options.expenses ?? allExpenses(data, saved);
  const context = planContext(data, saved, options.incomes, today, wish.id, expenses);
  const stored = saved.wishPlans?.get(wish.id);
  const savings = savingsOf(expenses, wish.id);
  const on = { today, weekStart: saved.weekStart };
  const was = gathering(wish, stored ?? null, savings, on);
  if (wish.kind === 'card') {
    // A card's plan is always as the ways picked make it from today, so it tells when the card closes as of now.
    const kept = keptSteps(was, stored?.steps ?? [], today, saved.weekStart, 'card');
    const rate = wish.rate ?? null;
    const live = cardPlan(goal, rate, context, parsePicks(options.ways ?? stored?.ways ?? null), kept);
    const picks = picksText(live.parts);
    const chosen = stored !== undefined && (options.ways === null || picks === stored.ways);
    return {
      goal,
      context,
      parts: live.parts,
      picks,
      plan: chosen ? { buyWeek: stored.buyWeek, steps: stored.steps, short: live.plan.short } : live.plan,
      fresh: live.plan,
      gathered: chosen ? was : gathering(wish, live.plan, savings, on),
      relay: null,
      chosen,
      planned: stored !== undefined,
      bought: isRepaid(wish, was.saved),
      projection: live.projection,
      scenarios: cardScenarios(goal, rate, context, kept),
    };
  }
  const live = combinedPlan(goal, context, parsePicks(options.ways ?? stored?.ways ?? null), keptSteps(was, stored?.steps ?? [], today, saved.weekStart, wish.kind));
  const picks = picksText(live.parts);
  const chosen = stored !== undefined && (options.ways === null || picks === stored.ways);
  const relaid = gathering(wish, live.plan, savings, on);
  const gathered = chosen ? was : relaid;
  const plan = chosen ? { buyWeek: stored.buyWeek, steps: stored.steps, short: was.short } : { ...live.plan, short: relaid.short };
  const parts = chosen ? chosenParts(live.parts, was, stored.steps, wishFrame(goal, context).current) : live.parts;
  return {
    goal,
    context,
    parts,
    picks,
    plan,
    fresh: live.plan,
    gathered,
    relay: chosen ? relayOf(was, relaid, goal.amount) : null,
    chosen,
    planned: stored !== undefined,
    bought: isBought(saved, wish.id),
  };
}

/**
 * The ways of the chosen plan as it was chosen, not as choosing them again would make them: what each still gives
 * (heldByWay), and for the weeks what a week after this one gives. How far each can go is as the ways picked again.
 */
function chosenParts(parts: readonly Part[], gathered: Gathering, steps: readonly Step[], current: DateString): Part[] {
  const byWay = heldByWay(gathered, steps, current);
  const ahead = steps.find((s) => s.kind === 'week' && s.way === 'weeks' && s.week > current);
  return parts.map((part) => {
    const given = Math.round(byWay.get(part.way.id) ?? 0);
    return { ...part, given, each: part.way.kind === 'weeks' ? (ahead?.amount ?? 0) : given };
  });
}

/** What choosing the ways again gathers instead of `was`: what it adds of what is short, or frees beyond the wish. */
function relayOf(was: Gathering, relaid: Gathering, amount: number): WishPlanView['relay'] {
  if (relaid.short < was.short - 0.5) return { add: true, amount: was.short - relaid.short };
  const over = was.covered - Math.max(relaid.covered, amount);
  return over > 0.5 ? { add: false, amount: Math.round(over) } : null;
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
  const card = goal.kind === 'card';
  const usual = weeks[0] ? weekLimit(budget, weeks[0]) : 0;
  if (card) return cardWayCards(view, s);
  const kept = plan.steps.filter((x) => x.way === SAVED_WAY);
  return waysOf(goal, context, kept).map((way) => {
    const part = parts.find((p) => p.way.id === way.id);
    let title = '';
    let line = '';
    switch (way.kind) {
      case 'extra':
        title = card || way.month === monthOfWeek(buyWeek) ? `Дополнительные ${monthOf(way.month)}` : `Отложить в ${monthIn(way.month)}`;
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
        title = card ? `Накопления ${monthOf(way.month)}` : 'Из накоплений';
        line = part ? `останется ${money(way.most - part.given, s)}` : card ? `свободно ${money(way.most, s)}` : `в накоплениях ${monthOf(way.month)} ${money(way.most, s)}`;
        break;
      case 'later': {
        const first = weeksOfMonth(way.month, budget.weekStart)[0] ?? buyWeek;
        title = card ? 'Позже срока' : 'Подождать';
        line = part ? `${card ? 'погасить' : 'купить'} с ${dayMonth(first)} · ${card ? 'с процентами' : 'позже срока'}` : `с ${dayMonth(first)} · свободно в ${monthIn(way.month)} ${money(way.most, s)}`;
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
      rest: 'остальное',
    };
  });
}

/**
 * A card's ways as the app's cards: what each month leaves over and its extras, a month's worth each, all of it unless
 * a slider says how much («все»), and the cut of each week; picked, what it gives in all.
 */
function cardWayCards(view: WishPlanView, s: string) {
  const { context, parts } = view;
  const kept = view.fresh.steps.filter((x) => x.way === SAVED_WAY);
  const usual = weekLimit(context.budget, weekOf(context.today, context.budget.weekStart));
  return cardWays(context, kept).map((way) => {
    const part = parts.find((p) => p.way.id === way.id);
    const all = part !== undefined && !part.fixed;
    const total = part ? ` · всего ${money(part.given, s)}` : '';
    let title = '';
    let line = '';
    switch (way.id) {
      case 'savings':
        title = 'Из накоплений';
        line = part ? `${all ? 'всё, что остаётся' : `по ${money(part.each, s)}`}${total}` : `остаётся до ${money(way.most, s)} в месяц`;
        break;
      case 'extras':
        title = 'Дополнительные';
        line = part ? `${all ? 'всё свободное' : `по ${money(part.each, s)}`}${total}` : `до ${money(way.most, s)} в месяц`;
        break;
      default:
        title = 'Ужать недели';
        line = part ? `${num(usual - part.each)} вместо ${num(usual)}${total}` : `до ${money(way.most, s)} с недели`;
    }
    return {
      id: way.id,
      title,
      icon: way.id === 'savings' ? 'piggy' : way.id === 'extras' ? 'bag' : 'calendar',
      color: way.id === 'savings' ? 'green' : way.id === 'extras' ? 'violet' : 'yellow',
      on: part !== undefined,
      fixed: part?.fixed ?? false,
      amount: part?.each ?? 0,
      given: part?.given ?? 0,
      most: way.most,
      step: WAY_STEP,
      unit: way.id === 'weeks' ? 'с недели' : 'в месяц',
      line,
      late: false,
      rest: 'все',
    };
  });
}

/**
 * Posts of a wish's plan: /wishes/:id/due sets the day it is needed by (`due`, a day after today); /wishes/:id/ways
 * chooses the plan the ways picked make (`ways`, as parsePicks reads them), starting from what is set aside already,
 * so the chosen ways sent again gather what the plan lacks; /wishes/:id/ways/delete forgets the plan. Null when the
 * path is none of them.
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
  settings.chooseWishPlan(id, { ways: view.picks, buyWeek: view.fresh.buyWeek, steps: view.fresh.steps });
  return 'saved';
}

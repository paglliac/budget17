// The main page, the budget by weeks, after the user's picture of 2026-10-19, and the plan of a week. The week tab is
// one sheet: the week's spending by days under filters (?filter=pending and so on, see WEEK_FILTERS), and beside it
// the app's circle — what is free with the wave, what is reserved — and under it what was spent today with the sync,
// and the one thing to do next, as the app's main page has them (see home.ts). The month tab is a month's weeks and
// its extras. Both step back and forth, ?week=2026-10-19 and ?month=2026-11, up to a year ahead. /plan is the plan of a
// week, which «Зарезервировано» on the circle opens: what the week allows, which opens by ?edit=limit to give the week
// another amount than the usual one, its purchases and regular payments, and in the current week the wishes. Built
// from widgets only. Entries open by ?edit=purchase-1, wish-1, spending-<ZenMoney id>, or new-purchase and new-wish
// for the folded forms; an open expense is marked as on every page (see marking.ts). Forms post to /purchases, /wishes
// and /week-limits (see submitDashboard) and to /spending (see submitMarking), and the server sends the browser back
// to the page they came from. A wish's plan is chosen in the app (see wishes.ts); here a wish says what its plan does,
// and the money the plan holds shows among the purchases without a form.

import { summarizeBalances } from '../../balances.ts';
import type { KeptChange } from '../../changes.ts';
import { addDays, localDate, shiftMonth, type MonthString } from '../../dates.ts';
import { amountText, parseAmount, parseRate, parseTitle } from '../../input.ts';
import { listOperations, type Operation } from '../../ledger.ts';
import type { Settings } from '../../settings.ts';
import {
  adviceTarget,
  adviseWish,
  envelopeOf,
  MONTH_LIMIT,
  monthOfWeek,
  summarizeExtras,
  summarizeWeek,
  WEEK_LIMIT,
  weekOf,
  weeksOfMonth,
  type Advice,
  type Budget,
  type ExtrasSummary,
  type Purchase,
  type PurchaseKind,
  type PurchaseStatus,
  type WeekStart,
  type WeekSummary,
  type Wish,
  type WishKind,
} from '../../week.ts';
import { covered, gathering, isRepaid, SAVED_WAY, stepMonth, type ChosenPlan, type Gathering } from '../../wish-plans.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { capitalize, dayMonth, money, monthName, num, plural, weekLabel } from '../format.ts';
import { weekHome, type WeekHome } from '../home.ts';
import type { Html } from '../html.ts';
import { categoryIcon, entryIcon } from '../icons.ts';
import { categoryLook, withLogo } from '../looks.ts';
import { categoryColor, toneColor, type Tone } from '../tones.ts';
import { balanceTotal } from '../widgets/accounts.ts';
import { emptyState, field, filterChips, footnote, section, segmentedLinks, selectField, shareBar } from '../widgets/basics.ts';
import { circleFacts, weekCircle } from '../widgets/circle.ts';
import { entryForm, entryList, entryRow } from '../widgets/entries.ts';
import { dayGroup, operationRow } from '../widgets/operations.ts';
import { appShell, headActions, pageHead, stack } from '../widgets/shell.ts';
import { appRail, userName, type Href } from './chrome.ts';
import {
  allExpenses,
  ENVELOPE_MARK,
  envelopeMark,
  loadMarking,
  markingActions,
  markingTint,
  markingDetails,
  markingPanel,
  markingTitle,
  plannedPurchases,
  type Marking,
  type SavedMarking,
} from './marking.ts';

/** How many weeks ahead a week can be opened and planned. */
export const PLAN_AHEAD = 52;
/** Weeks a purchase can be put into from its form: this one and the next ones. */
const WEEK_CHOICES = 13;

/**
 * Which of a week's expenses the main page lists (?filter=): all of them, those not counted at all among them; those
 * waiting for a category, as «Без категории» has them; those counted in the week or the extras; those the user said
 * not to count; and the payments of regular expenses.
 */
export const WEEK_FILTERS = [
  { id: 'all', label: 'Все операции' },
  { id: 'pending', label: 'Ждут разбора' },
  { id: 'counted', label: 'Учтённые' },
  { id: 'ignored', label: 'Не расходы' },
  { id: 'regular', label: 'Регулярные' },
] as const;

export type WeekFilter = (typeof WEEK_FILTERS)[number]['id'];

/** What the user keeps in the app for the budget. */
export interface SavedBudget extends SavedMarking {
  wishes: Wish[];
  /** What the user allowed for a week instead of WEEK_LIMIT, by the week's first day. */
  weekLimits: ReadonlyMap<DateString, number>;
  /** Changes made in the app that moved a week's money, in the order they were made; none when not given. */
  changes?: readonly KeptChange[];
}

export type FormField = 'title' | 'amount';

/** A purchase, wish or week's amount form shown again with its errors after a submission failed. */
export interface DashboardForm {
  kind: 'purchase' | 'wish' | 'limit';
  /** null for a new one. */
  id: number | null;
  values: Record<FormField, string>;
  errors: Partial<Record<FormField, string>>;
  /** Which list a new purchase was added to. */
  envelope: 'week' | 'extra';
  /** A purchase's kind as sent. */
  purchaseKind?: PurchaseKind;
  /** A wish's kind as sent. */
  wishKind?: WishKind;
  /** A card's rate as typed, and what is wrong with it. */
  rate?: string;
  rateError?: string;
  /** The week the purchase or the amount was sent for, as sent. */
  week: string | null;
}

export interface DashboardData {
  today: DateString;
  /** The first day of the current week. */
  current: DateString;
  weekStart: WeekStart;
  view: 'week' | 'month' | 'plan';
  /** The week tab's week: the current one, an earlier one opened from the month, or a later one being planned. */
  week: WeekSummary;
  /** Expenses of the week the user said not to count at all, newest first. */
  ignored: Operation[];
  /** Which of the week's expenses the week tab lists. */
  filter: WeekFilter;
  /** The top of the week as the app's main page has it, exact; only when asked for (see loadDashboard). */
  home: WeekHome | null;
  /** The weeks of the month tab's month, the current one unless another is opened. */
  weeks: WeekSummary[];
  /** Extras of the month tab's month. */
  extras: ExtrasSummary;
  /** Wishes not bought yet, with when they fit, the plan chosen for them and what it gathers with what is set aside. */
  wishes: Array<{ wish: Wish; advice: Advice; plan: ChosenPlan | undefined; gathered: Gathering }>;
  /** Wishes an expense bought, by id. */
  boughtWishes: ReadonlySet<number>;
  /** The wishes that are the debts of credit cards. */
  cards: ReadonlySet<number>;
  /** For an expense opened to mark it. */
  marking: Marking;
  /** What is open for editing: purchase-1, wish-1 or spending-<ZenMoney id>. */
  edit: string | null;
  form: DashboardForm | null;
  symbol: string;
  userName: string | null;
  source: 'zenmoney' | 'demo';
  /** Whether the page can offer to sync with ZenMoney. */
  canSync: boolean;
}

/**
 * The figures' input: expenses from the earliest week that can be shown through the current one, and a month before
 * it, so that a regular payment made early is found as paid.
 */
export function budgetOf(data: EntityCollections, saved: SavedBudget, options: { today: DateString; from?: DateString }): Budget {
  const { weekStart, weekLimits } = saved;
  const current = weekOf(options.today, weekStart);
  const monthStart = weeksOfMonth(monthOfWeek(current), weekStart)[0] ?? current;
  const from = options.from && options.from < monthStart ? options.from : monthStart;
  const expenses = listOperations(data, { from: addDays(from, -31), to: addDays(current, 6) }, saved).filter((o) => o.kind === 'expense');
  return { expenses, purchases: plannedPurchases(saved, options.today), marks: saved.marks, regular: saved.regular, weekStart, weekLimits };
}

export function loadDashboard(
  data: EntityCollections,
  saved: SavedBudget,
  options: {
    today: DateString;
    view?: string | null;
    week?: string | null;
    month?: string | null;
    filter?: string | null;
    edit?: string | null;
    form?: DashboardForm;
    source: DashboardData['source'];
    canSync: boolean;
    /** Build the top of the week too, as the pages show it, with when the server last synced, as an ISO moment. */
    home?: { syncedAt: string | null };
  },
): DashboardData {
  const { today } = options;
  const current = weekOf(today, saved.weekStart);
  const week = parseWeek(options.week, current, saved.weekStart);
  const month = parseMonthOfWeeks(options.month, current);
  const weeks = weeksOfMonth(month, saved.weekStart);
  const monthStart = weeks[0] ?? current;
  const budget = budgetOf(data, saved, { today, from: week < monthStart ? week : monthStart });
  const bought = new Set(saved.wishPayments?.values() ?? []);
  const expenses = allExpenses(data, saved);
  const wishOf = (wish: Wish) => {
    const plan = saved.wishPlans?.get(wish.id);
    const savings = expenses.filter((o) => o.saving?.id === wish.id);
    return { wish, advice: adviseWish(budget, wish, today), plan, gathered: gathering(wish, plan ?? null, savings, { today, weekStart: saved.weekStart }) };
  };
  const d: DashboardData = {
    today,
    current,
    weekStart: saved.weekStart,
    view: options.view === 'month' || options.view === 'plan' ? options.view : 'week',
    week: summarizeWeek(budget, week),
    ignored: listOperations(data, { from: week, to: addDays(week, 6) }, saved, { withIgnored: true }).filter((o) => o.kind === 'expense' && o.ignored),
    filter: WEEK_FILTERS.find((f) => f.id === options.filter)?.id ?? 'all',
    home: null,
    weeks: weeks.map((w) => summarizeWeek(budget, w)),
    extras: summarizeExtras(budget, month),
    // A wish an expense bought is no longer wished for, nor a card repaid in full owed.
    wishes: saved.wishes.map(wishOf).filter(({ wish, gathered }) => (wish.kind === 'card' ? !isRepaid(wish, gathered.saved) : !bought.has(wish.id))),
    boughtWishes: bought,
    cards: new Set(saved.wishes.filter((w) => w.kind === 'card').map((w) => w.id)),
    marking: loadMarking(data, saved, expenses, today),
    edit: options.edit ?? null,
    form: options.form ?? null,
    symbol: summarizeBalances(data).mainInstrument.symbol,
    userName: userName(data),
    source: options.source,
    canSync: options.canSync,
  };
  // The pages are always exact; only the app rounds.
  return options.home ? { ...d, home: weekHome(d, d.week, data, { ...saved, roundFigures: false }, { today, syncedAt: options.home.syncedAt }) } : d;
}

/** A week's expenses that the filter lets through, newest first. */
export function weekList(d: Pick<DashboardData, 'week' | 'ignored' | 'marking'>, filter: WeekFilter): Operation[] {
  const { spending } = d.week;
  switch (filter) {
    case 'pending':
      return spending.filter((o) => o.category === null);
    case 'counted':
      return spending.filter((o) => ['week', 'extra'].includes(envelopeOf(d.marking, o)));
    case 'ignored':
      return d.ignored;
    case 'regular':
      return spending.filter((o) => o.regular !== null);
    case 'all':
      return [...spending, ...d.ignored].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  }
}

/** A week's first day from a query param, at most PLAN_AHEAD weeks after the current one; the current week otherwise. */
export function parseWeek(value: string | null | undefined, current: DateString, start: WeekStart): DateString {
  return value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    weekOf(value, start) === value &&
    value <= addDays(current, 7 * PLAN_AHEAD)
    ? value
    : current;
}

/** A month from a query param that has weeks no later than PLAN_AHEAD; the month of the current week otherwise. */
function parseMonthOfWeeks(value: string | null | undefined, current: DateString): MonthString {
  const last = monthOfWeek(addDays(current, 7 * PLAN_AHEAD));
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value <= last ? value : monthOfWeek(current);
}

// ---- Forms

export type DashboardSubmission = { status: 'saved' } | { status: 'missing' } | { status: 'invalid'; form: DashboardForm };

/**
 * Applies a form posted to /purchases (add), /purchases/:id (save), /purchases/:id/move (save and switch between
 * the week's money and extras), /purchases/:id/done (bought or not), /purchases/:id/delete, /wishes (add),
 * /wishes/:id (save), /wishes/:id/plan (into the advised week), /wishes/:id/delete, /week-limits/:week (what the
 * week allows; the usual amount means none of its own) or /week-limits/:week/delete (the usual amount back).
 * `budget` is needed only to plan a wish.
 */
export function submitDashboard(
  settings: Settings,
  path: string,
  body: URLSearchParams,
  context: { today: DateString; budget: () => Budget },
): DashboardSubmission {
  const purchase = /^\/purchases(?:\/(\d+)(?:\/(move|done|delete))?)?$/.exec(path);
  if (purchase) {
    const id = purchase[1] === undefined ? null : Number(purchase[1]);
    const action = purchase[2];
    const existing = id === null ? null : settings.purchases().find((p) => p.id === id);
    if (id !== null && !existing) return { status: 'missing' };
    if (existing && action === 'delete') {
      settings.deletePurchase(existing.id);
      return { status: 'saved' };
    }
    if (existing && action === 'done') {
      settings.updatePurchase(existing.id, { done: !existing.done });
      return { status: 'saved' };
    }
    const envelope = existing ? existing.envelope : body.get('envelope') === 'extra' ? 'extra' : 'week';
    // A form without the kind, such as an older app's, keeps the purchase's.
    const kind: PurchaseKind = body.has('kind') ? (body.get('kind') === 'required' ? 'required' : 'flexible') : (existing?.kind ?? 'flexible');
    const parsed = parseEntry(body);
    if ('errors' in parsed) return { status: 'invalid', form: { kind: 'purchase', id, ...parsed, envelope, purchaseKind: kind, week: body.get('week') } };
    const start = settings.weekStart();
    const current = weekOf(context.today, start);
    if (!existing) {
      const week = parseWeek(body.get('week'), current, start);
      settings.addPurchase({ ...parsed.entry, week, envelope, kind, done: false });
    } else {
      const moved = action === 'move' ? (existing.envelope === 'week' ? 'extra' : 'week') : existing.envelope;
      const week = body.has('week') ? parseWeek(body.get('week'), current, start) : existing.week;
      settings.updatePurchase(existing.id, { ...parsed.entry, envelope: moved, kind, week });
    }
    return { status: 'saved' };
  }

  const limit = /^\/week-limits\/(\d{4}-\d{2}-\d{2})(\/delete)?$/.exec(path);
  if (limit) {
    const [, week = '', remove] = limit;
    const start = settings.weekStart();
    if (parseWeek(week, weekOf(context.today, start), start) !== week) return { status: 'missing' };
    if (remove) {
      settings.setWeekLimit(week, null);
      return { status: 'saved' };
    }
    const text = body.get('amount') ?? '';
    const amount = parseAmount(text);
    if ('error' in amount) {
      return { status: 'invalid', form: { kind: 'limit', id: null, values: { title: '', amount: text }, errors: { amount: amount.error }, envelope: 'week', week } };
    }
    settings.setWeekLimit(week, amount.value === WEEK_LIMIT ? null : amount.value);
    return { status: 'saved' };
  }

  const wish = /^\/wishes(?:\/(\d+)(?:\/(plan|delete))?)?$/.exec(path);
  if (wish) {
    const id = wish[1] === undefined ? null : Number(wish[1]);
    const action = wish[2];
    const existing = id === null ? null : settings.wishes().find((w) => w.id === id);
    if (id !== null && !existing) return { status: 'missing' };
    if (existing && action === 'delete') {
      settings.deleteWish(existing.id);
      return { status: 'saved' };
    }
    if (existing && action === 'plan') {
      const target = adviceTarget(adviseWish(context.budget(), existing, context.today));
      if (target) settings.planWish(existing.id, target);
      return { status: 'saved' };
    }
    const parsed = parseEntry(body);
    // A form without the kind or the rate, such as an older app's, keeps the wish's.
    const kind: WishKind | undefined = body.has('kind') ? (body.get('kind') === 'card' ? 'card' : 'wish') : undefined;
    const rate = body.has('rate') ? parseRate(body.get('rate') ?? '') : undefined;
    const rateError = rate && 'error' in rate ? rate.error : undefined;
    if ('errors' in parsed || rateError) {
      const typed = 'errors' in parsed ? parsed : { values: { title: body.get('title') ?? '', amount: body.get('amount') ?? '' }, errors: {} };
      return { status: 'invalid', form: { kind: 'wish', id, ...typed, envelope: 'week', week: null, wishKind: kind, rate: body.get('rate') ?? '', rateError } };
    }
    const entry = { ...parsed.entry, kind, ...(rate && 'value' in rate ? { rate: rate.value } : {}) };
    if (existing) settings.updateWish(existing.id, entry);
    else settings.addWish(entry);
    return { status: 'saved' };
  }

  return { status: 'missing' };
}

function parseEntry(
  body: URLSearchParams,
): { entry: { title: string; amount: number } } | { values: DashboardForm['values']; errors: DashboardForm['errors'] } {
  const values = { title: body.get('title') ?? '', amount: body.get('amount') ?? '' };
  const title = parseTitle(values.title);
  const amount = parseAmount(values.amount);
  if ('value' in title && 'value' in amount) return { entry: { title: title.value, amount: amount.value } };
  const errors: DashboardForm['errors'] = {};
  if ('error' in title) errors.title = title.error;
  if ('error' in amount) errors.amount = amount.error;
  return { values, errors };
}

// ---- Page

export function renderDashboard(d: DashboardData, href: Href): Html {
  const { current } = d;
  const thisMonth = monthOfWeek(current);
  /** This page with the given params; an entry opens with `edit`. */
  const here = (params: Record<string, string | null> = {}) =>
    d.view === 'plan'
      ? href('/plan', { week: d.week.week !== current ? d.week.week : null, ...params })
      : href('/', {
          view: d.view === 'week' ? null : d.view,
          week: d.view === 'week' && d.week.week !== current ? d.week.week : null,
          month: d.view === 'month' && d.extras.month !== thisMonth ? d.extras.month : null,
          filter: d.view === 'week' && d.filter !== 'all' ? d.filter : null,
          ...params,
        });
  const page = { d, href, here, current };
  const { head, main, side } = d.view === 'month' ? monthView(page) : d.view === 'plan' ? planView(page) : weekView(page);

  const body = appShell({
    rail: appRail(d.view === 'plan' ? 'plan' : 'overview', d.userName, href),
    head,
    main,
    side: [
      headActions({ items: [{ icon: 'search', label: 'Найти операцию', href: href('/operations') }], user: d.userName }),
      ...side,
      ...(d.source === 'demo' ? [footnote({ text: 'Демо-данные. Чтобы увидеть свои, добавьте токен в .env и запустите make sync.' })] : []),
    ],
  });
  return pageDocument({ title: d.view === 'plan' ? 'План' : 'Главная', body });
}

interface Page {
  d: DashboardData;
  href: Href;
  here: (params?: Record<string, string | null>) => string;
  current: DateString;
}

interface View {
  head: Html;
  main: Array<Html | null>;
  side: Html[];
}

/**
 * A week on the main page: its spending by days under the filters, and beside it the circle with what was spent and
 * what to do next. A week ahead has no spending yet; its plan is on the plan's page, which the circle opens.
 */
function weekView(page: Page): View {
  const { d, href, here, current } = page;
  const w = d.week;
  const head = pageHead({
    title: `Неделя ${weekLabel(w.week)}`,
    ...weekArrows(page, (week) => href('/', { week: week === current ? null : week })),
    switcher: periodSwitch(page),
    text: [weekSentence(w, current, d.symbol), pendingSentence(w, d.symbol)].filter((line) => line !== null),
  });
  const side = d.home ? [weekCircle(circleOf(page, d.home)), circleFacts({ items: factsOf(page, d.home) })] : [];
  if (w.week > current) return { head, main: [emptyState({ text: 'Неделя ещё не началась, трат пока нет.' })], side };
  const list = weekList(d, d.filter);
  const pending = weekList(d, 'pending').length;
  return {
    head,
    main: [
      filterChips({
        label: 'Какие траты',
        items: WEEK_FILTERS.map((f) => ({
          label: f.label,
          href: here({ filter: f.id === 'all' ? null : f.id, edit: null }),
          active: f.id === d.filter,
          count: f.id === 'pending' ? pending : undefined,
        })),
      }),
      list.length === 0 ? emptyState({ text: w.spending.length === 0 && d.ignored.length === 0 ? 'Трат пока нет.' : 'Таких трат на этой неделе нет.' }) : spendingByDay(page, list),
    ],
    side,
  };
}

/** The plan of a week: what it allows, its purchases and regular payments, and in the current week the wishes. */
function planView(page: Page): View {
  const { d, href, current } = page;
  const w = d.week;
  return {
    head: pageHead({
      title: `План на ${weekLabel(w.week)}`,
      ...weekArrows(page, (week) => href('/plan', { week: week === current ? null : week })),
      text: [weekSentence(w, current, d.symbol)],
    }),
    main: [
      section({ title: 'Бюджет недели', body: limitList(page, w) }),
      section({ title: 'План', body: entryList({ label: 'План на неделю', items: [...planItems(page, w), foldedPurchaseForm(page, w.week)] }) }),
      w.week === current ? section({ title: 'Хочу купить', body: entryList({ label: 'Хочу купить', items: [...d.wishes.map((x) => wishItem(page, x)), foldedWishForm(page)] }) }) : null,
    ],
    side: d.home ? [weekCircle(circleOf(page, d.home))] : [],
  };
}

/** The arrows of a week's title: the week before, and the week after while it can be planned. */
function weekArrows({ d, current }: Page, link: (week: DateString) => string): Pick<Parameters<typeof pageHead>[0], 'prev' | 'next'> {
  const next = addDays(d.week.week, 7);
  return {
    prev: { label: 'Неделя раньше', href: link(addDays(d.week.week, -7)) },
    next: next <= addDays(current, 7 * PLAN_AHEAD) ? { label: 'Неделя позже', href: link(next) } : null,
  };
}

/** Неделя and Месяц: the current week, and the month of the week shown. */
function periodSwitch({ d, href, current }: Page): Html {
  const month = d.view === 'month' ? d.extras.month : monthOfWeek(d.week.week);
  return segmentedLinks({
    label: 'Период',
    items: [
      { label: 'Неделя', href: href('/'), active: d.view === 'week' },
      { label: 'Месяц', href: href('/', { view: 'month', month: month === monthOfWeek(current) ? null : month }), active: d.view === 'month' },
    ],
  });
}

/** The circle of a week, as the app draws it: what is free with the wave, and what is reserved, which opens the plan. */
function circleOf({ d, href, current }: Page, { free, reserved }: WeekHome): Parameters<typeof weekCircle>[0] {
  const w = d.week;
  const note = free.state === 'over' ? `сверх ${money(w.limit, d.symbol)}` : w.week === current ? 'до конца недели' : `из ${money(w.limit, d.symbol)}`;
  return {
    free: { ...free, note },
    reserved: {
      label: reserved.label,
      amount: reserved.amount,
      parts: [reserved.required, reserved.flexible],
      href: d.view === 'plan' ? undefined : href('/plan', { week: w.week === current ? null : w.week }),
    },
    symbol: d.symbol,
  };
}

/**
 * Under the circle: what was spent today (in a past week, in all of it), with the sync and when it last ran, and the
 * one thing to do next as the app's card has it: the expenses to sort, a wish short of money, or the extras.
 */
function factsOf({ d, href }: Page, home: WeekHome): Parameters<typeof circleFacts>[0]['items'] {
  const spent = home.spent
    ? [
        {
          above: home.spent.label,
          figure: money(home.spent.amount, d.symbol),
          action: d.canSync ? { label: home.syncedAt ? `Обновлено ${syncedText(home.syncedAt, d.today)}` : 'Обновить', icon: 'refresh' as const, action: '/sync' } : undefined,
        },
      ]
    : [];
  const task =
    home.task === 'sort'
      ? { figure: String(home.pending.count), below: home.pending.label, href: href('/uncategorized') }
      : home.task === 'short' && home.short
        ? { above: home.short.label, figure: money(home.short.amount, d.symbol), tone: 'red' as const, below: home.short.note, href: home.short.wish === null ? href('/plan') : `${href('/plan')}#wish-${home.short.wish}` }
        : {
            above: home.extras.label,
            figure: money(home.extras.amount, d.symbol),
            tone: home.extras.over ? ('red' as const) : undefined,
            below: home.extras.note,
            href: href('/', { view: 'month', month: home.extras.month }),
          };
  return [...spent, task];
}

/** 18:42 for a moment of today, 19 октября, 18:42 for an earlier one, in the server's time. */
function syncedText(iso: string, today: DateString): string {
  const moment = new Date(iso);
  const time = moment.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const day = localDate(moment);
  return day === today ? time : `${dayMonth(day)}, ${time}`;
}

/** How many of the week's expenses wait for a category and for how much; null when none does. */
function pendingSentence(w: WeekSummary, s: string): string | null {
  const pending = w.spending.filter((o) => o.category === null);
  if (pending.length === 0) return null;
  const amount = pending.reduce((sum, o) => sum + o.amount, 0);
  return sentence(`Ждут разбора ${pending.length} ${plural(pending.length, ['операция', 'операции', 'операций'])} на ${money(amount, s)}`);
}

/**
 * What the week allows, under what is left: the usual amount or the week's own. It opens to give the week another
 * amount, such as less when something happened and the week has to do with less, or the usual one back.
 */
function limitList(page: Page, w: WeekSummary): Html {
  const { d, href, here } = page;
  const own = w.limit !== WEEK_LIMIT;
  const color = toneColor(own ? 'violet' : 'gray');
  const form = d.form?.kind === 'limit' && d.form.week === w.week ? d.form : null;
  const item =
    form || d.edit === 'limit'
      ? entryForm({
          id: 'limit',
          action: href(`/week-limits/${w.week}`),
          submitLabel: 'Сохранить',
          icon: 'sliders',
          color,
          fields: field({
            label: `Бюджет недели, ${d.symbol}`,
            name: 'amount',
            type: 'decimal',
            value: form?.values.amount ?? amountText(w.limit),
            placeholder: amountText(WEEK_LIMIT),
            required: true,
            error: form?.errors.amount,
          }),
          extraActions: own ? [{ label: `Вернуть ${money(WEEK_LIMIT, d.symbol)}`, action: href(`/week-limits/${w.week}/delete`) }] : [],
          cancelHref: here(),
        })
      : entryRow({
          id: 'limit',
          title: 'Бюджет недели',
          details: own ? `вместо ${money(WEEK_LIMIT, d.symbol)}` : 'как обычно',
          icon: 'sliders',
          color,
          amount: w.limit,
          symbol: d.symbol,
          href: here({ edit: 'limit' }),
        });
  return entryList({ label: 'Бюджет недели', items: [item] });
}

function planItems(page: Page, w: WeekSummary): Html[] {
  return [...w.purchases.map((p) => purchaseItem(page, p)), ...w.regular.map((payment) => regularItem(page, payment))];
}

/**
 * The week's spending under a heading for each day, newest first, without minuses, as the plan has none. An expense
 * opens in place to be marked; one not counted at all is pale.
 */
function spendingByDay(page: Page, spending: Operation[]): Html {
  const { d, href, here } = page;
  const days = spending.map((o) => o.date).filter((date, i, all) => all.indexOf(date) === i);
  return stack({
    gap: 26,
    items: days.map((date) =>
      dayGroup({
        date,
        today: d.today,
        ruled: true,
        rows: spending
          .filter((o) => o.date === date)
          .map((o) => {
            const key = `spending-${o.id}`;
            const open = d.edit === key;
            return operationRow({
              id: key,
              title: markingTitle(o),
              details: `${o.account} · ${markingDetails(o)}`,
              ...withLogo(o, categoryLook(o.category)),
              kind: 'expense',
              amount: o.amount,
              symbol: d.symbol,
              unsigned: true,
              mark: envelopeMark(d.marking, o),
              tint: markingTint(o),
              muted: o.ignored,
              href: open ? here() : here({ edit: key }),
              panel: open ? markingPanel(d.marking, o, href) : undefined,
              actions: open ? markingActions(d.marking, o, href) : undefined,
              go: true,
            });
          }),
      }),
    ),
  });
}

/** A total on the side: what it is, the amount, what it is out of, and the bar under it. */
export interface Total {
  label: string;
  amount: number;
  note: string;
  parts: Array<{ label: string; value: number; tone: Tone }>;
}

/** What is left of a week that has begun or is over, or what a week ahead leaves free after its plan. */
export function weekTotal(w: WeekSummary, current: DateString, symbol: string): Total {
  const note = `из ${money(w.limit, symbol)} на неделю`;
  const rest = [
    { label: 'План', value: w.planned, tone: 'violet' as const },
    { label: 'Свободно', value: w.free, tone: 'gray' as const },
  ];
  if (w.week > current) return { label: 'Будет свободно', amount: w.free, note, parts: rest };
  return {
    label: w.week < current ? 'Итог недели' : 'Можно потратить',
    amount: w.free,
    note,
    parts: [{ label: 'Потрачено', value: w.spent, tone: 'yellow' }, ...rest],
  };
}

/**
 * The purchases a month's extras list: those the plan still holds money for, as its «План» counts them. One bought or
 * finished is told by the expenses that paid it, titled by it, so it is not listed twice; a wish bought keeps its
 * row, as the expense that bought it counts outside the budget.
 */
export function extrasPlan(m: ExtrasSummary): PurchaseStatus[] {
  return m.purchases.filter((p) => p.left > 0.005);
}

/**
 * What an expense of a month's extras says of the plan: whether the plan had it — it paid a purchase or set money
 * aside for a wish —, what the purchase was planned at, and, on the newest expense of a purchase bought or finished,
 * how far it went over the plan, below zero under it; null for none, and for a wish's money.
 */
export function extrasLine(m: ExtrasSummary, o: Operation): { planned: boolean; plan: number | null; over: number | null } {
  const status = m.paid.get(o.id);
  if (!status) return { planned: o.saving != null, plan: null, over: null };
  const { purchase: p, covered, bought, paid } = status;
  const over = bought && p.wish === undefined && paid[0]?.id === o.id && Math.abs(covered - p.amount) >= 0.5 ? covered - p.amount : null;
  return { planned: true, plan: p.amount, over };
}

/** What is left of a month's extras. */
export function extrasTotal(m: ExtrasSummary, symbol: string): Total {
  return {
    label: 'Дополнительные',
    amount: m.free,
    note: `осталось из ${money(MONTH_LIMIT, symbol)} в ${monthName(m.month, 'prepositional')}`,
    parts: [
      { label: 'Потрачено', value: m.spent, tone: 'yellow' },
      { label: 'План', value: m.planned, tone: 'violet' },
      { label: 'Свободно', value: m.free, tone: 'gray' },
    ],
  };
}

function totalSide(total: Total, symbol: string, barLabel: string): Html {
  return section({
    title: total.label,
    body: [
      balanceTotal({ amount: total.amount, symbol, note: total.note }),
      shareBar({ label: barLabel, parts: total.parts.map((p) => ({ label: p.label, value: p.value, color: toneColor(p.tone) })) }),
    ],
  });
}

/** A month: its weeks and its extras, and beside them what is left of the extras. */
function monthView(page: Page): View {
  const { d, href, current } = page;
  const m = d.extras;
  const link = (month: MonthString) => href('/', { view: 'month', month: month === monthOfWeek(current) ? null : month });
  const next = shiftMonth(m.month, 1);
  return {
    head: pageHead({
      title: capitalize(monthName(m.month)),
      prev: { label: 'Месяц раньше', href: link(shiftMonth(m.month, -1)) },
      next: next <= monthOfWeek(addDays(current, 7 * PLAN_AHEAD)) ? { label: 'Месяц позже', href: link(next) } : null,
      switcher: periodSwitch(page),
      text: [monthSentence(m, d.weeks, current, d.symbol)],
    }),
    main: [
      section({
        title: 'Недели',
        body: entryList({
          label: 'Недели',
          items: d.weeks.map((w) => {
            const line = monthWeekLine(w, current, d.symbol);
            return entryRow({
              title: line.title,
              details: line.details,
              icon: 'calendar',
              color: toneColor(line.tone),
              amount: line.amount,
              symbol: d.symbol,
              href: href('/', { week: w.week === current ? null : w.week }),
            });
          }),
        }),
      }),
      section({
        title: 'Дополнительные',
        body: entryList({
          label: 'Дополнительные',
          items: [
            ...extrasPlan(m).map((p) => purchaseItem(page, p)),
            ...m.spending.map((o) => spendingItem(page, o)),
            newPurchaseForm(page, m.month === monthOfWeek(current) ? current : (d.weeks[0]?.week ?? current), 'extra'),
          ],
        }),
      }),
    ],
    side: [totalSide(extrasTotal(m, d.symbol), d.symbol, 'Дополнительные')],
  };
}

/** A week in the month tab: how it went or what its plan leaves, and what is left of it or over. */
export function monthWeekLine(w: WeekSummary, current: DateString, symbol: string): { title: string; details: string; tone: Tone; amount: number } {
  return {
    title: `Неделя ${weekLabel(w.week)}`,
    details:
      w.week > current
        ? w.planned > 0
          ? `впереди · в плане ${money(w.planned, symbol)} · свободно`
          : 'впереди · можно потратить'
        : `${w.week === current ? 'идёт' : 'прошла'} · потрачено ${money(w.spent, symbol)} · ${w.free < 0 ? 'перерасход' : 'осталось'}`,
    tone: w.free < 0 ? 'red' : w.week === current ? 'violet' : w.week > current ? 'gray' : 'yellow',
    amount: Math.abs(w.free),
  };
}

/**
 * A purchase of a week, with what the expenses linked to it paid. Once they pay it in full it is bought; before that
 * it can be finished, keeping what they paid and giving the rest back to the week or the extras: by the icon on its
 * row, or from its form on a touch screen. A finished or bought one shows what it cost, and its form takes it back
 * into the plan. On its row, one of a week ahead finishes only once something paid it.
 */
function purchaseItem(page: Page, status: PurchaseStatus): Html {
  const { d, href, here, current } = page;
  const { purchase: p, bought } = status;
  if (p.wish !== undefined) return wishPurchaseItem(page, status);
  const key = `purchase-${p.id}`;
  const form = d.form?.kind === 'purchase' && d.form.id === p.id ? d.form : null;
  const color = bought ? toneColor('gray') : p.envelope === 'extra' ? toneColor('violet') : categoryColor(key, null);
  if (form || d.edit === key) {
    return entryForm({
      id: key,
      action: href(`/purchases/${p.id}`),
      submitLabel: 'Сохранить',
      icon: categoryIcon(p.title),
      color,
      fields: [
        ...entryFields(form ?? { values: { title: p.title, amount: amountText(p.amount) }, errors: {} }, d.symbol),
        kindField(form?.purchaseKind ?? p.kind),
        weekField(page, form?.week ? parseWeek(form.week, current, d.weekStart) : p.week),
      ],
      extraActions: purchaseActions(status).map((a) => ({ label: a.label, action: href(`/purchases/${p.id}/${a.action}`) })),
      deleteAction: href(`/purchases/${p.id}/delete`),
      cancelHref: here(),
    });
  }
  const line = purchaseLine(status, current, d.symbol);
  return entryRow({
    id: key,
    title: p.title,
    details: line.details,
    icon: categoryIcon(p.title),
    color,
    mark: ENVELOPE_MARK[p.envelope],
    amount: line.amount,
    symbol: d.symbol,
    href: here({ edit: key }),
    actions: line.finishable ? [{ label: 'Завершить: остаток вернётся', icon: 'check', action: href(`/purchases/${p.id}/done`) }] : [],
    muted: bought,
  });
}

/**
 * Money a wish's plan holds in a week or the extras: a row of the wish, chosen and changed in the app, so it opens
 * nothing here.
 */
function wishPurchaseItem({ d }: Page, status: PurchaseStatus): Html {
  const p = status.purchase;
  const card = d.cards.has(p.wish!);
  const bought = !card && d.boughtWishes.has(p.wish!);
  const line = heldLine(status, d.symbol);
  return entryRow({
    id: `purchase-${p.id}`,
    title: p.title,
    details: [card ? 'Кредитка' : 'Желание', bought ? 'куплено' : line.details].filter(Boolean).join(' · '),
    icon: line.state === 'set' ? 'check' : card ? 'card' : 'sparkles',
    color: toneColor(bought || line.done ? 'gray' : card ? 'blue' : 'yellow'),
    mark: ENVELOPE_MARK[p.envelope],
    amount: line.amount,
    symbol: d.symbol,
    muted: bought || line.done,
  });
}

/**
 * What a purchase's row says, the amount it shows (what it cost, once bought) and whether its row can finish it: one
 * of a week ahead finishes there only once something paid it.
 */
export function purchaseLine({ purchase: p, paid, covered, bought }: PurchaseStatus, current: DateString, symbol: string): { details: string; amount: number; finishable: boolean } {
  const ahead = p.week > current;
  const paidInFull = covered >= p.amount - 0.005;
  const over = covered - p.amount;
  const details = !bought
    ? covered > 0
      ? `оплачено ${money(covered, symbol)} из ${money(p.amount, symbol)}`
      : ahead
        ? 'в плане'
        : 'ждёт покупки'
    : paidInFull
      ? `куплено ${dayMonth(paid[0]!.date)}${over > 0.005 ? `, на ${money(over, symbol)} больше плана` : ''}`
      : `завершено, вернулось ${money(p.amount - covered, symbol)}`;
  return { details, amount: bought ? covered : p.amount, finishable: !(bought || (ahead && covered === 0)) };
}

/** What a purchase's form offers besides saving: moving between the week's money and extras, finishing or taking it back. */
export function purchaseActions({ purchase: p, bought }: PurchaseStatus): Array<{ action: 'move' | 'done'; label: string }> {
  return [
    { action: 'move', label: p.envelope === 'week' ? 'В дополнительные' : 'В обычные' },
    ...(p.done ? [{ action: 'done' as const, label: 'Вернуть в план' }] : bought ? [] : [{ action: 'done' as const, label: 'Завершить' }]),
  ];
}

function wishItem({ d, href, here }: Page, { wish, advice, plan, gathered }: DashboardData['wishes'][number]): Html {
  const key = `wish-${wish.id}`;
  const form = d.form?.kind === 'wish' && d.form.id === wish.id ? d.form : null;
  const card = wish.kind === 'card';
  const look = { icon: card ? ('card' as const) : ('sparkles' as const), color: toneColor(card ? 'blue' : 'yellow') };
  if (form || d.edit === key) {
    return entryForm({
      id: key,
      action: href(`/wishes/${wish.id}`),
      submitLabel: 'Сохранить',
      ...look,
      fields: [
        ...entryFields(form ?? { values: { title: wish.title, amount: amountText(wish.amount) }, errors: {} }, d.symbol),
        wishKindField(form?.wishKind ?? wish.kind),
        rateField(form?.rate ?? (wish.rate == null ? '' : String(wish.rate).replace('.', ',')), form?.rateError),
      ],
      deleteAction: href(`/wishes/${wish.id}/delete`),
      cancelHref: here(),
    });
  }
  return entryRow({
    id: key,
    title: wish.title,
    details: wishLine(wish, plan, adviceText(advice, d.current, d.symbol), d.symbol, gathered),
    ...look,
    amount: wish.amount,
    symbol: d.symbol,
    href: here({ edit: key }),
    // A card is repaid by its plan, never put into a week as a purchase.
    actions: !card && !plan && adviceTarget(advice) ? [{ label: 'Запланировать', action: href(`/wishes/${wish.id}/plan`) }] : [],
  });
}

/** A regular payment of the week, marked paid once expenses linked to it cover it, or showing how much they cover. */
function regularItem({ d, href }: Page, payment: WeekSummary['regular'][number]): Html {
  const { expense } = payment;
  const { details, done } = regularPaymentLine(payment, d.symbol);
  return entryRow({
    title: expense.title,
    details,
    mark: ENVELOPE_MARK.outside,
    icon: done ? 'check' : entryIcon(expense.icon, expense.title),
    color: toneColor(done ? 'green' : 'gray'),
    amount: expense.amount,
    symbol: d.symbol,
    href: href('/regular', { edit: String(expense.id) }),
  });
}

/** What a regular payment of the week says, and whether the expenses linked to it paid it in full. */
export function regularPaymentLine({ expense, date, paid }: WeekSummary['regular'][number], symbol: string): { details: string; done: boolean } {
  const covered = paid.reduce((total, o) => total + o.amount, 0);
  const done = paid.length > 0 && covered >= expense.amount - 0.005;
  const details =
    paid.length === 0
      ? `регулярная · ${dayMonth(date)}`
      : done
        ? `оплачено ${dayMonth(paid[0]!.date)}`
        : `оплачено ${money(covered, symbol)} из ${money(expense.amount, symbol)} · ${dayMonth(date)}`;
  return { details, done };
}

/**
 * An extra expense of the month opens to be marked: what it paid, its category and where it counts. One the plan had
 * says what its purchase was planned at and, on the one that bought or finished it, how far over or under the plan it
 * went; one without a plan says so (see extrasLine).
 */
function spendingItem({ d, href, here }: Page, o: Operation): Html {
  const key = `spending-${o.id}`;
  const open = d.edit === key;
  const line = extrasLine(d.extras, o);
  const plan =
    line.plan === null
      ? line.planned
        ? null
        : 'без плана'
      : [`план ${money(line.plan, d.symbol)}`, line.over === null ? null : `${line.over > 0 ? 'дороже' : 'дешевле'} на ${money(Math.abs(line.over), d.symbol)}`].filter(Boolean).join(', ');
  return entryRow({
    id: key,
    title: markingTitle(o),
    details: [`${dayMonth(o.date)}, ${o.account}`, plan, markingDetails(o)].filter(Boolean).join(' · '),
    ...withLogo(o, categoryLook(o.category)),
    mark: envelopeMark(d.marking, o),
    tint: markingTint(o),
    amount: o.amount,
    symbol: d.symbol,
    href: open ? here() : here({ edit: key }),
    actions: open ? markingActions(d.marking, o, href) : [],
    panel: open ? markingPanel(d.marking, o, href) : undefined,
  });
}

/** On the side the form for a new purchase of the week is a row that opens it, so the plan stays short. */
function foldedPurchaseForm(page: Page, week: DateString): Html {
  const { d, here } = page;
  const unfolded = d.edit === 'new-purchase' || (d.form?.kind === 'purchase' && d.form.id === null && d.form.envelope === 'week');
  return unfolded ? newPurchaseForm(page, week, 'week', { id: 'new-purchase', cancelHref: here() }) : addRow(page, 'new-purchase', 'Добавить в план');
}

function foldedWishForm(page: Page): Html {
  const { d, here } = page;
  const unfolded = d.edit === 'new-wish' || (d.form?.kind === 'wish' && d.form.id === null);
  return unfolded ? newWishForm(page, { id: 'new-wish', cancelHref: here() }) : addRow(page, 'new-wish', 'Добавить желание');
}

function addRow({ here }: Page, key: string, title: string): Html {
  return entryRow({ id: key, title, details: 'название и сумма', icon: 'plus', color: toneColor('gray'), href: here({ edit: key }) });
}

function newPurchaseForm({ d, href }: Page, week: DateString, envelope: 'week' | 'extra', folded?: { id: string; cancelHref: string }): Html {
  const form = d.form?.kind === 'purchase' && d.form.id === null && d.form.envelope === envelope ? d.form : null;
  return entryForm({
    ...folded,
    action: href('/purchases'),
    submitLabel: 'В план',
    icon: 'plus',
    color: toneColor('gray'),
    fields: [
      ...entryFields(form ?? { values: { title: '', amount: '' }, errors: {} }, d.symbol, envelope === 'extra' ? 'Например, куртка' : 'Например, ботинки'),
      kindField(form?.purchaseKind ?? 'flexible'),
    ],
    hidden: { week, envelope },
  });
}

/** The words for a purchase's kind: what it is and what that means for the plan. */
export const PURCHASE_KINDS: Record<PurchaseKind, { label: string; hint: string }> = {
  required: { label: 'Обязательная', hint: 'Лучше не трогать' },
  flexible: { label: 'Гибкая', hint: 'Можно перенести' },
};

/** Whether a purchase had better stay in its week or can move. */
function kindField(value: PurchaseKind): Html {
  return selectField({
    label: 'Тип',
    name: 'kind',
    value,
    width: 270,
    groups: [{ label: 'Тип покупки', options: (['flexible', 'required'] as const).map((k) => ({ value: k, label: `${PURCHASE_KINDS[k].label}: ${PURCHASE_KINDS[k].hint.toLowerCase()}` })) }],
  });
}

/** A choice of the week, this one and the next ones by month, with `value` among them even when it is out of range. */
function weekField({ current }: Page, value: DateString): Html {
  return selectField({ label: 'Неделя', name: 'week', value, width: 210, groups: weekChoices(current, value) });
}

/** Weeks a purchase can go into, this one and the next ones, by month, with `value` among them even when out of range. */
export function weekChoices(current: DateString, value?: DateString): Array<{ label: string; options: Array<{ value: DateString; label: string }> }> {
  const weeks = Array.from({ length: WEEK_CHOICES }, (_, i) => addDays(current, 7 * i));
  if (value && !weeks.includes(value)) weeks.push(value);
  weeks.sort();
  const months = weeks.map(monthOfWeek).filter((m, i, all) => all.indexOf(m) === i);
  return months.map((month) => ({
    label: capitalize(monthName(month)),
    options: weeks
      .filter((w) => monthOfWeek(w) === month)
      .map((w) => ({ value: w, label: w === current ? 'Эта неделя' : w === addDays(current, 7) ? 'Следующая неделя' : weekLabel(w) })),
  }));
}

function newWishForm({ d, href }: Page, folded?: { id: string; cancelHref: string }): Html {
  const form = d.form?.kind === 'wish' && d.form.id === null ? d.form : null;
  return entryForm({
    ...folded,
    action: href('/wishes'),
    submitLabel: 'Хочу',
    icon: 'plus',
    color: toneColor('gray'),
    fields: [
      ...entryFields(form ?? { values: { title: '', amount: '' }, errors: {} }, d.symbol, 'Например, укладка для волос'),
      wishKindField(form?.wishKind ?? 'wish'),
      rateField(form?.rate ?? '', form?.rateError),
    ],
  });
}

/** A card's interest after its days without interest; a wish leaves it empty. */
function rateField(value: string, error?: string): Html {
  return field({ label: 'Ставка кредитки, %', name: 'rate', type: 'decimal', value, placeholder: '34,9', width: 130, error });
}

/** The words for a wish's kind: something to buy, or the debt of a credit card to repay before interest. */
export const WISH_KINDS: Record<WishKind, { label: string; hint: string }> = {
  wish: { label: 'Желание', hint: 'Купить к сроку' },
  card: { label: 'Кредитка', hint: 'Погасить, пока без процентов' },
};

/** Whether a wish is something to buy or a credit card's debt. */
function wishKindField(value: WishKind): Html {
  return selectField({
    label: 'Тип',
    name: 'kind',
    value,
    width: 270,
    groups: [{ label: 'Что это', options: (['wish', 'card'] as const).map((k) => ({ value: k, label: `${WISH_KINDS[k].label}: ${WISH_KINDS[k].hint.toLowerCase()}` })) }],
  });
}

function entryFields(form: Pick<DashboardForm, 'values' | 'errors'>, symbol: string, placeholder = ''): Html[] {
  return [
    field({ label: 'Что', name: 'title', value: form.values.title, placeholder, maxLength: 80, required: true, error: form.errors.title }),
    field({ label: `Сумма, ${symbol}`, name: 'amount', type: 'decimal', value: form.values.amount, placeholder: '4 500', width: 130, required: true, error: form.errors.amount }),
  ];
}

// ---- Words

/** Ends a sentence with a dot, unless it already ends with one, as after «руб.». */
function sentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}

export function weekSentence(w: WeekSummary, current: DateString, s: string): string {
  const changed = w.limit === WEEK_LIMIT ? '' : ` ${sentence(`Бюджет этой недели изменён: ${money(w.limit, s)} вместо ${money(WEEK_LIMIT, s)}`)}`;
  return `${weekFigures(w, current, s)}${changed}`;
}

function weekFigures(w: WeekSummary, current: DateString, s: string): string {
  if (w.week > current) {
    if (w.planned === 0) return sentence(`Неделя впереди, в плане пока ничего: свободны все ${money(w.limit, s)}`);
    return w.free >= 0
      ? sentence(`Неделя впереди: в плане ${money(w.planned, s)}, свободно ${money(w.free, s)} из ${money(w.limit, s)}`)
      : sentence(`Неделя впереди: в плане ${money(w.planned, s)}, это на ${money(-w.free, s)} больше ${money(w.limit, s)}`);
  }
  const spent = `потрачено ${money(w.spent, s)} из ${money(w.limit, s)}`;
  if (w.week < current) return sentence(`За эту неделю ${spent}, ${w.free < 0 ? 'перерасход' : 'осталось'} ${money(Math.abs(w.free), s)}`);
  // What is free the circle says.
  const plan = w.planned > 0 ? `, ещё ${money(w.planned, s)} ждут покупок из плана` : '';
  return w.free >= 0 ? sentence(`${capitalize(spent)}${plan}`) : sentence(`Неделя в минусе на ${money(-w.free, s)}: ${spent}${plan}`);
}

export function monthSentence(m: ExtrasSummary, weeks: WeekSummary[], current: DateString, s: string): string {
  const limit = money(sum(weeks.map((w) => w.limit)), s);
  const left = sentence(`В ${monthName(m.month, 'prepositional')} на дополнительные осталось ${money(m.free, s)} из ${money(MONTH_LIMIT, s)}`);
  // What was spent of them, by the plan and without one.
  const extras =
    m.spent > 0.5 ? `${left} ${sentence(`Потрачено по плану ${money(m.spentByPlan, s)}, без плана — ${money(m.spent - m.spentByPlan, s)}`)}` : left;
  if ((weeks[0]?.week ?? current) > current) {
    return `${extras} ${sentence(`По неделям запланировано ${money(sum(weeks.map((w) => w.planned)), s)} из ${limit}`)}`;
  }
  return `${extras} ${sentence(`По неделям потрачено ${money(sum(weeks.map((w) => w.spent)), s)} из ${limit}`)}`;
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

/**
 * What the money a wish's plan holds in a week or a month's extras says of what is set aside: all of it, so much of
 * it, or, once the week or month is gone, nothing; with the amount its row shows, what is set aside once it is gone,
 * and whether it is done with, as it is when gone or set aside in full.
 */
export function heldLine({ purchase: p, covered: set }: PurchaseStatus, s: string): { details: string | null; amount: number; done: boolean; state: 'set' | 'part' | 'none' | 'open' } {
  if (set >= p.amount - 0.5) return { details: 'отложено', amount: set, done: true, state: 'set' };
  if (set > 0.005) return { details: `отложено ${money(set, s)} из ${money(p.amount, s)}`, amount: p.done ? set : p.amount, done: p.done, state: 'part' };
  return p.done ? { details: 'не отложено', amount: p.amount, done: true, state: 'none' } : { details: null, amount: p.amount, done: false, state: 'open' };
}

/** к 1 ноября */
export function dueLabel(due: DateString): string {
  return `к ${dayMonth(due)}`;
}

/**
 * Where a plan's money comes from, in a line: по 5 000 с 3 недель, 45 000 из дополнительных октября; then what is
 * short of the wish, if anything.
 */
export function planSummary(plan: Pick<ChosenPlan, 'steps'>, short: number, s: string): string {
  const parts: string[] = [];
  const moves = plan.steps.filter((x) => x.kind === 'move').length;
  if (moves > 0) parts.push(`перенести ${moves} ${plural(moves, ['покупку', 'покупки', 'покупок'])}`);
  const cuts = plan.steps.flatMap((x) => (x.kind === 'week' ? [x] : []));
  if (cuts.length > 0) {
    const same = cuts.every((c) => c.amount === cuts[0]!.amount);
    parts.push(same ? `по ${num(cuts[0]!.amount)} с ${cuts.length} ${plural(cuts.length, ['недели', 'недель', 'недель'])}` : `${num(covered(cuts))} с ${cuts.length} ${plural(cuts.length, ['недели', 'недель', 'недель'])}`);
  }
  const byMonth = (kind: 'extra' | 'savings') => {
    const months = new Map<MonthString, number>();
    for (const x of plan.steps) if (x.kind === kind && x.way !== SAVED_WAY) months.set(stepMonth(x), (months.get(stepMonth(x)) ?? 0) + x.amount);
    return [...months].sort(([a], [b]) => a.localeCompare(b));
  };
  for (const [month, sum] of byMonth('extra')) parts.push(`${num(sum)} из дополнительных ${monthName(month, 'genitive')}`);
  // A card's repayments from savings a plan chosen anew keeps are told as repaid, not as the plan.
  for (const [month, sum] of byMonth('savings')) if (sum > 0.5) parts.push(`${num(sum)} из накоплений ${monthName(month, 'genitive')}`);
  const text = parts.join(', ');
  return short > 0.5 ? `${text}; не хватает ${money(short, s)}` : text;
}

/**
 * A card's chosen plan in a line: the month its last repayment is in and the interest it pays over the debt, or what it
 * lacks when it does not close the card.
 */
function cardSummary(wish: Wish, plan: ChosenPlan, short: number, s: string): string {
  if (short > 0.5) return `не хватает ${money(short, s)}`;
  const last = plan.steps.reduce<MonthString | null>((m, x) => {
    const month = x.kind === 'move' ? null : stepMonth(x);
    return month && (!m || month > m) ? month : m;
  }, null);
  const over = covered(plan.steps) - wish.amount;
  return [last ? `закроете в ${monthName(last, 'prepositional')}` : null, wish.rate != null && over > 0.5 ? `+${money(over, s)}` : null].filter(Boolean).join(' · ');
}

/**
 * A wish's line in «Хочу купить»: its day, then what its chosen plan does and what is set aside for it. A wish with a
 * day but no plan yet waits for one; without a day either, `advice` tells when it fits (see adviceText).
 */
function wishLine(wish: Wish, plan: ChosenPlan | undefined, advice: string, s: string, gathered: Pick<Gathering, 'saved' | 'short'>): string {
  const card = wish.kind === 'card';
  const saved = gathered.saved > 0.5 ? `${card ? 'погашено' : 'отложено'} ${money(gathered.saved, s)}` : null;
  const due = wish.due ? (card ? `без % до ${dayMonth(wish.due)}` : dueLabel(wish.due)) : null;
  if (plan && card) return [cardSummary(wish, plan, gathered.short, s), saved].filter(Boolean).join(' · ');
  if (plan) return [due, planSummary(plan, gathered.short, s), saved].filter(Boolean).join(' · ');
  if (card) return [due ?? 'указать, до какого дня без процентов', 'выбрать, как погасить', saved].filter(Boolean).join(' · ');
  return [due ? `${due} · выбрать, как купить` : advice, saved].filter(Boolean).join(' · ');
}

/** When to buy a wish; `current` is the first day of the current week. */
function adviceText(advice: Advice, current: DateString, s: string): string {
  switch (advice.when) {
    case 'now':
      return `Можно на этой неделе, останется ${money(advice.freeAfter, s)}`;
    case 'later': {
      const when = advice.week === addDays(current, 7) ? 'На следующей неделе' : `На неделе ${weekLabel(advice.week)}`;
      return advice.extrasNow ? `${when} или сейчас из дополнительных` : when;
    }
    case 'extras':
      return `Только из дополнительных: в ${monthName(advice.month as MonthString, 'prepositional')} останется ${money(advice.freeAfter, s)}`;
    case 'never':
      return 'Не влезает ни в неделю, ни в дополнительные';
  }
}

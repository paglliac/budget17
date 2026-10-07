// The overview: the budget by weeks. The week tab is a week's spending by days, with what is left to spend, the plan
// and, in the current week, the wishes on the side; a week ahead has its plan in the main column and what it leaves
// free on the side. The month tab is a month's weeks and its extras. Both step back and forth, ?week=2026-10-19 and
// ?month=2026-11, up to a year ahead. Built from widgets only. Entries open by ?edit=purchase-1, wish-1,
// spending-<ZenMoney id>, or new-purchase and new-wish for the forms folded on the side; an open expense is marked as
// on every page (see marking.ts). Forms post to /purchases and /wishes (see submitDashboard) and to /spending (see
// submitMarking), and the server sends the browser back to the page they came from.

import { summarizeBalances } from '../../balances.ts';
import { addDays, shiftMonth, type MonthString } from '../../dates.ts';
import { amountText, parseAmount, parseTitle } from '../../input.ts';
import { listOperations, type Operation } from '../../ledger.ts';
import type { Settings } from '../../settings.ts';
import {
  adviceTarget,
  adviseWish,
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
  type PurchaseStatus,
  type WeekSummary,
  type Wish,
} from '../../week.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { capitalize, dayMonth, money, monthName, weekLabel } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryIcon, entryIcon } from '../icons.ts';
import { categoryColor, toneColor, type Tone } from '../tones.ts';
import { balanceTotal } from '../widgets/accounts.ts';
import { button, emptyState, field, footnote, pageIntro, section, segmentedLinks, selectField, shareBar } from '../widgets/basics.ts';
import { entryForm, entryList, entryRow } from '../widgets/entries.ts';
import { dayGroup, operationRow } from '../widgets/operations.ts';
import { appShell, stack, tabs, topBar } from '../widgets/shell.ts';
import { appRail, userName, type Href } from './chrome.ts';
import {
  allExpenses,
  ENVELOPE_MARK,
  envelopeMark,
  loadMarking,
  markingActions,
  markingDetails,
  markingPanel,
  markingTitle,
  type Marking,
  type SavedMarking,
} from './marking.ts';

/** How many weeks ahead a week can be opened and planned. */
export const PLAN_AHEAD = 52;
/** Weeks a purchase can be put into from its form: this one and the next ones. */
const WEEK_CHOICES = 13;

/** What the user keeps in the app for the budget. */
export interface SavedBudget extends SavedMarking {
  wishes: Wish[];
}

export type FormField = 'title' | 'amount';

/** A purchase or wish form shown again with its errors after a submission failed. */
export interface DashboardForm {
  kind: 'purchase' | 'wish';
  /** null for a new one. */
  id: number | null;
  values: Record<FormField, string>;
  errors: Partial<Record<FormField, string>>;
  /** Which list a new purchase was added to. */
  envelope: 'week' | 'extra';
  /** The week the purchase was sent with, as sent. */
  week: string | null;
}

export interface DashboardData {
  today: DateString;
  view: 'week' | 'month';
  /** The week tab's week: the current one, an earlier one opened from the month, or a later one being planned. */
  week: WeekSummary;
  /** The weeks of the month tab's month, the current one unless another is opened. */
  weeks: WeekSummary[];
  /** Extras of the month tab's month. */
  extras: ExtrasSummary;
  wishes: Array<{ wish: Wish; advice: Advice }>;
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
  const current = weekOf(options.today);
  const monthStart = weeksOfMonth(monthOfWeek(current))[0] ?? current;
  const from = options.from && options.from < monthStart ? options.from : monthStart;
  const expenses = listOperations(data, { from: addDays(from, -31), to: addDays(current, 6) }, saved).filter((o) => o.kind === 'expense');
  return { expenses, purchases: saved.purchases, marks: saved.marks, regular: saved.regular };
}

export function loadDashboard(
  data: EntityCollections,
  saved: SavedBudget,
  options: {
    today: DateString;
    view?: string | null;
    week?: string | null;
    month?: string | null;
    edit?: string | null;
    form?: DashboardForm;
    source: DashboardData['source'];
    canSync: boolean;
  },
): DashboardData {
  const { today } = options;
  const current = weekOf(today);
  const week = parseWeek(options.week, current);
  const month = parseMonthOfWeeks(options.month, current);
  const monthStart = weeksOfMonth(month)[0] ?? current;
  const budget = budgetOf(data, saved, { today, from: week < monthStart ? week : monthStart });
  return {
    today,
    view: options.view === 'month' ? 'month' : 'week',
    week: summarizeWeek(budget, week),
    weeks: weeksOfMonth(month).map((w) => summarizeWeek(budget, w)),
    extras: summarizeExtras(budget, month),
    wishes: saved.wishes.map((wish) => ({ wish, advice: adviseWish(budget, wish, today) })),
    marking: loadMarking(data, saved, allExpenses(data, saved), today),
    edit: options.edit ?? null,
    form: options.form ?? null,
    symbol: summarizeBalances(data).mainInstrument.symbol,
    userName: userName(data),
    source: options.source,
    canSync: options.canSync,
  };
}

/** A Monday from a query param, at most PLAN_AHEAD weeks after the current one; the current week otherwise. */
function parseWeek(value: string | null | undefined, current: DateString): DateString {
  return value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    weekOf(value) === value &&
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
 * /wishes/:id (save), /wishes/:id/plan (into the advised week) or /wishes/:id/delete. `budget` is needed only to
 * plan a wish.
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
    const parsed = parseEntry(body);
    if ('errors' in parsed) return { status: 'invalid', form: { kind: 'purchase', id, ...parsed, envelope, week: body.get('week') } };
    if (!existing) {
      const week = parseWeek(body.get('week'), weekOf(context.today));
      settings.addPurchase({ ...parsed.entry, week, envelope, done: false });
    } else {
      const moved = action === 'move' ? (existing.envelope === 'week' ? 'extra' : 'week') : existing.envelope;
      const week = body.has('week') ? parseWeek(body.get('week'), weekOf(context.today)) : existing.week;
      settings.updatePurchase(existing.id, { ...parsed.entry, envelope: moved, week });
    }
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
    if ('errors' in parsed) return { status: 'invalid', form: { kind: 'wish', id, ...parsed, envelope: 'week', week: null } };
    if (existing) settings.updateWish(existing.id, parsed.entry);
    else settings.addWish(parsed.entry);
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
  const current = weekOf(d.today);
  const thisMonth = monthOfWeek(current);
  /** This page with the given params; an entry opens with `edit`. */
  const here = (params: Record<string, string | null> = {}) =>
    href('/', {
      view: d.view === 'week' ? null : d.view,
      week: d.view === 'week' && d.week.week !== current ? d.week.week : null,
      month: d.view === 'month' && d.extras.month !== thisMonth ? d.extras.month : null,
      ...params,
    });
  const page = { d, href, here, current };
  const { main, side } = d.view === 'month' ? monthView(page) : weekView(page);

  const body = appShell({
    rail: appRail('overview', d.userName, href),
    tabs: tabs({
      label: 'Период',
      items: [
        { label: 'Неделя', icon: 'calendar', href: href('/'), active: d.view === 'week' },
        { label: 'Месяц', icon: 'calendar', href: href('/', { view: 'month' }), active: d.view === 'month' },
      ],
    }),
    main,
    side: [...side, ...(d.source === 'demo' ? [footnote({ text: 'Демо-данные. Чтобы увидеть свои, добавьте токен в .env и запустите make sync.' })] : [])],
    wideSide: true,
  });
  return pageDocument({ title: 'Бюджет', body });
}

interface Page {
  d: DashboardData;
  href: Href;
  here: (params?: Record<string, string | null>) => string;
  current: DateString;
}

/**
 * A week that has begun or is over: its spending by days, and on the side what is left, the plan and, in the current
 * week, the wishes. A week ahead has no spending yet, so its plan takes the main column.
 */
function weekView(page: Page): { main: Html[]; side: Html[] } {
  const { d, current } = page;
  const w = d.week;
  const head = [
    topBar({ crumbs: [{ label: 'Бюджет' }, { label: `Неделя ${weekLabel(w.week)}`, icon: 'calendar' }], actions: syncButton(d) }),
    weekSteps(page),
    pageIntro({ title: `Неделя ${weekLabel(w.week)}`, text: weekSentence(w, current, d.symbol) }),
  ];
  if (w.week > current) {
    return {
      main: [...head, section({ title: 'План', body: entryList({ label: 'План на неделю', items: [...planItems(page, w), newPurchaseForm(page, w.week, 'week')] }) })],
      side: totalSide(weekTotal(w, current, d.symbol), d.symbol, 'Неделя'),
    };
  }
  return {
    main: [...head, section({ title: 'Траты недели', body: w.spending.length === 0 ? emptyState({ text: 'Трат пока нет.' }) : spendingByDay(page, w.spending) })],
    side: [
      ...totalSide(weekTotal(w, current, d.symbol), d.symbol, 'Неделя'),
      topBar({ crumbs: [{ label: 'План' }] }),
      entryList({ label: 'План на неделю', items: [...planItems(page, w), foldedPurchaseForm(page, w.week)] }),
      ...(w.week === current
        ? [
            topBar({ crumbs: [{ label: 'Хочу купить' }] }),
            entryList({ label: 'Хочу купить', items: [...d.wishes.map((x) => wishItem(page, x.wish, x.advice)), foldedWishForm(page)] }),
          ]
        : []),
    ],
  };
}

function planItems(page: Page, w: WeekSummary): Html[] {
  return [...w.purchases.map((p) => purchaseItem(page, p)), ...w.regular.map((payment) => regularItem(page, payment))];
}

/**
 * The week's spending under a heading for each day, newest first, without minuses, as the plan has none. An expense
 * opens in place to be marked.
 */
function spendingByDay(page: Page, spending: Operation[]): Html {
  const { d, href, here } = page;
  const days = spending.map((o) => o.date).filter((date, i, all) => all.indexOf(date) === i);
  return stack({
    gap: 18,
    items: days.map((date) =>
      dayGroup({
        date,
        today: d.today,
        rows: spending
          .filter((o) => o.date === date)
          .map((o) => {
            const key = `spending-${o.id}`;
            const open = d.edit === key;
            return operationRow({
              id: key,
              title: markingTitle(o),
              details: `${o.account} · ${markingDetails(o)}`,
              icon: o.category ? categoryIcon(o.category.title) : 'tag',
              color: categoryColor(o.category?.id ?? null, o.category?.color ?? null),
              kind: 'expense',
              amount: o.amount,
              symbol: d.symbol,
              unsigned: true,
              mark: envelopeMark(d.marking, o),
              href: open ? here() : here({ edit: key }),
              panel: open ? markingPanel(d.marking, o, href) : undefined,
              actions: open ? markingActions(d.marking, o, href) : undefined,
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
  const note = `из ${money(WEEK_LIMIT, symbol)} на неделю`;
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

function totalSide(total: Total, symbol: string, barLabel: string): Html[] {
  return [
    topBar({ crumbs: [{ label: total.label }] }),
    balanceTotal({ amount: total.amount, symbol, note: total.note }),
    shareBar({ label: barLabel, parts: total.parts.map((p) => ({ label: p.label, value: p.value, color: toneColor(p.tone) })) }),
  ];
}

function monthView(page: Page): { main: Html[]; side: Html[] } {
  const { d, href, current } = page;
  const m = d.extras;
  return {
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: capitalize(monthName(m.month)), icon: 'calendar' }], actions: syncButton(d) }),
      monthSteps(page),
      pageIntro({ title: capitalize(monthName(m.month)), text: monthSentence(m, d.weeks, current, d.symbol) }),
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
            ...m.purchases.map((p) => purchaseItem(page, p)),
            ...m.spending.map((o) => spendingItem(page, o)),
            newPurchaseForm(page, m.month === monthOfWeek(current) ? current : (d.weeks[0]?.week ?? current), 'extra'),
          ],
        }),
      }),
    ],
    side: totalSide(extrasTotal(m, d.symbol), d.symbol, 'Дополнительные'),
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

/** Links to the week before, this week and the week after. */
function weekSteps({ d, href, current }: Page): Html {
  const week = d.week.week;
  const link = (w: DateString) => href('/', { week: w === current ? null : w });
  const next = addDays(week, 7);
  return segmentedLinks({
    label: 'Недели',
    items: [
      { label: '← Раньше', href: link(addDays(week, -7)) },
      { label: 'Эта неделя', href: link(current), active: week === current },
      ...(next <= addDays(current, 7 * PLAN_AHEAD) ? [{ label: 'Позже →', href: link(next) }] : []),
    ],
  });
}

/** Links to the month before, this month and the month after. */
function monthSteps({ d, href, current }: Page): Html {
  const month = d.extras.month;
  const thisMonth = monthOfWeek(current);
  const link = (m: MonthString) => href('/', { view: 'month', month: m === thisMonth ? null : m });
  const next = shiftMonth(month, 1);
  return segmentedLinks({
    label: 'Месяцы',
    items: [
      { label: `← ${capitalize(monthName(shiftMonth(month, -1)))}`, href: link(shiftMonth(month, -1)) },
      { label: 'Этот месяц', href: link(thisMonth), active: month === thisMonth },
      ...(next <= monthOfWeek(addDays(current, 7 * PLAN_AHEAD)) ? [{ label: `${capitalize(monthName(next))} →`, href: link(next) }] : []),
    ],
  });
}

function syncButton(d: DashboardData): Html | null {
  return d.canSync ? button({ label: 'Обновить', icon: 'refresh', action: '/sync' }) : null;
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
        weekField(page, form?.week ? parseWeek(form.week, current) : p.week),
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

function wishItem({ d, href, here }: Page, wish: Wish, advice: Advice): Html {
  const key = `wish-${wish.id}`;
  const form = d.form?.kind === 'wish' && d.form.id === wish.id ? d.form : null;
  if (form || d.edit === key) {
    return entryForm({
      id: key,
      action: href(`/wishes/${wish.id}`),
      submitLabel: 'Сохранить',
      icon: 'sparkles',
      color: toneColor('yellow'),
      fields: entryFields(form ?? { values: { title: wish.title, amount: amountText(wish.amount) }, errors: {} }, d.symbol),
      deleteAction: href(`/wishes/${wish.id}/delete`),
      cancelHref: here(),
    });
  }
  return entryRow({
    id: key,
    title: wish.title,
    details: adviceText(advice, d.today, d.symbol),
    icon: 'sparkles',
    color: toneColor('yellow'),
    amount: wish.amount,
    symbol: d.symbol,
    href: here({ edit: key }),
    actions: adviceTarget(advice) ? [{ label: 'Запланировать', action: href(`/wishes/${wish.id}/plan`) }] : [],
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

/** An extra expense of the month opens to be marked: what it paid, its category and where it counts. */
function spendingItem({ d, href, here }: Page, o: Operation): Html {
  const key = `spending-${o.id}`;
  const open = d.edit === key;
  return entryRow({
    id: key,
    title: markingTitle(o),
    details: `${dayMonth(o.date)}, ${o.account} · ${markingDetails(o)}`,
    icon: o.category ? categoryIcon(o.category.title) : 'tag',
    color: categoryColor(o.category?.id ?? null, o.category?.color ?? null),
    mark: envelopeMark(d.marking, o),
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
    fields: entryFields(form ?? { values: { title: '', amount: '' }, errors: {} }, d.symbol, envelope === 'extra' ? 'Например, куртка' : 'Например, ботинки'),
    hidden: { week, envelope },
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
    fields: entryFields(form ?? { values: { title: '', amount: '' }, errors: {} }, d.symbol, 'Например, укладка для волос'),
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
  if (w.week > current) {
    if (w.planned === 0) return sentence(`Неделя впереди, в плане пока ничего: свободны все ${money(WEEK_LIMIT, s)}`);
    return w.free >= 0
      ? sentence(`Неделя впереди: в плане ${money(w.planned, s)}, свободно ${money(w.free, s)} из ${money(WEEK_LIMIT, s)}`)
      : sentence(`Неделя впереди: в плане ${money(w.planned, s)}, это на ${money(-w.free, s)} больше ${money(WEEK_LIMIT, s)}`);
  }
  const spent = `потрачено ${money(w.spent, s)} из ${money(WEEK_LIMIT, s)}`;
  if (w.week < current) return sentence(`За эту неделю ${spent}, ${w.free < 0 ? 'перерасход' : 'осталось'} ${money(Math.abs(w.free), s)}`);
  const plan = w.planned > 0 ? `, ещё ${money(w.planned, s)} ждут покупок из плана` : '';
  return w.free >= 0
    ? `${sentence(`Можно потратить ещё ${money(w.free, s)}`)} ${sentence(`${capitalize(spent)}${plan}`)}`
    : sentence(`Неделя в минусе на ${money(-w.free, s)}: ${spent}${plan}`);
}

export function monthSentence(m: ExtrasSummary, weeks: WeekSummary[], current: DateString, s: string): string {
  const limit = money(WEEK_LIMIT * weeks.length, s);
  const extras = sentence(`В ${monthName(m.month, 'prepositional')} на дополнительные осталось ${money(m.free, s)} из ${money(MONTH_LIMIT, s)}`);
  if ((weeks[0]?.week ?? current) > current) {
    return `${extras} ${sentence(`По неделям запланировано ${money(sum(weeks.map((w) => w.planned)), s)} из ${limit}`)}`;
  }
  return `${extras} ${sentence(`По неделям потрачено ${money(sum(weeks.map((w) => w.spent)), s)} из ${limit}`)}`;
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

export function adviceText(advice: Advice, today: DateString, s: string): string {
  switch (advice.when) {
    case 'now':
      return `Можно на этой неделе, останется ${money(advice.freeAfter, s)}`;
    case 'later': {
      const when = advice.week === addDays(weekOf(today), 7) ? 'На следующей неделе' : `На неделе ${weekLabel(advice.week)}`;
      return advice.extrasNow ? `${when} или сейчас из дополнительных` : when;
    }
    case 'extras':
      return `Только из дополнительных: в ${monthName(advice.month as MonthString, 'prepositional')} останется ${money(advice.freeAfter, s)}`;
    case 'never':
      return 'Не влезает ни в неделю, ни в дополнительные';
  }
}

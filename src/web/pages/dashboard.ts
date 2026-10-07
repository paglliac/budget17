// The overview: the budget by weeks. The week tab is a week's plan, with wishes in the current one, and what is left
// to spend with the week's spending on the side; a week ahead shows what its plan leaves free. The month tab is a
// month's weeks and its extras. Both step back and forth, ?week=2026-10-19 and ?month=2026-11, up to a year ahead.
// Built from widgets only. Entries open by ?edit=purchase-1, wish-1 or spending-<ZenMoney id>; an open expense is
// marked as on every page (see marking.ts). Forms post to /purchases and /wishes (see submitDashboard) and to
// /spending (see submitMarking), and the server sends the browser back to the page they came from.

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
import { categoryColor, toneColor } from '../tones.ts';
import { balanceTotal } from '../widgets/accounts.ts';
import { button, emptyState, field, footnote, pageIntro, section, segmentedLinks, selectField, shareBar } from '../widgets/basics.ts';
import { entryForm, entryList, entryRow } from '../widgets/entries.ts';
import { appShell, tabs, topBar } from '../widgets/shell.ts';
import { appRail, userName, type Href } from './chrome.ts';
import { allExpenses, envelopeMark, loadMarking, markingActions, markingDetails, markingPanel, markingTitle, type Marking, type SavedMarking } from './marking.ts';

/** How many weeks ahead a week can be opened and planned. */
const PLAN_AHEAD = 52;
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
  });
  return pageDocument({ title: 'Бюджет', body });
}

interface Page {
  d: DashboardData;
  href: Href;
  here: (params?: Record<string, string | null>) => string;
  current: DateString;
}

function weekView(page: Page): { main: Html[]; side: Html[] } {
  const { d, current } = page;
  const w = d.week;
  const isCurrent = w.week === current;
  return {
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: `Неделя ${weekLabel(w.week)}`, icon: 'calendar' }], actions: syncButton(d) }),
      weekSteps(page),
      pageIntro({ title: `Неделя ${weekLabel(w.week)}`, text: weekSentence(d, w, current) }),
      section({
        title: 'План',
        body: entryList({
          label: 'План на неделю',
          items: [
            ...w.purchases.map((p) => purchaseItem(page, p)),
            ...w.regular.map((payment) => regularItem(page, payment)),
            newPurchaseForm(page, w.week, 'week'),
          ],
        }),
      }),
      isCurrent
        ? section({
            title: 'Хочу купить',
            body: entryList({ label: 'Хочу купить', items: [...d.wishes.map((x) => wishItem(page, x.wish, x.advice)), newWishForm(page)] }),
          })
        : null,
    ].filter((part): part is Html => part !== null),
    side: w.week > current ? aheadSide(d, w) : spentSide(page, w),
  };
}

/** What is left of a week that has begun or is over, and its spending. */
function spentSide(page: Page, w: WeekSummary): Html[] {
  const { d, current } = page;
  return [
    topBar({ crumbs: [{ label: w.week < current ? 'Итог недели' : 'Можно потратить' }] }),
    balanceTotal({ amount: w.free, symbol: d.symbol, note: `из ${money(WEEK_LIMIT, d.symbol)} на неделю` }),
    shareBar({
      label: 'Неделя',
      parts: [
        { label: 'Потрачено', value: w.spent, color: toneColor('yellow') },
        { label: 'План', value: w.planned, color: toneColor('violet') },
        { label: 'Свободно', value: w.free, color: toneColor('gray') },
      ],
    }),
    topBar({ crumbs: [{ label: 'Траты недели' }] }),
    ...(w.spending.length === 0
      ? [emptyState({ text: 'Трат пока нет.' })]
      : [entryList({ label: 'Траты недели', items: w.spending.map((o) => spendingItem(page, o)) })]),
  ];
}

/** What a week ahead leaves free after its plan. */
function aheadSide(d: DashboardData, w: WeekSummary): Html[] {
  return [
    topBar({ crumbs: [{ label: 'Будет свободно' }] }),
    balanceTotal({ amount: w.free, symbol: d.symbol, note: `из ${money(WEEK_LIMIT, d.symbol)} на неделю` }),
    shareBar({
      label: 'Неделя',
      parts: [
        { label: 'План', value: w.planned, color: toneColor('violet') },
        { label: 'Свободно', value: w.free, color: toneColor('gray') },
      ],
    }),
  ];
}

function monthView(page: Page): { main: Html[]; side: Html[] } {
  const { d, href, current } = page;
  const m = d.extras;
  return {
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: capitalize(monthName(m.month)), icon: 'calendar' }], actions: syncButton(d) }),
      monthSteps(page),
      pageIntro({ title: capitalize(monthName(m.month)), text: monthSentence(d, current) }),
      section({
        title: 'Недели',
        body: entryList({
          label: 'Недели',
          items: d.weeks.map((w) =>
            entryRow({
              title: `Неделя ${weekLabel(w.week)}`,
              details:
                w.week > current
                  ? w.planned > 0
                    ? `впереди · в плане ${money(w.planned, d.symbol)} · свободно`
                    : 'впереди · можно потратить'
                  : `${w.week === current ? 'идёт' : 'прошла'} · потрачено ${money(w.spent, d.symbol)} · ${w.free < 0 ? 'перерасход' : 'осталось'}`,
              icon: 'calendar',
              color: toneColor(w.free < 0 ? 'red' : w.week === current ? 'violet' : w.week > current ? 'gray' : 'yellow'),
              amount: Math.abs(w.free),
              symbol: d.symbol,
              href: href('/', { week: w.week === current ? null : w.week }),
            }),
          ),
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
    side: [
      topBar({ crumbs: [{ label: 'Дополнительные' }] }),
      balanceTotal({ amount: m.free, symbol: d.symbol, note: `осталось из ${money(MONTH_LIMIT, d.symbol)} в ${monthName(m.month, 'prepositional')}` }),
      shareBar({
        label: 'Дополнительные',
        parts: [
          { label: 'Потрачено', value: m.spent, color: toneColor('yellow') },
          { label: 'План', value: m.planned, color: toneColor('violet') },
          { label: 'Свободно', value: m.free, color: toneColor('gray') },
        ],
      }),
    ],
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
function purchaseItem(page: Page, { purchase: p, paid, covered, bought }: PurchaseStatus): Html {
  const { d, href, here, current } = page;
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
      extraActions: [
        { label: p.envelope === 'week' ? 'В дополнительные' : 'В обычные', action: href(`/purchases/${p.id}/move`) },
        ...(p.done
          ? [{ label: 'Вернуть в план', action: href(`/purchases/${p.id}/done`) }]
          : bought
            ? []
            : [{ label: 'Завершить', action: href(`/purchases/${p.id}/done`) }]),
      ],
      deleteAction: href(`/purchases/${p.id}/delete`),
      cancelHref: here(),
    });
  }
  const ahead = p.week > current;
  const paidInFull = covered >= p.amount - 0.005;
  const over = covered - p.amount;
  const status = !bought
    ? covered > 0
      ? `оплачено ${money(covered, d.symbol)} из ${money(p.amount, d.symbol)}`
      : ahead
        ? 'в плане'
        : 'ждёт покупки'
    : paidInFull
      ? `куплено ${dayMonth(paid[0]!.date)}${over > 0.005 ? `, на ${money(over, d.symbol)} больше плана` : ''}`
      : `завершено, вернулось ${money(p.amount - covered, d.symbol)}`;
  return entryRow({
    id: key,
    title: p.title,
    details: `${status} · ${p.envelope === 'extra' ? 'дополнительные' : 'обычные'}`,
    icon: categoryIcon(p.title),
    color,
    amount: bought ? covered : p.amount,
    symbol: d.symbol,
    href: here({ edit: key }),
    actions: bought || (ahead && covered === 0) ? [] : [{ label: 'Завершить: остаток вернётся', icon: 'check', action: href(`/purchases/${p.id}/done`) }],
    muted: bought,
  });
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
    details: adviceText(advice, d),
    icon: 'sparkles',
    color: toneColor('yellow'),
    amount: wish.amount,
    symbol: d.symbol,
    href: here({ edit: key }),
    actions: adviceTarget(advice) ? [{ label: 'Запланировать', action: href(`/wishes/${wish.id}/plan`) }] : [],
  });
}

/** A regular payment of the week, marked paid once expenses linked to it cover it, or showing how much they cover. */
function regularItem({ d, href }: Page, { expense, date, paid }: WeekSummary['regular'][number]): Html {
  const covered = paid.reduce((total, o) => total + o.amount, 0);
  const done = paid.length > 0 && covered >= expense.amount - 0.005;
  const status =
    paid.length === 0
      ? `регулярная, вне бюджета · ${dayMonth(date)}`
      : done
        ? `оплачено ${dayMonth(paid[0]!.date)} · вне бюджета`
        : `оплачено ${money(covered, d.symbol)} из ${money(expense.amount, d.symbol)} · ${dayMonth(date)}`;
  return entryRow({
    title: expense.title,
    details: status,
    icon: done ? 'check' : entryIcon(expense.icon, expense.title),
    color: toneColor(done ? 'green' : 'gray'),
    amount: expense.amount,
    symbol: d.symbol,
    href: href('/regular', { edit: String(expense.id) }),
  });
}

/** Spending opens to be marked: what it paid, its category and where it counts. */
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

function newPurchaseForm({ d, href }: Page, week: DateString, envelope: 'week' | 'extra'): Html {
  const form = d.form?.kind === 'purchase' && d.form.id === null && d.form.envelope === envelope ? d.form : null;
  return entryForm({
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
  const weeks = Array.from({ length: WEEK_CHOICES }, (_, i) => addDays(current, 7 * i));
  if (!weeks.includes(value)) weeks.push(value);
  weeks.sort();
  const months = weeks.map(monthOfWeek).filter((m, i, all) => all.indexOf(m) === i);
  return selectField({
    label: 'Неделя',
    name: 'week',
    value,
    width: 210,
    groups: months.map((month) => ({
      label: capitalize(monthName(month)),
      options: weeks
        .filter((w) => monthOfWeek(w) === month)
        .map((w) => ({ value: w, label: w === current ? 'Эта неделя' : w === addDays(current, 7) ? 'Следующая неделя' : weekLabel(w) })),
    })),
  });
}

function newWishForm({ d, href }: Page): Html {
  const form = d.form?.kind === 'wish' && d.form.id === null ? d.form : null;
  return entryForm({
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

function weekSentence(d: DashboardData, w: WeekSummary, current: DateString): string {
  const s = d.symbol;
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

function monthSentence(d: DashboardData, current: DateString): string {
  const s = d.symbol;
  const m = d.extras;
  const limit = money(WEEK_LIMIT * d.weeks.length, s);
  const extras = sentence(`В ${monthName(m.month, 'prepositional')} на дополнительные осталось ${money(m.free, s)} из ${money(MONTH_LIMIT, s)}`);
  if ((d.weeks[0]?.week ?? current) > current) {
    return `${extras} ${sentence(`По неделям запланировано ${money(sum(d.weeks.map((w) => w.planned)), s)} из ${limit}`)}`;
  }
  return `${extras} ${sentence(`По неделям потрачено ${money(sum(d.weeks.map((w) => w.spent)), s)} из ${limit}`)}`;
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

function adviceText(advice: Advice, d: DashboardData): string {
  const s = d.symbol;
  switch (advice.when) {
    case 'now':
      return `Можно на этой неделе, останется ${money(advice.freeAfter, s)}`;
    case 'later': {
      const when = advice.week === addDays(weekOf(d.today), 7) ? 'На следующей неделе' : `На неделе ${weekLabel(advice.week)}`;
      return advice.extrasNow ? `${when} или сейчас из дополнительных` : when;
    }
    case 'extras':
      return `Только из дополнительных: в ${monthName(advice.month as MonthString, 'prepositional')} останется ${money(advice.freeAfter, s)}`;
    case 'never':
      return 'Не влезает ни в неделю, ни в дополнительные';
  }
}

// The overview: the budget by weeks. The week tab is the week's plan and wishes, with what is left to spend and
// the week's spending on the side; the month tab is the month's weeks and its extras. Built from widgets only.
// Entries open by ?edit=purchase-1, wish-1 or spending-<ZenMoney id>; forms post to /purchases, /wishes and
// /spending (see submitDashboard), and the server sends the browser back to the page they came from.

import { summarizeBalances } from '../../balances.ts';
import type { Categorization } from '../../categorization.ts';
import { addDays, type MonthString } from '../../dates.ts';
import { amountText, parseAmount, parseTitle } from '../../input.ts';
import { listOperations, type Operation } from '../../ledger.ts';
import type { RegularExpense } from '../../regular.ts';
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
  type Envelope,
  type ExtrasSummary,
  type Purchase,
  type WeekSummary,
  type Wish,
} from '../../week.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { capitalize, dayMonth, money, monthName } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryIcon, entryIcon } from '../icons.ts';
import { categoryColor, toneColor } from '../tones.ts';
import { balanceTotal } from '../widgets/accounts.ts';
import { button, emptyState, field, footnote, pageIntro, section, shareBar } from '../widgets/basics.ts';
import { entryForm, entryList, entryRow } from '../widgets/entries.ts';
import { appShell, tabs, topBar } from '../widgets/shell.ts';
import { appRail, userName, type Href } from './chrome.ts';

/** What the user keeps in the app for the budget. */
export interface SavedBudget {
  purchases: Purchase[];
  wishes: Wish[];
  marks: ReadonlyMap<string, Envelope>;
  regular: RegularExpense[];
  /** Expenses linked to the regular expenses they paid count outside the budget. */
  categorizations: ReadonlyMap<string, Categorization>;
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
}

export interface DashboardData {
  today: DateString;
  view: 'week' | 'month';
  /** The week tab's week: the current one, or an earlier one opened from the month. */
  week: WeekSummary;
  /** The weeks of the current month. */
  weeks: WeekSummary[];
  /** Extras of the current month. */
  extras: ExtrasSummary;
  wishes: Array<{ wish: Wish; advice: Advice }>;
  marks: ReadonlyMap<string, Envelope>;
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
    edit?: string | null;
    form?: DashboardForm;
    source: DashboardData['source'];
    canSync: boolean;
  },
): DashboardData {
  const { today } = options;
  const current = weekOf(today);
  const week = parseWeek(options.week, current);
  const budget = budgetOf(data, saved, { today, from: week });
  const month = monthOfWeek(current);
  return {
    today,
    view: options.view === 'month' ? 'month' : 'week',
    week: summarizeWeek(budget, week),
    weeks: weeksOfMonth(month).map((w) => summarizeWeek(budget, w)),
    extras: summarizeExtras(budget, month),
    wishes: saved.wishes.map((wish) => ({ wish, advice: adviseWish(budget, wish, today) })),
    marks: saved.marks,
    edit: options.edit ?? null,
    form: options.form ?? null,
    symbol: summarizeBalances(data).mainInstrument.symbol,
    userName: userName(data),
    source: options.source,
    canSync: options.canSync,
  };
}

/** A Monday from a query param, no later than the current week; the current week otherwise. */
function parseWeek(value: string | null | undefined, current: DateString): DateString {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && weekOf(value) === value && value <= current
    ? value
    : current;
}

// ---- Forms

export type DashboardSubmission = { status: 'saved' } | { status: 'missing' } | { status: 'invalid'; form: DashboardForm };

const ENVELOPES: Envelope[] = ['week', 'extra', 'outside'];

/**
 * Applies a form posted to /purchases (add), /purchases/:id (save), /purchases/:id/move (save and switch between
 * the week's money and extras), /purchases/:id/done (bought or not), /purchases/:id/delete, /wishes (add),
 * /wishes/:id (save), /wishes/:id/plan (into the advised week), /wishes/:id/delete or /spending/:id/:envelope.
 * `budget` is needed only to plan a wish.
 */
export function submitDashboard(
  settings: Settings,
  path: string,
  body: URLSearchParams,
  context: { today: DateString; budget: () => Budget },
): DashboardSubmission {
  const spending = /^\/spending\/([\w-]+)\/(week|extra|outside)$/.exec(path);
  if (spending) {
    settings.markSpending(spending[1]!, spending[2] as Envelope);
    return { status: 'saved' };
  }

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
    if ('errors' in parsed) return { status: 'invalid', form: { kind: 'purchase', id, ...parsed, envelope } };
    if (!existing) {
      const week = parseWeek(body.get('week'), weekOf(context.today));
      settings.addPurchase({ ...parsed.entry, week, envelope, done: false });
    } else {
      const moved = action === 'move' ? (existing.envelope === 'week' ? 'extra' : 'week') : existing.envelope;
      settings.updatePurchase(existing.id, { ...parsed.entry, envelope: moved });
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
    if ('errors' in parsed) return { status: 'invalid', form: { kind: 'wish', id, ...parsed, envelope: 'week' } };
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
  /** This page with the given params; an entry opens with `edit`. */
  const here = (params: Record<string, string | null> = {}) =>
    href('/', { view: d.view === 'month' ? 'month' : null, week: d.week.week === current ? null : d.week.week, ...params });
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
    side: [
      ...side,
      footnote({
        text: d.source === 'demo' ? 'Демо-данные. Чтобы увидеть свои, добавьте токен в .env и запустите make sync.' : 'Траты из ZenMoney.',
      }),
    ],
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
  const { d, href, current } = page;
  const w = d.week;
  const isCurrent = w.week === current;
  return {
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: `Неделя ${weekLabel(w.week)}`, icon: 'calendar' }], actions: syncButton(d) }),
      pageIntro({ title: `Неделя ${weekLabel(w.week)}`, text: weekSentence(d, w, isCurrent) }),
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
    side: [
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
        : [
            entryList({ label: 'Траты недели', items: w.spending.map((o) => spendingItem(page, o)) }),
            footnote({ text: 'Траты идут в неделю. Откройте трату, чтобы отнести её к дополнительным или вне бюджета.' }),
          ]),
    ],
  };
}

function monthView(page: Page): { main: Html[]; side: Html[] } {
  const { d, href, current } = page;
  const m = d.extras;
  return {
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: capitalize(monthName(m.month)), icon: 'calendar' }], actions: syncButton(d) }),
      pageIntro({ title: capitalize(monthName(m.month)), text: monthSentence(d) }),
      section({
        title: 'Недели',
        body: entryList({
          label: 'Недели',
          items: d.weeks.map((w) =>
            entryRow({
              title: `Неделя ${weekLabel(w.week)}`,
              details:
                w.week > current
                  ? 'впереди · можно потратить'
                  : `${w.week === current ? 'идёт' : 'прошла'} · потрачено ${money(w.spent, d.symbol)} · ${w.free < 0 ? 'перерасход' : 'осталось'}`,
              icon: 'calendar',
              color: toneColor(w.free < 0 ? 'red' : w.week === current ? 'violet' : 'yellow'),
              amount: Math.abs(w.free),
              symbol: d.symbol,
              href: w.week <= current ? href('/', { week: w.week === current ? null : w.week }) : undefined,
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
            newPurchaseForm(page, current, 'extra'),
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
      footnote({ text: 'Сюда попадают покупки, отмеченные как дополнительные, и траты, перенесённые из недели.' }),
    ],
  };
}

function syncButton(d: DashboardData): Html | null {
  return d.canSync ? button({ label: 'Обновить', icon: 'refresh', action: '/sync' }) : null;
}

const ENVELOPE_NAME: Record<Envelope, string> = { week: 'в неделе', extra: 'дополнительные', outside: 'вне бюджета' };
const MOVE_TO: Record<Envelope, string> = { week: 'В неделю', extra: 'В дополнительные', outside: 'Вне бюджета' };

function purchaseItem({ d, href, here }: Page, p: Purchase): Html {
  const key = `purchase-${p.id}`;
  const form = d.form?.kind === 'purchase' && d.form.id === p.id ? d.form : null;
  const color = p.done ? toneColor('gray') : p.envelope === 'extra' ? toneColor('violet') : categoryColor(key, null);
  if (form || d.edit === key) {
    return entryForm({
      action: href(`/purchases/${p.id}`),
      submitLabel: 'Сохранить',
      icon: categoryIcon(p.title),
      color,
      fields: entryFields(form ?? { values: { title: p.title, amount: amountText(p.amount) }, errors: {} }, d.symbol),
      extraActions: [{ label: p.envelope === 'week' ? 'В дополнительные' : 'В обычные', action: href(`/purchases/${p.id}/move`) }],
      deleteAction: href(`/purchases/${p.id}/delete`),
      cancelHref: here(),
    });
  }
  return entryRow({
    title: p.title,
    details: `${p.done ? 'куплено' : 'ждёт покупки'} · ${p.envelope === 'extra' ? 'дополнительные' : 'обычные'}`,
    icon: categoryIcon(p.title),
    color,
    amount: p.amount,
    symbol: d.symbol,
    href: here({ edit: key }),
    actions: [{ label: p.done ? 'Не куплено' : 'Куплено', action: href(`/purchases/${p.id}/done`) }],
  });
}

function wishItem({ d, href, here }: Page, wish: Wish, advice: Advice): Html {
  const key = `wish-${wish.id}`;
  const form = d.form?.kind === 'wish' && d.form.id === wish.id ? d.form : null;
  if (form || d.edit === key) {
    return entryForm({
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

/**
 * Spending opens to show where it can be moved; it counts towards its week until moved. A payment of a regular
 * expense is outside the budget unless moved, and it cannot go back to the week while it is linked.
 */
function spendingItem({ d, href, here }: Page, o: Operation): Html {
  const key = `spending-${o.id}`;
  const envelope = envelopeOf({ marks: d.marks }, o);
  const open = d.edit === key;
  const moves = ENVELOPES.filter((e) => e !== envelope && !(e === 'week' && o.regular));
  return entryRow({
    title: o.payee,
    details: [`${dayMonth(o.date)}, ${o.account}`, o.regular?.title, ENVELOPE_NAME[envelope]].filter(Boolean).join(' · '),
    icon: o.category ? categoryIcon(o.category.title) : 'tag',
    color: categoryColor(o.category?.id ?? null, o.category?.color ?? null),
    amount: o.amount,
    symbol: d.symbol,
    href: open ? here() : here({ edit: key }),
    actions: open ? moves.map((e) => ({ label: MOVE_TO[e], action: href(`/spending/${o.id}/${e}`) })) : [],
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

/** 5–11 октября, or 28 сентября – 4 октября across months. */
export function weekLabel(week: DateString): string {
  const end = addDays(week, 6);
  return week.slice(0, 7) === end.slice(0, 7) ? `${Number(week.slice(8, 10))}–${dayMonth(end)}` : `${dayMonth(week)} – ${dayMonth(end)}`;
}

/** Ends a sentence with a dot, unless it already ends with one, as after «руб.». */
function sentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}

function weekSentence(d: DashboardData, w: WeekSummary, isCurrent: boolean): string {
  const s = d.symbol;
  const spent = `потрачено ${money(w.spent, s)} из ${money(WEEK_LIMIT, s)}`;
  if (!isCurrent) return sentence(`За эту неделю ${spent}, ${w.free < 0 ? 'перерасход' : 'осталось'} ${money(Math.abs(w.free), s)}`);
  const plan = w.planned > 0 ? `, ещё ${money(w.planned, s)} ждут покупок из плана` : '';
  return w.free >= 0
    ? `${sentence(`Можно потратить ещё ${money(w.free, s)}`)} ${sentence(`${capitalize(spent)}${plan}`)}`
    : sentence(`Неделя в минусе на ${money(-w.free, s)}: ${spent}${plan}`);
}

function monthSentence(d: DashboardData): string {
  const s = d.symbol;
  const m = d.extras;
  const spent = d.weeks.reduce((total, w) => total + w.spent, 0);
  return `${sentence(`В ${monthName(m.month, 'prepositional')} на дополнительные осталось ${money(m.free, s)} из ${money(MONTH_LIMIT, s)}`)} ${sentence(
    `По неделям потрачено ${money(spent, s)} из ${money(WEEK_LIMIT * d.weeks.length, s)}`,
  )}`;
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

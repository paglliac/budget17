// PROTOTYPE, throwaway. Question: what should the overview look like when the budget lives in weeks?
// Two variants of / with tabs «Неделя» and «Месяц» instead of months, switchable via ?variant=A|B and the floating bar
// (← / → work too): A «Обзор» keeps the overview's cards, B «План» puts the plan first and the totals on the side.
// Spending is real, from ZenMoney. The week's plan, wishes and where each spending goes (week, extras, outside the
// budget) live in this process's memory, seeded with the plan for the current week, and are lost on restart.
// Nothing is written to ZenMoney or data/settings.db.

import { summarizeBalances } from '../../balances.ts';
import { addDays, monthOf, weekday, type MonthString } from '../../dates.ts';
import { parseAmount, parseTitle } from '../../input.ts';
import { listOperations, type Operation } from '../../ledger.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { capitalize, dayMonth, greeting, money, monthName, num, percent } from '../format.ts';
import { escape, type Html } from '../html.ts';
import { categoryIcon } from '../icons.ts';
import { categoryColor, toneColor } from '../tones.ts';
import { balanceTotal } from '../widgets/accounts.ts';
import { emptyState, field, footnote, pageIntro, section, shareBar } from '../widgets/basics.ts';
import { statCard } from '../widgets/cards.ts';
import { entryForm, entryList, entryRow } from '../widgets/entries.ts';
import { appShell, grid, tabs, topBar } from '../widgets/shell.ts';
import { appRail, userName } from './chrome.ts';
import { accountsPanel } from './dashboard.ts';

const WEEK_LIMIT = 45_000;
const MONTH_LIMIT = 100_000;

type Envelope = 'week' | 'extra' | 'outside';

interface PlanItem {
  id: number;
  title: string;
  amount: number;
  /** Monday of the week it is planned for. */
  week: DateString;
  envelope: Envelope;
  done: boolean;
}

interface Wish {
  id: number;
  title: string;
  amount: number;
}

const memory = {
  seeded: false,
  nextId: 1,
  plans: [] as PlanItem[],
  wishes: [] as Wish[],
  /** Spending moved out of the week; the rest counts as the week's. */
  marks: new Map<string, Envelope>(),
};

/** The plan the user sent for this week, and one wish. */
function seed(today: DateString): void {
  if (memory.seeded) return;
  memory.seeded = true;
  const week = weekOf(today);
  const plan: Array<[string, number, Envelope]> = [
    ['Ласты, шапочка', 5000, 'week'],
    ['Ботинки Савве', 8000, 'week'],
    ['Школа, ЛДК', 45000, 'outside'],
    ['Продукты', 3000, 'week'],
    ['Подарок Серёге В.', 5000, 'week'],
    ['Проезд', 1000, 'week'],
  ];
  for (const [title, amount, envelope] of plan) memory.plans.push({ id: memory.nextId++, title, amount, week, envelope, done: false });
  memory.wishes.push({ id: memory.nextId++, title: 'Укладка для волос', amount: 4500 });
}

// ---- Figures

const weekOf = (date: DateString): DateString => addDays(date, -weekday(date));
/** A week belongs to the month that holds its Thursday, so every week counts in exactly one month. */
const monthOfWeek = (week: DateString): MonthString => monthOf(addDays(week, 3));
const envelopeOf = (o: Operation): Envelope => memory.marks.get(o.id) ?? 'week';
const sum = (xs: number[]): number => xs.reduce((total, x) => total + x, 0);
/** Ends a sentence with a dot, unless it already ends with one, as after «руб.». */
const sentence = (text: string): string => (text.endsWith('.') ? text : `${text}.`);

function weekLabel(week: DateString): string {
  const end = addDays(week, 6);
  return monthOf(week) === monthOf(end)
    ? `${Number(week.slice(8, 10))}–${dayMonth(end)}`
    : `${dayMonth(week)} – ${dayMonth(end)}`;
}

function weeksOf(month: MonthString): DateString[] {
  let week = weekOf(`${month}-01`);
  if (monthOfWeek(week) !== month) week = addDays(week, 7);
  const weeks: DateString[] = [];
  for (; monthOfWeek(week) === month; week = addDays(week, 7)) weeks.push(week);
  return weeks;
}

interface WeekFigures {
  week: DateString;
  /** Spending that counts towards the week. */
  spent: number;
  /** Purchases of the week's plan not bought yet. */
  planned: number;
  free: number;
  operations: Operation[];
  plans: PlanItem[];
}

function weekFigures(expenses: Operation[], week: DateString): WeekFigures {
  const end = addDays(week, 6);
  const operations = expenses.filter((o) => o.date >= week && o.date <= end);
  const plans = memory.plans.filter((p) => p.week === week);
  const spent = sum(operations.filter((o) => envelopeOf(o) === 'week').map((o) => o.amount));
  const planned = sum(plans.filter((p) => !p.done && p.envelope === 'week').map((p) => p.amount));
  return { week, spent, planned, free: WEEK_LIMIT - spent - planned, operations, plans };
}

interface MonthFigures {
  month: MonthString;
  spent: number;
  planned: number;
  free: number;
  operations: Operation[];
  plans: PlanItem[];
}

function monthFigures(expenses: Operation[], month: MonthString): MonthFigures {
  const operations = expenses.filter((o) => envelopeOf(o) === 'extra' && monthOfWeek(weekOf(o.date)) === month);
  const plans = memory.plans.filter((p) => p.envelope === 'extra' && monthOfWeek(p.week) === month);
  const spent = sum(operations.map((o) => o.amount));
  const planned = sum(plans.filter((p) => !p.done).map((p) => p.amount));
  return { month, spent, planned, free: MONTH_LIMIT - spent - planned, operations, plans };
}

interface Advice {
  text: string;
  /** Where the wish goes when planned; null when it fits nowhere. */
  target: { week: DateString; envelope: Envelope } | null;
}

/** When to buy: the first of the next 8 weeks with room for it, or the month's extras. */
function advise(expenses: Operation[], wish: Wish, today: DateString, symbol: string): Advice {
  const current = weekOf(today);
  const extras = monthFigures(expenses, monthOfWeek(current));
  const extrasFit = extras.free >= wish.amount;
  for (let i = 0; i < 8; i++) {
    const week = addDays(current, 7 * i);
    const f = weekFigures(expenses, week);
    if (f.free < wish.amount) continue;
    const target = { week, envelope: 'week' as const };
    if (i === 0) return { text: `Можно на этой неделе, останется ${money(f.free - wish.amount, symbol)}`, target };
    const when = i === 1 ? 'На следующей неделе' : `На неделе ${weekLabel(week)}`;
    return { text: extrasFit ? `${when} или сейчас из дополнительных` : `${when}: на этой не хватает ${money(wish.amount - weekFigures(expenses, current).free, symbol)}`, target };
  }
  if (extrasFit) {
    return {
      text: `Только из дополнительных: в ${monthName(extras.month, 'prepositional')} останется ${money(extras.free - wish.amount, symbol)}`,
      target: { week: current, envelope: 'extra' },
    };
  }
  return { text: 'Не влезает ни в неделю, ни в дополнительные', target: null };
}

// ---- Actions: links (?act=) and forms (POST /prototype/plan, /prototype/wish). They change memory only.

const NEXT_ENVELOPE: Record<Envelope, Envelope> = { week: 'extra', extra: 'outside', outside: 'week' };

/** Applies an ?act= link and returns the URL to go back to, or null when there is nothing to apply. */
export function prototypeAction(params: URLSearchParams, data: EntityCollections, today: DateString): string | null {
  const act = params.get('act');
  if (!act) return null;
  seed(today);
  const id = params.get('id') ?? '';
  if (act === 'done') {
    const plan = memory.plans.find((p) => String(p.id) === id);
    if (plan) plan.done = !plan.done;
  } else if (act === 'move') {
    const next = NEXT_ENVELOPE[memory.marks.get(id) ?? 'week'];
    if (next === 'week') memory.marks.delete(id);
    else memory.marks.set(id, next);
  } else if (act === 'schedule') {
    const wish = memory.wishes.find((w) => String(w.id) === id);
    if (wish) {
      const symbol = summarizeBalances(data).mainInstrument.symbol;
      const { target } = advise(expenses(data, today), wish, today, symbol);
      if (target) {
        memory.wishes = memory.wishes.filter((w) => w !== wish);
        memory.plans.push({ id: memory.nextId++, title: wish.title, amount: wish.amount, ...target, done: false });
      }
    }
  }
  const back = new URLSearchParams(params);
  back.delete('act');
  back.delete('id');
  const query = back.toString();
  return query ? `/?${query}` : '/';
}

/** Adds a purchase to a week's plan or a wish; returns the URL to go back to. */
export function submitPrototype(path: string, body: URLSearchParams): string {
  const back = body.get('back') ?? '/';
  const title = parseTitle(body.get('title') ?? '');
  const amount = parseAmount(body.get('amount') ?? '');
  if ('value' in title && 'value' in amount) {
    if (path === '/prototype/plan') {
      const week = body.get('week') ?? '';
      const envelope = body.get('envelope') === 'extra' ? 'extra' : 'week';
      if (/^\d{4}-\d{2}-\d{2}$/.test(week)) memory.plans.push({ id: memory.nextId++, title: title.value, amount: amount.value, week, envelope, done: false });
    } else if (path === '/prototype/wish') {
      memory.wishes.push({ id: memory.nextId++, title: title.value, amount: amount.value });
    }
  }
  return back.startsWith('/') ? back : '/';
}

function expenses(data: EntityCollections, today: DateString): Operation[] {
  const from = weekOf(addDays(today, -62));
  return listOperations(data, { from, to: addDays(today, 62) }).filter((o) => o.kind === 'expense');
}

// ---- Page

interface Page {
  data: EntityCollections;
  today: DateString;
  hour: number;
  symbol: string;
  expenses: Operation[];
  view: 'week' | 'month';
  /** The week shown on the week tab: the current one or one opened from the month. */
  week: DateString;
  month: MonthString;
  link: (params: Record<string, string | null>) => string;
  /** This page's URL, for forms to come back to. */
  self: string;
  canSync: boolean;
  source: 'zenmoney' | 'demo';
}

interface Variant {
  key: string;
  name: string;
  week: (p: Page) => { main: Html[]; side: Html[] };
  month: (p: Page) => { main: Html[]; side: Html[] };
}

export function renderPrototype(
  data: EntityCollections,
  options: { today: DateString; hour: number; params: URLSearchParams; canSync: boolean; source: 'zenmoney' | 'demo' },
): string {
  const { today, params } = options;
  seed(today);
  const variant = VARIANTS.find((v) => v.key === params.get('variant')?.toUpperCase()) ?? VARIANTS[0]!;
  const current = weekOf(today);
  const asked = params.get('week');
  const week = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && weekday(asked) === 0 && asked <= current ? asked : current;
  const link = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const key of ['variant', 'demo', 'view', 'week']) {
      const value = key in changes ? changes[key] : params.get(key);
      if (value !== null && value !== undefined) next.set(key, value);
    }
    for (const [key, value] of Object.entries(changes)) if (value !== null && !next.has(key)) next.set(key, value);
    const query = next.toString();
    return query ? `/?${query}` : '/';
  };
  const page: Page = {
    data,
    today,
    hour: options.hour,
    symbol: summarizeBalances(data).mainInstrument.symbol,
    expenses: expenses(data, today),
    view: params.get('view') === 'month' ? 'month' : 'week',
    week,
    month: monthOfWeek(current),
    link,
    self: link({}),
    canSync: options.canSync,
    source: options.source,
  };
  const { main, side } = variant[page.view](page);
  const body = appShell({
    rail: appRail('overview', userName(data), (path) => path),
    tabs: tabs({
      label: 'Период',
      items: [
        { label: 'Неделя', icon: 'calendar', href: link({ view: null, week: null }), active: page.view === 'week' },
        { label: 'Месяц', icon: 'calendar', href: link({ view: 'month', week: null }), active: page.view === 'month' },
      ],
    }),
    main,
    side,
  });
  let markup = pageDocument({ title: 'Бюджет', body }).toString();
  if (process.env.NODE_ENV !== 'production') markup = markup.replace('</body>', `${switcher(variant, link)}\n</body>`);
  return markup;
}

// ---- Pieces both variants use

const ENVELOPE_NAME: Record<Envelope, string> = { week: 'в неделе', extra: 'дополнительные', outside: 'вне бюджета' };

function planRow(p: Page, plan: PlanItem): Html {
  const where = plan.envelope === 'outside' ? 'вне бюджета' : plan.envelope === 'extra' ? 'дополнительные' : 'обычные';
  return entryRow({
    title: plan.title,
    details: plan.envelope === 'outside' ? 'регулярная, вне бюджета' : plan.done ? `куплено ✓ · ${where}` : `ждёт покупки · ${where}`,
    icon: plan.done ? 'target' : categoryIcon(plan.title),
    color: plan.done ? toneColor('gray') : plan.envelope === 'extra' ? toneColor('violet') : plan.envelope === 'outside' ? toneColor('gray') : categoryColor(`plan:${plan.id}`, null),
    amount: plan.amount,
    symbol: p.symbol,
    href: p.link({ act: 'done', id: String(plan.id) }),
  });
}

function spendRow(p: Page, o: Operation): Html {
  return entryRow({
    title: o.payee,
    details: `${dayMonth(o.date)}, ${o.account} · ${ENVELOPE_NAME[envelopeOf(o)]}`,
    icon: o.category ? categoryIcon(o.category.title) : 'tag',
    color: categoryColor(o.category?.id ?? null, o.category?.color ?? null),
    amount: o.amount,
    symbol: p.symbol,
    href: p.link({ act: 'move', id: o.id }),
  });
}

function wishRows(p: Page): Html[] {
  return memory.wishes.map((w) => {
    const advice = advise(p.expenses, w, p.today, p.symbol);
    return entryRow({
      title: w.title,
      details: advice.target ? `${advice.text} · нажмите, чтобы запланировать` : advice.text,
      icon: 'sparkles',
      color: toneColor('yellow'),
      amount: w.amount,
      symbol: p.symbol,
      href: p.link({ act: 'schedule', id: String(w.id) }),
    });
  });
}

function addForm(p: Page, options: { action: string; label: string; placeholder: string; hidden?: Record<string, string> }): Html {
  return entryForm({
    action: options.action,
    submitLabel: options.label,
    icon: 'plus',
    color: toneColor('gray'),
    fields: [
      field({ label: 'Что', name: 'title', placeholder: options.placeholder, maxLength: 80, required: true }),
      field({ label: `Сумма, ${p.symbol}`, name: 'amount', type: 'decimal', placeholder: '4 500', width: 130, required: true }),
    ],
    hidden: { ...options.hidden, back: p.self },
  });
}

function planList(p: Page, f: WeekFigures): Html {
  return entryList({
    label: 'План на неделю',
    items: [
      ...f.plans.map((plan) => planRow(p, plan)),
      addForm(p, { action: '/prototype/plan', label: 'В план', placeholder: 'Например, ботинки', hidden: { week: f.week, envelope: 'week' } }),
    ],
  });
}

function wishList(p: Page): Html {
  return entryList({
    label: 'Хочу купить',
    items: [...wishRows(p), addForm(p, { action: '/prototype/wish', label: 'Хочу', placeholder: 'Например, укладка для волос' })],
  });
}

function spendList(p: Page, f: WeekFigures): Html[] {
  if (f.operations.length === 0) return [emptyState({ text: 'На этой неделе трат пока нет.' })];
  return [
    entryList({ label: 'Траты недели', items: f.operations.map((o) => spendRow(p, o)) }),
    footnote({ text: 'Все траты по умолчанию идут в неделю. Нажмите на трату, чтобы перенести её в дополнительные, ещё раз — вне бюджета.' }),
  ];
}

function extrasList(p: Page, m: MonthFigures): Html {
  return entryList({
    label: 'Дополнительные',
    items: [
      ...m.plans.map((plan) => planRow(p, plan)),
      ...m.operations.map((o) => spendRow(p, o)),
      addForm(p, { action: '/prototype/plan', label: 'В план', placeholder: 'Например, куртка', hidden: { week: weekOf(p.today), envelope: 'extra' } }),
    ],
  });
}

function weekSentence(p: Page, f: WeekFigures): string {
  const s = p.symbol;
  if (f.week < weekOf(p.today)) {
    return f.free >= 0
      ? sentence(`За неделю ${weekLabel(f.week)} потрачено ${money(f.spent, s)} из ${money(WEEK_LIMIT, s)}, осталось ${money(f.free, s)}`)
      : sentence(`За неделю ${weekLabel(f.week)} потрачено ${money(f.spent, s)} из ${money(WEEK_LIMIT, s)}, перерасход ${money(-f.free, s)}`);
  }
  const plan = f.planned > 0 ? `, ещё ${money(f.planned, s)} ждут покупок из плана` : '';
  return f.free >= 0
    ? sentence(`${sentence(`На этой неделе можно потратить ещё ${money(f.free, s)}`)} Потрачено ${money(f.spent, s)} из ${money(WEEK_LIMIT, s)}${plan}`)
    : sentence(`Неделя в минусе на ${money(-f.free, s)}: потрачено ${money(f.spent, s)} из ${money(WEEK_LIMIT, s)}${plan}`);
}

function monthSentence(p: Page, m: MonthFigures, weeks: WeekFigures[]): string {
  const s = p.symbol;
  const spent = sum(weeks.map((w) => w.spent));
  return sentence(
    `${sentence(`В ${monthName(m.month, 'prepositional')} на дополнительные осталось ${money(m.free, s)} из ${money(MONTH_LIMIT, s)}`)} По неделям потрачено ${money(spent, s)} из ${money(WEEK_LIMIT * weeks.length, s)}`,
  );
}

// ---- Variant A «Обзор»: the overview as it is, with the week instead of the month.

const variantA: Variant = {
  key: 'A',
  name: 'Обзор',
  week(p) {
    const f = weekFigures(p.expenses, p.week);
    const m = monthFigures(p.expenses, p.month);
    const purchases = f.plans.filter((x) => x.envelope !== 'outside');
    const done = purchases.filter((x) => x.done).length;
    return {
      main: [
        topBar({ crumbs: [{ label: 'Бюджет' }, { label: `Неделя ${weekLabel(f.week)}`, icon: 'calendar' }] }),
        pageIntro({ title: greeting(p.hour), emoji: '👋', text: weekSentence(p, f) }),
        grid({
          columns: 3,
          min: 220,
          items: [
            statCard({
              icon: 'wallet',
              tone: f.free < 0 ? 'red' : 'yellow',
              title: 'Можно потратить',
              label: `из ${money(WEEK_LIMIT, p.symbol)}`,
              value: money(f.free, p.symbol),
              progress: (f.spent + f.planned) / WEEK_LIMIT,
            }),
            statCard({
              icon: 'list',
              tone: 'violet',
              title: 'План',
              label: `Куплено ${done} из ${purchases.length}`,
              value: money(f.planned, p.symbol),
              progress: purchases.length ? done / purchases.length : 0,
            }),
            statCard({
              icon: 'piggy',
              tone: m.free < 0 ? 'red' : 'teal',
              title: 'Дополнительные',
              label: `Осталось в ${monthName(m.month, 'prepositional')}`,
              value: money(m.free, p.symbol),
              progress: (m.spent + m.planned) / MONTH_LIMIT,
              action: { label: 'Месяц', href: p.link({ view: 'month', week: null }) },
            }),
          ],
        }),
        section({ title: 'План на неделю', body: planList(p, f) }),
        section({ title: 'Хочу купить', body: wishList(p) }),
        section({ title: 'Траты недели', body: spendList(p, f) }),
      ],
      side: accountsPanel({ balances: summarizeBalances(p.data), canSync: p.canSync, source: p.source }),
    };
  },
  month(p) {
    const m = monthFigures(p.expenses, p.month);
    const current = weekOf(p.today);
    const weeks = weeksOf(p.month).map((w) => weekFigures(p.expenses, w));
    return {
      main: [
        topBar({ crumbs: [{ label: 'Бюджет' }, { label: capitalize(monthName(p.month)), icon: 'calendar' }] }),
        pageIntro({ title: greeting(p.hour), emoji: '👋', text: monthSentence(p, m, weeks) }),
        section({
          title: 'Недели',
          body: grid({
            columns: 3,
            min: 200,
            items: weeks.map((w) =>
              statCard({
                icon: 'calendar',
                tone: w.free < 0 ? 'red' : w.week === current ? 'violet' : 'yellow',
                title: weekLabel(w.week),
                label: w.week > current ? 'Впереди' : `${num(w.spent)} из ${money(WEEK_LIMIT, p.symbol)}`,
                value: w.week > current ? money(w.free, p.symbol) : percent(w.spent / WEEK_LIMIT),
                progress: w.spent / WEEK_LIMIT,
                action: w.week <= current ? { label: 'Открыть', href: p.link({ view: null, week: w.week === current ? null : w.week }) } : undefined,
              }),
            ),
          }),
        }),
        section({ title: `Дополнительные: осталось ${money(m.free, p.symbol)}`, body: extrasList(p, m) }),
      ],
      side: accountsPanel({ balances: summarizeBalances(p.data), canSync: p.canSync, source: p.source }),
    };
  },
};

// ---- Variant B «План»: the plan is the page, the totals sit on the side.

const variantB: Variant = {
  key: 'B',
  name: 'План',
  week(p) {
    const f = weekFigures(p.expenses, p.week);
    return {
      main: [
        topBar({ crumbs: [{ label: 'Бюджет' }, { label: `Неделя ${weekLabel(f.week)}`, icon: 'calendar' }] }),
        pageIntro({ title: `Неделя ${weekLabel(f.week)}`, text: weekSentence(p, f) }),
        section({ title: 'План', body: planList(p, f) }),
        section({ title: 'Хочу купить', body: wishList(p) }),
      ],
      side: [
        topBar({ crumbs: [{ label: 'Можно потратить' }] }),
        balanceTotal({ amount: f.free, symbol: p.symbol, note: `из ${money(WEEK_LIMIT, p.symbol)} на неделю` }),
        shareBar({
          label: 'Неделя',
          parts: [
            { label: 'Потрачено', value: f.spent, color: toneColor('yellow') },
            { label: 'План', value: f.planned, color: toneColor('violet') },
            { label: 'Свободно', value: f.free, color: toneColor('gray') },
          ],
        }),
        topBar({ crumbs: [{ label: 'Траты недели' }] }),
        ...spendList(p, f),
      ],
    };
  },
  month(p) {
    const m = monthFigures(p.expenses, p.month);
    const current = weekOf(p.today);
    const weeks = weeksOf(p.month).map((w) => weekFigures(p.expenses, w));
    return {
      main: [
        topBar({ crumbs: [{ label: 'Бюджет' }, { label: capitalize(monthName(p.month)), icon: 'calendar' }] }),
        pageIntro({ title: capitalize(monthName(p.month)), text: monthSentence(p, m, weeks) }),
        section({
          title: 'Недели',
          body: entryList({
            label: 'Недели',
            items: weeks.map((w) =>
              entryRow({
                title: `Неделя ${weekLabel(w.week)}`,
                details:
                  w.week > current
                    ? 'впереди · можно потратить'
                    : `${w.week === current ? 'идёт' : 'прошла'} · потрачено ${money(w.spent, p.symbol)} · ${w.free < 0 ? 'перерасход' : 'осталось'}`,
                icon: 'calendar',
                color: toneColor(w.free < 0 ? 'red' : w.week === current ? 'violet' : 'yellow'),
                amount: Math.abs(w.free),
                symbol: p.symbol,
                href: w.week <= current ? p.link({ view: null, week: w.week === current ? null : w.week }) : p.self,
              }),
            ),
          }),
        }),
        section({ title: 'Дополнительные', body: extrasList(p, m) }),
      ],
      side: [
        topBar({ crumbs: [{ label: 'Дополнительные' }] }),
        balanceTotal({ amount: m.free, symbol: p.symbol, note: `осталось из ${money(MONTH_LIMIT, p.symbol)} в ${monthName(m.month, 'prepositional')}` }),
        shareBar({
          label: 'Дополнительные',
          parts: [
            { label: 'Потрачено', value: m.spent, color: toneColor('yellow') },
            { label: 'План', value: m.planned, color: toneColor('violet') },
            { label: 'Свободно', value: m.free, color: toneColor('gray') },
          ],
        }),
        footnote({ text: 'Дополнительные — то, что вы отметили как дополнительное: покупки из плана и перенесённые траты.' }),
      ],
    };
  },
};

const VARIANTS: Variant[] = [variantA, variantB];

// ---- Floating switcher: deliberately loud blue and monospace, so it never reads as part of the design.

function switcher(current: Variant, link: Page['link']): string {
  const index = VARIANTS.indexOf(current);
  const hrefs = VARIANTS.map((v) => link({ variant: v.key }));
  const prev = hrefs[(index - 1 + VARIANTS.length) % VARIANTS.length]!;
  const next = hrefs[(index + 1) % VARIANTS.length]!;
  return `
<div id="proto-switcher" role="toolbar" aria-label="Варианты прототипа">
  <a href="${escape(prev)}" aria-label="Предыдущий вариант">‹</a>
  <span><b>${escape(current.key)}</b> ${escape(current.name)} <i>${index + 1}/${VARIANTS.length}</i></span>
  <a href="${escape(next)}" aria-label="Следующий вариант">›</a>
</div>
<style>
  #proto-switcher { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 2147483647; display: flex; align-items: center; gap: 4px;
    padding: 5px; border-radius: 999px; background: #1F4BFF; color: #fff; font: 500 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    box-shadow: 0 10px 30px -8px rgb(31 75 255 / .6), 0 0 0 3px rgb(255 255 255 / .9); }
  #proto-switcher a { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 999px; background: rgb(255 255 255 / .16); color: #fff; font-size: 18px; }
  #proto-switcher a:hover { background: rgb(255 255 255 / .28); }
  #proto-switcher span { padding: 0 10px; white-space: nowrap; }
  #proto-switcher b { display: inline-block; padding: 3px 6px; margin-right: 4px; border-radius: 6px; background: #fff; color: #1F4BFF; }
  #proto-switcher i { font-style: normal; opacity: .7; }
</style>
<script>
  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select')) return;
    if (event.key === 'ArrowLeft') location.href = ${JSON.stringify(prev)};
    if (event.key === 'ArrowRight') location.href = ${JSON.stringify(next)};
  });
</script>`;
}

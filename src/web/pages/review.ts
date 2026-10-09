// The month review, /review: what happened with a month's money and what to fix, the month just gone unless
// ?month= asks for another. The main column holds income, spending and what is left, where the income went, the weeks
// against their limits, ordinary spending a week by category against the months before, what to check, and the
// regular payments. The side is the assistant: what it found and its answers to four questions (?ask=), worked out by
// rules from the review for now (see src/review.ts). What to check opens on its own page, /review/check?kind=, one
// kind at a time by day; an expense opens in place there by ?edit=spending-<ZenMoney id> to be marked as on every page
// (see marking.ts), and leaves the list once it is explained.

import { mainCurrency } from '../../balances.ts';
import { addDays, monthOf, shiftMonth } from '../../dates.ts';
import { listOperations, type Operation } from '../../ledger.ts';
import type { RegularExpense } from '../../regular.ts';
import {
  findings,
  isToCheck,
  ordinaryPerWeek,
  reviewMonth,
  TO_CHECK,
  transferHint,
  weekThatHolds,
  worstWeek,
  type CategoryWeekly,
  type Finding,
  type MonthReview,
  type ReviewedExpense,
  type ToCheck,
} from '../../review.ts';
import { MONTH_LIMIT, WEEK_LIMIT, weeksOfMonth, type WeekSummary } from '../../week.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { capitalize, dayMonth, money, monthName, percent, plural } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryIcon, type IconName } from '../icons.ts';
import { categoryColor, toneColor, type Tone } from '../tones.ts';
import { balanceTotal } from '../widgets/accounts.ts';
import { assistantAnswer, assistantHero, insightList } from '../widgets/assistant.ts';
import { emptyState, listHeading, pageIntro, segmentedLinks } from '../widgets/basics.ts';
import { figureCard, panelCard } from '../widgets/cards.ts';
import { flowChart, weekBars } from '../widgets/charts.ts';
import { amountList, dayGroup, operationRow } from '../widgets/operations.ts';
import { appShell, grid, stack, toolbar, topBar } from '../widgets/shell.ts';
import { appRail, monthTabs, parseMonth, userName, type Href } from './chrome.ts';
import { budgetOf, type SavedBudget } from './dashboard.ts';
import { allExpenses, envelopeMark, loadMarking, markingActions, markingPanel, markingTitle, type Marking } from './marking.ts';

/** Questions to the assistant, as its chips offer them. */
type Question = 'overspend' | 'check' | 'optimize' | 'plan';

const QUESTIONS: Array<{ key: Question; label: string; icon: IconName }> = [
  { key: 'overspend', label: 'Где перерасход и почему', icon: 'trendingUp' },
  { key: 'check', label: 'Какие траты проверить', icon: 'search' },
  { key: 'optimize', label: 'На чём сэкономить', icon: 'piggy' },
  { key: 'plan', label: 'План на следующий месяц', icon: 'target' },
];

const TO_CHECK_ROWS: Record<ToCheck, { title: string; icon: IconName; tone: Tone }> = {
  person: { title: 'Переводы людям', icon: 'arrowUpRight', tone: 'blue' },
  self: { title: 'Переводы себе', icon: 'card', tone: 'violet' },
  untitled: { title: 'Без категории', icon: 'tag', tone: 'gray' },
};

export interface ReviewData {
  today: DateString;
  review: MonthReview;
  findings: Finding[];
  ask: Question | null;
  /** On /review/check: the kind of expenses listed. */
  kind: ToCheck;
  /** For hints at what a transfer to oneself paid. */
  regular: RegularExpense[];
  marking: Marking;
  /** What is open for marking: spending-<ZenMoney id>. */
  edit: string | null;
  symbol: string;
  userName: string | null;
}

export function loadReview(
  data: EntityCollections,
  saved: SavedBudget,
  options: { today: DateString; month?: string | null; ask?: string | null; kind?: string | null; edit?: string | null },
): ReviewData {
  const { today } = options;
  const month = options.month ? parseMonth(options.month, monthOf(today)) : shiftMonth(monthOf(today), -1);
  const weeks = weeksOfMonth(month, saved.weekStart);
  // Three months before tell what is usual.
  const earliest = weeksOfMonth(shiftMonth(month, -3), saved.weekStart)[0] ?? weeks[0]!;
  const budget = budgetOf(data, saved, { today, from: earliest });
  const incomes = listOperations(data, { from: weeks[0]!, to: addDays(weeks.at(-1)!, 6) }, saved).filter((o) => o.kind === 'income');
  const review = reviewMonth(budget, incomes, { month, today, selfPayee: saved.selfPayee ?? null });
  const kind = TO_CHECK.find((k) => k === options.kind) ?? TO_CHECK.find((k) => review.toCheck.some((e) => e.kind === k)) ?? 'person';
  return {
    today,
    review,
    findings: findings(review, today, saved.regular),
    ask: QUESTIONS.find((q) => q.key === options.ask)?.key ?? null,
    kind,
    regular: saved.regular,
    marking: loadMarking(data, saved, allExpenses(data, saved), today),
    edit: options.edit ?? null,
    symbol: mainCurrency(data).symbol,
    userName: userName(data),
  };
}

interface Page {
  d: ReviewData;
  href: Href;
  /** This page with an expense open or closed, keeping the rest of its state. */
  here: (changes: { edit?: string | null; ask?: string | null }) => string;
}

/** The page of one kind of expenses to check, with one of them open. */
function checkHref(d: ReviewData, href: Href, kind: ToCheck, edit?: string): string {
  return `${href('/review/check', { month: d.review.month, kind, edit })}${edit ? `#${edit}` : ''}`;
}

export function renderReview(d: ReviewData, href: Href): Html {
  const here: Page['here'] = (changes) => href('/review', { month: d.review.month, ask: d.ask, ...changes });
  const page: Page = { d, href, here };
  const body = appShell({
    rail: appRail('review', d.userName, href),
    tabs: monthTabs(monthOf(d.today), d.review.month, (m) => href('/review', { month: m ?? monthOf(d.today) })),
    main: main(page),
    side: side(page),
    wideSide: true,
  });
  return pageDocument({ title: 'Бюджет: разбор месяца', body });
}

// ---- Words

function count(n: number, forms: readonly [string, string, string]): string {
  return `${n} ${plural(n, forms)}`;
}

const EXPENSES = ['трата', 'траты', 'трат'] as const;
const TRANSFERS = ['перевод', 'перевода', 'переводов'] as const;

function span(r: MonthReview): string {
  return `${dayMonth(r.from)} – ${dayMonth(r.to)}, ${count(r.weeks.length, ['неделя', 'недели', 'недель'])}`;
}

function weekTitle(w: WeekSummary): string {
  return `${dayMonth(w.week)} – ${dayMonth(addDays(w.week, 6))}`;
}

/** Ends a sentence with a full stop, unless it already ends with one, as an amount in «руб.» does. */
function stop(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}

function sumOf(list: ReviewedExpense[]): number {
  return list.reduce((s, e) => s + e.operation.amount, 0);
}

/** How a category's week compares with its usual one: new, +39%, −49%, ×11, or nothing when about the same. */
function versusUsual(c: CategoryWeekly): string | undefined {
  if (c.usual === null) return 'новое';
  const ratio = c.perWeek / c.usual;
  if (Math.abs(ratio - 1) < 0.1) return undefined;
  if (ratio >= 2) return `×${Math.round(ratio)}`;
  return ratio > 1 ? `+${percent(ratio - 1)}` : `−${percent(1 - ratio)}`;
}

// ---- Main column

function main(page: Page): Html[] {
  const { d, href, here } = page;
  const r = d.review;
  const over = r.inWeeks - r.limits;
  return [
    topBar({ crumbs: [{ label: span(r), icon: 'calendar' }] }),
    pageIntro({
      title: `Разбор ${monthName(r.month, 'genitive')}`,
      text: 'Что произошло с деньгами и что стоит поправить.',
      badge: d.findings.length ? { text: `ассистент сделал ${count(d.findings.length, ['вывод', 'вывода', 'выводов'])}`, tone: 'green' } : undefined,
    }),
    grid({
      columns: 3,
      min: 200,
      items: [
        figureCard({ label: 'Доход', amount: r.income, symbol: d.symbol }),
        figureCard({
          label: 'Потрачено',
          amount: r.spent,
          symbol: d.symbol,
          note: r.income > 0 ? `${percent(r.spent / r.income)} от дохода` : undefined,
          progress: { value: r.income > 0 ? r.spent / r.income : 1, tone: 'violet' },
        }),
        figureCard({
          label: r.left >= 0 ? 'Осталось' : 'Не хватило',
          amount: Math.abs(r.left),
          symbol: d.symbol,
          note: r.income > 0 ? `${percent(Math.abs(r.left) / r.income)} дохода` : undefined,
          progress: { value: r.income > 0 ? Math.abs(r.left) / r.income : 0, tone: r.left >= 0 ? 'teal' : 'red' },
        }),
      ],
    }),
    panelCard({
      title: 'Куда ушли деньги',
      amount: r.spent,
      symbol: d.symbol,
      body: flowChart({
        label: 'Куда ушёл доход',
        source: { label: 'доход', amount: r.income },
        symbol: d.symbol,
        parts: [
          { label: 'Недели', amount: r.inWeeks, color: toneColor('yellow') },
          { label: 'Регулярные', amount: r.regular, color: toneColor('gray') },
          { label: 'Дополнительные', amount: r.extra, color: toneColor('violet') },
          { label: 'Вне бюджета', amount: r.outside, color: toneColor('blue') },
          { label: 'Осталось', amount: r.left, color: toneColor('teal') },
        ],
      }),
    }),
    grid({
      columns: 2,
      min: 320,
      items: [
        panelCard({
          title: 'Недельные траты',
          amount: r.inWeeks,
          symbol: d.symbol,
          note: `при плане ${money(r.limits, d.symbol)}`,
          badge: { text: money(over, d.symbol, { sign: true }), tone: over > 0 ? 'red' : 'green' },
          href: here({ ask: 'overspend' }),
          body: weekBars({
            label: 'Траты недель против их лимитов',
            bars: r.weeks.map((w, i) => ({
              label: `Нед. ${i + 1}`,
              value: w.spent,
              limit: w.limit,
              title: `${weekTitle(w)}: ${money(w.spent, d.symbol)} из ${money(w.limit, d.symbol)}`,
              href: href('/', { week: w.week }),
              ahead: w.week > d.today,
            })),
          }),
        }),
        panelCard({
          title: 'Обычные траты в неделю',
          amount: ordinaryPerWeek(r),
          symbol: d.symbol,
          note: `при плане ${money(WEEK_LIMIT, d.symbol)}`,
          href: here({ ask: 'optimize' }),
          body: r.categories.length
            ? amountList({
                label: 'Обычные траты по категориям в неделю',
                items: r.categories.slice(0, 7).map((c) => ({
                  label: c.title,
                  amount: c.perWeek,
                  color: categoryColor(c.id, c.color),
                  share: c.perWeek / r.categories[0]!.perWeek,
                  note: versusUsual(c),
                })),
              })
            : emptyState({ text: 'Трат с категорией в неделях нет.' }),
        }),
        panelCard({
          title: 'Проверить',
          amount: sumOf(r.toCheck),
          symbol: d.symbol,
          note: count(r.toCheck.length, EXPENSES),
          body: toCheckRows(page, null),
        }),
        panelCard({
          title: 'Регулярные платежи',
          amount: r.regular,
          symbol: d.symbol,
          note: 'вне лимитов',
          href: href('/regular'),
          body: r.regular > 0 ? amountList({ label: 'Регулярные платежи месяца', items: regularRows(r) }) : emptyState({ text: 'Платежей регулярных трат нет.' }),
        }),
      ],
    }),
  ];
}

/** The kinds of expenses to check, each leading to its page; the one listed there is highlighted. */
function toCheckRows(page: Page, current: ToCheck | null, options: { counts?: boolean } = {}): Html {
  const { d, href } = page;
  const kinds = TO_CHECK.filter((k) => d.review.toCheck.some((e) => e.kind === k));
  if (!kinds.length) return emptyState({ text: 'Всё, что считается в неделях, размечено.' });
  return amountList({
    label: 'Траты, про которые непонятно, что это',
    symbol: d.symbol,
    items: kinds.map((k) => {
      const items = d.review.toCheck.filter((e) => e.kind === k);
      return {
        label: TO_CHECK_ROWS[k].title,
        icon: TO_CHECK_ROWS[k].icon,
        tone: TO_CHECK_ROWS[k].tone,
        amount: sumOf(items),
        note: options.counts === false ? undefined : `${items.length} шт.`,
        href: checkHref(d, href, k),
        active: k === current,
      };
    }),
  });
}

function regularRows(r: MonthReview): Array<{ label: string; amount: number }> {
  const rows = new Map<string, number>();
  for (const { operation: o, kind } of r.expenses) {
    if (kind === 'regular' && o.regular) rows.set(o.regular.title, (rows.get(o.regular.title) ?? 0) + o.amount);
  }
  return [...rows].sort((a, b) => b[1] - a[1]).map(([label, amount]) => ({ label, amount }));
}

/** An expense to check, under its day's heading; it opens in place to be marked. */
function spendRow(page: Page, o: Operation): Html {
  const { d, href, here } = page;
  const key = `spending-${o.id}`;
  const open = d.edit === key;
  const hint = d.review.toCheck.some((e) => e.operation.id === o.id && e.kind === 'self') ? transferHint(o, d.regular) : null;
  return operationRow({
    id: key,
    title: markingTitle(o),
    // Nothing here has a category yet, so the row says the account and what the amount hints at instead.
    details: [o.account, hint === 'marketplace' ? 'похоже на Ozon или WB' : hint ? `сумма «${hint.regular}»` : null].filter(Boolean).join(' · '),
    icon: o.category ? categoryIcon(o.category.title) : 'tag',
    color: categoryColor(o.category?.id ?? null, o.category?.color ?? null),
    kind: 'expense',
    amount: o.amount,
    symbol: d.symbol,
    unsigned: true,
    mark: envelopeMark(d.marking, o),
    href: here({ edit: open ? null : key }),
    panel: open ? markingPanel(d.marking, o, href) : undefined,
    actions: open ? markingActions(d.marking, o, href) : undefined,
  });
}

// ---- The assistant

function side(page: Page): Html[] {
  const { d, here } = page;
  const items = d.findings.map((f) => insight(page, f));
  return [
    assistantHero({
      title: `Разобрал ${monthName(d.review.month)}`,
      text: d.findings.length ? `Нашёл ${count(d.findings.length, ['важный момент', 'важных момента', 'важных моментов'])}.` : 'Ничего особенного не нашёл.',
      chips: QUESTIONS.map((q) => ({ label: q.label, icon: q.icon, href: here({ ask: d.ask === q.key ? null : q.key }), active: d.ask === q.key })),
    }),
    d.ask ? answer(page, d.ask) : null,
    items.length ? listHeading({ title: 'Главные выводы', count: items.length }) : null,
    items.length ? insightList({ label: 'Главные выводы', items }) : null,
  ].filter((block): block is Html => block !== null);
}

function insight(page: Page, f: Finding): { icon: IconName; tone: Tone; title: string; text: string; href?: string } {
  const { d, href, here } = page;
  const s = d.symbol;
  switch (f.kind) {
    case 'overspent':
      return {
        icon: 'trendingUp',
        tone: 'red',
        title: `Недели потратили на ${money(f.over, s)} больше плана`,
        text: stop(`Больше всего — ${weekTitle(f.week)}: ${money(f.week.spent, s)}`),
        href: here({ ask: 'overspend' }),
      };
    case 'unclear':
      return {
        icon: 'flag',
        tone: 'yellow',
        title: `${count(f.count, EXPENSES)} на ${money(f.amount, s)} — непонятно что`,
        text: 'Считаются в неделях, но это переводы и траты без категории.',
        href: here({ ask: 'check' }),
      };
    case 'people':
      return {
        icon: 'arrowUpRight',
        tone: 'blue',
        title: `Переводы людям в неделях: ${money(f.amount, s)}`,
        text: stop(`${count(f.count, TRANSFERS)}, крупнейший — ${f.largest.payee} ${money(f.largest.amount, s)}`),
        href: checkHref(d, href, 'person'),
      };
    case 'self':
      return {
        icon: 'card',
        tone: 'violet',
        title: `Переводы себе: ${money(f.amount, s)}`,
        text: f.marketplace
          ? `${count(f.count, TRANSFERS)}, из них ${f.marketplace} с некруглой суммой похожи на покупки на Ozon и WB.`
          : `${count(f.count, TRANSFERS)}, круглые суммы — кредит или крупная покупка.`,
        href: checkHref(d, href, 'self'),
      };
    case 'grown':
      return {
        icon: categoryIcon(f.category.title),
        tone: 'orange',
        title: `${f.category.title}: ${money(f.category.perWeek, s)} в неделю`,
        text: stop(`Обычно ${money(f.category.usual, s)}, на ${percent(f.category.perWeek / f.category.usual - 1)} больше`),
        href: here({ ask: 'optimize' }),
      };
    case 'extrasUnused':
      return {
        icon: 'check',
        tone: 'green',
        title: 'Дополнительные почти не тронуты',
        text: stop(`${money(f.spent, s)} из ${money(f.limit, s)}: крупные покупки можно планировать туда, а не в недели`),
        href: here({ ask: 'plan' }),
      };
  }
}

function answer(page: Page, ask: Question): Html {
  const { d, href, here } = page;
  const r = d.review;
  const s = d.symbol;
  const closeHref = here({ ask: null });
  const perWeek = ordinaryPerWeek(r);
  /** An expense to check opens on its page; any other on the operations of its month. */
  const open = (e: ReviewedExpense) =>
    isToCheck(e.kind)
      ? checkHref(d, href, e.kind, `spending-${e.operation.id}`)
      : href('/operations', { month: monthOf(e.operation.date), q: e.operation.payee, edit: `spending-${e.operation.id}` });
  const link = (e: ReviewedExpense) => ({ label: `${dayMonth(e.operation.date)} · ${markingTitle(e.operation)}`, detail: money(e.operation.amount, s), href: open(e) });

  if (ask === 'overspend') {
    const week = worstWeek(r, d.today);
    const end = week ? addDays(week.week, 6) : r.to;
    const top = week ? r.expenses.filter((e) => e.envelope === 'week' && e.operation.date >= week.week && e.operation.date <= end).slice(0, 3) : [];
    const ordinaryInWeeks = sumOf(r.expenses.filter((e) => e.kind === 'ordinary' && e.envelope === 'week'));
    return assistantAnswer({
      question: 'Где перерасход и почему',
      paragraphs: [
        stop(`Недели потратили ${money(r.inWeeks, s)} при плане ${money(r.limits, s)}`),
        week ? `Больше всего потратила неделя ${weekTitle(week)}, ${money(week.spent, s)}, и раздули её траты ниже.` : '',
        `Траты с категорией в неделях — ${money(ordinaryInWeeks, s)}, то есть ${money(perWeek, s)} в неделю при плане ${money(WEEK_LIMIT, s)}, остальное — переводы и траты без категории.`,
      ].filter(Boolean),
      links: top.map(link),
      closeHref,
    });
  }
  if (ask === 'check')
    return assistantAnswer({
      question: 'Какие траты проверить',
      paragraphs: r.toCheck.length
        ? [`${count(r.toCheck.length, EXPENSES)} на ${money(sumOf(r.toCheck), s)} ${plural(r.toCheck.length, ['считается', 'считаются', 'считаются'])} в неделях, а что это — непонятно. Крупнейшие:`]
        : ['Всё, что считается в неделях, размечено.'],
      links: r.toCheck.slice(0, 6).map(link),
      closeHref,
    });
  if (ask === 'optimize') {
    const grown = r.categories.filter((c) => c.usual !== null && c.perWeek > c.usual * 1.2 && c.perWeek - c.usual > 1_000);
    const fell = r.categories.filter((c) => c.usual !== null && c.perWeek < c.usual * 0.8);
    return assistantAnswer({
      question: 'На чём сэкономить',
      paragraphs: [
        grown.length
          ? stop(`Выросли: ${grown.map((c) => `${c.title} — ${money(c.perWeek, s)} в неделю вместо ${money(c.usual!, s)}`).join('; ')}`)
          : 'Ни одна категория заметно не выросла.',
        fell.length ? stop(`Меньше обычного: ${fell.map((c) => c.title).join(', ')}`) : '',
        perWeek > WEEK_LIMIT
          ? stop(`Чтобы уложиться в ${money(WEEK_LIMIT, s)} в неделю, траты с категорией надо сократить на ${money(perWeek - WEEK_LIMIT, s)} в неделю`)
          : `Траты с категорией укладываются в ${money(WEEK_LIMIT, s)} в неделю: недели переполнили переводы и траты без категории.`,
      ].filter(Boolean),
      closeHref,
    });
  }
  const { next } = r;
  const weeks = next.weeks * WEEK_LIMIT;
  const total = weeks + next.regular + MONTH_LIMIT;
  const holds = weekThatHolds(perWeek);
  return assistantAnswer({
    question: `План на ${monthName(next.month)}`,
    paragraphs: [
      stop(
        `${capitalize(monthName(next.month))}: ${count(next.weeks, ['неделя', 'недели', 'недель'])} по ${money(WEEK_LIMIT, s)} — ${money(weeks, s)}, регулярные ${money(next.regular, s)}, дополнительные ${money(MONTH_LIMIT, s)}, всего ${money(total, s)}`,
      ),
      stop(`При доходе как в ${monthName(r.month, 'prepositional')} (${money(r.income, s)}) останется ${money(r.income - total, s)}`),
      holds > WEEK_LIMIT
        ? stop(`Траты с категорией были ${money(perWeek, s)} в неделю: либо поднять неделю до ${money(holds, s)}, либо ужаться`)
        : stop(`Траты с категорией были ${money(perWeek, s)} в неделю, ${money(WEEK_LIMIT, s)} хватает`),
    ],
    links: [{ label: `Открыть ${monthName(next.month)} на обзоре`, href: href('/', { view: 'month', month: next.month }) }],
    closeHref,
  });
}

// ---- What to check, a kind at a time

/** The expenses of one kind to check, by day, newest first. */
export function renderReviewCheck(d: ReviewData, href: Href): Html {
  const r = d.review;
  const here: Page['here'] = (changes) => href('/review/check', { month: r.month, kind: d.kind, ...changes });
  const page: Page = { d, href, here };
  const items = r.toCheck.filter((e) => e.kind === d.kind).sort((a, b) => b.operation.date.localeCompare(a.operation.date) || b.operation.created - a.operation.created);
  const days = new Map<DateString, Operation[]>();
  for (const { operation } of items) days.set(operation.date, [...(days.get(operation.date) ?? []), operation]);
  const sum = sumOf(items);
  const kinds = TO_CHECK.filter((k) => k === d.kind || r.toCheck.some((e) => e.kind === k));
  const body = appShell({
    rail: appRail('review', d.userName, href),
    tabs: monthTabs(monthOf(d.today), r.month, (m) => href('/review/check', { month: m ?? monthOf(d.today), kind: d.kind })),
    main: [
      topBar({ crumbs: [{ label: `Разбор ${monthName(r.month, 'genitive')}`, icon: 'target' }, { label: TO_CHECK_ROWS[d.kind].title }] }),
      toolbar({
        items: [
          segmentedLinks({ label: 'Назад', items: [{ label: '← К разбору', href: href('/review', { month: r.month }) }] }),
          segmentedLinks({
            label: 'Что проверить',
            items: kinds.map((k) => ({
              label: TO_CHECK_ROWS[k].title,
              href: checkHref(d, href, k),
              active: k === d.kind,
              count: r.toCheck.filter((e) => e.kind === k).length,
            })),
          }),
        ],
      }),
      pageIntro({
        title: TO_CHECK_ROWS[d.kind].title,
        text: items.length
          ? `${count(items.length, EXPENSES)} на ${money(sum, d.symbol)} ${plural(items.length, ['считается', 'считаются', 'считаются'])} в неделях, а что это — непонятно.${
              d.kind === 'self' ? ' Банк неизвестен, подсказка — по сумме.' : ''
            }`
          : 'Здесь всё размечено.',
      }),
      items.length
        ? stack({
            gap: 18,
            items: [...days].map(([date, operations]) =>
              dayGroup({ date, today: d.today, net: { amount: -operations.reduce((s, o) => s + o.amount, 0), symbol: d.symbol }, rows: operations.map((o) => spendRow(page, o)) }),
            ),
          })
        : emptyState({ text: 'Размеченные траты ушли в свои категории.' }),
    ],
    side: [
      topBar({ crumbs: [{ label: 'Проверить' }] }),
      balanceTotal({
        amount: sumOf(r.toCheck),
        symbol: d.symbol,
        note: `${count(r.toCheck.length, EXPENSES)} в неделях ${monthName(r.month, 'genitive')}, про которые непонятно, что это`,
      }),
      toCheckRows(page, d.kind, { counts: false }),
    ],
  });
  return pageDocument({ title: 'Бюджет: что проверить', body });
}

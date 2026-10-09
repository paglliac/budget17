// PROTOTYPE (throwaway, ticket «Разбор месяца: что показать»): what the month review shows so that the user sees
// what is happening with the money. Three variants on /review, switched by ?variant=A|B|C and the floating bar:
// A «Из чего месяц» — what the month's spending is made of, with ordinary categories against previous months;
// B «Неделями» — the month's weeks against their limits and what blew them up;
// C «Разобрать» — a queue of expenses that look wrongly counted, with the weeks recounted as they are marked.
// Marking works as everywhere (marking.ts); nothing else is stored.

import { summarizeBalances } from '../../balances.ts';
import { addDays, monthOf, shiftMonth, type MonthString } from '../../dates.ts';
import type { Operation } from '../../ledger.ts';
import { envelopeOf, summarizeWeek, weekOf, weeksOfMonth, type Budget, type WeekSummary } from '../../week.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { capitalize, dayMonth, money, monthName, percent, plural } from '../format.ts';
import { Html } from '../html.ts';
import { categoryIcon, type IconName } from '../icons.ts';
import { categoryColor, toneColor, type Tone } from '../tones.ts';
import { balanceTotal } from '../widgets/accounts.ts';
import { emptyState, footnote, pageIntro, progressBar, section, shareBar } from '../widgets/basics.ts';
import { statCard } from '../widgets/cards.ts';
import { entryList, entryRow } from '../widgets/entries.ts';
import { operationList, operationRow } from '../widgets/operations.ts';
import { appShell, grid, topBar } from '../widgets/shell.ts';
import { appRail, monthTabs, parseMonth, userName, type Href } from './chrome.ts';
import { budgetOf, type SavedBudget } from './dashboard.ts';
import { allExpenses, envelopeMark, loadMarking, markingActions, markingDetails, markingPanel, markingTitle, type Marking } from './marking.ts';

/** PROTOTYPE: transfers to the user's own accounts in other banks (Ozon, WB) come to this payee. */
const SELF_PAYEE = 'Кирилл А.';
/** A person as banks name them in SBP transfers: Татьяна А. */
const PERSON = /^[А-ЯЁ][а-яё]+ [А-ЯЁ]\.$/;
/** An ordinary expense this large is worth a look. */
const LARGE = 10_000;

/** What an expense of the month turned out to be. */
type Bucket = 'ordinary' | 'person' | 'self' | 'untitled' | 'extra' | 'regular' | 'outside';

const BUCKETS: Record<Bucket, { title: string; icon: IconName; tone: Tone }> = {
  ordinary: { title: 'Обычные траты', icon: 'cart', tone: 'yellow' },
  person: { title: 'Переводы людям', icon: 'arrowUpRight', tone: 'orange' },
  self: { title: 'Переводы себе', icon: 'arrows', tone: 'blue' },
  untitled: { title: 'Без категории', icon: 'tag', tone: 'gray' },
  extra: { title: 'Дополнительные', icon: 'sparkles', tone: 'violet' },
  regular: { title: 'Регулярные', icon: 'repeat', tone: 'teal' },
  outside: { title: 'Вне бюджета', icon: 'piggy', tone: 'green' },
};
const ORDER: Bucket[] = ['ordinary', 'person', 'self', 'untitled', 'extra', 'regular', 'outside'];
/** Buckets of expenses that count in the week without the user having said what they are. */
const DOUBTFUL: Bucket[] = ['self', 'person', 'untitled'];

function bucketOf(budget: Pick<Budget, 'marks' | 'purchases'>, o: Operation): Bucket {
  if (o.regular) return 'regular';
  const envelope = envelopeOf(budget, o);
  if (envelope === 'extra') return 'extra';
  if (envelope === 'outside') return 'outside';
  if (o.category) return 'ordinary';
  if (o.payee === SELF_PAYEE) return 'self';
  if (PERSON.test(o.payee)) return 'person';
  return 'untitled';
}

interface CategoryWeekly {
  id: string;
  title: string;
  color: string;
  /** Spent a week this month. */
  perWeek: number;
  /** Spent a week in the three months before, on average; null when there was nothing. */
  usual: number | null;
}

interface Variant {
  key: 'A' | 'B' | 'C';
  name: string;
}

const VARIANTS: Variant[] = [
  { key: 'A', name: 'Из чего месяц' },
  { key: 'B', name: 'Неделями' },
  { key: 'C', name: 'Разобрать' },
];

export interface ReviewData {
  today: DateString;
  month: MonthString;
  variant: Variant;
  weeks: WeekSummary[];
  /** Weeks that have begun. */
  elapsed: number;
  from: DateString;
  to: DateString;
  /** Expenses of the month's weeks, largest first, with what each turned out to be. */
  expenses: Array<{ o: Operation; bucket: Bucket }>;
  categories: CategoryWeekly[];
  /** The bucket open in variant A. */
  group: Bucket;
  marking: Marking;
  edit: string | null;
  symbol: string;
  userName: string | null;
}

export function loadReview(
  data: EntityCollections,
  saved: SavedBudget,
  options: { today: DateString; month?: string | null; variant?: string | null; group?: string | null; edit?: string | null },
): ReviewData {
  const { today } = options;
  // The closed month first: a review is mostly of the month just gone.
  const month = options.month ? parseMonth(options.month, monthOf(today)) : shiftMonth(monthOf(today), -1);
  const weekStarts = weeksOfMonth(month, saved.weekStart);
  const earliest = weeksOfMonth(shiftMonth(month, -3), saved.weekStart)[0] ?? weekStarts[0]!;
  const budget = budgetOf(data, saved, { today, from: earliest });
  const from = weekStarts[0]!;
  const to = addDays(weekStarts.at(-1)!, 6);
  const expenses = budget.expenses
    .filter((o) => o.date >= from && o.date <= to)
    .map((o) => ({ o, bucket: bucketOf(budget, o) }))
    .sort((a, b) => b.o.amount - a.o.amount);
  const current = weekOf(today, saved.weekStart);
  const elapsed = Math.max(1, weekStarts.filter((w) => w <= current).length);

  const ordinaryPerWeek = (start: DateString, end: DateString, weeks: number) => {
    const sums = new Map<string, { title: string; color: string; amount: number }>();
    for (const o of budget.expenses) {
      if (o.date < start || o.date > end || !o.category || bucketOf(budget, o) !== 'ordinary') continue;
      const entry = sums.get(o.category.id) ?? { title: o.category.title, color: categoryColor(o.category.id, o.category.color), amount: 0 };
      entry.amount += o.amount / weeks;
      sums.set(o.category.id, entry);
    }
    return sums;
  };
  const now = ordinaryPerWeek(from, to, elapsed);
  const before = [1, 2, 3].map((i) => {
    const weeks = weeksOfMonth(shiftMonth(month, -i), saved.weekStart);
    return ordinaryPerWeek(weeks[0]!, addDays(weeks.at(-1)!, 6), weeks.length);
  });
  const categories = [...now].map(([id, c]) => {
    const past = before.map((m) => m.get(id)?.amount ?? 0);
    const usual = past.some((v) => v > 0) ? past.reduce((s, v) => s + v, 0) / past.length : null;
    return { id, title: c.title, color: c.color, perWeek: c.amount, usual };
  });
  categories.sort((a, b) => b.perWeek - a.perWeek);

  const sums = bucketSums(expenses);
  const group =
    ORDER.find((b) => b === options.group) ?? DOUBTFUL.filter((b) => sums.get(b)).sort((a, b) => sums.get(b)! - sums.get(a)!)[0] ?? 'ordinary';

  return {
    today,
    month,
    variant: VARIANTS.find((v) => v.key === options.variant?.toUpperCase()) ?? VARIANTS[0]!,
    weeks: weekStarts.map((w) => summarizeWeek(budget, w)),
    elapsed,
    from,
    to,
    expenses,
    categories,
    group,
    marking: loadMarking(data, saved, allExpenses(data, saved), today),
    edit: options.edit ?? null,
    symbol: summarizeBalances(data).mainInstrument.symbol,
    userName: userName(data),
  };
}

function bucketSums(expenses: ReviewData['expenses']): Map<Bucket, number> {
  const sums = new Map<Bucket, number>();
  for (const { o, bucket } of expenses) sums.set(bucket, (sums.get(bucket) ?? 0) + o.amount);
  return sums;
}

export function renderReview(d: ReviewData, baseHref: Href): Html {
  const href: Href = (path, params) => baseHref(path, { variant: d.variant.key, ...params });
  const to = (params: Record<string, string | null> = {}) => href('/review', { month: d.month, ...params });
  const page = { d, href, to };
  const view = d.variant.key === 'A' ? variantA(page) : d.variant.key === 'B' ? variantB(page) : variantC(page);
  const body = appShell({
    rail: appRail('review', d.userName, href),
    tabs: monthTabs(monthOf(d.today), d.month, (m) => to({ month: m ?? monthOf(d.today), group: null })),
    main: [topBar({ crumbs: [{ label: 'Бюджет' }, { label: `Разбор: ${monthName(d.month)}`, icon: 'target' }] }), ...view.main],
    side: view.side,
    wideSide: true,
  });
  const document = pageDocument({ title: 'Бюджет: разбор месяца', body });
  return new Html(document.toString().replace('</body>', `${switcher(d.variant, (key) => href('/review', { month: d.month, variant: key }))}\n</body>`));
}

interface Page {
  d: ReviewData;
  href: Href;
  to: (params?: Record<string, string | null>) => string;
}

// ---- Shared pieces

/** Ends a sentence with a full stop, unless it ends with the currency's own dot, as «руб.» does. */
function stop(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}

function span(d: ReviewData): string {
  const weeks = d.weeks.length;
  return `${dayMonth(d.from)} – ${dayMonth(d.to)}, ${weeks} ${plural(weeks, ['неделя', 'недели', 'недель'])}`;
}

function sentence(d: ReviewData): string {
  const total = d.expenses.reduce((s, e) => s + e.o.amount, 0);
  const inWeeks = d.weeks.reduce((s, w) => s + w.spent, 0);
  const limits = d.weeks.reduce((s, w) => s + w.limit, 0);
  return `${span(d)}. Потрачено ${money(total, d.symbol)}, из них в неделях ${money(inWeeks, d.symbol)} при лимите ${money(limits, d.symbol)}`;
}

/** An expense's row that opens in place to be marked. */
function spendRow(page: Page, o: Operation, extra?: string): Html {
  const { d, href, to } = page;
  const key = `spending-${o.id}`;
  const open = d.edit === key;
  return operationRow({
    id: key,
    title: markingTitle(o),
    details: [dayMonth(o.date), extra ?? markingDetails(o)].join(' · '),
    icon: o.category ? categoryIcon(o.category.title) : 'tag',
    color: categoryColor(o.category?.id ?? null, o.category?.color ?? null),
    kind: 'expense',
    amount: o.amount,
    symbol: d.symbol,
    unsigned: true,
    mark: envelopeMark(d.marking, o),
    href: to({ group: d.variant.key === 'A' ? d.group : null, edit: open ? null : key }),
    panel: open ? markingPanel(d.marking, o, href) : undefined,
    actions: open ? markingActions(d.marking, o, href) : undefined,
  });
}

/**
 * PROTOTYPE: ZenMoney does not know which bank a transfer to oneself went to, so the amount hints at it: the amount of
 * a regular expense is its payment, an uneven one under 20 000 is a purchase on Ozon or WB.
 */
function selfHint(d: ReviewData, o: Operation): string | undefined {
  const regular = d.marking.regular.find((r) => Math.abs(r.amount - o.amount) < 1);
  if (regular) return `сумма «${regular.title}»`;
  if (o.amount < 20_000 && Math.round(o.amount) % 100 !== 0) return 'похоже на Ozon или WB';
  return undefined;
}

function weekTitle(w: WeekSummary): string {
  return `${dayMonth(w.week)} – ${dayMonth(addDays(w.week, 6))}`;
}

function bucketParts(expenses: ReviewData['expenses']) {
  const sums = bucketSums(expenses);
  return ORDER.map((b) => ({ label: BUCKETS[b].title, value: sums.get(b) ?? 0, color: toneColor(BUCKETS[b].tone) }));
}

function bucketRows(page: Page, expenses: ReviewData['expenses'], link: boolean): Html {
  const { d, to } = page;
  const sums = bucketSums(expenses);
  return entryList({
    label: 'Из чего траты',
    items: ORDER.filter((b) => sums.get(b)).map((b) => {
      const count = expenses.filter((e) => e.bucket === b).length;
      return entryRow({
        title: BUCKETS[b].title,
        details: `${count} ${plural(count, ['трата', 'траты', 'трат'])}`,
        icon: BUCKETS[b].icon,
        color: toneColor(BUCKETS[b].tone),
        amount: sums.get(b)!,
        symbol: d.symbol,
        href: link ? to({ variant: 'A', group: b }) : undefined,
      });
    }),
  });
}

function versusUsual(c: CategoryWeekly, symbol: string): string {
  if (c.usual === null) return 'раньше не было';
  const change = c.perWeek / c.usual - 1;
  const ratio = c.perWeek / c.usual;
  const word =
    Math.abs(change) < 0.1
      ? 'как обычно'
      : ratio >= 2
        ? `в ${Math.round(ratio)} ${plural(Math.round(ratio), ['раз', 'раза', 'раз'])} больше обычного`
        : change > 0
          ? `на ${percent(change)} больше обычного`
          : `на ${percent(-change)} меньше обычного`;
  return `обычно ${money(c.usual, symbol)} · ${word}`;
}

// ---- A «Из чего месяц»

function variantA(page: Page): { main: Html[]; side: Html[] } {
  const { d, to } = page;
  const sums = bucketSums(d.expenses);
  const total = d.expenses.reduce((s, e) => s + e.o.amount, 0);
  const group = d.expenses.filter((e) => e.bucket === d.group);
  const groupSum = sums.get(d.group) ?? 0;
  return {
    main: [
      pageIntro({ title: `Из чего ${monthName(d.month)}`, text: stop(sentence(d)) }),
      grid({
        columns: 3,
        min: 200,
        items: ORDER.filter((b) => sums.get(b)).map((b) => {
          const count = d.expenses.filter((e) => e.bucket === b).length;
          return statCard({
            icon: BUCKETS[b].icon,
            tone: BUCKETS[b].tone,
            title: BUCKETS[b].title,
            label: `${count} ${plural(count, ['трата', 'траты', 'трат'])} · ${percent(sums.get(b)! / total)}`,
            value: money(sums.get(b)!, d.symbol),
            progress: sums.get(b)! / total,
            action: b === d.group ? undefined : { label: 'Показать', href: to({ group: b }) },
          });
        }),
      }),
      section({
        title: 'Обычные траты в неделю',
        body: d.categories.length
          ? entryList({
              label: 'Обычные траты по категориям в неделю',
              items: d.categories.map((c) =>
                entryRow({
                  title: c.title,
                  details: versusUsual(c, d.symbol),
                  icon: categoryIcon(c.title),
                  color: c.color,
                  amount: c.perWeek,
                  symbol: d.symbol,
                }),
              ),
            })
          : emptyState({ text: 'Обычных трат с категорией нет.' }),
      }),
    ],
    side: [
      topBar({ crumbs: [{ label: BUCKETS[d.group].title }] }),
      balanceTotal({
        amount: groupSum,
        symbol: d.symbol,
        note: `${group.length} ${plural(group.length, ['трата', 'траты', 'трат'])} · ${percent(total ? groupSum / total : 0)} месяца`,
      }),
      group.length
        ? operationList({ label: BUCKETS[d.group].title, rows: group.map((e) => spendRow(page, e.o)) })
        : emptyState({ text: 'Здесь пусто.' }),
    ],
  };
}

// ---- B «Неделями»

function variantB(page: Page): { main: Html[]; side: Html[] } {
  const { d } = page;
  const total = d.expenses.reduce((s, e) => s + e.o.amount, 0);
  return {
    main: [
      pageIntro({ title: capitalize(monthName(d.month)), text: stop(sentence(d)) }),
      ...d.weeks.map((w) => {
        const end = addDays(w.week, 6);
        const week = d.expenses.filter((e) => e.o.date >= w.week && e.o.date <= end);
        const counted = week.filter((e) => envelopeOf(d.marking, e.o) === 'week');
        const notable = counted.filter((e) => e.bucket !== 'ordinary' || e.o.amount >= 3_000).slice(0, 8);
        const rest = counted.filter((e) => !notable.includes(e));
        const over = w.spent - w.limit;
        const ahead = w.week > d.today;
        return section({
          title: `${weekTitle(w)} · ${money(w.spent, d.symbol)} из ${money(w.limit, d.symbol)}`,
          body: [
            progressBar({ value: w.spent / w.limit, tone: over > 0 ? 'red' : 'yellow', label: `Потрачено ${percent(w.spent / w.limit)} лимита` }),
            shareBar({ label: 'Из чего траты недели', parts: bucketParts(counted) }),
            ahead
              ? emptyState({ text: 'Неделя ещё впереди.' })
              : operationList({
                  label: `Траты недели ${weekTitle(w)}`,
                  rows: notable.map((e) => spendRow(page, e.o, e.bucket === 'ordinary' ? undefined : BUCKETS[e.bucket].title.toLowerCase())),
                }),
            rest.length
              ? footnote({ text: stop(`Ещё ${rest.length} ${plural(rest.length, ['трата', 'траты', 'трат'])} на ${money(rest.reduce((s, e) => s + e.o.amount, 0), d.symbol)}`) })
              : null,
          ],
        });
      }),
    ],
    side: [
      topBar({ crumbs: [{ label: 'Весь месяц' }] }),
      balanceTotal({ amount: total, symbol: d.symbol, note: span(d) }),
      shareBar({ label: 'Из чего траты месяца', parts: bucketParts(d.expenses) }),
      bucketRows(page, d.expenses, true),
    ],
  };
}

// ---- C «Разобрать»

function variantC(page: Page): { main: Html[]; side: Html[] } {
  const { d } = page;
  const queue: Array<{ title: string; hint: string; items: ReviewData['expenses'] }> = [
    { title: 'Переводы себе', hint: 'в Ozon, WB или кредит', items: d.expenses.filter((e) => e.bucket === 'self') },
    { title: 'Переводы людям', hint: 'обычная трата или вне бюджета', items: d.expenses.filter((e) => e.bucket === 'person') },
    { title: 'Без категории', hint: '', items: d.expenses.filter((e) => e.bucket === 'untitled') },
    {
      title: `Крупные в неделе, от ${money(LARGE, d.symbol)}`,
      hint: 'точно обычная трата?',
      items: d.expenses.filter((e) => e.bucket === 'ordinary' && !e.o.purchase && e.o.amount >= LARGE),
    },
  ];
  const waiting = d.expenses.filter((e) => DOUBTFUL.includes(e.bucket));
  const inWeek = d.expenses.filter((e) => envelopeOf(d.marking, e.o) === 'week' || DOUBTFUL.includes(e.bucket));
  const done = inWeek.length - waiting.length;
  const inWeeks = d.weeks.reduce((s, w) => s + w.spent, 0);
  const limits = d.weeks.reduce((s, w) => s + w.limit, 0);
  return {
    main: [
      pageIntro({
        title: 'Разобрать',
        text: waiting.length
          ? `${waiting.length} ${plural(waiting.length, ['трата', 'траты', 'трат'])} на ${money(waiting.reduce((s, e) => s + e.o.amount, 0), d.symbol)} ${plural(waiting.length, ['считается', 'считаются', 'считаются'])} в неделях, а что это — непонятно.`
          : 'Всё, что считается в неделях, размечено.',
      }),
      ...queue
        .filter((g) => g.items.length)
        .map((g) =>
          section({
            title: `${g.title} · ${g.items.length} на ${money(g.items.reduce((s, e) => s + e.o.amount, 0), d.symbol)}`,
            body: [
              g.hint ? footnote({ text: capitalize(g.hint) }) : null,
              operationList({
                label: g.title,
                rows: [...g.items].sort((a, b) => a.o.date.localeCompare(b.o.date)).map((e) => spendRow(page, e.o, e.bucket === 'self' ? selfHint(d, e.o) : undefined)),
              }),
            ],
          }),
        ),
    ],
    side: [
      topBar({ crumbs: [{ label: 'Разобрано' }] }),
      balanceTotal({ amount: inWeeks, symbol: d.symbol, note: `в неделях при лимите ${money(limits, d.symbol)}` }),
      progressBar({ value: inWeek.length ? done / inWeek.length : 1, tone: 'green', label: `Разобрано ${done} из ${inWeek.length}` }),
      footnote({ text: `Разобрано ${done} из ${inWeek.length} трат недель.` }),
      entryList({
        label: 'Недели месяца',
        items: d.weeks.map((w) =>
          entryRow({
            title: weekTitle(w),
            details: w.spent > w.limit ? `больше лимита на ${money(w.spent - w.limit, d.symbol)}` : `осталось ${money(w.limit - w.spent, d.symbol)}`,
            icon: 'calendar',
            color: toneColor(w.spent > w.limit ? 'red' : 'green'),
            amount: w.spent,
            symbol: d.symbol,
            href: page.href('/', { week: w.week }),
          }),
        ),
      }),
    ],
  };
}

// ---- PROTOTYPE: the switcher

function switcher(current: Variant, link: (key: string) => string): string {
  const index = VARIANTS.indexOf(current);
  const prev = link(VARIANTS[(index - 1 + VARIANTS.length) % VARIANTS.length]!.key);
  const next = link(VARIANTS[(index + 1) % VARIANTS.length]!.key);
  return `
<div id="proto-switcher" role="toolbar" aria-label="Варианты прототипа">
  <a href="${prev}" aria-label="Предыдущий вариант" data-dir="prev">‹</a>
  <span><b>${current.key}</b> ${current.name} <i>${index + 1}/${VARIANTS.length}</i></span>
  <a href="${next}" aria-label="Следующий вариант" data-dir="next">›</a>
</div>
<script>
  addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    const dir = e.key === 'ArrowLeft' ? 'prev' : e.key === 'ArrowRight' ? 'next' : null;
    if (dir) location.href = document.querySelector('#proto-switcher [data-dir="' + dir + '"]').href;
  });
</script>
<style>
  #proto-switcher { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 2147483647; display: flex; align-items: center; gap: 4px;
    padding: 5px; border-radius: 999px; background: #1F4BFF; color: #fff; font: 500 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    box-shadow: 0 10px 30px -8px rgb(31 75 255 / .6), 0 0 0 3px rgb(255 255 255 / .9); }
  #proto-switcher a { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 999px; background: rgb(255 255 255 / .16); color: #fff; font-size: 18px; }
  #proto-switcher a:hover { background: rgb(255 255 255 / .28); }
  #proto-switcher span { padding: 0 10px; white-space: nowrap; }
  #proto-switcher b { display: inline-block; padding: 3px 6px; margin-right: 4px; border-radius: 6px; background: #fff; color: #1F4BFF; }
  #proto-switcher i { font-style: normal; opacity: .7; }
</style>`;
}

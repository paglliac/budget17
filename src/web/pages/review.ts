// PROTOTYPE (throwaway, ticket «Разбор месяца: что показать»): the month review drawn by the user's picture.
// The main column says what happened with the month's money: income, spent and left, where it went, the weeks against
// their limits, ordinary spending a week by category, what to check and the regular payments. The side is the
// assistant, faked by rules for now: findings, answers to four questions and suggestions that switch on and off.
// A switched-on suggestion only recounts the page as if it were applied (?apply=…); nothing is stored but the marks
// made on expenses, which open in place as everywhere (marking.ts).

import { summarizeBalances } from '../../balances.ts';
import { addDays, monthOf, shiftMonth, type MonthString } from '../../dates.ts';
import { listOperations, type Operation } from '../../ledger.ts';
import { paymentDate } from '../../regular.ts';
import { envelopeOf, MONTH_LIMIT, summarizeWeek, WEEK_LIMIT, weekOf, weeksOfMonth, type Budget, type Envelope, type WeekSummary } from '../../week.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { capitalize, dayMonth, money, monthName, percent, plural } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryIcon, type IconName } from '../icons.ts';
import { categoryColor, toneColor, type Tone } from '../tones.ts';
import { pageIntro } from '../widgets/basics.ts';
import { operationList, operationRow } from '../widgets/operations.ts';
import { assistantAnswer, assistantHero, figureCard, flowChart, insightList, listHeading, metricList, panelCard, toggleList, weekBars } from '../widgets/review.ts';
import { appShell, grid, topBar } from '../widgets/shell.ts';
import { appRail, monthTabs, parseMonth, userName, type Href } from './chrome.ts';
import { budgetOf, type SavedBudget } from './dashboard.ts';
import { allExpenses, envelopeMark, loadMarking, markingActions, markingDetails, markingPanel, markingTitle, type Marking } from './marking.ts';

/** PROTOTYPE: transfers to the user's own accounts in other banks (Ozon, WB) come to this payee. */
const SELF_PAYEE = 'Кирилл А.';
/** A person as banks name them in SBP transfers: Татьяна А. */
const PERSON = /^[А-ЯЁ][а-яё]+ [А-ЯЁ]\.$/;
/** A transfer to a person this large is hardly ordinary spending of a week. */
const LARGE_TRANSFER = 10_000;

/** What an expense of the month turned out to be. */
type Bucket = 'ordinary' | 'person' | 'self' | 'untitled' | 'extra' | 'regular' | 'outside';
/** Buckets of expenses that count in the week without the user having said what they are. */
const DOUBTFUL = ['person', 'self', 'untitled'] as const;
type Doubtful = (typeof DOUBTFUL)[number];

const DOUBTFUL_ROWS: Record<Doubtful, { label: string; icon: IconName; tone: Tone }> = {
  person: { label: 'Переводы людям', icon: 'arrowUpRight', tone: 'blue' },
  self: { label: 'Переводы себе', icon: 'card', tone: 'violet' },
  untitled: { label: 'Без категории', icon: 'tag', tone: 'gray' },
};

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

function isDoubtful(bucket: Bucket): bucket is Doubtful {
  return (DOUBTFUL as readonly string[]).includes(bucket);
}

/** A suggestion of the assistant: what it changes, applied only to the page's figures while switched on. */
type SuggestionKey = 'ozon' | 'loan' | 'people' | 'peopleCategory';

interface Suggestion {
  key: SuggestionKey;
  icon: IconName;
  title: string;
  text: string;
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

type Question = 'overspend' | 'check' | 'optimize' | 'plan' | 'ask';
const QUESTIONS: Array<{ key: Question; label: string; icon: IconName }> = [
  { key: 'overspend', label: 'Где перерасход и почему', icon: 'trendingUp' },
  { key: 'check', label: 'Какие траты проверить', icon: 'search' },
  { key: 'optimize', label: 'На чём сэкономить', icon: 'piggy' },
  { key: 'plan', label: 'План на следующий месяц', icon: 'target' },
];

export interface ReviewData {
  today: DateString;
  month: MonthString;
  weeks: WeekSummary[];
  from: DateString;
  to: DateString;
  income: number;
  /** Expenses of the month's weeks as if the switched-on suggestions were applied, largest first. */
  expenses: Array<{ o: Operation; bucket: Bucket; envelope: Envelope }>;
  /** The same expenses as they are, by id, for marking. */
  originals: ReadonlyMap<string, Operation>;
  categories: CategoryWeekly[];
  suggestions: Suggestion[];
  applied: ReadonlySet<SuggestionKey>;
  /** Regular payments due next month. */
  nextRegular: number;
  nextWeeks: number;
  ask: Question | null;
  question: string | null;
  group: Doubtful | null;
  marking: Marking;
  edit: string | null;
  symbol: string;
  userName: string | null;
}

export function loadReview(
  data: EntityCollections,
  saved: SavedBudget,
  options: { today: DateString; month?: string | null; apply?: string | null; ask?: string | null; q?: string | null; group?: string | null; edit?: string | null },
): ReviewData {
  const { today } = options;
  // The closed month first: a review is mostly of the month just gone.
  const month = options.month ? parseMonth(options.month, monthOf(today)) : shiftMonth(monthOf(today), -1);
  const weekStarts = weeksOfMonth(month, saved.weekStart);
  const earliest = weeksOfMonth(shiftMonth(month, -3), saved.weekStart)[0] ?? weekStarts[0]!;
  const raw = budgetOf(data, saved, { today, from: earliest });
  const from = weekStarts[0]!;
  const to = addDays(weekStarts.at(-1)!, 6);
  const inMonth = (o: Operation) => o.date >= from && o.date <= to;
  const symbol = summarizeBalances(data).mainInstrument.symbol;
  const sum = (list: Operation[]) => list.reduce((s, o) => s + o.amount, 0);

  // What the assistant would change, found among the expenses as they are.
  const shopping = raw.expenses.find((o) => o.category?.title === 'Шоппинг')?.category ?? { id: 'proto-shopping', title: 'Шоппинг', color: null };
  const people = { id: 'proto-people', title: 'Переводы людям', color: null };
  const rawBucket = (o: Operation) => bucketOf(raw, o);
  const isOzon = (o: Operation) => rawBucket(o) === 'self' && o.amount < 20_000 && Math.round(o.amount) % 100 !== 0;
  const loanOf = (o: Operation) => (rawBucket(o) === 'self' ? saved.regular.find((r) => Math.abs(r.amount - o.amount) < 1) : undefined);
  const isLargePerson = (o: Operation) => rawBucket(o) === 'person' && o.amount >= LARGE_TRANSFER;
  const ofMonth = raw.expenses.filter(inMonth);
  const ozon = ofMonth.filter(isOzon);
  const loans = ofMonth.filter((o) => loanOf(o));
  const largePeople = ofMonth.filter(isLargePerson).sort((a, b) => b.amount - a.amount);
  const restPeople = ofMonth.filter((o) => rawBucket(o) === 'person' && !isLargePerson(o));
  const suggestions: Suggestion[] = [];
  if (ozon.length)
    suggestions.push({
      key: 'ozon',
      icon: 'bag',
      title: 'Переводы себе с некруглой суммой — в «Шоппинг»',
      text: `${count(ozon.length, 'перевод')} на ${money(sum(ozon), symbol)}: это покупки на Ozon и WB`,
    });
  if (loans.length)
    suggestions.push({
      key: 'loan',
      icon: 'repeat',
      title: 'Переводы на сумму кредита — привязать к нему',
      text: loans.map((o) => `${money(o.amount, symbol)} → «${loanOf(o)!.title}»`).join(', '),
    });
  if (largePeople.length)
    suggestions.push({
      key: 'people',
      icon: 'arrowUpRight',
      title: `Не считать в неделях переводы людям от ${money(LARGE_TRANSFER, symbol)}`,
      text: `${count(largePeople.length, 'перевод')} на ${money(sum(largePeople), symbol)}: ${largePeople
        .slice(0, 2)
        .map((o) => `${o.payee} ${money(o.amount, symbol)}`)
        .join(', ')}`,
    });
  if (restPeople.length)
    suggestions.push({
      key: 'peopleCategory',
      icon: 'tag',
      title: 'Добавить категорию «Переводы людям»',
      text: `для остальных ${count(restPeople.length, 'перевода', 'переводов', 'переводов')} на ${money(sum(restPeople), symbol)}, они останутся в неделях`,
    });
  const available = new Set(suggestions.map((s) => s.key));
  const applied = new Set((options.apply ?? '').split(',').filter((k): k is SuggestionKey => available.has(k as SuggestionKey)));

  // The budget as if the switched-on suggestions were applied.
  const marks = new Map(raw.marks);
  const expenses = raw.expenses.map((o) => {
    if (applied.has('ozon') && isOzon(o)) return { ...o, category: shopping };
    const loan = applied.has('loan') ? loanOf(o) : undefined;
    if (loan) return { ...o, regular: { id: loan.id, title: loan.title } };
    if (applied.has('people') && isLargePerson(o)) {
      marks.set(o.id, 'outside');
      return o;
    }
    if (applied.has('peopleCategory') && rawBucket(o) === 'person') return { ...o, category: people };
    return o;
  });
  const budget: Budget = { ...raw, expenses, marks };

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
  const categories = [...now]
    .map(([id, c]) => {
      const past = before.map((m) => m.get(id)?.amount ?? 0);
      const usual = past.some((v) => v > 0) ? past.reduce((s, v) => s + v, 0) / past.length : null;
      return { id, title: c.title, color: c.color, perWeek: c.amount, usual };
    })
    .sort((a, b) => b.perWeek - a.perWeek);

  const next = shiftMonth(month, 1);
  const income = listOperations(data, { from, to }, saved)
    .filter((o) => o.kind === 'income')
    .reduce((s, o) => s + o.amount, 0);

  return {
    today,
    month,
    weeks: weekStarts.map((w) => summarizeWeek(budget, w)),
    from,
    to,
    income,
    expenses: budget.expenses
      .filter(inMonth)
      .map((o) => ({ o, bucket: bucketOf(budget, o), envelope: envelopeOf(budget, o) }))
      .sort((a, b) => b.o.amount - a.o.amount),
    originals: new Map(ofMonth.map((o) => [o.id, o])),
    categories,
    suggestions,
    applied,
    nextRegular: saved.regular.reduce((s, r) => s + (paymentDate(r, next) ? r.amount : 0), 0),
    nextWeeks: weeksOfMonth(next, saved.weekStart).length,
    ask: options.ask === 'ask' ? 'ask' : (QUESTIONS.find((q) => q.key === options.ask)?.key ?? null),
    question: options.q?.trim() || null,
    group: DOUBTFUL.find((g) => g === options.group) ?? null,
    marking: loadMarking(data, saved, allExpenses(data, saved), today),
    edit: options.edit ?? null,
    symbol,
    userName: userName(data),
  };
}

function count(n: number, one: string, few = `${one}а`, many = `${one}ов`): string {
  return `${n} ${plural(n, [one, few, many])}`;
}

interface Page {
  d: ReviewData;
  href: Href;
  /** This page with the given changes to its state. */
  to: (changes?: { month?: string | null; apply?: string | null; ask?: string | null; group?: string | null; edit?: string | null }) => string;
}

export function renderReview(d: ReviewData, href: Href): Html {
  const state = { month: d.month, apply: [...d.applied].join(',') || null, ask: d.ask, group: d.group };
  const to: Page['to'] = (changes = {}) => href('/review', { ...state, ...changes });
  const page: Page = { d, href, to };
  const body = appShell({
    rail: appRail('review', d.userName, href),
    tabs: monthTabs(monthOf(d.today), d.month, (m) => to({ month: m ?? monthOf(d.today), group: null, edit: null })),
    main: main(page),
    side: side(page),
    wideSide: true,
  });
  return pageDocument({ title: 'Бюджет: разбор месяца', body });
}

// ---- Figures

function totals(d: ReviewData) {
  const by = (pick: (e: ReviewData['expenses'][number]) => boolean) => d.expenses.filter(pick).reduce((s, e) => s + e.o.amount, 0);
  const spent = by(() => true);
  const doubtful = d.expenses.filter((e) => isDoubtful(e.bucket));
  return {
    spent,
    left: d.income - spent,
    inWeeks: d.weeks.reduce((s, w) => s + w.spent, 0),
    limits: d.weeks.reduce((s, w) => s + w.limit, 0),
    regular: by((e) => e.bucket === 'regular'),
    extra: by((e) => e.envelope === 'extra' && e.bucket !== 'regular'),
    outside: by((e) => e.envelope === 'outside' && e.bucket !== 'regular'),
    doubtful,
    doubtfulSum: doubtful.reduce((s, e) => s + e.o.amount, 0),
    ordinaryPerWeek: d.categories.reduce((s, c) => s + c.perWeek, 0),
    ordinaryWeek: by((e) => e.bucket === 'ordinary' && e.envelope === 'week'),
  };
}

function span(d: ReviewData): string {
  return `${dayMonth(d.from)} – ${dayMonth(d.to)}, ${count(d.weeks.length, 'неделя', 'недели', 'недель')}`;
}

function weekTitle(w: WeekSummary): string {
  return `${dayMonth(w.week)} – ${dayMonth(addDays(w.week, 6))}`;
}

/** Ends a sentence with a full stop, unless it ends with the currency's own dot, as «руб.» does. */
function stop(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}

// ---- Main column

function main(page: Page): Html[] {
  const { d, to } = page;
  const t = totals(d);
  const over = t.inWeeks - t.limits;
  const ideas = insights(page).length + d.suggestions.length;
  return [
    topBar({ crumbs: [{ label: span(d), icon: 'calendar' }] }),
    pageIntro({
      title: `Разбор ${monthName(d.month, 'genitive')}`,
      text: 'Что произошло с деньгами и что стоит поправить.',
      badge: ideas ? { text: `ассистент нашёл ${count(ideas, 'идею', 'идеи', 'идей')}`, tone: 'green' } : undefined,
    }),
    grid({
      columns: 3,
      min: 200,
      items: [
        figureCard({ label: 'Доход', amount: d.income, symbol: d.symbol }),
        figureCard({
          label: 'Потрачено',
          amount: t.spent,
          symbol: d.symbol,
          note: d.income > 0 ? `${percent(t.spent / d.income)} от дохода` : undefined,
          progress: { value: d.income > 0 ? t.spent / d.income : 1, tone: 'violet' },
        }),
        figureCard({
          label: t.left >= 0 ? 'Осталось' : 'Не хватило',
          amount: Math.abs(t.left),
          symbol: d.symbol,
          note: d.income > 0 ? `${percent(Math.abs(t.left) / d.income)} дохода` : undefined,
          progress: { value: d.income > 0 ? Math.abs(t.left) / d.income : 0, tone: t.left >= 0 ? 'teal' : 'red' },
        }),
      ],
    }),
    panelCard({
      title: 'Куда ушли деньги',
      amount: t.spent,
      symbol: d.symbol,
      body: flowChart({
        label: 'Куда ушёл доход',
        source: { label: 'доход', amount: d.income },
        symbol: d.symbol,
        parts: [
          { label: 'Недели', amount: t.inWeeks, color: toneColor('yellow') },
          { label: 'Регулярные', amount: t.regular, color: toneColor('gray') },
          { label: 'Дополнительные', amount: t.extra, color: toneColor('violet') },
          { label: 'Вне бюджета', amount: t.outside, color: toneColor('blue') },
          { label: 'Осталось', amount: t.left, color: toneColor('teal') },
        ],
      }),
    }),
    grid({
      columns: 2,
      min: 320,
      items: [
        panelCard({
          title: 'Недельные траты',
          amount: t.inWeeks,
          symbol: d.symbol,
          note: `при плане ${money(t.limits, d.symbol)}`,
          badge: { text: money(over, d.symbol, { sign: true }), tone: over > 0 ? 'red' : 'green' },
          href: to({ ask: 'overspend' }),
          body: weekBars({
            label: 'Траты недель против их лимитов',
            bars: d.weeks.map((w, i) => ({
              label: `Нед. ${i + 1}`,
              value: w.spent,
              limit: w.limit,
              title: `${weekTitle(w)}: ${money(w.spent, d.symbol)} из ${money(w.limit, d.symbol)}`,
              href: page.href('/', { week: w.week }),
              ahead: w.week > d.today,
            })),
          }),
        }),
        panelCard({
          title: 'Обычные траты в неделю',
          amount: t.ordinaryPerWeek,
          symbol: d.symbol,
          note: `при плане ${money(WEEK_LIMIT, d.symbol)}`,
          href: to({ ask: 'optimize' }),
          body: metricList({
            label: 'Обычные траты по категориям в неделю',
            items: d.categories.slice(0, 7).map((c) => ({
              label: c.title,
              amount: c.perWeek,
              color: c.color,
              share: c.perWeek / (d.categories[0]?.perWeek || 1),
              note: versusUsual(c),
            })),
          }),
        }),
        panelCard({
          id: 'check',
          title: 'Проверить',
          amount: t.doubtfulSum,
          symbol: d.symbol,
          note: count(t.doubtful.length, 'трата', 'траты', 'трат'),
          body: [
            metricList({
              label: 'Траты, про которые непонятно, что это',
              symbol: d.symbol,
              items: t.doubtful.length
                ? DOUBTFUL.flatMap((g) => {
                    const items = t.doubtful.filter((e) => e.bucket === g);
                    if (!items.length) return [];
                    return [
                      {
                        label: DOUBTFUL_ROWS[g].label,
                        icon: DOUBTFUL_ROWS[g].icon,
                        tone: DOUBTFUL_ROWS[g].tone,
                        amount: items.reduce((s, e) => s + e.o.amount, 0),
                        note: `${items.length} шт.`,
                        href: `${to({ group: d.group === g ? null : g, edit: null })}#check`,
                        active: d.group === g,
                      },
                    ];
                  })
                : [{ label: 'Всё, что в неделях, размечено', amount: 0, icon: 'check' as const, tone: 'green' as const }],
            }),
            d.group
              ? operationList({
                  label: DOUBTFUL_ROWS[d.group].label,
                  rows: t.doubtful
                    .filter((e) => e.bucket === d.group)
                    .sort((a, b) => a.o.date.localeCompare(b.o.date))
                    .map((e) => spendRow(page, e.o)),
                })
              : null,
          ],
        }),
        panelCard({
          title: 'Регулярные платежи',
          amount: t.regular,
          symbol: d.symbol,
          note: 'вне лимитов',
          href: page.href('/regular'),
          body: metricList({ label: 'Регулярные платежи месяца', items: regularRows(d) }),
        }),
      ],
    }),
  ];
}

function regularRows(d: ReviewData): Array<{ label: string; amount: number }> {
  const rows = new Map<string, number>();
  for (const { o, bucket } of d.expenses) {
    if (bucket === 'regular' && o.regular) rows.set(o.regular.title, (rows.get(o.regular.title) ?? 0) + o.amount);
  }
  return [...rows].sort((a, b) => b[1] - a[1]).map(([label, amount]) => ({ label, amount }));
}

function versusUsual(c: CategoryWeekly): string | undefined {
  if (c.usual === null) return 'новое';
  const ratio = c.perWeek / c.usual;
  if (Math.abs(ratio - 1) < 0.1) return undefined;
  if (ratio >= 2) return `×${Math.round(ratio)}`;
  return ratio > 1 ? `+${percent(ratio - 1)}` : `−${percent(1 - ratio)}`;
}

/** An expense's row that opens in place to be marked; the panel marks it as it is, not as a suggestion would. */
function spendRow(page: Page, shown: Operation): Html {
  const { d, href, to } = page;
  const o = d.originals.get(shown.id) ?? shown;
  const key = `spending-${o.id}`;
  const open = d.edit === key;
  return operationRow({
    id: key,
    title: markingTitle(o),
    details: [dayMonth(o.date), markingDetails(o), o.payee === SELF_PAYEE ? selfHint(d, o) : undefined].filter(Boolean).join(' · '),
    icon: o.category ? categoryIcon(o.category.title) : 'tag',
    color: categoryColor(o.category?.id ?? null, o.category?.color ?? null),
    kind: 'expense',
    amount: o.amount,
    symbol: d.symbol,
    unsigned: true,
    mark: envelopeMark(d.marking, o),
    href: to({ edit: open ? null : key }),
    panel: open ? markingPanel(d.marking, o, href) : undefined,
    actions: open ? markingActions(d.marking, o, href) : undefined,
  });
}

/**
 * ZenMoney does not know which bank a transfer to oneself went to, so the amount hints at it: the amount of a regular
 * expense is its payment, an uneven one under 20 000 is a purchase on Ozon or WB.
 */
function selfHint(d: ReviewData, o: Operation): string | undefined {
  const regular = d.marking.regular.find((r) => Math.abs(r.amount - o.amount) < 1);
  if (regular) return `сумма «${regular.title}»`;
  if (o.amount < 20_000 && Math.round(o.amount) % 100 !== 0) return 'похоже на Ozon или WB';
  return undefined;
}

// ---- The assistant, faked by rules

interface Insight {
  icon: IconName;
  tone: Tone;
  title: string;
  text: string;
  href?: string;
}

function worstWeek(d: ReviewData): WeekSummary | undefined {
  return [...d.weeks].filter((w) => w.week <= d.today).sort((a, b) => b.spent - a.spent)[0];
}

function insights(page: Page): Insight[] {
  const { d, to } = page;
  const t = totals(d);
  const list: Insight[] = [];
  const over = t.inWeeks - t.limits;
  const worst = worstWeek(d);
  if (over > 0 && worst)
    list.push({
      icon: 'trendingUp',
      tone: 'red',
      title: `Недели потратили на ${money(over, d.symbol)} больше плана`,
      text: stop(`Больше всего — ${weekTitle(worst)}: ${money(worst.spent, d.symbol)}`),
      href: to({ ask: 'overspend' }),
    });
  if (t.doubtful.length)
    list.push({
      icon: 'flag',
      tone: 'yellow',
      title: `${count(t.doubtful.length, 'трата', 'траты', 'трат')} на ${money(t.doubtfulSum, d.symbol)} — непонятно что`,
      text: 'Считаются в неделях, но это переводы и траты без категории.',
      href: to({ ask: 'check' }),
    });
  const people = t.doubtful.filter((e) => e.bucket === 'person');
  if (people.length) {
    const largest = people[0]!.o;
    list.push({
      icon: 'arrowUpRight',
      tone: 'blue',
      title: `Переводы людям в неделях: ${money(people.reduce((s, e) => s + e.o.amount, 0), d.symbol)}`,
      text: stop(`${count(people.length, 'перевод')}, крупнейший — ${largest.payee} ${money(largest.amount, d.symbol)}`),
      href: `${to({ group: 'person' })}#check`,
    });
  }
  const self = t.doubtful.filter((e) => e.bucket === 'self');
  if (self.length) {
    const shop = self.filter((e) => e.o.amount < 20_000 && Math.round(e.o.amount) % 100 !== 0);
    list.push({
      icon: 'card',
      tone: 'violet',
      title: `Переводы себе: ${money(self.reduce((s, e) => s + e.o.amount, 0), d.symbol)}`,
      text: shop.length
        ? `${count(self.length, 'перевод')}, из них ${shop.length} с некруглой суммой похожи на покупки на Ozon и WB.`
        : `${count(self.length, 'перевод')}, круглые суммы — кредит или крупная покупка.`,
      href: `${to({ group: 'self' })}#check`,
    });
  }
  const growth = d.categories.find((c) => c.usual !== null && c.perWeek > c.usual * 1.2 && c.perWeek - c.usual > 2_000);
  if (growth)
    list.push({
      icon: categoryIcon(growth.title),
      tone: 'orange',
      title: `${growth.title}: ${money(growth.perWeek, d.symbol)} в неделю`,
      text: stop(`Обычно ${money(growth.usual!, d.symbol)}, на ${percent(growth.perWeek / growth.usual! - 1)} больше`),
      href: to({ ask: 'optimize' }),
    });
  if (t.extra < MONTH_LIMIT * 0.2)
    list.push({
      icon: 'check',
      tone: 'green',
      title: 'Дополнительные почти не тронуты',
      text: stop(`${money(t.extra, d.symbol)} из ${money(MONTH_LIMIT, d.symbol)}: крупные покупки можно планировать туда, а не в недели`),
      href: to({ ask: 'plan' }),
    });
  return list;
}

function side(page: Page): Html[] {
  const { d, to } = page;
  const found = insights(page);
  const all = d.suggestions.map((s) => s.key);
  const allOn = all.every((k) => d.applied.has(k));
  const flip = (key: SuggestionKey) => {
    const next = new Set(d.applied);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return to({ apply: [...next].join(',') || null });
  };
  const blocks: Array<Html | null> = [
    assistantHero({
      title: `Разобрал ${monthName(d.month)}`,
      text: stop(
        `Нашёл ${count(found.length, 'важный момент', 'важных момента', 'важных моментов')} и ${count(d.suggestions.length, 'рекомендацию', 'рекомендации', 'рекомендаций')}`,
      ),
      action: { label: 'Задать вопрос', href: to({ ask: 'ask' }) },
      chips: QUESTIONS.map((q) => ({ label: q.label, icon: q.icon, href: to({ ask: d.ask === q.key ? null : q.key }), active: d.ask === q.key })),
    }),
    d.ask ? answer(page, d.ask) : null,
    found.length ? listHeading({ title: 'Главные выводы', count: found.length }) : null,
    found.length ? insightList({ label: 'Главные выводы', items: found }) : null,
    d.suggestions.length
      ? listHeading({
          title: 'Рекомендации',
          count: d.suggestions.length,
          action: allOn ? { label: 'Сбросить', href: to({ apply: null }) } : { label: 'Применить все', href: to({ apply: all.join(',') }), primary: true },
        })
      : null,
    d.suggestions.length
      ? toggleList({
          label: 'Рекомендации',
          items: d.suggestions.map((s) => ({ icon: s.icon, title: s.title, text: s.text, on: d.applied.has(s.key), href: flip(s.key) })),
        })
      : null,
  ];
  return blocks.filter((x): x is Html => x !== null);
}

function answer(page: Page, ask: Question): Html {
  const { d, to } = page;
  const t = totals(d);
  const close = to({ ask: null });
  if (ask === 'ask') {
    const params = Object.fromEntries(new URL(to({ ask: 'ask' }), 'http://localhost').searchParams);
    return assistantAnswer({
      question: d.question ?? 'Спросите про этот месяц',
      paragraphs: d.question ? ['Здесь ответит Claude, когда его подключат к разбору. Пока готовы ответы на четыре вопроса выше.'] : [],
      closeHref: close,
      ask: { action: '/review', name: 'q', placeholder: 'Например: сколько ушло на машину?', params },
    });
  }
  if (ask === 'overspend') {
    const worst = worstWeek(d);
    const end = worst ? addDays(worst.week, 6) : d.to;
    const top = worst ? d.expenses.filter((e) => e.envelope === 'week' && e.o.date >= worst.week && e.o.date <= end).slice(0, 3) : [];
    return assistantAnswer({
      question: 'Где перерасход и почему',
      paragraphs: [
        stop(`Недели потратили ${money(t.inWeeks, d.symbol)} при плане ${money(t.limits, d.symbol)}`),
        worst ? `Больше всего потратила неделя ${weekTitle(worst)}, ${money(worst.spent, d.symbol)}, и раздули её траты ниже.` : '',
        `Обычные траты с категорией в неделях — ${money(t.ordinaryWeek, d.symbol)}, то есть ${money(t.ordinaryPerWeek, d.symbol)} в неделю при плане ${money(WEEK_LIMIT, d.symbol)}, остальное — переводы и траты без категории.`,
      ].filter(Boolean),
      links: top.map((e) => ({ label: `${dayMonth(e.o.date)} · ${markingTitle(e.o)}`, detail: money(e.o.amount, d.symbol), href: openSpend(page, e) })),
      closeHref: close,
    });
  }
  if (ask === 'check')
    return assistantAnswer({
      question: 'Какие траты проверить',
      paragraphs: [`${count(t.doubtful.length, 'трата', 'траты', 'трат')} на ${money(t.doubtfulSum, d.symbol)} считаются в неделях, а что это — непонятно. Крупнейшие:`],
      links: t.doubtful.slice(0, 6).map((e) => ({ label: `${dayMonth(e.o.date)} · ${e.o.payee}`, detail: money(e.o.amount, d.symbol), href: openSpend(page, e) })),
      closeHref: close,
    });
  if (ask === 'optimize') {
    const up = d.categories.filter((c) => c.usual !== null && c.perWeek > c.usual * 1.2 && c.perWeek - c.usual > 1_000);
    const down = d.categories.filter((c) => c.usual !== null && c.perWeek < c.usual * 0.8);
    return assistantAnswer({
      question: 'На чём сэкономить',
      paragraphs: [
        up.length
          ? stop(`Выросли: ${up.map((c) => `${c.title} — ${money(c.perWeek, d.symbol)} в неделю вместо ${money(c.usual!, d.symbol)}`).join('; ')}`)
          : 'Ни одна категория заметно не выросла.',
        down.length ? stop(`Меньше обычного: ${down.map((c) => c.title).join(', ')}`) : '',
        t.ordinaryPerWeek > WEEK_LIMIT
          ? stop(`Чтобы уложиться в ${money(WEEK_LIMIT, d.symbol)} в неделю, обычные траты надо сократить на ${money(t.ordinaryPerWeek - WEEK_LIMIT, d.symbol)} в неделю`)
          : `Обычные траты укладываются в ${money(WEEK_LIMIT, d.symbol)} в неделю: недели переполнили переводы.`,
      ].filter(Boolean),
      closeHref: close,
    });
  }
  const next = shiftMonth(d.month, 1);
  const realistic = Math.ceil(t.ordinaryPerWeek / 5_000) * 5_000;
  const weeks = d.nextWeeks * WEEK_LIMIT;
  const total = weeks + d.nextRegular + MONTH_LIMIT;
  return assistantAnswer({
    question: `План на ${monthName(next)}`,
    paragraphs: [
      stop(
        `${capitalize(monthName(next))}: ${count(d.nextWeeks, 'неделя', 'недели', 'недель')} по ${money(WEEK_LIMIT, d.symbol)} — ${money(weeks, d.symbol)}, регулярные ${money(d.nextRegular, d.symbol)}, дополнительные ${money(MONTH_LIMIT, d.symbol)}, всего ${money(total, d.symbol)}`,
      ),
      stop(`При доходе как в ${monthName(d.month, 'prepositional')} (${money(d.income, d.symbol)}) останется ${money(d.income - total, d.symbol)}`),
      realistic > WEEK_LIMIT
        ? stop(`Обычные траты были ${money(t.ordinaryPerWeek, d.symbol)} в неделю: либо поднять неделю до ${money(realistic, d.symbol)}, либо ужаться`)
        : stop(`Обычные траты были ${money(t.ordinaryPerWeek, d.symbol)} в неделю, ${money(WEEK_LIMIT, d.symbol)} хватает`),
    ],
    links: [{ label: `Открыть ${monthName(next)} на обзоре`, href: page.href('/', { view: 'month', month: next }) }],
    closeHref: close,
  });
}

/** Opens an expense in place in «Проверить», or on the overview's week when it is not there. */
function openSpend(page: Page, e: ReviewData['expenses'][number]): string {
  const { to, href } = page;
  if (isDoubtful(e.bucket)) return `${to({ group: e.bucket, edit: `spending-${e.o.id}` })}#spending-${e.o.id}`;
  return href('/operations', { month: monthOf(e.o.date), q: e.o.payee, edit: `spending-${e.o.id}` });
}

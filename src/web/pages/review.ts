// The month review, /review: what happened with a month's money and what to fix, the month just gone unless
// ?month= asks for another. The main column holds income, spending and what is left, where the income went, what the
// weeks were made of as a map of tiles, the weeks against their limits, and the regular payments. The side is the
// assistant: what it found, its answers to four questions (?ask=), its hints and what could be spared, as tabs
// (?list=). They are Claude's once it has reviewed the month (see src/claude-review.ts), and worked out by rules from
// the review until then (see src/review.ts); what is done with Claude's word posts to /review/claude/… (see
// submitClaude). A tile of the map opens on the side instead (?tile=): what it holds, Claude's word and the hints about
// it, and where to put its expenses — into another category, or a subcategory, a shop's for good and a transfer's
// one by one; those post to /review/… (see submitReview). What to check also opens on its own page,
// /review/check?kind=, one kind at a time by day; an expense opens in place there by ?edit=spending-<ZenMoney id> to be
// marked as on every page (see marking.ts), and leaves the list once it is explained.

import { mainCurrency } from '../../balances.ts';
import { categoryCatalog, NO_SUBCATEGORIES, subcategoryOf, type Subcategory, type SubcategorySetup } from '../../categories.ts';
import {
  claudeInput,
  NO_CLAUDE,
  openExpenses,
  openWord,
  readAnswer,
  spendingKey,
  splitKey,
  stateOf,
  type ClaudeInput,
  type ClaudeSaved,
  type ClaudeSplit,
  type Current,
  type OpenWord,
  type Placement,
} from '../../claude-review.ts';
import { addDays, localDate, monthOf, shiftMonth, type MonthString } from '../../dates.ts';
import { parseTitle } from '../../input.ts';
import { listOperations, type Operation } from '../../ledger.ts';
import { operationKind } from '../../operations.ts';
import { shopKey, shopName } from '../../payees.ts';
import type { RegularExpense } from '../../regular.ts';
import {
  findings,
  hintKeys,
  isToCheck,
  isTransfer,
  ordinaryPerWeek,
  reviewHints,
  reviewMonth,
  TO_CHECK,
  transferHint,
  weekParts,
  weekThatHolds,
  worstWeek,
  type Finding,
  type Hint,
  type MonthReview,
  type Question,
  type ReviewedExpense,
  type ToCheck,
  type WeekPart,
  type WeekPiece,
} from '../../review.ts';
import type { Settings } from '../../settings.ts';
import { MONTH_LIMIT, WEEK_LIMIT, weeksOfMonth, type WeekSummary } from '../../week.ts';
import type { DateString, EntityCollections, TagId } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { capitalize, dayMonth, dayMonthYear, money, monthName, percent, plural } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryIcon, type IconName } from '../icons.ts';
import { categoryColor, toneColor, type Tone } from '../tones.ts';
import { balanceTotal } from '../widgets/accounts.ts';
import { assistantAnswer, assistantHero, insightList, suggestionList } from '../widgets/assistant.ts';
import { choiceGroup, emptyState, field, footnote, inlineForm, listHeading, pageIntro, section, segmentedLinks } from '../widgets/basics.ts';
import { figureCard, panelCard } from '../widgets/cards.ts';
import { categoryMap, flowChart, weekBars } from '../widgets/charts.ts';
import { entryForm, entryList } from '../widgets/entries.ts';
import { amountList, dayGroup, operationRow } from '../widgets/operations.ts';
import { appShell, grid, screenOnly, stack, toolbar, topBar } from '../widgets/shell.ts';
import { appRail, monthTabs, parseMonth, userName, type Href } from './chrome.ts';
import { budgetOf, type SavedBudget } from './dashboard.ts';
import { allExpenses, allIncomes, envelopeMark, loadMarking, markingActions, markingPanel, markingTitle, type Marking } from './marking.ts';

/** Questions to the assistant, as its chips offer them. */
const CHIPS: Array<{ key: Question; label: string; icon: IconName }> = [
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
  /** What the weeks were made of, largest first. */
  parts: WeekPart[];
  hints: Hint[];
  subcategories: SubcategorySetup;
  selfPayee: string | null;
  /** On /review: the part of the map open on the side, its piece or one expense (see partId and opened). */
  tile: string | null;
  /** The expenses of the month's weeks as they are now, largest first. */
  current: Current[];
  /** Claude's review of the month as saved, and what of its marking, questions and splits is still open. */
  claude: ClaudeSaved;
  word: OpenWord | null;
  /** The list the side shows. */
  list: List;
}

/** The lists of the assistant, one at a time (?list=); what could be spared comes only from Claude. */
const LISTS = ['findings', 'hints', 'spare'] as const;
type List = (typeof LISTS)[number];

export function loadReview(
  data: EntityCollections,
  saved: SavedBudget,
  options: {
    today: DateString;
    month?: string | null;
    ask?: string | null;
    kind?: string | null;
    edit?: string | null;
    tile?: string | null;
    list?: string | null;
    /** Claude's review of the month as saved; none when not given. */
    claude?: (month: MonthString) => ClaudeSaved;
  },
): ReviewData {
  const { today } = options;
  const month = reviewedMonth(options.month, today);
  const weeks = weeksOfMonth(month, saved.weekStart);
  // Three months before tell what is usual.
  const earliest = weeksOfMonth(shiftMonth(month, -3), saved.weekStart)[0] ?? weeks[0]!;
  const budget = budgetOf(data, saved, { today, from: earliest });
  const incomes = listOperations(data, { from: weeks[0]!, to: addDays(weeks.at(-1)!, 6) }, saved).filter((o) => o.kind === 'income');
  const review = reviewMonth(budget, incomes, { month, today, selfPayee: saved.selfPayee ?? null });
  const kind = TO_CHECK.find((k) => k === options.kind) ?? TO_CHECK.find((k) => review.toCheck.some((e) => e.kind === k)) ?? 'person';
  const history = allExpenses(data, saved);
  const marking = loadMarking(data, saved, history, today);
  const subcategories = saved.subcategories ?? NO_SUBCATEGORIES;
  const selfPayee = saved.selfPayee ?? null;
  const current = review.expenses.map((e) => ({ ...e, subcategory: subcategoryOf(e.operation, subcategories, { shop: !isTransfer(e.operation, selfPayee) }) }));
  const claude = options.claude?.(month) ?? NO_CLAUDE;
  return {
    today,
    review,
    findings: findings(review, today, saved.regular),
    ask: CHIPS.find((q) => q.key === options.ask)?.key ?? null,
    kind,
    regular: saved.regular,
    marking,
    edit: options.edit ?? null,
    symbol: mainCurrency(data).symbol,
    userName: userName(data),
    parts: weekParts(review, { subcategories, regular: saved.regular, selfPayee }),
    hints: reviewHints(review, {
      history,
      incomes: allIncomes(data, saved),
      categories: categoryCatalog(data.tag ?? [], saved.categories),
      incomeCategories: marking.incomeCategories,
      subcategories,
      regular: saved.regular,
      selfPayee,
      today,
      dismissed: saved.dismissedHints ?? new Set(),
    }),
    subcategories,
    selfPayee,
    tile: options.tile ?? null,
    current,
    claude,
    word: claude.review ? openWord(claude.review, claude.decisions, current, marking.categories) : null,
    list: LISTS.find((l) => l === options.list) ?? 'findings',
  };
}

/** The month a review is of: the one asked for, if it has begun, or else the month just gone. */
export function reviewedMonth(value: string | null | undefined, today: DateString): MonthString {
  return value ? parseMonth(value, monthOf(today)) : shiftMonth(monthOf(today), -1);
}

interface Page {
  d: ReviewData;
  href: Href;
  /** This page with an expense, an answer, a tile or a list open or closed, keeping the rest of its state. */
  here: (changes: { edit?: string | null; ask?: string | null; tile?: string | null; list?: string | null }) => string;
}

/** The page of one kind of expenses to check, with one of them open. */
function checkHref(d: ReviewData, href: Href, kind: ToCheck, edit?: string): string {
  return `${href('/review/check', { month: d.review.month, kind, edit })}${edit ? `#${edit}` : ''}`;
}

export function renderReview(d: ReviewData, href: Href): Html {
  const here: Page['here'] = (changes) => href('/review', { month: d.review.month, ask: d.ask, tile: d.tile, list: d.list === 'findings' ? null : d.list, ...changes });
  const page: Page = { d, href, here };
  const tile = d.tile ? tileSide(page) : null;
  const body = appShell({
    rail: appRail('review', d.userName, href),
    tabs: monthTabs(monthOf(d.today), d.review.month, (m) => href('/review', { month: m ?? monthOf(d.today) })),
    // On a narrow screen the side goes under the main panel, so an open tile opens in place, under its part of the map.
    main: main(page, tile),
    side: tile ? [screenOnly({ screen: 'wide', items: tile }), screenOnly({ screen: 'narrow', items: side(page) })] : side(page),
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

function sum(expenses: readonly Operation[]): number {
  return expenses.reduce((s, o) => s + o.amount, 0);
}

// ---- Main column

/** `tile` is what the open tile shows, if any. */
function main(page: Page, tile: Html[] | null): Html[] {
  const { d, href, here } = page;
  const r = d.review;
  const over = r.inWeeks - r.limits;
  return [
    topBar({ crumbs: [{ label: span(r), icon: 'calendar' }] }),
    pageIntro({
      title: `Разбор ${monthName(r.month, 'genitive')}`,
      text: 'Что произошло с деньгами и что стоит поправить.',
      badge: badge(d),
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
    weekMap(page, tile),
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
          href: here({ ask: 'overspend', tile: null }),
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
          title: 'Регулярные платежи',
          amount: r.regular,
          symbol: d.symbol,
          note: 'вне лимитов',
          href: href('/regular'),
          body: r.regular > 0 ? amountList({ label: 'Регулярные платежи месяца', items: regularRows(r) }) : emptyState({ text: 'Платежей регулярных трат нет.' }),
        }),
      ],
    }),
  ].filter((block): block is Html => block !== null);
}

/** The kinds of expenses to check, each leading to its page; the one listed there is highlighted. */
function toCheckRows(page: Page, current: ToCheck): Html {
  const { d, href } = page;
  const kinds = TO_CHECK.filter((k) => d.review.toCheck.some((e) => e.kind === k));
  if (!kinds.length) return emptyState({ text: 'Всё, что считается в неделях, размечено.' });
  return amountList({
    label: 'Траты, про которые непонятно, что это',
    symbol: d.symbol,
    items: kinds.map((k) => ({
      label: TO_CHECK_ROWS[k].title,
      icon: TO_CHECK_ROWS[k].icon,
      tone: TO_CHECK_ROWS[k].tone,
      amount: sumOf(d.review.toCheck.filter((e) => e.kind === k)),
      href: checkHref(d, href, k),
      active: k === current,
    })),
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

// ---- What the weeks were made of

/** How many pieces a part shows on the map; past them the rest go together as Ещё N. */
const PIECES_SHOWN = 7;

/** The pieces a part shows on the map, and the rest it folds into Ещё N, which opens as <part>:more. */
function folded(part: WeekPart): { shown: WeekPiece[]; rest: WeekPiece[] } {
  const shown = part.pieces.length > PIECES_SHOWN ? part.pieces.slice(0, PIECES_SHOWN - 1) : part.pieces;
  return { shown, rest: part.pieces.slice(shown.length) };
}

/** A part of the map as ?tile= names it: category-<id> or check-<kind>; a piece is <part>:<piece key>. */
function partId(part: WeekPart): string {
  return part.category ? `category-${part.category.id}` : `check-${part.kind}`;
}

function partLabel(part: WeekPart): string {
  return part.category?.title ?? TO_CHECK_ROWS[part.kind as ToCheck].title;
}

function pieceLabel(piece: WeekPiece): string {
  if (piece.by === 'subcategory') return piece.subcategory?.title ?? 'Без подкатегории';
  if (piece.by === 'shop') return piece.name;
  if (piece.hint === 'marketplace') return 'Похоже на Ozon и WB';
  if (piece.hint === 'round') return 'Круглые суммы';
  return `Сумма «${piece.hint.regular}»`;
}

/** Expenses some hint would move, by id. */
function hinted(hints: readonly Hint[]): Set<string> {
  return new Set(hints.flatMap((h) => (h.kind === 'hide' ? [] : h.expenses.map((o) => o.id))));
}

/** `tile` is what the open tile shows, if any, to open under its part on a narrow screen. */
function weekMap(page: Page, tile: Html[] | null): Html {
  const { d, here } = page;
  const open = tile ? opened(d) : null;
  const total = d.parts.reduce((s, p) => s + p.amount, 0);
  const unsorted = d.parts.filter((p) => !p.category).reduce((s, p) => s + p.amount, 0);
  const moved = new Set([...hinted(d.hints), ...(d.word ? openExpenses(d.word) : [])]);
  const hasHint = (expenses: Operation[]) => expenses.some((o) => moved.has(o.id));
  const link = (id: string) => here({ tile: d.tile === id ? null : id });
  return panelCard({
    title: 'Из чего недели',
    amount: total,
    symbol: d.symbol,
    note: [unsorted > 0 ? `не разобрано ${money(unsorted, d.symbol)}, ${percent(unsorted / total)}` : 'всё разобрано', moved.size ? 'точка и сиреневая рамка — есть подсказка' : '']
      .filter(Boolean)
      .join(' · '),
    body: d.parts.length
      ? categoryMap({
          label: 'Траты недель по категориям',
          symbol: d.symbol,
          groups: d.parts.map((part) => {
            const id = partId(part);
            const { shown, rest } = folded(part);
            const items = shown.map((piece) => ({
              label: pieceLabel(piece),
              amount: piece.amount,
              href: link(`${id}:${piece.key}`),
              active: d.tile === `${id}:${piece.key}`,
              hinted: hasHint(piece.expenses),
            }));
            const folds = rest.flatMap((p) => p.expenses);
            if (rest.length) items.push({ label: `Ещё ${rest.length}`, amount: sum(folds), href: link(`${id}:more`), active: d.tile === `${id}:more`, hinted: hasHint(folds) });
            return {
              label: partLabel(part),
              amount: part.amount,
              color: part.category ? categoryColor(part.category.id, part.category.color) : toneColor('gray'),
              hatched: !part.category,
              href: link(id),
              active: d.tile === id,
              hinted: hasHint(part.expenses),
              items,
              panel: open?.part === part ? tile : undefined,
            };
          }),
        })
      : emptyState({ text: 'Трат в неделях нет.' }),
  });
}

/** What ?tile= opens: a part, a piece of it, the pieces it folds into Ещё N (`rest`), or one expense, with its part. */
type Opened =
  | { part: WeekPart; piece: WeekPiece | null; rest: WeekPiece[] | null; expense: null }
  | { part: WeekPart | null; piece: null; rest: null; expense: Operation };

/**
 * The tile open on the side. A shop of a split category is no piece on the map, but opens as one from its
 * subcategory. A piece that is gone, as its expenses went elsewhere or its subcategory was deleted, opens its part.
 */
function opened(d: ReviewData): Opened | null {
  const tile = d.tile ?? '';
  if (tile.startsWith('spending-')) {
    const expense = d.parts.flatMap((p) => p.expenses).find((o) => `spending-${o.id}` === tile);
    return expense ? { part: d.parts.find((p) => p.expenses.includes(expense)) ?? null, piece: null, rest: null, expense } : null;
  }
  const [id, key] = tile.split(/:(.*)/s);
  const part = d.parts.find((p) => partId(p) === id);
  if (!part) return null;
  const piece = part.pieces.find((p) => p.key === key);
  if (piece) return { part, piece, rest: null, expense: null };
  const { rest } = folded(part);
  if (key === 'more' && rest.length) return { part, piece: null, rest, expense: null };
  const shop = key?.startsWith('shop-') ? part.expenses.filter((o) => `shop-${shopKey(o.payee)}` === key) : [];
  if (shop.length) return { part, piece: { key: key!, by: 'shop', name: shopName(shop[0]!.payee), amount: sum(shop), expenses: shop }, rest: null, expense: null };
  return { part, piece: null, rest: null, expense: null };
}

/** The side with a tile open: what it holds, the hints about it, and where to put its expenses. */
function tileSide(page: Page): Html[] {
  const { d, here } = page;
  const back = toolbar({ items: [segmentedLinks({ label: 'Назад', items: [{ label: '← К выводам', href: here({ tile: null }) }] })] });
  const open = opened(d);
  if (!open) return [back, emptyState({ text: 'Здесь больше ничего нет: траты разнесены.' })];
  const expenses = open.expense ? [open.expense] : open.piece ? open.piece.expenses : open.rest ? open.rest.flatMap((p) => p.expenses) : open.part.expenses;
  const amount = sum(expenses);
  const label = open.expense
    ? `${dayMonth(open.expense.date)} · ${markingTitle(open.expense)}`
    : open.piece
      ? `${partLabel(open.part)} › ${pieceLabel(open.piece)}`
      : open.rest
        ? `${partLabel(open.part)} › Ещё ${open.rest.length}`
        : partLabel(open.part);
  const ids = new Set(expenses.map((o) => o.id));
  const hints = ruleHints(d).filter((h) => h.kind !== 'hide' && h.expenses.some((o) => ids.has(o.id)));
  const word = claudeAbout(page, ids, open.piece || open.expense || open.rest ? null : open.part.category);
  return [
    back,
    figureCard({
      label,
      amount,
      symbol: d.symbol,
      note: open.expense ? open.expense.account : `${count(expenses.length, EXPENSES)}, ${percent(amount / Math.max(1, d.review.inWeeks))} недель`,
    }),
    word.length ? listHeading({ title: 'Claude об этом', count: word.length }) : null,
    word.length ? suggestionList({ label: 'Claude об этом', items: word }) : null,
    hints.length ? suggestionList({ label: 'Подсказки', items: hints.map((h) => hintItem(page, h)) }) : null,
    ...(open.expense ? expenseTile(page, open.expense, open.part) : open.piece ? pieceTile(page, open.part, open.piece) : partTile(page, open.part, open.rest ?? open.part.pieces)),
  ].filter((block): block is Html => block !== null);
}

/**
 * A whole part, or what it folds into Ещё N: its pieces, each opening on its own; what to check also goes one by one on
 * its page.
 */
function partTile(page: Page, part: WeekPart, pieces: WeekPiece[]): Html[] {
  const { d, href, here } = page;
  const id = partId(part);
  const title = part.kind === 'self' ? 'По сумме' : pieces[0]?.by === 'subcategory' ? 'Подкатегории' : part.kind === 'person' ? 'Кому' : 'Получатели';
  return [
    section({
      title,
      body: amountList({
        label: title,
        symbol: d.symbol,
        items: pieces.map((piece) => ({ label: pieceLabel(piece), amount: piece.amount, note: `${piece.expenses.length} шт.`, href: here({ tile: `${id}:${piece.key}` }) })),
      }),
    }),
    part.category ? null : segmentedLinks({ label: 'Проверить', items: [{ label: 'Разметить по одной →', href: checkHref(d, href, part.kind as ToCheck) }] }),
  ].filter((block): block is Html => block !== null);
}

function pieceTile(page: Page, part: WeekPart, piece: WeekPiece): Html[] {
  const { d, here } = page;
  const id = partId(part);
  const spends = section({ title: 'Траты', body: expenseLinks(page, piece.expenses) });
  if (!part.category) return [categoryChoices(page, piece.expenses, null), spends];
  const category = part.category;
  if (piece.by === 'subcategory') {
    const shops = new Map<string, Operation[]>();
    for (const o of piece.expenses) shops.set(shopKey(o.payee), [...(shops.get(shopKey(o.payee)) ?? []), o]);
    return [
      section({
        title: 'Получатели',
        body: amountList({
          label: 'Получатели',
          symbol: d.symbol,
          items: [...shops].map(([key, expenses]) => ({ label: shopName(expenses[0]!.payee), amount: sum(expenses), note: `${expenses.length} шт.`, href: here({ tile: `${id}:shop-${key}` }) })),
        }),
      }),
      piece.subcategory ? subcategoryForm(page, piece.subcategory) : null,
    ].filter((block): block is Html => block !== null);
  }
  return [...subcategoryChoices(page, category, piece.expenses), categoryChoices(page, piece.expenses, category.id), spends];
}

/** One expense: its category and subcategory, and all of its marking where it is marked in full. */
function expenseTile(page: Page, o: Operation, part: WeekPart | null): Html[] {
  const { d, href } = page;
  const kind = part && !part.category ? (part.kind as ToCheck) : null;
  const marking = kind ? checkHref(d, href, kind, `spending-${o.id}`) : `${href('/operations', { month: monthOf(o.date), q: o.payee, edit: `spending-${o.id}` })}#spending-${o.id}`;
  return [
    ...(o.category ? subcategoryChoices(page, o.category, [o]) : []),
    categoryChoices(page, [o], o.category?.id ?? null),
    segmentedLinks({ label: 'Разметка', items: [{ label: 'Вся разметка траты →', href: marking }] }),
  ];
}

/** Expenses, each opening on its own, newest first. */
function expenseLinks(page: Page, expenses: Operation[]): Html {
  const { d, here } = page;
  return amountList({
    label: 'Траты',
    symbol: d.symbol,
    items: [...expenses]
      .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created)
      .map((o) => ({ label: `${dayMonth(o.date)} · ${markingTitle(o)}`, amount: o.amount, href: here({ tile: `spending-${o.id}` }) })),
  });
}

/** Where to move expenses: the categories shown when marking, the one a hint suggests marked. */
function categoryChoices(page: Page, expenses: Operation[], current: TagId | null): Html {
  const { d, href } = page;
  const ids = expenses.map((o) => o.id);
  const suggested = d.hints.find((h) => h.kind !== 'hide' && h.expenses.some((o) => ids.includes(o.id)))?.category.id;
  return choiceGroup({
    label: expenses.length > 1 ? `Категория этих ${count(expenses.length, ['траты', 'трат', 'трат'])}` : 'Категория',
    choices: d.marking.categories
      .filter((c) => !c.hidden || c.id === current)
      .map((c) => ({
        label: c.title,
        color: categoryColor(c.id, c.color),
        current: c.id === current,
        suggested: c.id === suggested,
        action: href('/review/move', { spending: ids.join(','), category: c.id }),
      })),
  });
}

/**
 * The subcategories of a category to put expenses into. A shop's expenses go into one for good, its new ones too,
 * so the choice is the shop's; a transfer's is only its own.
 */
function subcategoryChoices(page: Page, category: { id: TagId; title: string }, expenses: Operation[]): Html[] {
  const { d, href } = page;
  const first = expenses[0]!;
  const shop = !isTransfer(first, d.selfPayee);
  const target = shop ? { shop: first.payee } : { spending: expenses.map((o) => o.id).join(',') };
  const subs = d.subcategories.subcategories.filter((s) => s.category === category.id);
  const of = (o: Operation) => subcategoryOf(o, d.subcategories, { shop }) ?? null;
  const current = expenses.every((o) => of(o)?.id === of(first)?.id) ? (of(first)?.id ?? null) : undefined;
  const ids = new Set(expenses.map((o) => o.id));
  const usual = d.hints.find((h) => h.kind === 'usual' && h.expenses.some((o) => ids.has(o.id)));
  const suggested = usual?.kind === 'usual' ? usual.subcategory?.id : undefined;
  const action = (subcategory: string) => href('/review/subcategory', { category: category.id, ...target, subcategory });
  return [
    choiceGroup({
      label: 'Подкатегория',
      choices: [
        ...subs.map((s) => ({ label: s.title, current: s.id === current, suggested: s.id === suggested, action: action(String(s.id)) })),
        { label: 'Без подкатегории', current: current === null, action: action('none') },
      ],
    }),
    inlineForm({ label: 'Новая подкатегория', action: href('/review/subcategory', { category: category.id, ...target }), name: 'title', placeholder: 'Например, Лента', maxLength: 80, submitLabel: 'Добавить' }),
    footnote({
      text: shop
        ? `Все траты ${shopName(first.payee)} из «${category.title}» пойдут в подкатегорию сами, и новые тоже.`
        : 'У перевода подкатегория своя у каждой траты: следующие переводы получат её подсказкой.',
    }),
  ];
}

/** A subcategory's title to change, or to delete it, its expenses left without one. */
function subcategoryForm(page: Page, sub: Subcategory): Html {
  const { href } = page;
  return entryList({
    label: 'Подкатегория',
    items: [
      entryForm({
        action: href(`/review/subcategories/${sub.id}`),
        submitLabel: 'Сохранить',
        icon: 'layers',
        color: toneColor('violet'),
        fields: field({ label: 'Название подкатегории', name: 'title', value: sub.title, maxLength: 80, required: true }),
        deleteAction: href(`/review/subcategories/${sub.id}/delete`),
      }),
    ],
  });
}

function hintItem(page: Page, h: Hint): { icon: IconName; tone: Tone; title: string; text: string; source: string; actions: Array<{ label: string; action: string }> } {
  const { d, href } = page;
  const s = d.symbol;
  const dismiss = { label: 'Не надо', action: href('/review/dismiss', { hints: hintKeys(h).join(',') }) };
  if (h.kind === 'hide')
    return {
      icon: 'x',
      tone: 'gray',
      title: `Скрыть «${h.category.title}»`,
      text: h.last ? `За три месяца трат в ней нет, последняя — ${dayMonthYear(h.last, d.today)}.` : 'Трат в ней не было ни разу.',
      source: 'правило',
      actions: [{ label: 'Скрыть', action: href(`/review/hide/${h.category.id}`) }, dismiss],
    };
  const spending = h.expenses.map((o) => o.id).join(',');
  const amount = stop(`${count(h.expenses.length, h.kind === 'marketplace' ? TRANSFERS : EXPENSES)} на ${money(sum(h.expenses), s)}`);
  const into = (sub: { title: string } | null) => `«${h.category.title}${sub ? ` › ${sub.title}` : ''}»`;
  if (h.kind === 'marketplace') {
    const sub = h.subcategory;
    return {
      icon: 'card',
      tone: 'violet',
      title: `Переводы себе с некруглой суммой → ${into(sub)}`,
      text: `${amount} Так выглядит оплата покупок на Ozon и WB, а какой из двух банков — по данным не видно.`,
      source: 'по прошлым переводам',
      actions: [{ label: 'Перенести', action: href('/review/move', { spending, category: h.category.id, ...('id' in sub ? { subcategory: String(sub.id) } : { title: sub.title }) }) }, dismiss],
    };
  }
  const name = shopName(h.expenses[0]!.payee);
  const times = h.times === 1 ? 'Так размечена трата' : `Так размечены ${h.times}${h.times < h.of ? ` из ${h.of}` : ''} ${plural(h.times, EXPENSES)}, последняя —`;
  return {
    icon: 'repeat',
    tone: 'green',
    title: `${name} → ${into(h.subcategory)}`,
    text: `${amount} ${stop(`${times} ${dayMonthYear(h.last.date, d.today)} на ${money(h.last.amount, s)}`)}`,
    source: 'по прошлым тратам',
    actions: [{ label: 'Перенести', action: href('/review/move', { spending, category: h.category.id, subcategory: h.subcategory ? String(h.subcategory.id) : null }) }, dismiss],
  };
}

// ---- Forms

export type ReviewSubmission = { status: 'saved' } | { status: 'missing' } | { status: 'invalid'; error: string };

/**
 * Applies a form posted to /review/…, with what it carries in `form`, the query of its URL and its fields alike:
 * - move — the expenses in `spending` (ids, by commas) go into `category`, only they, and into its `subcategory` (an id)
 *   or a new one titled `title`;
 * - subcategory — the expenses of `category` of the shop `shop` (as the bank names it, any of its shops) or those in
 *   `spending` go into `subcategory`, none with none, or into a new one titled `title`;
 * - subcategories/:id — renames a subcategory to `title`; subcategories/:id/delete deletes it;
 * - hide/:category — hides a category from marking;
 * - dismiss — turns down the hints in `hints` (as hintKeys names them, by commas).
 * Payments of regular expenses keep where they are. The category, subcategory and expenses must exist.
 */
export function submitReview(settings: Settings, data: EntityCollections, path: string, form: URLSearchParams): ReviewSubmission {
  const catalog = categoryCatalog(data.tag ?? [], settings.categorySetup());
  const category = catalog.find((c) => c.id === form.get('category'));
  const sorted = settings.categorizations();
  const existing = new Set((data.transaction ?? []).filter((t) => !t.deleted && operationKind(t) === 'expense').map((t) => t.id));
  const spending = (form.get('spending') ?? '')
    .split(',')
    .filter((id) => existing.has(id))
    .filter((id) => !(sorted.get(id) && 'regular' in sorted.get(id)!));
  /** The subcategory of `category` the form names, a new one by its title, or null for none; undefined when wrong. */
  const subcategory = (): Subcategory | null | undefined => {
    if (!category) return undefined;
    const title = form.get('title');
    if (title !== null) {
      const parsed = parseTitle(title);
      return 'error' in parsed ? undefined : settings.addSubcategory(category.id, parsed.value);
    }
    const id = form.get('subcategory');
    if (id === null || id === 'none') return null;
    return settings.subcategorySetup().subcategories.find((s) => String(s.id) === id && s.category === category.id);
  };

  if (path === '/review/move') {
    if (!category || !spending.length) return { status: 'missing' };
    const sub = form.has('subcategory') || form.has('title') ? subcategory() : null;
    if (sub === undefined) return { status: 'missing' };
    for (const id of spending) {
      settings.categorize(id, { tag: category.id });
      if (sub) settings.putSpending(id, sub.id);
    }
    return { status: 'saved' };
  }
  if (path === '/review/subcategory') {
    const shop = shopKey(form.get('shop') ?? '');
    if (!category || (!shop && !spending.length)) return { status: 'missing' };
    const title = form.get('title');
    const parsed = title === null ? null : parseTitle(title);
    if (parsed && 'error' in parsed) return { status: 'invalid', error: parsed.error };
    const sub = subcategory();
    if (sub === undefined) return { status: 'missing' };
    if (shop) settings.putShop(category.id, shop, sub?.id ?? null);
    else for (const id of spending) settings.putSpending(id, sub?.id ?? null);
    return { status: 'saved' };
  }
  const [, id, action] = /^\/review\/subcategories\/(\d+)(?:\/(delete))?$/.exec(path) ?? [];
  if (id) {
    if (action === 'delete') return settings.deleteSubcategory(Number(id)) ? { status: 'saved' } : { status: 'missing' };
    const title = parseTitle(form.get('title') ?? '');
    if ('error' in title) return { status: 'invalid', error: title.error };
    return settings.renameSubcategory(Number(id), title.value) ? { status: 'saved' } : { status: 'missing' };
  }
  const [, hide] = /^\/review\/hide\/([\w-]+)$/.exec(path) ?? [];
  if (hide) {
    if (!catalog.some((c) => c.id === hide)) return { status: 'missing' };
    settings.hideCategory(hide, true);
    return { status: 'saved' };
  }
  if (path === '/review/dismiss') {
    const hints = (form.get('hints') ?? '').split(',').filter((h) => /^(hide|spending):[\w-]+$/.test(h));
    if (!hints.length) return { status: 'missing' };
    settings.dismissHints(hints);
    return { status: 'saved' };
  }
  return { status: 'missing' };
}

// ---- Claude's word

/**
 * Applies a form posted to /review/claude/…, about Claude's word on `month` as the review shows it now (see openWord):
 * - accept — Claude's marking of the expenses in `spending` (ids, by commas) is applied to them;
 * - answer — the option numbered `option` of Claude's question about `spending` is applied to them;
 * - split — Claude's split of `category` makes its subcategories and puts its payees' expenses into them: a shop's for
 *   good, a transfer's of the month one by one;
 * - decline — Claude's marking of `spending`, or its split of `category`, is turned down;
 * - ask — asks Claude to review the month again; cancel takes that back.
 * What is done with Claude's word is kept, so that a later answer brings none of it back.
 */
export function submitClaude(
  settings: Settings,
  data: EntityCollections,
  path: string,
  form: URLSearchParams,
  context: { today: DateString; saved: SavedBudget; now: Date },
): ReviewSubmission {
  const month = reviewedMonth(form.get('month'), context.today);
  const at = context.now.toISOString();
  if (path === '/review/claude/ask' || path === '/review/claude/cancel') {
    settings.requestClaudeReview(month, path === '/review/claude/ask' ? at : null);
    return { status: 'saved' };
  }
  const word = loadReview(data, context.saved, { today: context.today, month, claude: (m) => settings.claude(m) });
  if (!word.word) return { status: 'missing' };
  const ids = (form.get('spending') ?? '').split(',').filter(Boolean);
  const about = (expenses: readonly Operation[]) => ids.length > 0 && ids.every((id) => expenses.some((o) => o.id === id));
  const named = (expenses: readonly Operation[]) => expenses.filter((o) => ids.includes(o.id));
  const marking = word.word.marking.find((m) => about(m.expenses));
  const split = word.word.splits.find((x) => x.category.id === form.get('category'));
  switch (path) {
    case '/review/claude/accept':
      if (!marking) return { status: 'missing' };
      place(settings, named(marking.expenses), marking.item);
      settings.decideClaude(ids.map(spendingKey), { decision: 'accepted', answer: null }, at);
      return { status: 'saved' };
    case '/review/claude/answer': {
      const question = word.word.questions.find((q) => about(q.expenses));
      const option = /^\d+$/.test(form.get('option') ?? '') ? question?.item.options[Number(form.get('option'))] : undefined;
      if (!question || !option) return { status: 'missing' };
      place(settings, named(question.expenses), option);
      settings.decideClaude(ids.map(spendingKey), { decision: 'answered', answer: option.label }, at);
      return { status: 'saved' };
    }
    case '/review/claude/split':
      if (!split) return { status: 'missing' };
      splitCategory(settings, word, split.item);
      settings.decideClaude([splitKey(split.category.id)], { decision: 'accepted', answer: null }, at);
      return { status: 'saved' };
    case '/review/claude/decline':
      if (split) settings.decideClaude([splitKey(split.category.id)], { decision: 'declined', answer: null }, at);
      else if (marking) settings.decideClaude(ids.map(spendingKey), { decision: 'declined', answer: null }, at);
      else return { status: 'missing' };
      return { status: 'saved' };
  }
  return { status: 'missing' };
}

/** Puts expenses where Claude's word says, as moves on the map do; payments of regular expenses keep where they are. */
function place(settings: Settings, expenses: readonly Operation[], p: Placement): void {
  const sub = p.category !== null && p.subcategory !== null ? settings.addSubcategory(p.category, p.subcategory) : null;
  for (const o of expenses) {
    if (o.regular) continue;
    if (p.category !== null) settings.categorize(o.id, { tag: p.category });
    if (sub) settings.putSpending(o.id, sub.id);
    if (p.envelope !== null) settings.markSpending(o.id, p.envelope);
  }
}

/**
 * Makes the subcategories of Claude's split and puts its payees into them: a shop of the month for good, as the map
 * does, and the month's transfers in the category one by one.
 */
function splitCategory(settings: Settings, d: ReviewData, split: ClaudeSplit): void {
  const shops = new Set(d.current.map((c) => shopKey(c.operation.payee)));
  for (const { title, payees } of split.subcategories) {
    const sub = settings.addSubcategory(split.category, title);
    for (const payee of payees) {
      const key = shopKey(payee);
      if (!isTransfer({ payee }, d.selfPayee)) {
        if (shops.has(key)) settings.putShop(split.category, key, sub.id);
        continue;
      }
      for (const { operation: o } of d.current) if (o.category?.id === split.category && shopKey(o.payee) === key) settings.putSpending(o.id, sub.id);
    }
  }
}

/**
 * Keeps Claude's answer about `month`, replacing the one before, with what each expense of the month is now; an
 * answer to a request made before it ends the request. Errors say why the answer is none; `dropped`, what of it names
 * nothing of the month and was left out.
 */
export function saveClaudeAnswer(
  settings: Settings,
  data: EntityCollections,
  value: unknown,
  context: { today: DateString; month: string | null; saved: SavedBudget; now: Date },
): { status: 'saved'; month: MonthString; dropped: string[] } | { status: 'invalid'; errors: string[] } {
  const d = loadReview(data, context.saved, { today: context.today, month: context.month });
  const read = readAnswer(value, { expenses: new Set(d.current.map((c) => c.operation.id)), categories: new Set(d.marking.categories.map((c) => c.id)) });
  if ('errors' in read) return { status: 'invalid', errors: read.errors };
  const month = d.review.month;
  settings.saveClaudeReview({ month, madeAt: context.now.toISOString(), answer: read.answer, seen: new Map(d.current.map((c) => [c.operation.id, stateOf(c)])) });
  return { status: 'saved', month, dropped: read.dropped };
}

/** The month as Claude is given it to review (see claudeInput), with what it said before and what became of it. */
export function loadClaudeInput(
  data: EntityCollections,
  saved: SavedBudget,
  options: { today: DateString; month: string | null; claude: (month: MonthString) => ClaudeSaved },
): ClaudeInput {
  const d = loadReview(data, saved, options);
  const r = d.review;
  return claudeInput({
    review: r,
    today: d.today,
    weekStart: saved.weekStart,
    month: d.current,
    ignored: listOperations(data, { from: r.from, to: r.to }, saved, { withIgnored: true }).filter((o) => o.kind === 'expense' && o.ignored),
    history: allExpenses(data, saved),
    categories: d.marking.categories,
    subcategories: d.subcategories.subcategories,
    regular: d.regular,
    selfPayee: d.selfPayee,
    claude: d.claude,
  });
}

// ---- The assistant

/**
 * The assistant: a card with what it did and the four questions as chips, the answer asked for, and its lists as tabs —
 * what it found, its hints, and what could be spared. Once Claude has reviewed the month, the card, the findings, the
 * answers and what could be spared are Claude's, and its questions, marking and splits lead the hints, before those
 * of rules; until then all of it comes from rules, and the card offers to ask Claude.
 */
function side(page: Page): Html[] {
  const { d, here } = page;
  const review = d.claude.review;
  const found = review ? review.answer.findings.map((f) => claudeFinding(page, f)) : d.findings.map((f) => insight(page, f));
  const hints = [...claudeHints(page), ...ruleHints(d).map((h) => hintItem(page, h))];
  const spare = review?.answer.avoidable ?? [];
  const lists = LISTS.filter((l) => l !== 'spare' || review).map((key) => ({
    key,
    label: { findings: 'Выводы', hints: 'Подсказки', spare: 'Лишние траты' }[key],
    count: { findings: found.length, hints: hints.length, spare: spare.length }[key],
  }));
  const list = lists.some((l) => l.key === d.list) ? d.list : 'findings';
  const body =
    list === 'hints'
      ? hints.length
        ? suggestionList({ label: 'Подсказки', items: hints })
        : emptyState({ text: 'Подсказок нет.' })
      : list === 'spare'
        ? spare.length
          ? insightList({ label: 'Лишние траты', items: spare.map((a) => ({ icon: 'piggy', tone: 'teal', title: a.title, text: a.text, href: tileOf(page, null, a.expenses) })) })
          : emptyState({ text: 'Лишнего Claude не нашёл.' })
        : found.length
          ? insightList({ label: 'Главные выводы', items: found })
          : emptyState({ text: 'Ничего особенного не нашёл.' });
  return [
    hero(page, found.length, hints.length),
    d.ask ? (review ? claudeAnswer(page, d.ask) : answer(page, d.ask)) : null,
    segmentedLinks({
      label: 'Что нашёл ассистент',
      items: lists.map((l) => ({ label: l.label, count: l.count, href: here({ list: l.key === 'findings' ? null : l.key }), active: l.key === list })),
    }),
    body,
  ].filter((block): block is Html => block !== null);
}

/** The main column's word on the assistant: how many findings it made. */
function badge(d: ReviewData): { text: string; tone: Tone } | undefined {
  const n = d.claude.review?.answer.findings.length ?? d.findings.length;
  if (!n) return undefined;
  return { text: `${d.claude.review ? 'Claude' : 'ассистент'} сделал ${count(n, ['вывод', 'вывода', 'выводов'])}`, tone: 'green' };
}

/** The card of the assistant: Claude's review and when it was made, or the rules' until Claude reviews the month. */
function hero(page: Page, found: number, hints: number): Html {
  const { d, href, here } = page;
  const { review, failed } = d.claude;
  // A request Claude failed waits until the user asks anew, so the card offers to.
  const askedAt = failed ? null : d.claude.askedAt;
  const month = d.review.month;
  const chips = CHIPS.map((q) => ({ label: q.label, icon: q.icon, href: here({ ask: d.ask === q.key ? null : q.key }), active: d.ask === q.key }));
  const cancel = { label: 'Отменить', icon: 'x' as const, action: href('/review/claude/cancel', { month }) };
  if (review) {
    const fresh = d.word?.fresh.length ?? 0;
    return assistantHero({
      title: `Claude разобрал ${monthName(month)}`,
      text: askedAt
        ? `Пересматриваю с ${timeOf(askedAt)}: учту разметку, ваши описания и ответы.`
        : failed
          ? `${moment(review.madeAt)}. Пересмотреть не вышло: ${failed}`
          : [
              `${moment(review.madeAt)} · ${count(found, ['вывод', 'вывода', 'выводов'])}, ${count(hints, ['подсказка', 'подсказки', 'подсказок'])}`,
              fresh ? `с тех пор ${count(fresh, ['новая трата', 'новые траты', 'новых трат'])}` : '',
            ]
              .filter(Boolean)
              .join(' · '),
      action: askedAt ? cancel : { label: 'Пересмотреть', icon: 'refresh', action: href('/review/claude/ask', { month }) },
      chips,
    });
  }
  return assistantHero({
    title: `Разобрал ${monthName(month)}`,
    text: askedAt
      ? `Пока по правилам: Claude разбирает месяц с ${timeOf(askedAt)}.`
      : failed
        ? `Пока по правилам: Claude не ответил — ${failed}`
        : `${found ? `Нашёл ${count(found, ['важный момент', 'важных момента', 'важных моментов'])}` : 'Ничего особенного не нашёл'} по правилам, Claude этот месяц ещё не смотрел.`,
    action: askedAt ? cancel : { label: 'Попросить Claude', icon: 'sparkles', action: href('/review/claude/ask', { month }) },
    chips,
  });
}

/** An ISO time as the server's clock shows it: 21:14. */
function timeOf(iso: string): string {
  const at = new Date(iso);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** An ISO time with its day: 9 октября в 21:14. */
function moment(iso: string): string {
  return `${dayMonth(localDate(new Date(iso)))} в ${timeOf(iso)}`;
}

/**
 * Where a word about expenses or a category leads on the map: one expense opens itself, a category its part, and
 * several expenses the part of the first of them; nothing when none of it is on the map.
 */
function tileOf(page: Page, category: TagId | null, expenses: readonly string[]): string | undefined {
  const { d, here } = page;
  const link = (tile: string) => here({ tile });
  const part = (id: string) => d.parts.find((p) => p.expenses.some((o) => o.id === id));
  if (expenses.length === 1 && part(expenses[0]!)) return link(`spending-${expenses[0]}`);
  const byCategory = category ? d.parts.find((p) => p.category?.id === category) : undefined;
  if (byCategory) return link(partId(byCategory));
  const first = expenses.map(part).find(Boolean);
  return first ? link(partId(first)) : undefined;
}

function claudeFinding(page: Page, f: { tone: string; icon: string; title: string; text: string; category: TagId | null; expenses: string[] }) {
  return { icon: f.icon as IconName, tone: f.tone as Tone, title: f.title, text: f.text, href: tileOf(page, f.category, f.expenses) };
}

/** Claude's answer to one of the four questions, with links to the expenses it points at. */
function claudeAnswer(page: Page, ask: Question): Html {
  const { d, here } = page;
  const reply = d.claude.review!.answer.answers[ask];
  const expenses = reply.expenses.map((id) => d.review.expenses.find((e) => e.operation.id === id)).filter((e): e is ReviewedExpense => e !== undefined);
  return assistantAnswer({
    question: ask === 'plan' ? `План на ${monthName(d.review.next.month)}` : CHIPS.find((q) => q.key === ask)!.label,
    paragraphs: reply.paragraphs,
    links: expenses.map((e) => expenseLink(page, e)),
    closeHref: here({ ask: null }),
  });
}

/** An expense an answer points at: one to check opens on its page, any other on the operations of its month. */
function expenseLink(page: Page, e: ReviewedExpense): { label: string; detail: string; href: string } {
  const { d, href } = page;
  const o = e.operation;
  return {
    label: `${dayMonth(o.date)} · ${markingTitle(o)}`,
    detail: money(o.amount, d.symbol),
    href: isToCheck(e.kind) ? checkHref(d, href, e.kind, `spending-${o.id}`) : href('/operations', { month: monthOf(o.date), q: o.payee, edit: `spending-${o.id}` }),
  };
}

type Suggestion = Parameters<typeof suggestionList>[0]['items'][number];

/** Claude's open word as hints: its questions first, then its marking and its splits. */
function claudeHints(page: Page, only?: (expenses: readonly Operation[], category: TagId | null) => boolean): Suggestion[] {
  const { d, href } = page;
  const word = d.word;
  if (!word) return [];
  const month = d.review.month;
  const ids = (expenses: readonly Operation[]) => expenses.map((o) => o.id).join(',');
  const decline = (params: Record<string, string>) => ({ label: 'Не надо', action: href('/review/claude/decline', { month, ...params }) });
  const keep = only ?? (() => true);
  return [
    ...word.questions
      .filter((q) => keep(q.expenses, null))
      .map(({ item, expenses }) => ({
        icon: 'message' as IconName,
        tone: 'yellow' as Tone,
        title: item.title,
        text: item.text,
        actions: item.options.map((o, i) => ({ label: o.label, action: href('/review/claude/answer', { month, spending: ids(expenses), option: String(i) }) })),
      })),
    ...word.marking
      .filter((m) => keep(m.expenses, null))
      .map(({ item, expenses }) => ({
        icon: 'sparkles' as IconName,
        tone: 'violet' as Tone,
        title: item.title,
        text: `${stop(`${count(expenses.length, EXPENSES)} на ${money(sum(expenses), d.symbol)}`)} ${capitalize(item.why)}`,
        actions: [{ label: 'Принять', action: href('/review/claude/accept', { month, spending: ids(expenses) }) }, decline({ spending: ids(expenses) })],
      })),
    ...word.splits
      .filter((x) => keep([], x.category.id))
      .map(({ item, category }) => ({
        icon: 'layers' as IconName,
        tone: 'violet' as Tone,
        title: `Разбить «${category.title}»: ${item.subcategories.map((x) => x.title).join(', ')}`,
        text: item.why,
        actions: [{ label: 'Разбить', action: href('/review/claude/split', { month, category: category.id }) }, decline({ category: category.id })],
      })),
  ];
}

/** Claude's open word about the expenses of an open tile, and its split of the tile's category when the tile is it. */
function claudeAbout(page: Page, ids: ReadonlySet<string>, category: { id: TagId } | null): Suggestion[] {
  return claudeHints(page, (expenses, split) => (split ? split === category?.id : expenses.some((o) => ids.has(o.id))));
}

/** The rules' hints, less those about expenses all of which Claude has a word about already. */
function ruleHints(d: ReviewData): Hint[] {
  const claude = d.word ? openExpenses(d.word) : new Set<string>();
  return d.hints.filter((h) => h.kind === 'hide' || !h.expenses.every((o) => claude.has(o.id)));
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
      toCheckRows(page, d.kind),
    ],
  });
  return pageDocument({ title: 'Бюджет: что проверить', body });
}

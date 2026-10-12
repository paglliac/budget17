// Operations of a month by day, filtered by kind, category and text, with spending by category on the side, or
// incomes by category when only incomes are shown. The expenses the user said could have been done without make a view
// of their own (?kind=optional): what could have been saved, and on what. Filters live in the URL, so any view can be linked to, e.g. from a
// category on the overview. Categories picked in the app win over ZenMoney's, and payments of regular expenses go
// under Регулярные траты. An expense or an income opens in place by ?edit=spending-<ZenMoney id> to be marked as on
// every page (see marking.ts). Expenses and incomes the user said not to count at all are listed only here, quieter,
// so they can be found and counted again; no sum takes them in.

import { mainCurrency } from '../../balances.ts';
import { categoryFinder } from '../../categories.ts';
import { dateOf, daysInMonth, monthOf, type MonthString } from '../../dates.ts';
import { byCategory, filterOperations, listOperations, type CategorySpending, type Operation, type OperationFilter } from '../../ledger.ts';
import type { OperationKind } from '../../operations.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { money, monthName, plural } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryLook, type Look } from '../looks.ts';
import { toneColor } from '../tones.ts';
import { emptyState, filterTag, pageIntro, searchField, segmentedLinks } from '../widgets/basics.ts';
import { categoryList, dayGroup, operationRow } from '../widgets/operations.ts';
import { appShell, stack, toolbar, topBar } from '../widgets/shell.ts';
import { appRail, monthTabs, parseMonth, userName, type Href } from './chrome.ts';
import { allExpenses, loadMarking, markingActions, markingTint, markingPanel, writtenAbout, type Marking, type SavedMarking } from './marking.ts';

/** What the operations show besides all of them: one kind, or the expenses that could have been done without. */
export type OperationsView = OperationKind | 'optional';

export interface OperationsData {
  today: DateString;
  month: MonthString;
  /** null for all operations. */
  view: OperationsView | null;
  filter: OperationFilter;
  /** Title of the filtered category, when there is one. */
  categoryTitle: string | null;
  /** Operations of the month that pass the filter, newest first. */
  operations: Operation[];
  /** How many operations of each view pass the other filters. */
  counts: Record<OperationsView | 'all', number>;
  /**
   * Spending of the month by category for the side panel, incomes when only incomes are shown, or the expenses that
   * could have been done without when only they are.
   */
  categories: CategorySpending[];
  /** What the side panel lists: Расходы по категориям, Доходы по категориям or Необязательные по категориям. */
  categoriesTitle: string;
  /** All that the side panel lists. */
  categoryTotal: number;
  /** For an expense or an income opened to mark it. */
  marking: Marking;
  /** What is open for marking: spending-<ZenMoney id>. */
  edit: string | null;
  symbol: string;
  userName: string | null;
}

const VIEWS: OperationsView[] = ['expense', 'income', 'transfer', 'optional'];

/** The side panel's title for each view; the others list spending. */
const CATEGORIES_TITLE = { income: 'Доходы по категориям', optional: 'Необязательные по категориям' };

export function loadOperations(
  data: EntityCollections,
  sorting: SavedMarking,
  options: { today: DateString; month?: string | null; kind?: string | null; category?: string | null; query?: string | null; edit?: string | null },
): OperationsData {
  const month = parseMonth(options.month, monthOf(options.today));
  const all = listOperations(data, { from: dateOf(month, 1), to: dateOf(month, daysInMonth(month)) }, sorting, { withIgnored: true });
  const view = VIEWS.find((v) => v === options.kind) ?? null;
  const optional = view === 'optional';
  const filter: OperationFilter = {
    kind: optional ? 'expense' : (view ?? undefined),
    optional: optional || undefined,
    category: options.category || undefined,
    query: options.query?.trim() || undefined,
  };
  const withoutKind = filterOperations(all, { ...filter, kind: undefined, optional: undefined });
  const incomes = view === 'income';
  const categories = byCategory(all.filter((o) => !o.ignored && (!optional || o.optional)), incomes ? 'income' : 'expense');
  // Регулярные траты are not a ZenMoney category, so the title is looked up among the month's categories first.
  const category = categories.find((c) => c.id !== null && c.id === filter.category);
  const tags = new Map((data.tag ?? []).map((t) => [t.id, t]));
  const tag = filter.category && filter.category !== 'none' ? categoryFinder(tags, sorting.categories)(filter.category) : undefined;

  return {
    today: options.today,
    month,
    view,
    filter,
    categoryTitle: filter.category === 'none' ? 'Без категории' : (category?.title ?? tag?.title ?? (filter.category ? 'Категория' : null)),
    operations: filterOperations(withoutKind, { kind: filter.kind, optional: filter.optional }),
    counts: {
      all: withoutKind.length,
      expense: withoutKind.filter((o) => o.kind === 'expense').length,
      income: withoutKind.filter((o) => o.kind === 'income').length,
      transfer: withoutKind.filter((o) => o.kind === 'transfer').length,
      optional: withoutKind.filter((o) => o.optional).length,
    },
    categories,
    categoriesTitle: (view === 'income' || view === 'optional' ? CATEGORIES_TITLE[view] : null) ?? 'Расходы по категориям',
    categoryTotal: categories.reduce((sum, c) => sum + c.amount, 0),
    marking: loadMarking(data, sorting, allExpenses(data, sorting), options.today),
    edit: options.edit ?? null,
    symbol: mainCurrency(data).symbol,
    userName: userName(data),
  };
}

export function renderOperations(d: OperationsData, href: Href): Html {
  const current = monthOf(d.today);
  const state = {
    month: d.month === current ? null : d.month,
    kind: d.view,
    category: d.filter.category ?? null,
    q: d.filter.query ?? null,
  };
  const to = (changes: Partial<typeof state> & { edit?: string | null }) => href('/operations', { ...state, ...changes });
  const searchParams = Object.fromEntries(new URL(to({ q: null }), 'http://localhost').searchParams);

  const body = appShell({
    rail: appRail('operations', d.userName, href),
    tabs: monthTabs(current, d.month, (month) => to({ month })),
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: 'Операции', icon: 'list' }] }),
      pageIntro({ title: `Операции за ${monthName(d.month)}`, text: operationsSentence(d) }),
      toolbar({
        items: [
          segmentedLinks({
            label: 'Вид операций',
            items: [
              { label: 'Все', href: to({ kind: null }), active: !d.view, count: d.counts.all },
              { label: 'Расходы', href: to({ kind: 'expense' }), active: d.view === 'expense', count: d.counts.expense },
              { label: 'Доходы', href: to({ kind: 'income' }), active: d.view === 'income', count: d.counts.income },
              // Transfers within one bank are left out, so often there are none to show.
              ...(d.counts.transfer > 0 || d.view === 'transfer'
                ? [{ label: 'Переводы', href: to({ kind: 'transfer' }), active: d.view === 'transfer', count: d.counts.transfer }]
                : []),
              ...(d.counts.optional > 0 || d.view === 'optional'
                ? [{ label: 'Необязательные', href: to({ kind: 'optional' }), active: d.view === 'optional', count: d.counts.optional }]
                : []),
            ],
          }),
          searchField({ action: '/operations', name: 'q', value: d.filter.query, placeholder: 'Найти операцию', params: searchParams }),
          d.categoryTitle
            ? filterTag({
                label: d.categoryTitle,
                href: to({ category: null }),
                color: d.categories.find((c) => (c.id ?? 'none') === d.filter.category)?.color ?? undefined,
              })
            : null,
          d.filter.query ? filterTag({ label: `«${d.filter.query}»`, href: to({ q: null }) }) : null,
        ],
      }),
      feed(d, href, to),
    ],
    side: [
      topBar({ crumbs: [{ label: d.categoriesTitle }] }),
      d.categories.length
        ? categoryList({
            label: d.categoriesTitle,
            symbol: d.symbol,
            items: d.categories.map((c) => {
              const id = c.id ?? 'none';
              const active = d.filter.category === id;
              return {
                title: c.title,
                ...categoryLook(c),
                amount: c.amount,
                share: d.categoryTotal > 0 ? c.amount / d.categoryTotal : 0,
                href: to({ category: active ? null : id }),
                active,
              };
            }),
          })
        : emptyState({ text: `В ${monthName(d.month, 'prepositional')} ${d.view === 'income' ? 'доходов' : d.view === 'optional' ? 'необязательных трат' : 'трат'} нет.` }),
    ],
  });

  return pageDocument({ title: 'Бюджет: операции', body });
}

/**
 * How many operations there are and what they spent and brought, then what could have been saved on the expenses that
 * could have been done without; in their own view, how many of them there are and what they cost.
 */
export function operationsSentence(d: Pick<OperationsData, 'operations' | 'symbol' | 'view'>): string {
  const count = d.operations.length;
  if (count === 0) return 'Под эти условия операций нет.';
  const sum = (list: Operation[]) => list.reduce((s, o) => s + o.amount, 0);
  const expense = sum(d.operations.filter((o) => o.kind === 'expense' && !o.ignored));
  const income = sum(d.operations.filter((o) => o.kind === 'income' && !o.ignored));
  const optional = sum(d.operations.filter((o) => o.optional));
  if (d.view === 'optional') {
    return sentence(`${count} ${plural(count, ['необязательная трата', 'необязательные траты', 'необязательных трат'])} на ${money(optional, d.symbol)}: столько можно было сэкономить`);
  }
  const parts = [expense > 0 ? `потрачено ${money(expense, d.symbol)}` : '', income > 0 ? `получено ${money(income, d.symbol)}` : ''].filter(Boolean);
  const head = `${count} ${plural(count, ['операция', 'операции', 'операций'])}`;
  return [
    sentence(parts.length ? `${head}: ${parts.join(', ')}` : head),
    optional > 0 ? sentence(`На необязательных тратах можно было сэкономить ${money(optional, d.symbol)}`) : null,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Ends a sentence with a dot, unless it ends with the dot of a symbol already, as «руб.» does. */
function sentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}

/** What is said when no operation passes the filters. */
export function operationsEmpty(d: Pick<OperationsData, 'month' | 'view' | 'filter'>): string {
  const month = monthName(d.month, 'prepositional');
  if (d.filter.category || d.filter.query || (d.view && d.view !== 'optional')) return 'Ничего не нашлось. Попробуйте другой запрос или уберите фильтры.';
  if (d.view === 'optional') return `В ${month} необязательных трат нет: так отмечают трату в её разметке, в «Типе траты».`;
  return `В ${month} операций нет. Новые появятся после синхронизации ZenMoney.`;
}

function feed(d: OperationsData, href: Href, to: (changes: { edit?: string | null }) => string): Html {
  if (d.operations.length === 0) return emptyState({ text: operationsEmpty(d) });
  const days = new Map<DateString, Operation[]>();
  for (const o of d.operations) days.set(o.date, [...(days.get(o.date) ?? []), o]);
  return stack({
    gap: 18,
    items: [...days].map(([date, operations]) =>
      dayGroup({
      date,
      today: d.today,
      net: {
        amount: operations.reduce((s, o) => s + netOf(o), 0),
        symbol: d.symbol,
      },
        rows: operations.map((o) => row(d, o, href, to)),
      }),
    ),
  });
}

/** What an operation adds to its day: an income, less an expense; a transfer or what does not count adds nothing. */
export function netOf(o: Operation): number {
  if (o.ignored || o.kind === 'transfer') return 0;
  return o.kind === 'income' ? o.amount : -o.amount;
}

/** What an operation's row says under the payee: what it went for and from where, and how it is drawn. */
export function operationLine(o: Operation): { details: string } & Look {
  const details = o.kind === 'transfer' ? `${o.account} → ${o.toAccount}` : `${operationCategory(o)}, ${o.account}`;
  if (o.kind === 'transfer') return { details, icon: 'arrows', color: toneColor('gray'), photo: null };
  if (o.kind === 'income' && !o.category) return { details, icon: 'arrowDownLeft', color: toneColor('green'), photo: null };
  return { details, ...categoryLook(o.category) };
}

/** What an operation went for: what it paid, its category, or what kind it is when it has none. */
export function operationCategory(o: Operation): string {
  if (o.ignored) return 'не учитывается';
  return o.regular?.title ?? o.purchase?.title ?? o.category?.title ?? (o.kind === 'income' ? 'Доход' : o.kind === 'transfer' ? 'Перевод' : 'Без категории');
}

/** An operation; an expense or an income opens in place to be marked. */
function row(d: OperationsData, o: Operation, href: Href, to: (changes: { edit?: string | null }) => string): Html {
  const key = `spending-${o.id}`;
  const markable = o.kind !== 'transfer';
  const open = markable && d.edit === key;
  const line = operationLine(o);
  return operationRow({
    id: markable ? key : undefined,
    title: o.payee,
    ...line,
    kind: o.kind,
    amount: o.amount,
    symbol: d.symbol,
    original: o.original ? { amount: o.original.amount, symbol: o.original.instrument.symbol } : undefined,
    comment: writtenAbout(o) ?? undefined,
    hold: o.hold,
    tint: markingTint(o),
    muted: o.ignored,
    href: markable ? to({ edit: open ? null : key }) : undefined,
    panel: open ? markingPanel(d.marking, o, href) : undefined,
    actions: open ? markingActions(d.marking, o, href) : undefined,
  });
}

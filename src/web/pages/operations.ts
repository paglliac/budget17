// Operations of a month by day, filtered by kind, category and text, with spending by category on the side, or
// incomes by category when only incomes are shown. Filters live in the URL, so any view can be linked to, e.g. from a
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
import { categoryIcon, type IconName } from '../icons.ts';
import { categoryColor, toneColor } from '../tones.ts';
import { emptyState, filterTag, pageIntro, searchField, segmentedLinks } from '../widgets/basics.ts';
import { categoryList, dayGroup, operationRow } from '../widgets/operations.ts';
import { appShell, stack, toolbar, topBar } from '../widgets/shell.ts';
import { appRail, monthTabs, parseMonth, userName, type Href } from './chrome.ts';
import { allExpenses, loadMarking, markingActions, markingPanel, writtenAbout, type Marking, type SavedMarking } from './marking.ts';

export interface OperationsData {
  today: DateString;
  month: MonthString;
  filter: OperationFilter;
  /** Title of the filtered category, when there is one. */
  categoryTitle: string | null;
  /** Operations of the month that pass the filter, newest first. */
  operations: Operation[];
  /** How many operations of each kind pass the other filters. */
  counts: Record<OperationKind | 'all', number>;
  /** Spending of the month by category for the side panel, or incomes when only incomes are shown. */
  categories: CategorySpending[];
  /** What the side panel lists: Расходы по категориям or Доходы по категориям. */
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

const KINDS: OperationKind[] = ['expense', 'income', 'transfer'];

export function loadOperations(
  data: EntityCollections,
  sorting: SavedMarking,
  options: { today: DateString; month?: string | null; kind?: string | null; category?: string | null; query?: string | null; edit?: string | null },
): OperationsData {
  const month = parseMonth(options.month, monthOf(options.today));
  const all = listOperations(data, { from: dateOf(month, 1), to: dateOf(month, daysInMonth(month)) }, sorting, { withIgnored: true });
  const kind = KINDS.find((k) => k === options.kind);
  const filter: OperationFilter = { kind, category: options.category || undefined, query: options.query?.trim() || undefined };
  const withoutKind = filterOperations(all, { ...filter, kind: undefined });
  const incomes = kind === 'income';
  const categories = byCategory(all.filter((o) => !o.ignored), incomes ? 'income' : 'expense');
  // Регулярные траты are not a ZenMoney category, so the title is looked up among the month's categories first.
  const category = categories.find((c) => c.id !== null && c.id === filter.category);
  const tags = new Map((data.tag ?? []).map((t) => [t.id, t]));
  const tag = filter.category && filter.category !== 'none' ? categoryFinder(tags, sorting.categories)(filter.category) : undefined;

  return {
    today: options.today,
    month,
    filter,
    categoryTitle: filter.category === 'none' ? 'Без категории' : (category?.title ?? tag?.title ?? (filter.category ? 'Категория' : null)),
    operations: filterOperations(withoutKind, { kind }),
    counts: {
      all: withoutKind.length,
      expense: withoutKind.filter((o) => o.kind === 'expense').length,
      income: withoutKind.filter((o) => o.kind === 'income').length,
      transfer: withoutKind.filter((o) => o.kind === 'transfer').length,
    },
    categories,
    categoriesTitle: incomes ? 'Доходы по категориям' : 'Расходы по категориям',
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
    kind: d.filter.kind ?? null,
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
              { label: 'Все', href: to({ kind: null }), active: !d.filter.kind, count: d.counts.all },
              { label: 'Расходы', href: to({ kind: 'expense' }), active: d.filter.kind === 'expense', count: d.counts.expense },
              { label: 'Доходы', href: to({ kind: 'income' }), active: d.filter.kind === 'income', count: d.counts.income },
              // Transfers within one bank are left out, so often there are none to show.
              ...(d.counts.transfer > 0 || d.filter.kind === 'transfer'
                ? [{ label: 'Переводы', href: to({ kind: 'transfer' }), active: d.filter.kind === 'transfer', count: d.counts.transfer }]
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
                icon: categoryIcon(c.title),
                color: categoryColor(c.id, c.color),
                amount: c.amount,
                share: d.categoryTotal > 0 ? c.amount / d.categoryTotal : 0,
                href: to({ category: active ? null : id }),
                active,
              };
            }),
          })
        : emptyState({ text: `В ${monthName(d.month, 'prepositional')} ${d.filter.kind === 'income' ? 'доходов' : 'трат'} нет.` }),
    ],
  });

  return pageDocument({ title: 'Бюджет: операции', body });
}

export function operationsSentence(d: Pick<OperationsData, 'operations' | 'symbol'>): string {
  const count = d.operations.length;
  if (count === 0) return 'Под эти условия операций нет.';
  const expense = d.operations.filter((o) => o.kind === 'expense' && !o.ignored).reduce((s, o) => s + o.amount, 0);
  const income = d.operations.filter((o) => o.kind === 'income' && !o.ignored).reduce((s, o) => s + o.amount, 0);
  const parts = [expense > 0 ? `потрачено ${money(expense, d.symbol)}` : '', income > 0 ? `получено ${money(income, d.symbol)}` : ''].filter(Boolean);
  const head = `${count} ${plural(count, ['операция', 'операции', 'операций'])}`;
  // The symbol may end with a dot of its own, as «руб.» does.
  const text = parts.length ? `${head}: ${parts.join(', ')}` : head;
  return text.endsWith('.') ? text : `${text}.`;
}

function feed(d: OperationsData, href: Href, to: (changes: { edit?: string | null }) => string): Html {
  if (d.operations.length === 0) {
    const filtered = d.filter.kind || d.filter.category || d.filter.query;
    return emptyState({
      text: filtered
        ? 'Ничего не нашлось. Попробуйте другой запрос или уберите фильтры.'
        : `В ${monthName(d.month, 'prepositional')} операций нет. Новые появятся после синхронизации ZenMoney.`,
    });
  }
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

/** What an operation's row says under the payee: what it went for and from where, and its icon and colour. */
export function operationLine(o: Operation): { details: string; icon: IconName; color: string } {
  const isTransfer = o.kind === 'transfer';
  return {
    details: isTransfer ? `${o.account} → ${o.toAccount}` : `${operationCategory(o)}, ${o.account}`,
    icon: isTransfer ? 'arrows' : o.category ? categoryIcon(o.category.title) : o.kind === 'income' ? 'arrowDownLeft' : 'tag',
    color: isTransfer ? toneColor('gray') : o.kind === 'income' && !o.category ? toneColor('green') : categoryColor(o.category?.id ?? null, o.category?.color ?? null),
  };
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
    details: line.details,
    icon: line.icon,
    color: line.color,
    kind: o.kind,
    amount: o.amount,
    symbol: d.symbol,
    original: o.original ? { amount: o.original.amount, symbol: o.original.instrument.symbol } : undefined,
    comment: writtenAbout(o) ?? undefined,
    hold: o.hold,
    muted: o.ignored,
    href: markable ? to({ edit: open ? null : key }) : undefined,
    panel: open ? markingPanel(d.marking, o, href) : undefined,
    actions: open ? markingActions(d.marking, o, href) : undefined,
  });
}

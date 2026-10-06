// Operations of a month by day, filtered by kind, category and text, with spending by category on the side.
// Filters live in the URL, so any view can be linked to, e.g. from a category on the overview. Categories picked in
// the app win over ZenMoney's, and payments of regular expenses go under Регулярные траты. An expense opens in place
// by ?edit=spending-<ZenMoney id> to be marked as on every page (see marking.ts). Expenses the user said not to count
// at all are listed only here, quieter, so they can be found and counted again; no sum takes them in.

import { mainCurrency } from '../../balances.ts';
import { categoryFinder } from '../../categories.ts';
import { dateOf, daysInMonth, monthOf, type MonthString } from '../../dates.ts';
import { filterOperations, listOperations, spendingByCategory, type CategorySpending, type Operation, type OperationFilter } from '../../ledger.ts';
import type { OperationKind } from '../../operations.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { money, monthName, plural } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryIcon } from '../icons.ts';
import { categoryColor, toneColor } from '../tones.ts';
import { emptyState, filterTag, pageIntro, searchField, segmentedLinks } from '../widgets/basics.ts';
import { categoryList, dayGroup, operationRow } from '../widgets/operations.ts';
import { appShell, stack, toolbar, topBar } from '../widgets/shell.ts';
import { appRail, monthTabs, parseMonth, userName, type Href } from './chrome.ts';
import { allExpenses, loadMarking, markingActions, markingPanel, type Marking, type SavedMarking } from './marking.ts';

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
  /** Spending of the month by category, for the side panel. */
  categories: CategorySpending[];
  expense: number;
  /** For an expense opened to mark it. */
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
  const categories = spendingByCategory(all.filter((o) => !o.ignored));
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
    expense: categories.reduce((sum, c) => sum + c.amount, 0),
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
      pageIntro({ title: `Операции за ${monthName(d.month)}`, text: sentence(d) }),
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
      topBar({ crumbs: [{ label: 'Расходы по категориям' }] }),
      d.categories.length
        ? categoryList({
            label: 'Расходы по категориям',
            symbol: d.symbol,
            items: d.categories.map((c) => {
              const id = c.id ?? 'none';
              const active = d.filter.category === id;
              return {
                title: c.title,
                icon: categoryIcon(c.title),
                color: categoryColor(c.id, c.color),
                amount: c.amount,
                share: d.expense > 0 ? c.amount / d.expense : 0,
                href: to({ category: active ? null : id }),
                active,
              };
            }),
          })
        : emptyState({ text: `В ${monthName(d.month, 'prepositional')} трат нет.` }),
    ],
  });

  return pageDocument({ title: 'Бюджет: операции', body });
}

function sentence(d: OperationsData): string {
  const count = d.operations.length;
  if (count === 0) return 'Под эти условия операций нет.';
  const expense = d.operations.filter((o) => o.kind === 'expense' && !o.ignored).reduce((s, o) => s + o.amount, 0);
  const income = d.operations.filter((o) => o.kind === 'income').reduce((s, o) => s + o.amount, 0);
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
        amount: operations.reduce((s, o) => s + (o.kind === 'income' ? o.amount : o.kind === 'expense' && !o.ignored ? -o.amount : 0), 0),
        symbol: d.symbol,
      },
        rows: operations.map((o) => row(d, o, href, to)),
      }),
    ),
  });
}

/** An operation; an expense opens in place to be marked. */
function row(d: OperationsData, o: Operation, href: Href, to: (changes: { edit?: string | null }) => string): Html {
  const isTransfer = o.kind === 'transfer';
  const category = o.regular?.title ?? o.purchase?.title ?? o.category?.title ?? (o.kind === 'income' ? 'Доход' : isTransfer ? 'Перевод' : 'Без категории');
  const key = `spending-${o.id}`;
  const open = o.kind === 'expense' && d.edit === key;
  return operationRow({
    id: o.kind === 'expense' ? key : undefined,
    title: o.payee,
    details: isTransfer ? `${o.account} → ${o.toAccount}` : `${o.ignored ? 'не учитывается' : category}, ${o.account}`,
    icon: isTransfer ? 'arrows' : o.category ? categoryIcon(o.category.title) : o.kind === 'income' ? 'arrowDownLeft' : 'tag',
    color: isTransfer ? toneColor('gray') : o.kind === 'income' && !o.category ? toneColor('green') : categoryColor(o.category?.id ?? null, o.category?.color ?? null),
    kind: o.kind,
    amount: o.amount,
    symbol: d.symbol,
    original: o.original ? { amount: o.original.amount, symbol: o.original.instrument.symbol } : undefined,
    comment: o.comment ?? undefined,
    hold: o.hold,
    muted: o.ignored,
    href: o.kind === 'expense' ? to({ edit: open ? null : key }) : undefined,
    panel: open ? markingPanel(d.marking, o, href) : undefined,
    actions: open ? markingActions(d.marking, o, href) : undefined,
  });
}

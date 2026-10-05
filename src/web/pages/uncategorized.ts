// Expenses of a month that came from ZenMoney without a category, to sort: into a category or as the payment of a
// regular expense, with a suggestion to accept in one click. Below them, what was already sorted here, to change or
// take back. A row opens by ?edit=<ZenMoney id>; forms post to /uncategorized/:id (the target picked in the form),
// /uncategorized/:id/:target (a suggestion accepted) and /uncategorized/:id/reset.

import { mainCurrency } from '../../balances.ts';
import { suggester, type Categorization, type Suggestion } from '../../categorization.ts';
import { monthOf, type MonthString } from '../../dates.ts';
import { listOperations, type Operation } from '../../ledger.ts';
import { categoryOf, type Category } from '../../operations.ts';
import type { RegularExpense } from '../../regular.ts';
import type { Settings } from '../../settings.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { dayMonth, money, monthName, plural } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryIcon, entryIcon } from '../icons.ts';
import { categoryColor, toneColor } from '../tones.ts';
import { balanceTotal } from '../widgets/accounts.ts';
import { emptyState, footnote, pageIntro, section, selectField } from '../widgets/basics.ts';
import { entryForm, entryList, entryRow } from '../widgets/entries.ts';
import { appShell, topBar } from '../widgets/shell.ts';
import { appRail, monthTabs, parseMonth, userName, type Href } from './chrome.ts';

/** What the user keeps in the app for sorting. */
export interface SavedSorting {
  categorizations: ReadonlyMap<string, Categorization>;
  regular: RegularExpense[];
}

export interface UncategorizedData {
  today: DateString;
  month: MonthString;
  /** Expenses of the month without a category, newest first, each with what to suggest. */
  pending: Array<{ expense: Operation; suggestion: Suggestion | null }>;
  /** Expenses of the month sorted in the app, newest first. */
  sorted: Operation[];
  /** How many expenses the month has in all. */
  count: number;
  /** ZenMoney categories for spending, by title. */
  categories: Category[];
  regular: RegularExpense[];
  categorizations: ReadonlyMap<string, Categorization>;
  /** The ZenMoney id of the expense open for sorting. */
  edit: string | null;
  symbol: string;
  userName: string | null;
}

export function loadUncategorized(
  data: EntityCollections,
  saved: SavedSorting,
  options: { today: DateString; month?: string | null; edit?: string | null },
): UncategorizedData {
  const month = parseMonth(options.month, monthOf(options.today));
  const expenses = listOperations(data, { from: '0000-01-01', to: '9999-12-31' }, saved).filter((o) => o.kind === 'expense');
  const suggest = suggester(expenses, saved.regular);
  const ofMonth = expenses.filter((o) => monthOf(o.date) === month);
  const tags = new Map((data.tag ?? []).map((t) => [t.id, t]));
  return {
    today: options.today,
    month,
    pending: ofMonth.filter((o) => o.category === null).map((expense) => ({ expense, suggestion: suggest(expense) })),
    sorted: ofMonth.filter((o) => saved.categorizations.has(o.id)),
    count: ofMonth.length,
    categories: (data.tag ?? [])
      .filter((t) => t.showOutcome)
      .map((t) => {
        const parent = t.parent ? tags.get(t.parent) : undefined;
        return { ...categoryOf(t), title: parent ? `${parent.title} / ${t.title}` : t.title };
      })
      .sort((a, b) => a.title.localeCompare(b.title, 'ru')),
    regular: saved.regular,
    categorizations: saved.categorizations,
    edit: options.edit ?? null,
    symbol: mainCurrency(data).symbol,
    userName: userName(data),
  };
}

// ---- Forms

export type UncategorizedSubmission = { status: 'saved' } | { status: 'missing' };

/**
 * Applies a form posted to /uncategorized/:id with the target in the body, /uncategorized/:id/:target or
 * /uncategorized/:id/reset. A target is tag-<ZenMoney id> or regular-<id>; it must exist, and so must the expense.
 */
export function submitUncategorized(settings: Settings, data: EntityCollections, path: string, body: URLSearchParams): UncategorizedSubmission {
  const [, id, action] = /^\/uncategorized\/([\w-]+)(?:\/([\w-]+))?$/.exec(path) ?? [];
  if (!id || !(data.transaction ?? []).some((t) => t.id === id && !t.deleted)) return { status: 'missing' };
  if (action === 'reset') {
    settings.categorize(id, null);
    return { status: 'saved' };
  }
  const target = parseTarget(action ?? body.get('target') ?? '');
  const exists =
    target !== null &&
    ('tag' in target ? (data.tag ?? []).some((t) => t.id === target.tag) : settings.regularExpenses().some((e) => e.id === target.regular));
  if (!exists) return { status: 'missing' };
  settings.categorize(id, target);
  return { status: 'saved' };
}

/** How a categorization travels in forms and links: tag-<ZenMoney id> or regular-<id>. */
function targetOf(categorization: Categorization): string {
  return 'tag' in categorization ? `tag-${categorization.tag}` : `regular-${categorization.regular}`;
}

function parseTarget(text: string): Categorization | null {
  const match = /^(?:tag-([\w-]+)|regular-(\d+))$/.exec(text);
  if (!match) return null;
  return match[1] !== undefined ? { tag: match[1] } : { regular: Number(match[2]) };
}

function suggestedTarget(suggestion: Suggestion): Categorization {
  return 'category' in suggestion ? { tag: suggestion.category.id } : { regular: suggestion.regular.id };
}

// ---- Page

export function renderUncategorized(d: UncategorizedData, href: Href): Html {
  const current = monthOf(d.today);
  const page = { d, href, here: (params: Record<string, string | null> = {}) => href('/uncategorized', { month: d.month === current ? null : d.month, ...params }) };
  const left = d.pending.reduce((sum, p) => sum + p.expense.amount, 0);

  const body = appShell({
    rail: appRail('uncategorized', d.userName, href),
    tabs: monthTabs(current, d.month, (month) => href('/uncategorized', { month })),
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: 'Без категории', icon: 'tag' }] }),
      pageIntro({ title: 'Траты без категории', text: sentence(d, left) }),
      section({
        title: 'Разобрать',
        body: d.pending.length
          ? entryList({ label: 'Траты без категории', items: d.pending.map((p) => pendingItem(page, p.expense, p.suggestion)) })
          : emptyState({ text: d.count ? 'Здесь пусто: у всех трат месяца есть категория.' : `В ${monthName(d.month, 'prepositional')} трат нет.` }),
      }),
      d.sorted.length ? section({ title: 'Разобрано здесь', body: entryList({ label: 'Разобрано здесь', items: d.sorted.map((o) => sortedItem(page, o)) }) }) : null,
    ],
    side: [
      topBar({ crumbs: [{ label: `Без категории в ${monthName(d.month, 'prepositional')}` }] }),
      balanceTotal({
        amount: left,
        symbol: d.symbol,
        note: `${d.pending.length} ${plural(d.pending.length, ['трата', 'траты', 'трат'])} из ${d.count}`,
      }),
      footnote({
        text: 'Категории и привязки хранятся в приложении, в data/settings.db, в ZenMoney они не попадают. Платёж регулярной траты идёт вне бюджета недели, как и сама регулярная трата.',
      }),
    ],
  });
  return pageDocument({ title: 'Бюджет: без категории', body });
}

interface Page {
  d: UncategorizedData;
  href: Href;
  here: (params?: Record<string, string | null>) => string;
}

function sentence(d: UncategorizedData, left: number): string {
  const month = monthName(d.month, 'prepositional');
  if (d.pending.length === 0) return d.count ? `В ${month} у всех трат есть категория.` : `В ${month} трат пока нет.`;
  const n = d.pending.length;
  // The symbol may end with a dot of its own, as «руб.» does.
  const amount = money(left, d.symbol);
  const head = `В ${month} ${n} ${plural(n, ['трата', 'траты', 'трат'])} из ${d.count} без категории, на ${amount}${amount.endsWith('.') ? '' : '.'}`;
  const suggested = d.pending.filter((p) => p.suggestion !== null).length;
  const how = 'Откройте трату и выберите категорию или регулярную трату, которую она оплатила.';
  return suggested ? `${head} Для ${suggested} есть подсказка: её можно принять сразу. ${how}` : `${head} ${how}`;
}

/** An expense to sort: a row with its suggestion, or the form when it is open. */
function pendingItem(page: Page, o: Operation, suggestion: Suggestion | null): Html {
  const { d, href, here } = page;
  if (d.edit === o.id) return sortForm(page, o, suggestion ? targetOf(suggestedTarget(suggestion)) : '');
  return entryRow({
    title: o.payee,
    details: [where(o), suggestion ? `похоже на ${suggestionName(suggestion)}` : null].filter(Boolean).join(' · '),
    icon: 'tag',
    color: toneColor('gray'),
    amount: o.amount,
    symbol: d.symbol,
    href: here({ edit: o.id }),
    actions: suggestion ? [{ label: 'Принять', action: href(`/uncategorized/${o.id}/${targetOf(suggestedTarget(suggestion))}`) }] : [],
  });
}

/** An expense sorted here: a row that opens the form to change it or take it back. */
function sortedItem(page: Page, o: Operation): Html {
  const { d, here } = page;
  const categorization = d.categorizations.get(o.id);
  if (d.edit === o.id && categorization) return sortForm(page, o, targetOf(categorization), true);
  const regular = o.regular ? d.regular.find((e) => e.id === o.regular?.id) : undefined;
  return entryRow({
    title: o.payee,
    details: `${where(o)} · ${o.regular ? `регулярная «${o.regular.title}»` : (o.category?.title ?? 'без категории')}`,
    icon: regular ? entryIcon(regular.icon, regular.title) : o.category ? categoryIcon(o.category.title) : 'tag',
    color: categoryColor(o.category?.id ?? null, o.category?.color ?? null),
    amount: o.amount,
    symbol: d.symbol,
    href: here({ edit: o.id }),
  });
}

function sortForm({ d, href, here }: Page, o: Operation, value: string, sorted = false): Html {
  return entryForm({
    action: href(`/uncategorized/${o.id}`),
    submitLabel: 'Сохранить',
    icon: 'tag',
    color: toneColor('gray'),
    fields: [
      selectField({
        label: `${o.payee} · ${dayMonth(o.date)} · ${money(o.amount, d.symbol)}`,
        name: 'target',
        value,
        placeholder: 'Категория или регулярная трата',
        required: true,
        groups: [
          { label: 'Регулярные траты', options: d.regular.map((e) => ({ value: `regular-${e.id}`, label: `${e.title} · ${money(e.amount, d.symbol)}` })) },
          { label: 'Категории', options: d.categories.map((c) => ({ value: `tag-${c.id}`, label: c.title })) },
        ],
      }),
    ],
    extraActions: sorted ? [{ label: 'Вернуть без категории', action: href(`/uncategorized/${o.id}/reset`) }] : undefined,
    cancelHref: here(),
  });
}

/** When and from where: 5 октября, Основной, and the comment when there is one. */
function where(o: Operation): string {
  return [`${dayMonth(o.date)}, ${o.account}`, o.comment].filter(Boolean).join(' · ');
}

function suggestionName(suggestion: Suggestion): string {
  return 'category' in suggestion ? `«${suggestion.category.title}»` : `регулярную «${suggestion.regular.title}»`;
}

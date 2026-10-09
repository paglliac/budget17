// Expenses of a month that came from ZenMoney without a category, to sort: into a category, or as the payment of a
// regular expense or a purchase, with a suggestion to accept in one click. Below them, what was already sorted in the
// app, to change or take back. A row opens by ?edit=spending-<ZenMoney id> and is marked as on every page (see
// marking.ts); forms post to /spending.

import type { Suggestion } from '../../categorization.ts';
import { monthOf, type MonthString } from '../../dates.ts';
import type { Operation } from '../../ledger.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { dayMonth, money, monthName, plural } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryIcon, entryIcon } from '../icons.ts';
import { categoryColor, toneColor } from '../tones.ts';
import { balanceTotal } from '../widgets/accounts.ts';
import { emptyState, footnote, pageIntro, section } from '../widgets/basics.ts';
import { entryList, entryRow } from '../widgets/entries.ts';
import { appShell, topBar } from '../widgets/shell.ts';
import { appRail, monthTabs, parseMonth, userName, type Href } from './chrome.ts';
import { allExpenses, envelopeMark, loadMarking, markingActions, markingDetails, markingPanel, markingTitle, type Marking, type SavedMarking } from './marking.ts';

export interface UncategorizedData {
  today: DateString;
  month: MonthString;
  /** Expenses of the month without a category, newest first, each with what to suggest. */
  pending: Array<{ expense: Operation; suggestion: Suggestion | null }>;
  /** Expenses of the month that came without a category and were sorted in the app, newest first. */
  sorted: Operation[];
  /** How many expenses the month has in all. */
  count: number;
  marking: Marking;
  /** What is open for marking: spending-<ZenMoney id>. */
  edit: string | null;
  symbol: string;
  userName: string | null;
}

export function loadUncategorized(
  data: EntityCollections,
  saved: SavedMarking,
  options: { today: DateString; month?: string | null; edit?: string | null },
): UncategorizedData {
  const month = parseMonth(options.month, monthOf(options.today));
  const expenses = allExpenses(data, saved);
  const marking = loadMarking(data, saved, expenses, options.today);
  const ofMonth = expenses.filter((o) => monthOf(o.date) === month);
  return {
    today: options.today,
    month,
    pending: ofMonth.filter((o) => o.category === null).map((expense) => ({ expense, suggestion: marking.suggest(expense) })),
    sorted: ofMonth.filter((o) => !o.zenmoneyCategory && (saved.categorizations.has(o.id) || saved.purchasePayments.has(o.id))),
    count: ofMonth.length,
    marking,
    edit: options.edit ?? null,
    symbol: marking.symbol,
    userName: userName(data),
  };
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
      pageIntro({ title: 'Траты без категории', text: uncategorizedSentence(d, left) }),
      section({
        title: 'Разобрать',
        body: d.pending.length
          ? entryList({ label: 'Траты без категории', items: d.pending.map((p) => pendingItem(page, p.expense, p.suggestion)) })
          : emptyState({ text: d.count ? 'Здесь пусто: у всех трат месяца есть категория.' : `В ${monthName(d.month, 'prepositional')} трат нет.` }),
      }),
      d.sorted.length ? section({ title: 'Разобрано', body: entryList({ label: 'Разобрано', items: d.sorted.map((o) => sortedItem(page, o)) }) }) : null,
    ],
    side: [
      topBar({ crumbs: [{ label: `Без категории в ${monthName(d.month, 'prepositional')}` }] }),
      balanceTotal({
        amount: left,
        symbol: d.symbol,
        note: `${d.pending.length} ${plural(d.pending.length, ['трата', 'траты', 'трат'])} из ${d.count}`,
      }),
      footnote({
        text: 'Категории и привязки хранятся в приложении, в data/settings.db, в ZenMoney они не попадают. Список категорий меняется в настройках.',
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

export function uncategorizedSentence(d: UncategorizedData, left: number): string {
  const month = monthName(d.month, 'prepositional');
  if (d.pending.length === 0) return d.count ? `В ${month} у всех трат есть категория.` : `В ${month} трат пока нет.`;
  const n = d.pending.length;
  // The symbol may end with a dot of its own, as «руб.» does.
  const amount = money(left, d.symbol);
  const head = `В ${month} ${n} ${plural(n, ['трата', 'траты', 'трат'])} из ${d.count} без категории, на ${amount}${amount.endsWith('.') ? '' : '.'}`;
  const suggested = d.pending.filter((p) => p.suggestion !== null).length;
  const how = 'Откройте трату и выберите категорию, регулярную трату или покупку, которую она оплатила.';
  return suggested ? `${head} Для ${suggested} есть подсказка: её можно принять сразу. ${how}` : `${head} ${how}`;
}

/** An expense to sort: a row with its suggestion to accept, open to mark it. */
function pendingItem({ d, href, here }: Page, o: Operation, suggestion: Suggestion | null): Html {
  const key = `spending-${o.id}`;
  const open = d.edit === key;
  return entryRow({
    id: key,
    title: o.payee,
    details: [where(o), o.description, suggestion ? `похоже на ${suggestionName(suggestion)}` : null].filter(Boolean).join(' · '),
    icon: 'tag',
    color: toneColor('gray'),
    amount: o.amount,
    symbol: d.symbol,
    href: open ? here() : here({ edit: key }),
    actions: open ? [] : suggestion ? [{ label: 'Принять', action: href(`/spending/${o.id}/${suggestedChoice(suggestion)}`) }] : [],
    panel: open ? markingPanel(d.marking, o, href) : undefined,
  });
}

/** An expense sorted in the app: a row that opens to change or take back what it is marked as. */
function sortedItem({ d, href, here }: Page, o: Operation): Html {
  const key = `spending-${o.id}`;
  const open = d.edit === key;
  const regular = o.regular ? d.marking.regular.find((e) => e.id === o.regular?.id) : undefined;
  return entryRow({
    id: key,
    title: markingTitle(o),
    details: `${where(o)} · ${markingDetails(o)}`,
    icon: regular ? entryIcon(regular.icon, regular.title) : o.category ? categoryIcon(o.category.title) : 'tag',
    color: categoryColor(o.category?.id ?? null, o.category?.color ?? null),
    mark: envelopeMark(d.marking, o),
    amount: o.amount,
    symbol: d.symbol,
    href: open ? here() : here({ edit: key }),
    actions: open ? markingActions(d.marking, o, href) : [],
    panel: open ? markingPanel(d.marking, o, href) : undefined,
  });
}

/** How a suggestion is accepted: tag-<id> or regular-<id>, as /spending/:id/:choice takes it. */
export function suggestedChoice(suggestion: Suggestion): string {
  return 'category' in suggestion ? `tag-${suggestion.category.id}` : `regular-${suggestion.regular.id}`;
}

/** When and from where: 5 октября, Основной, and the comment when there is one. */
export function where(o: Operation): string {
  return [`${dayMonth(o.date)}, ${o.account}`, o.comment].filter(Boolean).join(' · ');
}

export function suggestionName(suggestion: Suggestion): string {
  return 'category' in suggestion ? `«${suggestion.category.title}»` : `регулярную «${suggestion.regular.title}»`;
}

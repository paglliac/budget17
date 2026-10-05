// The overview: month spending and income, top categories, the month calendar with upcoming payments,
// and accounts on the side. Built from widgets only.

import { summarizeBalances, type AccountBalance, type BalanceSummary } from '../../balances.ts';
import { monthOf, shiftMonth, type MonthString } from '../../dates.ts';
import { summarizeMonth, type MonthSummary } from '../../month.ts';
import { upcomingIncome, type Income } from '../../income.ts';
import { soonestFirst, upcomingOperations, type PlannedOperation } from '../../planned.ts';
import { upcomingRegular, type RegularExpense } from '../../regular.ts';
import type { AccountType, DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { capitalize, greeting, money, monthName, num, percent, plural } from '../format.ts';
import { Html } from '../html.ts';
import { categoryIcon, type IconName } from '../icons.ts';
import { categoryColor, toneAt, toneColor, type Tone } from '../tones.ts';
import { accountList, balanceTotal, type AccountItem } from '../widgets/accounts.ts';
import { button, chip, emptyState, footnote, pageIntro, section, shareBar } from '../widgets/basics.ts';
import { monthCalendar, type CalendarDay } from '../widgets/calendar.ts';
import { categoryTile, paymentCard, statCard } from '../widgets/cards.ts';
import { appShell, grid, topBar } from '../widgets/shell.ts';
import { appRail, monthTabs, parseMonth, recentMonths, userName, type Href } from './chrome.ts';

export interface DashboardData {
  today: DateString;
  /** Local hour, for the greeting. */
  hour: number;
  /** Months offered as tabs, newest first. */
  months: MonthString[];
  balances: BalanceSummary;
  month: MonthSummary;
  planned: PlannedOperation[];
  userName: string | null;
  source: 'zenmoney' | 'demo';
  /** Whether the page can offer to sync with ZenMoney. */
  canSync: boolean;
}

export function loadDashboard(
  data: EntityCollections,
  options: {
    today: DateString;
    month: string | null;
    hour: number;
    source: DashboardData['source'];
    canSync: boolean;
    /** Regular expenses and incomes set up in the app; they join the planned operations from ZenMoney. */
    regular: RegularExpense[];
    incomes: Income[];
  },
): DashboardData {
  const current = monthOf(options.today);
  const month = parseMonth(options.month, current);
  return {
    today: options.today,
    hour: options.hour,
    months: recentMonths(current),
    balances: summarizeBalances(data),
    month: summarizeMonth(data, { month, today: options.today }),
    planned: [
      ...upcomingOperations(data, { today: options.today }),
      ...upcomingRegular(options.regular, { today: options.today }),
      ...upcomingIncome(options.incomes, { today: options.today }),
    ].sort(soonestFirst),
    userName: userName(data),
    source: options.source,
    canSync: options.canSync,
  };
}

export function renderDashboard(d: DashboardData, href: Href): Html {
  const symbol = d.balances.mainInstrument.symbol;
  const current = monthOf(d.today);
  const month = d.month.month === current ? null : d.month.month;
  const operations = (params: Record<string, string>) => href('/operations', { month, ...params });

  const body = appShell({
    rail: appRail('overview', d.userName, href),
    tabs: monthTabs(current, d.month.month, (m) => href('/', { month: m })),
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: 'Обзор', icon: 'home' }] }),
      pageIntro({ title: greeting(d.hour), emoji: '👋', text: monthSentence(d.month, symbol) }),
      grid({ columns: 3, min: 220, items: statCards(d.month, symbol, operations) }),
      section({ title: 'Больше всего тратите на', body: topCategories(d.month, symbol, operations) }),
      section({
        title: capitalize(monthName(d.month.month)),
        body: grid({ columns: 2, min: 300, items: [calendar(d), upcoming(d, symbol)] }),
      }),
    ],
    side: accountsPanel(d),
  });

  return pageDocument({ title: 'Бюджет', body });
}

function monthSentence(m: MonthSummary, symbol: string): string {
  const previous = shiftMonth(m.month, -1);
  if (m.elapsed < m.days) {
    let text = `В ${monthName(m.month, 'prepositional')} вы потратили ${money(m.expense, symbol)}.`;
    if (m.previous.expenseToDate > 0) {
      const change = Math.round((m.expense / m.previous.expenseToDate - 1) * 100);
      const by = `${m.elapsed} ${monthName(previous, 'genitive')}`;
      text +=
        change === 0
          ? ` Примерно столько же, сколько к ${by}.`
          : ` Это на ${Math.abs(change)}% ${change < 0 ? 'меньше' : 'больше'}, чем к ${by}.`;
    }
    return text;
  }
  return `В ${monthName(m.month, 'prepositional')} вы потратили ${money(m.expense, symbol)} и получили ${money(m.income, symbol)}.`;
}

function statCards(m: MonthSummary, symbol: string, operations: (params: Record<string, string>) => string): Html[] {
  const plan = m.budget ?? (m.previous.expense > 0 ? m.previous.expense : null);
  const spent = plan === null ? null : m.expense / plan;
  return [
    statCard({
      icon: 'wallet',
      tone: spent !== null && spent > 1 ? 'red' : 'yellow',
      title: 'Расходы',
      label:
        plan === null
          ? 'Потрачено'
          : m.budget !== null
            ? `${num(m.expense)} из ${money(plan, symbol)}`
            : `${num(m.expense)} из ${money(plan, symbol)} в прошлом месяце`,
      value: spent === null ? money(m.expense, symbol) : percent(spent),
      progress: spent ?? 0,
      action: { label: 'Операции', href: operations({ kind: 'expense' }) },
    }),
    statCard({
      icon: 'arrowDownLeft',
      tone: 'violet',
      title: 'Доходы',
      label: 'Получено',
      value: money(m.income, symbol),
      progress: m.previous.income > 0 ? m.income / m.previous.income : 0,
      action: { label: 'Операции', href: operations({ kind: 'income' }) },
    }),
    statCard({
      icon: 'clock',
      tone: 'teal',
      title: 'Месяц',
      label: 'Прошло дней',
      value: `${m.elapsed} / ${m.days}`,
      progress: m.elapsed / m.days,
    }),
  ];
}

function topCategories(m: MonthSummary, symbol: string, operations: (params: Record<string, string>) => string): Html {
  if (m.categories.length === 0) {
    return emptyState({ text: `В ${monthName(m.month, 'prepositional')} трат пока нет.` });
  }
  return grid({
    columns: 4,
    min: 200,
    items: m.categories.slice(0, 4).map((c) =>
      categoryTile({
        icon: categoryIcon(c.title),
        color: categoryColor(c.id, c.color),
        title: c.title,
        amount: c.amount,
        symbol,
        href: operations({ category: c.id ?? 'none' }),
      }),
    ),
  });
}

/** Days with spending are marked; dots show unusually large spending, income and planned operations. */
function calendar(d: DashboardData): Html {
  const m = d.month;
  const spendingDays = m.dailyExpense.filter((v) => v > 0);
  const average = spendingDays.reduce((sum, v) => sum + v, 0) / (spendingDays.length || 1);
  const plannedDays = new Set(d.planned.filter((p) => monthOf(p.date) === m.month).map((p) => Number(p.date.slice(8, 10))));
  const symbol = d.balances.mainInstrument.symbol;

  const days = m.dailyExpense.map((spent, i): CalendarDay => {
    const income = m.dailyIncome[i] ?? 0;
    const dots: Tone[] = [];
    if (spent > average * 1.8) dots.push('orange');
    if (income > 0) dots.push('violet');
    if (plannedDays.has(i + 1)) dots.push('teal');
    const title = [spent > 0 ? `Расходы ${money(spent, symbol)}` : '', income > 0 ? `Доходы ${money(income, symbol)}` : '']
      .filter(Boolean)
      .join(', ');
    return { marked: spent > 0, dots, title: title || undefined };
  });

  return monthCalendar({
    month: m.month,
    today: d.today,
    days,
    legend: [
      { tone: 'orange', label: 'Крупные траты' },
      { tone: 'violet', label: 'Доход' },
      { tone: 'teal', label: 'Платёж' },
    ],
  });
}

const PAYMENT_TONES: Tone[] = ['blue', 'yellow', 'violet', 'teal'];

function upcoming(d: DashboardData, symbol: string): Html {
  if (d.planned.length === 0) {
    return emptyState({ text: 'Плановых платежей нет. Добавьте доходы, регулярные траты или плановые платежи в ZenMoney, и они появятся здесь.' });
  }
  return grid({
    columns: 2,
    min: 200,
    items: d.planned.slice(0, 4).map((p, i) =>
      paymentCard({ title: p.title, date: p.date, today: d.today, kind: p.kind, amount: p.amount, symbol, tone: PAYMENT_TONES[i % PAYMENT_TONES.length]! }),
    ),
  });
}

const ACCOUNT_TYPES: Record<AccountType, { one: string; group: string; icon: IconName }> = {
  ccard: { one: 'Карта', group: 'Карты', icon: 'card' },
  checking: { one: 'Счёт', group: 'Счета', icon: 'wallet' },
  deposit: { one: 'Вклад', group: 'Вклады', icon: 'piggy' },
  cash: { one: 'Наличные', group: 'Наличные', icon: 'banknote' },
  emoney: { one: 'Кошелёк', group: 'Кошельки', icon: 'wallet' },
  loan: { one: 'Кредит', group: 'Кредиты', icon: 'card' },
  debt: { one: 'Долги', group: 'Долги', icon: 'arrows' },
};

function accountsPanel(d: DashboardData): Html[] {
  const { balances } = d;
  const symbol = balances.mainInstrument.symbol;
  const counted = balances.accounts.filter((a) => a.inBalance);
  const excluded = balances.accounts.filter((a) => !a.inBalance);
  const item = (a: AccountBalance, index: number): AccountItem => ({
    title: a.title,
    subtitle: ACCOUNT_TYPES[a.type].one,
    balance: a.balance,
    symbol: a.instrument.symbol,
    converted: a.instrument.id === balances.mainInstrument.id ? undefined : { amount: a.balanceInMain, symbol },
    color: toneColor(toneAt(index)),
  });

  const groups = new Map<AccountType, number>();
  for (const a of counted) groups.set(a.type, (groups.get(a.type) ?? 0) + 1);
  const chips = [...groups].map(([type, count], i) =>
    chip({ label: ACCOUNT_TYPES[type].group, icon: ACCOUNT_TYPES[type].icon, tone: toneAt(i + 2), count }),
  );

  return [
    topBar({
      crumbs: [{ label: 'Счета' }],
      actions: d.canSync ? button({ label: 'Обновить', icon: 'refresh', action: '/sync' }) : null,
    }),
    balanceTotal({
      amount: balances.total,
      symbol,
      note: `на ${counted.length} ${plural(counted.length, ['счёте', 'счетах', 'счетах'])}, которые учитываются в балансе`,
      footer: chips,
    }),
    shareBar({
      label: 'Доли счетов',
      parts: counted.map((a, i) => ({ label: a.title, value: a.balanceInMain, color: toneColor(toneAt(i)) })),
    }),
    accountList({ accounts: counted.map(item) }),
    excluded.length > 0
      ? accountList({ title: 'Не учитываются в балансе', accounts: excluded.map((a, i) => item(a, counted.length + i)) })
      : null,
    footnote({
      text:
        d.source === 'demo'
          ? 'Демо-данные. Чтобы увидеть свои, добавьте токен в .env и запустите make sync.'
          : 'Данные из ZenMoney.',
    }),
  ].filter((part): part is Html => part !== null);
}

// Regular expenses: the list to set them up, what they cost in a month and the payment days of this month.
// A row opens for editing by its link (?edit=id); forms post to /regular, /regular/:id and /regular/:id/delete.

import { mainCurrency } from '../../balances.ts';
import { dayOfMonth, daysBetween, monthOf } from '../../dates.ts';
import {
  nextPayment,
  parseRegularExpense,
  paymentDate,
  regularTotals,
  regularValues,
  type RegularErrors,
  type RegularExpense,
  type RegularValues,
} from '../../regular.ts';
import type { Settings } from '../../settings.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { daysLeft, money, monthName, plural } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryIcon } from '../icons.ts';
import { categoryColor, toneColor } from '../tones.ts';
import { balanceTotal } from '../widgets/accounts.ts';
import { footnote, pageIntro } from '../widgets/basics.ts';
import { monthCalendar, type CalendarDay } from '../widgets/calendar.ts';
import { regularForm, regularList, regularRow } from '../widgets/regular.ts';
import { appShell, topBar } from '../widgets/shell.ts';
import { appRail, userName, type Href } from './chrome.ts';

/** A form on the page: an expense open for editing, or a submission that failed and is shown again with its errors. */
export interface RegularForm {
  /** null for a new expense. */
  id: number | null;
  values: RegularValues;
  errors: RegularErrors;
}

export interface RegularData {
  today: DateString;
  /** By day of the month. */
  expenses: RegularExpense[];
  form: RegularForm | null;
  symbol: string;
  userName: string | null;
}

export function loadRegular(
  data: EntityCollections,
  expenses: RegularExpense[],
  options: { today: DateString; edit?: string | null; form?: RegularForm },
): RegularData {
  const editing = expenses.find((e) => String(e.id) === options.edit);
  return {
    today: options.today,
    expenses,
    form: options.form ?? (editing ? { id: editing.id, values: regularValues(editing), errors: {} } : null),
    symbol: mainCurrency(data).symbol,
    userName: userName(data),
  };
}

export type RegularSubmission = { status: 'saved' } | { status: 'missing' } | { status: 'invalid'; form: RegularForm };

/** Applies a form posted to /regular (add), /regular/:id (save) or /regular/:id/delete. */
export function submitRegular(settings: Settings, path: string, body: URLSearchParams): RegularSubmission {
  const match = /^\/regular(?:\/(\d+)(\/delete)?)?$/.exec(path);
  if (!match) return { status: 'missing' };
  const id = match[1] === undefined ? null : Number(match[1]);
  if (id !== null && !settings.regularExpenses().some((e) => e.id === id)) return { status: 'missing' };
  if (id !== null && match[2]) {
    settings.deleteRegularExpense(id);
    return { status: 'saved' };
  }

  const values: RegularValues = { title: body.get('title') ?? '', amount: body.get('amount') ?? '', day: body.get('day') ?? '' };
  const parsed = parseRegularExpense(values);
  if ('errors' in parsed) return { status: 'invalid', form: { id, values, errors: parsed.errors } };
  if (id === null) settings.addRegularExpense(parsed.expense);
  else settings.updateRegularExpense(id, parsed.expense);
  return { status: 'saved' };
}

export function renderRegular(d: RegularData, href: Href): Html {
  const { total } = regularTotals(d.expenses, d.today);
  const count = d.expenses.length;
  const newForm = d.form?.id === null ? d.form : null;

  const body = appShell({
    rail: appRail('regular', d.userName, href),
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: 'Регулярные траты', icon: 'repeat' }] }),
      pageIntro({ title: 'Регулярные траты', text: sentence(d) }),
      regularList({
        label: 'Регулярные траты',
        items: [
          ...d.expenses.map((e) => (d.form?.id === e.id ? editForm(e, d.form, d.symbol, href) : row(e, d, href))),
          regularForm({
            action: href('/regular'),
            submitLabel: 'Добавить',
            icon: 'plus',
            color: toneColor('gray'),
            symbol: d.symbol,
            values: newForm?.values,
            errors: newForm?.errors,
          }),
        ],
      }),
    ],
    side: [
      topBar({ crumbs: [{ label: 'В месяц' }] }),
      balanceTotal({ amount: total, symbol: d.symbol, note: count ? `на ${count} ${plural(count, ['платёж', 'платежа', 'платежей'])}` : 'Регулярных трат пока нет' }),
      calendar(d),
      footnote({ text: 'Регулярные траты хранятся в приложении, в data/settings.db, а не в ZenMoney.' }),
    ],
  });

  return pageDocument({ title: 'Бюджет: регулярные траты', body });
}

function sentence(d: RegularData): string {
  if (d.expenses.length === 0) {
    return 'Добавьте платежи, которые повторяются каждый месяц: аренду, кредит, связь. Они появятся в ближайших платежах на обзоре.';
  }
  const { total, ahead } = regularTotals(d.expenses, d.today);
  const month = monthName(d.today, 'prepositional');
  let text = `Каждый месяц на них уходит ${money(total, d.symbol)}.`;
  if (ahead === 0) return `${text} В ${month} все платежи уже позади.`;
  const next = d.expenses
    .map((e) => ({ title: e.title, date: nextPayment(e, d.today) }))
    .reduce((a, b) => (b.date < a.date ? b : a));
  text += ` В ${month} осталось заплатить ${money(ahead, d.symbol)}, ближайший платёж — «${next.title}», ${when(next.date, d.today)}.`;
  return text;
}

/** сегодня, завтра, через 5 дней. */
function when(date: DateString, today: DateString): string {
  const days = daysBetween(today, date);
  return days <= 1 ? daysLeft(days) : `через ${daysLeft(days)}`;
}

function row(e: RegularExpense, d: RegularData, href: Href): Html {
  return regularRow({
    title: e.title,
    details: `${e.day}-го числа · ${when(nextPayment(e, d.today), d.today)}`,
    icon: categoryIcon(e.title),
    color: expenseColor(e),
    amount: e.amount,
    symbol: d.symbol,
    href: href('/regular', { edit: String(e.id) }),
  });
}

function editForm(e: RegularExpense, form: RegularForm, symbol: string, href: Href): Html {
  return regularForm({
    action: href(`/regular/${e.id}`),
    submitLabel: 'Сохранить',
    icon: categoryIcon(e.title),
    color: expenseColor(e),
    symbol,
    values: form.values,
    errors: form.errors,
    deleteAction: href(`/regular/${e.id}/delete`),
    cancelHref: href('/regular'),
  });
}

/** A tone picked by the id, so an expense keeps its colour when renamed. */
function expenseColor(e: RegularExpense): string {
  return categoryColor(`regular:${e.id}`, null);
}

/** The current month with its payment days marked; the tooltip lists what is paid that day. */
function calendar(d: RegularData): Html {
  const month = monthOf(d.today);
  const payments = new Map<number, string[]>();
  for (const e of d.expenses) {
    const day = dayOfMonth(paymentDate(e, month));
    payments.set(day, [...(payments.get(day) ?? []), `${e.title} ${money(e.amount, d.symbol)}`]);
  }
  const days = Array.from({ length: 31 }, (_, i): CalendarDay => {
    const titles = payments.get(i + 1);
    return titles ? { marked: true, dots: ['teal'], title: titles.join(', ') } : {};
  });
  return monthCalendar({ month, today: d.today, days, legend: [{ tone: 'teal', label: `Платежи в ${monthName(month, 'prepositional')}` }] });
}

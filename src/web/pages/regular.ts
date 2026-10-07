// Regular expenses: the list to set them up, what is left to pay of them this month and its payment days.
// The list runs in the order things happen this month: what is behind, quieter, then a line at today, then what is
// ahead. Expenses with no payment this month that start later go apart, under «Начнутся позже».
// A row opens for editing by its link (?edit=id); its dates and icon fold under «Даты и иконка».
// Forms post to /regular, /regular/:id and /regular/:id/delete.

import { mainCurrency } from '../../balances.ts';
import { addDays, dateOf, dayOfMonth, daysInMonth, monthOf } from '../../dates.ts';
import { listOperations, type Operation, type Sorting } from '../../ledger.ts';
import {
  monthStatus,
  parseRegularExpense,
  paymentDate,
  regularTotals,
  regularValues,
  type MonthStatus,
  type RegularErrors,
  type RegularExpense,
  type RegularValues,
} from '../../regular.ts';
import type { Settings } from '../../settings.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { dayMonth, dayMonthYear, fromToday, money, monthName, plural } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryIcon, ENTRY_ICONS, entryIcon, isEntryIcon, type IconName } from '../icons.ts';
import { categoryColor, toneColor, type Tone } from '../tones.ts';
import { balanceTotal } from '../widgets/accounts.ts';
import { field, footnote, iconPicker, pageIntro, section, shareBar } from '../widgets/basics.ts';
import { monthCalendar, type CalendarDay } from '../widgets/calendar.ts';
import { entryDivider, entryForm, entryList, entryRow } from '../widgets/entries.ts';
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
  /** Expenses linked to regular expenses, from a month before the current one through its end, newest first. */
  linked: Operation[];
  form: RegularForm | null;
  symbol: string;
  userName: string | null;
}

export function loadRegular(
  data: EntityCollections,
  saved: { categorizations: Sorting['categorizations']; regular: RegularExpense[] },
  options: { today: DateString; edit?: string | null; form?: RegularForm },
): RegularData {
  const expenses = saved.regular;
  const editing = expenses.find((e) => String(e.id) === options.edit);
  const month = monthOf(options.today);
  // A month back, so that a payment of the 1st paid a week early is found as paid.
  const range = { from: addDays(dateOf(month, 1), -31), to: dateOf(month, daysInMonth(month)) };
  return {
    today: options.today,
    expenses,
    linked: listOperations(data, range, saved).filter((o) => o.kind === 'expense' && o.regular !== null),
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

  const icon = body.get('icon');
  const values: RegularValues = {
    title: body.get('title') ?? '',
    amount: body.get('amount') ?? '',
    day: body.get('day') ?? '',
    start: body.get('start') ?? '',
    end: body.get('end') ?? '',
    icon: isEntryIcon(icon) ? icon : '',
  };
  const parsed = parseRegularExpense(values);
  if ('errors' in parsed) return { status: 'invalid', form: { id, values, errors: parsed.errors } };
  if (id === null) settings.addRegularExpense(parsed.expense);
  else settings.updateRegularExpense(id, parsed.expense);
  return { status: 'saved' };
}

const EMPTY: RegularValues = { title: '', amount: '', day: '', start: '', end: '', icon: '' };

export function renderRegular(d: RegularData, href: Href): Html {
  const totals = regularTotals(d.expenses, d.today, d.linked);
  const { count, total } = totals;
  const newForm = d.form?.id === null ? d.form : null;
  const month = monthName(d.today, 'prepositional');
  const { behind, ahead, later } = timeline(d);
  const item = ({ expense, status }: Placed): Html =>
    d.form?.id === expense.id ? editForm(expense, d.form, d.symbol, href) : row(expense, status, d, href);

  const body = appShell({
    rail: appRail('regular', d.userName, href),
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: 'Регулярные траты', icon: 'repeat' }] }),
      pageIntro({ title: 'Регулярные траты', text: regularSentence(d) }),
      entryList({
        label: 'Регулярные траты',
        items: [
          ...behind.map(item),
          behind.length > 0 && ahead.length > 0 ? entryDivider({ label: `Сегодня, ${dayMonth(d.today)}` }) : null,
          ...ahead.map(item),
          entryForm({
            action: href('/regular'),
            submitLabel: 'Добавить',
            icon: 'plus',
            color: toneColor('gray'),
            ...formFields(newForm ?? { values: EMPTY, errors: {} }, d.symbol),
          }),
        ].filter((part): part is Html => part !== null),
      }),
      later.length > 0 ? section({ title: 'Начнутся позже', body: entryList({ label: 'Начнутся позже', items: later.map(item) }) }) : null,
    ],
    side: [
      topBar({ crumbs: [{ label: `Осталось заплатить в ${month}` }] }),
      balanceTotal({
        amount: totals.ahead,
        symbol: d.symbol,
        note: regularTotalNote(d),
      }),
      count
        ? shareBar({
            label: `Платежи в ${month}`,
            parts: [
              { label: 'Оплачено', value: totals.paid, color: toneColor(STATUS_TONE.paid) },
              { label: 'Прошли', value: totals.past, color: toneColor(STATUS_TONE.past) },
              { label: 'Впереди', value: totals.ahead, color: toneColor(STATUS_TONE.ahead) },
            ],
          })
        : null,
      calendar(d),
      footnote({ text: 'Регулярные траты хранятся в приложении, в data/settings.db, а не в ZenMoney.' }),
    ],
  });

  return pageDocument({ title: 'Бюджет: регулярные траты', body });
}

/** What is left of this month and the nearest payment not paid yet. No phrase ends with an amount, since «руб.» has its own dot. */
export function regularSentence(d: RegularData): string {
  if (d.expenses.length === 0) {
    return 'Добавьте платежи, которые повторяются каждый месяц: аренду, кредит, связь. Они появятся в ближайших платежах на обзоре.';
  }
  const { total, ahead } = regularTotals(d.expenses, d.today, d.linked);
  const month = monthName(d.today, 'prepositional');
  const { ahead: thisMonth, later } = timeline(d);
  const next = thisMonth[0] ?? later[0] ?? null;
  if (total === 0) {
    const text = `В ${month} регулярных платежей нет.`;
    return next ? `${text} Ближайший — «${next.expense.title}», ${dayMonthYear(next.status.date, d.today)}.` : text;
  }
  if (ahead === 0 || next === null) return `В ${month} на них уходит ${money(total, d.symbol)}, все платежи этого месяца уже позади.`;
  return `Осталось заплатить ${money(ahead, d.symbol)} из ${money(total, d.symbol)}, ближайший платёж — «${next.expense.title}», ${fromToday(next.status.date, d.today)}.`;
}

/** An expense and where it stands this month. */
export interface Placed {
  expense: RegularExpense;
  status: MonthStatus;
}

type Ahead = Placed & { status: { kind: 'ahead' } };

/**
 * The month in the order things happen: what is behind by the day it was paid or passed, ended expenses first, and
 * what is ahead this month by its date, soonest first. `later` have no payment this month and start in a later one,
 * soonest first.
 */
export function timeline(d: RegularData): { behind: Placed[]; ahead: Ahead[]; later: Ahead[] } {
  const placed = d.expenses.map((expense) => ({ expense, status: monthStatus(expense, d.today, d.linked) }));
  const happened = (s: MonthStatus): string => (s.kind === 'paid' ? s.on : s.kind === 'past' ? s.date : '');
  const upcoming = placed.filter((p): p is Ahead => p.status.kind === 'ahead').sort((a, b) => a.status.date.localeCompare(b.status.date));
  const month = monthOf(d.today);
  return {
    behind: placed.filter((p) => p.status.kind !== 'ahead').sort((a, b) => happened(a.status).localeCompare(happened(b.status))),
    ahead: upcoming.filter((p) => monthOf(p.status.date) === month),
    later: upcoming.filter((p) => monthOf(p.status.date) !== month),
  };
}

/** Tones of the payments in the calendar and the bar: what linked expenses paid, what passed without them, what is ahead. */
export const STATUS_TONE = { paid: 'green', past: 'gray', ahead: 'teal' } as const satisfies Record<string, Tone>;

/** A row of the list; what is behind is quieter, and a paid one gets a check. */
function row(e: RegularExpense, status: MonthStatus, d: RegularData, href: Href): Html {
  return entryRow({
    id: `regular-${e.id}`,
    title: e.title,
    ...regularLine(e, status, d),
    amount: e.amount,
    symbol: d.symbol,
    href: href('/regular', { edit: String(e.id) }),
  });
}

/** What a regular expense's row says, its icon and colour; what is behind is quieter, and a paid one gets a check. */
export function regularLine(e: RegularExpense, status: MonthStatus, d: RegularData): { details: string; icon: IconName; color: string; muted: boolean } {
  return {
    details: details(e, status, d),
    icon: status.kind === 'paid' ? 'check' : entryIcon(e.icon, e.title),
    color: status.kind === 'ahead' ? expenseColor(e) : toneColor(status.kind === 'paid' ? STATUS_TONE.paid : STATUS_TONE.past),
    muted: status.kind !== 'ahead',
  };
}

/** What the total of the month is out of. */
export function regularTotalNote(d: RegularData): string {
  const { count, total } = regularTotals(d.expenses, d.today, d.linked);
  const month = monthName(d.today, 'prepositional');
  return count
    ? `из ${money(total, d.symbol)} на ${count} ${plural(count, ['платёж', 'платежа', 'платежей'])}`
    : d.expenses.length
      ? `В ${month} платежей нет`
      : 'Регулярных трат пока нет';
}

/** 10-го числа · оплачено 5 октября, 1-го числа · прошёл 1 октября, or when it is paid next. */
function details(e: RegularExpense, status: MonthStatus, d: RegularData): string {
  if (status.kind === 'paid') return `${e.day}-го числа · оплачено ${dayMonth(status.on)}`;
  if (status.kind === 'past') return `${e.day}-го числа · прошёл ${dayMonth(status.date)}`;
  if (status.kind === 'ahead' && status.covered > 0) {
    return `${e.day}-го числа · оплачено ${money(status.covered, d.symbol)} из ${money(e.amount, d.symbol)} · ${fromToday(status.date, d.today)}`;
  }
  return schedule(e, status.kind === 'ahead' ? status.date : null, d.today);
}

function editForm(e: RegularExpense, form: RegularForm, symbol: string, href: Href): Html {
  return entryForm({
    id: `regular-${e.id}`,
    action: href(`/regular/${e.id}`),
    submitLabel: 'Сохранить',
    icon: entryIcon(e.icon, e.title),
    color: expenseColor(e),
    ...formFields(form, symbol),
    deleteAction: href(`/regular/${e.id}/delete`),
    cancelHref: href('/regular'),
  });
}

/** When it is paid: 25-го числа · по 31 мая 2027 · через 20 дней. `next` is null when the payments are over. */
function schedule(e: RegularExpense, next: DateString | null, today: DateString): string {
  return [
    `${e.day}-го числа`,
    e.start !== null && e.start > today ? `с ${dayMonthYear(e.start, today)}` : null,
    e.end !== null ? `по ${dayMonthYear(e.end, today)}` : null,
    next === null ? 'платежи закончились' : fromToday(next, today),
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

/** The main fields, and the dates and icon folded under them until opened or wrong. */
function formFields(form: Pick<RegularForm, 'values' | 'errors'>, symbol: string): { fields: Html[]; more: { label: string; fields: Html[]; open: boolean } } {
  const { values, errors } = form;
  return {
    fields: [
      field({ label: 'Название', name: 'title', value: values.title, placeholder: 'Например, аренда', maxLength: 80, required: true, error: errors.title }),
      field({ label: `Сумма, ${symbol}`, name: 'amount', type: 'decimal', value: values.amount, placeholder: '13 000', width: 130, required: true, error: errors.amount }),
      field({ label: 'Число', name: 'day', type: 'integer', min: 1, max: 31, value: values.day, placeholder: '25', width: 84, required: true, error: errors.day }),
    ],
    more: {
      label: 'Даты и иконка',
      open: Boolean(errors.start || errors.end),
      fields: [
        field({ label: 'Дата начала', name: 'start', type: 'date', value: values.start, width: 160, error: errors.start }),
        field({ label: 'Дата окончания', name: 'end', type: 'date', value: values.end, width: 160, error: errors.end }),
        iconPicker({
          label: 'Иконка',
          name: 'icon',
          value: values.icon,
          icons: ENTRY_ICONS,
          auto: { icon: categoryIcon(values.title), label: 'По названию' },
        }),
      ],
    },
  };
}

/** A tone picked by the id, so an expense keeps its colour when renamed. */
function expenseColor(e: RegularExpense): string {
  return categoryColor(`regular:${e.id}`, null);
}

/** The current month with its payment days marked by where they stand; the tooltip lists what is paid that day. */
function calendar(d: RegularData): Html {
  const month = monthOf(d.today);
  const payments = new Map<number, Array<{ text: string; tone: Tone }>>();
  for (const e of d.expenses) {
    const date = paymentDate(e, month);
    if (date === null) continue;
    const status = monthStatus(e, d.today, d.linked);
    const tone = status.kind === 'paid' ? STATUS_TONE.paid : status.kind === 'past' ? STATUS_TONE.past : STATUS_TONE.ahead;
    const day = dayOfMonth(date);
    payments.set(day, [...(payments.get(day) ?? []), { text: `${e.title} ${money(e.amount, d.symbol)}`, tone }]);
  }
  const days = Array.from({ length: 31 }, (_, i): CalendarDay => {
    const list = payments.get(i + 1);
    return list ? { marked: true, dots: [...new Set(list.map((p) => p.tone))], title: list.map((p) => p.text).join(', ') } : {};
  });
  const tones = new Set([...payments.values()].flat().map((p) => p.tone));
  const legend = [
    { tone: STATUS_TONE.ahead, label: 'Впереди' },
    { tone: STATUS_TONE.paid, label: 'Оплачено' },
    { tone: STATUS_TONE.past, label: 'Прошли' },
  ].filter((item) => tones.has(item.tone));
  return monthCalendar({ month, today: d.today, days, legend });
}

// Regular expenses: the list to set them up, what they cost this month and its payment days.
// A row opens for editing by its link (?edit=id); its dates and icon fold under «Даты и иконка».
// Forms post to /regular, /regular/:id and /regular/:id/delete.

import { mainCurrency } from '../../balances.ts';
import { dayOfMonth, monthOf } from '../../dates.ts';
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
import { dayMonthYear, fromToday, money, monthName, plural } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryIcon, ENTRY_ICONS, entryIcon, isEntryIcon } from '../icons.ts';
import { categoryColor, toneColor } from '../tones.ts';
import { balanceTotal } from '../widgets/accounts.ts';
import { field, footnote, iconPicker, pageIntro } from '../widgets/basics.ts';
import { monthCalendar, type CalendarDay } from '../widgets/calendar.ts';
import { entryForm, entryList, entryRow } from '../widgets/entries.ts';
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
  const { count, total } = regularTotals(d.expenses, d.today);
  const newForm = d.form?.id === null ? d.form : null;
  const month = monthName(d.today, 'prepositional');

  const body = appShell({
    rail: appRail('regular', d.userName, href),
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: 'Регулярные траты', icon: 'repeat' }] }),
      pageIntro({ title: 'Регулярные траты', text: sentence(d) }),
      entryList({
        label: 'Регулярные траты',
        items: [
          ...d.expenses.map((e) => (d.form?.id === e.id ? editForm(e, d.form, d.symbol, href) : row(e, d, href))),
          entryForm({
            action: href('/regular'),
            submitLabel: 'Добавить',
            icon: 'plus',
            color: toneColor('gray'),
            ...formFields(newForm ?? { values: EMPTY, errors: {} }, d.symbol),
          }),
        ],
      }),
    ],
    side: [
      topBar({ crumbs: [{ label: `В ${month}` }] }),
      balanceTotal({
        amount: total,
        symbol: d.symbol,
        note: count
          ? `на ${count} ${plural(count, ['платёж', 'платежа', 'платежей'])}`
          : d.expenses.length
            ? `В ${month} платежей нет`
            : 'Регулярных трат пока нет',
      }),
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
  const next = d.expenses
    .flatMap((e) => {
      const date = nextPayment(e, d.today);
      return date === null ? [] : [{ title: e.title, date }];
    })
    .reduce<{ title: string; date: DateString } | null>((a, b) => (a === null || b.date < a.date ? b : a), null);
  if (total === 0) {
    const text = `В ${month} регулярных платежей нет.`;
    return next ? `${text} Ближайший — «${next.title}», ${dayMonthYear(next.date, d.today)}.` : text;
  }
  const text = `В ${month} на них уходит ${money(total, d.symbol)}.`;
  if (ahead === 0 || next === null) return `${text} Все платежи этого месяца уже позади.`;
  return `${text} Осталось заплатить ${money(ahead, d.symbol)}, ближайший платёж — «${next.title}», ${fromToday(next.date, d.today)}.`;
}

function row(e: RegularExpense, d: RegularData, href: Href): Html {
  return entryRow({
    title: e.title,
    details: schedule(e, d.today),
    icon: entryIcon(e.icon, e.title),
    color: expenseColor(e),
    amount: e.amount,
    symbol: d.symbol,
    href: href('/regular', { edit: String(e.id) }),
  });
}

function editForm(e: RegularExpense, form: RegularForm, symbol: string, href: Href): Html {
  return entryForm({
    action: href(`/regular/${e.id}`),
    submitLabel: 'Сохранить',
    icon: entryIcon(e.icon, e.title),
    color: expenseColor(e),
    ...formFields(form, symbol),
    deleteAction: href(`/regular/${e.id}/delete`),
    cancelHref: href('/regular'),
  });
}

/** When it is paid: 25-го числа · по 31 мая 2027 · через 20 дней. */
function schedule(e: RegularExpense, today: DateString): string {
  const next = nextPayment(e, today);
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

/** The current month with its payment days marked; the tooltip lists what is paid that day. */
function calendar(d: RegularData): Html {
  const month = monthOf(d.today);
  const payments = new Map<number, string[]>();
  for (const e of d.expenses) {
    const date = paymentDate(e, month);
    if (date === null) continue;
    const day = dayOfMonth(date);
    payments.set(day, [...(payments.get(day) ?? []), `${e.title} ${money(e.amount, d.symbol)}`]);
  }
  const days = Array.from({ length: 31 }, (_, i): CalendarDay => {
    const titles = payments.get(i + 1);
    return titles ? { marked: true, dots: ['teal'], title: titles.join(', ') } : {};
  });
  return monthCalendar({ month, today: d.today, days, legend: [{ tone: 'teal', label: `Платежи в ${monthName(month, 'prepositional')}` }] });
}

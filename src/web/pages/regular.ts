// Regular expenses: the list to set them up, what they cost this month and its payment days.
// A row opens for editing by its link (?edit=id); its dates and icon fold under «Даты и иконка».
// Forms post to /regular, /regular/:id and /regular/:id/delete.
//
// PROTOTYPE: three ways to set the month's payments that are behind (their day has passed, or the expenses linked to
// them on /uncategorized have paid them) apart from those to come, switched by ?variant=A|B|C and the floating bar.
// A «Приглушить» keeps the order and quiets what is behind; B «Две группы» puts what is ahead first and what is behind
// under it; C «Лента» lists the month in order with a line at today.

import { mainCurrency } from '../../balances.ts';
import { addDays, dateOf, dayOfMonth, daysInMonth, monthOf } from '../../dates.ts';
import { listOperations, type Operation, type Sorting } from '../../ledger.ts';
import {
  nearestPayment,
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
import { dayMonth, dayMonthYear, fromToday, money, monthName, plural } from '../format.ts';
import { escape, Html } from '../html.ts';
import { categoryIcon, ENTRY_ICONS, entryIcon, isEntryIcon } from '../icons.ts';
import { categoryColor, toneColor } from '../tones.ts';
import { balanceTotal } from '../widgets/accounts.ts';
import { field, footnote, iconPicker, pageIntro, section } from '../widgets/basics.ts';
import { monthCalendar, type CalendarDay } from '../widgets/calendar.ts';
import { entryDivider, entryForm, entryList, entryRow } from '../widgets/entries.ts';
import type { Tone } from '../tones.ts';
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
  /** Expenses linked to a regular expense, from a month before the current one through its end, newest first. */
  linked: Operation[];
  form: RegularForm | null;
  symbol: string;
  userName: string | null;
  variant: Variant;
}

export function loadRegular(
  data: EntityCollections,
  saved: { categorizations: Sorting['categorizations']; regular: RegularExpense[] },
  options: { today: DateString; edit?: string | null; form?: RegularForm; variant?: string | null },
): RegularData {
  const expenses = saved.regular;
  const editing = expenses.find((e) => String(e.id) === options.edit);
  const month = monthOf(options.today);
  const range = { from: addDays(dateOf(month, 1), -31), to: dateOf(month, daysInMonth(month)) };
  return {
    today: options.today,
    expenses,
    linked: listOperations(data, range, saved).filter((o) => o.kind === 'expense' && o.regular !== null),
    form: options.form ?? (editing ? { id: editing.id, values: regularValues(editing), errors: {} } : null),
    symbol: mainCurrency(data).symbol,
    userName: userName(data),
    variant: VARIANTS.find((v) => v.key === options.variant?.toUpperCase()) ?? VARIANTS[0]!,
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
  const item = (e: RegularExpense): Html => (d.form?.id === e.id ? editForm(e, d.form, d.symbol, href) : row(e, d, href));
  const addForm = entryForm({
    action: href('/regular'),
    submitLabel: 'Добавить',
    icon: 'plus',
    color: toneColor('gray'),
    ...formFields(newForm ?? { values: EMPTY, errors: {} }, d.symbol),
  });

  const body = appShell({
    rail: appRail('regular', d.userName, href),
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: 'Регулярные траты', icon: 'repeat' }] }),
      pageIntro({ title: 'Регулярные траты', text: sentence(d) }),
      ...d.variant.list(d, item, addForm),
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

  const page = pageDocument({ title: 'Бюджет: регулярные траты', body });
  if (process.env.NODE_ENV === 'production') return page;
  return new Html(page.toString().replace('</body>', `${switcher(d.variant, href)}\n</body>`));
}

function sentence(d: RegularData): string {
  if (d.expenses.length === 0) {
    return 'Добавьте платежи, которые повторяются каждый месяц: аренду, кредит, связь. Они появятся в ближайших платежах на обзоре.';
  }
  const { total } = regularTotals(d.expenses, d.today);
  const month = monthName(d.today, 'prepositional');
  const statuses = d.expenses.map((e) => ({ expense: e, status: statusOf(e, d) }));
  const ahead = statuses.reduce(
    (sum, { expense, status }) => (status.kind === 'ahead' && monthOf(status.date) === monthOf(d.today) ? sum + expense.amount - status.covered : sum),
    0,
  );
  const next = statuses
    .flatMap(({ expense, status }) => (status.kind === 'ahead' ? [{ title: expense.title, date: status.date }] : []))
    .reduce<{ title: string; date: DateString } | null>((a, b) => (a === null || b.date < a.date ? b : a), null);
  if (total === 0) {
    const text = `В ${month} регулярных платежей нет.`;
    return next ? `${text} Ближайший — «${next.title}», ${dayMonthYear(next.date, d.today)}.` : text;
  }
  const text = `В ${month} на них уходит ${money(total, d.symbol)}.`;
  if (ahead === 0 || next === null) return `${text} Все платежи этого месяца уже позади.`;
  return `${text} Осталось заплатить ${money(ahead, d.symbol)}, ближайший платёж — «${next.title}», ${fromToday(next.date, d.today)}.`;
}

/**
 * Where the expense stands this month. Ahead: its payment of this month, today included, or its next one when this
 * month has none, with what linked expenses already cover of it. Past: this month's day has gone by. Paid: expenses
 * linked to it cover this month's payment, even before its day. Over: the payments have ended.
 */
type Status =
  | { kind: 'ahead'; date: DateString; covered: number }
  | { kind: 'past'; date: DateString }
  | { kind: 'paid'; date: DateString; on: DateString }
  | { kind: 'over' };

function statusOf(e: RegularExpense, d: RegularData): Status {
  const date = paymentDate(e, monthOf(d.today));
  if (date === null) {
    const next = nextPayment(e, d.today);
    return next === null ? { kind: 'over' } : { kind: 'ahead', date: next, covered: 0 };
  }
  const paid = d.linked.filter((o) => o.regular?.id === e.id && nearestPayment(e, o.date) === date);
  const covered = paid.reduce((sum, o) => sum + o.amount, 0);
  if (paid.length > 0 && covered >= e.amount - 0.005) return { kind: 'paid', date, on: paid[0]!.date };
  if (date < d.today) return { kind: 'past', date };
  return { kind: 'ahead', date, covered };
}

const isBehind = (s: Status): boolean => s.kind !== 'ahead';

/** When it happened, for ordering what is behind: the day it was paid, or its day. */
function happened(s: Status): string {
  return s.kind === 'paid' ? s.on : s.kind === 'past' ? s.date : '';
}

function row(e: RegularExpense, d: RegularData, href: Href): Html {
  const status = statusOf(e, d);
  return entryRow({
    title: e.title,
    details: details(e, status, d),
    icon: status.kind === 'paid' ? 'check' : entryIcon(e.icon, e.title),
    color: status.kind === 'paid' ? toneColor('green') : isBehind(status) ? toneColor('gray') : expenseColor(e),
    amount: e.amount,
    symbol: d.symbol,
    href: href('/regular', { edit: String(e.id) }),
    muted: isBehind(status),
  });
}

function details(e: RegularExpense, status: Status, d: RegularData): string {
  if (status.kind === 'paid') return `${e.day}-го числа · оплачено ${dayMonth(status.on)}`;
  if (status.kind === 'past') return `${e.day}-го числа · прошёл ${dayMonth(status.date)}`;
  if (status.kind === 'ahead' && status.covered > 0) {
    return `${e.day}-го числа · оплачено ${money(status.covered, d.symbol)} из ${money(e.amount, d.symbol)} · ${fromToday(status.date, d.today)}`;
  }
  return schedule(e, d.today);
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
  const payments = new Map<number, Array<{ text: string; tone: Tone }>>();
  for (const e of d.expenses) {
    const date = paymentDate(e, month);
    if (date === null) continue;
    const status = statusOf(e, d);
    const tone: Tone = status.kind === 'paid' ? 'green' : status.kind === 'past' ? 'gray' : 'teal';
    const day = dayOfMonth(date);
    payments.set(day, [...(payments.get(day) ?? []), { text: `${e.title} ${money(e.amount, d.symbol)}`, tone }]);
  }
  const days = Array.from({ length: 31 }, (_, i): CalendarDay => {
    const list = payments.get(i + 1);
    if (!list) return {};
    const dots = [...new Set(list.map((p) => p.tone))];
    return { marked: true, dots, title: list.map((p) => p.text).join(', ') };
  });
  const used = new Set([...payments.values()].flat().map((p) => p.tone));
  const legend = (
    [
      { tone: 'teal', label: 'Впереди' },
      { tone: 'green', label: 'Оплачено' },
      { tone: 'gray', label: 'Прошли' },
    ] as const
  ).filter((item) => used.has(item.tone));
  return monthCalendar({ month, today: d.today, days, legend: [...legend] });
}

// ---- PROTOTYPE: the variants and their switcher

interface Variant {
  key: string;
  name: string;
  /** The main column under the intro: the expenses, each a row or its open form, and the form to add one. */
  list: (d: RegularData, item: (e: RegularExpense) => Html, addForm: Html) => Html[];
}

/** A: the order stays by day of the month; what is behind is quieter and grey, what is paid gets a check. */
const variantA: Variant = {
  key: 'A',
  name: 'Приглушить',
  list: (d, item, addForm) => [entryList({ label: 'Регулярные траты', items: [...d.expenses.map(item), addForm] })],
};

/** B: what is ahead first, soonest on top, then what is behind this month in the order it happened. */
const variantB: Variant = {
  key: 'B',
  name: 'Две группы',
  list: (d, item, addForm) => {
    const { ahead, behind } = split(d);
    const month = monthName(d.today, 'prepositional');
    return [
      ahead.length > 0 ? section({ title: 'Впереди', body: entryList({ label: 'Впереди', items: ahead.map(item) }) }) : null,
      behind.length > 0 ? section({ title: `Уже прошли в ${month}`, body: entryList({ label: 'Уже прошли', items: behind.map(item) }) }) : null,
      entryList({ label: 'Новая регулярная трата', items: [addForm] }),
    ].filter((x): x is Html => x !== null);
  },
};

/** C: the month in the order things happen, with a line at today between what is behind and what is ahead. */
const variantC: Variant = {
  key: 'C',
  name: 'Лента',
  list: (d, item, addForm) => {
    const { ahead, behind } = split(d);
    return [
      entryList({
        label: 'Регулярные траты',
        items: [...behind.map(item), entryDivider({ label: `Сегодня, ${dayMonth(d.today)}` }), ...ahead.map(item), addForm],
      }),
    ];
  },
};

function split(d: RegularData): { ahead: RegularExpense[]; behind: RegularExpense[] } {
  const all = d.expenses.map((e) => ({ e, s: statusOf(e, d) }));
  const ahead = all.filter(({ s }) => s.kind === 'ahead').sort((a, b) => (a.s as { date: string }).date.localeCompare((b.s as { date: string }).date));
  const behind = all.filter(({ s }) => isBehind(s)).sort((a, b) => happened(a.s).localeCompare(happened(b.s)));
  return { ahead: ahead.map(({ e }) => e), behind: behind.map(({ e }) => e) };
}

const VARIANTS: Variant[] = [variantA, variantB, variantC];

function switcher(current: Variant, href: Href): string {
  const index = VARIANTS.indexOf(current);
  const hrefs = VARIANTS.map((v) => href('/regular', { variant: v.key }));
  const prev = hrefs[(index - 1 + VARIANTS.length) % VARIANTS.length]!;
  const next = hrefs[(index + 1) % VARIANTS.length]!;
  return `
<div id="proto-switcher" role="toolbar" aria-label="Варианты прототипа">
  <a href="${escape(prev)}" aria-label="Предыдущий вариант">‹</a>
  <span><b>${escape(current.key)}</b> ${escape(current.name)} <i>${index + 1}/${VARIANTS.length}</i></span>
  <a href="${escape(next)}" aria-label="Следующий вариант">›</a>
</div>
<style>
  #proto-switcher { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 2147483647; display: flex; align-items: center; gap: 4px;
    padding: 5px; border-radius: 999px; background: #1F4BFF; color: #fff; font: 500 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    box-shadow: 0 10px 30px -8px rgb(31 75 255 / .6), 0 0 0 3px rgb(255 255 255 / .9); }
  #proto-switcher a { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 999px; background: rgb(255 255 255 / .16); color: #fff; font-size: 18px; }
  #proto-switcher a:hover { background: rgb(255 255 255 / .28); }
  #proto-switcher span { padding: 0 10px; white-space: nowrap; }
  #proto-switcher b { display: inline-block; padding: 3px 6px; margin-right: 4px; border-radius: 6px; background: #fff; color: #1F4BFF; }
  #proto-switcher i { font-style: normal; opacity: .7; }
</style>
<script>
  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select')) return;
    if (event.key === 'ArrowLeft') location.href = ${JSON.stringify(prev)};
    if (event.key === 'ArrowRight') location.href = ${JSON.stringify(next)};
  });
</script>`;
}

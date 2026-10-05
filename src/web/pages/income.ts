// Incomes: the sources to set up, the payments they bring in the coming weeks with how each is worked out,
// and the payment days of this month. A new income starts from its model (?add=salary); a row opens for editing
// by its link (?edit=id). Forms post to /income, /income/:id and /income/:id/delete.

import { mainCurrency } from '../../balances.ts';
import { addDays, dateOf, dayOfMonth, daysInMonth, monthOf } from '../../dates.ts';
import {
  incomeModel,
  incomeValues,
  INCOME_MODEL_IDS,
  isIncomeModel,
  monthlyIncome,
  parseIncome,
  paymentsBetween,
  type Income,
  type IncomeModelId,
  type IncomeValues,
  type UpcomingPayment,
} from '../../income.ts';
import type { Settings } from '../../settings.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { fromToday, money, monthName, plural } from '../format.ts';
import type { Html } from '../html.ts';
import type { IconName } from '../icons.ts';
import { categoryColor, toneColor } from '../tones.ts';
import { balanceTotal } from '../widgets/accounts.ts';
import { emptyState, field, footnote, pageIntro, section, segmentedLinks } from '../widgets/basics.ts';
import { monthCalendar, type CalendarDay } from '../widgets/calendar.ts';
import { entryForm, entryList, entryRow } from '../widgets/entries.ts';
import { dayGroup, operationRow } from '../widgets/operations.ts';
import { appShell, stack, topBar } from '../widgets/shell.ts';
import { appRail, userName, type Href } from './chrome.ts';

/** A form on the page: an income open for editing, or a submission that failed and is shown again with its errors. */
export interface IncomeForm {
  /** null for a new income. */
  id: number | null;
  model: IncomeModelId;
  values: IncomeValues;
  errors: Record<string, string>;
}

export interface IncomeData {
  today: DateString;
  incomes: Income[];
  /** Payments from today through the next weeks. */
  upcoming: UpcomingPayment[];
  /** Payments dated in the current month, for the calendar. */
  thisMonth: UpcomingPayment[];
  form: IncomeForm | null;
  /** The model of the form for a new income. */
  adding: IncomeModelId;
  symbol: string;
  userName: string | null;
}

const UPCOMING_DAYS = 45;

export function loadIncome(
  data: EntityCollections,
  incomes: Income[],
  options: { today: DateString; edit?: string | null; add?: string | null; form?: IncomeForm },
): IncomeData {
  const { today } = options;
  const month = monthOf(today);
  const editing = incomes.find((i) => String(i.id) === options.edit);
  const form = options.form ?? (editing ? { id: editing.id, model: editing.model, values: incomeValues(editing), errors: {} } : null);
  return {
    today,
    incomes,
    upcoming: paymentsBetween(incomes, today, addDays(today, UPCOMING_DAYS)),
    thisMonth: paymentsBetween(incomes, dateOf(month, 1), dateOf(month, daysInMonth(month))),
    form,
    adding: form?.id === null ? form.model : isIncomeModel(options.add) ? options.add : 'fixed',
    symbol: mainCurrency(data).symbol,
    userName: userName(data),
  };
}

export type IncomeSubmission = { status: 'saved' } | { status: 'missing' } | { status: 'invalid'; form: IncomeForm };

/** Applies a form posted to /income (add), /income/:id (save) or /income/:id/delete. */
export function submitIncome(settings: Settings, path: string, body: URLSearchParams): IncomeSubmission {
  const match = /^\/income(?:\/(\d+)(\/delete)?)?$/.exec(path);
  if (!match) return { status: 'missing' };
  const id = match[1] === undefined ? null : Number(match[1]);
  const existing = id === null ? null : settings.incomes().find((i) => i.id === id);
  if (existing === undefined) return { status: 'missing' };
  if (existing && match[2]) {
    settings.deleteIncome(existing.id);
    return { status: 'saved' };
  }

  const model = existing?.model ?? body.get('model');
  if (!isIncomeModel(model)) return { status: 'missing' };
  const values: IncomeValues = { title: body.get('title') ?? '' };
  for (const f of incomeModel(model).fields) values[f.name] = body.get(f.name) ?? '';
  const parsed = parseIncome(model, values);
  if ('errors' in parsed) return { status: 'invalid', form: { id, model, values, errors: parsed.errors } };
  if (existing) settings.updateIncome(existing.id, parsed.income);
  else settings.addIncome(parsed.income);
  return { status: 'saved' };
}

export function renderIncome(d: IncomeData, href: Href): Html {
  const count = d.incomes.length;
  const newForm = d.form?.id === null ? d.form : null;
  const adding = incomeModel(d.adding);

  const body = appShell({
    rail: appRail('income', d.userName, href),
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: 'Доходы', icon: 'arrowDownLeft' }] }),
      pageIntro({ title: 'Доходы', text: sentence(d) }),
      count > 0 ? entryList({ label: 'Доходы', items: d.incomes.map((i) => (d.form?.id === i.id ? editForm(i, d.form, d.symbol, href) : row(i, d, href))) }) : null,
      d.upcoming.length > 0 ? section({ title: 'Ближайшие поступления', body: upcoming(d) }) : null,
      section({
        title: 'Новый доход',
        body: stack({
          gap: 12,
          items: [
            segmentedLinks({
              label: 'Как приходят деньги',
              items: INCOME_MODEL_IDS.map((m) => ({ label: incomeModel(m).title, href: href('/income', { add: m }), active: m === d.adding })),
            }),
            entryList({
              label: 'Новый доход',
              items: [
                entryForm({
                  action: href('/income'),
                  submitLabel: 'Добавить',
                  icon: 'plus',
                  color: toneColor('gray'),
                  hidden: { model: d.adding },
                  fields: fields(d.adding, newForm ?? { values: { title: '', ...adding.defaults }, errors: {} }, d.symbol),
                }),
              ],
            }),
          ],
        }),
      }),
    ],
    side: [
      topBar({ crumbs: [{ label: 'В месяц' }] }),
      balanceTotal({
        amount: monthlyIncome(d.incomes),
        symbol: d.symbol,
        note: count ? `из ${count} ${plural(count, ['источника', 'источников', 'источников'])}` : 'Доходов пока нет',
      }),
      calendar(d),
      footnote({
        text:
          'Аванс — зарплата × рабочие дни с 1 по 15 число / рабочие дни месяца, по производственному календарю. ' +
          'Если день выплаты зарплаты выпадает на выходной, деньги приходят в предыдущий рабочий день. ' +
          'Доходы хранятся в приложении, в data/settings.db.',
      }),
    ],
  });

  return pageDocument({ title: 'Бюджет: доходы', body });
}

function sentence(d: IncomeData): string {
  if (d.incomes.length === 0) {
    return 'Добавьте, откуда и когда приходят деньги: фиксированную сумму в определённое число или зарплату с авансом. Поступления появятся на обзоре.';
  }
  let text = `В месяц приходит ${money(monthlyIncome(d.incomes), d.symbol)}.`;
  const next = d.upcoming[0];
  if (next) {
    text += ` Ближайшее поступление — «${next.label ?? next.income.title}», ${money(next.amount, d.symbol)}, ${fromToday(next.date, d.today)}.`;
  }
  return text;
}

const ICONS: Record<IncomeModelId, IconName> = { fixed: 'banknote', salary: 'briefcase' };

function incomeColor(income: Income): string {
  return categoryColor(`income:${income.id}`, null);
}

function row(income: Income, d: IncomeData, href: Href): Html {
  const model = incomeModel(income.model);
  const next = d.upcoming.find((p) => p.income.id === income.id);
  return entryRow({
    title: income.title,
    details: [model.schedule(income.params), next ? fromToday(next.date, d.today) : ''].filter(Boolean).join(' · '),
    icon: ICONS[income.model],
    color: incomeColor(income),
    amount: model.monthly(income.params),
    symbol: d.symbol,
    href: href('/income', { edit: String(income.id) }),
  });
}

function editForm(income: Income, form: IncomeForm, symbol: string, href: Href): Html {
  return entryForm({
    action: href(`/income/${income.id}`),
    submitLabel: 'Сохранить',
    icon: ICONS[income.model],
    color: incomeColor(income),
    fields: fields(income.model, form, symbol),
    deleteAction: href(`/income/${income.id}/delete`),
    cancelHref: href('/income'),
  });
}

function fields(model: IncomeModelId, form: Pick<IncomeForm, 'values' | 'errors'>, symbol: string): Html[] {
  const { values, errors } = form;
  return [
    field({ label: 'Название', name: 'title', value: values.title, placeholder: 'Например, сдача квартиры', maxLength: 80, required: true, error: errors.title }),
    ...incomeModel(model).fields.map((f) =>
      f.kind === 'amount'
        ? field({ label: `${f.label}, ${symbol}`, name: f.name, type: 'decimal', value: values[f.name], placeholder: f.placeholder, width: 150, required: true, error: errors[f.name] })
        : field({ label: f.label, name: f.name, type: 'integer', min: 1, max: 31, value: values[f.name], placeholder: f.placeholder, width: 112, required: true, error: errors[f.name] }),
    ),
  ];
}

function upcoming(d: IncomeData): Html {
  const days = new Map<DateString, UpcomingPayment[]>();
  for (const p of d.upcoming) days.set(p.date, [...(days.get(p.date) ?? []), p]);
  return stack({
    gap: 18,
    items: [...days].map(([date, payments]) =>
      dayGroup({
        date,
        today: d.today,
        rows: payments.map((p) =>
          operationRow({
            title: p.label ?? p.income.title,
            details: p.label ? p.income.title : incomeModel(p.income.model).schedule(p.income.params),
            icon: ICONS[p.income.model],
            color: incomeColor(p.income),
            kind: 'income',
            amount: p.amount,
            symbol: d.symbol,
            comment: p.formula,
          }),
        ),
      }),
    ),
  });
}

/** The current month with its payment days marked; the tooltip lists what comes that day. */
function calendar(d: IncomeData): Html {
  if (d.incomes.length === 0) return emptyState({ text: 'Здесь появится календарь поступлений.' });
  const month = monthOf(d.today);
  const payments = new Map<number, string[]>();
  for (const p of d.thisMonth) {
    const day = dayOfMonth(p.date);
    payments.set(day, [...(payments.get(day) ?? []), `${p.label ?? p.income.title} ${money(p.amount, d.symbol)}`]);
  }
  const days = Array.from({ length: 31 }, (_, i): CalendarDay => {
    const titles = payments.get(i + 1);
    return titles ? { marked: true, dots: ['violet'], title: titles.join(', ') } : {};
  });
  return monthCalendar({ month, today: d.today, days, legend: [{ tone: 'violet', label: `Поступления в ${monthName(month, 'prepositional')}` }] });
}

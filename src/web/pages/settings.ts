// Settings: the budget and the categories expenses are sorted into. The budget is the day a week begins on, picked in
// one click, and weeks that allow another amount than the usual one, when something happened and the week has to do
// with less. ZenMoney's categories can be renamed or hidden, and the user adds their own; ZenMoney itself is never
// changed. They are listed in the order marking offers them, the most popular first; hidden ones go apart, under
// «Скрытые». A row opens for editing by ?edit=<category id>, ?edit=week-2026-10-12 or ?edit=new-week; forms post to
// /budget/week-start/:day, /budget/weeks, /budget/weeks/:week and /budget/weeks/:week/delete (see submitBudget), and
// to /categories, /categories/:id and /categories/:id/hide, /show or /delete (see submitSettings).

import { mainCurrency } from '../../balances.ts';
import { byPopularity, categoryCatalog, recentCount, type CategoryEntry } from '../../categories.ts';
import { amountText, parseAmount, parseTitle } from '../../input.ts';
import type { Settings } from '../../settings.ts';
import { WEEK_LIMIT, weekOf, type WeekStart } from '../../week.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { money, plural, weekLabel, WEEKDAYS, WEEKDAYS_ON } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryIcon } from '../icons.ts';
import { categoryColor, toneColor, type Tone } from '../tones.ts';
import { choiceGroup, emptyState, field, pageIntro, section, selectField } from '../widgets/basics.ts';
import { entryForm, entryList, entryRow } from '../widgets/entries.ts';
import { appShell, stack, topBar } from '../widgets/shell.ts';
import { appRail, userName, type Href } from './chrome.ts';
import { parseWeek, weekChoices, type SavedBudget } from './dashboard.ts';
import { allExpenses } from './marking.ts';

/** A category form shown again with its error after a submission failed; id is null for a new category. */
export interface CategoryForm {
  id: string | null;
  title: string;
  error: string;
}

/** A week's amount shown again with its error after a submission failed. */
export interface WeekLimitForm {
  /** The week as sent. */
  week: string;
  /** Sent from the form for another week rather than from a week's own row. */
  new: boolean;
  amount: string;
  error: string;
}

/** What the budget is set up with. */
export interface BudgetSetup {
  weekStart: WeekStart;
  /** The first day of the current week. */
  current: DateString;
  /** Weeks that allow another amount than WEEK_LIMIT, in the order of weeks. */
  weeks: Array<{ week: DateString; amount: number }>;
  symbol: string;
}

export interface SettingsData {
  budget: BudgetSetup;
  /** Categories most popular first, with how many expenses went into each lately. */
  categories: Array<{ category: CategoryEntry; count: number }>;
  /** The id of the category open for editing, week-<its first day> for a week's amount, or new-week. */
  edit: string | null;
  form: CategoryForm | null;
  weekForm: WeekLimitForm | null;
  userName: string | null;
}

/** What the settings show of the user's data: the budget's and the categories'. */
export type SavedSettings = Omit<SavedBudget, 'wishes'>;

export function loadBudgetSetup(data: EntityCollections, saved: Pick<SavedSettings, 'weekStart' | 'weekLimits'>, today: DateString): BudgetSetup {
  return {
    weekStart: saved.weekStart,
    current: weekOf(today, saved.weekStart),
    weeks: [...saved.weekLimits].map(([week, amount]) => ({ week, amount })).sort((a, b) => a.week.localeCompare(b.week)),
    symbol: mainCurrency(data).symbol,
  };
}

export function loadSettingsPage(
  data: EntityCollections,
  saved: SavedSettings,
  options: { today: DateString; edit?: string | null; form?: CategoryForm; weekForm?: WeekLimitForm },
): SettingsData {
  const expenses = allExpenses(data, saved);
  const categories = byPopularity(categoryCatalog(data.tag ?? [], saved.categories), expenses, options.today);
  const weekForm = options.weekForm ?? null;
  return {
    budget: loadBudgetSetup(data, saved, options.today),
    categories: categories.map((category) => ({ category, count: recentCount(category, expenses, options.today) })),
    edit: options.form?.id ?? (weekForm ? (weekForm.new ? 'new-week' : `week-${weekForm.week}`) : null) ?? options.edit ?? null,
    form: options.form ?? null,
    weekForm,
    userName: userName(data),
  };
}

export type BudgetSubmission = { status: 'saved' } | { status: 'missing' } | { status: 'invalid'; form: WeekLimitForm };

/**
 * Applies a form posted to /budget/week-start/:day (0 for Monday), /budget/weeks (a week and its amount),
 * /budget/weeks/:week (its amount) or /budget/weeks/:week/delete (the usual amount back). A week given the usual
 * amount has no amount of its own.
 */
export function submitBudget(settings: Settings, path: string, body: URLSearchParams, today: DateString): BudgetSubmission {
  const start = /^\/budget\/week-start\/([0-6])$/.exec(path);
  if (start) {
    settings.setWeekStart(Number(start[1]));
    return { status: 'saved' };
  }
  const match = /^\/budget\/weeks(?:\/(\d{4}-\d{2}-\d{2})(?:\/(delete))?)?$/.exec(path);
  if (!match) return { status: 'missing' };
  const [, own, action] = match;
  if (own !== undefined && !settings.weekLimits().has(own)) return { status: 'missing' };
  if (own !== undefined && action === 'delete') {
    settings.setWeekLimit(own, null);
    return { status: 'saved' };
  }
  const weekStart = settings.weekStart();
  const sent = body.get('week') ?? '';
  const week = own ?? (parseWeek(sent, weekOf(today, weekStart), weekStart) === sent ? sent : null);
  const text = body.get('amount') ?? '';
  const amount = parseAmount(text);
  if (week === null || 'error' in amount) {
    return { status: 'invalid', form: { week: own ?? sent, new: own === undefined, amount: text, error: 'error' in amount ? amount.error : 'Выберите неделю' } };
  }
  settings.setWeekLimit(week, amount.value === WEEK_LIMIT ? null : amount.value);
  return { status: 'saved' };
}

export type SettingsSubmission = { status: 'saved' } | { status: 'missing' } | { status: 'invalid'; form: CategoryForm };

/**
 * Applies a form posted to /categories (add one of the user's own), /categories/:id (rename), /categories/:id/hide,
 * /categories/:id/show or /categories/:id/delete (only the user's own). A ZenMoney category saved with ZenMoney's
 * title or none takes ZenMoney's title back.
 */
export function submitSettings(settings: Settings, data: EntityCollections, path: string, body: URLSearchParams): SettingsSubmission {
  const match = /^\/categories(?:\/([\w-]+)(?:\/(hide|show|delete))?)?$/.exec(path);
  if (!match) return { status: 'missing' };
  const [, id, action] = match;
  const text = body.get('title') ?? '';

  if (id === undefined) {
    const title = parseTitle(text);
    if ('error' in title) return { status: 'invalid', form: { id: null, title: text, error: title.error } };
    settings.addOwnCategory(title.value);
    return { status: 'saved' };
  }

  const category = categoryCatalog(data.tag ?? [], settings.categorySetup()).find((c) => c.id === id);
  if (!category) return { status: 'missing' };
  if (action === 'hide' || action === 'show') {
    settings.hideCategory(category.id, action === 'hide');
    return { status: 'saved' };
  }
  if (action === 'delete') return category.zenmoneyTitle === null && settings.deleteOwnCategory(category.id) ? { status: 'saved' } : { status: 'missing' };

  if (category.zenmoneyTitle !== null && (text.trim() === '' || text.trim() === category.zenmoneyTitle)) {
    settings.renameCategory(category.id, null);
    return { status: 'saved' };
  }
  const title = parseTitle(text);
  if ('error' in title) return { status: 'invalid', form: { id: category.id, title: text, error: title.error } };
  settings.renameCategory(category.id, title.value);
  return { status: 'saved' };
}

export function renderSettings(d: SettingsData, href: Href): Html {
  const shown = d.categories.filter((c) => !c.category.hidden);
  const hidden = d.categories.filter((c) => c.category.hidden);
  const item = ({ category, count }: SettingsData['categories'][number]): Html =>
    d.edit === category.id ? categoryForm(d, category, href) : categoryRow(category, count, href);
  const newForm = d.form?.id === null ? d.form : null;

  const body = appShell({
    rail: appRail('settings', d.userName, href),
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: 'Настройки', icon: 'sliders' }] }),
      pageIntro({ title: 'Настройки', text: `${budgetSentence(d.budget)} ${settingsSentence(d)}` }),
      section({ title: 'Бюджет', body: budgetSection(d, href) }),
      section({
        title: 'Категории',
        body: [
          shown.length === 0 ? emptyState({ text: 'Все категории скрыты: при разметке выбирать не из чего.' }) : null,
          entryList({
            label: 'Категории',
            items: [
              ...shown.map(item),
              entryForm({
                id: 'category-new',
                action: href('/categories'),
                submitLabel: 'Добавить',
                icon: 'plus',
                color: toneColor('gray'),
                fields: field({ label: 'Новая категория', name: 'title', value: newForm?.title, placeholder: 'Например, дети', maxLength: 80, required: true, error: newForm?.error }),
              }),
            ],
          }),
        ],
      }),
      hidden.length > 0 ? section({ title: 'Скрытые', body: entryList({ label: 'Скрытые категории', items: hidden.map(item) }) }) : null,
    ],
  });
  return pageDocument({ title: 'Бюджет: настройки', body });
}

export function budgetSentence(b: BudgetSetup): string {
  return `Неделя начинается ${WEEKDAYS_ON[b.weekStart]}: в этот день обновляются ${money(WEEK_LIMIT, b.symbol)} на обычные траты. Если что-то случилось и неделе нужно ужаться, ей можно дать другую сумму.`;
}

export function settingsSentence(d: SettingsData): string {
  const zenmoney = d.categories.filter((c) => c.category.zenmoneyTitle !== null).length;
  const own = d.categories.length - zenmoney;
  const hidden = d.categories.filter((c) => c.category.hidden).length;
  const parts = [
    `${zenmoney} ${plural(zenmoney, ['категория', 'категории', 'категорий'])} из ZenMoney`,
    own > 0 ? `${own} ${plural(own, ['своя', 'свои', 'своих'])}` : null,
  ].filter(Boolean);
  const head = `${parts.join(' и ')}${hidden > 0 ? `, ${hidden} ${plural(hidden, ['скрыта', 'скрыты', 'скрыто'])}` : ''}.`;
  return `${head} При разметке трат они идут в этом порядке: сначала те, куда трат больше всего за три месяца. В ZenMoney ничего не меняется.`;
}

/** The day a week begins on, in one click, and the weeks with an amount of their own, each opening to change it. */
function budgetSection(d: SettingsData, href: Href): Html {
  const b = d.budget;
  return stack({
    gap: 14,
    items: [
      choiceGroup({
        label: 'Неделя начинается',
        choices: WEEKDAYS.map((label, day) => ({ label, current: day === b.weekStart, action: href(`/budget/week-start/${day}`) })),
      }),
      entryList({
        label: 'Бюджет недель',
        items: [...b.weeks.map((w) => (d.edit === `week-${w.week}` ? weekLimitForm(d, w, href) : weekLimitRow(b, w, href))), newWeekLimit(d, href)],
      }),
    ],
  });
}

/** What a week's row says: whether it is over, on or ahead, and the usual amount it replaces; past ones are muted. */
export function weekLimitLine(b: BudgetSetup, week: DateString): { details: string; tone: Tone; muted: boolean } {
  const phase = week < b.current ? 'прошла' : week === b.current ? 'идёт' : 'впереди';
  return { details: `${phase} · вместо ${money(WEEK_LIMIT, b.symbol)}`, tone: week < b.current ? 'gray' : 'violet', muted: week < b.current };
}

function weekLimitRow(b: BudgetSetup, w: BudgetSetup['weeks'][number], href: Href): Html {
  const line = weekLimitLine(b, w.week);
  return entryRow({
    id: `week-${w.week}`,
    title: `Неделя ${weekLabel(w.week)}`,
    details: line.details,
    icon: 'calendar',
    color: toneColor(line.tone),
    amount: w.amount,
    symbol: b.symbol,
    href: href('/settings', { edit: `week-${w.week}` }),
    muted: line.muted,
  });
}

function weekLimitForm(d: SettingsData, w: BudgetSetup['weeks'][number], href: Href): Html {
  const b = d.budget;
  const form = d.weekForm && !d.weekForm.new && d.weekForm.week === w.week ? d.weekForm : null;
  return entryForm({
    id: `week-${w.week}`,
    action: href(`/budget/weeks/${w.week}`),
    submitLabel: 'Сохранить',
    icon: 'calendar',
    color: toneColor(weekLimitLine(b, w.week).tone),
    fields: amountField(`Неделя ${weekLabel(w.week)}, ${b.symbol}`, form?.amount ?? amountText(w.amount), form?.error, null),
    extraActions: [{ label: `Вернуть ${money(WEEK_LIMIT, b.symbol)}`, action: href(`/budget/weeks/${w.week}/delete`) }],
    cancelHref: href('/settings'),
  });
}

/** A row that opens the form for another week's amount, this week's unless another is picked. */
function newWeekLimit(d: SettingsData, href: Href): Html {
  const b = d.budget;
  if (d.edit !== 'new-week') {
    return entryRow({
      id: 'new-week',
      title: 'Изменить бюджет недели',
      details: 'неделя и сумма',
      icon: 'plus',
      color: toneColor('gray'),
      href: href('/settings', { edit: 'new-week' }),
    });
  }
  const form = d.weekForm?.new ? d.weekForm : null;
  return entryForm({
    id: 'new-week',
    action: href('/budget/weeks'),
    submitLabel: 'Сохранить',
    icon: 'plus',
    color: toneColor('gray'),
    fields: [
      selectField({ label: 'Неделя', name: 'week', value: form?.week ?? b.current, width: 210, groups: weekChoices(b.current) }),
      amountField(`Сумма, ${b.symbol}`, form?.amount ?? '', form?.error, 130),
    ],
    cancelHref: href('/settings'),
  });
}

/** The amount of a week; with no width it takes the row, as the only field of a week's own form. */
function amountField(label: string, value: string, error: string | undefined, width: number | null): Html {
  return field({ label, name: 'amount', type: 'decimal', value, placeholder: '30 000', width: width ?? undefined, required: true, error });
}

/** Where a category comes from and how many expenses went into it lately. */
export function categoryDetails(c: CategoryEntry, count: number): string {
  const origin = c.zenmoneyTitle === null ? 'своя' : c.name === c.zenmoneyTitle ? 'из ZenMoney' : `в ZenMoney «${c.zenmoneyTitle}»`;
  return `${origin} · ${count > 0 ? `${count} ${plural(count, ['трата', 'траты', 'трат'])} за три месяца` : 'за три месяца трат нет'}`;
}

function categoryRow(c: CategoryEntry, count: number, href: Href): Html {
  return entryRow({
    id: `category-${c.id}`,
    title: c.title,
    details: categoryDetails(c, count),
    icon: categoryIcon(c.title),
    color: c.hidden ? toneColor('gray') : categoryColor(c.id, c.color),
    href: href('/settings', { edit: c.id }),
    muted: c.hidden,
  });
}

function categoryForm(d: SettingsData, c: CategoryEntry, href: Href): Html {
  const form = d.form?.id === c.id ? d.form : null;
  return entryForm({
    id: `category-${c.id}`,
    action: href(`/categories/${c.id}`),
    submitLabel: 'Сохранить',
    icon: categoryIcon(c.title),
    color: categoryColor(c.id, c.color),
    fields: field({
      label: c.zenmoneyTitle === null ? 'Название' : `Название, в ZenMoney «${c.zenmoneyTitle}»`,
      name: 'title',
      value: form?.title ?? c.name,
      placeholder: c.zenmoneyTitle ?? '',
      maxLength: 80,
      required: c.zenmoneyTitle === null,
      error: form?.error,
    }),
    extraActions: [{ label: c.hidden ? 'Показать' : 'Скрыть', action: href(`/categories/${c.id}/${c.hidden ? 'show' : 'hide'}`) }],
    deleteAction: c.zenmoneyTitle === null ? href(`/categories/${c.id}/delete`) : undefined,
    cancelHref: href('/settings'),
  });
}

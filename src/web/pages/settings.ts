// Settings: the day a week begins on, the user's own name in transfers to themselves, and the categories expenses are
// sorted into. The day is picked in one click and posts to /budget/week-start/:day; the name opens by ?edit=self-payee
// and posts to /budget/self-payee (see submitBudget). The amount of one week is changed on the week itself (see
// dashboard.ts). ZenMoney's categories can be renamed or hidden, and the user adds their own; ZenMoney itself is
// never changed. They are listed in the order marking offers them, the most popular first; hidden ones go apart,
// under «Скрытые». A row opens for editing by ?edit=<category id>; forms post to /categories, /categories/:id and
// /categories/:id/hide, /show or /delete (see submitSettings).

import { mainCurrency } from '../../balances.ts';
import { byPopularity, categoryCatalog, recentCount, type CategoryEntry } from '../../categories.ts';
import { parseTitle } from '../../input.ts';
import type { Settings } from '../../settings.ts';
import { WEEK_LIMIT, type WeekStart } from '../../week.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { money, plural, WEEKDAYS, WEEKDAYS_ON } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryIcon } from '../icons.ts';
import { categoryColor, toneColor } from '../tones.ts';
import { choiceGroup, emptyState, field, pageIntro, section } from '../widgets/basics.ts';
import { entryForm, entryList, entryRow } from '../widgets/entries.ts';
import { appShell, stack, topBar } from '../widgets/shell.ts';
import { appRail, userName, type Href } from './chrome.ts';
import { allExpenses, type SavedMarking } from './marking.ts';

/** A category form shown again with its error after a submission failed; id is null for a new category. */
export interface CategoryForm {
  id: string | null;
  title: string;
  error: string;
}

/** What the budget is set up with. */
export interface BudgetSetup {
  weekStart: WeekStart;
  /** The user's own name in transfers to their accounts in other banks; the month review sets those apart. */
  selfPayee: string | null;
  symbol: string;
}

export interface SettingsData {
  budget: BudgetSetup;
  /** Categories most popular first, with how many expenses went into each lately. */
  categories: Array<{ category: CategoryEntry; count: number }>;
  /** The id of the category open for editing. */
  edit: string | null;
  form: CategoryForm | null;
  userName: string | null;
}

export function loadBudgetSetup(data: EntityCollections, saved: Pick<SavedMarking, 'weekStart' | 'selfPayee'>): BudgetSetup {
  return { weekStart: saved.weekStart, selfPayee: saved.selfPayee ?? null, symbol: mainCurrency(data).symbol };
}

export function loadSettingsPage(
  data: EntityCollections,
  saved: SavedMarking,
  options: { today: DateString; edit?: string | null; form?: CategoryForm },
): SettingsData {
  const expenses = allExpenses(data, saved);
  const categories = byPopularity(categoryCatalog(data.tag ?? [], saved.categories), expenses, options.today);
  return {
    budget: loadBudgetSetup(data, saved),
    categories: categories.map((category) => ({ category, count: recentCount(category, expenses, options.today) })),
    edit: options.form?.id ?? options.edit ?? null,
    form: options.form ?? null,
    userName: userName(data),
  };
}

/**
 * Applies a form posted to /budget/week-start/:day, 0 for Monday to 6 for Sunday, or to /budget/self-payee with the
 * user's name in `name`; an empty name forgets it.
 */
export function submitBudget(settings: Settings, path: string, body: URLSearchParams = new URLSearchParams()): { status: 'saved' } | { status: 'missing' } {
  if (path === '/budget/self-payee') {
    const name = (body.get('name') ?? '').trim().slice(0, 80);
    settings.setSelfPayee(name || null);
    return { status: 'saved' };
  }
  const start = /^\/budget\/week-start\/([0-6])$/.exec(path);
  if (!start) return { status: 'missing' };
  settings.setWeekStart(Number(start[1]));
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
      section({
        title: 'Бюджет',
        body: stack({
          gap: 16,
          items: [
            weekStartChoice(d.budget, href),
            entryList({ label: 'Переводы себе', items: [d.edit === 'self-payee' ? selfPayeeForm(d.budget, href) : selfPayeeRow(d.budget, href)] }),
          ],
        }),
      }),
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
  return `Неделя начинается ${WEEKDAYS_ON[b.weekStart]}: в этот день обновляются ${money(WEEK_LIMIT, b.symbol)} на обычные траты. Если неделе нужно ужаться, её бюджет меняют на странице недели.`;
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

/** The day a week begins on, picked in one click. */
function weekStartChoice(b: BudgetSetup, href: Href): Html {
  return choiceGroup({
    label: 'Неделя начинается',
    choices: WEEKDAYS.map((label, day) => ({ label, current: day === b.weekStart, action: href(`/budget/week-start/${day}`) })),
  });
}

/** The user's own name in transfers to themselves; the row opens a form to change it. */
function selfPayeeRow(b: BudgetSetup, href: Href): Html {
  return entryRow({
    id: 'self-payee',
    title: 'Переводы себе',
    details: b.selfPayee ? `приходят на имя ${b.selfPayee}` : 'имя не указано',
    icon: 'card',
    color: toneColor('violet'),
    href: href('/settings', { edit: 'self-payee' }),
  });
}

function selfPayeeForm(b: BudgetSetup, href: Href): Html {
  return entryForm({
    id: 'self-payee',
    action: href('/budget/self-payee'),
    submitLabel: 'Сохранить',
    icon: 'card',
    color: toneColor('violet'),
    fields: field({ label: 'Ваше имя, как его пишет банк в переводах себе в другие банки', name: 'name', value: b.selfPayee ?? '', placeholder: 'Иван И.', maxLength: 80 }),
    cancelHref: href('/settings'),
  });
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

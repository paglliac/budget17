// Settings, on two tabs: «Основные» here and «Магазины» (see shops.ts). The main tab has the day a week begins on,
// round figures on the app's main page, the user's own name in transfers to themselves, the token Claude signs in by,
// and the categories expenses and incomes are sorted into. The day is picked in one click and posts to
// /budget/week-start/:day, round figures to /budget/round-figures/on or /off; the name opens by ?edit=self-payee and
// posts to /budget/self-payee, the token by ?edit=claude-token to /budget/claude-token, and only its last characters
// are ever shown (see submitBudget). The amount of one week is changed on the week itself (see dashboard.ts).
// ZenMoney's categories can be renamed or hidden, and the user adds their own; ZenMoney
// itself is never changed. They are listed in the order marking offers them, the most popular first, the incomes'
// apart; hidden ones go together under «Скрытые». A row opens for editing by ?edit=<category id>, or
// income-<category id> for an income category, since one ZenMoney category may sort both; forms post to /categories
// (with kind income for an income category), /categories/:id and /categories/:id/hide, /show or /delete (see
// submitSettings).

import { mainCurrency } from '../../balances.ts';
import { byPopularity, categoryCatalog, recentCount, type CategoryEntry, type CategoryKind, type CategoryLook, type CategoryPhoto } from '../../categories.ts';
import { parsePhoto, parseTitle } from '../../input.ts';
import type { Settings } from '../../settings.ts';
import { WEEK_LIMIT, type WeekStart } from '../../week.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { money, plural, WEEKDAYS, WEEKDAYS_ON } from '../format.ts';
import type { Html } from '../html.ts';
import { CATEGORY_ICONS, isCategoryIcon } from '../icons.ts';
import { autoLook, CATEGORY_COLORS, categoryLook, isCategoryColor } from '../looks.ts';
import { categoryColor, toneColor } from '../tones.ts';
import { choiceGroup, colorPicker, emptyState, field, iconPicker, pageIntro, photoField, section } from '../widgets/basics.ts';
import { entryForm, entryList, entryRow } from '../widgets/entries.ts';
import { appShell, stack, topBar } from '../widgets/shell.ts';
import { appRail, settingsTabs, userName, type Href } from './chrome.ts';
import { allExpenses, allIncomes, type SavedMarking } from './marking.ts';

/** A category form shown again with its errors after a submission failed; id is null for a new category. */
export interface CategoryForm {
  id: string | null;
  kind: CategoryKind;
  title: string;
  /** The icon and colour as picked; empty for the ones the category would have. */
  icon: string;
  color: string;
  errors: Partial<Record<'title' | 'photo', string>>;
}

/** A category with how many operations went into it lately, and the icon and colour the user picked for it. */
export interface CategoryCount {
  category: CategoryEntry;
  kind: CategoryKind;
  count: number;
  picked: Pick<CategoryLook, 'icon' | 'color'> | null;
}

/** What the budget is set up with. */
export interface BudgetSetup {
  weekStart: WeekStart;
  /** The app's main page shows its figures to the hundred, its parts still adding up to the whole (see roundParts). */
  roundFigures: boolean;
  /** The user's own name in transfers to their accounts in other banks; the month review sets those apart. */
  selfPayee: string | null;
  symbol: string;
}

export interface SettingsData {
  budget: BudgetSetup;
  /** The last characters of the token Claude signs in by; null when none is set. */
  claudeToken: string | null;
  /** Categories most popular first, with how many expenses went into each lately. */
  categories: CategoryCount[];
  /** Income categories the same way. */
  incomeCategories: CategoryCount[];
  /** The category open for editing, as categoryKey gives it. */
  edit: string | null;
  form: CategoryForm | null;
  userName: string | null;
}

export function loadBudgetSetup(data: EntityCollections, saved: Pick<SavedMarking, 'weekStart' | 'selfPayee' | 'roundFigures'>): BudgetSetup {
  return { weekStart: saved.weekStart, roundFigures: saved.roundFigures ?? false, selfPayee: saved.selfPayee ?? null, symbol: mainCurrency(data).symbol };
}

export function loadSettingsPage(
  data: EntityCollections,
  saved: SavedMarking,
  options: { today: DateString; edit?: string | null; form?: CategoryForm; claudeToken?: string | null },
): SettingsData {
  const counted = (kind: CategoryKind, operations: ReturnType<typeof allExpenses>): CategoryCount[] =>
    byPopularity(categoryCatalog(data.tag ?? [], saved.categories, kind), operations, options.today).map((category) => ({
      category,
      kind,
      count: recentCount(category, operations, options.today),
      picked: saved.categories.looks?.get(category.id) ?? null,
    }));
  const form = options.form;
  return {
    budget: loadBudgetSetup(data, saved),
    claudeToken: options.claudeToken ? options.claudeToken.slice(-TOKEN_SHOWN) : null,
    categories: counted('expense', allExpenses(data, saved)),
    incomeCategories: counted('income', allIncomes(data, saved)),
    edit: form?.id ? categoryKey(form.id, form.kind) : (options.edit ?? null),
    form: options.form ?? null,
    userName: userName(data),
  };
}

/** How many last characters of the Claude token the page shows, to tell which one is set. */
const TOKEN_SHOWN = 4;
const TOKEN_MAX = 500;

/**
 * Applies a form posted to /budget/week-start/:day, 0 for Monday to 6 for Sunday, to /budget/round-figures/on or
 * /budget/round-figures/off, to /budget/self-payee with the
 * user's name in `name`, an empty name forgetting it, or to /budget/claude-token with the token in `token`, spaces and
 * line breaks of a paste taken out; an empty one changes nothing, and /budget/claude-token/delete forgets it.
 */
export function submitBudget(settings: Settings, path: string, body: URLSearchParams = new URLSearchParams()): { status: 'saved' } | { status: 'missing' } {
  if (path === '/budget/self-payee') {
    const name = (body.get('name') ?? '').trim().slice(0, 80);
    settings.setSelfPayee(name || null);
    return { status: 'saved' };
  }
  if (path === '/budget/claude-token') {
    const token = (body.get('token') ?? '').replace(/\s+/g, '').slice(0, TOKEN_MAX);
    if (token) settings.setClaudeToken(token);
    return { status: 'saved' };
  }
  if (path === '/budget/claude-token/delete') {
    settings.setClaudeToken(null);
    return { status: 'saved' };
  }
  const round = /^\/budget\/round-figures\/(on|off)$/.exec(path);
  if (round) {
    settings.setRoundFigures(round[1] === 'on');
    return { status: 'saved' };
  }
  const start = /^\/budget\/week-start\/([0-6])$/.exec(path);
  if (!start) return { status: 'missing' };
  settings.setWeekStart(Number(start[1]));
  return { status: 'saved' };
}

export type SettingsSubmission = { status: 'saved' } | { status: 'missing' } | { status: 'invalid'; form: CategoryForm };

/**
 * Applies a form posted to /categories (add one of the user's own, for incomes with `kind` income), /categories/:id
 * (rename and dress), /categories/:id/hide, /categories/:id/show, /categories/:id/photo/delete or
 * /categories/:id/delete (only the user's own). A ZenMoney category saved with ZenMoney's title or none takes
 * ZenMoney's title back. `kind` says which list a form came from, so an error shows there. The icon and colour change
 * only when the form has them, so an older app that sends just the title keeps them; an empty one takes the category's
 * own back. `color` custom takes the colour from `color-custom`. A `photo` puts a photo on the category, an empty one
 * takes it off.
 */
export function submitSettings(settings: Settings, data: EntityCollections, path: string, body: URLSearchParams): SettingsSubmission {
  const match = /^\/categories(?:\/([\w-]+)(?:\/(hide|show|delete|photo\/delete))?)?$/.exec(path);
  if (!match) return { status: 'missing' };
  const [, id, action] = match;
  const text = body.get('title') ?? '';
  const kind: CategoryKind = body.get('kind') === 'income' ? 'income' : 'expense';
  const look = lookForm(body);
  const invalid = (category: string | null, errors: CategoryForm['errors']): SettingsSubmission => ({
    status: 'invalid',
    form: { id: category, kind, title: text, icon: look.look?.icon ?? '', color: look.look?.color ?? '', errors },
  });
  const dress = (category: string) => {
    if (look.look) settings.dressCategory(category, look.look);
    if (look.photo !== undefined) settings.setCategoryPhoto(category, look.photo);
  };
  const photoError = look.photoError ? { photo: look.photoError } : {};

  if (id === undefined) {
    const title = parseTitle(text);
    if ('error' in title || 'photo' in photoError) return invalid(null, { ...('error' in title ? { title: title.error } : {}), ...photoError });
    dress(settings.addOwnCategory(title.value, kind).id);
    return { status: 'saved' };
  }

  const setup = settings.categorySetup();
  const category = [...categoryCatalog(data.tag ?? [], setup, kind), ...categoryCatalog(data.tag ?? [], setup, kind === 'income' ? 'expense' : 'income')].find(
    (c) => c.id === id,
  );
  if (!category) return { status: 'missing' };
  if (action === 'hide' || action === 'show') {
    settings.hideCategory(category.id, action === 'hide');
    return { status: 'saved' };
  }
  if (action === 'photo/delete') {
    settings.setCategoryPhoto(category.id, null);
    return { status: 'saved' };
  }
  if (action === 'delete') return category.zenmoneyTitle === null && settings.deleteOwnCategory(category.id) ? { status: 'saved' } : { status: 'missing' };

  const original = category.zenmoneyTitle !== null && (text.trim() === '' || text.trim() === category.zenmoneyTitle);
  const title = original ? { value: null } : parseTitle(text);
  if ('error' in title || 'photo' in photoError) return invalid(category.id, { ...('error' in title ? { title: title.error } : {}), ...photoError });
  settings.renameCategory(category.id, title.value);
  dress(category.id);
  return { status: 'saved' };
}

/**
 * The icon, colour and photo a category form asks for: `look` when the form has an icon or a colour, null of either
 * for the category's own; `photo` when it has a photo, null to take it off, and what is wrong with a photo that will
 * not do.
 */
function lookForm(body: URLSearchParams): { look: Pick<CategoryLook, 'icon' | 'color'> | null; photo?: CategoryPhoto | null; photoError?: string } {
  const icon = body.get('icon');
  const picked = body.get('color') === 'custom' ? body.get('color-custom') : body.get('color');
  const color = picked && isCategoryColor(picked) ? (picked.startsWith('#') ? picked.toUpperCase() : picked) : null;
  const look = body.has('icon') || body.has('color') ? { icon: isCategoryIcon(icon) ? icon : null, color } : null;
  if (!body.has('photo')) return { look };
  const text = body.get('photo') ?? '';
  if (text === '') return { look, photo: null };
  const photo = parsePhoto(text);
  return 'error' in photo ? { look, photoError: photo.error } : { look, photo: photo.value };
}

/** Which category a row is, for ?edit=: its id, or income-<id> in the income list. */
export function categoryKey(id: string, kind: CategoryKind): string {
  return kind === 'income' ? `income-${id}` : id;
}

export function renderSettings(d: SettingsData, href: Href): Html {
  // A ZenMoney category may sort both expenses and incomes; hidden, it shows once.
  const all = [...d.categories, ...d.incomeCategories];
  const hidden = all.filter((c, i) => c.category.hidden && all.findIndex((other) => other.category.id === c.category.id) === i);
  const item = (c: CategoryCount): Html => (d.edit === categoryKey(c.category.id, c.kind) ? categoryForm(d, c, href) : categoryRow(c, href));
  const list = (kind: CategoryKind, items: CategoryCount[]) => {
    const shown = items.filter((c) => !c.category.hidden);
    const form = d.form?.id === null && d.form.kind === kind ? d.form : null;
    const income = kind === 'income';
    return [
      shown.length === 0 && items.length > 0 ? emptyState({ text: 'Все категории скрыты: при разметке выбирать не из чего.' }) : null,
      entryList({
        label: income ? 'Категории доходов' : 'Категории расходов',
        items: [
          ...shown.map(item),
          entryForm({
            id: income ? 'income-category-new' : 'category-new',
            action: href('/categories'),
            submitLabel: 'Добавить',
            icon: 'plus',
            color: toneColor('gray'),
            hidden: income ? { kind } : undefined,
            fields: field({
              label: 'Новая категория',
              name: 'title',
              value: form?.title,
              placeholder: income ? 'Например, кэшбэк' : 'Например, дети',
              maxLength: 80,
              required: true,
              error: form?.errors.title,
            }),
          }),
        ],
      }),
    ];
  };

  const body = appShell({
    rail: appRail('settings', d.userName, href),
    tabs: settingsTabs('main', href),
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: 'Настройки', icon: 'sliders' }] }),
      pageIntro({ title: 'Настройки', text: `${budgetSentence(d.budget)} ${settingsSentence(d)}` }),
      section({
        title: 'Бюджет',
        body: stack({
          gap: 16,
          items: [
            weekStartChoice(d.budget, href),
            roundFiguresChoice(d.budget, href),
            entryList({ label: 'Переводы себе', items: [d.edit === 'self-payee' ? selfPayeeForm(d.budget, href) : selfPayeeRow(d.budget, href)] }),
          ],
        }),
      }),
      section({ title: 'Claude', body: entryList({ label: 'Claude', items: [d.edit === 'claude-token' ? claudeTokenForm(d, href) : claudeTokenRow(d, href)] }) }),
      section({ title: 'Категории расходов', body: list('expense', d.categories) }),
      section({ title: 'Категории доходов', body: list('income', d.incomeCategories) }),
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
  const incomes = d.incomeCategories.length;
  const income = `У доходов свои категории${incomes > 0 ? `, их ${incomes}` : ''}.`;
  return `${head} При разметке трат они идут в этом порядке: сначала те, куда трат больше всего за три месяца. ${income} В ZenMoney ничего не меняется.`;
}

/** The day a week begins on, picked in one click. */
function weekStartChoice(b: BudgetSetup, href: Href): Html {
  return choiceGroup({
    label: 'Неделя начинается',
    choices: WEEKDAYS.map((label, day) => ({ label, current: day === b.weekStart, action: href(`/budget/week-start/${day}`) })),
  });
}

/** Round figures on the app's main page, a switch: clicking it again turns it off. */
function roundFiguresChoice(b: BudgetSetup, href: Href): Html {
  return choiceGroup({
    label: 'Главная приложения',
    choices: [{ label: 'Круглые цифры', detail: 'до сотен', current: b.roundFigures, toggle: true, action: href(`/budget/round-figures/${b.roundFigures ? 'off' : 'on'}`) }],
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

/** Whether a Claude token is set, by its last characters; the row opens a form to set another or forget it. */
function claudeTokenRow(d: SettingsData, href: Href): Html {
  return entryRow({
    id: 'claude-token',
    title: 'Токен Claude',
    details: d.claudeToken ? `…${d.claudeToken} · сервер сам разбирает месяц по кнопке на разборе` : 'не задан · разбор месяца — по правилам',
    icon: 'sparkles',
    color: toneColor('violet'),
    href: href('/settings', { edit: 'claude-token' }),
  });
}

/** The token is never filled in: a new one replaces the old, and «Удалить» forgets it. */
function claudeTokenForm(d: SettingsData, href: Href): Html {
  return entryForm({
    id: 'claude-token',
    action: href('/budget/claude-token'),
    submitLabel: 'Сохранить',
    icon: 'sparkles',
    color: toneColor('violet'),
    fields: field({
      label: d.claudeToken ? `Новый токен вместо …${d.claudeToken}, из claude setup-token` : 'Токен подписки Claude, из claude setup-token',
      name: 'token',
      type: 'password',
      placeholder: 'sk-ant-oat01-…',
      maxLength: TOKEN_MAX,
    }),
    deleteAction: d.claudeToken ? href('/budget/claude-token/delete') : undefined,
    cancelHref: href('/settings'),
  });
}

/** Where a category comes from and how many expenses, or incomes, went into it lately. */
export function categoryDetails(c: CategoryEntry, count: number, kind: CategoryKind = 'expense'): string {
  const origin = c.zenmoneyTitle === null ? 'своя' : c.name === c.zenmoneyTitle ? 'из ZenMoney' : `в ZenMoney «${c.zenmoneyTitle}»`;
  const [words, none] = kind === 'income' ? [['доход', 'дохода', 'доходов'] as const, 'доходов'] : [['трата', 'траты', 'трат'] as const, 'трат'];
  return `${origin} · ${count > 0 ? `${count} ${plural(count, words)} за три месяца` : `за три месяца ${none} нет`}`;
}

function categoryRow({ category: c, kind, count }: CategoryCount, href: Href): Html {
  return entryRow({
    id: `${kind === 'income' ? 'income-' : ''}category-${c.id}`,
    title: c.title,
    details: categoryDetails(c, count, kind),
    ...categoryLook(c),
    ...(c.hidden ? { color: toneColor('gray') } : {}),
    href: href('/settings', { edit: categoryKey(c.id, kind) }),
    muted: c.hidden,
  });
}

function categoryForm(d: SettingsData, { category: c, kind, picked }: CategoryCount, href: Href): Html {
  const form = d.form?.id === c.id && d.form.kind === kind ? d.form : null;
  const look = categoryLook(c);
  const auto = autoLook(c);
  return entryForm({
    id: `${kind === 'income' ? 'income-' : ''}category-${c.id}`,
    action: href(`/categories/${c.id}`),
    submitLabel: 'Сохранить',
    ...look,
    hidden: kind === 'income' ? { kind } : undefined,
    fields: [
      field({
        label: c.zenmoneyTitle === null ? 'Название' : `Название, в ZenMoney «${c.zenmoneyTitle}»`,
        name: 'title',
        value: form?.title ?? c.name,
        placeholder: c.zenmoneyTitle ?? '',
        maxLength: 80,
        required: c.zenmoneyTitle === null,
        error: form?.errors.title,
      }),
      iconPicker({ label: 'Иконка', name: 'icon', value: form?.icon ?? picked?.icon ?? '', icons: CATEGORY_ICONS, auto: { icon: auto.icon, label: 'По названию' } }),
      colorPicker({
        label: 'Цвет',
        name: 'color',
        value: form?.color ?? picked?.color ?? '',
        colors: CATEGORY_COLORS.map((color) => ({ ...color, css: categoryColor(null, color.value) })),
        auto: { css: auto.color, label: 'Как у категории' },
      }),
      photoField({ label: 'Фото вместо иконки', name: 'photo', button: look.photo ? 'Другое фото' : 'Выбрать фото', error: form?.errors.photo }),
    ],
    extraActions: [
      { label: c.hidden ? 'Показать' : 'Скрыть', action: href(`/categories/${c.id}/${c.hidden ? 'show' : 'hide'}`) },
      ...(look.photo ? [{ label: 'Убрать фото', action: href(`/categories/${c.id}/photo/delete`) }] : []),
    ],
    deleteAction: c.zenmoneyTitle === null ? href(`/categories/${c.id}/delete`) : undefined,
    cancelHref: href('/settings'),
  });
}

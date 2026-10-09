// Marking an expense, the same on every page that lists expenses: what it paid (a payment of a regular expense or a
// purchase planned in a week), its category, which wins over ZenMoney's, and where it counts in the budget, if at all.
// An open expense shows under its row when and how it was paid, then these as choices made in one click, the
// likeliest payments and the most popular categories first, and what the user wrote about it. An income is marked the
// same way, only it pays nothing, its categories are the income ones, and it either counts among the incomes or not
// at all. Choices post to /spending/:id/:choice, the list of other payments to /spending/:id with the choice as
// `target`, and the description to /spending/:id/description (see submitMarking).

import { mainCurrency } from '../../balances.ts';
import { MAX_DESCRIPTION, parseDescription } from '../../input.ts';
import { byPopularity, categoryCatalog, type CategoryEntry, type CategorySetup } from '../../categories.ts';
import { paymentChoices, suggester, type Categorization, type PaymentChoice, type Suggestion } from '../../categorization.ts';
import { addDays } from '../../dates.ts';
import { listOperations, PURCHASE_CATEGORY, REGULAR_CATEGORY, type Operation } from '../../ledger.ts';
import { operationKind } from '../../operations.ts';
import { nearestPayment, type RegularExpense } from '../../regular.ts';
import type { Settings } from '../../settings.ts';
import { envelopeOf, purchaseStatus, weekOf, type Envelope, type Purchase, type WeekStart } from '../../week.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { dayMonth, money, timeOn, weekLabel } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryColor, type Tone } from '../tones.ts';
import { choiceGroup, factList, inlineForm } from '../widgets/basics.ts';
import type { Href } from './chrome.ts';

/** What the user keeps in the app about expenses and incomes. */
export interface SavedMarking {
  categorizations: ReadonlyMap<string, Categorization>;
  /** The purchase each expense paid, by ZenMoney transaction id. */
  purchasePayments: ReadonlyMap<string, number>;
  regular: RegularExpense[];
  purchases: Purchase[];
  /** Envelopes of spending moved out of where it counts by default, and incomes not counted. */
  marks: ReadonlyMap<string, Envelope>;
  /** What the user wrote about expenses and incomes, by ZenMoney transaction id. */
  descriptions: ReadonlyMap<string, string>;
  categories: CategorySetup;
  weekStart: WeekStart;
  /** The user's own name as banks write it in transfers to their accounts in other banks, when they gave it. */
  selfPayee?: string | null;
}

/** What marking an expense or an income needs besides it. */
export interface Marking {
  /** Categories to offer expenses, most popular first. */
  categories: CategoryEntry[];
  /** Categories to offer incomes, most popular first. */
  incomeCategories: CategoryEntry[];
  regular: RegularExpense[];
  purchases: Purchase[];
  /** Expenses with what they paid, to tell what is paid already. */
  expenses: Operation[];
  marks: ReadonlyMap<string, Envelope>;
  categorizations: ReadonlyMap<string, Categorization>;
  /** For an expense or an income. */
  suggest: (operation: Operation) => Suggestion | null;
  symbol: string;
  weekStart: WeekStart;
}

/** All expenses, as the user sorted them, newest first. */
export function allExpenses(data: EntityCollections, saved: SavedMarking): Operation[] {
  return listOperations(data, { from: '0000-01-01', to: '9999-12-31' }, saved).filter((o) => o.kind === 'expense');
}

/** All incomes that count, as the user sorted them, newest first. */
export function allIncomes(data: EntityCollections, saved: SavedMarking): Operation[] {
  return listOperations(data, { from: '0000-01-01', to: '9999-12-31' }, saved).filter((o) => o.kind === 'income');
}

/** `expenses` are all of them, as allExpenses lists them. */
export function loadMarking(data: EntityCollections, saved: SavedMarking, expenses: Operation[], today: DateString): Marking {
  const incomes = allIncomes(data, saved);
  const suggestExpense = suggester(expenses, saved.regular);
  const suggestIncome = suggester(incomes, []);
  return {
    categories: byPopularity(categoryCatalog(data.tag ?? [], saved.categories), expenses, today),
    incomeCategories: byPopularity(categoryCatalog(data.tag ?? [], saved.categories, 'income'), incomes, today),
    regular: saved.regular,
    purchases: saved.purchases,
    expenses,
    marks: saved.marks,
    categorizations: saved.categorizations,
    suggest: (o) => (o.kind === 'income' ? suggestIncome(o) : suggestExpense(o)),
    symbol: mainCurrency(data).symbol,
    weekStart: saved.weekStart,
  };
}

// ---- Forms

export type MarkingSubmission = { status: 'saved' } | { status: 'missing' } | { status: 'invalid'; error: string };

const ENVELOPES: Envelope[] = ['week', 'extra', 'outside', 'ignored'];

/**
 * Applies a form posted to /spending/:id/:choice, or to /spending/:id with the choice as `target`. A choice is a
 * category (tag-<id>), the regular expense or purchase the expense paid (regular-<id>, purchase-<id>), unlink,
 * uncategorize, or where it counts (week, extra, outside, ignored for nowhere). A payment counts where what it paid
 * counts, so linking one drops where the expense was moved, and counts it again if it was not counted. The expense and what it is put into must exist.
 * `description` gives the expense the `description` of the form, and an empty one takes it away. An income takes an
 * income category, uncategorize, counted or ignored, and a description.
 */
export function submitMarking(settings: Settings, data: EntityCollections, path: string, body: URLSearchParams): MarkingSubmission {
  const [, id, action] = /^\/spending\/([\w-]+)(?:\/([\w-]+))?$/.exec(path) ?? [];
  const transaction = id ? (data.transaction ?? []).find((t) => t.id === id && !t.deleted) : undefined;
  const operation = transaction ? operationKind(transaction) : null;
  if (!id || operation === null || operation === 'transfer') return { status: 'missing' };
  const choice = action ?? body.get('target') ?? '';
  const sorted = settings.categorizations().get(id);

  if (choice === 'description') {
    const description = parseDescription(body.get('description') ?? '');
    if ('error' in description) return { status: 'invalid', error: description.error };
    settings.describeSpending(id, description.value);
    return { status: 'saved' };
  }
  if (operation === 'income') return markIncome(settings, data, id, choice);
  const envelope = ENVELOPES.find((e) => e === choice);
  if (envelope) {
    settings.markSpending(id, envelope);
    return { status: 'saved' };
  }
  if (choice === 'unlink') {
    if (sorted && 'regular' in sorted) settings.categorize(id, null);
    settings.linkPurchase(id, null);
    return { status: 'saved' };
  }
  if (choice === 'uncategorize') {
    if (sorted && 'tag' in sorted) settings.categorize(id, null);
    return { status: 'saved' };
  }

  const [, kind, target] = /^(tag|regular|purchase)-([\w-]+)$/.exec(choice) ?? [];
  if (kind === 'tag' && categoryCatalog(data.tag ?? [], settings.categorySetup()).some((c) => c.id === target)) {
    settings.categorize(id, { tag: target! });
    return { status: 'saved' };
  }
  if (kind === 'regular' && settings.regularExpenses().some((e) => String(e.id) === target)) {
    settings.categorize(id, { regular: Number(target) });
    settings.markSpending(id, 'week');
    return { status: 'saved' };
  }
  if (kind === 'purchase' && settings.purchases().some((p) => String(p.id) === target)) {
    settings.linkPurchase(id, Number(target));
    settings.markSpending(id, 'week');
    return { status: 'saved' };
  }
  return { status: 'missing' };
}

/** An income goes into one of the income categories, or none, and counts among the incomes or not at all. */
function markIncome(settings: Settings, data: EntityCollections, id: string, choice: string): MarkingSubmission {
  if (choice === 'counted' || choice === 'ignored') {
    settings.markSpending(id, choice === 'ignored' ? 'ignored' : 'week');
    return { status: 'saved' };
  }
  if (choice === 'uncategorize') {
    settings.categorize(id, null);
    return { status: 'saved' };
  }
  const [, target] = /^tag-([\w-]+)$/.exec(choice) ?? [];
  if (target && categoryCatalog(data.tag ?? [], settings.categorySetup(), 'income').some((c) => c.id === target)) {
    settings.categorize(id, { tag: target });
    return { status: 'saved' };
  }
  return { status: 'missing' };
}

// ---- Page parts

/** How many likely payments show as buttons at least; the whole plan of the expense's week always does. */
const PAYMENT_BUTTONS = 4;
/** Purchases offered in the list: planned from this many weeks before the expense's week… */
const LIST_WEEKS_BEFORE = 4;
/** …to this many after it. */
const LIST_WEEKS_AFTER = 13;

const ENVELOPE_CHOICE: Record<Envelope, string> = { week: 'Неделя', extra: 'Дополнительные', outside: 'Вне бюджета', ignored: 'Не учитывать' };
/** Whether an income counts: among the incomes, or not at all. */
const INCOME_CHOICE = { counted: 'В доходах', ignored: ENVELOPE_CHOICE.ignored };
/**
 * Where an expense or a purchase counts, as a dot before its amount: yellow as what the week spent, violet as the
 * extras, an empty ring outside the budget.
 */
export const ENVELOPE_MARK: Record<Envelope, { label: string; tone?: Tone }> = {
  week: { label: 'В неделе', tone: 'yellow' },
  extra: { label: 'Дополнительные', tone: 'violet' },
  outside: { label: 'Вне бюджета' },
  ignored: { label: 'Не учитывается' },
};

/** What an expense's row is titled: what it paid, which tells more than who it went to, when it is linked. */
export function markingTitle(o: Operation): string {
  return o.regular?.title ?? o.purchase?.title ?? o.payee;
}

/**
 * What an expense is marked as, for its row under markingTitle: who it went to when it is linked, and its category;
 * then what the user wrote about it.
 */
export function markingDetails(o: Operation): string {
  const category = o.category && o.category.id !== REGULAR_CATEGORY.id && o.category.id !== PURCHASE_CATEGORY.id ? o.category.title : null;
  const marked = o.regular
    ? o.payee
    : o.purchase
      ? [o.payee, category?.toLowerCase() === o.purchase.title.toLowerCase() ? null : category].filter(Boolean).join(' · ')
      : (category ?? 'без категории');
  return [marked, o.description].filter(Boolean).join(' · ');
}

/** What is written under an operation's row: what the user wrote about it, then the bank's comment. */
export function writtenAbout(o: Pick<Operation, 'description' | 'comment'>): string | null {
  return [o.description, o.comment].filter(Boolean).join(' · ') || null;
}

/** Where an expense counts, for the mark on its row. */
export function envelopeMark(m: Pick<Marking, 'marks' | 'purchases'>, o: Operation): { label: string; tone?: Tone } {
  return ENVELOPE_MARK[envelopeOf(m, o)];
}

/** What an open expense or income shows under its row; an income pays nothing. */
export function markingPanel(m: Marking, o: Operation, href: Href): Html[] {
  const suggestion = o.category === null ? m.suggest(o) : null;
  return [
    facts(m, o),
    o.kind === 'expense' ? paymentGroup(m, o, href, suggestion) : null,
    categoryGroup(m, o, href, suggestion),
    envelopeGroup(m, o, href),
    descriptionForm(o, href),
  ].filter((part) => part !== null);
}

/** When, from where and how the bank put it, with whatever else it said: comment, foreign amount, not settled yet. */
export function markingFacts(m: Pick<Marking, 'symbol'>, o: Operation): Array<{ label: string; value: string }> {
  const time = timeOn(o.date, o.created);
  return [
    { label: 'Когда', value: time ? `${dayMonth(o.date)}, ${time}` : dayMonth(o.date) },
    { label: 'Сумма', value: money(o.amount, m.symbol, { cents: true }) },
    { label: 'Счёт', value: o.account },
    o.originalPayee ? { label: 'В банке', value: o.originalPayee } : null,
    o.comment ? { label: 'Комментарий', value: o.comment } : null,
    o.original ? { label: 'В валюте', value: money(o.original.amount, o.original.instrument.symbol, { cents: true }) } : null,
    o.hold ? { label: 'Статус', value: 'банк ещё не провёл' } : null,
  ].filter((item) => item !== null);
}

function facts(m: Marking, o: Operation): Html {
  return factList({ label: o.kind === 'income' ? 'О доходе' : 'О трате', items: markingFacts(m, o) });
}

function descriptionForm(o: Operation, href: Href): Html {
  return inlineForm({
    label: 'Описание',
    action: href(`/spending/${o.id}/description`),
    name: 'description',
    value: o.description ?? '',
    placeholder: o.kind === 'income' ? 'Например, вернули долг' : 'Например, подарок маме',
    maxLength: MAX_DESCRIPTION,
    submitLabel: 'Сохранить',
  });
}

/** A choice made in one click on an open expense, as /spending/:id/:choice takes it. */
export interface MarkingChoice {
  choice: string;
  label: string;
  detail?: string;
  /** A category's colour. */
  color?: string;
  current?: boolean;
  suggested?: boolean;
}

/** Undoing what the user marked an open expense as. */
export function undoChoices(m: Pick<Marking, 'categorizations'>, o: Operation): MarkingChoice[] {
  const sorted = m.categorizations.get(o.id);
  return [
    o.regular || o.purchase ? { choice: 'unlink', label: 'Отвязать' } : null,
    sorted && 'tag' in sorted && !o.zenmoneyCategory ? { choice: 'uncategorize', label: 'Убрать категорию' } : null,
  ].filter((a) => a !== null);
}

/** Undoing what the user marked an open expense as, next to its row. */
export function markingActions(m: Marking, o: Operation, href: Href): Array<{ label: string; action: string }> {
  return undoChoices(m, o).map((c) => ({ label: c.label, action: href(`/spending/${o.id}/${c.choice}`) }));
}

function paymentKey(choice: PaymentChoice): string {
  return 'regular' in choice ? `regular-${choice.regular.id}` : `purchase-${choice.purchase.id}`;
}

/** What an expense could have paid: the likeliest as buttons and the rest in lists by kind. */
export interface PaymentOptions {
  choices: MarkingChoice[];
  others: Array<{ label: string; options: Array<{ value: string; label: string }> }>;
}

/**
 * The likeliest payments as buttons, the one the expense paid, the suggested one and the plan of the expense's week
 * always among them, and the other regular expenses and purchases in a list.
 */
export function paymentOptions(m: Marking, o: Operation, suggestion: Suggestion | null): PaymentOptions {
  const week = weekOf(o.date, m.weekStart);
  const others = m.expenses.filter((e) => e.id !== o.id);
  const choices = paymentChoices(o, m);
  const current = currentPayment(m, o, others);
  if (current && !choices.some((c) => paymentKey(c) === paymentKey(current))) choices.unshift(current);
  const currentKey = current ? paymentKey(current) : null;
  const suggestedKey = suggestion && 'regular' in suggestion ? `regular-${suggestion.regular.id}` : null;
  const pinned = choices.filter((c) => paymentKey(c) === currentKey || paymentKey(c) === suggestedKey);
  const rest = choices.filter((c) => !pinned.includes(c));
  // paymentChoices puts the week's plan right after the bills of the expense's amount, so it ends at the last of it.
  const planned = rest.findLastIndex((c) => 'purchase' in c && c.purchase.week === week) + 1;
  const shown = [...pinned, ...rest].slice(0, Math.max(PAYMENT_BUTTONS, pinned.length + planned));
  const isShown = (key: string) => shown.some((c) => paymentKey(c) === key);

  const regular = m.regular
    .filter((e) => !isShown(`regular-${e.id}`))
    .map((e) => {
      const date = nearestPayment(e, o.date);
      return { value: `regular-${e.id}`, label: [e.title, date ? dayMonth(date) : null, money(e.amount, m.symbol)].filter(Boolean).join(' · ') };
    });
  const purchases = m.purchases
    .filter((p) => !isShown(`purchase-${p.id}`) && p.week >= addDays(week, -7 * LIST_WEEKS_BEFORE) && p.week <= addDays(week, 7 * LIST_WEEKS_AFTER))
    .filter((p) => !purchaseStatus(p, others).bought)
    .map((p) => ({ value: `purchase-${p.id}`, label: `${p.title} · ${weekLabel(p.week)} · ${money(p.amount, m.symbol)}` }));

  return {
    choices: shown.map((c) => ({
      choice: paymentKey(c),
      label: 'regular' in c ? c.regular.title : c.purchase.title,
      detail: paymentDetail(c, week, m.symbol),
      current: paymentKey(c) === currentKey,
      suggested: paymentKey(c) === suggestedKey,
    })),
    others:
      regular.length + purchases.length > 0
        ? [
            { label: 'Регулярные траты', options: regular },
            { label: 'Покупки', options: purchases },
          ]
        : [],
  };
}

/** Labels of the payment choices: the list of the others and what is said when there is nothing to pay. */
export const PAYMENT_WORDS = {
  other: 'Другой платёж',
  otherAlone: 'Регулярная трата или покупка',
  empty: 'Нет ни регулярных трат, ни покупок в плане.',
};

function paymentGroup(m: Marking, o: Operation, href: Href, suggestion: Suggestion | null): Html {
  const { choices, others } = paymentOptions(m, o, suggestion);
  return choiceGroup({
    label: 'Оплата',
    choices: choices.map((c) => ({ ...c, action: href(`/spending/${o.id}/${c.choice}`) })),
    other:
      others.length > 0
        ? {
            label: choices.length > 0 ? PAYMENT_WORDS.other : PAYMENT_WORDS.otherAlone,
            action: href(`/spending/${o.id}`),
            name: 'target',
            placeholder: 'Выберите, что она оплатила',
            submitLabel: 'Привязать',
            groups: others,
          }
        : undefined,
    empty: PAYMENT_WORDS.empty,
  });
}

/** What the expense paid, as a choice, even when it would not be offered any more. */
function currentPayment(m: Marking, o: Operation, others: Operation[]): PaymentChoice | null {
  const regular = o.regular ? m.regular.find((e) => e.id === o.regular?.id) : undefined;
  const date = regular ? nearestPayment(regular, o.date) : null;
  if (regular && date) return { regular, date, left: regular.amount };
  const purchase = o.purchase ? m.purchases.find((p) => p.id === o.purchase?.id) : undefined;
  return purchase ? { purchase, left: purchaseStatus(purchase, others).left } : null;
}

/** 3 октября · 25 000 ₽ for a payment, план недели · 3 000 ₽ for a purchase; the amount is what is left to pay. */
function paymentDetail(c: PaymentChoice, week: DateString, symbol: string): string {
  if ('regular' in c) return `${dayMonth(c.date)} · ${money(c.left, symbol)}`;
  const plan = c.purchase.envelope === 'extra' ? 'дополнительные' : c.purchase.week === week ? 'план недели' : `план ${weekLabel(c.purchase.week)}`;
  return `${plan} · ${money(c.left, symbol)}`;
}

/**
 * Categories most popular first, the expense's one highlighted; an income gets the income ones. The one ZenMoney gave
 * it is marked, and picking it again drops the pick made in the app. A payment of a regular expense keeps its category
 * while it is linked.
 */
export function categoryOptions(m: Marking, o: Operation, suggestion: Suggestion | null): { choices: MarkingChoice[]; empty: string } {
  if (o.regular) return { choices: [], empty: `«${o.category?.title ?? ''}», пока трата привязана к платежу` };
  const sorted = m.categorizations.get(o.id);
  const picked = sorted && 'tag' in sorted ? sorted.tag : null;
  const zenmoney = o.zenmoneyCategory?.id ?? null;
  const current = picked ?? zenmoney;
  const suggested = suggestion && 'category' in suggestion ? suggestion.category.id : null;
  const catalog: Array<Pick<CategoryEntry, 'id' | 'title' | 'color' | 'hidden'>> = o.kind === 'income' ? m.incomeCategories : m.categories;
  // A refund comes as an income with the shop's spending category from ZenMoney, which is offered still to go back to.
  const own = o.zenmoneyCategory && !catalog.some((c) => c.id === zenmoney) ? [{ ...o.zenmoneyCategory, hidden: false }] : [];
  return {
    choices: [...own, ...catalog]
      .filter((c) => !c.hidden || c.id === current || c.id === zenmoney)
      .map((c) => ({
        choice: c.id === zenmoney ? 'uncategorize' : `tag-${c.id}`,
        label: c.title,
        detail: c.id === zenmoney ? 'из ZenMoney' : undefined,
        color: categoryColor(c.id, c.color),
        current: c.id === current,
        suggested: c.id === suggested,
      })),
    empty: o.kind === 'income' ? 'Категорий доходов нет: добавьте их в настройках.' : 'Категорий нет: добавьте их в настройках.',
  };
}

function categoryGroup(m: Marking, o: Operation, href: Href, suggestion: Suggestion | null): Html {
  const { choices, empty } = categoryOptions(m, o, suggestion);
  return choiceGroup({ label: 'Категория', choices: choices.map((c) => ({ ...c, action: href(`/spending/${o.id}/${c.choice}`) })), empty });
}

/**
 * Where the expense counts. Back to the week means dropping the mark, so it is offered only to an expense that
 * counts in the week unless moved: not to a payment of a regular expense or of an extra purchase. An income counts
 * among the incomes or not at all.
 */
export function envelopeOptions(m: Pick<Marking, 'marks' | 'purchases'>, o: Operation): MarkingChoice[] {
  if (o.kind === 'income') {
    return [
      { choice: 'counted', label: INCOME_CHOICE.counted, current: !o.ignored },
      { choice: 'ignored', label: INCOME_CHOICE.ignored, current: o.ignored },
    ];
  }
  const current = envelopeOf(m, o);
  const unmoved = envelopeOf({ marks: new Map(), purchases: m.purchases }, o);
  return ENVELOPES.filter((e) => e !== 'week' || unmoved === 'week').map((e) => ({ choice: e, label: ENVELOPE_CHOICE[e], current: e === current }));
}

function envelopeGroup(m: Marking, o: Operation, href: Href): Html {
  return choiceGroup({ label: o.kind === 'income' ? 'Учёт' : 'Бюджет', choices: envelopeOptions(m, o).map((c) => ({ ...c, action: href(`/spending/${o.id}/${c.choice}`) })) });
}

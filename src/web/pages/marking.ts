// Marking an expense, the same on every page that lists expenses: what it paid (a payment of a regular expense or a
// purchase planned in a week), its category, which wins over ZenMoney's, and where it counts in the budget, if at all.
// An open expense shows under its row when and how it was paid, then these as choices made in one click, the
// likeliest payments and the most popular categories first. Choices post to /spending/:id/:choice, and the list of other payments to /spending/:id with the
// choice as `target` (see submitMarking).

import { mainCurrency } from '../../balances.ts';
import { byPopularity, categoryCatalog, type CategoryEntry, type CategorySetup } from '../../categories.ts';
import { paymentChoices, suggester, type Categorization, type PaymentChoice, type Suggestion } from '../../categorization.ts';
import { addDays } from '../../dates.ts';
import { listOperations, PURCHASE_CATEGORY, REGULAR_CATEGORY, type Operation } from '../../ledger.ts';
import { nearestPayment, type RegularExpense } from '../../regular.ts';
import type { Settings } from '../../settings.ts';
import { envelopeOf, purchaseStatus, weekOf, type Envelope, type Purchase } from '../../week.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { dayMonth, money, timeOn, weekLabel } from '../format.ts';
import type { Html } from '../html.ts';
import { categoryColor, type Tone } from '../tones.ts';
import { choiceGroup, factList } from '../widgets/basics.ts';
import type { Href } from './chrome.ts';

/** What the user keeps in the app about expenses. */
export interface SavedMarking {
  categorizations: ReadonlyMap<string, Categorization>;
  /** The purchase each expense paid, by ZenMoney transaction id. */
  purchasePayments: ReadonlyMap<string, number>;
  regular: RegularExpense[];
  purchases: Purchase[];
  /** Envelopes of spending moved out of where it counts by default. */
  marks: ReadonlyMap<string, Envelope>;
  categories: CategorySetup;
}

/** What marking an expense needs besides the expense. */
export interface Marking {
  /** Categories to offer, most popular first. */
  categories: CategoryEntry[];
  regular: RegularExpense[];
  purchases: Purchase[];
  /** Expenses with what they paid, to tell what is paid already. */
  expenses: Operation[];
  marks: ReadonlyMap<string, Envelope>;
  categorizations: ReadonlyMap<string, Categorization>;
  suggest: (expense: Operation) => Suggestion | null;
  symbol: string;
}

/** All expenses, as the user sorted them, newest first. */
export function allExpenses(data: EntityCollections, saved: SavedMarking): Operation[] {
  return listOperations(data, { from: '0000-01-01', to: '9999-12-31' }, saved).filter((o) => o.kind === 'expense');
}

/** `expenses` are all of them, as allExpenses lists them. */
export function loadMarking(data: EntityCollections, saved: SavedMarking, expenses: Operation[], today: DateString): Marking {
  return {
    categories: byPopularity(categoryCatalog(data.tag ?? [], saved.categories), expenses, today),
    regular: saved.regular,
    purchases: saved.purchases,
    expenses,
    marks: saved.marks,
    categorizations: saved.categorizations,
    suggest: suggester(expenses, saved.regular),
    symbol: mainCurrency(data).symbol,
  };
}

// ---- Forms

export type MarkingSubmission = { status: 'saved' } | { status: 'missing' };

const ENVELOPES: Envelope[] = ['week', 'extra', 'outside', 'ignored'];

/**
 * Applies a form posted to /spending/:id/:choice, or to /spending/:id with the choice as `target`. A choice is a
 * category (tag-<id>), the regular expense or purchase the expense paid (regular-<id>, purchase-<id>), unlink,
 * uncategorize, or where it counts (week, extra, outside, ignored for nowhere). A payment counts where what it paid
 * counts, so linking one drops where the expense was moved, and counts it again if it was not counted. The expense and what it is put into must exist.
 */
export function submitMarking(settings: Settings, data: EntityCollections, path: string, body: URLSearchParams): MarkingSubmission {
  const [, id, action] = /^\/spending\/([\w-]+)(?:\/([\w-]+))?$/.exec(path) ?? [];
  if (!id || !(data.transaction ?? []).some((t) => t.id === id && !t.deleted)) return { status: 'missing' };
  const choice = action ?? body.get('target') ?? '';
  const sorted = settings.categorizations().get(id);

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

// ---- Page parts

/** How many likely payments show as buttons; the rest are in the list under them. */
const PAYMENT_BUTTONS = 4;
/** Purchases offered in the list: planned from this many weeks before the expense's week… */
const LIST_WEEKS_BEFORE = 4;
/** …to this many after it. */
const LIST_WEEKS_AFTER = 13;

const ENVELOPE_CHOICE: Record<Envelope, string> = { week: 'Неделя', extra: 'Дополнительные', outside: 'Вне бюджета', ignored: 'Не учитывать' };
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

/** What an expense is marked as, for its row under markingTitle: who it went to when it is linked, and its category. */
export function markingDetails(o: Operation): string {
  const category = o.category && o.category.id !== REGULAR_CATEGORY.id && o.category.id !== PURCHASE_CATEGORY.id ? o.category.title : null;
  if (o.regular) return o.payee;
  if (o.purchase) return [o.payee, category?.toLowerCase() === o.purchase.title.toLowerCase() ? null : category].filter(Boolean).join(' · ');
  return category ?? 'без категории';
}

/** Where an expense counts, for the mark on its row. */
export function envelopeMark(m: Pick<Marking, 'marks' | 'purchases'>, o: Operation): { label: string; tone?: Tone } {
  return ENVELOPE_MARK[envelopeOf(m, o)];
}

/** What an open expense shows under its row. */
export function markingPanel(m: Marking, o: Operation, href: Href): Html[] {
  const suggestion = o.category === null ? m.suggest(o) : null;
  return [facts(m, o), paymentGroup(m, o, href, suggestion), categoryGroup(m, o, href, suggestion), envelopeGroup(m, o, href)];
}

/** When, from where and how the bank put it, with whatever else it said: comment, foreign amount, not settled yet. */
function facts(m: Marking, o: Operation): Html {
  const time = timeOn(o.date, o.created);
  return factList({
    label: 'О трате',
    items: [
      { label: 'Когда', value: time ? `${dayMonth(o.date)}, ${time}` : dayMonth(o.date) },
      { label: 'Сумма', value: money(o.amount, m.symbol, { cents: true }) },
      { label: 'Счёт', value: o.account },
      o.originalPayee ? { label: 'В банке', value: o.originalPayee } : null,
      o.comment ? { label: 'Комментарий', value: o.comment } : null,
      o.original ? { label: 'В валюте', value: money(o.original.amount, o.original.instrument.symbol, { cents: true }) } : null,
      o.hold ? { label: 'Статус', value: 'банк ещё не провёл' } : null,
    ].filter((item) => item !== null),
  });
}

/** Undoing what the user marked an open expense as, next to its row. */
export function markingActions(m: Marking, o: Operation, href: Href): Array<{ label: string; action: string }> {
  const sorted = m.categorizations.get(o.id);
  return [
    o.regular || o.purchase ? { label: 'Отвязать', action: href(`/spending/${o.id}/unlink`) } : null,
    sorted && 'tag' in sorted && !o.zenmoneyCategory ? { label: 'Убрать категорию', action: href(`/spending/${o.id}/uncategorize`) } : null,
  ].filter((a) => a !== null);
}

function paymentKey(choice: PaymentChoice): string {
  return 'regular' in choice ? `regular-${choice.regular.id}` : `purchase-${choice.purchase.id}`;
}

/**
 * The likeliest payments as buttons, the one the expense paid and the suggested one always among them, and the
 * other regular expenses and purchases in a list.
 */
function paymentGroup(m: Marking, o: Operation, href: Href, suggestion: Suggestion | null): Html {
  const week = weekOf(o.date);
  const others = m.expenses.filter((e) => e.id !== o.id);
  const choices = paymentChoices(o, m);
  const current = currentPayment(m, o, others);
  if (current && !choices.some((c) => paymentKey(c) === paymentKey(current))) choices.unshift(current);
  const currentKey = current ? paymentKey(current) : null;
  const suggestedKey = suggestion && 'regular' in suggestion ? `regular-${suggestion.regular.id}` : null;
  const pinned = choices.filter((c) => paymentKey(c) === currentKey || paymentKey(c) === suggestedKey);
  const shown = [...pinned, ...choices.filter((c) => !pinned.includes(c))].slice(0, Math.max(PAYMENT_BUTTONS, pinned.length));
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

  return choiceGroup({
    label: 'Оплата',
    choices: shown.map((c) => ({
      label: 'regular' in c ? c.regular.title : c.purchase.title,
      detail: paymentDetail(c, week, m.symbol),
      action: href(`/spending/${o.id}/${paymentKey(c)}`),
      current: paymentKey(c) === currentKey,
      suggested: paymentKey(c) === suggestedKey,
    })),
    other:
      regular.length + purchases.length > 0
        ? {
            label: shown.length > 0 ? 'Другой платёж' : 'Регулярная трата или покупка',
            action: href(`/spending/${o.id}`),
            name: 'target',
            placeholder: 'Выберите, что она оплатила',
            submitLabel: 'Привязать',
            groups: [
              { label: 'Регулярные траты', options: regular },
              { label: 'Покупки', options: purchases },
            ],
          }
        : undefined,
    empty: 'Нет ни регулярных трат, ни покупок в плане.',
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
 * Categories most popular first, the expense's one highlighted. The one ZenMoney gave it is marked, and picking it
 * again drops the pick made in the app. A payment of a regular expense keeps its category while it is linked.
 */
function categoryGroup(m: Marking, o: Operation, href: Href, suggestion: Suggestion | null): Html {
  if (o.regular) return choiceGroup({ label: 'Категория', choices: [], empty: `«${o.category?.title ?? ''}», пока трата привязана к платежу` });
  const sorted = m.categorizations.get(o.id);
  const picked = sorted && 'tag' in sorted ? sorted.tag : null;
  const zenmoney = o.zenmoneyCategory?.id ?? null;
  const current = picked ?? zenmoney;
  const suggested = suggestion && 'category' in suggestion ? suggestion.category.id : null;
  return choiceGroup({
    label: 'Категория',
    choices: m.categories
      .filter((c) => !c.hidden || c.id === current || c.id === zenmoney)
      .map((c) => ({
        label: c.title,
        detail: c.id === zenmoney ? 'из ZenMoney' : undefined,
        color: categoryColor(c.id, c.color),
        action: href(`/spending/${o.id}/${c.id === zenmoney ? 'uncategorize' : `tag-${c.id}`}`),
        current: c.id === current,
        suggested: c.id === suggested,
      })),
    empty: 'Категорий нет: добавьте их в настройках.',
  });
}

/**
 * Where the expense counts. Back to the week means dropping the mark, so it is offered only to an expense that
 * counts in the week unless moved: not to a payment of a regular expense or of an extra purchase.
 */
function envelopeGroup(m: Marking, o: Operation, href: Href): Html {
  const current = envelopeOf(m, o);
  const unmoved = envelopeOf({ marks: new Map(), purchases: m.purchases }, o);
  return choiceGroup({
    label: 'Бюджет',
    choices: ENVELOPES.filter((e) => e !== 'week' || unmoved === 'week').map((e) => ({
      label: ENVELOPE_CHOICE[e],
      action: href(`/spending/${o.id}/${e}`),
      current: e === current,
    })),
  });
}

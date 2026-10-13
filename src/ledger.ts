import { mainCurrency, mainCurrencyConverter } from './balances.ts';
import { categoryFinder, NO_SETUP, type CategoryKind, type CategorySetup } from './categories.ts';
import type { Categorization } from './categorization.ts';
import { operationAmount, operationKind, type Category, type OperationKind } from './operations.ts';
import type { RegularExpense } from './regular.ts';
import { NO_SHOPS, shopFinder, type Shop, type ShopSetup } from './shops.ts';
import type { Envelope, Purchase, Wish } from './week.ts';
import type { DateString, EntityCollections, Instrument, TagId } from './zenmoney/types.ts';

/** A transaction as people read it: who, what for, from which account, how much. */
export interface Operation {
  id: string;
  date: DateString;
  /** Unix seconds when the operation was added; orders operations within a day. */
  created: number;
  kind: OperationKind;
  /** In the main currency, always positive. */
  amount: number;
  /** The amount in the currency of the purchase or account, when it is not the main currency. */
  original: { amount: number; instrument: Instrument } | null;
  /** Who it went to or came from, as ZenMoney names them; the rules of the app go by it. */
  payee: string;
  /** The shop the payee is, with the name and logo it has in the app; null for a transfer or when no payee is named. */
  shop: Shop | null;
  /** What the app calls who it went to: the name of its shop when it has one, else the payee. */
  name: string;
  /** How the bank named the payee, when ZenMoney, the user or the chain the shop is named it otherwise. */
  originalPayee: string | null;
  comment: string | null;
  /** What the user wrote about it in the app. */
  description: string | null;
  /**
   * Top-level category with the title the user gave it: the one the user picked in the app, or else the one from
   * ZenMoney; a payment of a regular expense without either goes under REGULAR_CATEGORY, of a purchase under
   * PURCHASE_CATEGORY. Transfers and uncategorised operations have none.
   */
  category: Category | null;
  /** The category ZenMoney gave it, even when the user picked another one in the app. */
  zenmoneyCategory: Category | null;
  /** The regular expense the user said this expense paid. */
  regular: { id: number; title: string } | null;
  /** The purchase planned in a week that the user said this expense paid. */
  purchase: { id: number; title: string } | null;
  /** The wish the user said this expense bought; none when not given. */
  wish?: { id: number; title: string } | null;
  account: string;
  /** Where a transfer went. */
  toAccount: string | null;
  /** The bank has not settled it yet. */
  hold: boolean;
  /** The user said not to count this expense or income at all; such operations are listed only when asked for. */
  ignored: boolean;
  /** An expense the user said could have been done without; never one that is not counted at all. */
  optional: boolean;
}

/**
 * How the user sorted expenses and incomes, the regular expenses, purchases and wishes expenses may pay, and how they
 * set up categories.
 */
export interface Sorting {
  categorizations: ReadonlyMap<string, Categorization>;
  regular: ReadonlyArray<Pick<RegularExpense, 'id' | 'title'>>;
  /** The purchase each expense paid, by ZenMoney transaction id. */
  purchasePayments?: ReadonlyMap<string, number>;
  purchases?: ReadonlyArray<Pick<Purchase, 'id' | 'title'>>;
  /** The wish each expense bought, by ZenMoney transaction id. */
  wishPayments?: ReadonlyMap<string, number>;
  wishes?: ReadonlyArray<Pick<Wish, 'id' | 'title'>>;
  /** ZenMoney's categories as they are without it. */
  categories?: CategorySetup;
  /** Where the user said expenses count; those not counted at all, incomes among them, are left out. */
  marks?: ReadonlyMap<string, Envelope>;
  /** What the user wrote about expenses and incomes, by ZenMoney transaction id. */
  descriptions?: ReadonlyMap<string, string>;
  /** Expenses the user said could have been done without, by ZenMoney transaction id. */
  optionalSpending?: ReadonlySet<string>;
  /** How the user named and dressed shops; without it shops are named as the chains the app knows are. */
  shops?: ShopSetup;
}

/** Payments of regular expenses go together under this category when they have no other. */
export const REGULAR_CATEGORY: Category = { id: 'regular', title: 'Регулярные траты', color: null };
/** Payments of purchases from the weeks' plans go together under this category when they have no other. */
export const PURCHASE_CATEGORY: Category = { id: 'purchase', title: 'Покупки из плана', color: null };

const UNTITLED: Record<OperationKind, string> = { expense: 'Расход', income: 'Доход', transfer: 'Перевод' };

/**
 * Operations dated from `from` to `to` inclusive, newest first. Deleted ones are left out, and so are transfers
 * between accounts of one bank: they only move money from one pocket to another. Expenses and incomes the user said
 * not to count at all are left out too, unless `withIgnored` asks for them, as the list of operations does to let them
 * be found.
 */
export function listOperations(
  data: Pick<EntityCollections, 'instrument' | 'user' | 'account' | 'tag' | 'merchant' | 'transaction'>,
  range: { from: DateString; to: DateString },
  sorting?: Sorting,
  options: { withIgnored?: boolean } = {},
): Operation[] {
  const main = mainCurrency(data);
  const toMain = mainCurrencyConverter(data);
  const instruments = new Map((data.instrument ?? []).map((i) => [i.id, i]));
  // Titles may come with stray spaces from ZenMoney, such as «Основной », which would double the space before a dot.
  const accounts = new Map((data.account ?? []).map((a) => [a.id, a.title.trim()]));
  const banks = new Map((data.account ?? []).map((a) => [a.id, a.company]));
  const tags = new Map((data.tag ?? []).map((t) => [t.id, t]));
  const merchants = new Map((data.merchant ?? []).map((m) => [m.id, m.title]));
  const regular = new Map((sorting?.regular ?? []).map((e) => [e.id, e]));
  const purchases = new Map((sorting?.purchases ?? []).map((p) => [p.id, p]));
  const wishes = new Map((sorting?.wishes ?? []).map((w) => [w.id, w]));
  const findCategory = categoryFinder(tags, sorting?.categories ?? NO_SETUP);
  const findShop = shopFinder(sorting?.shops ?? NO_SHOPS);

  const operations: Operation[] = [];
  for (const t of data.transaction ?? []) {
    if (t.deleted || t.date < range.from || t.date > range.to) continue;
    const kind = operationKind(t);
    if (kind === null) continue;
    const ignored = kind !== 'transfer' && sorting?.marks?.get(t.id) === 'ignored';
    if (ignored && !options.withIgnored) continue;
    const bank = banks.get(t.outcomeAccount);
    if (kind === 'transfer' && bank != null && bank === banks.get(t.incomeAccount)) continue;
    const { amount, instrument } = operationAmount(t, kind);
    const isIncome = kind === 'income';
    const opAmount = isIncome ? t.opIncome : t.opOutcome;
    const opInstrument = isIncome ? t.opIncomeInstrument : t.opOutcomeInstrument;
    const original =
      opAmount && opInstrument !== null
        ? { amount: opAmount, instrument: instruments.get(opInstrument) }
        : { amount, instrument: instruments.get(instrument) };
    const account = accounts.get(isIncome ? t.incomeAccount : t.outcomeAccount) ?? 'Счёт';
    const toAccount = kind === 'transfer' ? (accounts.get(t.incomeAccount) ?? 'Счёт') : null;
    const sorted = kind !== 'transfer' ? sorting?.categorizations.get(t.id) : undefined;
    const paid = sorted && 'regular' in sorted ? regular.get(sorted.regular) : undefined;
    const purchaseId = kind === 'expense' ? sorting?.purchasePayments?.get(t.id) : undefined;
    const bought = purchaseId === undefined ? undefined : purchases.get(purchaseId);
    const wishId = kind === 'expense' ? sorting?.wishPayments?.get(t.id) : undefined;
    const wish = wishId === undefined ? undefined : wishes.get(wishId);
    const zenmoneyTag = t.tag?.[0];
    const zenmoneyCategory = kind === 'transfer' || zenmoneyTag === undefined ? undefined : findCategory(zenmoneyTag);
    const category = (sorted && 'tag' in sorted ? findCategory(sorted.tag) : undefined) ?? zenmoneyCategory;
    const comment = t.comment?.trim() || null;
    const originalPayee = t.originalPayee?.trim() || null;
    const named = t.payee?.trim() || (t.merchant ? merchants.get(t.merchant) : undefined) || originalPayee;
    const shop = named && kind !== 'transfer' ? findShop(named) : null;
    const payee =
      named ||
      (toAccount ? `${account} → ${toAccount}` : undefined) ||
      category?.title ||
      paid?.title ||
      bought?.title ||
      wish?.title ||
      UNTITLED[kind];
    const name = shop?.title ?? payee;
    // A shop named in the app is told by the name ZenMoney has too, when the bank's own is not known.
    const bankName = originalPayee ?? (shop?.title ? payee : null);

    operations.push({
      id: t.id,
      date: t.date,
      created: t.created,
      kind,
      amount: toMain(amount, instrument),
      original:
        original.instrument && original.instrument.id !== main.id
          ? { amount: original.amount, instrument: original.instrument }
          : null,
      payee,
      shop,
      name,
      originalPayee: bankName && bankName.toLocaleLowerCase('ru') !== name.toLocaleLowerCase('ru') ? bankName : null,
      comment: comment === payee ? null : comment,
      description: sorting?.descriptions?.get(t.id) ?? null,
      category: category ?? (paid ? REGULAR_CATEGORY : bought || wish ? PURCHASE_CATEGORY : null),
      zenmoneyCategory: zenmoneyCategory ?? null,
      regular: paid ? { id: paid.id, title: paid.title } : null,
      purchase: bought ? { id: bought.id, title: bought.title } : null,
      wish: wish ? { id: wish.id, title: wish.title } : null,
      account,
      toAccount,
      hold: Boolean(t.hold),
      ignored,
      optional: kind === 'expense' && !ignored && Boolean(sorting?.optionalSpending?.has(t.id)),
    });
  }
  return operations.sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
}

/** Whether ZenMoney knows nothing about who the operation was with, so it is called by its kind: Расход. */
export function isUntitled(operation: Pick<Operation, 'kind' | 'payee'>): boolean {
  return operation.payee === UNTITLED[operation.kind];
}

export interface OperationFilter {
  kind?: OperationKind;
  /** A top-level category, or 'none' for incomes and expenses without one. */
  category?: TagId | 'none';
  /** Text to find in the payee, comment, description, category or account, in any case. */
  query?: string;
  /** Only the expenses the user said could have been done without. */
  optional?: boolean;
}

export function filterOperations(operations: Operation[], filter: OperationFilter): Operation[] {
  const query = filter.query?.trim().toLocaleLowerCase('ru') ?? '';
  return operations.filter((o) => {
    if (filter.kind && o.kind !== filter.kind) return false;
    if (filter.optional && !o.optional) return false;
    if (filter.category === 'none' && (o.category !== null || o.kind === 'transfer')) return false;
    if (filter.category && filter.category !== 'none' && o.category?.id !== filter.category) return false;
    if (query) {
      const text = [o.name, o.payee, o.originalPayee, o.comment, o.description, o.category?.title, o.regular?.title, o.purchase?.title, o.account, o.toAccount].filter(Boolean).join(' ');
      if (!text.toLocaleLowerCase('ru').includes(query)) return false;
    }
    return true;
  });
}

export interface CategorySpending extends Omit<Category, 'id'> {
  /** Top-level category; null for operations without one. */
  id: TagId | null;
  amount: number;
}

/** Expenses, or incomes, by top-level category, largest first; those without one go together as Без категории. */
export function byCategory(operations: Operation[], kind: CategoryKind = 'expense'): CategorySpending[] {
  const categories = new Map<TagId | null, CategorySpending>();
  for (const o of operations) {
    if (o.kind !== kind) continue;
    const id = o.category?.id ?? null;
    let category = categories.get(id);
    if (!category) {
      category = { ...(o.category ?? { id: null, title: 'Без категории', color: null }), amount: 0 };
      categories.set(id, category);
    }
    category.amount += o.amount;
  }
  return [...categories.values()].sort((a, b) => b.amount - a.amount);
}

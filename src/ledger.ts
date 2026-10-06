import { mainCurrency, mainCurrencyConverter } from './balances.ts';
import { categoryFinder, NO_SETUP, type CategorySetup } from './categories.ts';
import type { Categorization } from './categorization.ts';
import { operationAmount, operationKind, type Category, type OperationKind } from './operations.ts';
import type { RegularExpense } from './regular.ts';
import type { Envelope, Purchase } from './week.ts';
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
  payee: string;
  /** How the bank named the payee, when ZenMoney or the user named it otherwise. */
  originalPayee: string | null;
  comment: string | null;
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
  account: string;
  /** Where a transfer went. */
  toAccount: string | null;
  /** The bank has not settled it yet. */
  hold: boolean;
  /** The user said not to count this expense at all; such expenses are listed only when asked for. */
  ignored: boolean;
}

/** How the user sorted expenses, the regular expenses and purchases they may pay, and how they set up categories. */
export interface Sorting {
  categorizations: ReadonlyMap<string, Categorization>;
  regular: ReadonlyArray<Pick<RegularExpense, 'id' | 'title'>>;
  /** The purchase each expense paid, by ZenMoney transaction id. */
  purchasePayments?: ReadonlyMap<string, number>;
  purchases?: ReadonlyArray<Pick<Purchase, 'id' | 'title'>>;
  /** ZenMoney's categories as they are without it. */
  categories?: CategorySetup;
  /** Where the user said expenses count; those not counted at all are left out. */
  marks?: ReadonlyMap<string, Envelope>;
}

/** Payments of regular expenses go together under this category when they have no other. */
export const REGULAR_CATEGORY: Category = { id: 'regular', title: 'Регулярные траты', color: null };
/** Payments of purchases from the weeks' plans go together under this category when they have no other. */
export const PURCHASE_CATEGORY: Category = { id: 'purchase', title: 'Покупки из плана', color: null };

const UNTITLED: Record<OperationKind, string> = { expense: 'Расход', income: 'Доход', transfer: 'Перевод' };

/**
 * Operations dated from `from` to `to` inclusive, newest first. Deleted ones are left out, and so are transfers
 * between accounts of one bank: they only move money from one pocket to another. Expenses the user said not to count
 * at all are left out too, unless `withIgnored` asks for them, as the list of operations does to let them be found.
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
  const accounts = new Map((data.account ?? []).map((a) => [a.id, a.title]));
  const banks = new Map((data.account ?? []).map((a) => [a.id, a.company]));
  const tags = new Map((data.tag ?? []).map((t) => [t.id, t]));
  const merchants = new Map((data.merchant ?? []).map((m) => [m.id, m.title]));
  const regular = new Map((sorting?.regular ?? []).map((e) => [e.id, e]));
  const purchases = new Map((sorting?.purchases ?? []).map((p) => [p.id, p]));
  const findCategory = categoryFinder(tags, sorting?.categories ?? NO_SETUP);

  const operations: Operation[] = [];
  for (const t of data.transaction ?? []) {
    if (t.deleted || t.date < range.from || t.date > range.to) continue;
    const kind = operationKind(t);
    if (kind === null) continue;
    const ignored = kind === 'expense' && sorting?.marks?.get(t.id) === 'ignored';
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
    const sorted = kind === 'expense' ? sorting?.categorizations.get(t.id) : undefined;
    const paid = sorted && 'regular' in sorted ? regular.get(sorted.regular) : undefined;
    const purchaseId = kind === 'expense' ? sorting?.purchasePayments?.get(t.id) : undefined;
    const bought = purchaseId === undefined ? undefined : purchases.get(purchaseId);
    const zenmoneyTag = t.tag?.[0];
    const zenmoneyCategory = kind === 'transfer' || zenmoneyTag === undefined ? undefined : findCategory(zenmoneyTag);
    const category = (sorted && 'tag' in sorted ? findCategory(sorted.tag) : undefined) ?? zenmoneyCategory;
    const comment = t.comment?.trim() || null;
    const originalPayee = t.originalPayee?.trim() || null;
    const payee =
      t.payee?.trim() ||
      (t.merchant ? merchants.get(t.merchant) : undefined) ||
      t.originalPayee?.trim() ||
      (toAccount ? `${account} → ${toAccount}` : undefined) ||
      category?.title ||
      paid?.title ||
      bought?.title ||
      UNTITLED[kind];

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
      originalPayee: originalPayee && originalPayee.toLocaleLowerCase('ru') !== payee.toLocaleLowerCase('ru') ? originalPayee : null,
      comment: comment === payee ? null : comment,
      category: category ?? (paid ? REGULAR_CATEGORY : bought ? PURCHASE_CATEGORY : null),
      zenmoneyCategory: zenmoneyCategory ?? null,
      regular: paid ? { id: paid.id, title: paid.title } : null,
      purchase: bought ? { id: bought.id, title: bought.title } : null,
      account,
      toAccount,
      hold: Boolean(t.hold),
      ignored,
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
  /** Text to find in the payee, comment, category or account, in any case. */
  query?: string;
}

export function filterOperations(operations: Operation[], filter: OperationFilter): Operation[] {
  const query = filter.query?.trim().toLocaleLowerCase('ru') ?? '';
  return operations.filter((o) => {
    if (filter.kind && o.kind !== filter.kind) return false;
    if (filter.category === 'none' && (o.category !== null || o.kind === 'transfer')) return false;
    if (filter.category && filter.category !== 'none' && o.category?.id !== filter.category) return false;
    if (query) {
      const text = [o.payee, o.comment, o.category?.title, o.regular?.title, o.purchase?.title, o.account, o.toAccount].filter(Boolean).join(' ');
      if (!text.toLocaleLowerCase('ru').includes(query)) return false;
    }
    return true;
  });
}

export interface CategorySpending {
  /** Top-level category; null for operations without one. */
  id: TagId | null;
  title: string;
  /** '#rrggbb', or null when the category has no colour in ZenMoney. */
  color: string | null;
  amount: number;
}

/** Expenses by top-level category, largest first; those without one go together as Без категории. */
export function spendingByCategory(operations: Operation[]): CategorySpending[] {
  const categories = new Map<TagId | null, CategorySpending>();
  for (const o of operations) {
    if (o.kind !== 'expense') continue;
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

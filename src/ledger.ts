import { mainCurrency, mainCurrencyConverter } from './balances.ts';
import { categoryOf, operationAmount, operationKind, topCategory, type Category, type OperationKind } from './operations.ts';
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
  comment: string | null;
  /** Top-level category; transfers and uncategorised operations have none. */
  category: Category | null;
  account: string;
  /** Where a transfer went. */
  toAccount: string | null;
  /** The bank has not settled it yet. */
  hold: boolean;
}

const UNTITLED: Record<OperationKind, string> = { expense: 'Расход', income: 'Доход', transfer: 'Перевод' };

/** Operations dated from `from` to `to` inclusive, newest first. Deleted ones are left out. */
export function listOperations(
  data: Pick<EntityCollections, 'instrument' | 'user' | 'account' | 'tag' | 'merchant' | 'transaction'>,
  range: { from: DateString; to: DateString },
): Operation[] {
  const main = mainCurrency(data);
  const toMain = mainCurrencyConverter(data);
  const instruments = new Map((data.instrument ?? []).map((i) => [i.id, i]));
  const accounts = new Map((data.account ?? []).map((a) => [a.id, a.title]));
  const tags = new Map((data.tag ?? []).map((t) => [t.id, t]));
  const merchants = new Map((data.merchant ?? []).map((m) => [m.id, m.title]));

  const operations: Operation[] = [];
  for (const t of data.transaction ?? []) {
    if (t.deleted || t.date < range.from || t.date > range.to) continue;
    const kind = operationKind(t);
    if (kind === null) continue;
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
    const tag = kind === 'transfer' ? undefined : topCategory(tags, t.tag);
    const comment = t.comment?.trim() || null;
    const payee =
      t.payee?.trim() ||
      (t.merchant ? merchants.get(t.merchant) : undefined) ||
      t.originalPayee?.trim() ||
      (toAccount ? `${account} → ${toAccount}` : undefined) ||
      tag?.title ||
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
      comment: comment === payee ? null : comment,
      category: tag ? categoryOf(tag) : null,
      account,
      toAccount,
      hold: Boolean(t.hold),
    });
  }
  return operations.sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
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
      const text = [o.payee, o.comment, o.category?.title, o.account, o.toAccount].filter(Boolean).join(' ');
      if (!text.toLocaleLowerCase('ru').includes(query)) return false;
    }
    return true;
  });
}

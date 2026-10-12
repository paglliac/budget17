import type { InstrumentId, Tag, TagId } from './zenmoney/types.ts';

/** Transactions, reminders and reminder markers share these fields. */
interface OperationAmounts {
  income: number;
  incomeInstrument: InstrumentId;
  outcome: number;
  outcomeInstrument: InstrumentId;
}

export type OperationKind = 'expense' | 'income' | 'transfer';

/** An expense only takes money out, an income only brings it in, a transfer does both. */
export function operationKind(operation: Pick<OperationAmounts, 'income' | 'outcome'>): OperationKind | null {
  if (operation.income > 0 && operation.outcome > 0) return 'transfer';
  if (operation.outcome > 0) return 'expense';
  if (operation.income > 0) return 'income';
  return null;
}

/** The amount of the operation in its own currency: what came in for an income, what went out otherwise. */
export function operationAmount(operation: OperationAmounts, kind: OperationKind): { amount: number; instrument: InstrumentId } {
  return kind === 'income'
    ? { amount: operation.income, instrument: operation.incomeInstrument }
    : { amount: operation.outcome, instrument: operation.outcomeInstrument };
}

export interface Category {
  id: TagId;
  title: string;
  /**
   * The colour the user picked in the app, a tone's name such as green or #rrggbb, else ZenMoney's #rrggbb; null when
   * it has neither.
   */
  color: string | null;
  /** The icon the user picked in the app, by name (see src/web/icons.ts); none is picked by its title. */
  icon?: string | null;
  /** The version of the photo the user put on it in the app, shown instead of the icon. */
  photo?: string | null;
}

export function categoryOf(tag: Tag): Category {
  // ZenMoney stores colours as ARGB packed into an integer.
  const color = tag.color === null ? null : `#${((tag.color >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`;
  return { id: tag.id, title: tag.title, color };
}

/** The top-level category of an operation: ZenMoney nests categories one level deep, and the first tag is the main one. */
export function topCategory(tags: ReadonlyMap<TagId, Tag>, tagIds: TagId[] | null): Tag | undefined {
  const tag = tagIds?.[0] === undefined ? undefined : tags.get(tagIds[0]);
  return tag?.parent ? (tags.get(tag.parent) ?? tag) : tag;
}

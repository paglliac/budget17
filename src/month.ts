import { mainCurrencyConverter } from './balances.ts';
import { dateOf, dayOfMonth, daysInMonth, monthOf, shiftMonth, type MonthString } from './dates.ts';
import { operationAmount, operationKind, topCategory } from './operations.ts';
import type { DateString, EntityCollections, TagId } from './zenmoney/types.ts';

export interface CategorySpending {
  /** Top-level category; null for operations without one. */
  id: TagId | null;
  title: string;
  /** '#rrggbb', or null when the category has no colour in ZenMoney. */
  color: string | null;
  amount: number;
}

/** Income and spending of one month, in the main currency. Transfers between accounts count as neither. */
export interface MonthSummary {
  month: MonthString;
  days: number;
  /** Days that have passed: up to today in the current month, all of them in past months, none in future ones. */
  elapsed: number;
  income: number;
  expense: number;
  previous: {
    income: number;
    expense: number;
    /** Spending of the previous month up to the same day of month as `elapsed`. */
    expenseToDate: number;
  };
  /** Planned spending from ZenMoney budgets; null when the month has none. */
  budget: number | null;
  /** Spending per day; index 0 is the 1st. */
  dailyExpense: number[];
  /** Income per day; index 0 is the 1st. */
  dailyIncome: number[];
  /** Spending by top-level category, largest first. */
  categories: CategorySpending[];
}

/** ZenMoney keeps the budget for the whole month under this category id. */
const WHOLE_MONTH_BUDGET = '00000000-0000-0000-0000-000000000000';

export function summarizeMonth(
  data: Pick<EntityCollections, 'instrument' | 'user' | 'tag' | 'transaction' | 'budget'>,
  options: { month: MonthString; today: DateString },
): MonthSummary {
  const { month, today } = options;
  const toMain = mainCurrencyConverter(data);
  const tags = new Map((data.tag ?? []).map((t) => [t.id, t]));
  const previousMonth = shiftMonth(month, -1);
  const days = daysInMonth(month);
  const currentMonth = monthOf(today);
  const elapsed = month === currentMonth ? dayOfMonth(today) : month < currentMonth ? days : 0;

  const summary: MonthSummary = {
    month,
    days,
    elapsed,
    income: 0,
    expense: 0,
    previous: { income: 0, expense: 0, expenseToDate: 0 },
    budget: monthBudget(data, month),
    dailyExpense: new Array<number>(days).fill(0),
    dailyIncome: new Array<number>(days).fill(0),
    categories: [],
  };
  const categories = new Map<TagId | null, CategorySpending>();

  for (const t of data.transaction ?? []) {
    if (t.deleted) continue;
    const kind = operationKind(t);
    if (kind === null || kind === 'transfer') continue;
    const operationMonth = monthOf(t.date);
    if (operationMonth !== month && operationMonth !== previousMonth) continue;

    const { amount, instrument } = operationAmount(t, kind);
    const value = toMain(amount, instrument);
    const day = dayOfMonth(t.date);

    if (operationMonth === previousMonth) {
      if (kind === 'income') {
        summary.previous.income += value;
      } else {
        summary.previous.expense += value;
        if (day <= elapsed) summary.previous.expenseToDate += value;
      }
      continue;
    }

    if (kind === 'income') {
      summary.income += value;
      summary.dailyIncome[day - 1]! += value;
      continue;
    }
    summary.expense += value;
    summary.dailyExpense[day - 1]! += value;
    const tag = topCategory(tags, t.tag);
    const id = tag?.id ?? null;
    let category = categories.get(id);
    if (!category) {
      category = { id, title: tag?.title ?? 'Без категории', color: argbToHex(tag?.color ?? null), amount: 0 };
      categories.set(id, category);
    }
    category.amount += value;
  }

  summary.categories = [...categories.values()].sort((a, b) => b.amount - a.amount);
  return summary;
}

/**
 * The whole-month budget when it is set, otherwise the sum of category budgets.
 * A subcategory budget counts only when its parent has none, since the parent's budget already covers it.
 */
function monthBudget(data: Pick<EntityCollections, 'tag' | 'budget'>, month: MonthString): number | null {
  const tags = new Map((data.tag ?? []).map((t) => [t.id, t]));
  const budgets = (data.budget ?? []).filter((b) => b.date === dateOf(month, 1) && b.outcome > 0);
  if (budgets.length === 0) return null;
  const whole = budgets.find((b) => b.tag === WHOLE_MONTH_BUDGET);
  if (whole) return whole.outcome;
  const budgeted = new Set(budgets.map((b) => b.tag));
  return budgets
    .filter((b) => {
      const parent = b.tag === null ? null : tags.get(b.tag)?.parent;
      return !parent || !budgeted.has(parent);
    })
    .reduce((sum, b) => sum + b.outcome, 0);
}

/** ZenMoney stores colours as ARGB packed into an integer. */
function argbToHex(color: number | null): string | null {
  if (color === null) return null;
  return `#${((color >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`;
}

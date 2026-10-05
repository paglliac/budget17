import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Categorization } from './categorization.ts';
import { isIncomeModel, type Income, type IncomeInput } from './income.ts';
import type { RegularExpense, RegularExpenseInput } from './regular.ts';
import type { Envelope, Purchase, PurchaseInput, Wish, WishInput } from './week.ts';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS regular_expense (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
    start_date TEXT,
    end_date TEXT,
    icon TEXT
  ) STRICT;

  -- params holds the model's numbers as JSON, so a new model needs no migration.
  CREATE TABLE IF NOT EXISTS income (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    params TEXT NOT NULL
  ) STRICT;

  -- week is the Monday of the week the purchase is planned for.
  CREATE TABLE IF NOT EXISTS purchase (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    week TEXT NOT NULL,
    envelope TEXT NOT NULL CHECK (envelope IN ('week', 'extra')),
    done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1))
  ) STRICT;

  CREATE TABLE IF NOT EXISTS wish (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0)
  ) STRICT;

  -- ZenMoney spending moved out of its week; spending without a mark counts towards the week.
  CREATE TABLE IF NOT EXISTS spending_mark (
    transaction_id TEXT PRIMARY KEY,
    envelope TEXT NOT NULL CHECK (envelope IN ('extra', 'outside'))
  ) STRICT;

  -- ZenMoney expenses that came without a category, put into one or linked to the regular expense they paid.
  CREATE TABLE IF NOT EXISTS categorization (
    transaction_id TEXT PRIMARY KEY,
    tag_id TEXT,
    regular_expense_id INTEGER,
    CHECK ((tag_id IS NULL) <> (regular_expense_id IS NULL))
  ) STRICT;
`;

/** Columns added after their table was created: databases made before them get them on open. */
const ADDED_COLUMNS: Array<[table: string, column: string, definition: string]> = [
  ['regular_expense', 'start_date', 'TEXT'],
  ['regular_expense', 'end_date', 'TEXT'],
  ['regular_expense', 'icon', 'TEXT'],
];

/**
 * What the user sets up in the app itself: regular expenses, incomes, the weeks' purchases, wishes, where spending
 * counts and the categories of expenses that came without one. It lives in its own SQLite file, apart from the
 * ZenMoney copy, so make resync never deletes it.
 */
export class Settings {
  readonly #db: DatabaseSync;

  /** Opens or creates the database; ':memory:' keeps it in memory. */
  constructor(path: string) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.#db = new DatabaseSync(path);
    this.#db.exec(SCHEMA);
    for (const [table, column, definition] of ADDED_COLUMNS) {
      const columns = this.#db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all();
      if (!columns.some((c) => c.name === column)) this.#db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  /** Regular expenses by day of the month, then by title. */
  regularExpenses(): RegularExpense[] {
    const text = (value: unknown) => (value === null ? null : String(value));
    return this.#db
      .prepare('SELECT id, title, amount, day, start_date, end_date, icon FROM regular_expense')
      .all()
      .map((row) => ({
        id: Number(row.id),
        title: String(row.title),
        amount: Number(row.amount),
        day: Number(row.day),
        start: text(row.start_date),
        end: text(row.end_date),
        icon: text(row.icon),
      }))
      .sort((a, b) => a.day - b.day || a.title.localeCompare(b.title, 'ru'));
  }

  addRegularExpense(expense: RegularExpenseInput): RegularExpense {
    const { lastInsertRowid } = this.#db
      .prepare('INSERT INTO regular_expense (title, amount, day, start_date, end_date, icon) VALUES (?, ?, ?, ?, ?, ?)')
      .run(expense.title, expense.amount, expense.day, expense.start, expense.end, expense.icon);
    return { id: Number(lastInsertRowid), ...expense };
  }

  /** False when there is no such expense. */
  updateRegularExpense(id: number, expense: RegularExpenseInput): boolean {
    const { changes } = this.#db
      .prepare('UPDATE regular_expense SET title = ?, amount = ?, day = ?, start_date = ?, end_date = ?, icon = ? WHERE id = ?')
      .run(expense.title, expense.amount, expense.day, expense.start, expense.end, expense.icon, id);
    return Number(changes) > 0;
  }

  /** False when there is no such expense. The expenses linked to it are left without a category again. */
  deleteRegularExpense(id: number): boolean {
    this.#db.exec('BEGIN');
    try {
      this.#db.prepare('DELETE FROM categorization WHERE regular_expense_id = ?').run(id);
      const deleted = Number(this.#db.prepare('DELETE FROM regular_expense WHERE id = ?').run(id).changes) > 0;
      this.#db.exec('COMMIT');
      return deleted;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  /** Incomes by title; those of a model the app no longer has are left out. */
  incomes(): Income[] {
    return this.#db
      .prepare('SELECT id, title, model, params FROM income')
      .all()
      .flatMap((row) => {
        const model = String(row.model);
        if (!isIncomeModel(model)) return [];
        return [{ id: Number(row.id), title: String(row.title), model, params: JSON.parse(String(row.params)) as Income['params'] }];
      })
      .sort((a, b) => a.title.localeCompare(b.title, 'ru') || a.id - b.id);
  }

  addIncome(income: IncomeInput): Income {
    const { lastInsertRowid } = this.#db
      .prepare('INSERT INTO income (title, model, params) VALUES (?, ?, ?)')
      .run(income.title, income.model, JSON.stringify(income.params));
    return { id: Number(lastInsertRowid), ...income };
  }

  /** False when there is no such income. */
  updateIncome(id: number, income: IncomeInput): boolean {
    const { changes } = this.#db
      .prepare('UPDATE income SET title = ?, model = ?, params = ? WHERE id = ?')
      .run(income.title, income.model, JSON.stringify(income.params), id);
    return Number(changes) > 0;
  }

  /** False when there is no such income. */
  deleteIncome(id: number): boolean {
    return Number(this.#db.prepare('DELETE FROM income WHERE id = ?').run(id).changes) > 0;
  }

  /** Purchases by week, then in the order they were added. */
  purchases(): Purchase[] {
    return this.#db
      .prepare('SELECT id, title, amount, week, envelope, done FROM purchase ORDER BY week, id')
      .all()
      .map((row) => ({
        id: Number(row.id),
        title: String(row.title),
        amount: Number(row.amount),
        week: String(row.week),
        envelope: row.envelope === 'extra' ? 'extra' : 'week',
        done: row.done === 1,
      }));
  }

  addPurchase(purchase: PurchaseInput): Purchase {
    const { lastInsertRowid } = this.#db
      .prepare('INSERT INTO purchase (title, amount, week, envelope, done) VALUES (?, ?, ?, ?, ?)')
      .run(purchase.title, purchase.amount, purchase.week, purchase.envelope, purchase.done ? 1 : 0);
    return { id: Number(lastInsertRowid), ...purchase };
  }

  /** False when there is no such purchase. */
  updatePurchase(id: number, changes: Partial<PurchaseInput>): boolean {
    const purchase = this.purchases().find((p) => p.id === id);
    if (!purchase) return false;
    const next = { ...purchase, ...changes };
    this.#db
      .prepare('UPDATE purchase SET title = ?, amount = ?, week = ?, envelope = ?, done = ? WHERE id = ?')
      .run(next.title, next.amount, next.week, next.envelope, next.done ? 1 : 0, id);
    return true;
  }

  /** False when there is no such purchase. */
  deletePurchase(id: number): boolean {
    return Number(this.#db.prepare('DELETE FROM purchase WHERE id = ?').run(id).changes) > 0;
  }

  /** Wishes in the order they were added. */
  wishes(): Wish[] {
    return this.#db
      .prepare('SELECT id, title, amount FROM wish ORDER BY id')
      .all()
      .map((row) => ({ id: Number(row.id), title: String(row.title), amount: Number(row.amount) }));
  }

  addWish(wish: WishInput): Wish {
    const { lastInsertRowid } = this.#db.prepare('INSERT INTO wish (title, amount) VALUES (?, ?)').run(wish.title, wish.amount);
    return { id: Number(lastInsertRowid), ...wish };
  }

  /** False when there is no such wish. */
  updateWish(id: number, wish: WishInput): boolean {
    return Number(this.#db.prepare('UPDATE wish SET title = ?, amount = ? WHERE id = ?').run(wish.title, wish.amount, id).changes) > 0;
  }

  /** False when there is no such wish. */
  deleteWish(id: number): boolean {
    return Number(this.#db.prepare('DELETE FROM wish WHERE id = ?').run(id).changes) > 0;
  }

  /** Turns a wish into a purchase of the given week, in one transaction; null when there is no such wish. */
  planWish(id: number, target: Pick<Purchase, 'week' | 'envelope'>): Purchase | null {
    const wish = this.wishes().find((w) => w.id === id);
    if (!wish) return null;
    this.#db.exec('BEGIN');
    try {
      this.deleteWish(id);
      const purchase = this.addPurchase({ title: wish.title, amount: wish.amount, ...target, done: false });
      this.#db.exec('COMMIT');
      return purchase;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  /** Envelopes of spending moved out of its week, by ZenMoney transaction id. */
  spendingMarks(): Map<string, Envelope> {
    return new Map(
      this.#db
        .prepare('SELECT transaction_id, envelope FROM spending_mark')
        .all()
        .map((row) => [String(row.transaction_id), row.envelope === 'extra' ? 'extra' : 'outside']),
    );
  }

  /** Moves spending to an envelope; 'week' removes the mark, since that is where spending counts by default. */
  markSpending(transactionId: string, envelope: Envelope): void {
    if (envelope === 'week') {
      this.#db.prepare('DELETE FROM spending_mark WHERE transaction_id = ?').run(transactionId);
    } else {
      this.#db
        .prepare('INSERT INTO spending_mark (transaction_id, envelope) VALUES (?, ?) ON CONFLICT (transaction_id) DO UPDATE SET envelope = excluded.envelope')
        .run(transactionId, envelope);
    }
  }

  /** Where the user put expenses that came without a category, by ZenMoney transaction id. */
  categorizations(): Map<string, Categorization> {
    return new Map(
      this.#db
        .prepare('SELECT transaction_id, tag_id, regular_expense_id FROM categorization')
        .all()
        .map((row): [string, Categorization] => [
          String(row.transaction_id),
          row.tag_id === null ? { regular: Number(row.regular_expense_id) } : { tag: String(row.tag_id) },
        ]),
    );
  }

  /** Puts an expense into a category or links it to a regular expense; null leaves it without a category again. */
  categorize(transactionId: string, categorization: Categorization | null): void {
    if (categorization === null) {
      this.#db.prepare('DELETE FROM categorization WHERE transaction_id = ?').run(transactionId);
      return;
    }
    const [tag, regular] = 'tag' in categorization ? [categorization.tag, null] : [null, categorization.regular];
    this.#db
      .prepare(
        'INSERT INTO categorization (transaction_id, tag_id, regular_expense_id) VALUES (?, ?, ?) ON CONFLICT (transaction_id) DO UPDATE SET tag_id = excluded.tag_id, regular_expense_id = excluded.regular_expense_id',
      )
      .run(transactionId, tag, regular);
  }

  [Symbol.dispose](): void {
    this.#db.close();
  }
}

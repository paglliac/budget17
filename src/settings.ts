import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { OWN_CATEGORY_PREFIX, type CategorySetup, type OwnCategory } from './categories.ts';
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

  -- ZenMoney expenses linked to the purchase planned in a week that they paid. They keep their category, but an
  -- expense that paid a regular expense paid no purchase.
  CREATE TABLE IF NOT EXISTS purchase_payment (
    transaction_id TEXT PRIMARY KEY,
    purchase_id INTEGER NOT NULL
  ) STRICT;

  -- ZenMoney spending the user said not to count at all, such as cash taken out that is only lying in a drawer.
  CREATE TABLE IF NOT EXISTS ignored_spending (
    transaction_id TEXT PRIMARY KEY
  ) STRICT;

  -- ZenMoney categories as the user changed them in the app: a title of their own, or hidden when sorting expenses.
  CREATE TABLE IF NOT EXISTS category_change (
    tag_id TEXT PRIMARY KEY,
    title TEXT,
    hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))
  ) STRICT;

  -- Categories the user added in the app; expenses are put into one as own-<id>. Ids are never reused.
  CREATE TABLE IF NOT EXISTS own_category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))
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
 * counts, what expenses paid or which category they go into, and the categories themselves. It lives in its own
 * SQLite file, apart from the ZenMoney copy, so make resync never deletes it.
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
    return this.#transaction(() => {
      this.#db.prepare('DELETE FROM categorization WHERE regular_expense_id = ?').run(id);
      return Number(this.#db.prepare('DELETE FROM regular_expense WHERE id = ?').run(id).changes) > 0;
    });
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

  /** False when there is no such purchase. The expenses that paid it are left unsorted again. */
  deletePurchase(id: number): boolean {
    return this.#transaction(() => {
      this.#db.prepare('DELETE FROM purchase_payment WHERE purchase_id = ?').run(id);
      return Number(this.#db.prepare('DELETE FROM purchase WHERE id = ?').run(id).changes) > 0;
    });
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
    return this.#transaction(() => {
      this.deleteWish(id);
      return this.addPurchase({ title: wish.title, amount: wish.amount, ...target, done: false });
    });
  }

  /** Envelopes of spending moved out of where it counts by default, or not counted at all, by ZenMoney transaction id. */
  spendingMarks(): Map<string, Envelope> {
    const marks = this.#db
      .prepare('SELECT transaction_id, envelope FROM spending_mark')
      .all()
      .map((row): [string, Envelope] => [String(row.transaction_id), row.envelope === 'extra' ? 'extra' : 'outside']);
    const ignored = this.#db
      .prepare('SELECT transaction_id FROM ignored_spending')
      .all()
      .map((row): [string, Envelope] => [String(row.transaction_id), 'ignored']);
    return new Map([...marks, ...ignored]);
  }

  /** Moves spending to an envelope; 'week' removes the mark, since that is where spending counts by default. */
  markSpending(transactionId: string, envelope: Envelope): void {
    this.#transaction(() => {
      this.#db.prepare('DELETE FROM spending_mark WHERE transaction_id = ?').run(transactionId);
      this.#db.prepare('DELETE FROM ignored_spending WHERE transaction_id = ?').run(transactionId);
      if (envelope === 'ignored') this.#db.prepare('INSERT INTO ignored_spending (transaction_id) VALUES (?)').run(transactionId);
      else if (envelope !== 'week') this.#db.prepare('INSERT INTO spending_mark (transaction_id, envelope) VALUES (?, ?)').run(transactionId, envelope);
    });
  }

  /** Where the user put expenses: a category or the regular expense they paid, by ZenMoney transaction id. */
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

  /**
   * Puts an expense into a category or links it to a regular expense, replacing what it had; null leaves it without
   * either again. An expense that paid a regular expense paid no purchase.
   */
  categorize(transactionId: string, categorization: Categorization | null): void {
    this.#transaction(() => {
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
      if (regular !== null) this.#db.prepare('DELETE FROM purchase_payment WHERE transaction_id = ?').run(transactionId);
    });
  }

  /** The purchases expenses paid: purchase id by ZenMoney transaction id. */
  purchasePayments(): Map<string, number> {
    return new Map(
      this.#db
        .prepare('SELECT transaction_id, purchase_id FROM purchase_payment')
        .all()
        .map((row) => [String(row.transaction_id), Number(row.purchase_id)] as const),
    );
  }

  /**
   * Links an expense to the purchase it paid, keeping its category but not a link to a regular expense; null unlinks
   * it.
   */
  linkPurchase(transactionId: string, purchaseId: number | null): void {
    this.#transaction(() => {
      this.#db.prepare('DELETE FROM purchase_payment WHERE transaction_id = ?').run(transactionId);
      if (purchaseId === null) return;
      this.#db.prepare('INSERT INTO purchase_payment (transaction_id, purchase_id) VALUES (?, ?)').run(transactionId, purchaseId);
      this.#db.prepare('DELETE FROM categorization WHERE transaction_id = ? AND regular_expense_id IS NOT NULL').run(transactionId);
    });
  }

  /** ZenMoney categories the user renamed or hid, and their own categories by title. */
  categorySetup(): CategorySetup {
    const changes = new Map(
      this.#db
        .prepare('SELECT tag_id, title, hidden FROM category_change')
        .all()
        .map((row) => [String(row.tag_id), { title: row.title === null ? null : String(row.title), hidden: row.hidden === 1 }] as const),
    );
    const own = this.#db
      .prepare('SELECT id, title, hidden FROM own_category')
      .all()
      .map((row): OwnCategory => ({ id: `${OWN_CATEGORY_PREFIX}${Number(row.id)}`, title: String(row.title), hidden: row.hidden === 1 }))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    return { changes, own };
  }

  addOwnCategory(title: string): OwnCategory {
    const { lastInsertRowid } = this.#db.prepare('INSERT INTO own_category (title) VALUES (?)').run(title);
    return { id: `${OWN_CATEGORY_PREFIX}${Number(lastInsertRowid)}`, title, hidden: false };
  }

  /**
   * Gives a category a title: one of the user's own needs it, a ZenMoney one goes back to ZenMoney's title with null.
   * False when there is no such own category.
   */
  renameCategory(id: string, title: string | null): boolean {
    const own = ownId(id);
    if (own !== null) {
      return title !== null && Number(this.#db.prepare('UPDATE own_category SET title = ? WHERE id = ?').run(title, own).changes) > 0;
    }
    this.#db
      .prepare('INSERT INTO category_change (tag_id, title) VALUES (?, ?) ON CONFLICT (tag_id) DO UPDATE SET title = excluded.title')
      .run(id, title);
    return true;
  }

  /** Hides a category from sorting or shows it again. False when there is no such own category. */
  hideCategory(id: string, hidden: boolean): boolean {
    const own = ownId(id);
    if (own !== null) return Number(this.#db.prepare('UPDATE own_category SET hidden = ? WHERE id = ?').run(hidden ? 1 : 0, own).changes) > 0;
    this.#db
      .prepare('INSERT INTO category_change (tag_id, hidden) VALUES (?, ?) ON CONFLICT (tag_id) DO UPDATE SET hidden = excluded.hidden')
      .run(id, hidden ? 1 : 0);
    return true;
  }

  /** Deletes one of the user's own categories; the expenses put into it are left without a category again. */
  deleteOwnCategory(id: string): boolean {
    const own = ownId(id);
    if (own === null) return false;
    return this.#transaction(() => {
      this.#db.prepare('DELETE FROM categorization WHERE tag_id = ?').run(id);
      return Number(this.#db.prepare('DELETE FROM own_category WHERE id = ?').run(own).changes) > 0;
    });
  }

  #transaction<T>(run: () => T): T {
    this.#db.exec('BEGIN');
    try {
      const result = run();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  [Symbol.dispose](): void {
    this.#db.close();
  }
}

/** The number of an own category from its id, own-3; null for a ZenMoney category. */
function ownId(id: string): number | null {
  const number = id.startsWith(OWN_CATEGORY_PREFIX) ? id.slice(OWN_CATEGORY_PREFIX.length) : '';
  return /^\d+$/.test(number) ? Number(number) : null;
}

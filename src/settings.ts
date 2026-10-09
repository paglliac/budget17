import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { OWN_CATEGORY_PREFIX, type CategoryKind, type CategorySetup, type OwnCategory, type Subcategory, type SubcategorySetup } from './categories.ts';
import type { Categorization } from './categorization.ts';
import type { ClaudeAnswer, ClaudeDecision, ClaudeReview, ClaudeSaved } from './claude-review.ts';
import type { MonthString } from './dates.ts';
import { isIncomeModel, type Income, type IncomeInput } from './income.ts';
import type { RegularExpense, RegularExpenseInput } from './regular.ts';
import { alignWeek, type Envelope, type Purchase, type PurchaseInput, type WeekStart, type Wish, type WishInput } from './week.ts';
import type { DateString, TagId } from './zenmoney/types.ts';

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

  -- week is the first day of the week the purchase is planned for.
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

  -- ZenMoney expenses put into a category or linked to the regular expense they paid, and incomes put into a category.
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

  -- ZenMoney spending the user said not to count at all, such as cash taken out that is only lying in a drawer, and
  -- incomes not to count, such as a debt paid back.
  CREATE TABLE IF NOT EXISTS ignored_spending (
    transaction_id TEXT PRIMARY KEY
  ) STRICT;

  -- What the user wrote about ZenMoney expenses and incomes in the app, such as whom a present was for.
  CREATE TABLE IF NOT EXISTS spending_description (
    transaction_id TEXT PRIMARY KEY,
    description TEXT NOT NULL
  ) STRICT;

  -- ZenMoney categories as the user changed them in the app: a title of their own, or hidden when sorting expenses.
  CREATE TABLE IF NOT EXISTS category_change (
    tag_id TEXT PRIMARY KEY,
    title TEXT,
    hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))
  ) STRICT;

  -- Categories the user added in the app, for expenses or for incomes (kind); operations are put into one as
  -- own-<id>. Ids are never reused.
  CREATE TABLE IF NOT EXISTS own_category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))
  ) STRICT;

  -- Parts of a category the user made in the app, such as Продукты › Лента; ZenMoney has none. Ids are never reused.
  CREATE TABLE IF NOT EXISTS subcategory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_id TEXT NOT NULL,
    title TEXT NOT NULL
  ) STRICT;

  -- A shop whose expenses in a category go into one of its subcategories by themselves, the new ones too; payee is
  -- the shop's key (shopKey in categorization.ts), so that every shop of a chain is one.
  CREATE TABLE IF NOT EXISTS payee_subcategory (
    tag_id TEXT NOT NULL,
    payee TEXT NOT NULL,
    subcategory_id INTEGER NOT NULL,
    PRIMARY KEY (tag_id, payee)
  ) STRICT;

  -- ZenMoney expenses put into a subcategory one by one, such as transfers to people; a null subcategory keeps an
  -- expense out of the one its shop goes into.
  CREATE TABLE IF NOT EXISTS spending_subcategory (
    transaction_id TEXT PRIMARY KEY,
    subcategory_id INTEGER
  ) STRICT;

  -- Suggestions of the month review the user turned down: hide:<category id> or spending:<ZenMoney transaction id>.
  CREATE TABLE IF NOT EXISTS dismissed_hint (
    hint TEXT PRIMARY KEY
  ) STRICT;

  -- Single values the user picked, such as week_start, the day a week begins on (0 for Monday), self_payee, the
  -- user's own name as banks write it in transfers to their accounts in other banks, or claude_token, the token Claude
  -- signs in by on the user's subscription.
  CREATE TABLE IF NOT EXISTS preference (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;

  -- What the user allowed for ordinary spending in a week instead of the usual limit; week is its first day.
  CREATE TABLE IF NOT EXISTS week_limit (
    week TEXT PRIMARY KEY,
    amount REAL NOT NULL CHECK (amount > 0)
  ) STRICT;

  -- Claude's review of a month (claude-review.ts): its answer as JSON, when it came, and what each expense of the
  -- month's weeks was then, as JSON of state by ZenMoney transaction id. A new answer replaces the month's.
  CREATE TABLE IF NOT EXISTS claude_review (
    month TEXT PRIMARY KEY,
    made_at TEXT NOT NULL,
    answer TEXT NOT NULL,
    seen TEXT NOT NULL
  ) STRICT;

  -- Months the user asked Claude to review again, until an answer made after asked_at comes; error says why Claude
  -- did not answer, and such a request waits until the user asks anew.
  CREATE TABLE IF NOT EXISTS claude_request (
    month TEXT PRIMARY KEY,
    asked_at TEXT NOT NULL
  ) STRICT;

  -- What the user did with Claude's word about an expense (spending:<ZenMoney transaction id>) or a category
  -- (split:<category id>): accepted, turned down, or answered with the option picked.
  CREATE TABLE IF NOT EXISTS claude_decision (
    key TEXT PRIMARY KEY,
    decision TEXT NOT NULL CHECK (decision IN ('accepted', 'declined', 'answered')),
    answer TEXT,
    decided_at TEXT NOT NULL
  ) STRICT;
`;

/** Columns added after their table was created: databases made before them get them on open. */
const ADDED_COLUMNS: Array<[table: string, column: string, definition: string]> = [
  ['regular_expense', 'start_date', 'TEXT'],
  ['regular_expense', 'end_date', 'TEXT'],
  ['regular_expense', 'icon', 'TEXT'],
  ['purchase', 'kind', "TEXT NOT NULL DEFAULT 'flexible' CHECK (kind IN ('required', 'flexible'))"],
  ['own_category', 'kind', "TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense', 'income'))"],
  ['claude_request', 'error', 'TEXT'],
];

/**
 * What the user sets up in the app itself: regular expenses, incomes, the day a week begins on, what a week allows,
 * the weeks' purchases, wishes, where spending counts, what expenses paid or which category they go into, what the
 * user wrote about them, and the categories themselves. It lives in its own
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

  /** The day a week begins on: 0 for Monday, the default, to 6 for Sunday. */
  weekStart(): WeekStart {
    const row = this.#db.prepare("SELECT value FROM preference WHERE key = 'week_start'").get();
    const start = Number(row?.value);
    return Number.isInteger(start) && start >= 0 && start <= 6 ? start : 0;
  }

  /** The user's own name as banks write it in transfers to their accounts in other banks, such as Кирилл А. */
  selfPayee(): string | null {
    const row = this.#db.prepare("SELECT value FROM preference WHERE key = 'self_payee'").get();
    return row ? String(row.value) : null;
  }

  /** Null forgets it. */
  setSelfPayee(name: string | null): void {
    if (name === null) this.#db.prepare("DELETE FROM preference WHERE key = 'self_payee'").run();
    else this.#db.prepare("INSERT INTO preference (key, value) VALUES ('self_payee', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(name);
  }

  /** The token Claude signs in by on the user's subscription, from `claude setup-token`; null when none is set. */
  claudeToken(): string | null {
    const row = this.#db.prepare("SELECT value FROM preference WHERE key = 'claude_token'").get();
    return row ? String(row.value) : null;
  }

  /** Null forgets it. */
  setClaudeToken(token: string | null): void {
    if (token === null) this.#db.prepare("DELETE FROM preference WHERE key = 'claude_token'").run();
    else this.#db.prepare("INSERT INTO preference (key, value) VALUES ('claude_token', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(token);
  }

  /**
   * Makes weeks begin on another day. Purchases and the limits of weeks move to the weeks that share most days with
   * the ones they were in, so a purchase planned for the week of 12 October stays about there.
   */
  setWeekStart(start: WeekStart): void {
    this.#transaction(() => {
      this.#db
        .prepare("INSERT INTO preference (key, value) VALUES ('week_start', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
        .run(String(start));
      const move = this.#db.prepare('UPDATE purchase SET week = ? WHERE id = ?');
      for (const p of this.purchases()) move.run(alignWeek(p.week, start), p.id);
      // Weeks map one to one, but each limit is moved apart from the others so that none overwrites one not yet moved.
      const limits = this.weekLimits();
      this.#db.prepare('DELETE FROM week_limit').run();
      const insert = this.#db.prepare('INSERT INTO week_limit (week, amount) VALUES (?, ?)');
      for (const [week, amount] of limits) insert.run(alignWeek(week, start), amount);
    });
  }

  /** What the user allowed for a week instead of the usual limit, by the week's first day, in the order of weeks. */
  weekLimits(): Map<DateString, number> {
    return new Map(
      this.#db
        .prepare('SELECT week, amount FROM week_limit ORDER BY week')
        .all()
        .map((row) => [String(row.week), Number(row.amount)] as const),
    );
  }

  /** Sets what a week allows; null gives it the usual limit back. */
  setWeekLimit(week: DateString, amount: number | null): void {
    if (amount === null) {
      this.#db.prepare('DELETE FROM week_limit WHERE week = ?').run(week);
      return;
    }
    this.#db
      .prepare('INSERT INTO week_limit (week, amount) VALUES (?, ?) ON CONFLICT (week) DO UPDATE SET amount = excluded.amount')
      .run(week, amount);
  }

  /** Purchases by week, then in the order they were added. */
  purchases(): Purchase[] {
    return this.#db
      .prepare('SELECT id, title, amount, week, envelope, kind, done FROM purchase ORDER BY week, id')
      .all()
      .map((row) => ({
        id: Number(row.id),
        title: String(row.title),
        amount: Number(row.amount),
        week: String(row.week),
        envelope: row.envelope === 'extra' ? 'extra' : 'week',
        kind: row.kind === 'required' ? 'required' : 'flexible',
        done: row.done === 1,
      }));
  }

  addPurchase(purchase: PurchaseInput): Purchase {
    const { lastInsertRowid } = this.#db
      .prepare('INSERT INTO purchase (title, amount, week, envelope, kind, done) VALUES (?, ?, ?, ?, ?, ?)')
      .run(purchase.title, purchase.amount, purchase.week, purchase.envelope, purchase.kind, purchase.done ? 1 : 0);
    return { id: Number(lastInsertRowid), ...purchase };
  }

  /** False when there is no such purchase. */
  updatePurchase(id: number, changes: Partial<PurchaseInput>): boolean {
    const purchase = this.purchases().find((p) => p.id === id);
    if (!purchase) return false;
    const next = { ...purchase, ...changes };
    this.#db
      .prepare('UPDATE purchase SET title = ?, amount = ?, week = ?, envelope = ?, kind = ?, done = ? WHERE id = ?')
      .run(next.title, next.amount, next.week, next.envelope, next.kind, next.done ? 1 : 0, id);
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
      return this.addPurchase({ title: wish.title, amount: wish.amount, ...target, kind: 'flexible', done: false });
    });
  }

  /**
   * Envelopes of spending moved out of where it counts by default, or not counted at all, by ZenMoney transaction id;
   * an income not counted is 'ignored' too.
   */
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

  /** Where the user put expenses and incomes: a category or the regular expense they paid, by ZenMoney transaction id. */
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

  /** What the user wrote about expenses and incomes, by ZenMoney transaction id. */
  spendingDescriptions(): Map<string, string> {
    return new Map(
      this.#db
        .prepare('SELECT transaction_id, description FROM spending_description')
        .all()
        .map((row) => [String(row.transaction_id), String(row.description)] as const),
    );
  }

  /** Gives an expense a description, replacing what it had; null takes it away. */
  describeSpending(transactionId: string, description: string | null): void {
    if (description === null) {
      this.#db.prepare('DELETE FROM spending_description WHERE transaction_id = ?').run(transactionId);
      return;
    }
    this.#db
      .prepare(
        'INSERT INTO spending_description (transaction_id, description) VALUES (?, ?) ON CONFLICT (transaction_id) DO UPDATE SET description = excluded.description',
      )
      .run(transactionId, description);
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
      .prepare('SELECT id, title, hidden, kind FROM own_category')
      .all()
      .map(
        (row): OwnCategory => ({
          id: `${OWN_CATEGORY_PREFIX}${Number(row.id)}`,
          title: String(row.title),
          hidden: row.hidden === 1,
          kind: row.kind === 'income' ? 'income' : 'expense',
        }),
      )
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    return { changes, own };
  }

  addOwnCategory(title: string, kind: CategoryKind = 'expense'): OwnCategory {
    const { lastInsertRowid } = this.#db.prepare('INSERT INTO own_category (title, kind) VALUES (?, ?)').run(title, kind);
    return { id: `${OWN_CATEGORY_PREFIX}${Number(lastInsertRowid)}`, title, hidden: false, kind };
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

  /**
   * Deletes one of the user's own categories with its subcategories; the operations put into it are left without a
   * category again.
   */
  deleteOwnCategory(id: string): boolean {
    const own = ownId(id);
    if (own === null) return false;
    return this.#transaction(() => {
      this.#db.prepare('DELETE FROM categorization WHERE tag_id = ?').run(id);
      for (const sub of this.subcategorySetup().subcategories.filter((s) => s.category === id)) this.#deleteSubcategory(sub.id);
      return Number(this.#db.prepare('DELETE FROM own_category WHERE id = ?').run(own).changes) > 0;
    });
  }

  /** The subcategories by title, the shops that go into them, and the expenses put into one by hand. */
  subcategorySetup(): SubcategorySetup {
    const subcategories = this.#db
      .prepare('SELECT id, tag_id, title FROM subcategory')
      .all()
      .map((row): Subcategory => ({ id: Number(row.id), category: String(row.tag_id), title: String(row.title) }))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    const shops = new Map<TagId, Map<string, number>>();
    for (const row of this.#db.prepare('SELECT tag_id, payee, subcategory_id FROM payee_subcategory').all()) {
      const category = String(row.tag_id);
      shops.set(category, (shops.get(category) ?? new Map()).set(String(row.payee), Number(row.subcategory_id)));
    }
    const spending = new Map(
      this.#db
        .prepare('SELECT transaction_id, subcategory_id FROM spending_subcategory')
        .all()
        .map((row) => [String(row.transaction_id), row.subcategory_id === null ? null : Number(row.subcategory_id)] as const),
    );
    return { subcategories, shops, spending };
  }

  /** Adds a subcategory to a category, or gives the one it has with that title in any case. */
  addSubcategory(category: TagId, title: string): Subcategory {
    const same = this.subcategorySetup().subcategories.find(
      (s) => s.category === category && s.title.toLocaleLowerCase('ru') === title.toLocaleLowerCase('ru'),
    );
    if (same) return same;
    const { lastInsertRowid } = this.#db.prepare('INSERT INTO subcategory (tag_id, title) VALUES (?, ?)').run(category, title);
    return { id: Number(lastInsertRowid), category, title };
  }

  /** False when there is no such subcategory. */
  renameSubcategory(id: number, title: string): boolean {
    return Number(this.#db.prepare('UPDATE subcategory SET title = ? WHERE id = ?').run(title, id).changes) > 0;
  }

  /** False when there is no such subcategory. The shops and expenses put into it are left without one again. */
  deleteSubcategory(id: number): boolean {
    return this.#transaction(() => this.#deleteSubcategory(id));
  }

  #deleteSubcategory(id: number): boolean {
    this.#db.prepare('DELETE FROM payee_subcategory WHERE subcategory_id = ?').run(id);
    this.#db.prepare('DELETE FROM spending_subcategory WHERE subcategory_id = ?').run(id);
    return Number(this.#db.prepare('DELETE FROM subcategory WHERE id = ?').run(id).changes) > 0;
  }

  /** Sends a shop's expenses in a category into a subcategory; null leaves them without one again. */
  putShop(category: TagId, shop: string, subcategory: number | null): void {
    if (subcategory === null) {
      this.#db.prepare('DELETE FROM payee_subcategory WHERE tag_id = ? AND payee = ?').run(category, shop);
      return;
    }
    this.#db
      .prepare(
        'INSERT INTO payee_subcategory (tag_id, payee, subcategory_id) VALUES (?, ?, ?) ON CONFLICT (tag_id, payee) DO UPDATE SET subcategory_id = excluded.subcategory_id',
      )
      .run(category, shop, subcategory);
  }

  /**
   * Puts an expense into a subcategory whatever its shop's is; null keeps it out of any, and undefined forgets what it
   * had, so that it goes with its shop again.
   */
  putSpending(transactionId: string, subcategory: number | null | undefined): void {
    if (subcategory === undefined) {
      this.#db.prepare('DELETE FROM spending_subcategory WHERE transaction_id = ?').run(transactionId);
      return;
    }
    this.#db
      .prepare(
        'INSERT INTO spending_subcategory (transaction_id, subcategory_id) VALUES (?, ?) ON CONFLICT (transaction_id) DO UPDATE SET subcategory_id = excluded.subcategory_id',
      )
      .run(transactionId, subcategory);
  }

  /** Suggestions the user turned down, as the month review names them. */
  dismissedHints(): Set<string> {
    return new Set(this.#db.prepare('SELECT hint FROM dismissed_hint ORDER BY hint').all().map((row) => String(row.hint)));
  }

  dismissHints(hints: readonly string[]): void {
    const insert = this.#db.prepare('INSERT OR IGNORE INTO dismissed_hint (hint) VALUES (?)');
    this.#transaction(() => {
      for (const hint of hints) insert.run(hint);
    });
  }

  /** Claude's review of a month, whether the user asked for another, and what the user did with Claude's word. */
  claude(month: MonthString): ClaudeSaved {
    const row = this.#db.prepare('SELECT made_at, answer, seen FROM claude_review WHERE month = ?').get(month);
    const asked = this.#db.prepare('SELECT asked_at, error FROM claude_request WHERE month = ?').get(month);
    const review: ClaudeReview | null = row
      ? {
          month,
          madeAt: String(row.made_at),
          answer: JSON.parse(String(row.answer)) as ClaudeAnswer,
          seen: new Map(Object.entries(JSON.parse(String(row.seen)) as Record<string, string>)),
        }
      : null;
    return {
      review,
      askedAt: asked ? String(asked.asked_at) : null,
      failed: asked?.error == null ? null : String(asked.error),
      decisions: this.claudeDecisions(),
    };
  }

  /** Keeps Claude's review of its month, replacing the one before; a request made before it is answered by it. */
  saveClaudeReview(review: ClaudeReview): void {
    this.#transaction(() => {
      this.#db
        .prepare(
          'INSERT INTO claude_review (month, made_at, answer, seen) VALUES (?, ?, ?, ?) ON CONFLICT (month) DO UPDATE SET made_at = excluded.made_at, answer = excluded.answer, seen = excluded.seen',
        )
        .run(review.month, review.madeAt, JSON.stringify(review.answer), JSON.stringify(Object.fromEntries(review.seen)));
      this.#db.prepare('DELETE FROM claude_request WHERE month = ? AND asked_at <= ?').run(review.month, review.madeAt);
    });
  }

  /** Asks Claude to review a month (again) as of `at`, an ISO time, forgetting a failure; null takes the request back. */
  requestClaudeReview(month: MonthString, at: string | null): void {
    if (at === null) {
      this.#db.prepare('DELETE FROM claude_request WHERE month = ?').run(month);
      return;
    }
    this.#db
      .prepare('INSERT INTO claude_request (month, asked_at, error) VALUES (?, ?, NULL) ON CONFLICT (month) DO UPDATE SET asked_at = excluded.asked_at, error = NULL')
      .run(month, at);
  }

  /** Keeps why Claude did not answer the request about a month; the request then waits until the user asks anew. */
  failClaudeRequest(month: MonthString, error: string): void {
    this.#db.prepare('UPDATE claude_request SET error = ? WHERE month = ?').run(error, month);
  }

  /** The months Claude was asked to review and has not answered nor failed to, with when, the earliest asked first. */
  claudeRequests(): Array<{ month: MonthString; askedAt: string }> {
    return this.#db
      .prepare('SELECT month, asked_at FROM claude_request WHERE error IS NULL ORDER BY asked_at')
      .all()
      .map((row) => ({ month: String(row.month), askedAt: String(row.asked_at) }));
  }

  /** What the user did with Claude's word, by spending:<id> or split:<category id>. */
  claudeDecisions(): Map<string, ClaudeDecision> {
    return new Map(
      this.#db
        .prepare('SELECT key, decision, answer FROM claude_decision')
        .all()
        .map((row): [string, ClaudeDecision] => [
          String(row.key),
          { decision: String(row.decision) as ClaudeDecision['decision'], answer: row.answer === null ? null : String(row.answer) },
        ]),
    );
  }

  /** Keeps what the user did with Claude's word about each of `keys`, replacing what was kept; `at` is an ISO time. */
  decideClaude(keys: readonly string[], decision: ClaudeDecision, at: string): void {
    const upsert = this.#db.prepare(
      'INSERT INTO claude_decision (key, decision, answer, decided_at) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET decision = excluded.decision, answer = excluded.answer, decided_at = excluded.decided_at',
    );
    this.#transaction(() => {
      for (const key of keys) upsert.run(key, decision.decision, decision.answer, at);
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

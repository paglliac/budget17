import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  OWN_CATEGORY_PREFIX,
  type CategoryKind,
  type CategoryLook,
  type CategoryPhoto,
  type CategorySetup,
  type OwnCategory,
  type Subcategory,
  type SubcategorySetup,
} from './categories.ts';
import type { Categorization } from './categorization.ts';
import type { ClaudeAnswer, ClaudeDecision, ClaudeReview, ClaudeSaved } from './claude-review.ts';
import type { MonthString } from './dates.ts';
import { isIncomeModel, type Income, type IncomeInput } from './income.ts';
import type { RegularExpense, RegularExpenseInput } from './regular.ts';
import type { ShopLook, ShopSetup } from './shops.ts';
import { alignWeek, type Envelope, type Purchase, type PurchaseInput, type WeekStart, type Wish, type WishInput } from './week.ts';
import type { ChosenPlan, Step } from './wish-plans.ts';
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

  -- due is the day the wish is needed by; ways and buy_week are those of the plan chosen for it (wish-plans.ts), whose
  -- steps are in wish_step.
  CREATE TABLE IF NOT EXISTS wish (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0)
  ) STRICT;

  -- Steps of the plans chosen for wishes: money held in a week (kind week, from the week's money, or extra, from its
  -- month's extras), taken from a month's savings, or a flexible purchase moved from week to to_week; way is the way
  -- it comes from.
  CREATE TABLE IF NOT EXISTS wish_step (
    id INTEGER PRIMARY KEY,
    wish_id INTEGER NOT NULL,
    way TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('week', 'extra', 'savings', 'move')),
    week TEXT,
    month TEXT,
    amount REAL NOT NULL,
    purchase_id INTEGER,
    to_week TEXT
  ) STRICT;

  -- ZenMoney expenses that bought a wish. They count outside the budget, since the wish's plan held their money.
  CREATE TABLE IF NOT EXISTS wish_payment (
    transaction_id TEXT PRIMARY KEY,
    wish_id INTEGER NOT NULL
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

  -- ZenMoney expenses the user said could have been done without, to see what could have been saved; the others were
  -- needed. Only the user marks them: a purchase being flexible says it can move, not that it was not needed.
  CREATE TABLE IF NOT EXISTS optional_spending (
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

  -- How the user dressed a category in the app, ZenMoney's or their own, by its id: an icon by name, a colour as a
  -- tone's name or #rrggbb, and a photo shown instead of the icon, a JPEG or PNG with its version, which changes with
  -- it. A null keeps what the category would have.
  CREATE TABLE IF NOT EXISTS category_look (
    tag_id TEXT PRIMARY KEY,
    icon TEXT,
    color TEXT,
    photo BLOB,
    photo_type TEXT CHECK (photo_type IN ('image/jpeg', 'image/png')),
    photo_version TEXT,
    CHECK ((photo IS NULL) = (photo_type IS NULL) AND (photo IS NULL) = (photo_version IS NULL))
  ) STRICT;

  -- How the user named and dressed a shop, by its key (shopOf in payees.ts), so that every shop of a chain is one: a
  -- name, the site its logo comes from (empty for none), and a photo shown instead of the logo, a JPEG or PNG with its
  -- version, which changes with it. A null keeps what the shop would have.
  CREATE TABLE IF NOT EXISTS shop_look (
    shop TEXT PRIMARY KEY,
    title TEXT,
    site TEXT,
    photo BLOB,
    photo_type TEXT CHECK (photo_type IN ('image/jpeg', 'image/png')),
    photo_version TEXT,
    CHECK ((photo IS NULL) = (photo_type IS NULL) AND (photo IS NULL) = (photo_version IS NULL))
  ) STRICT;

  -- Shops the user merged into another, by key: their operations are of that shop, named and drawn as it is. A shop
  -- merged into is never merged itself, so a root always stands alone.
  CREATE TABLE IF NOT EXISTS shop_merge (
    shop TEXT PRIMARY KEY,
    root TEXT NOT NULL,
    CHECK (shop <> root)
  ) STRICT;

  -- Icons of shops' sites as Yandex's service of site icons sent them (see shops.ts), a PNG with its version; none
  -- when the service has no icon of the site. asked_at says when it was asked, so a site without one is asked again
  -- some days later.
  CREATE TABLE IF NOT EXISTS site_icon (
    site TEXT PRIMARY KEY,
    icon BLOB,
    version TEXT,
    asked_at TEXT NOT NULL,
    CHECK ((icon IS NULL) = (version IS NULL))
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
  -- user's own name as banks write it in transfers to their accounts in other banks, claude_token, the token Claude
  -- signs in by on the user's subscription, or round_figures, 1 when the app's main page shows round figures.
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
  ['wish', 'due', 'TEXT'],
  ['wish', 'ways', 'TEXT'],
  ['wish', 'buy_week', 'TEXT'],
];

/**
 * What the user sets up in the app itself: regular expenses, incomes, the day a week begins on, what a week allows,
 * the weeks' purchases, wishes with their days and plans, where spending counts, what expenses paid or bought or which category they go into, which could
 * have been done without, what the user wrote about them, the categories themselves with their icons, colours and photos, and the names, logos and
 * merges of shops, with the icons of their sites kept. It lives in its own SQLite file, apart from the ZenMoney copy, so make resync never deletes it.
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

  /** Whether the app's main page shows its figures to the hundred; off unless the user turned it on. */
  roundFigures(): boolean {
    return this.#db.prepare("SELECT value FROM preference WHERE key = 'round_figures'").get()?.value === '1';
  }

  setRoundFigures(on: boolean): void {
    if (on) this.#db.prepare("INSERT INTO preference (key, value) VALUES ('round_figures', '1') ON CONFLICT (key) DO UPDATE SET value = excluded.value").run();
    else this.#db.prepare("DELETE FROM preference WHERE key = 'round_figures'").run();
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
      const steps = this.#db.prepare('SELECT id, week, to_week FROM wish_step WHERE week IS NOT NULL').all();
      const moveStep = this.#db.prepare('UPDATE wish_step SET week = ?, to_week = ? WHERE id = ?');
      for (const s of steps) moveStep.run(alignWeek(String(s.week), start), s.to_week === null ? null : alignWeek(String(s.to_week), start), Number(s.id));
      const wishes = this.#db.prepare('SELECT id, buy_week FROM wish WHERE buy_week IS NOT NULL').all();
      const moveWish = this.#db.prepare('UPDATE wish SET buy_week = ? WHERE id = ?');
      for (const w of wishes) moveWish.run(alignWeek(String(w.buy_week), start), Number(w.id));
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
      .prepare('SELECT id, title, amount, due FROM wish ORDER BY id')
      .all()
      .map((row) => ({ id: Number(row.id), title: String(row.title), amount: Number(row.amount), due: row.due === null ? null : String(row.due) }));
  }

  addWish(wish: WishInput): Wish {
    const { lastInsertRowid } = this.#db.prepare('INSERT INTO wish (title, amount) VALUES (?, ?)').run(wish.title, wish.amount);
    return { id: Number(lastInsertRowid), ...wish, due: null };
  }

  /** False when there is no such wish. Its plan stays as chosen. */
  updateWish(id: number, wish: WishInput): boolean {
    return Number(this.#db.prepare('UPDATE wish SET title = ?, amount = ? WHERE id = ?').run(wish.title, wish.amount, id).changes) > 0;
  }

  /** Sets the day a wish is needed by; false when there is no such wish. Its plan stays as chosen. */
  setWishDue(id: number, due: DateString | null): boolean {
    return Number(this.#db.prepare('UPDATE wish SET due = ? WHERE id = ?').run(due, id).changes) > 0;
  }

  /** False when there is no such wish. Its plan goes, the purchases it moved back, and its expenses are left unsorted. */
  deleteWish(id: number): boolean {
    return this.#transaction(() => {
      this.dropWishPlan(id);
      this.#db.prepare('DELETE FROM wish_payment WHERE wish_id = ?').run(id);
      return Number(this.#db.prepare('DELETE FROM wish WHERE id = ?').run(id).changes) > 0;
    });
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

  /** The plans chosen for wishes, by wish id. */
  wishPlans(): Map<number, ChosenPlan> {
    const plans = new Map<number, ChosenPlan>();
    for (const row of this.#db.prepare('SELECT id, ways, buy_week FROM wish WHERE ways IS NOT NULL AND buy_week IS NOT NULL').all()) {
      plans.set(Number(row.id), { ways: String(row.ways), buyWeek: String(row.buy_week), steps: [] });
    }
    for (const row of this.#db.prepare('SELECT wish_id, way, kind, week, month, amount, purchase_id, to_week FROM wish_step ORDER BY id').all()) {
      const plan = plans.get(Number(row.wish_id));
      if (!plan) continue;
      const way = String(row.way);
      const amount = Number(row.amount);
      const step: Step =
        row.kind === 'savings'
          ? { way, kind: 'savings', month: String(row.month), amount }
          : row.kind === 'move'
            ? { way, kind: 'move', purchase: Number(row.purchase_id), from: String(row.week), to: String(row.to_week), amount }
            : { way, kind: row.kind === 'extra' ? 'extra' : 'week', week: String(row.week), amount };
      plan.steps.push(step);
    }
    return plans;
  }

  /**
   * Keeps the plan chosen for a wish instead of the one it had, and moves the purchases it moves; false when there is
   * no such wish.
   */
  chooseWishPlan(id: number, plan: ChosenPlan): boolean {
    return this.#transaction(() => {
      if (!this.wishes().some((w) => w.id === id)) return false;
      this.dropWishPlan(id);
      this.#db.prepare('UPDATE wish SET ways = ?, buy_week = ? WHERE id = ?').run(plan.ways, plan.buyWeek, id);
      const insert = this.#db.prepare('INSERT INTO wish_step (wish_id, way, kind, week, month, amount, purchase_id, to_week) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      const move = this.#db.prepare('UPDATE purchase SET week = ? WHERE id = ? AND week = ?');
      for (const step of plan.steps) {
        if (step.kind === 'savings') insert.run(id, step.way, step.kind, null, step.month, step.amount, null, null);
        else if (step.kind === 'move') {
          insert.run(id, step.way, step.kind, step.from, null, step.amount, step.purchase, step.to);
          move.run(step.to, step.purchase, step.from);
        } else insert.run(id, step.way, step.kind, step.week, null, step.amount, null, null);
      }
      return true;
    });
  }

  /** Forgets the plan chosen for a wish; the purchases it moved go back, unless they were moved again since. */
  dropWishPlan(id: number): void {
    this.#transaction(() => {
      const moves = this.#db.prepare("SELECT purchase_id, week, to_week FROM wish_step WHERE wish_id = ? AND kind = 'move'").all(id);
      const back = this.#db.prepare('UPDATE purchase SET week = ? WHERE id = ? AND week = ?');
      for (const m of moves) back.run(String(m.week), Number(m.purchase_id), String(m.to_week));
      this.#db.prepare('DELETE FROM wish_step WHERE wish_id = ?').run(id);
      this.#db.prepare('UPDATE wish SET ways = NULL, buy_week = NULL WHERE id = ?').run(id);
    });
  }

  /** The wishes expenses bought: wish id by ZenMoney transaction id. */
  wishPayments(): Map<string, number> {
    return new Map(
      this.#db
        .prepare('SELECT transaction_id, wish_id FROM wish_payment')
        .all()
        .map((row) => [String(row.transaction_id), Number(row.wish_id)] as const),
    );
  }

  /** Says an expense bought a wish, instead of paying a purchase or a regular expense; null unlinks it. */
  linkWish(transactionId: string, wishId: number | null): void {
    this.#transaction(() => {
      this.#db.prepare('DELETE FROM wish_payment WHERE transaction_id = ?').run(transactionId);
      if (wishId === null) return;
      this.#db.prepare('INSERT INTO wish_payment (transaction_id, wish_id) VALUES (?, ?)').run(transactionId, wishId);
      this.#db.prepare('DELETE FROM purchase_payment WHERE transaction_id = ?').run(transactionId);
      this.#db.prepare('DELETE FROM categorization WHERE transaction_id = ? AND regular_expense_id IS NOT NULL').run(transactionId);
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

  /** Expenses the user said could have been done without, by ZenMoney transaction id. */
  optionalSpending(): Set<string> {
    return new Set(this.#db.prepare('SELECT transaction_id FROM optional_spending').all().map((row) => String(row.transaction_id)));
  }

  /** Says an expense could have been done without, or takes that back. */
  markOptional(transactionId: string, optional: boolean): void {
    if (optional) this.#db.prepare('INSERT OR IGNORE INTO optional_spending (transaction_id) VALUES (?)').run(transactionId);
    else this.#db.prepare('DELETE FROM optional_spending WHERE transaction_id = ?').run(transactionId);
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
      if (regular !== null) {
        this.#db.prepare('DELETE FROM purchase_payment WHERE transaction_id = ?').run(transactionId);
        this.#db.prepare('DELETE FROM wish_payment WHERE transaction_id = ?').run(transactionId);
      }
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
      this.#db.prepare('DELETE FROM wish_payment WHERE transaction_id = ?').run(transactionId);
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

  /** ZenMoney categories the user renamed or hid, their own categories by title, and how the user dressed them. */
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
    const text = (value: unknown) => (value === null ? null : String(value));
    const looks = new Map(
      this.#db
        .prepare('SELECT tag_id, icon, color, photo_version FROM category_look')
        .all()
        .map((row) => [String(row.tag_id), { icon: text(row.icon), color: text(row.color), photo: text(row.photo_version) }] as const),
    );
    return { changes, own, looks };
  }

  /** Gives a category an icon and a colour; null leaves it the one it would have. */
  dressCategory(id: TagId, look: Pick<CategoryLook, 'icon' | 'color'>): void {
    this.#db
      .prepare('INSERT INTO category_look (tag_id, icon, color) VALUES (?, ?, ?) ON CONFLICT (tag_id) DO UPDATE SET icon = excluded.icon, color = excluded.color')
      .run(id, look.icon, look.color);
  }

  /** Puts a photo on a category instead of its icon, or takes it off with null. */
  setCategoryPhoto(id: TagId, photo: CategoryPhoto | null): void {
    const version = photo ? createHash('sha1').update(photo.data).digest('hex').slice(0, 12) : null;
    this.#db
      .prepare(
        'INSERT INTO category_look (tag_id, photo, photo_type, photo_version) VALUES (?, ?, ?, ?) ON CONFLICT (tag_id) DO UPDATE SET photo = excluded.photo, photo_type = excluded.photo_type, photo_version = excluded.photo_version',
      )
      .run(id, photo?.data ?? null, photo?.type ?? null, version);
  }

  /** The photo put on a category; null when it has none. */
  categoryPhoto(id: TagId): CategoryPhoto | null {
    const row = this.#db.prepare('SELECT photo, photo_type FROM category_look WHERE tag_id = ? AND photo IS NOT NULL').get(id);
    return row ? { type: row.photo_type === 'image/png' ? 'image/png' : 'image/jpeg', data: row.photo as Uint8Array } : null;
  }

  /** How the user named, dressed and merged shops, and the versions of the sites' icons kept so far. */
  shopSetup(): ShopSetup {
    const text = (value: unknown) => (value === null ? null : String(value));
    const looks = new Map(
      this.#db
        .prepare('SELECT shop, title, site, photo_version FROM shop_look')
        .all()
        .map((row) => [String(row.shop), { title: text(row.title), site: text(row.site), photo: text(row.photo_version) }] as const),
    );
    const icons = new Map(
      this.#db
        .prepare('SELECT site, version FROM site_icon WHERE version IS NOT NULL')
        .all()
        .map((row) => [String(row.site), String(row.version)] as const),
    );
    const merges = new Map(this.#db.prepare('SELECT shop, root FROM shop_merge').all().map((row) => [String(row.shop), String(row.root)] as const));
    return { looks, icons, merges };
  }

  /**
   * Merges a shop into another, or into the one that other is merged into, along with the shops merged into it; a
   * shop is not merged into itself.
   */
  mergeShop(shop: string, into: string): void {
    const found = this.#db.prepare('SELECT root FROM shop_merge WHERE shop = ?').get(into);
    const root = found ? String(found.root) : into;
    if (root === shop) return;
    this.#db.prepare('UPDATE shop_merge SET root = ? WHERE root = ?').run(root, shop);
    this.#db.prepare('INSERT INTO shop_merge (shop, root) VALUES (?, ?) ON CONFLICT (shop) DO UPDATE SET root = excluded.root').run(shop, root);
  }

  /** Takes a shop out of the one it was merged into, with the name and look it had before. */
  splitShop(shop: string): void {
    this.#db.prepare('DELETE FROM shop_merge WHERE shop = ?').run(shop);
  }

  /** Names a shop and gives it the site its logo comes from, empty for none; null leaves either what it would be. */
  dressShop(shop: string, look: Pick<ShopLook, 'title' | 'site'>): void {
    this.#db
      .prepare('INSERT INTO shop_look (shop, title, site) VALUES (?, ?, ?) ON CONFLICT (shop) DO UPDATE SET title = excluded.title, site = excluded.site')
      .run(shop, look.title, look.site);
  }

  /** Puts a photo on a shop instead of its logo, or takes it off with null. */
  setShopPhoto(shop: string, photo: CategoryPhoto | null): void {
    const version = photo ? createHash('sha1').update(photo.data).digest('hex').slice(0, 12) : null;
    this.#db
      .prepare(
        'INSERT INTO shop_look (shop, photo, photo_type, photo_version) VALUES (?, ?, ?, ?) ON CONFLICT (shop) DO UPDATE SET photo = excluded.photo, photo_type = excluded.photo_type, photo_version = excluded.photo_version',
      )
      .run(shop, photo?.data ?? null, photo?.type ?? null, version);
  }

  /** Forgets how the user named and dressed a shop, so it is as the bank names it or as its chain is. */
  forgetShop(shop: string): void {
    this.#db.prepare('DELETE FROM shop_look WHERE shop = ?').run(shop);
  }

  /** The photo put on a shop; null when it has none. */
  shopPhoto(shop: string): CategoryPhoto | null {
    const row = this.#db.prepare('SELECT photo, photo_type FROM shop_look WHERE shop = ? AND photo IS NOT NULL').get(shop);
    return row ? { type: row.photo_type === 'image/png' ? 'image/png' : 'image/jpeg', data: row.photo as Uint8Array } : null;
  }

  /** The icon kept of a site; null when there is none. */
  siteIcon(site: string): CategoryPhoto | null {
    const row = this.#db.prepare('SELECT icon FROM site_icon WHERE site = ? AND icon IS NOT NULL').get(site);
    return row ? { type: 'image/png', data: row.icon as Uint8Array } : null;
  }

  /** When each site was last asked for its icon, by site. */
  siteIconsAsked(): Map<string, string> {
    return new Map(this.#db.prepare('SELECT site, asked_at FROM site_icon').all().map((row) => [String(row.site), String(row.asked_at)] as const));
  }

  /** Keeps the icon of a site, or that it has none, as asked at `askedAt`. */
  putSiteIcon(site: string, icon: CategoryPhoto | null, askedAt: Date): void {
    const version = icon ? createHash('sha1').update(icon.data).digest('hex').slice(0, 12) : null;
    this.#db
      .prepare(
        'INSERT INTO site_icon (site, icon, version, asked_at) VALUES (?, ?, ?, ?) ON CONFLICT (site) DO UPDATE SET icon = excluded.icon, version = excluded.version, asked_at = excluded.asked_at',
      )
      .run(site, icon?.data ?? null, version, askedAt.toISOString());
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
      this.#db.prepare('DELETE FROM category_look WHERE tag_id = ?').run(id);
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

  /** Runs in one transaction; a transaction begun inside another is part of it. */
  #transaction<T>(run: () => T): T {
    if (this.#db.isTransaction) return run();
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

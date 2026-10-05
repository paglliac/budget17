import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isIncomeModel, type Income, type IncomeInput } from './income.ts';
import type { RegularExpense, RegularExpenseInput } from './regular.ts';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS regular_expense (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31)
  ) STRICT;

  -- params holds the model's numbers as JSON, so a new model needs no migration.
  CREATE TABLE IF NOT EXISTS income (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    params TEXT NOT NULL
  ) STRICT;
`;

/**
 * What the user sets up in the app itself: regular expenses and incomes. It lives in its own SQLite file,
 * apart from the ZenMoney copy, so make resync never deletes it.
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
  }

  /** Regular expenses by day of the month, then by title. */
  regularExpenses(): RegularExpense[] {
    return this.#db
      .prepare('SELECT id, title, amount, day FROM regular_expense')
      .all()
      .map((row) => ({ id: Number(row.id), title: String(row.title), amount: Number(row.amount), day: Number(row.day) }))
      .sort((a, b) => a.day - b.day || a.title.localeCompare(b.title, 'ru'));
  }

  addRegularExpense(expense: RegularExpenseInput): RegularExpense {
    const { lastInsertRowid } = this.#db
      .prepare('INSERT INTO regular_expense (title, amount, day) VALUES (?, ?, ?)')
      .run(expense.title, expense.amount, expense.day);
    return { id: Number(lastInsertRowid), ...expense };
  }

  /** False when there is no such expense. */
  updateRegularExpense(id: number, expense: RegularExpenseInput): boolean {
    const { changes } = this.#db
      .prepare('UPDATE regular_expense SET title = ?, amount = ?, day = ? WHERE id = ?')
      .run(expense.title, expense.amount, expense.day, id);
    return Number(changes) > 0;
  }

  /** False when there is no such expense. */
  deleteRegularExpense(id: number): boolean {
    return Number(this.#db.prepare('DELETE FROM regular_expense WHERE id = ?').run(id).changes) > 0;
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

  [Symbol.dispose](): void {
    this.#db.close();
  }
}

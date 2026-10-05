import type { RegularExpense, RegularExpenseInput } from '../src/regular.ts';
import type { Account, Budget, Instrument, ReminderMarker, Tag, Transaction, User } from '../src/zenmoney/types.ts';

export const RUB: Instrument = { id: 2, changed: 0, title: 'Российский рубль', shortTitle: 'RUB', symbol: '₽', rate: 1 };
export const USD: Instrument = { id: 1, changed: 0, title: 'Доллар США', shortTitle: 'USD', symbol: '$', rate: 90 };
export const EUR: Instrument = { id: 3, changed: 0, title: 'Евро', shortTitle: 'EUR', symbol: '€', rate: 100 };

export function user(overrides: Partial<User> = {}): User {
  return { id: 100, changed: 0, login: 'me', currency: RUB.id, parent: null, ...overrides };
}

export function account(overrides: Partial<Account> = {}): Account {
  return {
    id: crypto.randomUUID(),
    changed: 0,
    user: 100,
    role: null,
    instrument: RUB.id,
    company: null,
    type: 'ccard',
    title: 'Карта',
    syncID: null,
    balance: 0,
    startBalance: 0,
    creditLimit: 0,
    inBalance: true,
    savings: false,
    enableCorrection: false,
    enableSMS: false,
    archive: false,
    ...overrides,
  };
}

export function tag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: crypto.randomUUID(),
    changed: 0,
    user: 100,
    title: 'Категория',
    parent: null,
    icon: null,
    picture: null,
    color: null,
    showIncome: false,
    showOutcome: true,
    budgetIncome: false,
    budgetOutcome: true,
    required: null,
    ...overrides,
  };
}

/** An expense by default; pass income and outcome amounts with accounts for other kinds. */
export function transaction(overrides: Partial<Transaction> = {}): Transaction {
  const accountId = overrides.outcomeAccount ?? overrides.incomeAccount ?? 'card';
  return {
    id: crypto.randomUUID(),
    changed: 0,
    created: 0,
    user: 100,
    deleted: false,
    hold: false,
    incomeInstrument: RUB.id,
    incomeAccount: accountId,
    income: 0,
    outcomeInstrument: RUB.id,
    outcomeAccount: accountId,
    outcome: 0,
    tag: null,
    merchant: null,
    payee: null,
    originalPayee: null,
    comment: null,
    date: '2026-10-01',
    mcc: null,
    reminderMarker: null,
    opIncome: null,
    opIncomeInstrument: null,
    opOutcome: null,
    opOutcomeInstrument: null,
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

export function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    changed: 0,
    user: 100,
    tag: null,
    date: '2026-10-01',
    income: 0,
    incomeLock: false,
    outcome: 0,
    outcomeLock: false,
    ...overrides,
  };
}

export function reminderMarker(overrides: Partial<ReminderMarker> = {}): ReminderMarker {
  return {
    id: crypto.randomUUID(),
    changed: 0,
    user: 100,
    incomeInstrument: RUB.id,
    incomeAccount: 'card',
    income: 0,
    outcomeInstrument: RUB.id,
    outcomeAccount: 'card',
    outcome: 0,
    tag: null,
    merchant: null,
    payee: null,
    comment: null,
    date: '2026-10-10',
    reminder: 'reminder',
    state: 'planned',
    notify: false,
    ...overrides,
  };
}

/** A regular expense paid every month, with no dates or picked icon unless given. */
export function regular(fields: Pick<RegularExpense, 'id' | 'title' | 'amount' | 'day'> & Partial<RegularExpense>): RegularExpense {
  return { start: null, end: null, icon: null, ...fields };
}

/** What a form gives to add or save a regular expense, with no dates or picked icon unless given. */
export function regularInput(fields: Pick<RegularExpense, 'title' | 'amount' | 'day'> & Partial<RegularExpenseInput>): RegularExpenseInput {
  return { start: null, end: null, icon: null, ...fields };
}

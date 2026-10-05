import type { Account, Instrument, User } from '../src/zenmoney/types.ts';

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

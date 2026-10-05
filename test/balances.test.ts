import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summarizeBalances } from '../src/balances.ts';
import { account, EUR, RUB, USD, user } from './fixtures.ts';

const instrument = [RUB, USD, EUR];

describe('summarizeBalances', () => {
  it('sums accounts in the main currency, converting via ruble rates', () => {
    const summary = summarizeBalances({
      instrument,
      user: [user()],
      account: [
        account({ title: 'Т-Банк', balance: 1000 }),
        account({ title: 'Доллары', instrument: USD.id, balance: 10 }),
      ],
    });

    assert.equal(summary.mainInstrument, RUB);
    assert.equal(summary.total, 1900);
    assert.deepEqual(
      summary.accounts.map((a) => [a.title, a.balanceInMain]),
      [['Т-Банк', 1000], ['Доллары', 900]],
    );
  });

  it('converts into a non-ruble main currency', () => {
    const summary = summarizeBalances({
      instrument,
      user: [user({ currency: EUR.id })],
      account: [account({ instrument: USD.id, balance: 10 }), account({ instrument: RUB.id, balance: 100 })],
    });

    assert.equal(summary.mainInstrument, EUR);
    assert.equal(summary.total, 10);
  });

  it('skips archived and debt accounts', () => {
    const summary = summarizeBalances({
      instrument,
      user: [user()],
      account: [
        account({ title: 'Активный', balance: 50 }),
        account({ title: 'Старый', balance: 500, archive: true }),
        account({ title: 'Долги', type: 'debt', balance: 5000 }),
      ],
    });

    assert.deepEqual(summary.accounts.map((a) => a.title), ['Активный']);
    assert.equal(summary.total, 50);
  });

  it('lists accounts excluded from balance last and leaves them out of the total', () => {
    const summary = summarizeBalances({
      instrument,
      user: [user()],
      account: [
        account({ title: 'Ипотека', type: 'loan', balance: -3_000_000, inBalance: false }),
        account({ title: 'Кредитка', balance: -2000 }),
        account({ title: 'Наличные', type: 'cash', balance: 5000 }),
      ],
    });

    assert.deepEqual(summary.accounts.map((a) => a.title), ['Наличные', 'Кредитка', 'Ипотека']);
    assert.equal(summary.total, 3000);
  });

  it('uses the family admin currency, not a family member’s', () => {
    const summary = summarizeBalances({
      instrument,
      user: [user({ id: 101, parent: 100, currency: USD.id }), user()],
      account: [],
    });

    assert.equal(summary.mainInstrument, RUB);
  });

  it('treats an account without currency as the main currency and missing balance as zero', () => {
    const summary = summarizeBalances({
      instrument,
      user: [user()],
      account: [account({ instrument: null, balance: null })],
    });

    assert.equal(summary.accounts[0]?.instrument, RUB);
    assert.equal(summary.total, 0);
  });
});

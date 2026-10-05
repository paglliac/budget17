import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterOperations, listOperations } from '../src/ledger.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { account, RUB, tag, transaction, USD, user } from './fixtures.ts';

const card = account({ id: 'card', title: 'Т-Банк' });
const savings = account({ id: 'savings', title: 'Копилка' });
const dollars = account({ id: 'usd', title: 'Доллары', instrument: USD.id });
const transport = tag({ title: 'Транспорт', color: 0xff5b84f0 });
const taxi = tag({ title: 'Такси', parent: transport.id });
const base: EntityCollections = { instrument: [RUB, USD], user: [user()], account: [card, savings, dollars], tag: [transport, taxi] };
const october = { from: '2026-10-01', to: '2026-10-31' };

describe('listOperations', () => {
  it('lists operations of the range newest first, leaving out deleted ones', () => {
    const operations = listOperations(
      {
        ...base,
        transaction: [
          transaction({ payee: 'Раньше', date: '2026-10-02', created: 5, outcome: 1 }),
          transaction({ payee: 'Позже в тот же день', date: '2026-10-02', created: 9, outcome: 1 }),
          transaction({ payee: 'Последняя', date: '2026-10-31', outcome: 1 }),
          transaction({ payee: 'Удалена', date: '2026-10-03', outcome: 1, deleted: true }),
          transaction({ payee: 'Сентябрь', date: '2026-09-30', outcome: 1 }),
        ],
      },
      october,
    );

    assert.deepEqual(operations.map((o) => o.payee), ['Последняя', 'Позже в тот же день', 'Раньше']);
  });

  it('describes expenses with their top-level category and account', () => {
    const [taxiRide] = listOperations(
      { ...base, transaction: [transaction({ payee: 'Яндекс Go', outcome: 560, tag: [taxi.id], outcomeAccount: 'card', hold: true })] },
      october,
    );

    assert.deepEqual(taxiRide && { ...taxiRide, id: undefined }, {
      id: undefined,
      date: '2026-10-01',
      created: 0,
      kind: 'expense',
      amount: 560,
      original: null,
      payee: 'Яндекс Go',
      comment: null,
      category: { id: transport.id, title: 'Транспорт', color: '#5b84f0' },
      account: 'Т-Банк',
      toAccount: null,
      hold: true,
    });
  });

  it('names a transfer by its accounts and gives it no category', () => {
    const [transfer] = listOperations(
      { ...base, transaction: [transaction({ outcome: 1000, income: 1000, outcomeAccount: 'card', incomeAccount: 'savings', tag: [transport.id] })] },
      october,
    );

    assert.equal(transfer?.kind, 'transfer');
    assert.equal(transfer?.payee, 'Т-Банк → Копилка');
    assert.equal(transfer?.toAccount, 'Копилка');
    assert.equal(transfer?.category, null);
  });

  it('keeps the amount in a foreign currency next to the converted one', () => {
    const operations = listOperations(
      {
        ...base,
        transaction: [
          transaction({ payee: 'Steam', outcome: 10, outcomeInstrument: USD.id, incomeInstrument: USD.id, outcomeAccount: 'usd' }),
          transaction({ payee: 'Ереван', outcome: 900, opOutcome: 10, opOutcomeInstrument: USD.id }),
        ],
      },
      october,
    );

    assert.deepEqual(
      operations.map((o) => [o.payee, o.amount, o.original?.amount, o.original?.instrument.shortTitle]),
      [
        ['Steam', 900, 10, 'USD'],
        ['Ереван', 900, 10, 'USD'],
      ],
    );
  });

  it('falls back from payee to merchant, bank description and category, and drops a comment that repeats the title', () => {
    const operations = listOperations(
      {
        ...base,
        merchant: [{ id: 'm', changed: 0, user: 100, title: 'Пятёрочка' }],
        transaction: [
          transaction({ created: 4, outcome: 1, merchant: 'm' }),
          transaction({ created: 3, outcome: 1, originalPayee: 'YANDEX*GO' }),
          transaction({ created: 2, outcome: 1, tag: [taxi.id] }),
          transaction({ created: 1, income: 1, payee: 'Аванс', comment: 'Аванс' }),
        ],
      },
      october,
    );

    assert.deepEqual(
      operations.map((o) => [o.payee, o.comment]),
      [
        ['Пятёрочка', null],
        ['YANDEX*GO', null],
        ['Транспорт', null],
        ['Аванс', null],
      ],
    );
  });
});

describe('filterOperations', () => {
  const operations = listOperations(
    {
      ...base,
      transaction: [
        transaction({ payee: 'Такси домой', outcome: 500, tag: [taxi.id] }),
        transaction({ payee: 'Пекарня', outcome: 200, comment: 'Круассаны' }),
        transaction({ payee: 'Зарплата', income: 100_000 }),
        transaction({ outcome: 1000, income: 1000, outcomeAccount: 'card', incomeAccount: 'savings' }),
      ],
    },
    october,
  );
  const payees = (filter: Parameters<typeof filterOperations>[1]) => filterOperations(operations, filter).map((o) => o.payee);

  it('filters by kind', () => {
    assert.deepEqual(payees({ kind: 'expense' }), ['Такси домой', 'Пекарня']);
    assert.deepEqual(payees({ kind: 'transfer' }), ['Т-Банк → Копилка']);
  });

  it('filters by category, with none meaning incomes and expenses without one', () => {
    assert.deepEqual(payees({ category: transport.id }), ['Такси домой']);
    assert.deepEqual(payees({ category: 'none' }), ['Пекарня', 'Зарплата']);
  });

  it('finds text in payee, comment, category and accounts in any case', () => {
    assert.deepEqual(payees({ query: 'КРУАС' }), ['Пекарня']);
    assert.deepEqual(payees({ query: 'транспорт' }), ['Такси домой']);
    assert.deepEqual(payees({ query: 'копилка' }), ['Т-Банк → Копилка']);
    assert.deepEqual(payees({ query: '  ' }).length, 4);
  });
});

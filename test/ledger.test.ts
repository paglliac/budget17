import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterOperations, listOperations, PURCHASE_CATEGORY, REGULAR_CATEGORY, byCategory } from '../src/ledger.ts';
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
      originalPayee: null,
      comment: null,
      description: null,
      category: { id: transport.id, title: 'Транспорт', color: '#5b84f0' },
      zenmoneyCategory: { id: transport.id, title: 'Транспорт', color: '#5b84f0' },
      regular: null,
      purchase: null,
      account: 'Т-Банк',
      toAccount: null,
      hold: true,
      ignored: false,
    });
  });

  it('drops stray spaces around account titles', () => {
    const [shop] = listOperations({ ...base, account: [account({ id: 'card', title: 'Основной ' })], transaction: [transaction({ outcome: 1 })] }, october);
    assert.equal(shop?.account, 'Основной');
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

describe('listOperations with banks and the user’s sorting', () => {
  const tbank = 4902;
  const main = account({ id: 'main', title: 'Основной', company: tbank });
  const reserve = account({ id: 'reserve', title: 'Запас', company: tbank });
  const sber = account({ id: 'sber', title: 'Сбер', company: 4624 });
  const cash = account({ id: 'cash', title: 'Наличные', type: 'cash' });
  const food = tag({ title: 'Продукты' });
  const data: EntityCollections = { ...base, account: [main, reserve, sber, cash], tag: [transport, taxi, food] };

  it('leaves out transfers between accounts of one bank and keeps those between banks or to cash', () => {
    const operations = listOperations(
      {
        ...data,
        transaction: [
          transaction({ outcome: 5000, income: 5000, outcomeAccount: 'main', incomeAccount: 'reserve' }),
          transaction({ outcome: 3000, income: 3000, outcomeAccount: 'main', incomeAccount: 'sber' }),
          transaction({ outcome: 2000, income: 2000, outcomeAccount: 'main', incomeAccount: 'cash' }),
          transaction({ outcome: 700, outcomeAccount: 'main', payee: 'Кирилл А.' }),
        ],
      },
      october,
    );

    assert.deepEqual(operations.map((o) => o.payee).sort(), ['Кирилл А.', 'Основной → Наличные', 'Основной → Сбер']);
  });

  it('gives an expense or an income the category the user picked over ZenMoney’s, or Регулярные траты for a regular payment', () => {
    const sorting = {
      categorizations: new Map([
        ['picked', { tag: food.id }],
        ['tagged', { tag: food.id }],
        ['rent', { regular: 3 }],
        ['untitled', { regular: 3 }],
        ['gone', { regular: 99 }],
        ['salary', { tag: food.id }],
      ]),
      regular: [{ id: 3, title: 'Мастерская аренда' }],
    };
    const operations = listOperations(
      {
        ...data,
        transaction: [
          transaction({ id: 'picked', created: 6, outcome: 400, payee: 'Лавка' }),
          transaction({ id: 'tagged', created: 5, outcome: 500, payee: 'Такси', tag: [taxi.id] }),
          transaction({ id: 'rent', created: 4, outcome: 40_000, payee: 'Александр А.' }),
          transaction({ id: 'untitled', created: 3, outcome: 40_000 }),
          transaction({ id: 'gone', created: 2, outcome: 100, payee: 'Без привязки' }),
          transaction({ id: 'salary', created: 1, income: 100_000, payee: 'Зарплата' }),
        ],
      },
      october,
      sorting,
    );

    assert.deepEqual(
      operations.map((o) => [o.payee, o.category?.title ?? null, o.regular?.title ?? null]),
      [
        ['Лавка', 'Продукты', null],
        ['Такси', 'Продукты', null],
        ['Александр А.', REGULAR_CATEGORY.title, 'Мастерская аренда'],
        ['Мастерская аренда', REGULAR_CATEGORY.title, 'Мастерская аренда'],
        ['Без привязки', null, null],
        ['Зарплата', 'Продукты', null],
      ],
    );
  });

  it('uses the titles the user gave categories and their own ones, and names the purchase an expense paid', () => {
    const sorting = {
      categorizations: new Map([
        ['own', { tag: 'own-1' }],
        ['kids', { tag: 'own-1' }],
      ]),
      regular: [],
      purchasePayments: new Map([
        ['kids', 4],
        ['shoes', 4],
        ['bare', 4],
      ]),
      purchases: [{ id: 4, title: 'Ботинки Савве' }],
      categories: {
        changes: new Map([[transport.id, { title: 'Машина и проезд', hidden: true }]]),
        own: [{ id: 'own-1', title: 'Дети', hidden: false, kind: 'expense' as const }],
      },
    };
    const operations = listOperations(
      {
        ...data,
        transaction: [
          transaction({ id: 'taxi', created: 5, outcome: 500, payee: 'Такси', tag: [taxi.id] }),
          transaction({ id: 'own', created: 4, outcome: 300, payee: 'Лавка' }),
          transaction({ id: 'kids', created: 3, outcome: 2_000, payee: 'Детский мир' }),
          transaction({ id: 'shoes', created: 2, outcome: 6_000, payee: 'Обувь', tag: [food.id] }),
          transaction({ id: 'bare', created: 1, outcome: 100 }),
        ],
      },
      october,
      sorting,
    );

    assert.deepEqual(
      operations.map((o) => [o.payee, o.category?.title ?? null, o.zenmoneyCategory?.title ?? null, o.purchase?.title ?? null]),
      [
        ['Такси', 'Машина и проезд', 'Машина и проезд', null],
        ['Лавка', 'Дети', null, null],
        ['Детский мир', 'Дети', null, 'Ботинки Савве'],
        ['Обувь', 'Продукты', 'Продукты', 'Ботинки Савве'],
        ['Ботинки Савве', PURCHASE_CATEGORY.title, null, 'Ботинки Савве'],
      ],
    );
  });

  it('leaves out expenses and incomes the user said not to count at all, unless asked for them, and keeps how the bank named the payee', () => {
    const transactions = {
      ...data,
      transaction: [
        transaction({ id: 'cash', created: 3, outcome: 120_000 }),
        transaction({ id: 'debt', created: 2, income: 22_000, payee: 'Сергей В.' }),
        transaction({ id: 'shop', created: 1, outcome: 473, payee: 'Пятёрочка', originalPayee: 'PYATEROCHKA 9076' }),
        transaction({ id: 'same', created: 0, outcome: 100, payee: 'Lenta', originalPayee: 'LENTA' }),
      ],
    };
    const sorting = {
      categorizations: new Map(),
      regular: [],
      marks: new Map([
        ['cash', 'ignored' as const],
        ['debt', 'ignored' as const],
        ['shop', 'outside' as const],
      ]),
    };

    assert.deepEqual(listOperations(transactions, october, sorting).map((o) => [o.id, o.originalPayee]), [['shop', 'PYATEROCHKA 9076'], ['same', null]]);
    assert.deepEqual(
      listOperations(transactions, october, sorting, { withIgnored: true }).map((o) => [o.id, o.ignored]),
      [['cash', true], ['debt', true], ['shop', false], ['same', false]],
    );
  });

  it('sums expenses by category, largest first', () => {
    const operations = listOperations(
      {
        ...data,
        transaction: [
          transaction({ outcome: 300, tag: [food.id] }),
          transaction({ outcome: 200, tag: [taxi.id] }),
          transaction({ outcome: 150, tag: [transport.id] }),
          transaction({ outcome: 400 }),
          transaction({ income: 1000, tag: [food.id] }),
        ],
      },
      october,
    );

    assert.deepEqual(
      byCategory(operations).map((c) => [c.title, c.amount]),
      [
        ['Без категории', 400],
        ['Транспорт', 350],
        ['Продукты', 300],
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
        transaction({ id: 'bakery', payee: 'Пекарня', outcome: 200, comment: 'Круассаны' }),
        transaction({ payee: 'Зарплата', income: 100_000 }),
        transaction({ outcome: 1000, income: 1000, outcomeAccount: 'card', incomeAccount: 'savings' }),
      ],
    },
    october,
    { categorizations: new Map(), regular: [], descriptions: new Map([['bakery', 'Завтрак с Машей']]) },
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

  it('finds text in payee, comment, description, category and accounts in any case', () => {
    assert.deepEqual(payees({ query: 'КРУАС' }), ['Пекарня']);
    assert.deepEqual(payees({ query: 'машей' }), ['Пекарня']);
    assert.deepEqual(payees({ query: 'транспорт' }), ['Такси домой']);
    assert.deepEqual(payees({ query: 'копилка' }), ['Т-Банк → Копилка']);
    assert.deepEqual(payees({ query: '  ' }).length, 4);
  });
});

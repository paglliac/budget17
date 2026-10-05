import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { upcomingOperations } from '../src/planned.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { reminderMarker, RUB, tag, USD, user } from './fixtures.ts';

const base: EntityCollections = { instrument: [RUB, USD], user: [user()] };
const today = '2026-10-05';

describe('upcomingOperations', () => {
  it('lists planned operations from today within the window, soonest first', () => {
    const planned = upcomingOperations(
      {
        ...base,
        reminderMarker: [
          reminderMarker({ date: '2026-10-20', outcome: 100, payee: 'Позже' }),
          reminderMarker({ date: today, outcome: 100, payee: 'Сегодня' }),
          reminderMarker({ date: '2026-10-04', outcome: 100, payee: 'Вчера' }),
          reminderMarker({ date: '2026-10-07', outcome: 100, payee: 'Проведён', state: 'processed' }),
          reminderMarker({ date: '2026-12-01', outcome: 100, payee: 'Далеко' }),
        ],
      },
      { today, days: 30 },
    );

    assert.deepEqual(planned.map((p) => p.title), ['Сегодня', 'Позже']);
  });

  it('tells incomes, expenses and transfers apart and converts amounts', () => {
    const planned = upcomingOperations(
      {
        ...base,
        reminderMarker: [
          reminderMarker({ date: '2026-10-06', income: 1000, payee: 'Зарплата' }),
          reminderMarker({ date: '2026-10-07', outcome: 10, outcomeInstrument: USD.id, payee: 'Подписка' }),
          reminderMarker({ date: '2026-10-08', outcome: 500, income: 500, incomeAccount: 'savings', payee: 'Копилка' }),
        ],
      },
      { today },
    );

    assert.deepEqual(
      planned.map((p) => [p.title, p.kind, p.amount]),
      [
        ['Зарплата', 'income', 1000],
        ['Подписка', 'expense', 900],
        ['Копилка', 'transfer', 500],
      ],
    );
  });

  it('falls back from payee to merchant, comment and category for the title', () => {
    const rent = tag({ title: 'Жильё' });
    const planned = upcomingOperations(
      {
        ...base,
        tag: [rent],
        merchant: [{ id: 'm', changed: 0, user: 100, title: 'МГТС' }],
        reminderMarker: [
          reminderMarker({ date: '2026-10-06', outcome: 1, merchant: 'm' }),
          reminderMarker({ date: '2026-10-07', outcome: 1, comment: 'Страховка' }),
          reminderMarker({ date: '2026-10-08', outcome: 1, tag: [rent.id] }),
          reminderMarker({ date: '2026-10-09', outcome: 1 }),
        ],
      },
      { today },
    );

    assert.deepEqual(planned.map((p) => p.title), ['МГТС', 'Страховка', 'Жильё', 'Платёж']);
  });
});

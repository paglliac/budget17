import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { suggester, type Suggestion } from '../src/categorization.ts';
import { REGULAR_CATEGORY, type Operation } from '../src/ledger.ts';
import type { Category } from '../src/operations.ts';
import { regular } from './fixtures.ts';

const groceries: Category = { id: 'groceries', title: 'Продукты', color: null };
const cafe: Category = { id: 'cafe', title: 'Кафе', color: null };
const workshop = regular({ id: 1, title: 'Мастерская аренда', amount: 40_000, day: 10 });
const oldCar = regular({ id: 2, title: 'Старая машина', amount: 30_500, day: 26 });
const mortgage = regular({ id: 3, title: 'Ипотека', amount: 29_000, day: 21 });
const phone = regular({ id: 4, title: 'Телефон', amount: 1_500, day: 2 });
const wifePhone = regular({ id: 5, title: 'Телефон жены', amount: 1_500, day: 2 });

function expense(payee: string, amount: number, date: string, sorted: Partial<Pick<Operation, 'category' | 'regular'>> = {}): Operation {
  return { id: `${payee}-${date}`, date, created: 0, kind: 'expense', amount, original: null, payee, comment: null, category: null, regular: null, account: 'Основной', toAccount: null, hold: false, ...sorted };
}

/** An expense the user linked to a regular expense. */
function paid(payee: string, amount: number, date: string, e: { id: number; title: string }): Operation {
  return expense(payee, amount, date, { category: REGULAR_CATEGORY, regular: { id: e.id, title: e.title } });
}

const name = (s: Suggestion | null) => (s === null ? null : 'category' in s ? s.category.title : s.regular.title);

describe('suggester', () => {
  it('suggests a regular expense of the same amount due within ten days', () => {
    const suggest = suggester([], [workshop, oldCar]);

    assert.equal(name(suggest(expense('Александр А.', 40_000, '2026-10-05'))), 'Мастерская аренда');
    assert.equal(name(suggest(expense('Кирилл А.', 30_500, '2026-09-18'))), 'Старая машина', 'eight days early');
    assert.equal(name(suggest(expense('Кирилл А.', 30_500, '2026-10-02'))), 'Старая машина', 'the payment of the month before');
    assert.equal(suggest(expense('Александр А.', 40_000, '2026-10-25')), null, 'too far from the 10th');
    assert.equal(suggest(expense('Александр А.', 40_100, '2026-10-10')), null, 'another amount');
  });

  it('does not suggest a payment that another expense already paid, so the next same one goes elsewhere', () => {
    const suggest = suggester([paid('Т-Мобайл', 1_500, '2026-10-02', phone)], [phone, wifePhone]);

    assert.equal(name(suggest(expense('Т-Мобайл', 1_500, '2026-10-02'))), 'Телефон жены');
    assert.equal(name(suggest(expense('Т-Мобайл', 1_500, '2026-11-01'))), 'Телефон', 'next month is a new payment');
  });

  it('suggests what the same payee was paid for the same amount before, wherever it falls', () => {
    const history = [paid('Кирилл А.', 28_800, '2026-08-20', mortgage), paid('Кирилл А.', 30_500, '2026-08-20', oldCar)];
    const suggest = suggester(history, [mortgage, oldCar]);

    assert.equal(name(suggest(expense('Кирилл А.', 28_800, '2026-09-18'))), 'Ипотека');
    assert.equal(name(suggest(expense('Кирилл А.', 30_500, '2026-09-18'))), 'Старая машина');
    assert.equal(name(suggest(expense('Кирилл А.', 28_500, '2026-09-18'))), 'Ипотека', 'the closest earlier amount');
    assert.equal(suggest(expense('Кирилл А.', 5_000, '2026-09-18')), null, 'too far from any');
    assert.equal(suggest(expense('Дарья Ч.', 28_800, '2026-09-18')), null, 'another payee');
  });

  it('suggests the category the payee gets most often, ignoring store numbers and case', () => {
    const history = [
      expense('Lenta 089', 700, '2026-09-20', { category: groceries }),
      expense('LENTA 139', 900, '2026-09-12', { category: groceries }),
      expense('Лента кафе', 300, '2026-09-10', { category: cafe }),
      expense('KHLEB SOL', 610, '2026-09-27', { category: cafe }),
      expense('Khleb Sol', 400, '2026-09-01', { category: groceries }),
    ];
    const suggest = suggester(history, []);

    assert.equal(name(suggest(expense('Lenta 178', 6_862, '2026-10-01'))), 'Продукты');
    assert.equal(name(suggest(expense('KHLEB SOL', 300, '2026-10-01'))), 'Кафе', 'a tie goes to the latest');
    assert.equal(suggest(expense('Пятёрочка', 300, '2026-10-01')), null);
  });

  it('prefers a regular payment to a category, and suggests nothing by payee for an expense without one', () => {
    const history = [expense('Александр А.', 500, '2026-09-01', { category: cafe }), expense('Расход', 200, '2026-09-01', { category: cafe })];
    const suggest = suggester(history, [workshop]);

    assert.equal(name(suggest(expense('Александр А.', 40_000, '2026-10-09'))), 'Мастерская аренда');
    assert.equal(name(suggest(expense('Александр А.', 700, '2026-10-09'))), 'Кафе');
    assert.equal(suggest(expense('Расход', 200, '2026-10-09')), null);
    assert.equal(name(suggest(expense('Расход', 40_000, '2026-10-09'))), 'Мастерская аренда', 'amount and day still count');
  });

  it('suggests no regular expense outside its dates', () => {
    const suggest = suggester([], [regular({ id: 9, title: 'Машина', amount: 91_000, day: 5, start: '2026-11-01' })]);

    assert.equal(suggest(expense('Влас М.', 91_000, '2026-10-05')), null);
    assert.equal(name(suggest(expense('Влас М.', 91_000, '2026-11-04'))), 'Машина');
  });
});

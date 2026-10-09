import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NO_SETUP } from '../src/categories.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import type { SavedBudget } from '../src/web/pages/dashboard.ts';
import { loadReview, renderReview, renderReviewCheck } from '../src/web/pages/review.ts';
import { account, regular, RUB, tag, transaction, user } from './fixtures.ts';

const today = '2026-10-09';
const food = tag({ id: 'food', title: 'Продукты' });
const data: EntityCollections = {
  instrument: [RUB],
  user: [user()],
  account: [account({ id: 'card', title: 'Основной' })],
  tag: [food],
  transaction: [
    transaction({ id: 'salary', date: '2026-09-04', income: 300_000, payee: 'Зарплата' }),
    transaction({ id: 'groceries', date: '2026-09-15', outcome: 150_000, tag: [food.id], payee: 'Лента' }),
    transaction({ id: 'school', date: '2026-09-07', outcome: 45_000, payee: 'ИП Бондарь' }),
    transaction({ id: 'person', date: '2026-09-18', outcome: 70_000, payee: 'Татьяна А.' }),
    transaction({ id: 'self', date: '2026-09-25', outcome: 2_547, payee: 'Иван И.' }),
    transaction({ id: 'loan', date: '2026-09-19', outcome: 30_500, payee: 'Иван И.' }),
    transaction({ id: 'untitled', date: '2026-09-10', outcome: 500 }),
  ],
};

function saved(changes: Partial<SavedBudget> = {}): SavedBudget {
  return {
    categorizations: new Map([['school', { regular: 1 }]]),
    purchasePayments: new Map(),
    regular: [regular({ id: 1, title: 'Школа', amount: 45_000, day: 7 }), regular({ id: 2, title: 'Кредит Kia K5', amount: 30_500, day: 26 })],
    purchases: [],
    marks: new Map(),
    descriptions: new Map(),
    categories: NO_SETUP,
    weekStart: 0,
    weekLimits: new Map(),
    wishes: [],
    selfPayee: 'Иван И.',
    ...changes,
  };
}

const plain = (html: { toString(): string }) => String(html).replace(/[\u00a0\u202f]/g, ' ');
const page = (options: Parameters<typeof loadReview>[2], sorted = saved()) => plain(renderReview(loadReview(data, sorted, options), createHref()));
const check = (options: Parameters<typeof loadReview>[2], sorted = saved()) => plain(renderReviewCheck(loadReview(data, sorted, options), createHref()));

describe('month review page', () => {
  it('reviews the month just gone: income, spending, where it went, the weeks and the regular payments', () => {
    const html = page({ today });

    assert.ok(html.includes('Разбор сентября'));
    assert.ok(html.includes('31 августа – 27 сентября, 4 недели'));
    assert.ok(html.includes('298 547 <span>₽</span>'), 'spent');
    assert.ok(html.includes('Куда ушли деньги'));
    assert.ok(html.includes('при плане 180 000 ₽'));
    assert.ok(html.includes('+73 547 ₽'), 'what the weeks spent over their limits');
    assert.ok(html.includes('Школа'));
    assert.ok(html.includes('href="/?week=2026-09-14"'), 'a week’s bar leads to the week');
    assert.ok(html.includes('title="Разбор месяца" aria-label="Разбор месяца" aria-current="page"'));
  });

  it('sends what to check to its own page, a kind at a time', () => {
    const html = page({ today });

    assert.ok(html.includes('href="/review/check?month=2026-09&amp;kind=person"'));
    assert.ok(html.includes('href="/review/check?month=2026-09&amp;kind=self"'));
    assert.ok(html.includes('href="/review/check?month=2026-09&amp;kind=untitled"'));
  });

  it('says what the assistant found and answers its questions', () => {
    const html = page({ today });
    assert.ok(html.includes('ассистент сделал 5 выводов'));
    assert.ok(html.includes('Недели потратили на 73 547 ₽ больше плана'));
    assert.ok(html.includes('Переводы людям в неделях: 70 000 ₽'));
    assert.ok(html.includes('Дополнительные почти не тронуты'));

    const overspend = page({ today, ask: 'overspend' });
    assert.ok(overspend.includes('Недели потратили 253 547 ₽ при плане 180 000 ₽.'));
    assert.ok(overspend.includes('Больше всего потратила неделя 14 сентября – 20 сентября, 250 500 ₽'));

    const plan = page({ today, ask: 'plan' });
    assert.ok(plan.includes('План на октябрь'));
    assert.ok(plan.includes('5 недель по 45 000 ₽ — 225 000 ₽, регулярные 75 500 ₽, дополнительные 100 000 ₽, всего 400 500 ₽.'));
    assert.ok(!plan.includes('₽..'));
  });

  it('reviews another month when asked, but not one still ahead', () => {
    assert.ok(page({ today, month: '2026-10' }).includes('Разбор октября'));
    assert.ok(page({ today, month: '2026-12' }).includes('Разбор октября'));
  });
});

describe('what to check page', () => {
  it('lists one kind by day with the others as tabs, and hints at what a transfer to oneself paid', () => {
    const html = check({ today, kind: 'self' });

    assert.ok(html.includes('<h1>Переводы себе'));
    assert.ok(html.includes('2 траты на 33 047 ₽ считаются в неделях'));
    assert.ok(html.includes('похоже на Ozon или WB'));
    assert.ok(html.includes('сумма «Кредит Kia K5»'));
    assert.ok(!html.includes('Татьяна А.'));
    assert.ok(html.includes('← К разбору'));
  });

  it('lets an expense go once it is explained, and keeps transfers to oneself with people until the name is given', () => {
    const sorted = saved({ categorizations: new Map([['school', { regular: 1 }], ['self', { tag: food.id }]]) });
    assert.ok(check({ today, kind: 'self' }, sorted).includes('1 трата на 30 500 ₽ считается в неделях'));

    const unnamed = check({ today, kind: 'person' }, saved({ selfPayee: null }));
    assert.ok(unnamed.includes('3 траты на 103 047 ₽ считаются в неделях'));
    assert.ok(!unnamed.includes('kind=self'));
  });

  it('opens an expense in place to mark it', () => {
    const html = check({ today, kind: 'person', edit: 'spending-person' });
    assert.ok(html.includes('id="spending-person"'));
    assert.ok(html.includes('action="/spending/person/'));
  });
});

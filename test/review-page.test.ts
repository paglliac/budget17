import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NO_SETUP } from '../src/categories.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import type { SavedBudget } from '../src/web/pages/dashboard.ts';
import { loadReview, renderReview, renderReviewCheck, submitReview } from '../src/web/pages/review.ts';
import { Settings } from '../src/settings.ts';
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

  it('maps what the weeks were made of, what to check hatched, each part opening on the side', () => {
    const html = page({ today });

    assert.ok(html.includes('Из чего недели'));
    assert.ok(html.includes('не разобрано 103 547 ₽, 41%'));
    assert.ok(html.includes('class="cmap-group hatched'));
    assert.ok(html.includes('href="/review?month=2026-09&amp;tile=category-food"'));
    assert.ok(html.includes('href="/review?month=2026-09&amp;tile=check-self%3Amarketplace"'));
    assert.ok(!html.includes('Обычные траты в неделю'), 'the map took the place of the categories a week');
  });

  it('opens a shop on the side with subcategories to put it into and categories to move its expenses to', () => {
    const lenta = { id: 3, category: food.id, title: 'Лента' };
    const sorted = saved({ subcategories: { subcategories: [lenta], shops: new Map(), spending: new Map() } });
    const html = page({ today, tile: 'category-food:shop-lenta' }, sorted);

    assert.ok(html.includes('Продукты › Лента'));
    assert.ok(html.includes('action="/review/subcategory?category=food&amp;shop=%D0%9B%D0%B5%D0%BD%D1%82%D0%B0&amp;subcategory=3"'));
    assert.ok(html.includes('Все траты Лента из «Продукты» пойдут в подкатегорию сами, и новые тоже.'));
    assert.ok(!html.includes('action="/review/move?spending=groceries&amp;category=food"'), 'its own category is the current one');
    assert.ok(html.includes('← К выводам'));
  });

  it('opens what the map folds into Ещё N on its own, without the pieces shown', () => {
    const shops = ['Лента', 'Магнит', 'Пятёрочка', 'Перекрёсток', 'Ашан', 'ВкусВилл', 'Самокат', 'Чижик'].map((payee, i) =>
      transaction({ id: `shop-${i}`, date: '2026-09-15', outcome: 8_000 - i * 500, tag: [food.id], payee }),
    );
    const many = { ...data, transaction: [...data.transaction!, ...shops] };
    const html = plain(renderReview(loadReview(many, saved(), { today }), createHref()));
    assert.ok(html.includes('href="/review?month=2026-09&amp;tile=category-food%3Amore"'));

    const rest = plain(renderReview(loadReview(many, saved(), { today, tile: 'category-food:more' }), createHref()));
    assert.ok(rest.includes('Продукты › Ещё 2'), 'Лента of the fixture and of these are one shop');
    const listed = /<ul class="amounts" aria-label="Получатели">(.*?)<\/ul>/s.exec(rest)?.[1] ?? '';
    assert.ok(listed.includes('tile=category-food%3Ashop-chizhik'), 'a folded shop opens on its own');
    assert.ok(listed.includes('tile=category-food%3Ashop-samokat'));
    assert.ok(!listed.includes('shop-magnit'), 'a shop on the map is not listed');
  });

  it('opens what to check on the side with where to put it, and the page to mark it one by one', () => {
    const html = page({ today, tile: 'check-person' });

    assert.ok(html.includes('Татьяна А.'));
    assert.ok(html.includes('href="/review/check?month=2026-09&amp;kind=person"'));
    const piece = page({ today, tile: 'check-person:shop-tatiana' });
    assert.ok(piece.includes('action="/review/move?spending=person&amp;category=food"'));
    assert.ok(piece.includes('href="/review?month=2026-09&amp;tile=spending-person"'));
    assert.ok(page({ today, tile: 'check-person:gone' }).includes('Татьяна А.'), 'a piece that is gone opens its part');
    assert.ok(page({ today, tile: 'category-gone' }).includes('Здесь больше ничего нет'));
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

describe('review forms', () => {
  const form = (fields: Record<string, string>) => new URLSearchParams(fields);

  it('moves only the expenses asked into a category and its subcategory, leaving payments of regular expenses be', () => {
    using settings = new Settings(':memory:');
    settings.categorize('school', { regular: 1 });
    assert.deepEqual(submitReview(settings, data, '/review/move', form({ spending: 'person,school,nothing', category: food.id, title: 'Рынок' })), { status: 'saved' });

    const market = settings.subcategorySetup().subcategories[0]!;
    assert.equal(market.title, 'Рынок');
    assert.deepEqual([...settings.categorizations()], [['school', { regular: 1 }], ['person', { tag: food.id }]]);
    assert.deepEqual([...settings.subcategorySetup().spending], [['person', market.id]]);
    assert.deepEqual(submitReview(settings, data, '/review/move', form({ spending: 'person', category: 'nothing' })), { status: 'missing' });
  });

  it('puts a shop into a subcategory for good, and transfers one by one', () => {
    using settings = new Settings(':memory:');
    const lenta = settings.addSubcategory(food.id, 'Лента');
    assert.deepEqual(submitReview(settings, data, '/review/subcategory', form({ category: food.id, shop: 'Лента-0089', subcategory: String(lenta.id) })), { status: 'saved' });
    assert.deepEqual([...settings.subcategorySetup().shops.get(food.id)!], [['lenta', lenta.id]]);
    submitReview(settings, data, '/review/subcategory', form({ category: food.id, shop: 'Лента', subcategory: 'none' }));
    assert.equal(settings.subcategorySetup().shops.get(food.id), undefined);

    submitReview(settings, data, '/review/subcategory', form({ category: food.id, spending: 'person', title: 'Рынок' }));
    assert.deepEqual([...settings.subcategorySetup().spending.values()], [settings.subcategorySetup().subcategories.find((s) => s.title === 'Рынок')!.id]);
    assert.deepEqual(submitReview(settings, data, '/review/subcategory', form({ category: food.id, spending: 'person', title: ' ' })), { status: 'invalid', error: 'Укажите название' });
    assert.deepEqual(submitReview(settings, data, '/review/subcategory', form({ category: food.id, spending: 'person', subcategory: '99' })), { status: 'missing' });
  });

  it('renames and deletes a subcategory, hides a category and turns hints down', () => {
    using settings = new Settings(':memory:');
    const lenta = settings.addSubcategory(food.id, 'Лента');
    assert.deepEqual(submitReview(settings, data, `/review/subcategories/${lenta.id}`, form({ title: 'Супермаркеты' })), { status: 'saved' });
    assert.equal(settings.subcategorySetup().subcategories[0]?.title, 'Супермаркеты');
    assert.deepEqual(submitReview(settings, data, `/review/subcategories/${lenta.id}/delete`, form({})), { status: 'saved' });
    assert.deepEqual(settings.subcategorySetup().subcategories, []);

    assert.deepEqual(submitReview(settings, data, `/review/hide/${food.id}`, form({})), { status: 'saved' });
    assert.equal(settings.categorySetup().changes.get(food.id)?.hidden, true);
    assert.deepEqual(submitReview(settings, data, '/review/hide/nothing', form({})), { status: 'missing' });
    assert.deepEqual(submitReview(settings, data, '/review/dismiss', form({ hints: 'spending:person,hide:food,whatever' })), { status: 'saved' });
    assert.deepEqual([...settings.dismissedHints()], ['hide:food', 'spending:person']);
  });
});

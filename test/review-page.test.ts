import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NO_SETUP } from '../src/categories.ts';
import type { ClaudeAnswer } from '../src/claude-review.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import type { SavedBudget } from '../src/web/pages/dashboard.ts';
import { loadReview, renderReview, renderReviewCheck, saveClaudeAnswer, submitClaude, submitReview } from '../src/web/pages/review.ts';
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

  it('lists every regular payment due in the month, a check by those linked expenses paid', () => {
    const html = page({ today });
    const block = html.slice(html.indexOf('aria-label="Регулярные платежи месяца"'));

    assert.ok(html.includes('оплачено 1 из 2'));
    assert.match(block, /Школа<\/span><small class="amount-note">7 сентября<\/small><b class="amount-value">45 000/);
    assert.match(block, /Кредит Kia K5<\/span><small class="amount-note">срок 26 сентября<\/small><b class="amount-value">30 500/);
    assert.ok(block.indexOf('Школа') < block.indexOf('Кредит Kia K5'), 'by date');
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

describe('Claude on the review', () => {
  const madeAt = new Date('2026-10-09T12:45:00Z');
  const none = { category: null, subcategory: null, envelope: null };
  const reply = (paragraph: string, expenses: string[] = []) => ({ paragraphs: [paragraph], expenses });
  const answer: ClaudeAnswer = {
    findings: [{ tone: 'red', icon: 'trendingUp', title: 'Третью неделю раздул один перевод', text: 'Татьяне А. 70 000.', category: null, expenses: ['person'] }],
    marking: [{ title: 'Иван И. → «Продукты › Ozon и WB»', why: 'Некруглая сумма — покупка на Ozon.', expenses: ['self'], category: food.id, subcategory: 'Ozon и WB', envelope: null }],
    questions: [
      {
        title: '70 000 Татьяне А. — что это?',
        text: 'Самая крупная трата месяца.',
        expenses: ['person'],
        options: [
          { ...none, label: 'Обычная трата недели', envelope: 'week' },
          { ...none, label: 'В дополнительные', envelope: 'extra' },
        ],
      },
    ],
    splits: [{ category: food.id, why: 'Лента отдельно от рынка.', subcategories: [{ title: 'Лента', payees: ['Лента'] }, { title: 'Рынок', payees: ['Татьяна А.'] }] }],
    avoidable: [{ title: 'Мелочь без категории — 500', text: 'Непонятно что.', expenses: ['untitled'] }],
    answers: {
      overspend: reply('Недели потратили 254 тыс. при плане 180 тыс.', ['person']),
      check: reply('Сначала Татьяна А.'),
      optimize: reply('Лента выросла.'),
      plan: reply('Хватит 45 000 в неделю.'),
    },
  };
  const form = (fields: Record<string, string>) => new URLSearchParams(fields);

  /** Settings with Claude's answer about September kept, as it came for the expenses of `saved()`. */
  function withClaude(): Settings {
    const settings = new Settings(':memory:');
    const result = saveClaudeAnswer(settings, data, answer, { today, month: '2026-09', saved: saved(), now: madeAt });
    assert.deepEqual(result, { status: 'saved', month: '2026-09', dropped: [] });
    return settings;
  }
  const claudePage = (settings: Settings, options: Omit<Parameters<typeof loadReview>[2], 'today'> = {}) =>
    plain(renderReview(loadReview(data, saved(), { today, ...options, claude: (m) => settings.claude(m) }), createHref()));
  const submit = (settings: Settings, path: string, fields: Record<string, string>) => submitClaude(settings, data, path, form({ month: '2026-09', ...fields }), { today, saved: saved(), now: madeAt });

  it('puts Claude’s findings, answers and what could be spared in place of the rules’', () => {
    using settings = withClaude();
    const html = claudePage(settings);
    assert.ok(html.includes('Claude разобрал сентябрь'));
    assert.ok(html.includes('9 октября в '));
    assert.ok(html.includes('1 вывод, 3 подсказки'));
    assert.ok(html.includes('action="/review/claude/ask?month=2026-09"'), 'Пересмотреть');
    assert.ok(html.includes('Claude сделал 1 вывод'));
    assert.ok(html.includes('Третью неделю раздул один перевод'));
    assert.ok(html.includes('href="/review?month=2026-09&amp;tile=spending-person"'), 'a finding about one expense opens it on the map');
    assert.ok(!html.includes('Недели потратили на 73 547 ₽ больше плана'), 'the rules’ findings give way');
    assert.ok(html.includes('href="/review?month=2026-09&amp;list=hints"'));
    assert.ok(html.includes('href="/review?month=2026-09&amp;list=spare"'));

    const spare = claudePage(settings, { list: 'spare' });
    assert.ok(spare.includes('Мелочь без категории — 500'));
    const overspend = claudePage(settings, { ask: 'overspend' });
    assert.ok(overspend.includes('Недели потратили 254 тыс. при плане 180 тыс.'));
    assert.ok(overspend.includes('href="/review/check?month=2026-09&amp;kind=person&amp;edit=spending-person#spending-person"'));
    assert.ok(claudePage(settings, { ask: 'plan' }).includes('План на октябрь'));
  });

  it('leads the hints with Claude’s questions, marking and splits, each applied by a click', () => {
    using settings = withClaude();
    const html = claudePage(settings, { list: 'hints' });
    const at = (text: string) => html.indexOf(text);
    assert.ok(at('70 000 Татьяне А. — что это?') < at('Иван И. → «Продукты › Ozon и WB»'));
    assert.ok(at('Иван И. → «Продукты › Ozon и WB»') < at('Разбить «Продукты»: Лента, Рынок'));
    assert.ok(html.includes('action="/review/claude/answer?month=2026-09&amp;spending=person&amp;option=1"'));
    assert.ok(html.includes('1 трата на 2 547 ₽. Некруглая сумма — покупка на Ozon.'));
    assert.ok(html.includes('action="/review/claude/accept?month=2026-09&amp;spending=self"'));
    assert.ok(html.includes('action="/review/claude/decline?month=2026-09&amp;spending=self"'));
    assert.ok(html.includes('action="/review/claude/split?month=2026-09&amp;category=food"'));
    assert.ok(html.includes('action="/review/claude/decline?month=2026-09&amp;category=food"'));
  });

  it('outlines on the map what Claude has a word about, and says it at the open tile', () => {
    using settings = withClaude();
    assert.ok(claudePage(settings).includes('Переводы людям: 70 000 ₽ · есть подсказка'));
    const tile = claudePage(settings, { tile: 'check-person' });
    assert.ok(tile.includes('Claude об этом'));
    assert.ok(tile.includes('70 000 Татьяне А. — что это?'));
    const category = claudePage(settings, { tile: 'category-food' });
    assert.ok(category.includes('Разбить «Продукты»: Лента, Рынок'), 'the split of a category, at the category');
    assert.ok(!claudePage(settings, { tile: 'category-food:shop-lenta' }).includes('Разбить «Продукты»'));
  });

  it('keeps to the rules while Claude has not reviewed the month, and offers to ask it', () => {
    using settings = new Settings(':memory:');
    const html = claudePage(settings);
    assert.ok(html.includes('Разобрал сентябрь'));
    assert.ok(html.includes('по правилам, Claude этот месяц ещё не смотрел'));
    assert.ok(html.includes('Попросить Claude'));
    assert.ok(html.includes('Недели потратили на 73 547 ₽ больше плана'));
    assert.ok(!html.includes('list=spare'), 'what could be spared comes from Claude only');

    assert.deepEqual(submit(settings, '/review/claude/ask', {}), { status: 'saved' });
    assert.ok(claudePage(settings).includes('Пока по правилам: Claude разбирает месяц с '));
    assert.deepEqual(settings.claudeRequests(), [{ month: '2026-09', askedAt: madeAt.toISOString() }]);
    submit(settings, '/review/claude/cancel', {});
    assert.deepEqual(settings.claudeRequests(), []);
  });

  it('says Claude is looking again until an answer made after the request comes', () => {
    using settings = withClaude();
    settings.requestClaudeReview('2026-09', '2026-10-09T13:00:00.000Z');
    const html = claudePage(settings);
    assert.ok(html.includes('Пересматриваю с '));
    assert.ok(html.includes('action="/review/claude/cancel?month=2026-09"'));
    saveClaudeAnswer(settings, data, answer, { today, month: '2026-09', saved: saved(), now: new Date('2026-10-09T13:02:00Z') });
    assert.deepEqual(settings.claudeRequests(), []);
  });

  it('says why Claude did not answer, and offers to ask again', () => {
    using settings = withClaude();
    settings.requestClaudeReview('2026-09', '2026-10-09T13:00:00.000Z');
    settings.failClaudeRequest('2026-09', 'claude не установлен');
    const html = claudePage(settings);
    assert.ok(html.includes('Пересмотреть не вышло: claude не установлен'));
    assert.ok(html.includes('action="/review/claude/ask?month=2026-09"'));

    using none = new Settings(':memory:');
    none.requestClaudeReview('2026-09', '2026-10-09T13:00:00.000Z');
    none.failClaudeRequest('2026-09', 'claude не установлен');
    assert.ok(claudePage(none).includes('Пока по правилам: Claude не ответил — claude не установлен'));
  });

  it('applies what is accepted or answered as the map does, and keeps it so that it does not come back', () => {
    using settings = withClaude();
    assert.deepEqual(submit(settings, '/review/claude/accept', { spending: 'self' }), { status: 'saved' });
    const ozon = settings.subcategorySetup().subcategories.find((s) => s.title === 'Ozon и WB')!;
    assert.deepEqual(settings.categorizations().get('self'), { tag: food.id });
    assert.equal(settings.subcategorySetup().spending.get('self'), ozon.id);

    assert.deepEqual(submit(settings, '/review/claude/answer', { spending: 'person', option: '1' }), { status: 'saved' });
    assert.equal(settings.spendingMarks().get('person'), 'extra');
    assert.deepEqual(settings.claudeDecisions().get('spending:person'), { decision: 'answered', answer: 'В дополнительные' });

    assert.deepEqual(submit(settings, '/review/claude/decline', { category: food.id }), { status: 'saved' });
    assert.deepEqual([...settings.claudeDecisions().keys()].sort(), ['spending:person', 'spending:self', 'split:food']);
    assert.ok(claudePage(settings, { list: 'hints' }).includes('Подсказок нет.'), 'and a new answer with the same brings none of it back');
    saveClaudeAnswer(settings, data, answer, { today, month: '2026-09', saved: saved(), now: new Date('2026-10-09T14:00:00Z') });
    assert.ok(claudePage(settings, { list: 'hints' }).includes('Подсказок нет.'));

    assert.deepEqual(submit(settings, '/review/claude/accept', { spending: 'self' }), { status: 'missing' }, 'it is done already');
    assert.deepEqual(submit(settings, '/review/claude/answer', { spending: 'untitled', option: '0' }), { status: 'missing' });
  });

  it('splits a category: a shop for good, the month’s transfers in it one by one', () => {
    using settings = withClaude();
    assert.deepEqual(submit(settings, '/review/claude/split', { category: food.id }), { status: 'saved' });
    const setup = settings.subcategorySetup();
    assert.deepEqual(setup.subcategories.map((s) => s.title), ['Лента', 'Рынок']);
    assert.deepEqual([...setup.shops.get(food.id)!], [['lenta', setup.subcategories[0]!.id]]);
    assert.deepEqual([...setup.spending], [], 'Татьяна А. has no expense in Продукты this month');
    assert.deepEqual(settings.claudeDecisions().get('split:food'), { decision: 'accepted', answer: null });
  });

  it('keeps an answer with what each expense was, and turns down one of another shape', () => {
    using settings = new Settings(':memory:');
    const result = saveClaudeAnswer(settings, data, { ...answer, avoidable: [{ title: 'Что-то', text: '', expenses: ['untitled', 'nothing'] }] }, { today, month: '2026-09', saved: saved(), now: madeAt });
    assert.deepEqual(result, { status: 'saved', month: '2026-09', dropped: ['лишняя трата «Что-то»: нет траты nothing'] });
    const kept = settings.claude('2026-09').review!;
    assert.equal(kept.madeAt, madeAt.toISOString());
    assert.equal(kept.seen.get('person'), '||week||');
    assert.equal(kept.seen.get('groceries'), 'food||week||');
    assert.deepEqual(saveClaudeAnswer(settings, data, { findings: 'нет' }, { today, month: '2026-09', saved: saved(), now: madeAt }).status, 'invalid');
  });
});

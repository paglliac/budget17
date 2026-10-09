import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NO_SETUP } from '../src/categories.ts';
import { ANSWER_SCHEMA, openWord, readAnswer, spendingKey, splitKey, stateOf, type ClaudeAnswer, type ClaudeReview } from '../src/claude-review.ts';
import { schemaErrors } from '../src/schema.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import type { SavedBudget } from '../src/web/pages/dashboard.ts';
import { loadClaudeInput, loadReview } from '../src/web/pages/review.ts';
import { account, regular, RUB, tag, transaction, user } from './fixtures.ts';

const today = '2026-10-09';
const food = tag({ id: 'food', title: 'Продукты' });
const cafe = tag({ id: 'cafe', title: 'Кафе' });
const data: EntityCollections = {
  instrument: [RUB],
  user: [user()],
  account: [account({ id: 'card', title: 'Основной' })],
  tag: [food, cafe],
  transaction: [
    transaction({ id: 'earlier', date: '2026-08-12', outcome: 5_000, payee: 'Татьяна А.' }),
    transaction({ id: 'groceries', date: '2026-09-15', outcome: 15_000, tag: [food.id], payee: 'Лента-0089' }),
    transaction({ id: 'meat', date: '2026-09-16', outcome: 2_400, tag: [cafe.id], payee: 'Свежее мясо', comment: 'Мясная лавка' }),
    transaction({ id: 'person', date: '2026-09-18', outcome: 70_000, payee: 'Татьяна А.' }),
    transaction({ id: 'self', date: '2026-09-25', outcome: 2_547, payee: 'Иван И.' }),
    transaction({ id: 'gone', date: '2026-09-20', outcome: 300, payee: 'Табак', deleted: true }),
  ],
};

function saved(changes: Partial<SavedBudget> = {}): SavedBudget {
  return {
    categorizations: new Map(),
    purchasePayments: new Map(),
    regular: [regular({ id: 1, title: 'Кредит Kia K5', amount: 30_500, day: 26 })],
    purchases: [],
    marks: new Map(),
    descriptions: new Map([['person', 'Долг за ремонт']]),
    categories: NO_SETUP,
    weekStart: 0,
    weekLimits: new Map(),
    wishes: [],
    selfPayee: 'Иван И.',
    ...changes,
  };
}

const none = { category: null, subcategory: null, envelope: null };

function answer(changes: Partial<ClaudeAnswer> = {}): ClaudeAnswer {
  const reply = { paragraphs: ['Коротко.'], expenses: [] };
  return {
    findings: [{ tone: 'red', icon: 'trendingUp', title: '70 000 одним переводом', text: 'Татьяне А.', category: null, expenses: ['person'] }],
    marking: [{ title: 'Свежее мясо → «Продукты › Рынок»', why: 'Это мясная лавка.', expenses: ['meat'], category: food.id, subcategory: 'Рынок', envelope: null }],
    questions: [
      {
        title: '70 000 Татьяне А. — что это?',
        text: 'Самая крупная трата.',
        expenses: ['person'],
        options: [
          { ...none, label: 'Обычная трата недели', envelope: 'week' },
          { ...none, label: 'В дополнительные', envelope: 'extra' },
        ],
      },
    ],
    splits: [{ category: food.id, why: 'Лента отдельно.', subcategories: [{ title: 'Лента', payees: ['Лента-0089'] }, { title: 'Рынок', payees: ['Свежее мясо'] }] }],
    avoidable: [],
    answers: { overspend: reply, check: reply, optimize: reply, plan: reply },
    ...changes,
  };
}

/** Claude's review of September as if it came when the expenses were as `sorted` has them. */
function reviewed(sorted: SavedBudget, changes: Partial<ClaudeAnswer> = {}): ClaudeReview {
  const d = loadReview(data, sorted, { today, month: '2026-09' });
  return { month: '2026-09', madeAt: '2026-10-09T12:45:00.000Z', answer: answer(changes), seen: new Map(d.current.map((c) => [c.operation.id, stateOf(c)])) };
}

function word(sorted: SavedBudget, review: ClaudeReview, decisions = new Map()) {
  const d = loadReview(data, sorted, { today, month: '2026-09' });
  return openWord(review, decisions, d.current, d.marking.categories);
}

describe('schemaErrors', () => {
  it('says what is missing, extra, of the wrong type or not among the allowed', () => {
    const errors = schemaErrors({ ...answer(), splits: 'none', extra: 1, marking: [{ ...answer().marking[0], envelope: 'drawer' }] }, ANSWER_SCHEMA);
    assert.deepEqual(errors.sort(), ['$.extra: лишнее', '$.marking[0].envelope: не из "week", "extra", "outside", "ignored", null', '$.splits: не array']);
    const { answers: _, ...noAnswers } = answer();
    assert.deepEqual(schemaErrors(noAnswers, ANSWER_SCHEMA), ['$.answers: нет']);
    assert.deepEqual(schemaErrors(answer(), ANSWER_SCHEMA), []);
  });
});

describe('readAnswer', () => {
  const context = { expenses: new Set(['groceries', 'meat', 'person', 'self']), categories: new Set([food.id, cafe.id]) };

  it('keeps an answer that names the month’s expenses and existing categories', () => {
    assert.deepEqual(readAnswer(answer(), context), { answer: answer(), dropped: [] });
  });

  it('leaves out what names no expense of the month or no category, and says so', () => {
    const read = readAnswer(
      answer({
        marking: [
          { ...answer().marking[0]!, expenses: ['meat', 'gone'] },
          { title: 'Никуда', why: '', expenses: ['self'], ...none },
          { title: 'Чужая категория', why: '', expenses: ['self'], ...none, category: 'nothing' },
        ],
        questions: [{ ...answer().questions[0]!, options: [answer().questions[0]!.options[0]!, { ...none, label: 'Куда-то', category: 'nothing' }] }],
        splits: [{ ...answer().splits[0]!, category: 'nothing' }],
      }),
      context,
    );
    assert.ok('answer' in read);
    assert.deepEqual(read.answer.marking.map((m) => [m.title, m.expenses]), [['Свежее мясо → «Продукты › Рынок»', ['meat']]]);
    assert.deepEqual(read.answer.questions, [], 'a question with one option left asks nothing');
    assert.deepEqual(read.answer.splits, []);
    assert.deepEqual(read.dropped, [
      'разметка «Свежее мясо → «Продукты › Рынок»»: нет траты gone',
      'разметка «Никуда»: ничего не меняет',
      'разметка «Чужая категория»: нет категории nothing',
      'вопрос «70 000 Татьяне А. — что это?», «Куда-то»: нет категории nothing',
      'вопрос «70 000 Татьяне А. — что это?»: не о чем спрашивать',
      'разбиение nothing: нет категории или подкатегорий',
    ]);
  });

  it('takes a garbled id for the one expense of the month it starts like', () => {
    const ids = { expenses: new Set(['fe21e0c3-0621-440c-9fdf-af281b0157fd', 'fe21e0c4-1111-440c-9fdf-af281b0157fd']), categories: context.categories };
    const read = readAnswer(answer({ avoidable: [{ title: 'Плата по кредитке', text: '', expenses: ['fe21e0c3-2fbf-48c8-a0b3-f9f0a2bb0b1c', 'fe21e0c'] }] }), ids);
    assert.ok('answer' in read);
    assert.deepEqual(read.answer.avoidable[0]!.expenses, ['fe21e0c3-0621-440c-9fdf-af281b0157fd']);
    assert.ok(read.dropped.includes('лишняя трата «Плата по кредитке»: нет траты fe21e0c'), 'too short to tell');
  });

  it('turns down an answer of another shape as a whole', () => {
    assert.deepEqual(readAnswer({ findings: [] }, context), {
      errors: ['$.marking: нет', '$.questions: нет', '$.splits: нет', '$.avoidable: нет', '$.answers: нет'],
    });
  });
});

describe('openWord', () => {
  it('keeps open what the user has neither done nor changed since the answer', () => {
    const open = word(saved(), reviewed(saved()));
    assert.deepEqual(open.marking.map((m) => m.expenses.map((o) => o.id)), [['meat']]);
    assert.deepEqual(open.questions.map((q) => q.expenses.map((o) => o.id)), [['person']]);
    assert.deepEqual(open.splits.map((s) => s.category.title), ['Продукты']);
    assert.deepEqual(open.fresh, []);
  });

  it('lets go of an expense once accepted, turned down, answered or marked otherwise, and of a split once decided', () => {
    const review = reviewed(saved());
    const decisions = new Map([
      [spendingKey('person'), { decision: 'answered' as const, answer: 'В дополнительные' }],
      [splitKey(food.id), { decision: 'declined' as const, answer: null }],
    ]);
    const open = word(saved(), review, decisions);
    assert.deepEqual(open.questions, []);
    assert.deepEqual(open.splits, []);
    assert.equal(open.marking.length, 1);

    const otherwise = saved({ categorizations: new Map([['meat', { tag: cafe.id }]]), marks: new Map([['meat', 'extra']]) });
    assert.deepEqual(word(otherwise, review).marking, [], 'the user put it in extras since');
    const done = saved({ categorizations: new Map([['meat', { tag: food.id }]]) });
    assert.deepEqual(word(done, reviewed(done)).marking.map((m) => m.expenses.length), [1], 'the subcategory is still to put');
  });

  it('counts the expenses that came after the answer', () => {
    const review = reviewed(saved());
    review.seen.delete('self');
    assert.deepEqual(word(saved(), review).fresh.map((o) => o.id), ['self']);
  });
});

describe('claudeInput', () => {
  it('gives the month’s expenses with what the user wrote and did, and the payees’ months before', () => {
    const input = loadClaudeInput(data, saved(), { today, month: '2026-09', claude: () => ({ review: null, askedAt: null, failed: null, decisions: new Map() }) });
    assert.equal(input.month, '2026-09');
    assert.equal(input.selfPayee, 'Иван И.');
    const person = input.expenses.find((e) => e.id === 'person')!;
    assert.equal(person.kind, 'person');
    assert.equal(person.description, 'Долг за ремонт');
    assert.equal(input.expenses.find((e) => e.id === 'self')!.amountHint, 'похоже на Ozon или WB');
    assert.equal(input.expenses.find((e) => e.id === 'meat')!.bank, 'Мясная лавка');
    assert.deepEqual(input.payees.find((p) => p.payee === 'Татьяна А.'), {
      payee: 'Татьяна А.',
      before: { count: 1, min: 5_000, max: 5_000, categories: { 'без категории': 1 } },
      months: { '2026-06': 0, '2026-07': 0, '2026-08': 5_000 },
    });
    assert.equal(input.previous, null);
  });

  it('says what became of each piece of the answer before', () => {
    const review = reviewed(saved());
    const decisions = new Map([
      [spendingKey('person'), { decision: 'answered' as const, answer: 'В дополнительные' }],
      [spendingKey('meat'), { decision: 'declined' as const, answer: null }],
      [splitKey(food.id), { decision: 'accepted' as const, answer: null }],
    ]);
    const input = loadClaudeInput(data, saved(), { today, month: '2026-09', claude: () => ({ review, askedAt: '2026-10-09T13:00:00.000Z', failed: null, decisions }) });
    assert.deepEqual(input.previous, {
      madeAt: '2026-10-09T12:45:00.000Z',
      marking: [{ title: 'Свежее мясо → «Продукты › Рынок»', status: 'не надо' }],
      questions: [{ title: '70 000 Татьяне А. — что это?', status: 'ответ: В дополнительные' }],
      splits: [{ category: 'Продукты', status: 'принято' }],
    });
    assert.equal(input.expenses.find((e) => e.id === 'person')!.decided, 'ответ: В дополнительные');
    assert.equal(input.categories.find((c) => c.id === food.id)!.split, 'принято');

    const changed = loadClaudeInput(data, saved({ marks: new Map([['meat', 'extra']]) }), { today, month: '2026-09', claude: () => ({ review, askedAt: null, failed: null, decisions: new Map() }) });
    assert.deepEqual(changed.previous!.marking, [{ title: 'Свежее мясо → «Продукты › Рынок»', status: 'размечено по-своему' }]);
  });
});

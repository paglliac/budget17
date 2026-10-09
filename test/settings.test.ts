import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { Settings } from '../src/settings.ts';
import { regularInput } from './fixtures.ts';

describe('Settings', () => {
  it('adds, edits and deletes regular expenses, listing them by day and title', () => {
    using settings = new Settings(':memory:');
    assert.deepEqual(settings.regularExpenses(), []);

    const school = settings.addRegularExpense(regularInput({ title: 'Школа', amount: 45_000, day: 30 }));
    settings.addRegularExpense(regularInput({ title: 'Телефон', amount: 1_500, day: 2 }));
    settings.addRegularExpense(regularInput({ title: 'Интернет', amount: 1_100, day: 2 }));
    assert.deepEqual(settings.regularExpenses().map((e) => e.title), ['Интернет', 'Телефон', 'Школа']);

    assert.equal(settings.updateRegularExpense(school.id, regularInput({ title: 'Школа', amount: 47_000, day: 1 })), true);
    assert.deepEqual(settings.regularExpenses()[0], { id: school.id, title: 'Школа', amount: 47_000, day: 1, start: null, end: null, icon: null });

    assert.equal(settings.deleteRegularExpense(school.id), true);
    assert.deepEqual(settings.regularExpenses().map((e) => e.title), ['Интернет', 'Телефон']);
  });

  it('keeps the dates and the icon of a regular expense', () => {
    using settings = new Settings(':memory:');
    const loan = settings.addRegularExpense(regularInput({ title: 'Кредит', amount: 12_000, day: 25, end: '2027-03-25', icon: 'card' }));
    assert.deepEqual(settings.regularExpenses(), [{ ...loan, start: null, end: '2027-03-25', icon: 'card' }]);

    settings.updateRegularExpense(loan.id, regularInput({ title: 'Кредит', amount: 12_000, day: 25, start: '2026-11-01' }));
    assert.deepEqual(settings.regularExpenses(), [{ ...loan, start: '2026-11-01', end: null, icon: null }]);
  });

  it('reports an expense that is not there', () => {
    using settings = new Settings(':memory:');

    assert.equal(settings.updateRegularExpense(42, regularInput({ title: 'Нет', amount: 1, day: 1 })), false);
    assert.equal(settings.deleteRegularExpense(42), false);
  });

  it('keeps incomes with the numbers of their model', () => {
    using settings = new Settings(':memory:');

    const salary = settings.addIncome({ title: 'Зарплата', model: 'salary', params: { salary: 200_000, advanceDay: 20, payDay: 5 } });
    settings.addIncome({ title: 'Аренда', model: 'fixed', params: { amount: 100_000, day: 5 } });
    assert.deepEqual(settings.incomes().map((i) => [i.title, i.model]), [['Аренда', 'fixed'], ['Зарплата', 'salary']]);

    assert.equal(settings.updateIncome(salary.id, { ...salary, params: { salary: 210_000, advanceDay: 20, payDay: 5 } }), true);
    assert.deepEqual(settings.incomes()[1], { ...salary, params: { salary: 210_000, advanceDay: 20, payDay: 5 } });

    assert.equal(settings.deleteIncome(salary.id), true);
    assert.equal(settings.deleteIncome(salary.id), false);
    assert.deepEqual(settings.incomes().map((i) => i.title), ['Аренда']);
  });

  it('keeps purchases by week, edits them, marks them bought and deletes them', () => {
    using settings = new Settings(':memory:');

    const boots = settings.addPurchase({ title: 'Ботинки', amount: 8_000, week: '2026-10-12', envelope: 'week', kind: 'flexible', done: false });
    settings.addPurchase({ title: 'Ласты', amount: 5_000, week: '2026-10-05', envelope: 'extra', kind: 'flexible', done: false });
    assert.deepEqual(settings.purchases().map((p) => [p.title, p.envelope]), [['Ласты', 'extra'], ['Ботинки', 'week']]);

    assert.equal(settings.updatePurchase(boots.id, { amount: 7_400, done: true }), true);
    assert.deepEqual(settings.purchases()[1], { ...boots, amount: 7_400, done: true });
    settings.updatePurchase(boots.id, { kind: 'required' });
    assert.equal(settings.purchases()[1]?.kind, 'required');

    assert.equal(settings.deletePurchase(boots.id), true);
    assert.equal(settings.updatePurchase(boots.id, { done: false }), false);
    assert.deepEqual(settings.purchases().map((p) => p.title), ['Ласты']);
  });

  it('begins weeks on Monday until another day is picked, and moves purchases and week amounts to the weeks that hold most of their days', () => {
    using settings = new Settings(':memory:');
    assert.equal(settings.weekStart(), 0);
    const haircut = settings.addPurchase({ title: 'Стрижка', amount: 2_200, week: '2026-10-12', envelope: 'week', kind: 'flexible', done: false });
    settings.setWeekLimit('2026-10-12', 30_000);
    settings.setWeekLimit('2026-10-19', 50_000);

    settings.setWeekStart(4);
    assert.equal(settings.weekStart(), 4);
    assert.equal(settings.purchases().find((p) => p.id === haircut.id)?.week, '2026-10-09', 'Friday 9 – Thursday 15 October');
    assert.deepEqual([...settings.weekLimits()], [['2026-10-09', 30_000], ['2026-10-16', 50_000]]);

    settings.setWeekStart(0);
    assert.equal(settings.purchases()[0]?.week, '2026-10-12', 'back where it was');
    assert.deepEqual([...settings.weekLimits()], [['2026-10-12', 30_000], ['2026-10-19', 50_000]]);
  });

  it('remembers the user’s own name in transfers to themselves and forgets it', () => {
    using settings = new Settings(':memory:');
    assert.equal(settings.selfPayee(), null);
    settings.setSelfPayee('Иван И.');
    settings.setSelfPayee('Кирилл А.');
    assert.equal(settings.selfPayee(), 'Кирилл А.');
    settings.setSelfPayee(null);
    assert.equal(settings.selfPayee(), null);
  });

  it('sets what a week allows and gives the usual back', () => {
    using settings = new Settings(':memory:');
    settings.setWeekLimit('2026-10-12', 30_000);
    settings.setWeekLimit('2026-10-12', 25_000);
    assert.deepEqual([...settings.weekLimits()], [['2026-10-12', 25_000]]);
    settings.setWeekLimit('2026-10-12', null);
    assert.deepEqual([...settings.weekLimits()], []);
  });

  it('turns a wish into a purchase of a week', () => {
    using settings = new Settings(':memory:');

    const styler = settings.addWish({ title: 'Укладка', amount: 4_500 });
    settings.addWish({ title: 'Пылесос', amount: 30_000 });
    assert.equal(settings.updateWish(styler.id, { title: 'Укладка для волос', amount: 4_500 }), true);

    const planned = settings.planWish(styler.id, { week: '2026-10-05', envelope: 'week' });
    assert.deepEqual(planned && { ...planned, id: 0 }, { id: 0, title: 'Укладка для волос', amount: 4_500, week: '2026-10-05', envelope: 'week', kind: 'flexible', done: false });
    assert.deepEqual(settings.wishes().map((w) => w.title), ['Пылесос']);
    assert.equal(settings.planWish(styler.id, { week: '2026-10-05', envelope: 'week' }), null);
  });

  it('remembers spending moved out of its week or not counted at all, and forgets it when moved back', () => {
    using settings = new Settings(':memory:');

    settings.markSpending('tx-1', 'extra');
    settings.markSpending('tx-2', 'outside');
    settings.markSpending('tx-1', 'outside');
    settings.markSpending('tx-3', 'ignored');
    assert.deepEqual(settings.spendingMarks(), new Map([['tx-1', 'outside'], ['tx-2', 'outside'], ['tx-3', 'ignored']]));

    settings.markSpending('tx-1', 'week');
    settings.markSpending('tx-2', 'ignored');
    settings.markSpending('tx-3', 'extra');
    assert.deepEqual(settings.spendingMarks(), new Map([['tx-2', 'ignored'], ['tx-3', 'extra']]));
  });

  it('keeps categories picked for expenses and regular expenses they paid, and forgets them when taken back', () => {
    using settings = new Settings(':memory:');
    const rent = settings.addRegularExpense(regularInput({ title: 'Мастерская аренда', amount: 40_000, day: 10 }));

    settings.categorize('tx-1', { tag: 'groceries' });
    settings.categorize('tx-2', { regular: rent.id });
    settings.categorize('tx-3', { tag: 'cafe' });
    settings.categorize('tx-3', { regular: rent.id });
    settings.categorize('tx-1', null);
    assert.deepEqual([...settings.categorizations()], [['tx-2', { regular: rent.id }], ['tx-3', { regular: rent.id }]]);

    settings.categorize('tx-4', { tag: 'cafe' });
    settings.deleteRegularExpense(rent.id);
    assert.deepEqual([...settings.categorizations()], [['tx-4', { tag: 'cafe' }]], 'deleting the expense unlinks its payments');
  });

  it('links expenses to purchases apart from their categories, and unlinks them when the purchase goes', () => {
    using settings = new Settings(':memory:');
    const rent = settings.addRegularExpense(regularInput({ title: 'Аренда', amount: 40_000, day: 10 }));
    const shoes = settings.addPurchase({ title: 'Ботинки', amount: 8_000, week: '2026-10-05', envelope: 'week', kind: 'flexible', done: false });

    settings.categorize('tx-1', { tag: 'shoes' });
    settings.linkPurchase('tx-1', shoes.id);
    settings.categorize('tx-2', { regular: rent.id });
    settings.linkPurchase('tx-2', shoes.id);
    assert.deepEqual([...settings.categorizations()], [['tx-1', { tag: 'shoes' }]], 'a purchase replaces a regular expense, not a category');
    assert.deepEqual([...settings.purchasePayments()], [['tx-1', shoes.id], ['tx-2', shoes.id]]);

    settings.categorize('tx-2', { regular: rent.id });
    assert.deepEqual([...settings.purchasePayments()], [['tx-1', shoes.id]], 'a regular expense replaces a purchase');
    settings.deletePurchase(shoes.id);
    assert.deepEqual([...settings.purchasePayments()], []);
  });

  it('keeps what the user wrote about expenses, replaces it and takes it away', () => {
    using settings = new Settings(':memory:');

    settings.describeSpending('tx-1', 'Подарок маме');
    settings.describeSpending('tx-2', 'Бензин в Шерегеш');
    settings.describeSpending('tx-1', 'Подарок на день рождения');
    settings.describeSpending('tx-2', null);
    assert.deepEqual([...settings.spendingDescriptions()], [['tx-1', 'Подарок на день рождения']]);
  });

  it('renames and hides ZenMoney categories, and keeps the user’s own', () => {
    using settings = new Settings(':memory:');

    settings.renameCategory('groceries', 'Продукты');
    settings.hideCategory('correction', true);
    settings.hideCategory('groceries', false);
    const kids = settings.addOwnCategory('Дети');
    settings.addOwnCategory('Бассейн');
    assert.deepEqual(settings.categorySetup(), {
      changes: new Map([
        ['groceries', { title: 'Продукты', hidden: false }],
        ['correction', { title: null, hidden: true }],
      ]),
      own: [
        { id: 'own-2', title: 'Бассейн', hidden: false, kind: 'expense' },
        { id: 'own-1', title: 'Дети', hidden: false, kind: 'expense' },
      ],
    });

    settings.renameCategory('groceries', null);
    assert.equal(settings.renameCategory(kids.id, 'Савва'), true);
    assert.equal(settings.renameCategory(kids.id, null), false, 'an own category needs a title');
    assert.equal(settings.hideCategory(kids.id, true), true);
    assert.deepEqual(settings.categorySetup().changes.get('groceries'), { title: null, hidden: false });
    assert.deepEqual(settings.categorySetup().own.find((c) => c.id === kids.id), { id: kids.id, title: 'Савва', hidden: true, kind: 'expense' });

    settings.categorize('tx-1', { tag: kids.id });
    settings.categorize('tx-2', { tag: 'groceries' });
    assert.equal(settings.deleteOwnCategory(kids.id), true);
    assert.deepEqual([...settings.categorizations()], [['tx-2', { tag: 'groceries' }]], 'its expenses are left without a category');
    assert.equal(settings.deleteOwnCategory(kids.id), false);
    assert.equal(settings.deleteOwnCategory('groceries'), false, 'a ZenMoney category is not deleted');
    assert.equal(settings.addOwnCategory('Дети').id, 'own-3', 'ids are not reused');
  });

  it('splits categories into subcategories, sends shops and expenses into them, and forgets them with the subcategory', () => {
    using settings = new Settings(':memory:');
    const lenta = settings.addSubcategory('groceries', 'Лента');
    const market = settings.addSubcategory('groceries', 'Рынок');
    assert.deepEqual(settings.addSubcategory('groceries', 'лента'), lenta, 'one title a category');
    assert.notEqual(settings.addSubcategory('cafe', 'Лента').id, lenta.id, 'another category has its own');

    settings.putShop('groceries', 'lenta', lenta.id);
    settings.putShop('groceries', 'lenta', market.id);
    settings.putSpending('tx-1', market.id);
    settings.putSpending('tx-2', null);
    settings.putSpending('tx-3', lenta.id);
    settings.putSpending('tx-3', undefined);
    const setup = settings.subcategorySetup();
    assert.deepEqual(setup.subcategories.filter((s) => s.category === 'groceries').map((s) => s.title), ['Лента', 'Рынок']);
    assert.deepEqual([...setup.shops.get('groceries')!], [['lenta', market.id]], 'a shop goes into one subcategory of a category');
    assert.deepEqual([...setup.spending], [['tx-1', market.id], ['tx-2', null]]);

    assert.equal(settings.renameSubcategory(market.id, 'Рынок и фермеры'), true);
    assert.equal(settings.deleteSubcategory(market.id), true);
    assert.equal(settings.deleteSubcategory(market.id), false);
    const after = settings.subcategorySetup();
    assert.equal(after.shops.get('groceries'), undefined, 'its shops are left without one');
    assert.deepEqual([...after.spending], [['tx-2', null]]);
    settings.putShop('groceries', 'lenta', lenta.id);
    settings.putShop('groceries', 'lenta', null);
    assert.equal(settings.subcategorySetup().shops.get('groceries'), undefined);
  });

  it('deletes the subcategories of an own category with it', () => {
    using settings = new Settings(':memory:');
    const kids = settings.addOwnCategory('Дети');
    const toys = settings.addSubcategory(kids.id, 'Игрушки');
    settings.putShop(kids.id, 'detskiimir', toys.id);
    settings.putSpending('tx-1', toys.id);
    settings.deleteOwnCategory(kids.id);
    const setup = settings.subcategorySetup();
    assert.deepEqual([setup.subcategories, [...setup.shops], [...setup.spending]], [[], [], []]);
  });

  it('remembers the hints turned down', () => {
    using settings = new Settings(':memory:');
    settings.dismissHints(['hide:gifts', 'spending:tx-1']);
    settings.dismissHints(['spending:tx-1']);
    assert.deepEqual([...settings.dismissedHints()], ['hide:gifts', 'spending:tx-1']);
  });

  it('keeps expenses in a file between runs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-settings-'));
    try {
      const path = join(dir, 'nested', 'settings.db');
      {
        using settings = new Settings(path);
        settings.addRegularExpense(regularInput({ title: 'Ипотека', amount: 29_000, day: 21 }));
      }
      using settings = new Settings(path);
      assert.deepEqual(settings.regularExpenses(), [{ id: 1, title: 'Ипотека', amount: 29_000, day: 21, start: null, end: null, icon: null }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adds the dates and the icon to a file made before them, keeping its expenses', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-settings-'));
    try {
      const path = join(dir, 'settings.db');
      {
        using db = new DatabaseSync(path);
        db.exec(`CREATE TABLE regular_expense (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          amount REAL NOT NULL CHECK (amount > 0),
          day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31)
        ) STRICT`);
        db.exec(`INSERT INTO regular_expense (title, amount, day) VALUES ('Школа, ЛДК', 45000, 7)`);
      }
      {
        using settings = new Settings(path);
        assert.deepEqual(settings.regularExpenses(), [{ id: 1, title: 'Школа, ЛДК', amount: 45_000, day: 7, start: null, end: null, icon: null }]);
        settings.updateRegularExpense(1, regularInput({ title: 'Школа, ЛДК', amount: 45_000, day: 7, end: '2027-05-31', icon: 'book' }));
      }
      using settings = new Settings(path);
      assert.equal(settings.regularExpenses()[0]?.end, '2027-05-31', 'opening it again changes nothing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adds the first day of a week and the amounts of weeks to a file made before them, keeping its purchases', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-settings-'));
    try {
      const path = join(dir, 'settings.db');
      {
        using db = new DatabaseSync(path);
        db.exec(`CREATE TABLE purchase (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          amount REAL NOT NULL CHECK (amount > 0),
          week TEXT NOT NULL,
          envelope TEXT NOT NULL CHECK (envelope IN ('week', 'extra')),
          done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1))
        ) STRICT`);
        db.exec(`INSERT INTO purchase (title, amount, week, envelope) VALUES ('Стрижка', 2200, '2026-10-12', 'week')`);
      }
      {
        using settings = new Settings(path);
        assert.equal(settings.weekStart(), 0);
        assert.deepEqual([...settings.weekLimits()], []);
        settings.setWeekStart(2);
        settings.setWeekLimit('2026-10-07', 30_000);
      }
      using settings = new Settings(path);
      assert.equal(settings.weekStart(), 2);
      assert.deepEqual([...settings.weekLimits()], [['2026-10-07', 30_000]]);
      assert.equal(settings.purchases()[0]?.week, '2026-10-14', 'Wednesday 14 – Tuesday 20 October');
      assert.equal(settings.purchases()[0]?.kind, 'flexible', 'a purchase from before kinds is flexible');
      settings.updatePurchase(settings.purchases()[0]!.id, { kind: 'required' });
      assert.equal(settings.purchases()[0]?.kind, 'required');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adds purchase links, categories and descriptions to a file made before them, keeping how expenses were sorted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-settings-'));
    try {
      const path = join(dir, 'settings.db');
      {
        using db = new DatabaseSync(path);
        db.exec(`CREATE TABLE categorization (
          transaction_id TEXT PRIMARY KEY,
          tag_id TEXT,
          regular_expense_id INTEGER,
          CHECK ((tag_id IS NULL) <> (regular_expense_id IS NULL))
        ) STRICT`);
        db.exec(`INSERT INTO categorization (transaction_id, tag_id) VALUES ('tx-1', 'cafe')`);
      }
      using settings = new Settings(path);
      assert.deepEqual([...settings.categorizations()], [['tx-1', { tag: 'cafe' }]]);
      settings.linkPurchase('tx-1', 1);
      settings.renameCategory('cafe', 'Кафе');
      settings.describeSpending('tx-1', 'Кофе с Машей');
      assert.deepEqual([...settings.purchasePayments()], [['tx-1', 1]]);
      assert.equal(settings.categorySetup().changes.get('cafe')?.title, 'Кафе');
      assert.deepEqual([...settings.spendingDescriptions()], [['tx-1', 'Кофе с Машей']]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adds the kind of own categories to a file made before it, keeping them for expenses', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-settings-'));
    try {
      const path = join(dir, 'settings.db');
      {
        using db = new DatabaseSync(path);
        db.exec(`CREATE TABLE own_category (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))
        ) STRICT`);
        db.exec(`INSERT INTO own_category (title) VALUES ('Подписки')`);
      }
      using settings = new Settings(path);
      settings.addOwnCategory('Кэшбэк', 'income');
      assert.deepEqual(settings.categorySetup().own, [
        { id: 'own-2', title: 'Кэшбэк', hidden: false, kind: 'income' },
        { id: 'own-1', title: 'Подписки', hidden: false, kind: 'expense' },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adds subcategories and turned down hints to a file made before them, keeping its categories', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-settings-'));
    try {
      const path = join(dir, 'settings.db');
      {
        using db = new DatabaseSync(path);
        db.exec(`CREATE TABLE category_change (
          tag_id TEXT PRIMARY KEY,
          title TEXT,
          hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))
        ) STRICT`);
        db.exec(`INSERT INTO category_change (tag_id, title) VALUES ('groceries', 'Продукты')`);
      }
      using settings = new Settings(path);
      const lenta = settings.addSubcategory('groceries', 'Лента');
      settings.putShop('groceries', 'lenta', lenta.id);
      settings.dismissHints(['hide:gifts']);
      assert.deepEqual([...settings.categorySetup().changes], [['groceries', { title: 'Продукты', hidden: false }]]);
      assert.deepEqual([...settings.subcategorySetup().shops.get('groceries')!], [['lenta', lenta.id]]);
      assert.deepEqual([...settings.dismissedHints()], ['hide:gifts']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

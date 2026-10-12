import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Settings } from '../src/settings.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import type { SavedMarking } from '../src/web/pages/marking.ts';
import { loadSettingsPage, renderSettings, submitBudget, submitSettings } from '../src/web/pages/settings.ts';
import { account, RUB, tag, transaction, user } from './fixtures.ts';

const today = '2026-10-06';
const groceries = tag({ id: 'groceries', title: 'Groceries' });
const cafe = tag({ id: 'cafe', title: 'Eating out' });
const correction = tag({ id: 'correction', title: 'Correction', showIncome: true });
const salary = tag({ id: 'salary', title: 'Salary', showIncome: true, showOutcome: false });
const data: EntityCollections = {
  instrument: [RUB],
  user: [user()],
  account: [account({ id: 'card' })],
  tag: [groceries, cafe, correction, salary],
  transaction: [
    transaction({ date: '2026-10-01', outcome: 300, tag: [cafe.id] }),
    transaction({ date: '2026-10-02', outcome: 300, tag: [cafe.id] }),
    transaction({ id: 'kids', date: '2026-10-03', outcome: 300 }),
    transaction({ date: '2026-10-04', outcome: 300, tag: [groceries.id] }),
    transaction({ date: '2026-10-05', income: 100_000, tag: [salary.id] }),
  ],
};

function saved(settings: Settings): SavedMarking {
  return {
    categorizations: settings.categorizations(),
    purchasePayments: new Map(),
    regular: [],
    purchases: [],
    marks: new Map(),
    descriptions: new Map(),
    categories: settings.categorySetup(),
    weekStart: settings.weekStart(),
    selfPayee: settings.selfPayee(),
  };
}

const render = (settings: Settings, options: Partial<Parameters<typeof loadSettingsPage>[2]> = {}) =>
  String(renderSettings(loadSettingsPage(data, saved(settings), { today, ...options }), createHref())).replaceAll(' ', ' ');

describe('settings page', () => {
  it('lists categories most popular first, renamed, own and hidden ones apart', () => {
    using settings = new Settings(':memory:');
    settings.renameCategory(groceries.id, 'Продукты');
    settings.hideCategory(correction.id, true);
    const kids = settings.addOwnCategory('Дети');
    settings.categorize('kids', { tag: kids.id });
    const page = render(settings);

    assert.ok(page.includes('3 категории из ZenMoney и 1 своя, 1 скрыта.'));
    const rows = [...page.slice(page.indexOf('aria-label="Категории расходов"')).matchAll(/<b>([^<]*)<\/b><small>([^<]*)<\/small>/g)].map((m) => `${m[1]}: ${m[2]}`);
    assert.deepEqual(rows, [
      'Eating out: из ZenMoney · 2 траты за три месяца',
      'Продукты: в ZenMoney «Groceries» · 1 трата за три месяца',
      'Дети: своя · 1 трата за три месяца',
      'Salary: из ZenMoney · 1 доход за три месяца',
      'Correction: из ZenMoney · за три месяца трат нет',
    ]);
    assert.ok(page.indexOf('Скрытые') < page.indexOf('Correction'));
    assert.ok(page.includes('href="/settings"') && page.includes('action="/categories"'));
  });

  it('opens a ZenMoney category to rename or hide it, and an own one to delete it too', () => {
    using settings = new Settings(':memory:');
    const kids = settings.addOwnCategory('Дети');

    const zenmoney = render(settings, { edit: groceries.id });
    assert.ok(zenmoney.includes('action="/categories/groceries"') && zenmoney.includes('value="Groceries"'));
    assert.ok(zenmoney.includes('Название, в ZenMoney «Groceries»'));
    assert.ok(zenmoney.includes('formaction="/categories/groceries/hide"') && !zenmoney.includes('formaction="/categories/groceries/delete"'));

    const own = render(settings, { edit: kids.id });
    assert.ok(own.includes(`formaction="/categories/${kids.id}/delete"`));
  });

  it('draws a category by its title until the user picks an icon, a colour or a photo, and offers them in its form', () => {
    using settings = new Settings(':memory:');
    const kids = settings.addOwnCategory('Дети');
    settings.renameCategory(groceries.id, 'Продукты');
    const tile = (page: string, id: string) => page.slice(page.indexOf(`id="category-${id}"`)).match(/--color:([^"]*)"/)?.[1];

    const before = render(settings);
    assert.equal(tile(before, groceries.id), 'var(--green)', 'Продукты are green by their title');

    settings.dressCategory(groceries.id, { icon: 'basket', color: '#1E90FF' });
    settings.setCategoryPhoto(kids.id, { type: 'image/jpeg', data: new Uint8Array([0xff, 0xd8, 0xff, 1]) });
    const after = render(settings);
    assert.equal(tile(after, groceries.id), '#1E90FF');
    assert.match(after, new RegExp(`<img class="photo" src="/category-photo/${kids.id}\\?v=[0-9a-f]{12}"`));

    const form = render(settings, { edit: groceries.id });
    assert.ok(form.includes('name="icon" value="basket" aria-label="Корзина" checked'), 'the picked icon');
    assert.ok(form.includes('name="color" value="custom" data-color="#1E90FF" aria-label="Свой цвет" checked'), 'a colour of the wheel');
    assert.ok(form.includes('data-photo="photo"') && form.includes('Выбрать фото') && !form.includes('/photo/delete'));
    const own = render(settings, { edit: kids.id });
    assert.ok(own.includes('name="icon" value="" aria-label="По названию" checked') && own.includes('name="color" value="" data-color='));
    assert.ok(own.includes(`formaction="/categories/${kids.id}/photo/delete"`) && own.includes('Другое фото'));
  });
});

describe('settings page incomes', () => {
  it('lists income categories apart, with how many incomes went into each, and a form for a new one', () => {
    using settings = new Settings(':memory:');
    settings.addOwnCategory('Кэшбэк', 'income');
    const page = render(settings);

    const incomes = page.slice(page.indexOf('aria-label="Категории доходов"'));
    const rows = [...incomes.matchAll(/<b>([^<]*)<\/b><small>([^<]*)<\/small>/g)].map((m) => `${m[1]}: ${m[2]}`);
    assert.deepEqual(rows, ['Salary: из ZenMoney · 1 доход за три месяца', 'Correction: из ZenMoney · за три месяца доходов нет', 'Кэшбэк: своя · за три месяца доходов нет']);
    assert.ok(incomes.includes('id="income-category-new"') && incomes.includes('name="kind" value="income"'));
    assert.ok(page.includes('У доходов свои категории, их 3.'));
    assert.ok(!page.slice(0, page.indexOf('aria-label="Категории доходов"')).includes('Кэшбэк'), 'not among the spending ones');
  });

  it('opens a category shared by expenses and incomes in the list it was opened from', () => {
    using settings = new Settings(':memory:');
    const page = render(settings, { edit: 'income-correction' });

    assert.ok(page.includes('id="income-category-correction"') && page.includes('action="/categories/correction"'));
    assert.equal(page.match(/action="\/categories\/correction"/g)?.length, 1, 'the spending one stays a row');
    assert.ok(page.includes('href="/settings?edit=correction"'));
  });

  it('adds an own income category and shows its error in the income list', () => {
    using settings = new Settings(':memory:');
    const form = (fields: Record<string, string>) => new URLSearchParams(fields);

    assert.deepEqual(submitSettings(settings, data, '/categories', form({ title: 'Кэшбэк', kind: 'income' })), { status: 'saved' });
    assert.deepEqual(settings.categorySetup().own, [{ id: 'own-1', title: 'Кэшбэк', hidden: false, kind: 'income' }]);
    assert.deepEqual(submitSettings(settings, data, '/categories/salary/hide', form({ kind: 'income' })), { status: 'saved' });

    const result = submitSettings(settings, data, '/categories', form({ title: '', kind: 'income' }));
    assert.ok(result.status === 'invalid');
    const page = render(settings, { form: result.form });
    assert.ok(page.indexOf('Укажите название') > page.indexOf('aria-label="Категории доходов"'));
  });
});

describe('settings page budget', () => {
  it('picks the day a week begins on in one click', () => {
    using settings = new Settings(':memory:');
    settings.setWeekStart(2);
    const page = render(settings);

    assert.ok(page.includes('Неделя начинается в среду: в этот день обновляются 45 000 ₽ на обычные траты. Если неделе нужно ужаться, её бюджет меняют на странице недели.'));
    const days = /aria-label="Неделя начинается".*?<\/div>/s.exec(page)?.[0] ?? '';
    assert.ok(/aria-current="true">.*?<span>Ср<\/span>/s.test(days), 'Wednesday is the current choice');
    assert.ok(days.includes('action="/budget/week-start/0"') && !days.includes('action="/budget/week-start/2"'));
    assert.ok(!page.includes('Изменить бюджет недели'), 'the amount of a week is changed on the week');
  });

  it('keeps the user’s own name in transfers to themselves, opening a form to change it', () => {
    using settings = new Settings(':memory:');
    assert.ok(render(settings).includes('<b>Переводы себе</b><small>имя не указано</small>'));
    settings.setSelfPayee('Иван И.');
    assert.ok(render(settings).includes('<b>Переводы себе</b><small>приходят на имя Иван И.</small>'));

    const form = render(settings, { edit: 'self-payee' });
    assert.ok(form.includes('action="/budget/self-payee"') && form.includes('value="Иван И."'));
  });

  it('shows only the last characters of the Claude token, and never fills it in', () => {
    using settings = new Settings(':memory:');
    assert.ok(render(settings).includes('<b>Токен Claude</b><small>не задан · разбор месяца — по правилам</small>'));
    const token = 'sk-ant-oat01-secret-part-wxyz';
    const page = render(settings, { claudeToken: token });
    assert.ok(page.includes('<b>Токен Claude</b><small>…wxyz · сервер сам разбирает месяц по кнопке на разборе</small>'));
    const form = render(settings, { edit: 'claude-token', claudeToken: token });
    assert.ok(form.includes('action="/budget/claude-token"') && form.includes('type="password"'));
    assert.ok(form.includes('formaction="/budget/claude-token/delete"'));
    for (const html of [page, form]) assert.ok(!html.includes('secret'), 'the token stays on the server');
  });
});

describe('submitBudget', () => {
  it('sets the first day of a week and refuses a day that is not one', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitBudget(settings, '/budget/week-start/4'), { status: 'saved' });
    assert.equal(settings.weekStart(), 4);
    assert.deepEqual(submitBudget(settings, '/budget/week-start/7'), { status: 'missing' });
    assert.deepEqual(submitBudget(settings, '/budget/weeks'), { status: 'missing' });
    assert.equal(settings.weekStart(), 4);
  });

  it('saves the user’s own name trimmed, and forgets it when sent empty', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitBudget(settings, '/budget/self-payee', new URLSearchParams({ name: '  Кирилл А. ' })), { status: 'saved' });
    assert.equal(settings.selfPayee(), 'Кирилл А.');
    assert.deepEqual(submitBudget(settings, '/budget/self-payee', new URLSearchParams({ name: ' ' })), { status: 'saved' });
    assert.equal(settings.selfPayee(), null);
  });

  it('saves the Claude token without the breaks of a paste, keeps it when sent empty, and forgets it on delete', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitBudget(settings, '/budget/claude-token', new URLSearchParams({ token: ' sk-ant-oat01-ab\ncd ' })), { status: 'saved' });
    assert.equal(settings.claudeToken(), 'sk-ant-oat01-abcd');
    submitBudget(settings, '/budget/claude-token', new URLSearchParams({ token: '' }));
    assert.equal(settings.claudeToken(), 'sk-ant-oat01-abcd');
    assert.deepEqual(submitBudget(settings, '/budget/claude-token/delete'), { status: 'saved' });
    assert.equal(settings.claudeToken(), null);
  });
});

describe('submitSettings', () => {
  const form = (fields: Record<string, string> = {}) => new URLSearchParams(fields);

  it('adds own categories, renames, hides and deletes them', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitSettings(settings, data, '/categories', form({ title: '  Дети ' })), { status: 'saved' });
    assert.deepEqual(submitSettings(settings, data, '/categories/groceries', form({ title: 'Продукты' })), { status: 'saved' });
    assert.deepEqual(submitSettings(settings, data, '/categories/correction/hide', form()), { status: 'saved' });
    assert.deepEqual(submitSettings(settings, data, '/categories/own-1', form({ title: 'Савва' })), { status: 'saved' });
    assert.deepEqual(settings.categorySetup(), {
      changes: new Map([
        ['groceries', { title: 'Продукты', hidden: false }],
        ['correction', { title: null, hidden: true }],
      ]),
      own: [{ id: 'own-1', title: 'Савва', hidden: false, kind: 'expense' }],
      looks: new Map(),
    });

    submitSettings(settings, data, '/categories/groceries', form({ title: 'Groceries' }));
    submitSettings(settings, data, '/categories/correction/show', form());
    assert.deepEqual(settings.categorySetup().changes.get('groceries'), { title: null, hidden: false }, 'ZenMoney’s title back');
    assert.deepEqual(settings.categorySetup().changes.get('correction'), { title: null, hidden: false });
    assert.deepEqual(submitSettings(settings, data, '/categories/own-1/delete', form()), { status: 'saved' });
    assert.deepEqual(settings.categorySetup().own, []);
  });

  it('picks a category’s icon and colour, puts a photo on it and takes it off, keeping them when a form has none', () => {
    using settings = new Settings(':memory:');
    const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]).toString('base64')}`;
    const look = (id: string) => settings.categorySetup().looks?.get(id);

    assert.deepEqual(submitSettings(settings, data, '/categories', form({ title: 'Дети', icon: 'baby', color: 'orange', photo: jpeg })), { status: 'saved' });
    assert.deepEqual(look('own-1'), { icon: 'baby', color: 'orange', photo: look('own-1')?.photo });
    assert.deepEqual(settings.categoryPhoto('own-1'), { type: 'image/jpeg', data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]) });

    submitSettings(settings, data, '/categories/groceries', form({ title: '', icon: 'basket', color: 'custom', 'color-custom': '#1e90ff' }));
    assert.deepEqual(look('groceries'), { icon: 'basket', color: '#1E90FF', photo: null });
    submitSettings(settings, data, '/categories/groceries', form({ title: 'Продукты' }));
    assert.deepEqual(look('groceries'), { icon: 'basket', color: '#1E90FF', photo: null }, 'an older app sends only the title');
    submitSettings(settings, data, '/categories/groceries', form({ title: 'Продукты', icon: '', color: '' }));
    assert.deepEqual(look('groceries'), { icon: null, color: null, photo: null }, 'empty ones give the category’s own back');
    submitSettings(settings, data, '/categories/groceries', form({ title: 'Продукты', icon: 'rocket', color: 'gold' }));
    assert.deepEqual(look('groceries'), { icon: null, color: null, photo: null }, 'an icon or a colour the app does not know is none');

    assert.deepEqual(submitSettings(settings, data, '/categories/own-1/photo/delete', form()), { status: 'saved' });
    assert.equal(settings.categoryPhoto('own-1'), null);
    submitSettings(settings, data, '/categories/own-1', form({ title: 'Дети', photo: jpeg }));
    assert.ok(settings.categoryPhoto('own-1'));
    submitSettings(settings, data, '/categories/own-1', form({ title: 'Дети', photo: '' }));
    assert.equal(settings.categoryPhoto('own-1'), null, 'an empty photo takes it off');

    const gif = `data:image/gif;base64,${Buffer.from('GIF89a').toString('base64')}`;
    const fake = `data:image/png;base64,${Buffer.from('not a png').toString('base64')}`;
    for (const photo of [gif, fake, `data:image/jpeg;base64,${Buffer.alloc(400_001, 0xff).toString('base64')}`]) {
      const result = submitSettings(settings, data, '/categories/own-1', form({ title: 'Савва', icon: 'paw', photo }));
      assert.equal(result.status, 'invalid');
      assert.ok(result.status === 'invalid' && result.form.errors.photo, 'the photo is wrong');
    }
    assert.equal(settings.categorySetup().own[0]?.title, 'Дети', 'nothing is saved with a wrong photo');
  });

  it('returns the form with an error, and refuses an unknown category or deleting a ZenMoney one', () => {
    using settings = new Settings(':memory:');
    settings.addOwnCategory('Дети');

    assert.deepEqual(submitSettings(settings, data, '/categories', form({ title: ' ' })), {
      status: 'invalid',
      form: { id: null, kind: 'expense', title: ' ', icon: '', color: '', errors: { title: 'Укажите название' } },
    });
    assert.equal(submitSettings(settings, data, '/categories/own-1', form({ title: '' })).status, 'invalid');
    assert.deepEqual(submitSettings(settings, data, '/categories/nope', form({ title: 'Нет' })), { status: 'missing' });
    assert.deepEqual(submitSettings(settings, data, '/categories/groceries/delete', form()), { status: 'missing' });
    assert.deepEqual(submitSettings(settings, data, '/categories/groceries/drop', form()), { status: 'missing' });
  });
});

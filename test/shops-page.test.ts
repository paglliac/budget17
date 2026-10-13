import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NO_SETUP } from '../src/categories.ts';
import { Settings } from '../src/settings.ts';
import type { ShopSetup } from '../src/shops.ts';
import type { EntityCollections } from '../src/zenmoney/types.ts';
import { createHref } from '../src/web/pages/chrome.ts';
import type { SavedMarking } from '../src/web/pages/marking.ts';
import { shopOf } from '../src/payees.ts';
import { loadShopsPage, renderShops, submitShop } from '../src/web/pages/shops.ts';
import { account, RUB, transaction, user } from './fixtures.ts';

const today = '2026-10-12';
const data: EntityCollections = {
  instrument: [RUB],
  user: [user()],
  account: [account({ id: 'card' })],
  transaction: [
    transaction({ id: 'one', date: '2026-10-10', created: 4, outcome: 736, payee: 'Lenta 089' }),
    transaction({ id: 'two', date: '2026-10-09', created: 3, outcome: 1_143, payee: 'Lenta-0178' }),
    transaction({ id: 'three', date: '2026-10-08', created: 2, outcome: 90, payee: 'Lenta-0178' }),
    transaction({ id: 'coffee', date: '2026-10-07', created: 1, outcome: 120, payee: '_COFFEEMAN.' }),
    transaction({ id: 'old', date: '2025-03-01', created: 0, outcome: 300, payee: 'APTECHNYY PUNKT N52' }),
    transaction({ id: 'person', date: '2026-10-06', created: 0, outcome: 5_000, payee: 'Кирилл А.' }),
    transaction({ id: 'gone', date: '2026-10-05', created: 0, outcome: 10, payee: 'Удалённый', deleted: true }),
  ],
};
const saved = (shops: ShopSetup = { looks: new Map(), icons: new Map() }): SavedMarking => ({
  categorizations: new Map(),
  purchasePayments: new Map(),
  regular: [],
  purchases: [],
  marks: new Map(),
  descriptions: new Map(),
  categories: NO_SETUP,
  weekStart: 0,
  shops,
});
const page = (shops: ShopSetup | undefined, options: Omit<Parameters<typeof loadShopsPage>[2], 'today'> = {}) =>
  String(renderShops(loadShopsPage(data, saved(shops), { today, ...options }), createHref())).replaceAll(' ', ' ');
const form = (fields: Record<string, string> = {}) => new URLSearchParams(fields);
const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64')}`;

describe('shops page', () => {
  it('lists the shops of the last three months, the most frequent first, with the names the bank gives them', () => {
    const d = loadShopsPage(data, saved(), { today });
    assert.deepEqual(
      d.shops.map((s) => [s.title, s.names, s.recent]),
      [
        ['Лента', ['Lenta-0178', 'Lenta 089'], 3],
        ['_COFFEEMAN.', ['_COFFEEMAN.'], 1],
      ],
      'an old shop and a person are left out',
    );
    assert.deepEqual([d.recent, d.named], [2, 1]);

    const html = page(undefined);
    assert.ok(html.includes('aria-current="page">') && html.includes('href="/settings/shops"'), 'a tab of the settings');
    assert.ok(html.includes('<b>Лента</b><small>Lenta-0178, Lenta 089 · 3 операции за три месяца</small>'));
    assert.ok(html.includes('<b>_COFFEEMAN.</b><small>1 операция за три месяца</small>'), 'the name it is called by is not repeated');
    assert.ok(html.includes('href="/settings/shops?edit=lenta"'));
  });

  it('finds any shop by what it is called or a name the bank gives it', () => {
    assert.deepEqual(loadShopsPage(data, saved(), { today, query: 'аптечный' }).shops.map((s) => s.key), ['aptechnipunktn'], 'by its key, whatever the alphabet');
    assert.deepEqual(loadShopsPage(data, saved(), { today, query: 'lenta-01' }).shops.map((s) => s.key), ['lenta']);
    assert.deepEqual(loadShopsPage(data, saved(), { today, query: 'кирилл' }).shops, []);
    assert.ok(page(undefined, { query: 'нет такого' }).includes('Таких магазинов нет'));
  });

  it('opens a shop’s form, which goes back to the expense it was opened from', () => {
    const shops = { looks: new Map([['cofeman', { title: 'Кофеман', site: 'coffeeman.ru', photo: 'abc' }]]), icons: new Map() };
    const html = page(shops, { edit: 'cofeman', back: '/operations?edit=spending-coffee' });

    assert.ok(html.includes('action="/shops/cofeman"'));
    assert.ok(html.includes('name="title" value="Кофеман"') && html.includes('placeholder="_COFFEEMAN."'));
    assert.ok(html.includes('name="site" value="coffeeman.ru"') && html.includes('placeholder="Например, lenta.com"'));
    assert.ok(html.includes('src="/shop-logo/cofeman?v=pabc"'), 'the user’s photo');
    assert.ok(html.includes('Из чего состоит</span><dl class="facts" aria-label="Из чего состоит"><div class="fact"><dt>_COFFEEMAN.</dt><dd>1 операция, последняя 7 октября</dd>'));
    assert.ok(html.includes('formaction="/shops/cofeman/photo/delete" formnovalidate>Убрать фото') && html.includes('formaction="/shops/cofeman/forget" formnovalidate>Сбросить'));
    assert.ok(html.includes('name="back" value="/operations?edit=spending-coffee"'));
    assert.ok(html.includes('class="entry-link" href="/operations?edit=spending-coffee" title="Закрыть"'), 'closing it goes back to the expense');

    const lenta = page(undefined, { edit: 'lenta' });
    assert.ok(lenta.includes('placeholder="Лента"') && lenta.includes('placeholder="lenta.com"'), 'its chain’s name and site are what it has');
    assert.ok(!lenta.includes('/shops/lenta/forget'), 'nothing to forget until the user dresses it');
    assert.ok(page(undefined, { edit: 'aptechnipunktn' }).includes('action="/shops/aptechnipunktn"'), 'an old shop opened from its expense shows too');
  });

  it('shows what an open shop is made of and offers the alike ones to merge into it', () => {
    const html = String(renderShops(loadShopsPage(shops, saved(), { today, edit: 'oktiabrskiv' }), createHref())).replaceAll(' ', ' ');

    assert.ok(html.includes('<dt>OKTYABRSKIJ_22V</dt><dd>2 операции, последняя 3 октября</dd>'), 'the names the bank gives it');
    assert.ok(html.includes('action="/shops/oktiabrskiv/merge/kemoktiabrskiv"'), 'one key ends the other');
    assert.ok(html.includes('<span>KEM OKTYABRSKIJ 22V <small>1 операция</small></span>'));
    assert.ok(!html.includes('action="/shops/oktiabrskiv/merge/zerno"'), 'another shop is not alike');
    assert.ok(html.includes('action="/shops/oktiabrskiv/merge"') && html.includes('<option value="zerno">ZERNO — 1 операция</option>'), 'but can be picked');
    assert.ok(!html.includes('Объединено'), 'nothing merged yet');

    const eda = { ...shops, transaction: [transaction({ id: 'eda', date: '2026-10-01', outcome: 500, payee: 'YANDEX*5814*EDA' }), transaction({ id: 'ya', date: '2026-10-01', outcome: 99, payee: 'Яндекс Сервисы' })] };
    const yandex = String(renderShops(loadShopsPage(eda, saved(), { today, edit: 'iandeks' }), createHref()));
    assert.ok(!yandex.includes('action="/shops/iandeks/merge/iandekseda"'), 'two chains are not alike');
  });

  it('takes the shops of a chain for one shop', () => {
    const samokat = loadShopsPage(shops, saved(), { today }).shops.find((s) => s.key === 'samokat');
    assert.deepEqual([samokat?.title, samokat?.names, samokat?.merged], ['Самокат', ['SAMOKAT', 'SBER*5411*SAMOKAT'], []]);
  });

  it('shows the form again with what was wrong', () => {
    const html = page(undefined, { form: { key: 'lenta', title: '', site: 'лента', errors: { site: 'Адрес сайта, например lenta.com' } } });
    assert.ok(html.includes('name="site" value="лента"') && html.includes('Адрес сайта, например lenta.com</small>'));
  });
});

const shops: EntityCollections = {
  ...data,
  transaction: [
    transaction({ id: 'samokat', date: '2026-10-04', created: 3, outcome: 900, payee: 'SAMOKAT' }),
    transaction({ id: 'sber', date: '2026-09-20', created: 1, outcome: 700, payee: 'SBER*5411*SAMOKAT' }),
    transaction({ id: 'oktiabrskii-1', date: '2026-10-03', created: 3, outcome: 46, payee: 'OKTYABRSKIJ_22V' }),
    transaction({ id: 'oktiabrskii-2', date: '2026-09-30', created: 2, outcome: 46, payee: 'OKTYABRSKIJ_22V' }),
    transaction({ id: 'kem', date: '2026-09-25', created: 1, outcome: 46, payee: 'KEM OKTYABRSKIJ 22V' }),
    transaction({ id: 'zerno', date: '2026-09-10', created: 0, outcome: 250, payee: 'ZERNO' }),
    transaction({ id: 'kofeinia', date: '2026-09-11', created: 0, outcome: 300, payee: 'Кофейня у дома' }),
    transaction({ id: 'kofeinia-2', date: '2026-09-12', created: 0, outcome: 300, payee: 'Кофейня у дома' }),
  ],
};

describe('merging shops', () => {
  it('merges an alike shop into an open one, which then is made of both, and splits it off again', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitShop(settings, shops, '/shops/oktiabrskiv/merge/kemoktiabrskiv', form()), { status: 'saved', site: null, open: 'oktiabrskiv' });
    assert.deepEqual(settings.shopSetup().looks.get('oktiabrskiv'), { title: 'OKTYABRSKIJ_22V', site: null, photo: null }, 'named as the bank names it most, for both');
    const merged = loadShopsPage(shops, saved(settings.shopSetup()), { today, edit: 'oktiabrskiv' });
    const shop = merged.shops.find((s) => s.key === 'oktiabrskiv');
    assert.deepEqual([shop?.title, shop?.names, shop?.merged, shop?.recent], ['OKTYABRSKIJ_22V', ['OKTYABRSKIJ_22V', 'KEM OKTYABRSKIJ 22V'], ['kemoktiabrskiv'], 3]);
    assert.equal(merged.shops.find((s) => s.key === 'kemoktiabrskiv'), undefined, 'not listed apart');
    const html = String(renderShops(merged, createHref()));
    assert.ok(html.includes('action="/shops/oktiabrskiv/split/kemoktiabrskiv"') && html.includes('1 операция · отделить'));
    assert.equal(loadShopsPage(shops, saved(settings.shopSetup()), { today, edit: 'kemoktiabrskiv' }).edit, 'oktiabrskiv', 'a merged shop opens as the one it went into');

    assert.deepEqual(submitShop(settings, shops, '/shops/oktiabrskiv/split/kemoktiabrskiv', form()), { status: 'saved', site: null, open: 'oktiabrskiv' });
    assert.deepEqual(settings.shopSetup().merges, new Map());
  });

  it('names a shop without a name of its own as the merged one, or as the bank names it most', () => {
    using settings = new Settings(':memory:');
    const kofeinia = shopOf('Кофейня у дома');

    assert.deepEqual(submitShop(settings, shops, `/shops/${kofeinia}/merge`, form({ with: 'zerno' })), { status: 'saved', site: null, open: kofeinia });
    assert.deepEqual(settings.shopSetup().looks.get(kofeinia), { title: 'Кофейня у дома', site: null, photo: null }, 'so that ZERNO is called alike');
    assert.deepEqual(submitShop(settings, shops, '/shops/zerno/merge/samokat', form()), { status: 'saved', site: 'samokat.ru', open: kofeinia }, 'into the one it went into');
    assert.deepEqual(settings.shopSetup().looks.get(kofeinia), { title: 'Кофейня у дома', site: 'samokat.ru', photo: null }, 'a name it has stays, a site comes');
  });

  it('refuses a shop no operation went to, and a split of one merged elsewhere', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitShop(settings, shops, '/shops/samokat/merge/nikogo', form()), { status: 'missing' });
    assert.deepEqual(submitShop(settings, shops, '/shops/samokat/merge', form()), { status: 'missing' });
    assert.deepEqual(submitShop(settings, shops, '/shops/samokat/split/zerno', form()), { status: 'missing' });
    assert.deepEqual(submitShop(settings, shops, '/shops/samokat/forget/zerno', form()), { status: 'missing' });
    assert.deepEqual(submitShop(settings, shops, '/shops/samokat/merge/samokat', form()), { status: 'saved', site: 'samokat.ru', open: 'samokat' }, 'one with itself stays as it is');
    assert.deepEqual(settings.shopSetup().merges, new Map());
  });
});

describe('submitShop', () => {
  it('names a shop and gives it a site, keeping what its chain gives as nothing', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitShop(settings, data, '/shops/cofeman', form({ title: '  Кофеман ', site: 'https://www.coffeeman.ru/menu' })), { status: 'saved', site: 'coffeeman.ru' });
    assert.deepEqual(submitShop(settings, data, '/shops/lenta', form({ title: 'Лента', site: 'lenta.com' })), { status: 'saved', site: 'lenta.com' });
    assert.deepEqual(settings.shopSetup().looks.get('cofeman'), { title: 'Кофеман', site: 'coffeeman.ru', photo: null });
    assert.deepEqual(settings.shopSetup().looks.get('lenta'), { title: null, site: null, photo: null }, 'the chain’s name and site follow the chain');

    assert.deepEqual(submitShop(settings, data, '/shops/lenta', form({ title: '', site: '' })), { status: 'saved', site: 'lenta.com' }, 'empty fields give the chain’s back');
  });

  it('puts a photo on a shop, takes it off, and forgets the shop', () => {
    using settings = new Settings(':memory:');

    submitShop(settings, data, '/shops/cofeman', form({ title: 'Кофеман', site: '', photo: jpeg }));
    assert.equal(settings.shopPhoto('cofeman')?.type, 'image/jpeg');
    submitShop(settings, data, '/shops/cofeman', form({ title: 'Кофеман', site: '' }));
    assert.equal(settings.shopPhoto('cofeman')?.type, 'image/jpeg', 'a form without a photo keeps it');
    assert.deepEqual(submitShop(settings, data, '/shops/cofeman/photo/delete', form()), { status: 'saved', site: null });
    assert.equal(settings.shopPhoto('cofeman'), null);
    submitShop(settings, data, '/shops/cofeman', form({ photo: jpeg }));
    submitShop(settings, data, '/shops/cofeman', form({ photo: '' }));
    assert.equal(settings.shopPhoto('cofeman'), null, 'an empty photo takes it off');

    assert.deepEqual(submitShop(settings, data, '/shops/cofeman/forget', form()), { status: 'saved', site: null });
    assert.equal(settings.shopSetup().looks.has('cofeman'), false);
  });

  it('refuses a wrong site, name or photo, and a shop no operation went to', () => {
    using settings = new Settings(':memory:');

    assert.deepEqual(submitShop(settings, data, '/shops/cofeman', form({ site: 'кофеман' })), {
      status: 'invalid',
      form: { key: 'cofeman', title: '', site: 'кофеман', errors: { site: 'Адрес сайта, например lenta.com' } },
    });
    const long = 'а'.repeat(81);
    assert.deepEqual(submitShop(settings, data, '/shops/cofeman', form({ title: long })), { status: 'invalid', form: { key: 'cofeman', title: long, site: '', errors: { title: 'Не длиннее 80 символов' } } });
    assert.deepEqual(submitShop(settings, data, '/shops/cofeman', form({ photo: 'data:image/gif;base64,R0lG' })), {
      status: 'invalid',
      form: { key: 'cofeman', title: '', site: '', errors: { photo: 'Нужна картинка JPEG или PNG' } },
    });
    assert.deepEqual(settings.shopSetup().looks, new Map(), 'nothing is saved');
    assert.deepEqual(submitShop(settings, data, '/shops/udalennii', form({ title: 'Нет' })), { status: 'missing' }, 'a deleted operation’s shop');
    assert.deepEqual(submitShop(settings, data, '/shops/kirill', form({ title: 'Я' })), { status: 'missing' }, 'a person is no shop');
    assert.deepEqual(submitShop(settings, data, '/shops/%E0%A4%A', form()), { status: 'missing' });
  });
});

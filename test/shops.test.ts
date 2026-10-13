import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APP_LOGOS, appLogo, CHAINS, chainOf, fetchSiteIcon, NO_SHOPS, shopFinder, shopKeyOf, shopLabel } from '../src/shops.ts';
import { shopKey, shopOf } from '../src/payees.ts';

/** A PNG header of an image `width` pixels wide, as much of a PNG as the icon check reads. */
function png(width: number): Uint8Array {
  const data = new Uint8Array(33);
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(data.buffer).setUint32(16, width);
  new DataView(data.buffer).setUint32(20, width);
  return data;
}

const chain = (payee: string) => chainOf(shopOf(payee))?.title ?? null;

describe('shops', () => {
  it('names the chains it knows whatever shop number and alphabet the bank writes', () => {
    assert.equal(chain('Lenta-0089'), 'Лента');
    assert.equal(chain('LENTA 089PQR'), 'Лента');
    assert.equal(chain('Лента-0089'), 'Лента');
    assert.equal(chain('PYATEROCHKA 9076'), 'Пятёрочка');
    assert.equal(chain('Magazin Yarche'), 'Ярче');
    assert.equal(chain('SBER*5411*SAMOKAT'), 'Самокат');
    assert.equal(chain('MAGNIT MM SIRINPQR'), 'Магнит');
    assert.equal(chain('YANDEX*5814*EDA'), 'Яндекс Еда', 'Яндекс Еда before Яндекс');
    assert.equal(chain('YandexGo'), 'Яндекс Go');
    assert.equal(chain('Яндекс Сервисы'), 'Яндекс');
    assert.equal(chain('SPAR-5'), 'Spar');
    assert.equal(chain('МТС Fog Play'), 'МТС');
    assert.equal(chain('MTS MEGAPOLIS'), null, 'a shop paid through MTS’s terminal is not MTS');
    assert.equal(chain('Sparrow Cafe'), null, 'a chain is not any name it begins');
    assert.equal(chain('KHLEB IZ TANDYRA_'), null);
    assert.equal(chainOf('lenta')?.site, 'lenta.com');
    assert.equal(chainOf('mariara')?.site, null, 'a chain without a sharp icon has only its name');
  });

  it('takes every shop of a chain for one, keyed by the chain’s name', () => {
    assert.equal(shopKeyOf('SBER*5411*SAMOKAT'), 'samokat');
    assert.equal(shopKeyOf('MAGNIT MM SIRINPQR'), 'magnit');
    assert.equal(shopKeyOf('YANDEX*5814*EDA'), 'iandekseda');
    assert.equal(shopKeyOf('WB*Wildberries'), shopKeyOf('Wildberries'));
    assert.equal(shopKeyOf('KHLEB IZ TANDYRA_'), 'khlebiztandira', 'a shop of no chain is its own');
    for (const chain of CHAINS) assert.equal(chainOf(shopKey(chain.title))?.title, chain.title, `${chain.title} is itself by its name`);
  });

  it('gives a shop the name, site and photo the user gave it over its chain’s', () => {
    const find = shopFinder({
      looks: new Map([
        ['lenta', { title: 'Лента у дома', site: null, photo: null }],
        ['cofeman', { title: 'Кофеман', site: 'coffeeman.ru', photo: null }],
        ['piaterochka', { title: null, site: null, photo: 'abc123' }],
      ]),
      icons: new Map([
        ['lenta.com', 'l1'],
        ['coffeeman.ru', 'c1'],
        ['5ka.ru', 'p1'],
      ]),
    });

    assert.deepEqual(find('Lenta-0089'), { key: 'lenta', title: 'Лента у дома', site: 'lenta.com', logo: 'sl1' });
    assert.deepEqual(find('_COFFEEMAN.'), { key: 'cofeman', title: 'Кофеман', site: 'coffeeman.ru', logo: 'sc1' });
    assert.deepEqual(find('PYATEROCHKA 9076'), { key: 'piaterochka', title: 'Пятёрочка', site: '5ka.ru', logo: 'pabc123' }, 'the user’s photo over the icon');
    assert.deepEqual(find('Samokat'), { key: 'samokat', title: 'Самокат', site: 'samokat.ru', logo: null }, 'no logo until its icon is fetched');
    assert.deepEqual(shopFinder(NO_SHOPS)('KHLEB IZ TANDYRA_'), { key: 'khlebiztandira', title: null, site: null, logo: null });
    assert.equal(shopFinder(NO_SHOPS)('Кирилл А.'), null, 'a person is no shop');
    const merged = shopFinder({ looks: new Map(), icons: new Map(), merges: new Map([['sbersamokat', 'samokat']]) });
    assert.equal(merged('SBER*5411*SAMOKAT')?.key, 'samokat', 'a merged shop is the one it went into');
  });

  it('draws a shop by the logo that comes with the app unless the user gave it a photo or a site', () => {
    const find = shopFinder({
      looks: new Map([
        ['cofeman', { title: null, site: 'coffeeman.ru', photo: null }],
        ['piaterochka', { title: null, site: null, photo: 'abc' }],
      ]),
      icons: new Map([
        ['lenta.com', 'l1'],
        ['coffeeman.ru', 'c1'],
      ]),
      logos: new Map([
        ['lenta', 'k1'],
        ['cofeman', 'k2'],
        ['piaterochka', 'k3'],
        ['khlebiztandira', 'k4'],
      ]),
    });

    assert.equal(find('Lenta-0089')?.logo, 'ak1', 'over the icon of its chain’s site');
    assert.equal(find('KHLEB IZ TANDYRA_')?.logo, 'ak4', 'a shop of no chain too');
    assert.equal(find('_COFFEEMAN.')?.logo, 'sc1', 'the site the user gave wins');
    assert.equal(find('PYATEROCHKA 9076')?.logo, 'pabc', 'the user’s photo wins');
  });

  it('comes with logos as square PNGs named by the key of a shop', () => {
    assert.ok(APP_LOGOS.size > 0);
    for (const key of APP_LOGOS.keys()) {
      assert.match(key, /^[a-z]+$/, `${key} is a shop key`);
      const data = appLogo(key)!.data;
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      assert.deepEqual([view.getUint32(16), view.getUint32(20)], [240, 240], `${key} is 240 by 240`);
    }
    assert.equal(appLogo('nosuchshop'), null);
  });

  it('calls a shop by its name, or by its payee without the shop number', () => {
    assert.equal(shopLabel({ shop: { key: 'lenta', title: 'Лента', site: null, logo: null }, payee: 'Lenta-0089' }), 'Лента');
    assert.equal(shopLabel({ shop: null, payee: 'APTECHNYY PUNKT N52' }), 'APTECHNYY PUNKT');
  });

  it('takes the icon of a site from Yandex’s service, and none when it sends a pixel', async () => {
    const asked: string[] = [];
    const answer = (body: Uint8Array, status = 200): typeof fetch => async (url) => {
      asked.push(String(url));
      return new Response(new Blob([body.slice()]), { status, headers: { 'content-type': 'image/png' } });
    };

    assert.deepEqual(await fetchSiteIcon('lenta.com', answer(png(120))), { type: 'image/png', data: png(120) });
    assert.equal(asked[0], 'https://favicon.yandex.net/favicon/v2/lenta.com?size=120');
    assert.equal(await fetchSiteIcon('nothing.ru', answer(png(1))), null);
    assert.equal(await fetchSiteIcon('nothing.ru', answer(new Uint8Array([1, 2, 3]))), null, 'what is not a PNG is none');
    await assert.rejects(fetchSiteIcon('lenta.com', answer(new Uint8Array(), 503)), /503/, 'an unreachable service is asked again later');
  });
});

// Shops as the app names and draws them. Every payee the bank names but a person is a shop (shopOf in payees.ts),
// whatever shop number or mark of a QR payment the bank adds, so Lenta-0089, LENTA 089 and Лента are one shop; shops
// the bank names too differently, such as SAMOKAT and SBER*5411*SAMOKAT, the user merges into one. A shop takes the
// name and the logo the user gave it, else those of a chain the app knows: Lenta-0089 is Лента with the logo of
// lenta.com. A logo is the icon of the shop's site, which the server fetches once from Yandex's service of site icons
// (see fetchSiteIcon), or a photo the user put on the shop instead.

import type { CategoryPhoto } from './categories.ts';
import { isPerson, shopKey, shopName, shopOf } from './payees.ts';

/** How the user named and dressed a shop; null keeps what the shop would have. */
export interface ShopLook {
  title: string | null;
  /** The site the shop's logo comes from, such as lenta.com. */
  site: string | null;
  /** The version of the photo the user put on the shop instead of its site's icon. */
  photo: string | null;
}

/** How the user set up shops, and the icons of sites fetched so far: their versions by site. */
export interface ShopSetup {
  looks: ReadonlyMap<string, ShopLook>;
  icons: ReadonlyMap<string, string>;
  /** The shop each shop the user merged is part of, by key; none when not given. */
  merges?: ReadonlyMap<string, string>;
}

export const NO_SHOPS: ShopSetup = { looks: new Map(), icons: new Map(), merges: new Map() };

/** A shop as rows show it. */
export interface Shop {
  key: string;
  /** Its name, from the user or the chains the app knows; null leaves the payee as the bank wrote it. */
  title: string | null;
  /** The site its logo comes from. */
  site: string | null;
  /**
   * The version of its logo, the user's photo (p…) or its site's icon (s…), which changes with it; null when it has
   * none yet.
   */
  logo: string | null;
}

/** A chain the app knows by its shop key: its name, and the site its logo comes from when it has a good icon. */
interface Chain {
  match: RegExp;
  title: string;
  site?: string;
}

/**
 * Chains by their shop keys, which are lower case Latin letters only (see shopKey): LENTA 089 is lenta, YANDEX*5814*EDA
 * iandekseda. The first that matches wins, so Яндекс Еда comes before Яндекс. Sites are those whose icon Yandex's
 * service has sharp; a chain without one keeps only its name. A chain is one shop, keyed by its name (see
 * shopKeyOf), so each must match the key of its own name too.
 */
export const CHAINS: readonly Chain[] = [
  { match: /^lenta/, title: 'Лента', site: 'lenta.com' },
  { match: /^begemag/, title: 'Бегемаг', site: 'begemag.ru' },
  { match: /^mariara/, title: 'Мария-Ра' },
  { match: /^(magazin)?iarche/, title: 'Ярче', site: 'yarche.ru' },
  { match: /^piaterochka/, title: 'Пятёрочка', site: '5ka.ru' },
  { match: /^magnit/, title: 'Магнит', site: 'magnit.ru' },
  { match: /^perekrestok/, title: 'Перекрёсток', site: 'perekrestok.ru' },
  { match: /^vkusvil/, title: 'ВкусВилл', site: 'vkusvill.ru' },
  { match: /^spar$/, title: 'Spar' },
  { match: /^metro/, title: 'Metro', site: 'metro-cc.ru' },
  { match: /^fiksprice/, title: 'Fix Price', site: 'fix-price.com' },
  { match: /^bristol/, title: 'Бристоль', site: 'bristol.ru' },
  { match: /^krasnoebeloe/, title: 'Красное&Белое', site: 'krasnoeibeloe.ru' },
  { match: /^kalinamalina/, title: 'Калина-Малина', site: 'kalina-malina.ru' },
  { match: /^(sber)?samokat/, title: 'Самокат', site: 'samokat.ru' },
  { match: /^iandekseda/, title: 'Яндекс Еда', site: 'eda.yandex.ru' },
  { match: /^iandeksmarket/, title: 'Яндекс Маркет', site: 'market.yandex.ru' },
  { match: /^iandeksgo/, title: 'Яндекс Go', site: 'go.yandex' },
  { match: /^iandekstaksi/, title: 'Яндекс Такси', site: 'taxi.yandex.ru' },
  { match: /^iandekspli?us/, title: 'Яндекс Плюс', site: 'plus.yandex.ru' },
  { match: /^iandeksbank/, title: 'Яндекс Банк', site: 'bank.yandex.ru' },
  { match: /^(iandeks|servisiandeksa)/, title: 'Яндекс', site: 'yandex.ru' },
  { match: /^ozon/, title: 'Ozon', site: 'ozon.ru' },
  { match: /^(wb)?(wildberies|vaildberis)/, title: 'Wildberries', site: 'wildberries.ru' },
  { match: /^(im)?avito/, title: 'Авито', site: 'avito.ru' },
  { match: /^aliekspres/, title: 'AliExpress', site: 'aliexpress.ru' },
  { match: /^lamoda/, title: 'Lamoda', site: 'lamoda.ru' },
  { match: /^dns$/, title: 'DNS', site: 'dns-shop.ru' },
  { match: /^lemanapro/, title: 'Лемана Про', site: 'lemanapro.ru' },
  { match: /^sportmaster/, title: 'Спортмастер', site: 'sportmaster.ru' },
  { match: /^chitaigorod/, title: 'Читай-город', site: 'chitai-gorod.ru' },
  { match: /^gemotest/, title: 'Гемотест', site: 'gemotest.ru' },
  { match: /^lukoil/, title: 'Лукойл', site: 'lukoil.ru' },
  { match: /^(gazpromneft|gazpromgpn)/, title: 'Газпромнефть', site: 'gazprom-neft.ru' },
  { match: /^azsforus/, title: 'АЗС Форус' },
  { match: /^rostics/, title: 'Rostic’s', site: 'rostics.ru' },
  { match: /^burgerking/, title: 'Burger King', site: 'burgerkingrus.ru' },
  { match: /^surfcofe/, title: 'Surf Coffee', site: 'surfcoffee.ru' },
  { match: /^tmobail/, title: 'Т-Мобайл', site: 'tbank.ru' },
  { match: /^tstrakhovanie/, title: 'Т-Страхование', site: 'tbank.ru' },
  // MTS MEGAPOLIS is a shop paid through MTS's terminal, not MTS itself.
  { match: /^mts(live|fogplai)?$/, title: 'МТС', site: 'mts.ru' },
  { match: /^bilain/, title: 'Билайн', site: 'beeline.ru' },
  { match: /^iota$/, title: 'Yota', site: 'yota.ru' },
  { match: /^godline/, title: 'Goodline', site: 'goodline.info' },
  { match: /^timeweb/, title: 'Timeweb', site: 'timeweb.com' },
  { match: /^bosti(to|$)/, title: 'Boosty', site: 'boosty.to' },
  { match: /^platipomiru/, title: 'Плати по миру', site: 'platipomiru.com' },
];

/** The chain a shop is by its key, if the app knows it. */
export function chainOf(key: string): { title: string; site: string | null } | null {
  const chain = CHAINS.find((c) => c.match.test(key));
  return chain ? { title: chain.title, site: chain.site ?? null } : null;
}

/** What a shop is called over all its expenses: its name, else its payee without the shop number (see shopName). */
export function shopLabel(o: { shop: Shop | null; payee: string }): string {
  return o.shop?.title ?? shopName(o.payee);
}

/**
 * The key of a payee's shop before the user merged any: that of its chain when it is of one, so that every shop of a
 * chain is one, SAMOKAT and SBER*5411*SAMOKAT both samokat; null for a person, whom the bank names as Татьяна А.
 */
export function shopKeyOf(payee: string): string | null {
  if (isPerson(payee)) return null;
  const key = shopOf(payee);
  const chain = CHAINS.find((c) => c.match.test(key));
  return chain ? shopKey(chain.title) : key;
}

/** Finds the shop of a payee as the user set shops up, the one it is merged into if it is; a person has none. */
export function shopFinder(setup: ShopSetup): (payee: string) => Shop | null {
  return (payee) => {
    const key = shopKeyOf(payee);
    return key === null ? null : shopByKey(setup.merges?.get(key) ?? key, setup);
  };
}

/** A shop by its key as the user set shops up: their name, site and photo, else its chain's name and site. */
export function shopByKey(key: string, setup: ShopSetup): Shop {
  const look = setup.looks.get(key);
  const chain = chainOf(key);
  const site = look?.site ?? chain?.site ?? null;
  const icon = site ? setup.icons.get(site) : undefined;
  return {
    key,
    title: look?.title ?? chain?.title ?? null,
    site,
    logo: look?.photo ? `p${look.photo}` : icon ? `s${icon}` : null,
  };
}

/** Yandex's service of site icons; it sends a picture of one pixel for a site it has no icon of. */
const SITE_ICONS = 'https://favicon.yandex.net/favicon/v2/';
/** The side of the icon asked for, enough for the large disc of an expense's sheet. */
const ICON_SIZE = 120;

/**
 * The icon of a site as Yandex's service has it, a PNG; null when it has none, or sends something else. Throws when
 * the service cannot be reached, so that the site is asked again later.
 */
export async function fetchSiteIcon(site: string, fetchImpl: typeof fetch = fetch): Promise<CategoryPhoto | null> {
  const response = await fetchImpl(`${SITE_ICONS}${encodeURIComponent(site)}?size=${ICON_SIZE}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Сервис значков ответил ${response.status} на ${site}`);
  const data = new Uint8Array(await response.arrayBuffer());
  return pngWidth(data) > 1 ? { type: 'image/png', data } : null;
}

/** The width of a PNG from its header, 0 when the data is not one. */
function pngWidth(data: Uint8Array): number {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length < 24 || !signature.every((byte, i) => data[i] === byte)) return 0;
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(16);
}

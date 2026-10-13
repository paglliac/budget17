// Shops, a tab of the settings: those operations went to or came from in the last three months, the most frequent
// first, or every shop a search finds by its name or one the bank gives it. A shop is called as the user named it, as
// the chain it is (see shops.ts) or as the bank names it most, and drawn by its logo. Its row opens in place by
// ?edit=<shop key>: a form to name the shop, give it the site its logo comes from or a photo of the user's instead, for
// all its operations, the new ones too; what it is made of, the names the bank gives it with how many operations each
// had; and the shops to merge into it, the alike ones as buttons, such as SBER*5411*SAMOKAT for SAMOKAT, and any other
// from a list. A merged shop is listed with the one it went into and can be split off again. An expense links to its
// shop's form, which goes back to the expense once saved (`back`). The form posts to /shops/:key with the name as
// title, the site as site and a photo as photo, to /shops/:key/photo/delete and to /shops/:key/forget; merging posts
// to /shops/:key/merge/:other or to /shops/:key/merge with the other as `with`, and splitting to
// /shops/:key/split/:part (see submitShop).

import { POPULAR_DAYS } from '../../categories.ts';
import { addDays } from '../../dates.ts';
import { parsePhoto, parseSite, parseTitle, siteText } from '../../input.ts';
import { listOperations, type Operation } from '../../ledger.ts';
import { shopKey } from '../../payees.ts';
import type { Settings } from '../../settings.ts';
import { chainOf, NO_SHOPS, shopByKey, shopKeyOf, type ShopSetup } from '../../shops.ts';
import type { DateString, EntityCollections } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { dayMonthYear, plural, stop } from '../format.ts';
import type { Html } from '../html.ts';
import { logoOf } from '../looks.ts';
import { toneColor } from '../tones.ts';
import { choiceGroup, emptyState, factList, field, filterTag, groupForm, pageIntro, photoField, searchField, section } from '../widgets/basics.ts';
import { entryList, entryRow } from '../widgets/entries.ts';
import { appShell, toolbar, topBar } from '../widgets/shell.ts';
import { appRail, settingsTabs, userName, type Href } from './chrome.ts';
import type { SavedMarking } from './marking.ts';

/** How many of the names the bank gives a shop its row and its note list. */
const NAMES_SHOWN = 3;
/** How many alike shops an open shop offers to merge as buttons. */
const ALIKE_SHOWN = 4;
/** How long the shorter of two shop keys must be for one beginning or ending the other to make the shops alike. */
const ALIKE_KEY = 5;
const WHOLE_TIME = { from: '0000-01-01', to: '9999-12-31' };
export const SHOPS_PATH = '/settings/shops';

/** A name the bank gives a shop, with how many operations went by it and when the last came. */
export interface BankName {
  name: string;
  /** The shop it is of by itself: the shop's own key, or that of one merged into it. */
  shop: string;
  count: number;
  last: DateString;
}

/** A shop with the names the bank gives it and how many operations went to it or came from it. */
export interface ShopEntry {
  key: string;
  /** What it is called: the user's name, its chain's, or the name the bank gives it most. */
  title: string;
  /** The names the bank gives it, the most frequent first. */
  names: string[];
  /** The same with their counts, and the shops merged into it. */
  bank: BankName[];
  merged: string[];
  count: number;
  /** How many of them came in the last three months. */
  recent: number;
  /** Its logo or the user's photo, as a path of the server; null when it has neither. */
  logo: string | null;
}

/** A shop's form, as the tab and the app's sheet open it. */
export interface ShopForm {
  key: string;
  /** Where it posts, under /shops or /api/shops. */
  path: string;
  /** The name the user gave it; empty for the one it would have, `placeholder`. */
  title: string;
  placeholder: string;
  /** The site the user gave it; empty for the one its chain has, `sitePlaceholder`. */
  site: string;
  sitePlaceholder: string;
  logo: string | null;
  /** Whether the user put a photo on it, which photo/delete takes off. */
  photo: boolean;
  /** Whether the user named or dressed it, which forget takes back. */
  dressed: boolean;
  /** What the form changes: the shop's operations and the names the bank gives it. */
  note: string;
  /** What the shop is made of: the names the bank gives it with how many operations went by each. */
  names: Array<{ name: string; count: number }>;
}

/** A shop's form shown again with its errors after a submission failed. */
export interface ShopFormState {
  key: string;
  title: string;
  site: string;
  errors: Partial<Record<'title' | 'site' | 'photo', string>>;
}

export interface ShopsData {
  today: DateString;
  /** The shops the tab lists: the last three months', or those found. */
  shops: ShopEntry[];
  /** Every shop, to merge an open one with. */
  entries: ShopEntry[];
  /** How many shops the last three months had, and how many of them are named by a chain or the user. */
  recent: number;
  named: number;
  query: string | null;
  /** The shop open for editing, by its key. */
  edit: string | null;
  form: ShopFormState | null;
  /** The page an expense linked to its shop from, which the form goes back to. */
  back: string | null;
  setup: ShopSetup;
  userName: string | null;
}

/** The shops of `operations`, those of the last three months first, then by how many operations each had. */
export function shopEntries(operations: readonly Operation[], today: DateString): ShopEntry[] {
  const since = addDays(today, -POPULAR_DAYS);
  const shops = new Map<string, { title: string | null; logo: string | null; bank: Map<string, BankName>; count: number; recent: number }>();
  for (const o of operations) {
    if (!o.shop) continue;
    const shop = shops.get(o.shop.key) ?? { title: o.shop.title, logo: logoOf(o), bank: new Map(), count: 0, recent: 0 };
    const name = shop.bank.get(o.payee) ?? { name: o.payee, shop: shopKeyOf(o.payee) ?? o.shop.key, count: 0, last: o.date };
    name.count += 1;
    if (o.date > name.last) name.last = o.date;
    shop.bank.set(o.payee, name);
    shop.count += 1;
    if (o.date >= since && o.date <= today) shop.recent += 1;
    shops.set(o.shop.key, shop);
  }
  return [...shops]
    .map(([key, s]) => {
      const bank = [...s.bank.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
      const names = bank.map((n) => n.name);
      const merged = [...new Set(bank.map((n) => n.shop))].filter((part) => part !== key);
      return { key, title: s.title ?? names[0]!, names, bank, merged, count: s.count, recent: s.recent, logo: s.logo };
    })
    .sort((a, b) => b.recent - a.recent || b.count - a.count || a.title.localeCompare(b.title, 'ru'));
}

/** The form of the shop an operation went to or came from, among `operations`; null for one without a shop. */
export function operationShop(o: Operation, operations: readonly Operation[], setup: ShopSetup, today: DateString): ShopForm | null {
  if (!o.shop) return null;
  const key = o.shop.key;
  const same = operations.filter((e) => e.shop?.key === key);
  const [entry] = shopEntries(same.some((e) => e.id === o.id) ? same : [o, ...same], today);
  return entry ? shopForm(entry, setup) : null;
}

export function shopForm(entry: ShopEntry, setup: ShopSetup): ShopForm {
  const look = setup.looks.get(entry.key);
  const chain = chainOf(entry.key);
  return {
    key: entry.key,
    path: `/shops/${encodeURIComponent(entry.key)}`,
    title: look?.title ?? '',
    placeholder: chain?.title ?? entry.names[0] ?? entry.title,
    site: look?.site ? siteText(look.site) : '',
    sitePlaceholder: chain?.site ? siteText(chain.site) : 'Например, lenta.com',
    logo: entry.logo,
    photo: Boolean(look?.photo),
    dressed: look !== undefined,
    note: shopNote(entry),
    names: entry.bank.map((n) => ({ name: n.name, count: n.count })),
  };
}

/** Lenta-0089, Lenta-0178, Лента and 9 more, of the names the bank gives a shop; the one it is called by left out. */
export function bankNames(entry: Pick<ShopEntry, 'names'>, skip?: string): string {
  const names = entry.names.filter((name) => name.toLowerCase() !== skip?.toLowerCase());
  const more = names.length - NAMES_SHOWN;
  return `${names.slice(0, NAMES_SHOWN).join(', ')}${more > 0 ? ` и ещё ${more} ${plural(more, ['название', 'названия', 'названий'])}` : ''}`;
}

/** For 43 operations: Lenta-0089, Lenta-0178, Лента and 9 more names. */
function shopNote(entry: ShopEntry): string {
  return stop(`Для ${entry.count} ${operations(entry.count)}: ${bankNames(entry)}`);
}

function operations(count: number): string {
  return plural(count, ['операции', 'операций', 'операций']);
}

/** 3 операции. */
function operationCount(count: number): string {
  return `${count} ${plural(count, ['операция', 'операции', 'операций'])}`;
}

/** The names the bank gives a shop besides the one it is called by, and how many operations it had lately. */
export function shopDetails(entry: ShopEntry): string {
  const names = bankNames(entry, entry.title);
  const recent = entry.recent > 0 ? `${operationCount(entry.recent)} за три месяца` : 'за три месяца операций нет';
  return names ? `${names} · ${recent}` : recent;
}

/** The look of a shop's row: its logo on white, or a bag until it has one. */
export function shopLook(logo: string | null): { icon: 'bag'; color: string; photo: string | null } {
  return { icon: 'bag', color: logo ? '#ffffff' : toneColor('gray'), photo: logo };
}

/** Whether a shop is the one a search asks for, by what it is called, a name the bank gives it, or its key. */
function found(entry: ShopEntry, query: string): boolean {
  const text = query.toLowerCase();
  const key = shopKey(query);
  return [entry.title, ...entry.names].some((name) => name.toLowerCase().includes(text)) || (key.length >= 3 && entry.key.includes(key));
}

/**
 * Whether two shops look like one the bank names differently: they are called alike, or one's key begins or ends the
 * other's, as OKTYABRSKIJ_22V's does KEM OKTYABRSKIJ 22V's. Two chains are two shops, such as Яндекс and Яндекс Еда.
 */
function alike(a: ShopEntry, b: ShopEntry): boolean {
  if (a.title.toLowerCase() === b.title.toLowerCase()) return true;
  if (chainOf(a.key) && chainOf(b.key)) return false;
  const [short, long] = a.key.length <= b.key.length ? [a.key, b.key] : [b.key, a.key];
  return short.length >= ALIKE_KEY && short !== long && (long.startsWith(short) || long.endsWith(short));
}

export function loadShopsPage(
  data: EntityCollections,
  saved: SavedMarking,
  options: { today: DateString; query?: string | null; edit?: string | null; form?: ShopFormState; back?: string | null },
): ShopsData {
  const setup = saved.shops ?? NO_SHOPS;
  const entries = shopEntries(listOperations(data, WHOLE_TIME, saved, { withIgnored: true }), options.today);
  const query = options.query?.trim() || null;
  const asked = options.form?.key ?? options.edit ?? null;
  // A shop merged into another opens as that one.
  const edit = asked ? (setup.merges?.get(asked) ?? asked) : null;
  const recent = entries.filter((e) => e.recent > 0);
  return {
    today: options.today,
    shops: query ? entries.filter((e) => found(e, query)) : entries.filter((e) => e.recent > 0 || setup.looks.has(e.key) || e.key === edit),
    entries,
    recent: recent.length,
    named: recent.filter((e) => setup.looks.get(e.key)?.title || chainOf(e.key)).length,
    query,
    edit,
    form: options.form ?? null,
    back: options.back ?? null,
    setup,
    userName: userName(data),
  };
}

export function renderShops(d: ShopsData, href: Href): Html {
  const searchParams = Object.fromEntries(new URL(href(SHOPS_PATH), 'http://localhost').searchParams);
  const body = appShell({
    rail: appRail('settings', d.userName, href),
    tabs: settingsTabs('shops', href),
    main: [
      topBar({ crumbs: [{ label: 'Бюджет' }, { label: 'Настройки', icon: 'sliders' }] }),
      pageIntro({ title: 'Магазины', text: shopsSentence(d) }),
      toolbar({
        items: [
          searchField({ action: SHOPS_PATH, name: 'q', value: d.query ?? '', placeholder: 'Найти магазин', params: searchParams }),
          d.query ? filterTag({ label: `«${d.query}»`, href: href(SHOPS_PATH) }) : null,
        ],
      }),
      section({
        title: d.query ? `Нашлось: ${d.shops.length}` : 'За три месяца',
        body:
          d.shops.length > 0
            ? entryList({ label: 'Магазины', items: d.shops.map((entry) => shopRow(d, entry, href)) })
            : emptyState({ text: d.query ? 'Таких магазинов нет: поищите по названию в банке.' : 'За три месяца операций в магазинах не было.' }),
      }),
    ],
  });
  return pageDocument({ title: 'Бюджет: магазины', body });
}

export function shopsSentence(d: Pick<ShopsData, 'recent' | 'named'>): string {
  const shops = `${d.recent} ${plural(d.recent, ['магазин', 'магазина', 'магазинов'])} за три месяца, ${d.named} из них ${plural(d.named, ['назван', 'названы', 'названы'])} по сети или вами.`;
  return `${shops} Банк пишет один магазин по-разному, Lenta-0089 и LENTA 089PQR, а здесь это одна «Лента». Название, сайт для значка и фото меняют вид всех операций магазина, и новых тоже.`;
}

/** A shop's row; the open one shows its form, what it is made of and what to merge into it under the row. */
function shopRow(d: ShopsData, entry: ShopEntry, href: Href): Html {
  const open = d.edit === entry.key;
  return entryRow({
    id: `shop-${entry.key}`,
    title: entry.title,
    details: shopDetails(entry),
    ...shopLook(entry.logo),
    href: open ? (d.back ?? href(SHOPS_PATH, { q: d.query })) : href(SHOPS_PATH, { edit: entry.key, q: d.query }),
    panel: open ? shopPanel(d, entry, href) : undefined,
  });
}

function shopPanel(d: ShopsData, entry: ShopEntry, href: Href): Html[] {
  const form = shopForm(entry, d.setup);
  const failed = d.form?.key === entry.key ? d.form : null;
  // Where the open shop came from goes along with every form under it, so that each comes back to it.
  const keep = { back: d.back, q: d.query };
  const at = (path: string) => href(path, keep);
  return [
    groupForm({
      label: 'Название и значок',
      action: href(form.path),
      hidden: { ...(d.back ? { back: d.back } : {}), ...(d.query ? { q: d.query } : {}) },
      look: shopLook(form.logo),
      fields: [
        field({ label: 'Название', name: 'title', value: failed?.title ?? form.title, placeholder: form.placeholder, maxLength: 80, error: failed?.errors.title }),
        field({
          label: 'Сайт для значка',
          name: 'site',
          value: failed?.site ?? form.site,
          placeholder: form.sitePlaceholder,
          pattern: { regex: '\\S+\\.\\S+', hint: 'Адрес сайта, например lenta.com' },
          error: failed?.errors.site,
        }),
        photoField({ label: 'Фото вместо значка', name: 'photo', button: form.photo ? 'Другое фото' : 'Выбрать фото', error: failed?.errors.photo }),
      ],
      submitLabel: 'Сохранить',
      actions: [
        ...(form.photo ? [{ label: 'Убрать фото', action: href(`${form.path}/photo/delete`) }] : []),
        ...(form.dressed ? [{ label: 'Сбросить', action: href(`${form.path}/forget`) }] : []),
      ],
    }),
    factList({
      label: 'Из чего состоит',
      titled: true,
      items: entry.bank.map((n) => ({ label: n.name, value: `${operationCount(n.count)}, последняя ${dayMonthYear(n.last, d.today)}` })),
    }),
    entry.merged.length > 0
      ? choiceGroup({
          label: 'Объединено',
          choices: entry.merged.map((part) => {
            const names = entry.bank.filter((n) => n.shop === part);
            return {
              label: bankNames({ names: names.map((n) => n.name) }),
              detail: `${operationCount(names.reduce((sum, n) => sum + n.count, 0))} · отделить`,
              current: true,
              toggle: true,
              action: at(`${form.path}/split/${encodeURIComponent(part)}`),
            };
          }),
        })
      : null,
    mergeGroup(d, entry, form, at),
  ].filter((part) => part !== null);
}

/** The shops to merge into an open one: the alike ones as buttons, and any other from a list, the recent first. */
function mergeGroup(d: ShopsData, entry: ShopEntry, form: ShopForm, at: (path: string) => string): Html {
  const others = d.entries.filter((e) => e.key !== entry.key);
  const alikeOnes = others.filter((e) => alike(entry, e)).slice(0, ALIKE_SHOWN);
  const about = (e: ShopEntry) => [bankNames(e, e.title), operationCount(e.count)].filter(Boolean).join(' · ');
  const option = (e: ShopEntry) => ({ value: e.key, label: `${e.title} — ${about(e)}` });
  return choiceGroup({
    label: 'Объединить с',
    choices: alikeOnes.map((e) => ({ label: e.title, detail: about(e), suggested: true, action: at(`${form.path}/merge/${encodeURIComponent(e.key)}`) })),
    other: {
      label: alikeOnes.length > 0 ? 'Другой магазин' : 'Магазин',
      action: at(`${form.path}/merge`),
      name: 'with',
      placeholder: 'Выберите магазин',
      submitLabel: 'Объединить',
      groups: [
        { label: 'За три месяца', options: others.filter((e) => e.recent > 0).map(option) },
        { label: 'Раньше', options: others.filter((e) => e.recent === 0).map(option) },
      ],
    },
  });
}

/** Where an expense links to the form of its shop. */
export function shopHref(key: string, href: Href): string {
  return `${href(SHOPS_PATH, { edit: key })}#shop-${key}`;
}

export type ShopSubmission =
  | { status: 'saved'; site: string | null; open?: string }
  | { status: 'missing' }
  | { status: 'invalid'; form: ShopFormState };

/**
 * Applies a form posted to /shops/:key: names the shop `title` and gives it the site `site`, an empty one or the one
 * of its chain for what it would have, and puts the photo `photo` on it, an empty one taking it off. photo/delete
 * takes the photo off, forget all of it. merge/:other, or merge with the other as `with`, merges the other shop, with
 * the shops merged into it, into this one, which takes the other's name and site when it has none of its own;
 * split/:part takes a shop merged into it out again. The shops must be ones an operation went to or came from. A saved
 * form says the site the shop now has, for the server to fetch its icon, and after a merge or a split the shop to show
 * open.
 */
export function submitShop(settings: Settings, data: EntityCollections, path: string, body: URLSearchParams): ShopSubmission {
  const [, encoded, action, encodedOther] = /^\/shops\/([^/]+)(?:\/(photo\/delete|forget|merge|split)(?:\/([^/]+))?)?$/.exec(path) ?? [];
  let key: string;
  let other: string | null;
  try {
    key = decodeURIComponent(encoded ?? '');
    other = encodedOther ? decodeURIComponent(encodedOther) : body.get('with');
  } catch {
    return { status: 'missing' };
  }
  const keys = shopKeys(data);
  if (!key || !keys.has(key) || (encodedOther && action !== 'merge' && action !== 'split')) return { status: 'missing' };
  const chain = chainOf(key);
  if (action === 'forget') {
    settings.forgetShop(key);
    return { status: 'saved', site: chain?.site ?? null };
  }
  if (action === 'photo/delete') {
    settings.setShopPhoto(key, null);
    return { status: 'saved', site: null };
  }
  if (action === 'merge' || action === 'split') {
    if (!other || !keys.has(other)) return { status: 'missing' };
    const setup = settings.shopSetup();
    const root = setup.merges?.get(key) ?? key;
    if (action === 'split') {
      if (setup.merges?.get(other) !== root) return { status: 'missing' };
      settings.splitShop(other);
      return { status: 'saved', site: shopByKey(other, settings.shopSetup()).site, open: root };
    }
    const joined = setup.merges?.get(other) ?? other;
    if (joined !== root) {
      takeName(settings, data, root, joined);
      settings.mergeShop(joined, root);
    }
    return { status: 'saved', site: shopByKey(root, settings.shopSetup()).site, open: root };
  }

  const typed = (body.get('title') ?? '').trim();
  const title = typed ? parseTitle(typed) : { value: null };
  const site = parseSite(body.get('site') ?? '');
  const photo = !body.has('photo') ? undefined : body.get('photo') ? parsePhoto(body.get('photo')!) : { value: null };
  const errors = {
    ...('error' in title ? { title: title.error } : {}),
    ...('error' in site ? { site: site.error } : {}),
    ...(photo && 'error' in photo ? { photo: photo.error } : {}),
  };
  if ('error' in title || 'error' in site || (photo && 'error' in photo)) {
    return { status: 'invalid', form: { key, title: body.get('title') ?? '', site: body.get('site') ?? '', errors } };
  }
  // What the shop would have anyway is kept as nothing, so that it follows its chain.
  settings.dressShop(key, {
    title: title.value === chain?.title ? null : title.value,
    site: site.value === chain?.site ? null : site.value,
  });
  if (photo) settings.setShopPhoto(key, photo.value);
  return { status: 'saved', site: site.value ?? chain?.site ?? null };
}

/**
 * Before a shop is merged into another, gives the other a name and a site when it has none: the merged one's, else
 * the name the bank gives it most, so that all their operations are called alike.
 */
function takeName(settings: Settings, data: EntityCollections, root: string, joined: string): void {
  const setup = settings.shopSetup();
  const look = setup.looks.get(root);
  const own = shopByKey(root, setup);
  if (own.title && own.site) return;
  const other = shopByKey(joined, setup);
  const sorting = { categorizations: new Map(), regular: [], shops: setup };
  const bankName = own.title ? null : shopEntries(listOperations(data, WHOLE_TIME, sorting, { withIgnored: true }), WHOLE_TIME.to).find((e) => e.key === root)?.title;
  const title = own.title ? (look?.title ?? null) : (other.title ?? bankName ?? null);
  const site = own.site ? (look?.site ?? null) : other.site;
  if (title !== (look?.title ?? null) || site !== (look?.site ?? null)) settings.dressShop(root, { title, site });
}

/** The shops operations went to or came from, by key, as the ledger names their payees. */
function shopKeys(data: EntityCollections): Set<string> {
  const merchants = new Map((data.merchant ?? []).map((m) => [m.id, m.title]));
  const keys = new Set<string>();
  for (const t of data.transaction ?? []) {
    if (t.deleted) continue;
    const named = t.payee?.trim() || (t.merchant ? merchants.get(t.merchant) : undefined) || t.originalPayee?.trim();
    const key = named ? shopKeyOf(named) : null;
    if (key) keys.add(key);
  }
  return keys;
}

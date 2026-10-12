// The categories operations are put into: ZenMoney's spending categories for expenses and its income categories for
// incomes, with the titles the user gave them in the app, and the user's own of either kind. A hidden category is not
// offered when sorting, but the operations already in it keep it. ZenMoney itself is never changed: what the user sets
// up is kept by src/settings.ts and applied here and in listOperations, the icon, colour and photo the user gave a
// category too. Categories are offered most popular first.

import { addDays } from './dates.ts';
import type { Operation } from './ledger.ts';
import { categoryOf, topCategory, type Category, type OperationKind } from './operations.ts';
import { shopKey } from './payees.ts';
import type { DateString, Tag, TagId } from './zenmoney/types.ts';

/** Ids of the user's own categories start with it, so they never clash with ZenMoney's. */
export const OWN_CATEGORY_PREFIX = 'own-';

/** What a category sorts: expenses or incomes. */
export type CategoryKind = Exclude<OperationKind, 'transfer'>;

/** A category the user added in the app. */
export interface OwnCategory {
  /** own-<number>. */
  id: TagId;
  title: string;
  hidden: boolean;
  kind: CategoryKind;
}

/** How the user dressed a category in the app; a null keeps what the category would have. */
export interface CategoryLook {
  /** An icon by name, see src/web/icons.ts. */
  icon: string | null;
  /** A tone's name, such as green, or #rrggbb. */
  color: string | null;
  /** The version of the photo put on it, which changes with the photo; the photo itself is kept apart. */
  photo: string | null;
}

/** A photo put on a category, as small as the app draws it. */
export interface CategoryPhoto {
  type: 'image/jpeg' | 'image/png';
  data: Uint8Array;
}

/** How the user set up categories in the app. */
export interface CategorySetup {
  /** ZenMoney categories the user renamed or hid, by tag id; a null title keeps ZenMoney's. */
  changes: ReadonlyMap<TagId, { title: string | null; hidden: boolean }>;
  own: readonly OwnCategory[];
  /** The icon, colour and photo the user gave categories, ZenMoney's and their own, by id; none keeps them as they come. */
  looks?: ReadonlyMap<TagId, CategoryLook>;
}

/** ZenMoney's categories as they are. */
export const NO_SETUP: CategorySetup = { changes: new Map(), own: [] };

/** A category to sort expenses or incomes into. */
export interface CategoryEntry extends Category {
  /** Its own title, without its parent's: the one the user gave it, or ZenMoney's. */
  name: string;
  /** Its title in ZenMoney, without its parent's; null for the user's own categories. */
  zenmoneyTitle: string | null;
  /** Its colour in ZenMoney, as `color` is when the user picked none. */
  zenmoneyColor: string | null;
  hidden: boolean;
}

/** A part of a category the user made in the app, such as Продукты › Лента; ZenMoney has no parts of its own. */
export interface Subcategory {
  id: number;
  /** The category it is a part of. */
  category: TagId;
  title: string;
}

/** How the user split categories into subcategories. */
export interface SubcategorySetup {
  /** By title. */
  subcategories: readonly Subcategory[];
  /** The subcategory a shop's expenses go into, by category and the shop's key (shopKey). */
  shops: ReadonlyMap<TagId, ReadonlyMap<string, number>>;
  /** The subcategory an expense was put into by hand, by ZenMoney transaction id; null keeps it out of its shop's. */
  spending: ReadonlyMap<string, number | null>;
}

export const NO_SUBCATEGORIES: SubcategorySetup = { subcategories: [], shops: new Map(), spending: new Map() };

/**
 * The subcategory of an expense's category it went into: the one it was put into by hand, or else its shop's. A
 * transfer to a person has no shop, so it goes only where it was put by hand (`shop` false). Null when it is in none,
 * or in one of a category it is no longer in.
 */
export function subcategoryOf(
  o: Pick<Operation, 'id' | 'payee' | 'category'>,
  setup: SubcategorySetup,
  options: { shop: boolean },
): Subcategory | null {
  if (!o.category) return null;
  const byHand = setup.spending.get(o.id);
  const id = byHand !== undefined ? byHand : options.shop ? setup.shops.get(o.category.id)?.get(shopKey(o.payee)) : undefined;
  return setup.subcategories.find((s) => s.id === id && s.category === o.category!.id) ?? null;
}

/** How far back operations count towards how popular a category is. */
export const POPULAR_DAYS = 90;

/**
 * ZenMoney's spending categories, or its income categories for `kind` income, by title, a subcategory titled with its
 * parent (Дом / Ремонт), then the user's own of that kind by title.
 */
export function categoryCatalog(tags: readonly Tag[], setup: CategorySetup, kind: CategoryKind = 'expense'): CategoryEntry[] {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const name = (tag: Tag) => setup.changes.get(tag.id)?.title ?? tag.title;
  const zenmoney = tags
    .filter((t) => (kind === 'income' ? t.showIncome : t.showOutcome))
    .map((t): CategoryEntry => {
      const parent = t.parent ? byId.get(t.parent) : undefined;
      const zenmoney = categoryOf(t);
      return dressed(
        {
          ...zenmoney,
          title: parent ? `${name(parent)} / ${name(t)}` : name(t),
          name: name(t),
          zenmoneyTitle: t.title,
          zenmoneyColor: zenmoney.color,
          hidden: setup.changes.get(t.id)?.hidden ?? false,
        },
        setup,
      );
    });
  const own = setup.own
    .filter((c) => c.kind === kind)
    .map((c): CategoryEntry => dressed({ id: c.id, title: c.title, color: null, name: c.title, zenmoneyTitle: null, zenmoneyColor: null, hidden: c.hidden }, setup));
  const byTitle = (a: CategoryEntry, b: CategoryEntry) => a.title.localeCompare(b.title, 'ru');
  return [...zenmoney.sort(byTitle), ...own.sort(byTitle)];
}

/**
 * Finds a category by id with the title the user gave it: a ZenMoney one as its top-level category, since operations
 * are counted by those, or one of the user's own.
 */
export function categoryFinder(tags: ReadonlyMap<TagId, Tag>, setup: CategorySetup): (id: TagId) => Category | undefined {
  const own = new Map(setup.own.map((c) => [c.id, c]));
  return (id) => {
    const mine = own.get(id);
    if (mine) return dressed({ id: mine.id, title: mine.title, color: null }, setup);
    const tag = topCategory(tags, [id]);
    return tag ? dressed({ ...categoryOf(tag), title: setup.changes.get(tag.id)?.title ?? tag.title }, setup) : undefined;
  };
}

/** The category with the icon, colour and photo the user gave it; a colour they did not pick stays ZenMoney's. */
function dressed<T extends Category>(category: T, setup: CategorySetup): T {
  const look = setup.looks?.get(category.id);
  return look ? { ...category, color: look.color ?? category.color, icon: look.icon, photo: look.photo } : category;
}

/**
 * The categories by how many operations went into them over the last POPULAR_DAYS days, then over all time; those
 * with as many keep their order. `operations` are the expenses for spending categories, the incomes for income ones.
 */
export function byPopularity<T extends Pick<Category, 'id'>>(
  categories: readonly T[],
  operations: ReadonlyArray<Pick<Operation, 'date' | 'category'>>,
  today: DateString,
): T[] {
  const since = addDays(today, -POPULAR_DAYS);
  const recent = new Map<TagId, number>();
  const ever = new Map<TagId, number>();
  for (const o of operations) {
    if (!o.category) continue;
    ever.set(o.category.id, (ever.get(o.category.id) ?? 0) + 1);
    if (o.date >= since && o.date <= today) recent.set(o.category.id, (recent.get(o.category.id) ?? 0) + 1);
  }
  const count = (counts: Map<TagId, number>, c: T) => counts.get(c.id) ?? 0;
  return [...categories].sort((a, b) => count(recent, b) - count(recent, a) || count(ever, b) - count(ever, a));
}

/** How many of `operations` went into the category over the last POPULAR_DAYS days. */
export function recentCount(category: Pick<Category, 'id'>, operations: ReadonlyArray<Pick<Operation, 'date' | 'category'>>, today: DateString): number {
  const since = addDays(today, -POPULAR_DAYS);
  return operations.filter((o) => o.category?.id === category.id && o.date >= since && o.date <= today).length;
}

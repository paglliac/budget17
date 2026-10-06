// The categories expenses are put into: ZenMoney's spending categories with the titles the user gave them in the
// app, and the user's own. A hidden category is not offered when sorting expenses, but the expenses already in it
// keep it. ZenMoney itself is never changed: what the user sets up is kept by src/settings.ts and applied here and in
// listOperations. Categories are offered most popular first.

import { addDays } from './dates.ts';
import type { Operation } from './ledger.ts';
import { categoryOf, topCategory, type Category } from './operations.ts';
import type { DateString, Tag, TagId } from './zenmoney/types.ts';

/** Ids of the user's own categories start with it, so they never clash with ZenMoney's. */
export const OWN_CATEGORY_PREFIX = 'own-';

/** A category the user added in the app. */
export interface OwnCategory {
  /** own-<number>. */
  id: TagId;
  title: string;
  hidden: boolean;
}

/** How the user set up categories in the app. */
export interface CategorySetup {
  /** ZenMoney categories the user renamed or hid, by tag id; a null title keeps ZenMoney's. */
  changes: ReadonlyMap<TagId, { title: string | null; hidden: boolean }>;
  own: readonly OwnCategory[];
}

/** ZenMoney's categories as they are. */
export const NO_SETUP: CategorySetup = { changes: new Map(), own: [] };

/** A category to sort expenses into. */
export interface CategoryEntry extends Category {
  /** Its own title, without its parent's: the one the user gave it, or ZenMoney's. */
  name: string;
  /** Its title in ZenMoney, without its parent's; null for the user's own categories. */
  zenmoneyTitle: string | null;
  hidden: boolean;
}

/** How far back expenses count towards how popular a category is. */
export const POPULAR_DAYS = 90;

/**
 * ZenMoney's spending categories by title, a subcategory titled with its parent (Дом / Ремонт), then the user's own
 * by title.
 */
export function categoryCatalog(tags: readonly Tag[], setup: CategorySetup): CategoryEntry[] {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const name = (tag: Tag) => setup.changes.get(tag.id)?.title ?? tag.title;
  const zenmoney = tags
    .filter((t) => t.showOutcome)
    .map((t): CategoryEntry => {
      const parent = t.parent ? byId.get(t.parent) : undefined;
      return {
        ...categoryOf(t),
        title: parent ? `${name(parent)} / ${name(t)}` : name(t),
        name: name(t),
        zenmoneyTitle: t.title,
        hidden: setup.changes.get(t.id)?.hidden ?? false,
      };
    });
  const own = setup.own.map((c): CategoryEntry => ({ id: c.id, title: c.title, color: null, name: c.title, zenmoneyTitle: null, hidden: c.hidden }));
  const byTitle = (a: CategoryEntry, b: CategoryEntry) => a.title.localeCompare(b.title, 'ru');
  return [...zenmoney.sort(byTitle), ...own.sort(byTitle)];
}

/**
 * Finds a category by id with the title the user gave it: a ZenMoney one as its top-level category, since expenses
 * are counted by those, or one of the user's own.
 */
export function categoryFinder(tags: ReadonlyMap<TagId, Tag>, setup: CategorySetup): (id: TagId) => Category | undefined {
  const own = new Map(setup.own.map((c) => [c.id, c]));
  return (id) => {
    const mine = own.get(id);
    if (mine) return { id: mine.id, title: mine.title, color: null };
    const tag = topCategory(tags, [id]);
    return tag ? { ...categoryOf(tag), title: setup.changes.get(tag.id)?.title ?? tag.title } : undefined;
  };
}

/**
 * The categories by how many expenses went into them over the last POPULAR_DAYS days, then over all time; those
 * with as many keep their order.
 */
export function byPopularity<T extends Pick<Category, 'id'>>(
  categories: readonly T[],
  expenses: ReadonlyArray<Pick<Operation, 'date' | 'category'>>,
  today: DateString,
): T[] {
  const since = addDays(today, -POPULAR_DAYS);
  const recent = new Map<TagId, number>();
  const ever = new Map<TagId, number>();
  for (const o of expenses) {
    if (!o.category) continue;
    ever.set(o.category.id, (ever.get(o.category.id) ?? 0) + 1);
    if (o.date >= since && o.date <= today) recent.set(o.category.id, (recent.get(o.category.id) ?? 0) + 1);
  }
  const count = (counts: Map<TagId, number>, c: T) => counts.get(c.id) ?? 0;
  return [...categories].sort((a, b) => count(recent, b) - count(recent, a) || count(ever, b) - count(ever, a));
}

/** How many expenses went into the category over the last POPULAR_DAYS days. */
export function recentCount(category: Pick<Category, 'id'>, expenses: ReadonlyArray<Pick<Operation, 'date' | 'category'>>, today: DateString): number {
  const since = addDays(today, -POPULAR_DAYS);
  return expenses.filter((o) => o.category?.id === category.id && o.date >= since && o.date <= today).length;
}

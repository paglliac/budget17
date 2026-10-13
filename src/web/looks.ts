// How a category is drawn: the icon and colour the user picked for it in the app, or the ones its title suggests, and
// the photo the user put on it, shown instead of the icon on the category's colour, so that a photo with a clear
// ground takes the colour. Rows and tiles take all three, so a category looks the same on every page and in the app.
// The photo itself is served at /category-photo/<category id>; its version in the address changes with it. A row of an
// operation shows the logo of its shop instead, when the shop has one (see shops.ts).

import type { Operation } from '../ledger.ts';
import type { Category } from '../operations.ts';
import type { TagId } from '../zenmoney/types.ts';
import { categoryIcon, isCategoryIcon, SHOP_LOGO_PATH, type IconName } from './icons.ts';
import { categoryColor, isTone } from './tones.ts';

export interface Look {
  icon: IconName;
  /** As CSS: var(--green) or #rrggbb. */
  color: string;
  /** Where the photo is, as a path of the site; null when the category has none. */
  photo: string | null;
}

/** How a category is drawn; operations without one get a grey tag. */
export function categoryLook(c: (Pick<Category, 'title' | 'color' | 'icon' | 'photo'> & { id: TagId | null }) | null): Look {
  if (c === null || c.id === null) return { icon: 'tag', color: categoryColor(null, null), photo: null };
  return {
    icon: isCategoryIcon(c.icon) ? c.icon : categoryIcon(c.title),
    color: categoryColor(c.id, c.color ?? null, c.title),
    photo: c.photo ? photoPath(c.id, c.photo) : null,
  };
}

export function photoPath(id: TagId, version: string): string {
  return `/category-photo/${encodeURIComponent(id)}?v=${encodeURIComponent(version)}`;
}

/** Where the logo of a shop is, as a path of the site, served at /shop-logo/<shop key>; null when it has none. */
export function logoOf(o: Pick<Operation, 'shop'>): string | null {
  return o.shop?.logo ? `${SHOP_LOGO_PATH}${encodeURIComponent(o.shop.key)}?v=${encodeURIComponent(o.shop.logo)}` : null;
}

/** How an operation's row is drawn: the logo of its shop when it has one, else as `look` says, by its category. */
export function withLogo(o: Pick<Operation, 'shop'>, look: Look): Look {
  const logo = logoOf(o);
  return logo ? { ...look, color: '#ffffff', photo: logo } : look;
}

/** Colours to pick for a category, with their names: the palette's tones by name, and a few more as #rrggbb. */
export const CATEGORY_COLORS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'violet', label: 'Фиолетовый' },
  { value: '#5B6CF0', label: 'Индиго' },
  { value: 'blue', label: 'Голубой' },
  { value: '#2FA7B8', label: 'Морской' },
  { value: 'teal', label: 'Бирюзовый' },
  { value: 'green', label: 'Зелёный' },
  { value: '#8CB43C', label: 'Салатовый' },
  { value: 'yellow', label: 'Жёлтый' },
  { value: 'orange', label: 'Оранжевый' },
  { value: 'red', label: 'Красный' },
  { value: 'pink', label: 'Розовый' },
  { value: '#C25BD6', label: 'Сиреневый' },
  { value: '#A47A55', label: 'Коричневый' },
  { value: 'gray', label: 'Серый' },
  { value: '#3D3D45', label: 'Графит' },
];

/** A colour the user may give a category: a tone's name, or any #rrggbb, such as one picked on a colour wheel. */
export function isCategoryColor(value: string): boolean {
  return isTone(value) || /^#[0-9a-f]{6}$/i.test(value);
}

/** How a category would look without what the user picked: by its title, in ZenMoney's colour if it has one. */
export function autoLook(c: Pick<Category, 'id' | 'title'> & { zenmoneyColor: string | null }): Look {
  return categoryLook({ id: c.id, title: c.title, color: c.zenmoneyColor, icon: null, photo: null });
}

// What all pages share: the rail with sections and the month tabs.

import { shiftMonth, type MonthString } from '../../dates.ts';
import type { EntityCollections } from '../../zenmoney/types.ts';
import { capitalize, monthName } from '../format.ts';
import type { Html } from '../html.ts';
import { avatar } from '../widgets/basics.ts';
import { rail, tabs } from '../widgets/shell.ts';

/** Builds a link to a page of this app; params that are null, undefined or empty are left out. */
export type Href = (path: string, params?: Record<string, string | null | undefined>) => string;

/** An Href that adds `keep` to every link, such as the demo switch. */
export function createHref(keep: Record<string, string> = {}): Href {
  return (path, params = {}) => {
    const query = new URLSearchParams(keep);
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    const text = query.toString();
    return text ? `${path}?${text}` : path;
  };
}

export type Section = 'overview' | 'operations' | 'uncategorized' | 'income' | 'regular';

export function appRail(active: Section, userName: string | null, href: Href): Html {
  return rail({
    groups: [
      {
        title: 'Меню',
        items: [
          { icon: 'home', label: 'Обзор', href: href('/'), active: active === 'overview' },
          { icon: 'list', label: 'Операции', href: href('/operations'), active: active === 'operations' },
          { icon: 'tag', label: 'Без категории', href: href('/uncategorized'), active: active === 'uncategorized' },
          { icon: 'arrowDownLeft', label: 'Доходы', href: href('/income'), active: active === 'income' },
          { icon: 'repeat', label: 'Регулярные траты', href: href('/regular'), active: active === 'regular' },
          { icon: 'layers', label: 'Виджеты', href: '/storyboard' },
        ],
      },
    ],
    footer: userName ? { title: 'Профиль', body: avatar({ name: userName }) } : undefined,
  });
}

/** The current month and the two before it, newest first. */
export function recentMonths(current: MonthString): MonthString[] {
  return [0, 1, 2].map((i) => shiftMonth(current, -i));
}

/** Tabs for recent months; `link` gives the URL of a month, null meaning the current one. */
export function monthTabs(current: MonthString, selected: MonthString, link: (month: MonthString | null) => string): Html {
  return tabs({
    label: 'Месяц',
    items: recentMonths(current).map((m) => ({
      label: capitalize(monthName(m)),
      icon: 'calendar' as const,
      href: link(m === current ? null : m),
      active: m === selected,
    })),
  });
}

/** A valid month from a query param, no later than the current one; the current month otherwise. */
export function parseMonth(value: string | null | undefined, current: MonthString): MonthString {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value <= current ? value : current;
}

/** Login of the family administrator, shown as the avatar. */
export function userName(data: Pick<EntityCollections, 'user'>): string | null {
  const users = data.user ?? [];
  return (users.find((u) => u.parent === null) ?? users[0])?.login ?? null;
}

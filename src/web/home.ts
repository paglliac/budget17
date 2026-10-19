// The top of a week as the app's main page and the web's overview tell it: what is free with how full the week is,
// what the plan holds by kind, what was spent, and the one thing to do next. Both build it here, so the situation the
// circle and the cards show is the same on the phone and in the browser; only the app rounds it.

import { envelopeOf, MONTH_LIMIT, monthOfWeek, type ExtrasSummary, type WeekSummary } from '../week.ts';
import type { DateString, EntityCollections } from '../zenmoney/types.ts';
import { money, plural, ROUND_STEP, roundParts } from './format.ts';
import type { DashboardData, SavedBudget } from './pages/dashboard.ts';
import { loadUncategorized } from './pages/uncategorized.ts';

/**
 * How full a week is, for the wave on the circle: «low» when less than one day's share of the week's amount is left,
 * «empty» at nothing, «over» past the amount. The share is what is left of the amount, or how far past it it went,
 * from 0 to 1.
 */
export function weekLevel(free: number, limit: number): { state: 'enough' | 'low' | 'empty' | 'over'; share: number } {
  const share = (amount: number) => (limit > 0 ? Math.round(Math.min(amount / limit, 1) * 1000) / 1000 : 1);
  if (free < -0.5) return { state: 'over', share: share(-free) };
  if (free < 0.5) return { state: 'empty', share: 0 };
  return { state: free < limit / 7 ? 'low' : 'enough', share: share(free) };
}

/** The extras of a month to the hundred, spent, planned and free adding up to the month's extras. */
export function roundExtras(m: ExtrasSummary): ExtrasSummary {
  const [byPlan, unplanned, planned, free] = roundParts([m.spentByPlan, m.spent - m.spentByPlan, m.planned, m.free]) as [number, number, number, number];
  return { ...m, spent: byPlan + unplanned, spentByPlan: byPlan, planned, free };
}

/** A month's extras as a card tells them: what is free of the month's amount, or, past it, how far past it, in red. */
export function extrasCard(m: ExtrasSummary, symbol: string) {
  const over = m.free < -0.5;
  return { label: 'Доп. бюджет', amount: over ? -m.free : m.free, over, note: `${over ? 'сверх' : 'из'} ${money(MONTH_LIMIT, symbol)}` };
}

/** How many expenses of this month wait for a category, as the card that opens them says it: «3 новые». */
function pendingCard(count: number) {
  return {
    count,
    label: count === 0 ? 'Всё разобрано' : `${plural(count, ['трата ждёт', 'траты ждут', 'трат ждут'])} разбора`,
    title: 'Разобрать операции',
    note: `${count} ${plural(count, ['новая', 'новые', 'новых'])}`,
  };
}

/**
 * Wishes whose chosen plan falls short of them, as the card beside today's spending tells it: «Не хватает» with what
 * is short, and the wish it opens, or how many wishes, which open «Желания»; null when none is short.
 */
function shortCard(wishes: DashboardData['wishes']) {
  const short = wishes.filter(({ plan, gathered }) => plan !== undefined && gathered.short > 0.5);
  const [first] = short;
  if (!first) return null;
  const amount = short.reduce((sum, { gathered }) => sum + gathered.short, 0);
  const note = short.length === 1 ? first.wish.title : `${short.length} ${plural(short.length, ['желание', 'желания', 'желаний'])}`;
  return { label: 'Не хватает', amount, note, wish: short.length === 1 ? first.wish.id : null };
}

export type WeekHome = ReturnType<typeof weekHome>;

/**
 * The top of the week: what is free with how full the week is, what the plan holds by kind, what was spent today (in a
 * past week, in all of it), how many expenses wait for a category, wishes short of money, the extras of the week's
 * month, and when the data came from ZenMoney. The card beside today's spending is the place of what has to be done
 * (`task`): the expenses to sort first, then the wishes short of money (the user's order, 2026-10-18), and once there
 * is nothing to do, the extras. With round figures (the app's switch) the week comes rounded, and so do today and the
 * extras; the web passes it exact.
 */
export function weekHome(
  d: Pick<DashboardData, 'current' | 'marking' | 'wishes' | 'extras' | 'symbol'>,
  w: WeekSummary,
  data: EntityCollections,
  saved: SavedBudget,
  options: { today: DateString; syncedAt?: string | null },
) {
  const { today } = options;
  const phase = w.week > d.current ? 'ahead' : w.week < d.current ? 'past' : 'current';
  const spentToday = w.spending.filter((o) => o.date === today && envelopeOf(d.marking, o) === 'week').reduce((sum, o) => sum + o.amount, 0);
  const todaySpent = saved.roundFigures ? Math.round(spentToday / ROUND_STEP) * ROUND_STEP : spentToday;
  const pending = loadUncategorized(data, saved, { today }).pending.length;
  const short = shortCard(d.wishes);
  return {
    free: { label: phase === 'current' ? 'Свободно' : phase === 'past' ? 'Итог недели' : 'Будет свободно', amount: w.free, ...weekLevel(w.free, w.limit) },
    reserved: {
      label: 'Зарезервировано',
      amount: w.planned,
      required: { label: 'обязательное', amount: w.required },
      flexible: { label: 'гибкое', amount: w.planned - w.required },
    },
    spent:
      phase === 'current'
        ? { label: 'Сегодня потрачено', amount: todaySpent }
        : phase === 'past'
          ? { label: 'Потрачено за неделю', amount: w.spent }
          : null,
    pending: pendingCard(pending),
    short,
    // The month the card opens; null is the current week's, as the app asks for the current month.
    extras: { ...extrasCard(saved.roundFigures ? roundExtras(d.extras) : d.extras, d.symbol), month: d.extras.month === monthOfWeek(d.current) ? null : d.extras.month },
    /** What the card beside today's spending shows: sort, short or extras. */
    task: (pending > 0 ? 'sort' : short ? 'short' : 'extras') as 'sort' | 'short' | 'extras',
    syncedAt: options.syncedAt ?? null,
  };
}

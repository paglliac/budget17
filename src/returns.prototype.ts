// PROTOTYPE, throwaway (branch prototype/return-rules): how a spend counts once money came back for it — the change
// from a fuel station, a refund, friends' shares of a bill, a reimbursement from work, a debt paid back.
//
// Pairs are found by the rules of the research (.scratch/operation-links/research/01-pair-candidates.md): change or a
// cancel within 30 minutes on the same account, a full refund of the same shop within 30 days, a reimbursement of the
// same sum within 30 days, a later partial refund of the same shop; plus pairs written here by hand (debts, friends'
// shares, parts of transfers given back, a contract cancelled). ?variant= picks how such a pair counts, and the server
// remembers the last pick, so the iPhone app on «Тестовый» counts the same way:
// A «В неделю траты»: the spend and its returns are one spend of the difference, where the spend is.
// B «В неделю возврата»: each counts in its own week: the difference in the spend's week, and money that came back in
//   another week is a minus there.
// C «Как сейчас»: nothing is linked, a return is an income.
// Weeks start on Saturday here, as on the VDS. Nothing is written anywhere.

import { addDays, weekday } from './dates.ts';
import type { Operation } from './ledger.ts';
import { operationKind } from './operations.ts';
import { isPerson, shopKey } from './payees.ts';
import { dayMonth, num } from './web/format.ts';
import type { DateString, EntityCollections, Transaction } from './zenmoney/types.ts';

export type ReturnsVariant = 'A' | 'B' | 'C';

export const RETURNS_VARIANTS: ReadonlyArray<{ key: ReturnsVariant; name: string }> = [
  { key: 'A', name: 'В неделю траты' },
  { key: 'B', name: 'В неделю возврата' },
  { key: 'C', name: 'Как сейчас' },
];

/** The VDS week, from Saturday; the prototype shows the user's weeks, not the Mac's default. */
export const PROTOTYPE_WEEK_START = 5;

let current: ReturnsVariant = 'A';

export function returnsVariant(): ReturnsVariant {
  return current;
}

/** Remembers the variant a page was asked for, so the app's requests without one count the same way. */
export function pickReturnsVariant(value: string | null): void {
  if (value === 'A' || value === 'B' || value === 'C') current = value;
}

interface Group {
  id: number;
  /** What came back: Сдача, Отмена, Возврат, Возмещение, Скинулись, Долг, Вернули часть. */
  label: string;
  spends: string[];
  returns: string[];
}

interface Tx {
  id: string;
  date: DateString;
  created: number;
  kind: 'expense' | 'income';
  amount: number;
  account: string;
  payee: string;
  comment: string;
  /** The shop's name for a return: payee, or the bank's comment without «Отмена операции оплаты в». */
  name: string;
}

const MINUTES_30 = 30 * 60;
const DAYS_30 = 30 * 24 * 60 * 60;

/** Pairs written by hand: [date, amount, a piece of the payee or comment]. */
const BY_HAND: ReadonlyArray<{ label: string; spends: Array<[DateString, number, string]>; returns: Array<[DateString, number, string]> }> = [
  { label: 'Долг', spends: [['2026-07-13', 5_000, 'Виктор Ф.']], returns: [['2026-07-16', 5_000, 'Виктор Ф.']] },
  { label: 'Долг', spends: [['2026-06-05', 70_000, 'Сергей В.']], returns: [['2026-05-27', 70_000, 'Сергей В.']] },
  { label: 'Долг', spends: [['2026-08-21', 100_000, 'Влас М.']], returns: [['2026-08-11', 100_000, 'Влас М.']] },
  { label: 'Скинулись', spends: [['2026-06-23', 5_370, 'CHICKO']], returns: [['2026-06-23', 3_500, 'Александр К.']] },
  {
    label: 'Скинулись',
    spends: [['2026-04-05', 9_400, 'TEPLO 2'], ['2026-04-05', 5_705, 'VAJB']],
    returns: [['2026-04-05', 5_900, 'Елена Б.'], ['2026-04-05', 5_900, 'Анастасия О.']],
  },
  { label: 'Вернули часть', spends: [['2025-12-28', 10_000, 'Александр Т.']], returns: [['2026-01-03', 4_608, 'Александр Т.']] },
  { label: 'Вернули часть', spends: [['2026-03-29', 15_000, 'Ирина Т.']], returns: [['2026-03-29', 2_000, 'Ирина Т.']] },
  { label: 'Вернули часть', spends: [['2026-03-28', 18_410, 'Земфира Г.']], returns: [['2026-03-31', 3_000, 'Земфира Г.']] },
  { label: 'Возврат', spends: [['2026-02-28', 80_000, 'Marakin']], returns: [['2026-05-15', 60_000, 'расторжение']] },
];

const NOT_A_SHOP = /заработная плата|проценты на остаток|кэшбэк|командировочн|расторжение|перевод денежных средств/i;

function transactions(data: Pick<EntityCollections, 'transaction'>): Tx[] {
  const list: Tx[] = [];
  for (const t of data.transaction ?? []) {
    if (t.deleted) continue;
    const kind = operationKind(t);
    if (kind !== 'expense' && kind !== 'income') continue;
    const payee = t.payee?.trim() ?? '';
    const comment = t.comment?.trim() ?? '';
    const name = (payee || comment)
      .replace(/^Отмена операции оплаты в\s*/i, '')
      .replace(/^Возврат покупки через СБП\s*/i, '')
      .replace(/_LinkedSBP$/i, '');
    list.push({
      id: t.id,
      date: t.date,
      created: t.created,
      kind,
      amount: kind === 'income' ? t.income : t.outcome,
      account: kind === 'income' ? t.incomeAccount : t.outcomeAccount,
      payee,
      comment,
      name,
    });
  }
  return list.sort((a, b) => a.created - b.created);
}

function isShopReturn(t: Tx): boolean {
  return t.kind === 'income' && t.name !== '' && !isPerson(t.payee) && !NOT_A_SHOP.test(`${t.payee} ${t.comment}`);
}

function sameKey(a: string, b: string): boolean {
  const ka = shopKey(a);
  const kb = shopKey(b);
  return ka === kb || (Math.min(ka.length, kb.length) >= 5 && (ka.startsWith(kb) || kb.startsWith(ka)));
}

const cache = new WeakMap<object, Group[]>();

/** The spends and the money that came back for them, found once per load of ZenMoney's data. */
export function returnGroups(data: Pick<EntityCollections, 'transaction'>): Group[] {
  const key = data.transaction ?? [];
  const cached = cache.get(key);
  if (cached) return cached;

  const all = transactions(data);
  const expenses = all.filter((t) => t.kind === 'expense');
  const left = new Map(expenses.map((t) => [t.id, t.amount]));
  const groups: Group[] = [];
  const groupOfSpend = new Map<string, Group>();
  const linked = new Set<string>();

  const link = (spend: Tx, back: Tx, label: string) => {
    let group = groupOfSpend.get(spend.id);
    if (!group) {
      group = { id: groups.length, label, spends: [spend.id], returns: [] };
      groups.push(group);
      groupOfSpend.set(spend.id, group);
    }
    group.returns.push(back.id);
    left.set(spend.id, (left.get(spend.id) ?? 0) - back.amount);
    linked.add(back.id);
  };
  const nearest = (back: Tx, fits: (spend: Tx) => boolean): Tx | undefined =>
    expenses.filter((s) => s.created <= back.created && (left.get(s.id) ?? 0) >= back.amount - 0.005 && fits(s)).at(-1);

  for (const spec of BY_HAND) {
    const find = ([date, amount, piece]: [DateString, number, string], kind: Tx['kind']) =>
      all.find((t) => t.kind === kind && t.date === date && Math.abs(t.amount - amount) < 0.005 && `${t.payee} ${t.comment}`.includes(piece));
    const spends = spec.spends.map((s) => find(s, 'expense'));
    const returns = spec.returns.map((r) => find(r, 'income'));
    if (spends.some((s) => !s) || returns.some((r) => !r)) {
      console.warn(`PROTOTYPE: не нашлась пара «${spec.label}» ${JSON.stringify(spec)}`);
      continue;
    }
    const group = { id: groups.length, label: spec.label, spends: spends.map((s) => s!.id), returns: returns.map((r) => r!.id) };
    groups.push(group);
    for (const s of spends) groupOfSpend.set(s!.id, group);
    for (const r of returns) linked.add(r!.id);
  }

  const shopReturns = all.filter(isShopReturn);
  // Change and cancels: the nearest spend on the same account within 30 minutes, whatever the shop is called.
  for (const back of shopReturns) {
    if (linked.has(back.id)) continue;
    const spend = nearest(back, (s) => s.account === back.account && s.created >= back.created - MINUTES_30);
    if (spend) link(spend, back, Math.abs(spend.amount - back.amount) < 0.005 ? 'Отмена' : 'Сдача');
  }
  // A full refund of the same shop within 30 days.
  for (const back of shopReturns) {
    if (linked.has(back.id)) continue;
    const spend = nearest(
      back,
      (s) => s.account === back.account && s.created >= back.created - DAYS_30 && Math.abs(s.amount - back.amount) < 0.005 && shopKey(s.name) === shopKey(back.name),
    );
    if (spend) link(spend, back, 'Возврат');
  }
  // A reimbursement from work: exactly one spend of the same sum, or the same without kopecks, within 30 days.
  for (const back of all.filter((t) => t.kind === 'income' && /командировочн/i.test(t.comment))) {
    if (linked.has(back.id)) continue;
    const fits = expenses.filter(
      (s) => s.created <= back.created && s.created >= back.created - DAYS_30 && (Math.abs(s.amount - back.amount) < 0.005 || Math.floor(s.amount) === back.amount),
    );
    if (fits.length === 1) link(fits[0]!, back, 'Возмещение');
  }
  // A later partial refund: the nearest spend of the same shop on the same account within 30 days.
  for (const back of shopReturns) {
    if (linked.has(back.id)) continue;
    const spend = nearest(back, (s) => s.account === back.account && s.created >= back.created - DAYS_30 && sameKey(s.name, back.name));
    if (spend) link(spend, back, 'Возврат');
  }

  cache.set(key, groups);
  return groups;
}

function weekOf(date: DateString): DateString {
  return addDays(date, -((weekday(date) - PROTOTYPE_WEEK_START + 7) % 7));
}

function amountText(amount: number): string {
  return num(amount, { cents: Math.round(amount * 100) % 100 !== 0 });
}

function byTime(a: Operation, b: Operation): number {
  return a.date.localeCompare(b.date) || a.created - b.created;
}

/**
 * Operations as the picked variant counts them: a spend with the money that came back for it becomes one spend of the
 * difference; in B money that came back in another week stays there as a minus. `all` lists every operation, so a
 * pair reaching outside the range still counts in full.
 */
export function applyReturns(plain: Operation[], data: Pick<EntityCollections, 'transaction'>, all: () => Operation[]): Operation[] {
  if (current === 'C') return plain;
  const groups = returnGroups(data);
  const groupOf = new Map<string, Group>();
  for (const g of groups) for (const id of [...g.spends, ...g.returns]) groupOf.set(id, g);
  if (!plain.some((o) => groupOf.has(o.id))) return plain;

  const everything = new Map(all().map((o) => [o.id, o]));
  const inRange = new Set(plain.map((o) => o.id));
  const bucketOf = (o: Operation) => (current === 'A' ? 'all' : weekOf(o.date));
  const done = new Set<string>();
  const result: Operation[] = [];
  for (const o of plain) {
    const g = groupOf.get(o.id);
    if (!g) {
      result.push(o);
      continue;
    }
    const bucket = bucketOf(o);
    const key = `${g.id}:${bucket}`;
    if (done.has(key)) continue;
    done.add(key);
    const members = [...g.spends, ...g.returns].flatMap((id) => everything.get(id) ?? []);
    const spendsAll = members.filter((m) => g.spends.includes(m.id)).sort(byTime);
    const returnsAll = members.filter((m) => g.returns.includes(m.id)).sort(byTime);
    const spends = spendsAll.filter((m) => bucketOf(m) === bucket);
    const returns = returnsAll.filter((m) => bucketOf(m) === bucket);
    const first = spends[0] ?? returns[0]!;
    // The bucket shows where its first operation is; outside the range it is counted on another page.
    if (!inRange.has(first.id)) continue;
    const elsewhere = [...spendsAll, ...returnsAll].filter((m) => bucketOf(m) !== bucket);
    if (spends.length > 0) {
      const spent = spends.reduce((s, m) => s + m.amount, 0);
      const back = returns.reduce((s, m) => s + m.amount, 0);
      const others = spends.slice(1).map((m) => `${m.payee} ${amountText(m.amount)}`);
      const detail = [
        returns.length > 0
          ? `${g.label} ${returns.map((r) => amountText(r.amount) + (r.date !== first.date ? ` ${dayMonth(r.date)}` : '')).join(' + ')}`
          : null,
        `было ${amountText(spent)}${others.length > 0 ? ` вместе с ${others.join(', ')}` : ''}`,
        ...elsewhere.map((m) => `${m.kind === 'income' ? 'вернули' : 'потратили'} ${amountText(m.amount)} ${dayMonth(m.date)}, в другой неделе`),
      ].filter(Boolean);
      result.push({ ...first, amount: spent - back, description: [first.description, detail.join(' · ')].filter(Boolean).join(' · ') });
    } else {
      // Money that came back in a week without its spend: a minus in that week, under the spend's category.
      const spend = spendsAll[0] ?? first;
      const back = returns.reduce((s, m) => s + m.amount, 0);
      result.push({
        ...spend,
        id: first.id,
        date: first.date,
        created: first.created,
        kind: 'expense',
        amount: -back,
        payee: first.comment && first.payee === 'Доход' ? first.comment : first.payee,
        comment: null,
        account: first.account,
        hold: first.hold,
        description: `${g.label}: за ${spend.payee} ${amountText(spend.amount)} ${dayMonth(spend.date)}`,
      });
    }
  }
  return result.sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
}

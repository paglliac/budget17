// Rolls a snapshot of the databases onto this checkout's data/ from nothing, every date moved by the days from the day
// the snapshot was taken to today, so the situation of that day is today's: a week that went below zero that evening
// goes below zero today, by the same expenses.
//   make restore-data                                  the newest snapshot
//   make restore-data DATASET=week-minus/2026-10-14    another one
//   make restore-data TODAY=2026-10-20                 as if today were another day
// Snapshots are kept outside git, beside what was found in them, in the main checkout: .scratch/<case>/snapshots/<day>
// holds settings.db and zenmoney.db, and its name is the day it was taken. DATASET may also be the path of such a
// folder. It refuses a data/ that is a symlink and the main checkout's own, which hold what the user entered on the Mac.
//
// What moves by those days: the dates of ZenMoney's transactions, planned operations and reminders, when they were
// added and changed, the sync moment, the weeks of purchases, wish plans and week limits, the days wishes are needed
// by, and the first and last dates of regular expenses. The weekday a week begins on moves too, so the weeks fall the
// same way round today, and so does the day of the month a regular expense or an income is paid. The months of wish
// plans, their ways and Claude's reviews follow the weeks they are of. Only what ties to a month itself can come out
// otherwise, such as which month's extras a week counts in, when the move takes a week over a month's end. The copy
// gets no Claude token, so that it never reviews months on the user's subscription.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const DATABASES = ['settings.db', 'zenmoney.db'];
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    dataset: { type: 'string' },
    today: { type: 'string' },
    to: { type: 'string', default: join(root, 'data') },
  },
});

const pad = (n: number) => String(n).padStart(2, '0');
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const addDays = (date: string, days: number) => new Date(utc(date).getTime() + days * 86_400_000).toISOString().slice(0, 10);

function refuse(message: string): never {
  console.error(message);
  process.exit(1);
}

/** The main checkout, whose .scratch keeps the snapshots whichever worktree asks. */
function mainCheckout(): string {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim();
  return dirname(common);
}

/** Snapshots as case/day, newest first. */
function snapshots(scratch: string): string[] {
  if (!existsSync(scratch)) return [];
  return readdirSync(scratch, { withFileTypes: true })
    .filter((c) => c.isDirectory() && existsSync(join(scratch, c.name, 'snapshots')))
    .flatMap((c) => readdirSync(join(scratch, c.name, 'snapshots')).filter(isDate).map((day) => `${c.name}/${day}`))
    .sort((a, b) => b.slice(-10).localeCompare(a.slice(-10)));
}

const given = values.dataset !== undefined && existsSync(values.dataset) ? resolve(values.dataset) : null;
const scratch = given ? dirname(dirname(dirname(given))) : join(mainCheckout(), '.scratch');
const found = given ? [] : snapshots(scratch);
const named = values.dataset ?? found[0] ?? refuse(`В ${scratch} нет снимков: ждём папки <тема>/snapshots/<день> с settings.db и zenmoney.db.`);
const snapshot = given ?? join(scratch, named.replace(/^([^/]+)\/(\d{4}-\d{2}-\d{2})$/, '$1/snapshots/$2'));
const anchor = snapshot.slice(-10);
if (!isDate(anchor)) refuse(`Папка снимка называется днём, когда он снят, например week-minus/snapshots/2026-10-14: ${snapshot}.`);
for (const db of DATABASES) {
  if (!existsSync(join(snapshot, db))) refuse(`В ${snapshot} нет ${db}. Снимки: ${found.join(', ') || 'нет'}.`);
}
const now = new Date();
const today = values.today ?? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
if (!isDate(today)) refuse(`TODAY — день вида 2026-10-15, а не ${today}.`);
const to = resolve(values.to!);
if (existsSync(to) && lstatSync(to).isSymbolicLink()) refuse(`${to} — ссылка на ${realpathSync(to)}, базы затёрлись бы там. Уберите ссылку (rm ${to}) и повторите.`);
const git = join(dirname(to), '.git');
if (existsSync(git) && lstatSync(git).isDirectory()) refuse(`${to} — базы основной копии с тем, что введено на Mac. Снимки накатываются в worktree.`);

const days = Math.round((utc(today).getTime() - utc(anchor).getTime()) / 86_400_000);
const shift = <T>(v: T): T | string => (isDate(v) ? addDays(v, days) : v);
/** The month a week counts in: the one holding its fourth day, as src/week.ts has it. */
const monthOfWeek = (week: string) => addDays(week, 3).slice(0, 7);
/** A month that no week stands beside, moved with its middle. */
const shiftMonth = (month: string) => addDays(`${month}-15`, days).slice(0, 7);
/** A day of the month as it falls in the snapshot's month, moved: paid on the 10th, it is paid on the 11th a day on. */
const shiftDay = (day: number) => {
  const [year, month] = [Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7))];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Number(addDays(`${anchor.slice(0, 7)}-${pad(Math.min(day, last))}`, days).slice(8, 10));
};

const work = join(dirname(to), `.restore-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
try {
  for (const db of DATABASES) copyFileSync(join(snapshot, db), join(work, db));
  moveZenMoney(new DatabaseSync(join(work, 'zenmoney.db')));
  moveSettings(new DatabaseSync(join(work, 'settings.db')));
  mkdirSync(to, { recursive: true });
  // A journal left from the old file would be rolled back into the new one.
  for (const db of DATABASES) {
    for (const extra of ['-journal', '-wal', '-shm']) rmSync(join(to, db + extra), { force: true });
    renameSync(join(work, db), join(to, db));
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(`Снимок ${relative(scratch, snapshot)} — в ${relative(process.cwd(), to) || to}/, даты сдвинуты на ${days} дн.: его «сегодня» — ${today}.`);
console.log('Сервер копии видит базы со следующего запроса. Без токена ZenMoney, чтобы в них не пришли настоящие операции: PORT=4318 SYNC_MINUTES=0 node src/web/server.ts');

function moveZenMoney(db: DatabaseSync): void {
  const update = db.prepare('UPDATE entity SET data = ? WHERE type = ? AND id = ?');
  db.exec('BEGIN');
  for (const row of db.prepare(`SELECT type, id, data FROM entity WHERE type IN ('transaction', 'reminderMarker', 'reminder')`).all()) {
    const entity = JSON.parse(String(row.data)) as Record<string, unknown>;
    for (const key of ['date', 'startDate', 'endDate']) if (key in entity) entity[key] = shift(entity[key]);
    for (const key of ['created', 'changed']) if (typeof entity[key] === 'number') entity[key] = (entity[key] as number) + days * 86_400;
    update.run(JSON.stringify(entity), String(row.type), String(row.id));
  }
  db.prepare('UPDATE sync_state SET server_timestamp = server_timestamp + ?').run(days * 86_400);
  db.exec('COMMIT');
  db.close();
}

function moveSettings(db: DatabaseSync): void {
  const rows = <T>(sql: string) => db.prepare(sql).all() as T[];
  const date = (v: string | null) => shift(v) as string | null;
  db.exec('BEGIN');
  for (const p of rows<{ id: number; week: string }>('SELECT id, week FROM purchase')) db.prepare('UPDATE purchase SET week = ? WHERE id = ?').run(date(p.week), p.id);
  // All at once, since one week's new first day may be another's old one.
  const limits = rows<{ week: string; amount: number }>('SELECT week, amount FROM week_limit');
  db.exec('DELETE FROM week_limit');
  for (const l of limits) db.prepare('INSERT INTO week_limit (week, amount) VALUES (?, ?)').run(date(l.week), l.amount);
  // The extras a wish's plan holds money in are named by their month, extra-2026-10, in its steps and its ways.
  const months = new Map<string, string>();
  for (const s of rows<{ id: number; way: string; week: string | null; month: string | null; to_week: string | null }>('SELECT id, way, week, month, to_week FROM wish_step')) {
    const week = date(s.week);
    const way = s.way.replace(/^extra-(\d{4}-\d{2})$/, (_, m: string) => {
      const moved = week ? monthOfWeek(week) : shiftMonth(m);
      months.set(m, moved);
      return `extra-${moved}`;
    });
    db.prepare('UPDATE wish_step SET way = ?, week = ?, month = ?, to_week = ? WHERE id = ?').run(way, week, s.month ? shiftMonth(s.month) : null, date(s.to_week), s.id);
  }
  for (const w of rows<{ id: number; due: string | null; ways: string | null; buy_week: string | null }>('SELECT id, due, ways, buy_week FROM wish')) {
    const ways = w.ways === null ? null : w.ways.replace(/extra-(\d{4}-\d{2})/g, (_, m: string) => `extra-${months.get(m) ?? shiftMonth(m)}`);
    db.prepare('UPDATE wish SET due = ?, ways = ?, buy_week = ? WHERE id = ?').run(date(w.due), ways, date(w.buy_week), w.id);
  }
  for (const r of rows<{ id: number; day: number; start_date: string | null; end_date: string | null }>('SELECT id, day, start_date, end_date FROM regular_expense')) {
    db.prepare('UPDATE regular_expense SET day = ?, start_date = ?, end_date = ? WHERE id = ?').run(shiftDay(r.day), date(r.start_date), date(r.end_date), r.id);
  }
  for (const i of rows<{ id: number; params: string }>('SELECT id, params FROM income')) {
    const params = JSON.parse(i.params) as Record<string, number>;
    for (const [key, value] of Object.entries(params)) if ((key === 'day' || key.endsWith('Day')) && value >= 1 && value <= 31) params[key] = shiftDay(value);
    db.prepare('UPDATE income SET params = ? WHERE id = ?').run(JSON.stringify(params), i.id);
  }
  for (const table of ['claude_review', 'claude_request']) {
    const months = rows<{ month: string }>(`SELECT month FROM ${table}`).map((r) => r.month);
    // Through a name no month has, since one month's new name may be another's old one.
    db.exec(`UPDATE ${table} SET month = 'moving:' || month`);
    for (const m of months) db.prepare(`UPDATE ${table} SET month = ? WHERE month = ?`).run(shiftMonth(m), `moving:${m}`);
  }
  const start = Number(rows<{ value: string }>(`SELECT value FROM preference WHERE key = 'week_start'`)[0]?.value ?? 0);
  db.prepare(`INSERT INTO preference (key, value) VALUES ('week_start', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(String((((start + days) % 7) + 7) % 7));
  db.exec(`DELETE FROM preference WHERE key = 'claude_token'`);
  db.exec('COMMIT');
  db.close();
}

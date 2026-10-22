import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Settings } from '../src/settings.ts';
import { Store } from '../src/store.ts';
import { reminderMarker, transaction } from './fixtures.ts';

const script = fileURLToPath(new URL('../scripts/restore-data.ts', import.meta.url));
const folder = mkdtempSync(join(tmpdir(), 'restore-data-'));
after(() => rmSync(folder, { recursive: true, force: true }));

/** A snapshot taken on Wednesday 14 October 2026, with weeks from Saturday: the dentist paid that day. */
function snapshot(): string {
  const dir = join(folder, 'week-minus', 'snapshots', '2026-10-14');
  mkdirSync(dir, { recursive: true });
  using store = new Store(join(dir, 'zenmoney.db'));
  store.apply({
    serverTimestamp: 1_791_991_381,
    transaction: [transaction({ id: 'dentist', date: '2026-10-14', created: 1_791_990_000, changed: 1_791_990_100, outcome: 10_000, payee: 'OOO Dobryj Den' })],
    reminderMarker: [reminderMarker({ id: 'rent', date: '2026-10-10' })],
  });
  using settings = new Settings(join(dir, 'settings.db'));
  settings.setWeekStart(5);
  settings.addPurchase({ title: 'Стоматолог', amount: 3_000, week: '2026-10-10', envelope: 'extra', kind: 'required', done: false });
  settings.setWeekLimit('2026-10-03', 30_000);
  settings.setWeekLimit('2026-10-10', 40_000);
  const tyres = settings.addWish({ title: 'Шины', amount: 65_000 });
  settings.setWishDue(tyres.id, '2026-11-28');
  settings.chooseWishPlan(tyres.id, {
    ways: 'weeks:5000,extra-2026-10:',
    buyWeek: '2026-11-07',
    steps: [
      { way: 'weeks', kind: 'week', week: '2026-10-17', amount: 5_000 },
      { way: 'extra-2026-10', kind: 'extra', week: '2026-10-10', amount: 60_000 },
    ],
  });
  settings.addRegularExpense({ title: 'Коммуналка', amount: 8_000, day: 10, start: '2026-11-01', end: null, icon: null });
  settings.addIncome({ title: 'Зарплата', model: 'salary', params: { salary: 200_000, advanceDay: 20, payDay: 5 } });
  settings.setClaudeToken('sk-test');
  const race = { kind: 'purchase' as const, id: 35, title: 'Участие в Кедродзилле', wish: null };
  settings.addWeekChanges([{ week: '2026-10-10', before: 1_500, after: -2_000, subject: race, what: { kind: 'moved', from: '2026-10-17', to: '2026-10-10' } }], { at: 1_791_990_000_000, who: 'Таня' });
  return dir;
}

const restore = (args: string[]) => execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' });

describe('make restore-data', () => {
  const dir = snapshot();

  it('rolls a snapshot onto a copy with every date moved to today, the weeks falling the same way round', () => {
    const data = join(folder, 'copy', 'data');
    const said = restore(['--dataset', dir, '--to', data, '--today', '2026-10-15']);
    assert.match(said, /сдвинуты на 1 дн\.: его «сегодня» — 2026-10-15/);

    using store = new Store(join(data, 'zenmoney.db'));
    const moved = store.load();
    const dentist = moved.transaction?.find((t) => t.id === 'dentist');
    assert.deepEqual([dentist?.date, dentist?.created, dentist?.changed], ['2026-10-15', 1_791_990_000 + 86_400, 1_791_990_100 + 86_400]);
    assert.equal(moved.reminderMarker?.[0]?.date, '2026-10-11');
    assert.equal(store.serverTimestamp, 1_791_991_381 + 86_400);

    using settings = new Settings(join(data, 'settings.db'));
    assert.equal(settings.weekStart(), 6, 'the weeks begin on Sunday now, a day after Saturday');
    assert.deepEqual(settings.purchases().map((p) => p.week), ['2026-10-11']);
    assert.deepEqual([...settings.weekLimits()], [['2026-10-04', 30_000], ['2026-10-11', 40_000]]);
    const [wish] = settings.wishes();
    assert.equal(wish?.due, '2026-11-29');
    assert.deepEqual(settings.wishPlans().get(wish!.id), {
      ways: 'weeks:5000,extra-2026-10:',
      buyWeek: '2026-11-08',
      steps: [
        { way: 'weeks', kind: 'week', week: '2026-10-18', amount: 5_000 },
        { way: 'extra-2026-10', kind: 'extra', week: '2026-10-11', amount: 60_000 },
      ],
    });
    assert.deepEqual(settings.regularExpenses().map((e) => [e.day, e.start]), [[11, '2026-11-02']]);
    assert.deepEqual(settings.incomes()[0]?.params, { salary: 200_000, advanceDay: 21, payDay: 6 });
    assert.equal(settings.claudeToken(), null, 'a copy never reviews months on the user’s subscription');
    assert.deepEqual(settings.weekChanges().map((c) => [c.at, c.week, c.what]), [
      [1_791_990_000_000 + 86_400_000, '2026-10-11', { kind: 'moved', from: '2026-10-18', to: '2026-10-11' }],
    ]);
  });

  it('names the extras of a wish’s plan by the month its week lands in', () => {
    const data = join(folder, 'later', 'data');
    restore(['--dataset', dir, '--to', data, '--today', '2026-10-28']);
    using settings = new Settings(join(data, 'settings.db'));
    const [plan] = settings.wishPlans().values();
    // 10 + 14 = 24 October, a week whose fourth day is the 27th; 17 + 14 = 31 October counts in November.
    assert.equal(plan?.ways, 'weeks:5000,extra-2026-10:');
    assert.deepEqual(plan?.steps.map((s) => ('week' in s ? s.week : null)), ['2026-10-31', '2026-10-24']);
    assert.equal(settings.weekStart(), 5, 'two weeks on, Saturday again');
  });

  it('refuses a data/ that is a symlink, and the main checkout’s own', () => {
    const elsewhere = join(folder, 'elsewhere');
    mkdirSync(elsewhere);
    mkdirSync(join(folder, 'linked'));
    symlinkSync(elsewhere, join(folder, 'linked', 'data'));
    assert.throws(() => restore(['--dataset', dir, '--to', join(folder, 'linked', 'data')]), /ссылка/);
    mkdirSync(join(folder, 'main', '.git'), { recursive: true });
    assert.throws(() => restore(['--dataset', dir, '--to', join(folder, 'main', 'data')]), /основной копии/);
  });
});

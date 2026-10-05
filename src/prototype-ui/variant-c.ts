// Variant C, "Лента": operations first. A month summary with one category spectrum on top, a day-by-day feed
// you filter by type, category or text, and an inspector that shows the selected operation and the history
// with that payee. Click a row or use j / k.
// PROTOTYPE: throwaway code, see server.ts.

import type { Dashboard, Operation } from './data.ts';
import {
  capitalize,
  dayMonth,
  dayTitle,
  esc,
  icon,
  money,
  monthName,
  page,
  shiftMonth,
  weekday,
  WEEKDAYS_FULL,
  type Variant,
} from './shared.ts';

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const variantC: Variant = {
  key: 'C',
  name: 'Лента',
  render(d, { link }) {
    const sym = d.main.symbol;
    const currentMonth = d.today.slice(0, 7);
    const prev = shiftMonth(d.month, -1);
    const next = shiftMonth(d.month, 1);
    const ops = d.operations;

    // Category spectrum: top seven and the rest.
    const spending = d.categories.filter((c) => c.spent > 0);
    const top = spending.slice(0, 7);
    const restSum = spending.slice(7).reduce((s, c) => s + c.spent, 0);
    const segments = [...top.map((c) => ({ id: c.id, title: c.title, color: c.color, spent: c.spent })), ...(restSum > 0 ? [{ id: '', title: 'Остальное', color: '#CFCFCA', spent: restSum }] : [])];
    const spectrum = segments
      .map((s) => `<i style="flex:${s.spent};background:${s.color}" title="${esc(s.title)}: ${money(s.spent, sym)}"></i>`)
      .join('');
    const legend = top
      .map(
        (c) =>
          `<button type="button" class="lg" data-cat="${esc(c.id)}" aria-pressed="false"><i style="background:${c.color}"></i>${esc(c.title)}<span>${money(c.spent, sym)}</span></button>`,
      )
      .join('');

    const counts = { all: ops.length, expense: 0, income: 0, transfer: 0 };
    for (const o of ops) counts[o.kind] += 1;
    const seg = (kind: keyof typeof counts, label: string) =>
      `<button type="button" data-kind="${kind}" aria-pressed="${kind === 'all'}">${label}<span>${counts[kind]}</span></button>`;

    // Feed grouped by day.
    const byDay = new Map<string, Array<{ op: Operation; index: number }>>();
    ops.forEach((op, index) => {
      const list = byDay.get(op.date) ?? [];
      list.push({ op, index });
      byDay.set(op.date, list);
    });
    const feed = [...byDay]
      .map(([date, items]) => {
        const net = items.reduce((s, { op }) => s + (op.kind === 'expense' ? -op.amount : op.kind === 'income' ? op.amount : 0), 0);
        const title = dayTitle(date, d.today);
        const subtitle = title === 'Сегодня' || title === 'Вчера' ? `${dayMonth(date)}, ${WEEKDAYS_FULL[weekday(date)]}` : WEEKDAYS_FULL[weekday(date)];
        return `
          <section class="dayblock">
            <header><b>${title}</b><span>${subtitle}</span><code>${net === 0 ? '' : money(net, sym, { sign: true })}</code></header>
            <ul>${items.map(({ op, index }) => row(op, index, sym)).join('')}</ul>
          </section>`;
      })
      .join('');

    const templates = ops.map((op, index) => `<template id="op-${index}">${inspector(op, d)}</template>`).join('');
    const vsPrev =
      d.isCurrentMonth && d.prevExpenseToDate > 0
        ? `к ${d.dayOfMonth} ${monthName(prev, 'gen')} было ${money(d.prevExpenseToDate, sym)}`
        : `в ${monthName(prev, 'prep')} ${money(d.prevExpense, sym)}`;

    return page({
      title: 'Бюджет: операции',
      fonts: 'family=Golos+Text:wght@400;500;600&family=JetBrains+Mono:wght@400;500',
      css: CSS,
      body: `
<div class="app">
  <header class="top">
    <span class="brand"><span class="logo">${icon('wallet', 15)}</span>Операции</span>
    <nav class="month" aria-label="Месяц">
      <a href="${link({ month: prev })}" aria-label="Предыдущий месяц">${icon('chevronLeft', 16)}</a>
      <b>${capitalize(monthName(d.month))} ${d.month.slice(0, 4)}</b>
      ${
        d.month < currentMonth
          ? `<a href="${link({ month: next === currentMonth ? null : next })}" aria-label="Следующий месяц">${icon('chevronRight', 16)}</a>`
          : `<span class="off">${icon('chevronRight', 16)}</span>`
      }
    </nav>
    <label class="search">${icon('search', 16)}<input id="q" type="search" placeholder="Найти операцию" aria-label="Поиск операций"></label>
  </header>

  <section class="summary">
    <div class="figures">
      <div><span>Потрачено</span><b>${money(d.expense, sym)}</b><small>${vsPrev}</small></div>
      <div><span>Получено</span><b class="in">${money(d.income, sym, { sign: true })}</b><small>в ${monthName(prev, 'prep')} ${money(d.prevIncome, sym)}</small></div>
      <div><span>На счетах</span><b>${money(d.balance.total, sym)}</b><small>${d.source === 'demo' ? 'демо-данные' : 'по данным ZenMoney'}</small></div>
    </div>
    ${spending.length ? `<div class="spectrum" role="img" aria-label="Расходы по категориям">${spectrum}</div><div class="legend">${legend}</div>` : ''}
  </section>

  <div class="split">
    <section class="feed" aria-label="Операции">
      <div class="seg" role="group" aria-label="Тип операций">${seg('all', 'Все')}${seg('expense', 'Расходы')}${seg('income', 'Доходы')}${seg('transfer', 'Переводы')}</div>
      ${feed}
      <p class="none" ${ops.length ? 'hidden' : ''}>${ops.length ? 'Ничего не нашлось. Попробуйте другой запрос или сбросьте фильтры.' : `В ${monthName(d.month, 'prep')} операций нет.`}</p>
    </section>
    <aside class="inspector" aria-live="polite"><div class="inspector-body"><p class="hint">Выберите операцию слева.</p></div></aside>
  </div>
</div>
${templates}`,
      script: SCRIPT,
    });
  },
};

function signed(op: Operation, sym: string, cents = false): string {
  if (op.kind === 'transfer') return money(op.amount, sym, { cents });
  return money(op.kind === 'income' ? op.amount : -op.amount, sym, { sign: true, cents });
}

function row(op: Operation, index: number, sym: string): string {
  const search = [op.payee, op.category, op.comment ?? '', op.account].join(' ').toLowerCase();
  const second = op.kind === 'transfer' ? `${op.account} → ${op.toAccount}` : `${op.category}, ${op.account}`;
  return `
    <li class="op" tabindex="0" role="button" data-i="${index}" data-kind="${op.kind}" data-cat="${esc(op.categoryId)}" data-q="${esc(search)}">
      <span class="op-icon" style="--c:${op.color}">${icon(op.icon, 16)}</span>
      <span class="op-text"><b>${esc(op.payee)}</b><small>${esc(second)}</small></span>
      ${op.hold ? '<span class="hold">в обработке</span>' : ''}
      <code class="op-amt ${op.kind}">${signed(op, sym)}</code>
    </li>`;
}

function inspector(op: Operation, d: Dashboard): string {
  const sym = d.main.symbol;
  const key = op.payee.toLowerCase();
  const same = d.history.filter((o) => o.payee.toLowerCase() === key && o.kind === op.kind);
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(d.month, i - 5));
  const perMonth = months.map((m) => same.filter((o) => o.date.startsWith(m)).reduce((s, o) => s + o.amount, 0));
  const max = Math.max(...perMonth, 1);
  const average = same.length ? same.reduce((s, o) => s + o.amount, 0) / same.length : 0;
  const bars = months
    .map(
      (m, i) => `
        <span class="mb${m === op.date.slice(0, 7) ? ' on' : ''}">
          <i style="height:${Math.max(3, (perMonth[i]! / max) * 72)}px" title="${money(perMonth[i]!, sym)}"></i>
          <small>${monthName(m).slice(0, 3)}</small>
        </span>`,
    )
    .join('');
  const fact = (label: string, value: string) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  return `
    <div class="insp-head">
      <span class="insp-icon" style="--c:${op.color}">${icon(op.icon, 20)}</span>
      <div><h2>${esc(op.payee)}</h2><span class="insp-cat"><i style="background:${op.color}"></i>${esc(op.category)}</span></div>
    </div>
    <p class="insp-amt ${op.kind}">${signed(op, sym, true)}</p>
    ${op.original ? `<p class="insp-orig">Списано ${esc(op.original)}, пересчитано по курсу ZenMoney</p>` : ''}
    <dl class="facts">
      ${fact(op.kind === 'transfer' ? 'Откуда' : 'Счёт', esc(op.account))}
      ${op.toAccount ? fact('Куда', esc(op.toAccount)) : ''}
      ${fact('Когда', `${dayMonth(op.date)}, ${timeFormat.format(new Date(op.created * 1000))}`)}
      ${op.mcc ? fact('MCC', `<code>${op.mcc}</code>`) : ''}
      ${fact('Статус', op.hold ? '<span class="hold">в обработке</span>' : 'Проведена')}
    </dl>
    ${op.comment ? `<p class="comment">${icon('message', 14)}${esc(op.comment)}</p>` : ''}
    <section class="history">
      <h3>${op.kind === 'income' ? 'Поступления' : 'Траты'} у этого получателя</h3>
      <div class="bars">${bars}</div>
      <p>${same.length} ${same.length === 1 ? 'операция' : same.length < 5 ? 'операции' : 'операций'} за полгода, в среднем ${money(average, sym)}.</p>
      <ul>${same
        .slice(0, 4)
        .map((o) => `<li><span>${dayMonth(o.date)}</span><code>${signed(o, sym)}</code></li>`)
        .join('')}</ul>
    </section>`;
}

const SCRIPT = `
  (function () {
    var state = { kind: 'all', cat: null, q: '' };
    var rows = Array.prototype.slice.call(document.querySelectorAll('.op'));
    var blocks = Array.prototype.slice.call(document.querySelectorAll('.dayblock'));
    var body = document.querySelector('.inspector-body');
    var none = document.querySelector('.none');
    var selected = null;

    function apply() {
      var any = false;
      rows.forEach(function (row) {
        var ok = (state.kind === 'all' || row.dataset.kind === state.kind)
          && (!state.cat || row.dataset.cat === state.cat)
          && (!state.q || row.dataset.q.indexOf(state.q) !== -1);
        row.hidden = !ok;
        any = any || ok;
      });
      blocks.forEach(function (block) { block.hidden = !block.querySelector('.op:not([hidden])'); });
      if (rows.length) none.hidden = any;
    }
    function select(row) {
      if (!row) return;
      if (selected) selected.classList.remove('on');
      selected = row;
      row.classList.add('on');
      body.innerHTML = document.getElementById('op-' + row.dataset.i).innerHTML;
    }
    rows.forEach(function (row) {
      row.addEventListener('click', function () { select(row); });
      row.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(row); }
      });
    });
    document.querySelectorAll('.seg button').forEach(function (button) {
      button.addEventListener('click', function () {
        state.kind = button.dataset.kind;
        document.querySelectorAll('.seg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
        apply();
      });
    });
    document.querySelectorAll('.lg').forEach(function (button) {
      button.addEventListener('click', function () {
        state.cat = state.cat === button.dataset.cat ? null : button.dataset.cat;
        document.querySelectorAll('.lg').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.cat === state.cat)); });
        apply();
      });
    });
    document.getElementById('q').addEventListener('input', function (event) {
      state.q = event.target.value.toLowerCase().trim();
      apply();
    });
    document.addEventListener('keydown', function (event) {
      if (event.target instanceof Element && event.target.closest('input, textarea')) return;
      if (event.key !== 'j' && event.key !== 'k') return;
      var visible = rows.filter(function (row) { return !row.hidden; });
      var at = visible.indexOf(selected);
      var next = visible[Math.max(0, Math.min(visible.length - 1, at + (event.key === 'j' ? 1 : -1)))];
      select(next);
      if (next) next.scrollIntoView({ block: 'nearest' });
    });
    select(rows[0]);
  })();
`;

const CSS = `
:root { --page: #E9E9E5; --card: #FFFFFF; --ink: #1A1A1D; --muted: #7A7A78; --dim: #ABABA6; --line: #EEEEEA; --fill: #F4F4F1; --in: #24945A; }
* { box-sizing: border-box; margin: 0; padding: 0; }
[hidden] { display: none !important; }
body { min-height: 100vh; background: var(--page); color: var(--ink); font: 400 14px/1.45 'Golos Text', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
button, input { font: inherit; color: inherit; background: none; border: 0; }
button { cursor: pointer; }
a { color: inherit; text-decoration: none; }
code { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.app { max-width: 1320px; margin: 0 auto; padding: 22px 28px 100px; }
.top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 20px; height: 48px; }
.brand { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 500; }
.logo { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: var(--ink); color: #fff; }
.month { display: flex; align-items: center; gap: 4px; padding: 4px; background: var(--card); border-radius: 999px; }
.month b { min-width: 140px; text-align: center; font-weight: 500; }
.month a, .month .off { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; }
.month a:hover { background: var(--fill); }
.month .off { opacity: .3; }
.search { justify-self: end; display: flex; align-items: center; gap: 10px; width: min(380px, 100%); height: 40px; padding: 0 14px; background: var(--card); border-radius: 999px; color: var(--dim); }
.search input { width: 100%; outline: none; color: var(--ink); }

.summary { margin-top: 18px; padding: 22px 24px 18px; background: var(--card); border-radius: 22px; }
.figures { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.figures div { display: grid; gap: 2px; padding-left: 20px; border-left: 1px solid var(--line); }
.figures div:first-child { padding-left: 0; border-left: 0; }
.figures span { font-size: 13px; color: var(--muted); }
.figures b { font-size: 28px; font-weight: 500; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.figures b.in { color: var(--in); }
.figures small { font-size: 12px; color: var(--dim); }
.spectrum { display: flex; gap: 3px; height: 12px; margin-top: 22px; }
.spectrum i { min-width: 3px; border-radius: 4px; }
.legend { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.lg { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 11px; border-radius: 999px; background: var(--fill); font-size: 13px; }
.lg i { width: 8px; height: 8px; border-radius: 50%; }
.lg span { color: var(--muted); font-variant-numeric: tabular-nums; }
.lg:hover { background: #ECECE8; }
.lg[aria-pressed="true"] { background: var(--ink); color: #fff; }
.lg[aria-pressed="true"] span { color: rgb(255 255 255 / .65); }

.split { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 16px; margin-top: 16px; align-items: start; }
.feed { padding: 14px 10px 10px; background: var(--card); border-radius: 22px; }
.seg { display: inline-flex; gap: 2px; margin: 0 8px 6px; padding: 3px; background: var(--fill); border-radius: 12px; }
.seg button { display: flex; gap: 6px; height: 30px; padding: 0 12px; border-radius: 9px; font-size: 13px; color: var(--muted); align-items: center; }
.seg button span { font-size: 12px; color: var(--dim); }
.seg button[aria-pressed="true"] { background: var(--card); color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / .08); }
.dayblock header { position: sticky; top: 0; z-index: 1; display: flex; align-items: baseline; gap: 10px; padding: 16px 14px 8px; background: var(--card); }
.dayblock header b { font-weight: 500; font-size: 15px; }
.dayblock header span { font-size: 13px; color: var(--muted); }
.dayblock header code { margin-left: auto; color: var(--muted); }
.dayblock ul { list-style: none; }
.op { display: flex; align-items: center; gap: 12px; padding: 9px 14px; border-radius: 14px; cursor: pointer; }
.op:hover { background: var(--fill); }
.op.on { background: var(--fill); box-shadow: inset 3px 0 0 var(--ink); }
.op-icon { display: grid; place-items: center; flex: none; width: 38px; height: 38px; border-radius: 12px; background: color-mix(in srgb, var(--c) 14%, white); color: var(--c); }
.op-text { display: grid; min-width: 0; margin-right: auto; }
.op-text b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.op-text small { font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.op-amt { flex: none; font-size: 14px; white-space: nowrap; }
.op-amt.income, .insp-amt.income { color: var(--in); }
.op-amt.transfer, .insp-amt.transfer { color: var(--muted); }
.hold { flex: none; padding: 2px 8px; border-radius: 999px; background: #FFF3D6; color: #9A6B00; font-size: 11.5px; }
.none { padding: 30px 14px; color: var(--muted); }

.inspector { position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow: auto; padding: 22px; background: var(--card); border-radius: 22px; }
.hint { color: var(--muted); }
.insp-head { display: flex; gap: 14px; align-items: center; }
.insp-icon { display: grid; place-items: center; flex: none; width: 48px; height: 48px; border-radius: 15px; background: color-mix(in srgb, var(--c) 16%, white); color: var(--c); }
.insp-head h2 { font-size: 18px; font-weight: 500; line-height: 1.25; }
.insp-cat { display: inline-flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 13px; color: var(--muted); }
.insp-cat i { width: 7px; height: 7px; border-radius: 50%; }
.insp-amt { margin-top: 22px; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 30px; font-weight: 500; letter-spacing: -0.03em; }
.insp-orig { margin-top: 2px; font-size: 12.5px; color: var(--muted); }
.facts { display: grid; gap: 10px; margin-top: 18px; padding: 14px; border-radius: 14px; background: var(--fill); font-size: 13.5px; }
.facts div { display: grid; grid-template-columns: 80px 1fr; }
.facts dt { color: var(--muted); }
.facts dd { font-weight: 500; }
.comment { display: flex; gap: 8px; align-items: baseline; margin-top: 12px; padding: 0 4px; color: #4A4A4E; }
.comment .i { flex: none; transform: translateY(2px); color: var(--dim); }
.history { margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line); }
.history h3 { font-size: 14px; font-weight: 500; }
.bars { display: flex; align-items: flex-end; gap: 10px; height: 100px; margin-top: 14px; }
.mb { flex: 1; display: grid; justify-items: center; align-content: end; gap: 6px; height: 100%; }
.mb i { width: 100%; max-width: 34px; border-radius: 6px; background: #E3E3DE; }
.mb.on i { background: var(--ink); }
.mb small { font-size: 11px; color: var(--muted); }
.history p { margin-top: 12px; font-size: 13px; color: var(--muted); }
.history ul { list-style: none; margin-top: 10px; }
.history li { display: flex; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--line); font-size: 13px; }

@media (max-width: 1000px) {
  .split { grid-template-columns: minmax(0, 1fr); }
  .inspector { position: static; max-height: none; }
  .top { grid-template-columns: 1fr; height: auto; }
  .search { justify-self: stretch; width: 100%; }
}
@media (max-width: 640px) {
  .app { padding: 14px 12px 90px; }
  .figures { grid-template-columns: 1fr; gap: 14px; }
  .figures div { padding-left: 0; border-left: 0; }
}
`;

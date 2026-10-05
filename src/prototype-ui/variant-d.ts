// Variant D, "Календарь": the month itself is the screen. A calendar tinted by daily spending with incomes,
// planned payments and weekly totals, next to the balance line through the month with a forecast to its end.
// Click a day to see its operations.
// PROTOTYPE: throwaway code, see server.ts.

import type { Dashboard, Operation, Planned } from './data.ts';
import {
  capitalize,
  compact,
  dateOf,
  dayMonth,
  daysInMonth,
  esc,
  icon,
  mix,
  money,
  monthName,
  num,
  page,
  shiftMonth,
  weekday,
  WEEKDAYS,
  WEEKDAYS_FULL,
  type Variant,
} from './shared.ts';

const HEAT = '#F26B3A';

export const variantD: Variant = {
  key: 'D',
  name: 'Календарь',
  render(d, { link }) {
    const sym = d.main.symbol;
    const currentMonth = d.today.slice(0, 7);

    const tabs = [...d.months.slice(0, 4)]
      .reverse()
      .map((m) => `<a class="tab${m === d.month ? ' on' : ''}" href="${link({ month: m === currentMonth ? null : m })}">${capitalize(monthName(m))}</a>`)
      .join('');

    const plannedByDay = new Map<number, Planned[]>();
    for (const p of d.planned) {
      if (!p.date.startsWith(d.month)) continue;
      const day = Number(p.date.slice(8, 10));
      plannedByDay.set(day, [...(plannedByDay.get(day) ?? []), p]);
    }
    const opsByDay = new Map<number, Operation[]>();
    for (const o of d.operations) {
      const day = Number(o.date.slice(8, 10));
      opsByDay.set(day, [...(opsByDay.get(day) ?? []), o]);
    }

    // Heat is relative to the 90th percentile day, so rent day does not wash out the rest.
    const nonZero = d.dailyExpense.filter((v) => v > 0).sort((a, b) => a - b);
    const reference = nonZero[Math.floor(nonZero.length * 0.9)] ?? nonZero.at(-1) ?? 1;
    const heat = (spent: number) => (spent > 0 ? Math.min(1, spent / reference) ** 0.7 : 0);

    const offset = weekday(dateOf(d.month, 1));
    const prevDays = daysInMonth(shiftMonth(d.month, -1));
    const todayDay = d.isCurrentMonth ? d.dayOfMonth : 0;
    const cells: string[] = [];
    const weekTotals: number[] = [];
    let week = 0;
    const pushWeekTotal = () => {
      weekTotals.push(week);
      cells.push(`<span class="week" data-week="${weekTotals.length - 1}"></span>`);
      week = 0;
    };
    for (let i = 0; i < offset; i++) cells.push(`<span class="cell out"><span class="num">${prevDays - offset + 1 + i}</span></span>`);
    for (let day = 1; day <= d.daysInMonth; day++) {
      const spent = d.dailyExpense[day - 1] ?? 0;
      const income = d.dailyIncome[day - 1] ?? 0;
      const plans = plannedByDay.get(day) ?? [];
      week += spent;
      const h = heat(spent);
      const classes = ['cell', day === todayDay ? 'today' : '', todayDay && day > todayDay ? 'future' : '', (offset + day - 1) % 7 >= 5 ? 'weekend' : '']
        .filter(Boolean)
        .join(' ');
      const chips = plans
        .slice(0, 2)
        .map((p) => `<span class="plan${p.kind === 'income' ? ' plan-in' : ''}" title="${esc(p.title)}"><b>${p.kind === 'income' ? '+' : p.kind === 'expense' ? '−' : ''}${compact(p.amount)}</b> ${esc(p.title)}</span>`)
        .join('');
      cells.push(`
        <button type="button" class="${classes}" data-day="${day}" style="background:${h > 0 ? mix('#FFFFFF', HEAT, 0.08 + h * 0.3) : ''}" aria-label="${dayMonth(dateOf(d.month, day))}${spent > 0 ? `, расходы ${money(spent, sym)}` : ''}">
          <span class="num">${day}${day === todayDay ? '<small>сегодня</small>' : ''}</span>
          ${income > 0 ? `<span class="inc">+${compact(income)}</span>` : ''}
          ${chips}${plans.length > 2 ? `<span class="plan more">ещё ${plans.length - 2}</span>` : ''}
          ${spent > 0 ? `<span class="spent">−${num(spent)}</span>` : ''}
        </button>`);
      if ((offset + day) % 7 === 0) pushWeekTotal();
    }
    const trailing = (7 - ((offset + d.daysInMonth) % 7)) % 7;
    for (let i = 1; i <= trailing; i++) cells.push(`<span class="cell out"><span class="num">${i}</span></span>`);
    if (trailing > 0) pushWeekTotal();
    const maxWeek = Math.max(...weekTotals, 1);
    let grid = cells.join('');
    weekTotals.forEach((total, i) => {
      grid = grid.replace(
        `<span class="week" data-week="${i}"></span>`,
        `<span class="week"><b>${total > 0 ? num(total) : '—'}</b><i style="width:${(total / maxWeek) * 100}%"></i></span>`,
      );
    });

    const selectedDay = todayDay || [...opsByDay.keys()][0] || 1;
    const dayTemplates = Array.from({ length: d.daysInMonth }, (_, i) => i + 1)
      .map((day) => `<template id="day-${day}">${dayPanel(d, day, opsByDay.get(day) ?? [], plannedByDay.get(day) ?? [])}</template>`)
      .join('');

    return page({
      title: 'Бюджет: календарь',
      fonts: 'family=Manrope:wght@400;500;600;700',
      css: CSS,
      body: `
<div class="page">
  <nav class="tabs" aria-label="Месяц">${tabs}</nav>
  <div class="sheet">
    <aside class="side">
      <h1 class="title">${capitalize(monthName(d.month))}<span>${d.month.slice(0, 4)}</span></h1>
      ${flow(d)}
      <section class="daypanel" aria-live="polite">${dayPanel(d, selectedDay, opsByDay.get(selectedDay) ?? [], plannedByDay.get(selectedDay) ?? [])}</section>
    </aside>
    <main class="cal">
      <div class="grid">
        ${WEEKDAYS.map((w, i) => `<span class="wd${i >= 5 ? ' weekend' : ''}">${w}</span>`).join('')}<span class="wd">Неделя</span>
        ${grid}
      </div>
      <div class="legend">
        <span class="scale">Тратили меньше ${[0.1, 0.35, 0.6, 0.85, 1].map((h) => `<i style="background:${mix('#FFFFFF', HEAT, 0.08 + h * 0.3)}"></i>`).join('')} больше</span>
        <span><span class="inc">+</span>Доход</span>
        <span><span class="plan">План</span>Запланировано в ZenMoney</span>
      </div>
    </main>
  </div>
</div>
${dayTemplates}`,
      script: `
        (function () {
          var panel = document.querySelector('.daypanel');
          var cells = document.querySelectorAll('.cell[data-day]');
          function select(cell) {
            cells.forEach(function (c) { c.classList.toggle('picked', c === cell); });
            panel.innerHTML = document.getElementById('day-' + cell.dataset.day).innerHTML;
          }
          cells.forEach(function (cell) { cell.addEventListener('click', function () { select(cell); }); });
          var first = document.querySelector('.cell[data-day="${selectedDay}"]');
          if (first) first.classList.add('picked');
        })();
      `,
    });
  },
};

function flow(d: Dashboard): string {
  const sym = d.main.symbol;
  const width = 300;
  const height = 120;
  const points: Array<{ day: number; value: number; forecast: boolean }> = [
    { day: 0, value: d.startBalance, forecast: false },
    ...d.balanceSeries.map((value, i) => ({ day: i + 1, value, forecast: false })),
    ...d.forecastSeries.map((value, i) => ({ day: d.dayOfMonth + i + 1, value, forecast: true })),
  ];
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (day: number) => (day / d.daysInMonth) * width;
  const y = (value: number) => 8 + (1 - (value - min) / span) * (height - 16);
  const path = (list: typeof points) => list.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const actual = points.filter((p) => !p.forecast);
  const lastActual = actual.at(-1)!;
  const forecast = [lastActual, ...points.filter((p) => p.forecast)];
  const area = `${path(actual)} L${x(lastActual.day).toFixed(1)} ${height} L0 ${height} Z`;

  const remainingPlanned = d.planned.filter((p) => p.date.startsWith(d.month) && p.date > d.today && p.kind !== 'transfer');
  const plannedIn = remainingPlanned.filter((p) => p.kind === 'income').reduce((s, p) => s + p.amount, 0);
  const plannedOut = remainingPlanned.filter((p) => p.kind === 'expense').reduce((s, p) => s + p.amount, 0);
  const restDays = d.daysInMonth - d.dayOfMonth;
  const endLabel = `${d.daysInMonth} ${monthName(d.month, 'gen')}`;

  const rows = d.isCurrentMonth
    ? `
      <div><dt>1 ${monthName(d.month, 'gen')}</dt><dd>${money(d.startBalance, sym)}</dd></div>
      <div><dt>Сегодня</dt><dd>${money(d.balanceSeries.at(-1) ?? d.balance.total, sym)}</dd></div>
      <div><dt>Придёт по плану</dt><dd class="in">${money(plannedIn, sym, { sign: true })}</dd></div>
      <div><dt>Спишется по плану</dt><dd>${money(-plannedOut, sym)}</dd></div>
      <div><dt>Обычные траты</dt><dd>${money(-d.typicalDaily * restDays, sym)}</dd></div>
      <div class="end"><dt>К ${endLabel}</dt><dd>≈ ${money(d.endBalance, sym)}</dd></div>`
    : `
      <div><dt>1 ${monthName(d.month, 'gen')}</dt><dd>${money(d.startBalance, sym)}</dd></div>
      <div><dt>Пришло</dt><dd class="in">${money(d.income, sym, { sign: true })}</dd></div>
      <div><dt>Потрачено</dt><dd>${money(-d.expense, sym)}</dd></div>
      <div class="end"><dt>${capitalize(endLabel)}</dt><dd>${money(d.endBalance, sym)}</dd></div>`;

  return `
    <section class="flow">
      <h2>Деньги на счетах</h2>
      <svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Баланс по дням месяца">
        <path d="${area}" fill="${mix('#FFFFFF', HEAT, 0.12)}"/>
        <path d="${path(actual)}" fill="none" stroke="#1D1B19" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
        ${forecast.length > 1 ? `<path d="${path(forecast)}" fill="none" stroke="#1D1B19" stroke-width="1.6" stroke-dasharray="4 4" opacity=".45" vector-effect="non-scaling-stroke"/>` : ''}
      </svg>
      <div class="chart-axis"><span>1</span><span>${d.isCurrentMonth ? 'сегодня' : ''}</span><span>${d.daysInMonth}</span></div>
      <dl class="rows">${rows}</dl>
      ${
        d.isCurrentMonth
          ? `<p class="note">Пунктиром показан прогноз: плановые платежи из ZenMoney и обычные траты, около ${money(d.typicalDaily, sym)} в день.</p>`
          : ''
      }
    </section>`;
}

function dayPanel(d: Dashboard, day: number, ops: Operation[], plans: Planned[]): string {
  const sym = d.main.symbol;
  const date = dateOf(d.month, day);
  const spent = ops.filter((o) => o.kind === 'expense').reduce((s, o) => s + o.amount, 0);
  const list = ops
    .map(
      (o) => `
      <li>
        <span class="dot" style="background:${o.color}"></span>
        <span class="what"><b>${esc(o.payee)}</b><small>${esc(o.category)}</small></span>
        <span class="amt ${o.kind}">${o.kind === 'income' ? '+' : o.kind === 'expense' ? '−' : ''}${num(o.amount)}</span>
      </li>`,
    )
    .join('');
  const planList = plans
    .map(
      (p) => `
      <li class="planned">
        <span class="dot ring"></span>
        <span class="what"><b>${esc(p.title)}</b><small>по плану, ${esc(p.category.toLowerCase())}</small></span>
        <span class="amt ${p.kind}">${p.kind === 'income' ? '+' : p.kind === 'expense' ? '−' : ''}${num(p.amount)}</span>
      </li>`,
    )
    .join('');
  const isFuture = date > d.today;
  return `
    <header>
      <h2>${dayMonth(date)}<span>${WEEKDAYS_FULL[weekday(date)]}</span></h2>
      ${spent > 0 ? `<b>−${money(spent, sym)}</b>` : ''}
    </header>
    ${
      list || planList
        ? `<ul>${list}${planList}</ul>`
        : `<p class="quiet">${isFuture ? 'На этот день ничего не запланировано.' : 'В этот день операций не было.'}</p>`
    }
    ${ops.length > 0 ? `<p class="count">${icon('receipt', 13)}${ops.length} ${ops.length === 1 ? 'операция' : ops.length < 5 ? 'операции' : 'операций'}</p>` : ''}`;
}

const CSS = `
:root { --page: #E7E6E1; --sheet: #FFFFFF; --ink: #1D1B19; --muted: #85837E; --dim: #B5B3AD; --line: #EEEDE9; --fill: #F5F4F1; --in: #2B9A5E; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { min-height: 100vh; padding: 28px 32px 100px; background: var(--page); color: var(--ink); font: 400 14px/1.45 'Manrope', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; text-align: left; }
a { color: inherit; text-decoration: none; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.page { max-width: 1440px; margin: 0 auto; }
.tabs { display: flex; gap: 4px; padding-left: 20px; }
.tab { padding: 9px 18px 8px; border-radius: 12px 12px 0 0; font-weight: 500; color: var(--muted); }
.tab:hover { color: var(--ink); }
.tab.on { background: var(--sheet); color: var(--ink); }
.sheet { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 36px; padding: 30px 30px 26px; background: var(--sheet); border-radius: 28px; }

.title { display: flex; align-items: flex-start; gap: 10px; font-size: 64px; font-weight: 700; line-height: .95; letter-spacing: -0.045em; }
.title span { margin-top: 6px; font-size: 16px; font-weight: 600; letter-spacing: 0; color: var(--dim); }

.flow { margin-top: 30px; }
.flow h2, .daypanel h2 { font-size: 14px; font-weight: 600; }
.chart { display: block; width: 100%; height: 120px; margin-top: 14px; }
.chart-axis { display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: var(--dim); }
.rows { display: grid; gap: 8px; margin-top: 18px; font-size: 13.5px; }
.rows div { display: flex; justify-content: space-between; gap: 12px; }
.rows dt { color: var(--muted); }
.rows dd { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rows dd.in { color: var(--in); }
.rows .end { margin-top: 6px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 16px; }
.rows .end dt { color: var(--ink); font-weight: 600; }
.note { margin-top: 12px; font-size: 12px; color: var(--muted); }

.daypanel { margin-top: 28px; padding: 18px; border-radius: 20px; background: var(--fill); }
.daypanel header { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.daypanel h2 { display: flex; align-items: baseline; gap: 8px; font-size: 16px; }
.daypanel h2 span { font-size: 13px; font-weight: 500; color: var(--muted); }
.daypanel header b { font-weight: 600; font-variant-numeric: tabular-nums; }
.daypanel ul { list-style: none; margin-top: 12px; display: grid; gap: 2px; }
.daypanel li { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
.dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
.dot.ring { background: none; border: 1.5px dashed var(--muted); width: 10px; height: 10px; }
.what { display: grid; min-width: 0; margin-right: auto; }
.what b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.what small { font-size: 12px; color: var(--muted); }
.amt { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.amt.income { color: var(--in); }
.amt.transfer { color: var(--muted); }
.planned .what b, .planned .amt { color: var(--muted); }
.quiet { margin-top: 10px; color: var(--muted); }
.count { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 12px; color: var(--muted); }

.grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)) 108px; gap: 6px; }
.wd { padding: 0 10px 6px; font-size: 13px; font-weight: 600; }
.wd.weekend { color: var(--muted); }
.cell { position: relative; display: flex; flex-direction: column; gap: 4px; min-height: 112px; padding: 10px 10px 9px; border-radius: 16px; background: var(--fill); overflow: hidden; }
button.cell:hover { box-shadow: inset 0 0 0 1.5px rgb(29 27 25 / .25); }
.cell.picked { box-shadow: inset 0 0 0 2px var(--ink) !important; }
.cell.out { background: none; color: var(--dim); }
.cell.future { background: #FBFAF8; box-shadow: inset 0 0 0 1px var(--line); }
.num { display: flex; align-items: baseline; gap: 6px; font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.num small { padding: 1px 6px; border-radius: 999px; background: var(--ink); color: #fff; font-size: 10.5px; font-weight: 600; }
.cell.future .num { color: var(--muted); }
.spent { margin-top: auto; font-size: 13.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.inc { align-self: flex-start; padding: 2px 7px; border-radius: 7px; background: #DDF2E5; color: var(--in); font-size: 12px; font-weight: 600; }
.plan { display: block; max-width: 100%; padding: 2px 7px; border: 1px dashed #BDBAB2; border-radius: 7px; font-size: 11.5px; font-weight: 500; color: #6E6B65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.plan b { font-weight: 700; color: var(--ink); }
.plan-in { border-color: #9ED1B3; color: var(--in); }
.plan-in b { color: var(--in); }
.plan.more { border-style: solid; border-color: transparent; padding-left: 2px; }
.week { display: flex; flex-direction: column; justify-content: flex-end; gap: 8px; padding: 10px 6px 12px 12px; border-left: 1px solid var(--line); }
.week b { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
.week i { display: block; height: 4px; border-radius: 2px; background: ${HEAT}; opacity: .55; }
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 24px; margin-top: 18px; font-size: 12.5px; color: var(--muted); }
.legend > span { display: inline-flex; align-items: center; gap: 8px; }
.scale i { display: inline-block; width: 18px; height: 12px; border-radius: 4px; }
.legend .plan { display: inline-block; }

@media (max-width: 1180px) {
  .sheet { grid-template-columns: minmax(0, 1fr); }
  .side { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
  .title { grid-column: 1 / -1; }
  .flow, .daypanel { margin-top: 0; }
}
@media (max-width: 760px) {
  body { padding: 12px 10px 90px; }
  .sheet { padding: 18px 12px; }
  .side { grid-template-columns: minmax(0, 1fr); }
  .title { font-size: 48px; }
  .grid { grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; }
  .week, .wd:nth-child(8) { display: none; }
  .cell { min-height: 64px; padding: 6px; border-radius: 10px; }
  .plan, .inc { display: none; }
  .spent { font-size: 11px; }
}
`;

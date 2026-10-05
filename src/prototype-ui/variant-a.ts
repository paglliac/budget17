// Variant A, "Обзор": a calm dashboard after the first reference. Icon rail, month tabs, greeting with a one-line
// summary, three progress cards, pastel category tiles, a spending calendar next to upcoming payments, and the
// accounts in a side panel where the reference has its assistant.
// PROTOTYPE: throwaway code, see server.ts.

import type { Dashboard, Planned } from './data.ts';
import {
  ACCOUNT_COLORS,
  accountTypeLabel,
  capitalize,
  dateOf,
  daysInMonth,
  esc,
  icon,
  mix,
  money,
  monthName,
  num,
  page,
  plural,
  shiftMonth,
  weekday,
  WEEKDAYS,
  type IconName,
  type Variant,
} from './shared.ts';

const YELLOW = '#F2BE45';
const VIOLET = '#8C6CEF';
const TEAL = '#4FC4A2';
const EVENT_TONES = ['#5BB5EE', YELLOW, '#A68AF5', '#62CDB0'];

export const variantA: Variant = {
  key: 'A',
  name: 'Обзор',
  render(d, { link }) {
    const sym = d.main.symbol;
    const currentMonth = d.today.slice(0, 7);

    const tabs = d.months
      .slice(0, 3)
      .map((m) => {
        const href = link({ month: m === currentMonth ? null : m });
        return `<a class="tab${m === d.month ? ' on' : ''}" href="${href}">${icon('calendar', 13)}${capitalize(monthName(m))}</a>`;
      })
      .join('');

    const rail = (name: IconName, label: string, on = false) =>
      `<button class="rail-btn${on ? ' on' : ''}" type="button" aria-label="${label}" title="${label}">${icon(name, 18)}</button>`;

    const stat = (o: { icon: IconName; tone: string; title: string; action: string; label: string; value: string; ratio: number }) => `
      <article class="stat">
        <header>
          <span class="stat-icon" style="--tone:${o.tone}">${icon(o.icon, 13)}</span>
          <h3>${o.title}</h3>
          <a href="#" class="stat-action">${o.action}</a>
        </header>
        <div class="row"><span>${o.label}</span><b>${o.value}</b></div>
        ${bar(o.ratio, o.tone)}
      </article>`;

    const spentLabel = d.budgetTotal
      ? `${num(d.expense)} из ${money(d.budgetTotal, sym)}`
      : `${num(d.expense)} из ${money(d.prevExpense, sym)} в прошлом месяце`;
    const spentRatio = d.budgetTotal ? d.expense / d.budgetTotal : d.prevExpense ? d.expense / d.prevExpense : 0;

    const stats = [
      stat({ icon: 'wallet', tone: YELLOW, title: 'Расходы', action: 'Бюджет', label: spentLabel, value: `${Math.round(spentRatio * 100)}%`, ratio: spentRatio }),
      stat({
        icon: 'arrowDownLeft',
        tone: VIOLET,
        title: 'Доходы',
        action: 'Операции',
        label: 'Получено',
        value: money(d.income, sym),
        ratio: d.prevIncome ? d.income / d.prevIncome : 0,
      }),
      stat({
        icon: 'clock',
        tone: TEAL,
        title: 'Месяц',
        action: 'Календарь',
        label: 'Прошло дней',
        value: `${d.dayOfMonth} / ${d.daysInMonth}`,
        ratio: d.dayOfMonth / d.daysInMonth,
      }),
    ].join('');

    const topCategories = d.categories.filter((c) => c.spent > 0).slice(0, 4);
    const tiles = topCategories.length
      ? topCategories
          .map(
            (c) => `
        <a class="tile" href="#" style="--c:${c.color};--bg:${mix(c.color, '#ffffff', 0.9)}">
          <span class="tile-icon">${icon(c.icon, 16)}</span>
          <span class="tile-text"><b>${money(c.spent, sym)}</b><small>${esc(c.title)}</small></span>
          ${icon('chevronRight', 16, 'tile-go')}
        </a>`,
          )
          .join('')
      : `<p class="empty">В ${monthName(d.month, 'prep')} трат пока нет.</p>`;

    const events = d.planned.slice(0, 4);
    const eventCards = events.length
      ? events.map((p, i) => eventCard(p, EVENT_TONES[i % EVENT_TONES.length]!, sym)).join('')
      : `<p class="empty">Плановых платежей нет. Добавьте регулярные платежи в ZenMoney, и они появятся здесь.</p>`;

    const hour = new Date().getHours();
    const greeting = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';

    return page({
      title: 'Бюджет: обзор',
      fonts: 'family=Onest:wght@400;500;600',
      css: CSS,
      body: `
<div class="frame">
  <nav class="rail" aria-label="Разделы">
    <span class="logo">${icon('wallet', 18)}</span>
    <span class="rail-title">Меню</span>
    ${rail('home', 'Обзор', true)}
    ${rail('list', 'Операции')}
    ${rail('pie', 'Категории')}
    ${rail('calendar', 'Календарь')}
    ${rail('wallet', 'Счета')}
    <span class="rail-title">Настройки</span>
    ${rail('refresh', 'Синхронизация')}
    ${rail('sliders', 'Настройки')}
    <span class="rail-fill"></span>
    <span class="rail-title">Профиль</span>
    <span class="avatar">${esc((d.source === 'demo' ? 'Д' : 'Я').slice(0, 1))}</span>
  </nav>

  <div class="workspace">
    <nav class="tabs" aria-label="Месяц">${tabs}<span class="tab add" aria-hidden="true">${icon('plus', 14)}</span></nav>
    <div class="columns">
      <main class="panel main">
        <header class="crumbs">
          <span class="muted">Бюджет</span>${icon('chevronRight', 12, 'muted')}${icon('home', 15)}<b>Обзор</b>
          <span class="crumb-actions">
            <button type="button" aria-label="Уведомления">${icon('bell', 17)}</button>
            <button type="button" aria-label="Синхронизировать">${icon('refresh', 17)}</button>
            <button type="button" aria-label="Поиск">${icon('search', 17)}</button>
          </span>
        </header>

        <section class="hello">
          <h1>${greeting} <span aria-hidden="true">👋</span></h1>
          <p>${summary(d)}</p>
        </section>

        <section class="stats">${stats}</section>

        <h2>Больше всего тратите на</h2>
        <section class="tiles">${tiles}</section>

        <h2>${capitalize(monthName(d.month))}</h2>
        <section class="schedule">
          <div class="calendar">${calendar(d)}</div>
          <div class="events">${eventCards}</div>
        </section>
      </main>

      <aside class="panel side">${accountsPanel(d)}</aside>
    </div>
  </div>
</div>`,
    });
  },
};

function bar(ratio: number, tone: string): string {
  const width = Math.max(0, Math.min(1, ratio)) * 100;
  return `<div class="bar" role="img" aria-label="${Math.round(ratio * 100)}%"><i style="width:${width}%;background:${tone}"></i><i class="rest"></i></div>`;
}

function summary(d: Dashboard): string {
  const sym = d.main.symbol;
  const prev = shiftMonth(d.month, -1);
  if (!d.isCurrentMonth) {
    return `В ${monthName(d.month, 'prep')} вы потратили ${money(d.expense, sym)} и получили ${money(d.income, sym)}.`;
  }
  let text = `В ${monthName(d.month, 'prep')} вы потратили ${money(d.expense, sym)}.`;
  if (d.prevExpenseToDate > 0) {
    const change = d.expense / d.prevExpenseToDate - 1;
    const pct = Math.abs(Math.round(change * 100));
    text +=
      pct === 0
        ? ` Примерно столько же, сколько к ${d.dayOfMonth} ${monthName(prev, 'gen')}.`
        : ` Это на ${pct}% ${change < 0 ? 'меньше' : 'больше'}, чем к ${d.dayOfMonth} ${monthName(prev, 'gen')}.`;
  }
  return text;
}

function calendar(d: Dashboard): string {
  const offset = weekday(dateOf(d.month, 1));
  const prevDays = daysInMonth(shiftMonth(d.month, -1));
  const spendDays = d.dailyExpense.filter((v) => v > 0);
  const average = spendDays.length ? spendDays.reduce((s, v) => s + v, 0) / spendDays.length : 0;
  const plannedDays = new Set(d.planned.filter((p) => p.date.startsWith(d.month)).map((p) => Number(p.date.slice(8, 10))));
  const todayDay = d.isCurrentMonth ? d.dayOfMonth : 0;

  const cells: string[] = WEEKDAYS.map((w) => `<span class="wd">${w}</span>`);
  for (let i = 0; i < offset; i++) cells.push(`<span class="day out">${prevDays - offset + 1 + i}</span>`);
  for (let day = 1; day <= d.daysInMonth; day++) {
    const spent = d.dailyExpense[day - 1] ?? 0;
    const income = d.dailyIncome[day - 1] ?? 0;
    const dots = [
      spent > average * 1.8 ? '<i style="background:#EE7B3C"></i>' : '',
      income > 0 ? `<i style="background:${VIOLET}"></i>` : '',
      plannedDays.has(day) ? `<i style="background:${TEAL}"></i>` : '',
    ].join('');
    const classes = ['day', spent > 0 ? 'has' : '', day === todayDay ? 'today' : '', todayDay && day > todayDay ? 'future' : '']
      .filter(Boolean)
      .join(' ');
    const title = [spent > 0 ? `Расходы ${money(spent, d.main.symbol)}` : '', income > 0 ? `Доходы ${money(income, d.main.symbol)}` : '']
      .filter(Boolean)
      .join(', ');
    cells.push(`<span class="${classes}"${title ? ` title="${title}"` : ''}>${day}<span class="dots">${dots}</span></span>`);
  }
  const trailing = (7 - ((offset + d.daysInMonth) % 7)) % 7;
  for (let i = 1; i <= trailing; i++) cells.push(`<span class="day out">${i}</span>`);

  return `<div class="cal-grid">${cells.join('')}</div>
    <div class="legend">
      <span><i style="background:#EE7B3C"></i>Крупные траты</span>
      <span><i style="background:${VIOLET}"></i>Доход</span>
      <span><i style="background:${TEAL}"></i>Платёж</span>
    </div>`;
}

function eventCard(p: Planned, tone: string, sym: string): string {
  const left = p.daysLeft === 0 ? 'сегодня' : p.daysLeft === 1 ? 'завтра' : `${p.daysLeft} ${plural(p.daysLeft, ['день', 'дня', 'дней'])}`;
  return `
    <article class="event">
      <header>
        <i class="ring" style="--tone:${tone}"></i>
        <h4 title="${esc(p.title)}">${esc(p.title)}</h4>
        <span class="chip${p.kind === 'income' ? ' chip-in' : ''}">${p.kind === 'transfer' ? money(p.amount, sym) : money(p.kind === 'income' ? p.amount : -p.amount, sym, { sign: true })}</span>
      </header>
      <div class="event-date"><b>${Number(p.date.slice(8, 10))}</b><span>${monthName(p.date, 'gen')}</span></div>
      <div class="row"><span>Осталось</span><b>${left}</b></div>
      ${bar(1 - Math.min(p.daysLeft, 30) / 30, tone)}
    </article>`;
}

function accountsPanel(d: Dashboard): string {
  const sym = d.main.symbol;
  const counted = d.balance.accounts.filter((a) => a.inBalance);
  const excluded = d.balance.accounts.filter((a) => !a.inBalance);
  const total = d.balance.total;
  const kopecks = `,${String(Math.round(Math.abs(total) * 100) % 100).padStart(2, '0')}`;
  const positive = counted.filter((a) => a.balanceInMain > 0);
  const positiveSum = positive.reduce((s, a) => s + a.balanceInMain, 0);
  const colorOf = (i: number) => ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]!;

  const groups = new Map<string, number>();
  for (const a of counted) {
    const label = a.type === 'checking' || a.type === 'deposit' ? 'Накопления' : accountTypeLabel(a.type);
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  const groupIcon: Record<string, IconName> = { Карта: 'card', Накопления: 'piggy', Наличные: 'banknote' };
  const chips = [...groups]
    .map(([label, count], i) => `<span class="pchip" style="--c:${colorOf(i + 2)}">${icon(groupIcon[label] ?? 'wallet', 13)}${label} <b>${count}</b></span>`)
    .join('');

  const row = (a: Dashboard['balance']['accounts'][number], i: number) => `
    <li>
      <i class="dot" style="background:${colorOf(i)}"></i>
      <span class="acc"><b>${esc(a.title)}</b><small>${accountTypeLabel(a.type)}</small></span>
      <span class="amt"><b${a.balance < 0 ? ' class="neg"' : ''}>${money(a.balance, a.instrument.symbol)}</b>${
        a.instrument.id !== d.main.id ? `<small>≈ ${money(a.balanceInMain, sym)}</small>` : ''
      }</span>
    </li>`;

  return `
    <header class="side-head">
      <span>Счета</span>
      <button type="button" class="pill">${icon('refresh', 13)}Обновить</button>
      <button type="button" class="ghost" aria-label="Фильтр">${icon('filter', 17)}</button>
    </header>
    <div class="total">
      <p class="total-num">${num(Math.trunc(total))}<span>${kopecks}&nbsp;${esc(sym)}</span></p>
      <p class="total-note">на ${counted.length} ${plural(counted.length, ['счёте', 'счетах', 'счетах'])}, которые учитываются в балансе</p>
      <div class="chips">${chips}</div>
    </div>
    <div class="share" role="img" aria-label="Доли счетов">${positive
      .map((a) => `<i style="flex:${a.balanceInMain / positiveSum};background:${colorOf(counted.indexOf(a))}" title="${esc(a.title)}"></i>`)
      .join('')}</div>
    <ul class="accounts">${counted.map(row).join('')}</ul>
    ${
      excluded.length
        ? `<div class="excluded">
            <p>Не учитываются в балансе</p>
            <ul class="accounts">${excluded.map((a, i) => row(a, counted.length + i)).join('')}</ul>
          </div>`
        : ''
    }
    <p class="source">${d.source === 'demo' ? 'Демо-данные. Запустите make sync, чтобы увидеть свои.' : 'Данные из ZenMoney, обновляются при запуске.'}</p>`;
}

const CSS = `
:root {
  --page: #D5D5D0; --shell: #F3F3F1; --panel: #FFFFFF; --ink: #19191C; --muted: #8B8B87; --soft: #B9B9B4;
  --line: #ECECE9; --fill: #F3F3F0; --yellow: ${YELLOW}; --violet: ${VIOLET}; --teal: ${TEAL};
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { min-height: 100vh; padding: 36px; background: var(--page); color: var(--ink); font: 400 14px/1.45 'Onest', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
a { color: inherit; text-decoration: none; }
:focus-visible { outline: 2px solid var(--violet); outline-offset: 2px; }
.muted { color: var(--muted); }

.frame { display: grid; grid-template-columns: 76px 1fr; max-width: 1480px; margin: 0 auto; padding: 14px 14px 14px 0; background: var(--shell); border-radius: 30px; box-shadow: 0 1px 0 rgb(255 255 255 / .7) inset; }

.rail { display: flex; flex-direction: column; align-items: center; gap: 6px; padding-top: 6px; }
.logo { display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: 30px; border-radius: 12px; background: var(--ink); color: #fff; }
.rail-title { margin: 18px 0 6px; font-size: 12px; color: var(--muted); }
.rail-btn { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; color: #3A3A3E; }
.rail-btn:hover { background: rgb(0 0 0 / .04); }
.rail-btn.on { background: var(--panel); box-shadow: 0 1px 2px rgb(0 0 0 / .06); }
.rail-fill { flex: 1; }
.avatar { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #C9C1F6, #F6D9A8); font-weight: 600; }

.workspace { min-width: 0; }
.tabs { display: flex; gap: 6px; height: 34px; padding: 0 12px; align-items: flex-end; }
.tab { display: flex; align-items: center; gap: 7px; height: 30px; padding: 0 14px; border-radius: 10px 10px 0 0; font-size: 13px; color: var(--muted); }
.tab:hover { color: var(--ink); }
.tab.on { background: var(--panel); color: var(--ink); font-weight: 500; }
.tab.add { width: 30px; padding: 0; justify-content: center; }

.columns { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 12px; }
.panel { background: var(--panel); border-radius: 22px; }
.main { padding: 14px 22px 26px; border-top-left-radius: 0; }

.crumbs { display: flex; align-items: center; gap: 8px; height: 50px; padding: 0 14px; border: 1px solid var(--line); border-radius: 16px; font-size: 13px; }
.crumbs b { font-weight: 500; }
.crumb-actions { display: flex; gap: 6px; margin-left: auto; }
.crumb-actions button { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; }
.crumb-actions button:hover { background: var(--fill); }

.hello { padding: 30px 4px 26px; }
.hello h1 { font-size: 26px; font-weight: 500; letter-spacing: -0.01em; }
.hello p { margin-top: 8px; color: #55555A; max-width: 62ch; }

.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.stat { padding: 18px 18px 20px; border: 1px solid var(--line); border-radius: 18px; }
.stat header { display: flex; align-items: center; gap: 10px; margin-bottom: 34px; }
.stat-icon { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; background: var(--tone); color: #fff; }
.stat h3 { font-size: 14px; font-weight: 500; }
.stat-action { margin-left: auto; font-size: 12px; color: var(--soft); }
.stat-action:hover { color: var(--ink); }
.row { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; color: #3A3A3E; }
.row b { font-weight: 500; white-space: nowrap; color: var(--ink); }
.bar { display: flex; gap: 5px; height: 6px; margin-top: 12px; }
.bar i { display: block; border-radius: 6px; min-width: 6px; }
.bar .rest { flex: 1; background: #ECECEA; }

h2 { margin: 30px 4px 12px; font-size: 16px; font-weight: 500; }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.tile { display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: 18px; background: var(--bg); }
.tile-icon { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 12px; background: #fff; color: var(--c); box-shadow: 0 1px 2px rgb(0 0 0 / .05); }
.tile-text { display: grid; min-width: 0; }
.tile-text b { font-size: 16px; font-weight: 500; white-space: nowrap; }
.tile-text small { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile-go { margin-left: auto; flex: none; color: #55555A; }
.empty { color: var(--muted); padding: 8px 4px; }

.schedule { display: grid; grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1fr); gap: 12px; }
.calendar { padding: 18px 16px 16px; border: 1px solid var(--line); border-radius: 18px; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px 4px; justify-items: center; }
.wd { font-size: 12px; font-weight: 500; padding-bottom: 6px; }
.day { position: relative; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; font-size: 13px; font-variant-numeric: tabular-nums; }
.day.has { background: var(--fill); font-weight: 500; }
.day.out, .day.future { color: var(--soft); }
.day.today { background: var(--ink); color: #fff; }
.dots { position: absolute; bottom: 5px; display: flex; gap: 2px; }
.dots i, .legend i { display: block; width: 4px; height: 4px; border-radius: 50%; }
.legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }
.legend span { display: flex; align-items: center; gap: 6px; }
.legend i { width: 6px; height: 6px; }

.events { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-content: start; }
.event { padding: 16px 18px 18px; border: 1px solid var(--line); border-radius: 18px; }
.event header { display: flex; align-items: center; gap: 8px; }
.ring { flex: none; width: 10px; height: 10px; border: 1.5px solid var(--tone); border-radius: 50%; }
.event h4 { min-width: 0; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chip { flex: none; margin-left: auto; padding: 3px 8px; border-radius: 7px; background: var(--fill); font-size: 11px; font-weight: 500; white-space: nowrap; }
.chip-in { background: #F1ECFF; color: #6B4BD8; }
.event-date { display: flex; align-items: baseline; gap: 8px; margin: 18px 0 16px; }
.event-date b { font-size: 24px; font-weight: 500; font-variant-numeric: tabular-nums; }
.event-date span { color: var(--soft); }

.side { display: flex; flex-direction: column; padding: 14px; }
.side-head { display: flex; align-items: center; gap: 8px; height: 50px; padding: 0 8px 0 14px; border: 1px solid var(--line); border-radius: 16px; font-size: 13px; font-weight: 500; }
.side-head span { margin-right: auto; }
.pill { display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 14px; border-radius: 999px; background: var(--ink); color: #fff; font-size: 12px; }
.ghost { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; }
.total { padding: 48px 8px 22px; text-align: center; }
.total-num { font-size: 38px; font-weight: 500; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.total-num span { color: var(--soft); }
.total-note { max-width: 26ch; margin: 6px auto 0; font-size: 12px; color: var(--muted); }
.chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 20px; }
.pchip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 999px; font-size: 12px; color: #3A3A3E; }
.pchip svg { color: var(--c); }
.pchip b { font-weight: 500; color: var(--muted); }
.share { display: flex; gap: 3px; height: 8px; margin: 8px 8px 16px; }
.share i { border-radius: 4px; }
.accounts { list-style: none; display: grid; gap: 2px; }
.accounts li { display: flex; align-items: center; gap: 10px; padding: 10px 8px; border-radius: 12px; }
.accounts li:hover { background: var(--fill); }
.dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
.acc { display: grid; min-width: 0; margin-right: auto; }
.acc b { font-weight: 500; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.acc small, .amt small { font-size: 11px; color: var(--muted); }
.amt { display: grid; justify-items: end; font-variant-numeric: tabular-nums; }
.amt b { font-weight: 500; font-size: 13px; white-space: nowrap; }
.amt .neg { color: #C2453B; }
.excluded { margin-top: 14px; padding: 12px 6px 6px; border: 1px solid var(--line); border-radius: 16px; }
.excluded p { padding: 0 8px 4px; font-size: 12px; color: var(--muted); }
.source { margin-top: auto; padding: 18px 8px 4px; font-size: 11px; color: var(--soft); }

@media (max-width: 1240px) {
  .columns { grid-template-columns: minmax(0, 1fr); }
  .side { border-radius: 22px; }
  .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 820px) {
  body { padding: 12px; }
  .frame { grid-template-columns: minmax(0, 1fr); padding: 10px; }
  .rail { display: none; }
  .stats, .schedule, .events { grid-template-columns: minmax(0, 1fr); }
  .hello h1 { font-size: 22px; }
  .main { padding: 12px 14px 22px; }
}
`;

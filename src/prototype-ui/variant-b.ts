// Variant B, "Лимиты": budget categories as a pipeline, after the second reference. A floating window over a
// painted landscape, grouped sidebar, filter chips, and lanes by budget health (over, close, fine, no limit)
// with segmented counters and horizontally scrolling category cards.
// PROTOTYPE: throwaway code, see server.ts.

import type { CategoryStat, Dashboard } from './data.ts';
import {
  ACCOUNT_COLORS,
  capitalize,
  daysWord,
  esc,
  icon,
  money,
  monthName,
  num,
  page,
  relativeDay,
  shiftMonth,
  type IconName,
  type Variant,
} from './shared.ts';

type Status = 'over' | 'near' | 'ok' | 'free';

const LANES: Array<{ status: Status; label: string; color: string; bg: string; fill: number }> = [
  { status: 'over', label: 'Перерасход', color: '#E5484D', bg: '#FDE7E5', fill: 1 },
  { status: 'near', label: 'Почти лимит', color: '#EE7F2D', bg: '#FDEBD6', fill: 0.75 },
  { status: 'ok', label: 'В пределах', color: '#2F9E62', bg: '#DFF3E4', fill: 0.4 },
  { status: 'free', label: 'Без лимита', color: '#8D8D93', bg: '#EFEFF0', fill: 0 },
];

const limitOf = (c: CategoryStat) => c.budget ?? (c.avg >= 1 ? c.avg : null);

function statusOf(c: CategoryStat): Status {
  const limit = limitOf(c);
  if (limit === null) return 'free';
  const ratio = c.spent / limit;
  return ratio > 1 ? 'over' : ratio >= 0.75 ? 'near' : 'ok';
}

export const variantB: Variant = {
  key: 'B',
  name: 'Лимиты',
  render(d, { link }) {
    const sym = d.main.symbol;
    const currentMonth = d.today.slice(0, 7);
    const prev = shiftMonth(d.month, -1);
    const next = shiftMonth(d.month, 1);
    const year = d.month.slice(0, 4);
    const daysLeft = d.isCurrentMonth ? d.daysInMonth - d.dayOfMonth + 1 : 0;

    const nav = (name: IconName, label: string, on = false) =>
      `<a href="#" class="nav-item${on ? ' on' : ''}">${icon(name, 16)}${label}</a>`;

    const favourites = d.categories
      .filter((c) => c.spent > 0)
      .slice(0, 3)
      .map((c) => {
        const lane = LANES.find((l) => l.status === statusOf(c))!;
        return `<a href="#" class="nav-item">${glyph(lane.color, lane.fill)}<span class="clip">${esc(c.title)}</span></a>`;
      })
      .join('');

    const counted = d.balance.accounts.filter((a) => a.inBalance);
    const accountLinks = counted
      .map(
        (a, i) =>
          `<a href="#" class="nav-item sub"><span class="acc-badge" style="background:${ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]}">${esc(a.title.slice(0, 1))}</span><span class="clip">${esc(a.title)}</span></a>`,
      )
      .join('');
    const stack = counted
      .slice(0, 5)
      .map((a, i) => `<span class="stack-item" style="background:${ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]}" title="${esc(a.title)}">${esc(a.title.slice(0, 1))}</span>`)
      .join('');

    const lanes = LANES.map((lane) => {
      const items = d.categories.filter((c) => statusOf(c) === lane.status);
      if (items.length === 0) return '';
      const spent = items.reduce((s, c) => s + c.spent, 0);
      const limit = items.reduce((s, c) => s + (limitOf(c) ?? 0), 0);
      const before = items.reduce((s, c) => s + (d.isCurrentMonth ? c.prevToDate : c.prevSpent), 0);
      const change = before > 0 ? spent / before - 1 : null;
      return `
        <section class="lane">
          <header class="lane-head">
            <span class="pill" style="background:${lane.bg}">${glyph(lane.color, lane.fill)}${lane.label}</span>
            <span class="lane-n">${items.length}</span>
            <button type="button" class="icon-btn" aria-label="Добавить лимит">${icon('plus', 18)}</button>
          </header>
          <div class="counter">
            <b>${num(spent)}</b>${limit > 0 ? `<span class="of">/ ${num(limit)} ${esc(sym)}</span>` : `<span class="of">${esc(sym)}</span>`}
            ${
              change === null
                ? ''
                : `<span class="trend">${icon(change >= 0 ? 'trendingUp' : 'trendingDown', 14)}${change >= 0 ? '+' : '−'}${Math.abs(Math.round(change * 100))}%</span>`
            }
          </div>
          ${ticks(limit > 0 ? spent / limit : 0, lane.color)}
          <div class="cards">${items.map((c) => card(c, d, daysLeft)).join('')}</div>
        </section>`;
    }).join('');

    return page({
      title: 'Бюджет: лимиты',
      fonts: 'family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500',
      css: CSS,
      body: `
${scenery()}
<div class="window">
  <aside class="sidebar">
    <div class="brand"><span class="logo">${icon('wallet', 15)}</span><b>Бюджет</b><button type="button" class="icon-btn" aria-label="Свернуть">${icon('panel', 16)}</button></div>
    <nav class="nav">
      ${nav('home', 'Обзор')}
      ${nav('list', 'Операции')}
      ${nav('target', 'Лимиты', true)}
      ${nav('calendar', 'Платежи')}
    </nav>
    <div class="group">
      <p class="group-head">Избранное ${icon('chevronDown', 14)}</p>
      ${favourites || '<p class="group-empty">Пока пусто</p>'}
    </div>
    <div class="group">
      <p class="group-head">Счета ${icon('chevronDown', 14)}</p>
      <a href="#" class="nav-item">${icon('wallet', 16)}Все счета ${icon('chevronDown', 13, 'push')}</a>
      ${accountLinks}
    </div>
    <div class="me">
      <span class="me-avatar"></span>
      <span><b>Мои финансы</b><small>${d.source === 'demo' ? 'демо-данные' : 'данные из ZenMoney'}</small></span>
    </div>
  </aside>

  <main class="content">
    <header class="topbar">
      <span class="crumb">${icon('target', 15)}Бюджет${icon('chevronRight', 13, 'dim')}<b>${capitalize(monthName(d.month))} ${year}</b></span>
      <span class="month-nav">
        <a href="${link({ month: prev })}" aria-label="Предыдущий месяц">${icon('chevronLeft', 15)}</a>
        ${
          d.month < currentMonth
            ? `<a href="${link({ month: next === currentMonth ? null : next })}" aria-label="Следующий месяц">${icon('chevronRight', 15)}</a>`
            : `<span class="off">${icon('chevronRight', 15)}</span>`
        }
      </span>
      <label class="search">${icon('search', 15)}<input type="search" placeholder="Поиск…" aria-label="Поиск"></label>
    </header>

    <div class="body">
      <section class="intro">
        <h1>Лимиты на ${monthName(d.month)}</h1>
        <p>${
          d.isCurrentMonth
            ? 'Сколько потрачено по каждой категории и сколько ещё можно потратить до конца месяца.'
            : `Как прошёл ${monthName(d.month)}: где уложились в лимит, а где нет.`
        }</p>
        <div class="meta">
          <span class="meta-chip">${icon('wallet', 15)}Счета</span>
          <span class="stack">${stack}</span>
          ${d.isCurrentMonth ? `<span class="meta-chip">${icon('hourglass', 15)}До конца месяца</span><span class="meta-value">${daysWord(daysLeft)}</span>` : ''}
        </div>
        <div class="filter">
          <span class="spark">${icon('sparkles', 15)}</span>
          <span class="token"><span>${icon('layers', 14)}Лимит</span><code>берём из</code><span>бюджета или среднего</span><button type="button" aria-label="Убрать фильтр">${icon('x', 13)}</button></span>
          <span class="filter-field">
            <input type="text" aria-label="Добавить фильтр" aria-haspopup="menu" aria-expanded="false" placeholder="">
            <span class="menu" role="menu" hidden>
              <span class="menu-search">${icon('search', 14)}Поиск…</span>
              <span class="menu-item" role="menuitem">${icon('tag', 15)}Категория</span>
              <span class="menu-item on" role="menuitem">${icon('wallet', 15)}Счёт</span>
              <span class="menu-item" role="menuitem">${icon('receipt', 15)}Получатель</span>
              <span class="menu-sep"></span>
              <span class="menu-item" role="menuitem">${icon('repeat', 15)}Регулярные</span>
              <span class="menu-item" role="menuitem"><i class="menu-dot" style="background:#3E7BFA"></i>Крупные траты</span>
              <span class="menu-item" role="menuitem"><i class="menu-dot" style="background:#E5484D"></i>Только перерасход</span>
            </span>
          </span>
        </div>
      </section>
      ${lanes || `<p class="empty">В ${monthName(d.month, 'prep')} нет ни трат, ни лимитов. Задайте бюджеты в ZenMoney, и здесь появятся категории.</p>`}
    </div>
  </main>
</div>`,
      script: SCRIPT,
    });
  },
};

function card(c: CategoryStat, d: Dashboard, daysLeft: number): string {
  const sym = d.main.symbol;
  const limit = limitOf(c);
  const left = limit === null ? null : limit - c.spent;
  const perDay = left !== null && left > 0 && daysLeft > 0 ? left / daysLeft : null;
  const row = (name: IconName, label: string, value: string, className = '') =>
    `<div><dt>${icon(name, 14)}${label}</dt><dd class="${className}">${value}</dd></div>`;
  return `
    <article class="card" tabindex="0">
      <span class="cat" style="background:${c.color}">${icon(c.icon, 15)}</span>
      <h3>${esc(c.title)}</h3>
      <code>${limit === null ? `${num(c.spent)} ${esc(sym)}` : `${num(c.spent)} / ${num(limit)} ${esc(sym)}`}</code>
      <dl class="props">
        ${row('flag', left !== null && left < 0 ? 'Сверх лимита' : 'Осталось', left === null ? '—' : money(Math.abs(left), sym), left !== null && left < 0 ? 'bad' : '')}
        ${row('diamond', 'Лимит', c.budget !== null ? 'Бюджет ZenMoney' : limit !== null ? 'Среднее за 3 мес.' : 'Не задан')}
        ${
          d.isCurrentMonth
            ? row('calendar', 'В день', perDay === null ? '—' : `до ${money(perDay, sym)}`)
            : row('calendar', 'В среднем', `${money(c.spent / d.daysInMonth, sym)} в день`)
        }
      </dl>
      <footer>
        <span>${icon('receipt', 14)}${c.count}</span>
        <span>${icon('clock', 14)}${c.lastDate ? relativeDay(c.lastDate, d.today) : 'нет операций'}</span>
      </footer>
    </article>`;
}

/** Ring with a filled wedge, like the status icons in the reference. */
function glyph(color: string, fraction: number): string {
  let wedge = '';
  if (fraction >= 1) {
    wedge = `<circle cx="7" cy="7" r="4" fill="${color}"/>`;
  } else if (fraction > 0) {
    const angle = fraction * 2 * Math.PI;
    const x = 7 + 4 * Math.sin(angle);
    const y = 7 - 4 * Math.cos(angle);
    wedge = `<path d="M7 7V3A4 4 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}Z" fill="${color}"/>`;
    if (fraction > 0.5) wedge = `<path d="M7 7V3A4 4 0 1 1 ${x.toFixed(2)} ${y.toFixed(2)}Z" fill="${color}"/>`;
  }
  return `<svg class="glyph" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="none" stroke="${color}" stroke-width="1.6"${fraction === 0 ? ' stroke-dasharray="2 2"' : ''}/>${wedge}</svg>`;
}

function ticks(ratio: number, color: string): string {
  const count = 28;
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * count);
  const items = Array.from({ length: count }, (_, i) => `<i${i < filled ? ` style="background:${color}"` : ''}></i>`).join('');
  return `<div class="ticks" role="img" aria-label="${Math.round(ratio * 100)}% лимита">${items}</div>`;
}

/** Soft painted landscape behind the window, generated once per render. */
function scenery(): string {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const flowers = Array.from({ length: 260 }, () => {
    const x = random() * 1600;
    const y = 800 + random() * 200;
    const color = ['#F5A9C4', '#F7D25E', '#FFFFFF', '#F28DB0', '#FBE7A1'][Math.floor(random() * 5)];
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1.5 + random() * 3).toFixed(1)}" fill="${color}"/>`;
  }).join('');
  const blossom = (cx: number, cy: number, spread: number) =>
    Array.from({ length: 46 }, () => {
      const x = cx + (random() - 0.5) * spread * 2;
      const y = cy + (random() - 0.5) * spread * 1.1;
      const color = ['#F4B8CC', '#F9D3DF', '#EC9DB8', '#FBE4EB'][Math.floor(random() * 4)];
      return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(10 + random() * 22).toFixed(0)}" fill="${color}"/>`;
    }).join('');
  return `
<svg class="scenery" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6FA6DF"/><stop offset=".42" stop-color="#B8D5F0"/><stop offset=".62" stop-color="#EEF2EC"/>
    </linearGradient>
    <filter id="blur-cloud"><feGaussianBlur stdDeviation="16"/></filter>
    <filter id="blur-soft"><feGaussianBlur stdDeviation="1.4"/></filter>
  </defs>
  <rect width="1600" height="1000" fill="url(#sky)"/>
  <g fill="#fff" filter="url(#blur-cloud)" opacity=".9">
    <ellipse cx="260" cy="150" rx="170" ry="48"/><ellipse cx="380" cy="120" rx="110" ry="56"/>
    <ellipse cx="1180" cy="90" rx="220" ry="54"/><ellipse cx="1320" cy="130" rx="150" ry="44"/>
    <ellipse cx="820" cy="220" rx="140" ry="30"/>
  </g>
  <path d="M0 560 L170 440 L290 505 L450 372 L610 482 L760 404 L920 520 L1090 386 L1250 470 L1420 398 L1600 478 V1000 H0Z" fill="#A3B8CE"/>
  <path d="M450 372 L492 408 L470 404 L450 420 L430 402 L412 404Z M1090 386 L1130 420 L1108 416 L1090 430 L1072 414 L1052 418Z M1420 398 L1452 424 L1420 420 L1398 424Z" fill="#F4F7FA" opacity=".9"/>
  <path d="M0 640 C200 575 380 610 560 650 S900 590 1100 628 S1450 606 1600 640 V1000 H0Z" fill="#8EBE70"/>
  <path d="M0 728 C250 668 500 706 760 746 S1250 694 1600 726 V1000 H0Z" fill="#A6CF7E"/>
  <path d="M0 822 C400 784 900 806 1600 790 V1000 H0Z" fill="#BEDD8F"/>
  <g filter="url(#blur-soft)">
    <path d="M150 840 C156 760 140 700 170 640 M170 700 C200 680 220 660 236 630" stroke="#6B4F3A" stroke-width="10" fill="none" stroke-linecap="round"/>
    ${blossom(175, 600, 120)}
    <path d="M1480 860 C1476 790 1490 730 1470 670" stroke="#6B4F3A" stroke-width="9" fill="none" stroke-linecap="round"/>
    ${blossom(1480, 640, 100)}
    ${flowers}
  </g>
</svg>`;
}

const SCRIPT = `
  (function () {
    var field = document.querySelector('.filter-field');
    var input = field.querySelector('input');
    var menu = field.querySelector('.menu');
    function toggle(open) { menu.hidden = !open; input.setAttribute('aria-expanded', String(open)); }
    input.addEventListener('focus', function () { toggle(true); });
    document.addEventListener('click', function (event) { if (!field.contains(event.target)) toggle(false); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') { toggle(false); input.blur(); } });
  })();
`;

const CSS = `
:root { --ink: #1B1B1F; --muted: #74747C; --dim: #A2A2A8; --line: #EAEAEC; --inset: #F5F5F4; --side: rgb(244 244 242 / .93); }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { min-height: 100vh; overflow-x: hidden; background: #BCD6EE; color: var(--ink); font: 400 14px/1.45 'Inter Tight', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
button, input { font: inherit; color: inherit; background: none; border: 0; }
button { cursor: pointer; }
a { color: inherit; text-decoration: none; }
code { font-family: 'JetBrains Mono', ui-monospace, monospace; }
:focus-visible { outline: 2px solid #3E7BFA; outline-offset: 2px; }
.scenery { position: fixed; inset: 0; width: 100%; height: 100%; z-index: -1; }

.window { display: grid; grid-template-columns: 252px minmax(0, 1fr); min-height: calc(100vh - 36px); margin: 36px 0 0 44px; background: var(--side); border: 1px solid rgb(255 255 255 / .7); border-right: 0; border-bottom: 0; border-radius: 26px 0 0 0; backdrop-filter: blur(24px) saturate(1.2); box-shadow: -24px 30px 80px -30px rgb(22 44 70 / .5); }

.sidebar { display: flex; flex-direction: column; gap: 22px; padding: 18px 14px 18px; position: sticky; top: 0; height: calc(100vh - 36px); }
.brand { display: flex; align-items: center; gap: 10px; padding: 0 4px 0 6px; font-size: 17px; }
.brand b { font-weight: 600; margin-right: auto; }
.logo { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: var(--ink); color: #fff; }
.icon-btn { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; color: var(--muted); }
.icon-btn:hover { background: rgb(0 0 0 / .05); color: var(--ink); }
.nav, .group { display: grid; gap: 2px; }
.nav-item { display: flex; align-items: center; gap: 10px; height: 34px; padding: 0 10px; border-radius: 10px; font-size: 14px; color: #2C2C31; }
.nav-item:hover { background: rgb(0 0 0 / .04); }
.nav-item.on { background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / .06), 0 0 0 1px rgb(0 0 0 / .03); font-weight: 500; }
.nav-item.sub { padding-left: 18px; }
.nav-item .i { flex: none; color: #4A4A50; }
.nav-item .push { margin-left: auto; }
.clip { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.group-head { display: flex; align-items: center; gap: 4px; padding: 0 10px 4px; font-size: 13px; font-weight: 500; color: var(--muted); }
.group-empty { padding: 4px 10px; font-size: 13px; color: var(--dim); }
.acc-badge { display: grid; place-items: center; flex: none; width: 20px; height: 20px; border-radius: 6px; color: #fff; font-size: 11px; font-weight: 600; }
.me { display: flex; align-items: center; gap: 10px; margin-top: auto; padding: 8px 6px; }
.me-avatar { width: 34px; height: 34px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #FBD7A5, #E98FB0 55%, #8C6CEF); }
.me b { display: block; font-size: 14px; font-weight: 500; }
.me small { font-size: 12px; color: var(--muted); }

.content { min-width: 0; margin-top: 8px; background: #fff; border-radius: 18px 0 0 0; box-shadow: 0 0 0 1px rgb(0 0 0 / .04); }
.topbar { display: flex; align-items: center; gap: 14px; height: 54px; padding: 0 24px; border-bottom: 1px solid var(--line); font-size: 14px; }
.crumb { display: flex; align-items: center; gap: 8px; color: var(--muted); }
.crumb b { color: var(--ink); font-weight: 500; }
.crumb .dim { color: var(--dim); }
.month-nav { display: flex; gap: 2px; }
.month-nav a, .month-nav .off { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 7px; color: var(--muted); }
.month-nav a:hover { background: var(--inset); color: var(--ink); }
.month-nav .off { opacity: .35; }
.search { display: flex; align-items: center; gap: 8px; width: 260px; height: 34px; padding: 0 12px; border-left: 1px solid var(--line); color: var(--dim); }
.search input { width: 100%; outline: none; color: var(--ink); }

.body { padding: 26px 0 120px 28px; }
.intro { padding-right: 28px; }
.intro h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.015em; }
.intro p { margin-top: 4px; color: #4F4F56; font-size: 15px; }
.meta { display: flex; align-items: center; gap: 10px; margin-top: 18px; }
.meta-chip { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px; border-radius: 10px; background: var(--inset); font-size: 14px; }
.meta-value { font-size: 14px; color: var(--muted); }
.stack { display: flex; margin-right: 8px; }
.stack-item { display: grid; place-items: center; width: 28px; height: 28px; margin-left: -6px; border: 2px solid #fff; border-radius: 50%; color: #fff; font-size: 12px; font-weight: 600; }
.stack-item:first-child { margin-left: 0; }

.filter { display: flex; align-items: center; gap: 10px; margin-top: 16px; padding-bottom: 6px; }
.spark { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: linear-gradient(135deg, #FFE1EC, #E5E1FF); color: #D6457A; }
.token { display: inline-flex; align-items: center; height: 32px; border: 1px solid var(--line); border-radius: 10px; font-size: 14px; overflow: hidden; }
.token > * { display: flex; align-items: center; gap: 6px; height: 100%; padding: 0 10px; border-right: 1px solid var(--line); }
.token code { font-size: 12.5px; color: var(--muted); background: var(--inset); }
.token button { padding: 0 9px; border-right: 0; color: var(--muted); }
.filter-field { position: relative; flex: 1; max-width: 260px; height: 32px; border-left: 1.5px solid var(--ink); }
.filter-field input { width: 100%; height: 100%; padding: 0 10px; outline: none; }
.menu { position: absolute; top: 38px; left: -6px; z-index: 5; display: grid; width: 230px; padding: 6px; background: #fff; border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 18px 40px -12px rgb(20 20 30 / .25); }
.menu[hidden] { display: none; }
.menu-search { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 8px; color: var(--dim); border-bottom: 1px solid var(--line); margin-bottom: 4px; }
.menu-item { display: flex; align-items: center; gap: 10px; height: 32px; padding: 0 8px; border-radius: 8px; font-size: 14px; cursor: pointer; }
.menu-item:hover, .menu-item.on { background: var(--inset); }
.menu-sep { height: 1px; margin: 4px 0; background: var(--line); }
.menu-dot { width: 14px; height: 14px; border-radius: 50%; }

.lane { margin-top: 34px; }
.lane-head { display: flex; align-items: center; gap: 10px; padding-right: 28px; }
.pill { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px 0 12px; border-radius: 999px; font-size: 15px; font-weight: 500; }
.lane-n { font-size: 13px; color: var(--dim); }
.lane-head .icon-btn { margin-left: auto; color: var(--ink); }
.counter { display: flex; align-items: baseline; gap: 8px; margin-top: 16px; font-variant-numeric: tabular-nums; }
.counter b { font-size: 22px; font-weight: 500; letter-spacing: -0.01em; }
.counter .of { font-size: 15px; color: var(--muted); }
.trend { display: inline-flex; align-items: center; gap: 4px; margin-left: 4px; font-size: 13px; color: #3C3C42; }
.ticks { display: flex; gap: 2.5px; margin-top: 8px; }
.ticks i { width: 4px; height: 13px; border-radius: 1.5px; background: #E6E6E8; }

.cards { display: flex; gap: 14px; margin-top: 18px; padding: 2px 28px 6px 2px; overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: thin; }
.card { flex: none; width: 300px; padding: 16px 16px 14px; border: 1px solid var(--line); border-radius: 16px; background: #fff; scroll-snap-align: start; }
.card:hover { border-color: #D8D8DC; }
.cat { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; color: #fff; }
.card h3 { margin-top: 12px; font-size: 17px; font-weight: 500; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card code { display: block; margin-top: 2px; font-size: 12.5px; color: var(--muted); }
.props { display: grid; gap: 10px; margin-top: 14px; padding: 12px; border-radius: 12px; background: var(--inset); font-size: 13.5px; }
.props div { display: grid; grid-template-columns: 116px 1fr; align-items: center; }
.props dt { display: flex; align-items: center; gap: 8px; color: var(--muted); }
.props dd { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.props dd.bad { color: #D93D42; }
.card footer { display: flex; gap: 16px; margin-top: 12px; padding: 0 2px; font-size: 13px; color: var(--muted); }
.card footer span { display: flex; align-items: center; gap: 6px; }
.empty { margin-top: 40px; color: var(--muted); max-width: 60ch; }

@media (max-width: 900px) {
  .window { grid-template-columns: minmax(0, 1fr); margin: 16px 0 0 12px; }
  .sidebar { display: none; }
  .search { display: none; }
  .filter { flex-wrap: wrap; }
}
@media (prefers-reduced-motion: no-preference) { .cards { scroll-behavior: smooth; } }
`;

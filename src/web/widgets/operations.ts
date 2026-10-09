// Operations as a list: rows grouped by day, and spending by category that filters the list.

import type { OperationKind } from '../../operations.ts';
import type { DateString } from '../../zenmoney/types.ts';
import { dayHeading, money, num } from '../format.ts';
import { html, type Content, type Html } from '../html.ts';
import { icon, type IconName } from '../icons.ts';
import { toneColor, type Tone } from '../tones.ts';
import { badge } from './basics.ts';

/**
 * One operation: who, what for and from which account, and the amount in the main currency.
 * Expenses get a minus, incomes a plus and green, transfers stay quiet; `unsigned` drops the sign in a list of
 * expenses only.
 * With `href` the row links to its marking; with `panel` it is open: the panel shows under the row, `actions` next
 * to it, and the row's link closes it. `mark` is a dot before the amount telling where it counts, named on hover.
 */
export function operationRow(options: {
  /** Keeps the row in place on the screen when the page comes back, as entries do. */
  id?: string;
  title: string;
  details: string;
  icon: IconName;
  color: string;
  kind: OperationKind;
  amount: number;
  symbol: string;
  /** The amount in the currency of the purchase, when it differs from the main one. */
  original?: { amount: number; symbol: string };
  comment?: string;
  /** The bank has not settled it yet. */
  hold?: boolean;
  /** Quieter, for an operation that counts nowhere, such as cash only taken out. */
  muted?: boolean;
  href?: string;
  /** What the open operation shows under its row, such as choices to make. */
  panel?: Content;
  /** Buttons next to the open row, each posting a form to its URL. */
  actions?: Array<{ label: string; action: string }>;
  /** Without a tone the dot is an empty ring, for an amount that counts nowhere in particular. */
  mark?: { label: string; tone?: Tone };
  unsigned?: boolean;
}): Html {
  const { kind, amount, symbol } = options;
  const open = options.panel !== undefined;
  const value = kind === 'transfer' || options.unsigned ? money(amount, symbol) : money(kind === 'income' ? amount : -amount, symbol, { sign: true });
  const inner = html`
      <span class="operation-icon" style="--color:${options.color}">${icon(options.icon, 16)}</span>
      <span class="operation-text">
        <b>${options.title}</b>
        <small>${options.details}</small>
        ${options.comment ? html`<small class="operation-comment">${icon('message', 12)}${options.comment}</small>` : null}
      </span>
      ${options.hold ? badge({ text: 'в обработке', tone: 'yellow' }) : null}
      ${options.mark
        ? html`<span class="operation-mark${options.mark.tone ? '' : ' ring'}"${
            options.mark.tone ? html` style="--tone:${toneColor(options.mark.tone)}"` : null
          } role="img" title="${options.mark.label}" aria-label="${options.mark.label}"></span>`
        : null}
      <span class="operation-amount ${kind}">
        <b>${value}</b>
        ${options.original ? html`<small>${money(options.original.amount, options.original.symbol, { cents: true })}</small>` : null}
      </span>`;
  const actions = open ? (options.actions ?? []) : [];
  return html`
    <li class="operation-item${open ? ' open' : ''}${options.muted ? ' muted' : ''}"${options.id ? html` id="${options.id}"` : null}>
      ${options.href
        ? html`<a class="operation" href="${options.href}" title="${open ? 'Закрыть' : 'Разметить'}"${open ? html` aria-expanded="true"` : null}>${inner}</a>`
        : html`<div class="operation">${inner}</div>`}
      ${actions.length > 0
        ? html`<span class="operation-actions">${actions.map(
            (a) => html`<form method="post" action="${a.action}"><button class="operation-action" type="submit">${a.label}</button></form>`,
          )}</span>`
        : null}
      ${open ? html`<div class="operation-panel">${options.panel}</div>` : null}
    </li>`;
}

/** Operations of one day under a heading with the day's balance of incomes and expenses. */
export function dayGroup(options: { date: DateString; today: DateString; net?: { amount: number; symbol: string }; rows: Html[] }): Html {
  const { title, subtitle } = dayHeading(options.date, options.today);
  return html`
    <section class="day">
      <header class="day-head">
        <h3>${title}</h3><span>${subtitle}</span>
        ${options.net && Math.round(options.net.amount) !== 0 ? html`<b>${money(options.net.amount, options.net.symbol, { sign: true })}</b>` : null}
      </header>
      <ul class="operations">${options.rows}</ul>
    </section>`;
}

/** Spending by category with each one's share; a category links to its operations, the chosen one is highlighted. */
export function categoryList(options: {
  label: string;
  symbol: string;
  items: Array<{ title: string; icon: IconName; color: string; amount: number; share: number; href: string; active?: boolean }>;
}): Html {
  return html`<ul class="categories" aria-label="${options.label}">${options.items.map(
    (item) => html`
      <li>
        <a class="category" href="${item.href}" style="--color:${item.color}"${item.active ? html` aria-current="true"` : null}>
          <span class="category-icon">${icon(item.icon, 15)}</span>
          <span class="category-text">
            <span class="category-line"><b>${item.title}</b><span>${money(item.amount, options.symbol)}</span></span>
            <span class="category-bar"><i style="width:${(Math.min(1, Math.max(0, item.share)) * 100).toFixed(1)}%"></i></span>
          </span>
        </a>
      </li>`,
  )}</ul>`;
}

/**
 * Named amounts one under another, each led by a dot or an icon tile, with an optional share bar, a quiet note, and a
 * link to more; the item open there is highlighted.
 */
export function amountList(options: {
  label: string;
  /** Shown after each amount when given. */
  symbol?: string;
  items: Array<{ label: string; amount: number; color?: string; icon?: IconName; tone?: Tone; share?: number; note?: string; href?: string; active?: boolean }>;
}): Html {
  return html`<ul class="amounts" aria-label="${options.label}">${options.items.map((item) => {
    const lead = item.icon
      ? html`<span class="amount-icon" style="--tone:${toneColor(item.tone ?? 'gray')}">${icon(item.icon, 14)}</span>`
      : item.color
        ? html`<i class="amount-dot" style="background:${item.color}"></i>`
        : null;
    const inner = html`${lead}<span class="amount-label">${item.label}</span>${
      item.share === undefined
        ? null
        : html`<span class="amount-bar"><i style="width:${(Math.min(1, Math.max(0, item.share)) * 100).toFixed(1)}%;background:${item.color ?? 'var(--violet)'}"></i></span>`
    }${item.note ? html`<small class="amount-note">${item.note}</small>` : null}<b class="amount-value">${num(item.amount)}${
      options.symbol ? html` <span>${options.symbol}</span>` : null
    }</b>${item.href ? html`<span class="amount-go">${icon('chevronRight', 14)}</span>` : null}`;
    return html`<li>${
      item.href
        ? html`<a class="amount" href="${item.href}"${item.active ? html` aria-current="true"` : null}>${inner}</a>`
        : html`<span class="amount">${inner}</span>`
    }</li>`;
  })}</ul>`;
}

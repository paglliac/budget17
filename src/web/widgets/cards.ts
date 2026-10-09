// Cards: a figure with progress, a category, an upcoming payment, a big figure, and a titled block of a page.

import { daysBetween } from '../../dates.ts';
import type { OperationKind } from '../../operations.ts';
import type { DateString } from '../../zenmoney/types.ts';
import { daysLeft, money, monthName, num } from '../format.ts';
import { html, type Content, type Html } from '../html.ts';
import { icon, type IconName } from '../icons.ts';
import { toneColor, type Tone } from '../tones.ts';
import { badge, iconBadge, progressBar } from './basics.ts';

/** One figure of the month with how far along it is. */
export function statCard(options: {
  icon: IconName;
  tone: Tone;
  title: string;
  label: string;
  value: string;
  progress: number;
  action?: { label: string; href: string };
}): Html {
  return html`
    <article class="stat">
      <header class="stat-head">
        ${iconBadge({ icon: options.icon, tone: options.tone })}
        <h3>${options.title}</h3>
        ${options.action ? html`<a class="stat-action" href="${options.action.href}">${options.action.label}</a>` : null}
      </header>
      <div class="row"><span>${options.label}</span><b>${options.value}</b></div>
      ${progressBar({ value: options.progress, tone: options.tone, label: options.title })}
    </article>`;
}

/** Spending in a category, tinted with the category colour. With `href` it links to the category. */
export function categoryTile(options: { icon: IconName; color: string; title: string; amount: number; symbol: string; href?: string }): Html {
  const inner = html`
    <span class="tile-icon">${icon(options.icon, 16)}</span>
    <span class="tile-text"><b>${money(options.amount, options.symbol)}</b><small>${options.title}</small></span>`;
  return options.href
    ? html`<a class="tile" href="${options.href}" style="--color:${options.color}">${inner}<span class="tile-go">${icon('chevronRight', 16)}</span></a>`
    : html`<div class="tile" style="--color:${options.color}">${inner}</div>`;
}

/** A planned operation and how soon it comes; the bar fills up over the last 30 days. */
export function paymentCard(options: {
  title: string;
  date: DateString;
  today: DateString;
  kind: OperationKind;
  amount: number;
  symbol: string;
  tone: Tone;
}): Html {
  const { kind, amount, symbol } = options;
  const days = Math.max(0, daysBetween(options.today, options.date));
  const value =
    kind === 'transfer' ? money(amount, symbol) : money(kind === 'income' ? amount : -amount, symbol, { sign: true });
  return html`
    <article class="payment" style="--tone:${toneColor(options.tone)}">
      <header class="payment-head">
        <span class="payment-ring"></span>
        <h3 title="${options.title}">${options.title}</h3>
        ${badge({ text: value, tone: kind === 'income' ? 'violet' : undefined })}
      </header>
      <p class="payment-date"><b>${Number(options.date.slice(8, 10))}</b><span>${monthName(options.date, 'genitive')}</span></p>
      <div class="row"><span>Осталось</span><b>${daysLeft(days)}</b></div>
      ${progressBar({ value: 1 - Math.min(days, 30) / 30, tone: options.tone, label: `Осталось ${daysLeft(days)}` })}
    </article>`;
}

/** A big figure on a card: what it is, the amount with a quieter currency, a note and an optional bar. */
export function figureCard(options: { label: string; amount: number; symbol: string; note?: string; progress?: { value: number; tone: Tone } }): Html {
  return html`
    <article class="figure">
      <p class="figure-label">${options.label}</p>
      <p class="figure-amount">${num(options.amount)} <span>${options.symbol}</span></p>
      ${options.note ? html`<p class="figure-note">${options.note}</p>` : null}
      ${options.progress ? progressBar({ value: options.progress.value, tone: options.progress.tone, label: options.note }) : null}
    </article>`;
}

/**
 * A block of a page on a card: its title with an optional badge, a big amount with a note, and a link to more. The
 * amount sits under the title, or in the top right corner across from it when `aside` is set.
 */
export function panelCard(options: {
  title: string;
  amount?: number;
  symbol?: string;
  note?: string;
  aside?: boolean;
  badge?: { text: string; tone?: Tone };
  href?: string;
  body: Content;
}): Html {
  const amount =
    options.amount === undefined
      ? null
      : html`<p class="pcard-amount">${num(options.amount)} <span>${options.symbol ?? ''}</span>${options.note ? html`<small>${options.note}</small>` : null}</p>`;
  return html`
    <section class="pcard">
      <header class="pcard-head${options.aside ? ' aside' : ''}">
        <div class="pcard-title">
          <h2>${options.title}${options.badge ? badge(options.badge) : null}</h2>
          ${options.aside ? null : amount}
        </div>
        ${options.aside ? amount : null}
        ${options.href ? html`<a class="pcard-go" href="${options.href}" aria-label="Подробнее: ${options.title}">${icon('chevronRight', 16)}</a>` : null}
      </header>
      <div class="pcard-body">${options.body}</div>
    </section>`;
}

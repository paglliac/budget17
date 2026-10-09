// PROTOTYPE (throwaway, month review): widgets of the review page drawn by the user's picture — big figures, a flow
// of where the money went, the weeks as bars, lists of amounts, and the assistant's panel with findings and
// suggestions that switch on and off.

import { num } from '../format.ts';
import { html, type Content, type Html } from '../html.ts';
import { icon, type IconName } from '../icons.ts';
import { toneColor, type Tone } from '../tones.ts';
import { badge, progressBar } from './basics.ts';

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

/** A block of the page on a card: its title, an optional big amount with a note, a badge and a link to more. */
export function panelCard(options: {
  id?: string;
  title: string;
  amount?: number;
  symbol?: string;
  note?: string;
  badge?: { text: string; tone?: Tone };
  href?: string;
  body: Content;
}): Html {
  return html`
    <section class="pcard"${options.id ? html` id="${options.id}"` : null}>
      <header class="pcard-head">
        <div class="pcard-title">
          <h2>${options.title}${options.badge ? badge(options.badge) : null}</h2>
          ${options.amount === undefined
            ? null
            : html`<p class="pcard-amount">${num(options.amount)} <span>${options.symbol ?? ''}</span>${options.note ? html`<small>${options.note}</small>` : null}</p>`}
        </div>
        ${options.href ? html`<a class="pcard-go" href="${options.href}" aria-label="Подробнее: ${options.title}">${icon('chevronRight', 16)}</a>` : null}
      </header>
      <div class="pcard-body">${options.body}</div>
    </section>`;
}

let flowCount = 0;

/**
 * Where money went: one source on the left flowing into parts on the right, each named with its amount and share of
 * the source. Parts that are zero or negative are left out; the source is at least what the parts add up to.
 */
export function flowChart(options: { label: string; source: { label: string; amount: number }; parts: Array<{ label: string; amount: number; color: string }>; symbol: string }): Html {
  const parts = options.parts.filter((p) => p.amount > 0);
  const total = Math.max(options.source.amount, parts.reduce((s, p) => s + p.amount, 0)) || 1;
  const width = 400;
  const height = 240;
  const row = height / Math.max(parts.length, 1);
  const flow = height * 0.72;
  const id = `flow-${++flowCount}`;
  let left = (height - flow) / 2;
  const ribbons = parts.map((p, i) => {
    const h = Math.max(3, (p.amount / total) * flow);
    const y0 = left;
    left += h;
    const center = row * (i + 0.5);
    const right = Math.min(Math.max(center - h / 2, 0), height - h);
    return html`
      <linearGradient id="${id}-${i}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#B9A8F5" stop-opacity=".25"/><stop offset="1" stop-color="${p.color}" stop-opacity=".75"/></linearGradient>
      <path d="M0 ${y0.toFixed(1)} C${width / 2} ${y0.toFixed(1)} ${width / 2} ${right.toFixed(1)} ${width} ${right.toFixed(1)} L${width} ${(right + h).toFixed(1)} C${width / 2} ${(right + h).toFixed(1)} ${width / 2} ${(y0 + h).toFixed(1)} 0 ${(y0 + h).toFixed(1)} Z" fill="url(#${id}-${i})"><title>${p.label}</title></path>`;
  });
  return html`
    <div class="flow" role="img" aria-label="${options.label}">
      <div class="flow-chart">
        <p class="flow-source"><b>${num(options.source.amount)}</b><small>${options.source.label}</small></p>
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${ribbons}</svg>
      </div>
      <ul class="flow-legend">${parts.map(
        (p) => html`<li><i style="background:${p.color}"></i><span><small>${p.label}</small><b>${num(p.amount)} <span>${options.symbol}</span></b></span><em>${share(p.amount / options.source.amount)}</em></li>`,
      )}</ul>
    </div>`;
}

function share(ratio: number): string {
  if (!Number.isFinite(ratio)) return '';
  if (ratio > 0 && ratio < 0.01) return '<1%';
  return `${Math.round(ratio * 100)}%`;
}

/** Spending of each week as a bar with its amount on top, and the week's limit as a dashed line across it. */
export function weekBars(options: { label: string; bars: Array<{ label: string; value: number; limit: number; title?: string; href?: string; ahead?: boolean }> }): Html {
  const top = Math.max(1, ...options.bars.map((b) => Math.max(b.value, b.limit))) * 1.08;
  return html`
    <div class="bars" role="img" aria-label="${options.label}">${options.bars.map((b) => {
      const style = `--h:${((b.value / top) * 100).toFixed(1)}%;--limit:${((b.limit / top) * 100).toFixed(1)}%`;
      const inner = html`<span class="bar-plot"><span class="bar-fill${b.value > b.limit ? ' over' : ''}"><b>${b.ahead ? '' : num(b.value)}</b></span><i class="bar-limit"></i></span><small>${b.label}</small>`;
      return b.href
        ? html`<a class="bar${b.ahead ? ' ahead' : ''}" href="${b.href}" style="${style}" title="${b.title ?? b.label}">${inner}</a>`
        : html`<span class="bar${b.ahead ? ' ahead' : ''}" style="${style}" title="${b.title ?? b.label}">${inner}</span>`;
    })}</div>`;
}

/** Named amounts one under another, each with a dot or an icon tile, and optionally a share bar, a note and a link. */
export function metricList(options: {
  label: string;
  symbol?: string;
  items: Array<{ label: string; amount: number; color?: string; icon?: IconName; tone?: Tone; share?: number; note?: string; href?: string; active?: boolean }>;
}): Html {
  return html`<ul class="metrics" aria-label="${options.label}">${options.items.map((item) => {
    const lead = item.icon
      ? html`<span class="metric-icon" style="--tone:${toneColor(item.tone ?? 'gray')}">${icon(item.icon, 14)}</span>`
      : item.color
        ? html`<i class="metric-dot" style="background:${item.color}"></i>`
        : null;
    const inner = html`${lead}<span class="metric-label">${item.label}</span>${
      item.share === undefined ? null : html`<span class="metric-bar"><i style="width:${(Math.min(1, Math.max(0, item.share)) * 100).toFixed(1)}%;background:${item.color ?? 'var(--violet)'}"></i></span>`
    }${item.note ? html`<small class="metric-note">${item.note}</small>` : null}<b class="metric-amount">${num(item.amount)}${options.symbol ? html` <span>${options.symbol}</span>` : null}</b>${
      item.href ? html`<span class="metric-go">${icon(item.active ? 'chevronDown' : 'chevronRight', 14)}</span>` : null
    }`;
    return html`<li>${item.href ? html`<a class="metric" href="${item.href}"${item.active ? html` aria-current="true"` : null}>${inner}</a>` : html`<span class="metric">${inner}</span>`}</li>`;
  })}</ul>`;
}

/** The assistant's greeting: what it found, questions to ask it as chips, and the main action. */
export function assistantHero(options: {
  title: string;
  text: string;
  chips: Array<{ label: string; icon: IconName; href: string; active?: boolean }>;
  action?: { label: string; href: string };
}): Html {
  return html`
    <section class="assistant">
      ${options.action ? html`<a class="assistant-action" href="${options.action.href}">${icon('sparkles', 14)}${options.action.label}</a>` : null}
      <div class="assistant-intro">
        <img class="assistant-orb" src="/apple-touch-icon.png" alt="" width="72" height="72">
        <div><h2>${options.title}</h2><p>${options.text}</p></div>
      </div>
      <nav class="assistant-chips" aria-label="Вопросы ассистенту">${options.chips.map(
        (c) => html`<a class="assistant-chip" href="${c.href}"${c.active ? html` aria-current="true"` : null}>${icon(c.icon, 14)}${c.label}</a>`,
      )}</nav>
    </section>`;
}

/** The assistant's answer to a question: the question, a few paragraphs, links to what they are about, and a field to ask. */
export function assistantAnswer(options: {
  question: string;
  paragraphs: string[];
  links?: Array<{ label: string; detail?: string; href: string }>;
  closeHref: string;
  ask?: { action: string; name: string; placeholder: string; params?: Record<string, string> };
}): Html {
  return html`
    <article class="answer">
      <header class="answer-head"><h3>${icon('sparkles', 14)}${options.question}</h3><a href="${options.closeHref}" aria-label="Закрыть">${icon('x', 14)}</a></header>
      ${options.paragraphs.map((p) => html`<p>${p}</p>`)}
      ${options.links?.length
        ? html`<ul class="answer-links">${options.links.map((l) => html`<li><a href="${l.href}"><span>${l.label}</span>${l.detail ? html`<b>${l.detail}</b>` : null}${icon('chevronRight', 14)}</a></li>`)}</ul>`
        : null}
      ${options.ask
        ? html`<form class="answer-ask" method="get" action="${options.ask.action}">${Object.entries(options.ask.params ?? {}).map(
            ([name, value]) => html`<input type="hidden" name="${name}" value="${value}">`,
          )}<input type="text" name="${options.ask.name}" placeholder="${options.ask.placeholder}" aria-label="${options.ask.placeholder}"><button type="submit" aria-label="Спросить">${icon('arrowUpRight', 14)}</button></form>`
        : null}
    </article>`;
}

/** A heading over a list with how many it holds and an action on the right. */
export function listHeading(options: { title: string; count?: number; action?: { label: string; href: string; primary?: boolean } }): Html {
  return html`<header class="list-heading"><h2>${options.title}${options.count === undefined ? null : html`<span>${options.count}</span>`}</h2>${
    options.action ? html`<a class="${options.action.primary ? 'list-heading-button' : 'list-heading-link'}" href="${options.action.href}">${options.action.label}</a>` : null
  }</header>`;
}

/** Findings, each with an icon tile, a bold line, a quieter explanation and a link to more. */
export function insightList(options: { label: string; items: Array<{ icon: IconName; tone: Tone; title: string; text: string; href?: string }> }): Html {
  return html`<ul class="insights" aria-label="${options.label}">${options.items.map((item) => {
    const inner = html`<span class="insight-icon" style="--tone:${toneColor(item.tone)}">${icon(item.icon, 16)}</span><span class="insight-text"><b>${item.title}</b><small>${item.text}</small></span>${
      item.href ? html`<span class="insight-go">${icon('chevronRight', 16)}</span>` : null
    }`;
    return html`<li>${item.href ? html`<a class="insight" href="${item.href}">${inner}</a>` : html`<span class="insight">${inner}</span>`}</li>`;
  })}</ul>`;
}

/** Suggestions that switch on and off; each switch is a link that flips it. */
export function toggleList(options: { label: string; items: Array<{ icon: IconName; title: string; text: string; on: boolean; href: string }> }): Html {
  return html`<ul class="toggles" aria-label="${options.label}">${options.items.map(
    (item) => html`<li><a class="toggle" href="${item.href}" role="switch" aria-checked="${item.on ? 'true' : 'false'}"><span class="toggle-icon">${icon(item.icon, 14)}</span><span class="toggle-text"><b>${item.title}</b><small>${item.text}</small></span><span class="toggle-switch"></span></a></li>`,
  )}</ul>`;
}

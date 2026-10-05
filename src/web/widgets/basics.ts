// Small building blocks that cards and panels are made of.
// Every function exported from src/web/widgets is a widget: it owns its markup and its classes in styles.css,
// and it has stories in src/web/stories.ts, which /storyboard shows.

import { percent } from '../format.ts';
import { html, type Content, type Html } from '../html.ts';
import { icon, type IconName } from '../icons.ts';
import { toneColor, type Tone } from '../tones.ts';

/** The main action. With `action` it submits a POST form to that URL. */
export function button(options: { label: string; icon?: IconName; action?: string }): Html {
  const inner = html`${options.icon ? icon(options.icon, 14) : null}${options.label}`;
  return options.action
    ? html`<form class="button-form" method="post" action="${options.action}"><button class="button" type="submit">${inner}</button></form>`
    : html`<button class="button" type="button">${inner}</button>`;
}

/** An icon on a coloured square, marking what a card is about. */
export function iconBadge(options: { icon: IconName; tone: Tone }): Html {
  return html`<span class="icon-badge" style="--tone:${toneColor(options.tone)}">${icon(options.icon, 13)}</span>`;
}

/** How much of something is done: 0 is empty, 1 is full, more than 1 stays full. */
export function progressBar(options: { value: number; tone: Tone; label?: string }): Html {
  const value = Math.max(0, options.value);
  const filled = Math.min(1, value);
  return html`<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(value * 100)}" aria-label="${options.label ?? percent(value)}" style="--tone:${toneColor(options.tone)}">${
    filled > 0 ? html`<span class="progress-fill" style="width:${(filled * 100).toFixed(1)}%"></span>` : null
  }${filled < 1 ? html`<span class="progress-rest"></span>` : null}</div>`;
}

/** Shares of a whole, such as money across accounts. Parts that are zero or negative are left out. */
export function shareBar(options: { label: string; parts: Array<{ label: string; value: number; color: string }> }): Html {
  const parts = options.parts.filter((p) => p.value > 0);
  return html`<div class="share" role="img" aria-label="${options.label}">${parts.map(
    (p) => html`<span class="share-part" style="flex:${p.value};background:${p.color}" title="${p.label}"></span>`,
  )}</div>`;
}

/** A short value next to a title, such as an amount. A tone tints it. */
export function badge(options: { text: string; tone?: Tone }): Html {
  return options.tone
    ? html`<span class="badge toned" style="--tone:${toneColor(options.tone)}">${options.text}</span>`
    : html`<span class="badge">${options.text}</span>`;
}

/** An outlined label with an optional icon and count, such as a group of accounts. */
export function chip(options: { label: string; icon?: IconName; tone?: Tone; count?: number }): Html {
  return html`<span class="chip"${options.tone ? html` style="--tone:${toneColor(options.tone)}"` : null}>${
    options.icon ? icon(options.icon, 13) : null
  }${options.label}${options.count === undefined ? null : html` <b>${options.count}</b>`}</span>`;
}

export function avatar(options: { name: string }): Html {
  return html`<span class="avatar" title="${options.name}">${options.name.charAt(0).toUpperCase()}</span>`;
}

/** A titled block of the page. */
export function section(options: { title: string; body: Content }): Html {
  return html`<section class="section"><h2>${options.title}</h2>${options.body}</section>`;
}

/** The heading of a page with a sentence about what matters now. */
export function pageIntro(options: { title: string; emoji?: string; text: string }): Html {
  return html`<header class="intro"><h1>${options.title}${
    options.emoji ? html` <span aria-hidden="true">${options.emoji}</span>` : null
  }</h1><p>${options.text}</p></header>`;
}

/** What to show when there is nothing to show: say why and what to do. */
export function emptyState(options: { text: string }): Html {
  return html`<p class="empty">${options.text}</p>`;
}

/** Quiet text at the bottom of a panel, such as where the data comes from. */
export function footnote(options: { text: string }): Html {
  return html`<p class="footnote">${options.text}</p>`;
}

// The circle of the main page, as the app draws it, and the figures under it.

import { money } from '../format.ts';
import { html, type Html } from '../html.ts';
import { icon, type IconName } from '../icons.ts';
import { toneColor, type Tone } from '../tones.ts';

/** How the wave stands on the circle's lens: enough, low (less than a day's share left), empty or over the amount. */
export type WaveState = 'enough' | 'low' | 'empty' | 'over';

/**
 * How high the wave stands, from the bottom of the lens as a share of its height, as in the app (HomeWave.swift): a
 * little left, or a little past the amount, still shows as a bowl, and a full week stays low enough for what is free
 * to fit above it.
 */
function waveHeight(state: WaveState, share: number): number {
  if (state === 'empty') return 0;
  return state === 'over' ? 0.14 + 0.28 * share : 0.12 + 0.32 * share;
}

/**
 * The circle: what is free on its lilac lens, with a wave on it that shows how full the week is — violet while there
 * is enough, pale when little is left, none at nothing, red past the amount, when the amount is how far past it, in
 * red —, and what is reserved beside it, required and flexible, which opens the plan. The wave rises when the page
 * opens and drifts slowly sideways, unless the system asks for less motion; what is free rides above it.
 */
export function weekCircle(options: {
  free: { label: string; amount: number; note: string; state: WaveState; share: number };
  reserved: { label: string; amount: number; parts: Array<{ label: string; amount: number }>; href?: string };
  symbol: string;
}): Html {
  const { free, reserved, symbol } = options;
  const over = free.state === 'over';
  const height = waveHeight(free.state, free.share);
  // The middle of what is free, in parts of the circle: over the wave's crest while the lens has room for it.
  const crest = 0.92 - 0.84 * height;
  const middle = Math.min(0.5, Math.max(0.36, crest - 0.21));
  const parts = reserved.parts.map((p) => html`<span class="circle-part"><b>${money(p.amount, symbol)}</b><small>${p.label}</small></span>`);
  const reservedInner = html`
      <span class="circle-label">${reserved.label}${reserved.href ? icon('chevronRight', 14) : null}</span>
      <b class="circle-reserved-amount">${money(reserved.amount, symbol)}</b>
      ${parts}`;
  return html`
    <div class="circle wave-${free.state}" style="--middle:${(middle * 100).toFixed(1)}%">
      <span class="circle-clip" aria-hidden="true">
        <span class="circle-lens">${
          height > 0
            ? html`<span class="circle-water" style="height:${(height * 100).toFixed(1)}%"><svg class="circle-wave" viewBox="0 0 400 12" preserveAspectRatio="none"><path d="${WAVE_PATH}"/></svg></span>`
            : null
        }</span>
      </span>
      <span class="circle-free">
        ${over ? null : html`<span class="circle-label">${free.label}</span>`}
        <b class="circle-free-amount">${money(over ? -free.amount : free.amount, symbol)}</b>
        <small>${free.note}</small>
      </span>
      ${reserved.href ? html`<a class="circle-reserved" href="${reserved.href}">${reservedInner}</a>` : html`<span class="circle-reserved">${reservedInner}</span>`}
    </div>`;
}

/** Two periods of a sine across 400 by 12, crest at the top, filled down to the bottom, so that it repeats when shifted by half. */
const WAVE_PATH = (() => {
  const points = Array.from({ length: 81 }, (_, i) => {
    const x = i * 5;
    return `${x} ${(6 - 6 * Math.sin((x / 200) * 2 * Math.PI)).toFixed(2)}`;
  });
  return `M0 12 L${points.join(' L')} L400 12 Z`;
})();

/**
 * Figures under the circle, side by side with a hairline between them: what each is above it or under it, the figure
 * large, in a tone when it warns. One may link somewhere, with a chevron; one that links nowhere may carry a small
 * button under it, such as fetching from ZenMoney.
 */
export function circleFacts(options: {
  items: Array<{
    above?: string;
    figure: string;
    below?: string;
    tone?: Tone;
    href?: string;
    action?: { label: string; icon: IconName; action: string };
  }>;
}): Html {
  return html`<div class="circle-facts">${options.items.map((item) => {
    const text = html`
      <span class="circle-fact-text">
        ${item.above ? html`<small>${item.above}</small>` : null}
        <b${item.tone ? html` style="color:${toneColor(item.tone)}"` : null}>${item.figure}</b>
        ${item.below ? html`<small>${item.below}</small>` : null}
      </span>`;
    if (item.href) return html`<a class="circle-fact" href="${item.href}">${text}${icon('chevronRight', 18)}</a>`;
    return html`<div class="circle-fact">${text}${
      item.action
        ? html`<form method="post" action="${item.action.action}"><button class="circle-fact-action" type="submit">${icon(item.action.icon, 14)}${item.action.label}</button></form>`
        : null
    }</div>`;
  })}</div>`;
}

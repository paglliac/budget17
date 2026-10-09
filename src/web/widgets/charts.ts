// Charts: where money flowed, and amounts over time against their limits.

import { num } from '../format.ts';
import { html, type Html } from '../html.ts';

let flows = 0;

/**
 * Where money went: one source on the left flowing into parts on the right, each named with its amount and its share
 * of the source. Parts that are zero or negative are left out; the ribbons are scaled to what the parts add up to when
 * that is more than the source.
 */
export function flowChart(options: { label: string; source: { label: string; amount: number }; parts: Array<{ label: string; amount: number; color: string }>; symbol: string }): Html {
  const parts = options.parts.filter((p) => p.amount > 0);
  const total = Math.max(options.source.amount, parts.reduce((s, p) => s + p.amount, 0)) || 1;
  const width = 400;
  const height = 240;
  // The ribbons leave the source as one band and fan out to the rows of the legend beside the chart.
  const band = height * 0.72;
  const row = height / Math.max(parts.length, 1);
  const id = `flow-${++flows}`;
  let top = (height - band) / 2;
  const ribbons = parts.map((p, i) => {
    const h = Math.max(3, (p.amount / total) * band);
    const from = top;
    top += h;
    const to = Math.min(Math.max(row * (i + 0.5) - h / 2, 0), height - h);
    const d = [
      `M0 ${from.toFixed(1)}`,
      `C${width / 2} ${from.toFixed(1)} ${width / 2} ${to.toFixed(1)} ${width} ${to.toFixed(1)}`,
      `L${width} ${(to + h).toFixed(1)}`,
      `C${width / 2} ${(to + h).toFixed(1)} ${width / 2} ${(from + h).toFixed(1)} 0 ${(from + h).toFixed(1)}`,
      'Z',
    ].join(' ');
    return html`<linearGradient id="${id}-${i}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color:var(--violet);stop-opacity:.12"/><stop offset="1" style="stop-color:${p.color};stop-opacity:.75"/></linearGradient><path d="${d}" fill="url(#${id}-${i})"><title>${p.label}</title></path>`;
  });
  return html`
    <div class="flow" role="img" aria-label="${options.label}">
      <div class="flow-chart">
        <p class="flow-source"><b>${num(options.source.amount)}</b><small>${options.source.label}</small></p>
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${ribbons}</svg>
      </div>
      <ul class="flow-legend">${parts.map(
        (p) => html`<li><i style="background:${p.color}"></i><span><small>${p.label}</small><b>${num(p.amount)} <span>${options.symbol}</span></b></span><em>${share(p.amount, options.source.amount)}</em></li>`,
      )}</ul>
    </div>`;
}

/** A part of a whole in percent; under one percent it is <1%, and nothing when there is no whole. */
function share(part: number, whole: number): string {
  if (whole <= 0) return '';
  const ratio = part / whole;
  return ratio > 0 && ratio < 0.01 ? '<1%' : `${Math.round(ratio * 100)}%`;
}

/**
 * Spending of each week as a bar with its amount on top and the week's limit as a dashed line across it; above the
 * line the bar is darker. A week ahead has an empty bar. With `href` a bar links to its week.
 */
export function weekBars(options: { label: string; bars: Array<{ label: string; value: number; limit: number; title?: string; href?: string; ahead?: boolean }> }): Html {
  const top = Math.max(1, ...options.bars.map((b) => Math.max(b.value, b.limit))) * 1.08;
  return html`
    <div class="bars" role="img" aria-label="${options.label}">${options.bars.map((b) => {
      const over = b.value > b.limit && b.value > 0;
      const style = `--h:${((b.value / top) * 100).toFixed(1)}%;--limit:${((b.limit / top) * 100).toFixed(1)}%${over ? `;--split:${((b.limit / b.value) * 100).toFixed(1)}%` : ''}`;
      const classes = `bar${b.ahead ? ' ahead' : ''}`;
      const inner = html`<span class="bar-plot"><span class="bar-fill${over ? ' over' : ''}"><b>${b.ahead ? '' : num(b.value)}</b></span><i class="bar-limit"></i></span><small>${b.label}</small>`;
      return b.href
        ? html`<a class="${classes}" href="${b.href}" style="${style}" title="${b.title ?? b.label}">${inner}</a>`
        : html`<span class="${classes}" style="${style}" title="${b.title ?? b.label}">${inner}</span>`;
    })}</div>`;
}

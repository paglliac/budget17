// Charts: where money flowed, what a whole was made of, and amounts over time against their limits.

import { num } from '../format.ts';
import { html, type Content, type Html } from '../html.ts';

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
  // In units of a page pixel: how high the source's band is, the least a legend row needs, and the air between ribbons.
  const band = 180;
  const row = 44;
  const gap = 14;
  // Each ribbon arrives in a slot of its own, beside its legend row, so the ribbons never cross; a ribbon higher than a
  // row gets a taller slot and the chart grows to fit.
  const heights = parts.map((p) => Math.max(3, (p.amount / total) * band));
  const slots = heights.map((h) => Math.max(row, h + gap));
  const height = Math.max(slots.reduce((s, h) => s + h, 0), row);
  const id = `flow-${++flows}`;
  let top = (height - heights.reduce((s, h) => s + h, 0)) / 2;
  let slot = 0;
  const ribbons = parts.map((p, i) => {
    const h = heights[i]!;
    const from = top;
    top += h;
    const to = slot + (slots[i]! - h) / 2;
    slot += slots[i]!;
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
        <svg viewBox="0 0 ${width} ${height.toFixed(1)}" preserveAspectRatio="none" aria-hidden="true">${ribbons}</svg>
      </div>
      <ul class="flow-legend" style="--rows:${slots.map((h) => `${h.toFixed(1)}fr`).join(' ')}">${parts.map(
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

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Splits a rectangle into one per value, each as close to a square as it can be; values largest first. */
function squarify(values: number[], rect: Rect): Rect[] {
  const sum = (row: number[]) => row.reduce((s, a) => s + a, 0);
  const total = sum(values);
  if (total <= 0) return values.map(() => ({ ...rect, w: 0, h: 0 }));
  const areas = values.map((v) => (v / total) * rect.w * rect.h);
  /** How far from a square the longest-sided rectangle of a row along `side` is. */
  const worst = (row: number[], side: number) => Math.max((side * side * Math.max(...row)) / (sum(row) * sum(row)), (sum(row) * sum(row)) / (side * side * Math.min(...row)));
  const out: Rect[] = [];
  let free = { ...rect };
  let i = 0;
  while (i < areas.length) {
    const side = Math.min(free.w, free.h);
    const row = [areas[i]!];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]!], side) <= worst(row, side)) row.push(areas[j++]!);
    if (free.w >= free.h) {
      const w = sum(row) / free.h;
      let y = free.y;
      for (const a of row) {
        out.push({ x: free.x, y, w, h: a / w });
        y += a / w;
      }
      free = { x: free.x + w, y: free.y, w: free.w - w, h: free.h };
    } else {
      const h = sum(row) / free.w;
      let x = free.x;
      for (const a of row) {
        out.push({ x, y: free.y, w: a / h, h });
        x += a / h;
      }
      free = { x: free.x, y: free.y + h, w: free.w, h: free.h - h };
    }
    i = j;
  }
  return out;
}

/** Where a tile lies in its box, in percent, as the custom properties the styles place it by. */
function place(r: Rect, box: Rect): string {
  const p = (v: number, of: number) => `${((v / of) * 100).toFixed(2)}%`;
  return `--x:${p(r.x, box.w)};--y:${p(r.y, box.h)};--w:${p(r.w, box.w)};--h:${p(r.h, box.h)}`;
}

/**
 * The least a tile needs for its words, in units of a map 160 wide and 100 high: on a page a unit is 4–5 px. A group
 * smaller than that shows neither its words nor its items, an item no words; both name themselves on hover.
 */
const GROUP_WORDS = { w: 16, h: 10, area: 260 };
const ITEM_WORDS = { w: 9, h: 8, area: 0 };
/** How high a group's own words are, over its items. */
const GROUP_HEAD = 10;

function tooSmall(r: Rect, words: { w: number; h: number; area: number }): boolean {
  return r.w < words.w || r.h < words.h || r.w * r.h < words.area;
}

/**
 * Parts of a whole as nested tiles sized by amount: groups, such as categories, largest first, each tinted with its
 * colour and holding its items, such as subcategories or shops, in the order given (largest first lays them out best). A `hatched` group is one nobody has sorted yet. Groups and
 * items link to more with `href`; the open one is outlined. A `hinted` tile has a suggestion about it: a group gets a
 * dot in its corner, an item a violet outline, since most items are too small for a dot beside their words. Tiles too
 * small for words show them on hover. On a narrow screen the groups go one under another with their items in a row,
 * and a group's `panel`, what is open of it, comes right under it; on a wide screen the page shows that elsewhere.
 */
export function categoryMap(options: {
  label: string;
  symbol: string;
  groups: Array<{
    label: string;
    amount: number;
    color: string;
    hatched?: boolean;
    href?: string;
    active?: boolean;
    hinted?: boolean;
    items: Array<{ label: string; amount: number; href?: string; active?: boolean; hinted?: boolean }>;
    panel?: Content;
  }>;
}): Html {
  const box = { x: 0, y: 0, w: 160, h: 100 };
  const groups = options.groups.filter((g) => g.amount > 0).sort((a, b) => b.amount - a.amount);
  const rects = squarify(
    groups.map((g) => g.amount),
    box,
  );
  const tile = (href: string | undefined, classes: string, style: string, title: string, inner: Html) =>
    href ? html`<a class="${classes}" href="${href}" style="${style}" title="${title}">${inner}</a>` : html`<div class="${classes}" style="${style}" title="${title}">${inner}</div>`;
  return html`<div class="cmap" role="group" aria-label="${options.label}">${groups.map((g, gi) => {
    const r = rects[gi]!;
    const tiny = tooSmall(r, GROUP_WORDS);
    const items = g.items.filter((i) => i.amount > 0);
    // The group's own words take the top of its tile; items share the rest.
    const inner = { x: 0, y: 0, w: r.w, h: Math.max(0, r.h - GROUP_HEAD) };
    const showItems = items.length > 1 && !tiny && inner.h >= ITEM_WORDS.h;
    const itemRects = squarify(
      items.map((i) => i.amount),
      inner,
    );
    const title = `${g.label}: ${num(g.amount)} ${options.symbol}${g.hinted ? ' · есть подсказка' : ''}`;
    // Links do not nest, so the group links by its head, which covers the whole tile when no items show.
    const head = tile(
      g.href,
      `cmap-head${showItems ? '' : ' fill'}`,
      '',
      title,
      html`<b>${g.label}</b><small>${num(g.amount)} ${options.symbol}</small>${g.hinted ? html`<i class="cmap-dot" aria-label="Есть подсказка"></i>` : null}`,
    );
    const body = showItems
      ? html`<span class="cmap-items">${items.map((item, ii) => {
          const ir = itemRects[ii]!;
          const classes = `cmap-item${item.active ? ' active' : ''}${tooSmall(ir, ITEM_WORDS) ? ' tiny' : ''}${item.hinted ? ' hinted' : ''}`;
          const itemTitle = `${item.label}: ${num(item.amount)} ${options.symbol}${item.hinted ? ' · есть подсказка' : ''}`;
          return tile(item.href, classes, place(ir, inner), itemTitle, html`<b>${item.label}</b><small>${num(item.amount)}</small>`);
        })}</span>`
      : null;
    const classes = `cmap-group${g.hatched ? ' hatched' : ''}${g.active ? ' active' : ''}${tiny ? ' tiny' : ''}`;
    return html`<div class="${classes}" style="${place(r, box)};--color:${g.color}">${head}${body}</div>${
      g.panel ? html`<div class="cmap-panel">${g.panel}</div>` : null
    }`;
  })}</div>`;
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

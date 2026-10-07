// The frame every page sits in and the pieces that lay content out.

import { html, type Content, type Html } from '../html.ts';
import { icon, type IconName } from '../icons.ts';

/**
 * Icon rail on the left, optional tabs, the main panel and an optional side panel on the right. A wide side panel
 * has room for lists of its own, such as a plan.
 */
export function appShell(options: { rail: Content; tabs?: Content; main: Content; side?: Content; wideSide?: boolean }): Html {
  return html`
    <div class="shell">
      ${options.rail}
      <div class="shell-body">
        ${options.tabs}
        <div class="shell-columns${options.side ? ' has-side' : ''}${options.side && options.wideSide ? ' wide-side' : ''}">
          <main class="panel panel-main">${options.main}</main>
          ${options.side ? html`<aside class="panel panel-side">${options.side}</aside>` : null}
        </div>
      </div>
    </div>`;
}

export interface RailItem {
  icon: IconName;
  label: string;
  href: string;
  active?: boolean;
}

/** Navigation between pages as icons, in titled groups, with something like an avatar at the bottom. */
export function rail(options: { groups: Array<{ title: string; items: RailItem[] }>; footer?: { title: string; body: Content } }): Html {
  return html`
    <nav class="rail" aria-label="Разделы">
      <span class="rail-logo">${icon('wallet', 18)}</span>
      ${options.groups.map(
        (group) => html`
          <span class="rail-title">${group.title}</span>
          ${group.items.map(
            (item) =>
              html`<a class="rail-item" href="${item.href}" title="${item.label}" aria-label="${item.label}"${
                item.active ? html` aria-current="page"` : null
              }>${icon(item.icon, 18)}</a>`,
          )}`,
      )}
      <span class="rail-fill"></span>
      ${options.footer ? html`<span class="rail-title">${options.footer.title}</span>${options.footer.body}` : null}
    </nav>`;
}

/** Tabs on top of the main panel, such as months. */
export function tabs(options: { label: string; items: Array<{ label: string; href: string; icon?: IconName; active?: boolean }> }): Html {
  return html`<nav class="tabs" aria-label="${options.label}">${options.items.map(
    (item) =>
      html`<a class="tab" href="${item.href}"${item.active ? html` aria-current="page"` : null}>${
        item.icon ? icon(item.icon, 13) : null
      }${item.label}</a>`,
  )}</nav>`;
}

/** The bar at the top of a panel: where you are, and actions on the right. */
export function topBar(options: { crumbs: Array<{ label: string; icon?: IconName }>; actions?: Content }): Html {
  return html`
    <header class="topbar">
      ${options.crumbs.map(
        (crumb, i) =>
          html`${i > 0 ? html`<span class="topbar-sep">${icon('chevronRight', 12)}</span>` : null}<span class="topbar-crumb">${
            crumb.icon ? icon(crumb.icon, 15) : null
          }${crumb.label}</span>`,
      )}
      ${options.actions ? html`<span class="topbar-actions">${options.actions}</span>` : null}
    </header>`;
}

/** Equal columns, at most `columns` per row; they wrap when a column would get narrower than `min` pixels. */
export function grid(options: { columns: number; min?: number; items: Content[] }): Html {
  return html`<div class="grid" style="--columns:${options.columns};--min:${options.min ?? 180}px">${options.items}</div>`;
}

/** Controls in one row that wraps when narrow, such as filters above a list. */
export function toolbar(options: { items: Content[] }): Html {
  return html`<div class="toolbar">${options.items}</div>`;
}

/** Blocks one under another with an even gap, such as days in a feed. */
export function stack(options: { items: Content[]; gap?: number }): Html {
  return html`<div class="stack" style="--stack-gap:${options.gap ?? 16}px">${options.items}</div>`;
}

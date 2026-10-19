// The frame every page sits in and the pieces that lay content out.

import { html, type Content, type Html } from '../html.ts';
import { icon, type IconName } from '../icons.ts';

/**
 * Icon rail on the left, optional tabs, the main panel and an optional side panel on the right. A wide side panel
 * has room for lists of its own, such as a plan. With `head` the page is one sheet instead of panels: the head over
 * the main column, the side beside both; once the side goes under the main column, it comes between the head and the
 * main column, so what the side tells comes first.
 */
export function appShell(options: { rail: Content; tabs?: Content; head?: Content; main: Content; side?: Content; wideSide?: boolean }): Html {
  if (options.head !== undefined) {
    return html`
    <div class="shell">
      ${options.rail}
      <div class="shell-body">
        ${options.tabs}
        <div class="sheet${options.side ? ' has-side' : ''}">
          <header class="sheet-head">${options.head}</header>
          ${options.side ? html`<aside class="sheet-side">${options.side}</aside>` : null}
          <main class="sheet-main">${options.main}</main>
        </div>
      </div>
    </div>`;
  }
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

/**
 * Navigation between pages, each an icon with its name, in groups that may have a title, with something like an
 * avatar at the bottom. The logo on top leads to `home` when given. A narrow screen keeps only the icons.
 */
export function rail(options: {
  groups: Array<{ title?: string; items: RailItem[] }>;
  home?: { label: string; href: string };
  footer?: { title: string; body: Content };
}): Html {
  const logo = html`<img src="/favicon.png" alt="" width="40" height="40">`;
  return html`
    <nav class="rail" aria-label="Разделы">
      ${options.home
        ? html`<a class="rail-logo" href="${options.home.href}" title="${options.home.label}" aria-label="${options.home.label}">${logo}</a>`
        : html`<span class="rail-logo">${logo}</span>`}
      ${options.groups.map(
        (group) => html`
          ${group.title ? html`<span class="rail-title">${group.title}</span>` : null}
          ${group.items.map(
            (item) =>
              html`<a class="rail-item" href="${item.href}" title="${item.label}"${
                item.active ? html` aria-current="page"` : null
              }>${icon(item.icon, 20)}<span>${item.label}</span></a>`,
          )}`,
      )}
      <span class="rail-fill"></span>
      ${options.footer ? html`<span class="rail-title">${options.footer.title}</span>${options.footer.body}` : null}
    </nav>`;
}

/**
 * The head of a sheet: the title, with arrows to the one before and after it, such as weeks, a switch at the end of
 * the line, and a few sentences on what matters now under it.
 */
export function pageHead(options: {
  title: string;
  prev?: { label: string; href: string };
  next?: { label: string; href: string } | null;
  switcher?: Content;
  text?: string[];
}): Html {
  const step = (to: { label: string; href: string } | null | undefined, name: 'chevronLeft' | 'chevronRight') =>
    to ? html`<a class="head-step" href="${to.href}" title="${to.label}" aria-label="${to.label}">${icon(name, 18)}</a>` : html`<span class="head-step" aria-hidden="true">${icon(name, 18)}</span>`;
  return html`
    <div class="head">
      <div class="head-line">
        <h1>${options.title}</h1>
        ${options.prev !== undefined || options.next !== undefined ? html`<span class="head-steps">${step(options.prev, 'chevronLeft')}${step(options.next, 'chevronRight')}</span>` : null}
        ${options.switcher ? html`<span class="head-switch">${options.switcher}</span>` : null}
      </div>
      ${options.text?.length ? html`<p class="head-text">${options.text.map((line, i) => html`${i > 0 ? html`<br>` : null}${line}`)}</p>` : null}
    </div>`;
}

/** Round icon links at the top of a sheet's side, such as search, and the user's letter after them. */
export function headActions(options: { items: Array<{ icon: IconName; label: string; href: string }>; user?: string | null }): Html {
  return html`<div class="head-actions">${options.items.map(
    (item) => html`<a class="head-action" href="${item.href}" title="${item.label}" aria-label="${item.label}">${icon(item.icon, 20)}</a>`,
  )}${options.user ? html`<span class="head-user" title="${options.user}">${options.user.charAt(0).toUpperCase()}</span>` : null}</div>`;
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
/**
 * Content for one kind of screen only: `wide` while the side panel stands beside the main one, `narrow` once it goes
 * under it. Something that opens on the side, far down on a narrow screen, can open in place there instead.
 */
export function screenOnly(options: { screen: 'wide' | 'narrow'; items: Content[] }): Html {
  return html`<div class="screen-only ${options.screen}">${options.items}</div>`;
}

export function stack(options: { items: Content[]; gap?: number }): Html {
  return html`<div class="stack" style="--stack-gap:${options.gap ?? 16}px">${options.items}</div>`;
}

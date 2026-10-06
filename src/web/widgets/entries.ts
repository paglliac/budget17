// Things the user sets up, such as regular expenses or incomes: a row per entry that opens for editing, and form rows.
// A row can also carry quick actions, such as marking a purchase as bought, or open in place with a panel under it.
// An entry with an id stays where it is on the screen when the page comes back after opening or saving it.

import { money } from '../format.ts';
import { html, type Content, type Html } from '../html.ts';
import { icon, type IconName } from '../icons.ts';
import { button } from './basics.ts';

/** Entries one under another: rows and form rows in the given order. */
export function entryList(options: { label: string; items: Html[] }): Html {
  return html`<ul class="entries" aria-label="${options.label}">${options.items}</ul>`;
}

/**
 * One entry: what, when and how much. With `href` the row links to its editing.
 * `actions` are buttons next to the row, each posting a form to its URL. One with an icon is just the icon, like the
 * pencil, before the amount, and shows only while the pointer is over the row; touch screens have no pointer, so
 * there it is left out, and the entry's form should offer the same action.
 * With `panel` the entry is open: the panel shows under the row, and the row's link closes it.
 */
export function entryRow(options: {
  /** Keeps the entry in place on the screen when the page comes back, and names it in links. */
  id?: string;
  title: string;
  /** When it comes, such as 25-го числа · через 20 дней. */
  details: string;
  icon: IconName;
  color: string;
  /** Left out for an entry that is not about money, such as a category. */
  amount?: number;
  symbol?: string;
  href?: string;
  actions?: Array<{ label: string; action: string; icon?: IconName }>;
  /** Quieter text, for an entry that is behind, such as a payment already made. */
  muted?: boolean;
  /** What the open entry shows under its row, such as choices to make. */
  panel?: Content;
}): Html {
  const open = options.panel !== undefined;
  const actions = options.actions ?? [];
  const iconActions = actions.filter((a) => a.icon);
  const textActions = actions.filter((a) => !a.icon);
  // The link covers the whole row, so that the icon actions can sit in it, before the amount, and amounts line up
  // with those of rows that have none.
  return html`
    <li class="entry${options.muted ? ' muted' : ''}${open ? ' open' : ''}"${options.id ? html` id="${options.id}"` : null}>
      <div class="entry-row" style="--color:${options.color}">
        ${options.href
          ? html`<a class="entry-link" href="${options.href}" title="${open ? 'Закрыть' : 'Изменить'}" aria-label="${open ? 'Закрыть' : 'Изменить'}: ${options.title}"${
              open ? html` aria-expanded="true"` : null
            }></a>`
          : null}
        <span class="entry-icon">${icon(options.icon, 16)}</span>
        <span class="entry-text"><b>${options.title}</b><small>${options.details}</small></span>
        ${iconActions.map(
          (a) =>
            html`<form class="entry-inline" method="post" action="${a.action}"><button class="entry-icon-action" type="submit" title="${a.label}" aria-label="${a.label}">${icon(
              a.icon!,
              14,
            )}</button></form>`,
        )}
        ${options.amount === undefined ? null : html`<b class="entry-amount">${money(options.amount, options.symbol ?? '')}</b>`}
        ${options.href ? html`<span class="entry-edit">${icon(open ? 'x' : 'pencil', 14)}</span>` : null}
      </div>
      ${textActions.length > 0
        ? html`<span class="entry-row-actions">${textActions.map(
            (a) => html`<form method="post" action="${a.action}"><button class="entry-quiet" type="submit">${a.label}</button></form>`,
          )}</span>`
        : null}
      ${open ? html`<div class="entry-panel">${options.panel}</div>` : null}
    </li>`;
}

/** A line between entries with its label, such as today between payments made and to come. */
export function entryDivider(options: { label: string }): Html {
  return html`<li class="entry-divider" role="separator"><span>${options.label}</span></li>`;
}

/**
 * An entry being added or edited: its fields, posted to `action` with the `hidden` values.
 * `more` are fields folded under their label until opened, such as dates; they are posted folded too.
 * An existing entry also gets Удалить, posted to `deleteAction`, and Отмена, leading to `cancelHref`.
 * `extraActions` post the same form elsewhere, such as moving the entry.
 */
export function entryForm(options: {
  /** Keeps the entry in place on the screen when the page comes back; the same id as its row. */
  id?: string;
  action: string;
  submitLabel: string;
  icon: IconName;
  color: string;
  fields: Content;
  /** `open` unfolds them, such as when one of them has an error. */
  more?: { label: string; fields: Content; open?: boolean };
  hidden?: Record<string, string>;
  extraActions?: Array<{ label: string; action: string }>;
  deleteAction?: string;
  cancelHref?: string;
}): Html {
  return html`
    <li${options.id ? html` id="${options.id}"` : null}>
      <form class="entry-form" method="post" action="${options.action}" style="--color:${options.color}">
        ${Object.entries(options.hidden ?? {}).map(([name, value]) => html`<input type="hidden" name="${name}" value="${value}">`)}
        <span class="entry-icon">${icon(options.icon, 16)}</span>
        <span class="entry-fields">${options.fields}${
          options.more
            ? html`<details class="entry-more"${options.more.open ? html` open` : null}><summary class="entry-quiet">${options.more.label}${icon('chevronDown', 14)}</summary><span class="entry-more-fields">${options.more.fields}</span></details>`
            : null
        }</span>
        <span class="entry-actions">
          ${button({ label: options.submitLabel, submit: true })}
          ${(options.extraActions ?? []).map((a) => html`<button class="entry-quiet" type="submit" formaction="${a.action}">${a.label}</button>`)}
          ${options.deleteAction ? html`<button class="entry-quiet danger" type="submit" formaction="${options.deleteAction}" formnovalidate>Удалить</button>` : null}
          ${options.cancelHref ? html`<a class="entry-quiet" href="${options.cancelHref}">Отмена</a>` : null}
        </span>
      </form>
    </li>`;
}

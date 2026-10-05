// Things the user sets up, such as regular expenses or incomes: a row per entry that opens for editing, and form rows.
// A row can also carry quick actions, such as marking a purchase as bought.

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
 * `actions` are buttons next to the row, each posting a form to its URL.
 */
export function entryRow(options: {
  title: string;
  /** When it comes, such as 25-го числа · через 20 дней. */
  details: string;
  icon: IconName;
  color: string;
  amount: number;
  symbol: string;
  href?: string;
  actions?: Array<{ label: string; action: string }>;
}): Html {
  const inner = html`
    <span class="entry-icon">${icon(options.icon, 16)}</span>
    <span class="entry-text"><b>${options.title}</b><small>${options.details}</small></span>
    <b class="entry-amount">${money(options.amount, options.symbol)}</b>`;
  const actions = options.actions ?? [];
  return html`
    <li class="entry">
      ${options.href
        ? html`<a class="entry-row" href="${options.href}" style="--color:${options.color}" title="Изменить">${inner}<span class="entry-edit">${icon('pencil', 14)}</span></a>`
        : html`<div class="entry-row" style="--color:${options.color}">${inner}</div>`}
      ${actions.length > 0
        ? html`<span class="entry-row-actions">${actions.map(
            (a) => html`<form method="post" action="${a.action}"><button class="entry-quiet" type="submit">${a.label}</button></form>`,
          )}</span>`
        : null}
    </li>`;
}

/**
 * An entry being added or edited: its fields, posted to `action` with the `hidden` values.
 * `more` are fields folded under their label until opened, such as dates; they are posted folded too.
 * An existing entry also gets Удалить, posted to `deleteAction`, and Отмена, leading to `cancelHref`.
 * `extraActions` post the same form elsewhere, such as moving the entry.
 */
export function entryForm(options: {
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
    <li>
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

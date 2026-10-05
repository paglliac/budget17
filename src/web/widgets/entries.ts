// Things the user sets up, such as regular expenses or incomes: a row per entry that opens for editing, and form rows.

import { money } from '../format.ts';
import { html, type Content, type Html } from '../html.ts';
import { icon, type IconName } from '../icons.ts';
import { button } from './basics.ts';

/** Entries one under another: rows and form rows in the given order. */
export function entryList(options: { label: string; items: Html[] }): Html {
  return html`<ul class="entries" aria-label="${options.label}">${options.items}</ul>`;
}

/** One entry: what, when and how much. The row links to its editing. */
export function entryRow(options: {
  title: string;
  /** When it comes, such as 25-го числа · через 20 дней. */
  details: string;
  icon: IconName;
  color: string;
  amount: number;
  symbol: string;
  href: string;
}): Html {
  return html`
    <li>
      <a class="entry-row" href="${options.href}" style="--color:${options.color}" title="Изменить">
        <span class="entry-icon">${icon(options.icon, 16)}</span>
        <span class="entry-text"><b>${options.title}</b><small>${options.details}</small></span>
        <b class="entry-amount">${money(options.amount, options.symbol)}</b>
        <span class="entry-edit">${icon('pencil', 14)}</span>
      </a>
    </li>`;
}

/**
 * An entry being added or edited: its fields, posted to `action` with the `hidden` values.
 * An existing entry also gets Удалить, posted to `deleteAction`, and Отмена, leading to `cancelHref`.
 */
export function entryForm(options: {
  action: string;
  submitLabel: string;
  icon: IconName;
  color: string;
  fields: Content;
  hidden?: Record<string, string>;
  deleteAction?: string;
  cancelHref?: string;
}): Html {
  return html`
    <li>
      <form class="entry-form" method="post" action="${options.action}" style="--color:${options.color}">
        ${Object.entries(options.hidden ?? {}).map(([name, value]) => html`<input type="hidden" name="${name}" value="${value}">`)}
        <span class="entry-icon">${icon(options.icon, 16)}</span>
        <span class="entry-fields">${options.fields}</span>
        <span class="entry-actions">
          ${button({ label: options.submitLabel, submit: true })}
          ${options.deleteAction ? html`<button class="entry-quiet danger" type="submit" formaction="${options.deleteAction}" formnovalidate>Удалить</button>` : null}
          ${options.cancelHref ? html`<a class="entry-quiet" href="${options.cancelHref}">Отмена</a>` : null}
        </span>
      </form>
    </li>`;
}

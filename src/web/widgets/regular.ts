// Regular expenses as a list to set them up: a row per expense that opens for editing, and form rows.

import type { RegularErrors, RegularValues } from '../../regular.ts';
import { money } from '../format.ts';
import { html, type Html } from '../html.ts';
import { icon, type IconName } from '../icons.ts';
import { button, field } from './basics.ts';

/** Regular expenses one under another: rows and form rows in the given order. */
export function regularList(options: { label: string; items: Html[] }): Html {
  return html`<ul class="regular" aria-label="${options.label}">${options.items}</ul>`;
}

/** One regular expense: what, when and how much. The row links to its editing. */
export function regularRow(options: {
  title: string;
  /** When it is paid, such as 25-го числа · через 20 дней. */
  details: string;
  icon: IconName;
  color: string;
  amount: number;
  symbol: string;
  href: string;
}): Html {
  return html`
    <li>
      <a class="regular-row" href="${options.href}" style="--color:${options.color}" title="Изменить">
        <span class="regular-icon">${icon(options.icon, 16)}</span>
        <span class="regular-text"><b>${options.title}</b><small>${options.details}</small></span>
        <b class="regular-amount">${money(options.amount, options.symbol)}</b>
        <span class="regular-edit">${icon('pencil', 14)}</span>
      </a>
    </li>`;
}

/**
 * A regular expense being added or edited: title, amount and day of the month, posted to `action`.
 * An existing expense also gets Удалить, posted to `deleteAction`, and Отмена, leading to `cancelHref`.
 */
export function regularForm(options: {
  action: string;
  submitLabel: string;
  icon: IconName;
  color: string;
  symbol: string;
  values?: RegularValues;
  errors?: RegularErrors;
  deleteAction?: string;
  cancelHref?: string;
}): Html {
  const values = options.values ?? { title: '', amount: '', day: '' };
  const errors = options.errors ?? {};
  return html`
    <li>
      <form class="regular-form" method="post" action="${options.action}" style="--color:${options.color}">
        <span class="regular-icon">${icon(options.icon, 16)}</span>
        <span class="regular-fields">
          ${field({ label: 'Название', name: 'title', value: values.title, placeholder: 'Например, аренда', maxLength: 80, required: true, error: errors.title })}
          ${field({ label: `Сумма, ${options.symbol}`, name: 'amount', type: 'decimal', value: values.amount, placeholder: '13 000', width: 130, required: true, error: errors.amount })}
          ${field({ label: 'Число', name: 'day', type: 'integer', min: 1, max: 31, value: values.day, placeholder: '25', width: 84, required: true, error: errors.day })}
        </span>
        <span class="regular-actions">
          ${button({ label: options.submitLabel, submit: true })}
          ${options.deleteAction ? html`<button class="regular-quiet danger" type="submit" formaction="${options.deleteAction}" formnovalidate>Удалить</button>` : null}
          ${options.cancelHref ? html`<a class="regular-quiet" href="${options.cancelHref}">Отмена</a>` : null}
        </span>
      </form>
    </li>`;
}

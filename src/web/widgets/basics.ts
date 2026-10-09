// Small building blocks that cards and panels are made of.
// Every function exported from src/web/widgets is a widget: it owns its markup and its classes in styles.css,
// and it has stories in src/web/stories.ts, which /storyboard shows.

import { percent } from '../format.ts';
import { html, type Content, type Html } from '../html.ts';
import { icon, type IconName } from '../icons.ts';
import { toneColor, type Tone } from '../tones.ts';

/** The main action. With `action` it submits a POST form to that URL; with `submit`, the form it is in. */
export function button(options: { label: string; icon?: IconName; action?: string; submit?: boolean }): Html {
  const inner = html`${options.icon ? icon(options.icon, 14) : null}${options.label}`;
  return options.action
    ? html`<form class="button-form" method="post" action="${options.action}"><button class="button" type="submit">${inner}</button></form>`
    : html`<button class="button" type="${options.submit ? 'submit' : 'button'}">${inner}</button>`;
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

/** Mutually exclusive choices as links, such as the kind of operations; the current one is highlighted. */
export function segmentedLinks(options: { label: string; items: Array<{ label: string; href: string; active?: boolean; count?: number }> }): Html {
  return html`<nav class="segmented" aria-label="${options.label}">${options.items.map(
    (item) =>
      html`<a class="segment" href="${item.href}"${item.active ? html` aria-current="page"` : null}>${item.label}${
        item.count === undefined ? null : html`<span>${item.count}</span>`
      }</a>`,
  )}</nav>`;
}

/** A search box that submits a GET form; `params` keep the other filters. */
export function searchField(options: { action: string; name: string; value?: string; placeholder: string; params?: Record<string, string> }): Html {
  return html`
    <form class="search" method="get" action="${options.action}" role="search">
      ${icon('search', 15)}
      <input type="search" name="${options.name}" value="${options.value ?? ''}" placeholder="${options.placeholder}" aria-label="${options.placeholder}">
      ${Object.entries(options.params ?? {}).map(([name, value]) => html`<input type="hidden" name="${name}" value="${value}">`)}
    </form>`;
}

/** A filter in effect; the link removes it. */
export function filterTag(options: { label: string; href: string; color?: string }): Html {
  return html`<a class="filter-tag" href="${options.href}" title="Убрать фильтр">${
    options.color ? html`<i style="background:${options.color}"></i>` : null
  }${options.label}${icon('x', 13)}</a>`;
}

/**
 * A labelled input of a form. `decimal` and `integer` bring up a number keyboard on phones; `date` a date picker,
 * which sends 2026-10-25; `password` hides what is typed. Without `width` the field takes the free space of its row.
 * An error shows under it and marks it invalid.
 */
export function field(options: {
  label: string;
  name: string;
  value?: string;
  type?: 'text' | 'decimal' | 'integer' | 'date' | 'password';
  min?: number;
  max?: number;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  width?: number;
  error?: string;
}): Html {
  const type = options.type ?? 'text';
  return html`<label class="field${options.width ? ' fixed' : ''}"${options.width ? html` style="--field-width:${options.width}px"` : null}>
    <span class="field-label">${options.label}</span>
    <input class="field-input" name="${options.name}" value="${options.value ?? ''}" autocomplete="off"${
      type === 'integer'
        ? html` type="number" inputmode="numeric" step="1"`
        : type === 'date' || type === 'password'
          ? html` type="${type}"`
          : html` type="text"${type === 'decimal' ? html` inputmode="decimal"` : null}`
    }${options.min === undefined ? null : html` min="${options.min}"`}${options.max === undefined ? null : html` max="${options.max}"`}${
      options.maxLength === undefined ? null : html` maxlength="${options.maxLength}"`
    }${options.placeholder ? html` placeholder="${options.placeholder}"` : null}${options.required ? html` required` : null}${
      options.error ? html` aria-invalid="true"` : null
    }>
    ${options.error ? html`<small class="field-error">${options.error}</small>` : null}
  </label>`;
}

/**
 * A labelled choice from a list, in groups when the list has things of different kinds. With a placeholder and no
 * value nothing is chosen, so a required one makes the user pick. Empty groups are left out.
 */
export function selectField(options: {
  label: string;
  name: string;
  value?: string;
  groups: Array<{ label: string; options: Array<{ value: string; label: string }> }>;
  placeholder?: string;
  required?: boolean;
  width?: number;
}): Html {
  const value = options.value ?? '';
  return html`<label class="field${options.width ? ' fixed' : ''}"${options.width ? html` style="--field-width:${options.width}px"` : null}>
    <span class="field-label">${options.label}</span>
    <select class="field-input field-select" name="${options.name}"${options.required ? html` required` : null}>${
      options.placeholder ? html`<option value="" disabled${value === '' ? html` selected` : null}>${options.placeholder}</option>` : null
    }${options.groups
      .filter((group) => group.options.length > 0)
      .map(
        (group) =>
          html`<optgroup label="${group.label}">${group.options.map(
            (option) => html`<option value="${option.value}"${option.value === value ? html` selected` : null}>${option.label}</option>`,
          )}</optgroup>`,
      )}</select>
  </label>`;
}

/**
 * A choice of an icon, tinted with the colour of the form it is in. `auto`, the first choice, sends an empty value:
 * the icon is then picked for the entry, such as by its title.
 */
export function iconPicker(options: {
  label: string;
  name: string;
  /** The picked icon, or empty for `auto`. */
  value: string;
  icons: ReadonlyArray<{ icon: IconName; label: string }>;
  auto?: { icon: IconName; label: string };
}): Html {
  const choice = (value: string, label: string, inner: Html, wide = false) =>
    html`<label class="icon-choice${wide ? ' wide' : ''}" title="${label}"><input type="radio" name="${options.name}" value="${value}" aria-label="${label}"${
      value === options.value ? html` checked` : null
    }><span>${inner}</span></label>`;
  return html`<fieldset class="icon-picker">
    <legend class="field-label">${options.label}</legend>
    <span class="icon-choices">${options.auto ? choice('', options.auto.label, html`${icon(options.auto.icon, 16)}${options.auto.label}`, true) : null}${options.icons.map(
      (i) => choice(i.icon, i.label, icon(i.icon, 16)),
    )}</span>
  </fieldset>`;
}

/**
 * Choices made in one click, under a label, such as the category to put an expense into: each choice posts a form to
 * its URL. The current one is highlighted and posts nothing; a suggested one is marked. `other` lists the rest, for a
 * choice that is not among the buttons; it posts the picked value as `name` with its own button.
 */
export function choiceGroup(options: {
  label: string;
  choices: Array<{
    label: string;
    /** Quieter text after the label, such as a date and an amount. */
    detail?: string;
    /** Where the choice posts; a current choice needs none. */
    action?: string;
    current?: boolean;
    suggested?: boolean;
    /** A dot in this colour, such as the category's. */
    color?: string;
  }>;
  other?: {
    label: string;
    action: string;
    name: string;
    placeholder: string;
    submitLabel: string;
    groups: Array<{ label: string; options: Array<{ value: string; label: string }> }>;
  };
  /** Shown instead of choices when there are none, such as why the choice is not up to the user. */
  empty?: string;
}): Html {
  const inner = (c: (typeof options.choices)[number]) =>
    html`${c.suggested && !c.current ? icon('sparkles', 12) : null}${c.current ? icon('check', 12) : null}${
      c.color ? html`<i style="background:${c.color}"></i>` : null
    }<span>${c.label}${c.detail ? html` <small>${c.detail}</small>` : null}</span>`;
  return html`<div class="choices" role="group" aria-label="${options.label}">
    <span class="choices-label">${options.label}</span>
    <span class="choices-list">${options.choices.map((c) =>
      c.current || !c.action
        ? html`<span class="choice${c.current ? ' current' : ''}"${c.current ? html` aria-current="true"` : null}>${inner(c)}</span>`
        : html`<form method="post" action="${c.action}"><button class="choice${c.suggested ? ' suggested' : ''}" type="submit"${
            c.suggested ? html` title="Подсказка"` : null
          }>${inner(c)}</button></form>`,
    )}${options.choices.length === 0 && options.empty ? html`<span class="choices-empty">${options.empty}</span>` : null}</span>
    ${options.other
      ? html`<form class="choices-other" method="post" action="${options.other.action}">${selectField({
          label: options.other.label,
          name: options.other.name,
          placeholder: options.other.placeholder,
          required: true,
          groups: options.other.groups,
        })}${button({ label: options.other.submitLabel, submit: true })}</form>`
      : null}
  </div>`;
}

/**
 * One text field with its own button, posting a form to its URL, such as a description of an expense. An empty field
 * posts too, to clear what was there.
 */
export function inlineForm(options: {
  label: string;
  action: string;
  name: string;
  value?: string;
  placeholder?: string;
  maxLength?: number;
  submitLabel: string;
}): Html {
  return html`<form class="inline-form" method="post" action="${options.action}">${field({
    label: options.label,
    name: options.name,
    value: options.value,
    placeholder: options.placeholder,
    maxLength: options.maxLength,
  })}${button({ label: options.submitLabel, submit: true })}</form>`;
}

/** Facts about something, a label and a value each, in a row that wraps, such as when and from where an expense was paid. */
export function factList(options: { label: string; items: Array<{ label: string; value: string }> }): Html {
  return html`<dl class="facts" aria-label="${options.label}">${options.items.map(
    (item) => html`<div class="fact"><dt>${item.label}</dt><dd>${item.value}</dd></div>`,
  )}</dl>`;
}

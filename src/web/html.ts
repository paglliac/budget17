// HTML is built with the html`` tag: every interpolated value is escaped unless it is already Html,
// so markup from widgets nests as is and text from ZenMoney never turns into markup.

export class Html {
  readonly #markup: string;

  constructor(markup: string) {
    this.#markup = markup;
  }

  toString(): string {
    return this.#markup;
  }
}

/** Anything that can go into html``: null, undefined and booleans render as nothing, arrays render in order. */
export type Content = Html | string | number | boolean | null | undefined | readonly Content[];

export function html(strings: TemplateStringsArray, ...values: Content[]): Html {
  let markup = strings[0] ?? '';
  values.forEach((value, i) => {
    markup += render(value) + (strings[i + 1] ?? '');
  });
  return new Html(markup);
}

/** Marks trusted markup, such as icon paths, as Html. Never pass text that comes from data. */
export function raw(markup: string): Html {
  return new Html(markup);
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

function render(value: Content): string {
  if (value === null || value === undefined || typeof value === 'boolean') return '';
  if (value instanceof Html) return value.toString();
  if (Array.isArray(value)) return value.map(render).join('');
  return escape(String(value));
}

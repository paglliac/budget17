// The UI palette. Widgets take a Tone rather than a colour, so every screen draws from the same few colours;
// the colours themselves live in styles.css. Only category colours come from data.

import { titleColor } from './icons.ts';

export const TONES = ['yellow', 'violet', 'teal', 'blue', 'orange', 'pink', 'green', 'red', 'gray'] as const;

export type Tone = (typeof TONES)[number];

/** A CSS value for the tone. */
export function toneColor(tone: Tone): string {
  return `var(--${tone})`;
}

/** Tones for items of a list, such as accounts, in a fixed order. */
export function toneAt(index: number): Tone {
  return LIST_TONES[index % LIST_TONES.length]!;
}

const LIST_TONES: Tone[] = ['yellow', 'violet', 'teal', 'blue', 'orange', 'pink', 'gray'];

export function isTone(name: string): name is Tone {
  return (TONES as readonly string[]).includes(name);
}

/**
 * A category's colour as CSS: the one it has, a tone's name or #rrggbb, else the one its title suggests (see
 * titleColor), else a tone picked by its id, so a category keeps its colour between visits.
 */
export function categoryColor(id: string | null, color: string | null, title?: string): string {
  const own = color ?? (title === undefined ? null : titleColor(title));
  if (own) return isTone(own) ? toneColor(own) : own;
  if (id === null) return toneColor('gray');
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return toneColor(LIST_TONES[hash % (LIST_TONES.length - 1)]!);
}

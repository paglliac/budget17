// The assistant of the month review: its greeting with questions to ask, its answers, and what it found.

import { html, type Html } from '../html.ts';
import { icon, type IconName } from '../icons.ts';
import { toneColor, type Tone } from '../tones.ts';

/** The assistant's greeting: what it did and found, and questions to ask it as chips; the one answered is highlighted. */
export function assistantHero(options: { title: string; text: string; chips: Array<{ label: string; icon: IconName; href: string; active?: boolean }> }): Html {
  return html`
    <section class="assistant">
      <div class="assistant-intro">
        <img class="assistant-orb" src="/apple-touch-icon.png" alt="" width="72" height="72">
        <div><h2>${options.title}</h2><p>${options.text}</p></div>
      </div>
      <nav class="assistant-chips" aria-label="Вопросы ассистенту">${options.chips.map(
        (c) => html`<a class="assistant-chip" href="${c.href}"${c.active ? html` aria-current="true"` : null}>${icon(c.icon, 14)}${c.label}</a>`,
      )}</nav>
    </section>`;
}

/** The assistant's answer to a question: the question, a few paragraphs, and links to what they are about. */
export function assistantAnswer(options: { question: string; paragraphs: string[]; links?: Array<{ label: string; detail?: string; href: string }>; closeHref: string }): Html {
  return html`
    <article class="answer">
      <header class="answer-head"><h3>${icon('sparkles', 14)}${options.question}</h3><a href="${options.closeHref}" aria-label="Закрыть">${icon('x', 14)}</a></header>
      ${options.paragraphs.map((p) => html`<p>${p}</p>`)}
      ${options.links?.length
        ? html`<ul class="answer-links">${options.links.map(
            (l) => html`<li><a href="${l.href}"><span>${l.label}</span>${l.detail ? html`<b>${l.detail}</b>` : null}${icon('chevronRight', 14)}</a></li>`,
          )}</ul>`
        : null}
    </article>`;
}

/** What the assistant found, each with an icon in a circle, a bold line, a quieter explanation and a link to more. */
export function insightList(options: { label: string; items: Array<{ icon: IconName; tone: Tone; title: string; text: string; href?: string }> }): Html {
  return html`<ul class="insights" aria-label="${options.label}">${options.items.map((item) => {
    const inner = html`<span class="insight-icon" style="--tone:${toneColor(item.tone)}">${icon(item.icon, 16)}</span><span class="insight-text"><b>${item.title}</b><small>${item.text}</small></span>${
      item.href ? html`<span class="insight-go">${icon('chevronRight', 16)}</span>` : null
    }`;
    return html`<li>${item.href ? html`<a class="insight" href="${item.href}">${inner}</a>` : html`<span class="insight">${inner}</span>`}</li>`;
  })}</ul>`;
}

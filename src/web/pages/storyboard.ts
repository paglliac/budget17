// /storyboard: the catalogue of colours, icons and widgets, each widget in its typical states with the code
// that renders it. Screens are built only from these widgets, so this page is what every screen is made of.

import { pageDocument } from '../document.ts';
import { html, Html } from '../html.ts';
import { icon, ICON_NAMES } from '../icons.ts';
import { GROUPS, type WidgetDoc } from '../stories.ts';

export function renderStoryboard(docs: WidgetDoc[], stylesheet: string): Html {
  const tokens = cssTokens(stylesheet).filter((t) => t.value.startsWith('#'));
  const groups = GROUPS.map((group) => ({ group, docs: docs.filter((d) => d.group === group) })).filter((g) => g.docs.length > 0);

  return pageDocument({
    title: 'Бюджет: виджеты',
    styles: STYLES,
    body: html`
      <div class="sb">
        <nav class="sb-nav" aria-label="Содержание">
          <a class="sb-back" href="/">${icon('chevronLeft', 14)}Обзор</a>
          <a href="#colors">Цвета</a>
          <a href="#icons">Иконки</a>
          ${groups.map(
            (g) => html`<p>${g.group}</p>${g.docs.map((d) => html`<a href="#${d.name}"><code>${d.name}</code></a>`)}`,
          )}
        </nav>
        <main class="sb-main">
          <header class="sb-head">
            <h1>Виджеты</h1>
            <p>Всё, из чего собраны экраны. Страницы не добавляют своей разметки и стилей, поэтому одинаковые вещи везде выглядят одинаково.
            Новый виджет живёт в <code>src/web/widgets</code>, его состояния описаны в <code>src/web/stories.ts</code>, а тест не даст забыть про историю.</p>
          </header>

          <section id="colors" class="sb-block">
            <h2>Цвета</h2>
            <p class="sb-desc">Токены из <code>styles.css</code>. Акцентные цвета виджеты получают через тон: <code>tone: 'violet'</code>.</p>
            <div class="sb-swatches">${tokens.map(
              (t) => html`<div class="sb-swatch"><span style="background:var(--${t.name})"></span><b>--${t.name}</b><small>${t.value}</small></div>`,
            )}</div>
          </section>

          <section id="icons" class="sb-block">
            <h2>Иконки</h2>
            <p class="sb-desc"><code>icon('wallet', 16)</code> рисует иконку цветом текста вокруг.</p>
            <div class="sb-icons">${ICON_NAMES.map((name) => html`<div class="sb-icon">${icon(name, 20)}<small>${name}</small></div>`)}</div>
          </section>

          ${groups.map(
            (g) => html`
              <h2 class="sb-group">${g.group}</h2>
              ${g.docs.map(
                (d) => html`
                  <section id="${d.name}" class="sb-block">
                    <h2><code>${d.name}</code></h2>
                    <p class="sb-desc">${d.description}</p>
                    <div class="sb-stories">${d.stories.map(
                      (story) => html`
                        <figure class="sb-story${story.width ? '' : ' wide'}${story.surface === 'page' ? ' on-page' : ''}">
                          <figcaption>${story.name}</figcaption>
                          <div class="sb-frame"${story.width ? html` style="width:${story.width + 40}px"` : null}>${story.render()}</div>
                          <details><summary>Код</summary><pre><code>${usage(d.name, story.props)}</code></pre></details>
                        </figure>`,
                    )}</div>
                  </section>`,
              )}`,
          )}
        </main>
      </div>`,
  });
}

/** Custom properties from the first :root block of the stylesheet. */
export function cssTokens(stylesheet: string): Array<{ name: string; value: string }> {
  const root = /:root\s*\{([^}]*)\}/.exec(stylesheet)?.[1] ?? '';
  return [...root.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => ({ name: m[1]!, value: m[2]!.trim() }));
}

function usage(name: string, props: unknown): string {
  const json = JSON.stringify(props, (_key, value: unknown) => (value instanceof Html ? 'html`…`' : value), 2);
  return `${name}(${json.replace(/"(\w+)":/g, '$1:').replace(/"html`…`"/g, 'html`…`')})`;
}

const STYLES = `
body { padding: 0; background: var(--shell); }
.sb { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: 100vh; }
.sb-nav { position: sticky; top: 0; display: flex; flex-direction: column; gap: 2px; height: 100vh; overflow: auto; padding: 24px 14px; border-right: 1px solid var(--line); }
.sb-nav a { padding: 5px 10px; border-radius: 8px; font-size: 13px; color: var(--text); }
.sb-nav a:hover { background: rgb(0 0 0 / .04); }
.sb-nav p { margin: 16px 10px 4px; font-size: 12px; color: var(--muted); }
.sb-nav .sb-back { display: flex; align-items: center; gap: 6px; margin-bottom: 14px; color: var(--muted); }
.sb-nav code, .sb-block h2 code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
.sb-main { max-width: 1180px; padding: 36px 40px 80px; }
.sb-head h1 { font-size: 28px; font-weight: 500; }
.sb-head p { max-width: 70ch; margin-top: 8px; color: var(--text); }
.sb-head code, .sb-desc code { padding: 1px 5px; border-radius: 5px; background: var(--fill); font-size: 12.5px; }
.sb-group { margin: 56px 0 -12px; font-size: 22px; font-weight: 500; }
.sb-block { margin-top: 36px; scroll-margin-top: 20px; }
.sb-block > h2 { font-size: 17px; font-weight: 500; }
.sb-block h2 code { font-size: 16px; }
.sb-desc { margin-top: 4px; color: var(--muted); }
.sb-stories { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 14px; }
.sb-story { display: grid; gap: 8px; align-content: start; }
.sb-story.wide { flex: 1 1 100%; }
.sb-story figcaption { font-size: 12px; color: var(--muted); }
.sb-frame { max-width: 100%; padding: 20px; background: var(--panel); border-radius: var(--radius-panel); }
.sb-story.on-page .sb-frame { background: var(--page); }
.sb-story details { font-size: 12px; color: var(--muted); }
.sb-story summary { cursor: pointer; width: max-content; }
.sb-story pre { max-width: 560px; margin-top: 6px; padding: 12px; overflow: auto; border-radius: 10px; background: var(--panel); color: var(--text); font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.sb-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-top: 14px; }
.sb-swatch { display: grid; grid-template-columns: 36px 1fr; column-gap: 10px; align-items: center; padding: 8px; background: var(--panel); border-radius: 12px; }
.sb-swatch span { grid-row: span 2; width: 36px; height: 36px; border-radius: 9px; box-shadow: inset 0 0 0 1px rgb(0 0 0 / .06); }
.sb-swatch b { font-size: 12px; font-weight: 500; }
.sb-swatch small { font-size: 11px; color: var(--muted); }
.sb-icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; margin-top: 14px; }
.sb-icon { display: grid; justify-items: center; gap: 8px; padding: 14px 6px 10px; background: var(--panel); border-radius: 12px; color: var(--ink); }
.sb-icon small { font-size: 11px; color: var(--muted); }
@media (max-width: 820px) {
  .sb { grid-template-columns: minmax(0, 1fr); }
  .sb-nav { display: none; }
  .sb-main { padding: 20px 16px 60px; }
}
`;

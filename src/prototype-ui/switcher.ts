// Floating bar that flips between prototype variants: arrows, ← / → keys, and ?variant= in the URL.
// Deliberately loud blue and monospace so it never reads as part of a design.
// PROTOTYPE: throwaway code, see server.ts.

import type { Source } from './data.ts';
import { esc, json, type Variant } from './shared.ts';

const chevron = (d: string) =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const CHEVRON_LEFT = chevron('m15 18-6-6 6-6');
const CHEVRON_RIGHT = chevron('m9 18 6-6-6-6');

export function switcher(variants: Variant[], current: string, source: Source): string {
  const index = variants.findIndex((v) => v.key === current);
  const variant = variants[index];
  return `
<div id="proto-switcher" role="toolbar" aria-label="Варианты прототипа">
  <button type="button" data-step="-1" aria-label="Предыдущий вариант">${CHEVRON_LEFT}</button>
  <span class="ps-label"><b>${esc(current)}</b> ${esc(variant?.name ?? '')} <span class="ps-count">${index + 1}/${variants.length}</span></span>
  <button type="button" data-step="1" aria-label="Следующий вариант">${CHEVRON_RIGHT}</button>
  <span class="ps-source">${source === 'demo' ? 'демо-данные' : 'ZenMoney'}</span>
</div>
<style>
  #proto-switcher { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 2147483647;
    display: flex; align-items: center; gap: 4px; padding: 5px; border-radius: 999px; background: #1F4BFF; color: #fff;
    font: 500 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace; box-shadow: 0 10px 30px -8px rgb(31 75 255 / .6), 0 0 0 3px rgb(255 255 255 / .9); }
  #proto-switcher button { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 999px;
    background: rgb(255 255 255 / .16); color: inherit; cursor: pointer; }
  #proto-switcher button:hover { background: rgb(255 255 255 / .28); }
  #proto-switcher button:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
  #proto-switcher .ps-label { padding: 0 10px; white-space: nowrap; }
  #proto-switcher .ps-label b { display: inline-block; min-width: 20px; padding: 3px 6px; margin-right: 4px; border-radius: 6px; background: #fff; color: #1F4BFF; text-align: center; }
  #proto-switcher .ps-count, #proto-switcher .ps-source { opacity: .7; }
  #proto-switcher .ps-source { padding: 0 12px 0 8px; border-left: 1px solid rgb(255 255 255 / .3); white-space: nowrap; }
</style>
<script>
  (function () {
    var keys = ${json(variants.map((v) => v.key))};
    var current = ${json(current)};
    function go(step) {
      var next = keys[(keys.indexOf(current) + step + keys.length) % keys.length];
      var url = new URL(location.href);
      url.searchParams.set('variant', next);
      location.replace(url.toString());
    }
    document.querySelectorAll('#proto-switcher [data-step]').forEach(function (button) {
      button.addEventListener('click', function () { go(Number(button.dataset.step)); });
    });
    document.addEventListener('keydown', function (event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      var target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    });
  })();
</script>`;
}

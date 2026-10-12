// PROTOTYPE, throwaway (branch prototype/return-rules): the floating bar that switches how a spend with money back
// counts (see src/returns.prototype.ts), and leads to the weeks where such pairs are.

import { RETURNS_VARIANTS, returnsVariant } from '../returns.prototype.ts';

const EXAMPLES: ReadonlyArray<[string, string]> = [
  ['/?week=2026-10-10', 'АЗС 10 окт.: сдача 186,55'],
  ['/?week=2026-09-26', 'Командировка: 28 и 29 сен.'],
  ['/?week=2026-06-20', 'CHICKO и Александр К., 23 июня'],
  ['/?week=2026-04-04', 'Ночь на 5 апр.: двое по 5 900'],
  ['/?week=2026-04-25', 'Vseinstrumenti.ru: потратили 1 мая'],
  ['/?week=2026-05-16', 'Vseinstrumenti.ru: вернули 18 мая'],
  ['/?week=2026-08-08', 'Влас М.: дал 100 000 11 авг.'],
  ['/?week=2026-08-15', 'Влас М.: отдали 21 авг.'],
  ['/?week=2026-07-04', 'Авиабилеты 6 июля'],
  ['/?week=2026-07-25', 'Возмещение авиабилетов 27 июля'],
  ['/?week=2025-12-27', 'Александр Т.: 10 000 28 дек.'],
  ['/?week=2026-01-03', 'Александр Т.: вернул 4 608 3 янв.'],
  ['/operations?month=2026-07', 'Операции июля'],
  ['/review?month=2026-07', 'Разбор июля'],
];

export function withReturnsSwitcher(page: string): string {
  const current = returnsVariant();
  const index = RETURNS_VARIANTS.findIndex((v) => v.key === current);
  const variant = RETURNS_VARIANTS[index]!;
  const keys = JSON.stringify(RETURNS_VARIANTS.map((v) => v.key));
  const bar = `
<div id="proto-switcher" role="toolbar" aria-label="Варианты прототипа">
  <a href="#" aria-label="Предыдущий вариант" data-dir="-1">‹</a>
  <span><b>${variant.key}</b> ${variant.name} <i>${index + 1}/${RETURNS_VARIANTS.length}</i></span>
  <a href="#" aria-label="Следующий вариант" data-dir="1">›</a>
  <select aria-label="Примеры" onchange="if (this.value) location.href = this.value">
    <option value="">Примеры</option>
    ${EXAMPLES.map(([href, label]) => `<option value="${href}">${label}</option>`).join('\n    ')}
  </select>
</div>
<script>
  (() => {
    const keys = ${keys};
    const go = (dir) => {
      const url = new URL(location.href);
      url.searchParams.set('variant', keys[(keys.indexOf(${JSON.stringify(current)}) + dir + keys.length) % keys.length]);
      location.href = url;
    };
    for (const a of document.querySelectorAll('#proto-switcher [data-dir]')) a.addEventListener('click', (e) => { e.preventDefault(); go(Number(a.dataset.dir)); });
    addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    });
  })();
</script>
<style>
  #proto-switcher { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 2147483647; display: flex; align-items: center; gap: 4px;
    max-width: calc(100vw - 16px); padding: 5px; border-radius: 999px; background: #1F4BFF; color: #fff; font: 500 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    box-shadow: 0 10px 30px -8px rgb(31 75 255 / .6), 0 0 0 3px rgb(255 255 255 / .9); }
  #proto-switcher a { display: grid; flex: none; place-items: center; width: 30px; height: 30px; border-radius: 999px; background: rgb(255 255 255 / .16); color: #fff; font-size: 18px; }
  #proto-switcher a:hover { background: rgb(255 255 255 / .28); }
  #proto-switcher span { padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #proto-switcher b { display: inline-block; padding: 3px 6px; margin-right: 4px; border-radius: 6px; background: #fff; color: #1F4BFF; }
  #proto-switcher i { font-style: normal; opacity: .7; }
  #proto-switcher select { height: 30px; max-width: 120px; padding: 0 8px; border: 0; border-radius: 999px; background: rgb(255 255 255 / .16); color: #fff; font: inherit; font-size: 11px; }
  #proto-switcher option { color: #000; }
</style>`;
  return page.replace('</body>', `${bar}\n</body>`);
}

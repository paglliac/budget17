import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { cssTokens, renderStoryboard } from '../src/web/pages/storyboard.ts';
import { WIDGET_DOCS } from '../src/web/stories.ts';

// Every function exported from any module in src/web/widgets is a widget.
const widgetsDir = new URL('../src/web/widgets/', import.meta.url);
const modules = await Promise.all(
  readdirSync(widgetsDir)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => import(new URL(file, widgetsDir).href) as Promise<Record<string, unknown>>),
);
const widgets = modules.flatMap((module) =>
  Object.values(module).filter((value): value is (...args: never[]) => unknown => typeof value === 'function'),
);
const stylesheet = readFileSync(new URL('../src/web/styles.css', import.meta.url), 'utf8');

describe('storyboard', () => {
  it('has stories for every widget', () => {
    assert.ok(widgets.length >= 20, `found only ${widgets.length} widgets`);
    const missing = widgets.filter((widget) => !WIDGET_DOCS.some((doc) => doc.widget === widget)).map((w) => w.name);
    assert.deepEqual(missing, [], 'Добавьте истории для этих виджетов в src/web/stories.ts');
  });

  it('renders every story', () => {
    for (const doc of WIDGET_DOCS) {
      assert.ok(doc.stories.length > 0, `${doc.name}: нет историй`);
      for (const story of doc.stories) {
        assert.match(String(story.render()), /^\s*</, `${doc.name} / ${story.name}`);
      }
    }
  });

  it('shows every widget, colour token and the code for each story', () => {
    const page = String(renderStoryboard(WIDGET_DOCS, stylesheet));
    for (const doc of WIDGET_DOCS) assert.ok(page.includes(`id="${doc.name}"`), doc.name);
    assert.ok(page.includes('--violet'));
    assert.ok(page.includes('statCard({'));
  });

  it('reads custom properties from the :root block only', () => {
    assert.deepEqual(cssTokens(':root { --ink: #111; --gap: 12px; } .x { --local: red; }'), [
      { name: 'ink', value: '#111' },
      { name: 'gap', value: '12px' },
    ]);
  });
});

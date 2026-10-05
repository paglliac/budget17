import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { cssTokens, renderStoryboard } from '../src/web/pages/storyboard.ts';
import { WIDGET_DOCS } from '../src/web/stories.ts';
import * as accounts from '../src/web/widgets/accounts.ts';
import * as basics from '../src/web/widgets/basics.ts';
import * as calendar from '../src/web/widgets/calendar.ts';
import * as cards from '../src/web/widgets/cards.ts';
import * as shell from '../src/web/widgets/shell.ts';

const widgets = [accounts, basics, calendar, cards, shell].flatMap((module) =>
  Object.values(module).filter((value): value is (...args: never[]) => unknown => typeof value === 'function'),
);
const stylesheet = readFileSync(new URL('../src/web/styles.css', import.meta.url), 'utf8');

describe('storyboard', () => {
  it('has stories for every widget', () => {
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

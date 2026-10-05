import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { daysLeft, money, moneyParts, monthName, plural } from '../src/web/format.ts';
import { html, raw } from '../src/web/html.ts';

describe('html', () => {
  it('escapes interpolated text', () => {
    const payee = '<script>alert("x")</script> & Co';
    assert.equal(String(html`<b title="${payee}">${payee}</b>`),
      '<b title="&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co">&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co</b>');
  });

  it('nests Html as is, joins arrays and skips empty values', () => {
    const items = ['a', 'b'].map((x) => html`<li>${x}</li>`);
    assert.equal(String(html`<ul>${items}${null}${undefined}${false}</ul>`), '<ul><li>a</li><li>b</li></ul>');
    assert.equal(String(html`${raw('<i></i>')}${0}`), '<i></i>0');
  });
});

describe('format', () => {
  it('formats money with a real minus, an optional plus and a non-breaking space', () => {
    assert.equal(money(12340.4, '₽'), '12 340 ₽');
    assert.equal(money(-650, '₽'), '−650 ₽');
    assert.equal(money(142000, '₽', { sign: true }), '+142 000 ₽');
    assert.equal(money(0.3, '₽', { sign: true }), '0 ₽');
    assert.equal(money(12.99, '$', { cents: true }), '12,99 $');
  });

  it('splits kopecks off a total', () => {
    assert.deepEqual(moneyParts(606472.4, '₽'), { whole: '606 472', rest: ',40 ₽' });
    assert.deepEqual(moneyParts(-5, '₽'), { whole: '−5', rest: ',00 ₽' });
  });

  it('picks Russian plural forms', () => {
    const forms = ['день', 'дня', 'дней'] as const;
    assert.deepEqual([1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => plural(n, forms)), [
      'день', 'дня', 'дней', 'дней', 'дней', 'день', 'дня', 'дней', 'дней',
    ]);
  });

  it('names months in three forms and days left in words', () => {
    assert.equal(monthName('2026-10'), 'октябрь');
    assert.equal(monthName('2026-10-05', 'genitive'), 'октября');
    assert.equal(monthName('2026-05', 'prepositional'), 'мае');
    assert.deepEqual([0, 1, 3, 7].map(daysLeft), ['сегодня', 'завтра', '3 дня', '7 дней']);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { studyMarkup } from '../public/js/study.js';
import { getLocale, msg, setLocale } from '../public/js/locale.js';

test('course math, chemistry and native Unicode survive safe mixed-text formatting', () => {
  const html = studyMarkup(
    String.raw`Given \(P(A\mid B)\), compute $$\frac{P(A\cap B)}{P(B)}$$. Then $\ce{2H2 + O2 -> 2H2O}$.`,
  );
  assert.equal((html.match(/class="katex"/g) || []).length, 3);
  assert.match(html, /<mfrac>/);
  assert.match(html, /<msub>/);
  assert.match(html, /<math [^>]*display="block"/);
  assert.match(studyMarkup('NH<sub>4</sub><sup>+</sup>'), /NH<sub>4<\/sub><sup>\+<\/sup>/);
  assert.match(studyMarkup('∀x ∈ ℝ'), /∀x ∈ ℝ/);
});

test('fenced code, prices and escaped delimiters remain literal; tables keep math within its cell', () => {
  const source = [
    '```python',
    'if x < 3:',
    '    print("$x$")',
    '```',
    '| Event | Cost |',
    '| --- | --- |',
    '| $P(A|B)$ | $5 to $10 |',
  ].join('\n');
  const html = studyMarkup(source);
  assert.equal((html.match(/role="cell"/g) || []).length, 2);
  assert.equal((html.match(/class="katex"/g) || []).length, 1);
  assert.match(html, /    print\(&quot;\$x\$&quot;\)/);
  assert.match(html, /\$5 to \$10/);
  assert.match(studyMarkup(String.raw`\$12 and `), /\$12/);
  assert.match(studyMarkup(String.raw`\(\bogus{x}\)`), /study-tex-source/);
  const untrusted = studyMarkup(String.raw`<img src=x> \(\href{javascript:alert(1)}{x}\)`);
  assert.doesNotMatch(untrusted, /<img|<a\s+href=/);
  assert.match(untrusted, /&lt;img/);
});

test('locale uses only the two supported values', () => {
  setLocale('en');
  assert.equal(msg('中文', 'English'), 'English');
  setLocale('de');
  assert.equal(getLocale(), 'en');
  setLocale('zh');
  assert.equal(msg('中文', 'English'), '中文');
});

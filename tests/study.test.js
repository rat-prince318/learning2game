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

test('legacy unmarked functions and numerical fractions render within prose while code stays literal', () => {
  const html = studyMarkup('函数 f(x)=3x+2 的平均变化率。换成 f(x)=x^2，可用 (9-1)/(3-1)=4 验算。');
  assert.equal((html.match(/class="katex"/g) || []).length, 3);
  assert.match(html, /<msup>/);
  assert.match(html, /<mfrac>/);
  assert.doesNotMatch(studyMarkup('let f(x)==true; 文件 read(x)=source，单位 km/h，日期 11/24。'), /class="katex"/);
  assert.doesNotMatch(studyMarkup('`f(x)=x^2`'), /class="katex"/);
});

test('locale uses only the two supported values', () => {
  setLocale('en');
  assert.equal(msg('中文', 'English'), 'English');
  setLocale('de');
  assert.equal(getLocale(), 'en');
  setLocale('zh');
  assert.equal(msg('中文', 'English'), '中文');
});

import katex from '../study/katex/tex.mjs';
import { displayText, escapeHtml } from './utils.js';
import { msg } from './locale.js';

const formulaCache = new Map();
const normalizeDots = (text) => text.replace(/\u00b7/g, '\u22c5');

function formula(tex, display) {
  const key = (display ? 'D' : 'I') + tex;
  if (formulaCache.has(key)) return formulaCache.get(key);
  let html;
  try {
    if (tex.length > 4096) throw new RangeError();
    html = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: true,
      trust: false,
      strict: 'ignore',
      maxSize: 12,
      maxExpand: 600,
      output: 'htmlAndMathml',
    });
  } catch {
    html = '<code class="study-tex-source">' + escapeHtml(tex) + '</code>';
  }
  const wrapped =
    '<span class="study-math' + (display ? ' study-display' : '') + '">' + html + '</span>';
  if (formulaCache.size >= 160) formulaCache.delete(formulaCache.keys().next().value);
  formulaCache.set(key, wrapped);
  return wrapped;
}

function prose(text) {
  const safe = displayText(
    text,
    msg('请参阅原资料对应段落。', 'See the corresponding passage in your material.'),
  );
  // Keep spacing at math and code boundaries, including whitespace-only segments.
  if (safe === text.trim()) return escapeHtml(text);
  return escapeHtml(text.replace(text.trim(), safe));
}

// Only explicit academic markup is interpreted. HTML, JS and URLs remain text.
const inlineToken =
  /\\\$|\x60([^\x60\n]+)\x60|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|(?<!\\)\$(?!\s)((?:\\.|[^$\n])+?)(?<![\s\\])\$(?!\d)|<(sub|sup)>([^<>\n]{1,64})<\/\6>/gi;
const rawFormula =
  /^(?:\\(?:frac|sum|prod|sqrt|int|lim|mathrm|mathbb|mathbf|begin|ce|pu)\b|[A-Za-z][A-Za-z0-9_{}^()[\]|\\ ]{0,20}\s*=\s*\\(?:frac|sum|sqrt|int|begin)\b)/;
function inline(text) {
  const trimmed = text.trim();
  if (rawFormula.test(trimmed) && !/[\u3400-\u9fff。！？]/u.test(trimmed))
    return formula(trimmed, false);
  let html = '',
    start = 0;
  for (const match of text.matchAll(inlineToken)) {
    html += prose(text.slice(start, match.index));
    const [token, code, parens, brackets, dollars, single, tag, script] = match;
    if (code !== undefined) html += '<code class="study-code">' + escapeHtml(code) + '</code>';
    else if (tag)
      html += '<' + tag.toLowerCase() + '>' + escapeHtml(script) + '</' + tag.toLowerCase() + '>';
    else if (token === '\\$') html += '$';
    else
      html += formula(
        parens ?? brackets ?? dollars ?? single,
        brackets !== undefined || dollars !== undefined,
      );
    start = match.index + token.length;
  }
  return html + prose(text.slice(start));
}

function cells(line) {
  // Protect the vertical bar in P(A|B), inline code and escaped table pipes.
  const guarded = line
    .trim()
    .replace(inlineToken, (token) => token.replaceAll('|', '\u0000'))
    .replace(/\\\|/g, '\u0000')
    .replace(/^\||\|$/g, '');
  return guarded.split('|').map((cell) => cell.replaceAll('\u0000', '|').trim());
}
const separator = (line) =>
  line?.includes('|') && cells(line).every((cell) => /^:?-{3,}:?$/.test(cell));
function table(rows) {
  const width = rows[0].length;
  return (
    '<span class="study-scroll"><span role="table" class="study-table">' +
    rows
      .map(
        (row, i) =>
          '<span role="row">' +
          Array.from(
            { length: width },
            (_, j) =>
              '<span role="' +
              (i ? 'cell' : 'columnheader') +
              '">' +
              inline(row[j] ?? '') +
              '</span>',
          ).join('') +
          '</span>',
      )
      .join('') +
    '</span></span>'
  );
}

export function studyMarkup(value) {
  const lines = normalizeDots(String(value ?? ''))
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const out = [],
    plain = [];
  const flush = () => {
    if (plain.length) {
      out.push(inline(plain.join('\n')));
      plain.length = 0;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const fence = /^\s*(\x60{3,}|~{3,})(?:[\w.+#-]+)?\s*$/.exec(lines[i]);
    if (fence) {
      flush();
      const code = [];
      const closing = new RegExp('^\\s*' + fence[1][0] + '{' + fence[1].length + ',}\\s*$');
      while (++i < lines.length && !closing.test(lines[i])) code.push(lines[i]);
      out.push(
        '<span class="study-code-block"><code>' + escapeHtml(code.join('\n')) + '</code></span>',
      );
    } else if (lines[i].includes('|') && separator(lines[i + 1])) {
      flush();
      const rows = [cells(lines[i])];
      i++;
      while (i + 1 < lines.length && lines[i + 1].includes('|')) rows.push(cells(lines[++i]));
      out.push(table(rows));
    } else plain.push(lines[i]);
  }
  flush();
  return '<span class="study-content">' + out.join('\n') + '</span>';
}

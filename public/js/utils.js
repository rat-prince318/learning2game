import { msg, getLocale } from './locale.js';
import { ui } from './studio-copy.js';
const unsuitable =
  /(?:并不|并非|并不是|而非|而是|不是|不代表|不等于|不等同|不意味着|不保证|不构成|不必然|不一定|不完全|不证明|不只|不单|不光|不仅|不只是|不能|尚不能|[只仅]能(?:说明|证明)|不足以|无法(?:说明|证明)|更准确地说|\bnot\s+(?:only|just|simply|merely)\b|\bnot\b.{0,180}\b(?:but|rather|instead)\b|\brather than\b)/iu;

// Keep raw values for grading and persistence. Withhold a whole unsafe clause;
// a rewrite could accidentally invert a scientific claim.
export function displayText(value, fallback = ui('请参阅原资料对应段落。')) {
  const text = String(value ?? '')
    .replace(/\u00b7/gu, ' ')
    .trim();
  if (!text || !unsuitable.test(text)) return text;
  const kept = (text.match(/[^。！？!?]+[。！？!?]*|[。！？!?]+/gu) || []).filter(
    (sentence) => !unsuitable.test(sentence),
  );
  return kept.join('').trim() || fallback;
}
export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const h = (value) => escapeHtml(displayText(value));
export const percent = (value) => (value == null ? '—' : `${Math.round(value * 100)}%`);
export const duration = (seconds) =>
  [Math.floor(Math.max(0, seconds) / 60), Math.floor(Math.max(0, seconds) % 60)]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
export function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
}
export function parsePages(text, limit = 10) {
  if (!text.trim()) return [];
  const pages = new Set();
  for (const chunk of text.replace(/，/g, ',').split(',')) {
    const match = chunk.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error(ui('请按 1,3-5 的格式填写页码。'));
    const start = Number(match[1]),
      end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > 10000 || end - start >= limit)
      throw new Error(msg('页码从 1 开始，每次最多选择 ' + limit + ' 页。', 'Use page numbers from 1 and choose up to ' + limit + ' pages.'));
    for (let page = start; page <= end; page++) pages.add(page);
    if (pages.size > limit) throw new Error(msg('每次最多选择 ' + limit + ' 页。', 'Choose up to ' + limit + ' pages.'));
  }
  return [...pages].sort((a, b) => a - b);
}
export function validateFile(file, { supported_extensions, max_upload_bytes }) {
  if (!file || !file.size) throw new Error(ui('请选择一份有内容的课件。'));
  if (file.size > max_upload_bytes)
    throw new Error(
      msg(
        `请将文件控制在 ${Math.ceil(max_upload_bytes / 1048576)} MiB 以内。`,
        `Choose a file up to ${Math.ceil(max_upload_bytes / 1048576)} MiB.`,
      ),
    );
  if (!supported_extensions.includes('.' + file.name.split('.').at(-1).toLowerCase()))
    throw new Error(ui('请使用上传区列出的资料格式。'));
}
export function saveLocal(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* A private browser may disable persistence. */
  }
}
export function readLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}
// Source identifiers and filenames stay verbatim; translate reader-generated coordinates.
export function sourceCitation(value) {
  const source = String(value ?? '');
  const split = source.lastIndexOf(' / ');
  if (getLocale() !== 'en' || split < 0) return source;
  const suffix = source.slice(split + 3);
  const patterns = [
    [/^第 (\d+) 页，第 (\d+) 段$/, 'page $1, paragraph $2'],
    [/^第 (\d+) 页图示$/, 'page $1, figure'],
    [/^第 (\d+) 张幻灯片，表格第 (\d+) 行$/, 'slide $1, table row $2'],
    [/^第 (\d+) 张幻灯片，图 (\d+)$/, 'slide $1, figure $2'],
    [/^第 (\d+) 张幻灯片$/, 'slide $1'],
    [/^表 (\d+) 第 (\d+) 行$/, 'table $1, row $2'],
    [/^第 (\d+) 段$/, 'paragraph $1'],
    [/^第 (\d+) 行$/, 'line $1'],
    [/^插图 (\d+)$/, 'figure $1'],
  ];
  for (const [pattern, translated] of patterns) {
    if (pattern.test(suffix))
      return source.slice(0, split + 3) + suffix.replace(pattern, translated);
  }
  return source;
}
export function sourceMarkup(source) {
  return source
    ? `<div class="source"><span class="source-label">${ui('出处')}</span><strong>${h(sourceCitation(source))}</strong></div>`
    : '';
}

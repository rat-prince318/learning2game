export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const percent = value => value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`;
export const duration = seconds => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;

export function parsePages(text) {
  if (!text.trim()) return [];
  const pages = new Set();
  for (const chunk of text.replace(/，/g, ',').split(',')) {
    const match = chunk.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('页码格式应为 1,3-5。');
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > 10000 || end - start > 9) throw new Error('页码必须从 1 开始，每次最多选择 10 页。');
    for (let page = start; page <= end; page++) pages.add(page);
    if (pages.size > 10) throw new Error('每次最多选择 10 页。');
  }
  return [...pages].sort((a, b) => a - b);
}

export function validateFile(file) {
  if (!file) throw new Error('请先选择学习资料。');
  if (!file.size) throw new Error('文件内容为空，请重新选择。');
  if (file.size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB，请选择较小的资料。');
  if (!/\.(pdf|txt|docx|pptx|png|jpe?g|webp)$/i.test(file.name)) throw new Error('请选择 PDF、TXT、DOCX、PPTX、PNG、JPG 或 WebP 文件。');
  return file;
}

/** Only safe resource schemes are allowed. Never insert document HTML. */
export function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, globalThis.location?.origin || 'http://localhost');
    return ['http:', 'https:', 'blob:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function saveLocal(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch { return false; }
}
export function readLocal(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

export function sourceMarkup(source = {}) {
  const file = escapeHtml(source.file_name || '学习资料');
  const locator = source.page ? ` · 第 ${escapeHtml(source.page)} 页` : source.image_label ? ` · ${escapeHtml(source.image_label)}` : '';
  const url = safeUrl(source.url || source.image_url || '');
  return `<div class="source"><span class="source-label">来源</span><strong>${file}${locator}</strong>${source.snippet ? `<blockquote>${escapeHtml(source.snippet)}</blockquote>` : ''}${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">查看原始资料 ↗</a>` : ''}${source.image_url && safeUrl(source.image_url) ? `<img class="source-image" src="${escapeHtml(safeUrl(source.image_url))}" alt="${escapeHtml(source.image_alt || '知识来源图示')}" loading="lazy">` : ''}</div>`;
}

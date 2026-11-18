import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]));
  return nested.flat();
}
const root = resolve('.');
const paths = (await Promise.all(['public/js', 'server', 'scripts', 'tests'].map(dir => files(join(root, dir))))).flat().filter(path => path.endsWith('.js'));
for (const path of paths) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
}
const html = await readFile(join(root, 'public/index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
if (new Set(ids).size !== ids.length) throw new Error('HTML 存在重复 ID。');
for (const path of ['public/js/app.js', 'public/js/views.js']) {
  const code = await readFile(join(root, path), 'utf8');
  for (const match of code.matchAll(/\$\('([^']+)'\)/g)) if (!ids.includes(match[1])) throw new Error(`${path}: 元素 ${match[1]} 不存在。`);
}
console.log(`静态检查通过：${paths.length} 个 JS 文件；${ids.length} 个唯一 HTML ID。`);

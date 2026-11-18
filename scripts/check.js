import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)])),
    )
  ).flat();
}
const scripts = (await Promise.all(['public/js', 'scripts', 'tests'].map(files)))
  .flat()
  .filter((p) => p.endsWith('.js'));
for (const p of scripts) {
  const run = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  if (run.status !== 0) {
    console.error(run.stderr);
    process.exit(1);
  }
}
const html = await readFile('public/index.html', 'utf8'),
  views = await readFile('public/js/views.js', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
if (new Set(ids).size !== ids.length) throw new Error('HTML IDs must be unique.');
const allIds = new Set([...ids, ...[...views.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])]);
for (const p of ['public/js/app.js', 'public/js/views.js']) {
  const src = await readFile(p, 'utf8');
  for (const m of src.matchAll(/\$\('([^']+)'\)/g))
    if (!allIds.has(m[1])) throw new Error('Unknown element ' + m[1]);
}
for (const p of (await files('public')).filter((path) => /\.(html|css|js|svg|txt|md)$/i.test(path))) {
  const source = await readFile(p, 'utf8');
  if (source.includes('\u00b7')) throw new Error('Middle dot in public asset: ' + p);
}
console.log('UI syntax, element IDs and public typography passed.');

// Read model output as data and use the same renderer as the battle and notebook.
import { readFileSync } from 'node:fs';
import { studyMarkup } from '../public/js/study.js';

const fields = JSON.parse(readFileSync(0, 'utf8'));
const invalid = fields.flatMap((field, index) => {
  const html = studyMarkup(field);
  return html.includes('class="study-tex-source"') || html.includes('class="katex-error"') ? [index] : [];
});
process.stdout.write(JSON.stringify(invalid));

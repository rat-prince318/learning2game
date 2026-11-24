import { test, expect } from '@playwright/test';

test('a bilingual lesson keeps the chosen file, mathematics, draft, and active match across language changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const language = page.locator('#studio-language');
  await language.click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1').first()).toContainText(/court|basketball|shoot|hoop/i);
  await expect(page.locator('a[href="/rpg/"]')).toHaveText('Play expedition RPG');
  const data = String.raw`Mean: The average is given by \(\bar{x}=\frac{1}{n}\sum_{i=1}^n x_i\).
Square: The transformation \(g(x)=x^2\) squares its input.
Root: The expression \(\sqrt{x}\) gives the positive square root.`;
  await page
    .locator('#material-file')
    .setInputFiles({ name: 'math-notes.txt', mimeType: 'text/plain', buffer: Buffer.from(data) });
  await page.locator('#pair-count').selectOption('2');
  await page.locator('#analyze-button').click();
  await expect(page.locator('#plan-panel')).toBeVisible();
  expect(await page.locator('#knowledge-list .katex math').count()).toBeGreaterThanOrEqual(2);
  await page.locator('#confirm-plan').check();
  await language.click();
  await expect(page.locator('#confirm-plan')).toBeChecked();
  await expect(page.locator('#file-name')).toHaveText('math-notes.txt');
  await language.click();
  await page.locator('#generate-button').click();
  await page.locator('#start-button').click();
  await expect(page.locator('#page-play')).toBeVisible();
  await expect(page.locator('.mc-placard .katex math').first()).toBeAttached();
  await page.locator('#court-targets').click();
  await expect(page.locator('[data-hoop-id] .katex math').first()).toBeAttached();
  await page.locator('[data-hoop-id]').first().click();
  const held = await page.locator('#court-ball-text').innerText();
  await page.locator('#court-language').click();
  await expect(page.locator('#court-ball-text')).toHaveText(held, { useInnerText: true });
  await page.locator('#court-language').click();
  await expect(page.locator('#court-assist')).toContainText(/assist/i);
  await page.locator('#finish-button').click();
  await expect(page.locator('#dialog-title')).toHaveText('Finish this round?');
  await page.locator('#confirm-dialog-action').click();
  await expect(page.locator('#page-report')).toBeVisible();
  await expect(page.locator('#report-content')).toContainText('First-try accuracy');
  await language.click();
  await expect(page.locator('#report-content')).toContainText('首次配对正确率');
  await page.reload();
  await expect(page.locator('#page-report')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('an uploaded expedition publishes course math, settles a turn and shares its file with the studio library', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => localStorage.setItem('learning2game.locale', 'en'));
  await page.goto('/rpg/');
  await page.locator('[data-do=setup]').first().click();
  const lesson = [
    'Offset: Translate the input with \\(y=x+1\\).',
    'Stretch: Double the input with \\(y=2x\\).',
    'Reflection: Reverse the sign with \\(y=-x\\).',
    'Square: Apply the power law \\(y=x^2\\).',
  ].join('\n');
  await page
    .locator('#lr-files')
    .setInputFiles({
      name: 'algebra-expedition.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(lesson),
    });
  await page.locator('#lr-depart button[type=submit]').click();
  await page.locator('.lr-track-quest').click();
  const story = page.locator('#story-dialog');
  await story.getByRole('button', {name: /Continue/}).click();
  await story.getByRole('button', {name: /Continue/}).click();
  await story.locator('.sc-options .choice').first().click();
  await story.getByRole('button', {name: 'Return to the field'}).click();
  await page.locator('.lr-track-quest').click();
  await page.locator('[data-do=engage]').click();
  await expect(page.locator('.bf-quiz math').first()).toBeAttached();
  await page.locator('[data-testid=battle-option]').first().click();
  const turn = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/rpg\/expeditions\/[^/]+\/actions$/.test(r.url()),
  );
  await page.locator('[data-testid=battle-submit]').click();
  expect((await turn).status()).toBe(200);
  const studio = await context.newPage();
  await studio.goto('/');
  await studio.locator('#mode-button.real').waitFor();
  await studio.locator('#privacy-button').click();
  await studio
    .locator('#saved-materials li')
    .filter({ hasText: 'algebra-expedition.txt' })
    .getByRole('button', { name: /Delete/ })
    .click();
  await expect(studio.locator('#dialog-title')).toHaveText('Delete this material?');
  const removal = studio.waitForResponse(
    (r) => r.request().method() === 'DELETE' && /\/materials\//.test(r.url()),
  );
  await studio.locator('#confirm-dialog-action').click();
  expect((await removal).status()).toBe(204);
  await studio.close();
});

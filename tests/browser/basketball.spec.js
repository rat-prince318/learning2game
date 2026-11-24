import { test, expect } from '@playwright/test';

test('the one-click warm-up keeps a separately edited course draft', async ({ page }) => {
  await page.goto('/');
  await page.locator('#sample-button').click();
  const choice = page.locator('#plan-choices input').last();
  await choice.uncheck();
  const draft = await page.locator('#plan-choices input:checked').count();
  await page.locator('#warmup-button').click();
  await expect(page.locator('#court-ball-text')).not.toBeEmpty();
  await expect(page.locator('#play-progress')).toHaveText('0 / 4');
  const held = await page.locator('#court-ball-text').innerText();
  await page.locator('#court-language').click();
  await page.reload();
  await expect(page.locator('#court-ball-text')).toHaveText(held);
  await expect(page.locator('#court-menu')).toHaveText('Menu');
  await page.locator('#court-menu').click();
  await page.locator('#court-exit').click();
  await expect(page.locator('#plan-panel')).toBeVisible();
  await expect(page.locator('#plan-choices input:checked')).toHaveCount(draft);
  await expect(choice).not.toBeChecked();
});

test('walking, a missed throw and two different baskets update the learning record correctly', async ({ page }) => {
  await page.goto('/');
  await page.locator('#material-file').setInputFiles({
    name: '测量仪器.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('温度计：测量液体的冷热程度。\n天平：测量物体的质量。\n秒表：测量一次实验的用时。'),
  });
  await page.locator('#pair-count').selectOption('2');
  await page.locator('#analyze-button').click();
  await page.locator('#confirm-plan').check();
  await page.locator('#generate-button').click();
  await page.locator('#start-button').click();
  const scene = page.locator('.mc-scene');
  const canvas = scene.locator('canvas');
  const board = scene.locator('.mc-placard').first();
  const attempts = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/sessions\/[^/]+\/attempts$/.test(request.url())) {
      attempts.push(request.postDataJSON());
    }
  });
  await expect(board).toBeVisible();
  await canvas.focus();
  const original = await board.evaluate((element) => element.style.left);
  await page.keyboard.down('KeyD');
  try {
    await expect.poll(() => board.evaluate((element) => element.style.left)).not.toBe(original);
  } finally {
    await page.keyboard.up('KeyD');
  }
  await page.keyboard.down('Space');
  await expect(scene).toHaveAttribute('data-phase', 'charging');
  await page.keyboard.up('Space');
  await expect(scene).toHaveAttribute('data-phase', 'flight');
  await expect(scene).toHaveAttribute('data-phase', 'held', {timeout: 15000});
  expect(attempts).toHaveLength(0);
  await expect(page.locator('#play-errors')).toHaveText('0');

  const question = await page.locator('#court-ball-text').innerText();
  const pairs = [/温度计|冷热/, /天平|质量/, /秒表|用时/];
  const correct = pairs.find(pattern => pattern.test(question));
  expect(correct).toBeDefined();
  const chooseHoop = async (chooseCorrect) => {
    await page.locator('#court-targets').click();
    const boards = page.locator('[data-hoop-id]');
    const options = await boards.allTextContents();
    const index = options.findIndex(label => correct.test(label) === chooseCorrect);
    expect(index).toBeGreaterThanOrEqual(0);
    await boards.nth(index).click();
    await page.locator('#court-assist').click();
  };
  await chooseHoop(false);
  await expect(page.locator('#play-errors')).toHaveText('1', {timeout: 15000});
  await expect(page.locator('#court-ball-text')).toHaveText(question);
  await chooseHoop(true);
  await expect(page.locator('#play-progress')).toHaveText(/1\s*\/\s*2/, {timeout: 15000});
  expect(attempts).toHaveLength(2);
  expect(attempts[0].left_id).toBe(attempts[1].left_id);
  expect(attempts[0].right_id).not.toBe(attempts[1].right_id);
});

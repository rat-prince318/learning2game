import { expect, test } from '@playwright/test';
import { acts, speakers } from '../../public/rpg/world/saga/chapters.js';

test('every spoken line and both aftermaths name a portrait in both languages', () => {
  expect(acts).toHaveLength(8);
  const frames = new Set();
  for (const act of acts) {
    expect(act.conversation).toHaveLength(3);
    expect(act.choices).toHaveLength(2);
    for (const line of [...act.conversation, ...act.choices.map(order => order.reply)]) {
      const actor = speakers[line.speaker];
      expect(actor).toBeDefined();
      expect(actor.name[0]).toMatch(/[一-龥]/u);
      expect(actor.name[1]).toMatch(/[a-z]/i);
      expect(line.text[0]).toMatch(/[一-龥]/u);
      expect(line.text[1]).toMatch(/[a-z]/i);
      expect(line.text[1]).not.toMatch(/[一-龥]/u);
      frames.add(actor.frame);
    }
  }
  expect([...frames].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
});

test('read the crew on the map, skip safely, and save an explicit order', async ({ page }, testInfo) => {
  test.setTimeout(140000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/rpg/');
  await page.getByRole('button', { name: /启程/ }).click();
  await page.getByRole('button', { name: /带上讲义出发/ }).click();
  const quest = page.locator('.lr-track-quest');
  await expect(quest).toBeVisible({ timeout: 100000 });
  const endpoint = '/rpg/expeditions/' + new URL(page.url()).searchParams.get('session');
  const state = async () => (await page.request.get(endpoint)).json();
  const entry = await state();
  await quest.click();
  const scene = page.locator('#story-dialog');
  await expect(scene).toHaveAttribute('data-speaker', 'reed', { timeout: 20000 });
  await expect(scene.locator('.sc-speaker')).toHaveText('守渡人苇舟');
  const art = await page.request.get('/rpg/world/saga/speakers.webp');
  expect(art.ok()).toBe(true);
  for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    const box = await scene.boundingBox();
    expect(box.y).toBeGreaterThan(size.height * 0.45);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    await expect(scene.locator('.sc-bust')).toBeInViewport({ ratio: 1 });
    await expect(scene.getByRole('button', { name: /下一句/ })).toBeInViewport({ ratio: 1 });
    await expect(scene.getByRole('button', { name: '跳过对话' })).toBeInViewport({ ratio: 1 });
    if (size.width !== 844) {
      await page.screenshot({ path: testInfo.outputPath('ferry-' + size.width + '.png') });
    }
  }
  await page.keyboard.press('f');
  await expect(scene.locator('.sc-dialogue')).toContainText('虎符');
  await scene.getByRole('button', { name: '跳过对话' }).click();
  await expect(scene).toHaveAttribute('data-speaker', 'kestrel');
  await expect(scene).toHaveAttribute('data-stage', 'choice');
  await expect(scene.locator('.sc-dialogue')).toBeFocused();
  await page.keyboard.press('f');
  await page.keyboard.press('Enter');
  await expect(scene).toHaveAttribute('data-stage', 'choice');
  expect((await state()).revision).toBe(entry.revision);
  // Locale changes preserve the conversation and its active speaker.
  await page.evaluate(async () => (await import('/js/locale.js')).setLocale('en'));
  await expect(scene.locator('.sc-speaker')).toHaveText('Kestrel, scout captain');
  await page.keyboard.press('ArrowDown');
  const order = scene.getByRole('button', { name: /Break open the brig/ });
  await expect(order).toBeFocused();
  await page.keyboard.press('f');
  await expect(scene).toHaveAttribute('data-stage', 'recorded');
  await expect(scene.locator('.sc-dialogue')).toContainText('last rower');
  await page.keyboard.press('f');
  await expect(scene).toBeHidden();
  expect((await state()).story_marks.willow_ferry).toBe('ferry_child');
});

import { test, expect } from '@playwright/test';

test('start the bilingual eight-post campaign, operate a station, find a companion and walk into a real encounter', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/rpg/');
  await page.getByRole('button', { name: '切换为英语' }).click();
  await page.getByRole('button', { name: 'Open the atlas' }).click();
  await page.getByRole('button', { name: 'Mirror Pass', exact: true }).click();
  await expect(page.locator('.lr-atlas-legend h1')).toHaveText('Mirror Pass');
  await page.getByRole('button', { name: 'Title screen' }).click();
  await page.getByRole('button', { name: 'New journey' }).click();
  await page.getByRole('button', { name: 'Prepare course and depart' }).click();
  await expect(page.locator('.lr-world')).toBeVisible({ timeout: 150000 });
  const id = new URL(page.url()).searchParams.get('session');
  const endpoint = '/rpg/expeditions/' + id;
  const read = async () => (await page.request.get(endpoint)).json();
  expect((await read()).map).toHaveLength(8);
  expect((await read()).chapter_count).toBe(16);
  await page.locator('[data-do="spot"][data-key="site"]').click();
  await page.locator('[data-do="inspect"]').click();
  expect((await read()).field_signals).toEqual([]);
  await page.locator('[data-do="tune"]').click();
  await page.locator('[data-do="tune"]').click();
  await page.getByRole('button', { name: 'Hitch the ferry line' }).click();
  await expect.poll(async () => (await read()).field_signals).toEqual(['willow_ferry']);
  await page.reload();
  await expect(page.locator('.lr-world')).toBeVisible();
  await page.getByRole('button', { name: 'Journal', exact: false }).click();
  await expect(page.locator('.lr-route-list')).toContainText('River lamp');
  await page.locator('#top [data-do="party"]').click();
  await page.locator('[data-crew="reed"]').click();
  await expect
    .poll(async () => (await read()).companions.find((c) => c.id === 'reed')?.active)
    .toBe(true);
  await page.locator('#top [data-do="scene"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.lr-viewport').focus();
  for (let i = 0; i < 18; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-battle-phase="combat"]')).toBeVisible();
  expect((await read()).phase).toBe('combat');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const empty = await (await page.request.get(endpoint + '/notebook')).json();
  expect(empty.flatMap((p) => p.entries)).toEqual([]);
  await page.locator('[data-act="option"]').first().click();
  await page.locator('[data-act="submit"]').click();
  await expect
    .poll(async () => {
      const rows = await (await page.request.get(endpoint + '/notebook')).json();
      return rows.flatMap((p) => p.entries).filter((item) => item.source_ref && item.combat_attempts)
        .length;
    })
    .toBe(1);
  const alternate = await page.request.post('/rpg/expeditions', {
    data: { game_ids: [(await read()).map[0].game_id], hero_class: 'ranger' },
  });
  const shortcut = await alternate.json();
  await page.goto('/rpg/?session=' + shortcut.session_id);
  await page.getByRole('button', { name: 'Mooring snare' }).click();
  await page.getByRole('button', { name: 'Spring the trap' }).click();
  await expect(page.locator('[data-battle-phase="combat"]')).toBeVisible();
  const ambush = await (await page.request.get('/rpg/expeditions/' + shortcut.session_id)).json();
  expect(ambush.map[0].chapters[0].route_id).toBe('elite');
  expect(errors).toEqual([]);
});

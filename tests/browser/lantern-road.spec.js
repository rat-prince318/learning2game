import { test, expect } from '@playwright/test';

async function openTravel(page, key) {
  await page.locator('.lr-travel-list summary').click();
  await page.locator('.lr-travel-list [data-do="spot"][data-key="' + key + '"]').click();
}
async function menu(page, action) {
  const button = page.locator('#top [data-do="' + action + '"]');
  if (!(await button.isVisible())) await page.locator('[data-theater="menu"]').first().click();
  await button.click();
}
async function move(page, key, axis, delta) {
  const field = page.locator('.lr-world');
  await expect(field).toHaveAttribute('data-position-' + axis, /\d+/);
  const start = Number(await field.getAttribute('data-position-' + axis));
  const camera = Number(await field.getAttribute('data-camera-' + axis));
  await page.keyboard.down(key);
  try {
    await expect
      .poll(
        async () =>
          (Number(await field.getAttribute('data-position-' + axis)) - start) * Math.sign(delta),
      )
      .toBeGreaterThan(Math.abs(delta));
  } finally {
    await page.keyboard.up(key);
  }
  await expect
    .poll(
      async () => (Number(await field.getAttribute('data-camera-' + axis)) - camera) * Math.sign(delta),
    )
    .toBeGreaterThan(1);
}

async function touchDiagonal(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const center = async (dir, id) => {
    const b = await page.locator('[data-walk-dir="' + dir + '"]').boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, id, radiusX: 3, radiusY: 3, force: 1 };
  };
  const here = () =>
    page
      .locator('.lr-world')
      .evaluate((el) => [Number(el.dataset.positionX), Number(el.dataset.positionY)]);
  const [startX, startY] = await here();
  try {
    const east = await center('east', 1),
      south = await center('south', 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [east, south] });
    await expect
      .poll(async () => {
        const [x, y] = await here();
        return Math.min(x - startX, y - startY);
      })
      .toBeGreaterThan(9);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.lr-touchpad .pressed')).toHaveCount(0);
    // Let the position readout catch the final touch event, then check its stability.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 120)));
    const released = await here();
    await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
    expect(await here()).toEqual(released);
  } finally {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp.detach();
  }
}
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
  const itinerary = await read();
  expect(itinerary.eight_chapters).toBe(true);
  expect(itinerary.map).toHaveLength(8);
  expect(itinerary.chapter_count).toBe(itinerary.map.reduce((n, region) => n + region.chapters.length, 0));
  await page.locator('.lr-viewport').focus();
  await move(page, 'w', 'y', -11);
  await move(page, 's', 'y', 13);
  await move(page, 'a', 'x', -12);
  await move(page, 'd', 'x', 14);
  const geometry = await page.locator('.lr-field-canvas').boundingBox();
  expect(Math.round(geometry.width)).toBe(await page.evaluate(() => innerWidth));
  expect(Math.round(geometry.height)).toBe(await page.evaluate(() => innerHeight));
  await page.setViewportSize({ width: 390, height: 844 });
  await touchDiagonal(page);
  await page.setViewportSize({ width: 844, height: 390 });
  const landscape = await page.locator('.lr-field-canvas').boundingBox();
  expect(landscape).toMatchObject({ x: 0, y: 0, width: 844, height: 390 });
  await page.setViewportSize({ width: 1360, height: 900 });
  await openTravel(page, 'ship');
  const story = page.locator('#story-dialog');
  await story.locator('.sc-options .primary').click();
  await story.locator('.sc-options .primary').click();
  await story.locator('.sc-options .choice').first().click();
  await story.locator('.sc-options .primary').click();
  await expect.poll(async () => (await read()).story_marks.willow_ferry).toBe('ferry_child');
  await openTravel(page, 'site');
  await page.locator('[data-do="inspect"]').click();
  expect((await read()).field_signals).toEqual([]);
  await page.locator('[data-do="tune"]').click();
  await page.locator('[data-do="tune"]').click();
  await page.getByRole('button', { name: 'Hitch the ferry line' }).click();
  await expect.poll(async () => (await read()).field_signals).toEqual(['willow_ferry']);
  await page.reload();
  await expect(page.locator('.lr-world')).toBeVisible();
  await menu(page, 'journal');
  await expect(page.locator('.lr-route-list')).toContainText('River lamp');
  await menu(page, 'party');
  await page.locator('[data-crew="reed"]').click();
  await expect
    .poll(async () => (await read()).companions.find((c) => c.id === 'reed')?.active)
    .toBe(true);
  await menu(page, 'scene');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.lr-viewport').focus();
  // Use the riverside trail. Walk down from the gauge to the bridge approach,
  // then keep D held as the camera follows the character into the sentry.
  const map = await page.evaluate(async () => {
    const m = await import('/rpg/world/overland-map.js');
    const map = m.buildMap(0, [{ id: 'normal' }, { id: 'elite' }]);
    return { target: map.dots.normal, bridgeY: (map.bridges[0].top + map.bridges[0].bottom) / 2 };
  });
  await page.keyboard.down('s');
  try {
    await page.waitForFunction(
      (y) => Number(document.querySelector('.lr-world').dataset.positionY) >= y - 4,
      map.target.y,
    );
  } finally {
    await page.keyboard.up('s');
  }
  await page.keyboard.down('d');
  try {
    await expect(page.locator('[data-battle-phase="combat"]')).toBeVisible({ timeout: 8500 });
  } finally {
    await page.keyboard.up('d');
  }
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
  const chooseRoute = [];
  page.on('request', req => {
    if (req.method() === 'POST' && req.url().endsWith(shortcut.session_id + '/actions') &&
      req.postDataJSON()?.action === 'choose_route') chooseRoute.push(req.postDataJSON().route_id);
  });
  await openTravel(page, 'elite');
  await expect(page.locator('[data-do="engage"][data-key="elite"]')).toBeVisible({ timeout: 20000 });
  await page.locator('[data-do="walk"]').click();
  await page.reload();
  const field = page.locator('.lr-world');
  const trap = await page.evaluate(async () => {
    const { buildMap } = await import('/rpg/world/overland-map.js');
    return buildMap(0, [{ id: 'normal' }, { id: 'elite' }]).dots.elite;
  });
  await expect(field).toHaveAttribute('data-position-x', String(trap.x));
  await openTravel(page, 'north-post');
  await expect(page.locator('.lr-dialog')).toContainText('Boatmen’s lookout', { timeout: 20000 });
  await page.locator('[data-do="walk"]').click();
  await openTravel(page, 'elite');
  await expect(page.locator('[data-do="engage"][data-key="elite"]')).toBeVisible({ timeout: 20000 });
  await page.locator('[data-do="walk"]').click();
  await page.locator('.lr-viewport').focus();
  const x = async () => Number(await field.getAttribute('data-position-x'));
  // Shuffling inside the snare's radius after closing it must leave the
  // player walking. Crossing its boundary again opens the same trap preview.
  await page.keyboard.down('a');
  try {
    await expect.poll(x).toBeLessThan(trap.x - 45);
  } finally {
    await page.keyboard.up('a');
  }
  await expect(page.locator('.lr-dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const right = page.locator('[data-walk-dir="east"]');
  const hit = await right.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
      { x: hit.x + hit.width / 2, y: hit.y + hit.height / 2, id: 1 },
    ] });
    await expect(page.locator('[data-do="engage"][data-key="elite"]')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp.detach();
  }
  await page.locator('[data-do="walk"]').click();
  await page.keyboard.press('e');
  await page.locator('[data-do="engage"][data-key="elite"]').click();
  await expect(page.locator('[data-battle-phase="combat"]')).toBeVisible();
  const ambush = await (await page.request.get('/rpg/expeditions/' + shortcut.session_id)).json();
  expect(ambush.map[0].chapters[0].route_id).toBe('elite');
  expect(chooseRoute).toEqual(['elite']);
  expect(errors).toEqual([]);
});

import { expect } from '@playwright/test';

const coordinates = (field) => field.evaluate(node => ({
  x: Number(node.dataset.positionX), y: Number(node.dataset.positionY), dir: node.dataset.facing,
}));

export async function meetEnemy(page, view, routeId) {
  await page.goto('/rpg/?session=' + view.session_id);
  const target = await page.evaluate(async ({view, routeId}) => {
    const {buildMap} = await import('/rpg/world/overland-map.js');
    return buildMap(view.region_index, view.routes, view.story_marks, view.scene_index).dots[routeId];
  }, {view, routeId});
  await page.locator('.lr-travel-list summary').click();
  await page.locator(`.lr-travel-list [data-key="${routeId}"]`).click();
  const engage = page.locator('[data-do="engage"]');
  await expect(engage).toBeVisible({timeout:30000});
  const field = page.locator('.lr-world');
  await expect.poll(async () => {
    const feet = await coordinates(field);
    return Math.hypot(feet.x - target.x, feet.y - target.y);
  }).toBeLessThan(3);
  const origin = await coordinates(field);
  const start = page.waitForResponse(response => response.request().method() === 'POST' &&
    response.url().endsWith('/actions') && response.request().postDataJSON().action === 'choose_route');
  await engage.click();
  return {origin, view: await (await start).json()};
}

export async function verifyCampContinuation(page, rewardView, origin) {
  const actions = '/rpg/expeditions/' + rewardView.session_id + '/actions';
  const receipt = action => page.waitForResponse(response =>
    new URL(response.url()).pathname === actions && response.request().method() === 'POST' &&
    response.request().postDataJSON().action === action);
  const exit = page.getByTestId('battle-exit');
  const camp = page.getByRole('dialog', {name:'驿站补给'});
  const field = await page.getByTestId('battle-arena').elementHandle();

  await exit.click();
  await expect(camp).toBeVisible();
  await camp.getByRole('button', {name:'返回战场'}).click();
  await expect(camp).toHaveCount(0);
  await expect(exit).toBeFocused();
  await exit.click();
  await expect(camp).toBeVisible();
  expect(await field.evaluate(node => node === document.querySelector('[data-testid="battle-arena"]'))).toBe(true);

  const supplies = rewardView.rewards.find(item => item.kind === 'purse');
  expect(supplies?.affordable).toBe(true);
  const claim = receipt('choose_reward');
  await camp.locator('[data-do="claim"][data-key="' + supplies.id + '"]').click();
  const reply = await claim;
  expect(reply.status()).toBe(200);
  const routeView = await reply.json();
  expect(routeView.phase).toBe('route');
  expect(routeView.scene_index).toBe(rewardView.scene_index + 1);
  expect(routeView.coins).toBe(rewardView.coins + supplies.coins - supplies.cost);
  expect(routeView.journal.at(-1).reward_id).toBe(supplies.id);
  await expect(camp).toHaveCount(0);
  await expect(page.locator('.lr-world')).toBeVisible();
  await expect.poll(() => coordinates(page.locator('.lr-world'))).toEqual(origin);
  await page.reload();
  await expect.poll(() => coordinates(page.locator('.lr-world'))).toEqual(origin);

  const nextPath = routeView.routes.find(route => route.boss && route.approach === 'steady');
  expect(nextPath).toBeDefined();
  await page.locator('.lr-travel-list summary').click();
  await page.locator('[data-do="spot"][data-key="' + nextPath.id + '"]').click();
  const march = receipt('choose_route');
  await page.locator('[data-do="engage"]').click();
  const secondFight = await (await march).json();
  expect(secondFight.phase).toBe('combat');
  expect(secondFight.revision).toBe(routeView.revision + 1);
  expect(secondFight.battle.stage.number).toBe(2);
  expect(secondFight.battle.tactics.encounter_id).toBe(nextPath.encounter_id);
  expect(secondFight.player.xp).toBe(rewardView.player.xp);
  await expect(page.getByTestId('battle-submit')).toBeVisible();
  await expect(page.getByTestId('battle-intent')).toContainText(secondFight.battle.tactics.intent.name);
}

export async function verifyRegionalExit(page, rewardView, origin) {
  const field = page.locator('.lr-world');
  const url = '/rpg/expeditions/' + rewardView.session_id;
  const state = async () => (await page.request.get(url)).json();
  await page.getByTestId('battle-exit').click();
  await expect.poll(() => coordinates(field)).toEqual(origin);
  await expect(page.locator('.lr-guide')).toHaveAttribute('data-target', 'ship');
  await page.reload();
  await expect.poll(() => coordinates(field)).toEqual(origin);
  expect((await state()).revision).toBe(rewardView.revision);
  // Another device has no coordinate cache. Its server journal still identifies
  // the defeated patrol and places the player there, even on a bookmarked win.
  const other = await page.context().browser().newContext();
  try {
    const tab = await other.newPage();
    await tab.goto(page.url());
    await expect.poll(async () => {
      const feet = await coordinates(tab.locator('.lr-world'));
      return Math.hypot(feet.x - origin.x, feet.y - origin.y);
    }).toBeLessThan(3);
    await expect(tab.locator('.lr-guide')).toHaveAttribute('data-target', 'ship');
  } finally {
    await other.close();
  }
  await page.locator('.lr-track-quest').click();
  const camp = page.getByRole('dialog', {name:'驿站补给'});
  await expect(camp).toBeVisible({timeout:30000});
  await camp.getByRole('button', {name:'继续探索'}).click();
  expect((await state()).region_index).toBe(rewardView.region_index);
  await page.locator('.lr-track-quest').click();
  await camp.locator('[data-do="claim"][data-key="purse"]').click();
  await expect.poll(async () => (await state()).region_index).toBe(rewardView.region_index + 1);
  await expect(field).toHaveAttribute('data-region', rewardView.map[rewardView.region_index+1].region_id);
  await expect(page.locator('.lr-guide')).toHaveAttribute('data-target', 'site');
  await expect(page.locator('.lr-guide')).toBeVisible();
}

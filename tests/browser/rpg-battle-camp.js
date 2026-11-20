import { expect } from '@playwright/test';

export async function verifyCampContinuation(page, rewardView) {
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

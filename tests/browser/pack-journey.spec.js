import { expect, test } from '@playwright/test';

const pack = page => page.locator('#lr-pack');
const action = (page, id) => pack(page).locator('[data-pack-action="' + id + '"]');
const item = (page, id) => pack(page).locator('[data-pack-item="' + id + '"]');
const tab = (page, id) => pack(page).locator('[data-pack-tab="' + id + '"]');
const stat = (page, id) => pack(page).locator('[data-pack-stat="' + id + '"]');

async function travel(page, spot) {
  await page.locator('.lr-travel-list summary').click();
  await page.locator('.lr-travel-list [data-key="' + spot + '"]').click();
}

function commandReceipt(page, path, name) {
  return page.waitForResponse(r => r.request().method() === 'POST' &&
    new URL(r.url()).pathname === path + '/actions' && r.request().postDataJSON().action === name);
}

test('use the field pack at Willow Ferry, keep the hero still, and speak with F', async ({ page }) => {
  test.setTimeout(150000);
  await page.goto('/rpg/');
  await page.getByRole('button', { name: '切换为英语' }).click();
  await page.getByRole('button', { name: 'New journey' }).click();
  await page.locator('label:has(input[value="ranger"])').click();
  await page.getByRole('button', { name: 'Prepare course and depart' }).click();
  const field = page.locator('.lr-world');
  await expect(field).toBeVisible({timeout: 100000});
  const path = '/rpg/expeditions/' + new URL(page.url()).searchParams.get('session');
  const read = async () => (await page.request.get(path)).json();
  const start = await read();
  await expect(field).toHaveAttribute('data-position-x', /\d+/);
  const position = () => field.evaluate(node => [node.dataset.positionX, node.dataset.positionY]);
  const before = await position();
  await page.locator('.lr-viewport').focus();
  await page.keyboard.press('e');
  await expect(pack(page)).toBeVisible();
  const portrait = pack(page).locator('.pack-portrait img');
  await expect(portrait).toHaveAttribute('src', /pack-ranger\.webp$/);
  expect(await portrait.evaluate(async node => { await node.decode(); return node.naturalWidth; })).toBeGreaterThan(0);
  await expect(stat(page, 'hp')).toHaveText(start.player.hp + ' / ' + start.player.max_hp);
  await expect(stat(page, 'attack')).toHaveText(String(start.player.attack));
  await expect(stat(page, 'defense')).toHaveText(String(start.player.stats.defense));

  await page.keyboard.down('d');
  // Let the world run several actual frames while movement is held behind the modal.
  try {
    await page.evaluate(async () => {
      for (let frame = 0; frame < 15; frame++) await new Promise(requestAnimationFrame);
    });
  } finally { await page.keyboard.up('d'); }
  expect(await position()).toEqual(before);
  await page.keyboard.press('f');
  await expect(pack(page)).toBeVisible();
  await expect(page.locator('#story-dialog')).toBeHidden();
  await page.keyboard.press('e');
  await expect(pack(page)).toHaveCount(0);
  await page.keyboard.press('e');
  await tab(page, 'supplies').click();
  await item(page, 'focus_tea').click();
  const use = commandReceipt(page, path, 'use_item');
  await action(page, 'use').click();
  expect((await use).ok()).toBe(true);
  await expect(stat(page, 'focus')).toHaveText('1 / ' + start.player.focus_max);
  await item(page, 'field_bandage').click();
  await expect(action(page, 'use')).toBeDisabled();
  await action(page, 'discard').click();
  await pack(page).locator('[data-pack-quantity]').fill('2');
  await action(page, 'cancel').click();
  expect((await read()).supplies.find(s => s.id === 'field_bandage').quantity).toBe(2);
  await action(page, 'discard').click();
  await pack(page).locator('[data-pack-quantity]').fill('2');
  const drop = commandReceipt(page, path, 'discard_item');
  await action(page, 'confirm-discard').click();
  expect((await drop).ok()).toBe(true);
  await expect(item(page, 'field_bandage')).toContainText('×0');
  await page.keyboard.press('Escape');
  await expect(pack(page)).toHaveCount(0);
  await page.reload();
  await expect(field).toBeVisible();
  await page.keyboard.press('e');
  await tab(page, 'supplies').click();
  for (const supply of ['field_bandage', 'focus_tea']) await expect(item(page, supply)).toContainText('×0');
  await expect(stat(page, 'focus')).toHaveText('1 / ' + start.player.focus_max);
  await page.keyboard.press('Escape');

  await travel(page, 'ship');
  const story = page.locator('#story-dialog');
  await expect(story).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(story).toBeHidden();
  await page.keyboard.press('f');
  await expect(story).toHaveAttribute('data-stage', 'reading');
  await expect(story).toBeVisible();
  const firstLine = await story.locator('#story-line').innerText();
  await page.keyboard.press('e');
  await expect(pack(page)).toHaveCount(0);
  await page.keyboard.press('f');
  await expect(story.locator('#story-line')).not.toHaveText(firstLine);
  await story.getByRole('button', {name:'Skip dialogue'}).click();
  await expect(story).toHaveAttribute('data-stage', 'choice');
  await page.keyboard.press('f');
  await page.keyboard.press('Enter');
  expect((await read()).story_marks.willow_ferry).toBeUndefined();
  const choose = commandReceipt(page, path, 'story_choice');
  await story.locator('.sc-options .choice').first().click();
  expect((await choose).ok()).toBe(true);
  await expect(story).toHaveAttribute('data-stage', 'recorded');
  await page.keyboard.press('f');
  await expect(story).toBeHidden();
  expect((await read()).story_marks.willow_ferry).toBe('ferry_child');

  await page.locator('#game-menu-toggle').click();
  await page.locator('#top [data-do="tower"]').click();
  await page.locator('[data-tower="enter"]').click();
  const towerOption = page.locator('.rpg-expansion [data-act="option"]').first();
  await towerOption.click();
  await page.keyboard.press('e');
  await expect(pack(page)).toBeVisible();
  const towerHero = (await read()).tower.battle.player;
  await expect(stat(page, 'hp')).toHaveText(towerHero.hp + ' / ' + towerHero.max_hp);
  await tab(page, 'supplies').click();
  await expect(pack(page).getByRole('tabpanel')).toContainText('tower gate');
  await page.keyboard.press('Escape');
  await expect(towerOption).toBeFocused();
});

// Two three-question exam volumes leave an actual reward stop after the first fight.
async function prepareWeaponsCourse(page) {
  await page.goto('/rpg/');
  return page.evaluate(async () => {
    const {ApiClient} = await import('/js/api.js');
    const api = new ApiClient();
    const exam = ['Mechanics Quiz',
      '1. A cart has mass 7 kg and travels at 6 m/s. What is its kinetic energy?',
      '2. An object of mass 8 kg accelerates at 3 m/s². Find the net force.',
      '3. A particle of mass 4 kg moves at 8 m/s. Determine its momentum.',
      '4. A cart has mass 3 kg and travels at 2 m/s. What is its kinetic energy?',
      '5. An object of mass 5 kg accelerates at 4 m/s². Find the net force.',
      '6. A particle of mass 2 kg moves at 4 m/s. Determine its momentum.'].join('\n');
    const receipt = await api.upload(new File([exam], 'expedition-pack.txt', {type:'text/plain'}));
    await api.waitForJob(receipt.job_id);
    const post = (path, body) => api.request(path, {method:'POST', body});
    const finish = async (path, body) => (await api.waitForJob((await post(path, body)).job_id)).result;
    const outline = await post('/rpg/expedition-outline', {sources:[{material_id:receipt.material_id}],
      concepts_per_volume:3, scenes_per_volume:1, question_language:'zh'});
    const gameIds = [];
    for (const volume of outline.volumes) {
      const plan = await finish('/rpg/plans', volume.plan_request);
      gameIds.push((await finish('/rpg/games', {plan_id:plan.plan_id, confirmed:true})).game_id);
    }
    return post('/rpg/expeditions', {game_ids:gameIds, hero_class:'vanguard', kit:'ward'});
  });
}

test('inspect during combat, resume answering and swap an earned weapon at the supply stop', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({reducedMotion:'reduce'});
  const start = await prepareWeaponsCourse(page);
  expect(start.map).toHaveLength(2);
  const path = '/rpg/expeditions/' + start.session_id;
  const read = async () => (await page.request.get(path)).json();
  await page.goto('/rpg/?session=' + start.session_id);
  await travel(page, 'boss_steady');
  await page.locator('[data-do="engage"]').click();
  await expect(page.locator('[data-battle-phase="combat"]')).toBeVisible();
  let view = await read();
  await page.keyboard.press('e');
  await expect(pack(page)).toBeVisible();
  await tab(page, 'supplies').click();
  await item(page, 'field_bandage').click();
  for (const id of ['equip','unequip','use','discard']) await expect(action(page, id)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(pack(page)).toHaveCount(0);
  expect((await read()).revision).toBe(view.revision);
  const answers = [['动能',126], ['合力',24], ['动量',32]];
  for (let turn = 0; turn < 3; turn++) {
    const prompt = view.battle.prompt;
    const [,value] = answers.find(([term]) => prompt.text.includes(term));
    const number = new RegExp('(?:^|[^0-9])' + value + '(?:$|[^0-9])');
    const correct = prompt.options.filter(o => number.test(o.text));
    expect(correct).toHaveLength(1);
    await page.locator('[data-option-id="' + correct[0].id + '"]').click();
    const answer = commandReceipt(page, path, 'answer');
    await page.getByTestId('battle-submit').click();
    view = await (await answer).json();
    expect(view.battle.last_event.correct).toBe(true);
  }
  expect(view.phase).toBe('reward');
  await expect(page.getByTestId('battle-result')).toBeVisible();
  await page.keyboard.press('e');
  const starter = start.player.loadout.weapon;
  expect(view.player.loadout.weapon).not.toBe(starter);
  await item(page, starter).click();
  const swap = commandReceipt(page, path, 'equip');
  await action(page, 'equip').click();
  const equipped = await (await swap).json();
  expect(equipped.player.loadout.weapon).toBe(starter);
  await expect(stat(page, 'attack')).toHaveText(String(equipped.player.attack));
  await page.keyboard.press('e');
  await page.reload();
  await expect(page.getByTestId('battle-result')).toBeVisible();
  await page.keyboard.press('e');
  await expect(item(page, starter).locator('.pack-worn')).toBeVisible();
  await item(page, 'ward_vest').click();
  const remove = commandReceipt(page, path, 'unequip');
  await action(page, 'unequip').click();
  const unequipped = await (await remove).json();
  expect(unequipped.player.loadout.armor).toBe(null);
  await expect(stat(page, 'hp')).toHaveText(unequipped.player.hp + ' / ' + unequipped.player.max_hp);
});

import { expect, test } from '@playwright/test';

const exam = [
  'Mechanics Quiz',
  '1. A cart has mass 7 kg and travels at 6 m/s. What is its kinetic energy?',
  '2. An object of mass 8 kg accelerates at 3 m/s². Find the net force.',
  '3. A particle of mass 4 kg moves at 8 m/s. Determine its momentum.',
].join('\n');

async function prepareExpedition(page) {
  await page.goto('/rpg/');
  return page.evaluate(async (source) => {
    const { ApiClient } = await import('/js/api.js');
    const api = new ApiClient();
    const post = (path, body) => api.request(path, { method: 'POST', body });
    const finish = async (path, body) => (await api.waitForJob((await post(path, body)).job_id)).result;
    const upload = await api.upload(new File([source], 'Mech-training.txt', { type: 'text/plain' }));
    await api.waitForJob(upload.job_id);
    const { volumes } = await post('/rpg/expedition-outline', {
      sources: [{ material_id: upload.material_id }],
      scenes_per_volume: 1,
      question_language: 'zh',
    });
    const plan = await finish('/rpg/plans', volumes[0].plan_request);
    const game = await finish('/rpg/games', { plan_id: plan.plan_id, confirmed: true });
    return post('/rpg/expeditions', {
      game_ids: [game.game_id],
      hero_class: 'vanguard',
      kit: 'ward',
      campaign_story: true,
    });
  }, exam);
}

async function walkTo(page, key) {
  await page.locator('.lr-travel-list summary').click();
  await page.locator(`.lr-travel-list [data-do="spot"][data-key="${key}"]`).click();
}

async function expectFullField(page) {
  const geometry = await page.getByTestId('battle-arena').evaluate(stage => {
    const rect = stage.getBoundingClientRect();
    return {
      edges: [rect.left, rect.top, innerWidth - rect.right, innerHeight - rect.bottom],
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      pageScroll: scrollY,
    };
  });
  expect(geometry.edges.every(edge => Math.abs(edge) <= 1), JSON.stringify(geometry)).toBe(true);
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(geometry.pageScroll).toBe(0);
}

async function checkCombatViewport(page) {
  const options = page.getByTestId('battle-option');
  await expect(options).toHaveCount(3);
  const elements = [
    page.getByTestId('battle-arena'),
    page.locator('[data-prompt-title]'),
    ...(await options.all()),
    page.getByTestId('battle-submit'),
  ];
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1708, height: 938 },
    { width: 1152, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await expectFullField(page);
    for (const element of elements) await expect(element).toBeInViewport({ ratio: 1 });
  }
}

function answerForFixture(prompt) {
  const questions = [
    ['动能', (7 * 6 ** 2) / 2],
    ['合力', 8 * 3],
    ['动量', 4 * 8],
  ];
  const question = questions.find(([term]) => prompt.text.includes(term));
  expect(question, 'Expected a complete translated mechanics question').toBeDefined();
  const token = new RegExp('(?:^|[^0-9])' + question[1] + '([^0-9]|$)');
  const answers = prompt.options.filter((option) => token.test(option.text));
  expect(answers).toHaveLength(1);
  return answers[0].id;
}

test('rescue the ferry crew, master both dragon phases and reload the final order', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const initial = await prepareExpedition(page);
  const endpoint = '/rpg/expeditions/' + initial.session_id;
  const state = async () => (await page.request.get(endpoint)).json();
  await page.goto('/rpg/?session=' + initial.session_id);
  await walkTo(page, 'ship');
  const story = page.getByRole('dialog');
  const advance = story.getByRole('button', { name: /继续/ });
  await advance.click();
  await advance.click();
  await story.getByRole('button', { name: /砸开船牢/ }).click();
  await story.getByRole('button', { name: '回到战场' }).click();
  expect((await state()).story_marks.willow_ferry).toBe('ferry_child');

  await walkTo(page, 'boss_steady');
  await page.locator('[data-do="engage"]').click();
  await checkCombatViewport(page);
  await page.locator('#game-menu-toggle').click();
  for (const preference of ['sound','motion']) {
    const control = page.locator('[data-field-pref="' + preference + '"]');
    const source = page.locator('.bf-system [data-act="' + preference + '"]');
    const original = await control.getAttribute('aria-pressed');
    expect(['true','false']).toContain(original);
    await control.click();
    const toggled = String(original !== 'true');
    await expect(control).toHaveAttribute('aria-pressed', toggled);
    await expect(source).toHaveAttribute('aria-pressed', toggled);
    await control.click();
    await expect(source).toHaveAttribute('aria-pressed', original);
  }
  await page.locator('#game-menu-toggle').click();
  const field = await page.getByTestId('battle-arena').elementHandle();
  let view = await state();
  const phases = new Set();
  const solved = new Set();
  for (let turn = 0; view.phase === 'combat' && turn < 18; turn++) {
    await expect(page.locator('.l2g-battle')).toHaveAttribute('data-battle-busy', 'false');
    const phase = view.battle.tactics.phase;
    phases.add(phase);
    await expect(page.locator('.rpg-stage-world')).toHaveAttribute(
      'data-ash',
      phase === 2 ? 'ash-crown-enraged' : 'ash-crown-armored',
    );
    const option = answerForFixture(view.battle.prompt);
    const stem = view.battle.prompt.text;
    expect(solved.has(stem), 'A correct mechanics problem must leave the fight').toBe(false);
    solved.add(stem);
    await page.locator(`[data-option-id="${option}"]`).click();
    const response = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === endpoint + '/actions',
    );
    await page.getByTestId('battle-submit').click();
    view = await (await response).json();
    expect(view.battle.last_event.correct).toBe(true);
  }
  expect([...phases]).toEqual([1, 2]);
  expect(solved.size).toBe(3);
  expect(view.phase).toBe('victory');
  const result = page.getByTestId('battle-result');
  await expect(result).toBeVisible();
  expect(await field.evaluate(node => node === document.querySelector('[data-testid="battle-arena"]'))).toBe(true);
  for (const viewport of [{width:390,height:844}, {width:1708,height:938}]) {
    await page.setViewportSize(viewport);
    await expectFullField(page);
    await expect(result.getByRole('heading')).toBeInViewport();
    await expect(page.getByTestId('battle-exit')).toBeInViewport({ratio:1});
    await expect(page.locator('.bf-hud .bf-enemyhp progress')).toHaveJSProperty('value', 0);
  }
  await page.getByTestId('battle-exit').click();
  await story.getByRole('button', { name: '斩冠凯旋' }).click();
  await story.getByRole('button', { name: '查看战绩' }).click();
  await page.reload();
  await page.locator('[data-saga="ending"]').click();
  await expect(story.getByRole('heading')).toHaveText('斩冠凯旋');
  expect(await state()).toMatchObject({
    story_marks: { willow_ferry: 'ferry_child' },
    story_ending: 'shatter_crown',
  });
});

test('take a short save into eight chapters, follow the moving guide and leave the first exploration chapter', async ({page}) => {
  test.setTimeout(120000);
  const original = await prepareExpedition(page);
  const oldPath = '/rpg/expeditions/' + original.session_id;
  const end = await page.request.post(oldPath + '/actions', {data: {
    action: 'retreat', event_id: crypto.randomUUID(), expected_revision: original.revision,
  }});
  expect(end.ok()).toBe(true);
  await page.goto('/rpg/?session=' + original.session_id);
  await page.getByRole('button', {name: '用这份资料开始八章主线'}).click();
  const marker = page.locator('.lr-guide');
  await expect(marker).toBeVisible();
  const sid = new URL(page.url()).searchParams.get('session');
  expect(sid).not.toBe(original.session_id);
  const state = async () => (await page.request.get('/rpg/expeditions/' + sid)).json();
  expect((await state()).map).toHaveLength(8);
  expect((await state()).map[0].chapters[0].kind).toBe('exploration');
  await expect(marker).toHaveAttribute('data-target', 'ship');
  await page.setViewportSize({width:390,height:844});
  await expect(marker).toBeInViewport({ratio:1});
  const initial = await marker.locator('small').innerText();
  await page.locator('.lr-track-quest').click();
  await expect.poll(() => marker.locator('small').innerText()).not.toBe(initial);
  const story = page.locator('#story-dialog');
  await expect(story).toBeVisible({timeout:20000});
  await expect(marker).toBeHidden();
  await story.getByRole('button', {name:/继续/}).click();
  await story.getByRole('button', {name:/继续/}).click();
  await story.getByRole('button', {name:/砸开船牢/}).click();
  await story.getByRole('button', {name:'回到战场'}).click();
  await expect(marker).toHaveAttribute('data-target', 'site');
  await page.locator('.lr-track-quest').click();
  await page.locator('[data-do=tune]').click({timeout:20000});
  await page.locator('[data-do=tune]').click();
  await page.locator('[data-do=inspect]').click();
  await page.locator('[data-do=walk]').click();
  await expect(marker).toHaveAttribute('data-target', 'ship');
  await page.locator('.lr-track-quest').click();
  await page.locator('[data-do=depart-region]').click({timeout:20000});
  await expect.poll(async () => (await state()).region_index).toBe(1);
  await page.reload();
  await expect(page.locator('.lr-chapter')).toContainText('第 2 / 8 章');
  await expect(marker).toHaveAttribute('data-target','keeper');
  expect((await (await page.request.get(oldPath)).json()).phase).toBe('retreated');
});

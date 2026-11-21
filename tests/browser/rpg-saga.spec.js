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

async function expectJournalConfirmation(page, text) {
  const notice = page.locator('#notice');
  await expect(notice).toContainText(text);
  await expect(notice).toBeVisible();
  await expect(page.locator('.lr-dialog-layer .lr-dialog')).toHaveCount(0);
  await expect(notice).toBeHidden({timeout:6500});
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

test('a blocked course upload remains readable until the player dismisses the message', async ({page}) => {
  await page.clock.install();
  await page.goto('/rpg/?prepare=1');
  await page.locator('#lr-files').setInputFiles(Array.from({length:9}, (_, index) => ({
    name: `notes-${index + 1}.txt`, mimeType:'text/plain', buffer:Buffer.from('notes'),
  })));
  await page.locator('#lr-depart button[type="submit"]').click();
  const notice = page.locator('#notice');
  await expect(notice.getByRole('status')).toContainText('最多八份讲义');
  await page.clock.fastForward(10000);
  await expect(notice).toBeVisible();
  await notice.getByRole('button', {name:'关闭提示'}).click();
  await expect(notice).toBeHidden();
  await expect(page.locator('#lr-files')).toBeVisible();
});

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
  await page.clock.install();
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
  const notice = page.locator('#notice');
  const exit = page.locator('.lr-field-action[data-key="ship"]');
  await expect(exit).toBeVisible();
  await page.keyboard.press('f');
  await expect(notice).toContainText('水尺');
  await page.clock.fastForward(3000);
  await page.keyboard.press('f');
  await page.clock.fastForward(2500);
  // The previous hint's five seconds are up; the second F has its own reading time.
  await expect(notice).toBeVisible();
  await page.clock.fastForward(3000);
  await expect(notice).toBeHidden();
  await page.locator('.lr-track-quest').click();
  await page.locator('[data-do=inspect]').click({timeout:20000});
  await expect(notice).toContainText('调整刻度');
  await page.clock.fastForward(5500);
  await expect(notice).toBeHidden();
  await expect(page.locator('[data-do=tune]')).toBeVisible();
  await page.locator('[data-do=inspect]').click();
  await expect(notice).toContainText('调整刻度');
  await page.clock.fastForward(3000);
  await page.evaluate(() => {
    document.documentElement.requestFullscreen = () => Promise.reject(new DOMException('Fullscreen denied', 'NotAllowedError'));
  });
  await page.locator('#game-fullscreen-toggle').click();
  await expect(notice).toContainText('F11');
  await page.clock.fastForward(2500);
  await expect(notice).toBeVisible();
  await page.clock.fastForward(3000);
  await expect(notice).toBeHidden();
  await page.locator('[data-do=tune]').click();
  await page.locator('[data-do=tune]').click();
  // A phone can dismiss the station sheet while the server is saving the reading.
  let releaseSignal;
  const pending = new Promise(resolve => { releaseSignal = resolve; });
  const slowSignal = async route => {
    if (route.request().postDataJSON()?.action !== 'inspect_landmark') return route.continue();
    const reply = await route.fetch();
    await pending;
    await route.fulfill({response:reply});
  };
  await page.route('**/actions', slowSignal);
  try {
    await page.locator('[data-do=inspect]').click();
    await page.locator('[data-do=walk]').click();
    await expect(page.getByRole('region', {name:'现场交互'})).toHaveCount(0);
  } finally {
    releaseSignal();
  }
  await expect(marker).toHaveAttribute('data-target', 'ship');
  await page.unroute('**/actions', slowSignal);
  await expectJournalConfirmation(page, '河灯已记入手记。');
  await page.locator('.lr-track-quest').click();
  await page.locator('[data-do=depart-region]').click({timeout:20000});
  await expect.poll(async () => (await state()).region_index).toBe(1);
  await page.reload();
  await expect(page.locator('.lr-chapter')).toContainText('第 2 / 8 章');
  await expect(marker).toHaveAttribute('data-target','site');
  await page.locator('.lr-track-quest').click();
  const buoy = page.locator('.lr-buoys');
  await expect(buoy).toBeVisible({timeout:30000});
  await buoy.getByRole('button', {name:/外礁/}).click();
  await expect(buoy.getByRole('status')).toContainText('礁石');
  expect((await state()).field_signals).not.toContain('salt_harbor');
  await buoy.getByRole('button', {name:/中槽/}).click();
  await expect(buoy).toBeHidden();
  await expectJournalConfirmation(page, '航灯已记入手记。');
  await expect(marker).toHaveAttribute('data-target','keeper');
  expect((await state()).field_signals).toContain('salt_harbor');
  expect((await (await page.request.get(oldPath)).json()).phase).toBe('retreated');
});

test('steady the terrace winch and read the archive dispatch before meeting the local contact', async ({page}) => {
  test.setTimeout(150000);
  const publication = await prepareExpedition(page);
  const receipt = await page.request.post('/rpg/expeditions', {data:{
    game_ids: [publication.game_id], eight_chapters:true,
  }});
  expect(receipt.ok()).toBe(true);
  let view = await receipt.json();
  const endpoint = '/rpg/expeditions/' + view.session_id;
  const orders = await page.evaluate(async () => (await import('/rpg/world/saga/chapters.js')).acts.map(a => a.choices[0].id));
  const issue = async (action, extra = {}) => {
    const r = await page.request.post(endpoint + '/actions', {data:{
      action, ...extra, event_id:crypto.randomUUID(), expected_revision:view.revision,
    }});
    expect(r.ok()).toBe(true);
    view = await r.json();
  };
  while (view.region_index < 3) {
    await issue('inspect_landmark');
    await issue('story_choice', {choice: orders[view.region_index]});
    await issue('advance_exploration');
  }
  const quest = page.locator('.lr-track-quest');
  const marker = page.locator('.lr-guide');
  await page.goto('/rpg/?session=' + view.session_id);
  await expect(marker).toHaveAttribute('data-target','site');
  await quest.click();
  const winch = page.locator('.lr-winch');
  const pawl = winch.getByRole('button', {name:'扣住绞盘铁爪'});
  await expect(winch).toBeVisible({timeout:30000});
  await winch.getByRole('button', {name:'绞紧顺风索'}).click();
  await expect(pawl).toBeDisabled();
  await winch.getByRole('button', {name:'绞紧迎风索'}).click();
  await pawl.click();
  await expect(winch).toBeHidden();
  const windNotice = page.locator('#notice');
  await expect(windNotice).toContainText('风旗已记入手记。');
  await expect(windNotice).toBeVisible();
  const station = page.getByRole('region', {name:'现场交互'});
  await expect(station).toHaveCount(0);
  await expect(page.locator('.lr-field-action[data-key="site"]')).toBeVisible();
  await page.keyboard.press('f');
  await expect(station).toContainText('已记入手记');
  // The timed confirmation must leave a deliberately reopened field note alone.
  await expect(windNotice).toBeHidden({timeout:8000});
  await expect(station).toBeVisible();
  await station.locator('[data-do=walk]').click();
  await expect(marker).toHaveAttribute('data-target','keeper');
  await page.locator('#game-menu-toggle').click();
  await page.locator('#top [data-do="journal"]').click();
  await expect(page.locator('.lr-route-list article').filter({hasText:'悬帆梯田'})).toContainText('风旗');
  view = await (await page.request.get(endpoint)).json();
  expect(view.field_signals).toContain('sail_terraces');
  await issue('story_choice', {choice: orders[view.region_index]});
  await issue('advance_exploration');
  await page.reload();
  await expect(marker).toHaveAttribute('data-target','site');
  await quest.click();
  const lamp = page.locator('.lr-light-table');
  await expect(lamp).toBeVisible({timeout:30000});
  await lamp.getByRole('button', {name:'侧面照'}).click();
  await expect(lamp.getByRole('status')).toContainText('纸纹');
  await expect(lamp.locator('[data-do=inspect]')).toBeDisabled();
  await lamp.getByRole('button', {name:'纸背透光'}).click();
  await expect(lamp.getByRole('status')).toContainText('木铃一响');
  await lamp.locator('[data-do=inspect]').click();
  await expect(lamp).toBeHidden();
  await expectJournalConfirmation(page, '书灯已记入手记。');
  await page.reload();
  await expect(marker).toHaveAttribute('data-target','keeper');
  expect((await (await page.request.get(endpoint)).json()).field_signals).toContain('palimpsest');
});

test('work the rail brake, feel the ice line, signal the bridge and sight the sunrise through the real field UI', async ({page}) => {
  test.setTimeout(180000);
  await page.emulateMedia({reducedMotion: 'reduce'});
  const publication = await prepareExpedition(page);
  const create = await page.request.post('/rpg/expeditions', {data: {
    game_ids: [publication.game_id], eight_chapters: true,
  }});
  expect(create.ok()).toBe(true);
  let view = await create.json();
  const url = '/rpg/expeditions/' + view.session_id;
  const orders = await page.evaluate(async () => (await import('/rpg/world/saga/chapters.js')).acts.map(a => a.choices[0].id));
  const order = async (action, fields = {}) => {
    const response = await page.request.post(url + '/actions', {data:{
      action, ...fields, event_id:crypto.randomUUID(), expected_revision:view.revision,
    }});
    expect(response.ok()).toBe(true);
    view = await response.json();
  };
  const districts = [
    {region:2, kind:'rail', id:'copper_yard', wrong:['hopper'], reading:'炉门', right:['cooling','brake'], confirmation:'炉火已记入手记。'},
    {region:5, kind:'lines', id:'mirror_pass', wrong:['ice'], reading:'脆响', right:['post'], confirmation:'雪铃已记入手记。'},
    {region:6, kind:'bell', id:'bell_bridges', wrong:['ring','ring'], reading:'west bank', right:['ring'], confirmation:'Bridge bell recorded in your journal.'},
    {region:7, kind:'orrery', id:'orrery', wrong:['lower','lower'], reading:'north', right:['rotate'], confirmation:'Solar dial recorded in your journal.'},
  ];
  for (const {region,kind,id,wrong,reading,right,confirmation} of districts) {
    while (view.region_index < region) {
      if (!view.field_signals.includes(view.map[view.region_index].region_id)) await order('inspect_landmark');
      await order('story_choice', {choice: orders[view.region_index]});
      await order('advance_exploration');
    }
    // Walk with the map's player-facing route finder. Each operation still goes through the HUD.
    await page.evaluate(en => localStorage.setItem('learning2game.locale', en ? 'en' : 'zh'), region >= 6);
    await page.setViewportSize(region === 5 ? {width:390,height:844} : {width:1280,height:720});
    await page.goto('/rpg/?session=' + view.session_id);
    await walkTo(page, 'site');
    const panel = page.locator('.lr-instrument-' + kind);
    await expect(panel).toBeVisible({timeout:30000});
    const finish = panel.locator('[data-do=inspect]');
    await expect(finish).toBeDisabled();
    for (const key of wrong) await panel.locator('[data-tool=' + key + ']').press('Enter');
    await expect(panel.getByRole('status')).toContainText(reading);
    await expect(finish).toBeDisabled();
    expect((await (await page.request.get(url)).json()).field_signals).not.toContain(id);
    for (const key of right) await panel.locator('[data-tool=' + key + ']').press('Enter');
    await expect(finish).toBeEnabled();
    const receipt = page.waitForResponse(r => r.url().endsWith('/actions') &&
      r.request().method() === 'POST' && r.request().postDataJSON().action === 'inspect_landmark');
    await finish.press('Enter');
    view = await (await receipt).json();
    expect(view.field_signals).toContain(id);
    await expect(panel).toHaveCount(0);
    await expectJournalConfirmation(page, confirmation);
    await page.reload();
    expect((await (await page.request.get(url)).json()).field_signals).toContain(id);
  }
});

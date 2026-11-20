import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { meetEnemy, verifyCampContinuation, verifyRegionalExit } from './rpg-battle-camp.js';
import { verifyBattleNotes } from './rpg-battle-notes.js';

const battlePath = '/rpg/battle/';
const screen = (page) => page.locator('[data-battle-phase]');
const pathOf = (response) => new URL(response.url()).pathname;
const isAction = (response, action, sessionId) =>
  response.request().method() === 'POST' &&
  (sessionId
    ? pathOf(response) === '/rpg/expeditions/' + sessionId + '/actions'
    : /^\/rpg\/expeditions\/[^/]+\/actions$/.test(pathOf(response))) &&
  response.request().postDataJSON()?.action === action;

// Solve the exercise as a player with the included lecture. Options are shuffled by the server.
const compact = (text) => text.replace(/[\s。.!！]/gu, '');
const notes = readFileSync(new URL('../../public/examples/cell-notes.txt', import.meta.url), 'utf8')
  .trim().split(/\r?\n/).map((line) => line.split('：').map(compact));

function chooseOption(view, correct) {
  const { text, options } = view.battle.prompt;
  const clue = compact(text);
  let expected;
  if (text.includes('\n甲：') && text.includes('\n乙：')) {
    const ordered = text.split(/\n[甲乙]：/u).slice(1).map(definition => {
      const record = notes.find(row => row[1] === compact(definition));
      expect(record, 'The lecture must identify ' + definition).toBeTruthy();
      return record[0];
    });
    expected = [ordered.join('/')];
  } else {
    const record = notes.find(([term, definition]) =>
      clue.includes('「' + term + '」') || clue.includes(definition));
    expect(record, 'The public lecture must cover the displayed question: ' + text).toBeTruthy();
    expected = record;
  }
  const answers = options.filter(option => expected.includes(compact(option.text)));
  expect(answers).toHaveLength(1);
  return options.find((option) => (option.id === answers[0].id) === correct);
}

async function expectView(page, view) {
  await expect(screen(page)).toHaveAttribute('data-battle-phase', view.phase);
  await expect(screen(page)).toHaveAttribute('data-battle-revision', String(view.revision));
}

async function expectCharactersOnBridge(page) {
  const arena = page.getByTestId('battle-arena');
  const characters = arena.locator('.rpg-stage-actor');
  await expect(characters).toHaveCount(2);
  const bounds = await arena.boundingBox();
  for (const actor of await characters.all()) {
    const box = await actor.evaluate(async node => {
      const image = node.querySelector('img');
      await image.decode();
      const pose = node.querySelector('canvas');
      if (!pose || getComputedStyle(pose).display === 'none') return image.getBoundingClientRect().toJSON();
      const {data} = pose.getContext('2d').getImageData(0, 0, pose.width, pose.height);
      let first = pose.height, last = -1;
      for (let pixel = 0; pixel < pose.width * pose.height; pixel++) {
        if (data[4*pixel+3] < 12) continue;
        const y = Math.floor(pixel / pose.width);
        first = Math.min(first, y); last = Math.max(last, y);
      }
      const rect = pose.getBoundingClientRect(), scale = rect.height / pose.height;
      return {y:rect.y + first*scale, height:(last - first + 1)*scale};
    });
    expect(box.height).toBeGreaterThan(30);
    expect(box.y).toBeGreaterThanOrEqual(bounds.y);
    expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  }
}

function skillForTurn(view, correct) {
  if (view.phase !== 'combat' || !correct) return 'strike';
  if (['heavy', 'charge'].includes(view.battle.tactics.intent?.id)) return 'guard';
  return view.player.burst_ready ? 'burst' : 'strike';
}

async function playTurn(page, view, { correct = true, rapidClick = false } = {}) {
  const skill = skillForTurn(view, correct);
  if (view.phase === 'combat') await page.getByTestId('battle-skill-' + skill).click();
  const option = chooseOption(view, correct);
  await page.locator('[data-option-id="' + option.id + '"]').click();
  const reply = page.waitForResponse((response) => isAction(response, 'answer', view.session_id));
  const submit = page.getByTestId('battle-submit');
  await expect(submit).toBeEnabled();
  if (rapidClick) {
    // Two actual click attempts in the same task, before fetch can return its receipt.
    await submit.evaluate((button) => { button.click(); button.click(); });
  } else {
    await submit.click();
  }
  const response = await reply;
  expect(response.status()).toBe(200);
  const next = await response.json();
  expect(next.revision).toBe(view.revision + 1);
  expect(next.battle.last_event.correct).toBe(correct);
  expect(response.request().postDataJSON().skill).toBe(skill);
  await expectView(page, next);
  return next;
}

const test = base.extend({
  startDemo: async ({ page, request }, use) => {
    let material;
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('console', (message) => {
      if (message.text().includes('Battle animation skipped')) browserErrors.push(message.text());
    });
    try {
      await use(async () => {
        await page.goto(battlePath);
        await expect(page.getByTestId('battle-arena')).toBeVisible();
        await expect(screen(page)).toHaveAttribute('data-battle-phase', 'ready');
        const upload = page.waitForResponse((r) =>
          r.request().method() === 'POST' && pathOf(r) === '/materials');
        const opening = page.waitForResponse((r) => isAction(r, 'choose_route'));
        await page.getByTestId('battle-start').click();
        material = await (await upload).json();
        const view = await (await opening).json();
        expect(view.battle.tactics.encounter_id).toBe('willow_lock');
        await expectView(page, view);
        return view;
      });
    } finally {
      if (material?.delete_token) {
        const deleted = await request.delete('/materials/' + material.material_id, {
          headers: { 'X-Material-Token': material.delete_token },
        });
        expect(deleted.status()).toBe(204);
      }
      expect(browserErrors).toEqual([]);
    }
  },
});

const checkCopy = async (page) => {
  expect(await page.locator('body').innerText()).not.toMatch(
    /\u00b7|不是|而是|不能|并非|不代表|不意味着|不等于|只(?:能证明|能说明)/u,
  );
};

async function openTestHost(page, sessionId) {
  await page.route('**/__battle_host_test', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/rpg/battle/battle.css"><main id="host"></main>',
  }));
  await page.goto('/__battle_host_test');
  await page.evaluate(async (id) => {
    const { mountBattle } = await import('/rpg/battle/battle.js');
    const host = document.querySelector('#host');
    const component = mountBattle(host, { sessionId: id, onExit(latest) {
      host.dataset.returnedSession = latest.session_id;
      host.dataset.returnedRevision = String(latest.revision);
      component.destroy();
    } });
    await component.ready;
  }, sessionId);
}

test('public lecture to willow boss victory, actual XP and loot, one answer per rapid click', async ({
  page, request, startDemo,
}) => {
  let view = await startDemo();
  await expectCharactersOnBridge(page);
  const field = await page.getByTestId('battle-arena').elementHandle();
  await expect(page.getByTestId('battle-intent')).toContainText(view.battle.tactics.intent.name);
  expect(view.player.burst_ready).toBe(false);
  await expect(page.getByTestId('battle-skill-burst')).toBeDisabled();
  await checkCopy(page);
  const answerIds = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/actions') &&
        r.postDataJSON().action === 'answer') answerIds.push(r.postDataJSON().event_id);
  });
  const damageNumbers = page.locator('.rpg-stage-numbers');
  await damageNumbers.evaluate((layer) => {
    const observer = new MutationObserver((changes) => {
      for (const change of changes) for (const node of change.addedNodes)
        if (node.dataset?.side === 'foe') layer.dataset.lastFoeHit = node.textContent;
    });
    observer.observe(layer, {childList:true});
  });
  let turns = 0;
  let sawSecondPhase = false;
  while (view.phase === 'combat' && turns < 24) {
    view = await playTurn(page, view, { rapidClick: turns === 0 });
    if (turns === 0) {
      expect(view.battle.last_event.damage_dealt).toBeGreaterThan(0);
      await expect(damageNumbers).toHaveAttribute('data-last-foe-hit',
        new RegExp('−' + view.battle.last_event.damage_dealt + '$'));
    }
    if (view.phase === 'combat' && view.battle.tactics.phase === 2) {
      sawSecondPhase = true;
      await expect(page.locator('.rpg-stage-world')).toHaveAttribute('data-story', 'surge');
    }
    turns += 1;
  }
  expect(view.phase).toBe('victory');
  expect(sawSecondPhase).toBe(true);
  await expect(page.locator('.rpg-stage-world')).toHaveAttribute('data-story','open');
  expect(answerIds).toHaveLength(turns);
  expect(new Set(answerIds).size).toBe(turns);
  const event = view.battle.last_event;
  expect(event.xp_gained).toBeGreaterThan(0);
  expect(event.loot_items.length).toBeGreaterThan(0);
  const result = page.getByTestId('battle-result');
  await expect(result).toBeVisible();
  expect(await field.evaluate(node => node === document.querySelector('[data-testid="battle-arena"]'))).toBe(true);
  await expect(result).toContainText(String(event.xp_gained));
  for (const item of event.loot_items) await expect(result).toContainText(item.name);
  const report = await (await request.get('/rpg/expeditions/' + view.session_id + '/report')).json();
  expect(report.outcome).toBe('victory');
  expect(report.combat_attempts).toBe(turns);
  expect(report.player.xp).toBe(view.player.xp);
  await checkCopy(page);

  // A teammate can mount this exact saved victory in a plain host and take
  // ownership again after the player has read the settlement.
  await openTestHost(page, view.session_id);
  await expectView(page, view);
  await expect(page.locator('.rpg-stage-world')).toHaveAttribute('data-story','open');
  await expect(page.locator('.rpg-stage-storymark')).toBeHidden();
  await page.getByTestId('battle-exit').click();
  await expect(page.locator('#host')).toHaveAttribute('data-returned-session', view.session_id);
  await expect(page.locator('#host')).toHaveAttribute('data-returned-revision', String(view.revision));
  await expect(page.getByTestId('battle-arena')).toHaveCount(0);
});

test('defeat opens sourced camp exercises; refresh restores them and recovery reopens the same boss', async ({
  page, startDemo,
}) => {
  let view = await startDemo();
  const boss = view.battle.tactics.encounter_id;
  for (let turn = 0; view.phase === 'combat' && turn < 20; turn++)
    view = await playTurn(page, view, { correct: false });
  expect(view.phase).toBe('sidequest');
  await expect(page.locator('.rpg-stage-world')).toHaveAttribute('data-story','camp');
  const first = view.battle.sidequest.lesson;
  await expect(page.getByTestId('battle-lesson')).toContainText(first.term);
  await expect(page.getByTestId('battle-lesson')).toContainText(first.source_ref);
  await checkCopy(page);
  await page.reload();
  await expectView(page, view);
  await expect(page.locator('.rpg-stage-world')).toHaveAttribute('data-story','camp');
  await expect(page.getByTestId('battle-lesson')).toContainText(first.definition);
  const taskCount = view.battle.sidequest.total;
  view = await playTurn(page, view, { correct: false });
  expect(view.battle.sidequest.completed).toBe(0);
  const order = [];
  for (let turn = 0; view.phase === 'sidequest' && turn < taskCount; turn++) {
    order.push(view.battle.sidequest.lesson.term);
    view = await playTurn(page, view);
  }
  expect(new Set(order).size).toBe(taskCount);
  expect(order.at(-1)).toBe(first.term);
  expect(view.phase).toBe('combat');
  expect(view.battle.sidequests_completed).toBe(1);
  expect(view.battle.tactics.encounter_id).toBe(boss);
  expect(view.player.hp).toBe(view.player.max_hp);
  await expect(page.getByTestId('battle-lesson')).toBeHidden();
});

test('mobile reduced-motion controls, hint receipt and a bookmarked battle survive reload', async ({
  page, startDemo,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let view = await startDemo();
  await expectCharactersOnBridge(page);
  const settings = page.locator('.bf-settings summary');
  await settings.click();
  await expect(page.getByRole('button', {name:'简化动效'})).toHaveAttribute('aria-pressed', 'true');
  const sound = page.getByRole('button', {name:'战斗音效'});
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await settings.click();
  const receipt = page.waitForResponse((r) => isAction(r, 'hint', view.session_id));
  await page.getByTestId('battle-hint').click();
  view = await (await receipt).json();
  await expectView(page, view);
  expect(view.battle.prompt.hint).toBeTruthy();
  await expect(page.locator('body')).toContainText(view.battle.prompt.hint);
  await page.goto(battlePath + '?session=' + encodeURIComponent(view.session_id));
  await expectView(page, view);
  await expect(page.locator('body')).toContainText(view.battle.prompt.hint);
  await settings.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await settings.click();
  const next = await playTurn(page, view);
  await page.reload();
  await expectView(page, next);
  await expect(page.locator('body')).toContainText(next.battle.prompt.text);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await checkCopy(page);
});

test('an interrupted hint replays the same event on reload and a competing tab refreshes the view', async ({
  page, request, startDemo,
}) => {
  let view = await startDemo();
  const actionUrl = '/rpg/expeditions/' + view.session_id + '/actions';
  const sent = [];
  await page.route('**' + actionUrl, async (route) => {
    sent.push(route.request().postDataJSON());
    if (sent.length === 1) await route.abort('failed');
    else await route.continue();
  });
  const failed = page.waitForEvent('requestfailed', (r) => new URL(r.url()).pathname === actionUrl);
  await page.getByTestId('battle-hint').click();
  await failed;
  const restored = page.waitForResponse((r) => isAction(r, 'hint', view.session_id));
  await page.reload();
  view = await (await restored).json();
  await expectView(page, view);
  expect(sent).toHaveLength(2);
  expect(sent[0]).toEqual(sent[1]);
  expect(view.battle.prompt.hint).toBeTruthy();

  const fields = { action: 'answer', expected_revision: view.revision, event_id: 'second-tab-turn',
    prompt_id: view.battle.prompt.prompt_id, option_id: chooseOption(view, true).id, skill: 'strike' };
  const external = await request.post(actionUrl, { data: fields });
  expect(external.status()).toBe(200);
  const advanced = await external.json();
  await page.locator('[data-option-id="' + fields.option_id + '"]').click();
  const rejected = page.waitForResponse((r) => isAction(r, 'answer', view.session_id));
  await page.getByTestId('battle-submit').click();
  expect((await rejected).status()).toBe(409);
  await expectView(page, advanced);
  await expect(page.locator('body')).toContainText(advanced.battle.prompt.text);
});

test('a scrolling embedded host briefly brings its offscreen fight to a phone reader', async ({
  page, startDemo,
}) => {
  await page.setViewportSize({width:390, height:490});
  await page.emulateMedia({reducedMotion:'no-preference'});
  let view = await startDemo();
  await openTestHost(page, view.session_id);
  await expectView(page, view);
  const arena = page.getByTestId('battle-arena');
  await arena.evaluate((el) => {
    el.dataset.openCount = '0';
    el.addEventListener('beforetoggle', (event) => {
      if (event.newState === 'open') el.dataset.openCount = String(Number(el.dataset.openCount) + 1);
    });
  });
  for (const reduced of [false, true]) {
    if (reduced) await page.getByRole('button', {name:'简化动效'}).click();
    const option = chooseOption(view, true);
    await page.locator('[data-option-id="' + option.id + '"]').click();
    const before = await arena.evaluate((el) => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      return {scroll:scrollY, bottom:el.getBoundingClientRect().bottom};
    });
    expect(before.bottom).toBeLessThan(0);
    const reply = page.waitForResponse((r) => isAction(r, 'answer', view.session_id));
    await page.getByTestId('battle-submit').click();
    if (!reduced) {
      const overlay = page.locator('[data-testid="battle-arena"]:popover-open');
      await expect(overlay).toBeVisible();
      const box = await overlay.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThan(230);
    }
    view = await (await reply).json();
    await expectView(page, view);
    await expect(arena).toHaveAttribute('data-open-count', '1');
    const restored = await arena.evaluate((el) => ({
      opened:el.matches(':popover-open'), scroll:scrollY, bottom:el.getBoundingClientRect().bottom,
    }));
    expect(restored.opened).toBe(false);
    expect(restored.bottom).toBeLessThan(0);
    expect(Math.abs(restored.scroll - before.scroll)).toBeLessThan(10);
  }
});

async function twoStageCourse(page, request, startDemo) {
  const uploaded = page.waitForResponse((r) => r.request().method() === 'POST' && pathOf(r) === '/materials');
  await startDemo();
  const material = await (await uploaded).json();

  async function publishJob(endpoint, data, done) {
    const response = await request.post(endpoint, { data });
    expect(response.status()).toBe(202);
    const { job_id } = await response.json();
    let job;
    await expect.poll(async () => {
      job = await (await request.get('/jobs/' + job_id)).json();
      return job.status;
    }).toBe(done);
    return job.result;
  }
  const plan = await publishJob('/rpg/plans', {
    material_id: material.material_id, preferences: { scene_count: 2, challenge_count: 6 },
  }, 'awaiting_confirmation');
  const game = await publishJob('/rpg/games', { plan_id: plan.plan_id, confirmed: true }, 'completed');
  return game.game_id;
}

test('first chapter rewards stay on the battlefield and can be handed back to the traveling party', async ({
  page, request, startDemo,
}) => {
  const course = await twoStageCourse(page, request, startDemo);
  const created = await request.post('/rpg/expeditions', { data: { game_ids: [course], hero_class: 'ranger' } });
  expect(created.status()).toBe(201);
  const start = await created.json();
  let {view, origin} = await meetEnemy(page, start, start.routes[0].id);
  const path = '/rpg/expeditions/' + view.session_id;
  await expectView(page, view);
  const arena = page.getByTestId('battle-arena');
  const field = await arena.elementHandle();
  for (let i = 0; view.phase === 'combat' && i < 24; i++) view = await playTurn(page, view);
  expect(view.phase).toBe('reward');
  expect(view.cleared_chapters).toBe(1);
  expect(view.rewards.length).toBeGreaterThan(0);
  await expect(page.getByTestId('battle-result')).toContainText('守军已退');
  expect(await field.evaluate(node => node === document.querySelector('[data-testid="battle-arena"]'))).toBe(true);
  for (const viewport of [{width:1708,height:938}, {width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => arena.boundingBox()).toEqual({x:0, y:0, ...viewport});
    await expect(page.getByTestId('battle-exit')).toBeInViewport({ratio:1});
  }
  const embed = await page.context().newPage();
  await openTestHost(embed, view.session_id);
  await expectView(embed, view);
  await embed.getByTestId('battle-exit').click();
  await expect(embed.locator('#host')).toHaveAttribute('data-returned-revision', String(view.revision));
  await embed.close();
  const saved = await (await request.get(path)).json();
  expect(saved.phase).toBe('reward');
  expect(saved.revision).toBe(view.revision);
  await verifyCampContinuation(page, view, origin);
});

test('a chapter boss returns the party to the encounter and the player chooses when to leave', async ({
  page, request, startDemo,
}) => {
  test.setTimeout(120000);
  const course = await twoStageCourse(page, request, startDemo);
  const created = await request.post('/rpg/expeditions', {data: {game_ids:[course], eight_chapters:true}});
  expect(created.ok()).toBe(true);
  const start = await created.json();
  const order = await request.post('/rpg/expeditions/' + start.session_id + '/actions', {data:{
    action:'story_choice', choice:'ferry_child', expected_revision:start.revision, event_id:'ferry-order',
  }});
  expect(order.ok()).toBe(true);
  let {view, origin} = await meetEnemy(page, await order.json(), 'boss_steady');
  const prompts = new Set();
  for (let i = 0; view.phase === 'combat' && i < 24; i++) {
    expect(prompts.has(view.battle.prompt.text)).toBe(false);
    prompts.add(view.battle.prompt.text);
    view = await playTurn(page, view);
  }
  expect(prompts.size).toBeGreaterThanOrEqual(4);
  expect(view.phase).toBe('reward');
  await verifyRegionalExit(page, view, origin);
});

test('read a counterhit and the finishing blow on the battlefield, reopen after saving, return keyboard focus', async ({
  page, startDemo,
}) => {
  await verifyBattleNotes(page, startDemo, playTurn);
});

test('an unbriefed Copper Yard guard guides the player to Flint, then allows the original fight', async ({page, request}) => {
  test.setTimeout(120000);
  await page.goto('/rpg/');
  // Twelve scenes place both a patrol and a boss in Copper Yard. Use public lesson
  // text for staging chapters one and two, keeping the server's story gate intact.
  const source = readFileSync(new URL('../../public/examples/cell-notes.txt', import.meta.url), 'utf8');
  let view = await page.evaluate(async source => {
    const { ApiClient } = await import('/js/api.js');
    const { fieldbook } = await import('/rpg/world/fieldbook.js');
    const more = (await fieldbook('zh').text()).split('\n').slice(0, 4);
    const course = new File([[source.trim(), ...more].join('\n')], '巡道练习.txt', {type:'text/plain'});
    const api = new ApiClient();
    const post = (path, body) => api.request(path, {method:'POST', body});
    const finish = async (path, body) => (await api.waitForJob((await post(path, body)).job_id)).result;
    const upload = await api.upload(course);
    await api.waitForJob(upload.job_id);
    const {volumes} = await post('/rpg/expedition-outline', {
      sources:[{material_id:upload.material_id}], eight_chapters:true, concepts_per_volume:4,
      scenes_per_volume:4, question_language:'zh',
    });
    const ids = [];
    for (const volume of volumes) {
      const plan = await finish('/rpg/plans', volume.plan_request);
      const game = await finish('/rpg/games', {plan_id:plan.plan_id, confirmed:true});
      ids.push(game.game_id);
    }
    return post('/rpg/expeditions', {game_ids:ids, eight_chapters:true, hero_class:'vanguard', kit:'ward'});
  }, source);
  const endpoint = '/rpg/expeditions/' + view.session_id;
  const orders = await page.evaluate(async () => (await import('/rpg/world/saga/chapters.js')).acts.map(a => a.choices[0].id));
  async function issue(action, fields = {}) {
    const response = await request.post(endpoint + '/actions', {data:{
      action, ...fields, event_id:crypto.randomUUID(), expected_revision:view.revision,
    }});
    expect(response.ok()).toBe(true);
    view = await response.json();
  }
  while (view.region_index < 2) {
    const region = view.map[view.region_index].region_id;
    if (!view.story_marks[region]) await issue('story_choice', {choice:orders[view.region_index]});
    await issue('choose_route', {route_id:view.routes[0].id});
    while (view.phase === 'combat') {
      const prompt = view.battle.prompt;
      let option;
      if (view.battle.rounds.kind === 'tactics') {
        const [a, b] = prompt.text.match(/\d+/g).map(Number);
        const result = prompt.text.includes('架势') ? Math.ceil(a / b) : a - b;
        option = prompt.options.find(o => Number(o.text) === result);
        expect(option, prompt.text).toBeDefined();
      } else option = chooseOption(view, true);
      await issue('answer', {prompt_id:prompt.prompt_id, option_id:option.id, skill:'guard'});
      expect(view.battle.last_event.correct).toBe(true);
    }
    await issue('choose_reward', {reward_id:'purse'});
  }
  expect(view.map[2].region_id).toBe('copper_yard');
  expect(view.story_marks.copper_yard).toBeUndefined();
  expect(view.routes.some(route => route.id === 'normal')).toBe(true);
  await page.goto('/rpg/?session=' + view.session_id);
  const walk = async key => {
    await page.locator('.lr-travel-list summary').click();
    await page.locator(`.lr-travel-list [data-key="${key}"]`).click();
  };
  const panel = page.getByRole('region', {name:'现场交互'});
  const lead = panel.locator('[data-do="follow-quest"][data-key="keeper"]');
  const story = page.locator('#story-dialog');
  await page.setViewportSize({width:390, height:844});
  await walk('elite');
  await expect(lead).toBeVisible({timeout:30000});
  await expect(panel.locator('[data-do="engage"]')).toHaveCount(0);
  await page.locator('.lr-track-quest').click({timeout:5000});
  await expect(story).toBeVisible({timeout:30000});
  await page.reload();
  expect((await (await request.get(endpoint)).json()).revision).toBe(view.revision);
  await page.setViewportSize({width:1360, height:900});
  await walk('normal');
  await expect(lead).toBeVisible({timeout:30000});
  await expect(lead).toContainText('铆青');
  await expect(panel.locator('[data-do="engage"]')).toHaveCount(0);
  await lead.click();
  await expect(story).toBeVisible({timeout:30000});
  expect((await (await request.get(endpoint)).json()).revision).toBe(view.revision);
  await story.getByRole('button', {name:/继续/}).click();
  await story.getByRole('button', {name:/继续/}).click();
  await story.getByRole('button', {name:/接回装着炉工的尾车/}).click();
  await story.getByRole('button', {name:'回到战场'}).click();
  expect((await (await request.get(endpoint)).json()).story_marks.copper_yard).toBe(orders[2]);
  await walk('normal');
  const receipt = page.waitForResponse(r => isAction(r, 'choose_route', view.session_id));
  await panel.getByRole('button', {name:/迎战守卫/}).click({timeout:30000});
  const reply = await receipt;
  expect(reply.status()).toBe(200);
  expect(reply.request().postDataJSON().route_id).toBe('normal');
  expect((await reply.json()).phase).toBe('combat');
  await expect(page.getByTestId('battle-submit')).toBeVisible();
});

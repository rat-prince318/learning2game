import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

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


test('the fourth ball keeps four dedicated hoops through a wrong basket, reload and final score', async ({ page, request }, testInfo) => {
  test.setTimeout(120000);
  const lesson = JSON.parse(readFileSync(new URL('../../backend/fixtures/court-zh.json', import.meta.url), 'utf8'));
  const game = await (await request.get('/court/warmup?language=zh')).json();
  const questions = lesson.shots.map(shot => {
    const ball = game.left_cards.find(candidate => candidate.text === shot.ball);
    expect(ball).toBeDefined();
    const ids = game.court_options[ball.id];
    expect(new Set(ids).size).toBe(4);
    const goal = game.right_cards.find(board => ids.includes(board.id) && board.text === shot.hoop);
    expect(goal).toBeDefined();
    return { ball, ids, goal };
  });
  // Leave the velocity question until 3/4, reproducing the late-game screen.
  const final = questions.splice(lesson.shots.findIndex(shot => shot.ball.includes('平均速度')), 1)[0];
  await page.goto('/?court=' + game.game_id + '#play');
  const chooser = page.locator('#court-targets');
  const boards = page.locator('[data-hoop-id]');
  const shotAt = async (question, id) => {
    await chooser.click();
    await expect(boards).toHaveCount(4);
    expect(await boards.evaluateAll(nodes => nodes.map(node => node.dataset.hoopId))).toEqual(question.ids);
    await page.locator('[data-hoop-id="' + id + '"]').click();
    const receipt = page.waitForResponse(res => res.request().method() === 'POST' && res.url().endsWith('/attempts'));
    await page.locator('#court-assist').click();
    const response = await receipt;
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  for (const [index, question] of questions.entries()) {
    await page.locator('#court-balls').click();
    await page.locator('[data-ball-id="' + question.ball.id + '"]').click();
    expect((await shotAt(question, question.goal.id)).correct).toBe(true);
    await expect(page.locator('#play-progress')).toHaveText((index + 1) + ' / 4');
  }
  await expect(page.locator('#court-ball-text')).toHaveText(final.ball.text);
  const placards = page.locator('.mc-placard');
  await expect(placards).toHaveCount(4);
  await expect(chooser).toContainText('(4)');
  await expect.poll(() => placards.evaluateAll(nodes => nodes.every(node => {
    const rect = node.getBoundingClientRect();
    return !node.hidden && rect.left >= 0 && rect.right <= innerWidth;
  }))).toBe(true);
  await page.screenshot({path: testInfo.outputPath('last-ball-on-court.png')});
  await chooser.click();
  await expect(boards).toHaveCount(4);
  await page.screenshot({path: testInfo.outputPath('last-ball-four-hoops.png')});
  await page.keyboard.press('Escape');
  const wrong = final.ids.find(id => id !== final.goal.id);
  expect((await shotAt(final, wrong)).correct).toBe(false);
  await expect(page.locator('#play-errors')).toHaveText('1');
  await expect(page.locator('#play-progress')).toHaveText('3 / 4');
  await page.reload();
  await expect(page.locator('#court-ball-text')).toHaveText(final.ball.text);
  await expect(page.locator('#play-errors')).toHaveText('1');
  expect((await shotAt(final, final.goal.id)).correct).toBe(true);
  await expect(page.locator('#page-report')).toBeVisible();
  await expect(page.locator('#report-subtitle')).toContainText('4');
  const state = await page.evaluate(id => JSON.parse(localStorage.getItem('learning2game-court-v1:' + id)), game.game_id);
  const report = await (await request.get('/sessions/' + state.sessionId + '/report')).json();
  expect(report.valid_attempts).toBe(5);
  expect(report.matched_pairs).toBe(4);
  expect(report.mistakes).toBe(1);
});


test('an upgraded draft discards a retired pending target and an archived report opens against a legacy server', async ({ page, request }) => {
  const game = await (await request.get('/court/warmup?language=en')).json();
  await page.goto('/?court=' + game.game_id + '#play');
  await expect(page.locator('#court-targets')).toBeEnabled();
  const first = game.left_cards[0].id;
  const other = game.right_cards.find(board => !game.court_options[first].includes(board.id));
  const key = 'learning2game-court-v1:' + game.game_id;
  await page.evaluate(({key, first, other}) => {
    const state = JSON.parse(localStorage.getItem(key));
    state.recovery.heldBallId = null;
    state.recovery.rightOrder = [other.id];
    state.recovery.pendingEvent = {event_id: 'from-old-sharing-rules', left_card_id: first, right_card_id: other.id};
    localStorage.setItem(key, JSON.stringify(state));
  }, {key, first, other});
  const sends = [];
  page.on('request', req => {if (req.url().endsWith('/attempts')) sends.push(req.url());});
  await page.reload();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).recovery.heldBallId, key)).toBe(first);
  await page.locator('#court-targets').click();
  expect(await page.locator('[data-hoop-id]').evaluateAll(nodes => nodes.map(n => n.dataset.hoopId))).toEqual(game.court_options[first]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#attempt-retry')).toBeHidden();
  expect(sends).toEqual([]);
  const legacy = { game_id: game.game_id, title: game.title, left_cards: game.left_cards,
    right_cards: game.right_cards.slice(0, 4), court_groups: [] };
  await page.route('**/games/' + game.game_id, route => route.fulfill({json: legacy}));
  await page.reload();
  await expect(page.locator('#global-error')).toContainText(/旧版篮板|older set of backboards/);
  await expect(page.locator('.mc-scene')).toHaveCount(0);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  expect(saved.recovery.heldBallId).toBe(first);
  const finish = await request.post('/sessions/' + saved.sessionId + '/finish');
  expect(finish.ok()).toBeTruthy();
  await page.reload();
  await expect(page.locator('#page-report')).toBeVisible();
  await expect(page.locator('#report-subtitle')).toContainText(game.title);
});

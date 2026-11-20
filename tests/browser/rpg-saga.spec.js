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
  await page.locator(`[data-do="spot"][data-key="${key}"]`).click();
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
    { width: 1152, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
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
  let view = await state();
  const phases = new Set();
  for (let turn = 0; view.phase === 'combat' && turn < 18; turn++) {
    await expect(page.locator('.l2g-battle')).toHaveAttribute('data-battle-busy', 'false');
    const phase = view.battle.tactics.phase;
    phases.add(phase);
    await expect(page.locator('.rpg-stage-world')).toHaveAttribute(
      'data-ash',
      phase === 2 ? 'ash-crown-enraged' : 'ash-crown-armored',
    );
    const option = answerForFixture(view.battle.prompt);
    await page.locator(`[data-option-id="${option}"]`).click();
    const response = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === endpoint + '/actions',
    );
    await page.getByTestId('battle-submit').click();
    view = await (await response).json();
    expect(view.battle.last_event.correct).toBe(true);
  }
  expect([...phases]).toEqual([1, 2]);
  expect(view.phase).toBe('victory');
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

import { test, expect } from '@playwright/test';

const checkCopy = async (page) => {
  const visible = await page.locator('body').innerText();
  expect(visible).not.toMatch(
    /\u00b7|不是|而是|不能|并非|不代表|不意味着|不等于|只(?:能证明|能说明)/u,
  );
};
const openSample = async (page) => {
  await page.goto('/');
  await page.locator('#sample-button').click();
  await expect(page.locator('#plan-panel')).toBeVisible();
};
const play = async (page) => {
  await page.locator('#confirm-plan').check();
  await page.locator('#generate-button').click();
  await page.locator('#start-button').click();
  await expect(page.locator('#page-play')).toBeVisible();
};
const shootAtFirstHoop = async (page) => {
  await page.locator('#court-targets').click();
  await page.locator('[data-hoop-id]').first().click();
  await page.locator('#court-assist').click();
};
const leaveCourt = async (page) => {
  await page.locator('#court-menu').click();
  await page.locator('#court-exit').click();
};
test('actual course sample: edit, play, hint, resume, report, targeted practice and cleanup', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openSample(page);
  await checkCopy(page);
  const choices = page.locator('#plan-choices input:checked');
  while ((await choices.count()) > 4) await choices.last().uncheck();
  await page.locator('#plan-difficulty').selectOption('easy');
  await play(page);
  const rack = page.locator('[data-ball-id]');
  await page.locator('#court-balls').click();
  await expect(rack).toHaveCount(4);
  await rack.first().click();
  await page.locator('#hint-button').click();
  await expect(page.locator('#play-hints')).toHaveText('1');
  await page.locator('#court-log [data-court-close]').click();
  await shootAtFirstHoop(page);
  await expect(page.locator('.feedback-result')).toBeAttached({timeout:15000});
  const progress = await page.locator('#play-progress').innerText(),
    errorsCount = await page.locator('#play-errors').innerText();
  await page.reload();
  await expect(page.locator('#page-play')).toBeVisible();
  await expect(page.locator('#play-hints')).toHaveText('1');
  await expect(page.locator('#play-progress')).toHaveText(progress);
  await expect(page.locator('#play-errors')).toHaveText(errorsCount);
  await checkCopy(page);
  await page.locator('#finish-button').click();
  await page.locator('#confirm-dialog-action').click();
  await expect(page.locator('#page-report')).toBeVisible();
  await expect(page.locator('.report-knowledge')).toHaveCount(4);
  await expect(page.locator('#report-advice')).not.toHaveText(/正在整理/);
  await checkCopy(page);
  await page.locator('#practice-button').click();
  await expect(page.locator('#plan-panel')).toBeVisible();
  await play(page);
  await page.locator('#court-balls').click();
  await expect(rack).toHaveCount(4);
  await rack.first().click();
  await leaveCourt(page);
  await page.locator('#clear-data-button').click();
  await page.locator('#confirm-dialog-action').click();
  await expect(page.locator('#selected-file')).toBeHidden();
  await expect(page.locator('#page-create')).toBeVisible();
  expect(errors).toEqual([]);
});
test('custom text upload uses actual extraction with its own source references', async ({
  page,
}) => {
  await page.goto('/');
  const data =
    '流量计：记录管道中流体通过的体积。\\n温度计：测量样品的热状态。\\n压力计：测量流体在容器内施加的压强。\\n湿度计：测量空气中的水汽含量。'.replaceAll(
      '\\n',
      '\n',
    );
  await page
    .locator('#material-file')
    .setInputFiles({ name: '仪器讲义.txt', mimeType: 'text/plain', buffer: Buffer.from(data) });
  await page.locator('#pair-count').selectOption('2');
  await page.locator('#analyze-button').click();
  await expect(page.locator('#plan-panel')).toBeVisible();
  await expect(page.locator('#knowledge-list')).toContainText('流量计');
  await page.locator('#knowledge-list summary').first().click();
  await expect(page.locator('#knowledge-list .source').first()).toBeVisible();
  await page.locator('#clear-data-button').click();
  await page.locator('#confirm-dialog-action').click();
  await expect(page.locator('#selected-file')).toBeHidden();
});
test('mobile sample and actionable validation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#analyze-button').click();
  await expect(page.locator('#global-error')).toContainText('请选择');
  await page.locator('#dismiss-error').click();
  await page.locator('#sample-button').click();
  await expect(page.locator('#plan-panel')).toBeVisible();
  await checkCopy(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('#clear-data-button').click();
  await page.locator('#confirm-dialog-action').click();
  await expect(page.locator('#selected-file')).toBeHidden();
});
test('replay after a lost acknowledgement counts the action once and keeps uploaded files manageable', async ({
  page,
  request,
}) => {
  let materialId;
  page.on('response', async (res) => {
    if (
      res.request().method() === 'POST' &&
      new URL(res.url()).pathname === '/materials' &&
      res.status() === 202
    )
      materialId = (await res.json()).material_id;
  });
  await openSample(page);
  await play(page);
  const sent = [];
  await page.route('**/sessions/*/attempts', async (route) => {
    sent.push(route.request().postDataJSON().event_id);
    const accepted = await route.fetch();
    if (sent.length === 1) await route.abort('failed');
    else await route.fulfill({ response: accepted });
  });
  await shootAtFirstHoop(page);
  await expect(page.locator('#attempt-retry')).toBeVisible();
  await page.reload();
  await expect(page.locator('#attempt-retry')).toBeVisible();
  await page.locator('#retry-attempt-button').click();
  await expect(page.locator('.feedback-result')).toBeAttached();
  expect(sent).toHaveLength(2);
  expect(sent[0]).toEqual(sent[1]);
  const matched = Number((await page.locator('#play-progress').innerText()).split('/')[0].trim());
  expect(matched + Number(await page.locator('#play-errors').innerText())).toEqual(1);
  await leaveCourt(page);
  await page.locator('#remove-file').click();
  await page.locator('#privacy-button').click();
  await expect(page.locator('#saved-materials')).toContainText('细胞结构讲义.txt');
  await page.locator('#saved-materials button').click();
  await page.locator('#confirm-dialog-action').click();
  await expect
    .poll(async () => (await request.get('/materials/' + materialId + '/knowledge')).status())
    .toBe(404);
});

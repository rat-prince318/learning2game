import { test, expect } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAppServer } from '../../server/index.js';

const evidence = resolve('artifacts/screenshots');
const pairs = [
  ['细胞核', '遗传信息'], ['线粒体', 'ATP'], ['细胞膜', '选择性地'],
  ['核糖体', '信使 RNA'], ['叶绿体', '光合作用'], ['细胞壁', '结构支撑']
];
async function capture(page, name) { await mkdir(evidence, { recursive: true }); await page.screenshot({ path: join(evidence, name), fullPage: true }); }
async function createGame(page, { count = 6, goal = 'definitions', level = 'beginner', navigate = true } = {}) {
  if (navigate) await page.goto('/');
  await page.locator('#sample-button').click();
  await page.locator('#learner-level').selectOption(level); await page.locator('#learning-goal').selectOption(goal);
  await page.locator(`input[name="pair_count"][value="${count}"]`).check();
  await page.locator('#analyze-button').click(); await expect(page.locator('#plan-panel')).toBeVisible();
  await expect(page.locator('#generate-button')).toBeDisabled();
  await page.locator('#confirm-plan').check(); await page.locator('#generate-button').click();
  await expect(page.locator('#ready-panel')).toBeVisible(); await page.locator('#start-button').click();
  await expect(page.locator('#page-play')).toBeVisible();
}
async function match(page, left, right) {
  await page.locator('#left-cards button').filter({ hasText: left }).click();
  await page.locator('#right-cards button').filter({ hasText: right }).click();
  await expect(page.locator('#selection-status')).not.toContainText('正在等待判分');
}
async function closeServer(server) { await new Promise(resolve => server.close(resolve)); }

test('C1–C6: complete six pairs with one mistake and hint, then practice the weak concept', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await createGame(page);
  await capture(page, 'desktop-play.png');
  await match(page, '细胞核', '光合作用'); await expect(page.locator('#play-errors')).toHaveText('1');
  await page.locator('#left-cards button').filter({ hasText: '细胞核' }).click(); await page.locator('#hint-button').click();
  await expect(page.locator('#hint-content')).toContainText('DNA');
  await page.locator('#right-cards button').filter({ hasText: '遗传信息' }).click();
  await expect(page.locator('#play-progress')).toHaveText('1 / 6');
  await expect(page.locator('#left-cards button').filter({ hasText: '细胞核' })).toBeDisabled();
  await expect(page.locator('#attempt-feedback')).toContainText('来源');
  for (const [left, right] of pairs.slice(1)) await match(page, left, right);
  await expect(page.locator('#page-report')).toBeVisible();
  await expect(page.locator('.metric').nth(0)).toContainText('83%');
  await expect(page.locator('.metric').nth(1)).toContainText('86%');
  await expect(page.locator('.metric').nth(2)).toContainText('100%');
  await expect(page.locator('#practice-button')).toContainText('1 个薄弱');
  await capture(page, 'desktop-report.png');
  await page.locator('#practice-button').click(); await expect(page.locator('#play-progress')).toHaveText('0 / 1');
  expect(errors).toEqual([]);
});

test('C7: eight bilingual long-text pairs fit a 390px mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createGame(page, { count: 8, level: 'advanced', goal: 'english' });
  await expect(page.locator('#left-cards button')).toHaveCount(8); await expect(page.locator('#right-cards button')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const dimensions = await page.locator('.match-card').evaluateAll(cards => cards.map(c => ({ client: c.clientHeight, scroll: c.scrollHeight, width: c.clientWidth, content: c.scrollWidth })));
  expect(dimensions.every(c => c.scroll <= c.client + 1 && c.content <= c.width + 1)).toBe(true);
  await capture(page, 'mobile-eight-pairs.png');
});

test('C7: keyboard Enter, Space and arrows select cards and feedback uses text', async ({ page }) => {
  await createGame(page);
  const left = page.locator('#left-cards button').filter({ hasText: '细胞核' });
  await left.focus(); await left.press('Enter'); await expect(left).toHaveAttribute('aria-pressed', 'true');
  await left.press('ArrowRight');
  await expect(page.locator('#right-cards button:focus')).toHaveCount(1);
  const right = page.locator('#right-cards button').filter({ hasText: '遗传信息' });
  await right.focus(); await right.press('Space'); await expect(page.locator('#play-progress')).toHaveText('1 / 6');
  await expect(page.locator('#attempt-feedback')).toContainText('✓ 配对正确');
  await expect(page.locator('#left-cards button:focus')).toHaveCount(1);
});

test('C7: refresh restores server statistics and both independent card orders', async ({ page }) => {
  await createGame(page); await match(page, ...pairs[0]);
  const ids = await page.locator('.match-card').evaluateAll(cards => cards.map(c => c.dataset.cardId));
  await page.reload(); await expect(page.locator('#play-progress')).toHaveText('1 / 6');
  expect(await page.locator('.match-card').evaluateAll(cards => cards.map(c => c.dataset.cardId))).toEqual(ids);
  await expect(page.locator('#left-cards button').filter({ hasText: '细胞核' })).toBeDisabled();
});

test('C3/C7: a lost response survives refresh and retries the same event without recounting', async ({ page }) => {
  await createGame(page);
  const events = []; let drop = true;
  await page.route('**/demo-api/sessions/*/attempts', async route => {
    events.push(route.request().postDataJSON());
    if (drop) { drop = false; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await match(page, '细胞核', '光合作用'); await expect(page.locator('#attempt-retry')).toBeVisible();
  await page.reload(); await expect(page.locator('#attempt-retry')).toBeVisible();
  await page.locator('#retry-attempt-button').click(); await expect(page.locator('#play-errors')).toHaveText('1');
  expect(events).toHaveLength(2); expect(events[0].event_id).toBe(events[1].event_id);
  await expect(page.locator('#attempt-retry')).toBeHidden();
});

test('C3/C7: rapid repeated clicks while grading send only one event', async ({ page }) => {
  await createGame(page); let count = 0;
  await page.route('**/demo-api/sessions/*/attempts', async route => { count++; await new Promise(resolve => setTimeout(resolve, 350)); await route.continue(); });
  await page.locator('#left-cards button').filter({ hasText: '细胞核' }).click();
  const right = page.locator('#right-cards button').filter({ hasText: '遗传信息' });
  await right.click(); await right.dispatchEvent('click'); await page.locator('#left-cards button').first().dispatchEvent('click');
  await expect(page.locator('#play-progress')).toHaveText('1 / 6'); expect(count).toBe(1);
});

test('C7: restart after completion creates a clean independent round', async ({ page }) => {
  await createGame(page); for (const pair of pairs) await match(page, ...pair);
  await expect(page.locator('#page-report')).toBeVisible();
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('learning2game-state-v1')).sessionId);
  await page.locator('#report-restart').click(); await expect(page.locator('#play-progress')).toHaveText('0 / 6');
  const next = await page.evaluate(() => JSON.parse(localStorage.getItem('learning2game-state-v1')).sessionId);
  expect(next).not.toBe(original); await expect(page.locator('#play-errors')).toHaveText('0');
});

test('C6: automatic completion calls finish to initiate the backend learning report', async ({ page }) => {
  await createGame(page); let finishes = 0;
  await page.route('**/demo-api/sessions/*/finish', async route => { finishes++; await route.continue(); });
  for (const pair of pairs) await match(page, ...pair);
  await expect(page.locator('#page-report')).toBeVisible(); expect(finishes).toBe(1);
});

test('C2/C7: empty, unsupported and oversized files have useful errors', async ({ page }) => {
  await page.goto('/');
  await page.locator('#material-file').setInputFiles({ name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) });
  await expect(page.locator('#global-error')).toContainText('为空');
  await page.locator('#material-file').setInputFiles({ name: 'program.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('test') });
  await expect(page.locator('#global-error')).toContainText('请选择');
  await page.locator('#material-file').setInputFiles({ name: 'large.txt', mimeType: 'text/plain', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) });
  await expect(page.locator('#global-error')).toContainText('20 MB');
  await capture(page, 'file-error.png');
});

test('C1: PDF page selection and an image selection enter the multipart request', async ({ page }) => {
  await page.goto('/'); let sentPages, imageFlag;
  await page.route('**/demo-api/materials', async route => { const data = route.request().postDataBuffer().toString(); sentPages = data; await route.continue(); });
  await page.locator('#material-file').setInputFiles(resolve('tests/fixtures/pages.pdf'));
  await expect(page.locator('#pdf-options')).toBeVisible(); await page.locator('#pdf-pages').fill('1,3-4');
  await page.locator('#analyze-button').click(); await expect(page.locator('#plan-panel')).toBeVisible();
  expect(sentPages).toContain('[1,3,4]');
  await page.locator('#remove-file').click();
  await page.locator('#material-file').setInputFiles(resolve('tests/fixtures/diagram.png'));
  await expect(page.locator('#image-options')).toBeVisible(); await page.locator('#include-image').uncheck();
  await page.route('**/demo-api/materials', async route => { imageFlag = route.request().postDataBuffer().toString(); await route.continue(); });
  await page.locator('#analyze-button').click(); await expect(page.locator('#plan-panel')).toBeVisible();
  expect(imageFlag).toMatch(/name="include_image"\r\n\r\nfalse/);
});

test('C2: failed extraction offers a fresh retry rather than polling the failed job forever', async ({ page }) => {
  await page.goto('/'); let fail = true, uploads = 0;
  await page.route('**/demo-api/materials', async route => { uploads++; await route.continue(); });
  await page.route('**/demo-api/jobs/*', async route => {
    if (fail) { fail = false; await route.fulfill({ json: { status: 'failed', error: { code: 'MODEL_TIMEOUT', message: '测试超时分支' } } }); }
    else await route.continue();
  });
  await page.locator('#sample-button').click(); await page.locator('#analyze-button').click();
  await expect(page.locator('#global-error')).toContainText('模型处理超时'); await expect(page.locator('#state-tag')).toHaveText('处理失败');
  await page.locator('#retry-global').click(); await expect(page.locator('#plan-panel')).toBeVisible(); expect(uploads).toBe(2);
});

test('C2: failed validation can generate a fresh job after a clear retry', async ({ page }) => {
  await page.goto('/'); await page.locator('#sample-button').click(); await page.locator('#analyze-button').click(); await expect(page.locator('#plan-panel')).toBeVisible();
  let fail = true, generations = 0;
  await page.route('**/demo-api/games', async route => { generations++; await route.continue(); });
  await page.route('**/demo-api/jobs/*', async route => {
    if (fail) { fail = false; await route.fulfill({ json: { status: 'failed', error: { code: 'VALIDATION_FAILED' } } }); } else await route.continue();
  });
  await page.locator('#confirm-plan').check(); await page.locator('#generate-button').click(); await expect(page.locator('#global-error')).toContainText('未通过验证');
  await page.locator('#retry-global').click(); await expect(page.locator('#ready-panel')).toBeVisible(); expect(generations).toBe(2);
});

test('C7: zero attempts and early exit preserve unattempted concepts', async ({ page }) => {
  await createGame(page); await page.locator('#finish-button').click(); await page.locator('#confirm-dialog-action').click();
  await expect(page.locator('#page-report')).toBeVisible(); await expect(page.locator('.metric').first()).toContainText('—');
  await expect(page.locator('#report-content')).toContainText('6 个知识点尚未尝试');
});

test('C1/C7: time limit ends the round with a timeout reason', async ({ page }) => {
  await page.goto('/');
  await page.route('**/demo-api/games/*/sessions', async route => {
    const response = await route.fetch(); const session = await response.json();
    session.deadline_at = new Date(Date.now() + 1200).toISOString();
    await route.fulfill({ json: session });
  });
  await createGame(page, { navigate: false });
  await expect(page.locator('#page-report')).toBeVisible(); await expect(page.locator('#report-subtitle')).toContainText('时间到');
});

test('C2: boot configuration failure has a working reload button', async ({ page }) => {
  let fail = true;
  await page.route('**/config.json', async route => {
    if (fail) { fail = false; await route.fulfill({ status: 503, json: {} }); }
    else await route.continue();
  });
  await page.goto('/'); await expect(page.locator('#global-error')).toContainText('启动配置');
  await page.locator('#retry-global').click(); await expect(page.locator('#mode-button')).toHaveText('教学演示');
  await expect(page.locator('#global-error')).toBeHidden();
});

test('C1/C6: changed preferences are confirmed before generation', async ({ page }) => {
  await page.goto('/'); await page.locator('#sample-button').click(); await page.locator('#analyze-button').click(); await expect(page.locator('#plan-panel')).toBeVisible();
  await page.locator('#confirm-plan').check(); await page.locator('input[name="pair_count"][value="8"]').check();
  await expect(page.locator('#generate-button')).toBeDisabled(); await expect(page.locator('#plan-change-note')).toBeVisible();
  await page.locator('#confirm-plan').check(); await page.locator('#generate-button').click(); await expect(page.locator('#ready-description')).toContainText('8 对');
  await capture(page, 'desktop-create.png');
});

test('C1: changing PDF pages invalidates the old preview and uploads the current file again', async ({ page }) => {
  await page.goto('/'); const bodies = [];
  await page.route('**/demo-api/materials', async route => { bodies.push(route.request().postDataBuffer().toString()); await route.continue(); });
  await page.locator('#material-file').setInputFiles(resolve('tests/fixtures/pages.pdf'));
  await page.locator('#pdf-pages').fill('1'); await page.locator('#analyze-button').click(); await expect(page.locator('#plan-panel')).toBeVisible();
  await page.locator('#pdf-pages').fill('2'); await page.locator('#pdf-pages').press('Tab');
  await expect(page.locator('#knowledge-panel')).toBeHidden();
  await page.locator('#analyze-button').click(); await expect(page.locator('#plan-panel')).toBeVisible();
  expect(bodies).toHaveLength(2); expect(bodies[1]).toContain('[2]');
});

test('C1/C3: a regenerated group does not display the old game before a new session starts', async ({ page }) => {
  await createGame(page); await page.getByRole('link', { name: '1创建练习', exact: false }).count();
  await page.locator('[data-route="create"]').click();
  await page.locator('input[name="pair_count"][value="8"]').check(); await page.locator('#confirm-plan').check();
  await page.locator('#generate-button').click(); await expect(page.locator('#ready-description')).toContainText('8 对');
  await page.locator('[data-route="play"]').click(); await expect(page.locator('#empty-page')).toBeVisible();
});

test('C6: real HTTP mode completes the contract flow through an independent backend fixture', async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'l2g-real-contract-'));
  const backend = await createAppServer({ dataDir: join(directory, 'backend'), jobDelay: 0 });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  const frontend = await createAppServer({ dataDir: join(directory, 'frontend'), demoEnabled: false, backendUrl: `http://127.0.0.1:${backend.address().port}/demo-api` });
  await new Promise(resolve => frontend.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(`http://127.0.0.1:${frontend.address().port}`);
    await expect(page.locator('#mode-notice')).toContainText('真实后端');
    await createGame(page, { navigate: false }); for (const pair of pairs) await match(page, ...pair);
    await expect(page.locator('#page-report')).toBeVisible(); await expect(page.locator('.metric').first()).toContainText('100%');
  } finally { await closeServer(frontend); await closeServer(backend); await rm(directory, { recursive: true, force: true }); }
});

test('C6: a disconnected real backend displays an error without substituting demo data', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('learning2game-mode', JSON.stringify('real')));
  await page.goto('/');
  await page.route('**/api/materials', route => route.fulfill({ status: 502, json: { error: { code: 'NETWORK_ERROR' } } }));
  await page.locator('#sample-button').click(); await page.locator('#analyze-button').click();
  await expect(page.locator('#global-error')).toContainText('无法连接服务'); await expect(page.locator('#mode-notice')).toContainText('真实后端');
  await expect(page.locator('#knowledge-panel')).toBeHidden();
});

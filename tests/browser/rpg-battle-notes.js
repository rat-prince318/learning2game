import { expect } from '@playwright/test';

export async function verifyBattleNotes(page, startDemo, playTurn) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({width: 390, height: 844});
  let view = await startDemo();
  const question = view.battle.prompt;
  const resolveButton = page.getByTestId('battle-receipt');
  const journal = page.getByTestId('battle-field-notes');
  await expect(resolveButton).toHaveCount(0);
  let chosen;
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/actions') && request.postDataJSON()?.action === 'answer')
      chosen = request.postDataJSON().option_id;
  });
  view = await playTurn(page, view, {correct: false});
  const miss = view.battle.last_event;
  expect(miss.correct).toBe(false);
  expect(miss.damage_received).toBeGreaterThan(0);
  expect(miss.explanation).toBeTruthy();
  expect(miss.source_ref).toBeTruthy();
  await resolveButton.focus();
  await page.keyboard.press('Enter');
  await expect(journal).toBeVisible();
  await expect(journal.getByRole('button', {name:'关闭解析'})).toBeFocused();
  await expect(journal.getByRole('heading', {name:'解题思路'})).toBeVisible();
  await expect(journal).toContainText(miss.explanation);
  await expect(journal.locator('.bf-note-source')).toContainText(miss.source_ref);
  await expect(journal.locator('dl div').filter({hasText:'承受伤害'}).locator('dd')).toHaveText(String(miss.damage_received));
  const bounds = await journal.boundingBox();
  const ribbon = await page.locator('.bf-quiz').evaluate(node => node.getBoundingClientRect().toJSON());
  expect(bounds.x).toBe(0);
  expect(bounds.width).toBe(390);
  expect(Math.abs(bounds.y - ribbon.top)).toBeLessThan(1);
  expect(Math.abs(bounds.y + bounds.height - 844)).toBeLessThan(1);
  await journal.locator('summary').click();
  await expect(journal.locator('.bf-note-attempt')).toContainText(question.text);
  await expect(journal.locator('.bf-note-attempt')).toContainText(question.options.find(o=>o.id === chosen).text);
  await page.keyboard.press('1');
  await expect(page.locator('[data-act="option"][aria-pressed="true"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(journal).toBeHidden();
  await expect(resolveButton).toBeFocused();

  await page.reload();
  await resolveButton.click();
  await expect(journal).toContainText(miss.explanation);
  await expect(journal.locator('.bf-note-source')).toContainText(miss.source_ref);
  await journal.getByRole('button', {name:'关闭解析'}).click();
  await expect(resolveButton).toBeFocused();
  const hintReply = page.waitForResponse(response => response.request().method() === 'POST' &&
    response.url().endsWith('/actions') && response.request().postDataJSON()?.action === 'hint');
  await page.getByTestId('battle-hint').click();
  view = await (await hintReply).json();
  await expect(page.locator('[data-battle-revision]')).toHaveAttribute('data-battle-revision', String(view.revision));
  await resolveButton.click();
  await expect(journal).toContainText(miss.explanation);
  await page.keyboard.press('Escape');
  await page.reload();
  await resolveButton.click();
  await expect(journal.locator('.bf-note-source')).toContainText(miss.source_ref);
  await page.keyboard.press('Escape');

  await page.setViewportSize({width: 1360, height: 900});
  const mastered = new Set();
  let retried = false;
  for (let turn = 0; view.phase === 'combat' && turn < 24; turn++) {
    const current = view.battle.prompt;
    expect(mastered.has(current.text)).toBe(false);
    if (current.text === question.text) {
      expect(turn).toBeGreaterThan(0);
      expect(current.purpose).toBe('retry');
      await expect(page.locator('.bf-speaker')).toContainText('错题重试');
      await page.reload();
      await expect(page.locator('.bf-speaker')).toContainText('错题重试');
      retried = true;
    }
    mastered.add(current.text);
    view = await playTurn(page, view);
  }
  expect(retried).toBe(true);
  expect(view.phase).toBe('victory');
  const final = view.battle.last_event;
  expect(final.damage_dealt).toBeGreaterThan(0);
  expect(final.xp_gained).toBeGreaterThan(0);
  await expect(resolveButton).toHaveText('最后一击解析');
  await resolveButton.click();
  await expect(journal.getByRole('heading', {name:'最后一击'})).toBeVisible();
  const resumed = await journal.boundingBox();
  const settlement = await page.locator('.bf-result').evaluate(node => node.getBoundingClientRect().toJSON());
  expect(Math.abs(resumed.y - settlement.top)).toBeLessThan(1);
  expect(Math.abs(resumed.width - settlement.width)).toBeLessThan(1);
  await expect(journal.getByRole('heading', {name:'解题解析'})).toBeVisible();
  await expect(journal.locator('dl div').filter({hasText:'造成伤害'}).locator('dd')).toHaveText(String(final.damage_dealt));
  await expect(journal.locator('dl div').filter({hasText:'获得经验'}).locator('dd')).toHaveText(String(final.xp_gained));
  await expect(journal).toContainText(final.explanation);
  await expect(journal.locator('.bf-note-source')).toContainText(final.source_ref);
  await page.keyboard.press('Escape');
  await expect(resolveButton).toBeFocused();
  await expect(page.getByTestId('battle-exit')).toBeVisible();
  await page.reload();
  await resolveButton.click();
  await expect(journal).toContainText(final.explanation);
  await expect(journal.locator('.bf-note-source')).toContainText(final.source_ref);
}

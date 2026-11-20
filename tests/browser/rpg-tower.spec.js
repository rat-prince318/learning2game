import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const strip = text => text.replace(/[\s。.!！]/gu, '');
const notes = readFileSync(new URL('../../public/examples/cell-notes-en.txt', import.meta.url), 'utf8')
  .trim().split(/\r?\n/).map(row => row.split(':').map(strip));

test('a recruited pilot joins the spire, a turn survives remount, and a clear opens the next floor', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/rpg/battle/');
  const id = await page.evaluate(async () => {
    const {startDemo} = await import('/rpg/battle/demo.js');
    const {setLocale} = await import('/js/locale.js');
    const {mountParty} = await import('/rpg/tower/party.js');
    const {mountTower} = await import('/rpg/tower/tower.js');
    setLocale('en');
    const run = await startDemo();
    document.querySelector('#battle').hidden = true;
    const host = document.createElement('main');
    document.body.append(host);
    let panel;
    window.visitTestPanel = kind => {
      panel?.destroy();
      panel = (kind === 'party' ? mountParty : mountTower)(host, {sessionId:run.session_id});
      return panel.ready;
    };
    await window.visitTestPanel('party');
    return run.session_id;
  });
  await page.getByRole('button',{name:'Talk and recruit'}).click();
  await expect(page.getByRole('button',{name:'Traveling together'})).toBeDisabled();
  await page.evaluate(() => window.visitTestPanel('tower'));
  await page.getByRole('button',{name:'Ascend to floor 1'}).click();
  await expect(page.locator('.ex-towerbar')).toContainText('Floor 1');
  const arena = page.locator('.rpg-expansion [data-testid="battle-arena"]');
  await expect.poll(() => arena.boundingBox()).toEqual({x:0, y:0, width:390, height:844});
  await expect(page.getByRole('button',{name:'Spire gate'})).toBeInViewport({ratio:1});
  const path = '/rpg/expeditions/'+id;
  const fetchRun = async () => (await page.request.get(path)).json();
  for (let turn=0;turn<20;turn++) {
    const {tower} = await fetchRun();
    if (tower.phase==='cleared') break;
    const {prompt} = tower.battle;
    const clue = strip(prompt.text);
    const term = notes.find(([label,meaning]) => clue.includes('“'+label+'”') || clue.includes(meaning));
    expect(term).toBeTruthy();
    const choice = prompt.options.find(o=>term.includes(strip(o.text)));
    await page.locator(`.rpg-expansion [data-option-id="${choice.id}"]`).click();
    const receipt = page.waitForResponse(r => r.url().endsWith(path+'/actions') && r.request().postDataJSON().action==='tower_answer');
    await page.locator('.rpg-expansion [data-act="submit"]').click();
    expect((await receipt).ok()).toBeTruthy();
    if (turn===0) {
      await page.getByRole('button',{name:'Spire gate'}).click();
      await page.evaluate(() => window.visitTestPanel('tower'));
      await page.getByRole('button',{name:'Resume floor 1'}).click();
      expect((await fetchRun()).tower.battle.prompt.prompt_id).not.toEqual(prompt.prompt_id);
    }
  }
  const view=await fetchRun();
  expect(view.tower.best_floor).toBe(1);
  expect(view.phase).toBe('combat');
  expect(view.companions.find(slot=>slot.id==='reed').bond).toBe(1);
  await page.locator('.rpg-expansion [data-act="exit"]').click();
  await page.getByRole('button',{name:'Ascend to floor 2'}).click();
  await expect(page.locator('.ex-towerbar')).toContainText('Index recall');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

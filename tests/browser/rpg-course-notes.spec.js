import { expect, test } from '@playwright/test';
import { prepareExpedition } from './mechanics-fixture.js';

test('choose chapter pages for a single PDF and identify the offline question bank', async ({page}) => {
  await page.route('**/health', route => route.fulfill({json:{rpg_course_authoring:false}}));
  await page.goto('/rpg/?prepare=1');
  await expect(page.locator('#lr-authoring-mode')).toContainText('离线题库');
  const files = page.locator('#lr-files'), pages = page.locator('#lr-pages');
  await expect(pages).toBeHidden();
  const pdf = {name:'textbook.pdf', mimeType:'application/pdf', buffer:Buffer.from('%PDF')};
  await files.setInputFiles([pdf, {...pdf, name:'second.pdf'}]);
  await expect(pages).toBeHidden();
  await files.setInputFiles(pdf);
  await expect(pages).toBeVisible();
  await pages.fill('120-200');
  await page.locator('#lr-depart [type=submit]').click();
  await expect(page.locator('#notice')).toContainText('80 页');
  await expect(pages).toBeFocused();
  await pages.fill('122-124，128');
  await page.getByRole('button', {name:'切换到英文出题'}).click();
  await expect(pages).toHaveValue('122-124，128');
  await expect(page.locator('#lr-authoring-mode')).toContainText('offline question bank');
  await page.route('**/materials', route => route.fulfill({status:422,json:{detail:'Fixture upload complete'}}));
  const upload = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/materials');
  await page.locator('#lr-depart [type=submit]').click();
  expect((await upload).postData()).toContain('122,123,124,128');
});

test('learn from the keeper and a landmark, then consult the same notes without spending a turn', async ({page}) => {
  test.setTimeout(120000);
  await page.emulateMedia({reducedMotion:'reduce'});
  const initial = await prepareExpedition(page);
  const base = '/rpg/expeditions/' + initial.session_id;
  const cards = [
    {id:'energy', title:'怎样算动能', body:'先把质量换成千克，把速度换成米每秒，再算 $E_k=\\frac{1}{2}mv^2$。', source_ref:'Mech-training.txt / 第 2 行', region_index:0},
    {id:'force', title:'合力改变速度', body:'把同一方向上的力相加，再用 $F=ma$ 求加速度。', source_ref:'Mech-training.txt / 第 3 行', region_index:0},
  ];
  // Stub only the model-authored content projection. Expeditions, commands,
  // story choices and battles use the normal offline HTTP server.
  let combat = false, failRead = false;
  const collected = new Set();
  const actions = [];
  await page.route('**' + base + '**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === base + '/course-notes') {
      if (failRead) {
        failRead = false;
        return route.fulfill({status:503, json:{detail:'Retry'}});
      }
      const spot = url.searchParams.get('spot');
      const id = spot === 'keeper' ? 'energy' : 'force';
      return route.fulfill({json:{
        notes:cards.filter(n => collected.has(n.id)),
        spot_note_ids:spot && collected.has(id) ? [id] : [], spot_total:spot ? 1 : 0,
        relevant_note_ids:combat ? ['energy'] : [],
      }});
    }
    if (url.pathname !== base && url.pathname !== base + '/actions') return route.continue();
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({response});
    const state = await response.json();
    combat = state.phase === 'combat';
    if (url.pathname.endsWith('/actions')) {
      const command = route.request().postDataJSON();
      actions.push(command.action);
      if (command.action === 'collect_notes') collected.add(command.spot === 'keeper' ? 'energy' : 'force');
    }
    return route.fulfill({response, json:{...state, course_notes_enabled:true}});
  });
  const walk = async key => {
    await page.locator('.lr-travel-list summary').click();
    await page.locator('.lr-travel-list [data-key="' + key + '"]').click();
  };
  await page.goto('/rpg/?session=' + initial.session_id);
  await walk('ship');
  const conversation = page.locator('#story-dialog');
  await expect(conversation.locator('.sc-dialogue')).toContainText('先把质量换成千克', {timeout:20000});
  await expect(conversation.locator('.katex')).toBeVisible();
  await conversation.getByRole('button', {name:'翻开课程笔记'}).click();
  const book = page.getByRole('dialog', {name:'课程笔记', exact:true});
  await expect(book.locator('option')).toHaveCount(1);
  await expect(book).toContainText('Mech-training.txt');
  await page.keyboard.press('Escape');
  await expect(conversation.getByRole('button', {name:'翻开课程笔记'})).toBeFocused();
  await conversation.getByRole('button', {name:'跳过对话'}).click();
  await conversation.getByRole('button', {name:/砸开船牢/}).click();
  await conversation.getByRole('button', {name:'回到战场'}).click();
  await walk('site');
  const station = page.getByRole('region', {name:'现场交互'});
  await expect(station).toContainText('合力改变速度', {timeout:20000});
  await expect(station.locator('.katex')).toBeVisible();
  await station.getByRole('button', {name:'继续赶路'}).click();
  await walk('boss_steady');
  await page.locator('[data-do="engage"]').click();
  await page.setViewportSize({width:390,height:844});
  const selected = page.getByTestId('battle-option').first();
  await selected.click();
  const open = page.getByTestId('battle-coursebook');
  await expect(open).toBeInViewport({ratio:1});
  const before = await (await page.request.get(base)).json();
  const writes = actions.length;
  failRead = true;
  await open.click();
  await book.getByRole('button', {name:'重新读取'}).click();
  await expect(book).toContainText('本题相关');
  await expect(book.locator('option')).toHaveCount(2);
  await expect(book.locator('.katex')).toBeVisible();
  await book.locator('select').selectOption('force');
  await expect(book).toContainText('再用');
  await expect(book.getByRole('button', {name:'合上笔记'})).toBeInViewport({ratio:1});
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
  await expect(selected).toHaveAttribute('aria-pressed','true');
  expect(actions).toHaveLength(writes);
  const after = await (await page.request.get(base)).json();
  expect([after.revision, after.player, after.battle.prompt]).toEqual([before.revision, before.player, before.battle.prompt]);
  await page.reload();
  await page.getByTestId('battle-coursebook').click();
  await expect(book.locator('option')).toHaveCount(2);
});

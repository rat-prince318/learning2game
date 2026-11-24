import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync(new URL('../../docs/rpg-fixtures/battle-ui/willow-boss.public.json', import.meta.url), 'utf8'));

test('two-part inscriptions retain operands and language, bind the selected skill and cast on the field', async ({page}) => {
  await page.route('**/__rpg_inscription', route=>route.fulfill({contentType:'text/html',
    body:'<meta charset="utf-8"><link rel="stylesheet" href="/rpg/battle/battle.css"><main id="host"></main>'}));
  await page.goto('/__rpg_inscription');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(async view=>{
    const {mountBattle} = await import('/rpg/battle/battle.js');
    view.mode='tower';
    view.floor=7;
    view.map[0].region_id='mirror_pass';
    view.battle.tactics.encounter_id='mirror_lynx';
    view.battle.prompt = {prompt_id:'matrix',text:'Set the marks in order for $x^2$ and $y^2$.',options:[
      {id:'xy',text:'x → y'},{id:'yx',text:'y → x'},{id:'xz',text:'x → z'},
    ]};
    window.sent = [];
    const controller = {load:async()=>view,send:async fields=>{
      window.sent.push(fields);
      const next=structuredClone(view);
      next.revision++;
      next.battle.last_event={kind:'hit',correct:true,skill:fields.skill,message:'稳住架势，完成防守反击。',damage_dealt:2,
        partner_assist:{companion_id:'reed',level:1,effect:'guard',amount:2}};
      next.battle.prompt = {prompt_id:'next',text:'① First clue\n\n② Second clue\n\n③ Third clue',options:[
        {id:'tuple1',text:'① x\n② y\n③ z'},{id:'tuple2',text:'① w\n② y\n③ z'},
      ]};
      return next;
    }};
    const mounted = mountBattle(document.querySelector('#host'),{sessionId:view.session_id,controller});
    await mounted.ready;
  },fixture);
  await expect(page.locator('.bf-line .katex')).toHaveCount(2);
  await expect(page.locator('.rpg-stage-world')).toHaveAttribute('data-region','mirror_pass');
  await expect(page.locator('.rpg-ferry-plate-visible')).toBeHidden();
  await page.getByRole('button',{name:'Switch to English'}).click();
  await expect(page.locator('.bf-chapter')).toHaveText('Floor 7');
  await expect(page.locator('.bf-identity')).toContainText(['Oathguard','Mirror Lynx']);
  await expect(page.getByTestId('battle-target')).toBeHidden();
  await page.getByTestId('battle-skill-guard').focus();
  await page.keyboard.press('w');
  await page.locator('[data-fragment="x"]').click();
  await expect(page.getByTestId('battle-submit')).toBeDisabled();
  await page.locator('[data-fragment="z"]').click();
  await page.getByRole('button',{name:'Undo'}).click();
  await page.locator('[data-fragment="y"]').click();
  await expect(page.getByTestId('battle-target')).toHaveAttribute('data-skill','guard');
  await expect(page.locator('.bf-chain-slots')).toContainText('x');
  await page.getByTestId('battle-target').click();
  await expect(page.locator('[data-battle-revision]')).toHaveAttribute('data-battle-revision',String(fixture.revision+1));
  expect(await page.evaluate(()=>window.sent)).toEqual([{action:'answer',prompt_id:'matrix',option_id:'xy',skill:'guard'}]);
  await expect(page.locator('.bf-aid')).toContainText('Reed');
  await expect(page.locator('.bf-status')).toContainText('Your guard holds');
  await expect(page.getByTestId('battle-submit')).toBeDisabled();
  await page.getByRole('button',{name:'Clue 2'}).click();
  await expect(page.locator('.bf-line')).toContainText('Second clue');
  await expect(page.locator('.bf-line')).not.toContainText('Third clue');
  await page.locator('[data-option-id="tuple2"]').click();
  await page.getByRole('button',{name:'All clues'}).click();
  await expect(page.locator('.bf-line')).toContainText('Third clue');
  await expect(page.locator('[data-option-id="tuple2"]')).toHaveAttribute('aria-pressed','true');
});

test('dispatch bench makes FIFO and LIFO observable, binds the tested order and preserves the normal receipt', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.route('**/__cargo_dock', route=>route.fulfill({contentType:'text/html',
    body:'<meta charset="utf-8"><link rel="stylesheet" href="/rpg/battle/battle.css"><main></main>'}));
  await page.goto('/__cargo_dock');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(async view=>{
    const {mountBattle}=await import('/rpg/battle/battle.js');
    const {cargoFor}=await import('/rpg/battle/cargo.js');
    const {setLocale}=await import('/js/locale.js');
    setLocale('en');
    if (cargoFor(view.battle.prompt)!==null) throw Error('Cargo dock shown on a biology prompt');
    view.battle.tactics.companion_id='reed';
    view.battle.tactics.companion_level=2;
    view.battle.prompt={prompt_id:'dispatch',text:'Load A, B, C into a stack. In which order do they leave?',options:[
      {id:'fifo',text:'A, B, C'},{id:'lifo',text:'C, B, A'},{id:'other',text:'B, C, A'}]};
    window.casts=[];
    await mountBattle(document.querySelector('main'),{controller:{load:async()=>view,send:async action=>{
      window.casts.push(action);
      const next=structuredClone(view); next.revision++;
      next.battle.prompt={prompt_id:'new',text:'About plants',options:[{id:'leaf',text:'Leaf'}]};
      return next;
    }}}).ready;
  },fixture);
  await expect(page.locator('.rpg-stage-ally')).toBeVisible();
  await expect(page.locator('.rpg-ally-name')).toHaveText('Reed  Lv. 2',{useInnerText:false});
  await page.locator('.bf-cargo summary').click();
  const loadAll=async()=>{for(const token of ['A','B','C']) await page.getByRole('button',{name:'Load '+token,exact:true}).click();};
  await loadAll();
  await page.getByRole('button',{name:'Dequeue one'}).click();
  await expect(page.locator('.bf-cargo-log')).toContainText('Dispatched A');
  await page.getByRole('button',{name:'Single gate / stack'}).click();
  await expect(page.locator('.bf-cargo-log')).toContainText('—');
  await loadAll();
  for(let i=0;i<3;i++) await page.getByRole('button',{name:'Pop one'}).click();
  await expect(page.locator('.bf-cargo-log')).toContainText('C → B → A');
  await expect(page.getByTestId('battle-submit')).toBeDisabled();
  await page.getByRole('button',{name:'Bind this dispatch order'}).click();
  await expect(page.locator('[data-option-id="lifo"]')).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('battle-target').click();
  await expect(page.locator('.bf-line')).toHaveText('About plants');
  await expect(page.locator('.bf-cargo')).toHaveCount(0);
  expect(await page.evaluate(()=>window.casts)).toEqual([{action:'answer',prompt_id:'dispatch',option_id:'lifo',skill:'strike'}]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});

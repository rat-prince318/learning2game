import { msg } from '../../js/locale.js';
import { mountBattle } from '../battle/battle.js';
import { backLabel, mountPanel } from './panel.js';

const modes = {
  recognition:['符印辨认','Sigil recognition'],
  recall:['索引回忆','Index recall'],
  paired:['双证校准','Paired evidence'],
  synthesis:['三证合印','Triple synthesis'],
};
const towerTitle = () => msg('回声无尽塔','The Echo Tower');

function project(view) {
  const {tower} = view, battle = tower.battle;
  const phase = tower.phase === 'cleared' ? 'victory' : tower.phase;
  const chapter = {scene_id:battle.stage.scene_id, name:battle.stage.name, objective:battle.stage.objective,
    status:phase === 'victory' ? 'cleared' : 'active', boss:true};
  return {...view, mode:'tower', floor:tower.floor, phase, battle, player:battle.player,
    game_id:battle.game_id, narrative:phase === 'victory' ? msg('守卫让开了道路，通往上层的星梯亮起。','The guardian yields. The stair to the next floor lights up.') : battle.stage.objective, region_index:0, scene_index:0, chapter_count:1,
    cleared_chapters:Number(phase === 'victory'), map:[{region_id:tower.region_id, name:towerTitle(),
      course_title:battle.title, chapters:[chapter]}], rewards:[], routes:[]};
}

export function mountTower(container, options) {
  let battle = null, exploring = false;
  const panel = mountPanel(container, options, (ctx, view) => {
    const tower = view?.tower;
    if (exploring && tower?.battle) {
      // Keep the combat renderer alive during language changes and turn receipts.
      if (!battle) {
        const bar = document.createElement('div'), arena = document.createElement('div');
        bar.className = 'ex-towerbar';
        ctx.content.replaceChildren(bar, arena);
        const relay = {
          get resynced() { return ctx.controller.resynced; },
          get hasPending() { return ctx.controller.hasPending; },
          load:async () => project(await ctx.controller.load()),
          retry:async () => project(await ctx.controller.retry()),
          send:async fields => project(await ctx.controller.send({...fields, action:'tower_'+fields.action})),
        };
        battle = mountBattle(arena, {sessionId:view.session_id, controller:relay, immersive:true, onExit:showLanding,
          onViewChange:() => { ctx.accept(ctx.controller.view); updateBar(bar, ctx.controller.view.tower); }});
      }
      updateBar(ctx.content.firstElementChild, tower);
      return;
    }
    const floor = tower?.best_floor + 1 || 1;
    const active = ['combat','sidequest'].includes(tower?.phase);
    ctx.content.innerHTML = `<section class="ex-spire" aria-label="${towerTitle()}">
      <div class="ex-stars" aria-hidden="true"></div>
      <div class="ex-spire-body"><p class="ex-eyebrow">${msg('支线 / 星台','Side journey / Observatory')}</p>
      <h2>${towerTitle()}</h2>
      <p>${msg('每一层由随身讲义重排。认出一道符印，再联结两条线索，最终把三份证据归入同一组星轨。',
      'Each floor recombines your course notes. Recognize a sigil, connect two clues, then align three pieces of evidence.')}</p>
      <div class="ex-spire-actions"><button data-tower="enter" ${!view ? 'disabled':''}>${active ?
      msg(`继续第 ${tower.floor} 层`,`Resume floor ${tower.floor}`) :
      msg(`登上第 ${floor} 层`,`Ascend to floor ${floor}`)}</button>
      <button data-tower="exit">${backLabel()}</button></div></div></section>
      <dl class="ex-spire-stats"><div><dt>${msg('最高通关','Best clear')}</dt><dd>${tower?.best_floor || '—'}</dd></div>
      <div><dt>${msg('下层守卫生命','Guardian health')}</dt><dd>${active ? tower.battle.enemy.max_hp : (tower?.next_guardian_hp ?? '—')}</dd></div>
      <div><dt>${msg('登塔补给','On ascent')}</dt><dd>${msg('生命全满','Full health')}</dd></div></dl>`;
  });
  function showLanding() {
    exploring = false;
    battle?.destroy();
    battle = null;
    panel.context.redraw();
  }
  function updateBar(bar, tower) {
    const mode = modes[tower.question_mode] || modes.recognition;
    bar.innerHTML = `<span><strong>${msg(`塔层 ${tower.floor}`,`Floor ${tower.floor}`)}</strong>
      ${msg(...mode)} <small>${msg('封印连击','Seal streak')} ${Math.min(tower.chain_target,tower.battle.player.combo)} / ${tower.chain_target}</small></span><button data-tower="landing">${msg('塔门','Spire gate')}</button>`;
  }
  panel.context.root.addEventListener('click', async event => {
    const act = event.target.closest('button[data-tower]')?.dataset.tower;
    if (act === 'exit') panel.context.onExit();
    if (act === 'landing') showLanding();
    if (act === 'enter') {
      let view = panel.context.controller.view;
      if (!view) return;
      if (!['combat','sidequest'].includes(view.tower.phase)) {
        view = await panel.context.command({action:'tower_enter'});
      }
      if (!view || !['combat','sidequest'].includes(view.tower.phase)) return;
      exploring = true;
      panel.context.redraw();
    }
  }, {signal:panel.context.signal});
  return {ready:panel.ready, destroy() { battle?.destroy(); panel.destroy(); }};
}

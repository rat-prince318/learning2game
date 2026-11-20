import { msg } from '../../js/locale.js';
import { backLabel, mountPanel } from './panel.js';

const crew = {
  reed: {
    name:['苇舟','Reed'], trade:['渡口船工','Ferry pilot'], sprite:0,
    line:['“水势变了，跟着我的桨走。”','“Watch my oar. The current is turning.”'],
    skill:['护渡','Crossguard'],
    effect:n => msg(`正确应对时，替你挡下最多 ${1+n} 点反击伤害。`,
      `On a correct response, blocks up to ${1+n} counterattack damage.`),
  },
  flint: {
    name:['铆青','Flint'], trade:['铜窑锻师','Copper smith'], sprite:1,
    line:['“听这声响，铆钉该松了。”','“Hear the ring? That rivet is coming loose.”'],
    skill:['追锤','Hammer follow-up'],
    effect:n => msg(`普通攻击命中时，追击最多追加 ${1+n} 点伤害。`,
      `After a successful strike, deals up to ${1+n} extra damage.`),
  },
  lumen: {
    name:['星萤','Lumen'], trade:['守灯人','Lampkeeper'], sprite:2,
    line:['“第三盏灯亮起时，就轮到你了。”','“When the third lamp glows, take your shot.”'],
    skill:['灯芯共鸣','Wick resonance'],
    effect:n => msg(`每连续答对三次，普攻或格挡可额外获得 ${n >= 3 ? 2 : 1} 格蓄力。`,
      `Every third consecutive correct strike or guard grants up to ${n >= 3 ? 2 : 1} extra focus.`),
  },
};

export function mountParty(container, options) {
  const panel = mountPanel(container, options, ({content}, view) => {
    content.innerHTML = `<header class="ex-heading"><div><p>${msg('远征营地','Expedition camp')}</p>
      <h2>${msg('同行者','The fellowship')}</h2></div><button class="ex-back" data-exit>${backLabel()}</button></header>
      <p class="ex-note">${msg('每场战斗可带一名伙伴。共同获胜会提升默契，换人从下次遭遇生效。',
      'One companion fights at your side. Victories build your bond. Changes take effect at the next encounter.')}</p>
      <div class="ex-crew">${(view?.companions || []).map(card).join('')}</div>`;
  });
  panel.context.root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-exit')) panel.context.onExit();
    if (button.dataset.crew) panel.context.command({action:button.dataset.action, companion_id:button.dataset.crew});
  }, {signal:panel.context.signal});
  return panel;
}

function card(slot) {
  const npc = crew[slot.id];
  if (!npc) return '';
  const label = slot.active ? msg('已同行','Traveling together') : slot.joined ? msg('邀请同行','Assign companion') :
    slot.available ? msg('交谈并结交','Talk and recruit') : msg(`赢得 ${slot.wins_required} 场后相遇`,`Meet after ${slot.wins_required} victories`);
  const bond = slot.next_level_bond ? `${slot.bond} / ${slot.next_level_bond}` : msg('满级','Max rank');
  return `<article class="ex-card ${slot.active ? 'ex-active' : ''}">
    <div class="ex-portrait" style="--frame:${npc.sprite}">
      <i aria-hidden="true"></i></div>
    <div class="ex-card-body"><small>${msg(...npc.trade)}</small><h3>${msg(...npc.name)}</h3>
    <p class="ex-quote">${msg(...npc.line)}</p><strong>${msg(...npc.skill)}</strong>
    <p>${npc.effect(Math.max(1,slot.level))}</p>
    ${slot.joined ? `<div class="ex-bond"><span>${msg('默契','Bond')} ${slot.level}</span><span>${bond}</span></div>` : ''}
    <button data-crew="${slot.id}" data-action="${slot.joined?'assign_companion':'recruit_companion'}"
      ${slot.active || !slot.available ? 'disabled' : ''}>${label}</button></div></article>`;
}

import { msg } from '../../js/locale.js';
import { studyMarkup } from '../../js/study.js';
import { h, sourceCitation } from '../../js/utils.js';
import { eventText, lessonText } from './words.js';

export function partnerNote(event) {
  const aid = event?.partner_assist;
  if (!aid) return '';
  const who = {reed:msg('苇舟','Reed'),flint:msg('铆青','Flint'),lumen:msg('星萤','Lumen')}[aid.companion_id];
  if (!who) return '';
  const effect = {guard:msg('抵挡伤害','damage blocked'),strike:msg('协击伤害','assist damage'),focus:msg('额外蓄力','extra focus')}[aid.effect];
  return `<div class="bf-aid"><i class="bf-icon bf-i-sparkles" aria-hidden="true"></i> <strong>${who}</strong> Lv. ${aid.level} <span>${effect} +${aid.amount}</span></div>`;
}

function outcome(event) {
  if (['victory', 'stage_clear'].includes(event.kind)) return msg('最后一击', 'Finishing blow');
  if (event.kind === 'defeat') return msg('退守营火', 'Fallback to camp');
  if (event.kind === 'recovered') return msg('重整旗鼓', 'Ready to return');
  if (event.kind === 'review_correct') return msg('修习完成', 'Lesson mastered');
  if (event.kind === 'review_wrong') return msg('营地复盘', 'Camp review');
  if (!event.correct) return msg('敌方反击', 'Counterhit');
  if (event.tactics?.broke_shield) return msg('破势命中', 'Guard broken');
  if (event.critical) return msg('暴击命中', 'Critical hit');
  return msg('命中', 'Hit');
}

export function receiptButton(receipt, final = false) {
  if (!receipt) return '';
  const label = final ? msg('最后一击解析', 'Review finishing blow') : msg('回合解析', 'Review last turn');
  return `<button type="button" class="bf-receipt-trigger" data-act="receipt" data-testid="battle-receipt" aria-haspopup="dialog">${label}</button>`;
}

export function receiptBody(receipt, view) {
  const { event, prompt, selected } = receipt;
  const stats = [
    [event.damage_dealt, msg('造成伤害', 'Damage dealt')],
    [event.damage_received, msg('承受伤害', 'Damage taken')],
    [event.damage_blocked, msg('抵挡伤害', 'Damage blocked')],
    [event.xp_gained, msg('获得经验', 'XP earned')],
  ].filter(([value]) => value > 0);
  const explanationTitle = event.correct ? msg('解题解析', 'Solution') : msg('解题思路', 'Reasoning cue');
  const study = text => studyMarkup(lessonText(text));
  return `<article class="bf-note-sheet" data-tone="${event.correct ? 'gold' : 'ember'}">
    <button type="button" autofocus class="bf-note-close" data-act="receipt-close" aria-label="${msg('关闭解析', 'Close notes')}">×</button>
    <div class="bf-note-scroll" tabindex="0" role="region" aria-label="${msg('手记正文', 'Journal entry')}">
    <header class="bf-note-header"><div><span>${msg('战斗手记', 'Combat journal')}</span>
      <h2>${outcome(event)}</h2></div>
      ${stats.length ? '<dl class="bf-note-stats">'+stats.map(([value,label]) => '<div><dt>'+label+'</dt><dd>'+value+'</dd></div>').join('')+'</dl>' : ''}
      ${partnerNote(event)}</header>
    <div class="bf-note-body">
      ${event.explanation ? '<section><h3>'+explanationTitle+'</h3><div>'+study(event.explanation)+'</div></section>' : '<p>'+h(eventText(event,view))+'</p>'}
      ${event.source_ref ? '<p class="bf-note-source"><strong>'+msg('出处', 'Source')+'</strong> '+h(sourceCitation(event.source_ref))+'</p>' : ''}
      ${prompt ? '<details class="bf-note-attempt"><summary>'+msg('回看本次作答', 'Revisit this attempt')+'</summary><div>'+study(prompt)+'</div>'+
        (selected ? '<div><strong>'+msg('你的选择', 'Your choice')+'</strong> '+study(selected)+'</div>' : '')+'</details>' : ''}
    </div></div></article>`;
}

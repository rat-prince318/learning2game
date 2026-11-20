import { cargoMarkup } from './cargo.js';
import { partnerNote, receiptButton } from './field-notes.js';
import { displayText, escapeHtml, h, sourceCitation } from '../../js/utils.js';
import { msg } from '../../js/locale.js';
import { studyMarkup } from '../../js/study.js';
import { atlas, line } from '../world/atlas.js';
import { reuploadNotice } from '../world/exam-recovery.js';
import { enemyName, eventText, gearName, heroNames, intentCopy, lessonText, regionId, regionName } from './words.js';

const numbers = ['一', '二', '三', '四', '五', '六', '七', '八'];
const portraits = {arcanist:0, vanguard:1, ranger:2, willow:3, warden:4, moth:5, sprout:6, golem:7};
const commandIcons = {arcanist:2, ranger:3, vanguard:4};
const seals = ['✧','△','✣','◇','⬡','☆','✷','○'];
export const glyph = i => seals[i % seals.length];
export const heroInfo = view => heroNames(view?.player?.hero_class);
export const icon = name => '<i class="bf-icon bf-i-' + name + '" aria-hidden="true"></i>';
const study = value => studyMarkup(lessonText(value));

export function heading(view) {
  const index = view?.region_index || 0, tier = view?.battle?.tactics?.tier;
  const tag = view?.battle?.sidequest ? msg('营地修习','Camp study') :
    ({normal:msg('遭遇战','Encounter'),elite:msg('精英战','Elite encounter'),boss:msg('首领战','Boss battle')}[tier] ||
      (view ? msg('远征','Expedition') : msg('首领战','Boss battle')));
  const mark = view?.mode === 'tower' ? msg('第 '+view.floor+' 层','Floor '+view.floor) :
    view?.eight_chapters ? msg('第'+numbers[index]+'章', 'Chapter '+(index+1)) :
    msg('第'+(numbers[index] || index+1)+'卷', 'Book '+(index+1));
  return `<div class="bf-locus"><span class="bf-chapter">${mark}</span><h1>${h(regionName(view))}</h1></div><span class="bf-seal">${tag}</span>`;
}

function gaugeState(type, active) {
  if (type === 'focus' && active) return 'ready';
  if (type === 'poise' && active) return 'broken';
  return '';
}
function gaugeLabel(type, state) {
  if (state === 'ready') return msg('蓄满','Ready');
  if (state === 'broken') return msg('破势','Break');
  return {hp:msg('生命','HP'),enemyhp:msg('生命','HP'),focus:msg('蓄力','Focus'),poise:msg('架势','Poise')}[type];
}
function track(value, max, type, active = false) {
  const state = gaugeState(type, active);
  return `<div class="bf-meter bf-${type}" data-state="${state}"><span class="bf-gauge-name">${gaugeLabel(type,state)}</span>
    <span class="bf-track" style="--parts:${Math.max(1,max)}"><progress aria-label="${gaugeLabel(type,'')}" value="${value}" max="${max || 1}"></progress></span>
    <span class="bf-number">${value}<small>/${max}</small></span></div>`;
}
function portrait(index) {
  return `<span aria-hidden="true" class="bf-portrait"><i style="--portrait:${index}"></i></span>`;
}
export function hud(view) {
  const player = view?.player, foe = view?.battle?.enemy, tactics = view?.battle?.tactics;
  const [hero,burst] = heroInfo(view);
  const item = player?.inventory.find(gear => gear.id === player.loadout.weapon);
  const foePortrait = !view || tactics?.encounter_id === 'willow_lock' ? portraits.willow : portraits[foe?.sprite] ?? portraits.warden;
  return `<div class="bf-cardinal">${portrait(portraits[player?.hero_class] ?? portraits.arcanist)}
    <div class="bf-identity"><span>${msg('出战','Hero')}</span><strong title="${h(gearName(item))}">${hero}</strong>
    ${player ? '<b>Lv. '+player.level+'</b>' : ''}</div>
    ${player ? track(player.hp,player.max_hp,'hp') + track(player.focus,player.focus_max,'focus',player.burst_ready) :
      '<p>'+gearName(null)+' / '+burst+'</p>'}</div>
    <div class="bf-cardinal bf-foe">${foe || !view ? portrait(foePortrait) : ''}
      <div class="bf-identity"><span>${foe?.boss || !view ? msg('首领','Boss') : msg('对手','Foe')}</span>
      <strong>${foe || !view ? h(enemyName(view)) : msg('行军途中','On the road')}</strong>
      ${tactics ? '<b>'+msg('阶段 ','Phase ')+tactics.phase+'</b>' : ''}</div>
      ${foe ? track(foe.hp,foe.max_hp,'enemyhp') : ''}
      ${tactics ? track(tactics.shield,tactics.shield_max,'poise',tactics.broken) : ''}
      ${!view ? '<p>'+msg('柳木总闸 / 根须借力','Willow sluice / Root latch')+'</p>' : ''}
    </div>`;
}
export function showContact(hudElement, view, side) {
  const enemy = view.battle?.enemy, tactics = view.battle?.tactics, p = view.player;
  const values = side === 'foe' ? [
    ['enemyhp',enemy?.hp,enemy?.max_hp],['poise',tactics?.shield,tactics?.shield_max,tactics?.broken],
    ['focus',p.focus,p.focus_max,p.burst_ready],
  ] : [['hp',p.hp,p.max_hp]];
  for (const [name,value,max,active] of values) {
    const row = hudElement.querySelector('.bf-'+name);
    if (!row || value == null || max == null) continue;
    const progress = row.querySelector('progress');
    progress.max = max || 1;
    progress.value = value;
    row.dataset.state = gaugeState(name,active);
    row.querySelector('.bf-gauge-name').textContent = gaugeLabel(name,row.dataset.state);
    row.querySelector('.bf-track').style.setProperty('--parts',String(Math.max(1,max)));
    const number = row.querySelector('.bf-number');
    number.firstChild.nodeValue = String(value);
    number.querySelector('small').textContent = '/'+max;
  }
}

export function briefing() {
  return `<aside class="bf-orders"><div class="bf-section-label">${icon('compass')} ${msg('渡口情报','Scout report')}</div>
    <h2>${enemyName(null)}</h2><p>${msg('树心发亮，闸轮随之转动。听见木齿咬合时举盾，根须就会松开。','The tree heart glows and the wheel begins to turn. Raise your guard as its wooden teeth catch.')}</p></aside>
    <section class="bf-paper bf-briefing"><div class="bf-section-label">${icon('book-open')} ${msg('船工的委托','The ferryman’s request')}</div>
    <h2>${msg('夺回渡口总闸','Take back the sluice')}</h2>
    <p>${msg('“对岸一直亮着灯。他们还在等我的船。带上这本细胞图鉴吧，闸轮吃得懂上面的印记。”','“They keep a light burning on the opposite bank. Take my field guide. The wheel remembers the marks on its pages.”')}</p>
    <button class="bf-primary" type="button" data-act="start" data-testid="battle-start">${icon('swords')} ${msg('进入首领战','Challenge the gatekeeper')}</button></section>`;
}
function skillButton(id, label, image, selected, disabled, detail) {
  return `<button type="button" class="bf-skill" data-act="skill" data-id="${id}" data-testid="battle-skill-${id}"
    aria-pressed="${selected === id}" ${disabled ? 'disabled' : ''}><i aria-hidden="true" class="bf-skill-pic" style="--command:${image}"></i>
    <span><strong>${label}</strong><small>${detail}</small></span></button>`;
}
export function consequence(view, skill) {
  const t = view.battle.tactics;
  if (!t) return '';
  if (skill === 'burst') return msg('消耗全部蓄力，释放职业战技。','Spend all focus on your class technique.');
  const amount = skill === 'guard' ? t.guard_exposure : t.strike_exposure;
  if (!Number.isFinite(amount)) return '';
  const reward = skill === 'guard' ? msg('格挡削势','Guard chips poise') : msg('命中蓄力 +1','Hit gives +1 focus');
  return reward + msg('。若对手存活，正确出招预计损失 ','. On a correct cast, a surviving foe costs ') + amount + ' HP' + msg('。','.');
}
function tacticsPanel(view, selected, immersive) {
  const t = view.battle.tactics, p = view.player;
  const [name, tell, advice] = intentCopy(t?.intent);
  const round = `<span class="bf-round">${msg('回合 ','Turn ')}${t?.turn || 1}</span>`;
  const combo = p.combo ? '<span class="bf-combo">'+msg('连击 ','Combo ')+p.combo+'</span>' : '';
  const info = `<p>${h(tell || view.battle.stage.objective)}</p>${advice ? '<p class="bf-advice">'+h(advice)+'</p>' : ''}`;
  const exposure = `<p data-exposure class="bf-exposure">${consequence(view,selected)}</p>`;
  const skills = `<div class="bf-skills" role="group" aria-label="${msg('战斗指令','Battle commands')}">
    ${skillButton('strike',msg('普攻','Strike'),0,selected,false,msg('蓄能','Focus'))}
    ${skillButton('guard',msg('格挡','Guard'),1,selected,false,msg('反击','Counter'))}
    ${skillButton('burst',heroInfo(view)[1],commandIcons[p.hero_class] ?? 2,selected,!p.burst_ready,p.burst_ready ? msg('就绪','Ready') : p.focus+' / '+p.focus_max)}</div>`;
  if (immersive) return `<aside class="bf-orders bf-tactics"><details class="bf-enemy-plan">
    <summary data-testid="battle-intent">${round} <strong>${h(name)}</strong> ${combo}</summary>
    <div class="bf-intent">${info}${exposure}</div></details>${skills}</aside>`;
  return `<aside class="bf-orders bf-tactics"><div class="bf-command-top"><div class="bf-section-label">${icon('compass')} ${msg('敌方意图','Enemy intent')}</div>
    ${round}${combo}</div><div data-testid="battle-intent" class="bf-intent"><h2>${h(name)}</h2>${info}</div>
    ${skills}${exposure}</aside>`;
}
function lessonPanel(side, immersive) {
  const body = `<div class="bf-studybody">${study(side.lesson.definition)}</div><div class="bf-source">${msg('讲义出处','Field notes')}<br>${h(sourceCitation(side.lesson.source_ref))}</div>
    <p class="bf-note">${msg('修补残页后，将满血回到刚才的战场。','Mend the lost pages to rejoin the fight at full health.')}</p>`;
  if (immersive) return `<details class="bf-camp-notes" data-testid="battle-lesson"><summary>${icon('book-open')}
    <span>${msg('营地摘记','Camp notes')}</span><strong>${study(side.lesson.term)}</strong>
    <span class="bf-round">${side.completed + 1} / ${side.total}</span></summary><div class="bf-camp-text">${body}</div></details>`;
  return `<aside class="bf-orders bf-study" data-testid="battle-lesson"><div class="bf-section-label">${icon('book-open')} ${msg('营地修习','Camp study')}
    <span class="bf-round">${side.completed + 1} / ${side.total}</span></div>
    <h2>${study(side.lesson.term)}</h2>${body}</aside>`;
}
function canPresent(prompt) {
  return [prompt.text,...prompt.options.map(o => o.text)].every(text =>
    displayText(text,'') === String(text).replace(/\u00b7/gu,' ').trim());
}
function feedback(event, view) {
  if (!event || event.kind === 'hint') return '';
  return `${partnerNote(event)}<details class="bf-feedback"><summary>${msg('战斗记录','Combat log')}<span>${h(eventText(event,view))}</span></summary>
    ${event.explanation ? '<div>'+study(event.explanation)+'</div>' : ''}
    ${event.source_ref ? '<p class="bf-citation">'+msg('讲义出处','Source')+' / '+h(sourceCitation(event.source_ref))+'</p>' : ''}</details>`;
}

// Ordered-evidence challenges are forged by the backend with literal spaced
// arrows. Split only this exact form, keeping single equations intact.
export function chainPieces(prompt) {
  if (!prompt || !/两栏标签要按顺序送出|seal the entries in order|set the marks in order/iu.test(prompt.text)) return null;
  if (!prompt.options?.every(o => o.text.split(' → ').length === 2)) return null;
  const pairs = prompt.options.map(o => o.text.split(' → ').map(s => s.trim()));
  if (pairs.some(pair => pair.includes('')) || new Set(pairs.map(pair=>JSON.stringify(pair))).size !== pairs.length) return null;
  return pairs;
}
export function chainMarkup(prompt, picked) {
  const pairs = chainPieces(prompt);
  const index = picked.length ? 1 : 0;
  const unique = [...new Set(pairs.flat().filter(term => index === 0 ?
    pairs.some(pair=>pair[0] === term) : pairs.some(pair=>pair[0] === picked[0] && pair[1] === term)))];
  const selected = picked.length === 2;
  return `<div class="bf-chain"><div class="bf-chain-slots">
    <span>${picked[0] ? study(picked[0]) : msg('首印','First seal')}</span><i aria-hidden="true">→</i>
    <span>${picked[1] ? study(picked[1]) : msg('尾印','Second seal')}</span>
    ${picked.length ? '<button type="button" data-act="erase">'+msg('撤刻','Undo')+'</button>' : ''}</div>
    ${selected ? '' : '<div class="bf-options" role="group" aria-label="'+msg('符文顺序','Inscription order')+'">'+unique.map((term,i)=>
      '<button type="button" data-act="fragment" data-fragment="'+escapeHtml(term)+'"><b aria-hidden="true">'+glyph(i)+'</b><span>'+study(term)+'</span></button>').join('')+'</div>'}</div>`;
}
// The tower publishes entire answer tuples under opaque IDs. A lens changes
// which clue is legible, never the choice sent to the server.
export function towerEvidence(prompt) {
  const split = value => {
    const matches = [...String(value).matchAll(/(?:^|\n+)([①②③]) ([\s\S]*?)(?=\n+[①②③] |$)/gu)];
    return matches.length >= 2 && matches.every((match,i)=>match[1] === '①②③'[i]) ?
      matches.map(match=>match[2].trim()) : null;
  };
  const clues=split(prompt?.text);
  if (!clues) return null;
  const rows=prompt.options.map(o=>split(o.text));
  return rows.every(row=>row?.length===clues.length) ? {clues,rows} : null;
}
function evidenceReadout(components, lens) {
  const indices=lens < 0 ? components.map((_,i)=>i) : [lens];
  return indices.map(i=>'<span class="bf-evidence-row"><em aria-hidden="true">'+('①②③'[i])+
    '</em><span>'+study(components[i])+'</span></span>').join('');
}
function evidenceNav(count,lens) {
  const lensButton=(index,text)=>'<button type="button" data-act="lens" data-lens="'+index+'" aria-pressed="'+(lens===index)+'">'+text+'</button>';
  return '<div class="bf-lenses" role="group" aria-label="'+msg('研读证据','Inspect evidence')+'">'+
    lensButton(-1,msg('全览','All clues')) + Array.from({length:count},(_,i)=>lensButton(i,msg('线索 ','Clue ')+(i+1))).join('')+'</div>';
}
export function submitName(view, skill) {
  if (view?.phase === 'sidequest') return msg('修复这一页','Mend this page');
  return {strike:msg('刻印出击','Cast strike'),guard:msg('刻印架盾','Cast guard'),burst:heroInfo(view)[1]}[skill];
}
export function encounter(view, skill, option, picked=[], lens=-1, cargo=null, presentation={}) {
  const {battle} = view, prompt = battle.prompt, side = battle.sidequest;
  const {immersive, receipt} = presentation;
  const camp = side ? lessonPanel(side,immersive) : '';
  const left = side ? (immersive ? '' : camp) : tacticsPanel(view,skill,immersive);
  const recovery = view.legacy_exam_cover ? `<aside class="bf-clue" data-testid="legacy-exam-recovery">
    <p>${reuploadNotice()}</p><a href="/rpg/?prepare=1">${msg('选择原试卷','Choose the original paper')}</a></aside>` : '';
  if (!prompt || !canPresent(prompt)) return left + `<section class="bf-paper">${recovery}<h2>${msg('请核对课程题面','Review the course text')}</h2>
    <p>${msg('这道题需要保留讲义原意。请返回课程页调整措辞后重新发布。','Open the course editor and revise the wording to preserve the source meaning.')}</p>
    <button type="button" class="bf-primary" data-act="exit" data-testid="battle-exit">${msg('返回课程','Return to course')}</button></section>`;
  const chain = chainPieces(prompt);
  const evidence = view.mode === 'tower' ? towerEvidence(prompt) : null;
  const speakerIndex = Math.max(0, atlas.findIndex(region=>region.id === regionId(view)));
  const speaker = atlas[speakerIndex];
  const purpose = {
    retry: msg('错题重试', 'Retry missed question'),
    tower_practice: msg('塔层连击练习', 'Tower streak practice'),
    finisher: msg('最后一击', 'Finishing blow'),
  }[prompt.purpose];
  const task = side ? msg('修复残页','Mend the field guide') : evidence ? msg('星轨校准','Align the star seals') :
    chain ? msg('双重刻印','Linked inscription') : msg('战技刻印','Inscribe a technique');
  return left + `<section class="bf-paper bf-quiz">${immersive ? '<div class="bf-reading">' : ''}<div class="bf-papertop">
    <div class="bf-speaker"><i class="bf-scout-face" aria-hidden="true" style="--speaker:${speakerIndex}"></i>
      <div><strong>${line(speaker.keeper)}</strong><span class="bf-section-label">${icon(side?'book-open':'sparkles')} ${purpose || task}</span></div></div>
    ${immersive ? '<div class="bf-notes-actions">'+receiptButton(receipt) : ''}
    <button type="button" class="bf-hint" data-act="hint" data-testid="battle-hint" title="${side ? msg('查阅营地笔记','Read the camp notes') : msg('翻阅手记会放弃本回合的连击暴击。','Opening the field notes forgoes a combo critical this turn.')}"
      ${prompt.hint ? 'disabled' : ''}>${icon('lightbulb')} ${prompt.hint ? msg('已展开','Open') : msg('翻阅手记','Field notes')}</button>${immersive ? '</div>' : ''}</div>
    ${recovery}<div class="bf-line" tabindex="-1" data-prompt-title role="heading" aria-level="2">${evidence ? evidenceNav(evidence.clues.length,lens)+evidenceReadout(evidence.clues,lens) : study(prompt.text)}</div>
    ${cargoMarkup(cargo)}
    ${prompt.hint ? '<div class="bf-clue">'+study(prompt.hint)+'</div>' : ''}
    ${immersive ? camp : ''}
    ${immersive ? '</div><div class="bf-decision">' : ''}
    ${chain ? chainMarkup(prompt,picked) : '<div class="bf-options" role="group" aria-label="'+msg('选择刻印','Choose an inscription')+'">'+prompt.options.map((o,i)=>
      '<button type="button" data-act="option" data-testid="battle-option" data-option-id="'+escapeHtml(o.id)+'" aria-pressed="'+(o.id===option)+'"><b aria-hidden="true">'+glyph(i)+'</b><span>'+(evidence?evidenceReadout(evidence.rows[i],lens):study(o.text))+'</span></button>').join('')+'</div>'}
    <div class="bf-send"><span>${side ? msg('循着营地摘记修复书页','Use your camp notes to mend the page.') : evidence ? msg('切换线索，逐项核对同一枚刻印的星轨。','Focus each clue to inspect its binding on the same seal.') : chain ?
       msg('按讲义里的顺序嵌入两枚刻印。','Set both seals in the order given by the clue.') :
       msg('把线索刻入战技，再点亮战场上的目标。','Bind a clue, then trigger the marked target in the field.')}</span>
      <button type="button" class="bf-primary" data-act="submit" data-testid="battle-submit"
        ${option ? '' : 'disabled'}>${icon(side?'book-open':'swords')} <span data-submit-label>${submitName(view,skill)}</span></button></div>
    ${immersive ? '</div>' : feedback(battle.last_event,view)}</section>`;
}
export function result(view, standalone, canReplay, {immersive, receipt} = {}) {
  const event = view.battle?.last_event, won = ['victory','reward'].includes(view.phase), tower=view.mode === 'tower';
  const title = {victory:tower?msg('塔层突破','Floor cleared'):msg('远征通关','Expedition complete'),reward:msg('守军已退', 'Encounter won'),
    route:msg('队伍已到达路口','At the crossroads'),retreated:msg('队伍已返回营地','Back at camp')}[view.phase] || msg('远征进度','Journey progress');
  const acquired = event?.loot_items ?? (event?.loot ? [event.loot] : []);
  const nextRegion = view.eight_chapters && view.scene_index + 1 === view.map[view.region_index].chapters.length
    ? atlas[view.region_index + 1] : null;
  const camp = nextRegion ? msg('领补给，去' + line(nextRegion.name), 'Take supplies for ' + line(nextRegion.name)) : msg('前往营地','Visit camp');
  const next = standalone ? msg('回到主站','Return to studio') : tower ? msg('返回塔阶','Return to the stair') :
    ({reward:camp,victory:msg('查看远征结果','View expedition'),route:msg('返回地图','Return to map')}[view.phase] || msg('结束战斗','Leave battle'));
  const progress = tower ? msg('第 '+view.floor+' 层','Floor '+view.floor) :
    view.eight_chapters ? msg('主线第 '+(view.region_index+1)+' / 8 章', 'Story chapter '+(view.region_index+1)+' / 8') :
    view.cleared_chapters+' / '+view.chapter_count+' '+msg('关','stages');
  const balance = msg('路币 ','Trail coins ')+view.coins;
  const narrative = immersive && won && event ? eventText(event,view) :
    msg(view.narrative, won ? eventText(event,view) || 'The way ahead is open.' : 'Your progress is safe in the expedition journal.');
  const loot = won && event ? '<ul class="bf-loot"><li>'+msg('经验','XP')+' +'+event.xp_gained+'</li>'+
    (event.levels_gained ? '<li>'+msg('升至 ','Level up ' )+'Lv. '+view.player.level+'</li>' : '')+
    acquired.map(item=>'<li>'+h(gearName(item))+'</li>').join('')+'</ul>' : '';
  const sidebar = immersive ? '' : `<aside class="bf-orders"><div class="bf-section-label">${icon('flag')} ${msg('远征记录','Expedition record')}</div>
    <h2>${progress}</h2><p>${balance}</p></aside>`;
  return sidebar + `<section class="bf-paper bf-result" data-testid="battle-result">
    <header class="bf-result-header"><div class="bf-section-label">${icon(won?'sparkles':'compass')} ${won ? msg('战斗结算','After the battle') : msg('队伍行程','Journey')}</div>
      <h2 tabindex="-1" data-prompt-title>${title}</h2><p>${h(narrative)}</p></header>
    ${loot}${partnerNote(event)}
    ${immersive ? '<div class="bf-result-meta"><span>'+progress+'</span><span>'+balance+'</span></div>' : ''}
    <div class="bf-actions">${immersive ? receiptButton(receipt, won) : ''}
    ${canReplay ? '<button type="button" class="bf-primary" data-act="start">'+msg('再战渡口','Replay the ferry')+'</button>' : ''}
    <button type="button" class="${canReplay?'bf-linkbtn':'bf-primary'}" data-act="exit" data-testid="battle-exit">${next}</button></div></section>`;
}

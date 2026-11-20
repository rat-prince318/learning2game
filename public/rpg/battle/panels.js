import { displayText, escapeHtml, h } from '../../js/utils.js';

const heroes = {
  arcanist: ['星纹术士', '坠星术'],
  vanguard: ['誓盾先锋', '破阵斩'],
  ranger: ['岚弓游侠', '穿云箭'],
};
const numbers = ['一', '二', '三', '四', '五', '六', '七', '八'];
export const heroInfo = (view) => heroes[view?.player?.hero_class] || heroes.arcanist;
export const icon = (name) => `<i class="bf-icon bf-i-${name}" aria-hidden="true"></i>`;

export function heading(view) {
  const index = view?.region_index || 0;
  const location = view?.map?.[index]?.name || '烟柳渡';
  const tag = view?.battle?.sidequest ? '营地修习' :
    ({ normal: '遭遇战', elite: '精英战', boss: '首领战' }[view?.battle?.tactics?.tier] ||
     (view ? '远征' : '首领战'));
  return `<div class="bf-locus"><span class="bf-chapter">第${numbers[index] || index + 1}卷</span>
    <h1>${h(location)}</h1></div><span class="bf-seal">${tag}</span>`;
}

function track(label, value, max, type) {
  const width = max > 0 ? Math.max(0, Math.min(100, 100 * value / max)) : 0;
  return `<div class="bf-meter bf-${type}"><span>${label}</span>
    <progress aria-label="${label}" value="${value}" max="${max || 1}">${width}%</progress>
    <span class="bf-number">${value}<small>/${max}</small></span></div>`;
}

export function hud(view) {
  const player = view?.player, foe = view?.battle?.enemy, tactics = view?.battle?.tactics;
  const [hero] = heroInfo(view);
  const weapon = player?.inventory.find((gear) => gear.id === player.loadout.weapon)?.name;
  return `<div class="bf-cardinal">
      <div class="bf-identity"><span>出战</span><strong title="${h(weapon || '嫩枝法杖')}">${h(hero)}</strong>${player ? `<b>Lv. ${player.level}</b>` : ''}</div>
      ${player ? track('生命', player.hp, player.max_hp, 'hp') + track('蓄力', player.focus, player.focus_max, 'focus') :
        '<p>嫩枝法杖 <span class="bf-slash">/</span> 坠星术</p>'}
    </div>
    <div class="bf-cardinal bf-foe">
      <div class="bf-identity"><span>${foe?.boss || !view ? '首领' : '对手'}</span>
      <strong>${h(foe?.name || (view ? '行军途中' : '柳根闸主'))}</strong>
      ${tactics ? `<b>阶段 ${tactics.phase}</b>` : ''}</div>
      ${foe ? track('生命', foe.hp, foe.max_hp, 'enemyhp') : ''}
      ${tactics ? track('架势', tactics.shield, tactics.shield_max, 'poise') : ''}
      ${!view ? '<p>柳木总闸 <span class="bf-slash">/</span> 根须借力</p>' : ''}
    </div>`;
}

// Reveal only the server-issued gauges at each point of contact. The next
// prompt, final level and settlement are still shown together after the turn.
export function showContact(hudElement, view, side) {
  const enemy = view.battle?.enemy, tactics = view.battle?.tactics, player = view.player;
  const values = side === 'foe' ? [
    ['enemyhp', enemy?.hp, enemy?.max_hp], ['poise', tactics?.shield, tactics?.shield_max],
    ['focus', player.focus, player.focus_max],
  ] : [['hp', player.hp, player.max_hp]];
  for (const [name, value, max] of values) {
    const row = hudElement.querySelector('.bf-' + name);
    if (!row || value == null || max == null) continue;
    const progress = row.querySelector('progress');
    progress.max = max || 1;
    progress.value = value;
    const number = row.querySelector('.bf-number');
    number.firstChild.nodeValue = String(value);
    number.querySelector('small').textContent = '/' + max;
  }
}

export function briefing() {
  return `<aside class="bf-orders"><div class="bf-section-label">${icon('compass')} 渡口情报</div>
    <h2>柳根闸主</h2><p>树心亮起时，闸轮正在蓄势。看准这一拍格挡，可以击破它的架势。</p></aside>
    <section class="bf-paper bf-briefing"><div class="bf-section-label">${icon('book-open')} 出战简报</div>
    <h2>夺回渡口总闸</h2><p>带上细胞生物学讲义，替船工打通水路。每回合读招、选战技，再用一道题打出这一击。</p>
    <button class="bf-primary" type="button" data-act="start" data-testid="battle-start">${icon('swords')} 进入首领战</button></section>`;
}

function skillButton(id, label, glyph, selected, disabled, detail) {
  return `<button type="button" class="bf-skill" data-act="skill" data-id="${id}" data-testid="battle-skill-${id}"
    aria-pressed="${selected === id}" ${disabled ? 'disabled' : ''}>${icon(glyph)}
    <span><strong>${label}</strong><small>${detail}</small></span></button>`;
}

function tacticsPanel(view, selected) {
  const t = view.battle.tactics, p = view.player, intent = t?.intent;
  return `<aside class="bf-orders"><div class="bf-section-label">${icon('compass')} 敌方意图
    <span class="bf-round">回合 ${t?.turn || 1}</span></div>
    <div data-testid="battle-intent" class="bf-intent"><h2>${h(intent?.name || '观察敌情')}</h2>
    <p>${h(intent?.telegraph || view.battle.stage.objective)}</p>
    ${intent?.advice ? `<p class="bf-advice">${h(intent.advice)}</p>` : ''}</div>
    <div class="bf-skills" role="group" aria-label="战斗指令">
    ${skillButton('strike', '普攻', 'swords', selected, false, '积攒蓄力')}
    ${skillButton('guard', '格挡', 'shield', selected, false, '防守反击')}
    ${skillButton('burst', heroInfo(view)[1], 'sparkles', selected, !p.burst_ready, `蓄力 ${p.focus}/${p.focus_max}`)}
    </div></aside>`;
}

function lessonPanel(side) {
  return `<aside class="bf-orders bf-study" data-testid="battle-lesson"><div class="bf-section-label">${icon('book-open')} 营地修习
    <span class="bf-round">${side.completed + 1} / ${side.total}</span></div>
    <h2>${h(side.lesson.term)}</h2><p>${h(side.lesson.definition)}</p><div class="bf-source">讲义出处<br>${h(side.lesson.source_ref)}</div>
    <p class="bf-note">完成本轮巩固后，返回同一场战斗。</p></aside>`;
}

// Keep the meaning of assessed course content intact when display rules mask a clause.
function canPresent(prompt) {
  return [prompt.text, ...prompt.options.map(o => o.text)].every(text =>
    displayText(text, '') === String(text).replace(/\u00b7/gu, ' ').trim());
}

function feedback(event) {
  if (!event || event.kind === 'hint') return '';
  return `<details class="bf-feedback"><summary>上一回合<span>${h(event.message)}</span></summary>
    ${event.explanation ? `<p>${h(event.explanation)}</p>` : ''}
    ${event.source_ref ? `<p class="bf-citation">讲义出处 / ${h(event.source_ref)}</p>` : ''}</details>`;
}

export function encounter(view, skill, option) {
  const { battle } = view, prompt = battle.prompt, side = battle.sidequest;
  const left = side ? lessonPanel(side) : tacticsPanel(view, skill);
  if (!prompt || !canPresent(prompt)) return left + `<section class="bf-paper"><h2>请核对课程题面</h2>
    <p>这道题需要保留讲义原意。请返回课程页调整措辞后重新发布。</p>
    <button type="button" class="bf-primary" data-act="exit" data-testid="battle-exit">返回课程</button></section>`;
  return left + `<section class="bf-paper bf-quiz"><div class="bf-papertop">
    <div class="bf-section-label">${icon('book-open')} ${side ? '巩固练习' : '战斗答题'}</div>
    <button type="button" class="bf-hint" data-act="hint" data-testid="battle-hint"
      ${prompt.hint ? 'disabled' : ''}>${icon('lightbulb')} ${prompt.hint ? '已用提示' : '查看提示'}</button></div>
    <h2 tabindex="-1" data-prompt-title>${h(prompt.text)}</h2>
    ${prompt.hint ? `<p class="bf-clue">${h(prompt.hint)}</p>` : ''}
    <div class="bf-options" role="group" aria-label="答案选项">${prompt.options.map((o,i) =>
      `<button type="button" data-act="option" data-testid="battle-option" data-option-id="${escapeHtml(o.id)}"
        aria-pressed="${o.id === option}"><b aria-hidden="true">${String.fromCharCode(65+i)}</b><span>${h(o.text)}</span></button>`).join('')}</div>
    <div class="bf-send"><span>${side ? '阅读营地笔记后作答' : '选定战技和答案后出招'}</span>
      <button type="button" class="bf-primary" data-act="submit" data-testid="battle-submit"
        ${option ? '' : 'disabled'}>${icon(side ? 'book-open' : 'swords')} ${side ? '提交巩固答案' : '确认出招'}</button></div>
    ${feedback(battle.last_event)}</section>`;
}

export function result(view, standalone, canReplay) {
  const event = view.battle?.last_event, won = ['victory', 'reward'].includes(view.phase);
  const title = {victory:'远征通关', reward:'本章胜利', route:'队伍已到达路口', retreated:'队伍已返回营地'}[view.phase] || '远征进度';
  const acquired = event?.loot_items ?? (event?.loot ? [event.loot] : []);
  const next = standalone ? '回到主站' : ({reward:'前往营地', victory:'查看远征结果', route:'返回地图'}[view.phase] || '结束战斗');
  return `<aside class="bf-orders"><div class="bf-section-label">${icon('flag')} 远征记录</div>
    <h2>${view.cleared_chapters} / ${view.chapter_count} 章</h2><p>路币 ${view.coins} 枚</p></aside>
    <section class="bf-paper bf-result" data-testid="battle-result"><div class="bf-section-label">
    ${icon(won ? 'sparkles' : 'compass')} ${won ? '战斗结算' : '队伍行程'}</div><h2 tabindex="-1" data-prompt-title>${title}</h2>
    <p>${h(view.narrative)}</p>${won ? `<ul class="bf-loot"><li>经验 +${event?.xp_gained ?? 0}</li>
    ${event?.levels_gained ? `<li>升至 Lv. ${view.player.level}</li>` : ''}
    ${acquired.map(item => `<li>${h(item.name)}</li>`).join('')}</ul>` : ''}
    <div class="bf-actions">${canReplay ? '<button type="button" class="bf-primary" data-act="start">再战渡口</button>' : ''}
    <button type="button" class="${canReplay ? 'bf-linkbtn' : 'bf-primary'}" data-act="exit" data-testid="battle-exit">${next}</button></div></section>`;
}

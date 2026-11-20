import { msg, getLocale } from '../../js/locale.js';
import { h } from '../../js/utils.js';
import { gearName, heroNames } from '../battle/words.js';
import { regionOf } from './atlas.js';
import { relicName } from './interface.js';

const tileIds = [
  'twig_focus', 'amber_focus', 'rain_focus', 'moon_focus', 'dawn_focus', 'camp_blade', 'copper_blade', 'tide_blade',
  'cliff_blade', 'sun_blade', 'reed_bow', 'elm_bow', 'gale_bow', 'cloud_bow', 'comet_bow', 'trail_coat',
  'ward_vest', 'echo_charm', 'hearth_charm', 'field_bandage', 'focus_tea', 'relic',
];
const texts = {
  gear: ['装备', 'Gear'], supplies: ['道具', 'Supplies'], relics: ['遗物', 'Relics'],
  weapon: ['武器', 'Weapon'], armor: ['护甲', 'Armor'], accessory: ['饰物', 'Accessory'],
  hp: ['生命', 'Health'], max_hp: ['生命上限', 'Max HP'], attack: ['攻击', 'Attack'],
  defense: ['防御', 'Defense'], focus: ['蓄力', 'Focus'], crit_every: ['暴击间隔', 'Crit interval'],
  xp: ['经验', 'XP'], xp_to_next_level: ['升级所需', 'XP to level'],
  field_bandage: ['野战绷带', 'Field bandage'], focus_tea: ['凝神茶', 'Focus tea'],
  break_power: ['破势', 'Break'], guard: ['格挡', 'Guard'], burst_percent: ['战技倍率', 'Burst power'],
  counter: ['敌人威力', 'Enemy power'], opening_focus: ['开场蓄力', 'Starting focus'], heal_on_win: ['战后回复', 'Healing on victory'],
};
export const packLabel = key => msg(...texts[key]);
export const canOrganizePack = view => ['route', 'reward'].includes(view.phase);
const signed = n => n > 0 ? '+' + n : String(n);
const roleId = p => ['arcanist', 'vanguard', 'ranger'].includes(p.hero_class) ? p.hero_class : 'arcanist';

export function packRows(view, tab) {
  const p = view.player;
  if (tab === 'gear') return p.inventory.map(item => ({
    id: item.id, title: h(gearName(item)), subtitle: packLabel(item.slot || 'weapon'),
    equipped: (p.loadout?.[item.slot || 'weapon'] || ((item.slot || 'weapon') === 'weapon' && p.equipped_id)) === item.id, item,
  }));
  if (tab === 'supplies') return (view.supplies || []).filter(s => texts[s.id]).map(item => ({
    id: item.id, title: packLabel(item.id), subtitle: msg('消耗品', 'Consumable'), quantity: item.quantity, item,
  }));
  return (view.relics || []).map(({relic, stacks}) => ({
    id: relic.id, title: relicName(relic), subtitle: msg('随身遗物', 'Carried relic'), quantity: stacks, item: relic,
  }));
}

const statKey = { hp_bonus: 'max_hp', attack_bonus: 'attack', defense_bonus: 'defense', critical_interval_reduction: 'crit_every' };
export function gearComparison(player, candidate, removing = false) {
  const slot = candidate.slot || 'weapon';
  const currentId = player.loadout?.[slot] || (slot === 'weapon' && player.equipped_id);
  const worn = player.inventory.find(item => item.id === currentId);
  const compared = [];
  for (const [bonus, stat] of Object.entries(statKey)) {
    const before = player.stats?.[stat] ?? player[stat];
    if (!Number.isFinite(before)) continue;
    const change = (removing ? 0 : (candidate[bonus] || 0)) - (worn?.[bonus] || 0);
    const after = stat === 'crit_every' ? Math.max(2, before - change) : before + change;
    if (after !== before) compared.push({stat, before, after, better: stat === 'crit_every' ? after < before : after > before});
  }
  return compared;
}

function icon(id) {
  const known = tileIds.indexOf(id);
  const index = known >= 0 ? known : tileIds.indexOf('relic');
  return '<span class="pack-icon" aria-hidden="true" style="--ix:' + index % 8 + ';--iy:' + Math.floor(index / 8) + '"></span>';
}

export function heroPanel(view) {
  const p = view.player, role = roleId(p);
  const zone = regionOf(view).id;
  const loadout = packRows(view, 'gear').filter(row => row.equipped).map(row => {
    const label = row.subtitle + ' / ' + row.title;
    return '<button type="button" data-pack-worn="' + h(row.id) + '" title="' + label + '" aria-label="' + label + '">' +
      icon(row.id) + '</button>';
  }).join('');
  const iconStat = (key, value) => '<div class="pack-stat"><dt>' + packLabel(key) +
    '</dt><dd data-pack-stat="' + key + '">' + value + '</dd></div>';
  return '<section class="pack-hero" aria-label="' + msg('角色属性', 'Character stats') + '">' +
    '<div class="pack-hero-top"><h2>' + h(heroNames(role)[0]) + '</h2><span>Lv. <b>' + p.level + '</b></span></div>' +
    '<div class="pack-portrait" style="--scenery:url(\'/rpg/world/region-art/' + h(zone) + '.webp\')">' +
      '<span class="pack-orbit" aria-hidden="true"></span><img draggable="false" src="/rpg/world/region-art/pack-' +
        role + '.webp" alt="' + h(heroNames(role)[0]) + '"><div class="pack-loadout" role="group" aria-label="' +
        msg('当前穿戴', 'Worn equipment') + '">' + loadout + '</div></div>' +
    '<dl class="pack-readings"><div class="pack-vital"><dt>' + packLabel('hp') + '</dt><dd data-pack-stat="hp">' +
      p.hp + ' / ' + p.max_hp + '</dd><dd class="pack-meter"><progress value="' + p.hp + '" max="' + p.max_hp +
      '" aria-label="' + packLabel('hp') + '"></progress></dd></div>' +
      iconStat('attack', p.attack) + iconStat('defense', p.stats?.defense ?? '—') +
      iconStat('focus', p.focus + ' / ' + p.focus_max) + iconStat('xp', p.xp) +
      (p.stats?.crit_every ? iconStat('crit_every', msg(p.stats.crit_every + ' 连击', p.stats.crit_every + ' hits')) : '') +
      (Number.isFinite(p.xp_to_next_level) ? iconStat('xp_to_next_level', p.xp_to_next_level || msg('已满级', 'Max level')) : '') +
      '</dl></section>';
}

export function packList(rows, selected, tab, mode) {
  if (!rows.length && mode === 'tower' && tab === 'supplies')
    return '<p class="pack-empty">' + msg('塔门会在登塔时为你补满生命。', 'The tower gate restores your health when you enter.') + '</p>';
  if (!rows.length) return '<p class="pack-empty">' + (tab === 'relics'
    ? msg('在驿站用路币换取遗物，随身携带即可生效。', 'Trade coins for relics at a wayside camp. Their effects apply while carried.')
    : msg('这里还空着。', 'Nothing in this pocket yet.')) + '</p>';
  return rows.map(row => '<button type="button" class="pack-item' + (row.quantity === 0 ? ' is-empty' : '') +
    '" data-pack-item="' + h(row.id) + '" aria-pressed="' + (selected === row.id) + '" tabindex="' + (selected === row.id ? 0 : -1) + '">' +
    icon(tab === 'relics' ? 'relic' : row.id) + '<span class="pack-item-name">' + row.title + '</span>' +
    (row.equipped ? '<span class="pack-worn">' + msg('穿戴中', 'Equipped') + '</span>' :
      row.quantity != null ? '<span class="pack-count">×' + row.quantity + '</span>' : '') + '</button>').join('');
}

const action = (id, title, disabled = false, extra = '') => '<button type="button" class="pack-' + id + '" data-pack-action="' +
  id + '"' + (disabled ? ' disabled' : '') + extra + '>' + title + '</button>';
function bonusList(item) {
  const stats = [];
  for (const [bonus, key] of Object.entries(statKey)) {
    if (item[bonus]) stats.push(packLabel(key) + ' ' + signed(key === 'crit_every' ? -item[bonus] : item[bonus]));
  }
  return stats.join(' / ');
}

export function packDetail(view, tab, row, dropping) {
  if (!row) return '';
  const canEdit = canOrganizePack(view), p = view.player, item = row.item;
  const heading = '<div class="pack-detail-title">' + icon(tab === 'relics' ? 'relic' : row.id) +
    '<div><small>' + row.subtitle + '</small><h3>' + row.title + '</h3></div></div>';
  if (dropping) {
    const qty = row.quantity ?? 1;
    return heading + '<p>' + msg('丢弃后会从这份存档移除。', 'Discarded items are removed from this save.') + '</p>' +
      '<div class="pack-confirm"><label>' + msg('数量', 'Quantity') +
      ' <input type="number" inputmode="numeric" min="1" step="1" required max="' + qty + '" value="1" data-pack-quantity' +
      (qty === 1 ? ' readonly' : '') + '></label><div class="pack-actions">' +
      action('cancel', msg('保留', 'Keep')) + action('confirm-discard', msg('确认丢弃', 'Confirm discard')) + '</div></div>';
  }
  let text = '', preview = '', controls = '';
  if (tab === 'gear') {
    const slot = item.slot || 'weapon';
    text = bonusList(item);
    const removable = row.equipped && slot !== 'weapon';
    if (canEdit && (!row.equipped || removable)) {
      const changes = gearComparison(p, item, removable);
      if (changes.length) {
        preview = '<div class="pack-preview"><small>' + (removable ? msg('卸下后', 'After removal') : msg('换装后', 'After equipping')) +
          '</small>' + changes.map(({stat, before, after, better}) =>
            '<span>' + packLabel(stat) + ' ' + before + ' → <b class="' + (better ? 'pack-up' : 'pack-down') + '">' +
            after + '</b></span>').join('') + '</div>';
      }
      controls += removable ? action('unequip', msg('卸下', 'Unequip')) : action('equip', msg('装备', 'Equip'));
    }
    if (row.equipped && slot === 'weapon')
      text += (text ? ' / ' : '') + msg('当前武器', 'Active weapon');
    if (canEdit && !row.equipped) controls += action('discard', msg('丢弃', 'Discard'));
  } else if (tab === 'supplies') {
    const heal = item.heal > 0 || row.id === 'field_bandage';
    const amount = heal ? item.heal ?? 12 : item.focus ?? 1;
    const current = heal ? p.hp : p.focus, max = heal ? p.max_hp : p.focus_max;
    const usable = current < max && row.quantity > 0;
    text = heal ? msg('包扎伤口，回复 ' + amount + ' 点生命。', 'Dress a wound to restore ' + amount + ' HP.') :
      msg('饮下一口，回复 ' + amount + ' 格蓄力。', 'Sip the tea to restore ' + amount + ' focus.');
    if (row.quantity === 0) text += ' ' + (heal ? msg('调查新的地区机关可补充绷带。', 'Survey a new region’s mechanism to find more bandages.') :
      msg('击败地区首领可补充凝神茶。', 'Defeat a regional boss to replenish your tea.'));
    else if (current >= max) text += ' ' + (heal ? msg('当前生命已满。', 'Health is full.') : msg('当前蓄力已满。', 'Focus is full.'));
    if (usable && canEdit) preview = '<div class="pack-preview"><small>' + msg('使用后', 'After use') + '</small><span>' +
      packLabel(heal ? 'hp' : 'focus') + ' ' + current + ' → <b class="pack-up">' + Math.min(max, current + amount) + '</b></span></div>';
    if (canEdit) controls = action('use', msg('使用', 'Use'), !usable) + action('discard', msg('丢弃', 'Discard'), row.quantity < 1);
  } else {
    text = getLocale() === 'zh' ? h(item.description) : Object.entries(item.bonuses || {}).filter(([key, n]) => texts[key] && n)
      .map(([key, n]) => packLabel(key) + ' ' + signed(n)).join(' / ');
  }
  if (!canEdit && tab !== 'relics') text += ' ' + (view.mode === 'tower'
    ? msg('这里显示你在本层穿戴的装备。', 'This is the equipment you carry on this floor.')
    : msg('回到地图或补给时可整理背包。', 'Manage your pack on the trail or at a supply stop.'));
  return heading + (text ? '<p>' + text + '</p>' : '') + preview + (controls ? '<div class="pack-actions">' + controls + '</div>' : '');
}

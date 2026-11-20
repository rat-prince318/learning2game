import test from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../public/js/locale.js';
import { gearComparison, heroPanel, packRows, packDetail, packList } from '../public/rpg/world/pack-content.js';

const staff = {id: 'twig_focus', name: '嫩枝法杖', slot: 'weapon', attack_bonus: 6};
const coat = {id: 'trail_coat', name: '巡途短衣', slot: 'armor', attack_bonus: 1};
const vest = {id: 'ward_vest', name: '苔纹护甲', slot: 'armor', hp_bonus: 4, defense_bonus: 3};
const view = {
  phase: 'route', region_index: 0, supplies: [{id: 'field_bandage', quantity: 2, heal: 12, focus: 0}],
  player: {hero_class: 'arcanist', level: 1, xp: 0, hp: 25, max_hp: 30, attack: 16,
    focus: 0, focus_max: 2, inventory: [staff, coat, vest], loadout: {weapon: staff.id, armor: coat.id},
    stats: {max_hp: 30, attack: 16, defense: 2, crit_every: 4}},
};
const gear = packRows(view,'gear');

test('armor replacement previews the loss of old bonuses and the gain from the new equipment', () => {
  assert.deepEqual(gearComparison(view.player, vest), [
    {stat:'max_hp', before:30, after:34, better:true},
    {stat:'attack', before:16, after:15, better:false},
    {stat:'defense', before:2, after:5, better:true},
  ]);
  const hero = heroPanel(view);
  assert.match(hero, /pack-arcanist\.webp/);
  assert.match(hero, /data-pack-worn="trail_coat"/);
  assert.doesNotMatch(hero, /data-pack-worn="ward_vest"/);
});

test('worn weapons remain protected, armor can be removed and unworn gear can be discarded', () => {
  assert.doesNotMatch(packDetail(view, 'gear', gear[0], false), /data-pack-action/);
  assert.match(packDetail(view, 'gear', gear[1], false), /data-pack-action="unequip"/);
  assert.doesNotMatch(packDetail(view, 'gear', gear[1], false), /data-pack-action="discard"/);
  assert.match(packDetail(view, 'gear', gear[2], false), /data-pack-action="discard"/);
  assert.match(packDetail(view, 'gear', gear[2], true), /data-pack-action="confirm-discard"/);
  assert.doesNotMatch(packDetail({...view, phase:'combat'}, 'gear', gear[2], false), /data-pack-action/);
});

test('the bandage preview caps healing and stock controls constrain discards and full-health use', () => {
  const bandage = packRows(view,'supplies')[0];
  assert.match(packDetail(view, 'supplies', bandage, false), /25 → <b class="pack-up">30/);
  const confirm = packDetail(view, 'supplies', bandage, true);
  assert.match(confirm, /min="1" step="1" required max="2"/);
  assert.match(confirm, /data-pack-action="cancel"/);
  assert.match(packDetail({...view, player:{...view.player, hp:30}}, 'supplies', bandage, false), /data-pack-action="use" disabled/);
});

test('tower supplies and equipment give contextual English instructions', () => {
  setLocale('en');
  try {
    assert.match(packList([], '', 'supplies', 'tower'), /restores your health/);
    const tower = {...view, phase:'combat', mode:'tower'};
    assert.match(packDetail(tower,'gear',packRows(tower,'gear')[0],false), /equipment you carry on this floor/);
    assert.match(heroPanel(tower), /Character stats/);
  } finally { setLocale('zh'); }
});

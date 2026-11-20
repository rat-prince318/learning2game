import test from 'node:test';
import assert from 'node:assert/strict';
import { openDistrictTool, operateDistrictTool, districtToolReady } from '../public/rpg/world/district-tools.js';
import { stationInstrument } from '../public/rpg/world/station-tools.js';
import { setLocale } from '../public/js/locale.js';

const story = (region_index) => ({ region_index, eight_chapters: true, campaign_story: true });
const start = (i) => openDistrictTool(story(i));
const move = (state, ...actions) => actions.reduce(operateDistrictTool, state);

test('a moving cart must cool and stop before the axle will take the safety hook', () => {
  const yard = start(2);
  assert.equal(districtToolReady(move(yard, 'hopper', 'brake')), false);
  assert.equal(districtToolReady(move(yard, 'cooling')), false);
  const halted = move(yard, 'cooling', 'brake');
  assert.equal(districtToolReady(halted), true);
  assert.equal(districtToolReady(move(halted, 'hopper')), false);
});

test('the timber rope carries the scouts’ reply, the bridge pin lifts on the third signal', () => {
  for (const line of ['drift', 'ice', 'post']) {
    assert.equal(districtToolReady(move(start(5), line)), line === 'post');
  }
  let bridge = start(6);
  for (const ready of [false, false, true, false]) {
    bridge = move(bridge, 'ring');
    assert.equal(districtToolReady(bridge), ready);
  }
});

test('the orrery sight must face east with zero elevation, including after a full turn', () => {
  const ring = start(7);
  assert.equal(districtToolReady(move(ring, 'lower', 'lower')), false);
  const high = move(ring, 'rotate', 'lower');
  assert.equal(districtToolReady(high), false);
  const aligned = move(high, 'lower');
  assert.equal(districtToolReady(aligned), true);
  assert.equal(districtToolReady(move(aligned, 'rotate','rotate','rotate','rotate')), true);
  assert.equal(move(aligned, 'lower','lower','lower').elevation, -30);
  assert.equal(districtToolReady(move(aligned, 'raise')), false);
});

test('the tools have bilingual readings and an explicit commit, legacy saves keep the dial', () => {
  for (const [i, zh, en] of [[2,'矿车分道闸','Ore cart points'],[5,'山口听绳','Pass bell lines'],
    [6,'钟楼放桥台','Drawbridge signals'],[7,'黄铜日环','Brass meridian']]) {
    for (const [locale, name] of [['zh', zh], ['en', en]]) {
      setLocale(locale);
      const html = stationInstrument(story(i), 0, start(i));
      assert.ok(html.includes(name));
      assert.match(html, /role="status"/);
      assert.match(html, /data-do="inspect" disabled/);
    }
    const short = { ...story(i), eight_chapters: false };
    assert.equal(openDistrictTool(short), null);
    assert.equal(stationInstrument(short, 0, null), '');
  }
  setLocale('zh');
});

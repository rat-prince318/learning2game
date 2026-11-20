import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../public/js/locale.js';
import { atlas, checkpointAftermath, fieldQuest } from '../public/rpg/world/atlas.js';
import { acts, arrivalEcho } from '../public/rpg/world/saga/chapters.js';

test('every chapter guides players to its actual story, landmark, exit or battle in both languages', () => {
  for (const locale of ['zh', 'en']) {
    setLocale(locale);
    for (const [index, post] of atlas.entries()) {
      const view = {
        phase: 'route', campaign_story: true, eight_chapters: true, region_index: index,
        scene_index: 0, story_marks: {}, field_signals: [], routes: [],
        map: atlas.map(({ id }) => ({ region_id: id, chapters: [{ kind: 'exploration' }] })),
      };
      const target = (key) => {
        const guide = fieldQuest(view);
        assert.equal(guide.target, key);
        for (const copy of [guide.title, guide.text, guide.verb]) {
          assert.ok(copy.trim());
          assert.equal(/[\u3400-\u9fff]/u.test(copy), locale === 'zh');
        }
      };
      const scoutFirst = [1, 3, 4].includes(index);
      if (scoutFirst) {
        target('site');
        view.field_signals.push(post.id);
      }
      target(index ? 'keeper' : 'ship');
      view.story_marks[post.id] = acts[index].choices[0].id;
      view.field_signals = [];
      target('site');
      view.field_signals.push(post.id);
      target('ship');
      view.field_signals = [];
      view.map[index].chapters = [{ kind: 'battle' }, { kind: 'battle' }];
      view.routes = [{ id: 'elite' }, { id: 'normal' }];
      target('normal');
      const midpoint = checkpointAftermath(view);
      view.scene_index++;
      view.routes = [{ id: 'boss_daring', boss: true }, { id: 'boss_steady', boss: true }];
      target('boss_steady');
      assert.notEqual(checkpointAftermath(view), midpoint, 'Only the last stop sends the party onward');
      if (index < 7) {
        view.phase = 'reward';
        target('ship');
      }
      view.phase = 'victory';
      assert.equal(fieldQuest(view).target, null);
    }
  }
  setLocale('zh');
});

test('both choices from each earlier post carry forward by saved ID', () => {
  const view = { map: atlas.map(({ id }) => ({ region_id: id })), story_marks: {} };
  for (let i = 1; i < acts.length; i++) {
    view.region_index = i;
    const post = atlas[i - 1];
    const choices = acts[i - 1].choices;
    const seen = new Set();
    assert.equal(arrivalEcho(view), null);
    for (const choice of choices) {
      view.story_marks[post.id] = choice.id;
      const echo = arrivalEcho(view);
      assert.deepEqual(echo, choice.echo);
      assert.ok(echo[0] && echo[1]);
      seen.add(echo[0]);
    }
    assert.equal(seen.size, choices.length);
  }
});

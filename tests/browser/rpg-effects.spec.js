import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const courseView = JSON.parse(readFileSync(
  new URL('../../docs/rpg-fixtures/battle-ui/willow-boss.public.json', import.meta.url), 'utf8',
));

test('attack, guard break and each class burst draw distinct effects; reduced motion keeps just the receipt', async ({ page }) => {
  // Isolate the stage from the camera, scroll and network. The flow specs cover actual
  // answer receipts. Here all three classes act on the same enemy at the same screen position.
  await page.route('**/__effects_stage', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<link rel="stylesheet" href="/rpg/battle/stage.css"><div id="arena" style="width:840px;height:290px"></div>',
  }));
  await page.goto('/__effects_stage');
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.evaluate(async (view) => {
    const { createStage } = await import('/rpg/battle/stage.js');
    const arena = document.querySelector('#arena');
    const stage = createStage(arena, { muted: true });
    window.runEffect = ({ role, action, reducedMotion }) => {
      const before = structuredClone(view);
      before.player.hero_class = before.battle.player.hero_class = role;
      const after = structuredClone(before);
      after.battle.enemy.hp -= 14;
      const incoming = action === 'burst' ? 5 : 0;
      after.player.hp -= incoming;
      after.battle.player.hp -= incoming;
      after.battle.last_event = {
        kind: 'hit', skill: action, correct: true, critical: false,
        damage_dealt: 14, damage_received: incoming, damage_blocked: 0,
        tactics: { encounter_id: 'willow_lock', intent: 'charge',
          broke_shield: action === 'guard', intercepted_charge: action === 'guard' },
      };
      stage.setPreferences({ muted: true, reducedMotion });
      stage.setView(before);
      window.done = false;
      window.contacts = [];
      stage.play({ before, after, action, onContact: (side) => window.contacts.push(side) })
        .then(() => { window.done = true; });
    };
    window.sampleEffect = () => {
      const canvas = arena.querySelector('.rpg-stage-canvas');
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      // Compare sampled frame silhouettes across moves without fixed screenshots or a GPU-specific palette.
      let ink = 0;
      for (let i = 3; i < data.length; i += 16) if (data[i] > 20) ink++;
      return { ink, done: window.done, number: arena.querySelector('.rpg-stage-numbers').textContent };
    };
  }, courseView);

  async function trace(role, action, reducedMotion = false) {
    await page.evaluate((opts) => window.runEffect(opts), { role, action, reducedMotion });
    const frames = [], labels = new Set();
    for (let i = 0; i < 40; i++) {
      await page.clock.runFor(80);
      const { ink, done, number } = await page.evaluate(() => window.sampleEffect());
      frames.push(ink);
      if (number) labels.add(number);
      if (done) break;
    }
    expect(await page.evaluate(() => window.done)).toBe(true);
    const arena = page.locator('#arena');
    await expect(arena.locator('.rpg-stage-technique')).toBeHidden();
    expect(await arena.locator('.rpg-stage-world, .rpg-stage-actor').evaluateAll(nodes =>
      nodes.every(node => !node.style.transform),
    )).toBe(true);
    expect(await page.evaluate(() => window.contacts)).toEqual(
      action === 'burst' ? ['foe', 'hero'] : ['foe'],
    );
    expect(frames.at(-1)).toBe(0);
    expect(Array.from(labels).join(' ')).toContain('14');
    return { frames, labels: Array.from(labels).join(' ') };
  }

  const attack = await trace('arcanist', 'strike');
  const parry = await trace('arcanist', 'guard');
  const signatures = [attack.frames, parry.frames];
  expect(parry.labels).toContain('破势');
  for (const hero of ['arcanist', 'ranger', 'vanguard']) {
    signatures.push((await trace(hero, 'burst')).frames);
  }
  for (const frames of signatures) {
    expect(frames.filter((ink) => ink > 0).length).toBeGreaterThan(2);
  }
  expect(new Set(signatures.map((frames) => frames.join(','))).size).toBe(signatures.length);
  const reduced = await trace('arcanist', 'guard', true);
  expect(reduced.labels).toContain('破势');
  expect(reduced.frames.every((ink) => ink === 0)).toBe(true);
});

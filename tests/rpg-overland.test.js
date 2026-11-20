import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMap, footpath, moveFeet, CELL, HEIGHT, WIDTH, ROWS, COLS } from '../public/rpg/world/overland-map.js';

const routes = [{ id: 'normal' }, { id: 'elite' }];

test('every regional keeper, mechanism, ghost ship, sentry and trap is reachable on foot', () => {
  const approaches = new Set();
  for (let i = 0; i < 8; i++) {
    const map = buildMap(i, routes);
    approaches.add([map.spawn.x,map.spawn.y,map.dots.site.x,map.dots.site.y].join('/'));
    for (const [name, contact] of Object.entries(map.dots)) {
      const feet = { ...map.spawn };
      const path = footpath(map, feet, contact);
      assert.ok(path.length, 'Missing path in region ' + i + ' to ' + name);
      for (const point of path) moveFeet(map, feet, point.x - feet.x, point.y - feet.y);
      assert.ok(
        Math.hypot(feet.x - contact.x, feet.y - contact.y) < 1,
        'Blocked path in region ' + i + ' to ' + name,
      );
    }
  }
  assert.equal(approaches.size, 8);
});

test('the swept footprint slides along buildings, stops at water, and crosses all bridges', () => {
  for (let i = 0; i < 8; i++) {
    const map = buildMap(i, routes);
    for (const b of map.bridges || []) {
      const mid = (b.top + b.bottom) / 2;
      const feet = { x: b.left + 1, y: mid };
      moveFeet(map, feet, b.right - b.left - 2, 0);
      assert.equal(Math.round(feet.x), b.right - 1);
      assert.ok(map.pass(feet.x, feet.y));
    }
    const obstacle = map.objects.find(o => o.type === (i ? 'monument' : 'station'));
    assert.ok(!map.pass(obstacle.x, obstacle.y - 7));
    const blocked = map.blockedTerrain || new Set(['water']);
    let samples = 0;
    for (let y = 1; y < ROWS - 1; y++) {
      const x = map.cells[y].findIndex((tile, col) => col > 1 && blocked.has(tile));
      if (x < 0) continue;
      assert.equal(map.pass((x + .5) * CELL, (y + .5) * CELL), false);
      samples++;
    }
    assert.ok(samples > 1);
    if (!i) {
      const along = {x:obstacle.x-16,y:obstacle.y+8};
      moveFeet(map,along,25,-19);
      assert.ok(along.x>obstacle.x && along.y>=obstacle.y+3 && map.pass(along.x,along.y));
    }
    assert.ok(!map.pass(-5, 40));
    assert.ok(!map.pass(WIDTH + 1, HEIGHT + 1));
  }
});

test('all eight maps connect the outer districts, field exit and four rotating encounter sites', () => {
  assert.ok(ROWS * COLS >= 2.5 * 68 * 46);
  const titles = new Set();
  for (let i = 0; i < 8; i++) {
    const dangerPositions = new Set();
    for (let scene = 0; scene < 4; scene++) {
      const map = buildMap(i, routes, {}, scene);
      if (i === 0) assert.equal(map.bridges.length, 5);
      assert.equal(map.landmarks.length, 3);
      assert.ok(map.landmarks.every((d) => d.name[0] && d.name[1] && d.description.every(Boolean)));
      map.landmarks.forEach((d) => titles.add(d.name[0]));
      const { normal, elite } = map.dots;
      assert.equal(elite.kind, 'trap');
      assert.ok(Math.hypot(normal.x - elite.x, normal.y - elite.y) > 60);
      dangerPositions.add(normal.x + ',' + normal.y);
      const escaping = { ...elite };
      const outpost = map.dots['north-post'];
      for (const p of footpath(map, escaping, outpost, [elite, normal]))
        moveFeet(map, escaping, p.x - escaping.x, p.y - escaping.y);
      assert.ok(Math.hypot(escaping.x - outpost.x, escaping.y - outpost.y) < 1, 'May pathfind away after dismissing a trap');
      for (const [name, dest] of Object.entries(map.dots)) {
        const avoid = [normal, elite].filter((d) => d !== dest);
        const feet = { ...map.spawn };
        for (const p of footpath(map, feet, dest, avoid)) moveFeet(map, feet, p.x - feet.x, p.y - feet.y);
        assert.ok(Math.hypot(dest.x - feet.x, dest.y - feet.y) < 1, `region ${i} scene ${scene} to ${name}`);
      }
    }
    assert.equal(dangerPositions.size, 4);
  }
  assert.equal(titles.size, 24);
});

test('each chapter has a distinct coastline, trail network and approach to its first objective', () => {
  const plans = Array.from({length:8}, (_, i) => buildMap(i, routes));
  const masks = plans.map(map => {
    const blocked = map.blockedTerrain || new Set(['water']);
    return map.cells.flat().map(tile => blocked.has(tile));
  });
  for (let i=1;i<plans.length;i++) for(let j=0;j<i;j++) {
    const different = masks[i].filter((a,k)=>a!==masks[j][k]).length / masks[i].length;
    assert.ok(different>.10, 'Walkable silhouettes are too similar: '+i+' / '+j+' ('+different+')');
  }
  assert.equal(plans[1].cells[55][55], 'water');
  assert.ok(plans[4].cells.some(row=>row.includes('wall')) && plans[4].objects.some(o=>o.type==='shelf'));
  assert.ok(plans[7].plan.orbits.length===2);
});

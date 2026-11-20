import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMap, footpath, moveFeet, CELL, HEIGHT, WIDTH, ROWS, COLS } from '../public/rpg/world/overland-map.js';

const routes = [{ id: 'normal' }, { id: 'elite' }];

test('every regional keeper, mechanism, ghost ship, sentry and trap is reachable on foot', () => {
  const approaches = new Set();
  for (let i = 0; i < 8; i++) {
    const map = buildMap(i, routes);
    approaches.add(map.spawn.x + ',' + map.spawn.y + '-' + map.bridges[1].top);
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
    for (const b of map.bridges) {
      const mid = (b.top + b.bottom) / 2;
      const feet = { x: b.left + 1, y: mid };
      moveFeet(map, feet, b.right - b.left - 2, 0);
      assert.equal(Math.round(feet.x), b.right - 1);
      assert.ok(map.pass(feet.x, feet.y));
    }
    const row = 3,
      river = map.cells[row].indexOf('water') * CELL,
      y = (row + 0.5) * CELL;
    const feet = { x: river - 8, y };
    if (map.pass(feet.x, y)) {
      moveFeet(map, feet, 3 * CELL, 0);
      assert.ok(feet.x < river);
    }
    const house = map.objects.find((o) => o.type === 'station');
    assert.ok(!map.pass(house.x, house.y - 10));
    const along = { x: house.x - 16, y: house.y + 8 };
    assert.ok(map.pass(along.x, along.y));
    moveFeet(map, along, 25, -19);
    assert.ok(along.x > house.x);
    assert.ok(along.y >= house.y + 3 && map.pass(along.x, along.y));
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
      assert.equal(map.bridges.length, 5);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arcVelocity,
  COURT,
  createCourtPhysics,
  layoutHoops,
  STEP,
} from '../public/matching/physics.js';

const hoops = layoutHoops(['A', 'B', 'C', 'D'].map((id) => ({ id, text: id })));
function launch(origin, speed) {
  const scored = [],
    hits = [],
    missed = [];
  const court = createCourtPhysics(hoops, {
    onBasket: (id) => scored.push(id),
    onMiss: () => missed.push(true),
    onImpact: (surface) => hits.push(surface),
  });
  court.shoot(origin, speed);
  for (let i = 0; i < 8 / STEP; i++) court.step();
  return { scored, hits, missed };
}
test('the assisted throw physically clears each of four rims from either side of the court', () => {
  for (const h of hoops)
    for (const from of [
      { x: 0, y: 1.51, z: 3.1 },
      { x: -5.6, y: 1.66, z: 2.8 },
      { x: 5.4, y: 1.72, z: 5.1 },
    ]) {
      const run = launch(from, arcVelocity(from, h));
      assert.deepEqual(run.scored, [h.id]);
      assert.deepEqual(run.missed, []);
    }
});
test('the ball must descend through the ring; passing upward alone gives no goal', () => {
  const hoop = hoops[1];
  const events = [];
  const physics = createCourtPhysics(hoops, { onBasket: (id) => events.push(id) });
  physics.shoot({ x: hoop.x, y: 2.65, z: hoop.z }, { x: 0, y: 5.5, z: 0 });
  for (let i = 0; i < 0.55 / STEP; i++) physics.step();
  assert.deepEqual(events, []);
  physics.recall();
  for (let i = 0; i < 2 / STEP; i++) physics.step();
  assert.deepEqual(events, []);
});
test('metal rim, glass board and parquet are independent colliders; a miss returns once', () => {
  const h = hoops[1];
  const rim = launch({ x: h.x + COURT.rimRadius, y: 4.2, z: h.z }, { x: 0, y: -2, z: 0 });
  assert.ok(rim.hits.includes('rim'));
  const board = launch({ x: h.x + 0.52, y: 3.55, z: h.z + 0.65 }, { x: 0, y: 1.8, z: -7 });
  assert.ok(board.hits.includes('board'));
  assert.ok(board.hits.includes('floor'));
  assert.deepEqual(board.scored, []);
  assert.equal(board.missed.length, 1);
});

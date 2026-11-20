import test from 'node:test';
import assert from 'node:assert/strict';
import { projectGuide } from '../public/rpg/world/wayfinder.js';

test('the quest arrow follows the camera and pins the destination when it comes into view', () => {
  const frame = { feet: {x: 100, y: 140}, camera: {x: 0, y: 0}, canvasWidth: 400, canvasHeight: 300 };
  const target = {x: 550, y: 120};
  const first = projectGuide(frame, target, 800, 600);
  assert.equal(first.mode, 'edge');
  assert.equal(first.x, 758);
  assert.ok(first.angle < 0);
  frame.feet = {x: 400, y: 150};
  frame.camera = {x: 240, y: 0};
  const next = projectGuide(frame, target, 800, 600);
  assert.equal(next.mode, 'pin');
  assert.equal(next.x, 620);
  assert.ok(next.distance < first.distance);
});

test('edge directions and labels fit portrait and landscape screens at map boundaries', () => {
  for (const [width, height] of [[320, 568], [844, 390]]) {
    for (const [x, y] of [[-150, -140], [2000, 0], [25, 1200], [0, -300]]) {
      const v = projectGuide({feet:{x:5,y:3}, camera:{x:0,y:0}, canvasWidth:390, canvasHeight:210}, {x,y}, width, height);
      assert.equal(v.mode, 'edge');
      assert.ok(v.x > 15 && v.x < width - 15 && v.y > 20 && v.y < height - 20);
      assert.ok(Number.isFinite(v.angle));
    }
  }
});

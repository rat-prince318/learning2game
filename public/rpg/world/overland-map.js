// Coordinates are in map pixels. Actors stand at x/y with their feet on the ground.
import { buildChapterMap } from './chapter-map.js';
import { landmarksFor } from './overland-districts.js';

import { CELL, COLS, ROWS, noise, worldPoint, collisionTest } from './overland-grid.js';
export { CELL, COLS, ROWS, WIDTH, HEIGHT, noise, clamp } from './overland-grid.js';

export function buildMap(region, routes = [], marks = {}, scene = 0) {
  if (region > 0) return buildChapterMap(region, routes, scene);
  const cross = 24, upper = 11;
  const [sx, sy] = [16, 24], [lx, ly] = [24, 17];
  const [ex, ey] = [48, 25], [tx, ty] = [55, 12];
  const seed = 1;
  const cells = Array.from({ length: ROWS }, () => Array(COLS).fill('grass'));
  const objects = [],
    reefs = [],
    solids = [];
  const center = (y) =>
    34 + Math.round(Math.sin(y * 0.165) * 2 + Math.sin(y * 0.32) * 1.4);
  const easternStream = (y) =>
    73 + Math.round(Math.sin(y * 0.086) * 5 + Math.sin(y * 0.21) * 1.8);
  const landmarks = landmarksFor(0);
  const [south, north, east] = landmarks;
  // Reed beds frame the lane from the woods to the river wharf.
  const parcels = [
    [south.col, south.row - 1, 11, 6],
    [north.col, north.row + 1, 10, 7],
    [east.col - 3, east.row + 1, 13, 8],
    [54, 42, 7, 4],
  ];
  const eastCross = cross + 2;
  const southCross = south.row - 6;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const river = Math.abs(x - center(y)) <= 3;
      const stream = Math.abs(x - easternStream(y)) <= 2;
      if (river || stream) cells[y][x] = 'water';
      else if (parcels.some(([ox, oy, rx, ry]) =>
        ((x - ox) / rx) ** 2 + ((y - oy) / ry) ** 2 < 1 + 0.16 * Math.sin(y * 0.81))) {
        cells[y][x] = 'reedbed';
      }
    }
  function tile(x, y, kind) {
    if (cells[y]?.[x] && cells[y][x] !== 'water') cells[y][x] = kind;
  }
  function road(x1, y1, x2, y2, radius = 1) {
    const steps = Math.max(Math.abs(y2 - y1), Math.abs(x2 - x1));
    for (let i = 0; i <= steps; i++) {
      const a = steps ? i / steps : 0,
        x = Math.round(x1 + (x2 - x1) * a),
        y = Math.round(y1 + (y2 - y1) * a);
      for (let dx = -radius; dx <= radius; dx++)
        for (let dy = -radius; dy <= radius; dy++)
          if (dx * dx + dy * dy <= radius * radius + 1) tile(x + dx, y + dy, 'road');
    }
  }
  road(5, cross, 60, cross);
  road(12, cross, 12, upper);
  road(12, upper, 58, upper);
  road(lx, cross, lx, ly);
  road(46, cross, ex, ey);
  road(54, cross, 54, ty);
  road(54, ty, tx, ty);
  road(sx, cross, sx, sy - 4);
  road(14, cross, 11, 35);
  road(11, 35, 25, 35);
  road(25, 35, 25, cross);
  const trail = (...waypoints) => {
    for (let i = 1; i < waypoints.length; i++) road(...waypoints[i - 1], ...waypoints[i]);
  };
  // Outer neighborhoods have two approaches. Returning from one does not
  // require retracing the entire outward leg.
  trail([11, 35], [8, south.row - 6], [south.col, south.row], [25, southCross], [49, southCross]);
  trail([25, 35], [27, southCross - 4], [25, southCross]);
  trail([46, cross], [46, 36], [53, 42], [49, southCross], [56, 63], [66, 62]);
  trail([55, upper], [62, upper - 3], [66, eastCross], [85, eastCross], [north.col, north.row]);
  trail([55, cross], [62, cross + 4], [66, eastCross]);
  trail([66, eastCross], [61, 39], [66, east.row], [86, east.row], [east.col, east.row]);
  trail([49, southCross], [60, southCross + 3], [66, east.row], [66, 62]);
  trail([north.col, north.row], [104, north.row + 5], [103, 35], [east.col, east.row]);
  trail([85, eastCross], [87, 34], [84, east.row - 4], [86, east.row]);
  trail([east.col, east.row], [99, 62], [87, 63], [86, east.row]);
  const bridges = [];
  for (const [row, middle] of [[cross, center], [upper, center], [southCross, center],
    [eastCross, easternStream], [east.row, easternStream]]) {
    let lo = COLS,
      hi = 0;
    for (let y = row - 1; y <= row + 1; y++)
      for (let x = middle(y) - 6; x <= middle(y) + 6; x++)
        if (cells[y][x] === 'water') {
          lo = Math.min(lo, x);
          hi = Math.max(hi, x);
        }
    lo--;
    hi++;
    bridges.push({
      left: lo * CELL,
      right: (hi + 1) * CELL,
      top: (row - 1) * CELL,
      bottom: (row + 2) * CELL,
    });
    for (let y = row - 1; y <= row + 1; y++) for (let x = lo; x <= hi; x++) cells[y][x] = 'bridge';
  }
  // The ferry berth juts into the river and reaches the hull on foot.
  const berthY = cross + 6,
    berthLeft = center(berthY) - 6,
    berthEnd = center(berthY);
  road(25, cross + 6, berthLeft, berthY);
  for (let y = berthY - 1; y <= berthY; y++)
    for (let x = berthLeft; x <= berthEnd; x++) cells[y][x] = 'dock';
  function object(type, x, y, w, h, foundation, variant = 0) {
    const p = worldPoint(x, y);
    objects.push({ ...p, type, w, h, variant });
    if (foundation) {
      const [fw, fh] = foundation;
      solids.push({ x: p.x - fw / 2, y: p.y - fh, w: fw, h: fh });
    }
  }
  const dots = {
    keeper: { ...worldPoint(sx + 2, sy - 0.4), kind: 'keeper' },
    site: { ...worldPoint(lx, ly), kind: 'site' },
    ship: { ...worldPoint(berthEnd - 0.4, berthY), kind: 'ship' },
  };
  const battleSites = [
    [[ex, ey], [tx, ty]],
    [[east.col - 6, east.row], [north.col - 2, north.row + 1]],
    [[north.col, north.row + 4], [south.col + 6, south.row + 1]],
    [[south.col + 5, southCross], [east.col, east.row + 5]],
  ];
  function encounterSpot(stage, routeId) {
    if (!['normal', 'elite', 'boss_steady', 'boss_daring'].includes(routeId)) return null;
    const lane = routeId === 'elite' || routeId === 'boss_daring' ? 1 : 0;
    return worldPoint(...battleSites[stage % battleSites.length][lane]);
  }
  for (const route of routes) {
    const kind = route.risk === 'elite' || route.id === 'elite' ? 'trap' : 'enemy';
    dots[route.id] = { ...encounterSpot(scene, route.id), kind, encounter: route.encounter_id };
  }
  for (const spot of landmarks) {
    dots[spot.key] = { ...worldPoint(spot.col, spot.row), kind: 'landmark' };
    road(spot.col - 4, spot.row, spot.col + 4, spot.row);
    road(spot.col - 2, spot.row + 2, spot.col + 2, spot.row + 2);
    object('landmark', spot.col, spot.row - 0.75, 66, 48, [34, 9], spot.motif);
    object('lantern', spot.col - 2, spot.row + 0.5, 10, 26, [5, 4]);
  }
  object('station', sx + 1, sy - 3.4, 96, 95, [68, 23], 0);
  object('house', 5.8, cross - 3.8, 53, 53, [39, 18], 1);
  object('house', 8, cross + 9.5, 54, 58, [38, 18], 0);
  object('house', 43, upper - 3.1, 54, 50, [39, 18], 0);
  object('station', 56, cross + 9.3, 67, 66, [46, 17], 5);
  object('prop', sx - 6, sy - 2.7, 46, 47, [21, 10], 4);
  object('prop', sx + 5.1, sy - 2.6, 25, 25, [11, 6], 7);
  object('prop', sx - 3.7, sy - 3.8, 58, 62, [7, 5], 1);
  object('prop', sx + 3.9, sy - 4.4, 20, 17, [6, 4], 9);
  object('prop', sx + 6.7, sy + 3.4, 40, 45, [7, 5], 0);
  object('prop', sx - 4.6, sy + 3.5, 23, 19, [8, 4], 9);
  object('prop', lx - 2, ly - 1.3, 34, 31, [18, 8], 6);
  object('prop', 42, cross - 2.3, 45, 54, null, 11);
  object('prop', 10, 33, 37, 33, [20, 7], 10);
  object('prop', 53, upper + 2.5, 36, 33, [18, 7], 6);
  object('prop', berthLeft - 0.9, berthY + 1.2, 25, 21, [10, 4], 10);
  for (let yy = 2; yy < ROWS - 2; yy += 3) {
    const xx = center(yy) - 4.4;
    if (
      Math.abs(yy - cross) < 3 ||
      Math.abs(yy - upper) < 3 ||
      Math.abs(yy - berthY) < 2
    )
      continue;
    object('prop', xx, yy, 22, 22, null, 8);
  }
  object('war-post', 44.2, cross + 4.8, 45, 54, [24, 10], 0);
  // Give the junctions between town and the outer sites recognizable silhouettes.
  // The landmarks themselves remain clear on both sides for walking past them.
  object('war-post', 62, eastCross - 2.8, 51, 55, [18, 9], 0);
  object('house', 48, southCross - 2.8, 47, 49, [29, 12], 1);
  object('prop', 61, 41, 43, 42, [21, 11], 4);
  object('house', 102.6, 38, 49, 55, [31, 11], 0);
  object('war-post', 85.5, 60.5, 38, 36, [19, 9], 1);
  for (const [x, y] of [[26, southCross - 1.7], [43, southCross - 1.7], [65, eastCross - 1.7],
    [84, eastCross - 1.7], [66, east.row - 1.7], [84, east.row - 1.7]]) {
    object('lantern', x, y, 10, 26, [5, 4]);
  }
  // Equipment around the mill, lookout and wharf reflects the work done there.
  const yards = {
    wheel: [['house', -4, -2.1, 47, 49, 0], ['prop', 3.2, 2.8, 38, 32, 7], ['prop', -3.8, 3.6, 37, 40, 0]],
    beacon: [['war-post', 4.3, -2.0, 43, 46, 0], ['prop', -2.9, 2.9, 33, 25, 10], ['prop', -4.4, -2.8, 48, 51, 1]],
    wharf: [['works', -3.4, -1.7, 44, 29, 'rack'], ['prop', 3.1, -2.8, 54, 44, 10], ['works', -3.3, 2.8, 37, 22, 'cart']],
  };
  for (const spot of landmarks) {
    for (const [type, dx, dy, w, h, variant] of yards[spot.motif]) {
      object(type, spot.col + dx, spot.row + dy, w, h, [Math.floor(w * 0.48), 6], variant);
    }
  }
  if (marks.willow_ferry === 'ferry_child')
    object('war-post', 25.4, 33.6, 51, 49, [27, 12], 1);
  object('mechanism', lx, ly - 0.75, 30, 34, [15, 7], 0);
  object('ship', berthEnd + 2.6, berthY + 0.7, 88, 58, null);
  for (const [x, y] of [
    [sx - 2, sy - 2.2],
    [lx + 1.6, ly],
    [25, cross - 1.5],
    [43, cross - 1.5],
    [53, upper - 1.6],
    [9, 34],
    [52, cross + 4],
  ]) {
    object('lantern', x, y, 10, 26, [5, 4]);
  }
  for (const bridge of bridges) {
    const by = bridge.top + 1;
    for (let xx = bridge.left + 3; xx < bridge.right; xx += 24)
      objects.push({ x: xx, y: by, type: 'rail', w: 24, h: 9, variant: 0 });
    for (let xx = bridge.left + 3; xx < bridge.right; xx += 24)
      objects.push({ x: xx, y: bridge.bottom - 1, type: 'rail', w: 24, h: 9, variant: 0 });
  }
  // Both sides of the paddock have openings onto the lane.
  for (let xx = 15; xx <= 22; xx++) {
    object('fence', xx, 32, 16, 12, [15, 4]);
    if (xx !== 19 && xx !== 20) object('fence', xx, 36.7, 16, 12, [15, 4]);
  }
  for (let yy = 33; yy < 36; yy++)
    for (let xx = 16; xx <= 21; xx++) object('crop', xx, yy, 13, 13, null, (xx + yy) % 3);
  const scenery = [...objects];
  // The landscape stays fixed when a defeated patrol disappears or the next
  // encounter moves to another district. Keep every possible landing clear.
  const clearings = [...Object.values(dots), ...battleSites.flat().map(([x, y]) => worldPoint(x, y))];
  for (let x = 0; x < COLS; x++)
    for (let y = 0; y < ROWS; y++) {
      if (cells[y][x] !== 'grass') continue;
      const r = noise(x, y, seed),
        cluster = Math.sin(x * 0.33 + seed) + Math.cos(y * 0.48) + Math.sin((x + y) * 0.18);
      const forest = x < 4 || y < 3 || x > COLS - 5 || y > ROWS - 5 || cluster > 0.78;
      if (!forest || r > 0.2 || cells[y].slice(Math.max(0, x - 1), x + 2).includes('road')) continue;
      const p = worldPoint(x, y);
      const clear =
        clearings.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 54) ||
        scenery.some(
          (o) =>
            o.type !== 'tree' &&
            Math.abs(o.x - p.x) < o.w * 0.55 + 11 &&
            Math.abs(o.y - p.y) < o.h * 0.55 + 5,
        ) ||
        Math.hypot(p.x - (sx + 0.5) * CELL, p.y - (sy + 0.5) * CELL) < 52;
      if (clear) continue;
      const w = 35 + Math.round(r * 59),
        h = w * 1.23;
      object('tree', x, y, w, h, [7, 5], Math.floor(noise(y, x, seed) * 3));
    }
  for (let y = 2; y < ROWS - 2; y += 2)
    for (let x = 2; x < COLS - 2; x += 2) {
      if (cells[y][x] === 'water' && noise(x, y, seed) > 0.66) reefs.push(worldPoint(x, y));
    }
  const spawn = worldPoint(sx, sy);
  return { region, cells, objects, reefs, dots, bridges, landmarks, spawn, pass:collisionTest(cells, solids), encounterSpot };
}
export function moveFeet(map, p, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 3));
  for (let i = 0; i < steps; i++) {
    if (map.pass(p.x + dx / steps, p.y)) p.x += dx / steps;
    if (map.pass(p.x, p.y + dy / steps)) p.y += dy / steps;
  }
}
export function footpath(map, from, to, avoid = []) {
  const code = (x, y) => y * COLS + x,
    point = (i) => worldPoint(i % COLS, Math.floor(i / COLS));
  const initial = code(Math.floor(from.x / CELL), Math.floor(from.y / CELL));
  const queue = [initial],
    previous = new Int32Array(COLS * ROWS).fill(-2);
  previous[initial] = -1;
  let closest = initial,
    best = Infinity;
  for (let a = 0; a < queue.length; a++) {
    const cell = queue[a],
      p = point(cell),
      distance = Math.hypot(to.x - p.x, to.y - p.y);
    if (distance < best) {
      closest = cell;
      best = distance;
      if (distance < 9) break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]) {
      const nx = (cell % COLS) + dx,
        ny = Math.floor(cell / COLS) + dy,
        next = code(nx, ny);
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || previous[next] !== -2) continue;
      const q = point(next);
      if (
        !map.pass(q.x, q.y) ||
        !map.pass((q.x + p.x) / 2, (q.y + p.y) / 2) ||
        avoid.some((o) => {
          const nextDistance = Math.hypot(o.x - q.x, o.y - q.y);
          return nextDistance < 28 && nextDistance <= Math.hypot(o.x - p.x, o.y - p.y);
        })
      )
        continue;
      previous[next] = cell;
      queue.push(next);
    }
  }
  const path = [];
  for (let i = closest; i !== initial; i = previous[i]) path.push(point(i));
  path.reverse();
  if (best <= CELL && map.pass(to.x, to.y)) path.push({ ...to });
  return path;
}

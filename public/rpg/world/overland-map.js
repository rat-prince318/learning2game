// Coordinates are in map pixels. Actors stand at x/y with their feet on the ground.
export const CELL = 16;
export const COLS = 68;
export const ROWS = 46;
export const WIDTH = COLS * CELL;
export const HEIGHT = ROWS * CELL;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function noise(x, y, seed = 0) {
  let h = Math.imul(x + 713, 374761393) + Math.imul(y + seed * 331, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const layouts = [
  [24, 11, 16, 24, 24, 17, 48, 25, 55, 12],
  [29, 13, 14, 29, 25, 20, 52, 29, 47, 10],
  [23, 9, 17, 23, 24, 14, 49, 24, 55, 13],
  [27, 15, 15, 27, 23, 17, 48, 26, 54, 11],
  [24, 13, 16, 24, 25, 17, 47, 24, 53, 13],
  [26, 12, 16, 26, 25, 14, 48, 27, 54, 11],
  [25, 14, 14, 25, 23, 18, 48, 24, 55, 12],
  [22, 12, 16, 22, 24, 15, 49, 22, 53, 11],
];
const worldPoint = (x, y) => ({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL });
export function buildMap(region, routes = [], marks = {}) {
  const [cross, upper, sx, sy, lx, ly, ex, ey, tx, ty] = layouts[region] || layouts[0];
  const seed = region + 1;
  const cells = Array.from({ length: ROWS }, () => Array(COLS).fill('grass'));
  const objects = [],
    reefs = [],
    solids = [];
  const center = (y) =>
    34 + Math.round(Math.sin(y * 0.165 + region * 0.8) * 2 + Math.sin(y * 0.32 + region) * 1.4);
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const river = Math.abs(x - center(y)) <= (region === 1 ? 4 : 3);
      if (river) cells[y][x] = 'water';
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
  const bridges = [];
  for (let row of [cross, upper]) {
    let lo = COLS,
      hi = 0;
    for (let y = row - 1; y <= row + 1; y++)
      for (let x = 0; x < COLS; x++)
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
  if (region === 0)
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
    ...(region === 0 ? { ship: { ...worldPoint(berthEnd - 0.4, berthY), kind: 'ship' } } : {}),
  };
  if (routes[0])
    dots[routes[0].id] = { ...worldPoint(ex, ey), kind: 'enemy', encounter: routes[0].encounter_id };
  if (routes[1]) dots[routes[1].id] = { ...worldPoint(tx, ty), kind: 'trap' };
  object('station', sx + 1, sy - 3.4, 96, 95, [68, 23], region);
  object('house', 5.8, cross - 3.8, 53, 53, [39, 18], 1);
  object('house', 8, cross + 9.5, 54, 58, [38, 18], 0);
  object('house', 43, upper - 3.1, 54, 50, [39, 18], region % 2);
  object('station', 56, cross + 9.3, 67, 66, [46, 17], (region + 5) % 8);
  const treeStyle = [0, 0, 3, 3, 1, 2, 3, 2][region];
  const market = [
    [4, -6, -2.7, 46, 47],
    [10, -4.8, 3.7, 46, 39],
    [7, -5.0, -2.7, 42, 40],
    [4, -6, -2.7, 46, 47],
    [5, -5.2, -2.5, 45, 44],
    [10, -6, 3.3, 41, 35],
    [6, -5.2, -3.6, 42, 39],
    [11, -5.4, -2.2, 46, 54],
  ][region];
  object(
    'prop',
    sx + market[1],
    sy + market[2],
    market[3],
    market[4],
    [region === 7 ? 8 : 21, 10],
    market[0],
  );
  object(
    'prop',
    sx + 5.1,
    sy - 2.6,
    25,
    25,
    [11, 6],
    region === 0 || region === 2 ? 7 : region === 3 ? 9 : 10,
  );
  const framing = [1, 0, 3, 3, 1, 2, 3, 2][region];
  if (region !== 2 && region !== 7) object('prop', sx - 3.7, sy - 3.8, 58, 62, [7, 5], framing);
  if (region === 2) object('war-post', sx - 3.7, sy - 3.8, 48, 55, [12, 7], 0);
  if (region === 7) object('war-post', sx - 3.7, sy - 4.5, 38, 48, [10, 8], 2);
  object('prop', sx + 3.9, sy - 4.4, 20, 17, [6, 4], 9);
  object('prop', sx + 6.7, sy + 3.4, 40, 45, [7, 5], treeStyle);
  object('prop', sx - 4.6, sy + 3.5, 23, 19, [8, 4], 9);
  object('prop', lx - 2, ly - 1.3, 34, 31, [18, 8], region === 0 ? 6 : 5);
  object('prop', 42, cross - 2.3, 45, 54, null, 11);
  object('prop', 10, 33, 37, 33, [20, 7], 10);
  object('prop', 53, upper + 2.5, 36, 33, [18, 7], region === 2 ? 7 : 6);
  if (region === 0) object('prop', berthLeft - 0.9, berthY + 1.2, 25, 21, [10, 4], 10);
  for (let yy = 2; yy < ROWS - 2; yy += 3) {
    const xx = center(yy) - 4.4;
    if (
      Math.abs(yy - cross) < 3 ||
      Math.abs(yy - upper) < 3 ||
      (region === 0 && Math.abs(yy - berthY) < 2)
    )
      continue;
    object('prop', xx, yy, 22, 22, null, 8);
  }
  if ([0, 2, 5].includes(region)) object('war-post', 44.2, cross + 4.8, 45, 54, [24, 10], 0);
  if (region === 3 || (region === 0 && marks.willow_ferry === 'ferry_child'))
    object('war-post', 25.4, 33.6, 51, 49, [27, 12], 1);
  if (region === 7 || region === 4) object('war-post', lx + 4.2, ly - 1.2, 45, 53, [20, 10], 2);
  object('mechanism', lx, ly - 0.75, 30, 34, [15, 7], region);
  if (region === 0) object('ship', berthEnd + 2.6, berthY + 0.7, 88, 58, null);
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
  // Crops and fence leave openings where a path enters the paddock.
  for (let xx = 15; xx <= 22; xx++) {
    object('fence', xx, 32, 16, 12, [15, 4]);
    if (xx !== 19 && xx !== 20) object('fence', xx, 36.7, 16, 12, [15, 4]);
  }
  for (let yy = 33; yy < 36; yy++)
    for (let xx = 16; xx <= 21; xx++) object('crop', xx, yy, 13, 13, null, (xx + yy + region) % 3);
  for (let x = 0; x < COLS; x++)
    for (let y = 0; y < ROWS; y++) {
      if (cells[y][x] !== 'grass') continue;
      const r = noise(x, y, seed),
        cluster = Math.sin(x * 0.33 + seed) + Math.cos(y * 0.48) + Math.sin((x + y) * 0.18);
      const forest = x < 4 || y < 3 || x > COLS - 5 || y > ROWS - 5 || cluster > 0.78;
      if (!forest || r > 0.2 || cells[y].slice(Math.max(0, x - 1), x + 2).includes('road')) continue;
      const p = worldPoint(x, y);
      const clear =
        Object.values(dots).some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 54) ||
        objects.some(
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
  function water(x, y) {
    return cells[Math.floor(y / CELL)]?.[Math.floor(x / CELL)] === 'water';
  }
  function pass(x, y) {
    if (x < 12 || x > WIDTH - 12 || y < 16 || y > HEIGHT - 9) return false;
    for (const dx of [-4, 4]) for (const dy of [-4, 1]) if (water(x + dx, y + dy)) return false;
    return !solids.some((o) => x + 4 > o.x && x - 4 < o.x + o.w && y + 1 > o.y && y - 4 < o.y + o.h);
  }
  return { region, cells, objects, reefs, dots, bridges, spawn, pass };
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
        avoid.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 28)
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

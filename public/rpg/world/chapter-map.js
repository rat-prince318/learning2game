import { chapters } from './chapter-plans.js';
import { landmarksFor } from './overland-districts.js';
import { CELL, COLS, ROWS, worldPoint, collisionTest, noise } from './overland-grid.js';

const blockedTerrain = new Set(['water', 'cliff', 'void', 'wall']);

export function buildChapterMap(region, routes, scene) {
  const plan = chapters[region];
  const cells = Array.from({ length: ROWS }, () => Array(COLS).fill(plan.base));
  const objects = [],
    reefs = [],
    solids = [];
  function paint(x, y, kind) {
    if (x >= 0 && x < COLS && y >= 0 && y < ROWS) cells[y][x] = kind;
  }
  function ellipse([cx, cy, a, b], kind) {
    for (let y = cy - b; y <= cy + b; y++)
      for (let x = cx - a; x <= cx + a; x++)
        if (((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1) paint(x, y, kind);
  }
  for (const bank of plan.banks || []) ellipse(bank, plan.floor);
  for (const pool of plan.pools || []) ellipse(pool, 'water');
  for (const [left, top, right, bottom] of plan.rooms || [])
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) paint(x, y, plan.floor);
  const underlay = cells.map((row) => [...row]);
  const laneCenters = [];
  function connectingLane(a, b, radius = 1) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(a[0] + ((b[0] - a[0]) * i) / steps),
        y = Math.round(a[1] + ((b[1] - a[1]) * i) / steps);
      laneCenters.push([x, y]);
      for (let yy = y - radius; yy <= y + radius; yy++)
        for (let xx = x - radius; xx <= x + radius; xx++)
          paint(xx, yy, blockedTerrain.has(underlay[yy]?.[xx]) ? plan.crossing : plan.lane);
    }
  }
  const paths = plan.trails.map((row) => [...row]);
  for (const [cx, cy, a, b] of plan.orbits || []) {
    const ring = [];
    for (let i = 0; i <= 64; i++)
      ring.push([cx + a * Math.cos((i * Math.PI) / 32), cy + b * Math.sin((i * Math.PI) / 32)]);
    paths.push(ring);
  }
  for (const path of paths) for (let i = 1; i < path.length; i++) connectingLane(path[i - 1], path[i]);
  const landmarks = landmarksFor(region);
  const spawn = worldPoint(...plan.spawn);
  const dots = {
    keeper: { ...worldPoint(...plan.keeper), kind: 'keeper' },
    site: { ...worldPoint(...plan.site), kind: 'site' },
    ship: { ...worldPoint(...plan.exit), kind: 'ship' },
  };
  const allStops = [plan.spawn, plan.keeper, plan.site, plan.exit, ...plan.landmarks, ...plan.arenas.flat()];
  for (const [x, y] of allStops) {
    if (blockedTerrain.has(cells[y][x])) {
      const nearest = laneCenters.reduce((best, p) =>
        Math.hypot(p[0] - x, p[1] - y) < Math.hypot(best[0] - x, best[1] - y) ? p : best,
      );
      connectingLane(nearest, [x, y]);
    }
  }
  function encounterSpot(stage, id) {
    if (!['elite', 'normal', 'boss_steady', 'boss_daring'].includes(id)) return null;
    return worldPoint(
      ...plan.arenas[stage % plan.arenas.length][id === 'elite' || id === 'boss_daring' ? 1 : 0],
    );
  }
  for (const route of routes)
    dots[route.id] = {
      ...encounterSpot(scene, route.id),
      kind: route.risk === 'elite' || route.id === 'elite' ? 'trap' : 'enemy',
      encounter: route.encounter_id,
    };
  function scenery(type, x, y, w, h, variant = 0, foundation) {
    const p = worldPoint(x, y);
    objects.push({ ...p, type, w, h, variant });
    if (foundation)
      solids.push({ x: p.x - foundation[0] / 2, y: p.y - foundation[1], w: foundation[0], h: foundation[1] });
  }
  for (const [slot, x, y, w, h] of plan.monuments) scenery('monument', x, y, w, h, slot, [w * 0.48, 12]);
  const structures = new Set(['fittings', 'house', 'station', 'war-post', 'fence']);
  for (const [type, x, y, w, h, variant] of plan.decor) {
    const foundation = structures.has(type)
      ? [Math.max(6, Math.round(w * 0.48)), Math.max(3, Math.round(h * 0.14))]
      : null;
    scenery(type, x, y, w, h, variant, foundation);
  }
  for (const d of landmarks) {
    dots[d.key] = { ...worldPoint(d.col, d.row), kind: 'landmark' };
    scenery('landmark', d.col, d.row - 1, 58, 43, d.motif, [26, 6]);
  }
  scenery('mechanism', plan.site[0], plan.site[1] - 1, 32, 36, region, [15, 6]);
  scenery('war-post', plan.exit[0] + 1.8, plan.exit[1] - 1, 36, 42, region === 7 ? 2 : 0);
  // Prop clusters stay on the surrounding land, clear of travel lanes and NPCs.
  for (let y = 3; y < ROWS - 3; y += 2)
    for (let x = 3; x < COLS - 3; x += 2) {
      const v = noise(x, y, region * 7);
      if (cells[y][x] === 'water' && v > 0.82) reefs.push(worldPoint(x, y));
      if (
        cells[y][x] !== plan.floor ||
        v > 0.27 ||
        allStops.some((p) => Math.hypot(x - p[0], y - p[1]) < 4) ||
        objects.some(
          (p) => Math.abs(p.x - (x + 0.5) * CELL) < p.w * 0.57 + 9 && Math.abs(p.y - (y + 0.5) * CELL) < 17,
        )
      )
        continue;
      if (region === 1 && v < 0.06) {
        if (y < 32) scenery('works', x, y, 19 + v * 80, 13, 'salt');
        else if (v < 0.035) scenery('prop', x, y, 26, 22, 10);
      }
      if (region === 2 && v < 0.14) {
        if (v < 0.035) scenery('fittings', x, y, 30, 23, 1);
        else scenery('works', x, y, 22 + v * 48, 16, v < 0.08 ? 'ore' : 'cart');
      }
      if (region === 3) scenery('crop', x, y, 18, 20, (x + y) % 3);
      if (region === 4) scenery('shelf', x, y, 43, 29, (x + y) % 3, [27, 6]);
      if (region === 5 && v < 0.19) {
        if (v < 0.035) scenery('fittings', x, y, 30, 30, 4);
        else scenery(v < 0.08 ? 'works' : 'prop', x, y, 32, 39, v < 0.08 ? 'cairn' : 2);
      }
      if (region === 6 && v < 0.13) {
        if (v < 0.035) scenery('fittings', x, y, 40, 50, 5, [20, 6]);
        else if (v < 0.08) scenery('house', x, y, 44, 46, (x + y) % 2, [21, 7]);
        else scenery('prop', x, y, 36, 39, (x + y) % 2 ? 1 : 4);
      }
      if (region === 7 && v < 0.12) scenery('works', x, y, 22, 18, 'dial');
    }
  return {
    region,
    version: 'district-' + region + '-1',
    cells,
    objects,
    reefs,
    dots,
    landmarks,
    spawn,
    paths,
    plan,
    blockedTerrain,
    encounterSpot,
    pass: collisionTest(cells, solids, blockedTerrain),
  };
}

export const CELL = 16;
export const COLS = 112;
export const ROWS = 72;
export const WIDTH = COLS * CELL;
export const HEIGHT = ROWS * CELL;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function noise(x, y, seed = 0) {
  let h = Math.imul(x + 713, 374761393) + Math.imul(y + seed * 331, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export const worldPoint = (x, y) => ({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL });
export function collisionTest(cells, solids, blockedTerrain = new Set(['water'])) {
  // A walk-to command checks thousands of tile edges. Index foundations so
  // those checks stay local even in the denser neighborhoods.
  const footprints = new Map();
  for (const rect of solids) {
    for (let y = Math.floor((rect.y - 1) / CELL); y <= Math.floor((rect.y + rect.h + 4) / CELL); y++)
      for (let x = Math.floor((rect.x - 4) / CELL); x <= Math.floor((rect.x + rect.w + 4) / CELL); x++) {
        const slot = y * COLS + x;
        if (!footprints.has(slot)) footprints.set(slot, []);
        footprints.get(slot).push(rect);
      }
  }
  function blocked(x, y) {
    return blockedTerrain.has(cells[Math.floor(y / CELL)]?.[Math.floor(x / CELL)]);
  }
  function pass(x, y) {
    if (x < 12 || x > WIDTH - 12 || y < 16 || y > HEIGHT - 9) return false;
    for (const dx of [-4, 4]) for (const dy of [-4, 1]) if (blocked(x + dx, y + dy)) return false;
    const near = footprints.get(Math.floor(y / CELL) * COLS + Math.floor(x / CELL));
    return !near?.some((o) => x + 4 > o.x && x - 4 < o.x + o.w && y + 1 > o.y && y - 4 < o.y + o.h);
  }
  return pass;
}

// District floor treatments are baked once. Moving lights, gulls and steam are
// drawn in world space so they stay attached to the harbor or workshop.
const masonry = {
  quay: ['#b8b0a0', '#d4c9a9', '#988f84'],
  mosaic: ['#848590', '#b1a99a', '#606575'],
  stonebridge: ['#bda98a', '#d5c5a2', '#8d7967'],
  starroad: ['#595474', '#ada18c', '#383752'],
  snowpath: ['#bfd6dc', '#e2ede9', '#8daab8'],
  track: ['#685e58', '#93816e', '#493d3e'],
  gantry: ['#7f6e59', '#b4a382', '#504745'],
  stairs: ['#92794e', '#c5a96d', '#695a48'],
};
const rock = {
  2: ['#342e38', '#53434a', '#735454'],
  3: ['#465849', '#66704d', '#97a766'],
  5: ['#354a62', '#4e6e81', '#96b4bd'],
};
function fill(c, color, x, y, w, h) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}
function stroke(c, color, w, points) {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}
export function districtTile(c, map, kind, x, y, rng) {
  const col = x / 16,
    row = y / 16;
  if (
    map.region === 1 &&
    kind === 'water' &&
    map.plan.pools.some(([a, b, w, h]) => ((col - a) / w) ** 2 + ((row - b) / h) ** 2 <= 1)
  ) {
    fill(c, '#77b6ac', x, y, 16, 16);
    for (let i = 0; i < 3; i++)
      fill(c, i === 1 ? '#b6d3b9' : '#8fc6b5', x + rng(i) * 10, y + 3 + i * 4, 5, 1);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (map.cells[row + dy]?.[col + dx] === 'water') continue;
      fill(c, '#ded8b9', x + (dx > 0 ? 13 : 0), y + (dy > 0 ? 13 : 0), dx ? 3 : 16, dy ? 3 : 16);
      fill(
        c,
        '#95a69a',
        x + (dx > 0 ? 12 : dx < 0 ? 3 : 0),
        y + (dy > 0 ? 12 : dy < 0 ? 3 : 0),
        dx ? 1 : 16,
        dy ? 1 : 16,
      );
    }
    return true;
  }
  if (kind === 'saltflat') {
    const pale = Math.sin(col * 0.24 + row * 0.183) + Math.cos(row * 0.31 - col * 0.1);
    fill(c, pale > 0.7 ? '#c1be9b' : pale < -0.3 ? '#a6ac91' : '#b4b69a', x, y, 16, 16);
    for (let i = 0; i < 4; i++)
      fill(c, i % 2 ? '#d7d0b0' : '#9da68b', x + rng(i) * 12, y + rng(i + 6) * 14, 2 + rng(i + 3) * 2, 1);
    return true;
  }
  if (kind === 'void') {
    fill(c, '#202941', x, y, 16, 16);
    const cloud = Math.sin(col * 0.117 + row * 0.16) + 0.72 * Math.cos(row * 0.24 - col * 0.065);
    if (cloud > 0.68) {
      fill(c, cloud > 1.22 ? '#323449' : '#292d44', x, y, 16, 16);
      if (rng(1) > 0.65) fill(c, '#4a4762', x + Math.round(rng(2) * 11), y + 6, 3, 1);
    }
    if ((col * 11 + row * 7) % 17 === 0) {
      fill(c, '#77749b', x + 5, y + 9, 1, 1);
      if (rng(2) > 0.6) fill(c, '#cec39b', x + 7, y + 3, 2, 1);
    }
    return true;
  }
  if (kind === 'wall' || kind === 'cliff') {
    const above = map.cells[row - 1]?.[col],
      edge = above && !map.blockedTerrain.has(above);
    if (kind === 'wall') {
      fill(c, edge ? '#5c525b' : '#272b37', x, y, 16, 16);
      if (edge) {
        fill(c, '#b39170', x, y, 16, 2);
        fill(c, '#786a6a', x + 1, y + 3, 14, 6);
        fill(c, '#383341', x + 6, y + 10, 2, 6);
      } else if (col % 4 === 0 && row % 4 === 0) fill(c, '#333540', x + 4, y + 5, 8, 1);
    } else {
      const [dark, mid, lip] = rock[map.region],
        ridge = Math.floor((row + 1.8 * Math.sin(col * 0.22) + 0.7 * Math.cos(col * 0.53)) / 2) % 4;
      fill(c, ridge === 0 ? mid : dark, x, y, 16, 16);
      if (ridge === 0 || edge) {
        fill(c, mid, x, y + 3, 16, 10);
        fill(c, lip, x, y, 16, edge ? 3 : 1);
        fill(c, dark, x + 3 + rng(1) * 4, y + 7, 2, 6);
      } else if (rng(3) > 0.58) fill(c, mid, x + 2, y + 7, 5, 2);
      if (map.region === 2 && (col + Math.floor(row * 0.43)) % 15 <= 1 && rng(0) > 0.45) {
        stroke(c, '#875c42', 2, [
          [x + 2, y + 2],
          [x + 7, y + 6],
          [x + 6, y + 10],
          [x + 13, y + 15],
        ]);
        fill(c, '#cf8c53', x + 6, y + 6, 3, 1);
      }
      if (map.region === 5 && edge) {
        for (let i = 0; i < 3; i++) {
          const tip = Math.round(rng(i + 1) * 7) + 2;
          fill(c, '#81aab9', x + i * 5, y + 2, 3, tip);
          fill(c, '#d4e6e4', x + i * 5, y, 1, tip);
        }
      }
    }
    return true;
  }
  if (kind === 'furrow') {
    const sunlight = Math.sin(col * 0.2 + row * 0.11) > 0.08;
    fill(c, sunlight ? '#b79e57' : '#9e9753', x, y, 16, 16);
    fill(c, '#78794a', x, y + 14, 16, 2);
    for (let i = 0; i < 4; i++) {
      const sx = x + i * 4 + 1,
        sy = y + 4 + Math.round(rng(i) * 4);
      fill(c, '#807645', sx + 1, sy + 2, 1, 5);
      fill(c, sunlight ? '#e8c66d' : '#c7b463', sx, sy, 2, 5);
      fill(c, '#efcf7d', sx + 1, sy - 2, 1, 2);
    }
    return true;
  }
  const ink = masonry[kind];
  if (!ink) return false;
  fill(c, ink[0], x, y, 16, 16);
  if (kind === 'snowpath') {
    for (let i = 0; i < 3; i++) fill(c, ink[1 + (i % 2)], x + rng(i) * 13, y + rng(i + 4) * 13, 3, 1);
  } else if (kind === 'gantry' || kind === 'stairs') {
    for (let i = 0; i < 16; i += 4) {
      fill(c, ink[1], x, y + i, 16, 1);
      fill(c, ink[2], x, y + i + 3, 16, 1);
    }
  } else if (kind === 'track') {
    for (let i = 0; i < 5; i++) fill(c, i % 2 ? ink[2] : ink[1], x + rng(i) * 13, y + rng(i + 8) * 13, 2, 1);
  } else {
    const joint = (row % 2) * 8;
    fill(c, ink[2], x, y, 16, 1);
    fill(c, ink[2], x + joint, y, 1, 16);
    fill(c, ink[1], x + joint + 1, y + 2, 3, 1);
    if (kind === 'starroad' && col % 3 === 0 && row % 3 === 0) {
      fill(c, '#d6ae6b', x + 7, y + 5, 2, 6);
      fill(c, '#e6c891', x + 5, y + 7, 6, 2);
    }
  }
  return true;
}
export function drawDistrictFloor(c, map) {
  const { region, paths } = map;
  if (region === 2) {
    for (const path of paths)
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1].map((v) => v * 16 + 8),
          b = path[i].map((v) => v * 16 + 8);
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          length = Math.hypot(dx, dy),
          nx = -dy / length,
          ny = dx / length;
        for (let d = 0; d < length; d += 12) {
          const x = a[0] + (d * dx) / length,
            y = a[1] + (d * dy) / length;
          stroke(c, '#493c32', 4, [
            [x - nx * 10, y - ny * 10],
            [x + nx * 10, y + ny * 10],
          ]);
        }
        for (const k of [-6, 6]) {
          const rail = [a, b].map(([x, y]) => [x + k * nx, y + k * ny]);
          stroke(c, '#47434a', 3, rail);
          stroke(c, '#b9aaa0', 1, rail);
        }
      }
  }
  if (region === 1 || region === 6) {
    // Tie bollards and railings to the outer face of the pier, leaving the walking line clear.
    for (let y = 1; y < map.cells.length - 1; y++)
      for (let x = 1; x < map.cells[y].length - 1; x++) {
        const tile = map.cells[y][x],
          below = map.cells[y + 1][x];
        if (!['dock', 'stonebridge', 'quay'].includes(tile) || below !== 'water') continue;
        const xx = x * 16,
          yy = (y + 1) * 16 - 3;
        if (tile === 'stonebridge') {
          fill(c, '#655d55', xx, yy - 3, 16, 5);
          fill(c, '#cdb68c', xx, yy - 3, 16, 1);
        }
        if (x % 3 !== 0) continue;
        fill(c, tile === 'stonebridge' ? '#786d60' : '#654d40', xx + 4, yy - 7, 5, 11);
        fill(c, '#dfc49b', xx + 3, yy - 8, 7, 2);
        if (
          tile === 'dock' &&
          map.cells[y][x + 1] === tile &&
          map.cells[y][x + 2] === tile &&
          map.cells[y + 1][x + 2] === 'water'
        )
          stroke(c, '#9e8869', 1, [
            [xx + 7, yy - 5],
            [xx + 25, yy - 1],
            [xx + 39, yy - 5],
          ]);
      }
  }
  if (region === 7) {
    // Chart lines from the old sky survey appear only in the void beyond the platforms.
    for (const [x, y, points] of [
      [
        10,
        10,
        [
          [0, 0],
          [3, 2],
          [5, 1],
          [7, 4],
        ],
      ],
      [
        86,
        61,
        [
          [0, 0],
          [2, -3],
          [6, -2],
          [9, -6],
        ],
      ],
      [
        20,
        63,
        [
          [0, 0],
          [4, -1],
          [6, 1],
        ],
      ],
    ]) {
      const stars = points.map(([dx, dy]) => [(x + dx) * 16, (y + dy) * 16]);
      stroke(c, '#46445e', 1, stars);
      for (const [sx, sy] of stars) {
        fill(c, '#aea3b6', sx - 1, sy, 3, 1);
        fill(c, '#d3c7bc', sx, sy - 1, 1, 3);
      }
    }
    for (const [cx, cy, a, b] of map.plan.orbits)
      for (const offset of [-0.6, 0.6]) {
        c.strokeStyle = '#b79c68';
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(cx * 16 + 8, cy * 16 + 8, (a + offset) * 16, (b + offset) * 16, 0, 0, Math.PI * 2);
        c.stroke();
      }
  }
  if (region === 4) {
    for (const [x1, y1, x2, y2] of map.plan.rooms) {
      c.strokeStyle = '#b39a78';
      c.lineWidth = 2;
      c.strokeRect(x1 * 16 + 5, y1 * 16 + 5, (x2 - x1 + 1) * 16 - 10, (y2 - y1 + 1) * 16 - 10);
    }
    for (const [x, y] of [
      [24, 29],
      [83, 45],
      [51, 29],
    ]) {
      c.strokeStyle = '#aa8a66';
      c.lineWidth = 2;
      c.strokeRect(x * 16 - 47, y * 16 - 23, 94, 46);
      for (const side of [-1, 1]) {
        fill(c, '#73616a', x * 16 + side * 40 - 2, y * 16 - 18, 4, 36);
        fill(c, '#c1a179', x * 16 + side * 40 - 4, y * 16 - 3, 8, 6);
      }
    }
    for (let y = 55; y <= 62; y++) {
      fill(c, '#853e48', 49 * 16, y * 16, 5 * 16, 16);
      for (const x of [49 * 16 + 3, 54 * 16 - 5]) fill(c, '#d3ac6e', x, y * 16, 2, 16);
    }
  }
}
export function bookshelf(c, o) {
  const left = o.x - o.w / 2,
    top = o.y - o.h;
  fill(c, '#473333', left, top, o.w, o.h);
  for (let j = 0; j < 2; j++) {
    const y = top + 3 + j * 12;
    fill(c, '#ba8f64', left + 1, y - 2, o.w - 2, 2);
    for (let i = 0; i < 7; i++) {
      const h = 6 + ((i + j) % 4);
      fill(
        c,
        ['#8a4a49', '#697c79', '#917044', '#445b72'][(i + j + o.variant) % 4],
        left + 4 + i * 5,
        y + 9 - h,
        4,
        h,
      );
      fill(c, '#c5a578', left + 5 + i * 5, y + 6, 2, 1);
    }
  }
}
export function harborGulls(c, x, y, t) {
  for (let i = 0; i < 4; i++) {
    const a = t * 0.21 + i * 0.5,
      px = x + Math.cos(a) * 40 + i * 7,
      py = y + Math.sin(a * 0.8) * 9 + i * 3;
    const tilt = Math.sin(t * 4 + i) * 2;
    stroke(c, '#edf1d9', 1, [
      [px - 4, py + tilt],
      [px - 2, py - 1],
      [px, py + 1],
      [px + 2, py - 1],
      [px + 4, py + tilt],
    ]);
  }
}

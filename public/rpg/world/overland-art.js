import { CELL, COLS, ROWS, WIDTH, HEIGHT, noise } from './overland-map.js';
const colors = [
  [
    '#527d63',
    '#698965',
    '#395f53',
    '#c29c66',
    '#d8b882',
    '#8d775c',
    '#30676d',
    '#48908b',
    '#9ed1b5',
    '#ffc97a',
    0,
  ],
  [
    '#99a47e',
    '#b6b88e',
    '#758c76',
    '#d4bc8d',
    '#e7d3ac',
    '#9c947c',
    '#236d86',
    '#3a92a0',
    '#b9efe3',
    '#ffe5a8',
    12,
  ],
  [
    '#746457',
    '#82755c',
    '#594f4b',
    '#b38766',
    '#cfa47e',
    '#856b58',
    '#525764',
    '#7b8384',
    '#b6d3c8',
    '#ff9b50',
    -35,
  ],
  [
    '#819653',
    '#9baa62',
    '#617e49',
    '#c6a372',
    '#e2bf7b',
    '#937957',
    '#377883',
    '#599995',
    '#b4dcac',
    '#ffe88b',
    -12,
  ],
  [
    '#47686e',
    '#678782',
    '#375863',
    '#9b9093',
    '#b2a9a0',
    '#747281',
    '#374b75',
    '#50658d',
    '#a5b5d5',
    '#acd1ff',
    60,
  ],
  [
    '#9fc1c8',
    '#c4dce0',
    '#759da9',
    '#a0b4ba',
    '#c6d5d4',
    '#82969f',
    '#326783',
    '#679abc',
    '#c7f1f0',
    '#d5ffff',
    43,
  ],
  [
    '#7e8d70',
    '#9ca585',
    '#626e67',
    '#b08b7c',
    '#caa798',
    '#83706b',
    '#465f7b',
    '#637b91',
    '#b9d3cd',
    '#ffcd84',
    -24,
  ],
  [
    '#505875',
    '#686d88',
    '#414a64',
    '#8b8198',
    '#aaa2b2',
    '#68667d',
    '#35446a',
    '#516186',
    '#adb9dc',
    '#ffdf91',
    76,
  ],
];
const base = '/rpg/world/region-art/';
const assets = new Map();
function bitmap(url) {
  if (!assets.has(url)) {
    const image = new Image();
    image.src = url;
    assets.set(url, image);
  }
  return assets.get(url);
}
function rect(c, color, x, y, w, h) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}
function ellipse(c, color, x, y, rx, ry) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}
function blit(c, image, sx, sy, sw, sh, x, y, w, h) {
  if (image.complete && image.naturalWidth)
    c.drawImage(image, sx, sy, sw, sh, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function sprite(c, image, x, y, w, h) {
  if (image.complete && image.naturalWidth)
    c.drawImage(image, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function glow(c, x, y, range, color, level) {
  const g = c.createRadialGradient(x, y, 1, x, y, range);
  g.addColorStop(0, color);
  g.addColorStop(1, color + '00');
  c.globalAlpha = level;
  c.fillStyle = g;
  c.fillRect(x - range, y - range, range * 2, range * 2);
  c.globalAlpha = 1;
}
function line(c, color, width, points) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(...points[0]);
  for (const point of points.slice(1)) c.lineTo(...point);
  c.stroke();
}
// The tide yards, rail beds and carved ceremonial courts are walkable surface markings.
function localGround(c, map, p) {
  const { x, y } = map.spawn;
  if (map.region === 1) {
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 3; i++) {
        const px = x + 47 + i * 21,
          py = y + 38 + j * 14;
        rect(c, '#929a7b', px, py, 20, 13);
        rect(c, '#a7c6b1', px + 2, py + 2, 16, 8);
        rect(c, '#cee2c2', px + 3, py + 2, 13, 1);
        rect(c, '#d8d7ab', px, py + 12, 20, 1);
      }
  } else if (map.region === 2) {
    for (let i = -7; i < 20; i++) {
      const px = x + i * 12;
      rect(c, '#745a4b', px, y - 10, 3, 11);
      rect(c, '#a27f63', px, y - 10, 1, 11);
    }
    for (const off of [-9, -1]) {
      rect(c, '#4d5260', x - 84, y + off, 320, 2);
      rect(c, '#c1ada0', x - 84, y + off, 320, 1);
    }
    for (let i = 0; i < 12; i++) rect(c, '#494f50', x + 47 + i * 4, y - 43 + (i % 3) * 2, 5, 3);
  } else if (map.region === 3) {
    for (let j = 0; j < 3; j++) {
      const py = y + 32 + j * 15;
      line(c, '#69724b', 3, [
        [x - 110, py + 3],
        [x - 89, py - 2],
        [x - 23, py - 2],
        [x - 14, py - 6],
      ]);
      line(c, '#dabb77', 1, [
        [x - 109, py + 2],
        [x - 90, py - 4],
        [x - 23, py - 4],
        [x - 15, py - 7],
      ]);
      for (let k = 0; k < 7; k++) {
        const px = x - 84 + k * 8;
        rect(c, '#4f7b45', px, py - 10, 2, 5);
        rect(c, '#dfb557', px - 1, py - 12, 3, 3);
      }
    }
  } else if (map.region === 4 || map.region === 6 || map.region === 7) {
    const star = map.region === 7,
      n = star ? 12 : 8,
      r = star ? 37 : 27;
    for (const radius of [r, r - 3, r * 0.58]) {
      const points = Array.from({ length: n + 1 }, (_, i) => [
        x + Math.cos((i * Math.PI * 2) / n) * radius,
        y + Math.sin((i * Math.PI * 2) / n) * radius * 0.49,
      ]);
      line(c, star ? '#d8b786' : map.region === 6 ? '#8e705b' : '#c1bdaf', 1, points);
    }
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n,
        at = (rad, d) => [x + Math.cos(a + d) * rad, y + Math.sin(a + d) * rad * 0.49];
      line(c, star ? '#c0a484' : p[5], 1, [at(r * 0.6, 0), at(r * 0.84, 0.14), at(r, 0)]);
    }
  } else if (map.region === 5) {
    for (let j = 0; j < 9; j++) {
      const px = x + 51 + (j % 3) * 21 + (Math.floor(j / 3) % 2) * 6,
        py = y + 33 + Math.floor(j / 3) * 12;
      ellipse(c, '#aeced1', px, py, 10 + (j % 3) * 2, 3);
      rect(c, '#d3e7e2', px - 6, py - 1, 11, 1);
    }
  }
}
function floorTexture(map, p) {
  const out = document.createElement('canvas');
  out.width = WIDTH;
  out.height = HEIGHT;
  const c = out.getContext('2d');
  c.imageSmoothingEnabled = false;
  const tile = (x, y) => map.cells[y]?.[x],
    isWater = (x, y) => tile(x, y) === 'water';
  for (let yy = 0; yy < ROWS; yy++)
    for (let xx = 0; xx < COLS; xx++) {
      const x = xx * CELL,
        y = yy * CELL,
        kind = tile(xx, yy),
        rng = (n) => noise(xx * 17 + n, yy * 11 + n * 13, map.region);
      if (kind === 'water') {
        rect(c, p[6], x, y, 16, 16);
        // A four-pixel depth gradient follows the shape of the river. The waterline
        // stays aligned to collision while each bank has its own sand and reeds.
        for (let sy = 0; sy < 16; sy += 4)
          for (let sx = 0; sx < 16; sx += 4) {
            const depth =
              Math.sin((x + sx) * 0.019 + (y + sy) * 0.017) * 0.08 + Math.sin((y + sy) * 0.038) * 0.04;
            c.fillStyle = depth > 0 ? '#11344e' : '#b2d9a5';
            c.globalAlpha = 0.05 + Math.abs(depth);
            c.fillRect(x + sx, y + sy, 4, 4);
          }
        c.globalAlpha = 1;
        if (rng(0) > 0.34) {
          const wx = x + 1 + Math.floor(rng(1) * 6),
            wy = y + 1 + Math.floor(rng(2) * 12);
          rect(c, p[7], wx, wy, 2 + Math.floor(rng(3) * 5), 1);
        }
        for (const [dx, dy] of [
          [-1, 0],
          [0, -1],
          [1, 0],
          [0, 1],
        ]) {
          const adj = tile(xx + dx, yy + dy);
          if (!adj || ['bridge', 'dock', 'water'].includes(adj)) continue;
          const bx = x + (dx === 1 ? 13 : 0),
            by = y + (dy === 1 ? 13 : 0);
          rect(c, p[2], bx, by, dx === 0 ? 16 : 3, dy === 0 ? 16 : 3);
          rect(
            c,
            p[8],
            bx + (dx < 0 ? 3 : dx > 0 ? -1 : 0),
            by + (dy < 0 ? 4 : dy > 0 ? -1 : 0),
            dx === 0 ? 16 : 1,
            dy === 0 ? 16 : 1,
          );
        }
      } else if (kind === 'bridge' || kind === 'dock') {
        rect(c, '#55493f', x, y, 16, 16);
        for (let i = 0; i < 2; i++) {
          rect(c, rng(i) > 0.5 ? '#ae865b' : '#a67d53', x + 1 + i * 8, y, 7, 16);
          rect(c, '#ccaa77', x + 1 + i * 8, y, 1, 16);
          rect(c, '#775e48', x + 5 + i * 8, y + 4 + rng(i + 2) * 6, 1, 4);
        }
        rect(c, '#524e4e', x + 3, y + 3, 1, 1);
      } else if (kind === 'road') {
        rect(c, p[3], x, y, 16, 16);
        for (let i = 0; i < 4; i++) {
          const px = x + rng(i + 1) * 14,
            py = y + rng(i + 8) * 14;
          rect(c, i % 2 ? p[4] : p[5], px, py, (i % 3) + 1, 1);
          if (map.region === 4 || map.region === 6 || map.region === 7)
            rect(c, p[5], x + (yy % 2) * 6, y + 7, 9, 1);
        }
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ])
          if (tile(xx + dx, yy + dy) === 'grass') {
            for (let i = 0; i < 16; i += 2) {
              const dep = 1 + Math.floor(rng(i + 2) * 4);
              const px = dx > 0 ? x + 16 - dep : dx < 0 ? x : x + i,
                py = dy > 0 ? y + 16 - dep : dy < 0 ? y : y + i;
              rect(c, p[0], px, py, dx ? dep : 2, dy ? dep : 2);
            }
          }
      } else {
        rect(c, p[0], x, y, 16, 16);
        const broad = Math.sin(xx * 0.46 + yy * 0.21) + Math.cos(yy * 0.47 - xx * 0.32);
        c.fillStyle = broad > 0 ? '#dcdda0' : '#1c454c';
        c.globalAlpha = Math.abs(broad) * 0.055;
        c.fillRect(x, y, 16, 16);
        c.globalAlpha = 1;
        if (rng(13) > 0.47) {
          const a = x + 2 + Math.floor(rng(10) * 6),
            b = y + 3 + Math.floor(rng(15) * 7);
          c.globalAlpha = 0.68;
          rect(c, p[2], a - 2, b + 2, 8, 1);
          rect(c, p[2], a, b, 6, 3);
          rect(c, p[2], a + 1, b - 2, 3, 3);
          rect(c, p[1], a + 1, b - 3, 1, 4);
          rect(c, p[1], a + 3, b - 2, 1, 4);
          rect(c, p[1], a + 5, b, 2, 1);
          c.globalAlpha = 1;
        }
        for (let i = 0; i < 4; i++) {
          const px = x + rng(i + 3) * 14,
            py = y + rng(i + 7) * 13;
          rect(c, p[i % 2 ? 1 : 2], px, py, 1 + rng(i + 11) * 2, 1);
          if (rng(i + 15) > 0.59) {
            rect(c, p[1], px + 1, py - 2, 1, 2);
            rect(c, p[2], px + 3, py, 2, 1);
          }
        }
        if (rng(18) > 0.945 && !isWater(xx + 1, yy)) {
          const fx = x + 4,
            fy = y + 8;
          rect(c, p[2], fx, fy, 1, 3);
          rect(
            c,
            map.region === 5 ? '#e6eef1' : rng(0) > 0.5 ? '#ebbf85' : '#ddb6b3',
            fx - 1,
            fy - 1,
            3,
            2,
          );
        }
      }
    }
  localGround(c, map, p);
  return out;
}
function tintVillage(img, region) {
  const p = colors[region];
  const off = document.createElement('canvas');
  off.width = img.width;
  off.height = img.height;
  const c = off.getContext('2d');
  c.drawImage(img, 0, 0);
  const pix = c.getImageData(0, 0, off.width, off.height);
  for (let i = 0; i < pix.data.length; i += 4) {
    const r = pix.data[i],
      g = pix.data[i + 1],
      b = pix.data[i + 2];
    if (!pix.data[i + 3]) continue;
    const leaf = g > r * 0.88 && b < g * 0.82;
    const lum = (r * 0.35 + g * 0.5 + b * 0.15) / 255;
    const tone = leaf
      ? region === 5
        ? ['#476d83', '#d7eaef']
        : region === 2
          ? ['#423f42', '#ba8349']
          : region === 4 || region === 7
            ? ['#213348', '#8299a2']
            : ['#244e4a', p[1]]
      : ['#282c3b', '#ffd19b'];
    for (let k = 0; k < 3; k++) {
      const lo = parseInt(tone[0].slice(1 + k * 2, 3 + k * 2), 16),
        hi = parseInt(tone[1].slice(1 + k * 2, 3 + k * 2), 16);
      pix.data[i + k] =
        0.22 * pix.data[i + k] + 0.78 * (lo + (hi - lo) * Math.min(1, Math.max(0, (lum - 0.13) * 1.65)));
    }
  }
  c.putImageData(pix, 0, 0);
  return off;
}
const villageCache = [];
function drawObject(c, o, s, t, map) {
  const { x, y, w, h } = o,
    left = x - w / 2,
    top = y - h,
    p = colors[map.region];
  const source = s.village;
  const shadow = '#172c3566';
  if (o.type === 'tree' || o.type === 'prop') {
    const shrub = o.type === 'tree';
    const forestFrames = [
      [0, 0, 1],
      [0, 3, 0],
      [3, 3, 0],
      [3, 0, 3],
      [0, 1, 0],
      [2, 2, 2],
      [3, 1, 0],
      [2, 1, 2],
    ];
    const cell = shrub ? forestFrames[map.region][o.variant] : o.variant;
    ellipse(c, shadow, x + w * 0.08, y - 1, w * (shrub ? 0.23 : 0.28), h * 0.075);
    blit(c, s.props, (cell % 4) * 80, Math.floor(cell / 4) * 80, 80, 80, left, top, w, h);
    return;
  }
  if (o.type === 'house') {
    if (!source.complete || !source.naturalWidth) return;
    const v = (villageCache[map.region] ||= tintVillage(source, map.region));
    const src = o.variant ? [192, 96, 64, 80] : [256, 80, 64, 80];
    ellipse(c, shadow, x + 4, y - 1, w * 0.4, h * 0.1);
    c.drawImage(v, ...src, Math.round(left), Math.round(top), Math.round(w), Math.round(h));
    return;
  }
  if (o.type === 'station') {
    ellipse(c, shadow, x + 5, y - 1, w * 0.39, h * 0.105);
    blit(c, s.stations, 112 * o.variant, 0, 112, 112, left, top, w, h);
    return;
  }
  if (o.type === 'war-post') {
    ellipse(c, shadow, x + 4, y - 1, w * 0.36, h * 0.08);
    blit(c, s.war, o.variant * 96, 0, 96, 96, left, top, w, h);
    if (o.variant === 2) glow(c, x, y - h * 0.55, w * 0.45, '#cc6de9', 0.09 + Math.sin(t * 2) * 0.04);
    return;
  }
  if (o.type === 'ship') {
    const bob = Math.sin(t * 1.3) * 1.2;
    ellipse(c, '#223f55a0', x + 3, y - 1, w * 0.39, h * 0.1);
    if (s.ship.complete && s.ship.naturalWidth) sprite(c, s.ship, left, top + bob, w, h);
    else {
      ellipse(c, '#35475c', x, y - 4, w * 0.42, 9);
      rect(c, '#786752', x - 2, y - 36, 3, 28);
      rect(c, '#beb8a2', x, y - 37, 24, 17);
    }
    return;
  }
  if (o.type === 'fence' || o.type === 'rail') {
    const wide = o.type === 'rail';
    rect(c, shadow, left + 1, y, wide ? 23 : 16, 2);
    rect(c, '#5d5148', left, y - 6, w, 3);
    rect(c, '#b3956e', left, y - 7, w, 1);
    rect(c, '#5d4b3f', left, y - 10, 4, 11);
    rect(c, '#ccb181', left, y - 10, 3, 2);
    return;
  }
  if (o.type === 'crop') {
    rect(c, p[5], left, top + 7, w, 6);
    rect(c, p[3], left + 1, top + 8, w - 2, 1);
    for (let j = 0; j < 2; j++) {
      const xx = left + j * 6 + 3;
      rect(c, p[2], xx, top + 6, 2, 5);
      rect(c, p[1], xx - 2, top + 5, 4, 3);
      rect(
        c,
        map.region === 5 ? '#e4e8dd' : o.variant === 0 ? '#e6b65d' : '#a5b867',
        xx + 1,
        top + 3,
        3,
        3,
      );
    }
    return;
  }
  if (o.type === 'lantern') {
    rect(c, '#433c3d', x - 1, y - 22, 3, 22);
    rect(c, '#aa8761', x, y - 22, 1, 21);
    rect(c, '#594a41', x - 4, y - 20, 11, 2);
    rect(c, '#4e433e', x + 2, y - 18, 4, 2);
    rect(c, '#a06736', x + 1, y - 16, 6, 8);
    rect(c, p[9], x + 2, y - 15, 4, 5);
    glow(c, x + 4, y - 13, 12, p[9], 0.19);
    return;
  }
  if (o.type === 'mechanism') {
    ellipse(c, shadow, x + 2, y - 1, 12, 4);
    rect(c, '#58565b', x - 8, y - 3, 17, 3);
    rect(c, '#b5a587', x - 7, y - 5, 15, 3);
    rect(c, '#6e6259', x - 3, y - 24, 6, 20);
    rect(c, '#ddc18a', x - 3, y - 25, 2, 20);
    const hue = ['#77c7bc', '#8ed3ea', '#ff9f5e', '#dfbe66', '#938cd5', '#b2ece8', '#e5ab69', '#a4acfd'][
      map.region
    ];
    ellipse(c, '#465560', x, y - 24, 7, 6);
    ellipse(c, hue, x, y - 25, 5, 5);
    rect(c, '#e8e3bc', x - 2, y - 28, 2, 6);
    glow(c, x, y - 24, 14, hue, 0.24);
  }
}
function mark(c, x, y, kind, t) {
  const h = Math.round(Math.sin(t * 2) * 1.2);
  c.save();
  c.translate(Math.round(x), Math.round(y + h));
  c.rotate(Math.PI / 4);
  rect(c, '#2c3540', -4, -4, 8, 8);
  rect(c, kind === 'danger' ? '#e58b65' : '#fce2a6', -3, -3, 6, 6);
  c.restore();
  rect(c, '#67452f', x, y + h - 2, 1, 3);
}
const enemySprites = ['sprout', 'moth', 'golem', 'moth', 'warden', 'golem', 'warden', 'warden'];
function drawActor(c, a, s, t, map) {
  const { x, y } = a;
  const shadow = '#1d354585';
  if (a.type === 'player') {
    const col = { south: 0, north: 1, west: 2, east: 3 }[a.dir] ?? 0;
    const row = a.moving ? [1, 0, 2, 0][Math.floor(a.stride / 6) % 4] : 0;
    ellipse(c, shadow, x, y - 1, 7, 2.4);
    blit(c, s.walk, 16 * col, 16 * (a.role * 3 + row), 16, 16, x - 12, y - 24, 24, 24);
    if (a.mark) {
      const wing = Math.sin(t * 5),
        bx = x + (a.dir === 'west' ? 12 : -12),
        by = y - 19 + Math.sin(t * 2.3) * 2;
      rect(c, '#772f37', bx, by, 5, 3);
      rect(c, '#f17f63', bx - 2, by - 2 + wing, 4, 2);
      rect(c, '#f3b07b', bx + 4, by, 2, 1);
    }
  } else if (a.type === 'keeper') {
    ellipse(c, shadow, x, y - 1, 8, 3);
    blit(c, s.crew, map.region * 64, 0, 64, 64, x - 16, y - 31, 32, 32);
    mark(c, x, y - 36, 'talk', t);
  } else if (a.type === 'enemy') {
    const dragon = a.encounter === 'ash_crown';
    const img = dragon ? s.dragon : a.boss ? s.boss : s.foe;
    const w = dragon ? 65 : a.boss ? 46 : 33,
      h = dragon ? 64 : a.boss ? 44 : 31;
    ellipse(c, shadow, x, y - 1, w * 0.34, 3);
    sprite(c, img, x - w / 2, y - h + Math.sin(t * 3) * 0.9, w, h);
    mark(c, x, y - h - 4, 'danger', t);
  } else if (a.type === 'trap') {
    ellipse(c, '#484e4c', x, y, 12, 4);
    rect(c, '#ad8468', x - 9, y - 3, 17, 4);
    for (let i = -7; i <= 7; i += 7) {
      rect(c, '#655b5a', x + i, y - 7, 3, 7);
      rect(c, '#e2c9a0', x + i, y - 8, 2, 3);
    }
    mark(c, x, y - 15, 'danger', t);
  }
}
export function makePainter(canvas, map) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const floor = floorTexture(map, colors[map.region]);
  const s = {
    war: bitmap(base + 'war-posts.webp'),
    dragon: bitmap('/rpg/battle/art/ash-crown-armored.png'),
    props: bitmap(base + 'field-props.webp'),
    village: bitmap(base + 'village-tiles.png'),
    stations: bitmap(base + 'stations.webp'),
    walk: bitmap(base + 'walkers.png'),
    crew: bitmap(base + 'field-keepers.webp'),
    foe: bitmap('/rpg/battle/art/foe-' + enemySprites[map.region] + '.png'),
    boss: bitmap(
      map.region === 0 ? '/rpg/battle/art/willow-keeper.png' : '/rpg/battle/art/foe-warden.png',
    ),
  };
  if (map.region === 0) s.ship = bitmap(base + 'ghost-ship.webp');
  const theme = colors[map.region];
  return function paint(cam, player, dots, t, reduced) {
    const w = canvas.width,
      h = canvas.height,
      x = Math.round(cam.x),
      y = Math.round(cam.y);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, -x, -y);
    ctx.fillStyle = theme[2];
    ctx.fillRect(x, y, w, h);
    ctx.drawImage(floor, 0, 0);
    for (const reef of map.reefs) {
      if (reef.x < x - 10 || reef.x > x + w + 10 || reef.y < y || reef.y > y + h) continue;
      const time = reduced ? 0 : t;
      const f = Math.sin(time * 1.5 + reef.y);
      rect(ctx, theme[7], reef.x + f * 3, reef.y, 5, 1);
      if (f > 0.52) rect(ctx, theme[8], reef.x - 1, reef.y - 1, 3, 1);
    }
    const all = map.objects.filter(
      (o) => o.x + o.w > x && o.x - o.w < x + w && o.y + 5 > y && o.y - o.h < y + h,
    );
    for (const d of dots)
      if (d.kind === 'keeper' || d.kind === 'enemy' || d.kind === 'trap')
        all.push({ ...d, type: d.kind, actor: true });
    all.push({ ...player, type: 'player', actor: true });
    all.sort((a, b) => a.y - b.y);
    for (const o of all) {
      if (o.actor) drawActor(ctx, o, s, t, map);
      else drawObject(ctx, o, s, t, map);
    }
    for (const o of map.objects)
      if (o.type === 'lantern' && o.x > x - 18 && o.x < x + w + 18 && o.y > y && o.y < y + h + 20)
        glow(ctx, o.x + 4, o.y - 13, 17, theme[9], 0.17);
    const site = map.dots.site;
    mark(ctx, site.x, site.y - 44, 'talk', t);
    if (map.dots.ship) mark(ctx, map.dots.ship.x + 8, map.dots.ship.y - 16, 'talk', t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const weatherIndex = map.region;
    const motes = weatherIndex === 5 ? 38 : 15;
    for (let i = 0; i < motes; i++) {
      const px =
        ((((i * 79 + t * (weatherIndex === 5 ? 4 : 2) - x * 0.37) % (w + 20)) + w + 20) % (w + 20)) - 10;
      const py =
        ((((i * 137 + t * (weatherIndex === 5 ? 11 : 2) - y * 0.5) % (h + 15)) + h + 15) % (h + 15)) - 7;
      ctx.globalAlpha = 0.3 + 0.28 * Math.sin(t + i);
      rect(ctx, weatherIndex === 5 ? '#edffff' : theme[9], px, py, weatherIndex === 0 ? 2 : 1, 1);
    }
    ctx.globalAlpha = 1;
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, '#18263b2b');
    shade.addColorStop(0.45, '#18263b00');
    shade.addColorStop(1, '#18283726');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
  };
}

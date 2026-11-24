import { districtTile, drawDistrictFloor, bookshelf, harborGulls } from './district-art.js';
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
// Footprints, workshops and work surfaces extend the illustration beyond the
// station sprite. The same survey coordinates drive collision and interaction.
function districtGround(c, spot, p) {
  const x = (spot.col + 0.5) * CELL, y = (spot.row + 0.5) * CELL;
  const stroke = (color, thickness, points) =>
    line(c, color, thickness, points.map(([u, v]) => [x + u, y + v]));
  if (spot.motif === 'salt' || spot.motif === 'terrace' || spot.motif === 'press') {
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 4; col++) {
        const u = x - 55 + col * 26 + (row % 2) * 4, v = y + 26 + row * 11;
        rect(c, p[5], u, v, 24, 9);
        rect(c, spot.motif === 'salt' ? '#93b6a5' : spot.motif === 'press' ? '#dbceaa' : '#628548', u + 1, v + 1, 21, 6);
        const light = spot.motif === 'salt' ? '#e1e6cc' : spot.motif === 'press' ? '#b28e70' : '#a2aa58';
        rect(c, light, u + 2, v + 2, 17, 1);
        rect(c, light, u + 5, v + 4, 12, 1);
      }
  } else if (spot.motif === 'rail' || spot.motif === 'kiln') {
    for (let u = -78; u <= 78; u += 9) rect(c, '#594b43', x + u, y + 14, 4, 15);
    for (const v of [15, 25]) {
      stroke('#494c4d', 3, [[-85, v], [48, v], [81, v + 12]]);
      stroke('#c0ad96', 1, [[-85, v - 1], [48, v - 1], [81, v + 11]]);
    }
  } else if (spot.motif === 'ring' || spot.motif === 'beacon') {
    for (const r of [24, 40, 44]) {
      const corners = Array.from({length: 13}, (_, i) => {
        const a = i * Math.PI / 6;
        return [Math.cos(a) * r, Math.sin(a) * r * 0.48 + 12];
      });
      stroke(r === 40 ? p[5] : p[4], 2, corners);
    }
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      rect(c, p[9], x + Math.cos(a) * 40 - 1, y + Math.sin(a) * 19 + 12, 2, 2);
    }
  } else if (spot.motif === 'cairn') {
    for (let i = 0; i < 8; i++) {
      const u = -72 + i * 19, v = 18 + Math.sin(i) * 10;
      stroke(p[2], 2, [[u, v], [u + 9, v + 4], [u + 12, v + 1], [u + 18, v + 3]]);
      stroke(p[8], 1, [[u + 1, v + 2], [u + 9, v + 6], [u + 13, v + 3]]);
    }
  } else {
    for (let row = 0; row < 2; row++)
      for (let i = -5; i < 6; i++) {
        const u = x + i * 10, v = y + 17 + row * 10;
        rect(c, '#625645', u, v, 9, 9);
        rect(c, '#a78b64', u, v, 8, 8);
        rect(c, '#bc9e75', u + 1, v + 1, 1, 6);
      }
  }
}
const terrainTints = {
  reedbed: ['#648675', '#839a73', '#3f665e'],
  saltflat: ['#b2b69c', '#d4dcc0', '#8da69c'],
  slag: ['#645d59', '#a28b72', '#51494b'],
  furrow: ['#9b915d', '#bbac69', '#767949'],
  flagstone: ['#778388', '#9caaa8', '#606f78'],
  ice: ['#accfd8', '#d5f0e8', '#83b5c2'],
  cobble: ['#8a8171', '#aea18a', '#68685f'],
  basalt: ['#595b73', '#9789a1', '#48475e'],
};
function regionalTile(c, kind, x, y, rng) {
  const [base, light, shade] = terrainTints[kind];
  rect(c, base, x, y, 16, 16);
  if (kind === 'flagstone' || kind === 'cobble') {
    const side = kind === 'cobble' ? 8 : 16;
    for (let v = 0; v < 16; v += 8) {
      rect(c, shade, x, y + v + 7, 16, 1);
      for (let u = (v ? 0 : side / 2); u < 16; u += side) rect(c, shade, x + u, y + v, 1, 7);
      rect(c, light, x + (v ? 2 : 8), y + v + 1, 4 + rng(v) * 3, 1);
    }
  } else if (kind === 'reedbed' || kind === 'furrow') {
    for (let i = 0; i < 3; i++) {
      const u = x + i * 5 + 1, v = y + 6 + rng(i) * 6;
      rect(c, shade, u, v, kind === 'furrow' ? 2 : 5, 1);
      rect(c, light, u + 2, v - 3, 1, 3);
    }
    if (kind === 'furrow') rect(c, shade, x, y + 14, 16, 2);
  } else {
    for (let i = 0; i < 3; i++) {
      const u = x + rng(i) * 10, v = y + rng(i + 5) * 12;
      rect(c, shade, u + 1, v + 1, 4, 1);
      rect(c, light, u, v, kind === 'ice' || kind === 'saltflat' ? 6 : 2, 1);
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
      if (map.plan && districtTile(c,map,kind,x,y,rng)) continue;
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
      } else if (terrainTints[kind]) {
        regionalTile(c, kind, x, y, rng);
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
  if (map.plan) drawDistrictFloor(c, map);
  for (const spot of map.landmarks) districtGround(c, spot, p);
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
function drawWorkshopProp(c, o, t) {
  const { x, y, w, h, variant } = o, left = x - w / 2;
  ellipse(c, '#2134385c', x + 2, y, w * 0.46, 3);
  const timber = '#725840', edge = '#c4a072', iron = '#485057';
  if (variant === 'cart') {
    for (const dx of [-10, 10]) {
      ellipse(c, iron, x + dx, y - 3, 4, 4);
      rect(c, '#b09d83', x + dx - 1, y - 4, 2, 2);
    }
    for (let j = 0; j < 3; j++) {
      rect(c, j === 2 ? iron : timber, left + 3 + j, y - 15 + j * 4, w - 6 - j * 2, 4);
      rect(c, j === 2 ? '#78828a' : edge, left + 3 + j, y - 15 + j * 4, w - 6 - j * 2, 1);
    }
    for (let i = 0; i < 5; i++) {
      const px = x - 12 + i * 5, py = y - 15 - (i % 3) * 2;
      rect(c, '#565865', px, py, 7, y - 14 - py + 1);
      rect(c, '#ada19c', px + 1, py, 4, 1);
    }
  } else if (variant === 'paper' || variant === 'rack') {
    for (const dx of [-w * 0.45, w * 0.45]) {
      rect(c, timber, x + dx, y - h + 1, 3, h);
      rect(c, edge, x + dx, y - h, 1, h - 2);
    }
    const ends = [[left + 2, y - h + 4], [x, y - h + 7], [x + w / 2 - 1, y - h + 4]];
    line(c, '#5b5140', 2, ends);
    if (variant === 'paper') {
      for (let j = 0; j < 5; j++) {
        const u = left + 5 + j * 7, top = y - h + 4 + (j === 2 ? 3 : 1);
        const sway = Math.round(Math.sin(t + j));
        rect(c, '#dfd3b7', u, top, 6, 12 + j % 3);
        rect(c, '#c1b595', u + sway, top + 9, 6, 3);
        rect(c, '#f0e4ca', u, top, 5, 1);
      }
    } else {
      for (let j = 0; j < 8; j++) {
        const u = left + 4 + j * 4.5, v = y - h + 6 + Math.sin(j * 0.46) * 3;
        line(c, '#a99472', 1, [[u, v], [u + 6, v + 9], [u + 3, v + 17]]);
        line(c, '#897d66', 1, [[u + 1, v + 13], [u + 8, v + 3]]);
      }
    }
  } else if (variant === 'salt') {
    const peak = Math.round(h * .75);
    for (let j = 0; j < peak; j++) {
      const width = Math.max(2, Math.round((j + 1) * w / peak));
      const px = x - width * .52, py = y - peak + j;
      rect(c, '#b0c3bc', px, py, width, 1);
      rect(c, '#f3ead5', px, py, Math.max(1, width * .58), 1);
      if (j % 3 === 0) rect(c, '#d9ded1', px + width * .24, py, width * .22, 1);
    }
    rect(c,'#9caca0',left+1,y,w-2,2);
  } else if (variant === 'dial') {
    ellipse(c, '#535164', x, y - 2, w * 0.45, 5);
    ellipse(c, '#c1a079', x, y - 5, w * 0.45, 5);
    ellipse(c, '#6e6c7b', x, y - 5, w * 0.36, 3);
    line(c, '#e2c389', 2, [[x - 4, y - 6], [x + 4, y - h + 3], [x + 4, y - 6]]);
  } else {
    const hay = variant === 'hay', snow = variant === 'cairn';
    const face = hay ? '#a88c4f' : snow ? '#799098' : '#686466';
    const lip = hay ? '#d5b46c' : snow ? '#cadad5' : '#a0998a';
    for (let j = 0; j < 3; j++) {
      const ry = 5 - j, rx = w * (0.43 - j * 0.1), cy = y - 3 - j * (h / 4);
      ellipse(c, face, x, cy, rx, ry);
      ellipse(c, lip, x - 1, cy - 2, rx - 1, ry - 1);
      if (hay) rect(c, timber, x + rx * 0.4, cy - 3, 2, 5);
    }
  }
}
function drawObject(c, o, s, t, map) {
  const { x, y, w, h } = o,
    left = x - w / 2,
    top = y - h,
    p = colors[map.region];
  const source = s.village;
  const shadow = '#172c3566';
  if (o.type === 'fittings') {
    const bob = o.variant === 7 ? Math.sin(t * 1.3 + x) * 1.2 : 0;
    ellipse(c, shadow, x + 2, y - 1, w * .36, 3);
    blit(c, s.fittings, o.variant * 128, 0, 128, 128, left, top + bob, w, h);
    return;
  }
  if (o.type === 'shelf') return bookshelf(c,o);
  if (o.type === 'monument') {
    ellipse(c,shadow,x+3,y-1,w*.38,6);
    blit(c,s.monuments,o.variant*160,0,160,160,left,top,w,h);
    if (o.variant === 1) glow(c,x,y-h*.80,27,'#ffe6a4',.21+.08*Math.sin(t*.9));
    if (o.variant === 2) {
      for (let i=0;i<7;i++) {
        const k=(t*.28+i/7)%1;
        c.globalAlpha=.24*(1-k);
        ellipse(c,'#967b75',x-16+k*17,y-h+10-k*31,3+5*k,2+4*k);
      }
      c.globalAlpha=1;
    }
    return;
  }
  if (o.type === 'works') return drawWorkshopProp(c, o, t);
  if (o.type === 'landmark') {
    // Reuse the local illustrated architecture for silhouette and materials.
    // Moving machinery gives the facilities an identity at field scale.
    const station = { wheel: 3, beacon: 1, press: 4, rail: 2, kiln: 2, terrace: 3, ring: 7, cairn: 5, wharf: 0, salt: 1 }[o.variant];
    ellipse(c, shadow, x + 4, y - 1, w * 0.4, 4);
    if (o.variant === 'salt') {
      drawWorkshopProp(c, {...o, x:x-10, w:39, h:22, variant:'salt'},t);
      drawWorkshopProp(c, {...o, x:x+10, y:y+2, w:33, h:18, variant:'salt'},t);
    } else if (o.variant === 'wheel' && map.region === 0)
      blit(c, s.village, 256, 80, 64, 80, left, top - 7, w * 0.88, h + 7);
    else blit(c, s.stations, station * 112, 0, 112, 112, left, top - 7, w, h + 7);
    switch (o.variant) {
      case 'wheel': {
        const cx = x + 22, cy = y - 12;
        ellipse(c, '#473f39', cx, cy, 11, 11);
        ellipse(c, '#ab8755', cx, cy, 9, 9);
        ellipse(c, '#5d5546', cx, cy, 7, 7);
        for (let i = 0; i < 6; i++) {
          const a = t * 0.55 + i * Math.PI / 3;
          line(c, '#c5a676', 2, [[cx, cy], [cx + Math.cos(a) * 9, cy + Math.sin(a) * 9]]);
        }
        rect(c, '#dfc38e', cx - 1, cy - 1, 3, 3);
        break;
      }
      case 'beacon':
      case 'kiln': {
        const beacon = o.variant === 'beacon', cx = x + (beacon ? 2 : -4), cy = y - (beacon ? 39 : 10);
        const pulse = (1 + Math.sin(t * 2.8)) / 2;
        glow(c, cx, cy, beacon ? 25 : 16, beacon ? '#ffe6a6' : '#ff963f', 0.32 + pulse * 0.14);
        rect(c, beacon ? '#fff4bc' : '#ffc067', cx - 2, cy - 1, 4, 3);
        break;
      }
      case 'ring': {
        for (let i = 0; i < 3; i++) {
          const a = t * 0.4 + i * 2.0944;
          rect(c, '#f2d089', x + 15 * Math.cos(a), y - 27 + 6 * Math.sin(a), 2, 2);
        }
        break;
      }
    }
    return;
  }
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
  if (map.plan) {
    s.monuments = bitmap(base + 'district-monuments.webp');
    s.fittings = bitmap(base + 'district-props.webp');
  }
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
    if (map.region===1) harborGulls(ctx,map.spawn.x+30,map.spawn.y-63,t);
    const site = map.dots.site;
    mark(ctx, site.x, site.y - 44, 'talk', t);
    for (const d of dots) {
      if (d.kind === 'ship') mark(ctx, d.x + 8, d.y - 16, 'talk', t);
      if (d.kind === 'landmark') mark(ctx, d.x, d.y - 56, 'talk', t);
    }
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

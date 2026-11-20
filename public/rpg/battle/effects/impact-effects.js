// All positions are in the stage's 168-pixel-high coordinate system.
// Each drawing is a pure sample of the turn clock, including the debris paths.
const TAU = Math.PI * 2;
const unit = (v) => Math.max(0, Math.min(1, v));
const sweep = (v) => 1 - (1 - unit(v)) ** 3;
const pixel = Math.round;
const gold = ['#6b4938', '#d78d4f', '#ffdc87', '#fff6cb'];
const jade = ['#205050', '#3d9287', '#8cdbc0', '#e2ffda'];
const vermilion = ['#603e3d', '#c3674d', '#ffc08a', '#fff0ca'];
const bark = ['#4b4433', '#9a7650', '#dfbd7c'];
const leaf = ['#365a44', '#76a66c', '#c2d68b'];

function shape(ctx, vertices, color, close = true, width = 1) {
  ctx.beginPath();
  for (let i = 0; i < vertices.length; i++) {
    const [x, y] = vertices[i];
    if (!i) ctx.moveTo(pixel(x), pixel(y));
    else ctx.lineTo(pixel(x), pixel(y));
  }
  if (close) {
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function line(ctx, vertices, color, width = 1) {
  shape(ctx, vertices, color, false, width);
}

// The two edges taper independently, as on a hand-painted slash cel.
function blade(ctx, x, y, dx, dy, halfWidth, color, bend = 0) {
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length, ny = dx / length;
  const mx = x + dx * .38 + nx * bend, my = y + dy * .38 + ny * bend;
  shape(ctx, [[x, y], [mx + nx * halfWidth, my + ny * halfWidth],
    [x + dx, y + dy], [mx - nx * halfWidth * .55, my - ny * halfWidth * .55]], color);
}

function arc(ctx, x, y, rx, ry, start, end, color, width = 1) {
  ctx.beginPath();
  ctx.ellipse(pixel(x), pixel(y), Math.max(.5, rx), Math.max(.5, ry), 0, start, end);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

// Water escapes through both sides of the wooden sluice. Draw tapered sheets
// with a dark underside, a saturated body and individual whitecaps on the lip.
function sluiceSpray(ctx, x, y, t) {
  const life = unit((t - 12) / 585);
  if (life <= 0 || life >= 1) return;
  const head = sweep(life * 2);
  const tail = unit((life - .38) / .62);
  for (const side of [-1, 1]) {
    const spread = side === 1 ? 72 : 57;
    const height = side === 1 ? 47 : 29;
    const palette = side === 1 ? ['#18424a','#119eaa','#86f5dc','#f1ffdf'] :
      ['#674637','#cf8943','#ffd47d','#ffffcc'];
    const top = [], base = [];
    for (let i = 0; i <= 14; i++) {
      const u = tail + (head - tail) * i / 14;
      const foam = Math.sin(i / 14 * Math.PI);
      const px = x + side * (4 + spread * u);
      const py = y + 8 - height * Math.sin(u * Math.PI * .91) + 25 * u * u + (side < 0 ? 4 : -4) * u;
      const thickness = foam * (7 + 6 * Math.sin(u * Math.PI));
      top.push([px, py - thickness * .44]);
      base.unshift([px - side * 2 * foam, py + thickness * .56]);
    }
    ctx.globalAlpha = unit((1 - life) * 3.3);
    const silhouette = [...top, ...base];
    line(ctx, [...silhouette, top[0]], palette[0], 2.8);
    shape(ctx, silhouette, palette[1]);
    const vein = top.map(([px, py], i) => [px, py * .56 + base[14 - i][1] * .44]);
    shape(ctx, [...top, ...vein.reverse()], palette[2]);
    line(ctx, top.slice(3, 12), palette[3], 2);
    for (let i = 0; i < 3; i++) {
      const u = unit((life * 1.44) - i * .08);
      const px = x + side * (5 + (spread + 3 + 5 * i) * u);
      const py = y - (height + 27 + 4 * i) * u + (height + 35) * u ** 2;
      blade(ctx, px, py, side * (5 + i), -2 + 6 * u, 1.8, palette[2]);
    }
  }
}

// Stagger the rings across the boardwalk. Drawing short foam crests against an
// outlined near rim keeps the perspective readable on light timber and grass.
function groundWave(ctx, x, ground, t, astral) {
  for (let i = 0; i < 3; i++) {
    const age = (t - 58 - i * 73) / (astral ? 370 : 425);
    if (age <= 0 || age >= 1) continue;
    const expand = sweep(age);
    const cx = x + [0, -4, 5][i], cy = ground - 1 + i * 1.4;
    const rx = 7 + (67 - 7 * i) * expand, ry = 1 + (11 - 1.2 * i) * expand;
    const start = .13 + i * .13, end = 2.96 - i * .09;
    ctx.globalAlpha = unit(age * 12) * unit((1 - age) * 3);
    arc(ctx, cx, cy + .6, rx, ry, start, end, astral ? '#554a41' : '#284a45', 3);
    arc(ctx, cx, cy, rx, ry, start, end, astral ? '#fac76f' : '#85e5c8', 1.7);
    arc(ctx, cx, cy, rx, ry, .28 + i * .15, .91 + i * .17, '#fff0be', 1.6);
    arc(ctx, cx, cy, rx, ry, 3.25, 3.99 + i * .12, astral ? '#ddb779' : '#4fa898');
    if (astral) {
      for (let j = 0; j < 5; j++) {
        const a = (j + .35) * TAU / 5 + i * .77;
        const px = cx + rx * Math.cos(a), py = cy + ry * Math.sin(a) - 2 - 6 * age;
        blade(ctx, px, py - 2, 0, 5, 1.4, '#ffda83');
        ctx.fillStyle = '#ffffd2';
        ctx.fillRect(pixel(px) - 1, pixel(py), 3, 1);
      }
    }
  }
}

function contact(ctx, x, y, time, size, palette) {
  const life = unit(time / 150);
  if (life === 1) return;
  const scale = size * (.6 + .4 * Math.sin(Math.PI * Math.min(1, life * 2))) * (1 - life);
  ctx.globalAlpha = 1 - life * .55;
  // Short directional core, drawn over the outer shape to retain an ink edge.
  blade(ctx, x - scale * .35, y + scale * .16, scale * 1.8, -scale * .86, scale * .21, palette[1]);
  blade(ctx, x, y + scale * .43, scale * .1, -scale * 1.3, scale * .12, palette[2]);
  blade(ctx, x - scale * .42, y + scale * .14, scale * 1.34, -scale * .45, scale * .115, palette[3]);
  const r = Math.max(1, pixel(scale * .12));
  ctx.fillStyle = palette[3];
  ctx.fillRect(pixel(x) - r, pixel(y) - r, 2 * r + 1, 2 * r + 1);
}

function splinters(ctx, x, y, t, willow, strong) {
  const count = strong ? 13 : 7;
  for (let i = 0; i < count; i++) {
    const flight = (t - (i % 4) * 12) / (strong ? 550 : 370);
    if (flight < 0 || flight >= 1) continue;
    const angle = .34 + i * 2.4;
    const distance = (strong ? 58 : 24) * (.55 + (i * 3 % 7) * .09) * sweep(flight);
    const px = x + Math.cos(angle) * distance + flight * 9;
    const py = y + Math.sin(angle) * distance * .83 - 12 * flight + 23 * flight ** 2;
    const spin = angle + flight * (i % 2 ? 3.4 : -4.4);
    const size = (willow ? 6 : 4) * (1.1 - flight * .64);
    const dx = Math.cos(spin) * size, dy = Math.sin(spin) * size;
    const palette = willow ? (i % 3 ? bark : leaf) : gold;
    ctx.globalAlpha = unit((1 - flight) * 2.6);
    if (strong && willow && i % 3 === 0) {
      const lx = Math.cos(spin) * 11, ly = Math.sin(spin) * 11;
      blade(ctx, px - lx * .58, py - ly * .58, lx * 1.15, ly * 1.15, 4.2, '#223f39', 1.6);
      blade(ctx, px - lx * .45, py - ly * .45, lx * .92, ly * .92, 2.6, '#8bb768', 1.2);
      line(ctx, [[px - lx * .32, py - ly * .32], [px + lx * .39, py + ly * .39]], '#dce494');
      continue;
    }
    blade(ctx, px - dx * .5, py - dy * .5, dx, dy, willow ? 1.5 : 1, palette[0]);
    line(ctx, [[px - dx * .5, py - dy * .5], [px + dx * .42, py + dy * .42]], palette[2]);
    if (i % 3 === 1 && flight < .74) {
      ctx.fillStyle = palette[1];
      ctx.fillRect(pixel(px - Math.cos(angle) * 4), pixel(py - Math.sin(angle) * 4), 2, 1);
    }
  }
}

// Cast-brass latch with six teeth. The seams open first, then the two halves
// and individual teeth peel away on slightly different ballistic arcs.
function brokenLatch(ctx, x, y, t) {
  const flight = unit(t / 650);
  const opening = sweep((t - 24) / 400);
  const radius = 17 + opening * 7;
  const gravity = 26 * flight ** 2;
  ctx.globalAlpha = unit((1 - flight) * 3.1);
  for (let i = 0; i < 6; i++) {
    const mid = (i + .5) * TAU / 6 - 1.75;
    const slide = (15 + (i % 3) * 6) * opening;
    const ox = x + Math.cos(mid) * slide;
    const oy = y + 5 + Math.sin(mid) * slide * .62 + gravity - opening * 5;
    const rot = mid + opening * (i % 2 ? .4 : -.37);
    const point = (angle, r) => [ox + Math.cos(rot + angle) * r, oy + Math.sin(rot + angle) * r * .88];
    const edge = [point(-.44, radius), point(-.22, radius), point(-.18, radius + 6),
      point(.14, radius + 6), point(.18, radius), point(.42, radius)];
    const slab = [...edge, point(.39, radius - 6), point(0, radius - 7), point(-.42, radius - 6)];
    shape(ctx, slab.map(([px, py]) => [px + 1.5, py + 2.3]), '#453e39');
    line(ctx, [...slab, edge[0]], '#4d3e3c', 2.6);
    shape(ctx, slab, i % 2 ? '#d89850' : '#e3b263');
    line(ctx, edge.slice(0, 5), '#ffdf8d', 1.8);
    line(ctx, [point(-.15, radius + 5), point(.11, radius + 5)], '#fffcce', 2.4);
    line(ctx, [point(-.39, radius - 4), point(-.02, radius - 5), point(.37, radius - 4)], '#995b3c');
    const [bx, by] = point(.0, radius - 2);
    ctx.fillStyle = '#53584b'; ctx.fillRect(pixel(bx) - 1, pixel(by) - 1, 3, 3);
    ctx.fillStyle = '#c2f1be'; ctx.fillRect(pixel(bx) - 1, pixel(by) - 1, 2, 1);
  }
  // A pressure ripple expands into the air between the departing fragments.
  if (t < 280) {
    const outward = sweep(t / 280);
    ctx.globalAlpha = (1 - outward) * .8;
    arc(ctx, x, y, 8 + outward * 26, 6 + outward * 18, .1, 2.7, jade[3], 2);
    arc(ctx, x, y, 8 + outward * 26, 6 + outward * 18, 3.3, 6, jade[2]);
  }
}

function signatureWake(ctx, x, y, t, role) {
  const expand = sweep(t / 320);
  ctx.globalAlpha = unit((540 - t) / 290);
  if (role === 'ranger') {
    for (const [offset, length] of [[-4, 32], [0, 54], [4, 27]]) {
      blade(ctx, x + 3 + expand * 10, y + offset, length * expand, -6 * expand, 1.4,
        offset ? jade[2] : gold[3], offset * .6);
    }
  } else if (role === 'vanguard') {
    for (const sign of [-1, 1]) {
      blade(ctx, x - 22 * expand, y + sign * 19 * expand, 47 * expand, -sign * 39 * expand,
        1 + 3 * (1 - expand), sign === 1 ? gold[3] : vermilion[2], sign * 5);
    }
  } else {
    // Let the falling lance travel a short distance through the core. The
    // warm perpendicular flare and the cool tapered afterimage share one peak.
    if (t < 345) {
      const hold = unit((345 - t) / 190);
      const travel = sweep(t / 275);
      const ax = x - 29 * hold, ay = y - 26 * hold;
      const dx = 36 * hold + 28 * travel, dy = 34 * hold + 23 * travel;
      ctx.globalAlpha = hold;
      blade(ctx, ax, ay, dx, dy, 5.4, '#244e58');
      blade(ctx, ax + 1, ay, dx - 2, dy, 3.9, '#50d4d0');
      blade(ctx, ax + 3, ay + 2, dx - 5, dy - 3, 2.1, '#f4ffd3');
      blade(ctx, x - 18 * hold, y + 9 * hold, 39 * hold, -18 * hold, 3.2, '#efae58');
      blade(ctx, x - 15 * hold, y + 7 * hold, 32 * hold, -15 * hold, 1.6, '#fffac3');
      shape(ctx, [[x-4,y], [x,y-5], [x+4,y], [x,y+5]], '#fff6ca');
    }
    const radius = 7 + 30 * expand;
    ctx.globalAlpha = unit((545 - t) / 225);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + .26 + expand * .26;
      const b = a + .95;
      arc(ctx, x, y, radius, radius * .72, a + .15, b, '#235a58', 3);
      arc(ctx, x, y, radius, radius * .72, a + .15, b, '#9ce9c8', 1.65);
      const px = x + Math.cos(a) * radius, py = y + Math.sin(a) * .72 * radius;
      blade(ctx, px, py - 4, 0, 8, 1.5, gold[2]);
      blade(ctx, px - 3, py, 6, 0, 1, jade[3]);
    }
  }
}

export function drawEnemyImpact(ctx, { at, elapsed, receipt, action, role, encounterId, groundY }) {
  const broken = Boolean(receipt?.tactics?.broke_shield);
  const burst = action === 'burst';
  const critical = Boolean(receipt?.critical);
  const life = broken ? 650 : burst || critical ? 560 : 430;
  if (!(receipt?.damage_dealt > 0 || broken) || elapsed < 0 || elapsed >= life) return;
  const { x, y } = at;
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'bevel';
  if (broken || burst) {
    groundWave(ctx, x, groundY ?? y + 38, elapsed, role === 'arcanist' && burst);
  }
  if (broken && encounterId === 'willow_lock') sluiceSpray(ctx, x, y, elapsed);
  if (burst) signatureWake(ctx, x, y, elapsed, role);
  if (broken) brokenLatch(ctx, x, y, elapsed);
  if (critical && elapsed < 420) {
    const extend = 12 + 25 * sweep(elapsed / 150);
    ctx.globalAlpha = unit((420 - elapsed) / 230);
    blade(ctx, x - extend * .6, y + extend * .39, extend * 1.6, -extend * .95, 2, vermilion[2], -6);
    line(ctx, [[x + 3, y - 2], [x + extend * .46, y - extend * .43],
      [x + extend * .35, y - extend * .45], [x + extend * .54, y - extend * .73]], gold[3]);
  }
  splinters(ctx, x, y, elapsed, encounterId === 'willow_lock', burst || critical || broken);
  contact(ctx, x, y, elapsed, broken || burst ? 31 : critical ? 26 : 17, burst ? jade : gold);
  ctx.restore();
}

function rootPath(from, to, u) {
  const lift = Math.sin(Math.PI * u);
  return [from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u +
    lift * (17 + 6 * Math.sin(u * Math.PI * 2.7))];
}

function counterTrail(ctx, from, to, t, willow) {
  const travel = unit((t + 300) / 300);
  const front = travel ** 1.38;
  const pos = (u) => willow ? rootPath(from, to, u) :
    [from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u - 8 * Math.sin(u * Math.PI)];
  const tail = unit(front - (willow ? .56 : .21) * Math.min(1, (100 - t) / 100));
  const spine = [];
  for (let i = 0; i <= 12; i++) spine.push(pos(tail + (front - tail) * i / 12));
  ctx.globalAlpha = unit((t + 300) / 60) * unit((100 - t) / 100);
  line(ctx, spine, willow ? '#334c43' : vermilion[0], willow ? 5.5 : 3);
  line(ctx, spine.map(([x, y]) => [x, y - 1]), willow ? '#ac9963' : vermilion[2], willow ? 3 : 1.5);
  if (willow) line(ctx, spine.slice(-5).map(([x, y]) => [x, y - 2]), '#d7e39a', 1.4);
  if (willow) {
    for (const knot of [.2, .4, .59, .77, .89]) {
      if (knot <= tail || knot >= front) continue;
      const [x, y] = pos(knot);
      const tip = unit((front - knot) / .09);
      const rise = (6 + 4 * Math.sin(knot * 22)) * tip;
      line(ctx, [[x + 3, y], [x - 3, y - 3], [x - 6, y - rise], [x - 10, y - rise - 2]], bark[0], 2);
      blade(ctx, x - 4, y - 2, -5, -rise, 1.5, leaf[2], 1);
    }
  }
  const [x, y] = spine.at(-1);
  blade(ctx, x + 7, y + 2, -12, -3.4, 2.8, willow ? '#a3ebc4' : gold[2]);
}

function ward(ctx, x, y, t) {
  const ring = sweep(t / 390);
  const fade = unit((445 - t) / 235);
  ctx.globalAlpha = fade;
  // Convex shield profiles outward toward the incoming enemy on the right.
  const edge = [[x - 3, y - 16], [x + 6, y - 13], [x + 12, y - 5],
    [x + 12, y + 5], [x + 6, y + 13], [x - 3, y + 18]];
  ctx.globalAlpha = fade * .3;
  shape(ctx, [...edge, [x + 1, y + 7], [x + 2, y - 5]], jade[1]);
  shape(ctx, [[x + 1, y - 9], [x + 8, y - 7], [x + 11, y], [x + 5, y + 1]], jade[3]);
  ctx.globalAlpha = fade;
  line(ctx, edge, jade[0], 3);
  line(ctx, edge, jade[3], 1.4);
  line(ctx, [[x, y - 13], [x + 7, y - 7], [x + 9, y], [x + 7, y + 7], [x, y + 14]], gold[2]);
  arc(ctx, x + 1, y, 14 + ring * 15, 10 + ring * 13, -.96, .96, jade[2]);
  blade(ctx, x + 11, y - 4, 0, 9, 2, gold[3]);
}

export function drawEnemyCounter(ctx, { from, to, elapsed, receipt, encounterId }) {
  const blocked = receipt?.damage_blocked > 0, hurt = receipt?.damage_received > 0;
  if ((!blocked && !hurt) || elapsed < -300 || elapsed >= 450) return;
  ctx.save();
  ctx.lineJoin = 'bevel';
  const guard = blocked && receipt.correct === true && receipt.skill === 'guard';
  const contactAt = {x: to.x + (guard ? 10 : 1), y: to.y};
  if (elapsed < 100) counterTrail(ctx, from, contactAt, elapsed, encounterId === 'willow_lock');
  if (elapsed >= 0) {
    if (guard) ward(ctx, to.x + 1, to.y, elapsed);
    const palette = guard ? jade : hurt ? vermilion : gold;
    const travel = sweep(elapsed / 400);
    for (let i = 0; i < 7; i++) {
      const angle = (guard ? -.96 : 2.24) + i * .34;
      const dist = (15 + i % 3 * 5) * travel;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const x = contactAt.x + dx * dist, y = contactAt.y + dy * dist + 5 * travel ** 2;
      ctx.globalAlpha = unit((410 - elapsed) / 210);
      blade(ctx, x - dx * 3, y - dy * 3, dx * 7, dy * 7, 1, palette[i % 2 + 1]);
    }
    if (guard && hurt) {
      ctx.globalAlpha = unit((260 - elapsed) / 140);
      blade(ctx, to.x - 2, to.y + 1, -7 - 6 * travel, 5, 1.5, vermilion[2]);
    }
    contact(ctx, contactAt.x, contactAt.y, elapsed, guard ? 13 : 17, palette);
  }
  ctx.restore();
}

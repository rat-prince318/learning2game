// A transparent layer between the painted ferry and the actors. Light catches the
// water and the deck in different patterns, leaving the silhouettes in front of both.
const colors = {
  arcanist: ['101,225,224', '255,224,144'],
  ranger: ['160,220,135', '255,224,140'],
  vanguard: ['249,159,90', '255,221,151'],
  guard: ['112,223,196', '255,228,157'],
};
const clamp = n => Math.max(0, Math.min(1, n));
function pool(ctx, x, y, rx, ry, color, intensity) {
  if (intensity < .01) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, 'rgba(' + color + ',' + intensity + ')');
  gradient.addColorStop(.42, 'rgba(' + color + ',' + intensity * .46 + ')');
  gradient.addColorStop(1, 'rgba(' + color + ',0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

export function drawFerryLight(ctx, {width, from, to, role, action, clock, impactAt, outgoing, broken}) {
  if (!outgoing) return;
  const burst = action === 'burst', guard = action === 'guard';
  const beat = clock / impactAt, after = clock - impactAt;
  const trail = clamp(1 - Math.max(0, after)/480);
  if (trail <= 0) return;
  const [hue, gold] = colors[guard ? 'guard' : role];
  const buildup = Math.sin(Math.PI * .5 * clamp(beat / .68)) * trail;
  const impact = after < 0 ? 0 : Math.exp(-after / (broken || burst ? 220 : 115));
  const sweep = clamp((beat - .42) / .58);
  const x = from.x + (to.x - from.x) * sweep;
  const power = buildup * (burst ? .53 : guard ? .26 : .17);
  pool(ctx, from.x + 5, from.y - 2, burst ? 36 : 23, 27, hue, power * (1 - sweep));
  if (burst && role === 'arcanist') {
    const gateX = from.x + (to.x-from.x)*.44;
    pool(ctx,gateX,34,52,33,hue,power*(1-clamp((beat-.77)/.34)));
  }
  pool(ctx, to.x, to.y, broken || burst ? 48 : 27, broken || burst ? 41 : 25, gold, impact * .54);
  pool(ctx, x, 141, burst || broken ? 47 : 28, 4, gold, power*.65 + impact*.26);
  // Specular reflections sit along the river's painted horizontal ripples;
  // no projected light crosses the warrior or the keeper in the foreground.
  ctx.save();
  const spread = burst || broken ? 30 : 16;
  for (let i = 0; i < 16; i++) {
    const row = (i * 7) % 17;
    const px = x + Math.sin(i * 4.76) * spread + Math.sin(clock / 220 + i) * 2;
    if (px < 0 || px > width) continue;
    const alpha = (power + impact*.25) * (.30 + .22*Math.sin(clock/160+i));
    ctx.fillStyle = 'rgba(' + (i % 3 ? hue : gold) + ',' + alpha + ')';
    ctx.fillRect(Math.round(px), Math.floor(92 + row * 1.45), 2 + row % 6, 1);
  }
  ctx.restore();
}

// All dimensions use the battle stage's 168-pixel-high coordinate system.
// Effects sample elapsed time directly so skipped frames never alter a trajectory.
const TAU = Math.PI * 2;
const unit = (n) => Math.max(0, Math.min(1, n));
const ramp = (n, from, to) => unit((n - from) / (to - from));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

const starInk = { dark:'#205664', body:'#5bd4cb', edge:'#baffdf', light:'#fff6cf', gold:'#f6be6a' };
const bowInk = { dark:'#214e54', body:'#5ebca2', edge:'#c8f6cd', light:'#fff8cd', gold:'#f6c678' };
const steel = { dark:'#604248', body:'#d68558', edge:'#ffce85', light:'#fff5cb', gold:'#edab63' };

function stroke(ctx, points, color, width = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let k = 1; k < points.length; k++) ctx.lineTo(points[k].x, points[k].y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function fill(ctx, points, color) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let k = 1; k < points.length; k++) ctx.lineTo(points[k].x, points[k].y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function glint(ctx, x, y, radius, color) {
  const arm = radius * .24;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + arm, y - arm);
  ctx.lineTo(x + radius * .79, y);
  ctx.lineTo(x + arm, y + arm);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - arm, y + arm);
  ctx.lineTo(x - radius * .79, y);
  ctx.lineTo(x - arm, y - arm);
  ctx.closePath();
  ctx.fill();
}

function polar(x, y, rx, ry, a) {
  return { x:x + Math.cos(a) * rx, y:y + Math.sin(a) * ry };
}

function arc(ctx, x, y, rx, ry, from, to, color, width = 1) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, from, to);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

// A broad, brush-shaped blade with a narrow base and a pointed leading edge.
function crescent(ctx, x, y, rx, ry, start, sweep, thickness, color) {
  const outside = [], inside = [];
  for (let i = 0; i <= 20; i++) {
    const f = i / 20;
    const a = start + sweep * f;
    const width = thickness * Math.sin(Math.PI * f) ** .8;
    outside.push(polar(x, y, rx, ry, a));
    inside.push(polar(x, y, rx - width, ry - width, a));
  }
  fill(ctx, outside.concat(inside.reverse()), color);
}

// Build a tapered strip normal to a curved trajectory. Both ends taper so a
// trail can continue to contract into the contact point after the bolt lands.
function ribbon(ctx, path, head, length, thickness, color, offset = 0) {
  const start = Math.max(0, head - length), end = Math.min(1, head);
  if (end <= start) return;
  const left = [], right = [];
  for (let i = 0; i <= 15; i++) {
    const f = i / 15, t = mix(start, end, f);
    const p = path(t), p2 = path(t + .002);
    const dx = p2.x - p.x, dy = p2.y - p.y;
    const span = Math.hypot(dx, dy) || 1;
    const nx = -dy / span, ny = dx / span;
    const half = thickness * Math.sin(Math.PI * (.06 + f * .94)) ** .65 * (.3 + .7 * f);
    left.push({x:p.x + nx * (offset + half), y:p.y + ny * (offset + half)});
    right.push({x:p.x + nx * (offset - half), y:p.y + ny * (offset - half)});
  }
  fill(ctx, left.concat(right.reverse()), color);
}

function arcPath(a, b, height) {
  return (t) => ({
    x:mix(a.x, b.x, t),
    y:mix(a.y, b.y, t) - Math.sin(t * Math.PI) * height,
  });
}

function dial(ctx, x, y, size, rotation, strength) {
  if (strength <= 0 || size < 1) return;
  ctx.save();
  ctx.globalAlpha *= strength;
  const ry = size * .79;
  const teeth = 4;
  // An interrupted outer rim keeps the user's eye on the bright central star.
  for (let k = 0; k < teeth; k++) {
    const a = rotation + k * TAU / teeth;
    arc(ctx, x, y, size, ry, a + .09, a + TAU / teeth - .15, starInk.dark, 2.9);
    arc(ctx, x, y, size, ry, a + .09, a + TAU / teeth - .15, k % 2 ? starInk.edge : starInk.gold);
    stroke(ctx, [polar(x,y,size*.85,ry*.85,a), polar(x,y,size*1.09,ry*1.09,a)], starInk.light);
  }
  const diamond = Array.from({length:5}, (_,k) =>
    polar(x, y, size*.73, ry*.73, -rotation + k*Math.PI/2));
  stroke(ctx, diamond, starInk.body);
  ctx.restore();
}

function shootingStar(ctx, path, head, size) {
  if (head <= 0 || head > 1.38) return;
  ctx.save();
  ctx.globalAlpha *= .28;
  ribbon(ctx, path, head, .44, size * 1.3, starInk.body);
  ctx.restore();
  ribbon(ctx, path, head, .37, size * .8, starInk.dark);
  ribbon(ctx, path, head, .33, size * .53, starInk.body);
  ribbon(ctx, path, head, .27, size * .19, starInk.light, -.4);
  if (head >= 1) return;
  const p = path(head);
  glint(ctx, p.x, p.y, size * 1.5, starInk.dark);
  glint(ctx, p.x, p.y, size * 1.12, starInk.gold);
  glint(ctx, p.x, p.y, size * .71, starInk.light);
}

// A tilted armillary sphere. Three separate orbital planes make the brass
// armature legible even in the middle of the launch, when the core has left.
function skyArmature(ctx, gate, radius, beat, opacity) {
  if (radius < 1 || opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.translate(gate.x,gate.y);
  const halo = ctx.createRadialGradient(0,0,0,0,0,radius*1.4);
  halo.addColorStop(0,'#123e51bb');
  halo.addColorStop(.57,'#19495c82');
  halo.addColorStop(1,'#71e9d100');
  ctx.fillStyle = halo;
  ctx.fillRect(-radius*1.4,-radius*1.4,radius*2.8,radius*2.8);
  for (const [tilt, depth, color] of [[-.58,.41,starInk.gold],[.81,.42,starInk.body],[-.19,.83,starInk.gold]]) {
    ctx.save();
    ctx.rotate(tilt);
    const ry = radius*depth;
    arc(ctx,0,0,radius,ry,0,TAU,starInk.dark,3.25);
    arc(ctx,0,0,radius,ry,0,TAU,color,1.65);
    arc(ctx,0,0,radius,ry,Math.PI,Math.PI*1.65,starInk.light,.8);
    for (let i=0;i<8;i++) {
      const a = i*TAU/8 + beat*.34;
      const pin = polar(0,0,radius,ry,a);
      ctx.fillStyle = i%2 ? color : starInk.light;
      ctx.fillRect(Math.round(pin.x)-1,Math.round(pin.y)-1,2,2);
    }
    ctx.restore();
  }
  const stars = [[-.64,-.10],[-.30,-.39],[.04,-.21],[.17,-.48],[.46,-.1],[.34,.31]];
  const map = stars.map(([x,y])=>({x:x*radius,y:y*radius}));
  stroke(ctx,map,'#81c9bd',.7);
  for (const p of map) glint(ctx,p.x,p.y,1.8,starInk.light);
  const turn = beat*.75;
  for (let i=0;i<4;i++) {
    const a = i*TAU/4+turn;
    const pin = polar(0,0,radius*1.1,radius*.96,a);
    const outer = polar(0,0,radius*1.21,radius*1.08,a);
    stroke(ctx,[pin,outer],starInk.gold,1.08);
    glint(ctx,pin.x,pin.y,i%2 ? 2.4 : 3.6,starInk.light);
  }
  ctx.restore();
}

function meteorCore(ctx, p, angle, scale) {
  ctx.save();
  ctx.translate(p.x,p.y);
  ctx.rotate(angle);
  ctx.scale(scale,scale);
  // The nose points along the velocity vector. Asymmetrical rock facets are
  // surrounded by a hot leading rim and a torn flame on the trailing side.
  fill(ctx,[{x:-31,y:-6},{x:-18,y:-4},{x:-28,y:-12},{x:-11,y:-8},
    {x:-7,y:-12},{x:3,y:-9},{x:10,y:-5},{x:12,y:1},{x:8,y:7},{x:2,y:10},
    {x:-6,y:9},{x:-21,y:14},{x:-15,y:6},{x:-30,y:8},{x:-21,y:2}], '#235867');
  fill(ctx,[{x:-25,y:-8},{x:-11,y:-5},{x:-12,y:-10},{x:-3,y:-9},
    {x:5,y:-7},{x:10,y:-3},{x:10,y:4},{x:3,y:8},{x:-17,y:11},
    {x:-10,y:5},{x:-23,y:5},{x:-13,y:0}], '#50cabc');
  fill(ctx,[{x:-17,y:-5},{x:-5,y:-8},{x:2,y:-8},{x:9,y:-4},
    {x:11,y:1},{x:7,y:6},{x:0,y:8},{x:-12,y:7},{x:-7,y:3},{x:-15,y:1}], '#ffe19b');
  fill(ctx,[{x:-7,y:-4},{x:-2,y:-6},{x:5,y:-4},{x:8,y:0},
    {x:4,y:4},{x:-3,y:6},{x:-9,y:2}], '#ac6947');
  fill(ctx,[{x:-5,y:-3},{x:-1,y:-5},{x:5,y:-3},{x:1,y:0},{x:-3,y:0}], '#f9af64');
  fill(ctx,[{x:-6,y:1},{x:-2,y:2},{x:0,y:5},{x:-4,y:4}], '#724e48');
  stroke(ctx,[{x:-8,y:1},{x:-2,y:-1},{x:1,y:1},{x:5,y:-3}], '#ffefb0',1.15);
  stroke(ctx,[{x:7,y:-4},{x:10,y:-1},{x:10,y:2},{x:6,y:6}], '#fff9d3',1.8);
  ctx.restore();
}

function fallingComet(ctx, gate, target, beat) {
  const fall = (beat-.46)/.54;
  if (fall <= 0 || fall >= 1.64) return;
  const path = arcPath(gate,target,10);
  // Trails unroll from the same portal and persist after the nose has landed.
  ctx.save();
  ctx.globalAlpha *= .31;
  ribbon(ctx,path,fall,1.15,12,'#55d9bb');
  ctx.restore();
  ribbon(ctx,path,fall,1,8.1,'#235363');
  ribbon(ctx,path,fall,.93,5.9,'#53bcae',-1.2);
  ribbon(ctx,path,fall,.87,3.4,'#a7efc6',-1.9);
  ribbon(ctx,path,fall,.71,1.5,'#fff0ab',-1.3);
  // Both splinters land at t=1. Offset releases make them trail the stone
  // during flight while their bends converge on the single damage receipt.
  for (const [delay,bend,ink] of [[.15,-22,starInk.gold],[.28,23,starInk.edge]]) {
    const progress = (fall-delay)/(1-delay);
    if (progress <= 0) continue;
    const flank = t => {
      const p = path(t);
      return {x:p.x+Math.sin(Math.PI*t)*bend*.4,y:p.y+Math.sin(Math.PI*t)*bend};
    };
    ribbon(ctx,flank,progress,.70,2.3,starInk.dark);
    ribbon(ctx,flank,progress,.66,1.2,ink);
    if (progress < 1) {
      const p = flank(progress), tail = flank(Math.max(0,progress-.085));
      stroke(ctx,[tail,p],starInk.dark,2.7);
      stroke(ctx,[tail,p],ink,1.35);
      glint(ctx,p.x,p.y,6,starInk.dark);
      glint(ctx,p.x,p.y,4.7,ink);
      glint(ctx,p.x,p.y,2.1,starInk.light);
    }
  }
  if (fall < 1) {
    const p = path(fall), tangent = path(fall+.002);
    meteorCore(ctx,p,Math.atan2(tangent.y-p.y,tangent.x-p.x),.2+.9*smooth(ramp(fall,0,.36)));
  }
}

function arcana(ctx, from, to, beat, burst) {
  const tip = { x:from.x + 8, y:from.y - 7 };
  const charge = smooth(ramp(beat, 0, .37));
  dial(ctx, tip.x, tip.y, (burst ? 14 : 9)*charge, beat * 2.1,
    1 - ramp(beat, .43, .72));
  if (!burst) {
    const path = arcPath(tip, to, 16);
    const flight = (beat - .34) / .66;
    shootingStar(ctx, path, flight, 4.1);
    return;
  }
  // The staff first inscribes a sky seal. A second, steep trajectory carries
  // the comet down from that seal; both routes terminate on visible anchors.
  const radius = Math.min(36, Math.max(22, Math.abs(to.x-tip.x)*.20));
  const gate = {
    x:mix(tip.x,to.x,.40),
    y:Math.max(radius*1.18+2,Math.min(tip.y,to.y)-74),
  };
  const opening = smooth(ramp(beat,.08,.45));
  const sealAlpha = ramp(beat,.08,.29) * (1-ramp(beat,.79,1.14));
  skyArmature(ctx,gate,opening*radius,beat,sealAlpha);
  const feeder = arcPath(tip, gate, 11);
  shootingStar(ctx,feeder,(beat-.12)/.32,3.2);
  fallingComet(ctx,gate,to,beat);
}

function drawBow(ctx, from, beat, burst) {
  const pull = smooth(ramp(beat, 0, .47));
  const alpha = ramp(beat, 0, .09) * (1 - ramp(beat, .53, .76));
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const height = burst ? 22 : 13;
  const x = from.x + 6, y = from.y - 2;
  const top = {x:x-4,y:y-height}, foot = {x:x-4,y:y+height};
  const grip = {x:x+7,y};
  const limbs = [top,{x:x+1,y:y-height+2},{x:x+2,y:y-height*.59},grip,
    {x:x+2,y:y+height*.59},{x:x+1,y:y+height-2},foot];
  stroke(ctx, limbs, bowInk.dark, 3.5);
  stroke(ctx, limbs, bowInk.gold, 1.5);
  const nock = {x:x-5-9*pull,y};
  stroke(ctx, [top,nock,foot], bowInk.edge);
  stroke(ctx, [nock,{x:x+16,y}], bowInk.light, 1.4);
  if (burst) {
    for (const s of [-1,1]) {
      const yTip = y+s*height;
      fill(ctx,[{x:x-3,y:yTip},{x:x-13,y:yTip-s*3},{x:x-8,y:yTip+s*3},
        {x:x-17,y:yTip+s*5},{x:x-1,y:yTip+s*3}],bowInk.edge);
    }
    glint(ctx, nock.x, y, 3 + 3*pull, bowInk.light);
  }
  ctx.restore();
}

function archery(ctx, from, to, beat, burst) {
  drawBow(ctx, from, beat, burst);
  const nock = {x:from.x+5,y:from.y-2};
  const path = arcPath(nock, to, burst ? 3 : 7);
  const flight = (beat - .45) / .55;
  if (flight <= 0) return;
  ribbon(ctx,path,flight,burst ? .63 : .29,burst ? 3.7 : 1.5,bowInk.dark);
  ribbon(ctx,path,flight,burst ? .59 : .26,burst ? 2.2 : .85,bowInk.body);
  ribbon(ctx,path,flight,.39,burst ? .78 : .5,bowInk.light);
  if (burst) {
    for (const side of [-1,1]) {
      const slipstream = t => {
        const p = path(t);
        return {x:p.x, y:p.y + side * 8 * Math.sin(t * Math.PI) * Math.sin(t * Math.PI * 2.1)};
      };
      ribbon(ctx,slipstream,flight,.43,1.1,side > 0 ? bowInk.edge : bowInk.gold);
    }
  }
  if (flight >= 1) return;
  const p = path(flight), tangent = path(flight+.004);
  ctx.save();
  ctx.translate(p.x,p.y);
  ctx.rotate(Math.atan2(tangent.y-p.y,tangent.x-p.x));
  const s = burst ? 1.38 : 1;
  ctx.scale(s,s);
  // Two swept fletchings and an open, barbed head keep the arrow legible at speed.
  fill(ctx,[{x:3,y:0},{x:-6,y:-4},{x:-4,y:-1},{x:-15,y:-1},{x:-20,y:-4},
    {x:-17,y:0},{x:-20,y:4},{x:-15,y:1},{x:-4,y:1},{x:-6,y:4}],bowInk.dark);
  stroke(ctx,[{x:-17,y:0},{x:0,y:0}],bowInk.gold,1.3);
  fill(ctx,[{x:3,y:0},{x:-5,y:-2.8},{x:-3,y:0},{x:-5,y:2.8}],bowInk.light);
  if (burst) {
    for (const side of [-1,1]) {
      fill(ctx,[{x:-4,y:0},{x:-16,y:side*7},{x:-24,y:side*9},{x:-18,y:side*4},
        {x:-29,y:side*5},{x:-18,y:side*1.5}],bowInk.edge);
    }
  }
  ctx.restore();
}

function stepDust(ctx, from, beat, burst) {
  const step = ramp(beat, .12, .83);
  const fade = 1 - ramp(beat, .48, .9);
  if (step <= 0 || fade <= 0) return;
  ctx.save();
  ctx.globalAlpha *= fade;
  for (let i = 0; i < (burst ? 7 : 4); i++) {
    const drift = step * (5 + i * 2.5);
    const x = from.x - drift - (i % 3)*2;
    const y = from.y + 16 - Math.sin(step * Math.PI) * (3 + i%4);
    stroke(ctx,[{x:x-2-i%3,y:y-1},{x,y}],i%2 ? steel.edge : '#d1b088',1.3);
  }
  ctx.restore();
}

function sword(ctx, from, to, beat, burst) {
  stepDust(ctx,from,beat,burst);
  const ready = ramp(beat, .04, .36) * (1-ramp(beat,.36,.52));
  if (ready > 0) {
    ctx.save();
    ctx.globalAlpha *= ready;
    glint(ctx, from.x+9,from.y-10,burst ? 8 : 5,steel.light);
    ctx.restore();
  }
  // The sword traces a lower-left to upper-right cut through the approaching
  // side of the opponent. The burst opens with a short backhand first.
  const distance = Math.abs(to.x - from.x);
  const radius = Math.min(burst ? 40 : 26, distance*.32);
  if (radius < 2) return;
  const alpha = 1 - ramp(beat, 1.02, 1.23);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const x = to.x - 3, y = to.y+2;
  const cut = smooth(ramp(beat, burst ? .63 : .47, 1.01));
  if (cut > 0) {
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(-.76);
    const start = 2.89, sweep = 3.38 * cut;
    crescent(ctx,0,0,radius,radius*.73,start,sweep,burst?8:5,steel.dark);
    crescent(ctx,0,0,radius-.8,radius*.73-.8,start,sweep,burst?6:3.6,steel.body);
    crescent(ctx,0,0,radius-1.4,radius*.73-1.4,start+.045,sweep*.98,burst?3:1.8,steel.light);
    if (burst) crescent(ctx,0,0,radius+4,radius*.73+3,start+.2,sweep*.83,1.2,steel.gold);
    ctx.restore();
  }
  if (burst) {
    const backhand = smooth(ramp(beat,.37,.75));
    const remnant = 1-ramp(beat,.74,1.07);
    if (backhand > 0 && remnant > 0) {
      ctx.globalAlpha *= remnant;
      ctx.translate(x-6,y-2);
      ctx.rotate(.65);
      crescent(ctx,0,0,radius*.83,radius*.52,2.87,-3.1*backhand,4.3,steel.edge);
      crescent(ctx,0,0,radius*.83+2,radius*.52+2,2.8,-2.9*backhand,1.1,steel.light);
    }
  }
  ctx.restore();
}

function ward(ctx, from, to, elapsed, impactAt, incomingAt, hit) {
  const raise = smooth(ramp(elapsed, 0, Math.min(200, impactAt*.48 || 130)));
  const contact = Number.isFinite(incomingAt) ? incomingAt : impactAt;
  const fade = 1 - ramp(elapsed, contact+45, contact+205);
  if (raise <= 0 || fade <= 0) return;
  ctx.save();
  ctx.globalAlpha *= fade;
  const beat = impactAt > 0 ? elapsed / impactAt : 0;
  const pulse = 1-ramp(Math.abs(elapsed-contact),0,110);
  const x = from.x+12, y = from.y;
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(.62+.38*raise,Math.max(.04,raise));
  const tall = 21 + pulse*2, broad = 8.5+pulse;
  const rim = [{x:0,y:-tall},{x:broad,y:-tall*.65},{x:broad+2,y:tall*.05},
    {x:broad*.55,y:tall*.72},{x:-2,y:tall},{x:-3.5,y:tall*.35},{x:-3,y:-tall*.46}];
  ctx.save();
  ctx.globalAlpha *= .61;
  fill(ctx,rim,'#286567');
  ctx.restore();
  stroke(ctx,[...rim,rim[0]],starInk.dark,2.5);
  stroke(ctx,[...rim,rim[0]],starInk.edge,1.05);
  stroke(ctx,[{x:0,y:-tall+3},{x:broad*.67,y:-4},{x:3,y:4},{x:-1,y:tall-4}],starInk.gold);
  glint(ctx,3,0,3.3+pulse*2.6,starInk.light);
  // Four facets catch the incoming light in sequence as the shield opens.
  const rune = 1 - ramp(beat,.48,.83);
  if (rune > 0) {
    ctx.save();
    ctx.globalAlpha *= rune;
    for (let i = 0; i < 4; i++) {
      const a = -1.4 + .83*i;
      arc(ctx,-2.5,0,broad+8,tall+2,a,a+.42,starInk.gold,1.1);
    }
    ctx.restore();
  }
  if (pulse > 0) crescent(ctx,0,0,broad+7,tall+2,-1.22,2.48,1+pulse*1.5,starInk.light);
  ctx.restore();
  if (hit && beat > .42) {
    const fly = (beat-.42)/.58;
    const path = arcPath({x:x+7,y},to,9);
    const flank = (t) => {
      const p = path(t);
      return {x:p.x,y:p.y + Math.sin(t*Math.PI)*4};
    };
    ribbon(ctx,path,fly,.38,3.25,starInk.dark);
    ribbon(ctx,path,fly,.32,1.65,starInk.edge);
    ribbon(ctx,flank,fly,.43,1.05,starInk.gold);
    if (fly < 1) {
      const p = path(fly);
      crescent(ctx,p.x-3,p.y,7.5,13,-1.36,2.72,4.3,starInk.dark);
      crescent(ctx,p.x-2.5,p.y,7,12.5,-1.36,2.72,3,starInk.body);
      crescent(ctx,p.x-2,p.y,7,12,-1.36,2.72,1.5,starInk.light);
      glint(ctx,p.x+3,p.y,2.4,starInk.gold);
    }
  }
  ctx.restore();
}

export function drawHeroEffect(ctx, {role, action, from, to, elapsed, impactAt, incomingAt, hit, isGuard}) {
  if (elapsed < 0 || (!hit && !isGuard)) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (isGuard) {
    ward(ctx,from,to,elapsed,impactAt,incomingAt,hit);
  } else if (impactAt > 0) {
    const beat = elapsed/impactAt, burst = action === 'burst';
    if (beat < 1.4) {
      if (role === 'ranger') archery(ctx,from,to,beat,burst);
      else if (role === 'vanguard') sword(ctx,from,to,beat,burst);
      else arcana(ctx,from,to,beat,burst);
    }
  }
  ctx.restore();
}

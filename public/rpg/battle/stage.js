const asset = (file) => new URL('./art/' + file, import.meta.url).href;
const heroes = new Set(['arcanist', 'ranger', 'vanguard']);
const creatures = new Set(['sprout', 'golem', 'moth']);
const clamp = (n) => Math.max(0, Math.min(1, n));

function element(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function makeActor(side) {
  const body = element('div', 'rpg-stage-actor');
  body.dataset.side = side;
  const image = document.createElement('img');
  image.alt = '';
  image.draggable = false;
  body.append(image);
  return {body, image};
}

// Short synthesized layers keep battle audio local and let the mute switch silence a tail immediately.
function makeAudio() {
  let context, bus, muted = true;
  function unlock() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (muted || !Audio) return;
    try {
      if (!context) {
        context = new Audio();
        bus = context.createGain();
        bus.gain.value = .42;
        bus.connect(context.destination);
      }
      if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch { /* Audio output can be unavailable while the arena remains playable. */ }
  }
  function tone(wave, from, to, duration, volume, offset = 0) {
    if (muted || context?.state !== 'running') return;
    const start = context.currentTime + offset;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + .009);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(envelope).connect(bus);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(start);
    oscillator.stop(start + duration);
  }
  return {
    unlock,
    mute(value) {
      muted = value;
      if (bus) bus.gain.value = muted ? 0 : .42;
      if (!muted) unlock();
    },
    cast(skill) {
      tone('sine', skill === 'burst' ? 375 : 220, 690, .13, .13);
      if (skill === 'burst') tone('triangle', 520, 910, .19, .06, .04);
    },
    hit(heavy, guard = false) {
      tone('triangle', guard ? 490 : 230, guard ? 720 : 52, .09, .23);
      tone('sine', heavy ? 132 : 95, 39, heavy ? .23 : .14, .43);
      tone('square', guard ? 860 : 410, guard ? 620 : 90, .055, .048, .014);
    },
    destroy() { if (context) void context.close().catch(() => {}); }
  };
}

function drawImpact(ctx, x, y, elapsed, heavy, guard) {
  const t = elapsed / (heavy ? 340 : 260);
  if (t < 0 || t >= 1) return;
  const reach = (heavy ? 39 : 25) * (1 - (1 - t) ** 2);
  const colors = guard ? ['#b1fff0','#73d7ca','#efffda'] : ['#fff3bb','#e5a258','#ffdc76'];
  ctx.globalAlpha = 1 - t * .9;
  for (let i = 0; i < (heavy ? 17 : 10); i++) {
    const angle = i * 2.399;
    const distance = reach * (.61 + (i % 5) / 11);
    const dx = Math.cos(angle), dy = Math.sin(angle);
    ctx.fillStyle = colors[i % 3];
    const sx = x + dx * distance;
    const sy = y + dy * distance + 10 * t * t;
    ctx.fillRect(Math.round(sx), Math.round(sy), i % 4 === 0 ? 3 : 2, 2);
    if (i % 2 === 0) {
      ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - dx * (6 - t * 5), sy - dy * (6 - t * 5)); ctx.stroke();
    }
  }
  if (elapsed < (heavy ? 105 : 75)) {
    const arm = (heavy ? 16 : 10) * (1 - t);
    ctx.fillStyle = colors[2];
    ctx.beginPath();
    ctx.moveTo(x - arm, y + 2); ctx.lineTo(x - 2, y - 2); ctx.lineTo(x + 3, y - arm);
    ctx.lineTo(x + 3, y - 2); ctx.lineTo(x + arm, y - 3); ctx.lineTo(x + 2, y + 2);
    ctx.lineTo(x - 4, y + arm); ctx.lineTo(x - 3, y + 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fffae6'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 4);
  }
  ctx.globalAlpha = 1;
}

function projectile(ctx, hero, from, to, t, burst) {
  if (t <= 0 || t >= 1) return;
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * (burst ? 13 : 6);
  if (hero === 'ranger') {
    ctx.strokeStyle = '#ffe49a'; ctx.lineWidth = burst ? 3 : 2;
    ctx.beginPath(); ctx.moveTo(x - 16,y + 1); ctx.lineTo(x + 2,y); ctx.lineTo(x - 2,y - 3); ctx.stroke();
  } else if (hero === 'vanguard') {
    ctx.strokeStyle = burst ? '#fff5ad' : '#f4e5ae'; ctx.lineWidth = burst ? 4 : 2;
    ctx.beginPath(); ctx.arc(to.x - 3, to.y, 17 + t * 4, -2 + t, -.5 + t * 1.7); ctx.stroke();
  } else {
    for (let i = 4; i >= 0; i--) {
      const size = i === 0 ? (burst ? 6 : 4) : 3;
      ctx.fillStyle = ['#fff6bd','#b9f6d0','#73d9b7','#54ae9f','#4b9991'][i];
      ctx.fillRect(Math.round(x - i * 4),Math.round(y + Math.sin(t * 9 + i) * 1.8),size,size);
    }
  }
  ctx.lineWidth = 1;
}

function signature(ctx, role, from, to, t) {
  if (t <= 0 || t >= 1) return;
  ctx.globalAlpha = Math.sin(t * Math.PI);
  ctx.strokeStyle = '#e6f9bc';
  ctx.lineWidth = 2;
  if (role === 'arcanist') {
    // Three star trails converge above the root gate, each arriving a little later.
    for (let i = 0; i < 3; i++) {
      const fall = clamp(t * 1.55 - i * .22);
      const x = to.x + (1 - fall) * (16 + 4 * i);
      const y = to.y - (1 - fall) * (52 + 6 * i);
      ctx.fillStyle = i === 1 ? '#a9eed9' : '#fff0a8';
      ctx.fillRect(Math.round(x), Math.round(y), 4, 4);
      ctx.beginPath(); ctx.moveTo(x+2, y+1); ctx.lineTo(x+7, y-10); ctx.stroke();
    }
  } else if (role === 'ranger') {
    for (const offset of [-8, 6]) {
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t + offset * Math.sin(t * Math.PI);
      ctx.beginPath(); ctx.moveTo(x-13, y+1); ctx.lineTo(x+1, y); ctx.stroke();
    }
  } else {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(to.x-25*t, to.y-20*t); ctx.lineTo(to.x+21*t, to.y+18*t);
    ctx.moveTo(to.x-18*t, to.y+20*t); ctx.lineTo(to.x+20*t, to.y-16*t);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
}

function guardianBlow(ctx, from, to, t, guard) {
  if (t <= 0 || t >= 1) return;
  ctx.strokeStyle = guard ? '#9ecbc0' : '#cb9672';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const at = (p) => [from.x + (to.x - from.x) * p, from.y + (to.y - from.y) * p - Math.sin(p * Math.PI) * 7];
  ctx.moveTo(...at(Math.max(0,t - .1))); ctx.lineTo(...at(t)); ctx.stroke(); ctx.lineWidth = 1;
}

function placeNumber(layer, anchor, label, value, side, still) {
  const node = element('span', 'rpg-stage-number');
  node.dataset.side = side;
  node.style.left = anchor.x * 100 + '%';
  node.style.top = anchor.y * 100 + '%';
  if (label) { const text = document.createElement('em'); text.textContent = label; node.append(text); }
  node.append(document.createTextNode(value));
  layer.append(node);
  if (!still) node.animate?.([
    {translate:'0 3px', opacity:.4}, {offset:.2,translate:'0 -8px',opacity:1},
    {offset:.72,translate:'0 -13px',opacity:1}, {translate:'0 -20px',opacity:.1}
  ], {duration:630, fill:'forwards'});
}

/** Display only the public expedition projection. Every number in a hit comes from its receipt. */
export function createStage(container, preferences = {}) {
  container.classList.add('rpg-stage-host');
  const world = element('div','rpg-stage-world');
  world.setAttribute('role','img');
  const backdrop = element('div','rpg-stage-backdrop');
  const hero = makeActor('hero'), foe = makeActor('foe');
  const tell = element('span','rpg-stage-tell');
  tell.hidden = true;
  foe.body.append(tell);
  const camp = element('img','rpg-stage-camp');
  camp.src = asset('campfire.png'); camp.alt = '';
  const canvas = element('canvas','rpg-stage-canvas');
  const numbers = element('div','rpg-stage-numbers');
  world.append(backdrop,element('div','rpg-stage-shade'),hero.body,foe.body,camp);
  [[11,63],[23,33],[58,47],[64,64],[84,39],[89,59]].forEach(([left,top],i) => {
    const light = element('i','rpg-stage-ember');
    light.style.cssText = 'left:'+left+'%;top:'+top+'%;animation-delay:-'+i*.71+'s';
    world.append(light);
  });
  world.append(canvas,numbers);
  container.append(world);
  const sound = makeAudio(), life = new AbortController();
  let reduced = false, active = null, currentHero = '', currentFoe = '';
  // A UI button may sit outside the stage. The first trusted document gesture also unlocks a saved sound preference.
  for (const type of ['pointerdown','keydown']) container.ownerDocument.addEventListener(type,sound.unlock,
    {capture:true,passive:true, signal:life.signal});
  container.ownerDocument.addEventListener('visibilitychange', () => {
    if (container.ownerDocument.hidden) active?.finish();
  }, {signal:life.signal});
  function setPreferences(next) {
    if (next.muted !== undefined) sound.mute(next.muted);
    if (next.reducedMotion !== undefined) {
      reduced = Boolean(next.reducedMotion);
      world.dataset.reduced = String(reduced);
    }
  }
  function setView(view) {
    const player = view?.battle?.player || view?.player;
    const enemy = view?.battle?.enemy;
    const role = heroes.has(player?.hero_class) ? player.hero_class : 'arcanist';
    const encounter = view?.battle?.tactics?.encounter_id;
    const family = creatures.has(enemy?.sprite) ? enemy.sprite :
      encounter && encounter !== 'willow_lock' ? 'warden' : 'willow';
    if (role !== currentHero) { hero.image.src = asset('hero-' + role + '.png'); currentHero = role; }
    if (family !== currentFoe) {
      foe.image.src = asset(family === 'willow' ? 'willow-keeper.png' : 'foe-' + family + '.png');
      foe.body.dataset.family = family; currentFoe = family;
    }
    const campOpen = view?.phase === 'sidequest';
    const combat = view?.phase === 'combat';
    const tactics = view?.battle?.tactics;
    const intent = tactics?.intent;
    world.dataset.camp = String(campOpen);
    const idle = Boolean(view) && (!combat || !enemy || enemy.hp === 0);
    world.dataset.cleared = String(idle);
    world.dataset.intent = combat ? intent?.id || '' : '';
    tell.hidden = !combat || !enemy || !intent;
    tell.textContent = combat && intent ? [tactics.broken ? '破势' : '',tactics.phase === 2 ? '二阶' : '',intent.name].filter(Boolean).join(' ') : '';
    world.setAttribute('aria-label', campOpen ? '渡口营火旁的学习者' : idle ? '烟柳渡木桥上的冒险者' :
      '烟柳渡木桥上的冒险者与' + (enemy?.name || '柳根闸主') + (tell.textContent ? '，'+tell.textContent : ''));
  }
  function play({before,after,action}) {
    active?.finish();
    const receipt = after?.battle?.last_event;
    if (!receipt || before?.phase !== 'combat' || !container.isConnected || container.ownerDocument.hidden) return Promise.resolve();
    setView(before);
    const role = currentHero;
    const isGuard = action === 'guard' && receipt.correct === true;
    const heavy = action === 'burst' || Boolean(receipt.critical || receipt.tactics?.broke_shield);
    const defeated = after.battle.enemy?.hp === 0;
    const hit = receipt.damage_dealt > 0, hurt = receipt.damage_received > 0, blocked = receipt.damage_blocked > 0;
    // Virtual pixels track the real aspect ratio, so contact always lands on the two actor anchors.
    const bounds = world.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return Promise.resolve();
    const width = Math.max(1,Math.round(168 * bounds.width / bounds.height));
    canvas.width = width; canvas.height = 168;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve();
    const point = (actor, yRatio) => {
      const r = actor.body.getBoundingClientRect();
      return {x:(r.left+r.width*.5-bounds.left)/bounds.width,y:(r.top+r.height*yRatio-bounds.top)/bounds.height};
    };
    const hp = point(hero,.53), fp = point(foe,.55);
    const h = {x:hp.x*width,y:hp.y*168}, f = {x:fp.x*width,y:fp.y*168};
    const impactAt = hit ? 270 : 0;
    const incomingAt = hit ? 755 : 340;
    const end = (hurt || blocked) ? incomingAt+480 : impactAt+530;
    const freeze = heavy ? 92 : 52;
    const start = performance.now();
    let frame, struck = false, returned = false, cast = false;
    world.dataset.fighting = 'true';
    return new Promise((resolve) => {
      function finish() {
        cancelAnimationFrame(frame);
        world.style.removeProperty('transform');
        for (const actor of [hero,foe]) {
          actor.body.style.removeProperty('transform');
          actor.body.style.removeProperty('opacity');
          actor.image.style.removeProperty('filter');
        }
        world.dataset.fighting = 'false';
        numbers.replaceChildren();
        ctx.clearRect(0,0,width,168);
        active = null; resolve();
      }
      active = {finish};
      function animate(now) {
        // A hidden tab should reveal the saved state immediately on return.
        const t = now - start;
        if (!container.isConnected || t >= end) { finish(); return; }
        const strikeAt = reduced ? 0 : impactAt;
        const counterAt = reduced ? (hit ? 110 : 0) : incomingAt;
        if (!cast && !reduced && t>80 && hit) { sound.cast(action); cast=true; }
        if (hit && t>=strikeAt && !struck) {
          sound.hit(heavy);
          const tag = receipt.tactics?.broke_shield ? '破势' : receipt.tactics?.phase_changed ? '形态转变' :
            receipt.critical ? '暴击' : receipt.tactics?.exploited_break ? '破绽' : '';
          placeNumber(numbers,{x:fp.x,y:fp.y-.14},tag,'−'+receipt.damage_dealt,'foe',reduced);
          struck = true;
        }
        if ((hurt || blocked) && t>=counterAt && !returned) {
          sound.hit(false,blocked);
          const tag = blocked ? '格挡 '+receipt.damage_blocked : '';
          placeNumber(numbers,{x:hp.x,y:hp.y-.15},tag,hurt?'−'+receipt.damage_received:'格挡','hero',reduced);
          returned = true;
        }
        if (reduced) {
          world.style.removeProperty('transform');
          for (const actor of [hero,foe]) {
            actor.body.style.removeProperty('transform');
            actor.body.style.removeProperty('opacity');
            actor.image.style.removeProperty('filter');
          }
          ctx.clearRect(0,0,width,168);
          if (t>=460) {finish(); return;}
          frame=requestAnimationFrame(animate); return;
        }
        ctx.clearRect(0,0,width,168);
        const hitTime=t-impactAt, backTime=t-incomingAt;
        const leap = clamp((t-100)/170);
        const release = clamp((t-impactAt-freeze)/240);
        const push = hit ? leap*(1-release) : 0;
        const stride = role === 'vanguard' && !isGuard ? bounds.width*(fp.x-hp.x)*.80 : isGuard ? 0 : bounds.width*.034;
        const recoil = hitTime >= 0 ? Math.max(0,1-Math.max(0,hitTime-freeze)/140) : 0;
        const heroRecoil = (hurt || blocked) && backTime>=0 ? Math.max(0,1-backTime/150) : 0;
        const counterLunge = (hurt || blocked) ? Math.sin(clamp((t-incomingAt+170)/240)*Math.PI) : 0;
        hero.body.style.transform='translate('+Math.round(stride*push - 5*heroRecoil)+'px,'+ Math.round(-3*Math.sin(push*Math.PI))+'px) scale('+ (1+.045*heroRecoil)+','+(1-.04*heroRecoil)+')';
        foe.body.style.transform='translateX('+Math.round((heavy?10:6)*recoil-counterLunge*7)+'px) scale('+(1+.05*recoil)+','+(1-.045*recoil)+')';
        if (defeated) foe.body.style.opacity = String(1 - clamp((hitTime - freeze - 90) / 220));
        foe.image.style.filter=hit && hitTime>=0 && hitTime<65 ? 'brightness(1.85) saturate(.75)' : '';
        hero.image.style.filter=hurt && backTime>=0 && backTime<58 ? 'brightness(1.65)' : '';
        const shake=(hit?Math.max(0,1-Math.abs(hitTime-28)/80):0)+(hurt?Math.max(0,1-Math.abs(backTime-25)/65):0);
        world.style.transform='translate('+Math.round(Math.sin(t/17)*shake*(heavy?3:1.5))+'px,'+Math.round(Math.cos(t/22)*shake)+'px)';
        if(hit) {
          projectile(ctx,role,h,f,clamp((t-128)/142),action==='burst');
          if (action === 'burst') signature(ctx, role, h, f, clamp((t-90)/225));
          drawImpact(ctx,f.x,f.y,hitTime,heavy,false);
        }
        if(hurt || blocked) {
          guardianBlow(ctx,f,h,clamp((t-incomingAt+155)/155),isGuard);
          drawImpact(ctx,h.x,h.y,backTime,false,blocked);
        }
        if(isGuard && t>=65 && t<incomingAt+150) {
          ctx.strokeStyle='#b5f7df'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(h.x+2,h.y,14,-1.22,1.22); ctx.stroke(); ctx.lineWidth=1;
        }
        frame=requestAnimationFrame(animate);
      }
      frame=requestAnimationFrame(animate);
    });
  }
  setView(null);
  setPreferences(preferences);
  return {setView,play,setPreferences,destroy() {
    active?.finish(); life.abort(); sound.destroy(); world.remove(); container.classList.remove('rpg-stage-host');
  }};
}

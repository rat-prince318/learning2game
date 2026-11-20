import { msg } from '../../js/locale.js';
import { enemyName, hasRegionalArt, intentCopy, regionId, regionName } from './words.js';
import { drawHeroEffect } from './effects/hero-effects.js';
import { drawEnemyCounter, drawEnemyImpact } from './effects/impact-effects.js';
import { makeAudio } from './effects/audio.js';
import { drawFerryLight } from './effects/ferry-light.js';
import { createLivingFerry } from './effects/living-ferry.js';
import { createActorPoses } from './effects/actor-poses.js';
import { createFerryPalette } from './effects/ferry-palette.js';

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
  const sight = element('span', 'rpg-stage-sight');
  sight.setAttribute('aria-hidden', 'true');
  body.append(sight);
  return {body, image};
}

function ferryStory(view) {
  if (view?.phase === 'sidequest') return 'camp';
  const tactics = view?.battle?.tactics;
  if (tactics?.encounter_id !== 'willow_lock') return 'ferry';
  if (['reward', 'victory'].includes(view.phase) && view.battle.enemy?.hp === 0) return 'open';
  return view.phase === 'combat' && tactics.phase === 2 ? 'surge' : 'ferry';
}

// Choreography uses virtual scene pixels. The hit stop holds the contact pose
// and its particles while the impact sound and damage readout land in real time.
function turnTiming(action, outgoing, counter, broken, critical) {
  const impactAt = action === 'burst' ? 680 : action === 'guard' ? 480 : 430;
  const hold = outgoing ? (broken ? 100 : action === 'burst' || critical ? 78 : 43) : 0;
  const counterAt = outgoing ? impactAt + 525 : 390;
  const tail = broken ? 685 : action === 'burst' || critical ? 585 : 465;
  const end = Math.max(outgoing ? impactAt + tail : 0, counter ? counterAt + 470 : 0, 320);
  return {impactAt, hold, counterAt, end};
}

function ease(amount) {
  const p = clamp(amount);
  return p * p * (3 - 2 * p);
}

function placeNumber(layer, anchor, label, value, side, style, still) {
  const node = element('span', 'rpg-stage-number');
  node.dataset.side = side;
  node.dataset.tone = style;
  node.style.left = anchor.x * 100 + '%';
  node.style.top = anchor.y * 100 + '%';
  if (label) {
    const tag = document.createElement('em');
    tag.textContent = label;
    node.append(tag);
  }
  node.append(document.createTextNode(value));
  layer.append(node);
  if (!still) node.animate?.([
    {translate: '0 4px', scale: '.83', opacity: .72},
    {offset: .12, translate: '0 -3px', scale: '1.16', opacity: 1},
    {offset: .28, translate: '0 -7px', scale: '1', opacity: 1},
    {offset: .78, translate: '0 -13px', scale: '1', opacity: 1},
    {translate: '0 -18px', opacity: 0},
  ], {duration: style === 'strong' ? 920 : 760, fill: 'forwards'});
}

/** Display only the public expedition projection. Every number in a hit comes from its receipt. */
export function createStage(container, preferences = {}) {
  container.classList.add('rpg-stage-host');
  const world = element('div','rpg-stage-world');
  world.setAttribute('role','img');
  const backdrop = element('div','rpg-stage-backdrop');
  const hero = makeActor('hero'), foe = makeActor('foe');
  const ally = element('div','rpg-stage-ally'), allyName=element('span','rpg-ally-name');
  ally.hidden=true;
  ally.append(allyName,element('i','rpg-ally-sprite'));
  const crew=['reed','flint','lumen'];
  const tell = element('span','rpg-stage-tell');
  tell.hidden = true;
  foe.body.append(tell);
  const camp = element('img','rpg-stage-camp');
  camp.src = asset('campfire.png'); camp.alt = '';
  const canvas = element('canvas','rpg-stage-canvas');
  const reflections = element('canvas','rpg-stage-reflections');
  const numbers = element('div','rpg-stage-numbers');
  const light = element('div','rpg-stage-light');
  const backCanvas = element('canvas','rpg-ferry-air'), frontCanvas = element('canvas','rpg-ferry-bank');
  const overlay = element('div','rpg-stage-overlay');
  // The field target is interactive. Only title cards remain decorative.
  const storyMark = element('div','rpg-stage-storymark');
  storyMark.hidden = true;
  const title = element('span','rpg-stage-technique');
  title.hidden = true;
  const palette = createFerryPalette(backdrop);
  backdrop.append(backCanvas);
  const orbit = element('span','rpg-field-orbit');
  orbit.hidden = true;
  orbit.setAttribute('aria-hidden','true');
  hero.body.append(orbit);
  const castButton = element('button','rpg-field-cast');
  castButton.type = 'button';
  castButton.dataset.act = 'field-cast';
  castButton.dataset.testid = 'battle-target';
  castButton.hidden = true;
  const sigil = element('b','rpg-field-glyph'), castLabel = element('span','rpg-field-cast-name');
  sigil.setAttribute('aria-hidden','true');
  castButton.append(sigil,castLabel);
  const weather = element('div','rpg-region-weather');
  backdrop.append(weather);
  title.setAttribute('aria-hidden','true'); storyMark.setAttribute('aria-hidden','true');
  overlay.append(title,storyMark,castButton);
  world.append(backdrop,element('div','rpg-stage-shade'),light,reflections,ally,hero.body,foe.body,camp);
  world.append(frontCanvas,canvas,numbers);
  container.append(world,overlay);
  const scenery = createLivingFerry(backCanvas,frontCanvas,preferences);
  const poses = createActorPoses(hero,foe);
  const sound = makeAudio(), life = new AbortController();
  let reduced = false, active = null, currentHero = '', currentFoe = '';
  let storyTimer, storySession = '', currentRegion = '', seal = '';

  function hideStoryMark() {
    clearTimeout(storyTimer);
    storyMark.hidden = true;
  }

  function setStory(view) {
    const next = ferryStory(view), previous = world.dataset.story;
    const id = regionId(view), regional = hasRegionalArt(id);
    if (id !== currentRegion) {
      currentRegion = id;
      world.dataset.region = id;
      world.dataset.regional = String(regional);
      backdrop.style.backgroundImage = regional ? 'url("/rpg/world/region-art/'+id+'.webp")' : '';
      scenery.setEnabled(!regional);
    }
    const sameRun = view?.session_id && storySession === view.session_id;
    if (previous !== next || !sameRun) hideStoryMark();
    if (previous !== next) {
      palette.setStory(next);
      scenery.setStory(next);
      world.dataset.story = next;
      if (sameRun && !reduced && !container.ownerDocument.hidden) {
        const label = {surge:msg('闸水倒涌','The sluice surges'),open:msg('渡船通航','The ferry sails'),camp:msg('退回营地','Return to camp')}[next];
        if (label) {
          storyMark.textContent = label;
          storyMark.dataset.story = next;
          storyMark.hidden = false;
          storyTimer = setTimeout(hideStoryMark, 1900);
          if (next === 'open' || next === 'surge') sound.signal(next);
        }
      }
    }
    storySession = view?.session_id || '';
  }
  // A UI button may sit outside the stage. The first trusted document gesture also unlocks a saved sound preference.
  for (const type of ['pointerdown','keydown']) container.ownerDocument.addEventListener(type,sound.unlock,
    {capture:true,passive:true, signal:life.signal});
  container.ownerDocument.addEventListener('visibilitychange', () => {
    if (container.ownerDocument.hidden) { hideStoryMark(); active?.finish(); }
  }, {signal:life.signal});
  function setPreferences(next) {
    if (next.muted !== undefined) sound.mute(next.muted);
    if (next.reducedMotion !== undefined) {
      if (next.reducedMotion && !reduced) active?.finish();
      reduced = Boolean(next.reducedMotion);
      scenery.setPreferences({reducedMotion:reduced});
      if (reduced) hideStoryMark();
      world.dataset.reduced = String(reduced);
    }
  }
  function setView(view) {
    const player = view?.battle?.player || view?.player;
    const enemy = view?.battle?.enemy;
    const role = heroes.has(player?.hero_class) ? player.hero_class : 'arcanist';
    const encounter = view?.battle?.tactics?.encounter_id;
    const ash = encounter === 'ash_crown';
    const family = ash ? 'ash-crown' : creatures.has(enemy?.sprite) ? enemy.sprite :
      encounter && encounter !== 'willow_lock' ? 'warden' : 'willow';
    if (role !== currentHero) {
      hero.image.src = asset('hero-' + role + '.png');
      hero.body.style.setProperty('--rpg-silhouette', 'url("' + hero.image.src + '")');
      currentHero = role;
    }
    const form = ash ? 'ash-crown-' + (view?.battle?.tactics?.phase === 2 ? 'enraged' : 'armored') : family;
    if (form !== currentFoe) {
      foe.image.src = asset(ash ? form + '.png' : family === 'willow' ? 'willow-keeper.png' : 'foe-' + family + '.png');
      foe.body.style.setProperty('--rpg-silhouette', 'url("' + foe.image.src + '")');
      foe.body.dataset.family = family; currentFoe = form;
    }
    world.dataset.ash = ash ? form : '';
    const campOpen = view?.phase === 'sidequest';
    const combat = view?.phase === 'combat';
    const tactics = view?.battle?.tactics;
    const intent = tactics?.intent;
    const member = crew.indexOf(tactics?.companion_id);
    ally.hidden = member < 0;
    if (member >= 0) {
      const name=[msg('苇舟','Reed'),msg('铆青','Flint'),msg('星萤','Lumen')][member];
      ally.style.setProperty('--ally',String(member));
      allyName.textContent=name+'  Lv. '+tactics.companion_level;
    }
    setStory(view);
    poses.setView(role,family,{combat, phase:tactics?.phase, intent:intent?.id, broken:tactics?.broken});
    world.dataset.camp = String(campOpen);
    const idle = Boolean(view) && (!combat || !enemy || enemy.hp === 0);
    world.dataset.cleared = String(idle);
    world.dataset.intent = combat ? intent?.id || '' : '';
    tell.hidden = !combat || !enemy || !intent;
    tell.textContent = combat && intent ? [tactics.broken ? msg('破势','Broken') : '',tactics.phase === 2 ? msg('二阶','Phase II') : '',intentCopy(intent)[0]].filter(Boolean).join(' ') : '';
    const place = regionName(view);
    const fieldDescription = campOpen ? msg(place+'营火旁的队伍','Party at the '+place+' campfire') :
      idle ? msg(place+'的冒险者','The adventurer at '+place) :
      msg(place+'的冒险者与','Adventurer at '+place+' facing ') + enemyName(view) + (tell.textContent ? ' / '+tell.textContent : '');
    world.setAttribute('aria-label', fieldDescription + (member>=0 ? ' / '+allyName.textContent : ''));
  }
  function play({before, after, action, technique, onContact}) {
    active?.finish();
    const receipt = after?.battle?.last_event;
    if (!receipt || before?.phase !== 'combat' || !container.isConnected || container.ownerDocument.hidden) {
      return Promise.resolve();
    }
    action = receipt.skill || action;
    setView(before);
    const inscription = seal;
    const support = receipt.partner_assist;
    const role = currentHero, encounterId = before.battle.tactics?.encounter_id;
    const guard = action === 'guard' && receipt.correct === true;
    const broken = Boolean(receipt.tactics?.broke_shield);
    const hit = receipt.damage_dealt > 0;
    const outgoing = hit || broken || receipt.correct === true;
    const hurt = receipt.damage_received > 0, blocked = receipt.damage_blocked > 0;
    const counter = hurt || blocked;
    const strong = broken || (hit && (receipt.critical || action === 'burst'));
    const fatal = outgoing && after.battle.enemy?.hp === 0;
    const timing = turnTiming(action, outgoing, counter, broken, receipt.critical);
    const bounds = world.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return Promise.resolve();
    const height = 168, width = Math.max(1, Math.round(height * bounds.width / bounds.height));
    const ratio = bounds.height / height;
    canvas.width = width;
    canvas.height = height;
    reflections.width = width;
    reflections.height = height;
    const ctx = canvas.getContext('2d');
    const reflectionCtx = reflections.getContext('2d');
    if (!ctx) return Promise.resolve();
    ctx.imageSmoothingEnabled = false;
    function anchor(actor, yRatio) {
      const rect = actor.body.getBoundingClientRect();
      return {x: (rect.left + rect.width * .5 - bounds.left) * width / bounds.width,
        y: (rect.top + rect.height * yRatio - bounds.top) / ratio};
    }
    const h = anchor(hero, .53), f = anchor(foe, .55), groundY = anchor(foe, .94).y;
    const start = performance.now(), still = reduced;
    let frame, struck = false, returned = false, cast = false;
    world.dataset.fighting = 'true';
    hideStoryMark();
    scenery.setCombat(true);
    castButton.hidden = true;
    orbit.hidden = true;
    const showTitle = !still && outgoing && (action === 'burst' || (guard && receipt.tactics?.intercepted_charge));
    if (showTitle) {
      title.textContent = action === 'burst' ? technique || msg('职业战技','Class skill') : msg('截断蓄势','Charge interrupted');
      title.hidden = false;
    }

    function beats(clock) {
      const firstBeat = still ? 0 : timing.impactAt;
      const secondBeat = still ? (outgoing ? 110 : 0) : timing.counterAt;
      if (!cast && !still && outgoing && clock > 60) {
        sound.cast(role, action);
        cast = true;
      }
      if (outgoing && !struck && clock >= firstBeat) {
        struck = true;
        if (hit || broken) sound.impact({heavy:strong, broken, wood:encounterId === 'willow_lock'});
        const tag = broken ? msg('破势','Break') : receipt.critical ? msg('暴击','Critical') : receipt.tactics?.exploited_break ? msg('破绽','Opening') :
          receipt.tactics?.phase_changed ? msg('形态转变','Phase change') : '';
        const value = hit ? '−' + receipt.damage_dealt : '0';
        placeNumber(numbers, {x:f.x/width + .045, y:clamp(f.y/height - .21)},
          tag, value, 'foe', strong ? 'strong' : 'normal', still);
        if (support && support.effect !== 'guard') ally.dataset.assist=support.effect;
        onContact?.('foe');
      }
      if (counter && !returned && clock >= secondBeat) {
        returned = true;
        sound.impact({parry:guard && blocked});
        const label = guard ? msg('格挡','Guard') : msg('减伤','Blocked');
        const tag = blocked && hurt ? label + ' ' + receipt.damage_blocked : blocked ? label : '';
        placeNumber(numbers, {x:h.x/width - .035, y:clamp(h.y/height - .18)},
          tag, hurt ? '−' + receipt.damage_received : String(receipt.damage_blocked),
          'hero', blocked && !hurt ? 'guard' : 'normal', still);
        if (support?.effect === 'guard') ally.dataset.assist='guard';
        onContact?.('hero');
      }
    }

    function paint(clock, elapsed) {
      const {impactAt, counterAt, hold} = timing;
      const hitTime = clock - impactAt, backTime = clock - counterAt;
      const beat = clock / impactAt;
      const gather = ease(beat / .38);
      const windup = outgoing ? gather * (1 - ease((beat - .34) / .29)) : 0;
      const follow = outgoing ? ease((beat - .42) / .54) * (1 - ease(hitTime / 245)) : 0;
      const recoil = (hit || broken) && hitTime >= 0 ? 1 - ease(hitTime / (strong ? 210 : 150)) : 0;
      const heroRecoil = counter && backTime >= 0 ? 1 - ease(backTime / 175) : 0;
      const lunge = counter ? Math.sin(clamp((backTime + 265) / 340) * Math.PI) : 0;
      const stride = role === 'vanguard' && !guard ? (f.x - h.x) * .80 : guard ? 1 : 4;
      const offset = stride * follow - windup * 2 - heroRecoil * (hurt ? 5 : 2);
      const lift = role === 'vanguard' && !guard ? Math.sin(follow * Math.PI) * 3.5 : 0;
      const tilt = (guard ? -4 : -7) * windup + (guard ? 2 : 6) * follow - 5 * heroRecoil;
      hero.body.style.transform = `translate(${Math.round(offset*ratio)}px, ${Math.round(-lift*ratio)}px) rotate(${tilt}deg) scale(${1+.04*windup}, ${1-.055*windup})`;
      foe.body.style.transform = `translateX(${Math.round(ratio*((strong?6:3)*recoil-4*lunge))}px) rotate(${(strong?3:1.4)*recoil}deg) scale(${1+.07*recoil}, ${1-.055*recoil})`;
      if (fatal) foe.body.style.opacity = String(1 - ease((hitTime-140)/255));
      foe.image.style.filter = recoil > .89 ? 'brightness(1.65) sepia(.24)' : '';
      hero.image.style.filter = hurt && heroRecoil > .87 ? 'brightness(1.55)' : '';
      poses.paint({clock,impactAt,counterAt,action,outgoing,counter,broken,guard,hurt,blocked,hit});

      const lightLevel = outgoing ? gather * (1 - ease((hitTime-65)/360)) : 0;
      const camera = lightLevel * (action === 'burst' ? .067 : strong ? .032 : .014);
      const firstShake = hit || broken ? 1 - ease((elapsed-impactAt)/135) : 0;
      const shake = (hitTime >= 0 ? firstShake * (strong ? 1.65 : .75) : 0) +
        (counter && backTime >= 0 ? (1-ease(backTime/90))*.95 : 0);
      // Use wall time only for vibration; pose and particles share the same held contact frame.
      const travel = ease((beat-.18)/.70) * (counter ? 1-ease((backTime+290)/280) : 1);
      const subject = outgoing ? h.x+(f.x-h.x)*travel : h.x;
      const pan = (.50-subject/width)*bounds.width*camera*1.12;
      world.style.transform = `scale(${1+camera}) translate(${pan+Math.sin(elapsed/16)*shake*ratio}px, ${Math.cos(elapsed/22)*shake*ratio*.38}px)`;
      backdrop.style.transform = `translateX(${-pan*.16}px) scale(${1+camera*.10})`;
      frontCanvas.style.transform = `translateX(${pan*.26}px)`;
      light.style.opacity = String(lightLevel * (action === 'burst' ? .95 : strong ? .63 : .26));
      if (showTitle) {
        title.style.opacity = String(ease(elapsed/95) * (1-ease((elapsed-impactAt-hold-110)/170)));
      }

      ctx.clearRect(0, 0, width, height);
      if (reflectionCtx && !hasRegionalArt(currentRegion)) {
        reflectionCtx.clearRect(0, 0, width, height);
        drawFerryLight(reflectionCtx, {width, from:h, to:f, role, action, clock, impactAt, outgoing, broken});
      }
      if (inscription && clock < impactAt + 90) {
        // The very mark selected in the codex leaves the hand, catches the
        // incoming blow on guard, or unravels locally on a missed inscription.
        const travel = outgoing && !guard ? ease((clock-80)/(impactAt-80)) : 0;
        const fade = outgoing ? 1-ease((clock-impactAt)/90) : 1-ease(clock/320);
        const sx = h.x + (f.x-h.x)*travel;
        const sy = h.y - 13 + (f.y-h.y+13)*travel - Math.sin(travel*Math.PI)*13;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(Math.round(sx),Math.round(sy));
        ctx.fillStyle = guard ? '#a5fad5' : outgoing ? '#ffe3a2' : '#cca39c';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 3;
        ctx.font = 'bold 13px Georgia,serif';
        ctx.textAlign = 'center';
        ctx.fillText(inscription,0,0);
        ctx.restore();
      }
      drawHeroEffect(ctx, {role, action, from:h, to:f, elapsed:clock, impactAt,
        incomingAt:counter ? counterAt : impactAt, hit:outgoing, isGuard:guard});
      drawEnemyImpact(ctx, {at:f, groundY, elapsed:hitTime, receipt, action, role, encounterId});
      drawEnemyCounter(ctx, {from:f, to:h, elapsed:backTime, receipt, encounterId});
    }

    return new Promise((resolve, reject) => {
      function finish(error) {
        cancelAnimationFrame(frame);
        world.style.removeProperty('transform');
        backdrop.style.removeProperty('transform');
        frontCanvas.style.removeProperty('transform');
        light.style.removeProperty('opacity');
        title.hidden = true;
        title.style.removeProperty('opacity');
        for (const actor of [hero, foe]) {
          actor.body.style.removeProperty('transform');
          actor.body.style.removeProperty('opacity');
          actor.image.style.removeProperty('filter');
        }
        world.dataset.fighting = 'false';
        delete ally.dataset.assist;
        poses.reset();
        scenery.setCombat(false);
        numbers.replaceChildren();
        ctx.clearRect(0, 0, width, height);
        reflectionCtx?.clearRect(0, 0, width, height);
        active = null;
        if (error) reject(error);
        else resolve();
      }
      active = {finish};
      function animate(now) {
        if (!container.isConnected) { finish(); return; }
        const elapsed = now - start;
        const frozenTime = still ? 0 : Math.min(timing.hold, Math.max(0, elapsed-timing.impactAt-32));
        const clock = elapsed - frozenTime;
        try {
          beats(clock);
          if (clock >= (still ? 460 : timing.end)) { finish(); return; }
          if (!still) paint(clock, elapsed);
          frame = requestAnimationFrame(animate);
        } catch (error) {
          finish(error);
        }
      }
      frame = requestAnimationFrame(animate);
    });
  }
  setView(null);
  setPreferences(preferences);
  return {setView,play,setPreferences,cargoCue:sound.dock,setAim(skill, selected, mark = '', label = '') {
    world.dataset.aim = selected ? skill : '';
    seal = selected ? mark : '';
    orbit.textContent = seal;
    orbit.hidden = !seal;
    sigil.textContent = seal;
    castLabel.textContent = label;
    castButton.dataset.skill = skill;
    castButton.hidden = !selected || !label;
    castButton.setAttribute('aria-label',msg('在战场上','On the field: ')+label);
  },destroy() {
    active?.finish(); hideStoryMark(); life.abort();
    poses.destroy(); scenery.destroy(); palette.destroy(); sound.destroy();
    world.remove(); overlay.remove(); container.classList.remove('rpg-stage-host');
  }};
}

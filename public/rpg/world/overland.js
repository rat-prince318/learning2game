import { buildMap, footpath, moveFeet, clamp, CELL, COLS, ROWS, WIDTH, HEIGHT } from './overland-map.js';
import { makePainter } from './overland-art.js';
import { readLocal, saveLocal } from '../../js/utils.js';

const keys = {
  KeyW: 'north',
  ArrowUp: 'north',
  KeyS: 'south',
  ArrowDown: 'south',
  KeyA: 'west',
  ArrowLeft: 'west',
  KeyD: 'east',
  ArrowRight: 'east',
};
const directions = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const roles = ['arcanist', 'vanguard', 'ranger'];
const pace = 139;
const radarColors = {
  water: '#548f9a', cliff: '#49404b', void: '#181f29', wall: '#433e44', saltflat: '#829fa2',
  slag: '#736655', furrow: '#7c9565', basalt: '#545368', ice: '#9bbcc5', cobble: '#84929a',
  flagstone: '#9b9991', road: '#b69f75', quay: '#d5b887', track: '#c98b63', gantry: '#dab77d',
  bridge: '#e4c592', dock: '#d4ae77', stairs: '#cdae7f', stonebridge: '#d2c5a7', mosaic: '#bba085',
  starroad: '#b6a2d4', floor: '#af9782', parquet: '#c9a881', carpet: '#ae7380',
};
export function mountOverland(
  root,
  view,
  { labels, onStation, onContact, onLeaveDialogue, onGuideFrame, canMove, blocked },
) {
  const area = root.querySelector('.lr-viewport'),
    canvas = area.querySelector('.lr-field-canvas'),
    hint = area.querySelector('.lr-field-action');
  const radar = area.querySelector('.lr-radar'),
    radarCtx = radar.getContext('2d');
  const region = view.region_index,
    map = buildMap(region, view.phase === 'route' ? view.routes : [], view.story_marks, view.scene_index);
  radar.width = COLS;
  radar.height = ROWS;
  const paint = makePainter(canvas, map);
  const camera = { x: 0, y: 0 },
    reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const districtKey = view.session_id + '.' + region + '.';
  const positionKey = (stage) => 'l2g.foot.3.' + districtKey + stage;
  function savedFeet(stage) {
    const local = readLocal(positionKey(stage));
    if (local && local.mapVersion === map.version) return local;
    if (map.version) return null;
    try {
      return JSON.parse(sessionStorage.getItem('l2g.foot.2.' + districtKey + stage));
    } catch {
      return null;
    }
  }
  const chapters = view.map[region].chapters;
  const lastFight = view.phase === 'reward' ? view.scene_index : view.scene_index - 1;
  const clearedRoute = chapters[lastFight]?.route_id;
  // Prefer the actual foot position (including patrol drift) in this browser.
  // A save opened on another computer still knows where its defeated foe stood.
  const arrivals = [savedFeet(view.scene_index)];
  if (clearedRoute) {
    if (lastFight !== view.scene_index) arrivals.push(savedFeet(lastFight));
    arrivals.push(map.encounterSpot(lastFight, clearedRoute));
  }
  const saved = arrivals.find((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && map.pass(p.x, p.y));
  const feet = {
    ...map.spawn,
    dir: 'south',
    role: Math.max(0, roles.indexOf(view.player.hero_class)),
    moving: false,
    stride: 0,
    mark: view.story_marks?.willow_ferry === 'ferry_child',
  };
  if (saved) {
    Object.assign(feet, { x: saved.x, y: saved.y, dir: saved.dir in directions ? saved.dir : 'south' });
  }
  const abort = new AbortController(),
    opts = { signal: abort.signal };
  const held = new Set(),
    pads = new Map();
  let raf = 0,
    old = 0,
    t = 0,
    pause = false,
    destroyed = false;
  let path = [],
    destination = null,
    contactLock = false,
    nearest = '',
    storageTick = 0,
    uiTick = 0,
    cameraInit = true;
  const masterDots = Object.entries(map.dots).filter(([key]) => labels[key]).map(([key, d]) => ({
    ...d,
    key,
    boss: view.routes.find((r) => r.id === key)?.boss,
  }));
  function liveDots() {
    return masterDots.map((d) => (d.kind === 'enemy' ? { ...d, x: d.x + Math.sin(t * 1.05) * 10 } : d));
  }
  const hazards = masterDots.filter((d) => d.kind === 'trap' || d.kind === 'enemy');
  const inContact = new Set();
  function suppressNearbyContacts() {
    for (const d of hazards)
      if (Math.hypot(d.x - feet.x, d.y - feet.y) < 39) inContact.add(d.key);
  }
  // A reload, menu return or dialogue can put the player back on the same tile.
  // A contact requires entering it on foot, rather than merely standing there.
  suppressNearbyContacts();
  function save() {
    saveLocal(positionKey(view.scene_index), { x: feet.x, y: feet.y, dir: feet.dir, mapVersion: map.version });
  }
  function reset() {
    held.clear();
    pads.clear();
    path = [];
    destination = null;
    feet.moving = false;
    for (const b of root.querySelectorAll('[data-walk-dir]')) b.classList.remove('pressed');
  }
  function modal() {
    return document.querySelector(
      'dialog[open],[data-story-open="true"],[data-theater-open="true"],.game-menu-open',
    );
  }
  function resize() {
    const rect = area.getBoundingClientRect(),
      scale = clamp(Math.min(rect.width / 555, rect.height / 314), 1.3, 3.2);
    canvas.width = Math.max(1, Math.min(WIDTH, Math.round(rect.width / scale)));
    canvas.height = Math.max(1, Math.min(HEIGHT, Math.round(rect.height / scale)));
    cameraInit = true;
  }
  function track(dt) {
    const dx = clamp(feet.x - canvas.width * 0.33, 0, WIDTH - canvas.width),
      dy = clamp(feet.y - canvas.height * 0.56, 0, HEIGHT - canvas.height);
    const mix = reduce.matches || cameraInit ? 1 : 1 - Math.exp(-dt * 11);
    cameraInit = false;
    camera.x += (dx - camera.x) * mix;
    camera.y += (dy - camera.y) * mix;
  }
  const terrainRadar = document.createElement('canvas');
  terrainRadar.width = COLS;
  terrainRadar.height = ROWS;
  {
    const c = terrainRadar.getContext('2d');
    c.fillStyle = '#334a4b';
    c.fillRect(0, 0, COLS, ROWS);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const type = map.cells[y][x];
        if (type === 'grass') continue;
        c.fillStyle = radarColors[type] || (map.blockedTerrain?.has(type) ? '#303640' :
          type === map.plan?.crossing || type === map.plan?.lane ? '#d9c5a1' : '#647d70');
        c.fillRect(x, y, 1, 1);
      }
    for (const d of masterDots) {
      c.fillStyle = ['enemy', 'trap'].includes(d.kind) ? '#f48064' : d.kind === 'landmark' ? '#8ad4c0' : '#ffdc83';
      c.fillRect(Math.floor(d.x / CELL), Math.floor(d.y / CELL), 2, 2);
    }
  }
  function minimap() {
    radarCtx.drawImage(terrainRadar, 0, 0);
    radarCtx.fillStyle = '#ffeec6';
    radarCtx.fillRect(Math.floor(feet.x / CELL) - 1, Math.floor(feet.y / CELL) - 1, 3, 3);
    radarCtx.strokeStyle = '#e7efda90';
    radarCtx.lineWidth = 0.5;
    radarCtx.strokeRect(camera.x / CELL, camera.y / CELL, canvas.width / CELL, canvas.height / CELL);
  }
  function interact(key) {
    if (!key || pause || blocked() || modal() || !canMove()) return;
    const d = masterDots.find((o) => o.key === key);
    if (!d || Math.hypot(d.x - feet.x, d.y - feet.y) > 38) return;
    reset();
    suppressNearbyContacts();
    save();
    onStation(key);
  }
  function navigate(key) {
    const d = masterDots.find((o) => o.key === key);
    if (!d || pause || modal() || !canMove()) return;
    root.querySelector('.lr-travel-list').open = false;
    area.focus({ preventScroll: true });
    const avoid = masterDots.filter((o) => o.key !== key && ['enemy', 'trap'].includes(o.kind));
    path = footpath(map, feet, d, avoid);
    destination = key;
    if (Math.hypot(d.x - feet.x, d.y - feet.y) < 21) interact(key);
  }
  function keyDown(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing || modal() || pause || blocked()) return;
    const editing = e.target.closest?.('input,textarea,select,[contenteditable="true"]');
    if (editing) return;
    if (!canMove()) {
      if (e.code === 'KeyF' && !e.repeat) {
        e.preventDefault();
        onLeaveDialogue();
      }
      return;
    }
    if (
      root.querySelector('.lr-travel-list[open]') ||
      document.activeElement?.closest('#top,.lr-dialog:not([hidden])')
    )
      return;
    const d = keys[e.code];
    if (d) {
      e.preventDefault();
      if (e.repeat && !held.has(e.code)) return;
      held.add(e.code);
      path = [];
      destination = null;
      return;
    }
    if (e.code === 'KeyF' || (e.code === 'Enter' && !e.target.closest?.('button,summary,a'))) {
      e.preventDefault();
      if (!e.repeat) interact(nearest);
    }
  }
  window.addEventListener('keydown', keyDown, opts);
  window.addEventListener('keyup', (e) => held.delete(e.code), opts);
  window.addEventListener('blur', reset, opts);
  document.addEventListener(
    'visibilitychange',
    () => {
      old = 0;
      if (document.hidden) {
        reset();
        save();
      }
    },
    opts,
  );
  area.addEventListener(
    'pointerdown',
    (e) => {
      const b = e.target.closest('[data-walk-dir]');
      if (b && !pause && canMove() && !modal() && !blocked()) {
        e.preventDefault();
        path = [];
        destination = null;
        pads.set(e.pointerId, b.dataset.walkDir);
        b.setPointerCapture(e.pointerId);
        b.classList.add('pressed');
        return;
      }
      if (e.target === canvas && !pause && !blocked() && !modal() && canMove()) {
        area.focus({ preventScroll: true });
        const r = canvas.getBoundingClientRect();
        const target = {
          x: camera.x + ((e.clientX - r.left) * canvas.width) / r.width,
          y: camera.y + ((e.clientY - r.top) * canvas.height) / r.height,
        };
        const poi = liveDots().find((o) => {
          if (o.kind === 'landmark')
            return Math.abs(o.x - target.x) < 29 && target.y >= o.y - 62 && target.y <= o.y + 5;
          return Math.abs(o.x - target.x) < 15 && Math.abs(o.y - 9 - target.y) < 20;
        });
        if (poi) {
          navigate(poi.key);
          return;
        }
        path = footpath(map, feet, target);
        destination = null;
      }
    },
    opts,
  );
  function releasePointer(e) {
    const d = pads.get(e.pointerId);
    pads.delete(e.pointerId);
    if (d && !Array.from(pads.values()).includes(d))
      root.querySelector('[data-walk-dir="' + d + '"]')?.classList.remove('pressed');
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    area.addEventListener(type, releasePointer, opts);
  area.querySelector('.lr-travel-list').addEventListener(
    'toggle',
    (e) => {
      if (e.target.open) reset();
    },
    opts,
  );
  const radarBtn = area.querySelector('.lr-radar-link');
  radarBtn?.addEventListener('click', () => reset(), opts);
  hint.addEventListener('click', () => interact(nearest), opts);
  function step(ts) {
    if (destroyed) return;
    raf = requestAnimationFrame(step);
    if (document.hidden) {
      old = 0;
      return;
    }
    const dt = old ? Math.min((ts - old) / 1000, 0.045) : 0;
    old = ts;
    const frozen =
      pause || blocked() || modal() || !canMove() || root.querySelector('.lr-travel-list[open]');
    if (!frozen) t += dt;
    let dx = 0,
      dy = 0;
    if (!frozen) {
      const pressed = new Set([...held].map((code) => keys[code]).concat([...pads.values()]));
      for (const direction of pressed) {
        dx += directions[direction][0];
        dy += directions[direction][1];
      }
      if (!dx && !dy && path.length) {
        const q = path[0],
          dist = Math.hypot(q.x - feet.x, q.y - feet.y);
        if (dist < 2) {
          path.shift();
          if (path.length === 0 && destination) {
            const key = destination;
            destination = null;
            interact(key);
          }
        } else {
          const ratio = Math.min(1, dist / Math.max(0.001, pace * dt));
          dx = ((q.x - feet.x) / dist) * ratio;
          dy = ((q.y - feet.y) / dist) * ratio;
        }
      }
    }
    const length = Math.hypot(dx, dy);
    const before = pt(feet.x, feet.y);
    if (length > 0) {
      const f = (pace * dt) / Math.max(1, length);
      moveFeet(map, feet, dx * f, dy * f);
      feet.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : dy > 0 ? 'south' : 'north';
    }
    const travel = Math.hypot(feet.x - before.x, feet.y - before.y);
    feet.moving = travel > 0.01;
    feet.stride += travel;
    if (frozen && (held.size || pads.size)) reset();
    const dots = liveDots(),
      near = dots
        .map((d) => ({ d, dist: Math.hypot(d.x - feet.x, d.y - feet.y) }))
        .sort((a, b) => a.dist - b.dist)[0];
    nearest = near && near.dist < 29 ? near.d.key : '';
    if (feet.moving && !frozen)
      for (const d of hazards)
        if (Math.hypot(d.x - feet.x, d.y - feet.y) > 39) inContact.delete(d.key);
    if (
      nearest &&
      (near.d.kind === 'enemy' || near.d.kind === 'trap') &&
      near.dist < 12 &&
      feet.moving &&
      !destination &&
      !frozen &&
      !inContact.has(nearest) &&
      !contactLock
    ) {
      contactLock = true;
      reset();
      suppressNearbyContacts();
      save();
      const notify = near.d.kind === 'trap' ? onStation : onContact;
      Promise.resolve(notify(nearest)).finally(() => {
        contactLock = false;
      });
    }
    const text = nearest ? labels[nearest] : '';
    if (hint.dataset.key !== nearest) {
      hint.dataset.key = nearest;
      hint.querySelector('span').textContent = text || '';
    }
    hint.hidden = !nearest || !!frozen;
    track(dt);
    paint(camera, feet, dots, reduce.matches ? 0 : t, reduce.matches);
    uiTick += dt;
    if (uiTick > 0.08 || !root.dataset.positionX) {
      uiTick = 0;
      root.dataset.positionX = Math.round(feet.x);
      root.dataset.positionY = Math.round(feet.y);
      root.dataset.cameraX = Math.round(camera.x);
      root.dataset.cameraY = Math.round(camera.y);
      root.dataset.facing = feet.dir;
      onGuideFrame?.({
        feet, camera, canvasWidth: canvas.width, canvasHeight: canvas.height,
        dots: Object.fromEntries(dots.map((d) => [d.key, d])),
      });
      minimap();
    }
    if (feet.moving && (storageTick += dt) > 0.7) {
      save();
      storageTick = 0;
    }
  }
  function pt(x, y) {
    return { x, y };
  }
  const observer = new ResizeObserver(resize);
  observer.observe(area);
  resize();
  raf = requestAnimationFrame(step);
  queueMicrotask(() => {
    if (!destroyed && !modal() && !root.contains(document.activeElement))
      area.focus({ preventScroll: true });
  });
  return {
    navigate,
    near: () => nearest,
    pause(v) {
      pause = Boolean(v);
      reset();
      suppressNearbyContacts();
    },
    position: () => ({ x: feet.x, y: feet.y }),
    focus: () => area.focus({ preventScroll: true }),
    destroy() {
      destroyed = true;
      save();
      cancelAnimationFrame(raf);
      abort.abort();
      observer.disconnect();
      reset();
    },
  };
}

// Atlases are registered to the original idle PNGs. The extra pixels around
// each cell give a staff, blade or root room to unfold without shifting the feet.
const HERO = {
  file: 'hero-action-poses.png', cell: [85, 65], idle: [53, 49],
  rows: { arcanist: 0, ranger: 1, vanguard: 2 },
  frames: { ready: 0, wind: 1, set: 2, cast: 3, extend: 4, settle: 5, guard: 6, hurt: 7 },
};
const WILLOW = {
  file: 'willow-action-poses.png', floodFile: 'willow-flood-poses.png', cell: [173, 125], idle: [113, 103],
  rows: { willow: 0 },
  frames: { ready: 0, brace: 1, raise: 2, surge: 3, strike: 4, recoil: 5, stagger: 6, guard: 7 },
};

function atlasLayer(actor, atlas) {
  const [width, height] = atlas.cell;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute', left: '50%', bottom: '0', transform: 'translateX(-50%)',
    imageRendering: 'pixelated', pointerEvents: 'none', display: 'none',
  });
  actor.image.after(canvas);
  const ctx = canvas.getContext('2d');
  const sheet = new Image();
  const floodSheet = atlas.floodFile ? new Image() : null;
  let disposed = false, visible = false, flooded = false;
  let sourceSheet = null, sourceX = -1, sourceY = -1;
  let row = null, frame = null;
  function fit() {
    const scale = Math.min(actor.body.clientWidth / atlas.idle[0], actor.body.clientHeight / atlas.idle[1]);
    canvas.style.width = (scale * width) + 'px';
    canvas.style.height = (scale * height) + 'px';
  }
  const observer = new ResizeObserver(fit);
  observer.observe(actor.body);
  fit();

  function draw() {
    // Read the registered material atlas once; the pose, hit reaction and anchor
    // are shared across phases. Fall back to the base sheet while the image loads.
    const material = flooded && floodSheet?.complete && floodSheet.naturalWidth ? floodSheet : sheet;
    const available = material.complete && material.naturalWidth && ctx && frame != null && row != null;
    if (!available) {
      if (visible) {
        canvas.style.display = 'none';
        actor.image.style.removeProperty('visibility');
        visible = false;
      }
      return;
    }
    if (!visible) {
      actor.image.style.visibility = 'hidden';
      canvas.style.display = 'block';
      visible = true;
    }
    if (canvas.style.filter !== actor.image.style.filter) canvas.style.filter = actor.image.style.filter;
    const sx = frame * width, sy = row * height;
    if (sourceSheet === material && sourceX === sx && sourceY === sy) return;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(material, sx, sy, width, height, 0, 0, width, height);
    sourceSheet = material;
    sourceX = sx;
    sourceY = sy;
  }
  sheet.onload = () => {
    if (!disposed) draw();
  };
  sheet.src = new URL('../art/' + atlas.file, import.meta.url).href;
  if (floodSheet) {
    floodSheet.onload = sheet.onload;
    floodSheet.src = new URL('../art/' + atlas.floodFile, import.meta.url).href;
  }
  return {
    select(character, name, useFloodMaterial = false) {
      row = atlas.rows[character] ?? null;
      frame = atlas.frames[name] ?? null;
      flooded = useFloodMaterial;
      draw();
    },
    destroy() {
      disposed = true;
      sheet.onload = null;
      if (floodSheet) floodSheet.onload = null;
      observer.disconnect();
      actor.image.style.removeProperty('visibility');
      canvas.remove();
    },
  };
}

function heroPose({ clock, action, outgoing, counter, impactAt, counterAt, hurt, guard }) {
  if (counter && clock >= counterAt - 40 && clock < counterAt + 185) {
    if (guard) return 'guard';
    if (hurt && clock >= counterAt) return 'hurt';
  }
  if (!outgoing) return null;
  const beat = clock / impactAt;
  if (beat < .12) return 'ready';
  if (beat < .31) return 'wind';
  if (action === 'guard') return clock < impactAt + 205 ? 'guard' : null;
  if (beat < .55) return 'set';
  if (beat < .77) return 'cast';
  if (clock < impactAt + 90) return 'extend';
  if (clock < impactAt + 225) return 'settle';
  return null;
}

function keeperPose({ clock, outgoing, counter, broken, hit, impactAt, counterAt }, idle) {
  if (counter && clock >= counterAt - 290 && clock < counterAt + 240) {
    const t = clock - counterAt;
    if (t < -175) return 'raise';
    if (t < -65) return 'surge';
    if (t < 90) return 'strike';
    return 'raise';
  }
  if (outgoing && clock >= impactAt && (hit !== false || broken)) {
    const t = clock - impactAt;
    if (t < 115) return 'recoil';
    if (broken) return 'stagger';
    if (t < 235) return 'brace';
  }
  return idle;
}

/** The stage owns the clock and reduced-motion policy; this renderer only chooses sprite cells. */
export function createActorPoses(heroActor, foeActor) {
  const hero = atlasLayer(heroActor, HERO), foe = atlasLayer(foeActor, WILLOW);
  let role = null, family = null, idle = null, flooded = false;
  function reset() {
    hero.select(role, null);
    foe.select(family, idle, flooded);
  }
  return {
    setView(nextRole, nextFamily, { combat = false, intent, broken, phase = 1 } = {}) {
      role = nextRole;
      family = nextFamily;
      flooded = combat && family === 'willow' && phase === 2;
      idle = combat && family === 'willow'
        ? (broken ? 'stagger' : { charge: 'brace', ward: 'guard', heavy: 'raise' }[intent]) ?? (flooded ? 'ready' : null)
        : null;
      reset();
    },
    paint(turn) {
      hero.select(role, heroPose(turn));
      foe.select(family, keeperPose(turn, idle), flooded);
    },
    reset,
    destroy() { hero.destroy(); foe.destroy(); },
  };
}

// Extend the terrain toward the camera. The seam samples the exact last row of
// the active panorama, including the ferry's storm and camp palettes.
export function createForeground(world, backdrop) {
  const canvas = document.createElement('canvas');
  canvas.className = 'rpg-stage-foreground';
  canvas.setAttribute('aria-hidden', 'true');
  world.prepend(canvas);
  const ctx = canvas.getContext('2d');
  let source = null, region = '', request = 0, alive = true;

  function paint() {
    const field = backdrop.clientHeight, span = world.clientWidth;
    const depth = world.clientHeight - field;
    if (!span || !field || depth <= 0) return;
    const plateWidth = Math.max(span, field * 2.65);
    backdrop.style.setProperty('--rpg-plate-width', plateWidth + 'px');
    if (!source || !ctx) return;
    const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
    const pixel = Math.max(field / sh, 1.5);
    const w = canvas.width = Math.ceil(span / pixel), h = canvas.height = Math.ceil(depth / pixel);
    ctx.imageSmoothingEnabled = false;
    const crop = Math.min(sw, sw * span / plateWidth);
    const left = (sw - crop) / 2, water = region === 'willow_ferry';
    for (let y = 0; y < h; y++) {
      // Only sample textured ground/water below the walkway and horizon.
      const sampleDepth = water ? 7 : Math.max(5, Math.floor(sh * .06));
      const step = y / (1.8 + y / h);
      const stripe = Math.floor(Math.abs((step % (sampleDepth * 2)) - sampleDepth));
      const sy = sh - 1 - (sampleDepth - stripe);
      const drift = y < 2 ? 0 : (1 - Math.exp(-y / 12)) *
        Math.sin(y * .17) * (water ? 2.5 : .8);
      ctx.drawImage(source, Math.max(0, Math.min(sw - crop, left + drift)), sy, crop, 1, 0, y, w, 1);
    }
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(10,27,31,0)');
    shade.addColorStop(.42, 'rgba(12,32,34,.45)');
    shade.addColorStop(1, 'rgba(8,25,29,.82)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    if (water) {
      // Small isolated glints between the darker reflected pilings.
      for (let i = 1; i <= 65; i++) {
        const x = Math.floor((i * 0.618033989 % 1) * w);
        const d = (i * 0.754877666 % 1);
        const y = Math.floor(d * h);
        ctx.fillStyle = i % 4 ? 'rgba(132,183,159,.22)' : 'rgba(227,198,139,.35)';
        ctx.fillRect(x, y, Math.round(2 + 8 * d), 1);
      }
    }
  }

  const resize = new ResizeObserver(paint);
  resize.observe(backdrop);
  resize.observe(world);
  return {
    setRegion(id, url) {
      if (region === id) return;
      region = id;
      source = null;
      const ticket = ++request;
      const image = new Image();
      image.src = url;
      image.decode().then(() => {
        if (!alive || ticket !== request || source) return;
        source = image;
        paint();
      }).catch(() => {});
    },
    setFerryPlate(plate) {
      if (region !== 'willow_ferry') return;
      source = plate;
      paint();
    },
    destroy() { alive = false; resize.disconnect(); },
  };
}

// World-space ambient effects. Each station has its own material and light source.
const climates = [
  ['petal', '#ffb8c6', '#ffe4b1', 0.2, 0.28],
  ['foam', '#c0f9f1', '#fff099', 0.75, 0.21],
  ['cinder', '#ff9841', '#ffd166', 0.46, 0.52],
  ['leaf', '#eff29a', '#ffd483', 0.35, 0.35],
  ['mote', '#97d0ff', '#ffcc7c', 0.47, 0.51],
  ['snow', '#deffff', '#b5edff', 0.72, 0.31],
  ['bell', '#ffdf86', '#ffd17b', 0.71, 0.27],
  ['star', '#e4e2ff', '#a4bdff', 0.34, 0.25],
];
export function animateWeather(scene, index, repaired) {
  const canvas = document.createElement('canvas');
  canvas.className = 'lr-weather';
  canvas.setAttribute('aria-hidden', 'true');
  scene.prepend(canvas);
  const ctx = canvas.getContext('2d'),
    reduce = matchMedia('(prefers-reduced-motion: reduce)');
  if (!ctx) return () => canvas.remove();
  const [kind, tint, light, lx, ly] = climates[index] || climates[0];
  const count = index === 5 ? 40 : 23;
  const grains = Array.from({ length: count }, (_, i) => ({
    x: ((i * 107 + 37) % 251) / 251,
    y: ((i * 71 + 19) % 179) / 179,
    speed: 0.65 + ((i * 13) % 31) / 47,
    phase: i * 1.91,
  }));
  let raf = 0,
    previous = 0,
    time = 0,
    visible = true;
  function paint() {
    const w = canvas.width,
      h = canvas.height,
      t = time;
    ctx.clearRect(0, 0, w, h);
    const radius = Math.max(12, h * (repaired ? 0.28 : 0.17)),
      x = lx * w,
      y = ly * h;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, light + '70');
    glow.addColorStop(0.42, light + '25');
    glow.addColorStop(1, light + '00');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = tint;
    grains.forEach((p) => {
      let px = p.x * w,
        py = p.y * h;
      const wave = Math.sin(t * 0.85 + p.phase),
        alpha = 0.38 + 0.3 * Math.sin(t * 0.68 + p.phase);
      ctx.globalAlpha = Math.max(0.1, alpha);
      if (kind === 'snow' || kind === 'petal' || kind === 'leaf') {
        px = (px + t * (kind === 'snow' ? 5 : 8) * p.speed + wave * 3) % w;
        py = (py + t * (kind === 'snow' ? 8 : 3) * p.speed) % h;
        ctx.fillRect(px | 0, py | 0, kind === 'petal' ? 2 : 1, 1);
        if (kind === 'leaf') ctx.fillRect((px + 1) | 0, (py - wave) | 0, 2, 1);
      } else if (kind === 'cinder' || kind === 'mote') {
        px += Math.sin(t * 0.7 + p.phase) * 5;
        py = h - ((py + t * (kind === 'cinder' ? 7 : 2) * p.speed) % h);
        ctx.fillRect(px | 0, py | 0, 1, kind === 'cinder' ? 3 : 1);
      } else if (kind === 'foam') {
        py = h * (0.65 + 0.28 * p.y);
        px = (px + t * 5 * p.speed) % w;
        ctx.fillRect(px | 0, py | 0, Math.round(3 + wave * 2), 1);
      } else {
        py *= kind === 'star' ? 0.54 : 0.8;
        ctx.fillRect(px | 0, py | 0, 1, 1);
        if (wave > 0.93) {
          ctx.fillRect((px - 2) | 0, py | 0, 5, 1);
          ctx.fillRect(px | 0, (py - 2) | 0, 1, 5);
        }
      }
    });
    ctx.globalAlpha = 1;
    if (repaired) {
      ctx.fillStyle = light;
      ctx.shadowColor = light;
      ctx.shadowBlur = 5;
      ctx.fillRect(x - 1, y - 4, 3, 7);
      ctx.shadowBlur = 0;
    }
  }
  function step(ts) {
    raf = 0;
    if (document.hidden || reduce.matches || !visible) return;
    if (!previous || ts - previous >= 48) {
      if (previous) time += Math.min((ts - previous) * 0.001, 0.1);
      previous = ts;
      paint();
    }
    raf = requestAnimationFrame(step);
  }
  function schedule() {
    cancelAnimationFrame(raf);
    raf = 0;
    previous = 0;
    paint();
    if (!document.hidden && !reduce.matches && visible) raf = requestAnimationFrame(step);
  }
  const resize = new ResizeObserver(() => {
    canvas.width = Math.max(1, Math.round(scene.clientWidth / 2));
    canvas.height = Math.max(1, Math.round(scene.clientHeight / 2));
    schedule();
  });
  resize.observe(scene);
  const obs = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    schedule();
  });
  obs.observe(scene);
  document.addEventListener('visibilitychange', schedule);
  reduce.addEventListener('change', schedule);
  schedule();
  return () => {
    cancelAnimationFrame(raf);
    obs.disconnect();
    resize.disconnect();
    document.removeEventListener('visibilitychange', schedule);
    reduce.removeEventListener('change', schedule);
    canvas.remove();
  };
}

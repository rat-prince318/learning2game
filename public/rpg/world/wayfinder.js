import { msg } from '../../js/locale.js';
import { CELL } from './overland-map.js';

// Map pixels follow the camera. The marker is drawn in CSS pixels so its size
// and distance from the edge stay readable at every canvas resolution.
export function projectGuide(frame, target, width, height) {
  const { camera, feet, canvasWidth, canvasHeight } = frame;
  const sx = width / canvasWidth, sy = height / canvasHeight;
  const px = (feet.x - camera.x) * sx, py = (feet.y - camera.y) * sy;
  const tx = (target.x - camera.x) * sx, ty = (target.y - camera.y) * sy;
  const left = Math.min(42, width / 8), right = width - left;
  const top = Math.min(130, height * 0.26), bottom = height - Math.min(118, height * 0.24);
  const distance = Math.ceil(Math.hypot(target.x - feet.x, target.y - feet.y) / CELL);
  const pin = ty - Math.min(52, 17 * sy);
  if (tx >= left && tx <= right && pin >= top && pin <= bottom)
    return { x: tx, y: pin, angle: 90, distance, mode: 'pin' };

  // At a map boundary the player's feet can be outside the HUD-safe rectangle.
  const ox = Math.max(left + 1, Math.min(right - 1, px));
  const oy = Math.max(top + 1, Math.min(bottom - 1, py));
  const dx = tx - ox, dy = pin - oy;
  const rx = dx > 0 ? (right - ox) / dx : dx < 0 ? (left - ox) / dx : Infinity;
  const ry = dy > 0 ? (bottom - oy) / dy : dy < 0 ? (top - oy) / dy : Infinity;
  const fraction = Math.min(rx, ry);
  return { x: ox + dx * fraction, y: oy + dy * fraction,
    angle: Math.atan2(dy, dx) * 180 / Math.PI, distance, mode: 'edge' };
}

export function mountGuide(root, quest) {
  const marker = root.querySelector('.lr-guide');
  if (!marker || !quest?.target) return {};
  const amount = marker.querySelector('small');
  let width = root.clientWidth, height = root.clientHeight, lastDistance;
  const resize = new ResizeObserver(([entry]) => {
    width = entry.contentRect.width;
    height = entry.contentRect.height;
  });
  resize.observe(root);
  return {
    frame(frame) {
      const point = frame.dots[quest.target];
      if (!point || !width || !height || !frame.canvasWidth || !frame.canvasHeight) {
        marker.hidden = true;
        return;
      }
      const p = projectGuide(frame, point, width, height);
      marker.hidden = false;
      marker.dataset.mode = p.mode;
      marker.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y) + 'px) translate(-50%,-50%)';
      marker.style.setProperty('--bearing', Math.round(p.angle) + 'deg');
      if (lastDistance !== p.distance) {
        lastDistance = p.distance;
        amount.textContent = p.distance <= 1 ? msg('到了', 'Here') : msg(p.distance + ' 格', p.distance + ' tiles');
      }
    },
    destroy: () => resize.disconnect(),
  };
}

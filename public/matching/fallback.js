import * as T from './vendor/three.mjs';
import { COURT } from './physics.js';

// Software projection keeps the same court, camera and simulated ball on
// machines where WebGL2 is disabled. Only the rendering backend changes.
export function softwareCourt(canvas, camera) {
  const c = canvas.getContext('2d'),
    point = new T.Vector3();
  let w = 1,
    h = 1;
  const project = (x, y, z) => {
    point.set(x, y, z).project(camera);
    return point.z > 1 || point.z < -1 ? null : [((point.x + 1) * w) / 2, ((1 - point.y) * h) / 2];
  };
  function poly(points, fill, stroke, lw = 1) {
    if (points.some((p) => !p)) return;
    c.beginPath();
    for (const [i, p] of points.entries()) i ? c.lineTo(...p) : c.moveTo(...p);
    if (fill) {
      c.closePath();
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = lw;
      c.stroke();
    }
  }
  function rect(x, y, z, width, height, color, stroke) {
    poly(
      [
        project(x - width / 2, y + height / 2, z),
        project(x + width / 2, y + height / 2, z),
        project(x + width / 2, y - height / 2, z),
        project(x - width / 2, y - height / 2, z),
      ],
      color,
      stroke,
    );
  }
  function circle(x, y, z, r, color) {
    const p = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i * Math.PI) / 32;
      p.push(project(x + r * Math.cos(a), y, z + r * Math.sin(a)));
    }
    poly(p, null, color, 2);
  }
  return {
    resize(width, height) {
      w = width;
      h = height;
      canvas.width = w;
      canvas.height = h;
    },
    draw(hoops, position) {
      const far = project(0, 1.68, -1000);
      const horizon = Math.max(-h, Math.min(2 * h, far?.[1] ?? h * 0.5));
      const sky = c.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#293e46');
      sky.addColorStop(0.4, '#d9a37c');
      sky.addColorStop(1, '#786041');
      c.fillStyle = sky;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#b48758';
      c.fillRect(0, horizon, w, h - horizon);
      for (let x = -9; x <= 9; x += 0.3)
        poly(
          [project(x, 0, -7), project(x, 0, Math.min(camera.position.z - 0.35, 10))],
          null,
          '#977447',
        );
      for (let x = -8.25; x < 9; x += 1.5) {
        rect(x, 1.55, -8, 1.47, 3.1, '#294b49');
        rect(x, 4.6, -8, 1.44, 2.7, '#c8bba3', '#3e5050');
      }
      for (let z = -4; z < camera.position.z - 0.4; z += 1.2)
        poly([project(-9, 0, z), project(9, 0, z)], null, '#ac8557');
      for (const x of [-2.44, 2.44, -8.5, 8.5])
        poly(
          [project(x, 0.01, -4.5), project(x, 0.01, x * x > 10 ? camera.position.z - 0.35 : 1.2)],
          null,
          '#f9ead0',
          2,
        );
      circle(0, 0.01, 1.2, 1.8, '#f9ead0');
      for (const hoop of hoops) {
        const { x, y, z } = hoop;
        rect(x, 1.7, z - 1.25, 0.16, 3.4, '#284345');
        rect(x, 0.23, z - 1.35, 0.84, 0.46, '#1f554e');
        rect(x, y + 0.375, z - COURT.boardGap, 1.8, 1.05, 'rgba(190,222,213,.55)', '#e8eee1');
        rect(x, y + 0.21, z - COURT.boardGap, 0.59, 0.43, null, '#fcf4db');
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6;
          for (const s of [-1, 1])
            poly(
              [
                project(x + 0.23 * Math.cos(a), y, z + 0.23 * Math.sin(a)),
                project(
                  x + 0.13 * Math.cos(a + s * 0.8),
                  y - 0.4,
                  z + 0.13 * Math.sin(a + s * 0.8),
                ),
              ],
              null,
              '#fff5d4',
              1,
            );
        }
        circle(x, y, z, COURT.rimRadius, '#e66129');
      }
      const center = project(position.x, position.y, position.z);
      if (center) {
        const dist = camera.position.distanceTo(position),
          r = Math.max(
            2,
            ((h / 2) * COURT.ballRadius) /
              (Math.max(0.15, dist) * Math.tan((camera.fov * Math.PI) / 360)),
          );
        const g = c.createRadialGradient(
          center[0] - 0.3 * r,
          center[1] - 0.45 * r,
          0,
          ...center,
          r * 1.2,
        );
        g.addColorStop(0, '#f79a46');
        g.addColorStop(0.67, '#c45b23');
        g.addColorStop(1, '#71351c');
        c.fillStyle = g;
        c.beginPath();
        c.arc(...center, r, 0, 2 * Math.PI);
        c.fill();
        c.save();
        c.clip();
        c.strokeStyle = '#55331d';
        c.lineWidth = Math.max(1, r * 0.036);
        for (const side of [-1, 1]) {
          c.beginPath();
          c.ellipse(
            center[0] + side * r * 0.95,
            center[1],
            r * 0.7,
            r * 1.25,
            0.27,
            0,
            2 * Math.PI,
          );
          c.stroke();
        }
        c.restore();
      }
    },
  };
}

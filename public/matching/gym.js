import * as T from './vendor/three.mjs';
import { COURT } from './physics.js';

// Court coordinates and the line painting share the same metres as the colliders.
function surface(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function parquet() {
  return surface(1536, 2048, (c, w, h) => {
    const rng = random(1107);
    c.fillStyle = '#9f7048';
    c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 15) {
      let y = -rng() * 180;
      while (y < h) {
        const length = 100 + rng() * 175,
          hue = 29 + rng() * 7,
          light = 49 + rng() * 15;
        c.fillStyle = 'hsl(' + hue + ' 45% ' + light + '%)';
        c.fillRect(x + 0.6, y + 0.7, 14.5, length - 0.7);
        for (let k = 0; k < 13; k++) {
          const u = x + rng() * 15;
          c.strokeStyle = 'rgba(90,49,23,' + (0.035 + rng() * 0.1) + ')';
          c.lineWidth = 0.7;
          c.beginPath();
          c.moveTo(u, y);
          c.bezierCurveTo(u + 2, y + length * 0.3, u - 1, y + length * 0.65, u, y + length);
          c.stroke();
        }
        y += length;
      }
    }
    // The basket baseline and training lanes extend back towards the player's feet.
    const sx = w / 18,
      sy = h / 20,
      X = (x) => (x + 9) * sx,
      Y = (z) => (z + 8) * sy;
    c.save();
    c.translate(X(0), Y(0));
    c.scale(sx, sy);
    c.fillStyle = 'rgba(20,78,74,.82)';
    c.fillRect(-8.75, -5.45, 17.5, 0.89);
    c.strokeStyle = '#ffefce';
    c.lineWidth = 0.048;
    c.strokeRect(-8.55, -4.55, 17.1, 15.6);
    c.fillStyle = 'rgba(15,76,75,.72)';
    c.fillRect(-2.44, -4.55, 4.88, 5.8);
    c.strokeRect(-2.44, -4.55, 4.88, 5.8);
    function arc(x, z, r, start, end) {
      c.beginPath();
      c.arc(x, z, r, start, end);
      c.stroke();
    }
    arc(0, 1.25, 1.8, 0, Math.PI);
    c.setLineDash([0.28, 0.22]);
    arc(0, 1.25, 1.8, Math.PI, 2 * Math.PI);
    c.setLineDash([]);
    arc(0, -3.8, 6.75, 0, Math.PI);
    arc(0, -3.8, 1.25, 0, Math.PI);
    c.lineWidth = 0.09;
    c.beginPath();
    c.moveTo(-8.55, 7.8);
    c.lineTo(8.55, 7.8);
    c.stroke();
    arc(0, 7.8, 1.8, 0, 2 * Math.PI);
    for (const side of [-1, 1])
      for (let i = 0; i < 4; i++) {
        c.fillStyle = '#f7e8c9';
        c.fillRect(side * 2.44 - 0.13, -3 + i * 0.85, 0.26, 0.065);
      }
    c.restore();
    // Very fine scuffs and a broad window reflection remain below the markings.
    for (let i = 0; i < 180; i++) {
      c.strokeStyle = 'rgba(67,46,29,.09)';
      const x = rng() * w,
        y = rng() * h;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 8 + rng() * 28, y - 2 + rng() * 4);
      c.stroke();
    }
    const wash = c.createLinearGradient(0, 0, w, h * 0.7);
    wash.addColorStop(0, 'rgba(255,206,142,.2)');
    wash.addColorStop(1, 'rgba(255,206,142,0)');
    c.fillStyle = wash;
    c.fillRect(0, 0, w, h);
  });
}
function leather() {
  return surface(1536, 768, (c, w, h) => {
    const rng = random(53);
    c.fillStyle = '#ba5627';
    c.fillRect(0, 0, w, h);
    for (let k = 0; k < 125000; k++) {
      const x = rng() * w,
        y = rng() * h;
      c.fillStyle = k % 3 ? 'rgba(62,20,5,.12)' : 'rgba(255,192,123,.18)';
      c.fillRect(x, y, 1 + rng() * 1.8, 1 + rng());
    }
    const groove = () => {
      for (const [width, tint] of [
        [12, '#a7502b'],
        [8.8, '#713d28'],
        [7, '#342d27'],
        [3.1, '#2c2925'],
      ]) {
        c.lineWidth = width;
        c.strokeStyle = tint;
        c.stroke();
      }
    };
    const path = (fn) => {
      c.beginPath();
      for (let i = 0; i <= w; i += 2) {
        const y = fn(i / w);
        i ? c.lineTo(i, y) : c.moveTo(i, y);
      }
      groove();
    };
    path(() => h / 2);
    path((t) => h * (0.5 + 0.33 * Math.cos((t + 0.085) * 2 * Math.PI)));
    path((t) => h * (0.5 - 0.33 * Math.cos((t + 0.085) * 2 * Math.PI)));
    for (const x of [w * 0.165, w * 0.665]) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      groove();
    }
  });
}
function windowView() {
  return surface(1400, 400, (c, w, h) => {
    const rng = random(21),
      sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#5c7c91');
    sky.addColorStop(0.57, '#f4c38b');
    sky.addColorStop(1, '#f2945f');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    const glow = c.createRadialGradient(w * 0.72, h * 0.73, 2, w * 0.72, h * 0.73, 160);
    glow.addColorStop(0, '#fff5ce');
    glow.addColorStop(0.06, '#fff5ce');
    glow.addColorStop(0.09, '#fbdc9f');
    glow.addColorStop(1, 'rgba(255,211,147,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);
    for (let layer = 0; layer < 3; layer++) {
      let x = -5;
      while (x < w) {
        const bw = 8 + rng() * 33,
          top = h * (0.58 + 0.11 * layer) - rng() * 70;
        c.fillStyle = ['#a59685', '#777e7b', '#4a5b60'][layer];
        c.fillRect(x, top, bw, h - top);
        if (rng() > 0.7) c.fillRect(x + bw * 0.2, top - 6, bw * 0.6, 6);
        c.fillStyle = 'rgba(255,218,146,.65)';
        for (let a = x + 3; a < x + bw - 2; a += 5)
          for (let b = top + 5; b < h; b += 8) if (rng() > 0.78) c.fillRect(a, b, 2, 2);
        x += bw + 2 + rng() * 7;
      }
    }
    for (const x of [183, 534, 1157]) {
      const y = h * 0.51;
      c.fillStyle = '#485b63';
      c.fillRect(x, y, 22, 17);
      c.beginPath();
      c.moveTo(x - 3, y);
      c.lineTo(x + 11, y - 8);
      c.lineTo(x + 26, y);
      c.fill();
      c.fillRect(x + 3, y + 16, 2, 13);
      c.fillRect(x + 17, y + 16, 2, 13);
    }
  });
}
const basic = (color) => new T.MeshBasicMaterial({ color });
const finish = (color, roughness = 0.66, metalness = 0.05) =>
  new T.MeshStandardMaterial({ color, roughness, metalness });
const up = new T.Vector3(0, 1, 0);
function batch(parent, geo, mat, transforms) {
  if (!transforms.length) return;
  const group = new T.InstancedMesh(geo, mat, transforms.length);
  group.castShadow = true;
  group.receiveShadow = true;
  const obj = new T.Group();
  transforms.forEach(([x, y, z, w, h, d, rz = 0], i) => {
    obj.position.set(x, y, z);
    obj.scale.set(w, h, d);
    obj.rotation.set(0, 0, rz);
    obj.updateMatrix();
    group.setMatrixAt(i, obj.matrix);
  });
  parent.add(group);
}
function block(parent, mat, x, y, z, w, h, d) {
  const box = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  box.position.set(x, y, z);
  parent.add(box);
  return box;
}
function plane(parent, mat, x, y, z, w, h) {
  const mesh = new T.Mesh(new T.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
function beam(parent, mat, a, b, r) {
  const dir = b.clone().sub(a),
    mesh = new T.Mesh(new T.CylinderGeometry(r, r, dir.length(), 8), mat);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(up, dir.normalize());
  parent.add(mesh);
  return mesh;
}
function titlePlate(text) {
  return surface(1024, 160, (c, w, h) => {
    c.fillStyle = '#123432';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#efd79d';
    c.fillRect(0, 0, w, 4);
    c.fillRect(0, h - 4, w, 4);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = 'italic 900 101px Arial, sans-serif';
    c.fillText(text, w / 2, h * 0.52, w - 24);
  });
}

export function buildHall(scene) {
  scene.background = new T.Color('#404d4d');
  scene.fog = new T.Fog('#827f70', 17, 38);
  scene.add(new T.HemisphereLight(0xfff1d6, 0x768e91, 1.8));
  const sun = new T.DirectionalLight(0xffdbab, 2.6);
  sun.position.set(-8, 8, -7);
  scene.add(sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -13,
    right: 13,
    bottom: -12,
    top: 12,
    near: 0.1,
    far: 40,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.022;
  sun.shadow.bias = -0.0002;
  const fill = new T.DirectionalLight(0x8dc7e6, 1.05);
  fill.position.set(6, 5, 4);
  scene.add(fill);
  const wall = finish('#335653'),
    pad = finish('#194344'),
    steel = finish('#233638', 0.52, 0.45),
    deck = finish('#413e35');
  const floor = new T.Mesh(
    new T.PlaneGeometry(18, 20),
    new T.MeshStandardMaterial({ map: parquet(), roughness: 0.63 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 2;
  floor.receiveShadow = true;
  scene.add(floor);
  block(scene, wall, 0, 1.92, -8.1, 18.25, 3.84, 0.2).receiveShadow = true;
  const mural = plane(
    scene,
    new T.MeshBasicMaterial({ map: titlePlate('FIELDHOUSE') }),
    0,
    2.9,
    -7.982,
    5.4,
    0.8,
  );
  mural.position.z += 0.03;
  const unit = new T.BoxGeometry();
  const padding = [],
    frames = [],
    lights = [],
    roof = [],
    accents = [],
    seats = [],
    risers = [];
  for (let i = -9; i < 9; i++) padding.push([i + 0.49, 0.88, -7.94, 0.95, 1.7, 0.13]);
  const view = new T.MeshBasicMaterial({ map: windowView() });
  plane(scene, view, 0, 5.58, -8, 18, 3.52);
  for (let i = -9; i <= 9; i += 1.5) frames.push([i, 5.6, -7.94, 0.072, 3.6, 0.09]);
  for (const y of [3.85, 5.1, 6.45, 7.37]) frames.push([0, y, -7.93, 18, 0.08, 0.11]);
  for (const side of [-1, 1]) {
    block(scene, wall, side * 9, 3.7, 2, 0.19, 7.4, 20);
    for (let i = 0; i < 12; i++)
      padding.push([side * 8.88, 0.81, -7.45 + i * 1.54, 0.15, 1.55, 1.49]);
    for (let z = -6; z < 12; z += 3.4) frames.push([side * 8.76, 3.7, z, 0.19, 7.4, 0.18]);
    const windows = plane(scene, view, side * 8.88, 5.4, 2, 18, 2.9);
    windows.rotation.y = (-side * Math.PI) / 2;
    for (let z = -7; z < 12; z += 1.6) frames.push([side * 8.82, 5.42, z, 0.09, 3, 0.072]);
    for (const y of [3.95, 5.45, 6.9]) frames.push([side * 8.81, y, 2, 0.12, 0.06, 19.5]);
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 8; i++) {
        const z = -4.9 + i * 1.49;
        risers.push([
          side * (6.65 + row * 0.71),
          0.21 + row * 0.17,
          z,
          0.7,
          0.4 + row * 0.33,
          1.46,
        ]);
        seats.push([side * (6.62 + row * 0.71), 0.49 + row * 0.34, z, 0.57, 0.11, 1.41]);
      }
    for (let z = -6.1; z < 12; z += 3.3) accents.push([side * 8.75, 2.45, z, 0.11, 0.12, 1.75]);
  }
  block(scene, deck, 0, 7.72, 2, 18.3, 0.25, 20.5);
  for (let z = -7.4; z < 13; z += 3.55) {
    for (const y of [6.98, 7.52]) roof.push([0, y, z, 18, 0.1, 0.12]);
    for (let x = -8.5; x < 9; x += 1.1)
      roof.push([x, 7.24, z, 0.06, 0.95, 0.075, (Math.round((x + 8.5) / 1.1) % 2 ? 1 : -1) * 1.06]);
    for (const x of [-5.7, 0, 5.7]) lights.push([x, 6.88, z, 2.24, 0.09, 0.17]);
  }
  batch(scene, unit, pad, padding);
  batch(scene, unit, steel, frames);
  batch(scene, unit, steel, roof);
  batch(scene, unit, basic('#fff1cb'), lights);
  batch(scene, unit, finish('#e6b566'), accents);
  batch(scene, unit, finish('#b8783f'), seats);
  batch(scene, unit, finish('#405454'), risers);
  // Soft contact shadows ground each player and stand without a second scene render.
  const shadow = surface(96, 96, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(40,30,23,.60)');
    g.addColorStop(1, 'rgba(40,30,23,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
  return { shadow };
}

export function buildHoops(scene, hoops, shadow) {
  const root = new T.Group();
  scene.add(root);
  const iron = finish('#254648', 0.52, 0.56),
    guard = finish('#1b4e50'),
    orange = finish('#eb6021', 0.38, 0.28);
  const edge = finish('#d4ddd6'),
    chalk = basic('#fcf3da');
  const glass = new T.MeshStandardMaterial({
    color: 0xc3e7de,
    transparent: true,
    opacity: 0.21,
    depthWrite: false,
    side: T.DoubleSide,
    roughness: 0.18,
  });
  const netMat = new T.LineBasicMaterial({ color: 0xfff4d7, transparent: true, opacity: 0.94 });
  const nets = new Map();
  for (const h of hoops) {
    const px = h.x,
      y = h.y,
      z = h.z,
      boardZ = z - COURT.boardGap;
    block(root, guard, px, 0.19, z - 1.4, 0.85, 0.38, 1.28);
    block(root, iron, px, 1.75, z - 1.26, 0.17, 3.26, 0.17);
    beam(
      root,
      iron,
      new T.Vector3(px, 2.17, z - 1.25),
      new T.Vector3(px, 3.36, boardZ - 0.07),
      0.085,
    );
    block(root, iron, px, 3.37, boardZ - 0.48, 0.13, 0.085, 0.97);
    block(root, glass, px, y + 0.375, boardZ - 0.025, 1.8, 1.05, 0.05);
    for (const side of [-1, 1]) {
      block(root, edge, px + side * 0.9, y + 0.375, boardZ, 0.035, 1.075, 0.05);
      block(root, chalk, px + side * 0.29, y + 0.215, boardZ + 0.003, 0.024, 0.43, 0.025);
    }
    for (const yy of [y - 0.15, y + 0.9]) block(root, edge, px, yy, boardZ, 1.83, 0.034, 0.05);
    for (const yy of [y + 0.012, y + 0.43])
      block(root, chalk, px, yy, boardZ + 0.003, 0.59, 0.024, 0.025);
    block(root, orange, px, y, boardZ + 0.079, 0.16, 0.037, 0.17);
    const ring = new T.Mesh(new T.TorusGeometry(COURT.rimRadius, COURT.tube, 10, 64), orange);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(px, y, z);
    root.add(ring);
    const verts = [];
    for (let i = 0; i < 12; i++)
      for (let row = 0; row < 4; row++) {
        const ang = ((i + (row % 2) * 0.5) * Math.PI) / 6,
          r = 0.225 - row * 0.026;
        for (const d of [-0.5, 0.5]) {
          verts.push(Math.cos(ang) * r, -row * 0.105, Math.sin(ang) * r);
          verts.push(
            Math.cos(ang + (d * Math.PI) / 6) * (r - 0.026),
            -(row + 1) * 0.105,
            Math.sin(ang + (d * Math.PI) / 6) * (r - 0.026),
          );
        }
      }
    const netGeo = new T.BufferGeometry();
    netGeo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    const net = new T.LineSegments(netGeo, netMat);
    net.position.set(px, y, z);
    root.add(net);
    nets.set(h.id, net);
    const shade = plane(
      root,
      new T.MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false }),
      px,
      0.007,
      z - 1.2,
      2.2,
      2.9,
    );
    shade.rotation.x = -Math.PI / 2;
  }
  root.traverse((o) => {
    if (o.isMesh && !o.material.transparent) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { root, nets };
}

export function buildBall(scene) {
  const ball = new T.Mesh(
    new T.SphereGeometry(COURT.ballRadius, 54, 36),
    new T.MeshStandardMaterial({ map: leather(), roughness: 0.93 }),
  );
  scene.add(ball);
  ball.geometry.rotateZ(-0.27);
  ball.geometry.rotateX(0.53);
  const hands = new T.Group();
  scene.add(hands);
  const skin = finish('#b47653', 0.83),
    nail = finish('#c99170', 0.78),
    cuff = finish('#173e40'),
    band = finish('#b99962');
  const joint = new T.SphereGeometry(1, 14, 10);
  for (const side of [-1, 1]) {
    const pt = (x, y, z) => new T.Vector3(x * side, y, z);
    function oval(p, rx, ry, rz, material = skin) {
      const m = new T.Mesh(joint, material);
      m.position.copy(p);
      m.scale.set(rx, ry, rz);
      hands.add(m);
      return m;
    }
    function limb(a, b, r1, r2, material) {
      const d = b.clone().sub(a),
        m = new T.Mesh(new T.CylinderGeometry(r2, r1, d.length(), 14), material);
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(up, d.normalize());
      hands.add(m);
    }
    const wrist = pt(0.129, -0.088, 0.094),
      sleeve = pt(0.2, -0.17, 0.17),
      elbow = pt(0.32, -0.27, 0.28);
    limb(wrist, sleeve, 0.029, 0.041, skin);
    limb(sleeve, elbow, 0.045, 0.059, cuff);
    limb(sleeve, sleeve.clone().lerp(elbow, 0.08), 0.0455, 0.047, band);
    const palm = oval(pt(0.11, -0.053, 0.072), 0.031, 0.051, 0.025);
    palm.rotation.z = -side * 0.33;
    for (let f = 0; f < 4; f++) {
      const base = pt(0.103 + f * 0.003, -0.012 - f * 0.013, 0.073 - f * 0.008);
      const knuckle = pt(0.109 + f * 0.002, 0.018 - f * 0.017, 0.06 - f * 0.007);
      const tip = pt(0.099 + f * 0.004, 0.051 - f * 0.017, 0.048 - f * 0.007);
      const r = 0.0083 - f * 0.0004;
      limb(base, knuckle, r, r * 0.91, skin);
      oval(knuckle, r * 0.92, r * 0.92, r * 0.92);
      limb(knuckle, tip, r * 0.91, r * 0.69, skin);
      oval(tip, r * 0.7, r * 0.7, r * 0.7);
      oval(tip.clone().add(pt(0.001, 0, 0.003)), r * 0.48, r * 0.57, r * 0.38, nail);
    }
    const thumbBase = pt(0.102, -0.047, 0.083),
      thumbBend = pt(0.087, -0.026, 0.093),
      thumbTip = pt(0.068, -0.01, 0.103);
    limb(thumbBase, thumbBend, 0.014, 0.011, skin);
    oval(thumbBend, 0.011, 0.011, 0.011);
    limb(thumbBend, thumbTip, 0.011, 0.008, skin);
    oval(thumbTip, 0.008, 0.008, 0.008);
    oval(thumbTip.clone().add(pt(0, 0.001, 0.005)), 0.0053, 0.006, 0.0035, nail);
  }
  return { ball, hands };
}
export function releaseObject(root, keepMaps = []) {
  const materials = new Set(),
    geometries = new Set(),
    maps = new Set();
  root.traverse((obj) => {
    if (obj.geometry) geometries.add(obj.geometry);
    if (obj.material)
      for (const m of [].concat(obj.material)) {
        materials.add(m);
        if (m.map && !keepMaps.includes(m.map)) maps.add(m.map);
      }
    if (obj.isInstancedMesh) obj.dispose();
  });
  for (const m of materials) m.dispose();
  for (const g of geometries) g.dispose();
  for (const t of maps) t.dispose();
}

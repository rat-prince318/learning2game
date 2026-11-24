import * as C from './vendor/cannon.mjs';

export const COURT = Object.freeze({
  width: 18,
  near: 12,
  far: -8,
  rimZ: -3.8,
  height: 3.05,
  rimRadius: 0.234,
  tube: 0.009,
  boardGap: 0.384,
  ballRadius: 0.12,
  gravity: 9.81,
});
export const STEP = 1 / 120;
const { height, rimRadius, tube, ballRadius, rimZ } = COURT;

export function layoutHoops(choices) {
  const spacing = choices.length === 4 ? 2.9 : 3.2;
  return choices.map((choice, index) => ({
    ...choice,
    index,
    x: (index - (choices.length - 1) / 2) * spacing,
    z: rimZ,
    y: height,
  }));
}

// Solve the release velocity for a chosen apex. Cannon uses semi-implicit Euler,
// so the half-step term compensates for the integration offset at the rim.
export function arcVelocity(from, hoop) {
  const g = COURT.gravity;
  const range = Math.hypot(hoop.x - from.x, hoop.z - from.z);
  const apex = Math.max(from.y, height) + 0.8 + 0.17 * range;
  const rise = Math.sqrt((2 * (apex - from.y)) / g);
  const flight = rise + Math.sqrt((2 * (apex - height)) / g);
  return { x: (hoop.x - from.x) / flight, y: g * (rise + STEP / 2), z: (hoop.z - from.z) / flight };
}

export function createCourtPhysics(hoops, { onBasket, onMiss, onImpact } = {}) {
  const world = new C.World({ gravity: new C.Vec3(0, -COURT.gravity, 0), allowSleep: false });
  world.solver.iterations = 14;
  const leather = new C.Material('basketball');
  const ball = new C.Body({
    mass: 0.62,
    material: leather,
    shape: new C.Sphere(ballRadius),
    linearDamping: 0,
    angularDamping: 0.035,
  });
  function material(name, restitution, friction) {
    const m = new C.Material(name);
    world.addContactMaterial(
      new C.ContactMaterial(leather, m, { restitution, friction, contactEquationStiffness: 1e8 }),
    );
    return m;
  }
  const wood = material('floor', 0.79, 0.55),
    glass = material('board', 0.73, 0.36),
    steel = material('rim', 0.56, 0.46);
  function box(x, y, z, w, h, d, mat) {
    const b = new C.Body({
      mass: 0,
      material: mat,
      position: new C.Vec3(x, y, z),
      shape: new C.Box(new C.Vec3(w / 2, h / 2, d / 2)),
    });
    world.addBody(b);
  }
  box(0, -0.15, 1.5, COURT.width + 1, 0.3, 24, wood);
  box(0, 3, COURT.far, COURT.width, 6, 0.16, glass);
  box(0, 3, COURT.near, COURT.width, 6, 0.16, glass);
  for (const side of [-1, 1]) box((side * COURT.width) / 2, 3, 2, 0.16, 6, 20, glass);
  for (const hoop of hoops) {
    const { x, z } = hoop;
    box(x, height + 0.375, z - COURT.boardGap - 0.025, 1.8, 1.05, 0.05, glass);
    box(x, height, z - 0.31, 0.15, 0.037, 0.15, steel);
    box(x, 1.55, z - 1.26, 0.17, 3.1, 0.17, steel);
    const rim = new C.Body({ mass: 0, material: steel, position: new C.Vec3(x, height, z) });
    const count = 32,
      delta = (2 * Math.PI) / count;
    for (let i = 0; i < count; i++) {
      const a = (i + 0.5) * delta;
      const center = rimRadius * Math.cos(delta / 2);
      rim.addShape(
        new C.Box(new C.Vec3(tube, tube, rimRadius * Math.sin(delta / 2) + 0.001)),
        new C.Vec3(center * Math.cos(a), 0, center * Math.sin(a)),
        new C.Quaternion().setFromAxisAngle(new C.Vec3(0, 1, 0), -a),
      );
    }
    world.addBody(rim);
  }
  let active = false,
    result = false,
    floorTime = 0,
    age = 0,
    entered = null;
  ball.addEventListener('collide', (event) => {
    if (!active) return;
    const type = event.body.material.name;
    const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
    if (impact > 0.65) onImpact?.(type, impact);
    if (type === 'floor' && !floorTime) floorTime = Math.max(STEP, age);
  });
  function recall() {
    if (active) world.removeBody(ball);
    active = false;
  }
  function shoot(position, velocity) {
    recall();
    ball.position.copy(position);
    ball.previousPosition.copy(position);
    ball.velocity.copy(velocity);
    const rangeSpeed = Math.hypot(velocity.x, velocity.z);
    if (rangeSpeed > 0.01)
      ball.angularVelocity.set(
        (-7.7 * velocity.z) / rangeSpeed,
        0.3,
        (7.7 * velocity.x) / rangeSpeed,
      );
    else ball.angularVelocity.set(0, 0, 0);
    ball.quaternion.set(0, 0, 0, 1);
    ball.force.setZero();
    ball.torque.setZero();
    world.addBody(ball);
    active = true;
    result = false;
    floorTime = 0;
    age = 0;
    entered = null;
  }
  function step() {
    if (!active) return;
    const { x: px, y: py, z: pz } = ball.position;
    world.step(STEP);
    age += STEP;
    if (result) return;
    const p = ball.position;
    if (!floorTime && py >= height && p.y < height) {
      const a = (py - height) / (py - p.y);
      const x = px + (p.x - px) * a,
        z = pz + (p.z - pz) * a;
      entered = hoops.find(
        (h) => Math.hypot(x - h.x, z - h.z) <= rimRadius - tube - ballRadius + 0.012,
      );
    }
    if (entered && p.y > height + 0.02) entered = null;
    if (entered && p.y < height - ballRadius && ball.velocity.y < 0) {
      result = true;
      onBasket?.(entered.id);
    } else if ((floorTime && age - floorTime > 0.48) || p.y < -0.5 || age > 6.5) {
      result = true;
      onMiss?.();
    }
  }
  return {
    ball,
    shoot,
    recall,
    step,
    get active() {
      return active;
    },
  };
}

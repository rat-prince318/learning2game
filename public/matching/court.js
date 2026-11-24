import * as T from './vendor/three.mjs';
import { COURT, STEP, createCourtPhysics, arcVelocity, layoutHoops } from './physics.js';
import { buildHall, buildBall, buildHoops, releaseObject } from './gym.js';
import { softwareCourt } from './fallback.js';
import { createCourtAudio } from './court-audio.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const colors = ['#a9e2af', '#ffbc82', '#9acfe5', '#dfb7ee'];
const swatches = colors.map((_, i) => String.fromCharCode(65 + i));
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);

export function mountCourt(host, callbacks = {}) {
  if (!document.querySelector('link[data-matching-court]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.dataset.matchingCourt = '';
    css.href = new URL('./court.css', import.meta.url);
    document.head.append(css);
  }
  const root = document.createElement('div');
  root.className = 'mc-scene';
  host.append(root);
  let renderer;
  try {
    renderer = new T.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
  } catch {
    /* The software renderer shares the same Cannon bodies and score sensor. */
  }
  const canvas = renderer?.domElement ?? document.createElement('canvas');
  canvas.className = 'mc-canvas';
  canvas.tabIndex = 0;
  root.append(canvas);
  const labels = document.createElement('div');
  labels.className = 'mc-projections';
  root.append(labels);
  const ballLabel = document.createElement('div');
  ballLabel.className = 'mc-ballmark';
  labels.append(ballLabel);
  const ballText = document.createElement('div');
  ballText.className = 'mc-balltext';
  ballLabel.append(ballText);
  let fitPrint = true;
  document.fonts?.ready.then(() => {
    fitPrint = true;
  });
  document.querySelector('link[data-matching-court]')?.addEventListener(
    'load',
    () => {
      fitPrint = true;
    },
    { once: true },
  );
  const stick = document.createElement('div');
  stick.className = 'mc-movement';
  stick.setAttribute('aria-hidden', 'true');
  root.append(stick);
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(49, 1, 0.035, 65);
  const sound = createCourtAudio(host);
  let hall, ballObject, hoopsObject, blob, guide, software;
  if (renderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    hall = buildHall(scene);
    ballObject = buildBall(scene);
    blob = new T.Mesh(
      new T.PlaneGeometry(1, 1),
      new T.MeshBasicMaterial({ map: hall.shadow, transparent: true, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    scene.add(blob);
    guide = new T.Group();
    const markerGeo = new T.SphereGeometry(0.02, 6, 5);
    for (let i = 0; i < 14; i++) {
      const markerMat = new T.MeshBasicMaterial({
        color: '#ffedbc',
        transparent: true,
        opacity: Math.min(0.88, 0.22 + i * 0.09),
        depthWrite: false,
      });
      const dot = new T.Mesh(markerGeo, markerMat);
      dot.scale.setScalar(Math.min(1, 0.35 + i * 0.16));
      guide.add(dot);
    }
    scene.add(guide);
  } else software = softwareCourt(canvas, camera);
  root.dataset.renderer = renderer ? 'webgl' : 'software';
  const lifetime = new AbortController(),
    opts = { signal: lifetime.signal };
  let yaw = 0,
    pitch = 0.095,
    px = 0,
    pz = 3.25,
    width = 1,
    height = 1;
  let hoops = [],
    physics,
    selected = null,
    autoTarget = null,
    phase = 'held',
    enabled = false,
    paused = false;
  let pressedAt = 0,
    power = 0,
    key = '',
    frameId = 0,
    previous = 0,
    carry = 0,
    flightAge = 0;
  let pointer = null,
    stickPointer = null,
    stickX = 0,
    stickY = 0,
    stickStart = null,
    locale = 'zh';
  const heldKeys = new Set(),
    plates = new Map(),
    position = V(),
    scratch = V(),
    start = V(),
    velocity = V();
  const gripTarget = V(),
    gripVelocity = V();
  const releaseNormal = V(),
    releaseRight = V(),
    inkNormal = V(),
    inkCenter = V(),
    inkRight = V(),
    toEye = V();
  const eyeHeight = 1.69;
  let netHit = null,
    netTime = 1,
    releasedQuaternion = new T.Quaternion();
  function state(next) {
    if (phase !== next) {
      phase = next;
      root.dataset.phase = next;
      callbacks.onState?.(next);
    }
  }
  root.dataset.phase = phase;
  const charge = (n) => {
    if (power !== n) {
      power = n;
      callbacks.onCharge?.(n);
    }
  };
  function drawLabel(node, text) {
    if (!callbacks.renderLabel) {
      node.textContent = text;
      return;
    }
    const out = callbacks.renderLabel(text);
    if (out instanceof Node) node.replaceChildren(out);
    else node.innerHTML = out ?? '';
  }
  function updateCamera() {
    camera.position.set(px, eyeHeight, pz);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    camera.updateMatrixWorld();
  }
  function heldPoint(out) {
    const t = phase === 'charging' ? power : 0;
    return out
      .set((width < 640 ? 0.065 : 0.105) + 0.02 * t, -0.17 + 0.068 * t, -0.84 - 0.055 * t)
      .applyQuaternion(camera.quaternion)
      .add(camera.position);
  }
  function followGrip(dt) {
    // A critically damped two-hand grip gives the ball inertia when the player turns or walks.
    heldPoint(gripTarget);
    const decay = Math.exp(-21 * dt);
    for (const axis of ['x', 'y', 'z']) {
      const offset = position[axis] - gripTarget[axis],
        v = gripVelocity[axis] + 21 * offset;
      position[axis] = gripTarget[axis] + (offset + v * dt) * decay;
      gripVelocity[axis] = (gripVelocity[axis] - 21 * v * dt) * decay;
    }
  }
  function aimed(id) {
    if (selected === id) return;
    selected = id;
    for (const [key, el] of plates) el.setAttribute('aria-pressed', String(key === id));
    callbacks.onAim?.(id);
  }
  function aimAt(id) {
    const h = hoops.find((h) => h.id === id);
    if (!h || paused || !enabled || phase === 'flight' || phase === 'scored') return false;
    yaw = Math.atan2(px - h.x, pz - h.z);
    pitch = clamp(Math.atan2(h.y - eyeHeight, Math.hypot(h.x - px, h.z - pz)), -0.6, 0.75);
    autoTarget = h.id;
    updateCamera();
    aimed(h.id);
    return true;
  }
  function resetBall() {
    physics?.recall();
    carry = 0;
    flightAge = 0;
    charge(0);
    state('held');
    updateCamera();
    heldPoint(position);
    gripVelocity.set(0, 0, 0);
  }
  function setRound(round) {
    const choices = round.hoops ?? [];
    locale = round.locale ?? 'zh';
    const nextKey = JSON.stringify([
      round.ball?.id,
      round.ball?.text,
      choices.map((h) => [h.id, h.text]),
      locale,
    ]);
    enabled = round.enabled !== false && !!round.ball && choices.length > 0;
    if (nextKey === key) {
      if (!enabled && phase === 'charging') resetBall();
      if (enabled && phase === 'scored') resetBall();
      return;
    }
    key = nextKey;
    physics?.recall();
    hoops = layoutHoops(choices);
    physics = createCourtPhysics(hoops, {
      onBasket(id) {
        if (phase !== 'flight') return;
        netHit = id;
        netTime = 0;
        sound.swish();
        state('scored');
        callbacks.onBasket?.(id);
      },
      onMiss() {
        if (phase !== 'flight') return;
        state('missed');
        resetBall();
        callbacks.onMiss?.();
      },
      onImpact(type, force) {
        sound.hit(type, force);
      },
    });
    if (renderer) {
      if (hoopsObject) {
        scene.remove(hoopsObject.root);
        releaseObject(hoopsObject.root, [hall.shadow]);
      }
      hoopsObject = buildHoops(scene, hoops, hall.shadow);
      renderer.shadowMap.needsUpdate = true;
    }
    for (const el of plates.values()) el.remove();
    plates.clear();
    for (const h of hoops) {
      const el = document.createElement('button');
      el.type = 'button';
      el.tabIndex = -1;
      el.className = 'mc-placard';
      el.setAttribute('aria-pressed', 'false');
      el.style.setProperty('--rim-color', colors[h.index % 4]);
      const index = document.createElement('span');
      index.className = 'mc-index';
      index.textContent = swatches[h.index % 4];
      el.append(index);
      const body = document.createElement('span');
      body.className = 'mc-placard-body';
      drawLabel(body, h.text);
      el.append(body);
      labels.append(el);
      plates.set(h.id, el);
      el.addEventListener('click', () => {
        aimAt(h.id);
        canvas.focus({ preventScroll: true });
      });
    }
    drawLabel(ballText, round.ball?.text ?? '');
    fitPrint = true;
    canvas.setAttribute(
      'aria-label',
      locale === 'en' ? 'First-person basketball court' : '第一人称篮球场',
    );
    resetBall();
    autoTarget = null;
    aimed(null);
    callbacks.onState?.('held');
    render();
  }
  function launch(v, from) {
    updateCamera();
    physics.shoot(from, v);
    position.copy(from);
    releasedQuaternion.copy(camera.quaternion);
    releaseNormal.copy(camera.position).sub(from).normalize();
    releaseRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    charge(0);
    flightAge = 0;
    carry = 0;
    state('flight');
  }
  function ready() {
    return !paused && enabled && physics && (phase === 'held' || phase === 'charging');
  }
  function assistedShot(id) {
    if (!ready() || !aimAt(id)) return false;
    sound.unlock();
    const h = hoops.find((h) => h.id === id);
    start.copy(position);
    launch(arcVelocity(start, h), start);
    return true;
  }
  function beginCharge() {
    if (!ready() || phase === 'charging') return false;
    sound.unlock();
    pressedAt = performance.now();
    state('charging');
    charge(0.04);
    return true;
  }
  function manualVelocity(v) {
    // The camera sights the hoop. The hands send the ball upward on a lob.
    // Holding charges release speed independently of the direction of the shot.
    const lift = clamp(pitch + 0.64, 0.13, 1.42),
      speed = 4.7 + power * 5.9;
    // Converge the off-centre shooting hand with the camera sight at basket depth.
    const forward = Math.cos(yaw),
      reach = forward > 0.1 ? clamp((pz - COURT.rimZ) / forward, 2, 20) : 7;
    const dx = px - reach * Math.sin(yaw) - position.x,
      dz = pz - reach * forward - position.z;
    const horizontal = (Math.cos(lift) * speed) / Math.hypot(dx, dz);
    v.set(dx * horizontal, Math.sin(lift) * speed, dz * horizontal);
    return v.addScaledVector(
      gripVelocity,
      Math.min(0.22, 0.85 / Math.max(1, gripVelocity.length())),
    );
  }
  function release() {
    if (!ready() || phase !== 'charging') return false;
    charge(clamp((performance.now() - pressedAt) / 1080, 0.04, 1));
    updateCamera();
    start.copy(position);
    launch(manualVelocity(velocity), start);
    return true;
  }
  function grab() {
    if (paused || !enabled || phase === 'scored') return false;
    resetBall();
    return true;
  }
  function clearInput() {
    heldKeys.clear();
    pointer = null;
    stickPointer = null;
    stickX = stickY = 0;
    if (phase === 'charging') resetBall();
  }
  function setPaused(value) {
    const changed = paused !== Boolean(value);
    paused = Boolean(value);
    if (changed && paused) clearInput();
    previous = 0;
  }
  function look(dx, dy) {
    yaw -= dx * 0.0042;
    pitch = clamp(pitch + dy * 0.003, -0.72, 0.98);
    autoTarget = null;
    updateCamera();
  }
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (paused || !enabled || pointer || ![0, 2].includes(e.button)) return;
      e.preventDefault();
      canvas.focus({ preventScroll: true });
      sound.unlock();
      canvas.setPointerCapture(e.pointerId);
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, throws: e.button === 0 };
      if (pointer.throws) beginCharge();
    },
    opts,
  );
  canvas.addEventListener(
    'pointermove',
    (e) => {
      if (pointer?.id !== e.pointerId || paused) return;
      const dx = e.clientX - pointer.x,
        dy = pointer.y - e.clientY;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      look(dx, dy);
    },
    opts,
  );
  canvas.addEventListener(
    'pointerup',
    (e) => {
      if (pointer?.id !== e.pointerId) return;
      const fire = pointer.throws;
      pointer = null;
      if (fire) release();
    },
    opts,
  );
  canvas.addEventListener('pointercancel', clearInput, opts);
  canvas.addEventListener(
    'lostpointercapture',
    (e) => {
      if (pointer?.id === e.pointerId) clearInput();
    },
    opts,
  );
  canvas.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
  stick.addEventListener(
    'pointerdown',
    (e) => {
      if (paused) return;
      e.preventDefault();
      stickPointer = e.pointerId;
      stickStart = [e.clientX, e.clientY];
      stick.setPointerCapture(e.pointerId);
    },
    opts,
  );
  stick.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerId !== stickPointer) return;
      stickX = clamp((e.clientX - stickStart[0]) / 24, -1, 1);
      stickY = clamp((stickStart[1] - e.clientY) / 24, -1, 1);
    },
    opts,
  );
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    stick.addEventListener(
      name,
      () => {
        stickX = stickY = 0;
        stickPointer = null;
      },
      opts,
    );
  const codes = [
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Space',
    'KeyR',
  ];
  window.addEventListener(
    'keydown',
    (e) => {
      if (
        paused ||
        !enabled ||
        e.defaultPrevented ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        !codes.includes(e.code) ||
        e.target.closest?.('dialog,input,textarea,select,[contenteditable=true]')
      )
        return;
      if (e.code === 'Space' && e.target.closest?.('button,a')) return;
      e.preventDefault();
      heldKeys.add(e.code);
      if (!e.repeat && e.code === 'Space') beginCharge();
      if (!e.repeat && e.code === 'KeyR') grab();
    },
    opts,
  );
  window.addEventListener(
    'keyup',
    (e) => {
      const down = heldKeys.delete(e.code);
      if (down && e.code === 'Space') {
        e.preventDefault();
        release();
      }
    },
    opts,
  );
  window.addEventListener('blur', clearInput, opts);
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) {
        clearInput();
        previous = 0;
      }
    },
    opts,
  );
  function resize() {
    width = Math.max(1, root.clientWidth);
    height = Math.max(1, root.clientHeight);
    camera.aspect = width / height;
    camera.fov = width < 640 ? 64 : 49;
    camera.updateProjectionMatrix();
    renderer?.setSize(width, height, false);
    software?.resize(width, height);
  }
  const size = new ResizeObserver(resize);
  size.observe(root);
  resize();
  updateCamera();
  heldPoint(position);
  function project(point) {
    scratch.copy(point).project(camera);
    return {
      x: ((scratch.x + 1) * width) / 2,
      y: ((1 - scratch.y) * height) / 2,
      visible:
        scratch.z > -1 && scratch.z < 1 && Math.abs(scratch.x) < 1.3 && Math.abs(scratch.y) < 1.35,
    };
  }
  function render() {
    updateCamera();
    const focal = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    if (renderer) {
      ballObject.ball.visible = !!key;
      ballObject.ball.position.copy(position);
      if (physics?.active)
        ballObject.ball.quaternion.copy(physics.ball.quaternion).multiply(releasedQuaternion);
      else ballObject.ball.quaternion.copy(camera.quaternion);
      const flight = physics?.active;
      ballObject.hands.visible = !!key && (!flight || flightAge < 0.38);
      if (ballObject.hands.visible) {
        if (flight) heldPoint(ballObject.hands.position);
        else ballObject.hands.position.copy(position);
        ballObject.hands.quaternion.copy(camera.quaternion);
        if (flight) {
          ballObject.hands.position.y += 0.055 * Math.sin((Math.PI * flightAge) / 0.38);
          ballObject.hands.rotateX(-flightAge * 1.1);
        }
      }
      blob.position.set(position.x, 0.008, position.z);
      blob.scale.setScalar(0.37 + position.y * 0.09);
      blob.material.opacity = Math.max(0.2, 0.83 - position.y * 0.1);
      guide.visible = phase === 'charging' && !paused;
      if (guide.visible) {
        manualVelocity(velocity);
        guide.children.forEach((dot, i) => {
          const t = (i + 1) * 0.077;
          dot.position.copy(position).addScaledVector(velocity, t);
          dot.position.y -= (COURT.gravity * t * t) / 2;
          dot.visible = dot.position.y > 0;
        });
      }
      if (hoopsObject?.nets.has(netHit)) {
        const net = hoopsObject.nets.get(netHit);
        if (netTime < 0.65) {
          net.scale.y = 1 + Math.sin(netTime * 18) * Math.exp(-netTime * 7) * 0.31;
          net.rotation.x = 0.075 * Math.sin(netTime * 20) * Math.exp(-netTime * 6);
        } else {
          net.scale.y = 1;
          net.rotation.x = 0;
          netHit = null;
        }
      }
      renderer.render(scene, camera);
    } else software.draw(hoops, position);
    let best = null,
      score = Infinity;
    for (const h of hoops) {
      const p = project(V(h.x, h.y + 0.58, h.z - COURT.boardGap + 0.015));
      const el = plates.get(h.id);
      el.hidden = !p.visible;
      if (!p.visible) continue;
      const depth = camera.position.distanceTo(V(h.x, h.y + 0.58, h.z)),
        w = clamp((focal * 1.82) / depth, 52, 270);
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      el.style.width = w + 'px';
      el.style.fontSize = clamp(w / 9.5, 9, 18) + 'px';
      const rim = project(V(h.x, h.y, h.z)),
        dist = Math.hypot((rim.x - width / 2) / focal, (rim.y - height / 2) / focal);
      if (dist < 0.33 && dist < score) {
        score = dist;
        best = h.id;
      }
    }
    if (phase === 'held' || phase === 'charging') aimed(autoTarget ?? best);
    let p = project(position),
      face = 1,
      angle = -5;
    if (physics?.active) {
      // The lettering belongs to the released ball. Backspin carries it out of sight.
      inkNormal.copy(releaseNormal).applyQuaternion(physics.ball.quaternion);
      inkCenter.copy(position).addScaledVector(inkNormal, COURT.ballRadius);
      face = inkNormal.dot(toEye.copy(camera.position).sub(position).normalize());
      p = project(inkCenter);
      inkRight
        .copy(releaseRight)
        .applyQuaternion(physics.ball.quaternion)
        .multiplyScalar(0.04)
        .add(inkCenter);
      const edge = project(inkRight);
      angle += (Math.atan2(edge.y - p.y, edge.x - p.x) * 180) / Math.PI;
    }
    const diameter = (2 * focal * COURT.ballRadius) / camera.position.distanceTo(position);
    ballLabel.hidden = !key || !p.visible || diameter < 19 || face < 0.23;
    if (!ballLabel.hidden) {
      ballLabel.style.left = p.x + 'px';
      ballLabel.style.top = p.y + 'px';
      if (fitPrint) {
        // Typeset once on a fixed-size printing plate; projection scales the complete imprint.
        for (let font = 24; font >= 8; font -= 1) {
          ballLabel.style.fontSize = font + 'px';
          if (
            ballText.scrollHeight <= ballText.clientHeight + 1 &&
            ballText.scrollWidth <= ballText.clientWidth + 1
          )
            break;
        }
        fitPrint = false;
      }
      const printScale = diameter / 250;
      ballLabel.style.transform =
        'translate(-50%,-50%) rotate(' +
        angle +
        'deg) scale(' +
        printScale +
        ',' +
        printScale * face +
        ')';
    }
  }
  function step(now) {
    frameId = requestAnimationFrame(step);
    if (document.hidden || !root.isConnected) {
      previous = 0;
      return;
    }
    const dt = previous ? Math.min((now - previous) / 1000, 0.23) : 0;
    previous = now;
    if (paused) return;
    if (phase === 'charging') charge(clamp((now - pressedAt) / 1080, 0.04, 1));
    if (enabled) {
      let dx = stickX + Number(heldKeys.has('KeyD')) - Number(heldKeys.has('KeyA')),
        dz = stickY + Number(heldKeys.has('KeyW')) - Number(heldKeys.has('KeyS'));
      const n = Math.max(1, Math.hypot(dx, dz));
      dx /= n;
      dz /= n;
      if (dx || dz) autoTarget = null;
      px = clamp(px + (dx * Math.cos(yaw) - dz * Math.sin(yaw)) * 2.9 * dt, -6, 6);
      pz = clamp(pz + (-dx * Math.sin(yaw) - dz * Math.cos(yaw)) * 2.9 * dt, -2.25, 9.5);
      const turn = Number(heldKeys.has('ArrowRight')) - Number(heldKeys.has('ArrowLeft')),
        tilt = Number(heldKeys.has('ArrowUp')) - Number(heldKeys.has('ArrowDown'));
      if (turn || tilt) look(turn * dt * 235, tilt * dt * 230);
    }
    if (physics?.active) {
      flightAge += dt;
      carry += dt;
      while (carry >= STEP && physics.active) {
        carry -= STEP;
        physics.step();
      }
      if (physics.active) position.copy(physics.ball.position);
    } else {
      updateCamera();
      followGrip(dt);
    }
    netTime += dt;
    render();
  }
  frameId = requestAnimationFrame(step);
  return {
    setRound,
    aimAt,
    assistedShot,
    grab,
    beginCharge,
    release,
    setPaused,
    webgl: !!renderer,
    dispose() {
      cancelAnimationFrame(frameId);
      size.disconnect();
      lifetime.abort();
      physics?.recall();
      sound.dispose();
      if (renderer) {
        releaseObject(scene);
        renderer.dispose();
        renderer.forceContextLoss();
      }
      root.remove();
    },
  };
}

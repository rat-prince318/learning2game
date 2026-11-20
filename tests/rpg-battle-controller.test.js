import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../public/js/api.js';
import { BattleController } from '../public/rpg/battle/controller.js';
import { forgetSavedSession, getSavedSession, startDemo } from '../public/rpg/battle/demo.js';

function records() {
  const data = new Map();
  return {
    read: (key) => structuredClone(data.get(key) ?? null),
    write: (key, value) => data.set(key, structuredClone(value)),
  };
}

const answer = { action: 'answer', prompt_id: 'p', option_id: 'o', skill: 'guard' };
const state = (revision) => ({ session_id: 'session', phase: 'combat', revision });

test('a validated opening view can send the first turn without another GET', async () => {
  const calls = [];
  const api = { request: async (path, options) => { calls.push({ path, options }); return state(2); } };
  const config = { api, storage: records(), initialView: state(1) };
  assert.throws(() => new BattleController('different', config), { code: 'BAD_RESPONSE' });
  const controller = new BattleController('session', config);
  assert.deepEqual(controller.view, state(1));
  await controller.send(answer);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body.expected_revision, 1);
});

test('two clicks share a single request, using the expedition revision', async () => {
  const calls = [];
  const api = { request: async (url, init) => {
    calls.push({ url, init });
    return init ? state(9) : { ...state(8), battle: { revision: 1 } };
  } };
  const controller = new BattleController('session', { api, storage: records() });
  await controller.load();
  const first = controller.send(answer);
  assert.equal(first, controller.send(answer));
  await assert.rejects(controller.send({ action: 'hint', prompt_id: 'p' }), { code: 'BUSY' });
  assert.deepEqual(await first, state(9));
  assert.equal(calls.length, 2);
  const posted = calls[1].init.body;
  assert.match(posted.event_id, /^[a-f0-9]{32}$/);
  assert.deepEqual(posted, { ...answer, event_id: posted.event_id, expected_revision: 8 });
  assert.equal(controller.hasPending, false);
});

test('a refresh retries an undelivered command with the original id and choice', async () => {
  const storage = records();
  const bodies = [];
  const api = { request: async (_url, init) => {
    if (!init) return state(3);
    bodies.push(structuredClone(init.body));
    if (bodies.length === 1) throw new ApiError('NETWORK_ERROR', 'disconnected');
    return state(4);
  } };
  const tab = new BattleController('session', { api, storage });
  await tab.load();
  await assert.rejects(tab.send(answer), { code: 'NETWORK_ERROR' });
  assert.equal(tab.hasPending, true);
  await assert.rejects(tab.send({ ...answer, option_id: 'different' }), { code: 'PENDING_TURN' });
  const refreshed = new BattleController('session', { api, storage });
  assert.deepEqual(await refreshed.load(), state(4));
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(refreshed.hasPending, false);
});

test('a lost receipt followed by progress in another tab restores the newest server view', async () => {
  let revision = 6;
  let submissions = 0;
  const api = { request: async (_url, init) => {
    if (!init) return state(revision);
    submissions++;
    revision += 2;
    throw new ApiError('NETWORK_ERROR', 'lost response after commit');
  } };
  const tab = new BattleController('session', { api, storage: records() });
  await tab.load();
  await assert.rejects(tab.send(answer));
  assert.deepEqual(await tab.retry(), state(8));
  assert.equal(submissions, 1);
  assert.equal(tab.hasPending, false);
  assert.equal(tab.resynced, true);
});

test('a 409 fetches current state, and a 422 allows a new choice', async () => {
  let revision = 1;
  const api = { request: async (_url, init) => {
    if (!init) return state(revision);
    if (revision === 1) {
      revision++;
      throw new ApiError('HTTP_ERROR', 'revision', 409);
    }
    throw new ApiError('HTTP_ERROR', 'validation', 422);
  } };
  const tab = new BattleController('session', { api, storage: records() });
  await tab.load();
  assert.deepEqual(await tab.send(answer), state(2));
  assert.equal(tab.resynced, true);
  assert.equal(tab.hasPending, false);
  await assert.rejects(tab.send(answer), { status: 422 });
  assert.equal(tab.hasPending, false);
});

test('demo requires offline expedition support before uploading anything', async () => {
  const api = { health: async () => ({ mode: 'live', rpg_play_modes: ['expedition'] }) };
  await assert.rejects(startDemo({ api }), { code: 'OFFLINE_DEMO' });
});

test('standalone sample resumes existing jobs, recovers stale game IDs and opens fresh runs', async (t) => {
  const values = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v),
  } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
  const storage = records();
  const calls = [];
  const runs = [];
  let uploads = 0, planTries = 0, expired = false;
  const api = {
    health: async () => ({ mode: 'offline', rpg_play_modes: ['expedition'] }),
    upload: async (file) => {
      uploads++;
      assert.equal(file.name, 'cell-notes.txt');
      return { material_id: 'material', job_id: 'upload', delete_token: 'private-token' };
    },
    waitForJob: async (job) => {
      if (job === 'upload') return { status: 'completed', result: { material_id: 'material' } };
      if (job === 'plan') {
        if (++planTries === 1) throw new ApiError('NETWORK_ERROR', 'lost');
        return { status: 'awaiting_confirmation', result: { plan_id: 'plan-id' } };
      }
      return { status: 'completed', result: { game_id: 'published-' + uploads } };
    },
    request: async (url, init) => {
      calls.push(url);
      if (url === '/rpg/plans') return { job_id: 'plan' };
      if (url === '/rpg/games') return { job_id: 'publish' };
      if (url === '/rpg/expeditions') {
        if (expired && init.body.game_ids[0] === 'published-1') throw new ApiError('HTTP_ERROR', 'expired', 404);
        runs.push(init.body.request_id);
        return { session_id: 'run' + runs.length };
      }
      const session_id = 'run' + runs.length;
      if (init) {
        assert.equal(init.body.route_id, 'boss_steady');
        return { session_id, revision: 1, phase: 'combat' };
      }
      return { session_id, revision: 0, phase: 'route', routes: [{ id: 'boss_steady', encounter_id: 'willow_lock' }] };
    },
  };
  const options = { api, storage, fetchImpl: async () => new Response('cell notes') };
  const first = startDemo(options);
  assert.equal(first, startDemo(options));
  await assert.rejects(first, { code: 'NETWORK_ERROR' });
  assert.equal(JSON.stringify(storage.read('l2g.battle.preparation.v1.arcanist')).includes('private-token'), false);
  assert.equal((await startDemo(options)).phase, 'combat');
  assert.equal((await startDemo(options)).session_id, 'run2');
  assert.equal(calls.filter((url) => url === '/rpg/plans').length, 1);
  assert.equal(uploads, 1);
  assert.equal(getSavedSession(), 'run2');
  forgetSavedSession('run1');
  assert.equal(getSavedSession(), 'run2');
  expired = true;
  assert.equal((await startDemo(options)).session_id, 'run3');
  assert.equal(uploads, 2);
  assert.equal(new Set(runs).size, 3);
  forgetSavedSession('run3');
  assert.equal(getSavedSession(), null);
});

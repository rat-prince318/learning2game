import { msg } from '../../js/locale.js';
import { ApiClient, ApiError } from '../../js/api.js';
import { newId, readLocal, saveLocal } from '../../js/utils.js';
import { BattleController, tabRecords } from './controller.js';

const LAST_SESSION = 'l2g.battle.last-session.v1';
const SAMPLE_GAME = 'l2g.battle.cell-notes-six.v1';
const BUILD = 'l2g.battle.preparation.v1';
let starting = null;

export function getSavedSession() {
  const saved = readLocal(LAST_SESSION);
  return typeof saved === 'string' && saved.length ? saved : null;
}

export function rememberSession(sessionId) {
  saveLocal(LAST_SESSION, sessionId);
}

export function forgetSavedSession(sessionId) {
  if (!sessionId || sessionId === getSavedSession()) saveLocal(LAST_SESSION, null);
}

// The cached game is immutable and contains the same public sample lecture for
// every playthrough. Each click after a completed opening still gets a new run.
async function prepare(options) {
  const {
    api = new ApiClient(), heroClass = 'arcanist', onProgress = () => {},
    fetchImpl = globalThis.fetch, storage = tabRecords,
  } = options;
  onProgress(msg('正在连接烟柳渡','Contacting Willow Ferry…'));
  const health = await api.health();
  if (health.mode !== 'offline' || !health.rpg_play_modes?.includes('expedition')) {
    throw new ApiError('OFFLINE_DEMO', msg('试玩需要离线远征服务。可从主站打开已有存档，或用 EDUGAME_MODE=offline 启动本地服务。','The demo uses offline expedition mode. Open an existing save in the studio or start the service with EDUGAME_MODE=offline.'));
  }

  const checkpointKey = BUILD + '.' + heroClass;
  let saved = storage.read(checkpointKey);
  const persist = (fields) => {
    Object.assign(saved, fields);
    storage.write(checkpointKey, saved);
  };
  async function wait(jobField, expectedStatus) {
    try {
      const job = await api.waitForJob(saved[jobField]);
      if (job.status !== expectedStatus || !job.result) {
        throw new ApiError('BAD_RESPONSE', msg('课程任务返回了意外状态，请重试。','The course job returned an unexpected state. Please retry.'));
      }
      return job.result;
    } catch (error) {
      if (error.code === 'JOB_FAILED') persist({ [jobField]: null });
      throw error;
    }
  }

  async function prepareMaterial() {
    onProgress(msg('正在整理细胞生物学讲义','Binding the biology field guide…'));
    if (!saved.uploadJob) {
      let receipt;
      if (saved.materialId) {
        receipt = await api.retryMaterial(saved.materialId);
      } else {
        const response = await fetchImpl('/examples/cell-notes.txt');
        if (!response.ok) throw new Error(msg('示例讲义读取失败，请刷新后重试。','The sample field guide could not be opened. Refresh to retry.'));
        const file = new File([await response.blob()], 'cell-notes.txt', { type: 'text/plain' });
        receipt = await api.upload(file);
      }
      // The upload response also contains a deletion credential. Keep only
      // identifiers needed to continue the public demo.
      persist({ materialId: receipt.material_id, uploadJob: receipt.job_id });
    }
    await wait('uploadJob', 'completed');
    persist({ materialReady: true });
  }

  async function preparePlan() {
    if (!saved.materialReady) await prepareMaterial();
    onProgress(msg('正在编排六道首领挑战','Etching six boss inscriptions…'));
    if (!saved.planJob) {
      const receipt = await api.request('/rpg/plans', { method: 'POST', body: {
        material_id: saved.materialId,
        preferences: {
          scene_count: 1, challenge_count: 6, theme: 'fantasy', difficulty: 'medium',
          goal: 'review', learner_level: 'beginner',
        },
      } });
      persist({ planJob: receipt.job_id });
    }
    const planned = await wait('planJob', 'awaiting_confirmation');
    persist({ planId: planned.plan_id });
  }

  async function publishSample() {
    if (!saved.planId) await preparePlan();
    onProgress(msg('正在准备战场和题目','Preparing the battlefield and inscriptions…'));
    if (!saved.publishJob) {
      const receipt = await api.request('/rpg/games', { method: 'POST', body: {
        plan_id: saved.planId, confirmed: true,
      } });
      persist({ publishJob: receipt.job_id });
    }
    const published = await wait('publishJob', 'completed');
    persist({ gameId: published.game_id });
    saveLocal(SAMPLE_GAME, saved.gameId);
  }

  // Only rebuild once when the database was replaced and persisted IDs have
  // expired. Network errors preserve every received job and request handle.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!saved) {
      saved = { requestId: newId(), gameId: readLocal(SAMPLE_GAME) };
      storage.write(checkpointKey, saved);
    }
    try {
      if (!saved.gameId) await publishSample();

      onProgress(msg('正在前往柳根水闸','Approaching the willow sluice…'));
      if (!saved.sessionId) {
        const start = await api.request('/rpg/expeditions', { method: 'POST', body: {
          game_ids: [saved.gameId], hero_class: heroClass, kit: 'trail', request_id: saved.requestId,
        } });
        persist({ sessionId: start.session_id });
      }
      const controller = new BattleController(saved.sessionId, { api, storage });
      let view = await controller.load();
      if (view.phase === 'route') {
        const route = view.routes.find((item) => item.id === 'boss_steady' && item.encounter_id === 'willow_lock');
        if (!route) throw new Error(msg('首领路线尚未开放，请从章节地图继续。','Continue from the chapter map to open the boss road.'));
        view = await controller.send({ action: 'choose_route', route_id: route.id });
      }
      rememberSession(view.session_id);
      storage.write(checkpointKey, null);
      return view;
    } catch (error) {
      if (error.status !== 404 || attempt === 1) throw error;
      saved = null;
      storage.write(checkpointKey, null);
      saveLocal(SAMPLE_GAME, null);
    }
  }
}

// The standalone entry calls this after an explicit "进入首领战" click.
// Embedded battles only use BattleController with the host's session ID.
export function startDemo(options = {}) {
  if (!starting) {
    starting = prepare(options).finally(() => { starting = null; });
  }
  return starting;
}

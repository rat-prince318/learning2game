import { ApiClient } from '../../js/api.js';
import { newId, readLocal, saveLocal } from '../../js/utils.js';
import { tabRecords } from '../battle/controller.js';
import { fieldbook } from './fieldbook.js';
import { rememberMaterial } from '../../js/material-library.js';

const api = new ApiClient();
const jobKey = 'l2g.lantern.build.1';
export const savedBuild = () => tabRecords.read(jobKey);
export function discardBuild() {
  tabRecords.write(jobKey, null);
}
export async function commission({ files = [], role, locale, difficulty, onStep }) {
  let task = savedBuild();
  if (!task) {
    const builtin = files.length === 0;
    task = {
      role,
      locale,
      difficulty,
      builtin,
      names: files.map((f) => [f.name, f.size, f.lastModified]),
      sources: [],
      books: [],
      startId: newId(),
    };
    const cached = builtin && readLocal('l2g.fieldbook.1.' + locale + '.' + difficulty);
    if (cached?.length) task.books = cached.map((game) => ({ game }));
    tabRecords.write(jobKey, task);
  }
  const save = () => tabRecords.write(jobKey, task);
  const post = (path, body) => api.request(path, { method: 'POST', body });
  async function awaitJob(record, key, expected) {
    try {
      const job = await api.waitForJob(record[key]);
      if (job.status !== expected || !job.result) throw new Error('JOB_RESULT');
      return job.result;
    } catch (error) {
      if (error.code === 'JOB_FAILED' || error.status === 404) {
        delete record[key];
        save();
      }
      throw error;
    }
  }
  if (!task.books.length || task.books.some((b) => !b.game)) {
    if (!task.outline) {
      const materials = task.builtin ? [fieldbook(task.locale)] : files;
      const count = task.builtin ? 1 : task.names.length;
      for (let i = 0; i < count; i++) {
        const item = (task.sources[i] ||= {});
        if (item.ready) continue;
        onStep('source', i + 1, count);
        if (!item.job) {
          const f = materials[i];
          if (
            !task.builtin &&
            (!f || JSON.stringify([f.name, f.size, f.lastModified]) !== JSON.stringify(task.names[i]))
          )
            throw new Error('RESELECT_FILES');
          const receipt = item.material ? await api.retryMaterial(item.material) : await api.upload(f);
          if (!task.builtin && receipt.delete_token) rememberMaterial(receipt, f.name);
          item.material = receipt.material_id;
          item.job = receipt.job_id;
          save();
        }
        await awaitJob(item, 'job', 'completed');
        item.ready = true;
        save();
      }
      const outline = await post('/rpg/expedition-outline', {
        sources: task.sources.map((x) => ({ material_id: x.material })),
        concepts_per_volume: task.builtin ? 4 : 8,
        scenes_per_volume: 2,
        difficulty: task.difficulty,
      });
      task.outline = outline.volumes.map((v) => v.plan_request);
      task.books = task.outline.map(() => ({}));
      save();
    }
    // Avoid flooding a model-backed deployment with simultaneous course jobs.
    for (let i = 0; i < task.books.length; i++) {
      const book = task.books[i];
      if (book.game) continue;
      onStep('book', i + 1, task.books.length);
      if (!book.plan) {
        if (!book.planJob) {
          book.planJob = (await post('/rpg/plans', task.outline[i])).job_id;
          save();
        }
        book.plan = (await awaitJob(book, 'planJob', 'awaiting_confirmation')).plan_id;
        save();
      }
      if (!book.gameJob) {
        book.gameJob = (await post('/rpg/games', { plan_id: book.plan, confirmed: true })).job_id;
        save();
      }
      book.game = (await awaitJob(book, 'gameJob', 'completed')).game_id;
      save();
    }
  }
  onStep('depart', 1, 1);
  const ids = task.books.map((b) => b.game);
  try {
    const view = await post('/rpg/expeditions', {
      game_ids: ids,
      hero_class: task.role,
      kit: task.role === 'vanguard' ? 'ward' : 'trail',
      request_id: task.startId,
    });
    if (task.builtin) saveLocal('l2g.fieldbook.1.' + task.locale + '.' + task.difficulty, ids);
    discardBuild();
    return view;
  } catch (error) {
    if (error.status === 404) {
      if (task.builtin) saveLocal('l2g.fieldbook.1.' + task.locale + '.' + task.difficulty, null);
      discardBuild();
    }
    throw error;
  }
}

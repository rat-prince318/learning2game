import { savedMaterials, rememberMaterial, forgetMaterial } from './material-library.js';
import { studyMarkup } from './study.js';
import { msg, getLocale, setLocale } from './locale.js';
import { ui, bindStudioChrome, currentCopy } from './studio-copy.js';
import { ApiClient, JOB_LABELS } from './api.js';
import { MatchingEngine, validatePublicGame } from './engine.js';
import {
  readLocal,
  saveLocal,
  validateFile,
  parsePages,
  duration,
  displayText,
  newId,
  h,
} from './utils.js';
import { renderKnowledge, renderPlan, renderPlay, renderReport } from './views.js';

const $ = (id) => document.getElementById(id);
const renderChrome = bindStudioChrome();
const STORAGE = 'learning2game-workspace-v2';
const api = new ApiClient();
const engine = new MatchingEngine(api);
const initial = () => ({
  materialId: null,
  deleteToken: null,
  fileName: '',
  planJob: null,
  draftIds: null,
  draftDifficulty: null,
  scope: null,
  pending: null,
  gameId: null,
  sessionId: null,
  recovery: null,
  hintEvent: null,
  startedAt: null,
  limit: 0,
  traces: {},
  preferences: null,
});
let state = initial(),
  health = null,
  file = null,
  knowledge = null,
  plan = null,
  game = null,
  report = null;
let busy = false,
  retryAction = null,
  confirmHandler = null,
  scheduledFinish = null,
  feedbackEpoch = 0,
  toastTimer = null;
const persist = () => {
  if (health) saveLocal(STORAGE, { ...state, mode: health.mode });
};
function preferences() {
  return {
    question_language: getLocale(),
    learner_level: $('learner-level').value,
    goal: $('learning-goal').value,
    difficulty: $('difficulty').value,
    pair_count: Number($('pair-count').value),
  };
}
function applyPreferences(p) {
  if (p) {
    $('learner-level').value = p.learner_level;
    $('learning-goal').value = p.goal;
    $('difficulty').value = p.difficulty;
    $('pair-count').value = p.pair_count;
  }
}
function toast(message) {
  $('toast').textContent = displayText(message);
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 3600);
}
function errorBanner(error, retry) {
  $('error-message').textContent = displayText(error.message || ui('请重新尝试。'));
  $('global-error').hidden = false;
  retryAction = retry;
  $('retry-global').hidden = !retry;
  $('global-error').scrollIntoView({ block: 'nearest' });
}
function clearError() {
  $('global-error').hidden = true;
  retryAction = null;
}
function rememberUpload() {
  rememberMaterial(
    { material_id: state.materialId, mode: health?.mode, delete_token: state.deleteToken },
    state.fileName,
  );
}
function refreshLibrary() {
  const files = savedMaterials().filter((item) => item.mode === health?.mode);
  const list = $('saved-materials');
  list.replaceChildren();
  if (!files.length) {
    const empty = document.createElement('li');
    empty.textContent = ui('这个服务模式下的资料清单为空。');
    list.append(empty);
    return;
  }
  for (const entry of files) {
    const row = document.createElement('li'),
      title = document.createElement('span'),
      button = document.createElement('button');
    title.textContent = displayText(entry.label, ui('课程资料'));
    button.type = 'button';
    button.className = 'text-button';
    button.textContent = ui('删除');
    button.setAttribute('aria-label', msg('删除 ', 'Delete ') + title.textContent);
    button.onclick = () => {
      $('privacy-dialog').close();
      confirmDialog(
        ui('删除这份资料？'),
        msg(
          title.textContent + ' 及其关联的练习、报告将一并删除。',
          'This also deletes practice and reports linked to ' + title.textContent + '.',
        ),
        ui('确认删除'),
        () =>
          run(async () => {
            let result;
            try {
              result = await api.deleteMaterial(entry.id, entry.token);
            } catch (error) {
              if (error.status !== 404) throw error;
              confirmDialog(
                ui('此服务中未找到该资料'),
                ui('可以保留记录，或仅清除这台浏览器保存的引用。'),
                ui('清除本机引用'),
                () => {
                  forgetMaterial(entry.id, health?.mode);
                  if (state.materialId === entry.id) {
                    reset();
                    go('create');
                  }
                  refreshLibrary();
                },
              );
              return;
            }
            forgetMaterial(entry.id, health?.mode);
            if (state.materialId === entry.id) {
              reset();
              go('create');
            }
            refreshLibrary();
            toast(
              result.file_pending
                ? ui('关联记录已删除。文件正在使用，服务重启后会重试清理。')
                : ui('这份资料及关联练习已删除。'),
            );
          }),
      );
    };
    row.append(title, button);
    list.append(row);
  }
}
function confirmDialog(title, message, label, fn) {
  $('dialog-title').textContent = title;
  $('dialog-message').textContent = message;
  $('confirm-dialog-action').textContent = label;
  confirmHandler = fn;
  $('confirm-dialog').showModal();
}
function selectedIds() {
  return [...$('plan-choices').querySelectorAll('input:checked')].map((el) => el.value);
}
function controls() {
  for (const id of [
    'sample-button',
    'remove-file',
    'start-button',
    'clear-data-button',
    'report-restart',
    'new-material',
    'material-file',
    'analyze-button',
    'pdf-pages',
  ])
    $(id).disabled = busy || !health;
  document
    .querySelectorAll(
      '#preferences-form input,#preferences-form select,#plan-panel input,#plan-panel select',
    )
    .forEach((el) => (el.disabled = busy));
  const n = selectedIds().length;
  $('generate-button').disabled = busy || !$('confirm-plan').checked || !plan || n < 2 || n > 12;
  $('practice-button').disabled = busy || !report?.weak_knowledge_ids.length;
  $('main').setAttribute('aria-busy', String(busy));
  renderPlay(engine.snapshot, busy);
}
async function run(fn, retry = fn) {
  if (busy) return;
  busy = true;
  clearError();
  controls();
  try {
    await fn();
  } catch (err) {
    errorBanner(err, retry ? () => run(retry) : null);
  } finally {
    busy = false;
    controls();
    persist();
  }
}
function workflow(stage, label) {
  const order = ['material', 'plan', 'generate', 'ready'];
  for (const li of $('workflow-steps').children) {
    li.classList.toggle('active', li.dataset.step === stage);
    li.classList.toggle('done', order.indexOf(li.dataset.step) < order.indexOf(stage));
  }
  $('state-tag').textContent = ui(label) || ui('等待选材');
  $('job-status').textContent =
    {
      material: ui('正在读取资料并整理知识点。'),
      plan: ui('查看本轮方案，确认想练习的范围。'),
      generate: ui('正在制作和检查配对卡片。'),
      ready: ui('关卡已保存，可以开始配对。'),
    }[stage] || ui('请选择课件或试用示例。');
}
function traces(job) {
  if (job?.job_id) state.traces[job.job_id] = job.tool_calls || [];
  const all = Object.values(state.traces).flat();
  $('trace-note').textContent = all.length
    ? msg(`本次制作已记录 ${all.length} 次工具调用。`, `${all.length} tool calls recorded.`)
    : ui('工具执行后，这里会显示名称、状态与耗时。');
  $('tool-log').innerHTML = all
    .map(
      (t) =>
        `<li><strong>${h(t.name)}</strong><span>${t.status === 'ok' ? ui('成功') : ui('失败')} / ${Math.round(t.duration_ms)} ms</span></li>`,
    )
    .join('');
}
function reset() {
  feedbackEpoch++;
  state = initial();
  file = null;
  knowledge = null;
  plan = null;
  game = null;
  report = null;
  engine.clear();
  scheduledFinish = null;
  $('material-file').value = '';
  $('pdf-pages').value = '';
  $('confirm-plan').checked = false;
  for (const id of [
    'selected-file',
    'file-preview',
    'pdf-options',
    'knowledge-panel',
    'plan-panel',
    'ready-panel',
    'hint-content',
  ])
    $(id).hidden = true;
  clearError();
  workflow(null);
  traces();
  controls();
  persist();
}
function navigate(route, focus = true) {
  if (!['create', 'play', 'report'].includes(route)) route = 'create';
  for (const name of ['create', 'play', 'report']) $('page-' + name).hidden = name !== route;
  document.querySelectorAll('[data-route]').forEach((a) => {
    if (a.dataset.route === route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const missing = (route === 'play' && !engine.snapshot) || (route === 'report' && !report);
  $('empty-page').hidden = !missing;
  $('empty-message').textContent =
    route === 'play'
      ? ui('先选择资料、确认方案并创建一轮练习。')
      : ui('结束一轮配对后即可查看学习记录。');
  if (missing) $('page-' + route).hidden = true;
  document.title =
    { create: ui('创建练习'), play: ui('配对练习'), report: ui('学习报告') }[route] +
    ' | Learning2Game';
  if (focus) $(missing ? 'empty-title' : route + '-title').focus({ preventScroll: true });
}
function go(route) {
  if (location.hash !== '#' + route) location.hash = route;
  else navigate(route);
  window.scrollTo(0, 0);
}
async function chooseFile(f) {
  validateFile(f, health);
  reset();
  file = f;
  state.fileName = f.name;
  $('file-name').textContent = displayText(f.name, ui('选中的课件'));
  $('file-size').textContent = `${Math.max(1, Math.round(f.size / 1024))} KB`;
  $('selected-file').hidden = false;
  $('pdf-options').hidden = !/\.pdf$/i.test(f.name);
  if (/\.(txt|md)$/i.test(f.name)) {
    const excerpt = await f.slice(0, 8000).text();
    if (file !== f) return;
    $('preview-content').innerHTML = studyMarkup(excerpt);
    $('file-preview').hidden = false;
  }
  workflow(null, ui('已选资料'));
  persist();
}
async function sample() {
  const path =
    health.mode === 'demo'
      ? '/demo/material'
      : msg('/examples/cell-notes.txt', '/examples/cell-notes-en.txt');
  const res = await fetch(path);
  if (!res.ok) throw new Error(ui('示例讲义读取失败。'));
  await chooseFile(
    new File(
      [await res.blob()],
      health.mode === 'demo' ? ui('机器学习示例.txt') : ui('细胞结构讲义.txt'),
      {
        type: 'text/plain',
      },
    ),
  );
  await analyze();
}
function newJob(kind, handle) {
  state.pending = { kind, id: handle.job_id };
  persist();
}
async function waitPending() {
  const task = state.pending;
  const stage = { material: 'material', plan: 'plan', practice: 'plan', game: 'generate' }[
    task.kind
  ];
  try {
    return await api.waitForJob(task.id, (j) => {
      workflow(stage, JOB_LABELS[j.status]);
      traces(j);
    });
  } catch (error) {
    if (error.code === 'JOB_FAILED') {
      state.pending = null;
      if (task.kind === 'material') state.needsRetry = true;
      workflow(stage, ui('请查看处理提示'));
      persist();
    }
    throw error;
  }
}
async function readKnowledge() {
  knowledge = await api.knowledge(state.materialId);
  renderKnowledge(knowledge);
}
function showPlan(result, kind, jobId, restoring = false) {
  plan = result.plan;
  if (!plan || !result.plan_id) throw new Error(ui('方案数据缺失，请重新推荐。'));
  if (!restoring) {
    state.planJob = jobId;
    state.draftIds = [...plan.knowledge_ids];
    state.draftDifficulty = plan.difficulty;
    state.scope = kind === 'practice' ? [...plan.knowledge_ids] : null;
    state.gameId = null;
    state.sessionId = null;
    state.recovery = null;
    state.hintEvent = null;
    game = null;
    report = null;
    engine.clear();
  }
  state.planId = result.plan_id;
  const options = knowledge.knowledge.filter(
    (k) => !state.scope || state.scope.includes(k.knowledge_id),
  );
  renderPlan(
    { ...plan, difficulty: state.draftDifficulty || plan.difficulty },
    options,
    state.draftIds || plan.knowledge_ids,
  );
  workflow('plan', ui('待确认'));
  controls();
  persist();
}
async function resolvePending() {
  while (state.pending) {
    const { kind, id } = state.pending;
    const job = await waitPending();
    if (kind === 'material') {
      await readKnowledge();
      state.pending = null;
      newJob('plan', await api.plan(state.materialId, state.preferences || preferences()));
    } else if (kind === 'plan' || kind === 'practice') {
      if (!knowledge) await readKnowledge();
      showPlan(job.result, kind, id);
      state.pending = null;
      go('create');
      $('plan-panel').scrollIntoView({ block: 'center' });
    } else if (kind === 'game') {
      game = validatePublicGame(await api.getGame(job.result.game_id));
      state.gameId = game.game_id;
      state.sessionId = null;
      state.recovery = null;
      state.hintEvent = null;
      report = null;
      engine.clear();
      state.pending = null;
      ready();
      $('ready-panel').scrollIntoView({ block: 'center' });
    }
    persist();
  }
}
async function analyze() {
  if (state.pending) return resolvePending();
  const prefs = preferences();
  state.preferences = prefs;
  if (!state.materialId) {
    validateFile(file, health);
    const pages = /\.pdf$/i.test(file.name) ? parsePages($('pdf-pages').value) : [];
    workflow('material', ui('正在上传'));
    const out = await api.upload(file, pages);
    state.materialId = out.material_id;
    state.deleteToken = out.delete_token;
    rememberUpload();
    newJob('material', out);
  } else if (state.needsRetry) {
    const retried = await api.retryMaterial(state.materialId);
    state.needsRetry = false;
    newJob('material', retried);
  } else {
    await readKnowledge();
    newJob('plan', await api.plan(state.materialId, prefs));
  }
  await resolvePending();
}
async function generate() {
  if (!state.pending) {
    if (!plan || !$('confirm-plan').checked) throw new Error(ui('请先确认本轮练习范围。'));
    const draft = { ...plan, difficulty: $('plan-difficulty').value, knowledge_ids: selectedIds() };
    newJob('game', await api.generate(state.planId, draft));
  }
  await resolvePending();
}
function ready() {
  $('plan-panel').hidden = true;
  $('ready-panel').hidden = false;
  $('ready-description').innerHTML =
    `${studyMarkup(game.title)} / ${game.pair_count} ${msg('对', 'pairs')}`;
  workflow('ready', ui('已就绪'));
}
async function start(fresh = false) {
  if (!game) game = validatePublicGame(await api.getGame(state.gameId));
  if (fresh || !state.sessionId) {
    const session = await api.createSession(game.game_id);
    state.sessionId = session.session_id;
    state.recovery = null;
    state.hintEvent = null;
    state.startedAt = Date.now();
    state.finishedAt = null;
    state.limit = $('timer-enabled').checked ? Number($('time-limit').value) : 0;
    persist();
  }
  const session = await api.getSession(state.sessionId);
  if (session.status === 'finished') {
    if (fresh) throw new Error(ui('请重新开始一轮练习。'));
    report = await api.report(state.sessionId);
    showReport();
    return;
  }
  report = null;
  feedbackEpoch++;
  scheduledFinish = null;
  $('hint-content').hidden = true;
  $('attempt-feedback').textContent = ui('完成一次配对即可查看反馈。');
  engine.start(game, session, state.recovery || {});
  go('play');
  persist();
}
async function finish() {
  report = await api.finish(state.sessionId);
  engine.updateSession({ ...engine.snapshot.session, status: 'finished' });
  state.finishedAt ||= Date.now();
  showReport();
}
function showReport() {
  if (!report) return;
  renderReport(report, game?.title);
  go('report');
  controls();
  persist();
  loadFeedback();
}
async function loadFeedback() {
  const epoch = ++feedbackEpoch,
    sid = report?.session_id;
  if (!sid) return;
  const note = $('report-advice'),
    btn = $('retry-feedback');
  btn.hidden = true;
  note.textContent = ui('正在整理复习建议…');
  try {
    const handle = await api.feedback(sid);
    const job = await api.waitForJob(handle.job_id, (j) => {
      if (epoch === feedbackEpoch) traces(j);
    });
    if (epoch !== feedbackEpoch) return;
    $('report-advice').innerHTML = studyMarkup(
      job.result.feedback || ui('可按报告里的出处回到资料复习。'),
    );
  } catch (e) {
    if (epoch !== feedbackEpoch) return;
    $('report-advice').textContent = displayText(e.message);
    $('retry-feedback').hidden = false;
    $('retry-feedback').onclick = loadFeedback;
  }
}
async function practice() {
  if (!state.pending) newJob('practice', await api.practice(report.session_id));
  await resolvePending();
}
async function hint() {
  const left = engine.snapshot?.selectedLeft;
  if (!left) return;
  if (!state.hintEvent || state.hintEvent.left !== left) state.hintEvent = { id: newId(), left };
  persist();
  const out = await api.hint(state.sessionId, left, state.hintEvent.id);
  engine.updateSession(out.session);
  $('hint-content').innerHTML = studyMarkup(out.hint);
  $('hint-content').hidden = false;
  state.hintEvent = null;
  persist();
}
async function synchronize() {
  const session = await api.getSession(state.sessionId),
    recovery = engine.recovery();
  if (session.status === 'finished') {
    report = await api.report(state.sessionId);
    showReport();
    return;
  }
  if (engine.snapshot?.error?.code === 'HTTP_ERROR') recovery.pendingEvent = null;
  engine.start(game, session, recovery);
  toast(ui('进度已同步。'));
}
async function restart() {
  if (engine.snapshot?.session.status === 'active') await api.finish(state.sessionId);
  await start(true);
}
function tick() {
  const s = engine.snapshot;
  if (!s || !state.startedAt) return;
  const elapsed = Math.floor(((state.finishedAt || Date.now()) - state.startedAt) / 1000);
  $('play-time').textContent = duration(state.limit ? state.limit - elapsed : elapsed);
  $('time-label').textContent = state.limit ? ui('剩余时间') : ui('已用时间');
  const done =
    s.session.completed_pairs === game?.pair_count || (state.limit && elapsed >= state.limit);
  if (done && !busy && !report && s.phase === 'active' && scheduledFinish !== state.sessionId) {
    scheduledFinish = state.sessionId;
    run(finish);
  }
}
async function restore() {
  applyPreferences(state.preferences);
  if (state.fileName) {
    $('file-name').textContent = displayText(state.fileName, ui('已上传课件'));
    $('file-size').textContent = ui('已上传');
    $('selected-file').hidden = false;
  }
  if (state.pending) {
    await resolvePending();
    return;
  }
  if (state.gameId) game = validatePublicGame(await api.getGame(state.gameId));
  if (state.sessionId && game) {
    const s = await api.getSession(state.sessionId);
    engine.start(game, s, state.recovery || {});
    if (s.status === 'finished') {
      report = await api.report(state.sessionId);
      showReport();
    } else {
      ready();
      go('play');
    }
  } else if (game) ready();
  else if (state.materialId && !state.needsRetry) {
    await readKnowledge();
    if (state.planJob) {
      const saved = await api.waitForJob(state.planJob);
      showPlan(saved.result, 'plan', state.planJob, true);
    }
  }
}
function changeDraft() {
  state.draftIds = selectedIds();
  state.draftDifficulty = $('plan-difficulty').value;
  $('confirm-plan').checked = false;
  controls();
  persist();
}
function renderService() {
  if (!Array.isArray(health.supported_extensions))
    health.supported_extensions = ['.pdf', '.txt', '.png', '.jpg', '.jpeg'];
  $('material-file').accept = health.supported_extensions.join(',');
  $('upload-types').textContent =
    health.supported_extensions.map((s) => s.replace(/^\./, '').toUpperCase()).join(' / ') +
    msg('，最大 ', ', max ') +
    Math.ceil(health.max_upload_bytes / 1048576) +
    ' MiB';
  $('mode-button').textContent =
    health.mode === 'demo'
      ? ui('示例模式')
      : health.external_models
        ? ui('云端模型')
        : ui('本地处理');
  $('mode-button').classList.toggle('real', !health.external_models);
  const privacy = health.external_models
    ? ui('材料会发送给已配置的外部模型服务。请上传已获授权、适合共享的内容。')
    : health.mode === 'demo'
      ? ui('当前使用固定示例讲义，数据保存在本地。')
      : ui('资料在本地处理。请使用已获授权的课件。');
  $('privacy-note').textContent = privacy;
  $('vision-example').hidden = !health.external_models;
  $('privacy-detail').textContent = privacy;
  if (health.mode === 'demo') $('sample-button').textContent = ui('试用机器学习讲义 →');
}
function events() {
  $('sample-button').onclick = () =>
    run(sample, () => (state.pending || state.materialId ? analyze() : sample()));
  $('go-upload').onclick = (e) => {
    e.preventDefault();
    $('upload-panel').scrollIntoView({ block: 'center' });
    $('material-file').focus({ preventScroll: true });
  };
  $('preferences-form').onsubmit = (e) => {
    e.preventDefault();
    run(analyze);
  };
  $('timer-enabled').onchange = () => ($('timer-options').hidden = !$('timer-enabled').checked);
  $('preferences-form').onchange = (e) => {
    if (
      !['learner-level', 'learning-goal', 'difficulty', 'pair-count'].includes(e.target.id) ||
      !plan ||
      state.gameId
    )
      return;
    $('plan-panel').hidden = true;
    state.planJob = null;
    state.draftIds = null;
    plan = null;
    workflow('plan', ui('设置已更新'));
    $('job-status').textContent = ui('请点击“分析资料并推荐方案”以应用新的练习设置。');
    controls();
    persist();
  };
  $('material-file').onchange = (e) => {
    const f = e.target.files[0];
    if (f) run(() => chooseFile(f));
  };
  $('pdf-pages').onchange = () => {
    if (state.materialId && file) {
      const current = file,
        range = $('pdf-pages').value;
      run(async () => {
        await chooseFile(current);
        $('pdf-pages').value = range;
      });
    }
  };
  const drop = $('drop-zone');
  drop.ondragover = (e) => {
    e.preventDefault();
    if (!busy) drop.classList.add('dragging');
  };
  drop.ondragleave = () => drop.classList.remove('dragging');
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove('dragging');
    if (health && e.dataTransfer.files[0]) run(() => chooseFile(e.dataTransfer.files[0]));
  };
  $('remove-file').onclick = () => reset();
  $('new-material').onclick = () => {
    reset();
    go('create');
  };
  $('confirm-plan').onchange = controls;
  $('plan-choices').onchange = changeDraft;
  $('plan-difficulty').onchange = changeDraft;
  $('generate-button').onclick = () => run(generate);
  $('start-button').onclick = () => run(() => start());
  for (const area of [$('left-cards'), $('right-cards')]) {
    area.onclick = (e) => {
      const c = e.target.closest('[data-card-id]');
      if (!c || busy || c.disabled) return;
      if (c.dataset.side === 'left') {
        $('hint-content').hidden = true;
        engine.selectLeft(c.dataset.cardId);
      } else engine.chooseRight(c.dataset.cardId);
    };
    area.onkeydown = (e) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key))
        return;
      const card = e.target.closest('[data-card-id]');
      if (!card) return;
      e.preventDefault();
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        document
          .querySelector(
            (e.key === 'ArrowRight' ? '#right-cards' : '#left-cards') + ' button:not(:disabled)',
          )
          ?.focus();
        return;
      }
      const cards = [...area.querySelectorAll('button:not(:disabled)')];
      const i = cards.indexOf(card);
      cards[
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? cards.length - 1
            : (i + (e.key === 'ArrowDown' ? 1 : -1) + cards.length) % cards.length
      ]?.focus();
    };
  }
  $('hint-button').onclick = () => run(hint);
  $('retry-attempt-button').onclick = () => engine.retry();
  $('sync-session-button').onclick = () => run(synchronize);
  $('restart-button').onclick = () =>
    confirmDialog(
      ui('重新开始这组卡片？'),
      ui('本轮成绩将保存，然后开启新的配对会话。'),
      ui('重新开始'),
      () => run(restart),
    );
  $('report-restart').onclick = () => run(() => start(true));
  $('finish-button').onclick = () =>
    confirmDialog(
      ui('结束本轮练习？'),
      ui('本轮记录会立即保存，随后可以查看学习报告。'),
      ui('结束并查看报告'),
      () => run(finish),
    );
  $('practice-button').onclick = () => run(practice);
  $('export-report').onclick = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
      url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'learning-report-' + report.session_id + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  $('dismiss-error').onclick = clearError;
  $('retry-global').onclick = () => retryAction?.();
  for (const id of ['mode-button', 'privacy-button'])
    $(id).onclick = () => {
      refreshLibrary();
      $('privacy-dialog').showModal();
    };
  document
    .querySelectorAll('[data-close-dialog]')
    .forEach((b) => (b.onclick = () => b.closest('dialog').close()));
  $('cancel-dialog').onclick = () => $('confirm-dialog').close();
  $('confirm-dialog-action').onclick = () => {
    const fn = confirmHandler;
    confirmHandler = null;
    $('confirm-dialog').close();
    fn?.();
  };
  $('clear-data-button').onclick = () =>
    confirmDialog(
      ui('清理本次记录？'),
      state.deleteToken
        ? ui('将删除本次上传的资料、关联关卡和成绩。')
        : ui('将清除这台浏览器中的练习引用。'),
      ui('确认清理'),
      () =>
        run(async () => {
          let result = {};
          if (state.materialId && state.deleteToken) {
            result = await api.deleteMaterial(state.materialId, state.deleteToken);
            forgetMaterial(state.materialId, health?.mode);
          }
          reset();
          go('create');
          toast(
            result.file_pending
              ? ui('记录已清理。文件将在服务重启后重试删除。')
              : ui('本次记录已清理。'),
          );
        }),
    );
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
}
async function boot() {
  health = await api.health();
  renderService();
  const saved = readLocal(STORAGE);
  if (saved?.mode === health.mode) {
    state = { ...initial(), ...saved };
    rememberUpload();
  }
  traces();
  navigate(location.hash.slice(1), false);
  controls();
  if (state.materialId || state.gameId || state.pending) await restore();
}
function changeLanguage() {
  renderChrome();
  const english = getLocale() === 'en';
  const language = $('studio-language');
  language.textContent = english ? '中文' : 'English';
  language.lang = english ? 'zh-CN' : 'en';
  language.setAttribute('aria-label', english ? 'Switch to Chinese' : '切换至英文');
  document.querySelector('.hero-figure img').src = english
    ? '/examples/cell-diagram-en.svg'
    : '/examples/cell-diagram.svg';
  for (const id of [
    'state-tag',
    'job-status',
    'file-size',
    'empty-message',
    'error-message',
    'toast',
    'dialog-title',
    'dialog-message',
    'confirm-dialog-action',
    'attempt-feedback',
    'report-advice',
  ]) {
    const node = $(id);
    if (node && !node.children.length) node.textContent = currentCopy(node.textContent);
  }
  if (health) renderService();
  if (knowledge) renderKnowledge(knowledge);
  if (plan && !$('plan-panel').hidden) {
    const ids = selectedIds(),
      checked = $('confirm-plan').checked,
      difficulty = $('plan-difficulty').value;
    renderPlan(
      { ...plan, difficulty },
      knowledge.knowledge.filter((k) => !state.scope || state.scope.includes(k.knowledge_id)),
      ids,
    );
    $('confirm-plan').checked = checked;
  }
  if (game && !$('ready-panel').hidden) ready();
  if (report) {
    const advice = $('report-advice'),
      retry = $('retry-feedback');
    renderReport(report, game?.title);
    if (advice?.querySelector('.study-content') || (retry && !retry.hidden)) {
      $('report-advice').replaceWith(advice);
      $('retry-feedback').hidden = retry.hidden;
      $('retry-feedback').onclick = loadFeedback;
    }
  }
  refreshLibrary();
  traces();
  navigate(location.hash.slice(1), false);
  controls();
}
$('studio-language').onclick = () => setLocale(getLocale() === 'en' ? 'zh' : 'en');
window.addEventListener('learning2game:locale', changeLanguage);
changeLanguage();
events();
engine.subscribe((snapshot) => {
  if (snapshot) {
    state.recovery = engine.recovery();
    renderPlay(snapshot, busy);
    persist();
  }
});
setInterval(tick, 500);
run(boot);

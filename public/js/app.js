import { ApiClient, ApiError, JOB_LABELS } from './api.js';
import { MatchingEngine, validatePublicGame } from './engine.js';
import { readLocal, saveLocal, validateFile, parsePages, duration, escapeHtml as h } from './utils.js';
import { renderKnowledge, renderPlan, renderPlay, renderReport } from './views.js';

const $ = id => document.getElementById(id);
const STORAGE = 'learning2game-state-v1';
let config, api, engine, mode, file = null, previewUrl = null, busy = false, controller = null;
let plan = null, game = null, report = null, retryAction = null, dialogAction = null;
let timedOutSession = null, reportScheduled = null, toastTimer, currentRoute = 'create';
let state = { materialId: null, jobId: null, jobKind: null, gameId: null, sessionId: null, preferences: null, recovery: null, hintEvent: null, operations: {}, toolCalls: [] };

function persist() { saveLocal(STORAGE, { ...state, mode }); }
function eventId(operation) { return state.operations[operation] ||= crypto.randomUUID(); }
function resetOperation(operation) { delete state.operations[operation]; }
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
function showError(error, retry = null) {
  if (error.name === 'AbortError') return;
  $('error-message').textContent = error.message || '操作失败，请重试。'; $('global-error').hidden = false;
  retryAction = retry; $('retry-global').hidden = !retry;
  $('global-error').scrollIntoView({ block: 'nearest' });
}
function clearError() { $('global-error').hidden = true; retryAction = null; }
function confirmAction(title, message, label, action) {
  $('dialog-title').textContent = title; $('dialog-message').textContent = message;
  $('confirm-dialog-action').textContent = label; dialogAction = action; $('confirm-dialog').showModal();
}
function setBusy(value) {
  busy = value;
  for (const id of ['analyze-button', 'sample-button', 'material-file', 'remove-file', 'start-button', 'mode-button', 'clear-data-button', 'practice-button', 'report-restart', 'new-material', 'retry-global']) {
    $(id).disabled = value || (id === 'practice-button' && report && !report.weak_knowledge_items?.length);
  }
  document.querySelectorAll('#preferences-form input, #preferences-form select, #pdf-pages, #include-image').forEach(el => el.disabled = value);
  $('generate-button').disabled = value || !$('confirm-plan').checked || !plan;
  $('confirm-plan').disabled = value;
  $('main').setAttribute('aria-busy', String(value));
  renderPlay(engine?.snapshot, busy);
}
async function run(action, retry = action) {
  if (busy) return;
  clearError(); setBusy(true);
  try { await action(); }
  catch (error) {
    if (['FILE_UNREADABLE', 'IMAGE_BLURRY', 'KNOWLEDGE_INSUFFICIENT', 'MODEL_TIMEOUT', 'VALIDATION_FAILED'].includes(error.code)) {
      const kind = state.jobKind;
      state.jobId = null; state.jobKind = null;
      if (kind === 'material') { state.materialId = null; resetOperation('upload'); }
      if (kind === 'game' && plan) resetOperation(`generate:${plan.plan_id}`);
      if (kind === 'practice' && report) resetOperation(`practice:${report.session_id}`);
      workflow('failed', null, error.message);
    }
    showError(error, retry === action ? () => run(action) : retry);
  }
  finally { setBusy(false); persist(); }
}
function preferences() {
  return { level: $('learner-level').value, goal: $('learning-goal').value, pair_count: Number(document.querySelector('input[name="pair_count"]:checked').value), time_limit_seconds: $('timer-enabled').checked ? Number($('time-limit').value) : null };
}
function restorePreferences(value) {
  if (!value) return;
  if (['beginner', 'intermediate', 'advanced'].includes(value.level)) $('learner-level').value = value.level;
  if (['definitions', 'functions', 'english'].includes(value.goal)) $('learning-goal').value = value.goal;
  const count = [...document.querySelectorAll('input[name="pair_count"]')].find(input => Number(input.value) === value.pair_count);
  if (count) count.checked = true;
  $('timer-enabled').checked = Boolean(value.time_limit_seconds);
  if ([120, 180, 300].includes(value.time_limit_seconds)) $('time-limit').value = String(value.time_limit_seconds);
  $('timer-options').hidden = !$('timer-enabled').checked;
}
function workflow(status, progress = null, message = null) {
  const stage = ['queued', 'uploading', 'parsing', 'extracting'].includes(status) ? 'material' : status === 'awaiting_confirmation' ? 'plan' : ['generating', 'validating', 'repairing'].includes(status) ? 'generate' : status === 'completed' ? 'ready' : null;
  const order = ['material', 'plan', 'generate', 'ready'];
  document.querySelectorAll('#workflow-steps li').forEach(li => {
    li.classList.toggle('active', li.dataset.step === stage);
    li.classList.toggle('done', stage && order.indexOf(li.dataset.step) < order.indexOf(stage));
  });
  $('state-tag').textContent = status === 'idle' ? '未上传' : JOB_LABELS[status] || status;
  $('job-status').textContent = message || JOB_LABELS[status] || '先选择一份资料，或试用教学样例。';
  $('job-progress').hidden = progress === null;
  if (progress !== null) $('job-progress').value = progress;
}
function renderTrace(job) {
  if (job?.tool_calls?.length) {
    for (const call of job.tool_calls) {
      const key = call.call_id || JSON.stringify(call);
      if (!state.toolCalls.some(c => (c.call_id || JSON.stringify(c)) === key)) state.toolCalls.push(call);
    }
  }
  $('trace-note').textContent = mode === 'demo' ? '这些阶段是演示状态。当前没有真实模型工具调用，不能用作课程的 Function Calling 证据。' : state.toolCalls.length ? '以下为后端返回的实际工具调用记录。' : '后端尚未返回工具调用记录；页面不会推测或生成记录。';
  $('tool-log').innerHTML = state.toolCalls.map(call => `<li><strong>${h(call.name || call.tool_name)}</strong> · ${h(call.status || '已返回')}<br>${h(call.summary || '')}${call.elapsed_ms !== undefined ? ` · ${h(call.elapsed_ms)} ms` : ''}</li>`).join('');
}
async function poll(jobId) {
  return api.waitForJob(jobId, job => { workflow(job.status, job.progress ?? null); renderTrace(job); }, { signal: controller?.signal });
}
async function selectFile(value) {
  try {
    validateFile(value);
    file = value;
    if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(file);
    $('file-name').textContent = file.name; $('file-size').textContent = `${(file.size / 1024).toFixed(1)} KB`;
    $('selected-file').hidden = false; $('file-preview').hidden = false;
    $('pdf-options').hidden = !/\.pdf$/i.test(file.name); $('image-options').hidden = !/\.(png|jpe?g|webp)$/i.test(file.name);
    $('pdf-pages').value = '';
    const preview = $('preview-content'); preview.replaceChildren();
    if (/\.pdf$/i.test(file.name)) { const frame = document.createElement('iframe'); frame.src = `${previewUrl}#page=1`; frame.title = `PDF 预览：${file.name}`; preview.append(frame); }
    else if (/\.(png|jpe?g|webp)$/i.test(file.name)) { const image = document.createElement('img'); image.src = previewUrl; image.alt = `所选学习图像：${file.name}`; preview.append(image); }
    else if (/\.txt$/i.test(file.name)) { const pre = document.createElement('pre'); pre.textContent = (await file.text()).slice(0, 10000); preview.append(pre); }
    else { const p = document.createElement('p'); p.textContent = '此文档将由后端解析；当前浏览器仅显示文件信息。'; preview.append(p); }
    state.materialId = null; state.jobId = null; state.jobKind = null; state.gameId = null; state.sessionId = null; state.recovery = null; state.hintEvent = null; state.operations = {}; state.toolCalls = [];
    engine.clear(); game = null; plan = null; report = null;
    ['knowledge-panel', 'plan-panel', 'ready-panel'].forEach(id => $(id).hidden = true);
    $('confirm-plan').checked = false; workflow('idle', null, '资料已选择。设置学习偏好后，开始分析。');
    clearError(); renderTrace(); persist();
  } catch (error) { showError(error); }
}

async function analyze() {
  await run(async () => {
    controller = new AbortController(); const prefs = preferences();
    state.preferences = prefs; persist();
    const pages = /\.pdf$/i.test(file?.name || '') ? parsePages($('pdf-pages').value) : [];
    if (!state.materialId) {
      validateFile(file); workflow('uploading', 0.05);
      persist();
      const uploaded = await api.upload(file, { pages, includeImage: $('include-image').checked, eventId: eventId('upload'), signal: controller.signal });
      state.materialId = uploaded.material_id; state.jobId = uploaded.job_id; state.jobKind = 'material'; persist();
    }
    if (state.jobKind === 'material' && state.jobId) { await poll(state.jobId); state.jobId = null; state.jobKind = null; }
    const knowledge = await api.knowledge(state.materialId, controller.signal); renderKnowledge(knowledge); renderTrace(knowledge);
    state.preferences = prefs; persist();
    plan = await api.plan(state.materialId, prefs, eventId(`plan:${JSON.stringify(prefs)}`), controller.signal);
    renderPlan(plan, prefs); $('confirm-plan').checked = false; $('plan-change-note').hidden = true;
    workflow('awaiting_confirmation', 1); persist();
  });
}
async function generate() {
  if (!$('confirm-plan').checked) { toast('请先查看知识点并确认练习设置。'); return; }
  await run(async () => {
    controller = new AbortController(); const prefs = preferences();
    if (!plan || JSON.stringify(prefs) !== JSON.stringify(state.preferences)) {
      plan = await api.plan(state.materialId, prefs, eventId(`plan:${JSON.stringify(prefs)}`), controller.signal);
      state.preferences = prefs; renderPlan(plan, prefs); $('plan-change-note').hidden = true;
    }
    if (!state.jobId || state.jobKind !== 'game') {
      workflow('generating', 0.1); persist();
      const result = await api.generate(plan.plan_id, prefs, eventId(`generate:${plan.plan_id}`), controller.signal);
      state.jobId = result.job_id; state.jobKind = 'game'; persist();
    }
    const job = await poll(state.jobId);
    if (!job.result?.game_id) throw new ApiError('INVALID_CONFIG', '生成任务缺少 game_id。');
    game = validatePublicGame(await api.getGame(job.result.game_id)); state.gameId = game.game_id; state.sessionId = null; state.recovery = null;
    engine.clear(); report = null; state.hintEvent = null;
    state.jobId = null; state.jobKind = null; resetOperation('start');
    ready(); persist();
    $('start-button').focus({ preventScroll: true });
  });
}
function ready() {
  $('ready-panel').hidden = false; $('ready-description').textContent = `${game.title} · ${game.pair_count} 对卡片。`;
  workflow('completed', 1, '内容已返回并通过公开配置检查，可以开始配对。');
}
async function startRound({ fresh = false } = {}) {
  if (!game && state.gameId) game = validatePublicGame(await api.getGame(state.gameId));
  if (!game) throw new Error('请先生成一组练习。');
  let session;
  if (!fresh && state.sessionId) session = await api.getSession(state.sessionId);
  if (!session || fresh || session.status !== 'active') {
    session = await api.createSession(game.game_id, eventId(`start:${game.game_id}:${state.nextRoundKey || 'first'}`)); state.recovery = null;
  }
  state.sessionId = session.session_id; state.gameId = game.game_id; state.hintEvent = null;
  $('hint-content').hidden = true; $('attempt-feedback').innerHTML = '<p class="muted">完成一次配对后，这里会显示反馈和解释。</p>';
  report = null; timedOutSession = null; reportScheduled = null;
  engine.start(game, session, state.recovery || {}); persist(); location.hash = 'play'; showPage('play');
}
async function finishRound(reason = 'exit') {
  if (!state.sessionId) return;
  const finished = await api.finish(state.sessionId, reason, eventId(`finish:${state.sessionId}:${reason}`));
  if (finished.session) engine.updateSession(finished.session);
  engine.suspend();
  $('selection-status').textContent = '正在生成本轮学习报告，请稍等。';
  if (finished.job_id) await poll(finished.job_id);
  report = await readReport();
  renderReport(report); location.hash = 'report'; showPage('report'); persist();
}
async function readReport() {
  let result = await api.report(state.sessionId);
  if (result.job_id) { await poll(result.job_id); result = await api.report(state.sessionId); }
  return result;
}
async function restart() {
  state.nextRoundKey = crypto.randomUUID(); persist();
  const action = async () => {
    if (engine.snapshot?.session.status === 'active') await api.finish(state.sessionId, 'restart', eventId(`finish:${state.sessionId}:restart`));
    engine.suspend(); await startRound({ fresh: true });
  };
  if (engine.snapshot?.session.status === 'active') confirmAction('重新开始本组练习？', '本轮会结束并保留记录。新一轮创建独立会话，卡片会重新打乱，统计从零开始。', '重新开始', () => run(action));
  else await run(action);
}
async function hint() {
  const current = engine.snapshot;
  if (!current?.selectedLeft || current.phase !== 'active') return;
  const left = current.selectedLeft;
  await run(async () => {
    if (!state.hintEvent || state.hintEvent.left_card_id !== left) state.hintEvent = { left_card_id: left, event_id: crypto.randomUUID() };
    persist();
    const result = await api.hint(state.sessionId, left, state.hintEvent.event_id);
    $('hint-content').textContent = `${result.term || '提示'}：${result.hint}`; $('hint-content').hidden = false;
    if (result.session) engine.updateSession(result.session);
    state.hintEvent = null; persist();
  }, hint);
}
async function practice() {
  if (!report?.weak_knowledge_items?.length) return;
  await run(async () => {
    controller = new AbortController();
    workflow('generating', 0.1, '正在为本轮薄弱知识点生成下一组练习。');
    if (!state.jobId || state.jobKind !== 'practice') {
      const result = await api.practice(report.session_id, report.preferences || state.preferences, eventId(`practice:${report.session_id}`), controller.signal);
      state.jobId = result.job_id; state.jobKind = 'practice'; persist();
    }
    const job = await poll(state.jobId);
    game = validatePublicGame(await api.getGame(job.result.game_id));
    state.gameId = game.game_id; state.sessionId = null; state.recovery = null; state.jobId = null; state.jobKind = null;
    await startRound({ fresh: true }); toast('已创建薄弱知识点练习。先回忆，再配对。');
  });
}
function showPage(route = location.hash.slice(1) || 'create') {
  currentRoute = ['create', 'play', 'report'].includes(route) ? route : 'create';
  ['create', 'play', 'report'].forEach(name => $(`page-${name}`).hidden = name !== currentRoute);
  $('empty-page').hidden = true;
  document.querySelectorAll('[data-route]').forEach(a => { if (a.dataset.route === currentRoute) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (currentRoute === 'play' && !engine.snapshot || currentRoute === 'report' && !report) {
    $(`page-${currentRoute}`).hidden = true; $('empty-page').hidden = false;
    $('empty-title').textContent = currentRoute === 'report' ? '还没有本轮报告' : '练习尚未开始';
    $('empty-message').textContent = currentRoute === 'report' && state.sessionId ? '先结束本轮并查看报告。如果正在恢复记录，请稍等。' : '先上传资料并确认方案，即可开始配对。';
  }
  document.title = `${{ create: '创建练习', play: 'Matching Game', report: '学习报告' }[currentRoute]} · Learning2Game`;
  const title = $(currentRoute === 'create' ? 'create-title' : currentRoute === 'play' ? 'play-title' : 'report-title');
  if (!title.closest('[hidden]')) title.focus({ preventScroll: true });
}
async function restore() {
  await run(async () => {
    if (state.materialId) {
      renderKnowledge(await api.knowledge(state.materialId));
      if (!state.jobId) {
        plan = await api.plan(state.materialId, state.preferences || preferences(), eventId(`plan:${JSON.stringify(state.preferences || preferences())}`));
        renderPlan(plan, state.preferences || preferences()); workflow('awaiting_confirmation', 1);
      }
    }
    if (state.gameId) { game = validatePublicGame(await api.getGame(state.gameId)); ready(); }
    if (state.sessionId && game) {
      const session = await api.getSession(state.sessionId); engine.start(game, session, state.recovery || {});
      if (session.status !== 'active') { report = await readReport(); renderReport(report); }
      toast('已从服务端恢复本轮记录。');
    }
    if (state.jobId) {
      const kind = state.jobKind;
      const job = await poll(state.jobId);
      if (kind === 'material') {
        renderKnowledge(await api.knowledge(state.materialId)); plan = await api.plan(state.materialId, state.preferences || preferences(), eventId(`plan:${JSON.stringify(state.preferences || preferences())}`)); renderPlan(plan, state.preferences || preferences());
      } else {
        game = validatePublicGame(await api.getGame(job.result.game_id)); state.gameId = game.game_id;
        state.sessionId = null; state.recovery = null; resetOperation('start'); ready();
      }
      state.jobId = null; state.jobKind = null;
    }
    showPage();
  }, restore);
}
function newMaterial() {
  engine.clear(); file = null; game = null; report = null; plan = null;
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  state = { materialId: null, jobId: null, jobKind: null, gameId: null, sessionId: null, preferences: preferences(), recovery: null, hintEvent: null, operations: {}, toolCalls: [] };
  $('material-file').value = '';
  ['selected-file', 'file-preview', 'pdf-options', 'image-options', 'knowledge-panel', 'plan-panel', 'ready-panel', 'hint-content'].forEach(id => $(id).hidden = true);
  $('confirm-plan').checked = false; $('generate-button').disabled = true; workflow('idle'); renderTrace(); clearError(); persist(); location.hash = 'create'; showPage('create');
}
function invalidateMaterialSelection() {
  if (!state.materialId) return;
  state.materialId = null; state.jobId = null; state.jobKind = null; state.gameId = null; state.sessionId = null;
  state.recovery = null; state.operations = {}; state.toolCalls = []; state.hintEvent = null;
  engine.clear(); plan = null; game = null; report = null;
  ['knowledge-panel', 'plan-panel', 'ready-panel'].forEach(id => $(id).hidden = true);
  $('confirm-plan').checked = false; $('generate-button').disabled = true;
  workflow('idle', null, '资料范围已修改，请重新分析当前文件。'); renderTrace(); persist();
}

function wireEvents() {
  $('preferences-form').addEventListener('submit', event => { event.preventDefault(); analyze(); });
  $('material-file').addEventListener('change', event => { if (event.target.files[0]) selectFile(event.target.files[0]); });
  $('remove-file').addEventListener('click', newMaterial);
  const drop = $('drop-zone');
  drop.addEventListener('dragover', event => { event.preventDefault(); if (!busy) drop.classList.add('dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('dragging'); if (!busy && event.dataTransfer.files[0]) selectFile(event.dataTransfer.files[0]); });
  $('sample-button').addEventListener('click', async () => { try { const response = await fetch('/examples/cell-notes.txt'); if (!response.ok) throw new Error('教学样例无法读取。'); await selectFile(new File([await response.text()], '细胞结构教学样例.txt', { type: 'text/plain' })); } catch (error) { showError(error); } });
  $('timer-enabled').addEventListener('change', () => $('timer-options').hidden = !$('timer-enabled').checked);
  $('preferences-form').addEventListener('change', () => {
    state.draftPreferences = preferences(); persist();
    if (plan) { $('plan-change-note').hidden = false; $('confirm-plan').checked = false; $('generate-button').disabled = true; $('ready-panel').hidden = true; }
  });
  $('pdf-pages').addEventListener('change', () => {
    try { const pages = parsePages($('pdf-pages').value); const frame = $('preview-content').querySelector('iframe'); if (frame && previewUrl) frame.src = `${previewUrl}#page=${pages[0] || 1}`; invalidateMaterialSelection(); } catch (error) { showError(error); }
  });
  $('include-image').addEventListener('change', invalidateMaterialSelection);
  $('confirm-plan').addEventListener('change', () => $('generate-button').disabled = busy || !$('confirm-plan').checked || !plan);
  $('generate-button').addEventListener('click', generate);
  $('start-button').addEventListener('click', () => run(() => startRound()));
  for (const container of [$('left-cards'), $('right-cards')]) {
    container.addEventListener('click', event => {
      const card = event.target.closest('[data-card-id]'); if (!card || busy || card.disabled) return;
      if (card.dataset.side === 'left') { $('hint-content').hidden = true; engine.selectLeft(card.dataset.cardId); }
      else engine.chooseRight(card.dataset.cardId);
    });
    container.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowRight', 'ArrowLeft'].includes(event.key)) return;
      const card = event.target.closest('[data-card-id]'); if (!card) return;
      event.preventDefault();
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        document.querySelector(`${event.key === 'ArrowRight' ? '#right-cards' : '#left-cards'} button:not(:disabled)`)?.focus(); return;
      }
      const cards = [...container.querySelectorAll('button:not(:disabled)')], index = cards.indexOf(card);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + cards.length) % cards.length;
      cards[next]?.focus();
    });
  }
  $('retry-attempt-button').addEventListener('click', () => engine.retry());
  $('sync-session-button').addEventListener('click', () => run(async () => {
    const session = await api.getSession(state.sessionId); const recovery = engine.recovery();
    if (['ALREADY_MATCHED', 'SESSION_ENDED', 'INVALID_REQUEST'].includes(engine.snapshot.error?.code)) recovery.pendingEvent = null;
    engine.start(game, session, recovery); toast('已同步服务端状态。');
  }));
  $('hint-button').addEventListener('click', hint);
  $('restart-button').addEventListener('click', restart); $('report-restart').addEventListener('click', restart);
  $('finish-button').addEventListener('click', () => {
    if (engine.snapshot?.session.status !== 'active') run(() => finishRound('completed'));
    else confirmAction('结束本轮并查看报告？', '已完成的配对、错误和提示记录会保留。未完成的知识点会列入下一轮练习。', '结束并查看报告', () => run(() => finishRound('exit')));
  });
  $('practice-button').addEventListener('click', practice); $('new-material').addEventListener('click', newMaterial);
  $('export-report').addEventListener('click', () => {
    if (!report) return; const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `learning-report-${report.session_id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  $('retry-global').addEventListener('click', () => { const action = retryAction; if (action) action(); }); $('dismiss-error').addEventListener('click', clearError);
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $('cancel-dialog').addEventListener('click', () => $('confirm-dialog').close());
  $('confirm-dialog-action').addEventListener('click', () => { const action = dialogAction; dialogAction = null; $('confirm-dialog').close(); action?.(); });
  $('privacy-button').addEventListener('click', () => $('privacy-dialog').showModal());
  $('mode-button').addEventListener('click', () => { document.querySelector(`input[name="run-mode"][value="${mode}"]`).checked = true; $('mode-dialog').showModal(); });
  $('save-mode').addEventListener('click', () => {
    const choice = document.querySelector('input[name="run-mode"]:checked')?.value;
    if (!choice || choice === mode) { $('mode-dialog').close(); return; }
    saveLocal('learning2game-mode', choice); localStorage.removeItem(STORAGE); location.hash = 'create'; location.reload();
  });
  $('clear-data-button').addEventListener('click', () => {
    if (!state.materialId) { newMaterial(); toast('浏览器中的练习引用已清除。'); return; }
    confirmAction('删除本次资料与记录？', '将请求后端删除当前材料及关联练习、会话和报告。删除后无法在此处恢复。', '删除资料与记录', () => run(async () => { await api.deleteMaterial(state.materialId); newMaterial(); toast('本次资料与记录已删除。'); }));
  });
  window.addEventListener('hashchange', () => showPage());
  window.addEventListener('pagehide', persist);
}

function tick() {
  const current = engine?.snapshot;
  if (!current) return;
  const session = current.session;
  const end = session.finished_at ? Date.parse(session.finished_at) : Date.now();
  const seconds = session.deadline_at && session.status === 'active' ? Math.ceil((Date.parse(session.deadline_at) - Date.now()) / 1000) : Math.floor((end - Date.parse(session.started_at)) / 1000);
  $('time-label').textContent = session.deadline_at && session.status === 'active' ? '剩余时间' : '已用时间'; $('play-time').textContent = duration(seconds);
  if (session.deadline_at && seconds <= 0 && session.status === 'active' && !busy && current.phase !== 'submitting' && timedOutSession !== session.session_id) {
    timedOutSession = session.session_id; run(() => finishRound('timeout')); toast('本轮时间已到，正在保存学习报告。');
  }
}

async function boot() {
  try {
    const response = await fetch('/config.json'); if (!response.ok) throw new Error('无法读取启动配置。'); config = await response.json();
    mode = readLocal('learning2game-mode', config.defaultMode);
    if (!['demo', 'real'].includes(mode) || mode === 'demo' && !config.demoEnabled) mode = 'real';
    api = new ApiClient(mode === 'demo' ? config.demoApiBase : config.realApiBase);
    engine = new MatchingEngine(api);
    const stored = readLocal(STORAGE); if (stored?.mode === mode) state = { ...state, ...stored, operations: stored.operations || {}, toolCalls: stored.toolCalls || [] };
    restorePreferences(state.draftPreferences || state.preferences);
    $('mode-button').textContent = mode === 'demo' ? '教学演示' : '真实后端'; $('mode-button').classList.toggle('real', mode === 'real');
    $('mode-notice').textContent = mode === 'demo' ? '教学演示：展示固定细胞样例，上传文件不会被分析；阶段与建议均为演示数据。' : '真实后端：学习资料与配对记录将通过团队 API 处理。';
    $('backend-address').textContent = `真实服务地址：${config.backendUrl}（由启动时的 BACKEND_URL 配置）`;
    document.querySelector('input[name="run-mode"][value="demo"]').disabled = !config.demoEnabled;
    engine.subscribe(value => {
      if (!value) return;
      state.recovery = engine.recovery(); persist(); renderPlay(value, busy); tick();
      if (value.phase === 'ended' && value.session.status === 'completed' && !busy && reportScheduled !== value.session.session_id) {
        reportScheduled = value.session.session_id; queueMicrotask(() => run(() => finishRound('completed')));
      }
    });
    wireEvents(); renderTrace(); showPage();
    if (state.materialId || state.gameId || state.jobId) await restore();
    setInterval(tick, 1000);
  } catch (error) {
    showError(error, () => location.reload()); $('mode-button').textContent = '连接失败';
    // Boot failure happens before the ordinary event listeners can be attached.
    if (!api) $('retry-global').onclick = () => location.reload();
  }
}
boot();

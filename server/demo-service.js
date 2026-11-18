import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { knowledgeSeed, preferencesOf } from './seed.js';

export class ServiceError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const id = () => randomUUID();
const fail = (code, message, status) => { throw new ServiceError(code, message, status); };
const publicSession = session => ({
  session_id: session.session_id, game_id: session.game_id, status: session.status,
  started_at: session.started_at, deadline_at: session.deadline_at, finished_at: session.finished_at || null,
  matched_left_ids: session.matches.map(m => m.left_card_id), matched_right_ids: session.matches.map(m => m.right_card_id),
  completed_pairs: session.matches.length, attempt_count: session.attempts.length,
  error_count: session.attempts.filter(a => !a.is_correct).length, hint_count: session.hints.length
});

export class DemoService {
  constructor(directory, jobDelay = 450) { this.directory = directory; this.jobDelay = jobDelay; this.state = { materials: {}, plans: {}, games: {}, sessions: {}, jobs: {}, requests: {} }; }
  async init() {
    await mkdir(this.directory, { recursive: true });
    try { this.state = JSON.parse(await readFile(join(this.directory, 'demo.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('演示数据损坏，请保留文件后按照 README 重置演示数据。'); }
    return this;
  }
  async save() { const file = join(this.directory, 'demo.json'); await writeFile(`${file}.tmp`, JSON.stringify(this.state)); await rename(`${file}.tmp`, file); }
  get(collection, key) { return this.state[collection][key] || fail('NOT_FOUND', '记录已清理或不存在。', 404); }
  job(stages, result) {
    const job = { job_id: id(), created_at: Date.now(), stages, result, tool_calls: [], demo: true };
    this.state.jobs[job.job_id] = job; return job.job_id;
  }
  jobView(job) {
    const index = this.jobDelay ? Math.floor((Date.now() - job.created_at) / this.jobDelay) : job.stages.length;
    const status = job.stages[Math.min(index, job.stages.length - 1)];
    return { job_id: job.job_id, status, progress: Math.min(1, (index + 1) / job.stages.length), result: ['completed', 'awaiting_confirmation'].includes(status) ? job.result : null, tool_calls: [], demo: true };
  }
  newGame(materialId, preferences, selected) {
    if (preferences.pair_count > selected.length) fail('KNOWLEDGE_INSUFFICIENT', `样例只有 ${selected.length} 个可用知识点。请减少题量。`);
    const items = selected.slice(0, preferences.pair_count);
    const game = { game_id: id(), material_id: materialId, preferences, title: preferences.goal === 'english' ? 'Cell structures · 细胞结构双语练习' : '细胞结构：找到它的作用', rules: '先选择一个概念，再选择对应释义。错误后可以重试；提示会记录在学习报告中。', pairs: items.map(k => ({ left_id: id(), right_id: id(), knowledge_id: k.knowledge_id, left: k.term, right: preferences.goal === 'english' ? k.english : preferences.level === 'advanced' ? `${k.definition} ${k.english}` : k.definition })) };
    this.state.games[game.game_id] = game; return game;
  }
  publicGame(game) {
    return { game_id: game.game_id, title: game.title, rules: game.rules, pair_count: game.pairs.length, time_limit_seconds: game.preferences.time_limit_seconds, left_label: '概念 / 结构', right_label: '释义 / 功能', left_cards: game.pairs.map(p => ({ id: p.left_id, text: p.left })), right_cards: game.pairs.map(p => ({ id: p.right_id, text: p.right })), demo: true };
  }
  active(session) {
    if (session.status !== 'active') fail('SESSION_ENDED', '会话已经结束。', 409);
    if (session.deadline_at && Date.now() >= Date.parse(session.deadline_at)) fail('SESSION_ENDED', '本轮时间已到，请结束并查看报告。', 409);
  }
  report(session) {
    const game = this.get('games', session.game_id);
    const items = game.pairs.map(pair => {
      const knowledge = knowledgeSeed.find(k => k.knowledge_id === pair.knowledge_id);
      const attempts = session.attempts.filter(a => a.left_card_id === pair.left_id);
      const hints = session.hints.filter(h => h.left_card_id === pair.left_id);
      const completed = session.matches.some(m => m.left_card_id === pair.left_id);
      const reasons = [];
      if (!attempts.length) reasons.push('未尝试');
      else if (!attempts[0].is_correct) reasons.push('首次配对错误');
      if (attempts.length > 1) reasons.push('多次尝试');
      if (hints.length) reasons.push('使用过提示');
      if (!completed) reasons.push('未完成');
      return { knowledge_id: pair.knowledge_id, term: pair.left, definition: pair.right, explanation: knowledge.explanation, source: knowledge.source, completed, attempted: attempts.length > 0, first_attempt_correct: attempts.length ? attempts[0].is_correct : null, attempt_count: attempts.length, error_count: attempts.filter(a => !a.is_correct).length, hint_count: hints.length, weak_reasons: reasons };
    });
    const attempted = items.filter(k => k.attempted), correct = session.attempts.filter(a => a.is_correct).length;
    const weak = items.filter(k => k.weak_reasons.length);
    return {
      session_id: session.session_id, game_id: game.game_id, material_id: game.material_id, title: game.title,
      status: session.status, finish_reason: session.finish_reason || 'completed', total_pairs: game.pairs.length,
      completed_pairs: session.matches.length, completion_rate: session.matches.length / game.pairs.length,
      attempted_concepts: attempted.length, unattempted_concepts: items.length - attempted.length,
      first_attempt_accuracy: attempted.length ? attempted.filter(k => k.first_attempt_correct).length / attempted.length : null,
      overall_accuracy: session.attempts.length ? correct / session.attempts.length : null,
      attempt_count: session.attempts.length, error_count: session.attempts.length - correct, hint_count: session.hints.length,
      duration_seconds: Math.max(0, Math.round((Date.parse(session.finished_at || new Date().toISOString()) - Date.parse(session.started_at)) / 1000)),
      knowledge_items: items, weak_knowledge_items: weak, preferences: game.preferences,
      ai_feedback: { origin: 'prewritten_demo', summary: weak.length ? `本轮有 ${weak.length} 个知识点适合继续练习。先阅读来源，再尝试不使用提示完成配对。` : '本轮所有知识点均首次正确，且未使用提示。可以换一份资料继续练习。', suggestions: ['完成率反映本轮配对完成情况，不能直接等同于知识掌握率。', '先遮住释义回忆概念，再回到原资料核对。', '本建议为固定演示规则生成，并非实时 LLM 输出。'] },
      attempts: session.attempts, hint_events: session.hints, demo: true
    };
  }
  async handle(method, path, body, requestKey) {
    const cacheKey = requestKey ? `${method}:${path}:${requestKey}` : null;
    if (cacheKey && this.state.requests[cacheKey]) return this.state.requests[cacheKey];
    const result = await this.route(method, path, body);
    if (cacheKey) this.state.requests[cacheKey] = result;
    if (method !== 'GET') await this.save();
    return result;
  }
  async route(method, path, body = {}) {
    const parts = path.split('/').filter(Boolean), [resource, key, action] = parts;
    if (method === 'GET' && resource === 'jobs') return this.jobView(this.get('jobs', key));
    if (method === 'POST' && path === '/materials') {
      const file = body.get('file');
      if (!file || typeof file.name !== 'string') fail('INVALID_REQUEST', '没有上传文件。');
      if (!file.size) fail('EMPTY_FILE', '文件为空。');
      if (!/\.(pdf|txt|docx|pptx|png|jpe?g|webp)$/i.test(file.name)) fail('UNSUPPORTED_FILE_TYPE', '格式不支持。');
      if (file.size > 20 * 1024 * 1024) fail('FILE_TOO_LARGE', '文件太大。', 413);
      let pages; try { pages = JSON.parse(body.get('page_numbers') || '[]'); } catch { fail('INVALID_REQUEST', '页码必须是 JSON 数组。'); }
      if (!Array.isArray(pages) || pages.length > 10 || pages.some(p => !Number.isInteger(p) || p < 1)) fail('INVALID_REQUEST', '页码无效。');
      const material = { material_id: id(), file_name: file.name, pages, created_at: new Date().toISOString(), demo: true };
      this.state.materials[material.material_id] = material;
      const jobId = this.job(['queued', 'parsing', 'extracting', 'awaiting_confirmation'], { material_id: material.material_id });
      return { material_id: material.material_id, job_id: jobId, demo: true };
    }
    if (resource === 'materials' && method === 'GET' && action === 'knowledge') {
      this.get('materials', key);
      return { material_id: key, topic: '植物细胞的主要结构与功能', knowledge_items: knowledgeSeed.map(({ hint, english, ...item }) => item), warnings: ['演示模式展示预先编写的细胞教学样例，不分析你上传的文件。来源指向随项目提供的样例。'], tool_calls: [], demo: true };
    }
    if (method === 'DELETE' && resource === 'materials') {
      this.get('materials', key);
      const gameIds = Object.values(this.state.games).filter(g => g.material_id === key).map(g => g.game_id);
      for (const [sid, s] of Object.entries(this.state.sessions)) if (gameIds.includes(s.game_id)) delete this.state.sessions[sid];
      for (const gid of gameIds) delete this.state.games[gid];
      for (const [pid, p] of Object.entries(this.state.plans)) if (p.material_id === key) delete this.state.plans[pid];
      for (const [jid, j] of Object.entries(this.state.jobs)) if (j.result.material_id === key || gameIds.includes(j.result.game_id)) delete this.state.jobs[jid];
      delete this.state.materials[key]; this.state.requests = {};
      return { deleted: true };
    }
    if (method === 'POST' && path === '/matching-plans') {
      this.get('materials', body.material_id); const preferences = preferencesOf(body.preferences);
      if (preferences.pair_count > knowledgeSeed.length) fail('KNOWLEDGE_INSUFFICIENT', '固定样例最多提供 8 对。');
      const plan = { plan_id: id(), material_id: body.material_id, preferences, title: '细胞结构与功能配对', rationale: `适合${{ beginner: '入门', intermediate: '巩固', advanced: '进阶' }[preferences.level]}学习者；使用${preferences.goal === 'english' ? '英文释义' : preferences.level === 'advanced' ? '中英双语长释义' : '简短中文释义'}，练习 ${preferences.pair_count} 对结构与功能。`, knowledge_ids: knowledgeSeed.slice(0, preferences.pair_count).map(k => k.knowledge_id), demo: true };
      this.state.plans[plan.plan_id] = plan; return plan;
    }
    if (method === 'POST' && path === '/games') {
      if (body.confirmed !== true) fail('INVALID_REQUEST', '必须先明确确认方案。');
      const plan = this.get('plans', body.plan_id), preferences = preferencesOf(body.preferences);
      const game = this.newGame(plan.material_id, preferences, knowledgeSeed);
      return { job_id: this.job(['queued', 'generating', 'validating', 'completed'], { game_id: game.game_id }), demo: true };
    }
    if (resource === 'games' && method === 'GET') return this.publicGame(this.get('games', key));
    if (resource === 'games' && method === 'POST' && action === 'sessions') {
      const game = this.get('games', key), now = Date.now();
      const session = { session_id: id(), game_id: key, started_at: new Date(now).toISOString(), deadline_at: game.preferences.time_limit_seconds ? new Date(now + game.preferences.time_limit_seconds * 1000).toISOString() : null, status: 'active', matches: [], attempts: [], hints: [] };
      this.state.sessions[session.session_id] = session; return publicSession(session);
    }
    if (resource === 'sessions') {
      const session = this.get('sessions', key), game = this.get('games', session.game_id);
      if (method === 'GET' && !action) return publicSession(session);
      if (method === 'GET' && action === 'report') {
        if (session.status === 'active') fail('INVALID_REQUEST', '请先结束本轮，再获取最终报告。', 409);
        return this.report(session);
      }
      if (method === 'POST' && action === 'attempts') {
        if (Object.keys(body).some(k => !['left_card_id', 'right_card_id', 'event_id'].includes(k))) fail('INVALID_REQUEST', '配对请求不得包含客户端判分。');
        if (!body.event_id) fail('INVALID_REQUEST', '缺少事件 ID。');
        const existing = session.attempts.find(a => a.event_id === body.event_id);
        if (existing) return existing.result;
        this.active(session);
        const pair = game.pairs.find(p => p.left_id === body.left_card_id);
        if (!pair || !game.pairs.some(p => p.right_id === body.right_card_id)) fail('INVALID_REQUEST', '卡片不属于当前游戏。');
        if (session.matches.some(m => m.left_card_id === body.left_card_id || m.right_card_id === body.right_card_id)) fail('ALREADY_MATCHED', '卡片已完成。', 409);
        const correct = pair.right_id === body.right_card_id;
        const event = { ...body, knowledge_id: pair.knowledge_id, is_correct: correct, timestamp: new Date().toISOString() };
        session.attempts.push(event);
        if (correct) session.matches.push({ left_card_id: pair.left_id, right_card_id: pair.right_id });
        if (session.matches.length === game.pairs.length) { session.status = 'completed'; session.finished_at = new Date().toISOString(); session.finish_reason = 'completed'; }
        const knowledge = knowledgeSeed.find(k => k.knowledge_id === pair.knowledge_id);
        const result = { is_correct: correct, explanation: correct ? knowledge.explanation : '这两个内容没有对应起来。重新选择，或先查看提示。', ...(correct ? { source: knowledge.source } : {}), session: publicSession(session) };
        event.result = result; return result;
      }
      if (method === 'POST' && action === 'hints') {
        if (!body.event_id) fail('INVALID_REQUEST', '缺少事件 ID。');
        const existing = session.hints.find(h => h.event_id === body.event_id); if (existing) return existing.result;
        this.active(session); const pair = game.pairs.find(p => p.left_id === body.left_card_id);
        if (!pair) fail('INVALID_REQUEST', '提示卡片无效。');
        if (session.matches.some(m => m.left_card_id === pair.left_id)) fail('ALREADY_MATCHED', '卡片已经完成。', 409);
        const knowledge = knowledgeSeed.find(k => k.knowledge_id === pair.knowledge_id);
        const event = { event_id: body.event_id, left_card_id: pair.left_id, knowledge_id: pair.knowledge_id, timestamp: new Date().toISOString() };
        session.hints.push(event); const result = { hint: knowledge.hint, term: pair.left, hint_count: session.hints.length, session: publicSession(session) };
        event.result = result; return result;
      }
      if (method === 'POST' && action === 'finish') {
        if (!['completed', 'exit', 'restart', 'timeout'].includes(body.reason)) fail('INVALID_REQUEST', '结束原因无效。');
        if (session.status === 'active') { session.status = 'finished'; session.finished_at = new Date().toISOString(); session.finish_reason = body.reason; }
        return { session: publicSession(session), report_ready: true };
      }
      if (method === 'POST' && action === 'practice') {
        if (body.confirmed !== true || session.status === 'active') fail('INVALID_REQUEST', '请先完成并确认再练习。');
        const weak = this.report(session).weak_knowledge_items;
        if (!weak.length) fail('NO_WEAK_POINTS', '没有薄弱知识点。');
        const selected = knowledgeSeed.filter(k => weak.some(w => w.knowledge_id === k.knowledge_id));
        const preferences = preferencesOf({ ...game.preferences, ...body.preferences, pair_count: selected.length });
        const nextGame = this.newGame(game.material_id, preferences, selected);
        return { job_id: this.job(['queued', 'generating', 'validating', 'completed'], { game_id: nextGame.game_id }), demo: true };
      }
    }
    fail('NOT_FOUND', '接口不存在。', 404);
  }
}

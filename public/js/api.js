export const JOB_LABELS = {
  queued: '任务排队中',
  uploading: '正在上传',
  extracting: '正在提取知识',
  planning: '正在推荐方案',
  awaiting_confirmation: '等待确认',
  generating: '正在生成卡片',
  validating: '正在核验',
  writing_feedback: '正在生成学习建议',
  completed: '处理完成',
  failed: '处理失败',
  idle: '等待选材',
};
export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
const id = encodeURIComponent;
export class ApiClient {
  constructor(
    baseUrl = '',
    { fetchImpl = globalThis.fetch, timeout = 30000, pollInterval = 500 } = {},
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetchImpl = (...args) => fetchImpl(...args);
    this.timeout = timeout;
    this.pollInterval = pollInterval;
  }
  async request(path, { method = 'GET', body, headers = {} } = {}) {
    const ctl = new AbortController(),
      timer = setTimeout(() => ctl.abort(), this.timeout);
    try {
      const multipart = body instanceof FormData;
      const response = await this.fetchImpl(this.baseUrl + path, {
        method,
        signal: ctl.signal,
        headers: {
          Accept: 'application/json',
          ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
      });
      if (response.status === 204) return {};
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new ApiError(
          'HTTP_ERROR',
          data?.error?.message || `请求返回 ${response.status}。请检查输入后重试。`,
          response.status,
        );
      if (!data) throw new ApiError('BAD_RESPONSE', '服务响应格式异常，请重新连接。');
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        'NETWORK_ERROR',
        ctl.signal.aborted ? '等待服务响应超时，请重试。' : '连接中断，请检查服务后重试。',
      );
    } finally {
      clearTimeout(timer);
    }
  }
  async waitForJob(jobId, onProgress = () => {}, maxWait = 660000) {
    const since = Date.now();
    while (Date.now() - since < maxWait) {
      const job = await this.request('/jobs/' + id(jobId));
      onProgress(job);
      if (job.status === 'failed')
        throw new ApiError('JOB_FAILED', job.error || '处理失败，请重试。');
      if (['completed', 'awaiting_confirmation'].includes(job.status)) return job;
      if (!(job.status in JOB_LABELS))
        throw new ApiError('BAD_RESPONSE', '服务返回了未知的处理状态。');
      await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
    }
    throw new ApiError('JOB_TIMEOUT', '处理时间较长，请稍后继续查询。');
  }
  health() {
    return this.request('/health');
  }
  upload(file, pages = []) {
    const body = new FormData();
    body.append('file', file);
    if (pages.length) body.append('pages', pages.join(','));
    return this.request('/materials', { method: 'POST', body });
  }
  retryMaterial(key) {
    return this.request('/materials/' + id(key) + '/retry', { method: 'POST' });
  }
  knowledge(key) {
    return this.request('/materials/' + id(key) + '/knowledge');
  }
  plan(material_id, preferences) {
    return this.request('/matching-plans', { method: 'POST', body: { material_id, preferences } });
  }
  generate(plan_id, plan) {
    return this.request('/games', { method: 'POST', body: { plan_id, plan, confirmed: true } });
  }
  getGame(key) {
    return this.request('/games/' + id(key));
  }
  createSession(key) {
    return this.request('/games/' + id(key) + '/sessions', { method: 'POST' });
  }
  async getSession(key) {
    const s = await this.request('/sessions/' + id(key));
    const pairs = s.matched_cards;
    return {
      ...s,
      matched_left_ids: pairs.map((p) => p.left_id),
      matched_right_ids: pairs.map((p) => p.right_id),
      completed_pairs: pairs.length,
      error_count: s.mistakes,
      hint_count: Object.values(s.hints_by_left_id).reduce((a, b) => a + b, 0),
    };
  }
  async attempt(key, event) {
    const result = await this.request('/sessions/' + id(key) + '/attempts', {
      method: 'POST',
      body: {
        event_id: event.event_id,
        left_id: event.left_card_id,
        right_id: event.right_card_id,
      },
    });
    const session = await this.getSession(key);
    return { ...result, is_correct: result.correct, session };
  }
  async hint(key, left_id, event_id) {
    const result = await this.request('/sessions/' + id(key) + '/hints', {
      method: 'POST',
      body: { left_id, event_id },
    });
    return { ...result, session: await this.getSession(key) };
  }
  finish(key) {
    return this.request('/sessions/' + id(key) + '/finish', { method: 'POST' });
  }
  report(key) {
    return this.request('/sessions/' + id(key) + '/report');
  }
  feedback(key) {
    return this.request('/sessions/' + id(key) + '/feedback', { method: 'POST' });
  }
  practice(key) {
    return this.request('/sessions/' + id(key) + '/practice', { method: 'POST' });
  }
  deleteMaterial(key, token) {
    return this.request('/materials/' + id(key), {
      method: 'DELETE',
      headers: { 'X-Material-Token': token },
    });
  }
}

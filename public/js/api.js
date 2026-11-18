export const ERROR_MESSAGES = {
  UNSUPPORTED_FILE_TYPE: '文件类型不支持。请选择 PDF、TXT、DOCX、PPTX、PNG、JPG 或 WebP。',
  FILE_TOO_LARGE: '文件超过 20 MB，请压缩文件或选用较小的资料。',
  EMPTY_FILE: '文件内容为空，请重新选择资料。',
  FILE_UNREADABLE: '无法读取资料，请检查文件是否损坏，或重新导出后上传。',
  IMAGE_BLURRY: '图像过于模糊，请上传更清晰的图片。',
  KNOWLEDGE_INSUFFICIENT: '可靠知识点不足，请增加资料或减少配对数量。',
  MODEL_TIMEOUT: '模型处理超时，请稍后重试；也可以减少选中的页面。',
  VALIDATION_FAILED: '游戏内容未通过验证，请重新生成或调整资料。',
  NETWORK_ERROR: '无法连接服务，请检查网络和后端是否启动，然后重试。',
  REQUEST_TIMEOUT: '请求超时，结果尚未确认。请重试原请求。',
  JOB_TIMEOUT: '任务等待超过两分钟，请重新查询任务状态。',
  SESSION_ENDED: '本轮已经结束，请查看报告或开始新一轮。',
  ALREADY_MATCHED: '该卡片已完成，请刷新本轮状态。',
  NOT_FOUND: '记录不存在或已清理，请重新创建练习。',
  INVALID_CONFIG: '后端返回的游戏配置不完整，请联系项目负责人。',
  INVALID_REQUEST: '参数不符合要求，请检查页码、题量或目标后重试。',
  NO_WEAK_POINTS: '本轮没有需要再练的知识点，可以重新开始或创建新练习。'
};

export class ApiError extends Error {
  constructor(code, detail = '', status = 0) {
    super([ERROR_MESSAGES[code] || '操作未成功，请检查参数后重试。', detail].filter(Boolean).join(' '));
    this.name = 'ApiError'; this.code = code; this.status = status;
  }
}

export const JOB_LABELS = {
  queued: '任务已接收，等待处理', uploading: '正在上传资料', parsing: '正在解析资料',
  extracting: '正在提取知识点', awaiting_confirmation: '等待你确认练习方案',
  generating: '正在生成配对内容', validating: '正在验证内容与来源', repairing: '正在修复配对内容',
  completed: '处理完成', failed: '处理失败'
};

export class ApiClient {
  constructor(baseUrl = '/api', { fetchImpl = globalThis.fetch, timeout = 20000, pollInterval = 700 } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); this.fetchImpl = (...args) => fetchImpl(...args); this.timeout = timeout; this.pollInterval = pollInterval;
  }
  async request(path, { method = 'GET', body, eventId, signal } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort('timeout'), this.timeout);
    const headers = { Accept: 'application/json' };
    const multipart = body instanceof FormData;
    if (body && !multipart) headers['Content-Type'] = 'application/json';
    if (eventId) headers['Idempotency-Key'] = eventId;
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method, headers, body: body ? multipart ? body : JSON.stringify(body) : undefined,
        signal: controller.signal, credentials: 'same-origin'
      });
      let data;
      try { data = response.status === 204 ? {} : await response.json(); }
      catch { throw new ApiError('INVALID_CONFIG', '接口没有返回有效 JSON。', response.status); }
      if (!response.ok) {
        const detail = data.error || data.detail || data;
        const code = detail?.code || (response.status === 404 ? 'NOT_FOUND' : response.status === 413 ? 'FILE_TOO_LARGE' : 'INVALID_REQUEST');
        const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(e => `${(e.loc || []).join('.')}: ${e.msg}`).join('；') : detail.message || '';
        throw new ApiError(code, message, response.status);
      }
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (signal?.aborted) throw new DOMException('操作已取消', 'AbortError');
      if (controller.signal.aborted) throw new ApiError('REQUEST_TIMEOUT');
      throw new ApiError('NETWORK_ERROR');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  async waitForJob(id, onProgress = () => {}, { signal, maxWait = 120000 } = {}) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const job = await this.request(`/jobs/${encodeURIComponent(id)}`, { signal });
      onProgress(job);
      if (job.status === 'failed') throw new ApiError(job.error?.code || 'VALIDATION_FAILED', job.error?.message || '');
      if (job.status === 'completed' || job.status === 'awaiting_confirmation') return job;
      if (!(job.status in JOB_LABELS)) throw new ApiError('INVALID_CONFIG', `未知任务状态：${job.status}`);
      await new Promise((resolve, reject) => {
        const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(new DOMException('已取消', 'AbortError')); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, this.pollInterval);
        if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
      });
    }
    throw new ApiError('JOB_TIMEOUT');
  }
  upload(file, { pages = [], includeImage = true, eventId, signal } = {}) {
    const data = new FormData(); data.append('file', file); data.append('page_numbers', JSON.stringify(pages)); data.append('include_image', String(includeImage));
    return this.request('/materials', { method: 'POST', body: data, eventId, signal });
  }
  knowledge(id, signal) { return this.request(`/materials/${encodeURIComponent(id)}/knowledge`, { signal }); }
  plan(materialId, preferences, eventId, signal) { return this.request('/matching-plans', { method: 'POST', body: { material_id: materialId, preferences }, eventId, signal }); }
  generate(planId, preferences, eventId, signal) { return this.request('/games', { method: 'POST', body: { plan_id: planId, preferences, confirmed: true }, eventId, signal }); }
  getGame(id, signal) { return this.request(`/games/${encodeURIComponent(id)}`, { signal }); }
  createSession(id, eventId) { return this.request(`/games/${encodeURIComponent(id)}/sessions`, { method: 'POST', body: { event_id: eventId }, eventId }); }
  getSession(id) { return this.request(`/sessions/${encodeURIComponent(id)}`); }
  attempt(id, event) { return this.request(`/sessions/${encodeURIComponent(id)}/attempts`, { method: 'POST', body: event, eventId: event.event_id }); }
  hint(id, leftId, eventId) { return this.request(`/sessions/${encodeURIComponent(id)}/hints`, { method: 'POST', body: { left_card_id: leftId, event_id: eventId }, eventId }); }
  finish(id, reason, eventId) { return this.request(`/sessions/${encodeURIComponent(id)}/finish`, { method: 'POST', body: { reason, event_id: eventId }, eventId }); }
  report(id) { return this.request(`/sessions/${encodeURIComponent(id)}/report`); }
  practice(id, preferences, eventId, signal) { return this.request(`/sessions/${encodeURIComponent(id)}/practice`, { method: 'POST', body: { preferences, confirmed: true, event_id: eventId }, eventId, signal }); }
  deleteMaterial(id) { return this.request(`/materials/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
}

import { escapeHtml as h, sourceMarkup, percent, duration, safeUrl } from './utils.js';
const $ = id => document.getElementById(id);
let lastFocusedCard = null;

export function renderKnowledge(data) {
  if (!Array.isArray(data.knowledge_items)) throw new Error('知识预览接口应返回 knowledge_items 数组。');
  $('knowledge-panel').hidden = false; $('knowledge-count').textContent = `${data.knowledge_items.length} 个知识点`;
  $('knowledge-topic').textContent = data.topic || '请核对提取内容与来源。';
  $('knowledge-warnings').innerHTML = (data.warnings || []).map(w => `<p>⚠ ${h(w)}</p>`).join('');
  $('knowledge-list').innerHTML = data.knowledge_items.map(k => `<details class="knowledge-item"><summary>${h(k.term)}${k.quality !== 'reliable' ? ' · 待核对' : ''}</summary><p>${h(k.definition)}</p>${sourceMarkup(k.source)}</details>`).join('');
}

export function renderPlan(plan, preferences) {
  const level = { beginner: '入门', intermediate: '巩固', advanced: '进阶' }[preferences.level];
  const goal = { definitions: '概念与定义', functions: '结构与功能', english: '双语术语' }[preferences.goal];
  $('plan-panel').hidden = false; $('plan-title').textContent = plan.title || '推荐配对方案';
  $('plan-rationale').textContent = plan.rationale || '查看知识点与来源，并确认本次练习参数。';
  $('plan-summary').innerHTML = [level, goal, `${preferences.pair_count} 对`, preferences.time_limit_seconds ? `${preferences.time_limit_seconds / 60} 分钟` : '不限时'].map(text => `<span>${h(text)}</span>`).join('');
}

function cardMarkup(card, index, side, state, busy) {
  const matched = state.session[side === 'left' ? 'matched_left_ids' : 'matched_right_ids'].includes(card.id);
  const selected = (side === 'left' ? state.selectedLeft : state.selectedRight) === card.id;
  const locked = matched || state.phase !== 'active' || busy || (side === 'right' && !state.selectedLeft);
  const label = matched ? '已完成' : selected ? '已选择' : side === 'left' ? '选择概念' : '选择释义';
  const image = card.image_url && safeUrl(card.image_url) ? `<img src="${h(safeUrl(card.image_url))}" alt="${h(card.image_alt || card.text)}" loading="lazy">` : '';
  return `<button type="button" class="match-card ${matched ? 'matched' : ''} ${selected ? 'selected' : ''} ${selected && state.phase === 'submitting' ? 'pending' : ''}" data-card-id="${h(card.id)}" data-side="${side}" aria-pressed="${selected}" aria-label="${h(`${label}：${card.text}`)}" ${locked ? 'disabled' : ''}><span class="card-badge" aria-hidden="true">${matched ? '✓' : selected ? '●' : side === 'left' ? index + 1 : String.fromCharCode(65 + index)}</span><span class="card-text">${image}${h(card.text)}</span><span class="visually-hidden">${label}</span></button>`;
}

export function renderPlay(state, busy = false) {
  if (!state) return;
  const active = document.activeElement;
  if (active?.dataset?.cardId) lastFocusedCard = active.dataset.cardId;
  const previousId = active?.dataset?.cardId || (active === document.body ? lastFocusedCard : null);
  $('play-title').textContent = state.game.title; $('play-rules').textContent = state.game.rules;
  $('left-heading').textContent = state.game.left_label || '概念 / 结构'; $('right-heading').textContent = state.game.right_label || '释义 / 功能';
  $('play-progress').textContent = `${state.session.completed_pairs} / ${state.game.pair_count}`;
  $('play-errors').textContent = String(state.session.error_count); $('play-hints').textContent = String(state.session.hint_count || 0);
  $('play-progress-bar').max = state.game.pair_count; $('play-progress-bar').value = state.session.completed_pairs;
  $('left-cards').innerHTML = state.leftCards.map((card, index) => cardMarkup(card, index, 'left', state, busy)).join('');
  $('right-cards').innerHTML = state.rightCards.map((card, index) => cardMarkup(card, index, 'right', state, busy)).join('');
  const selected = state.leftCards.find(c => c.id === state.selectedLeft);
  const status = state.phase === 'submitting' ? '正在等待判分，本次提交期间卡片已锁定。' : state.phase === 'retry' ? state.error?.message || '有一条未确认的配对记录，请重试或同步状态。' : state.phase === 'ended' ? '本轮已结束，可以查看报告或重新开始。' : selected ? `已选：${selected.text}。请选择右侧释义。` : '先选择左侧概念，再选择右侧释义。';
  $('selection-status').textContent = status;
  $('attempt-retry').hidden = state.phase !== 'retry';
  $('hint-button').disabled = busy || state.phase !== 'active' || !state.selectedLeft;
  $('restart-button').disabled = busy || state.phase === 'submitting';
  $('finish-button').disabled = busy || state.phase === 'submitting';
  $('finish-button').textContent = state.phase === 'ended' ? '查看本轮学习报告 →' : '结束本轮并查看报告 →';
  $('retry-attempt-button').disabled = busy;
  if (state.feedback) {
    const correct = state.feedback.is_correct;
    $('attempt-feedback').innerHTML = `<div class="feedback-result ${correct ? 'correct' : 'incorrect'}">${correct ? '✓ 配对正确' : '↻ 配对未正确，请再试一次'}</div><p>${h(state.feedback.explanation)}</p>${correct && state.feedback.source ? sourceMarkup(state.feedback.source) : ''}`;
  }
  if (previousId) {
    const target = [...document.querySelectorAll('.match-card')].find(c => c.dataset.cardId === previousId && !c.disabled);
    if (target) target.focus({ preventScroll: true });
    else if (state.phase === 'active' && !document.getElementById('page-play').hidden) document.querySelector('#left-cards button:not(:disabled)')?.focus({ preventScroll: true });
  }
}

export function renderReport(report) {
  if (!Array.isArray(report.knowledge_items)) throw new Error('报告接口应返回 knowledge_items 数组。');
  const items = report.knowledge_items, weak = report.weak_knowledge_items || [];
  const finished = report.completed_pairs === report.total_pairs;
  $('report-subtitle').textContent = `${report.title} · ${finished ? '本组配对完成' : report.finish_reason === 'timeout' ? '时间到，已保留本轮记录' : '本轮提前结束'} · 用时 ${duration(report.duration_seconds)}`;
  $('report-content').innerHTML = `<div class="report-metrics">
    <section class="panel metric primary-metric"><h2>首次配对正确率</h2><strong>${percent(report.first_attempt_accuracy)}</strong><small>以 ${h(report.attempted_concepts)} 个已尝试知识点为分母</small></section>
    <section class="panel metric"><h2>总尝试正确率</h2><strong>${percent(report.overall_accuracy)}</strong><small>共 ${h(report.attempt_count)} 次有效配对尝试</small></section>
    <section class="panel metric"><h2>本轮完成率</h2><strong>${percent(report.completion_rate)}</strong><small>完成 ${h(report.completed_pairs)} / ${h(report.total_pairs)} 对</small></section>
    <section class="panel metric"><h2>使用提示</h2><strong>${h(report.hint_count)}<span style="font-size:14px"> 次</span></strong><small>${h(items.filter(k => k.hint_count > 0).length)} 个知识点使用过提示</small></section></div>
    <p class="report-note">完成率表示配对进度，不能直接等同于知识掌握率。${report.unattempted_concepts ? `${h(report.unattempted_concepts)} 个知识点尚未尝试，未计入首次正确率。` : ''}${report.attempt_count === 0 ? '本轮没有有效尝试，正确率显示为“—”。' : ''}</p>
    <div class="report-grid"><section class="panel"><div class="panel-heading"><h2>逐个知识点复盘</h2><span class="tag">${weak.length} 个需要再练</span></div>${items.map(k => `<details class="report-knowledge" ${k.weak_reasons?.length ? 'open' : ''}><summary><strong>${h(k.term)}</strong><span class="status-chip ${k.weak_reasons?.length ? '' : 'strong'}">${k.weak_reasons?.length ? '需要复习' : '首次正确 · 未用提示'}</span></summary><p>${h(k.definition)}</p><p>${h(k.explanation)}</p><p class="muted">尝试 ${h(k.attempt_count)} 次 · 错误 ${h(k.error_count)} 次 · 提示 ${h(k.hint_count)} 次 · ${k.completed ? '已完成' : '未完成'}</p><div class="reason-tags">${(k.weak_reasons || []).map(reason => `<span>${h(reason)}</span>`).join('')}</div>${sourceMarkup(k.source)}</details>`).join('')}</section>
    <div><section class="panel feedback-advice"><p class="eyebrow">NEXT LEARNING STEP</p><h2>下一轮，练得更有针对性。</h2><span class="tag">${report.ai_feedback?.origin === 'prewritten_demo' ? '固定演示建议' : report.ai_feedback?.origin === 'llm' ? 'AI 学习建议' : '学习建议'}</span><p>${h(report.ai_feedback?.summary || '先回到资料核对，再进行薄弱知识点练习。')}</p><ul>${(report.ai_feedback?.suggestions || []).map(s => `<li>${h(s)}</li>`).join('')}</ul></section><details class="panel report-history"><summary>查看本轮配对与提示记录</summary><ol class="event-log">${(report.attempts || []).map((a, i) => `<li>尝试 ${i + 1}：${a.is_correct ? '✓ 正确' : '↻ 错误'} · ${h(items.find(k => k.knowledge_id === a.knowledge_id)?.term || '配对事件')}<br><small>事件 ${h(a.event_id)} · ${h(a.timestamp)}</small></li>`).join('')}${!(report.attempts || []).length ? '<li>本轮没有配对尝试。</li>' : ''}</ol><p class="muted">提示事件：${h(report.hint_count)} 次；提示标记保留在对应知识点中。</p></details></div></div>`;
  $('practice-button').disabled = weak.length === 0;
  $('practice-button').textContent = weak.length ? `再练 ${weak.length} 个薄弱知识点 →` : '本轮没有需要再练的知识点';
}

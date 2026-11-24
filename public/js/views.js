import { studyMarkup } from './study.js';
import { msg } from './locale.js';
import { ui } from './studio-copy.js';
import { displayText, h, escapeHtml, percent, sourceMarkup } from './utils.js';
const $ = (id) => document.getElementById(id);
const levels = { beginner: '入门', familiar: '有基础' };
const goals = {
  recognize: '认识概念',
  distinguish: '辨析概念',
  preview: '课前预习',
  review: '课后复习',
  classroom: '课堂练习',
};
export function renderKnowledge(data) {
  $('knowledge-panel').hidden = false;
  $('knowledge-count').textContent = msg(
    `${data.knowledge.length} 个知识点`,
    `${data.knowledge.length} concepts`,
  );
  $('knowledge-warnings').innerHTML = (data.warnings || [])
    .map((w) => `<p class="muted">${h(ui(w))}</p>`)
    .join('');
  $('knowledge-list').innerHTML = data.knowledge
    .map(
      (k) =>
        `<details class="knowledge-item"><summary>${studyMarkup(k.term)}</summary><p>${studyMarkup(k.definition)}</p>${sourceMarkup(k.source_ref)}${k.evidence ? `<blockquote>${studyMarkup(k.evidence)}</blockquote>` : ''}</details>`,
    )
    .join('');
}
export function renderPlan(plan, options, selected) {
  $('ready-panel').hidden = true;
  $('plan-panel').hidden = false;
  $('plan-title').innerHTML = studyMarkup(plan.title || ui('推荐练习方案'));
  $('plan-rationale').innerHTML = studyMarkup(plan.rationale || ui('挑选这一轮想练的概念。'));
  $('plan-summary').innerHTML = [levels[plan.learner_level], goals[plan.goal]]
    .filter(Boolean)
    .map((text) => `<span>${h(ui(text))}</span>`)
    .join('');
  $('plan-choices').innerHTML = options
    .map(
      (k) =>
        `<label class="choice"><input type="checkbox" value="${escapeHtml(k.knowledge_id)}" ${selected.includes(k.knowledge_id) ? 'checked' : ''}><span>${studyMarkup(k.term)}</span></label>`,
    )
    .join('');
  $('plan-difficulty').value = plan.difficulty;
  $('plan-warnings').textContent = displayText((plan.warnings || []).map(ui).join(' '));
  $('confirm-plan').checked = false;
}
function cardMarkup(card, index, side, s, busy) {
  const matched = s.session[side === 'left' ? 'matched_left_ids' : 'matched_right_ids'].includes(
    card.id,
  );
  const selected = (side === 'left' ? s.selectedLeft : s.selectedRight) === card.id;
  const locked = matched || s.phase !== 'active' || busy || (side === 'right' && !s.selectedLeft);
  const label = matched
    ? ui('已配对')
    : selected
      ? ui('已选')
      : side === 'left'
        ? ui('概念')
        : ui('释义');
  return `<button type="button" class="match-card ${matched ? 'matched' : ''} ${selected ? 'selected' : ''}" data-card-id="${escapeHtml(card.id)}" data-side="${side}" aria-pressed="${selected}" ${locked ? 'disabled' : ''}><span class="visually-hidden">${label} </span><span class="card-badge" aria-hidden="true">${matched ? '✓' : selected ? '●' : side === 'left' ? index + 1 : String.fromCharCode(65 + index)}</span><span class="card-text">${studyMarkup(card.text)}</span></button>`;
}
export function renderPlay(s, busy) {
  if (!s) return;
  const active = document.activeElement?.dataset.cardId;
  $('play-title').innerHTML = studyMarkup(s.game.title || ui('配对练习'));
  $('play-progress').textContent = `${s.session.completed_pairs} / ${s.game.pair_count}`;
  $('play-errors').textContent = s.session.error_count;
  $('play-hints').textContent = s.session.hint_count;
  $('play-progress-bar').max = s.game.pair_count;
  $('play-progress-bar').value = s.session.completed_pairs;
  for (const [side, cards] of [
    ['left', s.leftCards],
    ['right', s.rightCards],
  ])
    $(side + '-cards').innerHTML = cards.map((c, i) => cardMarkup(c, i, side, s, busy)).join('');
  const selected = s.leftCards.find((c) => c.id === s.selectedLeft);
  $('selection-status').innerHTML =
    s.phase === 'submitting'
      ? ui('正在核对这组配对…')
      : s.phase === 'retry'
        ? h(s.error?.message || ui('请重试上次配对或同步进度。'))
        : s.phase === 'ended'
          ? ui('本轮已结束。')
          : selected
            ? msg(
                `已选「${studyMarkup(selected.text)}」，请选择右侧描述。`,
                `Selected “${studyMarkup(selected.text)}”. Choose its description.`,
              )
            : ui('请选择左侧概念。');
  $('attempt-retry').hidden = s.phase !== 'retry';
  $('hint-button').disabled = busy || s.phase !== 'active' || !selected;
  $('restart-button').disabled = busy || s.phase === 'submitting';
  $('finish-button').disabled = busy || ['submitting', 'retry'].includes(s.phase);
  if (s.feedback) {
    const f = s.feedback;
    $('attempt-feedback').innerHTML =
      `<div class="feedback-result ${f.is_correct ? 'correct' : 'incorrect'}">${f.is_correct ? ui('✓ 配对正确') : ui('请再选一次')}</div><p>${studyMarkup(f.explanation || ui('比较几个描述的关键特征，然后再试一次。'))}</p>${sourceMarkup(f.source_ref)}`;
  }
  if (active) {
    const buttons = [...document.querySelectorAll('.match-card:not(:disabled)')];
    (buttons.find((btn) => btn.dataset.cardId === active) || buttons[0])?.focus({
      preventScroll: true,
    });
  }
}
export function renderReport(r, title, feedback = '') {
  $('report-subtitle').innerHTML =
    `${studyMarkup(title || ui('配对练习'))} / ${msg(`已配对 ${r.matched_pairs} 组`, `${r.matched_pairs} matched`)}`;
  const hints = Object.values(r.hints_by_concept).reduce((a, b) => a + b, 0);
  const metrics = [
    [
      ui('首次配对正确率'),
      percent(r.first_attempt_accuracy),
      msg(`已尝试 ${r.attempted_concepts} 个概念`, `${r.attempted_concepts} concepts attempted`),
    ],
    [
      ui('总尝试正确率'),
      percent(r.overall_attempt_accuracy),
      msg(`共 ${r.valid_attempts} 次有效尝试`, `${r.valid_attempts} valid attempts`),
    ],
    [
      ui('本轮完成率'),
      percent(r.completion_rate),
      msg(
        `完成 ${r.matched_pairs} / ${r.total_pairs} 对`,
        `${r.matched_pairs} / ${r.total_pairs} pairs`,
      ),
    ],
    [
      ui('提示使用次数'),
      hints,
      msg(
        `涉及 ${r.concepts.filter((k) => k.hints).length} 个概念`,
        `${r.concepts.filter((k) => k.hints).length} concepts`,
      ),
    ],
  ];
  $('report-content').innerHTML =
    `<div class="report-metrics">${metrics.map(([name, val, note], i) => `<section class="panel metric ${i === 0 ? 'primary-metric' : ''}"><h2>${h(name)}</h2><strong>${h(val)}</strong><small>${h(note)}</small></section>`).join('')}</div><div class="report-grid"><section class="panel"><div class="panel-heading"><h2>${ui('逐项复盘')}</h2><span class="tag">${msg(`待复习 ${r.weak_knowledge_ids.length} 项`, `${r.weak_knowledge_ids.length} to review`)}</span></div>${r.concepts
      .map((k) => {
        const label =
          k.attempts === 0
            ? ui('尚未尝试')
            : !k.matched
              ? ui('进行中')
              : k.mistakes
                ? ui('重试后配对')
                : k.hints
                  ? ui('使用过提示')
                  : ui('首次正确');
        return `<details class="report-knowledge"><summary><strong>${studyMarkup(k.term)}</strong><span class="status-chip ${r.weak_knowledge_ids.includes(k.knowledge_id) ? '' : 'strong'}">${label}</span></summary><p>${studyMarkup(k.explanation)}</p><p class="muted">${msg(`尝试 ${k.attempts} 次，错误 ${k.mistakes} 次，提示 ${k.hints} 次。`, `${k.attempts} attempts, ${k.mistakes} mistakes, ${k.hints} hints.`)}</p>${sourceMarkup(k.source_ref)}</details>`;
      })
      .join(
        '',
      )}</section><section class="panel feedback-advice"><h2>${ui('复习建议')}</h2><p id="report-advice" aria-live="polite">${h(feedback || ui('正在整理这一轮的复习建议…'))}</p><button id="retry-feedback" class="text-button" type="button" hidden>${ui('重新获取建议')}</button></section></div>`;
  $('practice-button').textContent = r.weak_knowledge_ids.length
    ? msg(
        `再练 ${r.weak_knowledge_ids.length} 个薄弱点 →`,
        `Practice ${r.weak_knowledge_ids.length} missed concepts →`,
      )
    : ui('本轮复习清单为空');
}

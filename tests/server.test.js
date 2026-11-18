import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('server owns grading, de-duplicates events, reports hints and supports practice', async () => {
  const { createAppServer } = await import('../server/index.js');
  const directory = await mkdtemp(join(tmpdir(), 'l2g-test-'));
  const server = await createAppServer({ dataDir: directory, jobDelay: 0 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/demo-api`;
  const call = async (path, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + path, { method, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, headers: body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {} });
    return { status: response.status, data: await response.json() };
  };
  try {
    const form = new FormData(); form.append('file', new Blob(['sample'], { type: 'text/plain' }), 'sample.txt');
    const { data: material } = await call('/materials', form);
    const { data: knowledge } = await call(`/materials/${material.material_id}/knowledge`);
    assert.equal(knowledge.knowledge_items.length, 8); assert.equal(knowledge.demo, true);
    const preferences = { level: 'beginner', goal: 'definitions', pair_count: 6, time_limit_seconds: null };
    const { data: plan } = await call('/matching-plans', { material_id: material.material_id, preferences });
    const { data: generation } = await call('/games', { plan_id: plan.plan_id, preferences, confirmed: true });
    const { data: job } = await call(`/jobs/${generation.job_id}`);
    const { data: game } = await call(`/games/${job.result.game_id}`);
    assert.equal(game.left_cards.length, 6); assert.equal('pairs' in game, false);
    const serialized = JSON.stringify(game);
    assert.equal(serialized.includes('pair_id'), false); assert.equal(serialized.includes('explanation'), false);
    assert.equal(new Set([...game.left_cards, ...game.right_cards].map(c => c.id)).size, 12);
    const { data: session } = await call(`/games/${game.game_id}/sessions`, { event_id: 'start-1' });
    const { data: duplicateSession } = await call(`/games/${game.game_id}/sessions`, { event_id: 'start-1' });
    assert.equal(session.session_id, duplicateSession.session_id);
    const first = game.left_cards.find(c => c.text.includes('细胞核'));
    const right = game.right_cards.find(c => c.text.includes('遗传信息'));
    await call(`/sessions/${session.session_id}/hints`, { left_card_id: first.id, event_id: 'hint-1' });
    const event = { left_card_id: first.id, right_card_id: right.id, event_id: 'attempt-1' };
    const { data: score } = await call(`/sessions/${session.session_id}/attempts`, event);
    const { data: duplicate } = await call(`/sessions/${session.session_id}/attempts`, event);
    assert.equal(score.is_correct, true); assert.deepEqual(score, duplicate);
    const { data: current } = await call(`/sessions/${session.session_id}`); assert.equal(current.attempt_count, 1);
    const { status: forged } = await call(`/sessions/${session.session_id}/attempts`, { ...event, event_id: 'forged', is_correct: true }); assert.equal(forged, 400);
    await call(`/sessions/${session.session_id}/finish`, { reason: 'exit', event_id: 'finish-1' });
    const { data: report } = await call(`/sessions/${session.session_id}/report`);
    assert.equal(report.first_attempt_accuracy, 1); assert.equal(report.overall_accuracy, 1); assert.equal(report.attempted_concepts, 1);
    assert.equal(report.unattempted_concepts, 5); assert.equal(report.hint_count, 1); assert.equal(report.weak_knowledge_items.length, 6);
    const { data: practice } = await call(`/sessions/${session.session_id}/practice`, { preferences, confirmed: true, event_id: 'practice-1' }); assert.ok(practice.job_id);
    const { data: newRound } = await call(`/games/${game.game_id}/sessions`, { event_id: 'start-2' }); assert.notEqual(newRound.session_id, session.session_id);
    const { data: zeroReportSession } = await call(`/sessions/${newRound.session_id}/finish`, { reason: 'exit', event_id: 'finish-2' });
    const { data: zeroReport } = await call(`/sessions/${newRound.session_id}/report`);
    assert.equal(zeroReport.first_attempt_accuracy, null); assert.equal(zeroReport.overall_accuracy, null); assert.equal(zeroReportSession.session.status, 'finished');
  } finally { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});

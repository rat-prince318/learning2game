import test from 'node:test';
import assert from 'node:assert/strict';

const importEngine = () => import('../public/js/engine.js');
const game = {
  game_id: 'g1', title: 'Matching', pair_count: 2,
  left_cards: [{ id: 'L-a', text: '甲' }, { id: 'L-b', text: '乙' }],
  right_cards: [{ id: 'R-x', text: 'A' }, { id: 'R-y', text: 'B' }]
};
const session = (id = 's1') => ({ session_id: id, game_id: 'g1', status: 'active', matched_left_ids: [], matched_right_ids: [], completed_pairs: 0, error_count: 0, attempt_count: 0 });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('shuffle is a permutation and does not mutate source cards', async () => {
  const { shuffle } = await importEngine();
  const before = JSON.stringify(game.left_cards);
  const result = shuffle(game.left_cards, () => 0);
  assert.deepEqual(result.map(x => x.id).sort(), ['L-a', 'L-b']);
  assert.equal(JSON.stringify(game.left_cards), before);
  assert.notDeepEqual(result, game.left_cards);
});

test('rapid clicks send one attempt and completed cards stay locked', async () => {
  const { MatchingEngine } = await importEngine();
  const request = deferred(); let calls = 0;
  const api = { attempt: () => { calls++; return request.promise; } };
  const engine = new MatchingEngine(api); engine.start(game, session());
  engine.selectLeft('L-a');
  const pending = engine.chooseRight('R-x');
  await engine.chooseRight('R-y'); engine.selectLeft('L-b');
  assert.equal(calls, 1); assert.equal(engine.snapshot.selectedLeft, 'L-a');
  request.resolve({ is_correct: true, explanation: 'correct', session: { ...session(), completed_pairs: 1, attempt_count: 1, matched_left_ids: ['L-a'], matched_right_ids: ['R-x'] } });
  await pending;
  assert.equal(engine.snapshot.selectedLeft, null);
  assert.equal(engine.snapshot.session.completed_pairs, 1);
  engine.selectLeft('L-a'); assert.equal(engine.snapshot.selectedLeft, null);
  assert.equal(engine.snapshot.phase, 'active');
});

test('a failed request retries the same event ID rather than recounting it', async () => {
  const { MatchingEngine } = await importEngine(); const ids = [];
  const engine = new MatchingEngine({ attempt: async (_id, event) => {
    ids.push(event.event_id);
    if (ids.length === 1) throw new Error('connection lost');
    return { is_correct: false, explanation: 'try again', session: { ...session(), error_count: 1, attempt_count: 1 } };
  } });
  engine.start(game, session()); engine.selectLeft('L-a'); await engine.chooseRight('R-y');
  assert.equal(engine.snapshot.phase, 'retry');
  const stored = engine.recovery(); assert.ok(stored.pendingEvent.event_id);
  await engine.retry(); assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
  assert.equal(engine.snapshot.session.error_count, 1);
});

test('an old session response cannot overwrite a restarted game', async () => {
  const { MatchingEngine } = await importEngine(); const request = deferred();
  const engine = new MatchingEngine({ attempt: () => request.promise });
  engine.start(game, session()); engine.selectLeft('L-a'); const pending = engine.chooseRight('R-x');
  engine.start(game, session('s2'));
  request.resolve({ is_correct: true, session: { ...session(), completed_pairs: 1 } }); await pending;
  assert.equal(engine.snapshot.session.session_id, 's2'); assert.equal(engine.snapshot.session.completed_pairs, 0);
});

test('refresh restores a pending event and its independent card order', async () => {
  const { MatchingEngine } = await importEngine();
  const engine = new MatchingEngine({ attempt: async () => { throw new Error('offline'); } });
  engine.start(game, session()); engine.selectLeft('L-a'); await engine.chooseRight('R-y');
  const recovery = engine.recovery(); const restored = new MatchingEngine({});
  restored.start(game, session(), recovery);
  assert.equal(restored.snapshot.phase, 'retry');
  assert.deepEqual(restored.snapshot.leftCards.map(x => x.id), engine.snapshot.leftCards.map(x => x.id));
  assert.equal(restored.recovery().pendingEvent.event_id, recovery.pendingEvent.event_id);
});

test('public configuration rejects duplicate IDs and leaked answer fields', async () => {
  const { validatePublicGame } = await importEngine();
  assert.throws(() => validatePublicGame({ ...game, right_cards: [{ id: 'L-a', text: 'A' }, { id: 'R-y', text: 'B' }] }));
  assert.throws(() => validatePublicGame({ ...game, answers: { 'L-a': 'R-x' } }));
  assert.throws(() => validatePublicGame({ ...game, left_cards: [{ id: 'L-a', text: '甲', pair_id: 'p1' }, { id: 'L-b', text: '乙' }] }));
});

test('clearing a game removes the old route state and ignores a delayed result', async () => {
  const { MatchingEngine } = await importEngine(); const request = deferred();
  const engine = new MatchingEngine({ attempt: () => request.promise });
  engine.start(game, session()); engine.selectLeft('L-a'); const pending = engine.chooseRight('R-x');
  engine.clear(); assert.equal(engine.snapshot, null);
  request.resolve({ is_correct: true, session: session() }); await pending;
  assert.equal(engine.snapshot, null);
});

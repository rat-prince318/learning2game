import test from 'node:test';
import assert from 'node:assert/strict';

const importEngine = () => import('../public/js/engine.js');
const game = {
  game_id: 'g1', title: 'Matching', pair_count: 2,
  left_cards: [{ id: 'L-a', text: '甲' }, { id: 'L-b', text: '乙' }],
  right_cards: [
    { id: 'R-x', text: 'A' }, { id: 'R-y', text: 'B' },
    { id: 'R-z', text: 'C' }, { id: 'R-w', text: 'D' },
  ],
  court_options: { 'L-a': ['R-y', 'R-z', 'R-x'], 'L-b': ['R-w', 'R-y', 'R-z', 'R-x'] }
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


test('a hoop belongs to the held question and remains usable after another ball scores', async () => {
  const { MatchingEngine } = await importEngine();
  const events = [];
  const progress = { ...session(), completed_pairs: 1, matched_left_ids: ['L-a'], matched_right_ids: ['R-x'] };
  const engine = new MatchingEngine({ attempt: async (_sid, event) => {
    events.push(event);
    return { is_correct: false, session: progress };
  } });
  engine.start(game, session());
  engine.selectLeft('L-a');
  await engine.chooseRight('R-w');
  assert.equal(events.length, 0);
  engine.start(game, progress);
  engine.selectLeft('L-b');
  await engine.chooseRight('R-x');
  assert.equal(events.length, 1);
  assert.equal(engine.snapshot.selectedLeft, 'L-b');
  assert.deepEqual(engine.snapshot.game.court_options['L-b'], ['R-w', 'R-y', 'R-z', 'R-x']);
});

test('migrating a retired pending board resumes the ball and preserves server progress', async () => {
  const { MatchingEngine } = await importEngine();
  const engine = new MatchingEngine({});
  const saved = { session_id: 's1', rightOrder: ['R-y', 'R-x'], pendingEvent: {
    left_card_id: 'L-a', right_card_id: 'R-w', event_id: 'old-cross-question'
  } };
  engine.start(game, { ...session(), error_count: 1 }, saved);
  assert.equal(engine.snapshot.selectedLeft, 'L-a');
  assert.equal(engine.snapshot.phase, 'active');
  assert.equal(engine.snapshot.session.error_count, 1);
  assert.equal(engine.recovery().pendingEvent, null);
});

test('each question needs three or four distinct, known, readable options', async () => {
  const { validatePublicGame } = await importEngine();
  for (const options of [undefined, {}, { 'L-a': ['R-y'], 'L-b': ['R-w','R-y','R-z','R-x'] },
    { 'L-a': ['R-x', 'R-y', 'R-x'], 'L-b': ['R-x','R-y','R-z','R-w'] },
    { 'L-a': ['R-x', 'L-a', 'R-z'], 'L-b': ['R-x','R-y','R-z','R-w'] },
    { ...game.court_options, 'L-extra': ['R-x','R-y','R-z'] }]) {
    assert.throws(() => validatePublicGame({ ...game, court_options: options }));
  }
  assert.throws(() => validatePublicGame({ ...game, right_cards:
    game.right_cards.map(c => c.id === 'R-z' ? {...c, text: ' A '} : c) }));
  const distinct = { ...game, right_cards: [...game.right_cards, { id: 'R-b1', text: 'A' }],
    court_options: { 'L-a': game.court_options['L-a'], 'L-b': ['R-b1','R-w','R-y','R-z'] } };
  assert.doesNotThrow(() => validatePublicGame(distinct));
  assert.throws(() => validatePublicGame({ ...distinct, court_options: game.court_options }));
});

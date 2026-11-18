import test from 'node:test';
import assert from 'node:assert/strict';

test('native fetch is invoked without the ApiClient as its receiver', async () => {
  const { ApiClient } = await import('../public/js/api.js');
  const api = new ApiClient('/api', { fetchImpl: function () {
    assert.equal(this, undefined);
    return Promise.resolve(new Response('{}'));
  } });
  await api.getGame('g1');
});

test('the real HTTP adapter does not fall back to demo after failure', async () => {
  const { ApiClient } = await import('../public/js/api.js'); const calls = [];
  const api = new ApiClient('/api', { fetchImpl: async url => { calls.push(url); throw new TypeError('offline'); } });
  await assert.rejects(api.getGame('g1'), e => e.code === 'NETWORK_ERROR');
  assert.deepEqual(calls, ['/api/games/g1']);
});

test('attempts send stable opaque IDs and an idempotency key', async () => {
  const { ApiClient } = await import('../public/js/api.js'); let payload, key;
  const api = new ApiClient('/api', { fetchImpl: async (_url, init) => {
    payload = JSON.parse(init.body); key = init.headers['Idempotency-Key'];
    return new Response(JSON.stringify({ is_correct: true }));
  } });
  await api.attempt('s1', { event_id: 'ev1', left_card_id: 'L', right_card_id: 'R' });
  assert.deepEqual(payload, { event_id: 'ev1', left_card_id: 'L', right_card_id: 'R' });
  assert.equal(key, 'ev1'); assert.equal('is_correct' in payload, false);
});

test('task polling reports phases and stops on a backend failure', async () => {
  const { ApiClient } = await import('../public/js/api.js'); let count = 0; const states = [];
  const api = new ApiClient('/api', { pollInterval: 1, fetchImpl: async () => new Response(JSON.stringify(
    count++ === 0 ? { status: 'extracting' } : { status: 'failed', error: { code: 'KNOWLEDGE_INSUFFICIENT', message: '只有三个可靠知识点' } }
  )) });
  await assert.rejects(api.waitForJob('j1', j => states.push(j.status)), e => e.code === 'KNOWLEDGE_INSUFFICIENT');
  assert.deepEqual(states, ['extracting', 'failed']);
});

test('page selection is deduplicated, bounded and rejects malformed ranges', async () => {
  const { parsePages } = await import('../public/js/utils.js');
  assert.deepEqual(parsePages('1, 3-5, 3'), [1, 3, 4, 5]);
  assert.throws(() => parsePages('0,2')); assert.throws(() => parsePages('5-2'));
  assert.throws(() => parsePages('1-500')); assert.throws(() => parsePages('2junk'));
  assert.deepEqual(parsePages(''), []);
});

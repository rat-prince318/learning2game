import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../public/js/api.js';
import { displayText, h, parsePages } from '../public/js/utils.js';
test('send D wire fields and read authoritative snapshot', async () => {
  const calls = [];
  const api = new ApiClient('', {
    fetchImpl: async (path, init) => {
      calls.push([path, init]);
      return Response.json(
        path.endsWith('/attempts')
          ? { correct: true }
          : {
              matched_cards: [{ left_id: 'L', right_id: 'R' }],
              mistakes: 1,
              hints_by_left_id: { L: 2 },
            },
      );
    },
  });
  const result = await api.attempt('s', { event_id: 'ev', left_card_id: 'L', right_card_id: 'R' });
  assert.deepEqual(JSON.parse(calls[0][1].body), { event_id: 'ev', left_id: 'L', right_id: 'R' });
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['/sessions/s/attempts', '/sessions/s'],
  );
  assert.equal(result.session.completed_pairs, 1);
  assert.equal(result.session.hint_count, 2);
});
test('a failed extraction surfaces the safe server message', async () => {
  const api = new ApiClient('', {
    fetchImpl: async () => Response.json({ status: 'failed', error: '请提供可读取的资料。' }),
  });
  await assert.rejects(api.waitForJob('x'), /请提供可读取的资料/);
});
test('page ranges are unique, bounded and valid', () => {
  assert.deepEqual(parsePages('1,3-5,3'), [1, 3, 4, 5]);
  for (const input of ['0', '5-2', '1-500', '3junk']) assert.throws(() => parsePages(input));
});
test('presentation rules withhold whole clauses and escape HTML', () => {
  assert.equal(displayText('前者不是答案，而是线索。利用示例。'), '利用示例。');
  assert.equal(displayText('该器件不能运行。', '查阅原文'), '查阅原文');
  assert.equal(displayText('学习\u00b7计划'), '学习 计划');
  assert.equal(h('<script>'), '&lt;script&gt;');
});
